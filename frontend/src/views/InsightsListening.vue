<script setup>
import { ref, computed, inject, onMounted } from 'vue';
import { spotifyUrl } from '../api.js';
import { plural } from '../playlistCache.js';
import CoverGrid from '../components/CoverGrid.vue';
import RankRace from '../components/RankRace.vue';
import ListeningClock from '../components/ListeningClock.vue';
import ChartFrame from '../components/ChartFrame.vue';
import BarList from '../components/BarList.vue';

const props = defineProps({ summary: Object, collection: Object, loadCollection: Function });
const loginUrl = inject('loginUrl');
onMounted(() => props.loadCollection());

const top = computed(() => (props.summary?.listening.top.status === 'ok' ? props.summary.listening.top.data : null));
const recent = computed(() => (props.summary?.listening.recent.status === 'ok' ? props.summary.listening.recent.data : null));
const names = (t) => t.artists.map((a) => a.name).join(', ');

const RANGES = [
  { key: 'short_term', label: '4 weeks' },
  { key: 'medium_term', label: '6 months' },
  { key: 'long_term', label: '1 year' },
];
const playRange = ref('short_term');
const playKind = ref('tracks');
const playItems = computed(() => {
  const data = top.value?.[playRange.value];
  if (!data) return [];
  return playKind.value === 'tracks'
    ? data.tracks.slice(0, 15).map((t) => ({ id: t.id, name: t.name, sub: names(t), image: t.image, image_lg: t.image_lg, url: spotifyUrl('track', t.id) }))
    : data.artists.slice(0, 15).map((a) => ({ id: a.id, name: a.name, sub: a.genres.slice(0, 2).join(', ') || 'artist', image: a.image, image_lg: a.image_lg, to: `/artist/${a.id}` }));
});

const raceRows = computed(() => {
  if (!top.value) return [];
  const rank = (range, id) => {
    const i = top.value[range].artists.slice(0, 10).findIndex((a) => a.id === id);
    return i === -1 ? '—' : `#${i + 1}`;
  };
  const artists = new Map();
  for (const r of ['long_term', 'medium_term', 'short_term']) for (const a of top.value[r].artists.slice(0, 10)) artists.set(a.id, a);
  return [...artists.values()].map((a) => ({
    name: a.name, long: rank('long_term', a.id), medium: rank('medium_term', a.id), short: rank('short_term', a.id),
    links: { name: `/artist/${a.id}` },
  }));
});

const col = computed(() => props.collection?.data);
</script>

