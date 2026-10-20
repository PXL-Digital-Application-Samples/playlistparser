<script setup>
import { ref, watch, onBeforeUnmount, nextTick } from 'vue';
import { gsap } from 'gsap';
import { current, status, progress, bpm, spectrum, stop, close, play } from '../player.js';
import { motionOn } from '../motion.js';
import Icon from './Icon.vue';

// The record player: a card in the corner with the cover as a sleeve, a
// vinyl that slides out and spins while the preview plays, and bars around
// the record that follow the music.
const dock = ref(null);
const vinyl = ref(null);
const canvas = ref(null);
let raf = 0;
let colors = null;

const LABELS = {
  loading: 'Finding a preview…',
  none: 'No preview for this song on Deezer.',
  error: "Couldn't play this preview.",
};

watch(current, async (c, prev) => {
  if (!c || prev) return;
  await nextTick();
  if (motionOn()) gsap.from(dock.value, { y: 140, opacity: 0, rotation: -4, duration: 0.7, ease: 'back.out(1.7)' });
});

watch(status, (s) => {
  if (!vinyl.value) return;
  const out = s === 'playing' || s === 'loading';
  if (motionOn()) gsap.to(vinyl.value, { x: out ? 46 : 0, duration: out ? 0.6 : 0.4, ease: out ? 'back.out(1.4)' : 'power2.in' });
  else gsap.set(vinyl.value, { x: out ? 46 : 0 });
  cancelAnimationFrame(raf);
  if (s === 'playing') raf = requestAnimationFrame(draw);
  else clear();
}, { flush: 'post' }); // after the DOM update: the dock may have just appeared

function clear() {
  const c = canvas.value;
  c?.getContext('2d').clearRect(0, 0, c.width, c.height);
}

function draw() {
  const c = canvas.value;
  const f = spectrum();
  if (!c || !f) return;
  if (!colors) {
    const cs = getComputedStyle(document.documentElement);
    colors = { mark: cs.getPropertyValue('--mark').trim(), text: cs.getPropertyValue('--text').trim() };
  }
  const ctx = c.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  if (c.width !== c.clientWidth * dpr) {
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, c.clientWidth, c.clientHeight);
  // Centre of the vinyl (it slides 46px out of the sleeve).
  const vx = 14 + 42 + Number(gsap.getProperty(vinyl.value, 'x'));
  const vy = c.clientHeight / 2;
  const bars = 48;
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.6;
  for (let i = 0; i < bars; i++) {
    // Mirror the low half of the spectrum around the circle.
    const band = f[Math.floor((i < bars / 2 ? i : bars - i) * 1.2)];
    const len = 3 + (band / 255) ** 1.4 * 30;
    const a = (i / bars) * Math.PI * 2 - Math.PI / 2;
    const r = 46;
    ctx.strokeStyle = colors.mark;
    ctx.globalAlpha = 0.45 + (band / 255) * 0.55;
    ctx.beginPath();
    ctx.moveTo(vx + Math.cos(a) * r, vy + Math.sin(a) * r);
    ctx.lineTo(vx + Math.cos(a) * (r + len), vy + Math.sin(a) * (r + len));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  raf = requestAnimationFrame(draw);
}

onBeforeUnmount(() => cancelAnimationFrame(raf));
const replay = () => current.value && play({ ...current.value, id: current.value.key });
</script>

<template>
  <aside v-if="current" ref="dock" class="dock" :class="status" aria-label="Record player">
    <div class="deck">
      <canvas ref="canvas" class="viz" aria-hidden="true"></canvas>
      <div ref="vinyl" class="vinyl" :style="{ '--spin': bpm ? `${(60 / bpm) * 4}s` : '2s' }" aria-hidden="true">
        <span class="label" :style="current.image ? { backgroundImage: `url(${current.image})` } : null"></span>
      </div>
      <div class="sleeve">
        <img v-if="current.image" :src="current.image" alt="" />
        <span v-else class="noimg"><Icon name="music" :size="26" /></span>
      </div>
    </div>
    <div class="info">
      <p class="title" :title="current.name">{{ current.name }}</p>
      <p class="artist">{{ current.artist }}</p>
      <p v-if="LABELS[status]" class="state" role="status">{{ LABELS[status] }}</p>
      <div v-else class="bar"><span :style="{ width: `${progress * 100}%` }"></span></div>
      <div class="controls">
        <button v-if="status === 'playing' || status === 'loading'" class="icon-btn" aria-label="Stop" @click="stop">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
        </button>
        <button v-else class="icon-btn" aria-label="Play again" @click="replay">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
        </button>
        <span class="src">Preview · Deezer</span>
        <button class="icon-btn" aria-label="Close the player" @click="close"><Icon name="close" :size="16" /></button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.dock {
  position: fixed; right: max(20px, env(safe-area-inset-right, 0px)); bottom: max(20px, env(safe-area-inset-bottom, 0px)); z-index: 40;
  display: flex; align-items: center; gap: 12px; width: 360px; max-width: calc(100vw - 32px);
  padding: 10px 12px 10px 0; border-radius: 18px;
  background: color-mix(in srgb, var(--surface-raised) 92%, transparent); backdrop-filter: blur(14px);
  border: 1px solid var(--border); box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
  view-transition-name: player;
}
.deck { position: relative; width: 150px; height: 112px; flex: none; }
.viz { position: absolute; inset: -14px -10px -14px 0; width: calc(100% + 10px); height: calc(100% + 28px); pointer-events: none; }
.sleeve, .vinyl { position: absolute; top: 14px; left: 14px; width: 84px; height: 84px; }
.sleeve { z-index: 2; border-radius: 6px; overflow: hidden; box-shadow: 4px 6px 16px rgba(0, 0, 0, 0.45); background: var(--surface-muted); }
.sleeve img { width: 100%; height: 100%; object-fit: cover; display: block; }
.noimg { display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; color: var(--faint); }
/* A record: grooves, a shine, and the cover as its centre label. Fixed
   colours: it's an object, the same in both themes. */
.vinyl {
  z-index: 1; border-radius: 50%;
  background:
    conic-gradient(from 30deg, transparent 0 20%, rgba(255, 255, 255, 0.14) 25%, transparent 30% 70%, rgba(255, 255, 255, 0.1) 75%, transparent 80%),
    repeating-radial-gradient(circle, #121212 0 1.5px, #1d1d1d 1.5px 3px);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
}
.label {
  position: absolute; inset: 31%; border-radius: 50%;
  background: #f0a95b center / cover;
  box-shadow: 0 0 0 2px #0b0b0b;
}
.label::after { content: ''; position: absolute; inset: 44%; border-radius: 50%; background: #0b0b0b; }
.dock.playing .vinyl { animation: spin var(--spin, 2s) linear infinite; }
@keyframes spin { to { rotate: 360deg; } }

.info { flex: 1; min-width: 0; }
.title { margin: 0; font-family: var(--font-display); font-weight: 700; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.artist { margin: 0; font-size: 13px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.state { margin: 6px 0 0; font-size: 12.5px; color: var(--muted); }
.bar { margin-top: 8px; height: 4px; border-radius: 2px; background: var(--track); overflow: hidden; }
.bar span { display: block; height: 100%; background: var(--mark); }
.controls { display: flex; align-items: center; gap: 4px; margin-top: 6px; }
.src { flex: 1; font-size: 11px; color: var(--faint); }

@media (max-width: 960px) {
  .dock { right: 16px; left: 16px; width: auto; bottom: calc(72px + env(safe-area-inset-bottom, 0px)); }
}
</style>
