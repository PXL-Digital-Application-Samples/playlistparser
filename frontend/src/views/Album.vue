<script setup>
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { endpoints, describeError, spotifyUrl } from '../api.js';
import { plural } from '../playlistCache.js';
import { setTitle } from '../title.js';
import { coverTint } from '../coverTint.js';
import { syncVersion } from '../status.js';
import Icon from '../components/Icon.vue';
import BarList from '../components/BarList.vue';

// Your songs from one album, against its full track list.
const props = defineProps({ me: Object, meLoading: Boolean, id: String });
const router = useRouter();

const album = ref(null);
const error = ref(null);
const loading = ref(false);
const tint = ref(null);

async function load() {
  if (!props.me || !props.id) return;
  loading.value = true;
  error.value = null;
  try {
    album.value = await endpoints.album(props.id);
  } catch (e) {
    album.value = null;
    error.value = describeError(e);
  } finally {
    loading.value = false;
  }
}
watch(() => [props.me, props.id], load, { immediate: true });
watch(syncVersion, load);
watch(() => album.value?.name, (n) => setTitle(n || 'Album'), { immediate: true });
watch(() => album.value?.image_lg || album.value?.image, async (url) => { tint.value = await coverTint(url); }, { immediate: true });

const fmtLen = (ms) => {
  if (!ms) return '';
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const mine = computed(() => new Map((album.value?.songs || []).map((s) => [s.id, s])));
const TYPES = { album: 'Album', single: 'Single', compilation: 'Compilation' };
</script>

<template>
  <div v-if="meLoading || me" class="entity">
    <header class="hero" :style="tint ? { '--tint': tint } : null" :class="{ tinted: tint }">
      <div class="hero-inner">
        <button class="btn btn-link back" @click="router.back()"><Icon name="arrow-left" :size="16" /> Back</button>
        <div class="hero-row">
          <img v-if="album?.image_lg || album?.image" :src="album.image_lg || album.image" alt="" class="art" />
          <span v-else class="art placeholder"><Icon name="disc" :size="40" /></span>
          <div class="hero-text">
            <p class="eyebrow">{{ TYPES[album?.album_type] || 'Album' }}<template v-if="album?.release_date"> · {{ album.release_date.slice(0, 4) }}</template></p>
            <h1 v-if="album?.name">{{ album.name }}</h1>
            <div v-else class="skeleton" style="height: 44px; width: 60%"></div>
            <p v-if="album?.artists?.length" class="meta">
              by <template v-for="(a, i) in album.artists" :key="a.id || a.name"><router-link v-if="a.id" :to="`/artist/${a.id}`" class="in-link artist">{{ a.name }}</router-link><template v-else>{{ a.name }}</template><template v-if="i < album.artists.length - 1">, </template></template>
            </p>
            <p v-if="album?.counts" class="meta">
              <template v-if="album.counts.songs">
                You have {{ album.counts.songs }}<template v-if="album.total_tracks"> of {{ album.total_tracks }}</template> songs
                · {{ album.counts.liked }} liked<template v-if="album.counts.playlists"> · in {{ plural(album.counts.playlists, 'playlist') }}</template>
              </template>
              <template v-else>None of its songs are in your library</template>
            </p>
            <p v-if="album?.saved_whole?.length" class="meta small">Saved as a whole album on {{ album.saved_whole.map((d) => d.slice(0, 10)).join(', ') }}.</p>
            <a v-if="album" :href="album.url" target="_blank" rel="noopener noreferrer" class="btn btn-spotify btn-sm open">
              Open in Spotify <Icon name="external" :size="14" />
            </a>
          </div>
        </div>
      </div>
    </header>

    <div class="page body">
      <div v-if="error" class="alert alert-error" role="alert">{{ error }}</div>
      <div v-if="album?.status === 'not_synced'" class="panel"><p class="muted">Available as soon as your library has been copied.</p></div>
      <div v-if="loading && !album" class="skeleton" style="height: 300px; border-radius: 16px"></div>

      <div v-if="album?.status === 'ok'" class="layout">
        <section class="panel" aria-labelledby="h-tracks">
          <div class="panel-head">
            <h2 id="h-tracks">{{ album.tracklist ? 'Track list' : 'Your songs' }}</h2>
            <p v-if="album.tracklist">Highlighted songs are in your library.</p>
          </div>
          <ol v-if="album.tracklist" class="tracklist" role="list">
            <li v-for="t in album.tracklist" :key="t.id" class="track" :class="{ have: t.in_library }">
              <span class="no num">{{ t.number }}</span>
              <div class="t-main">
                <p class="t-title">
                  <a :href="spotifyUrl('track', t.id)" target="_blank" rel="noopener noreferrer" class="sp-link">{{ t.name }}</a>
                  <Icon v-if="mine.get(t.id)?.liked" name="heart" :size="13" class="liked" />
                  <span v-if="mine.get(t.id)?.liked" class="visually-hidden">liked</span>
                </p>
                <p v-if="mine.get(t.id)?.playlists.length" class="t-sub">
                  <router-link v-for="p in mine.get(t.id).playlists" :key="p.id" :to="`/playlist/${p.id}`" class="pl-chip">{{ p.name }}</router-link>
                </p>
              </div>
              <span class="len num">{{ fmtLen(t.duration_ms) }}</span>
            </li>
          </ol>
          <ol v-else class="tracklist" role="list">
            <li v-for="s in album.songs" :key="s.id" class="track have">
              <span class="no"></span>
              <div class="t-main">
                <p class="t-title">
                  <a :href="spotifyUrl('track', s.id)" target="_blank" rel="noopener noreferrer" class="sp-link">{{ s.name }}</a>
                  <Icon v-if="s.liked" name="heart" :size="13" class="liked" />
                </p>
                <p v-if="s.playlists.length" class="t-sub">
                  <router-link v-for="p in s.playlists" :key="p.id" :to="`/playlist/${p.id}`" class="pl-chip">{{ p.name }}</router-link>
                </p>
              </div>
              <span class="len num">{{ fmtLen(s.duration_ms) }}</span>
            </li>
          </ol>
        </section>

        <aside class="side">
          <section v-if="album.playlists.length" class="panel" aria-labelledby="h-pls">
            <div class="panel-head"><h2 id="h-pls">In your playlists</h2></div>
            <BarList :rows="album.playlists.map((p) => ({ label: p.name, value: p.songs, to: `/playlist/${p.id}` }))" unit="songs" />
          </section>
          <section v-if="album.total_tracks && album.counts.songs" class="panel completion" aria-labelledby="h-done">
            <div class="panel-head"><h2 id="h-done">How much you have</h2></div>
            <p class="big num">{{ Math.round((album.counts.songs / album.total_tracks) * 100) }}%</p>
            <span class="progress-track"><span class="progress-fill" :style="{ width: `${Math.min(100, (album.counts.songs / album.total_tracks) * 100)}%` }"></span></span>
            <p class="muted small">{{ album.counts.songs }} of {{ album.total_tracks }} songs are in your Liked Songs or playlists.</p>
          </section>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hero { background: var(--bg); }
.hero.tinted { background: linear-gradient(180deg, color-mix(in srgb, var(--tint) 34%, var(--bg)) 0%, var(--bg) 100%); }
.hero-inner { max-width: 1180px; margin: 0 auto; padding: 20px 32px 8px; }
.back { margin-bottom: 14px; color: var(--text); }
.hero-row { display: flex; gap: 28px; align-items: flex-end; }
.art { width: 200px; height: 200px; border-radius: 10px; object-fit: cover; flex: none; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35); background: var(--surface-muted); }
.placeholder { display: flex; align-items: center; justify-content: center; color: var(--faint); }
.hero-text { min-width: 0; padding-bottom: 6px; }
.hero-text h1 { margin: 4px 0 8px; font-size: clamp(2rem, 4.5vw, 3.2rem); line-height: 1.02; letter-spacing: -0.03em; overflow-wrap: anywhere; }
.meta { margin: 0 0 4px; font-size: 15px; }
.artist { font-weight: 700; }
.open { margin-top: 16px; }

