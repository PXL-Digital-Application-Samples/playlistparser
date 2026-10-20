<script setup>
import { ref, reactive, computed, watch, inject } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { endpoints, describeError } from '../api.js';
import { lens } from '../settings.js';
import { syncVersion, enrichVersion } from '../status.js';
import { INSIGHT_TABS } from '../nav.js';
import LensToggle from '../components/LensToggle.vue';
import InsightsTaste from './InsightsTaste.vue';
import InsightsListening from './InsightsListening.vue';
import InsightsTimeline from './InsightsTimeline.vue';
import InsightsDiscover from './InsightsDiscover.vue';

// One page with four tabs (Taste, Listening, Timeline, Discover). The data is
// loaded once here and shared, so switching tabs is instant.
const props = defineProps({ me: Object, meLoading: Boolean, tab: String });
const loginUrl = inject('loginUrl');
const route = useRoute();
const router = useRouter();

const TAB_VIEWS = { taste: InsightsTaste, listening: InsightsListening, timeline: InsightsTimeline, discover: InsightsDiscover };
const current = computed(() => INSIGHT_TABS.find((t) => t.key === props.tab) ?? INSIGHT_TABS[0]);
// What each tab is built from: Spotify shares likes and top-50 rankings, but
// not how often you played or skipped a song.
const basis = computed(() => (props.tab === 'listening'
  ? "Based on Spotify's rankings of what you play most and your last 50 plays. Spotify doesn't share play counts or skips."
  : "Based on your liked songs, not on how often you play them: Spotify doesn't share play counts or skips."));

// ?lens=… in a link still sets the shared setting.
if (route.query.lens === 'all' || route.query.lens === 'handpicked') lens.value = route.query.lens;
watch(lens, (k) => router.replace({ query: k === 'all' ? { lens: 'all' } : {} }));

// ---- Summary: Liked Songs + listening ---------------------------------------
const summary = ref(null);
const loading = ref(false);
const error = ref(null);
async function loadSummary() {
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

// ---- Discover: Liked Songs + public music data -------------------------------
const deep = ref(null);
const deepError = ref(null);
async function loadDeep() {
  if (!props.me) return;
  try {
    deep.value = await endpoints.insightsDeep(lens.value);
    deepError.value = null;
  } catch (e) {
    deepError.value = describeError(e);
  }
}

// ---- Collection (followed artists, saved albums, podcasts): on first use -----
const collection = reactive({ data: null, loading: false, error: null });
async function loadCollection(force = false) {
  if (!props.me || collection.loading || (collection.data && !force)) return;
  collection.loading = true;
  collection.error = null;
  try {
    collection.data = await endpoints.insightsCollection();
  } catch (e) {
    collection.error = describeError(e);
  } finally {
    collection.loading = false;
  }
}

watch(() => props.me, () => { loadSummary(); loadDeep(); }, { immediate: true });
watch(lens, loadDeep);
watch(enrichVersion, loadDeep);
watch(syncVersion, () => {
  loadSummary();
  loadDeep();
  if (collection.data) loadCollection(true);
});

const needsReauth = computed(() =>
  summary.value && (summary.value.listening.top.status === 'reauth' || summary.value.liked_status === 'reauth')
);
</script>

<template>
  <div v-if="meLoading || me" class="page">
    <header class="ins-head">
      <div class="ins-title">
        <p class="eyebrow">Insights</p>
        <h1>{{ current.title }}</h1>
      </div>
      <LensToggle
        v-if="summary?.lenses && tab !== 'listening'"
        :handpicked="summary.lenses.handpicked.counts.songs"
        :all="summary.lenses.all.counts.songs"
        :saves="summary.album_saves.saves"
      />
    </header>

    <nav class="tabs" aria-label="Insights">
      <router-link
        v-for="t in INSIGHT_TABS"
        :key="t.key"
        :to="{ path: `/insights/${t.key}`, query: route.query }"
        class="tab"
        :aria-current="tab === t.key ? 'page' : null"
      >{{ t.label }}</router-link>
    </nav>

    <p class="basis">{{ basis }}</p>

    <div v-if="error" class="alert alert-error" role="alert">{{ error }}</div>
    <div v-if="needsReauth" class="alert alert-warn" role="status">
      Your top artists, recent plays and followed artists need extra permissions from Spotify.
      <a :href="loginUrl">Log in again</a> to include them.
    </div>

    <div v-if="loading && !summary" aria-busy="true" class="loading">
      <span class="visually-hidden">Loading insights…</span>
      <div class="skeleton" style="height: 220px; border-radius: 16px"></div>
      <div class="skeleton" style="height: 160px; border-radius: 16px; margin-top: 16px"></div>
    </div>

    <component
      :is="TAB_VIEWS[tab]"
      v-if="summary"
      :summary="summary"
      :deep="deep"
      :deep-error="deepError"
      :collection="collection"
      :load-collection="loadCollection"
      :lens-key="lens"
    />
  </div>
</template>

<style scoped>
.ins-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 12px 24px; margin-bottom: 18px; }
.ins-title h1 { margin: 4px 0 0; font-size: 2.1rem; line-height: 1.05; }
.tabs {
  display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none;
  position: sticky; top: var(--header-h); z-index: 10;
  margin: 0 -4px 12px; padding: 8px 4px; border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg) 78%, transparent); backdrop-filter: blur(12px);
}
.basis { margin: 0 0 24px; font-size: 13px; color: var(--muted); max-width: 75ch; }
.tab {
  padding: 7px 16px; min-height: 36px; display: inline-flex; align-items: center; border-radius: 999px;
  color: var(--muted); text-decoration: none; font-weight: 650; font-size: 14.5px; white-space: nowrap;
}
.tab:hover { color: var(--text); background: var(--surface-muted); }
.tab[aria-current='page'] { background: var(--text); color: var(--bg); }
@media (max-width: 640px) {
  .ins-title h1 { font-size: 1.7rem; }
}
</style>
