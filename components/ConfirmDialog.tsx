'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /** If set, the user must type this word to enable the confirm button. */
  typeToConfirm?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export default function ConfirmDialog({ title, children, confirmLabel, danger, typeToConfirm, onConfirm, onCancel }: Props) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const ok = !typeToConfirm || typed.trim().toUpperCase() === typeToConfirm;
  return (
    <div className="dialog-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title">
        <h2 id="dialog-title">{title}</h2>
        <div className="dialog-body">{children}</div>
        {typeToConfirm && (
          <div className="field">
            <label htmlFor="dialog-type">Type {typeToConfirm} to confirm</label>
            <input id="dialog-type" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </div>
        )}
        <div className="dialog-actions">
          <button ref={cancelRef} className="btn" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
          <button
            className={danger ? 'btn btn-danger' : 'btn btn-primary'}
            type="button"
            disabled={!ok || busy}
            onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
