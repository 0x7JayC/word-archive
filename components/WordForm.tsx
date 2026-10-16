'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import TranscribeDialog from '@/components/TranscribeDialog';
import { transcribeRecording, type Progress } from '@/lib/ai/client';
import { TRANSCRIBE_CONSENT_VERSION, TranscribeError, type TranscribeErrorCode } from '@/lib/ai/types';
import { dateFromFilename, dateParts, iso, todayIso } from '@/lib/dates';
import { audioDuration, formatBytes, formatDuration, kindOf, MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS, toStoredFile } from '@/lib/files';
import { getStore } from '@/lib/store';
import { normaliseTag, suggest } from '@/lib/suggest';
import { STATUSES, type DatePrecision, type Draft, type Meta, type Status, type StoredFile, type TranscriptQuality, type Word } from '@/lib/types';
import { allTags, emptyWord } from '@/lib/words';

type Source = 'audio' | 'image' | 'text';
interface Attached { file: StoredFile; url: string; isNew: boolean }
type Tx = Progress | { stage: 'done' } | { stage: 'empty' } | { stage: 'error'; code: TranscribeErrorCode; partial: string[] };

// Spec §7c: every error says what happened and what to do next.
const TX_ERROR: Record<TranscribeErrorCode, string> = {
  bad_code: 'That tester code isn’t right.',
  not_configured: 'Transcription isn’t set up on this site yet. Paste the transcript instead.',
  unavailable: 'Transcription is unavailable right now. Your recording is still here. Try again later, or paste the words yourself.',
  out_of_credit: 'Transcription is paused because the test budget has run out. Your recording is still here. Let the person who invited you know, or paste the words yourself.',
  busy: 'The transcription service is busy. Try again in a minute.',
  too_large: 'Part of this recording was too large to send. Save it as an .m4a or .mp3 file and upload it again.',
  unsupported: 'This recording can’t be prepared in this browser. Try Safari, or save it as an .m4a or .mp3 file.',
  network: 'No connection. Check your internet, then tap Retry.',
  aborted: 'Stopped. Nothing was added.',
  failed: 'Transcription failed. Your recording is still here. Retry, or paste the words yourself.',
};
const NO_RETRY: TranscribeErrorCode[] = ['not_configured', 'unsupported', 'too_large'];

function txMessage(t: Tx | undefined): string {
  if (!t) return '';
  switch (t.stage) {
    case 'preparing': return 'Preparing the recording…';
    case 'sending': return t.total > 1 ? `Transcribing… ${t.done} of ${t.total}` : 'Transcribing…';
    case 'done': return 'Transcribed. Check the words below.';
    case 'empty': return 'No speech was found in this recording.';
    case 'error': {
      const resumable = t.partial.length > 0 && !NO_RETRY.includes(t.code);
      return TX_ERROR[t.code] + (resumable ? ` Retry continues from part ${t.partial.length + 1}.` : '');
    }
  }
}

const SOURCE_LABEL: Record<Source, string> = { audio: 'Recording', image: 'Photos', text: 'Text' };
const STATUS_LABEL: Record<Status, string> = { pending: 'Pending', unfolding: 'Unfolding', fulfilled: 'Fulfilled', unclear: 'Unclear' };
const noopSubscribe = () => () => {};

