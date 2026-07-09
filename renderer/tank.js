// The tank window: always on top, always clickable. You hold the nozzle,
// the balloon swells HERE (over your work), and on release it hands off
// to the sky window and sinks into the desktop.
const $ = (id) => document.getElementById(id);
const stage = $('stage'), mic = $('mic'), hint = $('hint'), dirLabel = $('dirLabel'), knotsEl = $('knots');

document.addEventListener('pointerover', (e) => window.balloon.setInteractive(!!e.target.closest('.ia')));
document.addEventListener('pointerout', (e) => { if (!e.relatedTarget) window.balloon.setInteractive(false); });

// ---------- task folder ----------
let cwd = localStorage.getItem('balloon-cwd') || '';
function short(p) { return p ? p.replace(/^\/Users\/[^/]+/, '~') : '~ (home)'; }
function applyDir() { dirLabel.textContent = short(cwd); }
dirLabel.addEventListener('click', async (e) => {
  e.stopPropagation();
  const r = await window.balloon.pickFolder();
  if (r && r.path) { cwd = r.path; localStorage.setItem('balloon-cwd', cwd); applyDir(); }
});
applyDir();

// ---------- recording ----------
let audio = null, level = 0;
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
  src.connect(node); node.connect(ctx.destination);
  audio = { ctx, stream, node, chunks };
}
function stopRec() {
  if (!audio) return null;
  const { ctx, stream, node, chunks } = audio;
  node.disconnect(); stream.getTracks().forEach((t) => t.stop()); ctx.close();
  audio = null; level = 0;
  const n = chunks.reduce((a, c) => a + c.length, 0);
  if (n < 4000) return null;
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

// ---------- the inflating balloon (lives only while you speak) ----------
const COLORS = ['#ff8c94', '#8fd8cf', '#ffd479', '#9db4e8', '#c9a3e8', '#8fe3a4'];
let colorIdx = Math.floor(Math.random() * COLORS.length);
let inflating = null; // { el, scale, target }

function makeInflating() {
  const el = document.createElement('div');
  el.className = 'bal';
  el.style.setProperty('--bc', COLORS[colorIdx = (colorIdx + 1) % COLORS.length]);
  el.innerHTML = `<div class="body"></div><div class="string"></div>`;
  stage.appendChild(el);
  return { el, scale: 0.3, target: 0.3, color: el.style.getPropertyValue('--bc') };
}

function tick() {
  if (inflating) {
    const r = $('nozzleTip').getBoundingClientRect();
    inflating.target = Math.min(1.5, inflating.target + level * 0.02);
    inflating.scale += (inflating.target + level * 0.12 - inflating.scale) * 0.25;
    const s = inflating.scale;
    inflating.el.style.left = r.left + r.width / 2 + 'px';
    inflating.el.style.top = r.top - 40 - s * 52 + 'px';
    inflating.el.style.transform =
      `translate(-50%,-50%) scale(${(s * (1 + level * 0.09)).toFixed(3)}, ${(s * (1 - level * 0.06)).toFixed(3)})`;
  }
  gaugeV += (level - gaugeV) * 0.3;
  $('gNeedle').style.transform = `translateY(-100%) rotate(${(-80 + gaugeV * 160).toFixed(1)}deg)`;
  requestAnimationFrame(tick);
}
let gaugeV = 0;
requestAnimationFrame(tick);

// ---------- hold to talk ----------
let holding = false;
mic.addEventListener('pointerdown', async (e) => {
  if (holding || e.target.closest('#dirLabel')) return;
  holding = true;
  mic.classList.add('rec');
  hint.textContent = 'listening…';
  try { await startRec(); } catch { hint.textContent = 'mic blocked'; holding = false; mic.classList.remove('rec'); return; }
  inflating = makeInflating();
});

mic.addEventListener('pointerup', async () => {
  if (!holding) return;
  holding = false;
  mic.classList.remove('rec');
  const wav = stopRec();
  const b = inflating; inflating = null;
  if (!b) return;
  if (!wav) { hint.textContent = 'heard nothing'; b.el.remove(); setTimeout(() => (hint.textContent = 'hold · speak'), 1500); return; }

  hint.textContent = 'reading…';
  const t = await window.balloon.transcribe(wav);
  if (!t.ok) {
    hint.textContent = t.detail.slice(0, 24);
    b.el.style.transition = 'opacity .6s'; b.el.style.opacity = '0';
    setTimeout(() => { b.el.remove(); hint.textContent = 'hold · speak'; }, 700);
    return;
  }

  // hand off to the sky: float up out of this window, then respawn on the desktop
  const r = b.el.getBoundingClientRect();
  const sx = window.screenX + r.left + r.width / 2;
  const sy = window.screenY + r.top + r.height / 2;
  b.el.style.transition = 'top .5s ease-in, opacity .5s';
  b.el.style.top = '-120px'; b.el.style.opacity = '0.15';
  setTimeout(() => b.el.remove(), 550);
  hint.textContent = 'hold · speak';
  window.balloon.launchTask({ task: t.text, color: b.color, sx, sy, cwd });
});

// ---------- knots (souvenirs, always visible on the tank) ----------
let knots = [];
try { knots = JSON.parse(localStorage.getItem('balloon-knots') || '[]'); } catch {}
function renderKnots() {
  knotsEl.innerHTML = '';
  for (const k of knots.slice(-8)) {
    const el = document.createElement('span');
    el.className = 'knot' + (k.ok ? '' : ' sad');
    el.style.setProperty('--bc', k.color);
    el.title = `${k.ok ? '🎉' : '💨'} ${k.task}`;
    el.addEventListener('click', (ev) => { ev.stopPropagation(); window.balloon.reshowCard(k); });
    knotsEl.appendChild(el);
  }
}
renderKnots();
window.balloon.onTankEvent(({ type, knot }) => {
  if (type !== 'knot') return;
  knots.push(knot);
  knots = knots.slice(-12);
  localStorage.setItem('balloon-knots', JSON.stringify(knots));
  renderKnots();
});
