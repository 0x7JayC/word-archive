'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import ActionBar from '@/components/ActionBar';
import ConfirmDialog from '@/components/ConfirmDialog';
import type { RoadmapAction } from '@/lib/roadmap/app.js';
import { getStore } from '@/lib/store';
import { todayIso } from '@/lib/dates';
import type { Status, Word } from '@/lib/types';
import { mediaFor, sortWords, toRoadmapRecord, uid } from '@/lib/words';

export default function Home() {
  const router = useRouter();
  const store = getStore();
  const [words, setWords] = useState<Word[] | null>(null);
  const [drafts, setDrafts] = useState(0);
  const [toDelete, setToDelete] = useState<Word | null>(null);
  const [notice, setNotice] = useState('');
  const mountRef = useRef<HTMLDivElement>(null);
  const wordsRef = useRef<Word[]>([]);

  const fetchAll = useCallback(async () => {
    const [ws, ds] = await Promise.all([store.listWords(), store.listDrafts()]);
    return { words: sortWords(ws), drafts: ds.length };
  }, [store]);
  const apply = useCallback((r: { words: Word[]; drafts: number }) => {
    wordsRef.current = r.words;
    setDrafts(r.drafts);
    setWords(r.words);
  }, []);
  const load = useCallback(async () => apply(await fetchAll()), [fetchAll, apply]);

  useEffect(() => {
    let off = false;
    fetchAll()
      .then((r) => { if (!off) apply(r); })
      .catch(() => { if (!off) setNotice('Your words could not be loaded from this browser. Reload the page to try again.'); });
    return () => { off = true; };
  }, [fetchAll, apply]);

  const save = useCallback(async (w: Word, message: string) => {
    try {
      await store.saveWord({ ...w, updatedAt: new Date().toISOString() });
      setNotice(message);
      await load(); // remounts the roadmap; the URL still points at this word, so its panel reopens
    } catch {
      setNotice('That change could not be saved. Nothing was lost; try again.');
    }
  }, [store, load]);

  const onAction = useCallback((a: RoadmapAction) => {
    const w = wordsRef.current.find((x) => x.id === a.id);
    if (!w) return;
    if (a.type === 'status') void save({ ...w, status: a.status as Status }, 'Status updated.');
    else if (a.type === 'reflect') void save({ ...w, reflections: [...w.reflections, { id: uid(), writtenOn: todayIso(), text: a.text }] }, 'Reflection saved.');
    else if (a.type === 'edit') router.push(`/add?edit=${encodeURIComponent(w.id)}`);
    else if (a.type === 'delete') setToDelete(w);
  }, [save, router]);
  // the roadmap keeps one callback for its lifetime; route it to the latest handler without remounting
  const actionRef = useRef(onAction);
  useEffect(() => { actionRef.current = onAction; }, [onAction]);

  // (re)mount the timeline + constellation whenever the words change
  useEffect(() => {
    if (!words || !mountRef.current) return undefined;
    let cancelled = false;
    let destroy: (() => void) | null = null;
    const revokes: Array<() => void> = [];
    (async () => {
      const records = [];
      for (const w of words) {
        const { media, revoke } = await mediaFor(store, w);
        revokes.push(revoke);
        records.push(toRoadmapRecord(w, media));
      }
      const { mountRoadmap } = await import('@/lib/roadmap/app.js');
      if (cancelled || !mountRef.current) return;
      destroy = mountRoadmap(mountRef.current, records, '', { onAction: (a) => actionRef.current(a) });
    })();
    return () => { cancelled = true; if (destroy) destroy(); revokes.forEach((r) => r()); };
  }, [words, store]);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  return (
    <>
      <ActionBar drafts={drafts} />
      <div ref={mountRef} />
      {words === null && <p className="page muted" role="status">Loading your words…</p>}
      <div className="toast" role="status" aria-live="polite">{notice}</div>
      {toDelete && (
        <ConfirmDialog
          title="Delete this word?"
          confirmLabel="Delete word"
          danger
          onCancel={() => setToDelete(null)}
          onConfirm={async () => {
            await store.deleteWord(toDelete.id);
            setToDelete(null);
            try { history.replaceState(null, '', location.pathname); } catch { /* ignore */ }
            setNotice('Word deleted.');
            await load();
          }}
        >
          <p>The word from <strong>{toDelete.givenBy || 'Unnamed speaker'}</strong> and any recording or photos attached to it will be removed from this browser. This can&apos;t be undone.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
