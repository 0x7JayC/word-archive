'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { dateFromFilename, dateLabel } from '@/lib/dates';
import { audioDuration, formatBytes, kindOf, MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS, toStoredFile } from '@/lib/files';
import { getStore } from '@/lib/store';
import type { Draft } from '@/lib/types';
import { uid } from '@/lib/words';

const KIND_LABEL = { audio: 'Recording', image: 'Photo', text: 'Text' } as const;

export default function ImportQueue() {
  const router = useRouter();
  const params = useSearchParams();
  const store = getStore();
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [notice, setNotice] = useState(params.get('saved') ? 'Saved.' : '');

  /** null = not onboarded (sent to the welcome screen). */
  const fetchDrafts = useCallback(async (): Promise<Draft[] | null> => {
    const meta = await store.getMeta();
    if (!meta.onboardedAt) return null;
    const ds = await store.listDrafts();
    // oldest first by the date in the file name, then by when it was added
    const key = (d: Draft) => dateFromFilename(d.name)?.date || '9999';
    return ds.sort((a, b) => key(a).localeCompare(key(b)) || a.createdAt.localeCompare(b.createdAt));
  }, [store]);
  const apply = useCallback((ds: Draft[] | null) => { if (ds === null) router.replace('/'); else setDrafts(ds); }, [router]);
  const load = useCallback(async () => apply(await fetchDrafts()), [fetchDrafts, apply]);

  useEffect(() => {
    let off = false;
    fetchDrafts()
      .then((ds) => { if (!off) apply(ds); })
      .catch(() => { if (!off) setNotice('The import list could not be read. Reload the page to try again.'); });
    return () => { off = true; };
  }, [fetchDrafts, apply]);

  async function onPick(list: FileList | null) {
    if (!list || !list.length) return;
    const files = Array.from(list);
    const bad: string[] = [];
    setSkipped([]);
    setBusy({ done: 0, total: files.length });
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const kind = kindOf(f);
      try {
        if (!kind) bad.push(`${f.name}: not a recording, photo or text file`);
        else if (kind === 'text') {
          await store.saveDraft({ id: uid(), fileId: null, kind, name: f.name, text: await f.text(), createdAt: new Date().toISOString() });
        } else if (kind === 'audio' && f.size > MAX_AUDIO_BYTES) {
          bad.push(`${f.name}: ${formatBytes(f.size)}, over the 100 MB limit`);
        } else {
          const duration = kind === 'audio' ? await audioDuration(f) : undefined;
          if (duration && duration > MAX_AUDIO_SECONDS) bad.push(`${f.name}: longer than 60 minutes`);
          else {
            const sf = await toStoredFile(f, f.name, kind, duration);
            await store.putFile(sf);
            await store.saveDraft({ id: uid(), fileId: sf.id, kind, name: f.name, text: '', createdAt: new Date().toISOString() });
          }
        }
      } catch {
        bad.push(`${f.name}: could not be read`);
      }
      setBusy({ done: i + 1, total: files.length });
    }
    setBusy(null);
    setSkipped(bad);
    setNotice(`${files.length - bad.length} added to the list.`);
    await load();
  }

  async function remove(d: Draft) {
    await store.deleteDraft(d.id);
    setNotice(`Removed "${d.name}".`);
    await load();
  }

  return (
    <main className="page">
      <Link className="back" href="/">← Back to archive</Link>
      <h1 className="page-title">Import what you already have</h1>
      <p className="muted">Pick many voice memos, photos of notebook pages, screenshots or text files at once. Each one waits here until you review it and save it as a word.</p>

      <div className="row">
        <label className="btn btn-primary file-btn">
          Choose files
          <input type="file" className="visually-hidden" multiple accept="audio/*,image/*,.m4a,.mp3,.wav,.heic,.txt,.md,text/plain" disabled={!!busy} onChange={(e) => { void onPick(e.target.files); e.target.value = ''; }} />
        </label>
        {drafts && drafts.length > 0 && <Link className="btn" href={`/add?draft=${encodeURIComponent(drafts[0].id)}`}>Review next</Link>}
      </div>
      <p className="hint">Tip for iPhone Voice Memos: select recordings, Share, Save to Files, then choose them here. Dates in names like &quot;29 Jul, 18.12&quot; are read automatically.</p>

      <div role="status" aria-live="polite">
        {busy && <p className="muted">Adding {busy.done} of {busy.total}…</p>}
        {!busy && notice && <p className="muted">{notice}</p>}
      </div>
      {skipped.length > 0 && (
        <div className="error" role="alert">
          <p>These weren&apos;t added:</p>
          <ul>{skipped.map((s) => <li key={s}>{s}</li>)}</ul>
        </div>
      )}

      <h2 className="section-title">{drafts === null ? 'Loading…' : drafts.length ? `${drafts.length} waiting to be reviewed` : 'Nothing waiting'}</h2>
      {drafts && drafts.length === 0 && <p className="muted">Everything you imported has been reviewed. Choose more files, or go back to your archive.</p>}
      {drafts && drafts.length > 0 && (
        <ul className="queue">
          {drafts.map((d) => {
            const g = dateFromFilename(d.name);
            return (
              <li key={d.id}>
                <span className="q-kind">{KIND_LABEL[d.kind]}</span>
                <span className="q-name">{d.name}</span>
                <span className="q-date">{g ? dateLabel(g.date, g.precision) : 'No date in the name'}</span>
                <span className="q-actions">
                  <Link className="btn" href={`/add?draft=${encodeURIComponent(d.id)}`}>Review</Link>
                  <button className="link" type="button" onClick={() => remove(d)} aria-label={`Remove ${d.name} from the list`}>Remove</button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
