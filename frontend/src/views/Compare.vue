<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { endpoints, describeError, spotifyUrl } from '../api.js';
import { loadPlaylists, plural } from '../playlistCache.js';
import Icon from '../components/Icon.vue';

// Compare two playlists: what's only in A, in both, only in B. Read-only, like
// everything else; it shows what merging would add without doing it.
const props = defineProps({ me: Object, meLoading: Boolean });
const route = useRoute();
const router = useRouter();

const options = ref([]);
const a = ref(String(route.query.a || ''));
const b = ref(String(route.query.b || ''));
const result = ref(null);
const loading = ref(false);
const error = ref(null);
const view = ref('only_b');

watch(() => props.me, async (me) => {
  if (!me) return;
  try {
    const data = await loadPlaylists(me.id);
    options.value = [
      ...(data.liked?.analyzable ? [{ id: 'liked', name: 'Liked Songs' }] : []),
      ...data.items.filter((p) => p.analyzable && p.tracks_total).map((p) => ({ id: p.id, name: p.name })),
    ];
  } catch (e) {
    error.value = describeError(e);
  }
}, { immediate: true });

async function compare() {
  router.replace({ query: { ...(a.value ? { a: a.value } : {}), ...(b.value ? { b: b.value } : {}) } });
  result.value = null;
  if (!a.value || !b.value || a.value === b.value || !props.me) return;
  loading.value = true;
  error.value = null;
  try {
    result.value = await endpoints.simulateMerge(a.value, b.value);
  } catch (e) {
    error.value = describeError(e);
  } finally {
    loading.value = false;
  }
}
watch([a, b, () => props.me], compare, { immediate: true });

function swap() {
  [a.value, b.value] = [b.value, a.value];
}

const VIEWS = computed(() => (result.value ? [
  { key: 'only_a', label: `Only in ${result.value.playlist_a.name}`, n: result.value.counts.only_a },
  { key: 'both', label: 'In both', n: result.value.counts.both },
  { key: 'only_b', label: `Only in ${result.value.playlist_b.name}`, n: result.value.counts.only_b },
] : []));
const songs = computed(() => result.value?.[view.value] || []);
const shownOf = computed(() => VIEWS.value.find((v) => v.key === view.value)?.n ?? 0);
const names = (t) => t.artists.map((x) => x.name).join(', ');
</script>

