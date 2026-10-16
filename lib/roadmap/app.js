/* Roadmap UI owned by Word Archive (forked from Prophetic Words, 29 Sep 2026). Edit here. */
import * as THREE from 'three';
import { SHELL } from './shell.js';

export function mountRoadmap(container, WORDS_IN, UPDATED, OPTS) {
  var dead = false, cleanups = [];
  var ACT = (OPTS && OPTS.onAction) || function () {};
  function on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    cleanups.push(function () { target.removeEventListener(type, fn, opts); });
  }
  function track(observer) { cleanups.push(function () { observer.disconnect(); }); return observer; }
  container.innerHTML = SHELL;


  var WORDS = WORDS_IN || [];
  var STATUS = {
    pending:   { label: 'Pending',   color: '#e2b45a' },
    unfolding: { label: 'Unfolding', color: '#6fa8dc' },
    fulfilled: { label: 'Fulfilled', color: '#6cc08b' },
    unclear:   { label: 'Unclear',   color: '#8a93a6' }
  };
  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  var state = { theme: null, open: -1 };
  var sky = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function rich(t) {
    return esc(t).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
  }
  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function st(w) { return STATUS[w.status] || STATUS.pending; }
  function badge(w) {
    var s = st(w);
    return '<span class="badge" style="color:' + s.color + ';background:' + hexA(s.color, 0.14) + '">' + s.label + '</span>';
  }
  function has(w, t) { return (w.themes || []).indexOf(t) !== -1; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  var themeMap = {};
  WORDS.forEach(function (w, i) {
    (w.themes || []).forEach(function (t) { (themeMap[t] = themeMap[t] || []).push(i); });
  });
  var THEMES = Object.keys(themeMap).sort(function (a, b) {
    return themeMap[b].length - themeMap[a].length || a.localeCompare(b);
  });

  function tagsHtml(list, max) {
    list = list || [];
    var out = list.slice(0, max).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('');
    if (list.length > max) out += '<span class="tag">+' + (list.length - max) + '</span>';
    return out;
  }

  /* ---------- header ---------- */
  function renderMeta() {
    var speakers = {}, counts = {};
    WORDS.forEach(function (w) { speakers[w.given_by] = 1; counts[w.status] = (counts[w.status] || 0) + 1; });
    var parts = [plural(WORDS.length, 'word', 'words'), plural(Object.keys(speakers).length, 'speaker', 'speakers'), plural(THEMES.length, 'theme', 'themes')];
    Object.keys(STATUS).forEach(function (k) { if (counts[k]) parts.push(counts[k] + ' ' + STATUS[k].label.toLowerCase()); });
    if (UPDATED) parts.push(UPDATED);
    $('meta').textContent = parts.join(' · ');
  }

  /* ---------- filter ---------- */
  function chipHtml(t, label, n) {
    return '<button class="chip" type="button" data-theme="' + esc(t) + '" aria-pressed="' + (state.theme === (t || null)) + '">' +
      esc(label) + ' <span class="n">' + n + '</span></button>';
  }
  function renderFilters() {
    var html = chipHtml('', 'All', WORDS.length);
    THEMES.forEach(function (t) { html += chipHtml(t, t, themeMap[t].length); });
    $('filters').innerHTML = html;
  }
  function setTheme(t) {
    t = t || null;
    state.theme = (t && state.theme === t) ? null : t;
    applyFilter();
  }
  function applyFilter() {
    var t = state.theme;
    document.querySelectorAll('.chip[data-theme]').forEach(function (c) {
      c.setAttribute('aria-pressed', String((c.getAttribute('data-theme') || null) === t));
    });
    document.querySelectorAll('.card').forEach(function (c) {
      var m = !t || has(WORDS[+c.getAttribute('data-i')], t);
      c.classList.toggle('dim', !m);
      c.classList.toggle('match', !!t && m);
    });
    document.querySelectorAll('.th-row').forEach(function (r) {
      var on = r.getAttribute('data-theme') === t;
      r.classList.toggle('active', on);
      r.classList.toggle('dim', !!t && !on);
    });
    $('tl-note').textContent = t
      ? themeMap[t].length + ' of ' + plural(WORDS.length, 'word', 'words') + ' tagged "' + t + '"'
      : 'Drag or scroll sideways. Click a card to read.';
    if (sky) sky.refresh();
  }

  /* ---------- timeline ---------- */
  function groupByDate() {
    var groups = [];
    WORDS.forEach(function (w, i) {
      var g = groups[groups.length - 1];
      if (g && g.date === w.date) g.items.push(i);
      else groups.push({ date: w.date, day: w.day, label: w.label, items: [i] });
    });
    return groups;
  }
  function renderTimeline() {
    var inner = $('tl-inner');
    if (!WORDS.length) {
      $('tl').outerHTML = '<p class="empty">No words yet. Add your first word, or import what you already have.</p>';
      return;
    }
    var groups = groupByDate();
    var COL = window.innerWidth <= 640 ? 210 : 240;
    var PAD = 24, MIN = COL + 30, MAX = 720, PX = 0.6, xs = [];
    groups.forEach(function (g, k) {
      if (!k) { xs.push(PAD); return; }
      xs.push(xs[k - 1] + Math.max(MIN, Math.min((g.day - groups[k - 1].day) * PX, MAX)));
    });
    var maxN = Math.max.apply(null, groups.map(function (g) { return g.items.length; }));
    var html = '<div class="tl-axis"></div>';
    var y0 = new Date(groups[0].day * 864e5).getUTCFullYear();
    var y1 = new Date(groups[groups.length - 1].day * 864e5).getUTCFullYear();
    for (var y = y0 + 1; y <= y1; y++) {
      var jd = Date.UTC(y, 0, 1) / 864e5;
      for (var k = 1; k < groups.length; k++) {
        var a = groups[k - 1].day, b = groups[k].day;
        if (a < jd && jd <= b) {
          var x = xs[k - 1] + (jd - a) / Math.max(b - a, 1) * (xs[k] - xs[k - 1]);
          html += '<div class="tl-year" style="left:' + Math.round(x) + 'px"><span>' + y + '</span></div>';
          break;
        }
      }
    }
    groups.forEach(function (g, k) {
      var n = g.items.length;
      html += '<div class="tl-col" style="left:' + xs[k] + 'px"><span class="tl-dot"></span>' +
        '<div class="tl-date">' + esc(g.label) + (n > 1 ? ' <span>· ' + n + ' words</span>' : '') + '</div><div class="tl-cards">';
      g.items.forEach(function (i) {
        var w = WORDS[i];
        html += '<button class="card" type="button" data-i="' + i + '" aria-label="Read the word from ' + esc(w.given_by) + ', ' + esc(w.label) + '">' +
          '<span class="card-top"><span class="card-name">' + esc(w.given_by) + '</span>' + badge(w) + '</span>' +
          '<span class="card-ex">' + (w.excerpt ? esc(w.excerpt) : ((w.media || []).some(function (m) { return m.kind === 'audio'; }) ? 'Recording only. Words not added yet.' : (w.media || []).length ? 'Photo only. Words not added yet.' : 'Words not added yet.')) + '</span>' +
          '<span class="tags">' + tagsHtml(w.themes, 3) + '</span></button>';
      });
      html += '</div></div>';
    });
    inner.style.width = (xs[xs.length - 1] + COL + PAD) + 'px';
    inner.style.height = (92 + maxN * 128 + 20) + 'px';
    inner.innerHTML = html;
  }
  function wireTimeline() {
    var el = $('tl');
    if (!el) return;
    var down = false, moved = false, sx = 0, sl = 0;
    el.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      down = true; moved = false; sx = e.clientX; sl = el.scrollLeft;
    });
    on(window, 'pointerup', function () { down = false; el.classList.remove('drag'); });
    el.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dx = e.clientX - sx;
      if (Math.abs(dx) > 4) { moved = true; el.classList.add('drag'); }
      if (moved) el.scrollLeft = sl - dx;
    });
    el.addEventListener('click', function (e) {
      if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; return; }
      var c = e.target.closest('.card');
      if (c) openWord(+c.getAttribute('data-i'), c);
    }, true);
    el.addEventListener('dragstart', function (e) { e.preventDefault(); });
  }

  /* ---------- themes ---------- */
  function renderThemes() {
    if (!THEMES.length) { $('themes').innerHTML = '<p class="empty">No themes tagged yet.</p>'; return; }
    var html = '';
    THEMES.forEach(function (t) {
      var idx = themeMap[t];
      html += '<div class="th-row" data-theme="' + esc(t) + '"><button class="th-name" type="button" data-theme="' + esc(t) + '">' + esc(t) + '</button><div class="th-bar">';
      idx.forEach(function (i) {
        var w = WORDS[i], lab = w.given_by + ', ' + w.short;
        html += '<button class="seg" type="button" data-i="' + i + '" style="--c:' + st(w).color + '" title="' + esc(lab) + '" aria-label="Read the word from ' + esc(lab) + '"></button>';
      });
      html += '</div><span class="th-count">' + idx.length + '</span></div>';
    });
    $('themes').innerHTML = html;
  }

  /* ---------- reflections ---------- */
  function renderRefl() {
    var items = [];
    WORDS.forEach(function (w, i) { (w.reflections || []).forEach(function (r) { items.push({ r: r, i: i }); }); });
    items.sort(function (a, b) { return a.r < b.r ? 1 : a.r > b.r ? -1 : 0; });
    if (!items.length) {
      $('refl').innerHTML = '<p class="empty">No reflections yet. Open any word and write one under "My reflections".</p>';
      return;
    }
    $('refl').innerHTML = '<ul class="refl-list">' + items.map(function (x) {
      var w = WORDS[x.i];
      return '<li><div>' + esc(x.r) + '</div><button class="link" type="button" data-i="' + x.i + '">' + esc(w.given_by) + ', ' + esc(w.short) + '</button></li>';
    }).join('') + '</ul>';
  }

  /* ---------- reading panel ---------- */
  var lastFocus = null, hideTimer = null;
  // Safari (and others) refuse history.replaceState on file:// pages; the link is a nicety, never let it break anything
  function setUrl(url) { try { history.replaceState(null, '', url); } catch (err) { /* not allowed on this page */ } }
  function openWord(i, trigger) {
    if (i < 0 || i >= WORDS.length) return;
    state.open = i;
    if (trigger) lastFocus = trigger;
    renderDrawer();
    var d = $('drawer'), s = $('scrim');
    clearTimeout(hideTimer);
    d.hidden = false; s.hidden = false;
    requestAnimationFrame(function () { d.classList.add('open'); s.classList.add('open'); });
    document.body.style.overflow = 'hidden';
    $('d-close').focus({ preventScroll: true });
    document.querySelectorAll('.card').forEach(function (c) { c.classList.toggle('current', +c.getAttribute('data-i') === i); });
    setUrl('#w-' + encodeURIComponent(WORDS[i].id));
    if (sky) sky.refresh();
  }
  function closeDrawer() {
    var d = $('drawer'), s = $('scrim');
    if (d.hidden) return;
    d.classList.remove('open'); s.classList.remove('open');
    state.open = -1;
    document.body.style.overflow = '';
    var done = function () { d.hidden = true; s.hidden = true; };
    if (reduceMotion) done(); else hideTimer = setTimeout(done, 320);
    document.querySelectorAll('.card.current').forEach(function (c) { c.classList.remove('current'); });
    setUrl(location.pathname + location.search);
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
    if (sky) sky.refresh();
  }
  function renderDrawer() {
    var i = state.open, w = WORDS[i];
    var h = '<div class="d-date">' + esc(w.label) + (w.date_note ? ' <span class="d-note">(' + esc(w.date_note) + ')</span>' : '') + '</div>';
    h += '<h2 class="d-speaker" id="d-speaker">' + esc(w.given_by) + '</h2>';
    if (w.context) h += '<p class="d-ctx">' + esc(w.context) + '</p>';
    h += '<div class="d-fields"><label class="d-status"><span>Status</span><select id="d-status">' +
      Object.keys(STATUS).map(function (k) { return '<option value="' + k + '"' + (w.status === k ? ' selected' : '') + '>' + STATUS[k].label + '</option>'; }).join('') +
      '</select></label>';
    if (w.timeframe) h += '<span class="tag">Timeframe: ' + esc(w.timeframe) + '</span>';
    (w.scriptures || []).forEach(function (s) { h += '<span class="tag">Scripture cited: ' + esc(s) + '</span>'; });
    h += '</div>';
    h += '<div class="d-word">' + (w.paragraphs && w.paragraphs.length
      ? w.paragraphs.map(function (p) { return '<p>' + rich(p) + '</p>'; }).join('')
      : '<p class="muted">Words not added yet. Use "Edit this word" below to add them.</p>') + '</div>';
    if (w.transcript_quality === 'rough-auto') h += '<p class="d-warn">Rough machine transcript. Check it against the audio.</p>';
    var media = w.media || [];
    var audios = media.filter(function (m) { return m.kind === 'audio'; }), photos = media.filter(function (m) { return m.kind === 'image'; });
    if (audios.length) h += '<div class="d-sec"><h3>' + (audios.length > 1 ? 'Recordings' : 'Recording') + '</h3>' + audios.map(function (m) { return '<audio controls preload="metadata" src="' + esc(m.url) + '"></audio>'; }).join('') + '</div>';
    if (photos.length) h += '<div class="d-sec"><h3>' + (photos.length > 1 ? 'Photos' : 'Photo') + '</h3><div class="d-photos">' + photos.map(function (m, k) {
      return '<a href="' + esc(m.url) + '" target="_blank" rel="noopener"><img src="' + esc(m.url) + '" alt="Photo ' + (k + 1) + ' of ' + photos.length + ' for the word from ' + esc(w.given_by) + '"></a>';
    }).join('') + '</div></div>';
    if ((w.themes || []).length) {
      h += '<div class="d-sec"><h3>Themes</h3><div class="d-themes">' +
        w.themes.map(function (t) { return chipHtml(t, t, themeMap[t].length); }).join('') + '</div></div>';
    }
    var related = [];
    WORDS.forEach(function (o, j) {
      if (j === i) return;
      var shared = (w.themes || []).filter(function (t) { return has(o, t); });
      if (shared.length) related.push({ j: j, shared: shared });
    });
    related.sort(function (a, b) { return b.shared.length - a.shared.length || a.j - b.j; });
    h += '<div class="d-sec"><h3>Shares tags with</h3>' + (related.length
      ? '<ul class="rel-list">' + related.map(function (r) {
          var o = WORDS[r.j];
          return '<li><button class="rel" type="button" data-i="' + r.j + '"><span class="rel-name">' + esc(o.given_by) + '</span>' +
            '<span class="rel-date">' + esc(o.short) + '</span></button><span class="tags">' +
            r.shared.map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') + '</span></li>';
        }).join('') + '</ul>'
      : '<p class="muted">No other word shares a tag with this one yet.</p>') + '</div>';
    h += '<div class="d-sec"><h3>My reflections</h3>' + ((w.reflections || []).length
      ? '<ul class="refl-list">' + w.reflections.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>'
      : '<p class="muted">None yet.</p>') +
      '<form class="d-refl-form" data-act-form="reflect"><label for="d-refl-text">Add a reflection in your own words</label>' +
      '<textarea id="d-refl-text" rows="3"></textarea><button class="btn" type="submit">Save reflection</button></form></div>';
    h += '<div class="d-sec d-manage"><button class="btn" type="button" data-act="edit">Edit this word</button>' +
      '<button class="btn danger" type="button" data-act="delete">Delete this word</button></div>';
    $('d-body').innerHTML = h;
    $('d-body').scrollTop = 0;
    $('d-prev').disabled = i === 0;
    $('d-next').disabled = i === WORDS.length - 1;
    $('d-pos').textContent = (i + 1) + ' of ' + WORDS.length;
  }

  /* ---------- 3D constellation ---------- */
  function skyFallback(msg) {
    var f = $('sky-fallback');
    f.hidden = false; f.textContent = msg;
    $('sky-canvas').style.display = 'none';
    ['sky-legend', 'sky-hint', 'sky-ctrl'].forEach(function (id) { $(id).hidden = true; });
    return null;
  }
  function initSky() {
    var el = $('sky'), canvas = $('sky-canvas'), labelsEl = $('sky-labels');
    $('sky-hint').textContent = coarse
      ? 'Swipe sideways to rotate · Tap a word to read · Tap a theme to filter'
      : 'Drag to rotate · Click a word to read · Click a theme to filter';
    if (!WORDS.length) return skyFallback('No words yet. Your constellation appears here as you add words.');
    if (window.__threeFailed || typeof THREE === 'undefined') {
      return skyFallback('The 3D view needs an internet connection. Connect and reload this page. Everything below still works.');
    }
    var renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true }); }
    catch (err) { return skyFallback('This browser cannot show the 3D view. Everything below still works.'); }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    cleanups.push(function () { renderer.dispose(); });

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
    camera.position.set(0, 0, 20);
    var world = new THREE.Group();
    scene.add(world);
    var ICE = new THREE.Color('#c9d6ee'), GOLD = new THREE.Color('#e2b45a');

    // positions: x follows time (minimum gap between dates), same-day words fan out around the axis
    var groups = groupByDate(), gx = [0];
    for (var k = 1; k < groups.length; k++) {
      gx.push(gx[k - 1] + Math.max(2.4, Math.min((groups[k].day - groups[k - 1].day) / 150, 5)));
    }
    var span = gx[gx.length - 1], scale = span > 12 ? 12 / span : 1, wordPos = [];
    groups.forEach(function (g, k) {
      var x = (gx[k] - span / 2) * scale, n = g.items.length;
      g.items.forEach(function (i, j) {
        var a = (j / n) * Math.PI * 2 + 0.6, r = n > 1 ? 1.5 : 0;
        wordPos[i] = new THREE.Vector3(x, Math.sin(a) * r, Math.cos(a) * r);
      });
    });
    var themePos = {};
    THEMES.forEach(function (t, ti) {
      var c = new THREE.Vector3();
      themeMap[t].forEach(function (i) { c.add(wordPos[i]); });
      c.divideScalar(themeMap[t].length);
      var ang = ti * 2.399963, rad = 2.6 + (ti % 3) * 0.7;
      themePos[t] = new THREE.Vector3(c.x + Math.cos(ang) * 0.9, Math.sin(ang) * rad, Math.cos(ang) * rad * 0.8);
    });

    function glowTexture() {
      var c = document.createElement('canvas'); c.width = c.height = 128;
      var g = c.getContext('2d');
      var gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.25, 'rgba(255,255,255,0.5)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    }
    var glowTex = glowTexture(), pickables = [];

    var wordObjs = WORDS.map(function (w, i) {
      var col = new THREE.Color(st(w).color);
      var mesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 24), new THREE.MeshBasicMaterial({ color: col, transparent: true }));
      mesh.position.copy(wordPos[i]); world.add(mesh);
      var glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.set(1.5, 1.5, 1); glow.position.copy(wordPos[i]); world.add(glow);
      var hit = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.copy(wordPos[i]); hit.userData = { type: 'word', i: i }; world.add(hit); pickables.push(hit);
      return { mesh: mesh, glow: glow };
    });
    var themeObjs = {};
    THEMES.forEach(function (t) {
      var n = themeMap[t].length;
      var mesh = new THREE.Mesh(new THREE.SphereGeometry(0.07 + 0.035 * n, 16, 16), new THREE.MeshBasicMaterial({ color: ICE.clone(), transparent: true, opacity: 0.9 }));
      mesh.position.copy(themePos[t]); world.add(mesh);
      var hit = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.copy(themePos[t]); hit.userData = { type: 'theme', t: t }; world.add(hit); pickables.push(hit);
      themeObjs[t] = { mesh: mesh };
    });
    var edges = [];
    WORDS.forEach(function (w, i) {
      (w.themes || []).forEach(function (t) {
        var geo = new THREE.BufferGeometry().setFromPoints([wordPos[i], themePos[t]]);
        var line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: ICE.clone(), transparent: true, opacity: 0.16 }));
        world.add(line); edges.push({ line: line, i: i, t: t });
      });
    });

    // deep-space backdrop: nebula + galactic band (one shader sphere), twinkling stars, a rare shooting star
    var cosmos = new THREE.Group();
    scene.add(cosmos);
    var BAND = new THREE.Vector3(0.3, 0.9, 0.25).normalize();
    var skyMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uBand: { value: BAND } },
      vertexShader: [
        'varying vec3 vDir;',
        'void main() {',
        '  vDir = normalize(position);',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform float uTime;',
        'uniform vec3 uBand;',
        'varying vec3 vDir;',
        'float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }',
        'float noise(vec3 x) {',
        '  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);',
        '  return mix(mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),',
        '             mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);',
        '}',
        'float fbm(vec3 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return v; }',
        'void main() {',
        '  vec3 d = normalize(vDir);',
        '  float band = exp(-pow(dot(d, uBand) / 0.32, 2.0));',
        '  float n1 = fbm(d * 2.2 + vec3(0.0, 0.0, uTime * 0.004));',
        '  float n2 = fbm(d * 4.5 + vec3(5.2, 1.3, 2.8));',
        '  vec3 col = vec3(0.043, 0.059, 0.090);',
        '  col += vec3(0.10, 0.20, 0.42) * smoothstep(0.45, 0.85, n1) * 0.28;',
        '  col += vec3(0.05, 0.28, 0.32) * smoothstep(0.50, 0.90, n2) * 0.18;',
        '  col += vec3(0.42, 0.28, 0.12) * band * smoothstep(0.55, 0.95, n2) * 0.16;',
        '  col += vec3(0.55, 0.62, 0.80) * band * (0.035 + 0.07 * n1);',
        '  col *= 1.0 - band * smoothstep(0.55, 0.75, fbm(d * 7.0 + 3.0)) * 0.35;',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n'),
      side: THREE.BackSide,
      depthWrite: false
    });
    var skyMesh = new THREE.Mesh(new THREE.SphereGeometry(150, 48, 32), skyMat);
    skyMesh.renderOrder = -10;
    cosmos.add(skyMesh);

    var seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    function gauss() { return (rnd() + rnd() + rnd() - 1.5) / 1.5; }
    var bu = new THREE.Vector3().crossVectors(BAND, new THREE.Vector3(0, 0, 1)).normalize();
    var bv = new THREE.Vector3().crossVectors(BAND, bu).normalize();
    var NS = 2400, sPos = new Float32Array(NS * 3), sCol = new Float32Array(NS * 3), sSize = new Float32Array(NS), sPh = new Float32Array(NS);
    var tints = [[0.82, 0.87, 1.0], [0.68, 0.77, 1.0], [1.0, 0.9, 0.74], [1.0, 1.0, 1.0]];
    for (var p = 0; p < NS; p++) {
      var dir;
      if (p < NS * 0.45) { // denser along the galactic band
        var ang = rnd() * Math.PI * 2;
        dir = bu.clone().multiplyScalar(Math.cos(ang)).add(bv.clone().multiplyScalar(Math.sin(ang))).add(BAND.clone().multiplyScalar(gauss() * 0.22)).normalize();
      } else {
        var u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, q = Math.sqrt(1 - u * u);
        dir = new THREE.Vector3(q * Math.cos(th), u, q * Math.sin(th));
      }
      var R = 40 + rnd() * 70;
      sPos[p * 3] = dir.x * R; sPos[p * 3 + 1] = dir.y * R; sPos[p * 3 + 2] = dir.z * R;
      var tint = tints[Math.floor(rnd() * tints.length)], br = 0.35 + Math.pow(rnd(), 3) * 0.65;
      sCol[p * 3] = tint[0] * br; sCol[p * 3 + 1] = tint[1] * br; sCol[p * 3 + 2] = tint[2] * br;
      sSize[p] = rnd() < 0.015 ? 5 + rnd() * 3 : 1 + Math.pow(rnd(), 2) * 2.6;
      sPh[p] = rnd();
    }
    var starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    starGeo.setAttribute('aColor', new THREE.BufferAttribute(sCol, 3));
    starGeo.setAttribute('aSize', new THREE.BufferAttribute(sSize, 1));
    starGeo.setAttribute('aPhase', new THREE.BufferAttribute(sPh, 1));
    var starMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        uTwinkle: { value: reduceMotion ? 0 : 1 }
      },
      vertexShader: [
        'attribute vec3 aColor;',
        'attribute float aSize;',
        'attribute float aPhase;',
        'uniform float uTime;',
        'uniform float uPixelRatio;',
        'uniform float uTwinkle;',
        'varying vec3 vColor;',
        'varying float vAlpha;',
        'void main() {',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  vAlpha = 1.0 - uTwinkle * 0.45 * (0.5 + 0.5 * sin(uTime * (0.6 + aPhase * 1.7) + aPhase * 6.2831));',
        '  vColor = aColor;',
        '  gl_PointSize = min(aSize * uPixelRatio * (110.0 / -mv.z), 16.0);',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'varying vec3 vColor;',
        'varying float vAlpha;',
        'void main() {',
        '  float d = length(gl_PointCoord - vec2(0.5));',
        '  float a = smoothstep(0.5, 0.0, d);',
        '  gl_FragColor = vec4(vColor, a * a * vAlpha);',
        '}'
      ].join('\n'),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    cosmos.add(new THREE.Points(starGeo, starMat));

    var streakTex = (function () {
      var c = document.createElement('canvas'); c.width = 256; c.height = 16;
      var g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 256, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.85, 'rgba(220,230,255,0.55)');
      gr.addColorStop(1, 'rgba(255,255,255,1)');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 16);
      return new THREE.CanvasTexture(c);
    })();
    var streak = new THREE.Sprite(new THREE.SpriteMaterial({ map: streakTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    streak.scale.set(9, 0.12, 1);
    scene.add(streak);
    var shoot = null, nextShoot = 4000 + rnd() * 6000, lastT = 0;
    function updateCosmos(now) {
      var t = now / 1000;
      skyMat.uniforms.uTime.value = t;
      starMat.uniforms.uTime.value = t;
      var dt = lastT ? Math.min((now - lastT) / 1000, 0.05) : 0;
      lastT = now;
      if (reduceMotion) return;
      if (!shoot && now > nextShoot) {
        var a = -0.35 - rnd() * 0.5;
        shoot = { t: 0, life: 1.1, dir: new THREE.Vector3(Math.cos(a), Math.sin(a), 0) };
        streak.position.set(-30 + rnd() * 40, 8 + rnd() * 20, -60);
        streak.material.rotation = a;
      }
      if (shoot) {
        shoot.t += dt;
        var k = shoot.t / shoot.life;
        streak.position.addScaledVector(shoot.dir, dt * 55);
        streak.material.opacity = Math.sin(Math.min(k, 1) * Math.PI) * 0.8;
        if (k >= 1) { shoot = null; streak.material.opacity = 0; nextShoot = now + 9000 + rnd() * 9000; }
      }
    }

    // HTML labels
    var labels = [];
    WORDS.forEach(function (w, i) {
      var d = document.createElement('div');
      d.className = 'lbl lbl-word';
      d.innerHTML = esc(w.given_by) + '<small>' + esc(w.short) + '</small>';
      labelsEl.appendChild(d);
      labels.push({ el: d, obj: wordObjs[i].mesh, dy: -16, kind: 'word', i: i, prio: 1000 });
    });
    THEMES.forEach(function (t) {
      var d = document.createElement('div');
      d.className = 'lbl lbl-theme';
      d.innerHTML = esc(t) + '<b>' + themeMap[t].length + '</b>';
      labelsEl.appendChild(d);
      labels.push({ el: d, obj: themeObjs[t].mesh, dy: -10, kind: 'theme', t: t, prio: themeMap[t].length });
    });

    // interaction: drag = rotate, Shift/right-drag = move, pinch or Cmd/Ctrl + scroll = zoom
    var ROT0 = { x: 0.18, y: -0.35 };
    var rotX = ROT0.x, rotY = ROT0.y, velX = 0, velY = 0, zoom = 1, baseDist = 20, panX = 0, panY = 0;
    var dragging = false, mode = 'rotate', px = 0, py = 0, moved = 0, lastInteract = 0, hovered = null;
    var pointers = {}, pinch = null;
    var ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
    var ZMIN = 0.35, ZMAX = 2.2, PMAX = 16;
    var isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
    var toast = $('sky-toast'), toastTimer = null, toastShown = 0;
    toast.textContent = 'Pinch, or hold ' + (isMac ? '⌘' : 'Ctrl') + ' and scroll, to zoom';

    function showToast() {
      var now = Date.now();
      if (now - toastShown < 8000) return;
      toastShown = now;
      toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 1800);
    }
    function unitsPerPixel() {
      return 2 * camera.position.z * Math.tan(camera.fov * Math.PI / 360) / (el.clientHeight || 1);
    }
    function setZoom(z) { zoom = clamp(z, ZMIN, ZMAX); lastInteract = performance.now(); }
    function panBy(dx, dy) {
      var k = unitsPerPixel();
      panX = clamp(panX - dx * k, -PMAX, PMAX);
      panY = clamp(panY + dy * k, -PMAX, PMAX);
      lastInteract = performance.now();
    }
    function pick(e) {
      var r = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(mouse, camera);
      var hits = ray.intersectObjects(pickables, false);
      return hits.length ? hits[0].object.userData : null;
    }
    function sameHover(a, b) { return a === b || (a && b && a.type === b.type && a.i === b.i && a.t === b.t); }
    function pointerList() { return Object.keys(pointers).map(function (k) { return pointers[k]; }); }
    function pinchState() {
      var p = pointerList(), a = p[0], b = p[1];
      return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    }

    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    canvas.addEventListener('pointerdown', function (e) {
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (canvas.setPointerCapture && e.pointerId != null) { try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
      lastInteract = performance.now();
      if (pointerList().length === 2) {
        var s0 = pinchState();
        pinch = { d: s0.d, mx: s0.mx, my: s0.my, zoom: zoom };
        dragging = false; moved = 99;
        return;
      }
      dragging = true; moved = 0; px = e.clientX; py = e.clientY; velX = velY = 0;
      mode = (e.button === 2 || e.button === 1 || e.shiftKey) ? 'pan' : 'rotate';
    });
    canvas.addEventListener('pointermove', function (e) {
      if (pointers[e.pointerId]) pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (pinch && pointerList().length >= 2) {
        var s1 = pinchState();
        setZoom(pinch.zoom * pinch.d / s1.d);
        panBy(s1.mx - pinch.mx, s1.my - pinch.my);
        pinch.mx = s1.mx; pinch.my = s1.my;
        return;
      }
      if (dragging) {
        var dx = e.clientX - px, dy = e.clientY - py;
        px = e.clientX; py = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
        if (moved > 4) canvas.classList.add(mode === 'pan' ? 'panning' : 'dragging');
        if (mode === 'pan') { panBy(dx, dy); return; }
        velY = dx * 0.005; velX = dy * 0.005;
        rotY += velY; rotX = clamp(rotX + velX, -1.1, 1.1);
        lastInteract = performance.now();
      } else {
        var h = pick(e);
        if (!sameHover(h, hovered)) { hovered = h; canvas.classList.toggle('hovering', !!h); refresh(); }
      }
    });
    function endPointer(e, cancelled) {
      delete pointers[e.pointerId];
      if (pinch) { if (pointerList().length < 2) { pinch = null; dragging = false; } return; }
      if (!dragging) return;
      dragging = false; canvas.classList.remove('dragging'); canvas.classList.remove('panning');
      if (reduceMotion || mode === 'pan') velX = velY = 0;
      if (!cancelled && moved < 6 && e.button !== 2) {
        var h = pick(e);
        if (h && h.type === 'word') { exitFull(); openWord(h.i, canvas); }
        else if (h && h.type === 'theme') setTheme(h.t);
      }
    }
    canvas.addEventListener('pointerup', function (e) { endPointer(e, false); });
    canvas.addEventListener('pointercancel', function (e) { endPointer(e, true); });
    canvas.addEventListener('pointerleave', function () { if (!dragging && hovered) { hovered = null; canvas.classList.remove('hovering'); refresh(); } });
    canvas.addEventListener('wheel', function (e) {
      if (!(e.ctrlKey || e.metaKey || isFull())) { showToast(); return; } // plain scroll keeps scrolling the page
      e.preventDefault();
      setZoom(zoom * Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    }, { passive: false });
    $('z-in').addEventListener('click', function () { setZoom(zoom * 0.8); });
    $('z-out').addEventListener('click', function () { setZoom(zoom * 1.25); });
    $('z-reset').addEventListener('click', function () {
      zoom = 1; panX = panY = 0; rotX = ROT0.x; rotY = ROT0.y; velX = velY = 0; lastInteract = performance.now();
    });

    // full screen (native where allowed, otherwise a fixed overlay, e.g. iPhone Safari)
    var fullBtn = $('z-full');
    function nativeFull() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
    function isFull() { return nativeFull() === el || el.classList.contains('expanded'); }
    function hintText() {
      $('sky-hint').textContent = coarse
        ? 'Swipe to rotate · Two fingers to zoom and move · Tap a word to read'
        : 'Drag to rotate · Shift + drag to move · ' + (isFull() ? 'Scroll' : 'Pinch or ' + (isMac ? '⌘' : 'Ctrl') + ' + scroll') + ' to zoom · Click a word to read';
    }
    function syncFull() {
      fullBtn.textContent = isFull() ? 'Exit full screen' : 'Full screen';
      document.body.classList.toggle('sky-expanded', el.classList.contains('expanded'));
      hintText();
    }
    function fallbackExpand() { el.classList.add('expanded'); syncFull(); }
    function enterFull() {
      var req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (!req) { fallbackExpand(); return; }
      try {
        var p = req.call(el);
        if (p && p.catch) p.catch(fallbackExpand);
      } catch (err) { fallbackExpand(); }
      syncFull();
    }
    function exitFull() {
      if (nativeFull() === el) {
        var ex = document.exitFullscreen || document.webkitExitFullscreen;
        if (ex) { try { ex.call(document); } catch (err) { /* ignore */ } }
      }
      el.classList.remove('expanded');
      syncFull();
    }
    fullBtn.addEventListener('click', function () { if (isFull()) exitFull(); else enterFull(); });
    on(document, 'fullscreenchange', syncFull);
    on(document, 'webkitfullscreenchange', syncFull);
    on(document, 'keydown', function (e) {
      if (e.key === 'Escape' && el.classList.contains('expanded') && (!$('drawer') || $('drawer').hidden)) exitFull();
    });
    hintText();

    function refresh() {
      var t = state.theme, hi = hovered, f = state.open;
      function wordHot(i) {
        return (hi && hi.type === 'word' && hi.i === i) || f === i || (hi && hi.type === 'theme' && has(WORDS[i], hi.t));
      }
      function themeHot(th) {
        return t === th || (hi && hi.type === 'theme' && hi.t === th) || (hi && hi.type === 'word' && has(WORDS[hi.i], th)) || (f >= 0 && has(WORDS[f], th));
      }
      wordObjs.forEach(function (o, i) {
        var on = !t || has(WORDS[i], t), hot = wordHot(i);
        o.mesh.material.opacity = on ? 1 : 0.18;
        o.glow.material.opacity = on ? (hot ? 0.95 : 0.5) : 0.06;
        var sc = hot ? 2.2 : 1.5; o.glow.scale.set(sc, sc, 1);
      });
      THEMES.forEach(function (th) {
        var hot = themeHot(th), m = themeObjs[th].mesh.material;
        m.color.copy(hot ? GOLD : ICE);
        m.opacity = (t && !hot) ? 0.22 : 0.9;
      });
      edges.forEach(function (e) {
        var hot = (t && e.t === t) || (hi && ((hi.type === 'theme' && hi.t === e.t) || (hi.type === 'word' && hi.i === e.i))) || f === e.i;
        e.line.material.color.copy(hot ? GOLD : ICE);
        e.line.material.opacity = hot ? 0.75 : (t || f >= 0 ? 0.05 : 0.16);
      });
      labels.forEach(function (L) {
        var hot, dim;
        if (L.kind === 'word') { hot = wordHot(L.i); dim = !!t && !has(WORDS[L.i], t) && !hot; }
        else { hot = themeHot(L.t); dim = !!t && !hot; }
        L.el.classList.toggle('hot', !!hot);
        L.el.classList.toggle('dim', !!dim);
      });
    }

    var v = new THREE.Vector3();
    function placeLabels() {
      var w = el.clientWidth, h = el.clientHeight, taken = [];
      labels.forEach(function (L) {
        L.obj.getWorldPosition(v); v.project(camera);
        L.x = (v.x * 0.5 + 0.5) * w; L.y = (-v.y * 0.5 + 0.5) * h + L.dy; L.behind = v.z > 1;
        L.el.style.transform = 'translate(' + L.x.toFixed(1) + 'px,' + L.y.toFixed(1) + 'px) translate(-50%,-100%)';
        L.el.style.visibility = L.behind ? 'hidden' : 'visible';
        if (!L.w) { L.w = L.el.offsetWidth; L.h = L.el.offsetHeight; }
      });
      // most important first: highlighted, then words, then bigger themes; a label that would overlap a kept one fades out
      labels.slice().sort(function (a, b) {
        var ha = a.el.classList.contains('hot') ? 1 : 0, hb = b.el.classList.contains('hot') ? 1 : 0;
        return hb - ha || b.prio - a.prio;
      }).forEach(function (L) {
        if (L.behind) return;
        var box = { l: L.x - L.w / 2 - 3, r: L.x + L.w / 2 + 3, t: L.y - L.h - 2, b: L.y + 2 };
        var hit = L.w > 0 && taken.some(function (o) { return box.l < o.r && box.r > o.l && box.t < o.b && box.b > o.t; });
        L.el.classList.toggle('occluded', hit);
        if (!hit) taken.push(box);
      });
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { labels.forEach(function (L) { L.w = 0; }); });
    function resize() {
      var w = el.clientWidth || 1, h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      baseDist = clamp(8 / (Math.tan(Math.PI / 8) * camera.aspect) + 2, 14, 42);
    }
    if (window.ResizeObserver) track(new ResizeObserver(resize)).observe(el); else on(window, 'resize', resize);
    resize();
    camera.position.z = baseDist;

    var visible = true;
    if (window.IntersectionObserver) track(new IntersectionObserver(function (en) { visible = en[0].isIntersecting; })).observe(el);
    function frame(now) {
      if (dead) return;
      requestAnimationFrame(frame);
      if (!visible) return;
      if (!dragging) {
        velY *= 0.92; velX *= 0.92;
        rotY += velY; rotX = clamp(rotX + velX, -1.1, 1.1);
        if (!reduceMotion && state.open < 0 && !hovered && now - lastInteract > 2500) rotY += 0.0012;
      }
      world.rotation.set(rotX, rotY, 0);
      cosmos.rotation.set(rotX * 0.25, rotY * 0.25, 0);
      updateCosmos(now);
      camera.position.z += (baseDist * zoom - camera.position.z) * (reduceMotion ? 1 : 0.12);
      camera.position.x = panX; camera.position.y = panY;
      renderer.render(scene, camera);
      placeLabels();
    }
    refresh();
    requestAnimationFrame(frame);
    return { refresh: refresh };
  }

  /* ---------- wiring ---------- */
  on(document, 'click', function (e) {
    var chip = e.target.closest('.chip[data-theme]');
    if (chip) { setTheme(chip.getAttribute('data-theme')); return; }
    var name = e.target.closest('.th-name');
    if (name) { setTheme(name.getAttribute('data-theme')); return; }
    var seg = e.target.closest('.seg, .link, .rel');
    if (seg) { openWord(+seg.getAttribute('data-i'), seg); }
  });
  $('d-prev').addEventListener('click', function () { openWord(state.open - 1); });
  $('d-next').addEventListener('click', function () { openWord(state.open + 1); });
  $('d-close').addEventListener('click', closeDrawer);
  $('scrim').addEventListener('click', closeDrawer);
  on(document, 'keydown', function (e) {
    var dr = $('drawer');
    if (!dr || dr.hidden) return;
    if (e.key === 'Escape') closeDrawer();
    else if (e.key === 'ArrowLeft' && !/AUDIO|INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) openWord(state.open - 1);
    else if (e.key === 'ArrowRight' && !/AUDIO|INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) openWord(state.open + 1);
  });
  on(document, 'change', function (e) {
    if (e.target && e.target.id === 'd-status' && state.open >= 0) ACT({ type: 'status', id: WORDS[state.open].id, status: e.target.value });
  });
  on(document, 'submit', function (e) {
    var f = e.target && e.target.closest && e.target.closest('form[data-act-form="reflect"]');
    if (!f || state.open < 0) return;
    e.preventDefault();
    var ta = $('d-refl-text'), text = ta.value.trim();
    if (!text) { ta.focus(); return; }
    ACT({ type: 'reflect', id: WORDS[state.open].id, text: text });
  });
  on(document, 'click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('[data-act]');
    if (b && state.open >= 0) ACT({ type: b.getAttribute('data-act'), id: WORDS[state.open].id });
  });
  on(document, 'focusin', function (e) {
    var d = $('drawer');
    if (d && !d.hidden && d.classList.contains('open') && !d.contains(e.target)) $('d-close').focus({ preventScroll: true });
  });

  renderMeta();
  renderFilters();
  renderTimeline();
  wireTimeline();
  renderThemes();
  renderRefl();
  try { sky = initSky(); } catch (err) { sky = skyFallback('The 3D view could not start. Everything below still works.'); }
  applyFilter();
  requestAnimationFrame(function () { var tl = $('tl'); if (tl) tl.scrollLeft = tl.scrollWidth; });
  var m = location.hash.match(/^#w-(.+)$/);
  if (m) {
    var id = decodeURIComponent(m[1]);
    for (var i = 0; i < WORDS.length; i++) if (WORDS[i].id === id) { openWord(i, null); break; }
  }

  return function destroy() {
    dead = true;
    cleanups.forEach(function (f) { try { f(); } catch (err) { /* already gone */ } });
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (err) { /* ignore */ }
    container.innerHTML = '';
    document.body.style.overflow = '';
    document.body.classList.remove('sky-expanded');
  };
}
