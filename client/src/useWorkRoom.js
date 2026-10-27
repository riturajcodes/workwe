import { useCallback, useEffect, useRef, useState } from 'react';
import { connectSocket } from './api.js';

const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };

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
  const [mediaError, setMediaError] = useState(null);
  const [connState, setConnState] = useState('new');
  const [bursts, setBursts] = useState([]);
  const [online, setOnline] = useState(null);
  const [notice, setNotice] = useState(null);
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
  const statusRef = useRef({ mic: true, cam: true, screen: false, screenId: null });

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
    const pc = new RTCPeerConnection(ICE);
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
    pc.onconnectionstatechange = () => setConnState(pc.connectionState);
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
      setQuota(q);
      setLimitHit(true);
      setPhase('idle');
    });
    s.on('searching', () => setPhase('searching'));
    s.on('matched', ({ initiator, peer }) => {
      setPeer(peer);
      setMessages([]);
      setNotice(null);
      setPhase('matched');
      createPc(initiator);
      // let the partner know our current state (and screen, if we kept sharing)
      sendStatus({});
    });
    s.on('signal', handleSignal);
    s.on('peer-status', setPeerStatus);
    s.on('reaction', ({ emoji, seed }) => addBurst(emoji, seed));
    s.on('chat', (m) => setMessages((p) => [...p, { ...m, mine: false }]));
    // When the partner leaves or skips, we go straight back into the queue.
    s.on('peer-left', () => {
      stopScreenTracks();
      closePc();
      setPeer(null);
      setLimitHit(false);
      setNotice('Your partner moved on. Finding someone new…');
      setPhase('searching');
      s.emit('find');
    });
    return () => {
      s.disconnect();
      closePc();
      setPhase('idle');
      setPeer(null);
    };
  }, [authKey, createPc, closePc, stopScreenTracks, handleSignal, sendStatus, addBurst]);

  const startMedia = useCallback(async () => {
    if (localRef.current) return localRef.current;
    const attempts = [
      { video: { width: 1280, height: 720, facingMode: 'user' }, audio: { echoCancellation: true, noiseSuppression: true } },
      { video: false, audio: true },
    ];
    for (const c of attempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(c);
        localRef.current = stream;
        setLocalStream(stream);
        setCam(stream.getVideoTracks().length > 0);
        statusRef.current.cam = stream.getVideoTracks().length > 0;
        setMediaError(null);
        return stream;
      } catch (e) {
        setMediaError(e.name === 'NotAllowedError' ? 'Camera and microphone are blocked. You can still join, but your partner won’t see or hear you.' : e.message);
      }
    }
    return null;
  }, []);

  const find = useCallback(async () => {
    setLimitHit(false);
    setNotice(null);
    await startMedia();
    stopScreenTracks();
    closePc();
    setPeer(null);
    socketRef.current.emit('find');
  }, [startMedia, stopScreenTracks, closePc]);

  const next = useCallback(() => {
    socketRef.current.emit('leave');
    find();
  }, [find]);

  const stop = useCallback(() => {
    socketRef.current.emit('leave');
    stopScreenTracks();
    closePc();
    setPeer(null);
    setPhase('idle');
  }, [closePc, stopScreenTracks]);

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
    peerStatus, mic, cam, mediaError, connState, find, next, stop, toggleMic, toggleCam, startShare, stopShare, sendChat, bursts, react, online, notice,
  };
}
