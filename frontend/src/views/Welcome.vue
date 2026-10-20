<script setup>
import { inject } from 'vue';
import ThemeSwitch from '../components/ThemeSwitch.vue';
import RecordLogo from '../components/RecordLogo.vue';
import CursorTrail from '../components/CursorTrail.vue';

const loginUrl = inject('loginUrl');
const DECADES = [['60s', 26], ['70s', 46], ['80s', 74], ['90s', 65], ['00s', 100], ['10s', 89], ['20s', 36]];
// Made-up sample rows for the illustration (labelled "example" on the page).
const SAMPLE_DUPES = [{ song: 'Harbor Lights', n: 4 }, { song: 'Paper Satellites', n: 3 }, { song: 'Slow Weather', n: 3 }];
</script>

<template>
  <div class="welcome">
    <CursorTrail />
    <header class="w-top">
      <span class="brand"><RecordLogo /><span class="brand-text">Playlist Parser</span></span>
      <ThemeSwitch />
    </header>

    <section class="w-hero">
      <div class="w-copy">
        <p class="eyebrow">For your Spotify library</p>
        <h1>See what your playlists are really made of.</h1>
        <p class="lede">
          Statistics for every playlist and your Liked Songs, the same song hiding in several playlists,
          songs Spotify greyed out, and charts of your taste: decades, genres, tempo and where your artists come from.
        </p>
        <a :href="loginUrl" class="btn btn-spotify btn-login">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.84-.179-.959-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.361 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z" />
          </svg>
          Log in with Spotify
        </a>
        <ul class="promises">
          <li>Read-only: nothing on your Spotify account is changed</li>
          <li>Export any playlist, or all of them, to CSV</li>
        </ul>
        <p class="dev-note">This app runs in Spotify development mode: the app owner must add your account first.</p>
      </div>

      <div class="w-art" aria-label="Examples of what the app shows" role="img">
        <div class="ex ex-taste">
          <p class="ex-k">Taste · example</p>
          <p class="ex-big">Mostly 2000s music, typically 23 years old.</p>
          <div class="ex-bars">
            <div v-for="[d, v] in DECADES" :key="d"><i :style="{ height: `${v}%` }"></i><span>{{ d }}</span></div>
          </div>
        </div>
        <div class="ex ex-health">
          <p class="ex-k">Health · example</p>
          <p class="ex-big"><b>12</b> songs in two or more playlists</p>
          <p class="ex-small"><b>5</b> greyed out by Spotify · <b>40</b> liked but in no playlist</p>
          <ul class="ex-rows">
            <li v-for="r in SAMPLE_DUPES" :key="r.song"><span class="ex-song">{{ r.song }}</span><span class="ex-in">in {{ r.n }} playlists</span></li>
          </ul>
        </div>
        <div class="ex ex-covers" aria-hidden="true">
          <i v-for="n in 9" :key="n" :class="`c${n}`"></i>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.welcome { min-height: 100vh; display: flex; flex-direction: column; padding: 0 max(16px, 4vw); }
.w-top { display: flex; align-items: center; justify-content: space-between; padding: 20px 0; }
.w-hero {
  flex: 1; display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); gap: 56px; align-items: center;
  max-width: 1160px; width: 100%; margin: 0 auto; padding: 32px 0 72px;
}
.w-copy h1 { font-size: clamp(2.3rem, 5vw, 3.7rem); line-height: 1.02; margin: 12px 0 18px; letter-spacing: -0.03em; }
.lede { font-size: 1.12rem; color: var(--muted); max-width: 48ch; margin: 0 0 28px; }
.btn-login { font-size: 16px; min-height: 50px; padding: 12px 26px; }
.promises { list-style: none; padding: 0; margin: 26px 0 0; display: flex; flex-direction: column; gap: 8px; font-size: 15px; }
.promises li { display: flex; gap: 10px; align-items: baseline; }
.promises li::before { content: '✓'; color: var(--good); font-weight: 800; }
.dev-note { margin: 22px 0 0; font-size: 13px; color: var(--muted); max-width: 52ch; }

/* Example panels: illustrations of the app's views (fixed sample numbers). */
.w-art { position: relative; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: auto auto; gap: 14px; }
.ex { background: var(--surface); border: 1px solid var(--border); border-radius: 18px; padding: 18px; box-shadow: var(--shadow); }
.ex-k { margin: 0 0 8px; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent-text); }
.ex-big { margin: 0; font-family: var(--font-display); font-weight: 700; font-size: 1.3rem; line-height: 1.15; }
.ex-big b { color: var(--accent-text); }
.ex-small { margin: 10px 0 0; font-size: 13px; color: var(--muted); }
.ex-small b { color: var(--text); }
.ex-taste { grid-column: span 2; }
.ex-health { display: flex; flex-direction: column; }
.ex-rows { list-style: none; margin: auto 0 0; padding: 14px 0 0; display: flex; flex-direction: column; gap: 6px; }
.ex-rows li { display: flex; justify-content: space-between; gap: 8px; padding: 6px 10px; border-radius: 8px; background: var(--surface-muted); font-size: 13px; }
.ex-song { font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ex-in { color: var(--muted); white-space: nowrap; }
.ex-bars { display: flex; align-items: flex-end; gap: 8px; height: 110px; margin-top: 16px; }
.ex-bars div { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 4px; }
.ex-bars i { width: 100%; border-radius: 5px 5px 2px 2px; background: var(--mark); }
.ex-bars span { font-size: 11px; color: var(--muted); }
.ex-covers { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; padding: 6px; background: var(--cover-bg); border-color: transparent; }
.ex-covers i { aspect-ratio: 1; border-radius: 4px; }
/* Fixed artwork colours: they stand in for album covers. */
.c1 { background: linear-gradient(135deg, #e85d75, #7a2a6b); }
.c2 { background: linear-gradient(135deg, #3fa7d6, #1f3a93); }
.c3 { background: linear-gradient(135deg, #f6c453, #d9572b); }
.c4 { background: linear-gradient(135deg, #59c38b, #1e5e4a); }
.c5 { background: linear-gradient(135deg, #a78bfa, #4c1d95); }
.c6 { background: linear-gradient(135deg, #f0a95b, #6b3a1e); }
.c7 { background: linear-gradient(135deg, #94a3b8, #334155); }
.c8 { background: linear-gradient(135deg, #fb7185, #9f1239); }
.c9 { background: linear-gradient(135deg, #2dd4bf, #115e59); }

.brand { display: inline-flex; align-items: center; gap: 10px; }

@media (max-width: 860px) {
  .w-hero { grid-template-columns: 1fr; gap: 40px; padding-top: 8px; }
}
@media (max-width: 480px) {
  .w-art { grid-template-columns: 1fr; }
  .ex-taste { grid-column: auto; }
  .ex-covers { display: none; }
}
</style>
