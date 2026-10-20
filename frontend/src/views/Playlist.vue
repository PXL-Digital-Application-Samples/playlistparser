<script setup>
import { ref, computed, watch, onBeforeUnmount, nextTick } from 'vue';
import { endpoints, describeError, spotifyUrl } from '../api.js';
import { sanitizeDescription } from '../sanitize.js';
import { cachedPlaylist, plural } from '../playlistCache.js';
import Icon from '../components/Icon.vue';
import LikedCover from '../components/LikedCover.vue';
import BarList from '../components/BarList.vue';

// `id` comes from the route (router uses `props: true`).
const props = defineProps({ me: Object, meLoading: Boolean, id: String });

const contents = ref(null);
const stats = ref(null);
const dedupe = ref(null);
const listeners = ref(null);
const loading = ref(false);
// Liked Songs only: count hand-picked songs, or include whole-album saves.
const lens = ref('handpicked');
const isLiked = computed(() => props.id === 'liked');
async function setLens(next) {
  if (lens.value === next) return;
  lens.value = next;
  try {
    stats.value = { ...(await endpoints.playlistStats(props.id, next)) };
  } catch (e) {
    error.value = describeError(e);
  }
}
const error = ref(null);
let listenersTimer = null;

const preview = computed(() => cachedPlaylist(props.id));
const info = computed(() => stats.value?.playlist ?? preview.value);

// ---- Formatting ------------------------------------------------------------
const fmtNumber = (n) => (typeof n === 'number' ? n.toLocaleString() : '—');
const fmtDuration = (ms) => {
  if (typeof ms !== 'number') return '—';
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}h ${m}m` : `${m}:${sec}`;
};
const artistNames = (t) => t.artists.map((a) => a.name).join(', ');
const year = (t) => t.album?.release_date?.slice(0, 4) || '';
const yearOf = (d) => d?.slice(0, 4) || '—';

const ALBUM_TYPE_LABELS = { album: 'album', single: 'single', compilation: 'compilation' };
const albumTypes = computed(() =>
  Object.entries(stats.value?.album_types || {})
    .sort((a, b) => b[1] - a[1])
    .map(([type, n]) => plural(n, ALBUM_TYPE_LABELS[type] || type))
    .join(' · ')
);

const addedSummary = computed(() => {
  const a = stats.value?.added;
  if (!a?.first) return null;
  if (a.first === a.last) return `All tracks were added on ${a.first}.`;
  if (a.by_year.length === 1) return `All tracks were added in ${a.by_year[0].year}.`;
  return null;
});


// ---- Last.fm ---------------------------------------------------------------
const listenersById = computed(() => new Map(Object.entries(listeners.value?.by_track || {})));
const lastfmProgress = computed(() => {
  const l = listeners.value;
  return l?.eligible ? Math.round((l.looked_up / l.eligible) * 100) : 0;
});
const lastfmStatus = computed(() => listeners.value?.status || stats.value?.lastfm_status);
const lastfmWarning = computed(() => {
  if (lastfmStatus.value === 'not_configured') {
    return 'Last.fm is not configured on the API (LASTFM_API_KEY), so popularity stats are unavailable.';
  }
  if (lastfmStatus.value === 'key_rejected') {
    return 'Last.fm rejected the API key (LASTFM_API_KEY), so popularity stats are unavailable.';
  }
  return null;
});
const lastfmOn = computed(() => Boolean(listeners.value?.enabled));

// ---- Duplicates (computed over all tracks, not just the API sample) --------
const duplicates = computed(() => {
  const byId = new Map();
  const byIsrc = new Map();
  const rows = new Map(); // position -> { kind, first }
  for (const t of contents.value?.tracks || []) {
    if (!t.id) continue;
    if (byId.has(t.id)) {
      rows.set(t.position, { kind: 'exact', first: byId.get(t.id) });
      continue;
    }
    byId.set(t.id, t.position);
    if (t.isrc) {
      if (byIsrc.has(t.isrc)) rows.set(t.position, { kind: 'recording', first: byIsrc.get(t.isrc) });
      else byIsrc.set(t.isrc, t.position);
    }
  }
  return rows;
});
const duplicateList = computed(() => {
  const tracks = contents.value?.tracks || [];
  return [...duplicates.value.entries()].map(([pos, d]) => ({ ...d, track: tracks[pos], firstTrack: tracks[d.first] }));
});

// ---- Track table sorting ---------------------------------------------------
const sortKey = ref('position');
const sortDir = ref(1);
const COLUMNS = computed(() => [
  { key: 'position', label: '#', num: true },
  { key: 'name', label: 'Title' },
  { key: 'artist', label: 'Artist' },
  { key: 'album', label: 'Album', wide: true },
  { key: 'year', label: 'Year', num: true, wide: true },
  { key: 'duration', label: 'Length', num: true },
  ...(lastfmOn.value ? [{ key: 'listeners', label: 'Listeners', num: true, lastfm: true }] : []),
]);
const sortValue = {
  position: (t) => t.position,
  name: (t) => t.name?.toLowerCase() ?? '',
  artist: (t) => artistNames(t).toLowerCase(),
  album: (t) => t.album?.name?.toLowerCase() ?? '',
  year: (t) => year(t),
  duration: (t) => t.duration_ms ?? -1,
  listeners: (t) => listenersById.value.get(t.id)?.listeners ?? -1,
};
const sortedTracks = computed(() => {
  const tracks = contents.value?.tracks || [];
  const get = sortValue[sortKey.value];
  return [...tracks].sort((a, b) => {
    const x = get(a), y = get(b);
    return (x < y ? -1 : x > y ? 1 : a.position - b.position) * sortDir.value;
  });
});
// Render big tables (Liked Songs can be thousands of tracks) in chunks.
const ROW_CHUNK = 250;
const rowLimit = ref(ROW_CHUNK);
const visibleTracks = computed(() => sortedTracks.value.slice(0, rowLimit.value));
const hiddenRows = computed(() => sortedTracks.value.length - visibleTracks.value.length);

function sortBy(key) {
  if (sortKey.value === key) sortDir.value = -sortDir.value;
  else {
    sortKey.value = key;
    // Numbers people want "biggest first"; text A→Z.
    sortDir.value = ['listeners', 'duration', 'year'].includes(key) ? -1 : 1;
  }
}
const ariaSort = (key) => (sortKey.value !== key ? 'none' : sortDir.value === 1 ? 'ascending' : 'descending');

const highlighted = ref(null);
async function showTrack(position) {
  sortKey.value = 'position';
  sortDir.value = 1;
  rowLimit.value = Math.max(rowLimit.value, position + 50);
  highlighted.value = position;
  await nextTick();
  document.getElementById(`track-${position}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => { if (highlighted.value === position) highlighted.value = null; }, 2500);
}

