'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

interface Props {
  /** Ask for consent (first time, or after the wording changed). */
  needConsent: boolean;
  /** Ask for the tester code (first time, or after a wrong code). */
  needCode: boolean;
  codeError: boolean;
  onConfirm: (code: string) => void | Promise<void>;
  onCancel: () => void;
}

/** Spec §7c: one dialog explains where the recording goes and collects the tester code. */
export default function TranscribeDialog({ needConsent, needCode, codeError, onConfirm, onCancel }: Props) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    (needCode ? codeRef.current : cancelRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel, needCode]);

  const ready = !needCode || code.trim().length > 0;
  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    try { await onConfirm(code.trim()); } finally { setBusy(false); }
  }

  return (
    <div className="dialog-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="tx-title" onSubmit={submit}>
        <h2 id="tx-title">{needConsent ? 'Transcribe this recording?' : 'Enter the tester code'}</h2>
        {needConsent && (
          <div className="dialog-body">
            <p>The recording is sent through OpenRouter to a speech-to-text model. Only routes that keep nothing and don&apos;t train AI on it are allowed. Only the text comes back, and you check it before saving.</p>
            <p>Other people&apos;s voices may be in it. Where you can, make sure they&apos;re comfortable with this.</p>
            <p>Your choice is remembered in this browser. You can withdraw it in My data.</p>
          </div>
        )}
        {needCode && (
          <div className="field">
            <label htmlFor="tester-code">Tester code</label>
            <input
              id="tester-code"
              ref={codeRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-describedby="tester-code-hint"
              aria-invalid={codeError || undefined}
            />
            <p className={codeError ? 'error' : 'hint'} id="tester-code-hint" role={codeError ? 'alert' : undefined}>
              {codeError ? 'That tester code isn’t right. Check it with the person who invited you.' : 'From the person who invited you to test.'}
            </p>
          </div>
        )}
        <div className="dialog-actions">
          <button className="btn" type="button" onClick={onCancel} disabled={busy} ref={cancelRef}>Cancel</button>
          <button className="btn btn-primary" type="submit" disabled={!ready || busy}>{busy ? 'Starting…' : 'Transcribe'}</button>
        </div>
      </form>
    </div>
  );
}
