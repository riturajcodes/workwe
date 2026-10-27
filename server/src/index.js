import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { Server } from 'socket.io';
import { User } from './models.js';
import { FREE_LIMIT, keysFor, getUsed, bump } from './quota.js';

const { MONGODB_URI, JWT_SECRET, GOOGLE_CLIENT_ID, CLIENT_ORIGIN = 'http://localhost:5173' } = process.env;
const PORT = Number(process.env.PORT || 4000);
if (!MONGODB_URI || !JWT_SECRET) throw new Error('MONGODB_URI and JWT_SECRET are required (see .env.example)');

const origins = CLIENT_ORIGIN.split(',').map((s) => s.trim());
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
const app = express();
app.set('trust proxy', true);
app.use(cors({ origin: origins }));
app.use(express.json());

const sign = (u) => jwt.sign({ uid: String(u._id) }, JWT_SECRET, { expiresIn: '30d' });
const publicUser = (u) => ({ id: String(u._id), name: u.name, email: u.email, picture: u.picture });
async function userFromToken(token) {
  if (!token) return null;
  try {
    const { uid } = jwt.verify(token, JWT_SECRET);
    return await User.findById(uid);
  } catch {
    return null;
  }
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/config', (_req, res) => res.json({ freeLimit: FREE_LIMIT }));

app.post('/api/auth/google', async (req, res) => {
  try {
    if (!GOOGLE_CLIENT_ID) return res.status(500).json({ error: 'GOOGLE_CLIENT_ID is not configured on the server' });
    const ticket = await googleClient.verifyIdToken({ idToken: req.body.credential, audience: GOOGLE_CLIENT_ID });
    const p = ticket.getPayload();
    const user = await User.findOneAndUpdate(
      { googleId: p.sub },
      { email: p.email, name: p.name, picture: p.picture },
      { upsert: true, new: true }
    );
    res.json({ token: sign(user), user: publicUser(user) });
  } catch (e) {
    res.status(401).json({ error: 'Google sign-in failed' });
  }
});

app.get('/api/me', async (req, res) => {
  const user = await userFromToken((req.headers.authorization || '').replace('Bearer ', ''));
  res.json({ user: user && publicUser(user) });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: origins }, maxHttpBufferSize: 1e5 });

// ---- matchmaking -----------------------------------------------------------
const queue = []; // sockets waiting for a partner
const partners = new Map(); // socket.id -> partner socket.id
// Who has met whom, keyed by *person* (user id or guest id), not by socket, so reconnects
// and refreshes don't reset it.
const met = new Map(); // personKey -> Map(otherPersonKey -> last matched ts)
const HARD_COOLDOWN_MS = 20_000; // never re-pair people within 20 seconds
const SOFT_WINDOW_MS = 2 * 60 * 60_000; // strongly prefer someone new for 2 hours...
const PATIENCE_MS = 15_000; // ...unless someone has been waiting this long (small crowds)
const personKey = (s) => s.data.user?.id || s.data.guestId;
const sinceMet = (a, b) => Date.now() - (met.get(personKey(a))?.get(personKey(b)) || 0);
const waited = (s) => (queue.includes(s) ? Date.now() - s.data.queuedAt : 0);
const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

const removeFromQueue = (s) => {
  const i = queue.indexOf(s);
  if (i >= 0) queue.splice(i, 1);
};

function unpair(s, notify = true) {
  const pid = partners.get(s.id);
  if (!pid) return;
  partners.delete(s.id);
  partners.delete(pid);
  if (notify) io.to(pid).emit('peer-left');
}

async function quotaState(s) {
  if (s.data.user) return { used: 0, limit: null, unlimited: true };
  return { used: await getUsed(keysFor(s.data)), limit: FREE_LIMIT, unlimited: false };
}

// Random partner: never yourself (two tabs of one person), never someone from the last
// 20 seconds, and preferably someone you haven't met in the last 2 hours. If nobody new is
// around, fall back to a repeat only once somebody has been waiting a while.
function pickPartner(s) {
  const others = queue.filter((o) => o !== s && personKey(o) !== personKey(s) && sinceMet(s, o) > HARD_COOLDOWN_MS);
  const fresh = others.filter((o) => sinceMet(s, o) > SOFT_WINDOW_MS);
  if (fresh.length) return pickRandom(fresh);
  const patient = others.filter((o) => Math.max(waited(s), waited(o)) >= PATIENCE_MS);
  return patient.length ? pickRandom(patient) : null;
}

