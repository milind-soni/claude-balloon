// The sky: balloons drift free over the wallpaper, each trailing a string
// that ends in its task bar — a balloon weight. Drag the bar to park a
// balloon anywhere; the rope goes taut and holds it there. Physics is two
// verlet particles (buoyant balloon, heavy bar) joined by a rope.
const sky = document.getElementById('sky');

const NS = 'http://www.w3.org/2000/svg';
const svg = document.createElementNS(NS, 'svg');
svg.setAttribute('id', 'strings');
svg.setAttribute('width', innerWidth);
svg.setAttribute('height', innerHeight);
sky.appendChild(svg);

// only the bars are interactive — balloon bodies and empty sky never catch
// the mouse (clicking the wallpaper is what triggered macOS reveal-desktop)
document.addEventListener('pointerover', (e) => window.balloon.setInteractive(!!e.target.closest('.ia')));
document.addEventListener('pointerout', (e) => { if (!e.relatedTarget) window.balloon.setInteractive(false); });

let spawnAt = { x: innerWidth / 2, y: innerHeight - 80 }; // the nozzle's spot
const balloons = new Map(); // id -> b
const ROPE = 78; // string length balloon → tag (hangs just below, like the original)

function spawn({ id, task, color }) {
  const el = document.createElement('div');
  el.className = 'bal';
  el.style.setProperty('--bc', color);
  el.innerHTML = `<div class="body ia"></div>`;
  el.title = task;
  sky.appendChild(el);

  // the black task tag hangs under the balloon and doubles as the weight:
  // drag it to park the balloon, double-click it to set it free
  const bar = document.createElement('div');
  bar.className = 'skytag ia';
  bar.textContent = task;
  bar.title = task + ' — drag to park · double-click to free';
  sky.appendChild(bar);

  const rope = document.createElementNS(NS, 'path');
  rope.setAttribute('class', 'rope');
  svg.appendChild(rope);

  const b = {
    id, el, bar, rope, color,
    // balloon particle
    x: spawnAt.x, y: spawnAt.y, px: spawnAt.x, py: spawnAt.y + 2,
    // bar (weight) particle
    wx: spawnAt.x, wy: spawnAt.y + ROPE * 0.4, wpx: spawnAt.x, wpy: spawnAt.y + ROPE * 0.4,
    pinned: false,   // tag parked by the user
    parked: false,   // balloon itself parked by the user
    holding: null, holdMoved: false,
    dragging: false,
    phase: Math.random() * Math.PI * 2,
    wiggle: 0,
    task, lines: [], consoleEl: null,
  };

  el.querySelector('.body').addEventListener('dblclick', () => toggleConsole(b));
  const body = el.querySelector('.body');
  body.addEventListener('pointerdown', (e) => {
    b.holdMoved = false;
    b.holding = { dx: e.clientX - b.x, dy: e.clientY - b.y };
    body.setPointerCapture(e.pointerId);
  });
  body.addEventListener('pointermove', (e) => {
    if (!b.holding) return;
    const nx = e.clientX - b.holding.dx, ny = e.clientY - b.holding.dy;
    if (Math.hypot(nx - b.x, ny - b.y) > 5) b.holdMoved = true;
    if (b.holdMoved) {
      b.x = nx; b.y = ny; b.px = nx; b.py = ny; // no momentum while held
    }
  });
  const release = () => {
    if (b.holding && b.holdMoved) b.parked = true; // placed deliberately — stay put
    b.holding = null;
  };
  body.addEventListener('pointerup', release);
  body.addEventListener('pointercancel', release);

  bar.addEventListener('pointerdown', (e) => {
    b.dragging = true;
    bar.setPointerCapture(e.pointerId);
  });
  bar.addEventListener('pointermove', (e) => {
    if (!b.dragging) return;
    b.wx = e.clientX; b.wy = e.clientY;
    b.wpx = b.wx; b.wpy = b.wy; // no momentum while held
  });
  const drop = () => { if (b.dragging) { b.dragging = false; b.pinned = true; } };
  bar.addEventListener('pointerup', drop);
  bar.addEventListener('pointercancel', drop);
  bar.addEventListener('dblclick', () => { b.pinned = false; b.parked = false; }); // set it free again

  balloons.set(id, b);
}

function killBalloon(b) {
  if (b.consoleEl) b.consoleEl.remove();
  b.el.remove(); b.bar.remove(); b.rope.remove();
  balloons.delete(b.id);
}

