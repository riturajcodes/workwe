import React, { useEffect, useRef, useState } from 'react';
import { GOOGLE_CLIENT_ID } from './api.js';

export function Video({ stream, muted = false, mirror = false, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream || null;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={`${className} ${mirror ? 'mirror' : ''}`} />;
}

export function Avatar({ name, picture, size = 40 }) {
  const initials = (name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return picture ? (
    <img className="avatar" src={picture} width={size} height={size} alt="" referrerPolicy="no-referrer" />
  ) : (
    <div className="avatar fallback" style={{ width: size, height: size, fontSize: size * 0.36 }}>{initials}</div>
  );
}

export const VipBadge = () => <b className="vip-badge" title="VIP: invited a friend to WorkWe">VIP</b>;

export function Logo({ size = 22 }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="12" r="6.25" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="15" cy="12" r="6.25" stroke="var(--accent)" strokeWidth="1.8" />
    </svg>
  );
}

export function GoogleButton({ onCredential }) {
  const box = useRef(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let tries = 0;
    const t = setInterval(() => {
      if (window.google?.accounts?.id) {
        clearInterval(t);
        window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r) => onCredential(r.credential) });
        window.google.accounts.id.renderButton(box.current, { theme: document.documentElement.dataset.theme === 'light' ? 'outline' : 'filled_black', size: 'large', shape: 'rectangular', text: 'continue_with', width: Math.min(300, box.current.clientWidth || 300) });
        setReady(true);
      } else if (++tries > 50) clearInterval(t);
    }, 100);
    return () => clearInterval(t);
  }, [onCredential]);

  if (!GOOGLE_CLIENT_ID) {
    return <p className="hint warn">Set <code>VITE_GOOGLE_CLIENT_ID</code> in <code>client/.env</code> to enable Google sign-in.</p>;
  }
  return <div ref={box} className="gbtn" aria-busy={!ready} />;
}