// ---- Sections / in-page nav ------------------------------------------------
const sections = computed(() => [
  { id: 'overview', label: 'Overview' },
  { id: 'artists', label: 'Artists & albums' },
  { id: 'timeline', label: 'Timeline' },
  ...(lastfmOn.value || lastfmWarning.value ? [{ id: 'popularity', label: 'Popularity', lastfm: true }] : []),
  { id: 'duplicates', label: 'Duplicates' },
  { id: 'tracks', label: 'Tracks' },
]);
function jumpTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---- Loading ---------------------------------------------------------------
async function loadAll() {
  clearTimeout(listenersTimer);
  contents.value = stats.value = dedupe.value = listeners.value = null;
  sortKey.value = 'position';
  sortDir.value = 1;
  rowLimit.value = ROW_CHUNK;
  if (!props.me || !props.id) return;
  loading.value = true;
  error.value = null;
  try {
    const [c, s, d] = await Promise.all([
      endpoints.playlistContents(props.id),
      endpoints.playlistStats(props.id, isLiked.value ? lens.value : undefined),
      endpoints.simulateDedupe(props.id),
    ]);
    contents.value = c;
    stats.value = s;
    dedupe.value = d;
    if (s.lastfm_status === 'ok') pollListeners(props.id);
  } catch (e) {
    error.value = describeError(e);
  } finally {
    loading.value = false;
  }
}

// Last.fm lookups run in the background on the API; poll until complete.
async function pollListeners(id) {
  try {
    const l = await endpoints.playlistListeners(id);
    if (id !== props.id) return;
    listeners.value = l;
    if (l.enabled && !l.complete) listenersTimer = setTimeout(() => pollListeners(id), 3000);
  } catch {
    // Popularity stats are optional; ignore failures.
  }
}

