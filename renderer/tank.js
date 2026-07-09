// The tank window: always on top, all interaction lives here.
// Hold the NOZZLE to speak. Drag the CYLINDER to park the tank anywhere —
// the balloon bouquet stays tied to it. Hover the tank for the side panel
// (active balloons → live console · popped knots → result cards).
const $ = (id) => document.getElementById(id);
const stage = $('stage'), mic = $('mic'), tank = $('tank'), nozzle = $('nozzle'), valve = $('valve');
const hint = $('hint'), dirLabel = $('dirLabel'), knotsEl = $('knots'), fleetEl = $('fleet'), panels = $('panels');


document.addEventListener('pointerover', (e) => window.balloon.setInteractive(!!e.target.closest('.ia')));
document.addEventListener('pointerout', (e) => { if (!e.relatedTarget) window.balloon.setInteractive(false); });

// side panel: opens on tank hover, lingers long enough to reach it
const sidePanel = $('sidePanel');
let panelT = null;
function openPanel() { clearTimeout(panelT); sidePanel.classList.add('open'); }
function closePanelSoon() { clearTimeout(panelT); panelT = setTimeout(() => sidePanel.classList.remove('open'), 450); }


// ---------- the rope anchor: tell the sky where the nozzle is ----------
function sendAnchor() {
  const r = $('nozzleTip').getBoundingClientRect();
  window.balloon.anchor(window.screenX + r.left + r.width / 2, window.screenY + r.top);
}
setTimeout(sendAnchor, 400);

// ---------- task folder ----------
let cwd = localStorage.getItem('balloon-cwd') || '';
function short(p) { return p ? p.replace(/^\/Users\/[^/]+/, '~') : '~ (home)'; }
function applyDir() { dirLabel.textContent = short(cwd); }
dirLabel.addEventListener('click', async (e) => {
  e.stopPropagation();
  const r = await window.balloon.pickFolder();
  if (r && r.path) { cwd = r.path; localStorage.setItem('balloon-cwd', cwd); applyDir(); }
});
dirLabel.addEventListener('pointerdown', (e) => e.stopPropagation());
applyDir();

// ---------- drag the tank anywhere ----------
let drag = null;
tank.addEventListener('pointerdown', (e) => {
  if (e.target.closest('#dirLabel')) return;
  drag = { gx: e.screenX - window.screenX, gy: e.screenY - window.screenY, moved: false };
  tank.setPointerCapture(e.pointerId);
});
tank.addEventListener('pointermove', (e) => {
  if (!drag) return;
  drag.moved = true;
  window.balloon.moveTank(e.screenX - drag.gx, e.screenY - drag.gy);
  sendAnchor();
});
tank.addEventListener('pointerup', () => { if (drag && drag.moved) sendAnchor(); drag = null; });

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

// ---------- the inflating balloon ----------
const COLORS = ['#ff8c94', '#8fd8cf', '#ffd479', '#9db4e8', '#c9a3e8', '#8fe3a4'];
let colorIdx = Math.floor(Math.random() * COLORS.length);
let inflating = null;

function makeInflating() {
  const el = document.createElement('div');
  el.className = 'bal';
  const color = COLORS[colorIdx = (colorIdx + 1) % COLORS.length];
  el.style.setProperty('--bc', color);
  el.innerHTML = `<div class="body"></div>`;
  stage.appendChild(el);
  return { el, scale: 0.3, target: 0.3, color };
}

