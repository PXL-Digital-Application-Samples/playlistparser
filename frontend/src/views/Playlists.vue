<script setup>
import { ref, computed, watch, inject } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { describeError } from '../api.js';
import { loadPlaylists, plural } from '../playlistCache.js';
import { exportJob, startExportAll } from '../status.js';
import Icon from '../components/Icon.vue';
import LikedCover from '../components/LikedCover.vue';

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

// A filter that would show the same list as "All" is left out.
const filters = computed(() => [
  { key: 'all', label: 'All' },
  { key: 'mine', label: 'Created by me' },
  { key: 'collab', label: 'Collaborative' },
].filter((f) => f.key === 'all' || (counts.value[f.key] > 0 && counts.value[f.key] < counts.value.all) || filter.value === f.key));

const exporting = computed(() => exportJob.value && !['completed', 'error'].includes(exportJob.value.status));
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div>
        <h1>Playlists</h1>
        <p v-if="!loading && playlists.length">
          {{ plural(analyzable.length, 'playlist') }} you can analyze<span v-if="followed.length"> · {{ followed.length }} you follow</span>
        </p>
      </div>
      <div v-if="analyzable.length" class="head-actions">
        <router-link to="/compare" class="btn btn-secondary btn-sm"><Icon name="compare" :size="15" /> Compare two</router-link>
        <button class="btn btn-primary btn-sm" :disabled="exporting" @click="startExportAll">
          <Icon name="download" :size="15" /> {{ exporting ? 'Exporting…' : 'Export all to CSV' }}
        </button>
      </div>
    </header>

    <div v-if="error" class="alert alert-error" role="alert">{{ error }}</div>

    <div v-if="!loading && analyzable.length" class="toolbar">
      <label class="search">
        <Icon name="search" :size="16" />
        <span class="visually-hidden">Search playlists</span>
        <input v-model="query" type="search" placeholder="Search by name or owner" />
      </label>
      <div v-if="filters.length > 1" class="seg" role="group" aria-label="Filter playlists">
        <button v-for="f in filters" :key="f.key" :aria-pressed="filter === f.key" @click="filter = f.key">
          {{ f.label }} <span class="seg-count">{{ counts[f.key] }}</span>
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

    <div v-if="loading || meLoading" class="grid" aria-busy="true">
      <div v-for="n in 10" :key="n" class="card"><div class="skeleton cover"></div><div class="skeleton line"></div></div>
    </div>

    <template v-else>
      <ul v-if="visible.length || showLiked" class="grid" role="list">
        <li v-if="showLiked">
          <router-link v-if="liked.analyzable" to="/playlist/liked" class="card card-link">
            <LikedCover class="cover" :size="0" />
            <span class="card-title">Liked Songs</span>
            <span class="card-meta">{{ plural(liked.tracks_total ?? 0, 'track') }}</span>
          </router-link>
          <div v-else class="card">
            <LikedCover class="cover" :size="0" />
            <span class="card-title">Liked Songs</span>
            <span class="card-meta">Needs one more permission from Spotify. <a :href="loginUrl">Log in again</a></span>
          </div>
        </li>
        <li v-for="p in visible" :key="p.id">
          <router-link v-if="p.tracks_total !== 0" :to="`/playlist/${p.id}`" class="card card-link">
            <img v-if="p.image" :src="p.image" alt="" class="cover" loading="lazy" />
            <span v-else class="cover cover-empty"><Icon name="music" :size="28" /></span>
            <span class="card-title">{{ p.name }}</span>
            <span class="card-meta">
              {{ plural(p.tracks_total ?? 0, 'track') }}<template v-if="p.owner.id !== me?.spotifyId"> · {{ p.owner.display_name }}</template>
            </span>
            <span v-if="p.collaborative" class="badge"><Icon name="users" :size="12" /> Collaborative</span>
          </router-link>
          <div v-else class="card card-disabled">
            <span class="cover cover-empty"><Icon name="music" :size="28" /></span>
            <span class="card-title">{{ p.name }}</span>
            <span class="card-meta">Empty playlist</span>
          </div>
        </li>
      </ul>
      <p v-else-if="analyzable.length || liked" class="empty">No playlists match your search.</p>
      <div v-else-if="!error" class="empty">
        <h2>No playlists to analyze</h2>
        <p>Create a playlist on Spotify, or ask to be added as a collaborator on one.</p>
      </div>

      <details v-if="followed.length" class="followed">
        <summary>
          <strong>Playlists you follow ({{ followed.length }})</strong>
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
  </div>
</template>

<style scoped>
.head-actions { display: flex; flex-wrap: wrap; gap: 8px; }

.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin: 0 0 20px; }
.search {
  display: flex; align-items: center; gap: 8px; flex: 1 1 260px;
  background: var(--surface); border: 1px solid var(--border-strong); border-radius: 999px;
  padding: 0 14px; color: var(--muted);
}
.search:focus-within { outline: 3px solid var(--focus); outline-offset: 1px; }
.search input { flex: 1; border: none; outline: none; background: transparent; font: inherit; padding: 9px 0; color: var(--text); min-width: 0; }
.seg-count { opacity: 0.7; margin-left: 3px; font-weight: 500; }
.sort { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--muted); }
.sort select {
  font: inherit; font-size: 13px; padding: 6px 8px; min-height: 32px; border-radius: 8px;
  border: 1px solid var(--border-strong); background: var(--surface); color: var(--text);
}

.grid {
  list-style: none; padding: 0; margin: 0;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 18px 16px;
}
.card {
  display: flex; flex-direction: column; gap: 3px; height: 100%;
  padding: 10px; border-radius: var(--radius);
  color: inherit; text-decoration: none;
}
.card-link { transition: background 0.15s; }
.card-link:hover { background: var(--surface); }
.card-link:hover .cover { box-shadow: var(--shadow); }
.card-disabled { opacity: 0.6; }
.cover {
  width: 100%; height: auto !important; aspect-ratio: 1; border-radius: var(--radius-sm); object-fit: cover;
  margin-bottom: 8px; transition: box-shadow 0.15s;
}
.cover-empty { display: flex; align-items: center; justify-content: center; color: var(--faint); background: var(--surface-muted); }
.card-title { font-weight: 650; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.card-meta { font-size: 13px; color: var(--muted); }
.card .badge { align-self: flex-start; margin-top: 4px; }
.skeleton.cover { margin-bottom: 8px; }
.skeleton.line { height: 14px; width: 70%; }

.followed { margin-top: 36px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 16px; }
.followed summary { cursor: pointer; font-size: 14px; min-height: 28px; }
.followed-list { list-style: none; margin: 12px 0 0; padding: 0; }
.followed-list li { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-top: 1px solid var(--surface-muted); font-size: 14px; }
.followed-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cover-sm { width: 32px; height: 32px; border-radius: 4px; object-fit: cover; flex: none; background: var(--surface-muted); }
.followed-list a { display: inline-flex; gap: 4px; align-items: center; white-space: nowrap; }

@media (max-width: 640px) {
  .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 8px; }
  .card { padding: 6px; }
}
</style>
