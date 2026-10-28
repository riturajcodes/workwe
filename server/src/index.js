import 'dotenv/config';
import http from 'node:http';
import crypto from 'node:crypto';
import geoip from 'geoip-lite';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { Server } from 'socket.io';
import { Invite, User } from './models.js';
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

const VIP_DAYS = 30;
const sign = (u) => jwt.sign({ uid: String(u._id) }, JWT_SECRET, { expiresIn: '30d' });
const isVip = (u) => !!u?.vipUntil && u.vipUntil > Date.now();
const publicUser = (u) => ({
  id: String(u._id), name: u.name, email: u.email, picture: u.picture,
  refCode: u.refCode, referrals: u.referrals || 0, vip: isVip(u), vipUntil: isVip(u) ? u.vipUntil : null,
});
const newCode = (bytes = 5) => crypto.randomBytes(bytes).toString('base64url');

// ---- location: city + country from the IP (offline GeoLite data, nothing sent anywhere) ----
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const flagOf = (cc) => String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
function placeOf(ip, tz) {
  const g = geoip.lookup(ip);
  if (g?.country) return { city: g.city || null, country: regionNames.of(g.country), flag: flagOf(g.country) };
  // private/local address (e.g. development): fall back to the browser's time zone city
  const city = typeof tz === 'string' && tz.includes('/') ? tz.split('/').pop().replace(/_/g, ' ').slice(0, 40) : null;
  return city ? { city, country: null, flag: '' } : null;
}
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

// ICE servers for WebRTC. STUN alone fails for many people (strict NAT, mobile data, VPNs),
// so add a TURN relay: Cloudflare (short-lived credentials) or any static TURN server.
const STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const { CF_TURN_KEY_ID, CF_TURN_API_TOKEN, TURN_URLS, TURN_USERNAME, TURN_CREDENTIAL } = process.env;
app.get('/api/ice', async (_req, res) => {
  if (CF_TURN_KEY_ID && CF_TURN_API_TOKEN) {
    try {
      const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${CF_TURN_KEY_ID}/credentials/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${CF_TURN_API_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: 86400 }),
      });
      if (!r.ok) throw new Error(`Cloudflare TURN ${r.status}`);
      const { iceServers } = await r.json();
      return res.json({ iceServers: [...STUN, ...[].concat(iceServers)] });
    } catch (e) {
      console.error('TURN credentials:', e.message);
    }
  }
  if (TURN_URLS) {
    const turn = { urls: TURN_URLS.split(',').map((u) => u.trim()), username: TURN_USERNAME, credential: TURN_CREDENTIAL };
    return res.json({ iceServers: [...STUN, turn] });
  }
  res.json({ iceServers: STUN });
});
app.get('/api/config', (_req, res) => res.json({ freeLimit: FREE_LIMIT }));

app.post('/api/auth/google', async (req, res) => {
  let p;
  try {
    if (!GOOGLE_CLIENT_ID) return res.status(500).json({ error: 'GOOGLE_CLIENT_ID is not configured on the server' });
    const ticket = await googleClient.verifyIdToken({ idToken: req.body.credential, audience: GOOGLE_CLIENT_ID });
    p = ticket.getPayload();
  } catch {
    return res.status(401).json({ error: 'Google sign-in failed' });
  }
  const profile = { email: p.email, name: p.name, picture: p.picture };
  let user = await User.findOneAndUpdate({ googleId: p.sub }, profile, { new: true });
  if (!user) {
    // First sign-in. If they came in through someone's sign-up link, that person earns VIP.
    const referrer = typeof req.body.ref === 'string' ? await User.findOne({ refCode: req.body.ref.slice(0, 20) }) : null;
    user = await User.create({ googleId: p.sub, ...profile, refCode: newCode(), referredBy: referrer?._id });
    if (referrer) await rewardReferrer(referrer);
  } else if (!user.refCode) {
    user.refCode = newCode();
    await user.save();
  }
  res.json({ token: sign(user), user: publicUser(user) });
});

async function rewardReferrer(referrer) {
  const from = Math.max(Date.now(), referrer.vipUntil?.getTime() || 0);
  referrer.vipUntil = new Date(from + VIP_DAYS * 86_400_000);
  referrer.referrals = (referrer.referrals || 0) + 1;
  await referrer.save();
  // let them know right away if they're online, and badge their live sockets
  for (const s of io.sockets.sockets.values()) {
    if (s.data.user?.id !== String(referrer._id)) continue;
    s.data.user.vip = true;
    s.emit('referral', { user: publicUser(referrer) });
  }
}

app.get('/api/me', async (req, res) => {
  const user = await userFromToken((req.headers.authorization || '').replace('Bearer ', ''));
  if (user && !user.refCode) {
    user.refCode = newCode(); // accounts from before referrals existed
    await user.save();
  }
  res.json({ user: user && publicUser(user) });
});

const INVITE_TTL_MS = 24 * 60 * 60_000;
const inviteInfo = (inv) => ({
  code: inv.code,
  host: { name: inv.ownerName || 'A friend', picture: inv.ownerPicture || null },
  expiresAt: new Date(inv.createdAt.getTime() + INVITE_TTL_MS),
});
async function findInvite(code) {
  const inv = typeof code === 'string' ? await Invite.findOne({ code: code.slice(0, 20) }) : null;
  return inv && inv.createdAt.getTime() + INVITE_TTL_MS > Date.now() ? inv : null; // TTL cleanup can lag
}
app.get('/api/invite/:code', async (req, res) => {
  const inv = await findInvite(req.params.code);
  if (!inv) return res.status(404).json({ error: 'expired' });
  res.json(inviteInfo(inv));
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: origins }, maxHttpBufferSize: 1e5 });

