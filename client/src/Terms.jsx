import React, { useState } from 'react';
import { Logo } from './components.jsx';

// Bump this whenever the terms change: everyone is asked to accept again.
export const TERMS_VERSION = '2026-10-30';
const KEY = 'workwe_terms';

export const termsAccepted = () => {
  try { return localStorage.getItem(KEY) === TERMS_VERSION; } catch { return false; }
};
const saveAccepted = () => {
  try { localStorage.setItem(KEY, TERMS_VERSION); } catch { /* private mode: they'll be asked again next visit */ }
};

function TermsText() {
  return (
    <div className="terms-body" tabIndex={0} data-lenis-prevent>
      <p className="terms-date">Last updated 30 October 2026</p>

      <h3>1. What WorkWe is</h3>
      <p>WorkWe is a free, student-run project, not a company. It connects you by live video with other people, picked at random or through an invite link, so you can work or study alongside each other. By using WorkWe you agree to these terms. If you don’t agree, don’t use it.</p>

      <h3>2. You must be 18 or older</h3>
      <p>You may only use WorkWe if you are at least 18 years old.</p>

      <h3>3. You’ll be talking to strangers</h3>
      <p>The people you’re matched with are strangers. We don’t verify who they are, screen them, or watch, monitor or moderate calls, chat or shared screens. Anyone can say or show anything. Don’t share personal information (your full name, address, phone number, accounts, or anything on your screen you wouldn’t want a stranger to see). If anything makes you uncomfortable, leave the call straight away.</p>

      <h3>4. Rules</h3>
      <p>Don’t show or send nudity or sexual content, harass, threaten or bully anyone, post hate speech, do anything illegal, record or screenshot other people without their permission, impersonate someone, or spam. We can block anyone, at any time, for any reason.</p>

      <h3>5. You’re responsible for yourself</h3>
      <p>You are solely responsible for what you say, show and share on WorkWe (including your camera, microphone, chat and screen share), and for how you deal with other users. Other users are solely responsible for their own behaviour, not us.</p>

      <h3>6. No guarantees</h3>
      <p>WorkWe is provided “as is” and “as available”, without warranties of any kind. It may break, go offline, lose data or shut down at any time without notice.</p>

      <h3>7. No liability</h3>
      <p>To the fullest extent permitted by law, the people who make and run WorkWe are not liable for any loss, harm or damage of any kind arising from your use of WorkWe, including anything another user says, shows or does, anything you share, and any outage or data loss. You use WorkWe entirely at your own risk.</p>

      <h3>8. You cover us</h3>
      <p>If someone makes a claim against the people who make and run WorkWe because of how you used it or because you broke these terms, you agree to cover the resulting costs and hold us harmless.</p>

      <h3>9. Your data</h3>
      <p>Video and audio go directly between you and your partner and are never recorded by us. Chat messages are passed to your partner and not stored. If you sign in with Google we keep your name, email address and profile picture. We use your IP address to count free sessions (counters are deleted after 48 hours) and to show your partner your approximate location (country and city). Your browser keeps a random guest ID and your settings. If you send a report or feedback we keep it, along with your email if you give one, and the name and IP address of you and of the person you were last matched with, so we can act on it.</p>

      <h3>10. Changes</h3>
      <p>We may change these terms. When we do, we’ll ask you to accept them again before your next session.</p>

      <h3>11. Reporting a problem</h3>
      <p>To report a user or a problem, use <b>Report / Feedback</b> at the top of the page. It works during a call too.</p>
    </div>
  );
}

// `onAccept` set: the first-join gate (checkbox + Agree). Otherwise: just read them.
export function TermsModal({ onAccept, onClose }) {
  const [agreed, setAgreed] = useState(false);
  const accept = () => {
    saveAccepted();
    onAccept();
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal terms-modal" role="dialog" aria-modal="true" aria-labelledby="terms-title" onClick={(e) => e.stopPropagation()}>
        <Logo size={30} />
        <h2 id="terms-title">{onAccept ? 'Before your first session' : 'Terms of Use'}</h2>
        {onAccept && <p>You’ll be on live video with strangers. Please read and accept the terms first.</p>}
        <TermsText />
        {onAccept ? (
          <>
            <label className="terms-check">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>I’m 18 or older, and I agree to the Terms of Use. I understand that WorkWe and its makers aren’t responsible for other users or for anything that happens while I use it.</span>
            </label>
            <div className="modal-actions">
              <button className="btn outline" onClick={onClose}>Cancel</button>
              <button className="btn primary" disabled={!agreed} onClick={accept}>Agree &amp; continue</button>
            </div>
          </>
        ) : (
          <button className="btn primary" autoFocus onClick={onClose}>Close</button>
        )}
      </div>
    </div>
  );
}
