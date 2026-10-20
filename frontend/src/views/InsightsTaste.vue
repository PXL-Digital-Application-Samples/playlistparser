<script setup>
import { computed, inject } from 'vue';
import { spotifyUrl } from '../api.js';
import { plural } from '../playlistCache.js';
import { highlightCards } from '../highlights.js';
import { familyColor } from '../families.js';
import TasteFingerprint from '../components/TasteFingerprint.vue';
import DecadeBars from '../components/DecadeBars.vue';
import StoryCards from '../components/StoryCards.vue';
import CoverWall from '../components/CoverWall.vue';
import BarList from '../components/BarList.vue';
import ChartFrame from '../components/ChartFrame.vue';
import { heroName } from '../transitions.js';
import ShareButton from '../components/ShareButton.vue';

const props = defineProps({ summary: Object, deep: Object, lensKey: String });
const loginUrl = inject('loginUrl');

const lens = computed(() => props.summary?.lenses?.[props.lensKey] ?? null);
const unit = computed(() => (props.lensKey === 'all' ? 'like' : 'song'));
const taste = computed(() => props.summary?.taste);
const fpMain = computed(() => taste.value?.play ?? taste.value?.liked ?? null);
const fpCompare = computed(() => (taste.value?.play ? taste.value.liked : null));

