import { motionOn } from './motion.js';

// Confetti made of tiny album covers (taken from the page) and genre-coloured
// shapes, thrown from a point with gravity, drag and spin. One canvas per
// burst, removed when the last piece has fallen. Nothing in Zen mode.
const COLORS = ['--fam-rock', '--fam-hip-hop', '--fam-folk-country', '--fam-jazz-soul', '--fam-classical', '--fam-electronic', '--fam-pop', '--mark'];

function pageCovers(max = 10) {
  const seen = new Set();
  const out = [];
  for (const img of document.querySelectorAll('main img')) {
    const src = img.currentSrc || img.src;
    if (!src || seen.has(src) || !img.complete || !img.naturalWidth) continue;
    seen.add(src);
    out.push(img);
    if (out.length >= max) break;
  }
  return out;
}

// x, y: viewport point to throw from (defaults: top centre).
export function burst({ x = innerWidth / 2, y = innerHeight * 0.3, count = 90, spread = 1 } = {}) {
  if (!motionOn()) return;
  const canvas = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: '90' });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const cs = getComputedStyle(document.documentElement);
  const colors = COLORS.map((c) => cs.getPropertyValue(c).trim()).filter(Boolean);
  const covers = pageCovers();
  const pieces = Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1 * spread;
    const speed = 9 + Math.random() * 11;
    const cover = covers.length && i % 4 === 0 ? covers[i % covers.length] : null;
    return {
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: cover ? 22 + Math.random() * 14 : 6 + Math.random() * 7,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.35,
      tilt: Math.random() * Math.PI,
      color: colors[i % colors.length],
      shape: i % 3,
      cover,
    };
  });

  let frames = 0;
  function step() {
    frames++;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    let alive = 0;
    for (const p of pieces) {
      p.vy += 0.32; // gravity
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.tilt += 0.12;
      if (p.y > innerHeight + 60) continue;
      alive++;
      const fade = Math.min(1, (innerHeight + 60 - p.y) / 200);
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      // Flutter: squash one axis as the piece "turns over".
      ctx.scale(1, Math.abs(Math.cos(p.tilt)) * 0.8 + 0.2);
      if (p.cover) {
        ctx.drawImage(p.cover, -p.size / 2, -p.size / 2, p.size, p.size);
      } else {
        ctx.fillStyle = p.color;
        if (p.shape === 0) ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        else if (p.shape === 1) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // A tiny record.
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fillStyle = '#111';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 5, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.fill();
        }
      }
      ctx.restore();
    }
    if (alive && frames < 600) requestAnimationFrame(step);
    else canvas.remove();
  }
  requestAnimationFrame(step);
}

// Burst from the middle of an element (e.g. the button that was pressed).
export function burstFrom(el, opts = {}) {
  const r = el?.getBoundingClientRect?.();
  burst(r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, ...opts } : opts);
}
