<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { endpoints, describeError } from '../api.js';
import { plural } from '../playlistCache.js';
import { lens } from '../settings.js';
import { overview, sync, syncing, syncVersion, ago } from '../status.js';
import { highlightCards } from '../highlights.js';
import { tintFromCover } from '../backdrop.js';
import { playIntro } from '../intro.js';
import { burstFrom } from '../confetti.js';
import { INSIGHT_TABS } from '../nav.js';
import Icon from '../components/Icon.vue';
import StoryCards from '../components/StoryCards.vue';
import { heroName } from '../transitions.js';

const props = defineProps({ me: Object, meLoading: Boolean });
const root = ref(null);

const summary = ref(null);
const error = ref(null);
async function loadSummary() {
  if (!props.me) return;
  try {
    summary.value = await endpoints.insightsSummary();
  } catch (e) {
    error.value = describeError(e);
  }
}
watch(() => props.me, loadSummary, { immediate: true });
watch(syncVersion, loadSummary);

const cards = computed(() => highlightCards(summary.value, lens.value).slice(0, 4));
// The opening sequence waits for the highlight cards, so they can be dealt in.
let introDone = false;
watch(() => [props.me, cards.value.length], async ([me, n]) => {
  if (introDone || !me || !n) return;
  introDone = true;
  await nextTick();
  playIntro(root.value);
});
const topArtists = computed(() => {
  const top = summary.value?.listening?.top;
  return top?.status === 'ok' ? top.data.short_term.artists.slice(0, 8) : [];
});
const totals = computed(() => overview.value?.totals);
// The background takes the colour of your #1 artist lately.
watch(() => topArtists.value[0]?.image, (url) => url && tintFromCover(url), { immediate: true });
const health = computed(() => overview.value?.health);
const firstName = computed(() => (props.me?.displayName || '').split(' ')[0]);

const EXPLORE = {
  taste: 'Decades, song age, genres and the albums you liked most.',
  listening: 'Your top songs and artists over 4 weeks, 6 months and a year.',
  timeline: 'When you liked what: calendar, yearly eras and growth.',
  discover: 'Tempo, origins and similar artists from public music data.',
};
</script>

