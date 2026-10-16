'use client';

import { useState } from 'react';
import { getStore } from '@/lib/store';
import { CONSENT_VERSION } from '@/lib/types';

export default function Welcome({ onDone }: { onDone: () => void }) {
  const [adult, setAdult] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function start() {
    setBusy(true);
    setError('');
    try {
      await getStore().setMeta({ onboardedAt: new Date().toISOString(), consentVersion: CONSENT_VERSION });
      onDone();
    } catch {
      setError('Your choice could not be saved in this browser. Check that site storage is allowed, then try again.');
      setBusy(false);
    }
  }

  return (
    <main className="welcome">
      <div className="welcome-card">
        <h1>Word Archive</h1>
        <p className="welcome-lead">Keep the words spoken over you, exactly as they were given, and see them together over the years.</p>

        <ul className="welcome-points">
          <li><strong>Record, photograph or type.</strong> Voice memos, notebook pages, screenshots or text.</li>
          <li><strong>Nothing is interpreted for you.</strong> Suggested tags are only suggestions. You confirm every one.</li>
          <li><strong>See what connects.</strong> A timeline, and a map of the themes your words share.</li>
        </ul>

        <div className="callout" role="note">
          <strong>Demo mode.</strong> Your words are stored only in this browser on this device.
          A recording leaves it only if you tap Transcribe, and only the text comes back.
        </div>

        <fieldset className="consent">
          <legend>Before you start</legend>
          <label className="check">
            <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
            <span>I am 18 or older.</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>I agree that this app stores my words, which may reveal my religious beliefs, so it can show them back to me. I can export or delete everything at any time.</span>
          </label>
        </fieldset>

        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-wide" type="button" disabled={!adult || !consent || busy} onClick={start}>
          {busy ? 'Starting…' : 'Start my archive'}
        </button>
      </div>
    </main>
  );
}