export function Chat({ messages, onSend, peerName, onClose }) {
  const [text, setText] = useState('');
  const end = useRef(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  const submit = (e) => {
    e.preventDefault();
    onSend(text);
    setText('');
  };
  return (
    <aside className="chat">
      <header>
        <div>Chat<span>{peerName ? ` with ${peerName}` : ''}</span></div>
        <button className="icon-btn" onClick={onClose} aria-label="Close chat"><Icon n="end" size={16} /></button>
      </header>
      <div className="msgs">
        {messages.length === 0 && <p className="empty">No messages yet. Say hello and share what you’re working on.</p>}
        {messages.map((m, i) =>
          m.system ? (
            <div key={i} className="sys">{m.text}</div>
          ) : (
            <div key={i} className={`bubble ${m.mine ? 'mine' : ''}`}>{m.text}</div>
          )
        )}
        <div ref={end} />
      </div>
      <form onSubmit={submit}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message" maxLength={1000} />
        <button disabled={!text.trim()} aria-label="Send"><Icon n="send" size={16} /></button>
      </form>
    </aside>
  );
}

const I = {
  mic: <path d="M12 14.5a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5.5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0M12 16.5V20" />,
  cam: <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h7A2.5 2.5 0 0 1 15 8.5v7a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 3 15.5v-7Zm12 2.5 6-3v8l-6-3" />,
  screen: <path d="M3.5 5.5h17v11h-17zM8.5 20h7M12 16.5V20" />,
  next: <path d="M5 5.5 14 12l-9 6.5v-13ZM18.5 5.5v13" />,
  end: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  smile: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3.5-7.5s1 2 3.5 2 3.5-2 3.5-2M9 9.5v.5M15 9.5v.5" />,
  send: <path d="M12 19V5m0 0-6 6m6-6 6 6" />,
  arrow: <path d="M5 12h14m0 0-6-6m6 6-6 6" />,
  video: <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h7A2.5 2.5 0 0 1 15 8.5v7a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 3 15.5v-7Zm12 2.5 6-3v8l-6-3" />,
  chat: <path d="M20 12a7.5 7.5 0 0 1-10.9 6.7L4 20l1.4-4.3A7.5 7.5 0 1 1 20 12Z" />,
  shuffle: <path d="M16 4h4v4M20 4 4 20M20 16v4h-4M15 15l5 5M4 4l5 5" />,
  lock: <path d="M6.5 11h11v9h-11zM8.5 11V8a3.5 3.5 0 0 1 7 0v3" />,
  sun: <path d="M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
  users: <path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm10 8v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 5.2a3.5 3.5 0 0 1 0 6.6" />,
};
export const Icon = ({ n, size = 18 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{I[n]}</svg>
);

export const REACTIONS = ['🎉', '👏', '🔥', '❤️', '😂', '🚀', '💯', '☕'];

// Emoji burst. Each particle gets its physics from a seeded PRNG so both people see the same one.
export function ReactionLayer({ bursts }) {
  return (
    <div className="reaction-layer" aria-hidden>
      {bursts.map((b) => (
        <Burst key={b.id} emoji={b.emoji} seed={b.seed} />
      ))}
    </div>
  );
}

function seeded(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function Burst({ emoji, seed }) {
  const [parts] = useState(() => {
    const rand = seeded(seed);
    const r = (a, z) => a + rand() * (z - a);
    return Array.from({ length: 22 }, (_, i) => ({
      i,
      dx: r(-46, 46),
      dy: r(38, 78),
      fall: r(8, 26),
      rot: r(-540, 540),
      size: r(20, 44),
      dur: r(2.2, 3.4),
      delay: r(0, 0.25),
    }));
  });
  return (
    <>
      {parts.map((p) => (
        <span
          key={p.i}
          className="confetti"
          style={{ '--dx': `${p.dx}vw`, '--dy': `-${p.dy}vh`, '--fall': `${p.fall}vh`, '--rot': `${p.rot}deg`, '--size': `${p.size}px`, animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s` }}
        >
          {emoji}
        </span>
      ))}
    </>
  );
}

export function Controls({ mic, cam, sharing, onMic, onCam, onShare, onNext, onEnd, canShare, onReact, chatOpen, unread, onChat }) {
  const [picker, setPicker] = useState(false);
  return (
    <div className="controls">
      {picker && (
        <div className="picker">
          {REACTIONS.map((e) => (
            <button key={e} onClick={() => onReact(e)}>{e}</button>
          ))}
        </div>
      )}
      <button className={`ctl ${mic ? '' : 'off'}`} onClick={onMic} title={mic ? 'Mute' : 'Unmute'}><Icon n="mic" />{!mic && <i className="slash" />}</button>
      <button className={`ctl ${cam ? '' : 'off'}`} onClick={onCam} title={cam ? 'Turn camera off' : 'Turn camera on'}><Icon n="cam" />{!cam && <i className="slash" />}</button>
      {canShare && <button className={`ctl ${sharing ? 'on' : ''}`} onClick={onShare} title={sharing ? 'Stop sharing' : 'Share your screen'}><Icon n="screen" /></button>}
      <button className={`ctl ${picker ? 'on' : ''}`} onClick={() => setPicker((o) => !o)} title="Send a reaction"><Icon n="smile" /></button>
      <button className={`ctl ${chatOpen ? 'on' : ''}`} onClick={onChat} title={chatOpen ? 'Hide chat' : 'Show chat'}><Icon n="chat" />{unread && <i className="badge" />}</button>
      <span className="sep" />
      <button className="ctl pill" onClick={onNext}>Next<Icon n="next" size={16} /></button>
      <button className="ctl danger" onClick={onEnd} title="Leave"><Icon n="end" /></button>
    </div>
  );
}

// Hero focal visual: two people in a live session, annotated like a viewfinder.
// Drop a transparent cut-out photo at client/public/hero.png to replace the illustration.
export function HeroVisual() {
  const [photo, setPhoto] = useState(true);
  return (
    <div className="hv" aria-hidden>
      <div className="hv-glow" />
      <div className="hv-stage">
        {photo && <img className="hv-photo" src="/hero.png" alt="" onError={() => setPhoto(false)} />}
        {!photo && (
          <svg className="hv-art" viewBox="0 0 560 640" fill="none">
            <defs>
              <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{ stopColor: 'var(--p1a)' }} /><stop offset="1" style={{ stopColor: 'var(--p1b)' }} /></linearGradient>
              <linearGradient id="gB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{ stopColor: 'var(--p2a)' }} /><stop offset="1" style={{ stopColor: 'var(--p2b)' }} /></linearGradient>
            </defs>
            <path d="M270 640C270 482 330 396 405 396C480 396 540 482 540 640Z" fill="url(#gB)" />
            <circle cx="405" cy="276" r="68" fill="url(#gB)" />
            <path d="M20 640C20 450 120 346 235 346C350 346 450 450 450 640Z" fill="url(#gA)" />
            <circle cx="235" cy="214" r="100" fill="url(#gA)" />
            <path d="M20 640C20 450 120 346 235 346C350 346 450 450 450 640" stroke="rgba(255,255,255,.35)" strokeWidth="1.5" />
          </svg>
        )}
        <div className="scanbox s1"><b /><span>Camera on</span></div>
        <div className="scanbox s2"><b /><span>Partner</span></div>
        <div className="scanbox s3">
          <b /><span>Screen shared</span>
          <div className="mini"><i style={{ width: '70%' }} /><i style={{ width: '48%' }} /><i style={{ width: '82%' }} /><i style={{ width: '36%' }} /></div>
        </div>
        <div className="hv-chip"><i />Matched · say hello</div>
      </div>
    </div>
  );
}