<template>
  <div ref="root" class="page">
    <header class="dash-head">
      <p class="eyebrow">Your library</p>
      <h1 class="greeting" title="Click me" @click="burstFrom($event.currentTarget, { count: 120 })">{{ firstName ? `Hi, ${firstName}.` : 'Your library' }}</h1>
      <p v-if="totals" class="muted">
        {{ plural(totals.songs, 'song') }} across {{ plural(totals.playlists, 'playlist') }} and your Liked Songs<template v-if="sync?.finished_at"> · synced {{ ago(sync.finished_at) }}</template>.
      </p>
    </header>

    <div v-if="error" class="alert alert-error" role="alert">{{ error }}</div>

    <section v-if="!totals" class="panel first-sync" aria-live="polite">
      <template v-if="syncing">
        <h2>Copying your library</h2>
        <p class="muted">
          Reading your playlists and Liked Songs from Spotify<template v-if="sync.total">: {{ sync.done }} of {{ sync.total }}</template>.
          The overview fills in when it's done; everything else already works.
        </p>
        <span class="progress-track bar"><span class="progress-fill" :style="{ width: `${sync.total ? (sync.done / sync.total) * 100 : 5}%` }"></span></span>
      </template>
      <template v-else-if="!meLoading">
        <div class="skeleton" style="height: 88px"></div>
      </template>
    </section>

    <section v-if="totals" v-reveal="'count'" class="tiles totals" aria-label="Totals">
      <div class="tile"><span class="label">Songs</span><strong>{{ totals.songs.toLocaleString() }}</strong><span class="sub">in all playlists and likes</span></div>
      <router-link to="/playlist/liked" class="tile tile-link"><span class="label">Liked Songs</span><strong>{{ (totals.liked ?? 0).toLocaleString() }}</strong><span class="sub">open <Icon name="chevron-right" :size="12" /></span></router-link>
      <router-link to="/playlists" class="tile tile-link"><span class="label">Playlists</span><strong>{{ totals.playlists }}</strong><span class="sub">you own or share</span></router-link>
      <div class="tile"><span class="label">Artists</span><strong>{{ totals.artists.toLocaleString() }}</strong><span class="sub">{{ plural(totals.albums, 'album') }}</span></div>
      <div class="tile"><span class="label">Music</span><strong>{{ totals.hours.toLocaleString() }} h</strong><span class="sub">to play it all once</span></div>
    </section>

    <div class="dash-grid">
      <section v-if="cards.length" class="dash-highlights" aria-labelledby="h-high">
        <div class="section-head">
          <h2 id="h-high">Highlights</h2>
          <router-link to="/insights/taste" class="more">All highlights <Icon name="chevron-right" :size="14" /></router-link>
        </div>
        <StoryCards :cards="cards" />
      </section>

      <section v-if="health" class="panel dash-health" aria-labelledby="h-health">
        <div class="section-head">
          <h2 id="h-health">Library health</h2>
          <router-link to="/health" class="more">Check <Icon name="chevron-right" :size="14" /></router-link>
        </div>
        <ul v-reveal="'count'" class="health-list">
          <li>
            <router-link to="/health#duplicates" class="health-row">
              <strong :class="{ warn: health.duplicates }">{{ health.duplicates.toLocaleString() }}</strong>
              <span>{{ health.duplicates === 1 ? 'song is' : 'songs are' }} in two or more playlists</span>
            </router-link>
          </li>
          <li>
            <router-link to="/health#unplayable" class="health-row">
              <strong :class="{ warn: health.unplayable }">{{ health.unplayable.toLocaleString() }}</strong>
              <span>{{ health.unplayable === 1 ? 'song is' : 'songs are' }} greyed out by Spotify</span>
            </router-link>
          </li>
          <li v-if="health.liked_in_no_playlist !== null">
            <router-link to="/health#orphans" class="health-row">
              <strong>{{ health.liked_in_no_playlist.toLocaleString() }}</strong>
              <span>liked {{ health.liked_in_no_playlist === 1 ? 'song is' : 'songs are' }} in no playlist</span>
            </router-link>
          </li>
        </ul>
      </section>
    </div>

    <section v-if="overview?.recent_playlists?.length" aria-labelledby="h-recent">
      <div class="section-head">
        <h2 id="h-recent">Recently added to</h2>
        <router-link to="/playlists" class="more">All playlists <Icon name="chevron-right" :size="14" /></router-link>
      </div>
      <ul v-reveal="'cascade'" class="cover-row" role="list">
        <li v-for="p in overview.recent_playlists" :key="p.id">
          <router-link :to="`/playlist/${p.id}`" class="cover-card">
            <img v-if="p.image" :src="p.image" alt="" loading="lazy" :style="heroName(`/playlist/${p.id}`)" />
            <span v-else class="noimg"><Icon name="music" :size="24" /></span>
            <strong>{{ p.name }}</strong>
            <span :title="`Newest song added ${p.last_added.slice(0, 10)}`">{{ plural(p.tracks, 'track') }} · song added {{ ago(p.last_added) }}</span>
          </router-link>
        </li>
      </ul>
    </section>

    <section v-if="topArtists.length" aria-labelledby="h-artists">
      <div class="section-head">
        <h2 id="h-artists">Your top artists lately</h2>
        <router-link to="/insights/listening" class="more">What you play <Icon name="chevron-right" :size="14" /></router-link>
      </div>
      <ul v-reveal="'cascade'" class="artist-row" role="list">
        <li v-for="(a, i) in topArtists" :key="a.id">
          <router-link :to="`/artist/${a.id}`" class="artist-card">
            <img v-if="a.image" :src="a.image" alt="" loading="lazy" :style="heroName(`/artist/${a.id}`)" />
            <span v-else class="noimg round"><Icon name="mic" :size="22" /></span>
            <strong>{{ a.name }}</strong>
            <span>#{{ i + 1 }} · past 4 weeks</span>
          </router-link>
        </li>
      </ul>
    </section>

    <section aria-labelledby="h-explore">
      <h2 id="h-explore" class="section-title">Explore your taste</h2>
      <div v-reveal="'count'" class="explore">
        <router-link v-for="t in INSIGHT_TABS" :key="t.key" :to="`/insights/${t.key}`" class="explore-card">
          <strong>{{ t.label }}</strong>
          <span>{{ EXPLORE[t.key] }}</span>
        </router-link>
      </div>
    </section>
  </div>
