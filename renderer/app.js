// Claude Balloon — speak a task, a balloon carries it, it pops when done.
const $ = (id) => document.getElementById(id);
const sky = $('sky'), mic = $('mic'), hint = $('hint'), dirLabel = $('dirLabel');

// ---------- window interactivity: only .ia elements catch the mouse ----------
document.addEventListener('pointerover', (e) => window.balloon.setInteractive(!!e.target.closest('.ia')));
document.addEventListener('pointerout', (e) => { if (!e.relatedTarget) window.balloon.setInteractive(false); });

// ---------- task folder ----------
let cwd = localStorage.getItem('balloon-cwd') || '';
function short(p) { return p ? p.replace(/^\/Users\/[^/]+/, '~') : '~ (home)'; }
function applyDir() { dirLabel.textContent = short(cwd); }
dirLabel.addEventListener('contextmenu', pick);
dirLabel.addEventListener('click', pick);
async function pick(e) {
  e.preventDefault();
  const r = await window.balloon.pickFolder();
  if (r && r.path) { cwd = r.path; localStorage.setItem('balloon-cwd', cwd); applyDir(); }
}
applyDir();

// ---------- recording: 16kHz mono PCM straight from the mic ----------
// Amplitude drives the inflating balloon live; the WAV goes to whisper on release.
let audio = null; // { ctx, stream, node, chunks }
let inflating = null; // the balloon being blown up
let level = 0;

async function startRec() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
  const ctx = new AudioContext({ sampleRate: 16000 });
  const src = ctx.createMediaStreamSource(stream);
  const node = ctx.createScriptProcessor(4096, 1, 1);
  const chunks = [];
  node.onaudioprocess = (ev) => {
    const d = ev.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(d));
    let s = 0;
    for (let i = 0; i < d.length; i += 8) s += d[i] * d[i];
    level = Math.min(1, Math.sqrt(s / (d.length / 8)) * 9);
  };
  src.connect(node);
  node.connect(ctx.destination);
  audio = { ctx, stream, node, chunks };
}

function stopRec() {
  if (!audio) return null;
  const { ctx, stream, node, chunks } = audio;
  node.disconnect(); stream.getTracks().forEach((t) => t.stop()); ctx.close();
  audio = null; level = 0;
  const n = chunks.reduce((a, c) => a + c.length, 0);
  if (n < 4000) return null; // <0.25s — nothing said
  const pcm = new Float32Array(n);
  let o = 0; for (const c of chunks) { pcm.set(c, o); o += c.length; }
  return encodeWav(pcm, 16000);
}

function encodeWav(f32, rate) {
  const buf = new ArrayBuffer(44 + f32.length * 2);
  const v = new DataView(buf);
  const str = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + f32.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, f32.length * 2, true);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}

// ---------- balloons ----------
const COLORS = ['#ff8c94', '#8fd8cf', '#ffd479', '#9db4e8', '#c9a3e8', '#8fe3a4'];
let nextId = 1;
const balloons = new Map(); // id -> b

function makeBalloon(x, y, color) {
  const el = document.createElement('div');
  el.className = 'bal ia';
  el.style.setProperty('--bc', color);
  el.innerHTML = `<div class="body"></div><div class="string"></div><div class="tag"></div>`;
  sky.appendChild(el);
  const b = {
    id: nextId++, el, x, y, vx: 0, vy: 0,
    scale: 0.35, targetScale: 0.35,
    phase: Math.random() * Math.PI * 2,
    state: 'inflating', // inflating → floating → gone
    wiggle: 0, color,
    lines: [], consoleEl: null,
  };
  el.querySelector('.body').addEventListener('click', () => { if (b.state === 'floating') nudge(b); });
  el.querySelector('.body').addEventListener('dblclick', () => toggleConsole(b));
  balloons.set(b.id, b);
  return b;
}

// ---------- the little console: double-click a balloon to watch it work ----------
function toggleConsole(b) {
  if (b.consoleEl) { b.consoleEl.remove(); b.consoleEl = null; return; }
  const c = document.createElement('div');
  c.className = 'bcon ia';
  c.innerHTML = `<div class="bconHead"><span>watching the agent</span><span class="bconX">✕</span></div><div class="bconBody"></div>`;
  c.querySelector('.bconX').addEventListener('click', () => { c.remove(); b.consoleEl = null; });
  sky.appendChild(c);
  b.consoleEl = c;
  renderConsole(b);
}
function renderConsole(b) {
  if (!b.consoleEl) return;
  const body = b.consoleEl.querySelector('.bconBody');
  body.textContent = b.lines.length ? b.lines.slice(-40).join('\n') : 'waiting for the first step…';
  body.scrollTop = body.scrollHeight;
}
function logLine(b, line) {
  b.lines.push(line);
  if (b.lines.length > 200) b.lines.shift();
  renderConsole(b);
}

