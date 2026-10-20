<script setup>
import { ref, reactive, computed, watch, inject, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { endpoints, describeError, spotifyUrl } from '../api.js';
import { plural } from '../playlistCache.js';
import StoryCards from '../components/StoryCards.vue';
import LikeCalendar from '../components/LikeCalendar.vue';
import RankRace from '../components/RankRace.vue';
import ListeningClock from '../components/ListeningClock.vue';
import BarList from '../components/BarList.vue';
import TasteFingerprint from '../components/TasteFingerprint.vue';
import CoverWall from '../components/CoverWall.vue';
import CoverGrid from '../components/CoverGrid.vue';
import SyncStatus from '../components/SyncStatus.vue';
import SoundMap from '../components/SoundMap.vue';
import TasteEras from '../components/TasteEras.vue';
import MusicAtlas from '../components/MusicAtlas.vue';
import ArtistConstellation from '../components/ArtistConstellation.vue';
import ChartFrame from '../components/ChartFrame.vue';
import LensToggle from '../components/LensToggle.vue';
import { familyColor, FAMILY_ORDER } from '../families.js';
import { lens as lensKey } from '../settings.js';

const props = defineProps({ me: Object, meLoading: Boolean });
const loginUrl = inject('loginUrl');
const route = useRoute();
const router = useRouter();

const summary = ref(null);
const loading = ref(false);
const error = ref(null);

async function load() {
  if (!props.me) return;
  loading.value = true;
  error.value = null;
  try {
    summary.value = await endpoints.insightsSummary();
  } catch (e) {
    error.value = describeError(e);
  } finally {
    loading.value = false;
  }
}
watch(() => props.me, load, { immediate: true });

// ---- Lens: hand-picked songs only, or including whole-album saves -------------
// The setting is shared app-wide (settings.js); ?lens=… in a link still works.
if (route.query.lens === 'all' || route.query.lens === 'handpicked') lensKey.value = route.query.lens;
watch(lensKey, (k) => {
  router.replace({ query: k === 'all' ? { lens: 'all' } : {} });
  loadDeep();
});

// ---- Deep dive: Liked Songs + Deezer / Last.fm / MusicBrainz enrichment -------
const deep = ref(null);
const deepError = ref(null);
let deepTimer = null;
let enrichResumed = false;
const ENRICH_LABELS = { deezer: 'Tempo · Deezer', lastfm: 'Tags & similar artists · Last.fm', musicbrainz: 'Origins & composers · MusicBrainz' };
const enrichRunning = computed(() => Object.values(deep.value?.enrichment || {}).some((s) => s.status === 'running'));
async function loadDeep() {
  clearTimeout(deepTimer);
  if (!props.me) return;
  try {
    deep.value = await endpoints.insightsDeep(lensKey.value);
    deepError.value = null;
    const e = deep.value.enrichment || {};
    // Start sources that never ran, and resume ones that stalled (e.g. the
    // API restarted mid-run). Once per visit, so a failing source can't loop.
    if (deep.value.status === 'ok' && !enrichResumed && Object.values(e).some((s) => s.status === 'never' || s.status === 'error')) {
      enrichResumed = true;
      await endpoints.startEnrichment();
      deepTimer = setTimeout(loadDeep, 3000);
      return;
    }
    if (enrichRunning.value) deepTimer = setTimeout(loadDeep, 8000); // refresh partial results
  } catch (e) {
    deepError.value = describeError(e);
  }
}
watch(() => props.me, loadDeep, { immediate: true });
onBeforeUnmount(() => clearTimeout(deepTimer));
const lens = computed(() => summary.value?.lenses?.[lensKey.value] ?? null);
const lensUnit = computed(() => (lensKey.value === 'all' ? 'like' : 'song'));

const top = computed(() => (summary.value?.listening.top.status === 'ok' ? summary.value.listening.top.data : null));
const recent = computed(() => (summary.value?.listening.recent.status === 'ok' ? summary.value.listening.recent.data : null));
const needsReauth = computed(() =>
  summary.value && (summary.value.listening.top.status === 'reauth' || summary.value.liked_status === 'reauth')
);

const names = (t) => t.artists.map((a) => a.name).join(', ');
const fmtDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
const fmtLen = (ms) => {
  if (!ms) return '—';
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// ---- Taste profile ----------------------------------------------------------------
const taste = computed(() => summary.value?.taste);
const fpMain = computed(() => taste.value?.play ?? taste.value?.liked ?? null);
const fpCompare = computed(() => (taste.value?.play ? taste.value.liked : null));

const peakDecade = (p) => [...p.decades].sort((a, b) => b.share - a.share)[0]?.decade;
const profileLine = computed(() => {
  const p = fpMain.value;
  if (!p) return '';
  const parts = [`Mostly ${peakDecade(p)} music`];
  if (p.median_age_years !== null) parts.push(`typically ${Math.round(p.median_age_years)} years old`);
  if (p.artist_variety_pct !== null) parts.push(p.artist_variety_pct >= 70 ? 'spread over many artists' : p.artist_variety_pct >= 40 ? 'with a few favourite artists' : 'from a small circle of artists');
  return `${parts.join(', ')}.`;
});
const compareLine = computed(() => {
  const play = taste.value?.play;
  const liked = taste.value?.liked;
  if (!play || !liked || play.median_age_years === null || liked.median_age_years === null) return null;
  const diff = Math.round(liked.median_age_years - play.median_age_years);
  if (Math.abs(diff) < 2) return 'What you play and what you like are about the same age.';
  return diff > 0
    ? `What you play is about ${diff} years newer than what you like.`
    : `What you play is about ${-diff} years older than what you like.`;
});

// ---- Highlight cards (per lens) ----------------------------------------------------
const cards = computed(() => {
  const out = [];
  const l = lens.value;
  if (top.value?.short_term.artists[0]) {
    const now = top.value.short_term.artists[0];
    const year = top.value.long_term.artists[0];
    out.push({
      kicker: 'Your #1 artist lately', tone: 'purple', big: now.name,
      text: year && year.id !== now.id ? `Over the past year it was ${year.name}.` : 'Also your #1 over the past year.',
    });
  }
  if (top.value?.short_term.tracks[0]) {
    const t = top.value.short_term.tracks[0];
    out.push({ kicker: 'On repeat', tone: 'coral', big: t.name, text: `${names(t)}: your top song of the past 4 weeks.` });
  }
  if (l?.depth.deepest[0]) {
    const d = l.depth.deepest[0];
    out.push({ kicker: lensKey.value === 'all' ? 'Most liked artist' : 'Most hand-picked artist', tone: 'blue', big: d.name, text: `${plural(d.count, lensUnit.value)}.` });
  }
  if (l?.age.median_age_years !== null && l?.age.median_age_years !== undefined) {
    out.push({ kicker: 'Nostalgia score', tone: 'amber', big: `${l.age.median_age_years} years`, text: 'How old a song typically was when you liked it.' });
  }
  if (l?.calendar.busiest_day) {
    out.push({ kicker: 'Busiest day', tone: 'green', big: fmtDate(l.calendar.busiest_day.date), text: `${plural(l.calendar.busiest_day.count, lensUnit.value)} that day.` });
  }
  if (l?.age.oldest_when_liked) {
    const o = l.age.oldest_when_liked;
    out.push({ kicker: 'Oldest find', tone: 'purple', big: o.track.name, text: `${names(o.track)}: ${Math.round(o.age)} years old when you liked it.` });
  }
  if (l?.depth.one_like_pct !== null && l?.depth.one_like_pct !== undefined) {
    out.push({ kicker: 'Explorer', tone: 'dark', big: `${Math.round(l.depth.one_like_pct)}%`, text: `of your ${l.depth.artists_total.toLocaleString()} artists you liked just once.` });
  }
  return out;
});

// ---- Listening covers ------------------------------------------------------------------
const RANGES = [
  { key: 'short_term', label: '4 weeks' },
  { key: 'medium_term', label: '6 months' },
  { key: 'long_term', label: '1 year' },
];
const playRange = ref('short_term');
const playKind = ref('tracks');
const playItems = computed(() => {
  const data = top.value?.[playRange.value];
  if (!data) return [];
  return playKind.value === 'tracks'
    ? data.tracks.slice(0, 15).map((t) => ({ id: t.id, name: t.name, sub: names(t), image: t.image, image_lg: t.image_lg, url: spotifyUrl('track', t.id) }))
    : data.artists.slice(0, 15).map((a) => ({ id: a.id, name: a.name, sub: a.genres.slice(0, 2).join(', ') || 'artist', image: a.image, image_lg: a.image_lg, url: spotifyUrl('artist', a.id) }));
});

// ---- Songs added per month ----------------------------------------------------------
const monthChart = computed(() => {
  const months = lens.value?.over_time.months || [];
  if (!months.length) return null;
  const W = 680, H = 120;
  const bw = W / months.length;
  const max = Math.max(1, ...months.map((m) => m.count));
  return {
    W, H,
    bars: months.map((m, i) => ({ ...m, x: i * bw, w: Math.max(1, bw - 1), h: (m.count / max) * (H - 4) })),
    years: months.map((m, i) => ({ m, i })).filter(({ m }) => m.month.endsWith('-01')).map(({ m, i }) => ({ label: m.month.slice(0, 4), x: i * bw })),
  };
});

// ---- Table versions of the charts (the "Show as list" view) -------------------
const famName = (f) => f ?? 'other';
const soundRows = computed(() => (deep.value?.sound_map.points || []).map((p) => ({
  name: p.name, artist: p.artist, year: String(Math.floor(p.year)), bpm: Math.round(p.bpm), listeners: p.listeners, family: famName(p.family),
  links: { name: spotifyUrl('track', p.id) },
})));
const eraFamilies = computed(() => [...(deep.value?.eras.families || [])].sort((a, b) => FAMILY_ORDER.indexOf(a) - FAMILY_ORDER.indexOf(b)));
const eraColumns = computed(() => [
  { key: 'year', label: 'Year' }, { key: 'total', label: 'Likes', num: true },
  ...eraFamilies.value.map((f) => ({ key: f, label: `${f} %`, num: true })),
]);
const eraRows = computed(() => (deep.value?.eras.rows || []).map((r) => ({
  year: String(r.year), total: r.total,
  ...Object.fromEntries(eraFamilies.value.map((f) => [f, r.total ? Math.round((r.counts[f] / r.total) * 100) : 0])),
})));
const atlasRows = computed(() => (deep.value?.atlas.countries || []).map((c) => ({
  country: c.area || c.country, count: c.count, artists: c.artists.map((a) => a.name).join(', '),
})));
const constellationRows = computed(() => {
  const c = deep.value?.constellation;
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
    links: { name: n.spotify_id ? spotifyUrl('artist', n.spotify_id) : `https://open.spotify.com/search/${encodeURIComponent(n.name)}` },
  }));
});
const raceRows = computed(() => {
  if (!top.value) return [];
  const rank = (range, id) => {
    const i = top.value[range].artists.slice(0, 10).findIndex((a) => a.id === id);
    return i === -1 ? '—' : `#${i + 1}`;
  };
  const artists = new Map();
  for (const r of ['long_term', 'medium_term', 'short_term']) for (const a of top.value[r].artists.slice(0, 10)) artists.set(a.id, a);
  return [...artists.values()].map((a) => ({
    name: a.name, long: rank('long_term', a.id), medium: rank('medium_term', a.id), short: rank('short_term', a.id),
    links: { name: spotifyUrl('artist', a.id) },
  }));
});

