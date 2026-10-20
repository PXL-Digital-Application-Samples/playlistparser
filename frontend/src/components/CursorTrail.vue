<script setup>
import { onMounted, onBeforeUnmount } from 'vue';
import { calm } from '../motion.js';

// Little records and music notes trailing the mouse (Home and the welcome
// page). Mouse only: off on touch screens and in Zen mode.
let canvas = null;
let ctx = null;
let raf = 0;
let last = null;
let colors = [];
const pieces = [];
const GLYPHS = ['♪', '♫', '♬'];

function spawn(x, y) {
  pieces.push({
    x, y,
    vx: (Math.random() - 0.5) * 1.2,
    vy: -0.6 - Math.random() * 1.2,
    rot: Math.random() * Math.PI * 2,
    vr: (Math.random() - 0.5) * 0.12,
    life: 1,
    size: 9 + Math.random() * 9,
    kind: Math.random() < 0.45 ? 'record' : GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
    color: colors[Math.floor(Math.random() * colors.length)] || '#f0a95b',
  });
  if (pieces.length > 80) pieces.shift();
  if (!raf) raf = requestAnimationFrame(step);
}

function onMove(e) {
  if (calm.value || e.pointerType !== 'mouse') return;
  if (last && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 18) return;
  last = { x: e.clientX, y: e.clientY };
  spawn(e.clientX, e.clientY);
}

function step() {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  for (let i = pieces.length - 1; i >= 0; i--) {
    const p = pieces[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.015;
    p.rot += p.vr;
    p.life -= 0.016;
    if (p.life <= 0) {
      pieces.splice(i, 1);
      continue;
    }
    ctx.save();
    ctx.globalAlpha = Math.min(1, p.life * 1.4);
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    if (p.kind === 'record') {
      ctx.fillStyle = '#121212';
      ctx.beginPath();
      ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.beginPath();
      ctx.arc(0, 0, p.size / 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(0, 0, p.size / 6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = p.color;
      ctx.font = `700 ${p.size + 4}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.kind, 0, 0);
    }
    ctx.restore();
  }
  raf = pieces.length ? requestAnimationFrame(step) : 0;
}

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

onMounted(() => {
  if (!matchMedia('(pointer: fine)').matches) return;
  canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: '70' });
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d');
  resize();
  const cs = getComputedStyle(document.documentElement);
  colors = ['--mark', '--fam-rock', '--fam-classical', '--fam-folk-country', '--fam-electronic'].map((v) => cs.getPropertyValue(v).trim()).filter(Boolean);
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('resize', resize);
});
onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  raf = 0;
  removeEventListener('pointermove', onMove);
  removeEventListener('resize', resize);
  canvas?.remove();
});
</script>

<template>
  <span hidden></span>
</template>
