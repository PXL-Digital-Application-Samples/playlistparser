<script setup>
import { computed } from 'vue';
import { plural } from '../playlistCache.js';
import LikeCalendar from '../components/LikeCalendar.vue';
import ChartFrame from '../components/ChartFrame.vue';

const props = defineProps({ summary: Object, lensKey: String });

const lens = computed(() => props.summary?.lenses?.[props.lensKey] ?? null);
const unit = computed(() => (props.lensKey === 'all' ? 'like' : 'song'));

// Songs added per month, as bars with a year label at each January.
const monthChart = computed(() => {
  const months = lens.value?.over_time.months || [];
  if (!months.length) return null;
  const W = 680, H = 140;
  const bw = W / months.length;
  const max = Math.max(1, ...months.map((m) => m.count));
  return {
    W, H, max,
    bars: months.map((m, i) => ({ ...m, x: i * bw, w: Math.max(1, bw - 1), h: (m.count / max) * (H - 4) })),
    years: months.map((m, i) => ({ m, i })).filter(({ m }) => m.month.endsWith('-01')).map(({ m, i }) => ({ label: m.month.slice(0, 4), x: i * bw })),
  };
});
const monthRows = computed(() => (lens.value?.over_time.months || []).map((m) => ({ month: m.month, count: m.count, cumulative: m.cumulative })));
</script>

<template>
  <div class="stack-lg">
    <section v-if="lens?.calendar.years.length" class="panel" aria-labelledby="h-cal">
      <div class="panel-head"><h2 id="h-cal">When you liked</h2></div>
      <LikeCalendar :by-date="lens.calendar.byDate" :years="lens.calendar.years" :covers="lens.calendar.covers" :unit="unit" />
    </section>

    <section v-if="lens?.over_time.eras.length" aria-labelledby="h-eras">
      <div class="section-head">
        <h2 id="h-eras">Your years</h2>
        <p class="muted small">The albums and artists you liked most, per year.</p>
      </div>
      <ul v-reveal="'cascade'" class="eras" role="list">
        <li v-for="e in lens.over_time.eras" :key="e.year" class="era">
          <div class="era-covers">
            <router-link v-for="c in e.covers" :key="c.image" :to="`/album/${c.id}`" class="sp-cover" :title="c.name"><img :src="c.image" :alt="c.name" loading="lazy" /></router-link>
          </div>
          <p class="era-year">{{ e.year }} <span>{{ plural(e.total, unit) }}</span></p>
          <p class="era-artists">
            <template v-for="(a, i) in e.artists" :key="a.name"><router-link v-if="a.id" :to="`/artist/${a.id}`" class="in-link">{{ a.name }}</router-link><template v-else>{{ a.name }}</template><template v-if="i < e.artists.length - 1"> · </template></template>
          </p>
        </li>
      </ul>
    </section>

    <section v-if="monthChart" class="panel" aria-labelledby="h-growth">
      <div class="panel-head">
        <h2 id="h-growth">Your library over time</h2>
        <p>{{ lensKey === 'all' ? 'Likes' : 'Hand-picked songs' }} per month. Peak: {{ lens.over_time.busiest_month?.month }} ({{ plural(lens.over_time.busiest_month?.count ?? 0, unit) }}).</p>
      </div>
      <ChartFrame label="Likes per month" :rows="monthRows"
        :columns="[{ key: 'month', label: 'Month' }, { key: 'count', label: 'Added', num: true }, { key: 'cumulative', label: 'Total so far', num: true }]">
        <div v-reveal="'svgbars'" class="chart-scroll">
          <svg :viewBox="`0 0 ${monthChart.W} ${monthChart.H + 18}`" width="100%" role="img" :aria-label="`Likes per month; most in ${lens.over_time.busiest_month?.month}`">
            <line x1="0" :y1="monthChart.H" :x2="monthChart.W" :y2="monthChart.H" class="axis-line" />
            <rect v-for="b in monthChart.bars" :key="b.month" :x="b.x" :y="monthChart.H - b.h" :width="b.w" :height="b.h" rx="1" class="bar">
              <title>{{ b.month }}: {{ plural(b.count, unit) }} ({{ b.cumulative.toLocaleString() }} total)</title>
            </rect>
            <text v-for="y in monthChart.years" :key="y.label" :x="y.x" :y="monthChart.H + 14" class="axis">{{ y.label }}</text>
          </svg>
        </div>
      </ChartFrame>
    </section>

    <section v-if="summary.album_saves.saves" class="panel" aria-labelledby="h-saves">
      <div class="panel-head">
        <h2 id="h-saves">Whole-album saves</h2>
        <p>{{ summary.album_saves.saves }} albums, {{ plural(summary.album_saves.songs, 'song') }}.</p>
      </div>
      <p class="muted small explain">
        Saving an album on Spotify can add every track to Liked Songs. A save counts as 5+ songs from one album
        within a minute. These are left out when "Count songs from saved albums" is off, and count as one like each when it's on.
      </p>
      <ul class="album-strip" role="list">
        <li v-for="a in summary.album_saves.biggest" :key="a.name + a.added_at">
          <router-link :to="`/album/${a.id}`" class="album-card">
            <img v-if="a.image" :src="a.image" alt="" loading="lazy" />
            <strong>{{ a.name }}</strong>
            <span>{{ a.artist }} · {{ a.songs }} songs · {{ a.added_at.slice(0, 10) }}</span>
          </router-link>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.stack-lg { display: flex; flex-direction: column; gap: 28px; }
.section-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 14px; margin-bottom: 12px; }
.section-head h2 { margin: 0; font-size: 1.3rem; }
.section-head p { margin: 0; }

.eras { list-style: none; margin: 0; padding: 4px 0 8px; display: grid; grid-auto-flow: column; grid-auto-columns: 158px; gap: 14px; overflow-x: auto; scroll-snap-type: x proximity; }
.era { scroll-snap-align: start; }
.era-covers { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; border-radius: 10px; overflow: hidden; aspect-ratio: 1; background: var(--cover-bg); }
.era-covers img { width: 100%; height: 100%; object-fit: cover; display: block; }
.era-year { margin: 8px 0 0; font-family: var(--font-display); font-weight: 700; font-size: 1.15rem; }
.era-year span { font-family: var(--font-body); font-weight: 400; font-size: 12px; color: var(--muted); }
.era-artists { margin: 2px 0 0; font-size: 12.5px; color: var(--muted); line-height: 1.4; }

.chart-scroll { overflow-x: auto; }
.bar { fill: var(--mark); }
.axis-line { stroke: var(--border); }
.axis { font-size: 10px; fill: var(--muted); }
.explain { max-width: 70ch; margin: 0 0 12px; }

.album-strip { list-style: none; margin: 0; padding: 4px 0 8px; display: grid; grid-auto-flow: column; grid-auto-columns: 132px; gap: 12px; overflow-x: auto; }
.album-card { display: flex; flex-direction: column; gap: 2px; color: inherit; text-decoration: none; min-width: 0; font-size: 13px; }
.album-card img { width: 132px; height: 132px; object-fit: cover; border-radius: var(--radius-sm); margin-bottom: 6px; }
.album-card strong, .album-card span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.album-card span { color: var(--muted); font-size: 12px; }
.album-card:hover strong { text-decoration: underline; }
</style>
