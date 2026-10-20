import { ref, computed } from 'vue';
import { endpoints, describeError } from './api.js';

// Background work that belongs to the whole app, not one page: the library
// sync, the enrichment lookups that follow it, the "export all" job, and the
// library overview (health counts for the navigation). The app frame shows
// it; pages react to `syncVersion` / `enrichVersion` to reload their data.

const AUTO_SYNC_MIN = 30;

export const sync = ref(null);
export const syncError = ref(null);
export const enrichment = ref(null);
export const exportJob = ref(null); // { status, current, total, currentPlaylist, downloadUrl, error }
export const overview = ref(null);
export const syncVersion = ref(0);   // bumps when a sync finishes
export const enrichVersion = ref(0); // bumps while enrichment delivers new data

export const syncing = computed(() => sync.value?.status === 'running');
export const enriching = computed(() => Object.values(enrichment.value || {}).some((s) => s.status === 'running'));
export const healthCount = computed(() => {
  const h = overview.value?.health;
  return h ? h.duplicates + h.unplayable : null;
});

let syncTimer = null;
let enrichTimer = null;
let exportTimer = null;
let running = false;
let enrichResumed = false;

async function pollSync() {
  clearTimeout(syncTimer);
  if (!running) return;
  try {
    const was = syncing.value;
    sync.value = await endpoints.librarySyncState();
    syncError.value = null;
    if (syncing.value) syncTimer = setTimeout(pollSync, 1500);
    else if (was) onSyncFinished();
  } catch (e) {
    syncError.value = describeError(e);
    syncTimer = setTimeout(pollSync, 5000);
  }
}

function onSyncFinished() {
  syncVersion.value++;
  loadOverview();
  pollEnrichment();
}

export async function startSync() {
  try {
    sync.value = await endpoints.startLibrarySync();
    syncError.value = null;
    syncTimer = setTimeout(pollSync, 800);
  } catch (e) {
    syncError.value = describeError(e);
  }
}

async function pollEnrichment() {
  clearTimeout(enrichTimer);
  if (!running) return;
  try {
    const was = enriching.value;
    enrichment.value = await endpoints.enrichmentState();
    const states = Object.values(enrichment.value || {});
    // Start sources that never ran, and resume ones that failed or stalled (e.g.
    // the API restarted mid-run). Once per visit, so a failing source can't loop.
    if (!enrichResumed && sync.value?.status === 'completed' && states.some((s) => s.status === 'never' || s.status === 'error')) {
      enrichResumed = true;
      enrichment.value = await endpoints.startEnrichment();
    }
    if (enriching.value) {
      enrichVersion.value++;
      enrichTimer = setTimeout(pollEnrichment, 8000);
    } else if (was) {
      enrichVersion.value++;
    }
  } catch {
    // Enrichment is optional; try again later.
    enrichTimer = setTimeout(pollEnrichment, 30_000);
  }
}

export async function loadOverview() {
  try {
    const o = await endpoints.libraryOverview();
    overview.value = o.status === 'ok' ? o : null;
  } catch {
    // The navigation simply shows no counts.
  }
}

// Called once the user is known; syncs when the copy is missing or stale.
export async function startStatus() {
  if (running) return;
  running = true;
  await pollSync();
  const s = sync.value;
  const stale = !s?.finished_at || Date.now() - new Date(s.finished_at) > AUTO_SYNC_MIN * 60_000;
  if (s && !syncing.value && (s.status === 'never' || stale)) await startSync();
  if (s?.status !== 'never') loadOverview();
  pollEnrichment();
}

export function stopStatus() {
  running = false;
  enrichResumed = false;
  clearTimeout(syncTimer);
  clearTimeout(enrichTimer);
  clearTimeout(exportTimer);
  sync.value = enrichment.value = exportJob.value = overview.value = null;
}

// ---- Export all playlists to one CSV ----------------------------------------------

function triggerDownload(url) {
  const link = document.createElement('a');
  link.href = url;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function startExportAll() {
  if (exportJob.value && !['completed', 'error'].includes(exportJob.value.status)) return;
  exportJob.value = { status: 'starting', current: 0, total: 0 };
  let jobId;
  try {
    ({ jobId } = await endpoints.startExportAll());
  } catch (e) {
    exportJob.value = { status: 'error', error: `Could not start the export: ${describeError(e)}` };
    return;
  }
  const poll = async () => {
    try {
      const p = await endpoints.getExportProgress(jobId);
      if (p.status === 'completed') {
        exportJob.value = { ...p, downloadUrl: endpoints.downloadExportUrl(jobId) };
        triggerDownload(exportJob.value.downloadUrl);
      } else if (p.status === 'error') {
        exportJob.value = { ...p, error: `Export failed: ${p.error}` };
      } else {
        exportJob.value = p;
        exportTimer = setTimeout(poll, 1000);
      }
    } catch (e) {
      exportJob.value = { status: 'error', error: `Lost track of the export: ${describeError(e)}` };
    }
  };
  exportTimer = setTimeout(poll, 500);
}

export function dismissExport() {
  clearTimeout(exportTimer);
  exportJob.value = null;
}

export function ago(iso) {
  if (!iso) return '';
  const min = Math.round((Date.now() - new Date(iso)) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  const days = Math.round(h / 24);
  if (days < 60) return `${days} days ago`;
  const months = Math.round(days / 30.4);
  if (months < 24) return `${months} months ago`;
  return `${Math.round(days / 365.25)} years ago`;
}