// ---------- knots: popped balloons leave a souvenir on the dock ----------
const knotsEl = $('knots');
let knots = [];
try { knots = JSON.parse(localStorage.getItem('balloon-knots') || '[]'); } catch {}
function tieKnot(b, ok, text) {
  knots.push({ task: b.task || '', text: (text || '').slice(0, 600), ok, color: b.color, cwd: b.cwd || '', at: Date.now() });
  knots = knots.slice(-12);
  localStorage.setItem('balloon-knots', JSON.stringify(knots));
  renderKnots();
}
function renderKnots() {
  knotsEl.innerHTML = '';
  for (const k of knots.slice(-8)) {
    const el = document.createElement('span');
    el.className = 'knot' + (k.ok ? '' : ' sad');
    el.style.setProperty('--bc', k.color);
    el.title = `${k.ok ? '🎉' : '💨'} ${k.task}`;
    el.addEventListener('click', () => dropCard(innerWidth / 2, innerHeight - 340, k.ok, `${k.task}\n\n${k.text}`, k.cwd));
    knotsEl.appendChild(el);
  }
}
renderKnots();

function nudge(b) { b.vx += (Math.random() - 0.5) * 6; b.vy -= 3; }

function popBalloon(b, ok, text) {
  const r = b.el.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  for (let i = 0; i < 16; i++) {
    const p = document.createElement('div');
    p.className = 'bit';
    p.style.setProperty('--bc', b.color);
    p.style.left = cx + 'px'; p.style.top = cy + 'px';
    const a = (i / 16) * Math.PI * 2, d = 40 + Math.random() * 80;
    p.style.setProperty('--fx', Math.cos(a) * d + 'px');
    p.style.setProperty('--fy', Math.sin(a) * d + 30 + 'px');
    sky.appendChild(p); setTimeout(() => p.remove(), 800);
  }
  b.el.remove(); balloons.delete(b.id); b.state = 'gone';
  dropCard(cx, cy, ok, text, b.cwd);
  tieKnot(b, ok, text);
}

function deflate(b, detail) {
  b.el.classList.add('err');
  b.state = 'gone'; balloons.delete(b.id);
  b.el.style.transition = 'top 1.4s ease-in, transform 1.4s, opacity 1.4s';
  requestAnimationFrame(() => {
    b.el.style.top = window.innerHeight - 60 + 'px';
    b.el.style.transform = 'translate(-50%,-50%) scale(.3) rotate(24deg)';
    b.el.style.opacity = '0';
  });
  setTimeout(() => b.el.remove(), 1500);
  dropCard(parseFloat(b.el.style.left), window.innerHeight - 220, false, detail, b.cwd);
  tieKnot(b, false, detail);
}

function dropCard(x, y, ok, text, dir) {
  const c = document.createElement('div');
  c.className = `card ia ${ok ? 'ok' : 'bad'}`;
  const cx = Math.max(170, Math.min(window.innerWidth - 170, x));
  const cy = Math.max(30, Math.min(window.innerHeight - 280, y));
  c.style.left = cx + 'px'; c.style.top = cy + 'px';
  c.innerHTML = `<div class="ct">${ok ? '🎉 done' : '💨 didn’t make it'}</div>
    <div class="cb"></div><div class="cx">${ok ? '<b class="rv">open the folder →</b> · ' : ''}click to dismiss</div>`;
  c.querySelector('.cb').textContent = text || '';
  const rv = c.querySelector('.rv');
  if (rv) rv.addEventListener('click', (ev) => { ev.stopPropagation(); window.balloon.reveal(dir || cwd || ''); });
  c.addEventListener('click', () => c.remove());
  sky.appendChild(c);
  if (ok) setTimeout(() => c.remove(), 30_000);
}

