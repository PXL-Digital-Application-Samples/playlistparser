<script setup>
import { computed } from 'vue';

// Share of songs per release decade as bars, with an optional second profile
// drawn as a marker on each bar (e.g. "what you play" vs "what you like").
const props = defineProps({
  main: { type: Array, required: true },     // [{ decade: '1990s', share: 0..1 }]
  compare: { type: Array, default: null },
  mainLabel: { type: String, default: 'What you play' },
  compareLabel: { type: String, default: 'What you like' },
});

const rows = computed(() => {
  const decades = [...new Set([...props.main, ...(props.compare || [])].map((d) => d.decade))].sort();
  const get = (list, d) => list?.find((x) => x.decade === d)?.share ?? 0;
  const max = Math.max(0.01, ...decades.flatMap((d) => [get(props.main, d), get(props.compare, d)]));
  return decades.map((d) => ({
    decade: d,
    main: get(props.main, d),
    compare: props.compare ? get(props.compare, d) : null,
    h: (get(props.main, d) / max) * 100,
    ch: props.compare ? (get(props.compare, d) / max) * 100 : null,
  }));
});
const peak = computed(() => [...rows.value].sort((a, b) => b.main - a.main)[0]);
const pct = (x) => `${Math.round(x * 100)}%`;
</script>

<template>
  <figure class="decades">
    <div class="plot" role="img" :aria-label="`${mainLabel} by release decade; most from the ${peak?.decade} (${pct(peak?.main ?? 0)})`">
      <div v-for="r in rows" :key="r.decade" class="col" :title="`${r.decade}: ${pct(r.main)}${r.compare !== null ? ` · ${compareLabel.toLowerCase()}: ${pct(r.compare)}` : ''}`">
        <span class="val" :class="{ peak: r === peak }">{{ pct(r.main) }}</span>
        <div class="track">
          <i class="bar" :class="{ peak: r === peak }" :style="{ height: `${r.h}%` }"></i>
          <i v-if="r.ch !== null" class="mark" :style="{ bottom: `${r.ch}%` }"></i>
        </div>
        <span class="lab">{{ r.decade }}</span>
      </div>
    </div>
    <figcaption v-if="compare" class="legend">
      <span><i class="sw bar-sw"></i>{{ mainLabel }}</span>
      <span><i class="sw mark-sw"></i>{{ compareLabel }}</span>
    </figcaption>
  </figure>
</template>

<style scoped>
.decades { margin: 0; }
.plot { display: flex; align-items: stretch; gap: 8px; height: 190px; }
.col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; }
.track { position: relative; flex: 1; width: 100%; display: flex; align-items: flex-end; }
.bar { display: block; width: 100%; border-radius: 6px 6px 2px 2px; background: var(--border-strong); min-height: 2px; }
.bar.peak { background: var(--accent); }
.mark { position: absolute; left: -3px; right: -3px; height: 3px; border-radius: 2px; background: var(--text); box-shadow: 0 0 0 2px var(--surface); }
.val { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
.val.peak { color: var(--text); font-weight: 700; }
.lab { font-size: 12px; color: var(--muted); white-space: nowrap; }
.legend { display: flex; flex-wrap: wrap; gap: 4px 16px; margin-top: 10px; font-size: 12.5px; color: var(--muted); }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.sw { display: inline-block; width: 14px; }
.bar-sw { height: 10px; border-radius: 3px; background: var(--accent); }
.mark-sw { height: 3px; border-radius: 2px; background: var(--text); }
@media (max-width: 480px) {
  .plot { gap: 4px; }
  .lab { font-size: 10.5px; }
  .val { font-size: 10.5px; }
}
</style>
