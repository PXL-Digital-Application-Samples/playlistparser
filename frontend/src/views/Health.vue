<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { endpoints, describeError, spotifyUrl } from '../api.js';
import { plural } from '../playlistCache.js';
import { syncVersion, sync, syncing } from '../status.js';
import Icon from '../components/Icon.vue';
import BarList from '../components/BarList.vue';
import PlayButton from '../components/PlayButton.vue';

// Library health: problems you may want to fix on Spotify. Everything here is
// read from the synced copy of your library; nothing is changed.
const props = defineProps({ me: Object, meLoading: Boolean });
const route = useRoute();

const dupes = ref(null);
const unplayable = ref(null);
const overlap = ref(null);
const error = ref(null);
const loading = ref(false);

async function load() {
  if (!props.me) return;
  loading.value = true;
  error.value = null;
  try {
    [dupes.value, unplayable.value, overlap.value] = await Promise.all([
      endpoints.libraryDuplicates(),
      endpoints.insightsUnplayable(),
      endpoints.insightsOverlap(),
    ]);
  } catch (e) {
    error.value = describeError(e);
  } finally {
    loading.value = false;
  }
  // Links like /health#unplayable land on their section once it exists.
  await nextTick();
  if (route.hash) document.querySelector(route.hash)?.scrollIntoView({ block: 'start' });
}
watch(() => props.me, load, { immediate: true });
watch(syncVersion, load);

const notSynced = computed(() => [dupes.value, unplayable.value, overlap.value].some((x) => x?.status === 'not_synced'));
const DUPES_STEP = 40;
const dupesShown = ref(DUPES_STEP);
const names = (t) => t.artists.map((a) => a.name).join(', ');
</script>

<template>
  <div v-if="meLoading || me" class="page">
    <header class="page-head">
      <div>
        <p class="eyebrow">Library health</p>
        <h1>Things worth tidying up</h1>
        <p>Songs that sit in several playlists, songs Spotify greyed out, and liked songs you never put anywhere. Nothing here changes your library; fix things on Spotify if you want to.</p>
      </div>
    </header>

    <div v-if="error" class="alert alert-error" role="alert">{{ error }}</div>
    <div v-if="notSynced" class="panel">
      <p class="muted">
        Available as soon as your library has been copied<template v-if="syncing"> ({{ sync.done }} of {{ sync.total }} playlists so far)</template>.
      </p>
    </div>
    <div v-if="loading && !dupes" class="skeleton" style="height: 240px; border-radius: 16px" aria-busy="true"></div>

    <nav v-if="dupes?.status === 'ok'" v-reveal="'count'" class="tiles summary" aria-label="Summary">
      <a href="#duplicates" class="tile tile-link">
        <span class="label">In two or more playlists</span>
        <strong :class="{ warn: dupes.total }">{{ dupes.total.toLocaleString() }}</strong>
        <span class="sub">songs</span>
      </a>
      <a v-if="unplayable?.status === 'ok'" href="#unplayable" class="tile tile-link">
        <span class="label">Greyed out by Spotify</span>
        <strong :class="{ warn: unplayable.total }">{{ unplayable.total.toLocaleString() }}</strong>
        <span class="sub">songs</span>
      </a>
      <a v-if="overlap?.status === 'ok'" href="#orphans" class="tile tile-link">
        <span class="label">Liked, in no playlist</span>
        <strong>{{ overlap.liked_in_no_playlist.toLocaleString() }}</strong>
        <span class="sub">of {{ overlap.liked_total.toLocaleString() }} liked</span>
      </a>
    </nav>

    <section v-if="dupes?.status === 'ok'" id="duplicates" class="panel" aria-labelledby="h-dupes">
      <div class="panel-head">
        <h2 id="h-dupes">The same song in several playlists</h2>
        <p>Grouped by recording, so a single and its album version count as one song. Liked Songs doesn't count as a playlist here.</p>
      </div>
      <p v-if="!dupes.total" class="ok-line"><Icon name="heart" :size="16" /> Every song is in at most one playlist.</p>
      <ul v-else class="rows" role="list">
        <li v-for="d in dupes.songs.slice(0, dupesShown)" :key="d.track.id" class="row">
          <span class="row-cover playable">
            <img v-if="d.track.image" :src="d.track.image" alt="" loading="lazy" />
            <PlayButton :track="{ id: d.track.id, name: d.track.name, artist: names(d.track), isrc: d.track.isrc, image: d.track.image }" :size="30" center />
          </span>
          <div class="row-main">
            <p class="row-title">
              <a :href="spotifyUrl('track', d.track.id)" target="_blank" rel="noopener noreferrer" class="sp-link">{{ d.track.name }}</a>
              <span v-if="d.liked" class="badge">Liked</span>
              <span v-if="d.versions > 1" class="badge" :title="`${d.versions} different releases of this recording`">{{ d.versions }} versions</span>
            </p>
            <p class="row-sub">
              <template v-for="(a, i) in d.track.artists" :key="a.id || a.name"><router-link v-if="a.id" :to="`/artist/${a.id}`" class="in-link">{{ a.name }}</router-link><template v-else>{{ a.name }}</template><template v-if="i < d.track.artists.length - 1">, </template></template>
            </p>
          </div>
          <div class="in-playlists">
            <span class="muted small">In {{ d.playlists.length }}:</span>
            <router-link v-for="p in d.playlists" :key="p.id" :to="`/playlist/${p.id}`" class="pl-chip">{{ p.name }}</router-link>
          </div>
        </li>
      </ul>
      <div v-if="dupes.songs.length > dupesShown" class="more">
        <button class="btn btn-secondary btn-sm" @click="dupesShown += DUPES_STEP">Show {{ Math.min(DUPES_STEP, dupes.songs.length - dupesShown) }} more</button>
        <span class="muted small">{{ dupesShown }} of {{ dupes.songs.length }}</span>
      </div>
    </section>

    <section v-if="unplayable?.status === 'ok'" id="unplayable" class="panel" aria-labelledby="h-unplayable">
      <div class="panel-head">
        <h2 id="h-unplayable">Greyed out by Spotify</h2>
        <p>Removed from Spotify, or not available in your country.</p>
      </div>
      <p v-if="!unplayable.total" class="ok-line"><Icon name="heart" :size="16" /> Every song in your Liked Songs and playlists is playable.</p>
      <ul v-else class="rows" role="list">
        <li v-for="u in unplayable.tracks" :key="u.track.id" class="row">
          <img v-if="u.track.image" :src="u.track.image" alt="" class="row-cover" loading="lazy" />
          <span v-else class="row-cover"></span>
          <div class="row-main">
            <p class="row-title">{{ u.track.name }}</p>
            <p class="row-sub">{{ names(u.track) }}</p>
          </div>
          <div class="in-playlists">
            <span class="muted small">In:</span>
            <router-link v-for="p in u.in" :key="p.id" :to="`/playlist/${p.id}`" class="pl-chip">{{ p.name }}</router-link>
          </div>
        </li>
      </ul>
    </section>

    <section v-if="overlap?.status === 'ok'" id="orphans" class="panel" aria-labelledby="h-orphans">
      <div class="panel-head">
        <h2 id="h-orphans">Liked songs in no playlist</h2>
        <p>{{ plural(overlap.liked_in_no_playlist, 'liked song') }} of {{ overlap.liked_total.toLocaleString() }}. Most recently liked first.</p>
      </div>
      <p v-if="overlap.failed_playlists?.length" class="muted small">
        {{ plural(overlap.failed_playlists.length, 'playlist') }} couldn't be read and {{ overlap.failed_playlists.length === 1 ? 'is' : 'are' }} left out:
        {{ overlap.failed_playlists.map((p) => p.name).join(', ') }}.
      </p>
      <div class="grid-2">
        <ol class="orphans" role="list">
          <li v-for="t in overlap.liked_in_no_playlist_sample" :key="t.id">
            <img v-if="t.image" :src="t.image" alt="" loading="lazy" />
            <span class="orphan-text">
              <a :href="spotifyUrl('track', t.id)" target="_blank" rel="noopener noreferrer" class="sp-link">{{ t.name }}</a>
              <span>{{ names(t) }}</span>
            </span>
          </li>
        </ol>
        <div id="playlists">
          <h3>How much of each playlist you liked</h3>
          <BarList :rows="overlap.playlists.slice(0, 15).map((p) => ({ label: p.name, value: p.pct, sub: plural(p.total, 'song'), to: `/playlist/${p.id}` }))" unit="%" :max="100" />
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.page > section, .summary { margin-top: 20px; }
.summary { grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }
.tile-link { color: inherit; text-decoration: none; }
.tile-link:hover { border-color: var(--border-strong); background: var(--surface-raised); }
.tile strong.warn { color: var(--warn-text); }
section[id] { scroll-margin-top: calc(var(--header-h) + 16px); }
.ok-line { display: flex; align-items: center; gap: 8px; color: var(--good); margin: 0; }

