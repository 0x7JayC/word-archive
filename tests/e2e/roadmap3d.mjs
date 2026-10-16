// The roadmap UI with the real Three.js r128 (only the GPU is stubbed): 3D starts, nothing covers the canvas,
// rotate / move / zoom work, clicking a word opens it, and the new reading-panel actions reach the host app.
// Fictional data only. Run: node tests/e2e/roadmap3d.mjs
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (p) => fs.readFileSync(root + p, 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

const shellSrc = read('lib/roadmap/shell.js');
const SHELL = JSON.parse(shellSrc.slice(shellSrc.indexOf('export const SHELL = ') + 21, shellSrc.lastIndexOf(';')));
const app = read('lib/roadmap/app.js')
  .replace("import * as THREE from 'three';", '')
  .replace("import { SHELL } from './shell.js';", '')
  .replace('export function mountRoadmap(', 'window.mountRoadmap = function mountRoadmap(');
const three = fs.readFileSync(root + 'node_modules/three/build/three.min.js', 'utf8');
const css = read('app/roadmap.css') + read('app/globals.css');

const rec = (id, date, label, short, by, themes, text, media = []) => ({
  id, date, day: Math.round(Date.parse(date) / 864e5), label, short, date_note: '', given_by: by, context: '', status: 'pending',
  themes, scriptures: [], timeframe: '', transcript_quality: 'verified', audio: '', recording: false, media,
  paragraphs: [text], excerpt: text, reflections: [],
});
const WORDS = [
  rec('w1', '2023-01-15', '15 January 2023', '15 Jan 2023', 'Sample Speaker A', ['calling', 'peace'], 'First fictional word.', [{ kind: 'audio', url: 'blob:x/1', name: 'a.m4a' }, { kind: 'image', url: 'blob:x/2', name: 'p.png' }]),
  rec('w2', '2024-06-01', '1 June 2024', '1 Jun 2024', 'Sample Speaker B', ['calling'], 'Second fictional word.'),
  rec('w3', '2024-06-04', '4 June 2024', '4 Jun 2024', 'Sample Speaker C', ['provision'], 'Third fictional word.'),
];

const errors = [];
const dom = new JSDOM(`<!doctype html><html><head><style>${css}</style></head><body><div id="root"></div>
<script>${three}</script>
<script>THREE.WebGLRenderer=function(){this.setPixelRatio=function(){};this.setSize=function(){};this.dispose=function(){};this.render=function(s,c){s.updateMatrixWorld();c.updateMatrixWorld();};};</script>
<script>var SHELL = ${JSON.stringify(SHELL).replace(/<\//g, '<\\/')};</script>
<script>${app}</script></body></html>`, {
  url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true,
  beforeParse(w) {
    w.HTMLCanvasElement.prototype.getContext = () => ({ createRadialGradient: () => ({ addColorStop() {} }), createLinearGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: '' });
    Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { get() { return this.id === 'sky' ? 1200 : 900; } });
    Object.defineProperty(w.HTMLElement.prototype, 'clientHeight', { get() { return this.id === 'sky' ? 700 : 500; } });
    w.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1200, height: 700 });
    w.addEventListener('error', (e) => errors.push(e.message));
  },
});
const w = dom.window, d = w.document;
const fire = (el, type, o = {}) => el.dispatchEvent(new w.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, button: 0 }, o)));
const pos = (el) => { const m = el.style.transform.match(/translate\(([-\d.]+)px,([-\d.]+)px\)/); return [+m[1], +m[2]]; };

const actions = [];
const destroy = w.mountRoadmap(d.getElementById('root'), WORDS, '', { onAction: (a) => actions.push(a) });
await sleep(300);
const cs = (el) => w.getComputedStyle(el);
const blockers = [...d.getElementById('sky').children].filter((el) => el.id !== 'sky-canvas' && el.id !== 'sky-ctrl' && cs(el).display !== 'none' && cs(el).pointerEvents !== 'none');
ok(d.getElementById('sky-fallback').hidden && blockers.length === 0, '3D view started and nothing covers the canvas');
ok(d.querySelector('.top h1').textContent === 'Word Archive', 'header shows the app name');

