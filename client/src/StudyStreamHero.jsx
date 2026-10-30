import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Icon } from './components.jsx';

// Authentic student study video clips extracted from StudyStream
const STUDY_VIDEOS = [
  { name: 'David', src: '/videos/david.mp4', subject: 'Computer Science', topic: 'React & Algorithms' },
  { name: 'Elizaveta', src: '/videos/elizaveta.mp4', subject: 'Psychology', topic: 'Cognitive Research' },
  { name: 'Justine', src: '/videos/justine.mp4', subject: 'Pre-Med', topic: 'Anatomy Flashcards' },
  { name: 'Marcos', src: '/videos/marcos.mp4', subject: 'Architecture', topic: '3D CAD Modeling' },
  { name: 'Meghan', src: '/videos/meghan.mp4', subject: 'Law', topic: 'Constitutional Law' },
  { name: 'Ronah', src: '/videos/ronah.mp4', subject: 'Biochemistry', topic: 'Cell Metabolism' },
  { name: 'Alexa', src: '/videos/alexa.mp4', subject: 'Engineering', topic: 'Fluid Dynamics' },
  { name: 'Lissie', src: '/videos/lissie.mp4', subject: 'Economics', topic: 'Macro Econometrics' },
];

const MODES = ['All Focus', 'Study', 'Code', 'Deep Work'];

