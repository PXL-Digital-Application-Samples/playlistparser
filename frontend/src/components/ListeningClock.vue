<script setup>
import { computed } from 'vue';
import { plural } from '../playlistCache.js';

// When in the day the recent plays happened (your local time), as a 24-hour
// radial bar chart. Spotify only shares the last 50 plays.
const props = defineProps({ plays: { type: Array, required: true } });

const SIZE = 240;
const C = SIZE / 2;
const INNER = 42;
const OUTER = 108;

const hours = computed(() => {
  const counts = Array(24).fill(0);
  for (const p of props.plays) counts[new Date(p.played_at).getHours()]++;
  return counts;
});
const max = computed(() => Math.max(1, ...hours.value));

const bars = computed(() =>
  hours.value.map((n, h) => {
    const a0 = ((h / 24) * 360 - 90 - 6) * (Math.PI / 180);
    const a1 = ((h / 24) * 360 - 90 + 6) * (Math.PI / 180);
    const r = INNER + (OUTER - INNER) * (n / max.value);
    const p = (ang, rad) => `${C + rad * Math.cos(ang)},${C + rad * Math.sin(ang)}`;
    return { h, n, d: n ? `M${p(a0, INNER)} L${p(a0, r)} A${r},${r} 0 0 1 ${p(a1, r)} L${p(a1, INNER)} A${INNER},${INNER} 0 0 0 ${p(a0, INNER)} Z` : null };
  })
);

const labels = [0, 6, 12, 18].map((h) => {
  const a = ((h / 24) * 360 - 90) * (Math.PI / 180);
  return { h, x: C + (OUTER + 14) * Math.cos(a), y: C + (OUTER + 14) * Math.sin(a) + 4 };
});

const span = computed(() => {
  const ts = props.plays.map((p) => new Date(p.played_at)).sort((a, b) => a - b);
  if (!ts.length) return null;
  const fmt = (d) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `${fmt(ts[0])} – ${fmt(ts.at(-1))}`;
});
const peak = computed(() => {
  const h = hours.value.indexOf(max.value);
  return max.value ? `${String(h).padStart(2, '0')}:00–${String((h + 1) % 24).padStart(2, '0')}:00` : null;
});
</script>

<template>
  <div class="clock">
    <!-- Margin around the clock face so the hour labels outside it aren't cut off. -->
    <svg :viewBox="`-24 -12 ${SIZE + 48} ${SIZE + 24}`" :width="SIZE + 48" :height="SIZE + 24" class="clock-svg" role="img"
      :aria-label="`Recent plays by hour of day; most plays between ${peak}`">
      <circle :cx="C" :cy="C" :r="OUTER" fill="none" stroke="var(--border)" stroke-dasharray="2 4" />
      <circle :cx="C" :cy="C" :r="INNER" fill="none" stroke="var(--border)" />
      <path v-for="b in bars" :key="b.h" v-show="b.d" :d="b.d || ''" :style="{ fill: 'var(--accent)' }">
        <title>{{ String(b.h).padStart(2, '0') }}:00 — {{ plural(b.n, 'play') }}</title>
      </path>
      <text v-for="l in labels" :key="l.h" :x="l.x" :y="l.y" text-anchor="middle" class="hour">{{ String(l.h).padStart(2, '0') }}h</text>
      <text :x="C" :y="C - 2" text-anchor="middle" class="center-big">{{ plays.length }}</text>
      <text :x="C" :y="C + 14" text-anchor="middle" class="center-small">plays</text>
    </svg>
    <div class="clock-text">
      <p v-if="peak"><strong>Most plays:</strong> {{ peak }}</p>
      <p class="muted small">Your last {{ plays.length }} plays ({{ span }}), in your local time. Spotify doesn't share older plays.</p>
    </div>
  </div>
</template>

<style scoped>
.clock { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; }
.clock-svg { max-width: 100%; height: auto; }
.clock-text { flex: 1; min-width: 180px; }
.clock-text p { margin: 4px 0; }
.hour { font-size: 10px; fill: var(--muted); }
.center-big { font-size: 22px; font-weight: 700; fill: var(--text); }
.center-small { font-size: 11px; fill: var(--muted); }
.small { font-size: 13px; }
</style>