.rows { list-style: none; margin: 0; padding: 0; }
.row {
  display: grid; grid-template-columns: 44px minmax(0, 1fr) minmax(0, 1.2fr); gap: 4px 14px; align-items: center;
  padding: 10px 0; border-top: 1px solid var(--border);
}
.row:first-child { border-top: none; }
.row-cover { position: relative; display: block; width: 44px; height: 44px; border-radius: 6px; background: var(--surface-muted); }
.row-cover img { width: 100%; height: 100%; border-radius: 6px; object-fit: cover; display: block; }
.row-main { min-width: 0; }
.row-title { margin: 0; font-weight: 650; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.row-sub { margin: 2px 0 0; font-size: 13px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.in-playlists { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.pl-chip {
  display: inline-block; max-width: 100%; padding: 3px 10px; border-radius: 999px; font-size: 12.5px; font-weight: 600;
  background: var(--surface-muted); color: var(--text); text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.pl-chip:hover { background: var(--accent-soft); color: var(--accent-strong); }
.more { display: flex; align-items: center; gap: 12px; padding-top: 12px; border-top: 1px solid var(--border); }

.orphans { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.orphans li { display: grid; grid-template-columns: 36px 1fr; gap: 10px; align-items: center; }
.orphans img { width: 36px; height: 36px; border-radius: 4px; object-fit: cover; }
.orphan-text { display: flex; flex-direction: column; min-width: 0; font-size: 14px; }
.orphan-text a, .orphan-text span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.orphan-text span { font-size: 12.5px; color: var(--muted); }
#playlists h3 { margin: 0 0 10px; font-size: 1rem; }

@media (max-width: 720px) {
  .row { grid-template-columns: 44px minmax(0, 1fr); }
  .in-playlists { grid-column: 2; }
}
</style>
