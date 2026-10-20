<script setup>
import { ref, computed, watch, inject, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { endpoints, describeError } from '../api.js';
import { loadPlaylists, plural } from '../playlistCache.js';
import Icon from '../components/Icon.vue';
import LikedCover from '../components/LikedCover.vue';
import SpotifyIcon from '../components/SpotifyIcon.vue';

const props = defineProps({ me: Object, meLoading: Boolean });
const route = useRoute();
const router = useRouter();
const loginUrl = inject('loginUrl');

const playlists = ref([]);
const liked = ref(null);
const loading = ref(false);
const error = ref(null);

// Search/filter/sort live in the URL so "Back" from a playlist restores them.
const query = ref(String(route.query.q || ''));
const filter = ref(['mine', 'collab'].includes(route.query.filter) ? route.query.filter : 'all');
const sort = ref(['name', 'tracks'].includes(route.query.sort) ? route.query.sort : 'spotify');
watch([query, filter, sort], () => {
  router.replace({
    query: {
      ...(query.value ? { q: query.value } : {}),
      ...(filter.value !== 'all' ? { filter: filter.value } : {}),
      ...(sort.value !== 'spotify' ? { sort: sort.value } : {}),
    },
  });
});

async function load() {
  if (!props.me) return;
  loading.value = true;
  error.value = null;
  try {
    const data = await loadPlaylists(props.me.id);
    playlists.value = data.items;
    liked.value = data.liked;
  } catch (e) {
    error.value = describeError(e);
  } finally {
    loading.value = false;
  }
}
watch(() => props.me, load, { immediate: true });

const analyzable = computed(() => playlists.value.filter((p) => p.analyzable));
const followed = computed(() => playlists.value.filter((p) => !p.analyzable));
const counts = computed(() => ({
  all: analyzable.value.length,
  mine: analyzable.value.filter((p) => p.owner.id === props.me?.spotifyId).length,
  collab: analyzable.value.filter((p) => p.collaborative).length,
}));

const visible = computed(() => {
  const q = query.value.trim().toLowerCase();
  let list = analyzable.value.filter((p) => {
    if (filter.value === 'mine' && p.owner.id !== props.me?.spotifyId) return false;
    if (filter.value === 'collab' && !p.collaborative) return false;
    if (!q) return true;
    return `${p.name} ${p.owner.display_name || ''}`.toLowerCase().includes(q);
  });
  if (sort.value === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
  if (sort.value === 'tracks') list = [...list].sort((a, b) => (b.tracks_total ?? 0) - (a.tracks_total ?? 0));
  return list;
});

// Liked Songs is pinned first; it hides only for the Collaborative filter or a
// search that doesn't match it.
const showLiked = computed(() => {
  if (!liked.value || filter.value === 'collab') return false;
  const q = query.value.trim().toLowerCase();
  return !q || 'liked songs'.includes(q);
});

const filters = [
  { key: 'all', label: 'All' },
  { key: 'mine', label: 'Created by me' },
  { key: 'collab', label: 'Collaborative' },
];

// ---- Export all ------------------------------------------------------------
const exportLoading = ref(false);
const exportProgress = ref(null);
const exportDownloadUrl = ref(null);
let pollTimer = null;

function triggerDownload(url) {
  const link = document.createElement('a');
  link.href = url;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function stopExport(message) {
  clearTimeout(pollTimer);
  exportLoading.value = false;
  exportProgress.value = null;
  if (message) error.value = message;
}

async function exportAllPlaylists() {
  if (exportLoading.value) return;
  exportLoading.value = true;
  exportDownloadUrl.value = null;
  error.value = null;
  exportProgress.value = { status: 'starting', current: 0, total: 0 };

  let jobId;
  try {
    ({ jobId } = await endpoints.startExportAll());
  } catch (e) {
    return stopExport(`Failed to start export: ${describeError(e)}`);
  }

  const poll = async () => {
    try {
      const progress = await endpoints.getExportProgress(jobId);
      exportProgress.value = progress;
      if (progress.status === 'completed') {
        exportDownloadUrl.value = endpoints.downloadExportUrl(jobId);
        stopExport();
        triggerDownload(exportDownloadUrl.value);
      } else if (progress.status === 'error') {
        stopExport(`Export failed: ${progress.error}`);
      } else {
        pollTimer = setTimeout(poll, 1000);
      }
    } catch (e) {
      stopExport(`Failed to check export progress: ${describeError(e)}`);
    }
  };
  pollTimer = setTimeout(poll, 500);
}

const exportLabel = computed(() => {
  const p = exportProgress.value;
  if (!p || p.status === 'starting') return 'Starting export…';
  if (p.status === 'fetching_playlists') return 'Getting playlists…';
  return `Exporting ${p.current} of ${p.total}${p.currentPlaylist ? `: ${p.currentPlaylist}` : ''}`;
});

onBeforeUnmount(() => clearTimeout(pollTimer));
</script>

<template>
  <section v-if="meLoading" class="page">
    <div class="grid">
      <div v-for="n in 6" :key="n" class="card skeleton-card"><div class="skeleton cover"></div><div class="skeleton line"></div></div>
    </div>
  </section>

  <section v-else-if="!me" class="welcome">
    <div class="welcome-card">
      <h1>PXL Playlist Parser</h1>
      <p>
        Statistics, duplicate checks and CSV exports for your Spotify playlists.
        Read-only: nothing on your Spotify account is changed.
      </p>
      <a :href="loginUrl" class="btn btn-primary"><SpotifyIcon :size="22" /> Log in with Spotify</a>
      <p class="muted small">
        This app runs in Spotify development mode: your account must be added by the app owner.
      </p>
    </div>
  </section>

  <section v-else class="page">
    <div class="page-head">
      <div>
        <h1>Your playlists</h1>
        <p v-if="!loading && playlists.length" class="muted">
          {{ plural(analyzable.length, 'playlist') }} you can analyze<span v-if="followed.length"> · {{ followed.length }} followed</span>
        </p>
      </div>
      <div class="export">
        <button
          v-if="analyzable.length"
          class="btn btn-secondary"
          :disabled="exportLoading"
          @click="exportAllPlaylists"
        >
          <Icon name="download" :size="16" />
          {{ exportLoading ? 'Exporting…' : 'Export all to CSV' }}
        </button>
        <a v-if="exportDownloadUrl" :href="exportDownloadUrl" class="small">Download again</a>
      </div>
    </div>

    <div v-if="exportLoading" class="export-progress" role="status" aria-live="polite">
      <div class="progress-track">
        <div
          class="progress-fill"
          :style="{ width: exportProgress?.total ? `${(exportProgress.current / exportProgress.total) * 100}%` : '5%' }"
        ></div>
      </div>
      <span class="truncate">{{ exportLabel }}</span>
    </div>

    <div v-if="error" class="alert alert-error" role="alert">{{ error }}</div>

    <div class="toolbar" v-if="!loading && analyzable.length">
      <label class="search">
        <Icon name="search" :size="16" />
        <span class="visually-hidden">Search playlists</span>
        <input v-model="query" type="search" placeholder="Search by name or owner" />
      </label>
      <div class="chips" role="group" aria-label="Filter playlists">
        <button
          v-for="f in filters"
          :key="f.key"
          class="chip"
          :aria-pressed="filter === f.key"
          @click="filter = f.key"
        >
          {{ f.label }} <span class="chip-count">{{ counts[f.key] }}</span>
        </button>
      </div>
      <label class="sort">
        <span>Sort</span>
        <select v-model="sort">
          <option value="spotify">Spotify order</option>
          <option value="name">Name</option>
          <option value="tracks">Most tracks</option>
        </select>
      </label>
    </div>

    <div v-if="loading" class="grid">
      <div v-for="n in 9" :key="n" class="card skeleton-card"><div class="skeleton cover"></div><div class="skeleton line"></div></div>
    </div>

    <template v-else>
      <ul v-if="visible.length || showLiked" class="grid" role="list">
        <li v-if="showLiked">
          <router-link v-if="liked.analyzable" to="/playlist/liked" class="card card-link card-liked">
            <LikedCover />
            <span class="card-body">
              <span class="card-title">Liked Songs</span>
              <span class="card-meta">{{ plural(liked.tracks_total ?? 0, 'track') }}</span>
            </span>
          </router-link>
          <div v-else class="card card-liked">
            <LikedCover />
            <span class="card-body">
              <span class="card-title">Liked Songs</span>
              <span class="card-meta">Needs one more permission from Spotify.</span>
              <a :href="loginUrl" class="small">Log in again to include them</a>
            </span>
          </div>
        </li>
        <li v-for="p in visible" :key="p.id">
          <router-link v-if="p.tracks_total !== 0" :to="`/playlist/${p.id}`" class="card card-link">
            <img v-if="p.image" :src="p.image" alt="" class="cover" loading="lazy" />
            <span v-else class="cover cover-empty"><Icon name="music" :size="22" /></span>
            <span class="card-body">
              <span class="card-title">{{ p.name }}</span>
              <span class="card-meta">
                {{ plural(p.tracks_total ?? 0, 'track') }}
                <template v-if="p.owner.id !== me.spotifyId"> · {{ p.owner.display_name }}</template>
              </span>
              <span v-if="p.collaborative" class="badge"><Icon name="users" :size="12" /> Collaborative</span>
            </span>
          </router-link>
          <div v-else class="card card-disabled">
            <span class="cover cover-empty"><Icon name="music" :size="22" /></span>
            <span class="card-body">
              <span class="card-title">{{ p.name }}</span>
              <span class="card-meta">Empty playlist</span>
            </span>
          </div>
        </li>
      </ul>
      <p v-else-if="analyzable.length || liked" class="empty">No playlists match your search.</p>
      <div v-else-if="!error" class="empty">
        <h2>No playlists to analyze</h2>
        <p class="muted">Create a playlist on Spotify, or ask to be added as a collaborator on one.</p>
      </div>

      <details v-if="followed.length" class="followed">
        <summary>
          <strong>Followed playlists ({{ followed.length }})</strong>
          <span class="muted"> · Spotify doesn't share the tracks of playlists you don't own or collaborate on</span>
        </summary>
        <ul role="list" class="followed-list">
          <li v-for="p in followed" :key="p.id">
            <img v-if="p.image" :src="p.image" alt="" class="cover-sm" loading="lazy" />
            <span v-else class="cover-sm cover-empty"></span>
            <span class="followed-name">
              {{ p.name }}
              <span class="muted"> · {{ p.owner.display_name }} · {{ plural(p.tracks_total ?? 0, 'track') }}</span>
            </span>
            <a v-if="p.url" :href="p.url" target="_blank" rel="noopener noreferrer" class="small">
              Open in Spotify <Icon name="external" :size="12" />
            </a>
          </li>
        </ul>
      </details>
    </template>
  </section>
</template>

<style scoped>
.welcome {
  display: flex;
  justify-content: center;
  padding: 64px 16px;
}

.welcome-card {
  max-width: 480px;
  text-align: center;
  background: var(--surface);
  border-radius: 16px;
  padding: 40px 32px;
  box-shadow: var(--shadow);
}

.welcome-card h1 { margin: 0 0 12px; font-size: 1.9rem; }
.welcome-card p { color: var(--muted); }
.welcome-card .btn { margin: 12px 0 4px; font-size: 16px; padding: 12px 24px; }

.small { font-size: 13px; }

.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}
.page-head h1 { margin: 0; font-size: 2rem; }
.page-head p { margin: 4px 0 0; }

.export {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.export-progress {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  font-size: 13px;
  color: var(--muted);
}
.progress-track {
  flex: 0 0 200px;
  height: 6px;
  background: var(--border);
  border-radius: 3px;
  overflow: hidden;
}
.progress-fill { height: 100%; background: var(--accent); transition: width 0.3s ease; }
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin: 20px 0 16px;
}

.search {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 240px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0 12px;
  color: var(--muted);
}
.search:focus-within { outline: 3px solid var(--focus); outline-offset: 1px; }
.search input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font: inherit;
  padding: 8px 0;
  color: var(--text);
  min-width: 0;
}

.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.chip {
  font: inherit;
  font-size: 13px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}
.chip[aria-pressed='true'] { background: var(--text); color: #fff; border-color: var(--text); }
.chip-count { opacity: 0.75; margin-left: 2px; }

.sort { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--muted); }
.sort select {
  font: inherit;
  font-size: 13px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
}

.grid {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.card {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: inherit;
  text-decoration: none;
  height: 100%;
}
.card-link { transition: border-color 0.15s, box-shadow 0.15s; }
.card-link:hover { border-color: #b8c0c8; box-shadow: var(--shadow); }
.card-disabled { background: var(--surface-muted); }
.card-liked { border-color: #c9bff0; }

.cover {
  width: 64px;
  height: 64px;
  border-radius: 6px;
  object-fit: cover;
  flex: none;
}
.cover-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-muted);
  color: var(--muted);
}

.card-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.card-title {
  font-weight: 600;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.card-meta { font-size: 13px; color: var(--muted); }
.card-body .badge { align-self: flex-start; display: inline-flex; gap: 4px; align-items: center; }

.skeleton-card { height: 86px; }
.skeleton.cover { width: 64px; height: 64px; }
.skeleton.line { height: 14px; flex: 1; }

.empty { text-align: center; padding: 48px 16px; color: var(--muted); }
.empty h2 { color: var(--text); }

.followed {
  margin-top: 32px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 16px;
}
.followed summary { cursor: pointer; font-size: 14px; }
.followed-list { list-style: none; margin: 12px 0 0; padding: 0; }
.followed-list li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  border-top: 1px solid var(--surface-muted);
  font-size: 14px;
}
.followed-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cover-sm { width: 32px; height: 32px; border-radius: 4px; object-fit: cover; flex: none; }
.followed-list a { display: inline-flex; gap: 4px; align-items: center; white-space: nowrap; }

@media (max-width: 640px) {
  .page-head h1 { font-size: 1.5rem; }
  .export { align-items: flex-start; }
  .grid { grid-template-columns: 1fr; gap: 8px; }
  .cover { width: 52px; height: 52px; }
  .progress-track { flex-basis: 100px; }
}
</style>
