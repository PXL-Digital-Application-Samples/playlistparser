<script setup>
import { ref, computed, onBeforeUnmount } from 'vue';
import { gsap } from 'gsap';
import { spotifyUrl } from '../api.js';
import { familyColor, FAMILY_ORDER } from '../families.js';
import { play } from '../player.js';
import { motionOn } from '../motion.js';

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

// Time-lapse: a year cursor sweeps from the oldest song to the newest and
// songs appear as their release year passes. Years without any (shown) songs
// go by quickly, so the time goes to the years that have something to show.
const sweep = ref(null); // current year while the time-lapse runs
let sweepTween = null;
const EMPTY_YEAR = 0.12; // share of a full year's time for a year without songs

// Maps progress 0..1 to a year, giving empty years less of the time.
function yearClock(from, to) {
  const filled = new Set(props.points.filter((p) => !hidden.value.has(p.family ?? 'other')).map((p) => Math.floor(p.year)));
  const weights = [];
  for (let yr = from; yr < to; yr++) weights.push(filled.has(yr) ? 1 : EMPTY_YEAR);
  const total = weights.reduce((a, b) => a + b, 0);
  return {
    total,
    at(t) {
      let left = t * total;
      for (let i = 0; i < weights.length; i++) {
        if (left <= weights[i]) return from + i + left / weights[i];
        left -= weights[i];
      }
      return to;
    },
  };
}

function timeLapse() {
  if (sweepTween) {
    sweepTween.kill();
    sweepTween = null;
    sweep.value = null;
    return;
  }
  const [from, to] = yearRange.value;
  const clock = yearClock(from, to);
  const state = { t: 0 };
  sweep.value = from;
  sweepTween = gsap.to(state, {
    t: 1, duration: motionOn() ? Math.min(14, Math.max(5, clock.total / 6)) : 0.01, ease: 'none',
    onUpdate: () => (sweep.value = clock.at(state.t)),
    onComplete: () => {
      sweepTween = null;
      setTimeout(() => { if (!sweepTween) sweep.value = null; }, 1200);
    },
  });
}
onBeforeUnmount(() => sweepTween?.kill());

const dots = computed(() =>
  props.points
    .filter((p) => !hidden.value.has(p.family ?? 'other'))
    .filter((p) => sweep.value === null || p.year <= sweep.value)
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
// A click plays the song's preview; Ctrl/Cmd-click still opens Spotify.
function onDot(e, p) {
  if (e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  play({ id: p.id, name: p.name, artist: p.artist, isrc: p.isrc, image: p.image, bpm: p.bpm });
}
function toggle(f) {
  const s = new Set(hidden.value);
  s.has(f) ? s.delete(f) : s.add(f);
  hidden.value = s;
}
</script>

<template>
  <div class="sound">
    <div class="toolbar">
      <button type="button" class="lapse" :aria-pressed="sweep !== null" @click="timeLapse">
        <svg v-if="sweep === null" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
        <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
        {{ sweep === null ? 'Play time-lapse' : 'Stop' }}
      </button>
    </div>
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
        <g v-if="sweep !== null" aria-hidden="true">
          <text :x="L + 14" :y="T + 64" class="year-big">{{ Math.floor(sweep) }}</text>
          <line :x1="x(sweep)" :x2="x(sweep)" :y1="T" :y2="H - B" class="sweep" />
        </g>
        <a
          v-for="p in dots"
          :key="p.id"
          :href="spotifyUrl('track', p.id)"
          target="_blank"
          rel="noopener noreferrer"
          tabindex="-1"
          @mouseenter="hover = p"
          @focus="hover = p"
          @click="onDot($event, p)"
        >
          <circle :class="{ pop: sweep !== null }" :cx="p.cx" :cy="p.cy" :r="p.r" :fill-opacity="(hover && hover.id !== p.id) || (spot && (p.family ?? 'other') !== spot) ? 0.15 : 0.85"
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
    <p class="muted small">Tempo from Deezer, listeners from Last.fm, genre families from Last.fm tags. Bigger dot = more listeners. Click a dot to hear a preview.</p>
  </div>
</template>

<style scoped>
.plot { position: relative; }
.toolbar { display: flex; margin: 0 0 10px; }
.lapse {
  display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 13px; font-weight: 650;
  padding: 5px 12px; min-height: 30px; border-radius: 999px; cursor: pointer;
  background: var(--accent); color: var(--accent-ink); border: none;
}
.lapse[aria-pressed='true'] { background: var(--surface-muted); color: var(--text); }
.year-big { font-family: var(--font-display); font-size: 64px; font-weight: 800; fill: var(--text); opacity: 0.18; }
.sweep { stroke: var(--mark); stroke-width: 2; opacity: 0.8; }
.pop { transform-box: fill-box; transform-origin: center; animation: pop 0.5s cubic-bezier(0.2, 1.8, 0.4, 1) both; }
@keyframes pop { from { transform: scale(0); } 60% { transform: scale(1.8); } to { transform: scale(1); } }
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