watch(() => [props.me, props.id], loadAll, { immediate: true });
onBeforeUnmount(() => clearTimeout(listenersTimer));

function exportToCsv() {
  const link = document.createElement('a');
  link.href = endpoints.exportPlaylistUrl(props.id);
  document.body.appendChild(link);
  link.click();
  link.remove();
}
</script>

<template>
  <section v-if="!meLoading && !me" class="page">
    <p>Log in with Spotify to view playlist details.</p>
  </section>

  <div v-else class="page">
    <router-link to="/" class="btn btn-link back"><Icon name="arrow-left" :size="16" /> All playlists</router-link>

    <!-- Header -->
    <header class="pl-head">
      <LikedCover v-if="id === 'liked'" :size="136" class="pl-cover" />
      <img v-else-if="info?.image" :src="info.image" alt="" class="pl-cover" />
      <div v-else class="pl-cover skeleton" :class="{ 'no-anim': info }"></div>
      <div class="pl-title">
        <h1 v-if="info?.name">{{ info.name }}</h1>
        <div v-else class="skeleton title-skel" aria-label="Loading"></div>
        <p class="pl-meta">
          <template v-if="info?.owner?.display_name">by {{ info.owner.display_name }}</template>
          <span v-if="info?.collaborative" class="badge"><Icon name="users" :size="12" /> Collaborative</span>
          <template v-if="stats"> · {{ plural(stats.tracks_total, 'track') }} · {{ fmtDuration(stats.duration.total_ms) }}</template>
        </p>
        <p v-if="stats?.playlist?.description" class="pl-desc" v-html="sanitizeDescription(stats.playlist.description)"></p>
        <div class="pl-actions">
          <button class="btn btn-primary" :disabled="!stats" @click="exportToCsv">
            <Icon name="download" :size="16" /> Export CSV
          </button>
          <a v-if="info?.url" :href="info.url" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">
            Open in Spotify <Icon name="external" :size="14" />
          </a>
        </div>
      </div>
    </header>

    <div v-if="error" class="alert alert-error" role="alert">{{ error }}</div>

    <div v-if="isLiked && stats?.lens_counts" class="lens-row">
      <div class="lens" role="group" aria-label="What counts as a like">
        <button :aria-pressed="lens === 'handpicked'" @click="setLens('handpicked')">
          Hand-picked <span>{{ stats.lens_counts.handpicked.toLocaleString() }}</span>
        </button>
        <button :aria-pressed="lens === 'all'" @click="setLens('all')">
          Incl. album saves <span>{{ stats.lens_counts.all.toLocaleString() }}</span>
        </button>
      </div>
      <p class="muted small">
        {{ stats.lens_counts.album_saves }} whole albums were saved in one go (5+ songs within a minute).
        {{ lens === 'handpicked' ? 'Stats below leave them out.' : 'Each counts once for top artists.' }}
      </p>
    </div>

    <!-- Loading skeleton -->
    <div v-if="loading" aria-busy="true">
      <span class="visually-hidden">Loading playlist data…</span>
      <div class="cards">
        <div v-for="n in 6" :key="n" class="card"><div class="skeleton line-sm"></div><div class="skeleton line-lg"></div></div>
      </div>
      <div class="skeleton block"></div>
    </div>

    <template v-if="stats && contents">
      <nav class="section-nav" aria-label="Sections">
        <a
          v-for="s in sections"
          :key="s.id"
          :href="`#${s.id}`"
          @click.prevent="jumpTo(s.id)"
        >{{ s.label }}<span v-if="s.lastfm" class="src-lastfm nav-src">Last.fm</span></a>
      </nav>

      <!-- Overview -->
      <section id="overview" class="section" aria-labelledby="h-overview">
        <h2 id="h-overview">Overview</h2>
        <div class="cards">
          <div class="card">
            <span class="card-label">Tracks</span>
            <strong>{{ fmtNumber(stats.tracks_total) }}</strong>
            <span class="card-sub">{{ fmtNumber(stats.tracks_unique) }} unique</span>
          </div>
          <div class="card">
            <span class="card-label">Artists</span>
            <strong>{{ fmtNumber(stats.artists_unique) }}</strong>
          </div>
          <div class="card">
            <span class="card-label">Total length</span>
            <strong>{{ fmtDuration(stats.duration.total_ms) }}</strong>
            <span class="card-sub">avg {{ fmtDuration(stats.duration.avg_ms) }} per track</span>
          </div>
          <div class="card">
            <span class="card-label">Explicit</span>
            <strong>{{ stats.explicit.pct ?? '—' }}<template v-if="stats.explicit.pct !== null">%</template></strong>
            <span class="card-sub">{{ plural(stats.explicit.count, 'track') }}</span>
          </div>
          <div class="card">
            <span class="card-label">Released</span>
            <strong>{{ yearOf(stats.release_range.oldest) }}–{{ yearOf(stats.release_range.newest) }}</strong>
          </div>
          <div class="card">
            <span class="card-label">Duplicates</span>
            <strong>{{ duplicates.size }}</strong>
            <a href="#duplicates" class="card-sub" @click.prevent="jumpTo('duplicates')">view</a>
          </div>
        </div>
      </section>

      <!-- Artists & albums -->
      <section id="artists" class="section" aria-labelledby="h-artists">
        <h2 id="h-artists">Artists &amp; albums</h2>
        <div class="grid-2">
          <div v-if="stats.top_artists.length">
            <h3>Top artists <span class="muted small">{{ isLiked && lens === 'all' ? 'by likes (an album save counts once), not plays' : 'by number of songs here, not plays' }}</span></h3>
            <BarList :rows="stats.top_artists.map((a) => ({ label: a.name, value: a.count }))" :unit="isLiked && lens === 'all' ? 'likes' : 'songs'" />
          </div>
          <div v-if="stats.top_albums.length">
            <h3>Top albums</h3>
            <ol class="plain-list">
              <li v-for="a in stats.top_albums" :key="a.name + a.artist">
                <span>{{ a.name }}</span> <span class="muted">· {{ a.artist }}</span>
                <span class="count">{{ plural(a.count, 'track') }}</span>
              </li>
            </ol>
            <p v-if="albumTypes" class="muted small">From {{ albumTypes }}.</p>
          </div>
        </div>
      </section>

      <!-- Timeline -->
      <section id="timeline" class="section" aria-labelledby="h-timeline">
        <h2 id="h-timeline">Timeline</h2>
        <div class="grid-2">
          <div v-if="stats.decades.length">
            <h3>Release decades</h3>
            <BarList :rows="stats.decades.map((d) => ({ label: d.decade, value: d.count }))" unit="songs" />
            <p class="muted small">Oldest {{ stats.release_range.oldest || '—' }}, newest {{ stats.release_range.newest || '—' }}.</p>
          </div>
          <div>
            <h3>When tracks were added</h3>
            <p v-if="addedSummary">{{ addedSummary }}</p>
            <template v-else-if="stats.added.by_year.length">
              <BarList :rows="stats.added.by_year.map((y) => ({ label: String(y.year), value: y.count }))" unit="added" />
            </template>
            <p v-else class="muted">Spotify has no "added" dates for this playlist.</p>
            <template v-if="stats.contributors.length > 1">
              <h3>Added by</h3>
              <ol class="plain-list">
                <li v-for="c in stats.contributors" :key="c.id">
                  {{ c.id }} <span class="count">{{ plural(c.count, 'track') }}</span>
                </li>
              </ol>
            </template>
            <h3>Length extremes</h3>
            <p v-if="stats.duration.longest" class="small">
              Longest: <strong>{{ stats.duration.longest.name }}</strong> ({{ fmtDuration(stats.duration.longest.duration_ms) }})
            </p>
            <p v-if="stats.duration.shortest" class="small">
              Shortest: <strong>{{ stats.duration.shortest.name }}</strong> ({{ fmtDuration(stats.duration.shortest.duration_ms) }})
            </p>
          </div>
        </div>
      </section>

      <!-- Popularity (Last.fm) -->
      <section v-if="lastfmOn || lastfmWarning" id="popularity" class="section lastfm-section" aria-labelledby="h-popularity">
        <h2 id="h-popularity">Popularity <span class="src-lastfm">Last.fm</span></h2>
        <div v-if="lastfmWarning" class="alert alert-warn" role="status">{{ lastfmWarning }}</div>
        <template v-else>
          <p class="lastfm-explain">
            Global listener counts from <a href="https://www.last.fm" target="_blank" rel="noopener noreferrer">Last.fm</a>:
            how many Last.fm users ever played each track. These are not Spotify plays; Spotify no longer shares popularity.
          </p>

          <div v-if="!listeners.complete" class="lastfm-progress" role="status" aria-live="polite">
            <span class="progress-track"><span class="progress-fill" :style="{ width: `${lastfmProgress}%` }"></span></span>
            <span>Looking up tracks on Last.fm… {{ listeners.looked_up }} of {{ listeners.eligible }}</span>
          </div>

          <div class="cards">
            <div class="card card-lastfm">
              <span class="card-label">Avg listeners per track</span>
              <strong>{{ fmtNumber(listeners.avg_listeners) }}</strong>
            </div>
            <div class="card card-lastfm">
              <span class="card-label">Median listeners</span>
              <strong>{{ fmtNumber(listeners.median_listeners) }}</strong>
            </div>
            <div class="card card-lastfm">
              <span class="card-label">Found on Last.fm</span>
              <strong>{{ listeners.matched }} of {{ listeners.eligible }}</strong>
            </div>
          </div>

          <div v-if="listeners.matched" class="grid-2">
            <div>
              <h3>Most listened</h3>
              <ol class="plain-list">
                <li v-for="t in listeners.most_listened" :key="t.id">
                  <span>{{ t.name }}</span> <span class="muted">· {{ artistNames(t) }}</span>
                  <span class="count">{{ fmtNumber(t.listeners) }}</span>
                </li>
              </ol>
            </div>
            <div v-if="listeners.matched >= 10">
              <h3>Hidden gems <span class="muted small">(fewest listeners)</span></h3>
              <ol class="plain-list">
                <li v-for="t in listeners.hidden_gems" :key="t.id">
                  <span>{{ t.name }}</span> <span class="muted">· {{ artistNames(t) }}</span>
                  <span class="count">{{ fmtNumber(t.listeners) }}</span>
                </li>
              </ol>
            </div>
          </div>
        </template>
      </section>

      <!-- Duplicates -->
      <section id="duplicates" class="section" aria-labelledby="h-duplicates">
        <h2 id="h-duplicates">Duplicates</h2>
        <p v-if="!duplicateList.length" class="muted">No duplicates in this playlist.</p>
        <template v-else>
          <p>
            <strong>{{ plural(dedupe.duplicates, 'exact duplicate') }}</strong> (the same Spotify track twice) and
            <strong>{{ plural(dedupe.same_recording, 'track') }}</strong> that are the same recording on a different release.
            Nothing is removed; this is a report only.
          </p>
          <ul class="plain-list dup-list">
            <li v-for="d in duplicateList" :key="d.track.position">
              <button class="btn-link link-btn" @click="showTrack(d.track.position)">#{{ d.track.position + 1 }}</button>
              {{ d.track.name }} <span class="muted">· {{ artistNames(d.track) }}</span>
              <span class="muted small">
                — {{ d.kind === 'exact' ? 'duplicate of' : 'same recording as' }}
                <button class="btn-link link-btn" @click="showTrack(d.first)">#{{ d.first + 1 }}</button>
                <template v-if="d.kind === 'recording'"> ({{ d.firstTrack.album?.name }})</template>
              </span>
            </li>
          </ul>
        </template>
      </section>

      <!-- Tracks -->
      <section id="tracks" class="section" aria-labelledby="h-tracks">
        <h2 id="h-tracks">Tracks</h2>
        <div class="table-wrap" tabindex="0" aria-label="Tracks table, scrollable">
          <table class="tracks">
            <thead>
              <tr>
                <th
                  v-for="c in COLUMNS"
                  :key="c.key"
                  :aria-sort="ariaSort(c.key)"
                  :class="{ num: c.num, wide: c.wide, 'col-lastfm': c.lastfm }"
                  scope="col"
                >
                  <button class="th-btn" @click="sortBy(c.key)">
                    {{ c.label }}
                    <span v-if="c.lastfm" class="src-lastfm">Last.fm</span>
                    <span class="sort-ind" aria-hidden="true">{{ sortKey === c.key ? (sortDir === 1 ? '▲' : '▼') : '' }}</span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="t in visibleTracks"
                :key="t.position"
                :id="`track-${t.position}`"
                :class="{ dup: duplicates.has(t.position), flash: highlighted === t.position }"
              >
                <td class="num">{{ t.position + 1 }}</td>
                <td>
                  <a v-if="t.id" :href="spotifyUrl('track', t.id)" target="_blank" rel="noopener noreferrer" class="sp-link">{{ t.name }}</a>
                  <template v-else>{{ t.name || '—' }}</template>
                  <span v-if="t.explicit" class="explicit" title="Explicit" aria-label="Explicit">E</span>
                  <span v-if="t.is_local" class="muted small">(local file)</span>
                  <span v-if="t.album_save" class="save-tag" title="Added when the whole album was saved">album save</span>
                  <span
                    v-if="duplicates.has(t.position)"
                    class="dup-tag"
                  >{{ duplicates.get(t.position).kind === 'exact' ? 'duplicate' : 'same recording' }} of #{{ duplicates.get(t.position).first + 1 }}</span>
                </td>
                <td>{{ artistNames(t) || '—' }}</td>
                <td class="wide">{{ t.album?.name || '—' }}</td>
                <td class="num wide">{{ year(t) || '—' }}</td>
                <td class="num">{{ fmtDuration(t.duration_ms) }}</td>
                <td v-if="lastfmOn" class="num col-lastfm">{{ fmtNumber(listenersById.get(t.id)?.listeners) }}</td>
              </tr>
            </tbody>
          </table>
          <div v-if="hiddenRows > 0" class="more-rows">
            <span class="muted small">Showing {{ visibleTracks.length.toLocaleString() }} of {{ sortedTracks.length.toLocaleString() }}</span>
            <button class="btn btn-secondary btn-sm" @click="rowLimit += ROW_CHUNK">Show {{ Math.min(ROW_CHUNK, hiddenRows) }} more</button>
            <button class="btn btn-link btn-sm" @click="rowLimit = sortedTracks.length">Show all</button>
          </div>
        </div>
        <p class="muted small">
          Click a column header to sort (sorting covers all tracks, not only the visible ones).
          <template v-if="lastfmOn">Listener counts come from Last.fm; everything else from Spotify. "—" means the track isn't on Last.fm or is still being looked up.</template>
        </p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.back { margin-bottom: 12px; }