// the little terminal: double-click a balloon to watch its agent work
function toggleConsole(b) {
  if (b.consoleEl) { b.consoleEl.remove(); b.consoleEl = null; return; }
  const c = document.createElement('div');
  c.className = 'bcon ia';
  c.innerHTML = `<div class="bconHead"><span></span><span class="bconX">✕</span></div><div class="bconBody"></div>`;
  c.querySelector('.bconHead span').textContent = '🎈 ' + b.task.slice(0, 30);
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

function popBalloon(b) {
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
  killBalloon(b);
}

function deflate(b) {
  b.el.classList.add('err');
  b.rope.remove(); b.bar.remove();
  balloons.delete(b.id);
  b.el.style.transition = 'top 1.4s ease-in, transform 1.4s, opacity 1.4s';
  requestAnimationFrame(() => {
    b.el.style.top = innerHeight - 40 + 'px';
    b.el.style.transform = 'translate(-50%,-50%) scale(.25) rotate(28deg)';
    b.el.style.opacity = '0';
  });
  setTimeout(() => b.el.remove(), 1500);
}

// ---------- physics ----------
function integrate(b) {
  b.phase += 0.013;

  // balloon: buoyant and CALM — no perpetual sway, just a slow rise to its
  // band and a barely-there breathing bob. (parked/held balloons don't move)
  if (!b.parked && !b.holding) {
    let vx = (b.x - b.px) * 0.96;
    let vy = (b.y - b.py) * 0.96;
    b.px = b.x; b.py = b.y;
    const band = 110 + (b.id % 4) * 84;
    vy += (band - b.y) * 0.0011;              // ease toward altitude
    vy += Math.sin(b.phase * 0.5) * 0.004;    // faint breathing
    vx += b.wiggle * (Math.random() - 0.5) * 0.5;
    b.wiggle *= 0.9;
    b.x += vx; b.y += vy;
  } else {
    b.px = b.x; b.py = b.y;
    b.wiggle *= 0.9;
  }

  // bar: heavy, dangling (skipped while held or parked)
  if (!b.dragging && !b.pinned) {
    let wvx = (b.wx - b.wpx) * 0.97;
    let wvy = (b.wy - b.wpy) * 0.97;
    b.wpx = b.wx; b.wpy = b.wy;
    wvy += 0.14; // gravity
    b.wx += wvx; b.wy += wvy;
  }

  // the rope: hold balloon and bar within ROPE of each other.
  // a held/parked bar doesn't move — the balloon takes all the correction
  // (that's the tension you feel when you drag it around).
  const dx = b.x - b.wx, dy = b.y - b.wy;
  const dist = Math.hypot(dx, dy) || 1;
  if (dist > ROPE) {
    const excess = (dist - ROPE) / dist;
    if (b.dragging || b.pinned) {
      b.x -= dx * excess;
      b.y -= dy * excess;
    } else {
      b.x -= dx * excess * 0.25;  // balloon barely feels the light bar
      b.wx += dx * excess * 0.75; // the bar mostly follows the balloon
      b.wy += dy * excess * 0.75;
      b.y -= dy * excess * 0.25;
    }
  }

  // edges
  if (b.x < 60) b.x = 60;
  if (b.x > innerWidth - 60) b.x = innerWidth - 60;
  if (b.y < 55) b.y = 55;
  if (b.y > innerHeight - 90) b.y = innerHeight - 90;
  if (!b.dragging && !b.pinned) {
    if (b.wy > innerHeight - 14) b.wy = innerHeight - 14;
    if (b.wx < 20) b.wx = 20;
    if (b.wx > innerWidth - 20) b.wx = innerWidth - 20;
  }
}

function render(b) {
  b.el.style.left = b.x + 'px';
  b.el.style.top = b.y + 'px';
  b.el.style.transform = 'translate(-50%,-50%)';

  b.bar.style.left = b.wx + 'px';
  b.bar.style.top = b.wy + 'px';
  b.bar.classList.toggle('pinned', b.pinned);
  if (b.consoleEl) {
    b.consoleEl.style.left = Math.max(170, Math.min(innerWidth - 170, b.x)) + 'px';
    b.consoleEl.style.top = Math.min(innerHeight - 200, b.y + 140) + 'px';
  }

  // rope from balloon knot to bar top — sags when slack, straight when taut
  const kx = b.x, ky = b.y + 50;
  const tx = b.wx, ty = b.wy - 8;
  const dist = Math.hypot(tx - kx, ty - ky);
  const slack = Math.max(0, ROPE - dist);
  const sag = Math.min(60, slack * 0.5);
  const mx = (kx + tx) / 2 + Math.sin(b.phase * 1.4) * Math.min(10, slack * 0.15);
  const my = (ky + ty) / 2 + sag;
  b.rope.setAttribute('d', `M ${kx.toFixed(1)} ${ky.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}`);
}

function tick() {
  for (const b of balloons.values()) { integrate(b); render(b); }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---------- events ----------
window.balloon.onSkyEvent((d) => {
  if (d.type === 'anchor') { spawnAt = { x: d.x, y: Math.max(80, d.y - 40) }; return; }
  if (d.type === 'spawn') return spawn(d);
  const b = balloons.get(d.id);
  if (!b) return;
  if (d.type === 'progress') {
    b.wiggle = 0.7; // a polite little stir, not a shake
    if (d.line) { b.lines.push(d.line); if (b.lines.length > 200) b.lines.shift(); renderConsole(b); }
  }
  if (d.type === 'done') popBalloon(b);
  if (d.type === 'error') deflate(b);
});
