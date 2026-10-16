// End-to-end test of transcription (spec §7c) on the production build, against a fake OpenRouter.
// Checks consent, tester code, privacy routing, the machine-draft label, rough-auto quality, errors and logs.
// Fictional data only. Run after `npm run build`:  node tests/e2e/transcribe.mjs
import http from 'node:http';
import { btn, click, freePort, onboard, reporter, setFiles, sleep, startApp, text, type, unlabelled, waitFor } from './harness.mjs';

const { ok, finish } = reporter();
const KEY = 'test-key-fictional';
const CODE = 'fictional-code';
const TRANSCRIPT = 'A fictional transcript: the Lord will provide for you in due time.';
const AUDIO_BYTES = [70, 105, 99, 116, 105, 111, 110, 97, 108]; // "Fictional"

// ---- fake OpenRouter ----
const received = [];
let mode = 'ok'; // 'ok' | 'no_route'
const mockPort = await freePort();
const mock = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    received.push({ path: req.url, auth: req.headers.authorization, body: raw ? JSON.parse(raw) : null });
    res.setHeader('Content-Type', 'application/json');
    if (req.headers.authorization !== `Bearer ${KEY}`) { res.statusCode = 401; return res.end(JSON.stringify({ error: { code: 401 } })); }
    if (mode === 'no_route') { res.statusCode = 404; return res.end(JSON.stringify({ error: { code: 404, message: 'No endpoints found matching your data policy' } })); }
    res.end(JSON.stringify({ text: TRANSCRIPT, usage: { seconds: 2, cost: 0.0001 } }));
  });
});
await new Promise((r) => mock.listen(mockPort, '127.0.0.1', r));

const app = await startApp({ OPENROUTER_API_KEY: KEY, TESTER_CODE: CODE, OPENROUTER_BASE_URL: `http://127.0.0.1:${mockPort}/api/v1` });
const memo = (w, name = '3 Feb, 09.15_ fictional memo.m4a') => new w.File([new Uint8Array(AUDIO_BYTES)], name, { type: 'audio/mp4' });
const dialog = (d) => d.querySelector('.dialog');