let gaugeV = 0;
function tick() {
  if (inflating) {
    const r = $('nozzleTip').getBoundingClientRect();
    inflating.target = Math.min(1.4, inflating.target + level * 0.02);
    inflating.scale += (inflating.target + level * 0.12 - inflating.scale) * 0.25;
    const s = inflating.scale;
    inflating.el.style.left = r.left + r.width / 2 + 'px';
    inflating.el.style.top = r.top - 34 - s * 50 + 'px';
    inflating.el.style.transform =
      `translate(-50%,-50%) scale(${(s * (1 + level * 0.09)).toFixed(3)}, ${(s * (1 - level * 0.06)).toFixed(3)})`;
  }
  gaugeV += (level - gaugeV) * 0.3;
  $('gNeedle').style.transform = `translateY(-100%) rotate(${(-80 + gaugeV * 160).toFixed(1)}deg)`;
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---------- hold the nozzle to talk ----------
let holding = false;
async function beginTalk(e) {
  if (holding) return;
  e.stopPropagation();
  holding = true;
  mic.classList.add('rec');
  hint.textContent = 'listening…';
  try { await startRec(); } catch { hint.textContent = 'mic blocked'; holding = false; mic.classList.remove('rec'); return; }
  inflating = makeInflating();
}
async function endTalk() {
  if (!holding) return;
  holding = false;
  mic.classList.remove('rec');
  const wav = stopRec();
  const b = inflating; inflating = null;
  if (!b) return;
  if (!wav) { hint.textContent = 'heard nothing'; b.el.remove(); setTimeout(() => (hint.textContent = 'hold nozzle · speak'), 1400); return; }

  hint.textContent = 'reading…';
  const t = await window.balloon.transcribe(wav);
  if (!t.ok) {
    hint.textContent = t.detail.slice(0, 24);
    b.el.style.transition = 'opacity .5s'; b.el.style.opacity = '0';
    setTimeout(() => { b.el.remove(); hint.textContent = 'hold nozzle · speak'; }, 600);
    return;
  }
  // release: it escapes the tank window and joins the bouquet in the sky
  b.el.style.transition = 'top .45s ease-in, opacity .45s';
  b.el.style.top = '-140px'; b.el.style.opacity = '0.1';
  setTimeout(() => b.el.remove(), 500);
  hint.textContent = 'hold nozzle · speak';
  window.balloon.launchTask({ task: t.text, color: b.color, cwd });
}
nozzle.addEventListener('pointerdown', beginTalk);
valve.addEventListener('pointerdown', beginTalk);
document.addEventListener('pointerup', endTalk);

// ---------- fleet (active balloons) + console ----------
const fleet = new Map(); // id -> { task, color, lines, row }
let consoleFor = null;

function fleetRow(f, id) {
  const row = document.createElement('button');
  row.className = 'frow';
  row.innerHTML = `<span class="fdot" style="--bc:${f.color}"></span><span class="ft"></span>`;
  row.querySelector('.ft').textContent = f.task.slice(0, 26);
  row.title = f.task;
  row.addEventListener('click', () => toggleConsole(id));
  return row;
}
function renderFleet() {
  fleetEl.innerHTML = '';
  for (const [id, f] of fleet) fleetEl.appendChild(f.row || (f.row = fleetRow(f, id)));
}
function toggleConsole(id) {
  if (consoleFor === id) { consoleFor = null; renderPanels(); return; }
  consoleFor = id;
  renderPanels();
}
let cards = []; // { ok, text, cwd }
function renderPanels() {
  panels.innerHTML = '';
  const f = consoleFor !== null && fleet.get(consoleFor);
  if (f) {
    const c = document.createElement('div');
    c.className = 'bcon ia';
    c.innerHTML = `<div class="bconHead"><span></span><span class="bconX">✕</span></div><div class="bconBody"></div>`;
    c.querySelector('.bconHead span').textContent = '🎈 ' + f.task.slice(0, 30);
    c.querySelector('.bconX').addEventListener('click', () => { consoleFor = null; renderPanels(); });
    c.querySelector('.bconBody').textContent = f.lines.length ? f.lines.slice(-40).join('\n') : 'waiting for the first step…';
    panels.appendChild(c);
    c.querySelector('.bconBody').scrollTop = 1e6;
  }
  for (const card of cards.slice(-2)) {
    const c = document.createElement('div');
    c.className = `card ia ${card.ok ? 'ok' : 'bad'}`;
    c.innerHTML = `<div class="ct">${card.ok ? '🎉 done' : '💨 didn’t make it'}</div>
      <div class="cb"></div><div class="cx">${card.ok ? '<b class="rv">open the folder →</b> · ' : ''}click to dismiss</div>`;
    c.querySelector('.cb').textContent = card.text || '';
    const rv = c.querySelector('.rv');
    if (rv) rv.addEventListener('click', (ev) => { ev.stopPropagation(); window.balloon.reveal(card.cwd || ''); });
    c.addEventListener('click', () => { cards = cards.filter((x) => x !== card); renderPanels(); });
    panels.appendChild(c);
  }
}

// ---------- knots ----------
let knots = [];
try { knots = JSON.parse(localStorage.getItem('balloon-knots') || '[]'); } catch {}
function saveKnots() { localStorage.setItem('balloon-knots', JSON.stringify(knots.slice(-12))); }
function renderKnots() {
  knotsEl.innerHTML = '';
  for (const k of knots.slice(-8)) {
    const el = document.createElement('span');
    el.className = 'knot' + (k.ok ? '' : ' sad');
    el.style.setProperty('--bc', k.color);
    el.title = `${k.ok ? '🎉' : '💨'} ${k.task}`;
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      cards.push({ ok: k.ok, text: `${k.task}\n\n${k.text}`, cwd: k.cwd });
      renderPanels();
    });
    knotsEl.appendChild(el);
  }
}
renderKnots();

// ---------- events ----------
window.balloon.onTankEvent((d) => {
  if (d.type === 'spawn') {
    fleet.set(d.id, { task: d.task, color: d.color, cwd: d.cwd, lines: [] });
    renderFleet();
    return;
  }
  const f = fleet.get(d.id);
  if (d.type === 'progress' && f && d.line) {
    f.lines.push(d.line);
    if (f.lines.length > 200) f.lines.shift();
    if (consoleFor === d.id) renderPanels();
  }
  if (d.type === 'done' || d.type === 'error') {
    const ok = d.type === 'done';
    const text = ok ? d.result : d.detail;
    if (f) {
      knots.push({ task: f.task, text: (text || '').slice(0, 600), ok, color: f.color, cwd: f.cwd, at: Date.now() });
      saveKnots(); renderKnots();
      cards.push({ ok, text: `${f.task}\n\n${text || ''}`, cwd: f.cwd });
      fleet.delete(d.id);
      if (consoleFor === d.id) consoleFor = null;
      renderFleet(); renderPanels();
    }
  }
});

// keep the panel alive while the pointer is on the dock OR the panel itself
for (const el of [mic, sidePanel]) {
  el.addEventListener('pointerenter', openPanel);
  el.addEventListener('pointerleave', closePanelSoon);
}
