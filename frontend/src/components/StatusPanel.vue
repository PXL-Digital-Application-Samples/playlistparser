<script setup>
import { computed } from 'vue';
import {
  sync, syncError, syncing, enrichment, enriching, exportJob, startSync, dismissExport, ago,
} from '../status.js';
import Icon from './Icon.vue';

// One place for everything running in the background: library sync,
// public-data lookups, and the "export all" CSV job.
const ENRICH = { deezer: 'tempo', lastfm: 'tags', musicbrainz: 'origins and composers' };

const syncPct = computed(() => (sync.value?.total ? Math.round((sync.value.done / sync.value.total) * 100) : 0));
const enrichRows = computed(() =>
  Object.entries(enrichment.value || {})
    .filter(([, s]) => s.status === 'running')
    .map(([k, s]) => ({ key: k, label: ENRICH[k] || k, pct: s.total ? Math.round((s.done / s.total) * 100) : 0 }))
);
const exportPct = computed(() => (exportJob.value?.total ? Math.round((exportJob.value.current / exportJob.value.total) * 100) : 0));
const exportRunning = computed(() => exportJob.value && !['completed', 'error'].includes(exportJob.value.status));
</script>

<template>
  <div class="status" role="status" aria-live="polite">
    <!-- Library sync -->
    <div v-if="syncing" class="row">
      <span class="dot live" aria-hidden="true"></span>
      <div class="body">
        <span>Syncing library<template v-if="sync.total"> · {{ sync.done }}/{{ sync.total }}</template></span>
        <span v-if="sync.total" class="progress-track"><span class="progress-fill" :style="{ width: `${syncPct}%` }"></span></span>
      </div>
    </div>
    <div v-else-if="sync" class="row">
      <span class="dot" :class="sync.status === 'error' || sync.failed_playlists?.length ? 'warn' : 'ok'" aria-hidden="true"></span>
      <div class="body">
        <span v-if="sync.status === 'never'">Library not synced yet</span>
        <span v-else-if="sync.status === 'error'" :title="sync.error">Sync failed</span>
        <span v-else>Synced {{ ago(sync.finished_at) }}</span>
        <span v-if="sync.failed_playlists?.length" class="warn-text" :title="sync.failed_playlists.map((p) => `${p.name}: ${p.error}`).join('\n')">
          {{ sync.failed_playlists.length }} playlist{{ sync.failed_playlists.length === 1 ? '' : 's' }} couldn't be read
        </span>
      </div>
      <button class="icon-btn" title="Sync now" @click="startSync">
        <Icon name="refresh" :size="15" /><span class="visually-hidden">Sync now</span>
      </button>
    </div>
    <p v-if="syncError" class="warn-text">{{ syncError }}</p>

    <!-- Enrichment -->
    <div v-if="enriching" class="row">
      <span class="dot live" aria-hidden="true"></span>
      <div class="body">
        <span>Looking up {{ enrichRows.map((r) => r.label).join(', ') }}</span>
        <span class="progress-track"><span class="progress-fill" :style="{ width: `${Math.min(...enrichRows.map((r) => r.pct))}%` }"></span></span>
      </div>
    </div>

    <!-- Export -->
    <div v-if="exportRunning" class="row">
      <span class="dot live" aria-hidden="true"></span>
      <div class="body">
        <span>Exporting<template v-if="exportJob.total"> {{ exportJob.current }}/{{ exportJob.total }}</template></span>
        <span class="progress-track"><span class="progress-fill" :style="{ width: `${exportJob.total ? exportPct : 5}%` }"></span></span>
      </div>
    </div>
    <div v-else-if="exportJob?.status === 'completed'" class="row">
      <span class="dot ok" aria-hidden="true"></span>
      <div class="body"><span>Export ready · <a :href="exportJob.downloadUrl">Download again</a></span></div>
      <button class="icon-btn" title="Dismiss" @click="dismissExport"><Icon name="close" :size="14" /><span class="visually-hidden">Dismiss</span></button>
    </div>
    <div v-else-if="exportJob?.status === 'error'" class="row">
      <span class="dot warn" aria-hidden="true"></span>
      <div class="body"><span class="warn-text">{{ exportJob.error }}</span></div>
      <button class="icon-btn" title="Dismiss" @click="dismissExport"><Icon name="close" :size="14" /><span class="visually-hidden">Dismiss</span></button>
    </div>
  </div>
</template>

<style scoped>
.status { display: flex; flex-direction: column; gap: 8px; font-size: 13px; }
.row { display: flex; align-items: flex-start; gap: 8px; }
.body { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; color: var(--muted); }
.body .progress-track { width: 100%; height: 4px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--faint); flex: none; margin-top: 6px; }
.dot.ok { background: var(--good); }
.dot.warn { background: var(--warn-text); }
.dot.live { background: var(--mark); animation: pulse 1s ease-in-out infinite alternate; }
@keyframes pulse { from { opacity: 0.35; } to { opacity: 1; } }
.icon-btn { color: var(--muted); min-width: 28px; min-height: 28px; margin-top: -4px; }
.warn-text { color: var(--warn-text); margin: 0; }
</style>
