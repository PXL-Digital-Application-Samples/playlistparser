<script setup>
import { ref, computed } from 'vue';
import { familyColor, byFamilyOrder } from '../families.js';

// Streamgraph: share of each genre family per year you added songs, centred
// so the streams swell and shrink around a middle line.
const props = defineProps({
  families: { type: Array, required: true },
  rows: { type: Array, required: true }, // [{ year, total, counts: { family: n } }]
});

const W = 680, H = 260, PAD = 18;
const hover = ref(null);

const layers = computed(() => {
  const rows = props.rows;
  if (rows.length < 2) return [];
  const xs = rows.map((_, i) => PAD + (i / (rows.length - 1)) * (W - 2 * PAD));
  const scale = (H - 30) / 1; // shares sum to 1 per year
  const cum = rows.map(() => 0);
  // Stacked in the validated family order, so neighbouring streams stay distinguishable.
  return [...props.families].sort(byFamilyOrder).map((f) => {
    const lower = [];
    const upper = [];
    rows.forEach((r, i) => {
      const share = r.total ? r.counts[f] / r.total : 0;
      const y0 = H / 2 - scale / 2 + cum[i] * scale;
      cum[i] += share;
      lower.push([xs[i], y0]);
      upper.push([xs[i], y0 + share * scale]);
    });
    // Label where the stream is thickest.
    let best = 0;
    rows.forEach((r, i) => { if (upper[i][1] - lower[i][1] > upper[best][1] - lower[best][1]) best = i; });
    return {
      f,
      d: `${smooth(lower)} L${upper.at(-1)[0]},${upper.at(-1)[1]} ${smooth([...upper].reverse(), true)} Z`,
      label: upper[best][1] - lower[best][1] > 16
        ? { x: Math.min(W - PAD - 60, Math.max(PAD + 60, xs[best])), y: (upper[best][1] + lower[best][1]) / 2 + 4 }
        : null,
      shares: rows.map((r) => ({ year: r.year, pct: r.total ? Math.round((r.counts[f] / r.total) * 100) : 0 })),
    };
  });
});

// Smooth path through points with horizontal-tangent cubic segments.
function smooth(pts, continueLine = false) {
  let d = continueLine ? '' : `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2;
    d += ` C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
  }
  return d;
}
const years = computed(() => props.rows.map((r, i) => ({ year: r.year, x: PAD + (i / Math.max(1, props.rows.length - 1)) * (W - 2 * PAD) })));
</script>

<template>
  <div>
    <p v-if="rows.length < 2" class="muted">Needs likes in at least two different years.</p>
    <svg v-else :viewBox="`0 0 ${W} ${H + 18}`" width="100%" role="img" aria-label="Genre families per year you added songs">
      <path
        v-for="l in layers"
        :key="l.f"
        :d="l.d"
        :style="{ fill: familyColor(l.f) }"
        :fill-opacity="hover && hover !== l.f ? 0.25 : 0.88"
        stroke="white"
        stroke-width="0.8"
        @mouseenter="hover = l.f"
        @mouseleave="hover = null"
      >
        <title>{{ l.f }}: {{ l.shares.map((s) => `${s.year} ${s.pct}%`).join(', ') }}</title>
      </path>
      <text v-for="l in layers.filter((x) => x.label)" :key="'t' + l.f" :x="l.label.x" :y="l.label.y" text-anchor="middle" class="stream-label">{{ l.f }}</text>
      <text v-for="y in years" :key="y.year" :x="y.x" :y="H + 14" text-anchor="middle" class="axis">{{ y.year }}</text>
    </svg>
    <p class="muted small">Share of your likes per year, by genre family (from the artist's Last.fm tags). Hover a stream for the percentages.</p>
  </div>
</template>

<style scoped>
.axis { font-size: 10px; fill: var(--muted); }
.stream-label { font-size: 12px; font-weight: 700; fill: #fff; pointer-events: none; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4); }
path { transition: fill-opacity 0.15s; cursor: default; }
.small { font-size: 13px; }
</style>
