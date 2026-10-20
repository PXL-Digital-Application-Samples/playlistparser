<script setup>
import { ref, watch, onBeforeUnmount, nextTick } from 'vue';
import { gsap } from 'gsap';
import { disco, toggleDisco, beatCount } from '../disco.js';
import CursorTrail from './CursorTrail.vue';

// Disco mode's visuals, in one layer that exists only while disco is on:
// a mirror ball drawn on a canvas (hundreds of tiles turning and catching
// the light, glints, a flash on every beat), hanging on a string and
// swinging; coloured light flecks sweeping over the page as it turns; and
// the music-note cursor trail. Click the ball to stop the party.
const canvas = ref(null);
const hit = ref(null);
let raf = 0;
let start = 0;
let lastBeat = -1;
let flashAt = 0;
let drop = { y: -1 };
let ctx = null;
let flecks = [];
let tiles = [];
let colors = [];

const R = 60; // ball radius
const ROWS = 18;
const COLS = 36;

function setup() {
  const c = canvas.value;
  ctx = c.getContext('2d');
  resize();
  const cs = getComputedStyle(document.documentElement);
  colors = ['--fam-rock', '--fam-hip-hop', '--fam-folk-country', '--fam-jazz-soul', '--fam-classical', '--fam-electronic', '--fam-pop']
    .map((v) => cs.getPropertyValue(v).trim()).filter(Boolean);
  // Mirror tiles on a sphere: rows of latitude, columns of longitude.
  tiles = [];
  for (let i = 0; i < ROWS; i++) {
    const lat = -Math.PI / 2 + ((i + 0.5) / ROWS) * Math.PI;
    const cols = Math.max(6, Math.round(COLS * Math.cos(lat)));
    for (let j = 0; j < cols; j++) tiles.push({ lat, lon: (j / cols) * Math.PI * 2, shade: 0.55 + Math.random() * 0.45, glint: Math.random() });
  }
  // Reflections thrown around the room, at fixed angles on the ball.
  flecks = Array.from({ length: 120 }, (_, k) => ({
    lon: Math.random() * Math.PI * 2,
    y: 0.08 + Math.random() * 0.9,
    size: 8 + Math.random() * 16,
    beam: k % 7 === 0,
    color: colors[k % colors.length] || '#ffffff',
    white: Math.random() < 0.35,
    tw: Math.random() * Math.PI * 2,
  }));
}

