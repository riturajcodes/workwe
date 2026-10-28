import React, { useCallback, useEffect, useState } from 'react';
import { fetchInvite, fetchMe, getToken, googleLogin, setRef, setToken } from './api.js';
import { placeLabel, useWorkRoom } from './useWorkRoom.js';
import { Avatar, Chat, Controls, GoogleButton, Icon, Logo, ReactionLayer, VipBadge, Video } from './components.jsx';
import Landing from './Landing.jsx';

const MEDIA_COPY = {
  denied: ['Allow camera and microphone', 'WorkWe needs both to connect you with a partner. If your browser doesn’t ask, click the camera or lock icon in the address bar, allow camera and microphone for this site, then try again.'],
  missing: ['No camera or microphone found', 'WorkWe needs both a camera and a microphone. Connect them, then try again.'],
  busy: ['Camera or microphone is busy', 'Another app may be using them. Close it, then try again.'],
  lost: ['Camera or microphone turned off', 'Your session ended because WorkWe lost access to your camera or microphone. Turn them back on to keep going.'],
  unsupported: ['Camera not available here', 'This browser can’t access a camera on this page. Open WorkWe over HTTPS in an up-to-date browser.'],
  other: ['Couldn’t start your camera', 'Something went wrong starting your camera and microphone. Check them, then try again.'],
};

// Two kinds of links: /?invite=<code> (co-work with me, valid 24h) and /?ref=<code> (a plain sign-up
// link; the sharer earns VIP if it brings in a new account, but the visitor isn't told any of that).
// Read them once, then tidy the URL.
const LINK = (() => {
  const q = new URLSearchParams(location.search);
  const invite = q.get('invite');
  const ref = q.get('ref');
  if (ref && !getToken()) setRef(ref);
  if (invite || ref) history.replaceState(null, '', location.pathname);
  return { invite, ref: ref && !getToken() ? ref : null };
})();

const DAY = 86_400_000;
const daysLeft = (until) => Math.max(1, Math.ceil((new Date(until) - Date.now()) / DAY));
const longDate = (d) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
const shortTime = (d) => new Date(d).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

function useCopy() {
  const [copied, setCopied] = useState(null);
  const copy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    } catch { /* clipboard blocked; the link is still selectable */ }
  };
  return [copied, copy];
}
const share = (title, url) => navigator.share?.({ title, url }).catch(() => {});

function LinkBox({ url, label, copied, onCopy, shareTitle }) {
  return (
    <div className="invite-link">
      <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label={label} />
      <button className="btn primary sm" onClick={onCopy}>{copied ? 'Copied' : 'Copy'}</button>
      {navigator.share && <button className="btn outline sm" onClick={() => share(shareTitle, url)}>Share</button>}
    </div>
  );
}

