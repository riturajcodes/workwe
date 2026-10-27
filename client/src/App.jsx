import React, { useCallback, useEffect, useState } from 'react';
import { fetchMe, getToken, googleLogin, setToken } from './api.js';
import { useWorkRoom } from './useWorkRoom.js';
import { Avatar, Chat, Controls, GoogleButton, Icon, Logo, ReactionLayer, Video } from './components.jsx';
import Landing from './Landing.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [authKey, setAuthKey] = useState(0);
  const [authError, setAuthError] = useState(null);
  const [chatOpen, setChatOpen] = useState(true);
  const [confirmNext, setConfirmNext] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('workwe_theme') || 'light'; } catch { return 'light'; }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('workwe_theme', theme); } catch { /* private mode */ }
  }, [theme]);
  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  const room = useWorkRoom(authKey);

  // close the confirmation if the call ends underneath it; Esc cancels
  useEffect(() => {
    if (room.phase !== 'matched') setConfirmNext(false);
  }, [room.phase]);
  useEffect(() => {
    if (!confirmNext) return;
    const onKey = (e) => e.key === 'Escape' && setConfirmNext(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmNext]);

  useEffect(() => {
    if (getToken()) fetchMe().then((u) => (u ? setUser(u) : setToken(null))).catch(() => {});
  }, []);

  const onCredential = useCallback(async (credential) => {
    try {
      const { token, user } = await googleLogin(credential);
      setToken(token);
      setUser(user);
      setAuthError(null);
      room.setLimitHit(false);
      setLoginOpen(false);
      setAuthKey((k) => k + 1); // reconnect the socket with the new token
    } catch (e) {
      setAuthError(e.message);
    }
  }, [room.setLimitHit]);

  const signOut = () => {
    setToken(null);
    setUser(null);
    setAuthKey((k) => k + 1);
  };

  const inRoom = room.phase !== 'idle';
  // the landing page scrolls the window (for smooth-scroll + scroll animations); the call room is fixed-height
  useEffect(() => {
    document.documentElement.classList.toggle('page-scroll', !inRoom);
    if (!inRoom) window.scrollTo(0, 0);
  }, [inRoom]);
  const sharing = !!room.screenStream;
  const hasScreen = !!(room.screenStream || room.remoteScreen);
  const left = room.quota && !room.quota.unlimited ? Math.max(0, room.quota.limit - room.quota.used) : null;

  return (
    <div className={`app ${inRoom ? '' : 'landing'}`}>
      <div className="bg" aria-hidden />
      {inRoom && (
        <nav className="top">
          <div className="brand"><Logo size={22} /><span>WorkWe</span></div>
          <div className="right">
            {room.online !== null && <span className="status"><i />{room.online.toLocaleString()} online</span>}
            {left !== null && <span className={`status ${left === 0 ? 'warn' : ''}`}>{left} free {left === 1 ? 'session' : 'sessions'} left</span>}
            <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle theme"><Icon n={theme === 'dark' ? 'sun' : 'moon'} size={16} /></button>
            {user && <div className="me"><Avatar name={user.name} picture={user.picture} size={28} /><span>{user.name?.split(' ')[0]}</span><button className="link" onClick={signOut}>Sign out</button></div>}
          </div>
        </nav>
      )}

      {!inRoom && (
        <main className="home">
          <Landing room={room} user={user} theme={theme} toggleTheme={toggleTheme} openLogin={() => setLoginOpen(true)} signOut={signOut} />
        </main>
      )}

      {room.phase === 'searching' && (
        <main className="searching">
          <div className="self">
            <Video stream={room.localStream} muted mirror />
            {!room.localStream && <div className="placeholder"><Avatar name={user?.name || 'You'} picture={user?.picture} size={80} /></div>}
            <div className="scan" />
            <span className="tag">You</span>
          </div>
          <h2>Finding a partner</h2>
          <p>{room.notice || 'Check your camera and lighting while we look for someone.'}</p>
          <button className="btn outline" onClick={room.stop}>Cancel</button>
        </main>
      )}

      {room.phase === 'matched' && (
        <main className={`room ${chatOpen ? 'with-chat' : ''}`}>
          <section className="stage-wrap">
            <div className={`stage ${hasScreen ? 'has-screen' : 'no-screen'}`}>
              {hasScreen && (
                <div className="screens" style={{ '--n': (room.screenStream ? 1 : 0) + (room.remoteScreen ? 1 : 0) }}>
                  {room.remoteScreen && (
                    <div className="tile main">
                      <Video stream={room.remoteScreen} className="contain" />
                      <span className="tag">{room.peer?.name}’s screen</span>
                    </div>
                  )}
                  {room.screenStream && (
                    <div className="tile main">
                      <Video stream={room.screenStream} muted className="contain" />
                      <span className="tag">Your screen</span>
                    </div>
                  )}
                </div>
              )}
              <div className="cams">
                <div className="tile cam">
                  {room.remoteCamera && room.peerStatus.cam ? <Video stream={room.remoteCamera} /> : (
                    <div className="placeholder"><Avatar name={room.peer?.name} picture={room.peer?.picture} size={hasScreen ? 40 : 72} /></div>
                  )}
                  <span className="tag">{room.peer?.name}{!room.peerStatus.mic && ' · muted'}</span>
                  {room.connState !== 'connected' && <div className="connecting">Connecting…</div>}
                </div>
                <div className="tile cam">
                  {room.localStream && room.cam ? <Video stream={room.localStream} muted mirror /> : <div className="placeholder"><Avatar name={user?.name || 'You'} picture={user?.picture} size={hasScreen ? 40 : 72} /></div>}
                  <span className="tag">You{!room.mic && ' · muted'}</span>
                </div>
              </div>
            </div>
            <ReactionLayer bursts={room.bursts} />
            <Controls
              mic={room.mic} cam={room.cam} sharing={sharing} canShare onReact={room.react}
              onMic={room.toggleMic} onCam={room.toggleCam}
              onShare={sharing ? room.stopShare : room.startShare}
              onNext={() => setConfirmNext(true)} onEnd={room.stop}
            />
            <button className="chat-toggle" onClick={() => setChatOpen((o) => !o)}>{chatOpen ? 'Hide chat' : 'Show chat'}</button>
          </section>
          {chatOpen && <Chat messages={room.messages} onSend={room.sendChat} peerName={room.peer?.name} />}
        </main>
      )}

      {confirmNext && (
        <div className="modal-bg" onClick={() => setConfirmNext(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Skip to someone new?</h2>
            <p>
              You’ll leave {room.peer?.name ? <b>{room.peer.name}</b> : 'your partner'} and both of you will be matched again.
              {left !== null && ` This uses one of your ${left} remaining free ${left === 1 ? 'session' : 'sessions'} today.`}
            </p>
            <div className="modal-actions">
              <button className="btn outline" autoFocus onClick={() => setConfirmNext(false)}>Stay</button>
              <button className="btn primary" onClick={() => { setConfirmNext(false); room.next(); }}>Yes, next</button>
            </div>
          </div>
        </div>
      )}

      {(loginOpen || (room.limitHit && !user)) && !user && (
        <div className="modal-bg" onClick={() => { setLoginOpen(false); room.setLimitHit(false); }}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <Logo size={30} />
            {room.limitHit ? (
              <>
                <h2>Daily limit reached</h2>
                <p>You’ve used your {room.quota?.limit ?? 5} free sessions for today. Sign in with Google to continue with unlimited sessions.</p>
              </>
            ) : (
              <>
                <h2>Sign in to WorkWe</h2>
                <p>Continue with Google for unlimited sessions every day.</p>
              </>
            )}
            <GoogleButton onCredential={onCredential} />
            {authError && <p className="hint warn">{authError}</p>}
            <button className="link" onClick={() => { setLoginOpen(false); room.setLimitHit(false); }}>{room.limitHit ? 'Not now' : 'Close'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
