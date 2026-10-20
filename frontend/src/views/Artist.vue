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

// Everything in your library by one artist.
const props = defineProps({ me: Object, meLoading: Boolean, id: String });
const router = useRouter();

const artist = ref(null);
const error = ref(null);
const loading = ref(false);
const tint = ref(null);

async function load() {
  if (!props.me || !props.id) return;
  loading.value = true;
  error.value = null;
  try {
    artist.value = await endpoints.artist(props.id);
  } catch (e) {
    artist.value = null;
    error.value = describeError(e);
  } finally {
    loading.value = false;
  }
}
watch(() => [props.me, props.id], load, { immediate: true });
watch(syncVersion, load);
watch(() => artist.value?.name, (n) => setTitle(n || 'Artist'), { immediate: true });

const picture = computed(() => artist.value?.photo?.image_lg || artist.value?.photo?.image || artist.value?.image || null);
watch(picture, async (url) => { tint.value = await coverTint(url); }, { immediate: true });

const fmtMonth = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : null);
const fmtLen = (ms) => {
  if (!ms) return '';
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const tags = computed(() => [...new Set([...(artist.value?.tags || []), ...(artist.value?.genres || [])])].slice(0, 6));
const otherArtists = (s) => s.artists.filter((a) => a.id !== props.id);
const SONGS_STEP = 25;
const songsShown = ref(SONGS_STEP);
watch(() => props.id, () => (songsShown.value = SONGS_STEP));
</script>

<template>
  <div v-if="meLoading || me" class="entity">
    <header class="hero" :style="tint ? { '--tint': tint } : null" :class="{ tinted: tint }">
      <div class="hero-inner">
        <button class="btn btn-link back" @click="router.back()"><Icon name="arrow-left" :size="16" /> Back</button>
        <div class="hero-row">
          <img v-if="picture" :src="picture" alt="" class="portrait" />
          <span v-else class="portrait placeholder"><Icon name="mic" :size="40" /></span>
          <div class="hero-text">
            <p class="eyebrow">Artist</p>
            <h1 v-if="artist?.name">{{ artist.name }}</h1>
            <div v-else class="skeleton" style="height: 44px; width: 60%"></div>
            <p v-if="artist?.counts" class="meta">
              <template v-if="artist.counts.songs">
                {{ plural(artist.counts.songs, 'song') }} in your library
                <template v-if="artist.counts.playlists"> · in {{ plural(artist.counts.playlists, 'playlist') }}</template>
                <template v-if="artist.first_liked"> · first liked {{ fmtMonth(artist.first_liked) }}</template>
              </template>
              <template v-else>Not in your library yet</template>
            </p>
            <p v-if="artist?.origin" class="meta">
              From {{ artist.origin.area || artist.origin.country }}<template v-if="artist.origin.since">, since {{ artist.origin.since }}</template>
            </p>
            <div v-if="tags.length" class="chips">
              <span v-for="t in tags" :key="t" class="chip">{{ t }}</span>
            </div>
            <a v-if="artist" :href="artist.url" target="_blank" rel="noopener noreferrer" class="btn btn-spotify btn-sm open">
              Open in Spotify <Icon name="external" :size="14" />
            </a>
          </div>
        </div>
      </div>
    </header>

    <div class="page body">
      <div v-if="error" class="alert alert-error" role="alert">{{ error }}</div>
      <div v-if="artist?.status === 'not_synced'" class="panel"><p class="muted">Available as soon as your library has been copied.</p></div>
      <div v-if="loading && !artist" class="skeleton" style="height: 300px; border-radius: 16px"></div>

      <div v-if="artist?.status === 'ok'" class="layout">
        <section class="panel songs" aria-labelledby="h-songs">
          <div class="panel-head">
            <h2 id="h-songs">Your songs</h2>
            <p v-if="artist.counts.songs">{{ artist.counts.liked }} liked · sorted by how many places you keep them</p>
          </div>
          <p v-if="!artist.counts.songs" class="muted">You haven't saved or added any songs by {{ artist.name }} yet.</p>
          <ol v-else class="song-list" role="list">
            <li v-for="s in artist.songs.slice(0, songsShown)" :key="s.id" class="song">
              <img v-if="s.image" :src="s.image" alt="" loading="lazy" />
              <span v-else class="noimg"></span>
              <div class="song-main">
                <p class="song-title">
                  <a :href="spotifyUrl('track', s.id)" target="_blank" rel="noopener noreferrer" class="sp-link">{{ s.name }}</a>
                  <Icon v-if="s.liked" name="heart" :size="13" class="liked" />
                  <span v-if="s.liked" class="visually-hidden">liked</span>
                </p>
                <p class="song-sub">
                  <router-link v-if="s.album?.id" :to="`/album/${s.album.id}`" class="in-link">{{ s.album.name }}</router-link>
                  <template v-if="otherArtists(s).length"> · with {{ otherArtists(s).map((a) => a.name).join(', ') }}</template>
                </p>
              </div>
              <div class="song-places">
                <router-link v-for="p in s.playlists.slice(0, 3)" :key="p.id" :to="`/playlist/${p.id}`" class="pl-chip">{{ p.name }}</router-link>
                <span v-if="s.playlists.length > 3" class="muted small">+{{ s.playlists.length - 3 }}</span>
              </div>
              <span class="len num">{{ fmtLen(s.duration_ms) }}</span>
            </li>
          </ol>
          <button v-if="artist.songs.length > songsShown" class="btn btn-secondary btn-sm more" @click="songsShown += SONGS_STEP">
            Show {{ Math.min(SONGS_STEP, artist.songs.length - songsShown) }} more
          </button>
        </section>

        <aside class="side">
          <section v-if="artist.likes_by_year.length > 1" class="panel" aria-labelledby="h-years">
            <div class="panel-head"><h2 id="h-years">Likes per year</h2></div>
            <div class="years" role="img" :aria-label="`Songs by ${artist.name} liked per year`">
              <div v-for="y in artist.likes_by_year" :key="y.year" class="ycol" :title="`${y.year}: ${plural(y.count, 'song')}`">
                <i :style="{ height: `${(y.count / Math.max(...artist.likes_by_year.map((x) => x.count))) * 100}%` }"></i>
              </div>
            </div>
            <div class="year-axis"><span>{{ artist.likes_by_year[0].year }}</span><span>{{ artist.likes_by_year.at(-1).year }}</span></div>
          </section>

          <section v-if="artist.albums.length" class="panel" aria-labelledby="h-albums">
            <div class="panel-head"><h2 id="h-albums">Albums</h2></div>
            <ul class="mini-list" role="list">
              <li v-for="a in artist.albums.slice(0, 8)" :key="a.id">
                <router-link :to="`/album/${a.id}`" class="mini-row">
                  <img v-if="a.image" :src="a.image" alt="" loading="lazy" />
                  <span class="mini-text"><strong>{{ a.name }}</strong><span>{{ a.release_date?.slice(0, 4) }} · {{ plural(a.songs, 'song') }} you have</span></span>
                </router-link>
              </li>
            </ul>
          </section>

          <section v-if="artist.playlists.length" class="panel" aria-labelledby="h-pls">
            <div class="panel-head"><h2 id="h-pls">In your playlists</h2></div>
            <BarList :rows="artist.playlists.map((p) => ({ label: p.name, value: p.songs, to: `/playlist/${p.id}` }))" unit="songs" />
          </section>

          <section v-if="artist.similar.length" class="panel" aria-labelledby="h-similar">
            <div class="panel-head"><h2 id="h-similar">Similar artists</h2><p>From Last.fm</p></div>
            <ul class="similar" role="list">
              <li v-for="s in artist.similar" :key="s.name">
                <router-link v-if="s.id" :to="`/artist/${s.id}`" class="sim in">{{ s.name }}</router-link>
                <a v-else :href="`https://open.spotify.com/search/${encodeURIComponent(s.name)}`" target="_blank" rel="noopener noreferrer" class="sim out" :title="`Not in your library: search ${s.name} on Spotify`">
                  {{ s.name }} <Icon name="external" :size="11" />
                </a>
              </li>
            </ul>
            <p class="source">Artists you have link to their page here; others open a Spotify search.</p>
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
.portrait { width: 184px; height: 184px; border-radius: 50%; object-fit: cover; flex: none; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35); background: var(--surface-muted); }
.placeholder { display: flex; align-items: center; justify-content: center; color: var(--faint); }
.hero-text { min-width: 0; padding-bottom: 6px; }
.hero-text h1 { margin: 4px 0 8px; font-size: clamp(2.2rem, 5vw, 3.6rem); line-height: 1; letter-spacing: -0.03em; overflow-wrap: anywhere; }
.meta { margin: 0 0 4px; color: var(--text); opacity: 0.85; font-size: 15px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 0; }
.chip { font-size: 12.5px; padding: 3px 10px; border-radius: 999px; background: color-mix(in srgb, var(--surface) 70%, transparent); border: 1px solid var(--border); }
.open { margin-top: 16px; }