<template>
  <div class="stack-lg">
    <section v-if="top" class="panel" aria-labelledby="h-play">
      <div class="panel-head play-head">
        <h2 id="h-play">Your top {{ playKind === 'tracks' ? 'songs' : 'artists' }}</h2>
        <div class="controls">
          <div class="seg" role="group" aria-label="Songs or artists">
            <button :aria-pressed="playKind === 'tracks'" @click="playKind = 'tracks'">Songs</button>
            <button :aria-pressed="playKind === 'artists'" @click="playKind = 'artists'">Artists</button>
          </div>
          <div class="seg" role="group" aria-label="Period">
            <button v-for="r in RANGES" :key="r.key" :aria-pressed="playRange === r.key" @click="playRange = r.key">{{ r.label }}</button>
          </div>
        </div>
      </div>
      <CoverGrid :items="playItems" />
      <p class="source">Ranked by Spotify. Spotify shares rankings, not play counts.</p>
    </section>
    <div v-else-if="summary.listening.top.status === 'reauth'" class="panel">
      <p class="muted">Your top songs and artists need an extra permission. <a :href="loginUrl">Log in again</a> to see them.</p>
    </div>

    <section v-if="top" class="panel" aria-labelledby="h-race">
      <div class="panel-head">
        <h2 id="h-race">How your top artists moved</h2>
        <p>Your top 10 over the past year, 6 months and 4 weeks.</p>
      </div>
      <ChartFrame label="Your top artists per period" :rows="raceRows"
        :columns="[{ key: 'name', label: 'Artist' }, { key: 'long', label: 'Past year' }, { key: 'medium', label: 'Past 6 months' }, { key: 'short', label: 'Past 4 weeks' }]">
        <RankRace :top="top" />
      </ChartFrame>
    </section>

    <section v-if="recent?.length" class="grid-2 two" aria-label="Recent listening">
      <div class="panel">
        <div class="panel-head"><h2>When you listen</h2><p>Your last {{ recent.length }} plays by hour of day.</p></div>
        <ListeningClock :plays="recent" />
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Recently played</h2></div>
        <ul class="recent" role="list">
          <li v-for="p in recent.slice(0, 8)" :key="p.played_at">
            <a :href="spotifyUrl('track', p.track.id)" target="_blank" rel="noopener noreferrer" class="recent-row">
              <img v-if="p.track.image" :src="p.track.image" alt="" loading="lazy" />
              <span class="recent-text"><strong>{{ p.track.name }}</strong><span>{{ names(p.track) }}</span></span>
            </a>
          </li>
        </ul>
      </div>
    </section>

    <!-- Followed artists, saved albums, podcasts (loaded when this tab opens) -->
    <p v-if="collection.loading && !col" class="muted">Loading your followed artists, saved albums and podcasts…</p>
    <div v-if="collection.error" class="alert alert-error">{{ collection.error }}</div>

    <section v-if="col" class="panel" aria-labelledby="h-follow">
      <div class="panel-head"><h2 id="h-follow">Who you follow</h2></div>
      <p v-if="col.follow.status === 'reauth'" class="muted"><a :href="loginUrl">Log in again</a> to compare with the artists you follow.</p>
      <div v-else class="grid-2">
        <div>
          <h3>You love them, but don't follow them</h3>
          <p class="muted small">5+ likes (an album save counts once), not followed on Spotify.</p>
          <BarList v-if="col.follow.loved_not_followed.length" :rows="col.follow.loved_not_followed.map((a) => ({ label: a.name, value: a.count, to: `/artist/${a.id}` }))" unit="likes" />
          <p v-else class="muted">You follow every artist you like a lot.</p>
        </div>
        <div>
          <h3>You follow them, but never liked a song</h3>
          <p class="muted small">{{ col.follow.followed_never_liked_total }} of the {{ col.follow.followed_total }} artists you follow.</p>
          <ul class="avatar-row" role="list">
            <li v-for="a in col.follow.followed_never_liked.slice(0, 18)" :key="a.id">
              <a :href="spotifyUrl('artist', a.id)" target="_blank" rel="noopener noreferrer" class="avatar" :title="`${a.name} (opens Spotify)`">
                <img v-if="a.image" :src="a.image" alt="" loading="lazy" />
                <span v-else class="noimg"></span>
                <span class="avatar-name">{{ a.name }}</span>
              </a>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <section v-if="col?.albums.status === 'ok' && col.albums.total" class="panel" aria-labelledby="h-albums">
      <div class="panel-head">
        <h2 id="h-albums">Saved albums</h2>
        <p>{{ col.albums.total }} albums, {{ plural(col.albums.tracks_total, 'song') }}. Most recently saved first.</p>
      </div>
      <ul class="album-strip" role="list">
        <li v-for="a in col.albums.recent" :key="a.id">
          <router-link :to="`/album/${a.id}`" class="album-card">
            <img v-if="a.image" :src="a.image" alt="" loading="lazy" />
            <strong>{{ a.name }}</strong>
            <span>{{ a.artist }} · saved {{ a.added_at?.slice(0, 10) }}</span>
          </router-link>
        </li>
      </ul>
      <h3>Saved albums by release decade</h3>
      <BarList :rows="col.albums.decades.map((d) => ({ label: d.decade, value: d.count }))" unit="albums" />
    </section>

    <section v-if="col?.podcasts.status === 'ok'" class="panel" aria-labelledby="h-pods">
      <div class="panel-head"><h2 id="h-pods">Podcasts and audiobooks</h2></div>
      <p v-if="!col.podcasts.shows_total && !col.podcasts.episodes_total && !col.podcasts.audiobooks_total" class="muted">
        No saved shows, episodes or audiobooks.
      </p>
      <template v-else>
        <p>
          {{ plural(col.podcasts.shows_total, 'show') }} followed ·
          {{ plural(col.podcasts.episodes_total, 'episode') }} saved ({{ col.podcasts.episodes_hours }} hours) ·
          {{ plural(col.podcasts.audiobooks_total, 'audiobook') }}
        </p>
        <ul class="album-strip" role="list">
          <li v-for="s in [...col.podcasts.shows, ...col.podcasts.audiobooks]" :key="s.id">
            <a :href="spotifyUrl(s.publisher !== undefined ? 'show' : 'audiobook', s.id)" target="_blank" rel="noopener noreferrer" class="album-card">
              <img v-if="s.image" :src="s.image" alt="" loading="lazy" />
              <strong>{{ s.name }}</strong>
              <span>{{ s.publisher || s.authors }}</span>
            </a>
          </li>
        </ul>
      </template>
    </section>
  </div>
</template>

<style scoped>
.stack-lg { display: flex; flex-direction: column; gap: 28px; }
.panel h3 { font-size: 1rem; margin: 14px 0 6px; }
.play-head { align-items: center; }
.controls { display: flex; flex-wrap: wrap; gap: 8px; }
.two { gap: 20px; }

.recent { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.recent-row { display: grid; grid-template-columns: 40px 1fr; gap: 10px; align-items: center; padding: 4px; border-radius: 8px; color: inherit; text-decoration: none; }
.recent-row:hover { background: var(--surface-muted); }
.recent-row img { width: 40px; height: 40px; border-radius: 4px; object-fit: cover; }
.recent-text { display: flex; flex-direction: column; min-width: 0; font-size: 14px; }
.recent-text strong, .recent-text span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.recent-text span { color: var(--muted); font-size: 13px; }

.avatar-row { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 12px; }
.avatar { display: block; width: 72px; text-align: center; color: inherit; text-decoration: none; }
.avatar img, .avatar .noimg { width: 60px; height: 60px; border-radius: 50%; object-fit: cover; display: block; margin: 0 auto; background: var(--surface-muted); }
.avatar-name { display: block; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 4px; }

.album-strip { list-style: none; margin: 0; padding: 4px 0 8px; display: grid; grid-auto-flow: column; grid-auto-columns: 132px; gap: 12px; overflow-x: auto; }
.album-card { display: flex; flex-direction: column; gap: 2px; color: inherit; text-decoration: none; min-width: 0; font-size: 13px; }
.album-card img { width: 132px; height: 132px; object-fit: cover; border-radius: var(--radius-sm); margin-bottom: 6px; }
.album-card strong, .album-card span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.album-card span { color: var(--muted); font-size: 12px; }
.album-card:hover strong { text-decoration: underline; }
</style>