const fmtLen = (ms) => {
  if (!ms) return '—';
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const peakDecade = (p) => [...p.decades].sort((a, b) => b.share - a.share)[0]?.decade;
const profileLine = computed(() => {
  const p = fpMain.value;
  if (!p) return '';
  const parts = [`Mostly ${peakDecade(p)} music`];
  if (p.median_age_years !== null) parts.push(`typically ${Math.round(p.median_age_years)} years old`);
  if (p.artist_variety_pct !== null) parts.push(p.artist_variety_pct >= 70 ? 'spread over many artists' : p.artist_variety_pct >= 40 ? 'with a few favourite artists' : 'from a small circle of artists');
  return `${parts.join(', ')}.`;
});
const compareLine = computed(() => {
  const play = taste.value?.play;
  const liked = taste.value?.liked;
  if (!play || !liked || play.median_age_years === null || liked.median_age_years === null) return null;
  const diff = Math.round(liked.median_age_years - play.median_age_years);
  if (Math.abs(diff) < 2) return 'What you play and what you like are about the same age.';
  return diff > 0
    ? `What you play is about ${diff} years newer than what you like.`
    : `What you play is about ${-diff} years older than what you like.`;
});

const cards = computed(() => highlightCards(props.summary, props.lensKey));
// The summary as a shareable card, with the most-liked album as its picture.
const tasteCard = computed(() => ({
  kicker: 'My taste',
  big: profileLine.value,
  text: fpMain.value?.top_genres.length ? fpMain.value.top_genres.slice(0, 4).map((g) => g.genre).join(' · ') : compareLine.value,
  image: lens.value?.wall[0]?.image_lg || lens.value?.wall[0]?.image || null,
}));
const decadeRows = computed(() => {
  const p = fpMain.value;
  if (!p) return [];
  return p.decades.map((d) => ({
    decade: d.decade, main: `${Math.round(d.share * 100)}%`,
    compare: fpCompare.value ? `${Math.round((fpCompare.value.decades.find((x) => x.decade === d.decade)?.share ?? 0) * 100)}%` : '—',
  }));
});
</script>

<template>
  <div class="stack-lg">
    <!-- The headline about your taste, then the fingerprint as its picture. -->
    <section v-if="fpMain" class="hero" aria-labelledby="h-taste">
      <div class="hero-text">
        <h2 id="h-taste" class="hero-line">{{ profileLine }}</h2>
        <p v-if="compareLine" class="muted">{{ compareLine }}</p>
        <p v-if="!taste.play" class="muted small">
          Based on your hand-picked likes. <a :href="loginUrl">Log in again</a> to base it on what you actually play.
        </p>
        <div v-if="fpMain.top_genres.length" class="chips" aria-label="Top genres">
          <span v-for="g in fpMain.top_genres" :key="g.genre" class="chip">{{ g.genre }}</span>
        </div>
        <div v-reveal="'count'" class="tiles facts">
          <div class="tile"><strong>{{ fmtLen(fpMain.avg_length_ms) }}</strong><span class="label">average song</span></div>
          <div class="tile"><strong>{{ fpMain.explicit_pct ?? 0 }}%</strong><span class="label">explicit</span></div>
          <div class="tile"><strong>{{ fpMain.artist_variety_pct ?? 0 }}%</strong><span class="label">artist variety</span></div>
          <div v-if="summary.album_saves.saves" class="tile"><strong>{{ summary.album_saves.saves }}</strong><span class="label">whole albums saved</span></div>
        </div>
        <ShareButton :card="tasteCard" class="hero-share" />
      </div>
      <div class="hero-art">
        <TasteFingerprint
          :profile="fpMain"
          :compare="fpCompare"
          :label="taste.play ? 'What you play' : 'What you hand-picked'"
          compare-label="What you hand-picked"
        />
      </div>
    </section>

    <section v-if="cards.length" aria-labelledby="h-highlights">
      <h2 id="h-highlights" class="section-title">Highlights</h2>
      <StoryCards :cards="cards" />
    </section>

    <section v-if="fpMain" class="panel" aria-labelledby="h-decades">
      <div class="panel-head">
        <h2 id="h-decades">Decades</h2>
        <p>When the songs were released{{ fpCompare ? ': what you play against what you hand-picked' : '' }}.</p>
      </div>
      <ChartFrame label="Share of songs per release decade" :rows="decadeRows"
        :columns="[{ key: 'decade', label: 'Decade' }, { key: 'main', label: taste.play ? 'What you play' : 'Hand-picked', num: true }, ...(fpCompare ? [{ key: 'compare', label: 'Hand-picked', num: true }] : [])]">
        <DecadeBars :main="fpMain.decades" :compare="fpCompare?.decades" :main-label="taste.play ? 'What you play' : 'What you hand-picked'" compare-label="What you hand-picked" />
      </ChartFrame>
    </section>

    <section v-if="lens?.wall.length" v-reveal class="panel" aria-labelledby="h-wall">
      <div class="panel-head">
        <h2 id="h-wall">Your cover wall</h2>
        <p>Bigger cover = more {{ lensKey === 'all' ? 'likes (a whole-album save counts once)' : 'hand-picked songs' }} from that album.</p>
      </div>
      <CoverWall :albums="lens.wall" :unit="lensKey === 'all' ? 'likes' : 'songs'" />
    </section>

    <section v-if="lens" class="panel" aria-labelledby="h-age">
      <div class="panel-head"><h2 id="h-age">Music age and length</h2></div>
      <div class="grid-2">
        <div>
          <h3>How old songs were when you liked them</h3>
          <BarList :rows="lens.age.age_buckets.map((b) => ({ label: b.label, value: b.count }))" unit="songs" />
          <p class="muted small">Median: {{ lens.age.median_age_years }} years. {{ lens.age.same_year_pct }}% were liked in their release year.</p>
        </div>
        <div>
          <h3>Song length</h3>
          <BarList :rows="lens.age.length_buckets.map((b) => ({ label: b.label, value: b.count }))" unit="songs" />
          <h3>Explicit songs per release decade</h3>
          <BarList :rows="lens.age.explicit_by_decade.map((d) => ({ label: d.decade, value: d.pct, sub: plural(d.total, 'song') }))" unit="%" :max="100" />
        </div>
      </div>
    </section>

    <section v-if="lens" class="panel" aria-labelledby="h-depth">
      <div class="panel-head"><h2 id="h-depth">Artists and albums</h2></div>
      <div class="grid-2">
        <div>
          <h3>Most liked artists</h3>
          <BarList :rows="lens.depth.deepest.map((a) => ({ label: a.name, value: a.count, to: a.id ? `/artist/${a.id}` : null }))" :unit="unit + 's'" />
          <h3>How deep you go per artist</h3>
          <BarList :rows="lens.depth.buckets.map((b) => ({ label: b.label, value: b.count }))" unit="artists" />
          <p class="muted small">Your top 10 artists account for {{ lens.depth.top10_share_pct }}% of your {{ unit }}s.</p>
        </div>
        <div>
          <h3>Albums you liked (almost) completely</h3>
          <p v-if="!lens.depth.complete_albums.length" class="muted">None: no album with 4+ songs is 80% liked{{ lensKey === 'handpicked' ? ' song by song' : '' }}.</p>
          <ul v-else class="album-list">
            <li v-for="a in lens.depth.complete_albums" :key="a.name + a.artist">
              <router-link :to="`/album/${a.id}`" class="album-row">
                <img v-if="a.image" :src="a.image" alt="" loading="lazy" :style="heroName(`/album/${a.id}`)" />
                <span class="album-text"><strong>{{ a.name }}</strong><span>{{ a.artist }}</span></span>
                <span class="count">{{ a.liked }}/{{ a.total }}</span>
              </router-link>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <section v-if="deep?.tags?.length" class="panel" aria-labelledby="h-genres">
      <div class="panel-head">
        <h2 id="h-genres">Genres</h2>
        <p>The three strongest Last.fm tags of each artist, counted per {{ unit }}.</p>
      </div>
      <ul class="tag-cloud" role="list">
        <li v-for="t in deep.tags" :key="t.tag" class="tag" :style="{ fontSize: `${13 + Math.min(14, Math.sqrt(t.count) * 1.6)}px` }">
          <i :style="{ background: familyColor(t.family) }" aria-hidden="true"></i>{{ t.tag }} <small>{{ t.count }}</small>
        </li>
      </ul>
      <p class="source">Source: Last.fm</p>
    </section>

    <section v-if="deep?.classical?.length" class="panel" aria-labelledby="h-classical">
      <div class="panel-head">
        <h2 id="h-classical">Classical corner</h2>
        <p>Composers and works behind your classical recordings, with the performers you liked them by.</p>
      </div>
      <div class="composers">
        <article v-for="c in deep.classical" :key="c.name" class="composer">
          <h3>{{ c.name }} <span class="muted">{{ plural(c.count, unit) }}</span></h3>
          <p class="small">{{ c.works.map((w) => w.title).join(' · ') }}</p>
          <p v-if="c.performers.length" class="muted small">Performed by {{ c.performers.map((p) => p.name).join(', ') }}</p>
        </article>
      </div>
      <p class="source">Source: MusicBrainz</p>
    </section>
  </div>
</template>

<style scoped>
.stack-lg { display: flex; flex-direction: column; gap: 28px; }
.section-title { margin: 0 0 12px; font-size: 1.3rem; }
.panel h3 { font-size: 1rem; margin: 14px 0 8px; }

.hero {
  display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(220px, 300px); gap: 32px; align-items: center;
  background: var(--surface); border: 1px solid var(--border); border-radius: 20px; padding: 28px 30px;
}
.hero-line { margin: 0 0 10px; font-size: clamp(1.6rem, 3vw, 2.2rem); line-height: 1.12; }
.hero-text > p { margin: 0 0 6px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 14px 0 0; }
.chip { font-size: 12.5px; padding: 3px 10px; border-radius: 999px; background: var(--accent-soft); color: var(--accent-strong); }
.facts { margin-top: 18px; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); }
.facts .tile { background: var(--surface-muted); border-color: transparent; }
.hero-share { margin-top: 16px; }
.hero-art { max-width: 300px; justify-self: center; width: 100%; }

.album-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.album-row { display: grid; grid-template-columns: 40px 1fr auto; gap: 10px; align-items: center; padding: 4px; border-radius: 8px; color: inherit; text-decoration: none; }
.album-row:hover { background: var(--surface-muted); }
.album-row img { width: 40px; height: 40px; border-radius: 4px; object-fit: cover; }
.album-text { display: flex; flex-direction: column; min-width: 0; font-size: 14px; }
.album-text strong, .album-text span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.album-text span { color: var(--muted); font-size: 13px; }
.album-row .count { float: none; }

.tag-cloud { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px 16px; align-items: baseline; }
.tag { font-weight: 700; display: inline-flex; align-items: baseline; gap: 6px; }
.tag i { width: 9px; height: 9px; border-radius: 50%; display: inline-block; align-self: center; }
.tag small { color: var(--muted); font-weight: 400; font-size: 12px; }
.composers { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.composer { background: var(--surface-muted); border-radius: var(--radius-sm); padding: 12px 14px; }
.composer h3 { margin: 0 0 4px; font-size: 1rem; }
.composer p { margin: 2px 0; }

@media (max-width: 760px) {
  .hero { grid-template-columns: 1fr; padding: 20px; }
  .hero-art { max-width: 240px; }
}
</style>