.small { font-size: 13px; }
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Header */
.pl-head {
  display: flex;
  gap: 20px;
  align-items: flex-start;
  margin-bottom: 20px;
}
.pl-cover {
  width: 136px;
  height: 136px;
  border-radius: 8px;
  object-fit: cover;
  flex: none;
  box-shadow: var(--shadow);
}
.pl-cover.no-anim { animation: none; }
.pl-title { min-width: 0; flex: 1; }
.pl-title h1 { margin: 0 0 6px; font-size: 2rem; line-height: 1.15; overflow-wrap: anywhere; }
.title-skel { height: 36px; width: 60%; margin-bottom: 10px; }
.pl-meta { margin: 0; color: var(--muted); display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 14px; }
.pl-meta .badge { display: inline-flex; gap: 4px; align-items: center; }
.pl-desc { color: var(--muted); font-size: 14px; margin: 8px 0 0; }
.pl-desc :deep(a) { color: var(--link); }
.pl-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }

/* Section nav */
.section-nav {
  position: sticky;
  top: 53px;
  z-index: 10;
  display: flex;
  gap: 4px;
  overflow-x: auto;
  background: var(--bg);
  padding: 8px 0;
  margin: 0 0 8px;
  border-bottom: 1px solid var(--border);
  scrollbar-width: thin;
}
.section-nav a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  color: var(--text);
  text-decoration: none;
  font-size: 14px;
  white-space: nowrap;
}
.section-nav a:hover { background: var(--surface-muted); }
.nav-src { font-size: 10px; }