export default function WordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get('edit');
  const draftId = params.get('draft');
  const typeParam = params.get('type');
  const store = getStore();

  const [phase, setPhase] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [word, setWord] = useState<Word>(() => emptyWord());
  const [source, setSource] = useState<Source>(typeParam === 'image' || typeParam === 'text' ? typeParam : 'audio');
  const [attached, setAttached] = useState<Attached[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [knownTags, setKnownTags] = useState<string[]>([]);
  const [knownSpeakers, setKnownSpeakers] = useState<string[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [waiting, setWaiting] = useState(0);
  const [dateTouched, setDateTouched] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [refInput, setRefInput] = useState('');
  const [fileError, setFileError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // null until the server says what is connected, so the "not connected" note never flashes up wrongly
  const [ai, setAi] = useState<{ transcription: boolean; photoText: boolean } | null>(null);
  const [meta, setMetaState] = useState<Meta>({});
  const [tx, setTx] = useState<Record<string, Tx>>({});
  const [ask, setAsk] = useState<{ fileId: string; codeError: boolean } | null>(null);
  const [machineText, setMachineText] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ verbatim: string; quality: TranscriptQuality } | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const urlsRef = useRef<string[]>([]);
  const verbatimRef = useRef('');
  const controllers = useRef<Record<string, AbortController>>({});
  useEffect(() => { verbatimRef.current = word.verbatim; }, [word.verbatim]);
  useEffect(() => () => Object.values(controllers.current).forEach((c) => c.abort()), []);
  const closeAsk = useCallback(() => setAsk(null), []);

  const objectUrl = (f: StoredFile) => {
    const u = URL.createObjectURL(new Blob([f.data], { type: f.type }));
    urlsRef.current.push(u);
    return u;
  };
  useEffect(() => () => urlsRef.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const applyFileDate = useCallback((name: string) => {
    if (dateTouched || editId) return;
    const g = dateFromFilename(name);
    if (g) setWord((w) => ({ ...w, dateGiven: g.date, datePrecision: g.precision, dateNote: g.note }));
  }, [dateTouched, editId]);

  // load: onboarding guard, existing tags/speakers, and the word or draft being edited
  useEffect(() => {
    let off = false;
    (async () => {
      const meta = await store.getMeta();
      if (!meta.onboardedAt) { router.replace('/'); return; }
      const words = await store.listWords();
      if (off) return;
      setMetaState(meta);
      setKnownTags(allTags(words));
      setKnownSpeakers([...new Set(words.map((w) => w.givenBy).filter(Boolean))].sort());
      if (editId) {
        const w = await store.getWord(editId);
        if (!w) { setPhase('missing'); return; }
        const files: Attached[] = [];
        for (const id of w.fileIds) { const f = await store.getFile(id); if (f) files.push({ file: f, url: objectUrl(f), isNew: false }); }
        setWord(w);
        setLoaded({ verbatim: w.verbatim, quality: w.transcriptQuality });
        setAttached(files);
        setSource(files[0]?.file.kind ?? 'text');
      } else if (draftId) {
        const d = await store.getDraft(draftId);
        if (!d) { setPhase('missing'); return; }
        setDraft(d);
        setSource(d.kind);
        const g = dateFromFilename(d.name);
        const base = emptyWord();
        setWord({ ...base, verbatim: d.text || '', ...(g ? { dateGiven: g.date, datePrecision: g.precision, dateNote: g.note } : {}) });
        if (d.fileId) { const f = await store.getFile(d.fileId); if (f) setAttached([{ file: f, url: objectUrl(f), isNew: false }]); }
        setWaiting((await store.listDrafts()).length - 1);
      }
      setPhase('ready');
    })().catch(() => setError('Your archive could not be read in this browser. Reload the page to try again.'));
    fetch('/api/ai/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => { if (!off) setAi({ transcription: !!s?.transcription, photoText: !!s?.photoText }); })
      .catch(() => { if (!off) setAi({ transcription: false, photoText: false }); });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, draftId]);

  // ---------- files ----------
  async function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    setFileError('');
    for (const f of Array.from(list)) {
      try {
        const kind = kindOf(f);
        if (kind === 'text') {
          const t = await f.text();
          setWord((w) => ({ ...w, verbatim: w.verbatim ? `${w.verbatim}\n\n${t}` : t }));
          applyFileDate(f.name);
          continue;
        }
        if (!kind) { setFileError(`"${f.name}" isn't a recording or a photo, so it wasn't added.`); continue; }
        if (kind === 'audio' && f.size > MAX_AUDIO_BYTES) { setFileError(`"${f.name}" is ${formatBytes(f.size)}. The limit is 100 MB per recording.`); continue; }
        const duration = kind === 'audio' ? await audioDuration(f) : undefined;
        if (duration && duration > MAX_AUDIO_SECONDS) { setFileError(`"${f.name}" is longer than 60 minutes, the limit for now.`); continue; }
        const sf = await toStoredFile(f, f.name, kind, duration);
        setAttached((a) => [...a, { file: sf, url: objectUrl(sf), isNew: true }]);
        applyFileDate(f.name);
      } catch {
        setFileError(`"${f.name}" could not be read. Try saving it to Files again, or choose a different copy.`);
      }
    }
  }
  function removeAttached(a: Attached) {
    controllers.current[a.file.id]?.abort();
    setAttached((list) => list.filter((x) => x.file.id !== a.file.id));
    if (!a.isNew) setRemovedIds((ids) => [...ids, a.file.id]);
  }

  // ---------- transcription (spec §7c) ----------
  const busyTx = Object.values(tx).some((t) => t.stage === 'preparing' || t.stage === 'sending');
  const consentOk = !!meta.transcribeConsentAt && meta.transcribeConsentVersion === TRANSCRIBE_CONSENT_VERSION;

  function onTranscribe(a: Attached) {
    if (!consentOk || !meta.testerCode) { setAsk({ fileId: a.file.id, codeError: false }); return; }
    void runTranscribe(a, meta.testerCode);
  }

  async function confirmAsk(code: string) {
    if (!ask) return;
    const patch: Partial<Meta> = { transcribeConsentAt: meta.transcribeConsentAt && consentOk ? meta.transcribeConsentAt : new Date().toISOString(), transcribeConsentVersion: TRANSCRIBE_CONSENT_VERSION };
    if (code) patch.testerCode = code;
    try { await store.setMeta(patch); } catch { /* still usable for this session */ }
    setMetaState((m) => ({ ...m, ...patch }));
    const a = attached.find((x) => x.file.id === ask.fileId);
    setAsk(null);
    if (a) void runTranscribe(a, code || meta.testerCode || '');
  }

  function stopTranscribe(id: string) {
    controllers.current[id]?.abort();
  }

  async function runTranscribe(a: Attached, code: string) {
    const id = a.file.id;
    const prev = tx[id];
    const done = prev?.stage === 'error' ? prev.partial : [];
    const ctrl = new AbortController();
    controllers.current[id] = ctrl;
    setTx((t) => ({ ...t, [id]: { stage: 'preparing' } }));
    try {
      const text = await transcribeRecording(a.file, { code, signal: ctrl.signal, done, onProgress: (p) => setTx((t) => ({ ...t, [id]: p })) });
      if (!text.trim()) { setTx((t) => ({ ...t, [id]: { stage: 'empty' } })); return; }
      const cur = verbatimRef.current;
      const next = cur.trim() ? `${cur.trimEnd()}\n\n${text}` : text;
      set('verbatim', next);
      setMachineText(next);
      setTx((t) => ({ ...t, [id]: { stage: 'done' } }));
      textRef.current?.focus();
    } catch (e) {
      const err = e instanceof TranscribeError ? e : new TranscribeError('failed');
      if (err.code === 'bad_code') {
        try { await store.setMeta({ testerCode: undefined }); } catch { /* ignore */ }
        setMetaState((m) => ({ ...m, testerCode: undefined }));
        setTx((t) => { const n = { ...t }; delete n[id]; return n; });
        setAsk({ fileId: id, codeError: true });
        return;
      }
      setTx((t) => ({ ...t, [id]: { stage: 'error', code: err.code, partial: err.done } }));
    } finally {
      if (controllers.current[id] === ctrl) delete controllers.current[id];
    }
  }

  // ---------- recording ----------
  // browser capability, read without an effect; false while rendering on the server
  const canRecord = useSyncExternalStore(
    noopSubscribe,
    () => !!(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined',
    () => false
  );
  const [rec, setRec] = useState<{ state: 'idle' | 'recording' | 'denied' | 'failed'; seconds: number }>({ state: 'idle', seconds: 0 });
  const recRef = useRef<{ mr: MediaRecorder; stream: MediaStream; timer: ReturnType<typeof setInterval> } | null>(null);
  useEffect(() => () => { const r = recRef.current; if (r) { clearInterval(r.timer); r.stream.getTracks().forEach((t) => t.stop()); } }, []);

  async function toggleRecording() {
    if (recRef.current) { recRef.current.mr.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      const started = new Date();
      mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      mr.onstop = async () => {
        const r = recRef.current;
        recRef.current = null;
        if (r) { clearInterval(r.timer); r.stream.getTracks().forEach((t) => t.stop()); }
        setRec({ state: 'idle', seconds: 0 });
        const type = mr.mimeType || 'audio/webm';
        const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        const hh = String(started.getHours()).padStart(2, '0'), mm = String(started.getMinutes()).padStart(2, '0');
        const blob = new Blob(chunks, { type });
        const sf = await toStoredFile(blob, `Recording ${todayIso(started)} ${hh}.${mm}.${ext}`, 'audio', await audioDuration(blob));
        setAttached((a) => [...a, { file: sf, url: objectUrl(sf), isNew: true }]);
      };
      const timer = setInterval(() => setRec((s) => ({ ...s, seconds: s.seconds + 1 })), 1000);
      recRef.current = { mr, stream, timer };
      mr.start();
      setRec({ state: 'recording', seconds: 0 });
    } catch (err) {
      const denied = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      setRec({ state: denied ? 'denied' : 'failed', seconds: 0 });
    }
  }

  // ---------- suggestions ----------
  const sugg = useMemo(() => suggest(word.verbatim, knownTags), [word.verbatim, knownTags]);
  const themeSugs = sugg.themes.filter((s) => !word.themes.includes(s.tag));
  const refSugs = sugg.scriptures.filter((s) => !word.scriptures.includes(s));
  const set = <K extends keyof Word>(k: K, v: Word[K]) => setWord((w) => ({ ...w, [k]: v }));
  const addTag = (raw: string) => { const t = normaliseTag(raw); if (t && !word.themes.includes(t)) set('themes', [...word.themes, t]); };
  const addRef = (raw: string) => { const r = raw.trim(); if (r && !word.scriptures.includes(r)) set('scriptures', [...word.scriptures, r]); };

  // ---------- date ----------
  const [y, m, d] = dateParts(word.dateGiven);
  function setDate(value: string, precision: DatePrecision) {
    setDateTouched(true);
    setWord((w) => ({ ...w, dateGiven: value, datePrecision: precision, dateNote: '' }));
  }
  function setPrecision(p: DatePrecision) {
    const yy = y || new Date().getFullYear(), mm = m || 1, dd = d || 1;
    setDate(p === 'year' ? iso(yy, 0, 0) : p === 'month' ? iso(yy, mm, 0) : iso(yy, mm, dd), p);
  }

  // ---------- save ----------
  async function onSave() {
    setError('');
    const verbatim = word.verbatim.replace(/\r\n/g, '\n').trim();
    const kept = attached.filter((a) => !removedIds.includes(a.file.id));
    if (!verbatim && !kept.length) {
      setError('Add the words, or attach a recording or photo, before saving.');
      textRef.current?.focus();
      return;
    }
    setSaving(true);
    try {
      for (const a of kept) if (a.isNew) await store.putFile(a.file);
      for (const id of removedIds) await store.deleteFile(id);
      const saved: Word = {
        ...word,
        verbatim,
        givenBy: word.givenBy.trim(),
        context: word.context.trim(),
        timeframe: word.timeframe.trim(),
        fileIds: kept.map((a) => a.file.id),
        // Spec §7c: an untouched machine draft stays "rough-auto"; any edit (or typed text) is the user's confirmed version.
        transcriptQuality: !verbatim ? 'none'
          : machineText !== null && verbatim === machineText.replace(/\r\n/g, '\n').trim() ? 'rough-auto'
            : loaded && verbatim === loaded.verbatim ? loaded.quality
              : 'verified',
        updatedAt: new Date().toISOString(),
      };
      await store.saveWord(saved);
      if (draft) {
        await store.deleteDraft(draft.id, true);
        if ((await store.listDrafts()).length) { router.push('/import?saved=1'); return; }
      }
      router.push(`/#w-${encodeURIComponent(saved.id)}`);
    } catch {
      setError('Saving failed. Everything you entered is still here; try again.');
      setSaving(false);
    }
  }

  const back = draft ? '/import' : '/';
  if (phase === 'missing') {
    return (
      <main className="page">
        <h1 className="page-title">This item isn&apos;t here any more</h1>
        <p className="muted">It may have been deleted or already saved.</p>
        <Link className="btn" href={back}>Go back</Link>
      </main>
    );
  }
  if (phase === 'loading') return <main className="page"><p className="muted" role="status">Loading…</p>{error && <p className="error" role="alert">{error}</p>}</main>;

  const aiMissing = ai !== null && (source === 'audio' ? !ai.transcription : source === 'image' ? !ai.photoText : false);
  return (
    <main className="page">
      <Link className="back" href={back}>← {draft ? 'Back to import' : 'Back to archive'}</Link>
      <h1 className="page-title">{editId ? 'Edit word' : draft ? 'Review imported item' : 'Add a word'}</h1>
      {draft && <p className="muted">{waiting > 0 ? `${waiting} more waiting after this one.` : 'This is the last item waiting.'}</p>}

      {!editId && !draft && (
        <div className="segmented" role="radiogroup" aria-label="How are you adding this word?">
          {(['audio', 'image', 'text'] as Source[]).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={source === s} className={source === s ? 'on' : ''} onClick={() => setSource(s)}>
              {SOURCE_LABEL[s]}
            </button>
          ))}
        </div>
      )}

      {source !== 'text' && (
        <section className="form-section" aria-labelledby="h-src">
          <h2 id="h-src" className="section-title">{source === 'audio' ? 'Recording' : 'Photos of notes or screenshots'}</h2>
          <div className="row">
            {source === 'audio' && canRecord && (
              <button type="button" className={rec.state === 'recording' ? 'btn btn-danger' : 'btn'} onClick={toggleRecording} aria-live="polite">
                {rec.state === 'recording' ? `Stop recording (${formatDuration(rec.seconds) || '0:00'})` : 'Record now'}
              </button>
            )}
            <label className="btn file-btn">
              {source === 'audio' ? 'Upload a recording' : 'Add photos'}
              <input
                type="file"
                className="visually-hidden"
                multiple
                accept={source === 'audio' ? 'audio/*,.m4a,.mp3,.wav,.aac,.ogg,.webm' : 'image/*,.heic,.heif'}
                onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }}
              />
            </label>
          </div>
          {source === 'audio' && !canRecord && <p className="hint">Recording in the browser isn&apos;t available here. Upload a file instead (for example from Voice Memos: Share → Save to Files).</p>}
          {rec.state === 'denied' && <p className="error" role="alert">Microphone access was blocked. Allow the microphone for this site in your browser settings, or upload a file instead.</p>}
          {rec.state === 'failed' && <p className="error" role="alert">Recording couldn&apos;t start in this browser. Upload a file instead.</p>}
          {fileError && <p className="error" role="alert">{fileError}</p>}
          {attached.length > 0 && (
            <ul className="attachments">
              {attached.map((a) => (
                <li key={a.file.id}>
                  {a.file.kind === 'audio'
                    ? <audio controls preload="metadata" src={a.url} aria-label={`Play ${a.file.name}`} />
                    // eslint-disable-next-line @next/next/no-img-element
                    : <img src={a.url} alt={`Attached photo ${a.file.name}`} />}
                  <span className="att-meta">{a.file.name} · {formatBytes(a.file.size)}{a.file.durationS ? ` · ${formatDuration(a.file.durationS)}` : ''}</span>
                  {a.file.kind === 'audio' && ai?.transcription && (
                    <TranscribeButton state={tx[a.file.id]} name={a.file.name} disabled={busyTx} onTranscribe={() => onTranscribe(a)} onStop={() => stopTranscribe(a.file.id)} />
                  )}
                  <button type="button" className="link" onClick={() => removeAttached(a)}>Remove</button>
                  {a.file.kind === 'audio' && tx[a.file.id] && (
                    <p className={tx[a.file.id].stage === 'error' ? 'error tx-status' : 'hint tx-status'} role="status" aria-live="polite">{txMessage(tx[a.file.id])}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="form-section">
        <label htmlFor="verbatim" className="section-title">The words, exactly as given</label>
        {aiMissing && (
          <p className="callout">
            {source === 'audio'
              ? 'Automatic transcription isn’t connected yet. Paste the transcript here. On iPhone: Voice Memos, open the recording, tap the transcript icon, then Copy.'
              : 'Reading text from photos isn’t connected yet. Type the words from the photo here.'}
          </p>
        )}
        {machineText !== null && (
          <p className="callout" role="note">Machine draft. Play the recording and correct anything it misheard. Keep the speaker&apos;s own wording.</p>
        )}
        {machineText === null && ai?.transcription && source === 'audio' && !word.verbatim.trim() && attached.some((a) => a.file.kind === 'audio') && (
          <p className="hint">Tap <strong>Transcribe</strong> on the recording to fill this in, or paste the transcript yourself.</p>
        )}
        <textarea id="verbatim" ref={textRef} rows={10} value={word.verbatim} onChange={(e) => set('verbatim', e.target.value)} aria-describedby="verbatim-hint" />
        <p className="hint" id="verbatim-hint">Keep the speaker&apos;s own wording, even if it&apos;s unpolished. Leave an empty line between paragraphs.</p>
      </section>

      <section className="form-section grid-2">
        <div className="field">
          <label htmlFor="given-by">Who spoke it</label>
          <input id="given-by" list="speakers" value={word.givenBy} onChange={(e) => set('givenBy', e.target.value)} aria-describedby="given-by-hint" autoComplete="off" />
          <datalist id="speakers">{knownSpeakers.map((s) => <option key={s} value={s} />)}</datalist>
          <p className="hint" id="given-by-hint">Leave it empty if you didn&apos;t get their name.</p>
        </div>
        <div className="field">
          <label htmlFor="date">When</label>
          <div className="row tight">
            <select aria-label="How precise is the date" value={word.datePrecision === 'approx' ? 'exact' : word.datePrecision} onChange={(e) => setPrecision(e.target.value as DatePrecision)}>
              <option value="exact">Exact day</option>
              <option value="month">Month only</option>
              <option value="year">Year only</option>
            </select>
            {word.datePrecision === 'year'
              ? <input id="date" type="number" min={1900} max={2100} value={y || ''} onChange={(e) => setDate(iso(+e.target.value || 0, 0, 0), 'year')} />
              : word.datePrecision === 'month'
                ? <input id="date" type="month" value={y ? `${y}-${String(m || 1).padStart(2, '0')}` : ''} onChange={(e) => { const [yy, mm] = e.target.value.split('-').map(Number); if (yy) setDate(iso(yy, mm || 1, 0), 'month'); }} />
                : <input id="date" type="date" value={y && m && d ? word.dateGiven : ''} onChange={(e) => e.target.value && setDate(e.target.value, 'exact')} />}
          </div>
          {word.dateNote && <p className="hint">Date {word.dateNote}. Check it.</p>}
        </div>
        <div className="field span-2">
          <label htmlFor="context">Context <span className="muted">(optional)</span></label>
          <input id="context" value={word.context} onChange={(e) => set('context', e.target.value)} aria-describedby="context-hint" />
          <p className="hint" id="context-hint">Only facts, for example the meeting or the place.</p>
        </div>
      </section>

      <section className="form-section" aria-labelledby="h-themes">
        <h2 id="h-themes" className="section-title">Themes</h2>
        <TagList items={word.themes} label="theme" onRemove={(t) => set('themes', word.themes.filter((x) => x !== t))} />
        {themeSugs.length > 0 && (
          <div className="suggestions">
            <p className="hint">Suggested from words in the text. Tap to add.</p>
            {themeSugs.map((s) => (
              <button key={s.tag} type="button" className="sugg" onClick={() => addTag(s.tag)} aria-label={`Add theme ${s.tag}, suggested because the text says "${s.because}"`}>
                + {s.tag} <span className="because">“{s.because}”</span>
              </button>
            ))}
          </div>
        )}
        <form className="row tight add-row" onSubmit={(e) => { e.preventDefault(); addTag(tagInput); setTagInput(''); }}>
          <label htmlFor="tag-input" className="visually-hidden">Add a theme</label>
          <input id="tag-input" list="known-tags" value={tagInput} onChange={(e) => setTagInput(e.target.value)} autoComplete="off" />
          <datalist id="known-tags">{knownTags.map((t) => <option key={t} value={t} />)}</datalist>
          <button className="btn" type="submit" disabled={!normaliseTag(tagInput)}>Add theme</button>
        </form>
      </section>

      <section className="form-section" aria-labelledby="h-refs">
        <h2 id="h-refs" className="section-title">Scripture the speaker cited</h2>
        <TagList items={word.scriptures} label="reference" onRemove={(r) => set('scriptures', word.scriptures.filter((x) => x !== r))} />
        {refSugs.length > 0 && (
          <div className="suggestions">
            <p className="hint">Found in the text. Tap to add.</p>
            {refSugs.map((r) => <button key={r} type="button" className="sugg" onClick={() => addRef(r)}>+ {r}</button>)}
          </div>
        )}
        <form className="row tight add-row" onSubmit={(e) => { e.preventDefault(); addRef(refInput); setRefInput(''); }}>
          <label htmlFor="ref-input" className="visually-hidden">Add a reference</label>
          <input id="ref-input" value={refInput} onChange={(e) => setRefInput(e.target.value)} autoComplete="off" />
          <button className="btn" type="submit" disabled={!refInput.trim()}>Add reference</button>
        </form>
        <p className="hint">Only references the speaker actually named, like Proverbs 3:5-6.</p>
      </section>

      <section className="form-section grid-2">
        <div className="field">
          <label htmlFor="timeframe">Timeframe in the word <span className="muted">(optional)</span></label>
          <input id="timeframe" value={word.timeframe} onChange={(e) => set('timeframe', e.target.value)} />
          {sugg.timeframe && sugg.timeframe !== word.timeframe.trim().toLowerCase() && (
            <p className="hint">The text says “{sugg.timeframe}”. <button type="button" className="link" onClick={() => set('timeframe', sugg.timeframe)}>Use it</button></p>
          )}
        </div>
        {editId && (
          <div className="field">
            <label htmlFor="status">Status</label>
            <select id="status" value={word.status} onChange={(e) => set('status', e.target.value as Status)}>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </div>
        )}
      </section>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <Link className="btn" href={back}>Cancel</Link>
        <button className="btn btn-primary" type="button" onClick={onSave} disabled={saving || rec.state === 'recording' || busyTx}>
          {saving ? 'Saving…' : busyTx ? 'Transcribing…' : 'Save word'}
        </button>
      </div>
      {ask && (
        <TranscribeDialog
          needConsent={!consentOk}
          needCode={!meta.testerCode || ask.codeError}
          codeError={ask.codeError}
          onConfirm={confirmAsk}
          onCancel={closeAsk}
        />
      )}
    </main>
  );
}

function TagList({ items, label, onRemove }: { items: string[]; label: string; onRemove: (v: string) => void }) {
  if (!items.length) return <p className="hint">None yet.</p>;
  return (
    <ul className="taglist">
      {items.map((t) => (
        <li key={t}>
          <span>{t}</span>
          <button type="button" onClick={() => onRemove(t)} aria-label={`Remove ${label} ${t}`}>×</button>
        </li>
      ))}
    </ul>
  );
}

function TranscribeButton({ state, name, disabled, onTranscribe, onStop }: { state: Tx | undefined; name: string; disabled: boolean; onTranscribe: () => void; onStop: () => void }) {
  if (state?.stage === 'preparing' || state?.stage === 'sending') return <button type="button" className="btn" onClick={onStop}>Stop</button>;
  if (state?.stage === 'error' && NO_RETRY.includes(state.code)) return null;
  const retry = state?.stage === 'error';
  return (
    <button type="button" className="btn btn-primary" onClick={onTranscribe} disabled={disabled} aria-label={`${retry ? 'Retry transcribing' : 'Transcribe'} ${name}`}>
      {retry ? 'Retry' : state?.stage === 'done' ? 'Transcribe again' : 'Transcribe'}
    </button>
  );
}