// ---- Lazily loaded sections ----------------------------------------------------
// A finished sync changes the data: reload the summary and any opened section.
async function onSynced() {
  loadDeep();
  await load();
  for (const name of Object.keys(lazy)) if (lazy[name].data) fetchSection(name);
}

const lazy = reactive({
  collection: { data: null, loading: false, error: null, fn: endpoints.insightsCollection },
  overlap: { data: null, loading: false, error: null, fn: endpoints.insightsOverlap },
  unplayable: { data: null, loading: false, error: null, fn: endpoints.insightsUnplayable },
});
async function openSection(name, event) {
  if (!event.target.open || lazy[name].data || lazy[name].loading) return;
  await fetchSection(name);
}
async function fetchSection(name) {
  const s = lazy[name];
  s.loading = true;
  s.error = null;
  try {
    s.data = await s.fn();
  } catch (e) {
    s.error = describeError(e);
  } finally {
    s.loading = false;
  }
}
</script>

<template>
  <div v-if="meLoading || me" class="page">
    <header class="ins-head">
      <div>
        <h1>Insights</h1>
        <p class="muted">Your Liked Songs and listening. Spotify doesn't share play counts, so "likes" and rankings are the closest signals.</p>
        <SyncStatus v-if="me" class="sync-status" @synced="onSynced" />
      </div>
      <LensToggle
        v-if="summary?.lenses"
        :handpicked="summary.lenses.handpicked.counts.songs"
        :all="summary.lenses.all.counts.songs"
        :saves="summary.album_saves.saves"
      />
    </header>

    <div v-if="error" class="alert alert-error" role="alert">{{ error }}</div>
    <div v-if="needsReauth" class="alert alert-warn" role="status">
      Your top artists, recent plays and followed artists need extra permissions from Spotify.
      <a :href="loginUrl">Log in again</a> to include them.
    </div>

    <div v-if="loading" aria-busy="true">
      <span class="visually-hidden">Loading insights…</span>
      <div class="hero">
        <div class="skeleton" style="aspect-ratio: 1; border-radius: 50%"></div>
        <div><div class="skeleton" style="height: 28px; width: 70%"></div><div class="skeleton" style="height: 160px; margin-top: 16px; border-radius: 16px"></div></div>
      </div>
    </div>

    <template v-if="summary">
      <!-- Hero: taste fingerprint + profile -->
      <section v-if="fpMain" class="hero" aria-labelledby="h-taste">
        <TasteFingerprint
          :profile="fpMain"
          :compare="fpCompare"
          :label="taste.play ? 'What you play' : 'What you hand-picked'"
          compare-label="What you hand-picked"
        />
        <div class="hero-text">
          <p class="eyebrow">Your taste fingerprint</p>
          <h2 id="h-taste" class="hero-line">{{ profileLine }}</h2>
          <p v-if="compareLine" class="muted">{{ compareLine }}</p>
          <p v-if="!taste.play" class="muted small">
            Based on your hand-picked likes. <a :href="loginUrl">Log in again</a> to base it on what you actually play.
          </p>
          <div v-if="fpMain.top_genres.length" class="chips">
            <span v-for="g in fpMain.top_genres" :key="g.genre" class="chip">{{ g.genre }}</span>
          </div>
          <div class="facts">
            <div><strong>{{ fmtLen(fpMain.avg_length_ms) }}</strong><span>avg song</span></div>
            <div><strong>{{ fpMain.explicit_pct ?? 0 }}%</strong><span>explicit</span></div>
            <div><strong>{{ fpMain.artist_variety_pct ?? 0 }}%</strong><span>artist variety</span></div>
            <div v-if="summary.album_saves.saves"><strong>{{ summary.album_saves.saves }}</strong><span>whole albums saved</span></div>
          </div>
        </div>
      </section>

      <StoryCards v-if="cards.length" :cards="cards" class="stories" />

      <!-- What you play -->
      <section v-if="top" class="block" aria-labelledby="h-play">
        <div class="block-head">
          <h2 id="h-play">What you play</h2>
          <div class="seg" role="group" aria-label="Tracks or artists">
            <button :aria-pressed="playKind === 'tracks'" @click="playKind = 'tracks'">Songs</button>
            <button :aria-pressed="playKind === 'artists'" @click="playKind = 'artists'">Artists</button>
          </div>
          <div class="seg" role="group" aria-label="Period">
            <button v-for="r in RANGES" :key="r.key" :aria-pressed="playRange === r.key" @click="playRange = r.key">{{ r.label }}</button>
          </div>
        </div>
        <CoverGrid :items="playItems" />
        <details class="inline-more">
          <summary>How your top artists moved</summary>
          <ChartFrame label="Your top artists per period" :rows="raceRows"
            :columns="[{ key: 'name', label: 'Artist' }, { key: 'long', label: 'Past year' }, { key: 'medium', label: 'Past 6 months' }, { key: 'short', label: 'Past 4 weeks' }]">
            <RankRace :top="top" />
          </ChartFrame>
        </details>
      </section>

      <!-- Cover wall -->
      <section v-if="lens?.wall.length" class="block" aria-labelledby="h-wall">
        <div class="block-head">
          <h2 id="h-wall">Your cover wall</h2>
          <p class="muted small">Bigger cover = more {{ lensKey === 'all' ? 'likes (a whole-album save counts once)' : 'hand-picked songs' }} from that album.</p>
        </div>
        <CoverWall :albums="lens.wall" :unit="lensKey === 'all' ? 'likes' : 'songs'" />
      </section>

      <!-- Calendar + eras -->
      <section v-if="lens?.calendar.years.length" class="block" aria-labelledby="h-cal">
        <div class="block-head"><h2 id="h-cal">When you liked</h2></div>
        <LikeCalendar :by-date="lens.calendar.byDate" :years="lens.calendar.years" :covers="lens.calendar.covers" :unit="lensUnit" />
        <div class="eras" role="list" aria-label="Your eras by year">
          <article v-for="e in lens.over_time.eras" :key="e.year" class="era" role="listitem">
            <div class="era-covers">
              <a v-for="c in e.covers" :key="c.image" :href="spotifyUrl('album', c.id)" target="_blank" rel="noopener noreferrer" class="sp-cover" :title="c.name"><img :src="c.image" :alt="c.name" loading="lazy" /></a>
            </div>
            <p class="era-year">{{ e.year }} <span>{{ plural(e.total, lensUnit) }}</span></p>
            <p class="era-artists">{{ e.artists.map((a) => a.name).join(' · ') }}</p>
          </article>
        </div>
      </section>

      <!-- Deep dive -->
      <section v-if="deep?.status === 'ok'" class="block deep" aria-labelledby="h-deep">
        <div class="block-head">
          <h2 id="h-deep">Deep dive</h2>
          <p class="muted small">Your likes combined with public music data.</p>
        </div>
        <ul v-if="enrichRunning" class="enrich" aria-live="polite">
          <li v-for="(s, key) in deep.enrichment" :key="key" v-show="s.status !== 'disabled'">
            <span class="dot" :class="s.status"></span>
            {{ ENRICH_LABELS[key] }}
            <template v-if="s.status === 'running'"> · {{ s.done.toLocaleString() }} / {{ s.total.toLocaleString() }}
              <span class="track"><span class="fill" :style="{ width: `${s.total ? (s.done / s.total) * 100 : 0}%` }"></span></span>
            </template>
            <template v-else-if="s.status === 'completed'"> · done</template>
          </li>
          <li class="muted small">Results fill in as data arrives; the first run can take 10–15 minutes, later runs only look up what's new.</li>
        </ul>

        <div class="deep-grid">
          <article class="panel wide">
            <h3>Sound map</h3>
            <p class="muted small">Every song with a known tempo: when it was released, how fast it is, how popular it is.</p>
            <ChartFrame v-if="deep.sound_map.points.length" label="Sound map: songs by release year and tempo" :rows="soundRows"
              :columns="[{ key: 'name', label: 'Song' }, { key: 'artist', label: 'Artist' }, { key: 'year', label: 'Released', num: true }, { key: 'bpm', label: 'BPM', num: true }, { key: 'listeners', label: 'Last.fm listeners', num: true }, { key: 'family', label: 'Genre' }]">
              <SoundMap :points="deep.sound_map.points" />
            </ChartFrame>
            <p v-else class="muted">Waiting for tempo data from Deezer…</p>
            <p class="muted small">Tempo known for {{ deep.sound_map.coverage.with_bpm.toLocaleString() }} of {{ deep.sound_map.coverage.songs.toLocaleString() }} songs.</p>
          </article>

          <article class="panel wide">
            <h3>Taste eras</h3>
            <ChartFrame v-if="deep.eras.rows.length" label="Taste eras: share of likes per genre family and year" :rows="eraRows" :columns="eraColumns">
              <TasteEras :families="deep.eras.families" :rows="deep.eras.rows" />
            </ChartFrame>
            <p v-else class="muted">Waiting for tags from Last.fm…</p>
          </article>

          <article class="panel wide">
            <h3>Music atlas</h3>
            <ChartFrame v-if="deep.atlas.countries.length" label="Music atlas: likes per artist country" :rows="atlasRows"
              :columns="[{ key: 'country', label: 'Country' }, { key: 'count', label: 'Likes', num: true }, { key: 'artists', label: 'Top artists' }]">
              <MusicAtlas :countries="deep.atlas.countries" :known="deep.atlas.known" :total="deep.atlas.total" />
            </ChartFrame>
            <p v-else class="muted">Waiting for artist origins from MusicBrainz…</p>
          </article>

          <article class="panel wide">
            <h3>Artist constellation</h3>
            <ChartFrame v-if="deep.constellation.nodes.length" label="Artist constellation: your artists and similar ones" :rows="constellationRows"
              :columns="[{ key: 'name', label: 'Artist' }, { key: 'kind', label: 'Type' }, { key: 'count', label: 'Likes', num: true }, { key: 'family', label: 'Genre' }, { key: 'similar', label: 'Similar to' }]">
              <ArtistConstellation :nodes="deep.constellation.nodes" :links="deep.constellation.links" />
            </ChartFrame>
          </article>
        </div>
      </section>
      <div v-if="deepError" class="alert alert-error">{{ deepError }}</div>

      <!-- Listening clock + recent -->
      <section v-if="recent?.length" class="block two" aria-labelledby="h-clock">
        <div>
          <h2 id="h-clock">When you listen</h2>
          <ListeningClock :plays="recent" />
        </div>
        <div>
          <h2>Recently played</h2>
          <div class="recent-strip">
            <a v-for="p in recent.slice(0, 12)" :key="p.played_at" :href="spotifyUrl('track', p.track.id)" target="_blank" rel="noopener noreferrer" class="sp-cover" :title="`${p.track.name} · ${names(p.track)}`">
              <img v-if="p.track.image" :src="p.track.image" alt="" loading="lazy" />
              <span class="recent-cap">{{ p.track.name }}</span>
            </a>
          </div>
        </div>
      </section>

      <h2 class="more-title">More</h2>

      <details v-if="deep?.tags?.length" class="more">
        <summary>Genres (Last.fm tags)</summary>
        <div class="more-body">
          <p class="muted small">The three strongest tags of each artist, counted per {{ lensUnit }}.</p>
          <div class="tag-cloud">
            <span v-for="t in deep.tags" :key="t.tag" class="tag" :style="{ '--c': familyColor(t.family), fontSize: `${12 + Math.min(14, Math.sqrt(t.count) * 1.6)}px` }">
              {{ t.tag }} <small>{{ t.count }}</small>
            </span>
          </div>
        </div>
      </details>

      <details v-if="deep?.classical?.length" class="more">
        <summary>Classical corner</summary>
        <div class="more-body">
          <p class="muted small">Composers and works behind your classical recordings (MusicBrainz), with the performers you liked them by.</p>
          <div class="composers">
            <article v-for="c in deep.classical" :key="c.name" class="composer">
              <h4>{{ c.name }} <span class="muted">{{ plural(c.count, lensUnit) }}</span></h4>
              <p class="small">{{ c.works.map((w) => w.title).join(' · ') }}</p>
              <p v-if="c.performers.length" class="muted small">Performed by {{ c.performers.map((p) => p.name).join(', ') }}</p>
            </article>
          </div>
        </div>
      </details>

      <details v-if="summary.album_saves.saves" class="more">
        <summary>Whole-album saves ({{ summary.album_saves.saves }} albums, {{ plural(summary.album_saves.songs, 'song') }})</summary>
        <div class="more-body">
          <p class="muted small">
            Saving an album on Spotify can add every track to Liked Songs. These {{ summary.album_saves.saves }} saves
            (5+ songs from one album within a minute) are left out of the hand-picked view, and count as one like each in the other view.
          </p>
          <div class="album-row">
            <a v-for="a in summary.album_saves.biggest" :key="a.name + a.added_at" :href="spotifyUrl('album', a.id)" target="_blank" rel="noopener noreferrer" class="sp-cover album-card">
              <img v-if="a.image" :src="a.image" alt="" loading="lazy" />
              <span class="cap"><strong>{{ a.name }}</strong><span>{{ a.artist }} · {{ a.songs }} songs · {{ a.added_at.slice(0, 10) }}</span></span>
            </a>
          </div>
        </div>
      </details>

      <details v-if="lens" class="more">
        <summary>Your library over time</summary>
        <div class="more-body">
          <p class="muted small">{{ lensKey === 'all' ? 'Likes' : 'Hand-picked songs' }} per month. Peak: {{ lens.over_time.busiest_month?.month }} ({{ plural(lens.over_time.busiest_month?.count ?? 0, lensUnit) }}).</p>
          <div v-if="monthChart" class="chart-scroll">
            <svg :viewBox="`0 0 ${monthChart.W} ${monthChart.H + 16}`" width="100%" role="img" aria-label="Likes per month">
              <rect v-for="b in monthChart.bars" :key="b.month" :x="b.x" :y="monthChart.H - b.h" :width="b.w" :height="b.h" rx="1" fill="#1db954">
                <title>{{ b.month }}: {{ plural(b.count, lensUnit) }} ({{ b.cumulative.toLocaleString() }} total)</title>
              </rect>
              <line x1="0" :y1="monthChart.H" :x2="monthChart.W" :y2="monthChart.H" stroke="var(--border)" />
              <text v-for="y in monthChart.years" :key="y.label" :x="y.x" :y="monthChart.H + 13" class="axis">{{ y.label }}</text>
            </svg>
          </div>
        </div>
      </details>

      <details v-if="lens" class="more">
        <summary>Music age and taste</summary>
        <div class="more-body grid-2">
          <div>
            <h3>How old songs were when you liked them</h3>
            <BarList :rows="lens.age.age_buckets.map((b) => ({ label: b.label, value: b.count }))" unit="songs" color="#7f6bd8" />
            <p class="muted small">Median: {{ lens.age.median_age_years }} years. {{ lens.age.same_year_pct }}% were liked in their release year.</p>
          </div>
          <div>
            <h3>Song length</h3>
            <BarList :rows="lens.age.length_buckets.map((b) => ({ label: b.label, value: b.count }))" unit="songs" />
            <h3>Explicit songs per release decade</h3>
            <BarList :rows="lens.age.explicit_by_decade.map((d) => ({ label: d.decade, value: d.pct, sub: plural(d.total, 'song') }))" unit="%" :max="100" color="#e8590c" />
          </div>
        </div>
      </details>

      <details v-if="lens" class="more">
        <summary>Artists and albums</summary>
        <div class="more-body grid-2">
          <div>
            <h3>Most liked artists</h3>
            <BarList :rows="lens.depth.deepest.map((a) => ({ label: a.name, value: a.count, href: spotifyUrl('artist', a.id) }))" :unit="lensUnit + 's'" color="#7f6bd8" />
            <h3>How deep you go per artist</h3>
            <BarList :rows="lens.depth.buckets.map((b) => ({ label: b.label, value: b.count }))" unit="artists" />
            <p class="muted small">Your top 10 artists account for {{ lens.depth.top10_share_pct }}% of your {{ lensUnit }}s.</p>
          </div>
          <div>
            <h3>Albums you liked (almost) completely</h3>
            <p v-if="!lens.depth.complete_albums.length" class="muted">None: no album with 4+ songs is 80% liked{{ lensKey === 'handpicked' ? ' song by song' : '' }}.</p>
            <ul v-else class="plain-list">
              <li v-for="a in lens.depth.complete_albums" :key="a.name + a.artist">
                <a :href="spotifyUrl('album', a.id)" target="_blank" rel="noopener noreferrer" class="sp-link">{{ a.name }}</a> <span class="muted">· {{ a.artist }}</span>
                <span class="count">{{ a.liked }}/{{ a.total }} songs</span>
              </li>
            </ul>
          </div>
        </div>
      </details>

      <details class="more" @toggle="openSection('collection', $event)">
        <summary>Followed artists and saved albums</summary>
        <div class="more-body">
          <p v-if="lazy.collection.loading" class="muted">Loading your followed artists and albums…</p>
          <div v-if="lazy.collection.error" class="alert alert-error">{{ lazy.collection.error }}</div>
          <template v-if="lazy.collection.data">
            <p v-if="lazy.collection.data.follow.status === 'reauth'" class="muted">
              <a :href="loginUrl">Log in again</a> to compare with the artists you follow.
            </p>
            <div v-else class="grid-2">
              <div>
                <h3>You love them, but don't follow them</h3>
                <p class="muted small">5+ likes (an album save counts once), not followed on Spotify.</p>
                <ul class="plain-list">
                  <li v-for="a in lazy.collection.data.follow.loved_not_followed" :key="a.id"><a :href="spotifyUrl('artist', a.id)" target="_blank" rel="noopener noreferrer" class="sp-link">{{ a.name }}</a> <span class="count">{{ plural(a.count, 'like') }}</span></li>
                </ul>
              </div>
              <div>
                <h3>You follow them, but never liked a song</h3>
                <p class="muted small">{{ lazy.collection.data.follow.followed_never_liked_total }} of the {{ lazy.collection.data.follow.followed_total }} artists you follow.</p>
                <div class="avatar-row">
                  <a v-for="a in lazy.collection.data.follow.followed_never_liked.slice(0, 18)" :key="a.id" :href="spotifyUrl('artist', a.id)" target="_blank" rel="noopener noreferrer" class="sp-cover avatar" :title="a.name">
                    <img v-if="a.image" :src="a.image" alt="" loading="lazy" />
                    <span>{{ a.name }}</span>
                  </a>
                </div>
              </div>
            </div>
            <template v-if="lazy.collection.data.albums.status === 'ok' && lazy.collection.data.albums.total">
              <h3>Saved albums: {{ lazy.collection.data.albums.total }} ({{ plural(lazy.collection.data.albums.tracks_total, 'song') }})</h3>
              <div class="album-row">
                <a v-for="a in lazy.collection.data.albums.recent" :key="a.id" :href="spotifyUrl('album', a.id)" target="_blank" rel="noopener noreferrer" class="sp-cover album-card">
                  <img v-if="a.image" :src="a.image" alt="" loading="lazy" />
                  <span class="cap"><strong>{{ a.name }}</strong><span>{{ a.artist }} · saved {{ a.added_at?.slice(0, 10) }}</span></span>
                </a>
              </div>
              <BarList :rows="lazy.collection.data.albums.decades.map((d) => ({ label: d.decade, value: d.count }))" unit="albums" />
            </template>
          </template>
        </div>
      </details>

      <details class="more" @toggle="openSection('collection', $event)">
        <summary>Podcasts and audiobooks</summary>
        <div class="more-body">
          <p v-if="lazy.collection.loading" class="muted">Loading…</p>
          <template v-if="lazy.collection.data?.podcasts.status === 'ok'">
            <p v-if="!lazy.collection.data.podcasts.shows_total && !lazy.collection.data.podcasts.episodes_total && !lazy.collection.data.podcasts.audiobooks_total" class="muted">
              No saved shows, episodes or audiobooks.
            </p>
            <template v-else>
              <p>
                {{ plural(lazy.collection.data.podcasts.shows_total, 'show') }} followed ·
                {{ plural(lazy.collection.data.podcasts.episodes_total, 'episode') }} saved ({{ lazy.collection.data.podcasts.episodes_hours }} hours) ·
                {{ plural(lazy.collection.data.podcasts.audiobooks_total, 'audiobook') }}
              </p>
              <div class="album-row">
                <a v-for="s in [...lazy.collection.data.podcasts.shows, ...lazy.collection.data.podcasts.audiobooks]" :key="s.id" :href="spotifyUrl(s.publisher !== undefined ? 'show' : 'audiobook', s.id)" target="_blank" rel="noopener noreferrer" class="sp-cover album-card">
                  <img v-if="s.image" :src="s.image" alt="" loading="lazy" />
                  <span class="cap"><strong>{{ s.name }}</strong><span>{{ s.publisher || s.authors }}</span></span>
                </a>
              </div>
            </template>
          </template>
        </div>
      </details>

      <details class="more" @toggle="openSection('overlap', $event)">
        <summary>Liked Songs vs. your playlists</summary>
        <div class="more-body">
          <p v-if="lazy.overlap.loading" class="muted">Loading…</p>
          <div v-if="lazy.overlap.error" class="alert alert-error">{{ lazy.overlap.error }}</div>
          <p v-if="lazy.overlap.data?.status === 'not_synced'" class="muted">
            Available as soon as your library sync (top of the page) has finished.
          </p>
          <p v-if="lazy.overlap.data?.failed_playlists?.length" class="muted small">
            {{ plural(lazy.overlap.data.failed_playlists.length, 'playlist') }} couldn't be read and {{ lazy.overlap.data.failed_playlists.length === 1 ? 'is' : 'are' }} left out:
            {{ lazy.overlap.data.failed_playlists.map((p) => p.name).join(', ') }}.
          </p>
          <div v-if="lazy.overlap.data?.status === 'ok'" class="grid-2">
            <div>
              <h3>{{ plural(lazy.overlap.data.liked_in_no_playlist, 'liked song') }} in no playlist</h3>
              <p class="muted small">Out of {{ lazy.overlap.data.liked_total.toLocaleString() }}. Most recently liked first:</p>
              <ol class="plain-list scroll-list">
                <li v-for="t in lazy.overlap.data.liked_in_no_playlist_sample" :key="t.id">
                  <a :href="spotifyUrl('track', t.id)" target="_blank" rel="noopener noreferrer" class="sp-link">{{ t.name }}</a> <span class="muted">· {{ names(t) }}</span>
                </li>
              </ol>
            </div>
            <div>
              <h3>How much of each playlist you liked</h3>
              <BarList :rows="lazy.overlap.data.playlists.slice(0, 15).map((p) => ({ label: p.name, value: p.pct, sub: plural(p.total, 'song') }))" unit="%" :max="100" color="#7f6bd8" />
            </div>
          </div>
        </div>
      </details>

      <details class="more" @toggle="openSection('unplayable', $event)">
        <summary>Unplayable songs</summary>
        <div class="more-body">
          <p v-if="lazy.unplayable.loading" class="muted">Loading…</p>
          <div v-if="lazy.unplayable.error" class="alert alert-error">{{ lazy.unplayable.error }}</div>
          <p v-if="lazy.unplayable.data?.status === 'not_synced'" class="muted">
            Available as soon as your library sync (top of the page) has finished.
          </p>
          <template v-if="lazy.unplayable.data?.status === 'ok'">
            <p v-if="!lazy.unplayable.data.total">Every song in your Liked Songs and playlists is playable.</p>
            <template v-else>
              <p>{{ plural(lazy.unplayable.data.total, 'song') }} that Spotify greys out (removed, or not available in your country):</p>
              <ul class="plain-list scroll-list">
                <li v-for="u in lazy.unplayable.data.tracks" :key="u.track.id">
                  <a :href="spotifyUrl('track', u.track.id)" target="_blank" rel="noopener noreferrer" class="sp-link">{{ u.track.name }}</a> <span class="muted">· {{ names(u.track) }} — in {{ u.in.map((p) => p.name).join(', ') }}</span>
                </li>
              </ul>
            </template>
          </template>
        </div>
      </details>
    </template>
  </div>
