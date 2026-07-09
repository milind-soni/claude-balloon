// The sky window: the desktop itself. Released balloons live here — behind
// your app windows, floating over the wallpaper until their agent finishes.
const sky = document.getElementById('sky');

document.addEventListener('pointerover', (e) => window.balloon.setInteractive(!!e.target.closest('.ia')));
document.addEventListener('pointerout', (e) => { if (!e.relatedTarget) window.balloon.setInteractive(false); });

const balloons = new Map(); // id -> b

function spawn({ id, task, color, x, y, cwd }) {
  const el = document.createElement('div');
  el.className = 'bal ia';
  el.style.setProperty('--bc', color);
  el.innerHTML = `<div class="body"></div><div class="string"></div><div class="tag"></div>`;
  el.querySelector('.tag').textContent = task;
  el.title = task;
  sky.appendChild(el);
  const b = {
    id, el, task, cwd, color,
    x: Math.max(70, Math.min(innerWidth - 70, x)), y: Math.max(60, y),
    vx: (Math.random() - 0.5) * 2, vy: -2.5,
    scale: 1, phase: Math.random() * Math.PI * 2,
    wiggle: 0, lines: [], consoleEl: null,
  };
  el.querySelector('.body').addEventListener('click', () => nudge(b));
  el.querySelector('.body').addEventListener('dblclick', () => toggleConsole(b));
  balloons.set(id, b);
}

function nudge(b) { b.vx += (Math.random() - 0.5) * 6; b.vy -= 3; }

// ---------- the little console ----------
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

// ---------- pop / deflate / cards ----------
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
  if (b.consoleEl) b.consoleEl.remove();
  b.el.remove(); balloons.delete(b.id);
  dropCard(cx, cy, ok, text, b.cwd);
  window.balloon.tiedKnot({ task: b.task, text: (text || '').slice(0, 600), ok, color: b.color, cwd: b.cwd, at: Date.now() });
}

function deflate(b, detail) {
  b.el.classList.add('err');
  if (b.consoleEl) b.consoleEl.remove();
  balloons.delete(b.id);
  b.el.style.transition = 'top 1.4s ease-in, transform 1.4s, opacity 1.4s';
  requestAnimationFrame(() => {
    b.el.style.top = innerHeight - 60 + 'px';
    b.el.style.transform = 'translate(-50%,-50%) scale(.3) rotate(24deg)';
    b.el.style.opacity = '0';
  });
  setTimeout(() => b.el.remove(), 1500);
  dropCard(b.x, innerHeight - 260, false, detail, b.cwd);
  window.balloon.tiedKnot({ task: b.task, text: (detail || '').slice(0, 600), ok: false, color: b.color, cwd: b.cwd, at: Date.now() });
}

function dropCard(x, y, ok, text, dir) {
  const c = document.createElement('div');
  c.className = `card ia ${ok ? 'ok' : 'bad'}`;
  c.style.left = Math.max(170, Math.min(innerWidth - 170, x)) + 'px';
  c.style.top = Math.max(30, Math.min(innerHeight - 280, y)) + 'px';
  c.innerHTML = `<div class="ct">${ok ? '🎉 done' : '💨 didn’t make it'}</div>
    <div class="cb"></div><div class="cx">${ok ? '<b class="rv">open the folder →</b> · ' : ''}click to dismiss</div>`;
  c.querySelector('.cb').textContent = text || '';
  const rv = c.querySelector('.rv');
  if (rv) rv.addEventListener('click', (ev) => { ev.stopPropagation(); window.balloon.reveal(dir || ''); });
  c.addEventListener('click', () => c.remove());
  sky.appendChild(c);
  if (ok) setTimeout(() => c.remove(), 60_000);
}

// ---------- physics ----------
function tick() {
  for (const b of balloons.values()) {
    b.phase += 0.012;
    const band = 90 + (b.id % 4) * 78;
    b.vy += (band - b.y) * 0.0016;
    b.vx += Math.sin(b.phase) * 0.012 + (Math.random() - 0.5) * 0.01 + b.wiggle * (Math.random() - 0.5);
    b.wiggle *= 0.9;
    b.vx *= 0.985; b.vy *= 0.97;
    b.x += b.vx; b.y += b.vy;
    if (b.x < 70) { b.x = 70; b.vx = Math.abs(b.vx); }
    if (b.x > innerWidth - 70) { b.x = innerWidth - 70; b.vx = -Math.abs(b.vx); }
    if (b.y < 60) { b.y = 60; b.vy = Math.abs(b.vy) * 0.5; }
    b.el.style.left = b.x + 'px';
    b.el.style.top = b.y + 'px';
    b.el.style.transform = `translate(-50%,-50%) rotate(${(Math.sin(b.phase) * 4).toFixed(2)}deg)`;
    if (b.consoleEl) {
      b.consoleEl.style.left = Math.max(150, Math.min(innerWidth - 150, b.x)) + 'px';
      b.consoleEl.style.top = Math.min(innerHeight - 190, b.y + 120) + 'px';
    }
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---------- events from main ----------
window.balloon.onSkyEvent((d) => {
  if (d.type === 'spawn') return spawn(d);
  if (d.type === 'reshow') return dropCard(innerWidth / 2, innerHeight / 2 - 100, d.entry.ok, `${d.entry.task}\n\n${d.entry.text}`, d.entry.cwd);
  const b = balloons.get(d.id);
  if (!b) return;
  if (d.type === 'progress') {
    b.wiggle = 2.2;
    if (d.line) { b.lines.push(d.line); if (b.lines.length > 200) b.lines.shift(); renderConsole(b); }
  }
  if (d.type === 'done') popBalloon(b, true, d.result);
  if (d.type === 'error') deflate(b, d.detail);
});