.body { padding-top: 20px; }
.layout { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(260px, 1fr); gap: 20px; align-items: start; }
.side { display: flex; flex-direction: column; gap: 20px; }

.tracklist { list-style: none; margin: 0; padding: 0; }
.track { display: grid; grid-template-columns: 28px minmax(0, 1fr) 48px; gap: 10px; align-items: center; padding: 8px 6px; border-radius: 8px; color: var(--muted); }
.track.have { color: var(--text); background: var(--accent-soft); margin-bottom: 2px; }
.track:not(.have) .sp-link { color: var(--muted); }
.no { font-size: 13px; color: var(--muted); text-align: right; }
.t-main { min-width: 0; }
.t-title { margin: 0; display: flex; align-items: center; gap: 6px; font-weight: 600; }
.t-title a { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.liked { color: var(--accent-text); flex: none; }
.liked :deep(path) { fill: currentColor; }
.t-sub { margin: 4px 0 0; display: flex; flex-wrap: wrap; gap: 4px; }
.pl-chip { padding: 1px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; background: var(--surface); color: var(--text); text-decoration: none; }
.pl-chip:hover { text-decoration: underline; }
.len { font-size: 13px; text-align: right; color: var(--muted); }
.completion .big { margin: 0 0 8px; font-family: var(--font-display); font-size: 2.2rem; font-weight: 700; line-height: 1; }
.completion .progress-track { width: 100%; height: 8px; }

@media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
@media (max-width: 640px) {
  .hero-inner { padding: 16px 16px 4px; }
  .hero-row { flex-direction: column; align-items: flex-start; gap: 16px; }
  .art { width: 148px; height: 148px; }
}
</style>