function VipChip({ user, onClick }) {
  if (!user) return null; // only signed-in users can earn VIP
  if (user.vip) {
    return <button className="vip-chip on" onClick={onClick} title={`VIP until ${longDate(user.vipUntil)}`}><VipBadge />{daysLeft(user.vipUntil)}d left</button>;
  }
  return <button className="vip-chip" onClick={onClick}>Get VIP</button>;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [pendingInvite, setPendingInvite] = useState(LINK.invite && { code: LINK.invite, loading: true });
  const [vipOpen, setVipOpen] = useState(false);
  const [copied, copy] = useCopy();
  const [slow, setSlow] = useState(false); // still not connected after a while
  const [authKey, setAuthKey] = useState(0);
  const [authError, setAuthError] = useState(null);
  // chat starts open beside the video on wide screens; on phones it's a sheet you open
  const [chatOpen, setChatOpen] = useState(() => window.matchMedia('(min-width: 901px)').matches);
  const [seen, setSeen] = useState(0);
  const [confirmNext, setConfirmNext] = useState(false);
  const [loginOpen, setLoginOpen] = useState(!!LINK.ref); // a sign-up link opens sign-in straight away
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
    if (LINK.invite) fetchInvite(LINK.invite).then((info) => setPendingInvite(info ? { ...info, loading: false } : { code: LINK.invite, expired: true })).catch(() => {});
  }, []);

  const onCredential = useCallback(async (credential) => {
    try {
      const { token, user } = await googleLogin(credential);
      setToken(token);
      setRef(null);
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

  useEffect(() => {
    setSlow(false);
    if (room.phase !== 'matched' || room.connState === 'connected') return;
    const t = setTimeout(() => setSlow(true), 15_000);
    return () => clearTimeout(t);
  }, [room.phase, room.connState, room.peer]);

  // someone signed up through our link: refresh the badge and celebrate
  useEffect(() => {
    if (room.reward) setUser(room.reward);
  }, [room.reward]);

  const inviteLink = room.invite && `${location.origin}/?invite=${room.invite.code}`;
  const referralLink = user?.refCode && `${location.origin}/?ref=${user.refCode}`;
  const openVip = () => setVipOpen(true);

  const inRoom = room.phase !== 'idle';
  // the landing page scrolls the window (for smooth-scroll + scroll animations); the call room is fixed-height
  useEffect(() => {
    document.documentElement.classList.toggle('page-scroll', !inRoom);
    if (!inRoom) window.scrollTo(0, 0);
  }, [inRoom]);
  useEffect(() => {
    if (chatOpen) setSeen(room.messages.length);
  }, [chatOpen, room.messages.length]);
  const unread = !chatOpen && room.messages.slice(seen).some((m) => !m.mine && !m.system);
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
            {left !== null && <span className={`status ${left === 0 ? 'warn' : ''}`}>{left}<span className="long"> free {left === 1 ? 'session' : 'sessions'}</span> left</span>}
            <VipChip user={user} onClick={openVip} />
            <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle theme"><Icon n={theme === 'dark' ? 'sun' : 'moon'} size={16} /></button>
            {user && <div className="me"><Avatar name={user.name} picture={user.picture} size={28} /><span>{user.name?.split(' ')[0]}</span><button className="link" onClick={signOut}>Sign out</button></div>}
          </div>
        </nav>
      )}

      {!inRoom && (
        <main className="home">
          <Landing room={room} user={user} theme={theme} toggleTheme={toggleTheme} openLogin={() => setLoginOpen(true)} signOut={signOut} onInvite={room.createInvite} vipChip={<VipChip user={user} onClick={openVip} />} />
        </main>
      )}

      {room.phase === 'searching' && (
        <main className="searching">
          <div className={`self ${user?.vip ? 'vip' : ''}`}>
            <Video stream={room.localStream} muted mirror />
            {(!room.localStream || !room.cam) && <div className="placeholder"><Avatar name={user?.name || 'You'} picture={user?.picture} size={80} /></div>}
            <div className="scan" />
            <span className="tag">You{user?.vip && <VipBadge />}{!room.mic && ' · muted'}</span>
            {sharing && (
              <div className="screen-pip">
                <Video stream={room.screenStream} muted className="contain" />
                <span className="tag">Your screen</span>
              </div>
            )}
          </div>
          {room.invite?.isOwner ? (
            <>
              <h2>Waiting for your friend</h2>
              <p>Send them this link. You’ll be connected as soon as they open it.</p>
              <LinkBox url={inviteLink} label="Invite link" copied={copied === 'invite'} onCopy={() => copy(inviteLink, 'invite')} shareTitle="Co-work with me on WorkWe" />
              <p className="hint">The link works until {shortTime(room.invite.expiresAt)}. If you leave, we’ll tell you when your friend shows up.</p>
            </>
          ) : room.invite ? (
            <>
              <h2>Waiting for {room.invite.host.name}</h2>
              <p>We’ve let them know you’re here. You’ll be connected as soon as they join.</p>
            </>
          ) : (
            <>
              <h2>Finding a partner</h2>
              <p>{room.notice || 'Check your camera and lighting while we look for someone.'}</p>
            </>
          )}
          {/* set up mic, camera and screen before you're matched; it all carries into the call */}
          <Controls
            lobby mic={room.mic} cam={room.cam} sharing={sharing} canShare={!!navigator.mediaDevices?.getDisplayMedia}
            onMic={room.toggleMic} onCam={room.toggleCam} onShare={sharing ? room.stopShare : room.startShare}
          />
          {sharing && <p className="hint sharing"><i />Sharing your screen. Your partner will see it as soon as you’re matched.</p>}
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
                <div className={`tile cam ${room.peer?.vip ? 'vip' : ''}`}>
                  {room.remoteCamera && room.peerStatus.cam ? <Video stream={room.remoteCamera} /> : (
                    <div className="placeholder"><Avatar name={room.peer?.name} picture={room.peer?.picture} size={hasScreen ? 40 : 72} /></div>
                  )}
                  <span className="tag">{room.peer?.name}{room.peer?.vip && <VipBadge />}{!room.peerStatus.mic && ' · muted'}</span>
                  {room.peer?.place && !hasScreen && <span className="place">{placeLabel(room.peer.place)}</span>}
                  {room.connState !== 'connected' && (
                    <div className="connecting">
                      {slow ? (
                        <div className="stuck">
                          <span>Can’t reach {room.peer?.name || 'your partner'}. Their network may be blocking the call.</span>
                          <button className="btn primary sm" onClick={room.next}>Find someone else</button>
                        </div>
                      ) : 'Connecting…'}
                    </div>
                  )}
                </div>
                <div className={`tile cam ${user?.vip ? 'vip' : ''}`}>
                  {room.localStream && room.cam ? <Video stream={room.localStream} muted mirror /> : <div className="placeholder"><Avatar name={user?.name || 'You'} picture={user?.picture} size={hasScreen ? 40 : 72} /></div>}
                  <span className="tag">You{user?.vip && <VipBadge />}{!room.mic && ' · muted'}</span>
                </div>
              </div>
            </div>
            <ReactionLayer bursts={room.bursts} />
            <Controls
              mic={room.mic} cam={room.cam} sharing={sharing} canShare={!!navigator.mediaDevices?.getDisplayMedia} onReact={room.react}
              chatOpen={chatOpen} unread={unread} onChat={() => setChatOpen((o) => !o)}
              onMic={room.toggleMic} onCam={room.toggleCam}
              onShare={sharing ? room.stopShare : room.startShare}
              onNext={() => setConfirmNext(true)} onEnd={room.stop}
            />
          </section>
          {chatOpen && <Chat messages={room.messages} onSend={room.sendChat} peerName={room.peer?.name} onClose={() => setChatOpen(false)} />}
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

      {pendingInvite && !pendingInvite.loading && !inRoom && !room.mediaError && (
        <div className="modal-bg">
          <div className="modal" role="dialog" aria-modal="true">
            {pendingInvite.expired ? (
              <>
                <Logo size={30} />
                <h2>This invite has expired</h2>
                <p>Invite links work for 24 hours. Ask your friend for a new one, or work with someone new now.</p>
                <div className="modal-actions">
                  <button className="btn outline" onClick={() => setPendingInvite(null)}>Close</button>
                  <button className="btn primary" autoFocus onClick={() => { setPendingInvite(null); room.find(); }}>Find a partner</button>
                </div>
              </>
            ) : (
              <>
                <Avatar name={pendingInvite.host.name} picture={pendingInvite.host.picture} size={56} />
                <h2 className="after-avatar">{pendingInvite.host.name} invited you to co-work</h2>
                <p>Turn on your camera and microphone to join them. This link works until {shortTime(pendingInvite.expiresAt)}.</p>
                <div className="modal-actions">
                  <button className="btn outline" onClick={() => setPendingInvite(null)}>Not now</button>
                  <button className="btn primary" autoFocus onClick={() => { const { code } = pendingInvite; setPendingInvite(null); room.find(code); }}>Join {pendingInvite.host.name.split(' ')[0]}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {room.friendWaiting && room.phase !== 'matched' && (
        <div className="modal-bg">
          <div className="modal" role="dialog" aria-modal="true">
            <Logo size={30} />
            <h2>{room.friendWaiting.name} is waiting for you</h2>
            <p>They opened your invite link and are ready to co-work.</p>
            <div className="modal-actions">
              <button className="btn outline" onClick={() => room.setFriendWaiting(null)}>Later</button>
              <button className="btn primary" autoFocus onClick={() => { const { code } = room.friendWaiting; room.setFriendWaiting(null); room.find(code); }}>Join now</button>
            </div>
          </div>
        </div>
      )}

      {vipOpen && user && (
        <div className="modal-bg" onClick={() => setVipOpen(false)}>
          <div className="modal vip-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <span className="vip-hero"><VipBadge /></span>
            {user.vip ? (
              <>
                <h2>You’re VIP until {longDate(user.vipUntil)}</h2>
                <p><b>{daysLeft(user.vipUntil)} {daysLeft(user.vipUntil) === 1 ? 'day' : 'days'} left.</b> Share your sign-up link again: each new account it brings in adds another 30 days.</p>
              </>
            ) : (
              <>
                <h2>Get VIP free for 30 days</h2>
                <p>Share your sign-up link. When someone creates a new WorkWe account with it, you get VIP for 30 days: a glowing frame and a VIP badge on your video.</p>
              </>
            )}
            <LinkBox url={referralLink} label="Sign-up link" copied={copied === 'ref'} onCopy={() => copy(referralLink, 'ref')} shareTitle="Join WorkWe" />
            <p className="hint">{user.referrals ? `${user.referrals} ${user.referrals === 1 ? 'person has' : 'people have'} signed up with your link. ` : ''}Only new accounts count.</p>
            <button className="link" onClick={() => setVipOpen(false)}>Close</button>
          </div>
        </div>
      )}

      {room.inviteMissing && (
        <div className="modal-bg" onClick={() => room.setInviteMissing(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>This invite has expired</h2>
            <p>Your friend isn’t waiting on this link anymore. Ask them for a new one, or work with someone new now.</p>
            <div className="modal-actions">
              <button className="btn outline" onClick={() => room.setInviteMissing(false)}>Close</button>
              <button className="btn primary" autoFocus onClick={() => room.find()}>Find a partner</button>
            </div>
          </div>
        </div>
      )}

      {room.reward && (
        <div className="modal-bg" onClick={() => room.setReward(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <span className="vip-hero"><VipBadge /></span>
            <h2>You’re VIP for 30 days</h2>
            <p>Someone signed up with your link. Your video now has a glowing frame and a VIP badge until <b>{longDate(room.reward.vipUntil)}</b> ({daysLeft(room.reward.vipUntil)} days). Refer more friends to extend it.</p>
            <button className="btn primary" autoFocus onClick={() => room.setReward(null)}>Nice</button>
          </div>
        </div>
      )}

      {room.mediaError && (
        <div className="modal-bg" onClick={room.clearMediaError}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <span className="perm-ico"><Icon n="cam" size={22} /><Icon n="mic" size={22} /></span>
            <h2>{MEDIA_COPY[room.mediaError.kind]?.[0] || MEDIA_COPY.other[0]}</h2>
            <p>{MEDIA_COPY[room.mediaError.kind]?.[1] || MEDIA_COPY.other[1]}</p>
            <div className="modal-actions">
              <button className="btn outline" onClick={room.clearMediaError}>Not now</button>
              <button className="btn primary" autoFocus onClick={() => { room.clearMediaError(); room.find(); }}>Allow camera & mic</button>
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
