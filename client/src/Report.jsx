import React, { useState } from 'react';
import { Icon } from './components.jsx';

const REASONS = [
  ['feedback', 'Feedback or an idea'],
  ['bug', 'Something isn’t working'],
  ['sexual', 'Nudity or sexual content'],
  ['harassment', 'Harassment, threats or hate'],
  ['underage', 'Someone who seems under 18'],
  ['spam', 'Spam or a scam'],
  ['other', 'Something else'],
];

// The top-bar button that opens the form, on every screen
export function ReportButton({ onClick }) {
  return (
    <button className="report-btn" onClick={onClick} aria-label="Report or send feedback">
      <Icon n="flag" size={15} /><span>Report / Feedback</span>
    </button>
  );
}

// `peerName`: who they're in a call with right now, if anyone
export function ReportModal({ onSend, onClose, peerName, inCall }) {
  const [reason, setReason] = useState(inCall ? '' : 'feedback');
  const [details, setDetails] = useState('');
  const [contact, setContact] = useState('');
  const [state, setState] = useState({ sending: false, sent: false, error: null });
  const aboutPerson = !['feedback', 'bug', ''].includes(reason);

  const submit = async (e) => {
    e.preventDefault();
    setState({ sending: true, sent: false, error: null });
    const res = await onSend({ reason, details, contact });
    setState({ sending: false, sent: !!res?.ok, error: res?.ok ? null : res?.error || 'Couldn’t send. Try again.' });
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal report-modal" role="dialog" aria-modal="true" aria-labelledby="report-title" onClick={(e) => e.stopPropagation()}>
        {state.sent ? (
          <>
            <span className="report-ico"><Icon n="flag" size={22} /></span>
            <h2 id="report-title">Thanks, we got it</h2>
            <p>{aboutPerson ? 'We’ll look into it. If you felt unsafe, leave the call. You never have to stay.' : 'We read everything that comes in.'}</p>
            <button className="btn primary" autoFocus onClick={onClose}>Done</button>
          </>
        ) : (
          <form onSubmit={submit}>
            <h2 id="report-title">Report or send feedback</h2>
            <p>Report a person or a problem, or tell us what would make WorkWe better.</p>

            <label className="field">
              <span>What’s this about?</span>
              <select value={reason} onChange={(e) => setReason(e.target.value)} required>
                <option value="" disabled>Choose one</option>
                {REASONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select>
            </label>

            <label className="field">
              <span>What happened?</span>
              <textarea
                value={details} onChange={(e) => setDetails(e.target.value)} required maxLength={2000} rows={4}
                placeholder={aboutPerson ? 'Describe what they said or did.' : 'Tell us as much as you like.'}
              />
            </label>

            <label className="field">
              <span>Your email <em>(optional, if you’d like a reply)</em></span>
              <input type="email" value={contact} onChange={(e) => setContact(e.target.value)} maxLength={200} autoComplete="email" />
            </label>

            {aboutPerson && (
              <p className="hint">
                {peerName
                  ? <>We’ll attach your current partner, <b>{peerName}</b>, so we know who this is about.</>
                  : 'If you were in a call, we’ll attach who you were last matched with.'}
              </p>
            )}
            {state.error && <p className="hint warn" role="alert">{state.error}</p>}

            <div className="modal-actions">
              <button type="button" className="btn outline" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn primary" disabled={state.sending || !reason || !details.trim()}>{state.sending ? 'Sending…' : 'Send'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