async function tryMatch(s) {
  if (!queue.includes(s)) {
    s.data.queuedAt = Date.now();
    queue.push(s);
    s.emit('searching');
  }
  const candidate = pickPartner(s);
  if (!candidate) return;
  removeFromQueue(candidate);
  removeFromQueue(s);
  partners.set(s.id, candidate.id);
  partners.set(candidate.id, s.id);
  for (const [a, b] of [[s, candidate], [candidate, s]]) {
    if (!met.has(personKey(a))) met.set(personKey(a), new Map());
    met.get(personKey(a)).set(personKey(b), Date.now());
  }
  // Free matches are counted when a pairing actually happens.
  await Promise.all([bump(keysFor(s.data)), bump(keysFor(candidate.data))]);
  const card = (x) => ({ name: x.data.user?.name || 'Guest', picture: x.data.user?.picture || null });
  s.emit('matched', { initiator: true, peer: card(candidate) });
  candidate.emit('matched', { initiator: false, peer: card(s) });
  s.emit('quota', await quotaState(s));
  candidate.emit('quota', await quotaState(candidate));
}

// ---- presence: unique people connected (a person with two tabs counts once) ----
const onlineCount = () => {
  const ids = new Set();
  for (const s of io.sockets.sockets.values()) ids.add(s.data.user?.id || s.data.guestId);
  return ids.size;
};
let onlineTimer = null;
const broadcastOnline = () => {
  if (onlineTimer) return;
  onlineTimer = setTimeout(() => {
    onlineTimer = null;
    io.emit('online', onlineCount());
  }, 400);
};
app.get('/api/online', (_req, res) => res.json({ online: onlineCount() }));

// Re-check waiting people every few seconds (so the "patience" fallback can kick in) and
// forget old meetings.
setInterval(() => {
  for (const s of [...queue]) if (queue.includes(s)) tryMatch(s);
  const cutoff = Date.now() - SOFT_WINDOW_MS;
  for (const [k, m] of met) {
    for (const [o, ts] of m) if (ts < cutoff) m.delete(o);
    if (!m.size) met.delete(k);
  }
}, 5000).unref();

io.use(async (socket, next) => {
  const { token, guestId } = socket.handshake.auth || {};
  const u = await userFromToken(token);
  socket.data.user = u && { id: String(u._id), name: u.name, picture: u.picture };
  socket.data.guestId = typeof guestId === 'string' ? guestId.slice(0, 64) : null;
  socket.data.ip = String(socket.handshake.headers['x-forwarded-for'] || socket.handshake.address).split(',')[0].trim();
  if (!socket.data.user && !socket.data.guestId) return next(new Error('guestId required'));
  next();
});

io.on('connection', async (socket) => {
  socket.emit('quota', await quotaState(socket));
  socket.emit('online', onlineCount());
  broadcastOnline();

  socket.on('find', async () => {
    unpair(socket);
    removeFromQueue(socket);
    const q = await quotaState(socket);
    if (!q.unlimited && q.used >= q.limit) return socket.emit('limit', q);
    tryMatch(socket);
  });

  socket.on('leave', () => {
    removeFromQueue(socket);
    unpair(socket);
  });

  socket.on('signal', (data) => {
    const pid = partners.get(socket.id);
    if (pid) io.to(pid).emit('signal', data);
  });

  socket.on('chat', (text) => {
    const pid = partners.get(socket.id);
    if (!pid || typeof text !== 'string') return;
    const clean = text.trim().slice(0, 1000);
    if (clean) io.to(pid).emit('chat', { text: clean, at: Date.now() });
  });

  const REACTIONS = new Set(['🎉', '👏', '🔥', '❤️', '😂', '🚀', '💯', '☕']);
  let lastReaction = 0;
  socket.on('reaction', (r) => {
    const pid = partners.get(socket.id);
    const now = Date.now();
    if (!pid || !r || !REACTIONS.has(r.emoji) || !Number.isInteger(r.seed) || now - lastReaction < 120) return;
    lastReaction = now;
    io.to(pid).emit('reaction', { emoji: r.emoji, seed: r.seed });
  });

  socket.on('status', (s) => {
    const pid = partners.get(socket.id);
    if (pid && s && typeof s === 'object') io.to(pid).emit('peer-status', {
      mic: !!s.mic,
      cam: !!s.cam,
      screen: !!s.screen,
      screenId: s.screen && typeof s.screenId === 'string' ? s.screenId.slice(0, 100) : null,
    });
  });

  socket.on('disconnect', () => {
    broadcastOnline();
    removeFromQueue(socket);
    unpair(socket);
  });
});

await mongoose.connect(MONGODB_URI);
server.listen(PORT, () => console.log(`WorkWe server on :${PORT}`));