export default function StudyStreamHero({ room, user, onInvite, openLogin, limit }) {
  const [trail, setTrail] = useState([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [activeMode, setActiveMode] = useState('All Focus');
  const lastPosRef = useRef({ x: 0, y: 0 });
  const videoIndexRef = useRef(0);
  const heroRef = useRef(null);

  const currentPartner = STUDY_VIDEOS[previewIndex % STUDY_VIDEOS.length];

  const handleNextPreview = (e) => {
    e?.stopPropagation();
    setPreviewIndex((prev) => (prev + 1) % STUDY_VIDEOS.length);
  };

  // Handle pointer move over hero to generate video cursor trail
  const handlePointerMove = useCallback((e) => {
    const heroEl = heroRef.current;
    if (!heroEl) return;

    // Do not spawn trail directly inside the interactive match card
    if (e.target.closest('.ss-match-card')) return;

    const rect = heroEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const dx = x - lastPosRef.current.x;
    const dy = y - lastPosRef.current.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 90) {
      lastPosRef.current = { x, y };

      const student = STUDY_VIDEOS[videoIndexRef.current % STUDY_VIDEOS.length];
      videoIndexRef.current += 1;

      const id = Date.now() + Math.random();
      const rot = Math.random() * 12 - 6;

      setTrail((prev) => {
        const trimmed = prev.length >= 6 ? prev.slice(prev.length - 5) : prev;
        return [...trimmed, { id, x, y, rot, student }];
      });

      setTimeout(() => {
        setTrail((prev) => prev.filter((item) => item.id !== id));
      }, 2300);
    }
  }, []);

  return (
    <section
      ref={heroRef}
      className="ss-hero-container"
      onPointerMove={handlePointerMove}
    >
      {/* Full-Bleed Atmospheric Study Desk Background */}
      <div className="ss-hero-backdrop" aria-hidden="true">
        <div className="ss-hero-backdrop-img" />
        <div className="ss-hero-backdrop-tint" />
      </div>

      {/* Perimeter Ambient Video Windows */}
      <div className="ss-ambient-grid" aria-hidden="true">
        <div className="ss-ambient-card c-tl">
          <div className="ss-card-badge">
            <span>Elizaveta · Psychology</span>
          </div>
          <video autoPlay loop muted playsInline preload="metadata">
            <source src="/videos/elizaveta.mp4" type="video/mp4" />
          </video>
        </div>

        <div className="ss-ambient-card c-tr">
          <div className="ss-card-badge">
            <span>David · Computer Science</span>
          </div>
          <video autoPlay loop muted playsInline preload="metadata">
            <source src="/videos/david.mp4" type="video/mp4" />
          </video>
        </div>

        <div className="ss-ambient-card c-ml">
          <div className="ss-card-badge">
            <span>Justine · Pre-Med</span>
          </div>
          <video autoPlay loop muted playsInline preload="metadata">
            <source src="/videos/justine.mp4" type="video/mp4" />
          </video>
        </div>

        <div className="ss-ambient-card c-mr">
          <div className="ss-card-badge">
            <span>Marcos · Architecture</span>
          </div>
          <video autoPlay loop muted playsInline preload="metadata">
            <source src="/videos/marcos.mp4" type="video/mp4" />
          </video>
        </div>

        <div className="ss-ambient-card c-bl">
          <div className="ss-card-badge">
            <span>Meghan · Law</span>
          </div>
          <video autoPlay loop muted playsInline preload="metadata">
            <source src="/videos/meghan.mp4" type="video/mp4" />
          </video>
        </div>

        <div className="ss-ambient-card c-br">
          <div className="ss-card-badge">
            <span>Ronah · Biochemistry</span>
          </div>
          <video autoPlay loop muted playsInline preload="metadata">
            <source src="/videos/ronah.mp4" type="video/mp4" />
          </video>
        </div>
      </div>

      {/* Floating Mouse Trail Videos */}
      <div className="ss-trail-layer" aria-hidden="true">
        {trail.map((item) => (
          <div
            key={item.id}
            className="ss-trail-video-card"
            style={{
              left: `${item.x}px`,
              top: `${item.y}px`,
              '--rot': `${item.rot}deg`,
            }}
          >
            <div className="ss-trail-badge">
              <span>{item.student.name} · {item.student.subject}</span>
            </div>
            <video autoPlay loop muted playsInline preload="auto">
              <source src={item.student.src} type="video/mp4" />
            </video>
          </div>
        ))}
      </div>

      {/* Center Hero Information Content */}
      <div className="ss-hero-info">
        {/* Editorial Headline */}
        <h1 className="ss-hero-title">
          <span className="ln"><span className="lni">Study together,</span></span>
          <span className="ln"><span className="lni"><em className="editorial-em">in quiet company.</em></span></span>
        </h1>

        <p className="ss-hero-lead">
          Virtual co-working with live video and dual screen sharing. Connect with a focused partner anywhere in the world in one click.
        </p>

        {/* Interactive 1-on-1 Matching Stage */}
        <div className="ss-match-card">
          <div className="ss-match-header">
            <div className="ss-match-tabs">
              {MODES.map((mode) => (
                <button
                  key={mode}
                  className={`ss-tab-btn ${activeMode === mode ? 'active' : ''}`}
                  onClick={() => setActiveMode(mode)}
                >
                  {mode}
                </button>
              ))}
            </div>

            <button
              className="ss-skip-partner-btn"
              onClick={handleNextPreview}
              title="Preview next live partner"
            >
              <span>Next partner</span>
              <span className="ss-skip-icon">↷</span>
            </button>
          </div>

          {/* Dual Split Screens: You ⇄ Live Partner */}
          <div className="ss-match-stage">
            {/* Screen 1: Your Desk */}
            <div className="ss-stage-pane you-pane">
              <div className="ss-pane-inner">
                <div className="ss-user-placeholder">
                  <div className="ss-avatar-circle">
                    <Icon n="user" size={22} />
                  </div>
                  <span className="ss-cam-hint">Your Camera & Mic</span>
                </div>
                <div className="ss-pane-tag you-tag">
                  <span>{user?.name || 'You'}</span>
                </div>
              </div>
            </div>

            {/* Elegant Interlocking Dual-Ring Connector */}
            <div className="ss-stage-connector" onClick={room.find} title="Click to connect instantly">
              <div className="ss-connector-disc">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="9" cy="12" r="5" />
                  <circle cx="15" cy="12" r="5" />
                </svg>
              </div>
              <span className="ss-connector-label">Connect</span>
            </div>

            {/* Screen 2: Real Matched Partner */}
            <div className="ss-stage-pane partner-pane">
              <div className="ss-pane-inner">
                <video key={currentPartner.src} autoPlay loop muted playsInline preload="auto">
                  <source src={currentPartner.src} type="video/mp4" />
                </video>
                <div className="ss-pane-tag partner-tag">
                  <span>{currentPartner.name} · {currentPartner.subject}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Row inside Match Card */}
          <div className="ss-match-footer">
            <button className="btn ss-match-now-btn primary lg magnet" onClick={room.find}>
              <Icon n="arrow" size={16} />
              <span>Start 1-on-1 Match</span>
            </button>
            <button className="btn ss-match-invite-btn outline lg magnet" onClick={onInvite}>
              <Icon n="users" size={16} />
              <span>Invite a Friend</span>
            </button>
            {!user && (
              <button className="btn text ss-login-link" onClick={openLogin}>
                Sign in
              </button>
            )}
          </div>
        </div>

        <p className="ss-meta meta">
          {user ? 'Signed in · Unlimited daily sessions' : `${limit} free sessions daily · No sign-up required`}
        </p>
      </div>
    </section>
  );
}