// ---- matchmaking -----------------------------------------------------------
const queue = []; // sockets waiting for a random partner
const rooms = new Map(); // invite code -> Set of sockets waiting on that link
const personKey = (s) => s.data.user?.id || s.data.guestId;
const partners = new Map(); // socket.id -> partner socket.id
const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

const removeFromQueue = (s) => {
  const i = queue.indexOf(s);
  if (i >= 0) queue.splice(i, 1);
};

function cancelInvite(s) {
  const room = s.data.invite && rooms.get(s.data.invite);
  if (room) {
    room.delete(s);
    if (!room.size) rooms.delete(s.data.invite);
  }
  s.data.invite = null;
}

// Wait on an invite link; pair as soon as someone else (a different person) is waiting on it too.
async function joinInvite(s, inv) {
  const room = rooms.get(inv.code) || new Set();
  const other = [...room].find((o) => personKey(o) !== personKey(s));
  if (other) {
    cancelInvite(other);
    return pair(other, s, true);
  }
  room.add(s);
  rooms.set(inv.code, room);
  s.data.invite = inv.code;
  const isOwner = inv.owner === personKey(s);
  s.emit('invite', { ...inviteInfo(inv), isOwner });
  // The friend got here first: tell the host, wherever they are in the app.
  if (!isOwner) notifyHost(inv, s);
}

function notifyHost(inv, friend) {
  for (const o of io.sockets.sockets.values()) {
    if (personKey(o) === inv.owner && o.data.invite !== inv.code) {
      o.emit('friend-waiting', { code: inv.code, name: friend.data.user?.name || 'Your friend' });
    }
  }
}

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

// Random partner: anyone else who is waiting.
function pickPartner(s) {
  const others = queue.filter((o) => o !== s);
  return others.length ? pickRandom(others) : null;
}

async function tryMatch(s) {
  if (!queue.includes(s)) {
    queue.push(s);
    s.emit('searching');
  }
  const candidate = pickPartner(s);
  if (!candidate) return;
  removeFromQueue(candidate);
  removeFromQueue(s);
  // Free matches are counted when a pairing actually happens.
  await Promise.all([bump(keysFor(s.data)), bump(keysFor(candidate.data))]);
  await pair(s, candidate);
}

const card = (x) => ({
  name: x.data.user?.name || 'Guest',
  picture: x.data.user?.picture || null,
  vip: !!x.data.user?.vip,
  place: x.data.place,
});

async function pair(a, b, invite = false) {
  partners.set(a.id, b.id);
  partners.set(b.id, a.id);
  a.emit('matched', { initiator: true, peer: card(b), invite });
  b.emit('matched', { initiator: false, peer: card(a), invite });
  a.emit('quota', await quotaState(a));
  b.emit('quota', await quotaState(b));
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

io.use(async (socket, next) => {
  const { token, guestId, tz } = socket.handshake.auth || {};
  const u = await userFromToken(token);
  socket.data.user = u && { id: String(u._id), name: u.name, picture: u.picture, vip: isVip(u) };
  socket.data.guestId = typeof guestId === 'string' ? guestId.slice(0, 64) : null;
  socket.data.ip = String(socket.handshake.headers['x-forwarded-for'] || socket.handshake.address).split(',')[0].trim();
  socket.data.place = placeOf(socket.data.ip, tz);
  if (!socket.data.user && !socket.data.guestId) return next(new Error('guestId required'));
  next();
});

io.on('connection', async (socket) => {
  socket.emit('quota', await quotaState(socket));
  socket.emit('online', onlineCount());
  broadcastOnline();
  // A friend may already be waiting on one of this person's links.
  for (const [code, room] of rooms) {
    const friend = [...room].find((o) => personKey(o) !== personKey(socket));
    if (!friend) continue;
    const inv = await findInvite(code);
    if (inv?.owner === personKey(socket)) notifyHost(inv, friend);
  }

  socket.on('find', async (opts) => {
    unpair(socket);
    removeFromQueue(socket);
    cancelInvite(socket);
    // Joining a private invite link: no queue, and it doesn't use a free session.
    if (opts?.invite) {
      const inv = await findInvite(opts.invite);
      if (!inv) return socket.emit('invite-missing');
      return joinInvite(socket, inv);
    }
    const q = await quotaState(socket);
    if (!q.unlimited && q.used >= q.limit) return socket.emit('limit', q);
    tryMatch(socket);
  });

  // Make (or reuse today's) invite link and wait on it.
  socket.on('invite', async () => {
    unpair(socket);
    removeFromQueue(socket);
    cancelInvite(socket);
    const owner = personKey(socket);
    const fresh = new Date(Date.now() - INVITE_TTL_MS / 2); // reuse a link with at least 12h left
    let inv = await Invite.findOne({ owner, createdAt: { $gt: fresh } }).sort({ createdAt: -1 });
    if (!inv) {
      inv = await Invite.create({ code: newCode(6), owner, ownerName: socket.data.user?.name, ownerPicture: socket.data.user?.picture });
    }
    joinInvite(socket, inv);
  });

  socket.on('leave', () => {
    removeFromQueue(socket);
    cancelInvite(socket);
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
    cancelInvite(socket);
    unpair(socket);
  });
});

await mongoose.connect(MONGODB_URI);
server.listen(PORT, () => console.log(`WorkWe server on :${PORT}`));
