<script setup>
import { computed } from 'vue';
import { spotifyUrl } from '../api.js';
import { enrichment, enriching, sync } from '../status.js';
import { FAMILY_ORDER } from '../families.js';
import ChartFrame from '../components/ChartFrame.vue';
import SoundMap from '../components/SoundMap.vue';
import TasteEras from '../components/TasteEras.vue';
import MusicAtlas from '../components/MusicAtlas.vue';
import ArtistConstellation from '../components/ArtistConstellation.vue';

const props = defineProps({ deep: Object, deepError: String });

const SOURCES = { deezer: 'Tempo · Deezer', lastfm: 'Tags and similar artists · Last.fm', musicbrainz: 'Origins and composers · MusicBrainz' };
const sources = computed(() => Object.entries(enrichment.value || props.deep?.enrichment || {}).filter(([, s]) => s.status !== 'disabled'));
const lastfmOff = computed(() => (enrichment.value || props.deep?.enrichment || {}).lastfm?.status === 'disabled');

// Table versions of the charts (the "Show as list" view).
const famName = (f) => f ?? 'other';
const soundRows = computed(() => (props.deep?.sound_map.points || []).map((p) => ({
  name: p.name, artist: p.artist, year: String(Math.floor(p.year)), bpm: Math.round(p.bpm), listeners: p.listeners, family: famName(p.family),
  links: { name: spotifyUrl('track', p.id) },
})));
const eraFamilies = computed(() => [...(props.deep?.eras.families || [])].sort((a, b) => FAMILY_ORDER.indexOf(a) - FAMILY_ORDER.indexOf(b)));
const eraColumns = computed(() => [
  { key: 'year', label: 'Year' }, { key: 'total', label: 'Likes', num: true },
  ...eraFamilies.value.map((f) => ({ key: f, label: `${f} %`, num: true })),
]);
const eraRows = computed(() => (props.deep?.eras.rows || []).map((r) => ({
  year: String(r.year), total: r.total,
  ...Object.fromEntries(eraFamilies.value.map((f) => [f, r.total ? Math.round((r.counts[f] / r.total) * 100) : 0])),
})));
const atlasRows = computed(() => (props.deep?.atlas.countries || []).map((c) => ({
  country: c.area || c.country, count: c.count, artists: c.artists.map((a) => a.name).join(', '),
})));
const constellationRows = computed(() => {
  const c = props.deep?.constellation;
  if (!c) return [];
  const names = new Map(c.nodes.map((n) => [n.id, n.name]));
  const similar = new Map();
  for (const l of c.links) {
    for (const [a, b] of [[l.source, l.target], [l.target, l.source]]) {
      if (!similar.has(a)) similar.set(a, []);
      similar.get(a).push(names.get(b));
    }
  }
  return c.nodes.map((n) => ({
    name: n.name, kind: n.ghost ? 'Suggestion' : 'In your likes', count: n.ghost ? null : n.count,
    family: n.ghost ? '—' : famName(n.family), similar: (similar.get(n.id) || []).join(', '),
    links: { name: n.spotify_id && !n.ghost ? `/artist/${n.spotify_id}` : `https://open.spotify.com/search/${encodeURIComponent(n.name)}` },
  }));
});
</script>