.section { padding-top: 20px; scroll-margin-top: 110px; }
.section h2 { font-size: 1.3rem; margin: 0 0 12px; display: flex; align-items: center; gap: 8px; }
.section h3 { font-size: 1rem; margin: 16px 0 8px; }

/* Cards */
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 10px;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 14px;
}
.card strong { font-size: 1.35rem; }
.card-label { font-size: 13px; color: var(--muted); }
.card-sub { font-size: 12px; color: var(--muted); }
a.card-sub { color: var(--link); }
.line-sm { height: 12px; width: 50%; margin-bottom: 8px; }
.line-lg { height: 22px; width: 70%; }
.block { height: 240px; margin-top: 16px; }

.grid-2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 8px 32px;
}

.plain-list { margin: 0; padding-left: 20px; }
.plain-list li { margin-bottom: 4px; font-size: 14px; }
.count { float: right; color: var(--muted); font-variant-numeric: tabular-nums; padding-left: 8px; }
.dup-list { list-style: none; padding: 0; }

/* Last.fm */
.lastfm-section {
  margin-top: 20px;
  padding: 16px 20px;
  border: 1px solid #f1c4c1;
  border-left: 4px solid var(--lastfm);
  border-radius: var(--radius);
  background: #fffafa;
}
.lastfm-explain { margin: 0 0 12px; color: var(--muted); font-size: 14px; }
.lastfm-explain a { color: #b00d06; }
.lastfm-progress { display: flex; align-items: center; gap: 12px; font-size: 13px; color: var(--muted); margin-bottom: 12px; }
.progress-track { flex: 0 0 160px; height: 6px; background: #f1c4c1; border-radius: 3px; overflow: hidden; }
.progress-fill { display: block; height: 100%; background: var(--lastfm); transition: width 0.3s ease; }
.card-lastfm { border-color: #f1c4c1; }

/* Table */
.table-wrap {
  max-height: 70vh;
  overflow: auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.tracks { width: 100%; border-collapse: collapse; font-size: 14px; }
.tracks th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  text-align: left;
  padding: 0;
}
.tracks td { padding: 7px 10px; border-bottom: 1px solid var(--surface-muted); vertical-align: top; }
.tracks .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.th-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 4px;
  font: inherit;
  font-weight: 600;
  background: none;
  border: none;
  padding: 9px 10px;
  cursor: pointer;
  color: var(--text);
  text-align: inherit;
  white-space: nowrap;
}
th.num .th-btn { justify-content: flex-end; }
.sort-ind { font-size: 10px; color: var(--muted); min-width: 10px; }
.tracks th.col-lastfm, .tracks td.col-lastfm { background: #fff5f5; }
.tracks tr.dup td { background: #fff8e5; }
.tracks tr.flash td { background: #fde68a; transition: background 0.3s; }
.lens-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; margin: 0 0 12px; }
.lens-row p { margin: 0; }
.lens { display: inline-flex; background: var(--surface-muted); border-radius: 999px; padding: 3px; }
.lens button {
  font: inherit; font-size: 13px; font-weight: 600; border: none; background: none; color: var(--text);
  padding: 6px 14px; border-radius: 999px; cursor: pointer; white-space: nowrap;
}
.lens button span { font-weight: 400; color: var(--muted); margin-left: 4px; }
.lens button[aria-pressed='true'] { background: var(--surface); box-shadow: var(--shadow); }
.save-tag {
  display: inline-block; font-size: 11px; color: #3c2a8a; background: #e9e4fb;
  border-radius: 4px; padding: 0 5px; margin-left: 4px;
}
.dup-tag {
  display: inline-block;
  font-size: 11px;
  color: #6b4e00;
  background: #ffe9a8;
  border-radius: 4px;
  padding: 0 5px;
  margin-left: 4px;
}
.explicit {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  background: var(--muted);
  color: #fff;
  border-radius: 3px;
  padding: 0 4px;
  margin-left: 4px;
}
.link-btn { font: inherit; padding: 0; cursor: pointer; }
.more-rows {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: center;
  padding: 12px;
  border-top: 1px solid var(--border);
}

@media (max-width: 640px) {
  .pl-head { flex-direction: column; }
  .pl-cover { width: 96px; height: 96px; }
  .pl-title h1 { font-size: 1.5rem; }
  .tracks .wide { display: none; }
  .section-nav { top: 49px; }
}
</style>
