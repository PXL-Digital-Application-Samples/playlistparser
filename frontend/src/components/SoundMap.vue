<script setup>
import { ref, computed } from 'vue';
import { spotifyUrl } from '../api.js';
import { familyColor, FAMILY_ORDER } from '../families.js';

// Every song with a known tempo: release year (x) vs BPM (y), dot size =
// Last.fm listeners, colour = genre family. Hover for details, click to play.
const props = defineProps({ points: { type: Array, required: true } });

const W = 680, H = 380, L = 40, R = 10, T = 10, B = 28;
const BPM_MIN = 50, BPM_MAX = 210;

const hidden = ref(new Set());
const hover = ref(null);
// Pointing at (or focusing) a legend chip highlights that family, so identity
// never depends on telling eight colours apart.
const spot = ref(null);

const yearRange = computed(() => {
  const ys = props.points.map((p) => p.year);
  return [Math.floor(Math.min(...ys) / 10) * 10, Math.ceil((Math.max(...ys) + 0.5) / 5) * 5];
});
const x = (year) => L + ((year - yearRange.value[0]) / (yearRange.value[1] - yearRange.value[0])) * (W - L - R);
const y = (bpm) => T + (1 - (Math.min(Math.max(bpm, BPM_MIN), BPM_MAX) - BPM_MIN) / (BPM_MAX - BPM_MIN)) * (H - T - B);
const r = (listeners) => (listeners ? 2 + Math.min(6, Math.sqrt(Math.log10(listeners + 1)) * 2.3) : 2.5);

const dots = computed(() =>
  props.points
    .filter((p) => !hidden.value.has(p.family ?? 'other'))
    .map((p) => ({ ...p, cx: x(p.year), cy: y(p.bpm), r: r(p.listeners), color: familyColor(p.family) }))
    .sort((a, b) => b.r - a.r)
);
const decades = computed(() => {
  const out = [];
  // Skip a tick that would sit on the right edge (its label would be cut off).
  for (let d = yearRange.value[0]; d <= yearRange.value[1] - 3; d += 10) out.push(d);
  return out;
});
const BANDS = [[50, 90, 'slow'], [90, 120, 'mid-tempo'], [120, 140, 'upbeat'], [140, 210, 'fast']];
const families = computed(() => {
  const counts = new Map();
  for (const p of props.points) counts.set(p.family ?? 'other', (counts.get(p.family ?? 'other') || 0) + 1);
  return FAMILY_ORDER.filter((f) => counts.has(f)).map((f) => ({ f, n: counts.get(f) }));
});
function toggle(f) {
  const s = new Set(hidden.value);
  s.has(f) ? s.delete(f) : s.add(f);
  hidden.value = s;
}
</script>

<template>
  <div class="sound">
    <div class="chips" role="group" aria-label="Show genre families">
      <button v-for="{ f, n } in families" :key="f" class="chip" :aria-pressed="!hidden.has(f)" @click="toggle(f)"
        @mouseenter="spot = f" @mouseleave="spot = null" @focus="spot = f" @blur="spot = null">
        <i :style="{ background: familyColor(f) }"></i>{{ f }} <span>{{ n }}</span>
      </button>
    </div>
    <div class="plot" @mouseleave="hover = null">
      <svg :viewBox="`0 0 ${W} ${H}`" width="100%" role="img" :aria-label="`${points.length} songs by release year and tempo`">
        <g v-for="[lo, hi, label] in BANDS" :key="label">
          <rect :x="L" :y="y(hi)" :width="W - L - R" :height="y(lo) - y(hi)" :style="{ fill: label === 'upbeat' ? 'var(--accent-soft)' : 'transparent' }" />
        </g>
        <g v-for="b in [60, 80, 100, 120, 140, 160, 180, 200]" :key="b">
          <line :x1="L" :x2="W - R" :y1="y(b)" :y2="y(b)" class="grid" />
          <text :x="L - 6" :y="y(b) + 4" text-anchor="end" class="axis">{{ b }}</text>
        </g>
        <text v-for="d in decades" :key="d" :x="x(d)" :y="H - 8" text-anchor="middle" class="axis">{{ d }}</text>
        <text :x="10" :y="T + 4" class="axis" transform="rotate(-90 10 14)" text-anchor="end">BPM</text>
        <a
          v-for="p in dots"
          :key="p.id"
          :href="spotifyUrl('track', p.id)"
          target="_blank"
          rel="noopener noreferrer"
          tabindex="-1"
          @mouseenter="hover = p"
          @focus="hover = p"
        >
          <circle :cx="p.cx" :cy="p.cy" :r="p.r" :fill-opacity="(hover && hover.id !== p.id) || (spot && (p.family ?? 'other') !== spot) ? 0.15 : 0.85"
            :style="{ fill: p.color, stroke: hover?.id === p.id ? 'var(--text)' : 'var(--surface)' }" :stroke-width="hover?.id === p.id ? 2 : 1" />
        </a>
        <text v-for="[, hi, label] in BANDS" :key="'b' + label" :x="W - R - 4" :y="y(hi) + 12" text-anchor="end" class="band">{{ label }}</text>
      </svg>
      <div
        v-if="hover"
        class="tip"
        :style="{ left: `${(hover.cx / W) * 100}%`, top: `${(hover.cy / H) * 100}%` }"
        :class="{ flip: hover.cx > W * 0.6 }"
      >
        <img v-if="hover.image" :src="hover.image" alt="" />
        <div>
          <strong>{{ hover.name }}</strong>
          <span>{{ hover.artist }}</span>
          <span>{{ Math.floor(hover.year) }} · {{ Math.round(hover.bpm) }} BPM<template v-if="hover.listeners"> · {{ hover.listeners.toLocaleString() }} Last.fm listeners</template></span>
        </div>
      </div>
    </div>
    <p class="muted small">Tempo from Deezer, listeners from Last.fm, genre families from Last.fm tags. Bigger dot = more listeners. Click a dot to play.</p>
  </div>
</template>

<style scoped>
.plot { position: relative; }
.grid { stroke: var(--surface-muted); stroke-width: 1; }
.axis { font-size: 10px; fill: var(--muted); }
.band { font-size: 10px; fill: var(--muted); font-style: italic; paint-order: stroke; stroke: var(--surface); stroke-width: 3px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.chip {
  display: inline-flex; align-items: center; gap: 5px; font: inherit; font-size: 12px;
  padding: 3px 10px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface);
  color: var(--text); cursor: pointer;
}
.chip i { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.chip span { color: var(--muted); }
.chip[aria-pressed='false'] { opacity: 0.45; text-decoration: line-through; }
.tip {
  position: absolute; z-index: 5; transform: translate(12px, -50%); pointer-events: none;
  display: flex; gap: 8px; align-items: center; width: 250px;
  background: var(--tooltip-bg); color: var(--tooltip-text); border-radius: 10px; padding: 8px; font-size: 12px;
  box-shadow: var(--shadow);
}
.tip.flip { transform: translate(calc(-100% - 12px), -50%); }
.tip img { width: 48px; height: 48px; border-radius: 6px; object-fit: cover; flex: none; }
.tip div { display: flex; flex-direction: column; min-width: 0; }
.tip strong, .tip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tip span { opacity: 0.8; }
.small { font-size: 13px; }
</style>
