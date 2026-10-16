// Shared harness for the end-to-end tests: starts the production build and opens pages in jsdom.
// jsdom lacks some browser pieces (IndexedDB, streams, object URLs, WebGL); they are supplied here.
import { spawn } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import net from 'node:net';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { JSDOM, VirtualConsole } from 'jsdom';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function reporter() {
  const r = { fails: 0 };
  r.ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) r.fails++; };
  r.finish = () => { console.log(r.fails ? `\n${r.fails} FAILED` : '\nALL PASSED'); process.exit(r.fails ? 1 : 0); };
  return r;
}

export const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });

/** Start `next start` with extra environment variables; returns helpers bound to that server. */
export async function startApp(env = {}) {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const app = { base, log: '', requests: [] };
  const server = spawn('npx', ['next', 'start', '-p', String(port)], { env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', ...env } });
  server.stdout.on('data', (d) => { app.log += d; });
  server.stderr.on('data', (d) => { app.log += d; });
  for (let i = 0; i < 80; i++) { try { await fetch(base + '/api/ai/status'); break; } catch { await sleep(250); } }

  const idb = new IDBFactory(); // one "browser profile" shared by every page load in this run
  let urlN = 0;
  app.open = async (path) => {
    const errors = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => { if (!/Could not parse CSS|Not implemented: (navigation|HTMLMediaElement|HTMLCanvasElement)/i.test(e.message)) errors.push(e.message); });
    vc.on('error', (...a) => { const m = a.map(String).join(' '); if (!/WebGL|Error creating WebGL/i.test(m)) errors.push(m); });
    const dom = await JSDOM.fromURL(base + path, {
      runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
      beforeParse(w) {
        w.fetch = (u, o) => {
          const url = new URL(u, w.location.href);
          app.requests.push({ url: url.pathname + url.search, method: (o && o.method) || 'GET', body: o && o.body, headers: (o && o.headers) || {} });
          // jsdom's ArrayBuffer/Uint8Array come from another realm; copy into Node's so the body is sent as bytes
          let body = o && o.body;
          if (body && typeof body === 'object' && typeof body.byteLength === 'number') body = new Uint8Array(new Uint8Array(body.buffer || body, body.byteOffset || 0, body.byteLength));
          // jsdom's AbortSignal is from another realm too and Node's fetch rejects it; pass a Node signal that follows it
          let signal = o && o.signal;
          if (signal) { const c = new AbortController(); if (signal.aborted) c.abort(); else signal.addEventListener('abort', () => c.abort(), { once: true }); signal = c.signal; }
          return fetch(url, o ? { ...o, body, signal } : o);
        };
        Object.defineProperty(w, 'crypto', { value: webcrypto });
        Object.assign(w, { TextEncoder, TextDecoder, ReadableStream, WritableStream, TransformStream, TextDecoderStream, TextEncoderStream, structuredClone, MessageChannel, indexedDB: idb, IDBKeyRange });
        w.URL.createObjectURL = () => `blob:${base}/test-${++urlN}`;
        w.URL.revokeObjectURL = () => {};
        w.HTMLCanvasElement.prototype.getContext = () => null;
        // jsdom 24's Blob lacks arrayBuffer()/text() (every current browser has them)
        const readAs = (blob, how) => new Promise((res, rej) => { const r = new w.FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r[how](blob); });
        if (!w.Blob.prototype.arrayBuffer) w.Blob.prototype.arrayBuffer = function () { return readAs(this, 'readAsArrayBuffer'); };
        if (!w.Blob.prototype.text) w.Blob.prototype.text = function () { return readAs(this, 'readAsText'); };
        Object.defineProperty(w.document, 'currentScript', { configurable: true, get() { const s = [...w.document.scripts].filter((x) => x.src && x.src.includes('/_next/')); return s[s.length - 1] || null; } });
        w.addEventListener('unhandledrejection', (e) => errors.push('unhandled rejection: ' + (e.reason && (e.reason.stack || e.reason.message) || e.reason)));
      },
    });
    const w = dom.window, d = w.document;
    return { dom, w, d, errors, close: () => w.close() };
  };
  app.stop = () => server.kill();
  return app;
}

export const waitFor = async (fn, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return true; } catch { /* keep waiting */ } await sleep(40); } return false; };
export const type = (w, el, v) => { const proto = el.tagName === 'TEXTAREA' ? w.HTMLTextAreaElement.prototype : w.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new w.Event('input', { bubbles: true })); };
export const click = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
export const check = (w, el) => { if (!el.checked) click(w, el); };
export const select = (w, el, v) => { Object.getOwnPropertyDescriptor(w.HTMLSelectElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new w.Event('change', { bubbles: true })); };
export const setFiles = (w, input, files) => { Object.defineProperty(input, 'files', { configurable: true, value: files }); input.dispatchEvent(new w.Event('change', { bubbles: true })); };
export const btn = (d, label) => [...d.querySelectorAll('button, a')].find((b) => b.textContent.trim() === label);
export const text = (d) => d.body.textContent.replace(/\s+/g, ' ');
/** Every form control must have a name a screen reader can announce (label, aria-label or aria-labelledby). */
export function unlabelled(d) {
  return [...d.querySelectorAll('input:not([type=hidden]), select, textarea')].filter((el) => {
    if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return false;
    if (el.id && d.querySelector(`label[for="${el.id}"]`)) return false;
    return !el.closest('label');
  }).map((el) => el.outerHTML.slice(0, 80));
}

/** Click through the welcome screen. */
export async function onboard(w, d) {
  await waitFor(() => btn(d, 'Start my archive'));
  const boxes = d.querySelectorAll('.consent input[type=checkbox]');
  check(w, boxes[0]); check(w, boxes[1]);
  await sleep(30);
  click(w, btn(d, 'Start my archive'));
  return waitFor(() => d.querySelector('.actionbar'));
}
