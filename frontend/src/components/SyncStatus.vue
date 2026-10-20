<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { endpoints, describeError } from '../api.js';
import { plural } from '../playlistCache.js';

// Shows the library sync state, starts a sync when the copy is missing or
// older than AUTO_SYNC_MIN, polls while it runs and emits `synced` when done.
const emit = defineEmits(['synced', 'state']);
const AUTO_SYNC_MIN = 30;

const state = ref(null);
const error = ref(null);
let timer = null;

const running = computed(() => state.value?.status === 'running');
const pct = computed(() => (state.value?.total ? Math.round((state.value.done / state.value.total) * 100) : 0));

function ago(iso) {
  const min = Math.round((Date.now() - new Date(iso)) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

async function poll() {
  clearTimeout(timer);
  try {
    const wasRunning = running.value;
    state.value = await endpoints.librarySyncState();
    emit('state', state.value);
    error.value = null;
    if (running.value) timer = setTimeout(poll, 1500);
    else if (wasRunning) emit('synced', state.value);
  } catch (e) {
    error.value = describeError(e);
    timer = setTimeout(poll, 5000);
  }
}

async function sync() {
  try {
    state.value = await endpoints.startLibrarySync();
    emit('state', state.value);
    error.value = null;
    timer = setTimeout(poll, 800);
  } catch (e) {
    error.value = describeError(e);
  }
}

onMounted(async () => {
  await poll();
  const s = state.value;
  const stale = !s?.finished_at || Date.now() - new Date(s.finished_at) > AUTO_SYNC_MIN * 60_000;
  if (s && !running.value && (s.status === 'never' || stale)) sync();
});
onBeforeUnmount(() => clearTimeout(timer));
defineExpose({ sync });
</script>

<template>
  <div class="sync" role="status" aria-live="polite">
    <template v-if="running">
      <span class="dot pulsing" aria-hidden="true"></span>
      <span class="text">
        Syncing your library
        <template v-if="state.total"> · {{ state.done }} of {{ plural(state.total, 'playlist') }}</template>
        <span v-if="state.current" class="muted"> · {{ state.current }}</span>
      </span>
      <span v-if="state.total" class="track"><span class="fill" :style="{ width: `${pct}%` }"></span></span>
    </template>
    <template v-else-if="state">
      <span class="dot" :class="state.status === 'error' || state.failed ? 'warn' : 'ok'" aria-hidden="true"></span>
      <span class="text">
        <template v-if="state.status === 'never'">Library not synced yet</template>
        <template v-else-if="state.status === 'error'">Sync failed: {{ state.error }}</template>
        <template v-else>
          Library synced {{ ago(state.finished_at) }} · {{ plural(state.playlists, 'playlist') }}
          <span v-if="state.failed_playlists?.length" class="warn-text" :title="state.failed_playlists.map((p) => `${p.name}: ${p.error}`).join('\n')">
            · {{ state.failed_playlists.length }} couldn't be read
          </span>
        </template>
      </span>
      <button class="btn-link link" @click="sync">Sync now</button>
    </template>
    <span v-if="error" class="warn-text">{{ error }}</span>
  </div>
</template>

<style scoped>
.sync {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  font-size: 13px; padding: 8px 12px; border-radius: 999px;
  background: var(--surface); border: 1px solid var(--border);
}
.text { min-width: 0; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); flex: none; }
.dot.ok { background: #1db954; }
.dot.warn { background: #e8590c; }
.dot.pulsing { background: #1db954; animation: pulse 1s ease-in-out infinite alternate; }
@keyframes pulse { from { opacity: 0.35; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .dot.pulsing { animation: none; } }
.track { width: 120px; height: 5px; background: var(--surface-muted); border-radius: 3px; overflow: hidden; }
.fill { display: block; height: 100%; background: #1db954; transition: width 0.3s ease; }
.warn-text { color: #b4410a; }
.link { font: inherit; font-size: 13px; padding: 0; cursor: pointer; }
</style>