const cv = d.getElementById('sky-canvas');
const labels = [...d.querySelectorAll('.lbl-word')];
const A = labels[0];
let a0 = pos(A);
fire(cv, 'pointerdown', { clientX: 600, clientY: 350 }); fire(cv, 'pointermove', { clientX: 760, clientY: 350 }); fire(cv, 'pointerup', { clientX: 760, clientY: 350 });
await sleep(80);
ok(Math.abs(pos(A)[0] - a0[0]) > 20, 'drag rotates');
a0 = pos(A);
fire(cv, 'pointerdown', { clientX: 600, clientY: 350, shiftKey: true }); fire(cv, 'pointermove', { clientX: 700, clientY: 350, shiftKey: true }); fire(cv, 'pointerup', { clientX: 700, clientY: 350, shiftKey: true });
await sleep(80);
ok(pos(A)[0] - a0[0] > 60, 'Shift + drag moves');
fire(d.getElementById('z-reset'), 'click');
await sleep(900);

const target = labels.find((l) => l.textContent.startsWith('Sample Speaker A'));
const [x, y] = pos(target);
fire(cv, 'pointerdown', { clientX: x, clientY: y + 16 }); fire(cv, 'pointerup', { clientX: x, clientY: y + 16 });
await sleep(40);
ok(!d.getElementById('drawer').hidden && d.getElementById('d-speaker').textContent === 'Sample Speaker A', 'clicking a word in 3D opens it');
ok(d.querySelector('#d-body audio') && d.querySelectorAll('#d-body .d-photos img').length === 1, 'panel shows the recording player and the photo');
ok(/Photo 1 of 1 for the word from Sample Speaker A/.test(d.querySelector('.d-photos img').alt), 'photo has a descriptive alt text');

const sel = d.getElementById('d-status');
Object.getOwnPropertyDescriptor(w.HTMLSelectElement.prototype, 'value').set.call(sel, 'unfolding');
sel.dispatchEvent(new w.Event('change', { bubbles: true }));
const ta = d.getElementById('d-refl-text');
Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype, 'value').set.call(ta, 'A fictional reflection');
d.querySelector('form[data-act-form="reflect"]').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
d.querySelector('form[data-act-form="reflect"]').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
fire(d.querySelector('[data-act="edit"]'), 'click');
fire(d.querySelector('[data-act="delete"]'), 'click');
ok(JSON.stringify(actions) === JSON.stringify([
  { type: 'status', id: 'w1', status: 'unfolding' },
  { type: 'reflect', id: 'w1', text: 'A fictional reflection' },
  { type: 'reflect', id: 'w1', text: 'A fictional reflection' },
  { type: 'edit', id: 'w1' },
  { type: 'delete', id: 'w1' },
]), 'status, reflection, edit and delete reach the app with the right word: ' + actions.map((a) => a.type).join(', '));
Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype, 'value').set.call(ta, '   ');
d.querySelector('form[data-act-form="reflect"]').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
ok(actions.length === 5, 'an empty reflection is not sent');
ta.focus();
ta.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); // a real key press targets the focused field
ok(d.getElementById('d-speaker').textContent === 'Sample Speaker A', 'arrow keys do not jump to the next word while typing a reflection');
d.getElementById('d-close').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
ok(d.getElementById('d-speaker').textContent === 'Sample Speaker B', 'arrow keys still move to the next word when not typing');
d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
await sleep(400);
ok(d.getElementById('drawer').hidden, 'Esc closes the panel');

destroy();
ok(d.getElementById('root').innerHTML === '', 'unmount removes the UI');
fire(d.body, 'click');
ok(errors.length === 0, 'no script errors' + (errors.length ? ': ' + errors.join(' / ') : ''));
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