</template>

<style scoped>
.ins-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 12px; margin-bottom: 16px; }
.ins-head h1 { margin: 0; font-size: 2rem; }
.ins-head p { margin: 4px 0 0; max-width: 60ch; }
.sync-status { margin-top: 10px; display: inline-flex; }
.small { font-size: 13px; }

.lens, .seg { display: inline-flex; background: var(--surface-muted); border-radius: 999px; padding: 3px; }
.lens button, .seg button {
  font: inherit; font-size: 13px; font-weight: 600; border: none; background: none; color: var(--text);
  padding: 6px 14px; border-radius: 999px; cursor: pointer; white-space: nowrap;
}
.lens button span { font-weight: 400; color: var(--muted); margin-left: 4px; }
.lens button[aria-pressed='true'], .seg button[aria-pressed='true'] { background: var(--surface); box-shadow: var(--shadow); }

.hero {
  display: grid;
  grid-template-columns: minmax(240px, 360px) 1fr;
  gap: 32px;
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 24px 28px;
}
.eyebrow { margin: 0; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #0b7a3b; }
.hero-line { margin: 6px 0 8px; font-size: 1.75rem; line-height: 1.2; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0; }
.chip { font-size: 12px; padding: 3px 10px; border-radius: 999px; background: #e4ddfb; color: #2a1a6e; }
.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 10px; margin-top: 16px; }
.facts div { background: var(--surface-muted); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; }
.facts strong { font-size: 1.35rem; }
.facts span { font-size: 12px; color: var(--muted); }

.stories { margin-top: 16px; }

.block { margin-top: 28px; }
.block h2 { font-size: 1.3rem; margin: 0; }
.block-head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; margin-bottom: 12px; }
.block-head p { margin: 0; }
.block.two { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; }
.block.two h2 { margin-bottom: 12px; }

