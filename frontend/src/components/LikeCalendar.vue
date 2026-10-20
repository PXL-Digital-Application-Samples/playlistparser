<script setup>
import { ref, computed, watch } from 'vue';
import { plural } from '../playlistCache.js';

// GitHub-style heatmap of the days songs were liked, one year at a time.
const props = defineProps({
  byDate: { type: Object, required: true },
  years: { type: Array, required: true },
  covers: { type: Object, default: () => ({}) }, // date -> [cover urls]
  unit: { type: String, default: 'song' },
});
const tip = ref(null);
function showTip(c) {
  tip.value = c.count ? { ...c, covers: props.covers[c.key] || [] } : null;
}

const year = ref(props.years.at(-1));
watch(() => props.years, (ys) => { if (!ys.includes(year.value)) year.value = ys.at(-1); });

const CELL = 12;
const GAP = 3;
const STEP = CELL + GAP;
const SHADES = ['var(--heat-0)', 'var(--seq-1)', 'var(--seq-2)', 'var(--seq-4)', 'var(--seq-5)'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const grid = computed(() => {
  const y = year.value;
  const start = new Date(Date.UTC(y, 0, 1));
  const offset = (start.getUTCDay() + 6) % 7; // Monday-first rows
  const cells = [];
  const monthStarts = [];
  let total = 0;
  let best = null;
  for (let d = new Date(start); d.getUTCFullYear() === y; d.setUTCDate(d.getUTCDate() + 1)) {
    const dayIndex = Math.round((d - start) / 86_400_000) + offset;
    const key = d.toISOString().slice(0, 10);
    const count = props.byDate[key] || 0;
    total += count;
    if (!best || count > best.count) best = { date: key, count };
    const week = Math.floor(dayIndex / 7);
    if (d.getUTCDate() === 1) monthStarts.push({ week, label: MONTHS[d.getUTCMonth()] });
    cells.push({ key, count, x: week * STEP, y: (dayIndex % 7) * STEP + 16 });
  }
  const weeks = Math.ceil((cells.length + offset) / 7);
  return { cells, monthStarts, total, best, width: weeks * STEP, height: 7 * STEP + 16 };
});

// Levels: 0, 1, 2-3, 4-9, 10+ songs per day.
const level = (n) => (n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 9 ? 3 : 4);
</script>

<template>
  <div>
    <div class="cal-head">
      <div class="years" role="group" aria-label="Year">
        <button
          v-for="y in years"
          :key="y"
          class="year"
          :aria-pressed="y === year"
          @click="year = y"
        >{{ y }}</button>
      </div>
      <p class="muted small">
        {{ plural(grid.total, unit) }} in {{ year }}<template v-if="grid.best?.count">
          · busiest day {{ grid.best.date }} ({{ plural(grid.best.count, unit) }})</template>
      </p>
    </div>
    <div class="cal-scroll" @mouseleave="tip = null">
      <div class="cal-inner" :style="{ width: `${grid.width}px` }">
      <svg
        :viewBox="`0 0 ${grid.width} ${grid.height}`"
        :width="grid.width"
        :height="grid.height"
        role="img"
        :aria-label="`Calendar of songs liked per day in ${year}`"
      >
        <text v-for="m in grid.monthStarts" :key="m.label" :x="m.week * STEP" y="10" class="month">{{ m.label }}</text>
        <rect
          v-for="c in grid.cells"
          :key="c.key"
          :x="c.x" :y="c.y" :width="CELL" :height="CELL" rx="2.5"
          :fill="SHADES[level(c.count)]"
          @mouseenter="showTip(c)"
        ><title>{{ c.key }}: {{ plural(c.count, unit) }}</title></rect>
      </svg>
      <div
        v-if="tip"
        class="tip"
        :style="{ left: `${Math.min(tip.x, grid.width - 170)}px`, top: `${tip.y + 18}px` }"
        aria-hidden="true"
      >
        <div class="tip-covers"><img v-for="u in tip.covers" :key="u" :src="u" alt="" /></div>
        <strong>{{ tip.key }}</strong> · {{ plural(tip.count, unit) }}
      </div>
      </div>
    </div>
    <div class="legend muted small" aria-hidden="true">
      Fewer <span v-for="s in SHADES" :key="s" class="sw" :style="{ background: s }"></span> More per day
    </div>
  </div>
</template>

<style scoped>
.cal-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; }
.cal-head p { margin: 0; }
.years { display: flex; flex-wrap: wrap; gap: 4px; }
.year {
  font: inherit; font-size: 12px; padding: 3px 9px; border-radius: 999px;
  border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer;
}
.year[aria-pressed='true'] { background: var(--text); color: var(--bg); border-color: var(--text); }
.cal-scroll { overflow-x: auto; margin-top: 10px; padding-bottom: 70px; margin-bottom: -60px; }
.cal-inner { position: relative; }
.tip {
  position: absolute; z-index: 5; width: 160px; pointer-events: none;
  background: var(--tooltip-bg); color: var(--tooltip-text); border-radius: 8px; padding: 6px; font-size: 12px;
  box-shadow: var(--shadow);
}
.tip-covers { display: flex; gap: 4px; margin-bottom: 4px; }
.tip-covers img { width: 46px; height: 46px; border-radius: 4px; object-fit: cover; }
.month { font-size: 10px; fill: var(--muted); }
.legend { display: flex; align-items: center; gap: 3px; margin-top: 6px; }
.sw { width: 11px; height: 11px; border-radius: 2px; display: inline-block; }
.small { font-size: 13px; }
</style>
