import React, { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { Avatar, HeroVisual, Icon, Logo, VipBadge } from './components.jsx';

gsap.registerPlugin(ScrollTrigger);

const GLYPHS = 'abcdefghijklmnopqrstuvwxyz';
const MORPH = ['Focus', 'Flow', 'Momentum', 'Progress'];
const STATEMENT =
  'WorkWe helps you start and finish your work like never before. Real people, shared screens and quiet accountability for your most focused, most productive days.';

const CHIPS = [
  { t: 'Focused', c: '#8b7bff', shape: 'ring', cls: 'c1', depth: 1.0 },
  { t: 'Accountable', c: '#34c98e', shape: 'star', cls: 'c2', depth: 1.6 },
  { t: 'Productive', c: '#ff7aa8', shape: 'heart', cls: 'c3', depth: 0.7 },
  { t: 'Calm', c: '#5cb8ff', shape: 'spark', cls: 'c4', depth: 1.3 },
  { t: 'Finished', c: '#ffa55c', shape: 'dot', cls: 'c5', depth: 0.9 },
];

function ChipIcon({ shape, c }) {
  const p = { width: 15, height: 15, viewBox: '0 0 24 24', fill: c };
  if (shape === 'ring') return <svg {...p}><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 6a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z" fillRule="evenodd" /></svg>;
  if (shape === 'star') return <svg {...p}><path d="m12 2 3 6.6 7 .8-5.2 4.8 1.5 7L12 17.7 5.7 21.2l1.5-7L2 9.4l7-.8L12 2Z" /></svg>;
  if (shape === 'heart') return <svg {...p}><path d="M12 21s-8-5.3-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.7-8 11-8 11Z" /></svg>;
  if (shape === 'spark') return <svg {...p}><path d="M12 2c.6 5.3 2.7 7.4 8 8-5.3.6-7.4 2.7-8 8-.6-5.3-2.7-7.4-8-8 5.3-.6 7.4-2.7 8-8Z" /></svg>;
  return <svg {...p}><circle cx="12" cy="12" r="8" /></svg>;
}

// Blur + letter-scramble swap, used for the morphing word.
function scrambleTo(el, to, dur = 0.9) {
  el._t?.kill();
  const o = { p: 0 };
  el._t = gsap.to(o, {
    p: 1, duration: dur, ease: 'power2.out',
    onUpdate() {
      const n = Math.floor(o.p * to.length);
      let s = to.slice(0, n);
      for (let i = n; i < to.length; i++) s += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      el.textContent = s;
    },
    onComplete() { el.textContent = to; },
  });
  gsap.fromTo(el, { filter: 'blur(12px)', opacity: 0.35 }, { filter: 'blur(0px)', opacity: 1, duration: dur, ease: 'power2.out' });
}

const Chars = ({ text }) =>
  text.split(' ').map((w, i) => (
    <span key={i} className="cw">
      {[...w].map((c, j) => <span key={j} className="ch">{c}</span>)}
      {' '}
    </span>
  ));

export default function Landing({ room, user, theme, toggleTheme, openLogin, signOut, onInvite }) {
  const root = useRef(null);
  const cursor = useRef(null);
  const lenisRef = useRef(null);
  const limit = room.quota?.limit ?? 5;

  useLayoutEffect(() => {
    const el = root.current;
    // final numbers are always present; the intro just counts up to them
    el.querySelectorAll('[data-count]').forEach((n) => { n.textContent = `${n.dataset.count}${n.dataset.suffix || ''}`; });

    const mm = gsap.matchMedia();
    const ctx = gsap.context(() => {
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const $ = (s) => gsap.utils.toArray(s, el);
        const q = (s) => el.querySelector(s);

        /* ---------- smooth scroll, driven by GSAP's ticker ---------- */
        const lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.95 });
        lenisRef.current = lenis;
        lenis.on('scroll', ScrollTrigger.update);
        const tick = (t) => lenis.raf(t * 1000);
        gsap.ticker.add(tick);
        gsap.ticker.lagSmoothing(0);

        /* ---------- hero intro ---------- */
        gsap.set($('.lnav > *'), { y: -24, opacity: 0 });
        gsap.set(q('.trust'), { scale: 0.7, opacity: 0, transformOrigin: 'left center' });
        gsap.set($('.lni'), { yPercent: 115, rotate: 3 });
        gsap.set($('.h-copy .lead, .h-copy .cta-row, .h-copy .meta'), { y: 28, opacity: 0 });
        gsap.set($('.hv-art, .hv-photo'), { y: 120, scale: 0.9, opacity: 0, transformOrigin: '50% 100%' });
        gsap.set($('.scanbox'), { scale: 0.4, opacity: 0, transformOrigin: 'top left' });
        gsap.set(q('.hv-chip'), { x: -40, opacity: 0 });
        gsap.set($('.h-stats li'), { x: 60, opacity: 0 });
        gsap.set(q('.hv-glow'), { scale: 0.5, opacity: 0 });

        const intro = gsap.timeline({ defaults: { ease: 'power4.out' } });
        intro
          .to($('.lnav > *'), { y: 0, opacity: 1, duration: 0.9, stagger: 0.08 }, 0)
          .to(q('.trust'), { scale: 1, opacity: 1, duration: 0.8, ease: 'back.out(2)' }, 0.2)
          .to(q('.hv-glow'), { scale: 1, opacity: 1, duration: 1.6 }, 0.1)
          .to($('.lni'), { yPercent: 0, rotate: 0, duration: 1.15, stagger: 0.11 }, 0.25)
          .to($('.hv-art, .hv-photo'), { y: 0, scale: 1, opacity: 1, duration: 1.5 }, 0.3)
          .to($('.h-copy .lead, .h-copy .cta-row, .h-copy .meta'), { y: 0, opacity: 1, duration: 0.9, stagger: 0.1 }, 0.85)
          .to($('.scanbox'), { scale: 1, opacity: 1, duration: 0.8, stagger: 0.14, ease: 'back.out(1.8)' }, 1.1)
          .to(q('.hv-chip'), { x: 0, opacity: 1, duration: 0.9 }, 1.5)
          .to($('.h-stats li'), { x: 0, opacity: 1, duration: 0.9, stagger: 0.12 }, 1.2);

        // stats count up
        $('[data-count]').forEach((n, i) => {
          const to = Number(n.dataset.count);
          const o = { v: 0 };
          gsap.to(o, {
            v: to, duration: 1.8, delay: 1.35 + i * 0.12, ease: 'power3.out',
            onUpdate: () => { n.textContent = `${Math.round(o.v)}${n.dataset.suffix || ''}`; },
          });
        });

        // idle life: pulsing scan boxes, shimmering lines, floating figures
        gsap.to($('.scanbox'), { opacity: 0.72, duration: 1.4, yoyo: true, repeat: -1, ease: 'sine.inOut', stagger: { each: 0.5, from: 'random' }, delay: 3 });
        gsap.to($('.mini i'), { scaleX: 0.6, transformOrigin: 'left', duration: 1.1, yoyo: true, repeat: -1, ease: 'sine.inOut', stagger: 0.2 });
        gsap.to(q('.hv-chip'), { y: -10, duration: 2.4, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: 2.5 });
        gsap.to(q('.hv-stage'), { y: -8, duration: 3.2, yoyo: true, repeat: -1, ease: 'sine.inOut' });

        // pointer parallax on the hero
        const hero = q('.hero3');
        const move = {
          art: gsap.quickTo(q('.hv-stage'), 'x', { duration: 0.8, ease: 'power3' }),
          boxes: $('.scanbox').map((b) => [gsap.quickTo(b, 'x', { duration: 1, ease: 'power3' }), gsap.quickTo(b, 'y', { duration: 1, ease: 'power3' })]),
          glow: gsap.quickTo(q('.hv-glow'), 'x', { duration: 1.4, ease: 'power3' }),
        };
        const onMove = (e) => {
          const r = hero.getBoundingClientRect();
          const nx = (e.clientX - r.left) / r.width - 0.5;
          const ny = (e.clientY - r.top) / r.height - 0.5;
          move.art(nx * 22);
          move.glow(nx * -60);
          move.boxes.forEach(([x, y], i) => { x(nx * (28 + i * 14)); y(ny * (22 + i * 10)); });
        };
        hero.addEventListener('pointermove', onMove);

        // hero scroll-out: visual drifts up, copy fades
        gsap.to(q('.hv'), { yPercent: -14, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
        gsap.to(q('.h-copy'), { y: -80, opacity: 0.2, ease: 'none', scrollTrigger: { trigger: hero, start: 'center top', end: 'bottom top', scrub: true } });

        /* ---------- marquee with scroll-velocity skew ---------- */
        const rows = $('.mq-row');
        const tweens = rows.map((r, i) => gsap.fromTo(r.firstElementChild, { xPercent: i % 2 ? -50 : 0 }, { xPercent: i % 2 ? 0 : -50, repeat: -1, duration: 36, ease: 'none' }));
        const skew = gsap.quickSetter(q('.mq'), 'skewX', 'deg');
        let sk = 0; let boost = 1;
        ScrollTrigger.create({
          trigger: q('.mq'), start: 'top bottom', end: 'bottom top',
          onUpdate(self) {
            const vel = self.getVelocity();
            sk += (gsap.utils.clamp(-14, 14, vel / -120) - sk) * 0.3;
            boost = Math.max(boost, 1 + Math.abs(vel) / 300);
          },
        });
        const mqTick = () => { sk *= 0.9; boost += (1 - boost) * 0.06; skew(sk); tweens.forEach((t) => t.timeScale(boost)); };
        gsap.ticker.add(mqTick);

        /* ---------- split section: reveal, line draw, morphing word ---------- */
        const split = q('.split');
        const morphEl = q('.mw');
        let idx = -1;
        gsap.set(q('.sc-reveal'), { clipPath: 'inset(0% 100% 0% 0% round 28px)' });
        gsap.set($('.sc-dot'), { scale: 0, opacity: 0 });
        gsap.set($('.sp-copy > *'), { y: 40, opacity: 0 });
        gsap.set(q('.vline i'), { scaleY: 0, transformOrigin: 'top' });
        gsap.set(q('.vline b'), { opacity: 0, y: -10 });
        gsap.set(q('.morph'), { opacity: 0, y: 30 });
        const st = gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: split, start: 'top top', end: 'bottom bottom', scrub: 0.6,
          onUpdate(self) {
            const i = Math.min(MORPH.length - 1, Math.floor(Math.max(0, self.progress - 0.42) / 0.58 * MORPH.length));
            if (i !== idx) { idx = i; scrambleTo(morphEl, MORPH[i]); }
          } } });
        st.to(q('.sc-reveal'), { clipPath: 'inset(0% 0% 0% 0% round 28px)', duration: 0.22 }, 0)
          .fromTo(q('.scene'), { scale: 1.25 }, { scale: 1, duration: 0.3 }, 0)
          .to($('.sc-dot'), { scale: 1, opacity: 1, stagger: 0.04, duration: 0.06, ease: 'back.out(3)' }, 0.2)
          .to($('.sp-copy > *'), { y: 0, opacity: 1, stagger: 0.04, duration: 0.1 }, 0.12)
          .to(q('.vline i'), { scaleY: 1, duration: 0.25 }, 0.28)
          .to(q('.vline b'), { opacity: 1, y: 0, duration: 0.05 }, 0.5)
          .to(q('.morph'), { opacity: 1, y: 0, duration: 0.1 }, 0.38)
          .to($('.sc-card.a'), { y: -40, duration: 1 }, 0)
          .to($('.sc-card.b'), { y: 40, duration: 1 }, 0)
          .to(q('.split-panel'), { backgroundPosition: '50% 100%', duration: 1 }, 0);

        /* ---------- statement: word-by-word reveal + floating chips ---------- */
        const stmt = q('.stmt');
        gsap.fromTo($('.sw'), { opacity: 0.16 }, { opacity: 1, stagger: 0.12, ease: 'none',
          scrollTrigger: { trigger: stmt, start: 'top 15%', end: 'bottom 85%', scrub: true } });
        $('.chip3').forEach((c, i) => {
          const d = Number(c.dataset.depth);
          gsap.fromTo(c, { scale: 0, rotate: gsap.utils.random(-30, 30) }, { scale: 1, duration: 0.8, ease: 'back.out(2.4)', delay: i * 0.1,
            scrollTrigger: { trigger: stmt, start: 'top 55%' } });
          gsap.to(c, { yPercent: -120 * d, ease: 'none', scrollTrigger: { trigger: stmt, start: 'top bottom', end: 'bottom top', scrub: 0.8 } });
          gsap.to(c.firstElementChild, { rotate: gsap.utils.random(-9, 9), y: gsap.utils.random(-14, 14), duration: gsap.utils.random(2, 3.4), yoyo: true, repeat: -1, ease: 'sine.inOut' });
        });

        /* ---------- horizontal pinned steps ---------- */
        const hs = q('.hs'); const track = q('.hs-track'); const hsStick = q('.hs-sticky');
        const dist = () => -(track.scrollWidth - hsStick.clientWidth + 40);
        gsap.to(track, { x: dist, ease: 'none', scrollTrigger: { trigger: hs, start: 'top top', end: 'bottom bottom', scrub: 0.6, invalidateOnRefresh: true } });
        gsap.to(q('.hs-bar i'), { scaleX: 1, ease: 'none', scrollTrigger: { trigger: hs, start: 'top top', end: 'bottom bottom', scrub: true } });
        $('.hs-num').forEach((n) => gsap.fromTo(n, { xPercent: 30 }, { xPercent: -30, ease: 'none', scrollTrigger: { trigger: hs, start: 'top top', end: 'bottom bottom', scrub: true } }));
        $('.hs-panel').forEach((p) => {
          gsap.from(p.querySelectorAll('.hs-in > *'), { y: 50, opacity: 0, stagger: 0.1, duration: 0.9, ease: 'power3.out',
            scrollTrigger: { trigger: hs, start: 'top 60%' } });
        });

        /* ---------- features: staggered fly-in + 3D tilt + spotlight ---------- */
        gsap.from($('.feat'), { y: 80, opacity: 0, rotateX: -18, transformPerspective: 900, transformOrigin: '50% 100%', stagger: { each: 0.09, from: 'start' }, duration: 1, ease: 'power3.out',
          scrollTrigger: { trigger: q('.grid-feat'), start: 'top 82%' } });
        gsap.from(q('.feat-head'), { y: 40, opacity: 0, duration: 0.9, ease: 'power3.out', scrollTrigger: { trigger: q('.feat-head'), start: 'top 88%' } });
        const cleanups = [];
        $('.feat').forEach((f) => {
          const rx = gsap.quickTo(f, 'rotateX', { duration: 0.5, ease: 'power3' });
          const ry = gsap.quickTo(f, 'rotateY', { duration: 0.5, ease: 'power3' });
          const mv = (e) => {
            const r = f.getBoundingClientRect();
            const x = (e.clientX - r.left) / r.width; const y = (e.clientY - r.top) / r.height;
            f.style.setProperty('--mx', `${x * 100}%`); f.style.setProperty('--my', `${y * 100}%`);
            ry((x - 0.5) * 14); rx((0.5 - y) * 14);
          };
          const lv = () => { rx(0); ry(0); };
          gsap.set(f, { transformPerspective: 900 });
          f.addEventListener('pointermove', mv); f.addEventListener('pointerleave', lv);
          cleanups.push(() => { f.removeEventListener('pointermove', mv); f.removeEventListener('pointerleave', lv); });
        });

        /* ---------- final CTA ---------- */
        const fin = q('.final');
        gsap.from($('.final .ch'), { yPercent: 120, rotate: 8, opacity: 0, stagger: 0.025, duration: 1, ease: 'power4.out', scrollTrigger: { trigger: fin, start: 'top 65%' } });
        gsap.from($('.final .fin-in'), { y: 40, opacity: 0, stagger: 0.12, duration: 0.9, ease: 'power3.out', scrollTrigger: { trigger: fin, start: 'top 55%' } });
        $('.orb').forEach((o, i) => gsap.to(o, { y: (i % 2 ? -1 : 1) * 160, ease: 'none', scrollTrigger: { trigger: fin, start: 'top bottom', end: 'bottom top', scrub: 1 } }));

        // magnetic buttons
        $('.magnet').forEach((b) => {
          const x = gsap.quickTo(b, 'x', { duration: 0.5, ease: 'elastic.out(1, 0.5)' });
          const y = gsap.quickTo(b, 'y', { duration: 0.5, ease: 'elastic.out(1, 0.5)' });
          const mv = (e) => { const r = b.getBoundingClientRect(); x((e.clientX - (r.left + r.width / 2)) * 0.35); y((e.clientY - (r.top + r.height / 2)) * 0.35); };
          const lv = () => { x(0); y(0); };
          b.addEventListener('pointermove', mv); b.addEventListener('pointerleave', lv);
          cleanups.push(() => { b.removeEventListener('pointermove', mv); b.removeEventListener('pointerleave', lv); });
        });

        /* ---------- floating join pill once the hero is gone ---------- */
        const pill = q('.float-join');
        gsap.set(pill, { autoAlpha: 0, y: 30 });
        ScrollTrigger.create({ trigger: hero, start: 'bottom 30%', onEnter: () => gsap.to(pill, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power3.out' }), onLeaveBack: () => gsap.to(pill, { autoAlpha: 0, y: 30, duration: 0.4 }) });
        ScrollTrigger.create({ trigger: fin, start: 'top 70%', onEnter: () => gsap.to(pill, { autoAlpha: 0, y: 30, duration: 0.3 }), onLeaveBack: () => gsap.to(pill, { autoAlpha: 1, y: 0, duration: 0.4 }) });

        /* ---------- custom cursor (fine pointers only) ---------- */
        let cursorOff = () => {};
        if (window.matchMedia('(hover: hover) and (pointer: fine)').matches && cursor.current) {
          const c = cursor.current;
          gsap.set(c, { xPercent: -50, yPercent: -50, opacity: 0 });
          const cx = gsap.quickTo(c, 'x', { duration: 0.25, ease: 'power3' });
          const cy = gsap.quickTo(c, 'y', { duration: 0.25, ease: 'power3' });
          const mv = (e) => { cx(e.clientX); cy(e.clientY); gsap.to(c, { opacity: 1, duration: 0.2, overwrite: 'auto' }); };
          const over = (e) => gsap.to(c, { scale: e.target.closest('a, button, .magnet, .feat') ? 2.6 : 1, duration: 0.3 });
          window.addEventListener('pointermove', mv); window.addEventListener('pointerover', over);
          cursorOff = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerover', over); };
        }

        document.fonts?.ready.then(() => ScrollTrigger.refresh());
        return () => {
          lenis.destroy(); lenisRef.current = null;
          gsap.ticker.remove(tick); gsap.ticker.remove(mqTick);
          hero.removeEventListener('pointermove', onMove);
          cleanups.forEach((f) => f()); cursorOff();
        };
      });
    }, el);
    return () => { mm.revert(); ctx.revert(); };
  }, []);

  const goto = (e, id) => {
    e.preventDefault();
    const t = root.current.querySelector(id);
    if (lenisRef.current) lenisRef.current.scrollTo(t, { offset: -10, duration: 1.6 });
    else t.scrollIntoView({ behavior: 'smooth' });
  };

  const Join = ({ cls = 'tint lg', label = 'Join a session' }) => (
    <button className={`btn ${cls} magnet`} onClick={room.find}>{label}<Icon n="arrow" size={16} /></button>
  );

  return (
    <div ref={root}>
      <div className="cursor" ref={cursor} aria-hidden />
      <div className="shell">
        <header className="lnav">
          <div className="brand"><Logo size={24} /><span>WorkWe</span></div>
          <nav className="links">
            <a href="#how" onClick={(e) => goto(e, '.split')}>How it works</a>
            <a href="#steps" onClick={(e) => goto(e, '.hs')}>Steps</a>
            <a href="#features" onClick={(e) => goto(e, '#features')}>Features</a>
          </nav>
          <div className="lright">
            <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle theme"><Icon n={theme === 'dark' ? 'sun' : 'moon'} size={16} /></button>
            {user ? (
              <div className="me"><Avatar name={user.name} picture={user.picture} size={28} />{user.vip && <VipBadge />}<span>{user.name?.split(' ')[0]}</span><button className="link" onClick={signOut}>Sign out</button></div>
            ) : (
              <button className="btn outline sm" onClick={openLogin}>Log in</button>
            )}
            <button className="btn primary sm" onClick={room.find}>Join now</button>
          </div>
        </header>

        {/* ===== hero ===== */}
        <section className="hero3">
          <div className="h-left">
            <span className="trust"><i />{room.online !== null ? `${room.online.toLocaleString()} ${room.online === 1 ? 'person' : 'people'} working right now` : 'Live co-working'}</span>
            <div className="h-copy">
              <h1>
                <span className="ln"><span className="lni">Do your best</span></span>
                <span className="ln"><span className="lni">work beside</span></span>
                <span className="ln"><span className="lni"><em>someone.</em></span></span>
              </h1>
              <p className="lead">Get matched with a real person for a live co-working session. See each other, share screens, and skip to someone new whenever you like.</p>
              <div className="cta-row">
                <Join />
                <button className="btn text lg" onClick={onInvite}><Icon n="users" size={16} />Invite a friend</button>
                {!user && <button className="btn text lg" onClick={openLogin}>Log in</button>}
              </div>
              <p className="meta">{user ? 'Unlimited sessions while signed in.' : `${limit} free sessions a day. No account needed.`} Invite a friend who signs up and get VIP for 30 days.</p>
              {room.messages.at(-1)?.system && <p className="hint">{room.messages.at(-1).text}</p>}
            </div>
          </div>

          <HeroVisual />

          <ul className="h-stats">
            <li><span className="sico"><Icon n="screen" size={18} /></span><div><b data-count="2" data-suffix="×" /><small>screens shared<br />at the same time</small></div></li>
            <li><span className="sico"><Icon n="lock" size={18} /></span><div><b data-count="0" /><small>recordings,<br />ever stored</small></div></li>
            <li><span className="sico"><Icon n="users" size={18} /></span><div><b data-count={limit} /><small>free sessions<br />every day</small></div></li>
          </ul>
        </section>

        {/* ===== marquee ===== */}
        <section className="mq" aria-hidden>
          {['Focus together · Share screens · Skip freely · ', 'Real people · Zero recordings · Start in one click · '].map((t, r) => (
            <div key={r} className={`mq-row ${r ? 'alt' : ''}`}>
              <div className="mq-track">{Array.from({ length: 8 }, (_, i) => <span key={i}>{t}</span>)}</div>
            </div>
          ))}
        </section>

        {/* ===== split: pinned reveal ===== */}
        <section className="split" id="how">
          <div className="split-sticky">
            <div className="split-left">
              <div className="sc-reveal">
                <div className="scene">
                  <div className="sc-bg" />
                  <div className="sc-card a">
                    <div className="sc-bar"><i /><i /><i /></div>
                    <div className="sc-lines"><b style={{ width: '40%' }} className="k" /><b style={{ width: '78%' }} /><b style={{ width: '56%' }} /><b style={{ width: '66%' }} className="k" /><b style={{ width: '30%' }} /></div>
                  </div>
                  <div className="sc-card b">
                    <div className="sc-bar"><i /><i /><i /></div>
                    <div className="sc-chart"><i style={{ height: '42%' }} /><i style={{ height: '68%' }} /><i style={{ height: '52%' }} /><i style={{ height: '88%' }} /><i style={{ height: '74%' }} /></div>
                  </div>
                  <svg className="sc-person" viewBox="0 0 160 160" fill="none">
                    <circle cx="80" cy="80" r="79" fill="var(--p1a)" opacity=".5" />
                    <circle cx="80" cy="64" r="26" fill="#fff" opacity=".92" />
                    <path d="M28 150c0-30 22-50 52-50s52 20 52 50" fill="#fff" opacity=".92" />
                  </svg>
                  <span className="sc-dot d1"><i /><em>Focus</em></span>
                  <span className="sc-dot d2"><i /><em>Share</em></span>
                  <span className="sc-dot d3"><i /><em>Chat</em></span>
                </div>
              </div>
            </div>
            <div className="split-panel">
              <div className="sp-copy">
                <h2>Work side by side</h2>
                <p>Real people, real screens. WorkWe pairs you with someone ready to focus, so you both stay on task without the small talk.</p>
              </div>
              <div className="vline"><i /><b><Icon n="arrow" size={16} /></b></div>
              <div className="morph"><span>Shared</span> <span className="mw">Focus</span></div>
            </div>
          </div>
        </section>

        {/* ===== statement: words light up ===== */}
        <section className="stmt">
          <div className="stmt-sticky">
            <p className="stmt-text">{STATEMENT.split(' ').map((w, i) => <React.Fragment key={i}><span className="sw">{w}</span>{' '}</React.Fragment>)}</p>
            {CHIPS.map((c) => (
              <div key={c.t} className={`chip3 ${c.cls}`} data-depth={c.depth}>
                <span><ChipIcon shape={c.shape} c={c.c} />{c.t}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ===== horizontal steps ===== */}
        <section className="hs" id="steps">
          <div className="hs-sticky">
            <p className="kicker hs-kicker">How it works</p>
            <div className="hs-track">
              {[
                ['01', 'Join', 'Allow your camera and microphone. You’re matched with someone who is ready to work right now.', 'video'],
                ['02', 'Work side by side', 'Talk, or don’t. Both of you can share a screen at the same time, with chat and reactions alongside.', 'screen'],
                ['03', 'Move on freely', 'Not the right fit? Skip, and you’re both back in the queue straight away. No awkward goodbyes.', 'shuffle'],
              ].map(([n, t, d, ic]) => (
                <article key={n} className="hs-panel">
                  <span className="hs-num">{n}</span>
                  <div className="hs-in">
                    <span className="ico"><Icon n={ic} size={20} /></span>
                    <h3>{t}</h3>
                    <p>{d}</p>
                  </div>
                </article>
              ))}
            </div>
            <div className="hs-bar"><i /></div>
          </div>
        </section>

        {/* ===== features ===== */}
        <section className="features" id="features">
          <div className="wrap">
            <p className="kicker feat-head">Built for focus</p>
            <div className="grid-feat">
              {[
                ['video', 'Video and audio', 'Low-latency, peer-to-peer calls with echo cancellation and noise suppression.'],
                ['screen', 'Two-way screen sharing', 'Share your screen while your partner shares theirs. Cameras stay in view.'],
                ['chat', 'Live chat', 'Drop links and notes without interrupting each other.'],
                ['shuffle', 'Random pairings', 'You’re matched with whoever is around, instantly. Skip any time.'],
                ['smile', 'Quick reactions', 'Send a cheer to your partner. You both see the same animation.'],
                ['lock', 'Private by design', 'Video goes directly between you and your partner. Nothing is recorded.'],
              ].map(([ic, t, d]) => (
                <div key={t} className="feat"><span className="ico"><Icon n={ic} size={18} /></span><h3>{t}</h3><p>{d}</p></div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== final ===== */}
        <section className="final">
          <span className="orb o1" /><span className="orb o2" />
          <div className="wrap">
            <h2 aria-label="Start your next session."><Chars text="Start your next session." /></h2>
            <p className="sub fin-in">It takes one click. No account required.</p>
            <div className="fin-in"><Join /></div>
          </div>
        </section>
        <footer className="foot"><span>© 2026 WorkWe</span><span>Peer-to-peer video. Never recorded.</span></footer>
      </div>

      <button className="btn primary float-join magnet" onClick={room.find}>Join a session<Icon n="arrow" size={16} /></button>
    </div>
  );
}
