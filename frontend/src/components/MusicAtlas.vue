<script setup>
import { ref, computed } from 'vue';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import world from 'world-atlas/countries-110m.json';
import isoCountries from 'i18n-iso-countries';

// World map: countries coloured by how many of your likes come from artists
// based there (MusicBrainz). Hover for the top artists per country.
const props = defineProps({
  countries: { type: Array, required: true }, // [{ country (ISO alpha-2), area, count, artists }]
  known: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
});

const W = 680, H = 330;
const shapes = feature(world, world.objects.countries).features.filter((f) => f.properties.name !== 'Antarctica');
const projection = geoNaturalEarth1().fitSize([W, H], { type: 'FeatureCollection', features: shapes });
const path = geoPath(projection);
const SHADES = ['#d3f2df', '#9fdcb6', '#5cc487', '#1f9d55', '#0b6b37'];
const level = (n) => (n >= 100 ? 4 : n >= 30 ? 3 : n >= 10 ? 2 : n >= 3 ? 1 : 0);

const byNumeric = computed(() => {
  const m = new Map();
  for (const c of props.countries) {
    const num = isoCountries.alpha2ToNumeric(c.country);
    if (num) m.set(num, c);
  }
  return m;
});
const paths = computed(() => shapes.map((s, i) => ({ key: `${i}`, id: s.id, name: s.properties.name, d: path(s), data: s.id ? byNumeric.value.get(s.id) ?? null : null })));
const hover = ref(null);
const tip = ref({ x: 0, y: 0 });
function move(e, p) {
  const box = e.currentTarget.ownerSVGElement.getBoundingClientRect();
  tip.value = { x: e.clientX - box.left, y: e.clientY - box.top };
  hover.value = p;
}
</script>

<template>
  <div class="atlas">
    <div class="map" @mouseleave="hover = null">
      <svg :viewBox="`0 0 ${W} ${H}`" width="100%" role="img" aria-label="World map of where your artists come from">
        <path
          v-for="p in paths"
          :key="p.key"
          :d="p.d"
          :fill="p.data ? SHADES[level(p.data.count)] : 'var(--surface-muted)'"
          :stroke="hover?.key === p.key ? 'var(--text)' : 'var(--surface)'"
          :stroke-width="hover?.key === p.key ? 1.2 : 0.5"
          @mousemove="move($event, p)"
        />
      </svg>
      <div v-if="hover" class="tip" :style="{ left: `${tip.x}px`, top: `${tip.y}px` }">
        <strong>{{ hover.data?.area || hover.name }}</strong>
        <template v-if="hover.data">
          <span>{{ hover.data.count }} {{ hover.data.count === 1 ? 'like' : 'likes' }}</span>
          <span class="artists">{{ hover.data.artists.map((a) => a.name).join(' · ') }}</span>
        </template>
        <span v-else>none of your artists</span>
      </div>
    </div>
    <ol class="top">
      <li v-for="c in countries.slice(0, 8)" :key="c.country">
        <span class="sw" :style="{ background: SHADES[level(c.count)] }"></span>
        <strong>{{ c.area || c.country }}</strong>
        <span class="muted">{{ c.count }}</span>
        <span class="muted small artists">{{ c.artists.slice(0, 2).map((a) => a.name).join(', ') }}</span>
      </li>
    </ol>
    <p class="muted small note">
      Artist origins from MusicBrainz: known for {{ known.toLocaleString() }} of {{ total.toLocaleString() }} likes.
    </p>
  </div>
</template>

<style scoped>
.atlas { display: grid; grid-template-columns: 1fr 210px; gap: 16px; align-items: start; }
.map { position: relative; }
.tip {
  position: absolute; z-index: 5; transform: translate(12px, 12px); pointer-events: none; max-width: 240px;
  display: flex; flex-direction: column; gap: 2px;
  background: #1c1f23; color: #fff; border-radius: 8px; padding: 8px 10px; font-size: 12px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
}
.tip .artists { opacity: 0.8; }
.top { list-style: none; margin: 0; padding: 0; font-size: 13px; }
.top li { display: grid; grid-template-columns: 12px 1fr auto; gap: 2px 8px; align-items: center; padding: 5px 0; border-bottom: 1px solid var(--surface-muted); }
.top .artists { grid-column: 2 / 4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sw { width: 12px; height: 12px; border-radius: 3px; }
.note { grid-column: 1 / -1; margin: 0; }
.small { font-size: 12px; }
@media (max-width: 760px) { .atlas { grid-template-columns: 1fr; } }
</style>
