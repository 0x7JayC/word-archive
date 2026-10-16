'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';
import { exportZip } from '@/lib/exporter';
import { formatBytes } from '@/lib/files';
import { getStore } from '@/lib/store';
import type { Meta } from '@/lib/types';

export default function MyData() {
  const router = useRouter();
  const store = getStore();
  const [counts, setCounts] = useState<{ words: number; files: number; drafts: number; bytes?: number } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [meta, setMetaState] = useState<Meta>({});

  useEffect(() => {
    (async () => {
      const meta = await store.getMeta();
      if (!meta.onboardedAt) { router.replace('/'); return; }
      setMetaState(meta);
      const [words, drafts] = await Promise.all([store.listWords(), store.listDrafts()]);
      const files = words.reduce((n, w) => n + w.fileIds.length, 0) + drafts.filter((d) => d.fileId).length;
      let bytes: number | undefined;
      try { bytes = (await navigator.storage?.estimate?.())?.usage; } catch { /* not available */ }
      setCounts({ words: words.length, files, drafts: drafts.length, bytes });
    })().catch(() => setMessage('Your data could not be read in this browser.'));
  }, [store, router]);

  async function withdrawTranscription() {
    const patch: Partial<Meta> = { transcribeConsentAt: undefined, transcribeConsentVersion: undefined, testerCode: undefined };
    try {
      await store.setMeta(patch);
      setMetaState((m) => ({ ...m, ...patch }));
      setMessage('Permission withdrawn. Recordings won’t be sent unless you agree again.');
    } catch {
      setMessage('That couldn’t be saved in this browser. Try again.');
    }
  }

  async function doExport() {
    setExporting(true);
    setMessage('');
    try {
      const { bytes, filename, count } = await exportZip(store);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setMessage(`Exported ${count} ${count === 1 ? 'word' : 'words'} to ${filename}.`);
    } catch {
      setMessage('The export could not be created. Try again; nothing was changed.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="page">
      <Link className="back" href="/">← Back to archive</Link>
      <h1 className="page-title">My data</h1>

      <section className="form-section">
        <h2 className="section-title">Where your words are</h2>
        <p><strong>Demo mode:</strong> everything is stored only in this browser, on this device, and nobody else can see it.</p>
        <p className="muted">A recording is sent out only when you tap Transcribe. It goes through OpenRouter to a speech-to-text model, only on routes that keep nothing and don&apos;t train AI on it, and only the text comes back.</p>
        <p className="muted">Clearing this browser&apos;s site data, or using a different browser or device, means you won&apos;t see these words. Export regularly to keep a copy.</p>
        {counts && (
          <p className="stats-line">
            {counts.words} {counts.words === 1 ? 'word' : 'words'} · {counts.files} {counts.files === 1 ? 'file' : 'files'}
            {counts.drafts ? ` · ${counts.drafts} waiting in Import` : ''}
            {counts.bytes ? ` · about ${formatBytes(counts.bytes)} used` : ''}
          </p>
        )}
      </section>

      {meta.transcribeConsentAt && (
        <section className="form-section">
          <h2 className="section-title">Transcription</h2>
          <p className="muted">On {new Date(meta.transcribeConsentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} you agreed to send recordings for transcription when you tap Transcribe.</p>
          <button className="btn" type="button" onClick={withdrawTranscription}>Withdraw permission</button>
        </section>
      )}

      <section className="form-section">
        <h2 className="section-title">Export everything</h2>
        <p className="muted">One zip file: <code>words.json</code> with every word, tag and reflection, plus the original recordings and photos.</p>
        <button className="btn btn-primary" type="button" onClick={doExport} disabled={exporting}>{exporting ? 'Preparing your export…' : 'Export as zip'}</button>
      </section>

      <section className="form-section">
        <h2 className="section-title">Delete everything</h2>
        <p className="muted">Removes every word, recording, photo, reflection and imported item from this browser, and your consent, so you start again from the welcome screen.</p>
        <button className="btn btn-danger" type="button" onClick={() => setConfirmWipe(true)}>Delete everything</button>
      </section>

      <div role="status" aria-live="polite">{message && <p className="muted">{message}</p>}</div>

      {confirmWipe && (
        <ConfirmDialog
          title="Delete everything?"
          confirmLabel="Delete everything"
          danger
          typeToConfirm="DELETE"
          onCancel={() => setConfirmWipe(false)}
          onConfirm={async () => { await store.wipe(); router.replace('/'); }}
        >
          <p>This removes all {counts?.words ?? 0} words and their files from this browser. It can&apos;t be undone. Export first if you want a copy.</p>
        </ConfirmDialog>
      )}
    </main>
  );
}