</template>

<style scoped>
.page > section, .dash-grid { margin-top: 32px; }
.dash-head h1 { font-size: clamp(2rem, 4vw, 2.6rem); margin: 6px 0 6px; line-height: 1.05; width: fit-content; cursor: pointer; user-select: none; }
.dash-head p.muted { margin: 0; }
.first-sync h2 { margin: 0 0 6px; font-size: 1.2rem; }
.first-sync .bar { width: 100%; max-width: 420px; margin-top: 12px; height: 6px; }

.totals { margin-top: 24px !important; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
.tile-link { color: inherit; text-decoration: none; transition: border-color 0.15s, background 0.15s; }
.tile-link:hover { border-color: var(--border-strong); background: var(--surface-raised); }
.tile .sub { display: inline-flex; align-items: center; gap: 2px; }
@media (max-width: 640px) { .totals .tile:last-child:nth-child(odd) { grid-column: span 2; } }

.section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.section-head h2, .section-title { margin: 0; font-size: 1.3rem; }
.section-title { margin-bottom: 12px; }
.more { display: inline-flex; align-items: center; gap: 2px; font-size: 14px; font-weight: 600; color: var(--link); text-decoration: none; white-space: nowrap; }
.more:hover { text-decoration: underline; }

.dash-grid { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(280px, 1fr); gap: 20px; align-items: start; }
.dash-grid > * { min-width: 0; }
.dash-health { padding-bottom: 10px; }
.health-list { list-style: none; margin: 0; padding: 0; }
.health-row {
  display: grid; grid-template-columns: 64px 1fr; align-items: baseline; gap: 10px;
  padding: 10px 6px; border-top: 1px solid var(--border); color: var(--text); text-decoration: none; border-radius: 6px;
}
.health-list li:first-child .health-row { border-top: none; }
.health-row:hover { background: var(--surface-muted); }
.health-row strong { font-family: var(--font-display); font-size: 1.5rem; font-variant-numeric: tabular-nums; text-align: right; }
.health-row strong.warn { color: var(--warn-text); }
.health-row span { color: var(--muted); font-size: 14px; }

.cover-row, .artist-row { list-style: none; margin: 0; padding: 0; display: grid; grid-auto-flow: column; gap: 14px; overflow-x: auto; scrollbar-width: thin; padding-bottom: 6px; }
.cover-row { grid-auto-columns: 158px; }
.artist-row { grid-auto-columns: 132px; }
.cover-card, .artist-card { display: flex; flex-direction: column; gap: 2px; color: inherit; text-decoration: none; min-width: 0; }
.cover-card img, .cover-card .noimg { width: 100%; aspect-ratio: 1; border-radius: var(--radius-sm); object-fit: cover; margin-bottom: 8px; background: var(--surface-muted); }
.artist-card img, .artist-card .noimg { width: 100%; aspect-ratio: 1; border-radius: 50%; object-fit: cover; margin-bottom: 8px; background: var(--surface-muted); }
.noimg { display: flex; align-items: center; justify-content: center; color: var(--faint); }
.cover-card strong, .artist-card strong { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cover-card span, .artist-card > span:last-child { font-size: 12.5px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cover-card:hover strong, .artist-card:hover strong { text-decoration: underline; }
.artist-card { text-align: center; }

.explore { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
.explore-card {
  display: flex; flex-direction: column; gap: 6px; padding: 16px 18px; border-radius: var(--radius);
  background: var(--surface); border: 1px solid var(--border); color: var(--text); text-decoration: none;
}
.explore-card:hover { border-color: var(--border-strong); background: var(--surface-raised); }
.explore-card strong { font-family: var(--font-display); font-size: 1.15rem; }
.explore-card span { font-size: 14px; color: var(--muted); }

@media (max-width: 900px) {
  .dash-grid { grid-template-columns: minmax(0, 1fr); }
}
</style>