function resize() {
  const c = canvas.value;
  if (!c) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = innerWidth * dpr;
  c.height = innerHeight * dpr;
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  const t = (now - start) / 1000;
  if (beatCount.value !== lastBeat) {
    lastBeat = beatCount.value;
    flashAt = now;
  }
  const flash = Math.max(0, 1 - (now - flashAt) / 220);
  const W = innerWidth;
  const H = innerHeight;
  ctx.clearRect(0, 0, W, H);

  const spin = t * 0.9; // radians per second
  const swing = Math.sin(t * 1.3) * 0.05;
  const cx = W * 0.62 + Math.sin(swing) * 120;
  const cy = 80 + R + drop.y * 260 + (1 - Math.cos(swing)) * 120;

  // Light flecks sweeping across the page as the ball turns.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const f of flecks) {
    const a = (f.lon + spin) % (Math.PI * 2);
    if (a > Math.PI) continue; // facing away: its reflection is behind the ball
    const x = (a / Math.PI) * (W + 200) - 100;
    const y = f.y * H + Math.sin(a * 2 + f.tw) * 18;
    const tw = 0.55 + 0.45 * Math.sin(t * 6 + f.tw);
    const alpha = (0.6 + flash * 0.35) * tw * Math.sin(a);
    const g = ctx.createRadialGradient(x, y, 0, x, y, f.size);
    const col = f.white ? '255, 255, 255' : hexToRgb(f.color);
    g.addColorStop(0, `rgba(${col}, ${alpha})`);
    g.addColorStop(1, `rgba(${col}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, f.size, 0, Math.PI * 2);
    ctx.fill();
    if (f.white && alpha > 0.4) sparkle(x, y, f.size * 1.6, alpha);
    // A few beams of light from the ball to its reflection, as if through haze.
    if (f.beam) {
      const beam = ctx.createLinearGradient(cx, cy, x, y);
      beam.addColorStop(0, `rgba(${col}, ${0.16 * alpha})`);
      beam.addColorStop(1, `rgba(${col}, 0)`);
      ctx.fillStyle = beam;
      const ang = Math.atan2(y - cy, x - cx) + Math.PI / 2;
      const spread = f.size * 0.9;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x + Math.cos(ang) * spread, y + Math.sin(ang) * spread);
      ctx.lineTo(x - Math.cos(ang) * spread, y - Math.sin(ang) * spread);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();

  // String.
  ctx.strokeStyle = 'rgba(180, 186, 194, 0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W * 0.62, 0);
  ctx.lineTo(cx, cy - R);
  ctx.stroke();

  // The ball: a dark sphere, then every mirror tile facing us, lit from the
  // top left; some tiles glint white as they pass the light.
  const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
  body.addColorStop(0, '#9aa0a8');
  body.addColorStop(1, '#2b2f35');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  const tileSize = (Math.PI * R) / ROWS;
  for (const tile of tiles) {
    const lon = tile.lon + spin;
    const z = Math.cos(tile.lat) * Math.cos(lon);
    if (z <= 0.05) continue;
    const x = cx + R * Math.cos(tile.lat) * Math.sin(lon);
    const y = cy + R * Math.sin(tile.lat);
    // Normal vs. a light at the top left, plus a glint as tiles sweep past.
    const nx = Math.cos(tile.lat) * Math.sin(lon);
    const ny = Math.sin(tile.lat);
    const light = Math.max(0, -0.5 * nx - 0.6 * ny + 0.62 * z);
    const glint = Math.max(0, Math.sin(lon * 3 + tile.glint * 9 + t * 2)) ** 24;
    const v = Math.min(255, Math.round(70 + tile.shade * 120 * light + glint * 200 + flash * 90));
    ctx.fillStyle = `rgb(${v}, ${v}, ${Math.min(255, v + 12)})`;
    const w = tileSize * Math.max(0.15, Math.abs(Math.cos(lon))) * 0.86;
    const h = tileSize * Math.max(0.15, z) * 0.86;
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    if (glint > 0.85) sparkle(x, y, tileSize * 2.4, glint);
  }
  // Soft glow around it, brighter on the beat.
  const glow = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, R * 2.4);
  glow.addColorStop(0, `rgba(255, 255, 255, ${0.18 + flash * 0.3})`);
  glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 2.4, 0, Math.PI * 2);
  ctx.fill();

  // Keep the invisible stop button on top of the ball.
  if (hit.value) hit.value.style.transform = `translate(${cx - R}px, ${cy - R}px)`;
}

// A four-point star of light.
function sparkle(x, y, size, alpha) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, alpha)})`;
  for (const [dx, dy] of [[1, 0], [0, 1]]) {
    ctx.beginPath();
    ctx.moveTo(x - dx * size, y - dy * size);
    ctx.lineTo(x + dy * size * 0.12, y + dx * size * 0.12);
    ctx.lineTo(x + dx * size, y + dy * size);
    ctx.lineTo(x - dy * size * 0.12, y - dx * size * 0.12);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function hexToRgb(c) {
  const h = c.replace('#', '');
  if (h.length !== 6) return '255, 255, 255';
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(', ');
}

function stop() {
  cancelAnimationFrame(raf);
  raf = 0;
  removeEventListener('resize', resize);
}

watch(disco, async (on) => {
  stop();
  if (!on) return;
  await nextTick();
  setup();
  start = performance.now();
  drop = { y: -1 };
  gsap.to(drop, { y: 0, duration: 1.2, ease: 'bounce.out' });
  addEventListener('resize', resize);
  raf = requestAnimationFrame(frame);
}, { immediate: true });
onBeforeUnmount(stop);
</script>

<template>
  <div v-if="disco" class="disco-layer">
    <div class="spots" aria-hidden="true"></div>
    <canvas ref="canvas" class="disco-canvas" aria-hidden="true"></canvas>
    <button ref="hit" type="button" class="hit" aria-label="Stop disco mode" title="Stop the party" @click="toggleDisco"></button>
    <CursorTrail />
  </div>
</template>

<style scoped>
/* The coloured stage lights sweeping the page (fixed colours on purpose). */
.spots {
  position: fixed; inset: 0; z-index: 79; pointer-events: none; mix-blend-mode: screen; opacity: 0.55;
  background:
    radial-gradient(circle at 20% 30%, rgba(255, 80, 180, 0.35) 0 6%, transparent 12%),
    radial-gradient(circle at 70% 20%, rgba(80, 200, 255, 0.35) 0 5%, transparent 11%),
    radial-gradient(circle at 40% 75%, rgba(255, 220, 80, 0.35) 0 5%, transparent 10%),
    radial-gradient(circle at 85% 65%, rgba(120, 255, 140, 0.3) 0 6%, transparent 12%);
  background-size: 140% 140%;
  animation: sweep 3.2s ease-in-out infinite alternate, flicker 0.5s steps(2) infinite;
}
@keyframes sweep {
  0% { background-position: 0% 0%, 100% 0%, 0% 100%, 100% 100%; }
  100% { background-position: 100% 100%, 0% 100%, 100% 0%, 0% 0%; }
}
@keyframes flicker { 50% { opacity: 0.4; } }
.disco-canvas { position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: 80; pointer-events: none; }
.hit {
  position: fixed; left: 0; top: 0; z-index: 85; width: 120px; height: 120px; border-radius: 50%;
  background: transparent; border: none; padding: 0; cursor: pointer;
}
.hit:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
</style>