<template>
  <div v-if="meLoading || me" class="page">
    <header class="page-head">
      <div>
        <p class="eyebrow">Playlists</p>
        <h1>Compare two playlists</h1>
        <p>See which songs two playlists share and what merging one into the other would add. Nothing on Spotify changes.</p>
      </div>
    </header>

    <div class="pickers panel">
      <label class="pick">
        <span class="pick-label">Playlist A</span>
        <select v-model="a">
          <option value="">Choose a playlist</option>
          <option v-for="o in options" :key="o.id" :value="o.id" :disabled="o.id === b">{{ o.name }}</option>
        </select>
      </label>
      <button class="icon-btn swap" title="Swap A and B" :disabled="!a && !b" @click="swap">
        <Icon name="compare" :size="18" /><span class="visually-hidden">Swap A and B</span>
      </button>
      <label class="pick">
        <span class="pick-label">Playlist B</span>
        <select v-model="b">
          <option value="">Choose a playlist</option>
          <option v-for="o in options" :key="o.id" :value="o.id" :disabled="o.id === a">{{ o.name }}</option>
        </select>
      </label>
    </div>

    <div v-if="error" class="alert alert-error" role="alert">{{ error }}</div>
    <p v-if="!a || !b" class="muted hint">Pick two playlists to compare.</p>
    <div v-if="loading" class="skeleton" style="height: 160px; border-radius: 16px; margin-top: 20px" aria-busy="true"></div>

    <template v-if="result">
      <section class="venn" aria-label="Summary">
        <button v-for="v in VIEWS" :key="v.key" class="venn-cell" :class="v.key" :aria-pressed="view === v.key" @click="view = v.key">
          <strong class="num">{{ v.n.toLocaleString() }}</strong>
          <span>{{ v.label }}</span>
        </button>
      </section>
      <p class="muted merge-line">
        Merging <strong>{{ result.playlist_b.name }}</strong> into <strong>{{ result.playlist_a.name }}</strong> would add
        {{ plural(result.would_add_from_b_to_a, 'song') }}, for {{ plural(result.union_count, 'song') }} in total.
      </p>

      <section class="panel" aria-live="polite">
        <div class="panel-head">
          <h2>{{ VIEWS.find((v) => v.key === view)?.label }}</h2>
          <p v-if="songs.length < shownOf">Showing the first {{ songs.length }} of {{ shownOf.toLocaleString() }}.</p>
        </div>
        <p v-if="!songs.length" class="muted">No songs here.</p>
        <ul v-else class="rows" role="list">
          <li v-for="s in songs" :key="s.id" class="row">
            <img v-if="s.image" :src="s.image" alt="" loading="lazy" />
            <span v-else class="noimg"></span>
            <span class="row-text">
              <a :href="spotifyUrl('track', s.id)" target="_blank" rel="noopener noreferrer" class="sp-link">{{ s.name }}</a>
              <span>
                <template v-for="(x, i) in s.artists" :key="x.id || x.name"><router-link v-if="x.id" :to="`/artist/${x.id}`" class="in-link">{{ x.name }}</router-link><template v-else>{{ x.name }}</template><template v-if="i < s.artists.length - 1">, </template></template>
                <template v-if="s.album?.name"> · <router-link v-if="s.album.id" :to="`/album/${s.album.id}`" class="in-link">{{ s.album.name }}</router-link><template v-else>{{ s.album.name }}</template></template>
              </span>
            </span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.pickers { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px; }
.pick { display: flex; flex-direction: column; gap: 6px; flex: 1 1 240px; min-width: 0; }
.pick-label { font-size: 13px; font-weight: 650; color: var(--muted); }
.pick select {
  font: inherit; padding: 9px 12px; min-height: 42px; border-radius: 10px;
  border: 1px solid var(--border-strong); background: var(--surface); color: var(--text); width: 100%;
}
.swap { margin-bottom: 4px; border: 1px solid var(--border); border-radius: 999px; min-width: 40px; min-height: 40px; }
.hint { margin-top: 16px; }

.venn { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 20px; }
.venn-cell {
  display: flex; flex-direction: column; gap: 4px; align-items: flex-start; text-align: left;
  padding: 16px 18px; border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface);
  color: var(--text); font: inherit; cursor: pointer; min-width: 0;
}
.venn-cell strong { font-family: var(--font-display); font-size: 2rem; line-height: 1; }
.venn-cell span { font-size: 13.5px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.venn-cell:hover { border-color: var(--border-strong); }
.venn-cell[aria-pressed='true'] { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); background: var(--accent-soft); }
.venn-cell[aria-pressed='true'] span { color: var(--accent-strong); }
.merge-line { margin: 12px 0 20px; }

.rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.row { display: grid; grid-template-columns: 40px 1fr; gap: 12px; align-items: center; padding: 4px 0; }
.row img, .row .noimg { width: 40px; height: 40px; border-radius: 4px; object-fit: cover; background: var(--surface-muted); }
.row-text { display: flex; flex-direction: column; min-width: 0; font-size: 14px; }
.row-text > a, .row-text > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-text > a { font-weight: 600; }
.row-text > span { color: var(--muted); font-size: 13px; }

@media (max-width: 560px) {
  .venn { grid-template-columns: 1fr; }
  .venn-cell { flex-direction: row; align-items: baseline; gap: 12px; }
  .venn-cell strong { font-size: 1.5rem; min-width: 56px; }
}
</style>