// ---------- physics ----------
function tick(ts) {
  for (const b of balloons.values()) {
    if (b.state === 'inflating') {
      const r = document.getElementById('nozzleTip').getBoundingClientRect();
      b.x = r.left + r.width / 2;
      b.y = r.top - 46 - b.scale * 52;
      b.targetScale = Math.min(1.6, b.targetScale + level * 0.02);
      b.scale += (b.targetScale + level * 0.12 - b.scale) * 0.25;
      b.squash = level; // breathing: fatter as you speak
    } else if (b.state === 'floating') {
      b.phase += 0.012;
      const band = 90 + (b.id % 4) * 78; // each balloon claims its own altitude
      b.vy += ((band - b.y) * 0.0016);
      b.vx += Math.sin(b.phase) * 0.012 + (Math.random() - 0.5) * 0.01 + b.wiggle * (Math.random() - 0.5);
      b.wiggle *= 0.9;
      b.vx *= 0.985; b.vy *= 0.97;
      b.x += b.vx; b.y += b.vy;
      if (b.x < 70) { b.x = 70; b.vx = Math.abs(b.vx); }
      if (b.x > innerWidth - 70) { b.x = innerWidth - 70; b.vx = -Math.abs(b.vx); }
      if (b.y < 60) { b.y = 60; b.vy = Math.abs(b.vy) * 0.5; }
    }
    b.el.style.left = b.x + 'px';
    b.el.style.top = b.y + 'px';
    const sq = b.squash || 0;
    b.el.style.transform = `translate(-50%,-50%) scale(${(b.scale * (1 + sq * 0.09)).toFixed(3)}, ${(b.scale * (1 - sq * 0.06)).toFixed(3)}) rotate(${(Math.sin(b.phase) * 4).toFixed(2)}deg)`;
    if (b.state === 'floating') b.squash = (b.squash || 0) * 0.9;
    if (b.consoleEl) { // the console tags along, without the balloon's sway
      const cx = Math.max(150, Math.min(innerWidth - 150, b.x));
      b.consoleEl.style.left = cx + 'px';
      b.consoleEl.style.top = Math.min(innerHeight - 190, b.y + 120) + 'px';
    }
  }
  const gn = document.getElementById('gNeedle');
  if (gn) {
    gaugeV += (level - gaugeV) * 0.3;
    gn.style.transform = `translateY(-100%) rotate(${(-80 + gaugeV * 160).toFixed(1)}deg)`;
  }
  requestAnimationFrame(tick);
}
let gaugeV = 0;
requestAnimationFrame(tick);

// ---------- hold to talk ----------
let holding = false;
mic.addEventListener('pointerdown', async () => {
  if (holding) return;
  holding = true;
  mic.classList.add('rec');
  hint.textContent = 'listening… release when done';
  try { await startRec(); } catch (e) { hint.textContent = 'mic blocked — check permissions'; holding = false; mic.classList.remove('rec'); return; }
  inflating = makeBalloon(innerWidth / 2, innerHeight - 200, COLORS[(nextId) % COLORS.length]);
});

mic.addEventListener('pointerup', async () => {
  if (!holding) return;
  holding = false;
  mic.classList.remove('rec');
  const wav = stopRec();
  const b = inflating; inflating = null;
  if (!b) return;
  if (!wav) { hint.textContent = 'heard nothing — hold longer'; b.el.remove(); balloons.delete(b.id); return; }

  hint.textContent = 'reading your words…';
  b.state = 'floating'; b.vy = -2;
  const t = await window.balloon.transcribe(wav);
  if (!t.ok) { hint.textContent = 'hold to speak a task'; deflate(b, t.detail); return; }

  b.el.querySelector('.tag').textContent = t.text;
  b.el.title = t.text;
  b.task = t.text;
  b.cwd = cwd;
  hint.textContent = 'hold to speak a task';
  window.balloon.runTask(b.id, t.text, cwd);
  b.taskStarted = true;
});

// ---------- agent events ----------
window.balloon.onTaskEvent(({ id, type, result, detail, line }) => {
  const b = balloons.get(id);
  if (!b) return;
  if (type === 'progress') {
    b.wiggle = 2.2; // it's working — dance a little
    if (line) logLine(b, line);
  }
  if (type === 'done') { if (b.consoleEl) b.consoleEl.remove(); popBalloon(b, true, result); }   // 🎉
  if (type === 'error') { if (b.consoleEl) b.consoleEl.remove(); deflate(b, detail); }           // 💨
});
