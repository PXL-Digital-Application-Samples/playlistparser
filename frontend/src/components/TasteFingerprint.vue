<script setup>
import { computed } from 'vue';

// A radial "fingerprint" of a taste profile (see tasteProfile in the API):
// petals = share of songs per release decade, centre = average song length,
// outer arc = explicit share, dot ring = artist variety. An optional second
// profile is drawn as a dashed outline for comparison.
const props = defineProps({
  profile: { type: Object, required: true },
  compare: { type: Object, default: null },
  label: { type: String, default: 'What you play' },
  compareLabel: { type: String, default: 'What you like' },
});

const S = 320;
const C = S / 2;
const R0 = 46;
const R1 = 122;
const DOTS = 30;

const scale = computed(() =>
  Math.max(0.01, ...props.profile.decades.map((d) => d.share), ...(props.compare?.decades.map((d) => d.share) || []))
);

function petals(profile) {
  const n = profile.decades.length;
  return profile.decades.map((d, i) => {
    const mid = (i / n) * 2 * Math.PI - Math.PI / 2;
    const half = (Math.PI / n) * 0.82;
    const r = R0 + (R1 - R0) * (d.share / scale.value);
    const pt = (a, rad) => `${(C + rad * Math.cos(a)).toFixed(1)},${(C + rad * Math.sin(a)).toFixed(1)}`;
    return {
      decade: d.decade,
      share: d.share,
      d: d.share
        ? `M${pt(mid - half, R0)} L${pt(mid - half, r)} A${r},${r} 0 0 1 ${pt(mid + half, r)} L${pt(mid + half, R0)} A${R0},${R0} 0 0 0 ${pt(mid - half, R0)} Z`
        : null,
      label: pt(mid, R1 + 16),
    };
  });
}
const main = computed(() => petals(props.profile));
const other = computed(() => (props.compare ? petals(props.compare) : []));

const explicitArc = computed(() => {
  const pct = props.profile.explicit_pct ?? 0;
  if (!pct) return null;
  const r = R1 + 30;
  const a0 = -Math.PI / 2;
  const a1 = a0 + (Math.min(pct, 99.9) / 100) * 2 * Math.PI;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${C + r * Math.cos(a0)},${C + r * Math.sin(a0)} A${r},${r} 0 ${large} 1 ${C + r * Math.cos(a1)},${C + r * Math.sin(a1)}`;
});

const dots = computed(() => {
  const filled = Math.round(((props.profile.artist_variety_pct ?? 0) / 100) * DOTS);
  return Array.from({ length: DOTS }, (_, i) => {
    const a = (i / DOTS) * 2 * Math.PI - Math.PI / 2;
    return { x: C + (R0 - 12) * Math.cos(a), y: C + (R0 - 12) * Math.sin(a), on: i < filled };
  });
});

const fmtLen = (ms) => {
  if (!ms) return '—';
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const topDecade = computed(() => [...props.profile.decades].sort((a, b) => b.share - a.share)[0]);
</script>

<template>
  <figure class="fp">
    <svg :viewBox="`0 0 ${S} ${S}`" width="100%" role="img"
      :aria-label="`Taste fingerprint: mostly ${topDecade?.decade} music, average song ${fmtLen(profile.avg_length_ms)}, ${profile.explicit_pct ?? 0}% explicit, ${profile.artist_variety_pct ?? 0}% artist variety`">
      <circle :cx="C" :cy="C" :r="R1" fill="none" stroke="var(--border)" stroke-dasharray="1 5" />
      <circle :cx="C" :cy="C" :r="R1 + 30" fill="none" stroke="var(--surface-muted)" stroke-width="6" />
      <path v-if="explicitArc" :d="explicitArc" fill="none" stroke="#e8590c" stroke-width="6" stroke-linecap="round">
        <title>{{ profile.explicit_pct }}% explicit</title>
      </path>
      <path v-for="p in main" :key="p.decade" v-show="p.d" :d="p.d || ''" class="petal">
        <title>{{ p.decade }}: {{ Math.round(p.share * 100) }}% of {{ label.toLowerCase() }}</title>
      </path>
      <path v-for="p in other" :key="'c' + p.decade" v-show="p.d" :d="p.d || ''" class="petal-compare">
        <title>{{ p.decade }}: {{ Math.round(p.share * 100) }}% of {{ compareLabel.toLowerCase() }}</title>
      </path>
      <text v-for="p in main" :key="'l' + p.decade" :x="p.label.split(',')[0]" :y="Number(p.label.split(',')[1]) + 4" text-anchor="middle" class="dec">{{ p.decade.slice(2) }}</text>
      <circle v-for="(d, i) in dots" :key="i" :cx="d.x" :cy="d.y" r="2.4" :fill="d.on ? '#7f6bd8' : 'var(--surface-muted)'" />
      <text :x="C" :y="C + 2" text-anchor="middle" class="len">{{ fmtLen(profile.avg_length_ms) }}</text>
      <text :x="C" :y="C + 16" text-anchor="middle" class="len-sub">avg song</text>
    </svg>
    <figcaption class="legend">
      <span><i class="sw petal-sw"></i>{{ label }} by decade</span>
      <span v-if="compare"><i class="sw compare-sw"></i>{{ compareLabel }}</span>
      <span><i class="sw" style="background:#e8590c"></i>explicit {{ profile.explicit_pct ?? 0 }}%</span>
      <span><i class="sw" style="background:#7f6bd8; border-radius:50%"></i>artist variety {{ profile.artist_variety_pct ?? 0 }}%</span>
    </figcaption>
  </figure>
</template>

<style scoped>
.fp { margin: 0; }
.petal { fill: #1db954; opacity: 0.88; }
.petal-compare { fill: none; stroke: #7f6bd8; stroke-width: 2; stroke-dasharray: 4 3; }
.dec { font-size: 11px; fill: var(--muted); }
.len { font-size: 22px; font-weight: 800; fill: var(--text); }
.len-sub { font-size: 10px; fill: var(--muted); }
.legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 14px; font-size: 12px; color: var(--muted); }
.legend span { display: inline-flex; align-items: center; gap: 5px; }
.sw { width: 11px; height: 11px; border-radius: 3px; display: inline-block; }
.petal-sw { background: #1db954; }
.compare-sw { border: 2px dashed #7f6bd8; }
</style>