<template>
  <div class="stack-lg">
    <p class="intro muted">
      Your liked songs combined with public music data: tempo from Deezer, genres and similar artists from Last.fm,
      and where artists come from from MusicBrainz.
    </p>

    <div v-if="deepError" class="alert alert-error">{{ deepError }}</div>
    <div v-if="deep?.status === 'not_synced'" class="panel">
      <p class="muted">Available as soon as your library has been copied{{ sync?.status === 'running' ? ' (in progress, see the status at the bottom of the menu)' : '' }}.</p>
    </div>

    <section v-if="enriching" class="panel enrich" aria-live="polite" aria-labelledby="h-enrich">
      <h2 id="h-enrich" class="visually-hidden">Looking up public data</h2>
      <ul>
        <li v-for="[key, s] in sources" :key="key">
          <span class="dot" :class="s.status"></span>
          <span class="src">{{ SOURCES[key] }}</span>
          <template v-if="s.status === 'running'">
            <span class="progress-track"><span class="progress-fill" :style="{ width: `${s.total ? (s.done / s.total) * 100 : 0}%` }"></span></span>
            <span class="muted num">{{ s.done.toLocaleString() }} / {{ s.total.toLocaleString() }}</span>
          </template>
          <span v-else-if="s.status === 'completed'" class="muted">done</span>
        </li>
      </ul>
      <p class="muted small">Charts fill in as data arrives. The first run can take 10–15 minutes; later runs only look up what's new.</p>
    </section>

    <div v-if="lastfmOff" class="alert alert-warn" role="status">
      Last.fm isn't configured on the metadata service (LASTFM_API_KEY), so genres, taste eras and the artist constellation stay empty.
    </div>

    <template v-if="deep?.status === 'ok'">
      <section class="panel" aria-labelledby="h-sound">
        <div class="panel-head">
          <h2 id="h-sound">Sound map</h2>
          <p>Every song with a known tempo: when it was released, how fast it is, and how popular.</p>
        </div>
        <ChartFrame v-if="deep.sound_map.points.length" label="Sound map: songs by release year and tempo" :rows="soundRows"
          :columns="[{ key: 'name', label: 'Song' }, { key: 'artist', label: 'Artist' }, { key: 'year', label: 'Released', num: true }, { key: 'bpm', label: 'BPM', num: true }, { key: 'listeners', label: 'Last.fm listeners', num: true }, { key: 'family', label: 'Genre' }]">
          <SoundMap :points="deep.sound_map.points" />
        </ChartFrame>
        <p v-else class="muted">Waiting for tempo data from Deezer…</p>
        <p class="source">Tempo known for {{ deep.sound_map.coverage.with_bpm.toLocaleString() }} of {{ deep.sound_map.coverage.songs.toLocaleString() }} songs. Sources: Deezer, Last.fm.</p>
      </section>

      <section class="panel" aria-labelledby="h-eras">
        <div class="panel-head">
          <h2 id="h-eras">Taste eras</h2>
          <p>Which genres you liked, year by year.</p>
        </div>
        <ChartFrame v-if="deep.eras.rows.length" label="Taste eras: share of likes per genre family and year" :rows="eraRows" :columns="eraColumns">
          <TasteEras :families="deep.eras.families" :rows="deep.eras.rows" />
        </ChartFrame>
        <p v-else class="muted">Waiting for tags from Last.fm…</p>
      </section>

      <section class="panel" aria-labelledby="h-atlas">
        <div class="panel-head">
          <h2 id="h-atlas">Music atlas</h2>
          <p>Where the artists you like come from.</p>
        </div>
        <ChartFrame v-if="deep.atlas.countries.length" label="Music atlas: likes per artist country" :rows="atlasRows"
          :columns="[{ key: 'country', label: 'Country' }, { key: 'count', label: 'Likes', num: true }, { key: 'artists', label: 'Top artists' }]">
          <MusicAtlas :countries="deep.atlas.countries" :known="deep.atlas.known" :total="deep.atlas.total" />
        </ChartFrame>
        <p v-else class="muted">Waiting for artist origins from MusicBrainz…</p>
      </section>

      <section class="panel" aria-labelledby="h-const">
        <div class="panel-head">
          <h2 id="h-const">Artist constellation</h2>
          <p>Your artists linked by similarity, and similar artists you don't have yet.</p>
        </div>
        <ChartFrame v-if="deep.constellation.nodes.length" label="Artist constellation: your artists and similar ones" :rows="constellationRows"
          :columns="[{ key: 'name', label: 'Artist' }, { key: 'kind', label: 'Type' }, { key: 'count', label: 'Likes', num: true }, { key: 'family', label: 'Genre' }, { key: 'similar', label: 'Similar to' }]">
          <ArtistConstellation :nodes="deep.constellation.nodes" :links="deep.constellation.links" />
        </ChartFrame>
        <p v-else class="muted">Waiting for similar artists from Last.fm…</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.stack-lg { display: flex; flex-direction: column; gap: 28px; }
.intro { margin: -8px 0 0; max-width: 70ch; }
.enrich ul { list-style: none; margin: 0 0 8px; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 14px; }
.enrich li { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.enrich .src { min-width: 260px; }
.enrich .progress-track { width: 140px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--faint); }
.dot.running { background: var(--mark); }
.dot.completed { background: var(--good); }
.dot.error { background: var(--danger-text); }
@media (max-width: 640px) { .enrich .src { min-width: 0; flex-basis: 100%; } }
</style>