.inline-more { margin-top: 12px; }
.inline-more summary { cursor: pointer; font-weight: 600; font-size: 14px; color: var(--link); padding: 4px 0; }

.eras { display: grid; grid-auto-flow: column; grid-auto-columns: 150px; gap: 12px; overflow-x: auto; padding: 12px 0 6px; scroll-snap-type: x proximity; }
.era { scroll-snap-align: start; }
.era-covers { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; border-radius: 10px; overflow: hidden; aspect-ratio: 1; background: var(--surface-muted); }
.era-covers img { width: 100%; height: 100%; object-fit: cover; display: block; }
.era-year { margin: 6px 0 0; font-weight: 800; font-size: 1.1rem; }
.era-year span { font-weight: 400; font-size: 12px; color: var(--muted); }
.era-artists { margin: 2px 0 0; font-size: 12px; color: var(--muted); line-height: 1.35; }

.recent-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.recent-strip img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 6px; display: block; }
.recent-cap { display: block; font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px; }

.more-title { font-size: 1.1rem; margin: 36px 0 8px; }

.deep-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
.panel { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 16px 18px; min-width: 0; }
.panel h3 { margin: 0 0 2px; font-size: 1.1rem; }
.panel > p { margin: 0 0 10px; }
.enrich { list-style: none; margin: 0 0 14px; padding: 10px 14px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; font-size: 13px; }
.enrich li { display: flex; align-items: center; gap: 8px; padding: 2px 0; }
.enrich .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
.enrich .dot.running { background: #1db954; animation: pulse 1s ease-in-out infinite alternate; }
.enrich .dot.completed { background: #1db954; }
.enrich .dot.error { background: #e8590c; }
@keyframes pulse { from { opacity: 0.35; } to { opacity: 1; } }
.enrich .track { width: 120px; height: 5px; background: var(--surface-muted); border-radius: 3px; overflow: hidden; display: inline-block; }
.enrich .fill { display: block; height: 100%; background: #1db954; }
.tag-cloud { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: baseline; }
.tag { color: var(--c); font-weight: 700; }
.tag small { color: var(--muted); font-weight: 400; font-size: 11px; }
.composers { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.composer { background: var(--surface-muted); border-radius: 12px; padding: 10px 12px; }
.composer h4 { margin: 0 0 4px; }
.composer p { margin: 2px 0; }
.more { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 10px; }
.more summary { cursor: pointer; padding: 14px 18px; font-weight: 600; }
.more-body { padding: 0 18px 16px; }
.more h3 { font-size: 1rem; margin: 16px 0 8px; }

.album-row { display: grid; grid-auto-flow: column; grid-auto-columns: 120px; gap: 10px; overflow-x: auto; padding: 6px 0 10px; }
.album-card { display: block; width: 120px; }
.album-card img { width: 120px; height: 120px; object-fit: cover; border-radius: 8px; display: block; }
.album-card .cap { display: flex; flex-direction: column; font-size: 12px; margin-top: 4px; }
.album-card .cap strong, .album-card .cap span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.album-card .cap span { color: var(--muted); }

.avatar-row { display: flex; flex-wrap: wrap; gap: 10px; }
.avatar { width: 64px; text-align: center; }
.avatar-row img { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; display: block; margin: 0 auto; }
.avatar span { display: block; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px; }

.grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 8px 32px; }
.plain-list { margin: 0; padding-left: 20px; }
.plain-list li { margin-bottom: 4px; font-size: 14px; }
.count { float: right; color: var(--muted); font-variant-numeric: tabular-nums; padding-left: 8px; }
.scroll-list { max-height: 320px; overflow: auto; }
.chart-scroll { overflow-x: auto; }
.axis { font-size: 10px; fill: var(--muted); }

@media (max-width: 760px) {
  .hero { grid-template-columns: 1fr; padding: 16px; }
  .hero-line { font-size: 1.35rem; }
}
</style>