.body { padding-top: 20px; }
.layout { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(280px, 1fr); gap: 20px; align-items: start; }
.side { display: flex; flex-direction: column; gap: 20px; }

.song-list { list-style: none; margin: 0; padding: 0; }
.song { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto 44px; gap: 12px; align-items: center; padding: 8px 0; border-top: 1px solid var(--border); }
.song:first-child { border-top: none; }
.song img, .song .noimg { width: 40px; height: 40px; border-radius: 4px; object-fit: cover; background: var(--surface-muted); }
.song-main { min-width: 0; }
.song-title { margin: 0; font-weight: 650; display: flex; align-items: center; gap: 6px; }
.song-title a { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.liked { color: var(--accent-text); flex: none; }
.liked :deep(path) { fill: currentColor; }
.song-sub { margin: 1px 0 0; font-size: 13px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.song-places { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px; max-width: 280px; }
.pl-chip { padding: 2px 9px; border-radius: 999px; font-size: 12px; font-weight: 600; background: var(--surface-muted); color: var(--text); text-decoration: none; white-space: nowrap; max-width: 140px; overflow: hidden; text-overflow: ellipsis; }
.pl-chip:hover { background: var(--accent-soft); color: var(--accent-strong); }
.len { font-size: 13px; color: var(--muted); text-align: right; }
.more { margin-top: 12px; }

.years { display: flex; align-items: flex-end; gap: 3px; height: 90px; }
.ycol { flex: 1; height: 100%; display: flex; align-items: flex-end; }
.ycol i { display: block; width: 100%; min-height: 2px; border-radius: 3px 3px 0 0; background: var(--mark); }
.year-axis { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted); margin-top: 4px; }

.mini-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.mini-row { display: grid; grid-template-columns: 44px 1fr; gap: 10px; align-items: center; padding: 4px; border-radius: 8px; color: inherit; text-decoration: none; }
.mini-row:hover { background: var(--surface-muted); }
.mini-row img { width: 44px; height: 44px; border-radius: 4px; object-fit: cover; }
.mini-text { display: flex; flex-direction: column; min-width: 0; font-size: 14px; }
.mini-text strong, .mini-text span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mini-text span { font-size: 12.5px; color: var(--muted); }

.similar { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.sim { display: inline-flex; align-items: center; gap: 4px; padding: 4px 12px; border-radius: 999px; font-size: 13px; font-weight: 600; text-decoration: none; }
.sim.in { background: var(--accent-soft); color: var(--accent-strong); }
.sim.out { border: 1px dashed var(--border-strong); color: var(--muted); }
.sim:hover { text-decoration: underline; }

@media (max-width: 900px) {
  .layout { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .hero-inner { padding: 16px 16px 4px; }
  .hero-row { flex-direction: column; align-items: flex-start; gap: 16px; }
  .portrait { width: 132px; height: 132px; }
  .song { grid-template-columns: 40px minmax(0, 1fr) 40px; }
  .song-places { grid-column: 2 / 4; justify-content: flex-start; max-width: none; }
}
</style>
