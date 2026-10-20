<script setup>
import { ref, computed } from 'vue';
import { spotifyUrl } from '../api.js';

// Your top artists in three periods, oldest to newest, with lines linking the
// same artist across columns. Hover (or focus) an artist to follow them.
const props = defineProps({ top: { type: Object, required: true }, size: { type: Number, default: 10 } });

const COLUMNS = [
  { key: 'long_term', label: 'Past year' },
  { key: 'medium_term', label: 'Past 6 months' },
  { key: 'short_term', label: 'Past 4 weeks' },
];
const COL_W = 170;
const GAP = 85;
const ROW = 26;
const HEAD = 26;

const cols = computed(() =>
  COLUMNS.map((c, i) => ({
    ...c,
    x: i * (COL_W + GAP),
    artists: (props.top[c.key]?.artists || []).slice(0, props.size),
  }))
);

const rankIn = (col, id) => col.artists.findIndex((a) => a.id === id);

const links = computed(() => {
  const out = [];
  for (let i = 0; i < cols.value.length - 1; i++) {
    const a = cols.value[i];
    const b = cols.value[i + 1];
    a.artists.forEach((artist, r) => {
      const r2 = rankIn(b, artist.id);
      if (r2 === -1) return;
      const x1 = a.x + COL_W, y1 = HEAD + r * ROW + ROW / 2;
      const x2 = b.x, y2 = HEAD + r2 * ROW + ROW / 2;
      const mid = (x1 + x2) / 2;
      out.push({ id: artist.id, d: `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`, up: r2 < r, same: r2 === r });
    });
  }
  return out;
});

const isNew = (i, id) => i > 0 && rankIn(cols.value[i - 1], id) === -1;
const hovered = ref(null);
const width = 3 * COL_W + 2 * GAP;
const height = computed(() => HEAD + props.size * ROW);
const short = (s) => (s.length > 21 ? `${s.slice(0, 20)}…` : s);
</script>

<template>
  <div class="race-scroll">
    <svg :viewBox="`0 0 ${width} ${height}`" :width="width" :height="height" role="img"
      aria-label="Your top artists over the past year, 6 months and 4 weeks">
      <text v-for="c in cols" :key="c.key" :x="c.x" y="14" class="col-head">{{ c.label }}</text>
      <path
        v-for="l in links"
        :key="l.d"
        :d="l.d"
        fill="none"
        :stroke="l.same ? '#adb5bd' : l.up ? '#1db954' : '#e8590c'"
        :stroke-width="hovered === l.id ? 3 : 1.5"
        :opacity="hovered && hovered !== l.id ? 0.12 : 0.85"
      />
      <g
        v-for="(c, i) in cols"
        :key="c.key + 'g'"
      >
        <a
          v-for="(a, r) in c.artists"
          :key="a.id"
          :href="spotifyUrl('artist', a.id)"
          target="_blank"
          rel="noopener noreferrer"
          tabindex="-1"
          class="artist"
          :opacity="hovered && hovered !== a.id ? 0.3 : 1"
          @mouseenter="hovered = a.id"
          @mouseleave="hovered = null"
          @focus="hovered = a.id"
          @blur="hovered = null"
        >
          <title>{{ a.name }} — #{{ r + 1 }} in the {{ c.label.toLowerCase() }}</title>
          <text :x="c.x" :y="HEAD + r * ROW + ROW / 2 + 4" class="rank">{{ r + 1 }}</text>
          <text :x="c.x + 20" :y="HEAD + r * ROW + ROW / 2 + 4" class="name" :class="{ strong: hovered === a.id }">{{ short(a.name) }}</text>
          <text v-if="isNew(i, a.id)" :x="c.x + COL_W - 4" :y="HEAD + r * ROW + ROW / 2 + 4" class="new" text-anchor="end">new</text>
        </a>
      </g>
    </svg>
    <p class="muted small legend">
      <span class="key" style="background:#1db954"></span> rising
      <span class="key" style="background:#e8590c"></span> falling
      <span class="key" style="background:#adb5bd"></span> same rank
      · "new" = not in the previous period's top {{ size }}. Spotify only shares rankings, not play counts.
    </p>
  </div>
</template>

<style scoped>
.race-scroll { overflow-x: auto; }
.col-head { font-size: 12px; font-weight: 600; fill: var(--muted); }
.rank { font-size: 11px; fill: var(--muted); font-variant-numeric: tabular-nums; }
.name { font-size: 13px; fill: var(--text); }
.name.strong { font-weight: 700; }
.new { font-size: 10px; fill: #0b7a3b; font-weight: 600; }
.artist { cursor: pointer; }
.artist:hover .name { text-decoration: underline; }
.legend { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 6px; }
.key { width: 14px; height: 3px; border-radius: 2px; display: inline-block; }
.small { font-size: 13px; }
</style>
