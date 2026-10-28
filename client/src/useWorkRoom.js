import { useCallback, useEffect, useRef, useState } from 'react';
import { SERVER, connectSocket } from './api.js';

// A usable local stream needs a live camera track and a live microphone track.
const live = (s) => !!s && s.getVideoTracks().some((t) => t.readyState === 'live') && s.getAudioTracks().some((t) => t.readyState === 'live');
const errorKind = (e) => {
  if (e.name === 'NotAllowedError' || e.name === 'SecurityError') return 'denied';
  if (e.name === 'NotFoundError' || e.name === 'OverconstrainedError') return 'missing';
  if (e.name === 'NotReadableError' || e.name === 'AbortError') return 'busy';
  return 'other';
};

export const placeLabel = (p) => (p ? [p.city, p.country].filter(Boolean).join(', ') + (p.flag ? ` ${p.flag}` : '') : '');

// STUN only works when both people can reach each other directly. The server adds TURN relays
// (see /api/ice) so people behind strict NATs, mobile data or VPNs can still connect.
const STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const ICE_TTL_MS = 60 * 60_000;

// Owns the socket, the RTCPeerConnection (using the "perfect negotiation" pattern
// so camera and screen tracks can be added mid-call) and the room state.
export function useWorkRoom(authKey) {
  const [phase, setPhase] = useState('idle'); // idle | searching | matched
  const [peer, setPeer] = useState(null);
  const [quota, setQuota] = useState(null);
  const [limitHit, setLimitHit] = useState(false);
  const [messages, setMessages] = useState([]);
  const [localStream, setLocalStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [peerStatus, setPeerStatus] = useState({ mic: true, cam: true, screen: false, screenId: null });
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [mediaError, setMediaError] = useState(null); // { kind: denied | missing | busy | lost | unsupported | other }
  const [connState, setConnState] = useState('new');
  const [bursts, setBursts] = useState([]);
  const [online, setOnline] = useState(null);
  const [notice, setNotice] = useState(null);
  const [inviteCode, setInviteCode] = useState(null); // set while waiting for a friend to open our link
  const [inviteMissing, setInviteMissing] = useState(false);
  const [reward, setReward] = useState(null); // the updated user after someone signs up through our link
  const burstId = useRef(0);

  // `seed` makes both people's confetti identical (the sender picks it and shares it).
  const addBurst = useCallback((emoji, seed) => {
    const id = ++burstId.current;
    setBursts((b) => [...b.slice(-11), { id, emoji, seed }]);
    setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 4200);
  }, []);

  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const localRef = useRef(null);
  const screenRef = useRef(null);
  const screenSendersRef = useRef([]);
  const negRef = useRef({ making: false, ignore: false, polite: false });
  const iceRef = useRef({ iceServers: STUN, at: 0 });
  const signalQueue = useRef(Promise.resolve());

  const loadIce = useCallback(async () => {
    if (Date.now() - iceRef.current.at < ICE_TTL_MS) return;
    try {
      const r = await fetch(`${SERVER}/api/ice`);
      const { iceServers } = await r.json();
      if (Array.isArray(iceServers) && iceServers.length) iceRef.current = { iceServers, at: Date.now() };
    } catch { /* keep the STUN defaults */ }
  }, []);
  const statusRef = useRef({ mic: true, cam: true, screen: false, screenId: null });
  const lostRef = useRef(() => {});

  const sendStatus = useCallback((patch) => {
    statusRef.current = { ...statusRef.current, ...patch };
    socketRef.current?.emit('status', statusRef.current);
  }, []);

  const closePc = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    screenSendersRef.current = [];
    setRemoteStreams([]);
    setPeerStatus({ mic: true, cam: true, screen: false, screenId: null });
    setConnState('new');
  }, []);

  const stopScreenTracks = useCallback(() => {
    screenRef.current?.getTracks().forEach((t) => t.stop());
    screenRef.current = null;
    setScreenStream(null);
    statusRef.current = { ...statusRef.current, screen: false, screenId: null };
  }, []);

  const createPc = useCallback((initiator) => {
    closePc();
    const pc = new RTCPeerConnection({ iceServers: iceRef.current.iceServers });
    pcRef.current = pc;
    negRef.current = { making: false, ignore: false, polite: !initiator };

    pc.ontrack = ({ track, streams }) => {
      const s = streams[0];
      if (!s) return;
      setRemoteStreams((prev) => (prev.some((p) => p.id === s.id) ? [...prev] : [...prev, s]));
      s.onremovetrack = () => {
        if (!s.getTracks().length) setRemoteStreams((prev) => prev.filter((p) => p.id !== s.id));
      };
      track.onended = () => setRemoteStreams((prev) => [...prev]);
    };
    pc.onicecandidate = ({ candidate }) => candidate && socketRef.current?.emit('signal', { candidate });
    let restarted = false;
    pc.onconnectionstatechange = () => {
      setConnState(pc.connectionState);
      // one automatic ICE restart (from the initiator, to avoid both sides offering at once)
      if (pc.connectionState === 'failed' && initiator && !restarted) {
        restarted = true;
        pc.restartIce();
      }
    };
    pc.onnegotiationneeded = async () => {
      try {
        negRef.current.making = true;
        await pc.setLocalDescription();
        socketRef.current?.emit('signal', { description: pc.localDescription });
      } catch (e) {
        console.error(e);
      } finally {
        negRef.current.making = false;
      }
    };

    const local = localRef.current;
    local?.getTracks().forEach((t) => pc.addTrack(t, local));
    if (screenRef.current) {
      screenSendersRef.current = screenRef.current.getTracks().map((t) => pc.addTrack(t, screenRef.current));
    }
    return pc;
  }, [closePc]);

  const handleSignal = useCallback(async ({ description, candidate }) => {
    const pc = pcRef.current;
    if (!pc) return;
    const n = negRef.current;
    try {
      if (description) {
        const collision = description.type === 'offer' && (n.making || pc.signalingState !== 'stable');
        n.ignore = !n.polite && collision;
        if (n.ignore) return;
        await pc.setRemoteDescription(description);
        if (description.type === 'offer') {
          await pc.setLocalDescription();
          socketRef.current.emit('signal', { description: pc.localDescription });
        }
      } else if (candidate) {
        try {
          await pc.addIceCandidate(candidate);
        } catch (e) {
          if (!n.ignore) throw e;
        }
      }
    } catch (e) {
      console.error('signal error', e);
    }
  }, []);

  // socket lifecycle (re-created when the user signs in/out so auth is fresh)
  useEffect(() => {
    const s = connectSocket();
    socketRef.current = s;
    s.on('quota', setQuota);
    s.on('online', setOnline);
    s.on('limit', (q) => {
      stopScreenTracks();
      setQuota(q);
      setLimitHit(true);
      setPhase('idle');
    });
    s.on('searching', () => setPhase('searching'));
    s.on('matched', ({ initiator, peer, invite }) => {
      setPeer(peer);
      const where = placeLabel(peer.place);
      setMessages([{ system: true, text: invite ? 'Your friend joined. Enjoy the session!' : where ? `You’re working with someone in ${where}` : 'You’re matched. Say hello!' }]);
      setNotice(null);
      setInviteCode(null);
      setPhase('matched');
      createPc(initiator);
      // let the partner know our current state (and screen, if we kept sharing)
      sendStatus({});
    });
    s.on('invite', ({ code }) => {
      setInviteCode(code);
      setPhase('searching');
    });
    s.on('invite-missing', () => {
      setInviteMissing(true);
      setPhase('idle');
    });
    s.on('referral', ({ user }) => setReward(user));
    // Handle signals strictly in order: an ICE candidate must not be applied while the
    // offer/answer before it is still being set, or it is rejected and the call never connects.
    s.on('signal', (d) => {
      signalQueue.current = signalQueue.current.then(() => handleSignal(d));
    });
    s.on('peer-status', setPeerStatus);
    s.on('reaction', ({ emoji, seed }) => addBurst(emoji, seed));
    s.on('chat', (m) => setMessages((p) => [...p, { ...m, mine: false }]));
    // When the partner leaves or skips, we go straight back into the queue.
    // Screen sharing keeps going into the next match.
    s.on('peer-left', () => {
      closePc();
      setPeer(null);
      setLimitHit(false);
      if (!live(localRef.current)) return lostRef.current();
      setNotice('Your partner moved on. Finding someone new…');
      setPhase('searching');
      s.emit('find');
    });
    return () => {
      s.disconnect();
      closePc();
      setPhase('idle');
      setPeer(null);
      setInviteCode(null);
    };
  }, [authKey, createPc, closePc, stopScreenTracks, handleSignal, sendStatus, addBurst]);

  // Camera and microphone are both required; there is no audio-only or no-media fallback.
  const startMedia = useCallback(async () => {
    if (live(localRef.current)) return localRef.current;
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    setLocalStream(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaError({ kind: 'unsupported' });
      return null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (!live(stream)) {
        stream.getTracks().forEach((t) => t.stop());
        setMediaError({ kind: 'missing' });
        return null;
      }
      // fires if access is revoked or a device is unplugged mid-session (not on our own .stop())
      stream.getTracks().forEach((t) => { t.onended = () => lostRef.current(); });
      localRef.current = stream;
      setLocalStream(stream);
      setMic(true);
      setCam(true);
      statusRef.current = { ...statusRef.current, mic: true, cam: true };
      setMediaError(null);
      return stream;
    } catch (e) {
      setMediaError({ kind: errorKind(e), message: e.message });
      return null;
    }
  }, []);

  // Random match, or `invite` to join a friend's private link. An active screen share carries over.
  const find = useCallback(async (invite) => {
    setLimitHit(false);
    setNotice(null);
    setInviteMissing(false);
    setInviteCode(null);
    closePc();
    setPeer(null);
    const [stream] = await Promise.all([startMedia(), loadIce()]);
    if (!stream) {
      socketRef.current.emit('leave');
      stopScreenTracks();
      setPhase('idle');
      return;
    }
    socketRef.current.emit('find', typeof invite === 'string' ? { invite } : undefined);
  }, [startMedia, stopScreenTracks, closePc, loadIce]);

  const createInvite = useCallback(async () => {
    setLimitHit(false);
    setNotice(null);
    closePc();
    setPeer(null);
    const [stream] = await Promise.all([startMedia(), loadIce()]);
    if (!stream) return;
    socketRef.current.emit('invite');
  }, [startMedia, closePc, loadIce]);

  const next = useCallback(() => {
    socketRef.current.emit('leave');
    find();
  }, [find]);

  const stop = useCallback(() => {
    socketRef.current.emit('leave');
    stopScreenTracks();
    closePc();
    setPeer(null);
    setInviteCode(null);
    setPhase('idle');
  }, [closePc, stopScreenTracks]);

  // Lost camera/mic access mid-session: end the call and ask for permission again.
  useEffect(() => {
    lostRef.current = () => {
      if (!localRef.current) return;
      stop();
      localRef.current.getTracks().forEach((t) => t.stop());
      localRef.current = null;
      setLocalStream(null);
      setMediaError({ kind: 'lost' });
    };
  }, [stop]);

  // Also watch the browser's permission state, where supported (Chrome/Edge/Safari).
  useEffect(() => {
    const off = [];
    for (const name of ['camera', 'microphone']) {
      navigator.permissions?.query({ name }).then((p) => {
        const onChange = () => p.state === 'denied' && lostRef.current();
        p.addEventListener('change', onChange);
        off.push(() => p.removeEventListener('change', onChange));
      }).catch(() => { /* not queryable in this browser */ });
    }
    return () => off.forEach((f) => f());
  }, []);

  const clearMediaError = useCallback(() => setMediaError(null), []);

  const toggleMic = useCallback(() => {
    const t = localRef.current?.getAudioTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    setMic(t.enabled);
    sendStatus({ mic: t.enabled });
  }, [sendStatus]);

  const toggleCam = useCallback(() => {
    const t = localRef.current?.getVideoTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    setCam(t.enabled);
    sendStatus({ cam: t.enabled });
  }, [sendStatus]);

  const stopShare = useCallback(() => {
    const pc = pcRef.current;
    if (pc) screenSendersRef.current.forEach((snd) => { try { pc.removeTrack(snd); } catch { /* closed */ } });
    screenSendersRef.current = [];
    stopScreenTracks();
    sendStatus({ screen: false, screenId: null });
  }, [stopScreenTracks, sendStatus]);

  const startShare = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
      screenRef.current = stream;
      setScreenStream(stream);
      screenSendersRef.current = stream.getTracks().map((t) => pc.addTrack(t, stream));
      stream.getVideoTracks()[0].onended = () => stopShare();
      sendStatus({ screen: true, screenId: stream.id });
    } catch (e) {
      if (e.name !== 'NotAllowedError') console.error(e);
    }
  }, [sendStatus, stopShare]);

  const react = useCallback((emoji) => {
    const seed = Math.floor(Math.random() * 2 ** 31);
    socketRef.current?.emit('reaction', { emoji, seed });
    addBurst(emoji, seed);
  }, [addBurst]);

  const sendChat = useCallback((text) => {
    const t = text.trim();
    if (!t) return;
    socketRef.current.emit('chat', t);
    setMessages((p) => [...p, { text: t, at: Date.now(), mine: true }]);
  }, []);

  const remoteScreen = remoteStreams.find((s) => s.id === peerStatus.screenId) || null;
  const remoteCamera = remoteStreams.find((s) => s.id !== peerStatus.screenId) || null;

  return {
    phase, peer, quota, limitHit, setLimitHit, messages, localStream, screenStream, remoteScreen, remoteCamera,
    peerStatus, mic, cam, mediaError, clearMediaError, connState, createInvite, inviteCode, inviteMissing, setInviteMissing, reward, setReward, find, next, stop, toggleMic, toggleCam, startShare, stopShare, sendChat, bursts, react, online, notice,
  };
}