try {
  const status = await (await fetch(app.base + '/api/ai/status')).json();
  ok(status.transcription === true, 'status reports transcription as connected (key and tester code set)');

  console.log('== 1. First transcription: consent, tester code, privacy routing ==');
  const p = await app.open('/');
  const { w, d } = p;
  ok(await onboard(w, d), 'onboarded');
  click(w, btn(d, 'Add a word'));
  ok(await waitFor(() => d.getElementById('h-src')), 'form opens in Recording mode');
  ok(!/Automatic transcription isn’t connected yet/.test(text(d)), 'no "not connected" message when it is connected');
  setFiles(w, d.querySelector('input[type=file]'), [memo(w)]);
  ok(await waitFor(() => btn(d, 'Transcribe')), 'a Transcribe button appears next to the recording');
  ok(!/Automatic transcription isn’t connected yet/.test(text(d)), 'still no "not connected" message once the status has loaded');
  ok(/Tap Transcribe on the recording/.test(text(d)), 'the words box says how to fill it');
  const before = app.requests.filter((r) => r.method === 'POST').length;
  click(w, btn(d, 'Transcribe'));
  ok(await waitFor(() => dialog(d)), 'the first tap asks first');
  ok(/OpenRouter/.test(dialog(d).textContent) && /keep nothing/.test(dialog(d).textContent) && /Other people’s voices|Other people's voices/.test(dialog(d).textContent), 'the dialog says where it goes, that nothing is kept, and mentions other voices');
  ok(app.requests.filter((r) => r.method === 'POST').length === before, 'nothing was sent before agreeing');
  ok(unlabelled(d).length === 0, 'the tester code field has a label');
  const transcribeBtn = () => [...dialog(d).querySelectorAll('button')].find((b) => b.textContent === 'Transcribe');
  ok(transcribeBtn().disabled, 'Transcribe stays disabled until a code is entered');

  type(w, d.getElementById('tester-code'), 'wrong-code');
  await sleep(30);
  click(w, transcribeBtn());
  ok(await waitFor(() => dialog(d) && /That tester code isn’t right/.test(dialog(d).textContent)), 'a wrong code asks again with a clear message');
  ok(received.length === 0, 'a wrong code never reaches OpenRouter');

  type(w, d.getElementById('tester-code'), CODE);
  await sleep(30);
  click(w, transcribeBtn());
  ok(await waitFor(() => d.getElementById('verbatim').value === TRANSCRIPT), 'the transcript fills the words box exactly as returned');
  ok(/Machine draft/.test(text(d)) && /Transcribed\. Check the words below\./.test(text(d)), 'it is labelled as a machine draft to check');
  const sent = received.at(-1);
  ok(sent && sent.path === '/api/v1/audio/transcriptions' && sent.auth === `Bearer ${KEY}`, 'the server called OpenRouter with the key (the browser never sees it)');
  ok(sent && sent.body.provider && sent.body.provider.zdr === true && sent.body.provider.data_collection === 'deny', 'privacy routing sent: zero retention, no training');
  ok(sent && sent.body.model === 'mistralai/voxtral-mini-transcribe' && sent.body.temperature === 0, 'default model, temperature 0');
  ok(sent && sent.body.input_audio.format === 'm4a' && sent.body.input_audio.data === Buffer.from(AUDIO_BYTES).toString('base64'), 'the recording was sent unchanged (no Web Audio here, so the small file goes as it is)');
  ok(!app.requests.some((r) => JSON.stringify(r.headers).includes(KEY)), 'the API key never appears in a browser request');

  click(w, btn(d, 'Save word'));
  ok(await waitFor(() => w.location.pathname === '/' && d.querySelectorAll('.card').length === 1), 'saved');
  ok(await waitFor(() => /Rough machine transcript/.test(d.getElementById('d-body').textContent)), 'saved untouched, it is marked as a rough machine transcript');

  console.log('== 2. Second transcription: remembered, edited text becomes verified ==');
  click(w, btn(d, 'Add a word'));
  ok(await waitFor(() => d.getElementById('h-src')), 'form opens');
  type(w, d.getElementById('verbatim'), 'Typed first line.');
  setFiles(w, d.querySelector('input[type=file]'), [memo(w, 'second fictional memo.m4a')]);
  ok(await waitFor(() => btn(d, 'Transcribe')), 'Transcribe button shown');
  click(w, btn(d, 'Transcribe'));
  ok(await waitFor(() => d.getElementById('verbatim').value === `Typed first line.\n\n${TRANSCRIPT}`), 'no dialog the second time, and typed text is kept with the transcript after it');
  ok(!dialog(d), 'consent and code were remembered');
  type(w, d.getElementById('verbatim'), `Typed first line.\n\n${TRANSCRIPT.replace('fictional', 'corrected')}`);
  await sleep(30);
  click(w, btn(d, 'Save word'));
  ok(await waitFor(() => w.location.pathname === '/' && d.querySelectorAll('.card').length === 2), 'saved');
  ok(await waitFor(() => d.getElementById('d-body') && /corrected transcript/.test(d.getElementById('d-body').textContent) && !/Rough machine transcript/.test(d.getElementById('d-body').textContent)), 'an edited transcript is the user’s confirmed version');

  console.log('== 3. Provider has no private route: clear message, recording kept ==');
  mode = 'no_route';
  click(w, btn(d, 'Add a word'));
  ok(await waitFor(() => d.getElementById('h-src')), 'form opens');
  setFiles(w, d.querySelector('input[type=file]'), [memo(w, 'third fictional memo.m4a')]);
  ok(await waitFor(() => btn(d, 'Transcribe')), 'Transcribe button shown');
  click(w, btn(d, 'Transcribe'));
  ok(await waitFor(() => /Transcription is unavailable right now\. Your recording is still here/.test(text(d))), 'says it is unavailable and the recording is still here');
  ok(btn(d, 'Retry') && d.querySelectorAll('.attachments li').length === 1 && d.getElementById('verbatim').value === '', 'Retry offered, recording still attached, nothing inserted');
  mode = 'ok';
  click(w, btn(d, 'Retry'));
  ok(await waitFor(() => d.getElementById('verbatim').value === TRANSCRIPT), 'Retry works once the service is back');
  ok(p.errors.length === 0, 'no script errors' + (p.errors.length ? ': ' + p.errors.slice(0, 3).join(' / ') : ''));
  p.close();

  console.log('== 4. My data: withdraw permission ==');
  const q = await app.open('/data');
  ok(await waitFor(() => /you agreed to send recordings for transcription/.test(text(q.d))), 'My data shows the transcription permission');
  ok(/only on routes that keep nothing/.test(text(q.d)), 'My data says when and how a recording leaves the device');
  click(q.w, btn(q.d, 'Withdraw permission'));
  ok(await waitFor(() => /Permission withdrawn/.test(text(q.d)) && !btn(q.d, 'Withdraw permission')), 'permission withdrawn');
  q.close();
  const r = await app.open('/add');
  ok(await waitFor(() => r.d.getElementById('h-src')), 'form opens');
  setFiles(r.w, r.d.querySelector('input[type=file]'), [memo(r.w, 'fourth fictional memo.m4a')]);
  ok(await waitFor(() => btn(r.d, 'Transcribe')), 'Transcribe button shown');
  click(r.w, btn(r.d, 'Transcribe'));
  ok(await waitFor(() => r.d.querySelector('.dialog') && r.d.getElementById('tester-code')), 'after withdrawing, it asks again (consent and code)');
  r.close();

  console.log('== 5. Privacy ==');
  ok(!app.log.includes(TRANSCRIPT) && !app.log.includes('fictional memo') && !app.log.includes(Buffer.from(AUDIO_BYTES).toString('base64')), 'no transcript, file name or audio in the server log');
  ok(/\[transcribe\] unavailable model=mistralai\/voxtral-mini-transcribe/.test(app.log), 'the server log holds only the error code and model id');
  const posts = app.requests.filter((r) => r.method !== 'GET');
  ok(posts.length > 0 && posts.every((r) => r.url === '/api/ai/transcribe'), `the only thing the browser ever sent was audio to /api/ai/transcribe (${posts.length} POSTs)`);
  ok(!app.requests.some((r) => /fictional memo/.test(r.url + JSON.stringify(r.headers))), 'file names are never sent');
} catch (e) {
  ok(false, 'test crashed: ' + (e && e.stack || e));
} finally {
  app.stop();
  mock.close();
}
finish();
