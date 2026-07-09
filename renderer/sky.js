// The sky: pure display, permanently click-through, one notch above the
// wallpaper. Every balloon is TIED to the tank's nozzle by a rope with
// real slack/tension — drag the tank and the whole bouquet comes along.
const sky = document.getElementById('sky');

// one full-screen SVG holds every string
const NS = 'http://www.w3.org/2000/svg';
const svg = document.createElementNS(NS, 'svg');
svg.setAttribute('id', 'strings');
svg.setAttribute('width', innerWidth);
svg.setAttribute('height', innerHeight);
sky.appendChild(svg);

let anchor = { x: innerWidth / 2, y: innerHeight - 30 }; // the nozzle, in sky coords
const balloons = new Map(); // id -> b

function spawn({ id, task, color }) {
  const el = document.createElement('div');
  el.className = 'bal';
  el.style.setProperty('--bc', color);
  el.innerHTML = `<div class="body"></div><div class="tag"></div>`;
  el.querySelector('.tag').textContent = task;
  sky.appendChild(el);

  const rope = document.createElementNS(NS, 'path');
  rope.setAttribute('class', 'rope');
  svg.appendChild(rope);

  const L = 200 + (balloons.size % 5) * 46; // each balloon gets its own rope length
  balloons.set(id, {
    id, el, rope, color, L,
    x: anchor.x, y: anchor.y - 60,
    px: anchor.x, py: anchor.y - 55, // verlet previous position
    phase: Math.random() * Math.PI * 2,
    wiggle: 0,
  });
}

function killBalloon(b) {
  b.el.remove();
  b.rope.remove();
  balloons.delete(b.id);
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
  b.rope.remove();
  balloons.delete(b.id);
  b.el.style.transition = 'top 1.4s ease-in, left 1.4s, transform 1.4s, opacity 1.4s';
  requestAnimationFrame(() => {
    b.el.style.top = innerHeight - 40 + 'px';
    b.el.style.transform = 'translate(-50%,-50%) scale(.25) rotate(28deg)';
    b.el.style.opacity = '0';
  });
  setTimeout(() => b.el.remove(), 1500);
}

// ---------- rope physics (verlet + distance constraint) ----------
function tick() {
  for (const b of balloons.values()) {
    b.phase += 0.013;

    // verlet integration: buoyancy up, gentle sway, drag
    let vx = (b.x - b.px) * 0.985;
    let vy = (b.y - b.py) * 0.985;
    b.px = b.x; b.py = b.y;
    vy -= 0.055;                                   // helium
    vx += Math.sin(b.phase) * 0.02 + (Math.random() - 0.5) * 0.012 + b.wiggle * (Math.random() - 0.5);
    b.wiggle *= 0.9;
    b.x += vx; b.y += vy;

    // the rope: can't drift farther than L from the nozzle
    const dx = b.x - anchor.x, dy = b.y - anchor.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist > b.L) {
      // taut — project back onto the rope circle (this IS the tension)
      const k = b.L / dist;
      b.x = anchor.x + dx * k;
      b.y = anchor.y + dy * k;
    }

    // screen edges
    if (b.x < 60) b.x = 60;
    if (b.x > innerWidth - 60) b.x = innerWidth - 60;
    if (b.y < 55) b.y = 55;

    b.el.style.left = b.x + 'px';
    b.el.style.top = b.y + 'px';
    const lean = Math.max(-14, Math.min(14, (b.x - b.px) * 6 + Math.sin(b.phase) * 3));
    b.el.style.transform = `translate(-50%,-50%) rotate(${lean.toFixed(2)}deg)`;

    // draw the rope: sags when slack, straightens when taut
    const kx = b.x, ky = b.y + 52;                 // the balloon's knot
    const slack = Math.max(0, b.L - Math.hypot(kx - anchor.x, ky - anchor.y));
    const sag = Math.min(90, slack * 0.5);
    const mx = (kx + anchor.x) / 2 + Math.sin(b.phase * 1.4) * Math.min(14, slack * 0.12);
    const my = (ky + anchor.y) / 2 + sag;
    b.rope.setAttribute('d', `M ${kx.toFixed(1)} ${ky.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${anchor.x.toFixed(1)} ${anchor.y.toFixed(1)}`);
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---------- events ----------
window.balloon.onSkyEvent((d) => {
  if (d.type === 'anchor') { anchor = { x: d.x, y: d.y }; return; }
  if (d.type === 'spawn') return spawn(d);
  const b = balloons.get(d.id);
  if (!b) return;
  if (d.type === 'progress') b.wiggle = 2.4;
  if (d.type === 'done') popBalloon(b);
  if (d.type === 'error') deflate(b);
});
