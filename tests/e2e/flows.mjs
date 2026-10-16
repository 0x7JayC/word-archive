// End-to-end test of every v1 flow on the production build, in a headless browser (jsdom).
// This run has no AI keys, so it also checks that the app says transcription isn't connected and that nothing leaves the browser.
// Fictional data only. Run after `npm run build`:  node tests/e2e/flows.mjs
// No WebGL here, so the 3D view shows its fallback; the 3D code is tested separately.
import { btn, check, click, reporter, select, setFiles, sleep, startApp, text, type, unlabelled, waitFor } from './harness.mjs';

const { ok, finish } = reporter();
const SAMPLE = 'Keep going: the Lord will provide for you this season, as Proverbs 3:5-6 says. Your family will be blessed.';
const SECRET_WORDS = ['Keep going: the Lord will provide', 'Sample Speaker', 'Imported sample text', 'Photo sample words', 'My own reflection'];

const app = await startApp({ OPENROUTER_API_KEY: '', TESTER_CODE: '' });
const { requests } = app;
const open = app.open;

try {
  console.log('== 1. Welcome and consent ==');
  let p = await open('/');
  let { w, d } = p;
  ok(await waitFor(() => btn(d, 'Start my archive')), 'welcome screen shows');
  ok(/Demo mode/.test(text(d)) && /stored only in this browser/.test(text(d)) && /only if you tap Transcribe/.test(text(d)), 'demo mode and when a recording would leave the device are stated plainly');
  const start = btn(d, 'Start my archive');
  ok(start.disabled, 'Start is disabled until both boxes are ticked');
  const boxes = d.querySelectorAll('.consent input[type=checkbox]');
  check(w, boxes[0]); await sleep(30);
  ok(btn(d, 'Start my archive').disabled, 'still disabled with only the age box ticked');
  check(w, boxes[1]); await sleep(30);
  ok(!btn(d, 'Start my archive').disabled, 'enabled once both are ticked');
  click(w, btn(d, 'Start my archive'));
  ok(await waitFor(() => d.querySelector('.actionbar') && /No words yet/.test(text(d))), 'home opens with an empty-state message and the action bar');

  console.log('== 2. Add a text word with suggestions ==');
  click(w, btn(d, 'Add a word'));
  ok(await waitFor(() => w.location.pathname === '/add' && d.getElementById('verbatim')), '"Add a word" opens the form (client-side navigation)');
  ok(unlabelled(d).length === 0, 'every field on the form has a label' + (unlabelled(d).length ? ': ' + unlabelled(d).join(' | ') : ''));
  click(w, [...d.querySelectorAll('.segmented button')].find((b) => b.textContent === 'Text'));
  await sleep(30);
  ok(!d.querySelector('#h-src'), 'Text mode hides the file controls');
  type(w, d.getElementById('verbatim'), SAMPLE);
  ok(await waitFor(() => [...d.querySelectorAll('.sugg')].some((b) => /provision/.test(b.textContent))), 'theme suggestions appear as you type');
  const sugText = [...d.querySelectorAll('.sugg')].map((b) => b.textContent.replace(/\s+/g, ' ').trim());
  ok(sugText.some((s) => /provision “provide”/.test(s)) && sugText.some((s) => /family “family”/.test(s)), 'each suggestion shows the words that triggered it: ' + sugText.join(' | '));
  ok(sugText.includes('+ Proverbs 3:5-6'), 'explicit scripture reference is found');
  ok(/The text says “this season”/.test(text(d)), 'timeframe phrase is offered, not filled in');
  ok(d.querySelector('.taglist') === null && /None yet/.test(text(d)), 'nothing is tagged until you choose');
  click(w, [...d.querySelectorAll('.sugg')].find((b) => /provision/.test(b.textContent)));
  click(w, [...d.querySelectorAll('.sugg')].find((b) => /Proverbs/.test(b.textContent)));
  click(w, btn(d, 'Use it'));
  type(w, d.getElementById('tag-input'), 'Hope Filled');
  d.getElementById('tag-input').form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  type(w, d.getElementById('given-by'), 'Sample Speaker');
  await sleep(50);
  ok([...d.querySelectorAll('.taglist li span')].map((s) => s.textContent).join(',') === 'provision,hope-filled,Proverbs 3:5-6', 'chosen tags + typed tag (normalised) + reference');
  ok(d.getElementById('timeframe').value === 'this season', '"Use it" fills the timeframe');
  click(w, btn(d, 'Save word'));
  ok(await waitFor(() => w.location.pathname === '/' && d.querySelectorAll('.card').length === 1), 'saving returns to the archive with 1 card');
  ok(await waitFor(() => !d.getElementById('drawer').hidden && d.getElementById('d-speaker').textContent === 'Sample Speaker'), 'the new word opens in the reading panel');
  ok(unlabelled(d).length === 0, 'every control on the home page and reading panel has a label' + (unlabelled(d).length ? ': ' + unlabelled(d).join(' | ') : ''));
  ok(/Scripture cited: Proverbs 3:5-6/.test(text(d)) && /Timeframe: this season/.test(text(d)), 'panel shows the reference and timeframe');

  console.log('== 3. Status and reflection from the reading panel ==');
  select(w, d.getElementById('d-status'), 'fulfilled');
  ok(await waitFor(() => d.getElementById('d-status') && d.getElementById('d-status').value === 'fulfilled' && /1 fulfilled/.test(d.getElementById('meta').textContent)), 'status change is saved (header: ' + (d.getElementById('meta') || {}).textContent + ')');
  type(w, d.getElementById('d-refl-text'), 'My own reflection about this.');
  d.querySelector('form[data-act-form="reflect"]').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  ok(await waitFor(() => /My own reflection about this\./.test(d.getElementById('d-body').textContent)), 'reflection saved and shown in the panel');
  ok(/My own reflection about this\./.test(d.getElementById('refl').textContent), 'reflection listed under "My reflections"');

  console.log('== 4. Edit ==');
  click(w, d.querySelector('[data-act="edit"]'));
  ok(await waitFor(() => w.location.pathname === '/add' && d.getElementById('given-by') && d.getElementById('given-by').value === 'Sample Speaker'), 'edit opens the form pre-filled');
  ok(d.getElementById('status').value === 'fulfilled', 'status is editable in the form too');
  type(w, d.getElementById('given-by'), 'Sample Speaker Two');
  await sleep(30);
  click(w, btn(d, 'Save word'));
  ok(await waitFor(() => w.location.pathname === '/' && d.getElementById('d-speaker') && d.getElementById('d-speaker').textContent === 'Sample Speaker Two'), 'edit is saved');
  ok(/My own reflection/.test(d.getElementById('d-body').textContent), 'reflections survive an edit');

  console.log('== 5. Recording upload, date from the file name, audio-only word ==');
  click(w, btn(d, 'Add a word'));
  ok(await waitFor(() => d.getElementById('h-src')), 'form opens in Recording mode by default');
  const audio = new w.File([new Uint8Array([0, 1, 2, 3, 4])], '15 Mar, 10.05_ sample memo.m4a', { type: 'audio/mp4' });
  setFiles(w, d.querySelector('input[type=file]'), [audio]);
  ok(await waitFor(() => d.querySelectorAll('.attachments li').length === 1, 8000), 'recording attached');
  ok(/year inferred as/.test(text(d)), 'date read from the Voice Memos name, and it says the year was inferred');
  ok(await waitFor(() => /Automatic transcription isn’t connected yet/.test(text(d))), 'the form says transcription is not connected and what to do instead');
  click(w, btn(d, 'Save word'));
  ok(await waitFor(() => w.location.pathname === '/' && d.querySelectorAll('.card').length === 2), 'audio-only word saved (2 cards)');
  ok(await waitFor(() => d.querySelector('#d-body audio')), 'its panel has an audio player');
  ok(/Words not added yet/.test(d.getElementById('d-body').textContent), 'panel says the words are missing and how to add them');
  ok([...d.querySelectorAll('.card')].some((c) => /Recording only\. Words not added yet\./.test(c.textContent)), 'its timeline card says it is a recording without words yet');

  console.log('== 6. Delete one word ==');
  click(w, d.querySelector('[data-act="delete"]'));
  ok(await waitFor(() => d.querySelector('.dialog')), 'delete asks for confirmation');
  click(w, btn(d, 'Delete word'));
  ok(await waitFor(() => d.querySelectorAll('.card').length === 1 && !d.querySelector('.dialog')), 'word deleted');
  ok(p.errors.length === 0, 'no script errors so far' + (p.errors.length ? ': ' + p.errors.slice(0, 3).join(' / ') : ''));
  p.close();

  console.log('== 7. Bulk import ==');
  p = await open('/import');
  ({ w, d } = p);
  ok(await waitFor(() => /Nothing waiting/.test(text(d))), 'import page opens (data kept across page loads)');
  ok(unlabelled(d).length === 0, 'import controls are labelled');
  const files = [
    new w.File(['Imported sample text for review.'], '2024-05-02 note.txt', { type: 'text/plain' }),
    new w.File([new Uint8Array([137, 80, 78, 71])], 'IMG_20230115_101010.png', { type: 'image/png' }),
    new w.File(['%PDF'], 'contract.pdf', { type: 'application/pdf' }),
  ];
  setFiles(w, d.querySelector('input[type=file]'), files);
  ok(await waitFor(() => /2 waiting to be reviewed/.test(text(d))), '2 of 3 files queued');
  ok(/contract\.pdf: not a recording, photo or text file/.test(text(d)), 'the unsupported file is named with the reason');
  ok(/15 January 2023/.test(text(d)) && /2 May 2024/.test(text(d)), 'dates read from both file names');
  ok([...d.querySelectorAll('.q-name')].map((n) => n.textContent).join(' | ') === 'IMG_20230115_101010.png | 2024-05-02 note.txt', 'queue is ordered oldest first by the date in the name');
  click(w, btn(d, 'Review next'));
  ok(await waitFor(() => w.location.pathname === '/add' && /Review imported item/.test(text(d)) && d.querySelector('.attachments img')), 'review opens the oldest item (the 2023 photo) with its image');
  ok(/1 more waiting after this one/.test(text(d)), 'it says how many are left');
  ok(await waitFor(() => /Reading text from photos isn’t connected yet/.test(text(d))), 'photo mode explains reading text is not connected');
  ok(d.getElementById('date').value === '2023-01-15', 'date taken from the photo name');
  type(w, d.getElementById('verbatim'), 'Photo sample words.');
  await sleep(30);
  click(w, btn(d, 'Save word'));
  ok(await waitFor(() => w.location.pathname === '/import' && /1 waiting to be reviewed/.test(text(d))), 'after saving, back to the list with 1 left');
  click(w, btn(d, 'Review next'));
  ok(await waitFor(() => /This is the last item waiting/.test(text(d)) && d.getElementById('verbatim').value === 'Imported sample text for review.'), 'the text file is pre-filled with its content');
  click(w, btn(d, 'Save word'));
  ok(await waitFor(() => w.location.pathname === '/' && d.querySelectorAll('.card').length === 3), 'last item saved; archive now has 3 words');
  ok(p.errors.length === 0, 'no script errors in import' + (p.errors.length ? ': ' + p.errors.slice(0, 3).join(' / ') : ''));
  p.close();

  console.log('== 8. My data: export and delete everything ==');
  p = await open('/data');
  ({ w, d } = p);
  ok(await waitFor(() => /3 words · 1 file(?!s)/.test(text(d))), 'counts: 3 words, 1 file (the recording went with its deleted word)');
  click(w, btn(d, 'Export as zip'));
  ok(await waitFor(() => /Exported 3 words to word-archive-export-/.test(text(d))), 'export creates the zip');
  click(w, btn(d, 'Delete everything'));
  ok(await waitFor(() => d.querySelector('.dialog')), 'delete-everything dialog opens');
  const confirmBtn = () => [...d.querySelectorAll('.dialog button')].find((b) => b.textContent === 'Delete everything');
  ok(confirmBtn().disabled, 'confirm stays disabled until DELETE is typed');
  type(w, d.getElementById('dialog-type'), 'delete');
  await sleep(30);
  ok(!confirmBtn().disabled, 'typing it enables the button');
  click(w, confirmBtn());
  ok(await waitFor(() => btn(d, 'Start my archive')), 'everything wiped; back to the welcome screen');
  ok(p.errors.length === 0, 'no script errors in My data' + (p.errors.length ? ': ' + p.errors.slice(0, 3).join(' / ') : ''));
  p.close();

  console.log('== 9. Privacy: nothing leaves the browser ==');
  const leaked = SECRET_WORDS.filter((s) => app.log.includes(s) || requests.some((r) => (r.url + String(r.body || '')).includes(s)));
  ok(leaked.length === 0, 'no content in any request or in the server log' + (leaked.length ? ': ' + leaked : ''));
  const nonGet = requests.filter((r) => r.method !== 'GET');
  ok(nonGet.length === 0, `the app only ever read from the server (${requests.length} requests, all GET)`);

  console.log('== 10. Transcription is off and fails closed without keys ==');
  const status = await (await fetch(app.base + '/api/ai/status')).json();
  ok(status.transcription === false, 'status reports transcription as not connected');
  const res = await fetch(app.base + '/api/ai/transcribe', { method: 'POST', headers: { 'X-Tester-Code': 'anything', 'X-Audio-Format': 'wav' }, body: new Uint8Array([1, 2, 3]) });
  ok(res.status === 503 && (await res.json()).error === 'not_configured', 'the transcribe route refuses to work without a key and tester code');
} catch (e) {
  ok(false, 'test crashed: ' + (e && e.stack || e));
} finally {
  app.stop();
}
finish();
