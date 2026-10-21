// Generates a made-up music library and runs the API's real computations on
// it, writing the API responses the frontend's demo mode serves
// (VITE_DEMO=true). Used for README screenshots without personal data.
//
//   node scripts/demo-fixtures.js
//
// Output: ../frontend/src/demo/fixtures.json and ../frontend/public/demo/*.svg
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeItems, computeStats, findDuplicates } from '../src/lib/tracks.js';
import {
  splitLikes, likeCalendar, libraryOverTime, musicAge, artistDepth, albumWall, tasteProfile,
  followGap, savedAlbumsStats, podcastStats, likedOverlap, findUnplayable, briefArtist, briefTrack,
} from '../src/lib/insights.js';
import { soundMap, tasteEras, musicAtlas, constellation, topTags, classicalCorner } from '../src/lib/deep.js';
import { summarizeListeners, artistKey } from '../src/lib/metadata.js';
import {
  libraryOverview, crossPlaylistDuplicates, artistView, albumView, compareTracks, libraryArtistIds,
} from '../src/lib/explore.js';

const here = dirname(fileURLToPath(import.meta.url));
const OUT_JSON = join(here, '../../frontend/src/demo/fixtures.json');
const OUT_IMG = join(here, '../../frontend/public/demo');

// ---- Deterministic randomness -------------------------------------------------------
let seed = 20261020;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const weighted = (pairs) => {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of pairs) if ((r -= w) <= 0) return v;
  return pairs.at(-1)[0];
};
const ID = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const spotifyId = () => Array.from({ length: 22 }, () => pick(ID)).join('');

// ---- Vocabulary ------------------------------------------------------------------------
const FAMILY_SPECS = {
  rock: { tags: ['indie rock', 'alternative', 'shoegaze', 'post-punk'], countries: ['US', 'GB', 'IE', 'AU'], years: [1985, 2024], bpm: [100, 160], explicit: 0.08 },
  electronic: { tags: ['electronic', 'ambient', 'house', 'downtempo'], countries: ['DE', 'FR', 'GB', 'NL'], years: [1995, 2025], bpm: [110, 132], explicit: 0.03 },
  'hip hop': { tags: ['hip-hop', 'rap', 'jazz rap'], countries: ['US', 'FR', 'GB'], years: [1992, 2025], bpm: [80, 100], explicit: 0.7 },
  'jazz & soul': { tags: ['jazz', 'soul', 'funk'], countries: ['US', 'ZA', 'GB'], years: [1958, 2023], bpm: [70, 120], explicit: 0.02 },
  'folk & country': { tags: ['folk', 'singer-songwriter', 'americana'], countries: ['US', 'CA', 'IS', 'SE'], years: [1965, 2025], bpm: [70, 115], explicit: 0.02 },
  classical: { tags: ['classical', 'baroque', 'piano'], countries: ['DE', 'AT', 'IT', 'RU'], years: [1960, 2022], bpm: [55, 110], explicit: 0 },
  pop: { tags: ['pop', 'synthpop', 'dream pop'], countries: ['SE', 'GB', 'KR', 'US'], years: [1980, 2026], bpm: [100, 128], explicit: 0.1 },
  world: { tags: ['bossa nova', 'latin', 'afrobeat'], countries: ['BR', 'CU', 'NG', 'MX'], years: [1962, 2024], bpm: [85, 125], explicit: 0.02 },
};
const AREA = { US: 'United States', GB: 'United Kingdom', IE: 'Ireland', AU: 'Australia', DE: 'Germany', FR: 'France', NL: 'Netherlands', ZA: 'South Africa', CA: 'Canada', IS: 'Iceland', SE: 'Sweden', AT: 'Austria', IT: 'Italy', RU: 'Russia', KR: 'South Korea', BR: 'Brazil', CU: 'Cuba', NG: 'Nigeria', MX: 'Mexico', BE: 'Belgium' };
const NAME_A = ['Velvet', 'Paper', 'Silver', 'Northern', 'Quiet', 'Electric', 'Golden', 'Hollow', 'Lunar', 'Wild', 'Glass', 'Static', 'Amber', 'Neon', 'Cedar', 'Coral', 'Blue', 'Crimson', 'Distant', 'Echo'];
const NAME_B = ['Owls', 'Harbors', 'Satellites', 'Lanterns', 'Foxes', 'Rivers', 'Gardens', 'Pilots', 'Machines', 'Tides', 'Ghosts', 'Choirs', 'Comets', 'Wolves', 'Orchards', 'Signals'];
const FIRST = ['Marta', 'Jonas', 'Ines', 'Theo', 'Lena', 'Ruben', 'Nora', 'Kofi', 'Elif', 'Sami', 'Ada', 'Milo', 'Yara', 'Bram', 'Ivy', 'Otto'];
const LAST = ['Linde', 'Okafor', 'Vasquez', 'Brandt', 'Moreau', 'Sato', 'Jansen', 'Rivera', 'Kowalski', 'Nyberg', 'Haddad', 'Ferreira', 'Doyle', 'Laurent'];
const WORDS = ['Midnight', 'Harbor', 'Satellite', 'Morning', 'Glass', 'Highway', 'Summer', 'Echoes', 'Paper', 'Weather', 'Static', 'Gold', 'Rivers', 'Lights', 'Orbit', 'Fever', 'Garden', 'Window', 'Signal', 'Northern', 'Slow', 'Ocean', 'Velvet', 'Ghost', 'Neon', 'Wild', 'Quiet', 'Arcade', 'Lantern', 'Comet'];
const COMPOSERS = ['Johann Sebastian Bach', 'Wolfgang Amadeus Mozart', 'Erik Satie', 'Claude Debussy', 'Frédéric Chopin'];
const WORKS = { 'Johann Sebastian Bach': ['Goldberg Variations', 'Cello Suite No. 1', 'Partita No. 2'], 'Wolfgang Amadeus Mozart': ['Piano Sonata No. 11', 'Requiem'], 'Erik Satie': ['Gymnopédies', 'Gnossiennes'], 'Claude Debussy': ['Clair de lune', 'Arabesque No. 1'], 'Frédéric Chopin': ['Nocturne Op. 9', 'Ballade No. 1'] };

const title = (n) => Array.from({ length: n }, () => pick(WORDS)).join(' ');
const artistName = (fam) => (fam === 'classical' ? `${pick(FIRST)} ${pick(LAST)}` : rnd() < 0.45 ? `${pick(FIRST)} ${pick(LAST)}` : `The ${pick(NAME_A)} ${pick(NAME_B)}`);

// Abstract SVG cover per album, written to public/demo/.
mkdirSync(OUT_IMG, { recursive: true });
let coverN = 0;
function cover(fam, name) {
  const n = ++coverN;
  const h = Math.floor(rnd() * 360);
  const h2 = (h + 40 + Math.floor(rnd() * 120)) % 360;
  const shape = n % 4;
  const art = [
    `<circle cx="${int(80, 220)}" cy="${int(80, 220)}" r="${int(60, 120)}" fill="hsl(${h2} 75% 60%)" opacity=".85"/>`,
    `<rect x="${int(20, 120)}" y="${int(20, 120)}" width="${int(120, 200)}" height="${int(120, 200)}" fill="hsl(${h2} 70% 55%)" opacity=".8" transform="rotate(${int(-20, 20)} 150 150)"/>`,
    Array.from({ length: 6 }, (_, i) => `<rect x="0" y="${i * 50}" width="300" height="24" fill="hsl(${(h2 + i * 12) % 360} 70% ${45 + i * 5}%)" opacity=".75"/>`).join(''),
    `<path d="M0 ${int(160, 240)} Q 150 ${int(40, 140)} 300 ${int(160, 240)} L300 300 L0 300 Z" fill="hsl(${h2} 70% 55%)"/>`,
  ][shape];
  const initials = name.replace(/^The /, '').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="hsl(${h} 45% 22%)"/>${art}<text x="280" y="44" text-anchor="end" font-family="Segoe UI, Arial, sans-serif" font-size="30" font-weight="800" fill="rgba(255,255,255,.9)">${initials}</text></svg>`;
  writeFileSync(join(OUT_IMG, `cover-${n}.svg`), svg);
  const url = `/demo/cover-${n}.svg`;
  return [{ url, width: 640, height: 640 }, { url, width: 300, height: 300 }];
}

// ---- Artists, albums, tracks ------------------------------------------------------------
const families = Object.keys(FAMILY_SPECS);
const artists = [];
for (const fam of families) {
  const n = { rock: 14, electronic: 10, pop: 8, 'folk & country': 7, 'jazz & soul': 6, 'hip hop': 6, world: 5, classical: 5 }[fam];
  for (let i = 0; i < n; i++) {
    const name = artistName(fam);
    if (artists.some((a) => a.name === name)) continue;
    artists.push({ id: spotifyId(), name, fam, country: pick(FAMILY_SPECS[fam].countries), weight: 0.3 + rnd() ** 2 * 3, albums: [] });
  }
}
artists[0].country = 'BE'; // a little local colour

const albums = [];
for (const a of artists) {
  const spec = FAMILY_SPECS[a.fam];
  for (let i = 0, n = int(1, 3); i < n; i++) {
    const name = title(int(1, 3));
    const year = int(spec.years[0], spec.years[1]);
    const total = int(8, 14);
    const album = { id: spotifyId(), name, album_type: rnd() < 0.15 ? 'single' : 'album', release_date: `${year}-${String(int(1, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`, total_tracks: total, images: cover(a.fam, name), artist: a, tracks: [] };
    for (let t = 0; t < total; t++) {
      const composer = a.fam === 'classical' ? pick(COMPOSERS) : null;
      album.tracks.push({
        id: spotifyId(), name: composer ? `${pick(WORKS[composer])}: ${pick(['I.', 'II.', 'III.', 'Aria', 'Prelude', 'Variation ' + int(1, 30)])}` : title(int(1, 3)),
        type: 'track', duration_ms: int(150, a.fam === 'classical' || a.fam === 'electronic' ? 520 : 330) * 1000,
        explicit: rnd() < spec.explicit, external_ids: { isrc: `XX${spotifyId().slice(0, 10).toUpperCase()}` },
        external_urls: { spotify: '#' }, artists: [{ id: a.id, name: a.name }, ...(composer ? [{ id: spotifyId(), name: composer }] : [])],
        album: { id: album.id, name: album.name, album_type: album.album_type, release_date: album.release_date, total_tracks: total, images: album.images },
        composer,
      });
    }
    a.albums.push(album);
    albums.push(album);
  }
}

// Era-dependent taste: rock early, then electronic, later jazz/folk/world.
const eraWeights = (year) => families.map((f) => [f, {
  rock: year < 2018 ? 4 : 1.5, electronic: year >= 2016 && year <= 2021 ? 4 : 1, pop: 1.5, 'folk & country': year >= 2020 ? 3 : 1,
  'jazz & soul': year >= 2021 ? 3 : 0.8, 'hip hop': year >= 2017 && year <= 2020 ? 2.5 : 0.6, world: year >= 2023 ? 3 : 0.5, classical: 0.8,
}[f]]);
const byFam = (fam) => artists.filter((a) => a.fam === fam);

const likedItems = [];
const likedIds = new Set();
const dateIn = (year) => new Date(Date.UTC(year, int(0, 11), int(1, 28), int(7, 23), int(0, 59), int(0, 59)));
for (let i = 0; i < 640; i++) {
  const year = weighted([[2015, 6], [2016, 7], [2017, 8], [2018, 7], [2019, 6], [2020, 8], [2021, 9], [2022, 8], [2023, 9], [2024, 10], [2025, 11], [2026, 7]]);
  const a = weighted(byFam(weighted(eraWeights(year))).map((x) => [x, x.weight]));
  const t = pick(pick(a.albums).tracks);
  if (likedIds.has(t.id)) continue;
  likedIds.add(t.id);
  likedItems.push({ added_at: dateIn(year).toISOString().replace('.000', ''), track: t });
}
// A few whole-album saves (bulk), like Spotify adds when you save an album.
for (const fam of ['classical', 'rock', 'jazz & soul', 'electronic', 'classical']) {
  const album = pick(pick(byFam(fam)).albums);
  const at = dateIn(int(2016, 2024)).toISOString().replace('.000', '');
  for (const t of album.tracks) if (!likedIds.has(t.id)) { likedIds.add(t.id); likedItems.push({ added_at: at, track: t }); }
}
likedItems.sort((a, b) => b.added_at.localeCompare(a.added_at));
const liked = normalizeItems(likedItems);

// ---- Playlists ----------------------------------------------------------------------------
const ME = { id: 'demo-user', spotifyId: 'demo', displayName: 'Demo listener' };
const PLAYLIST_NAMES = ['Late night drives', 'Sunday coffee', 'Running 170', 'Deep focus', 'Summer 2019', 'Roadtrip Iceland', 'Rainy day', 'Party starters', 'Piano evenings', 'Old favourites', 'Kitchen dancing', 'Discover later'];
const allTracks = albums.flatMap((al) => al.tracks);
const playlists = PLAYLIST_NAMES.map((name, i) => {
  const items = [];
  const n = int(14, 60);
  for (let j = 0; j < n; j++) {
    const t = rnd() < 0.6 ? pick(likedItems).track : pick(allTracks);
    items.push({ added_at: dateIn(int(2016, 2026)).toISOString().replace('.000', ''), added_by: { id: i % 5 === 0 && j % 3 === 0 ? 'friend' : 'demo' }, track: t });
  }
  if (i === 2) items.push(items[3]); // a duplicate to find
  const collaborative = i % 5 === 0;
  return {
    id: spotifyId(), name, description: i === 1 ? 'Slow songs for slow mornings.' : null,
    owner: { id: 'demo', display_name: ME.displayName }, collaborative, public: !collaborative,
    images: items[0].track.album.images, external_urls: { spotify: '#' }, items: { total: items.length },
    tracksItems: items,
  };
});
const followed = ['This Is Lo-Fi', 'Indie Mix', 'Jazz Classics'].map((name) => ({
  id: spotifyId(), name, description: 'A playlist you follow.', owner: { id: 'someone', display_name: 'Spotify' }, collaborative: false,
  images: pick(albums).images, external_urls: { spotify: '#' }, items: { total: int(50, 120) },
}));

// ---- Enrichment and listening data ----------------------------------------------------------
const artistInfo = new Map(artists.map((a) => [artistKey(a.name), {
  tags: FAMILY_SPECS[a.fam].tags.slice(0, 3).map((name, i) => ({ name, count: 100 - i * 25 })),
  similar: [
    ...byFam(a.fam).filter((b) => b !== a).slice(0, 4).map((b) => ({ name: b.name, match: Math.round((0.5 + rnd() * 0.5) * 100) / 100 })),
    ...(rnd() < 0.6 ? [{ name: `The ${pick(NAME_A)} ${pick(NAME_B)} Club`, match: 0.6 }] : []),
  ],
  country: a.country, area: AREA[a.country],
}]));
// Shared "ghost" suggestions: similar to several rock and electronic artists.
for (const [fam, ghost] of [['rock', 'Harbor Lights Collective'], ['electronic', 'Nightswim Radio'], ['folk & country', 'Ada Lindqvist']]) {
  for (const a of byFam(fam).slice(0, 4)) artistInfo.get(artistKey(a.name)).similar.push({ name: ghost, match: 0.7 });
}
const bpm = new Map(allTracks.map((t) => [t.external_ids.isrc, int(...FAMILY_SPECS[artists.find((a) => a.id === t.artists[0].id).fam].bpm)]));
const listeners = new Map(allTracks.map((t) => [t.id, Math.round(10 ** (2 + rnd() * 4.3))]));
const works = new Map(allTracks.filter((t) => t.composer).map((t) => [t.external_ids.isrc, { composer: t.composer, work: t.name.split(':')[0] }]));

const RANGES = ['short_term', 'medium_term', 'long_term'];
const topArtists = (bias) => [...artists].sort((a, b) => (b.weight * (bias[b.fam] ?? 1)) - (a.weight * (bias[a.fam] ?? 1))).slice(0, 50);
const top = Object.fromEntries(RANGES.map((r, i) => {
  const bias = [{ 'jazz & soul': 3, world: 2.5, 'folk & country': 2 }, { 'folk & country': 2, electronic: 1.5 }, { rock: 1.8, electronic: 1.4 }][i];
  const ta = topArtists(bias);
  const tt = ta.slice(0, 25).flatMap((a) => [pick(pick(a.albums).tracks), pick(pick(a.albums).tracks)]).slice(0, 50);
  const withImg = (a) => ({ ...a, images: a.albums[0].images, genres: FAMILY_SPECS[a.fam].tags.slice(0, 2) });
  return [r, { artists: ta.map((a) => briefArtist(withImg(a))), tracks: tt.map(briefTrack) }];
}));
const now = Date.UTC(2026, 9, 20, 21, 0);
const recent = Array.from({ length: 50 }, (_, i) => {
  const hourBias = weighted([[8, 2], [9, 3], [13, 2], [17, 3], [19, 4], [21, 6], [22, 6], [23, 3]]);
  const d = new Date(now - Math.floor(i / 6) * 86_400_000);
  d.setUTCHours(hourBias - 2, int(0, 59));
  return { played_at: d.toISOString(), track: briefTrack(pick(top.short_term.tracks.length ? allTracks.filter((t) => top.short_term.artists.slice(0, 15).some((a) => a.id === t.artists[0].id)) : allTracks)) };
}).sort((a, b) => b.played_at.localeCompare(a.played_at));

// ---- Compute API responses with the real functions ------------------------------------------
const split = splitLikes(liked);
const lens = (songs, events) => ({
  counts: { songs: songs.length, likes: events.length },
  stats: computeStats(songs),
  calendar: likeCalendar(events),
  over_time: libraryOverTime(events),
  age: musicAge(songs),
  depth: artistDepth(songs, events),
  wall: albumWall(events),
});
const likedInfo = { id: 'liked', name: 'Liked Songs', description: null, owner: { id: 'demo', display_name: ME.displayName }, public: false, collaborative: false, image: null, url: 'https://open.spotify.com/collection/tracks', liked: true };
const responses = {};
const put = (key, value) => { responses[key] = value; };

put('GET /me', ME);
const summarize = (p) => ({
  id: p.id, name: p.name, description: p.description, owner: p.owner, public: p.public, collaborative: p.collaborative,
  tracks_total: p.items.total, image: p.images[1].url, url: '#', analyzable: p.owner.id === 'demo' || p.collaborative,
});
put('GET /me/playlists', { liked: { ...likedInfo, tracks_total: liked.length, analyzable: true }, items: [...playlists, ...followed].map(summarize) });

const lfm = new Map(liked.map((t) => [t.id, { listeners: listeners.get(t.id), playcount: listeners.get(t.id) * 9 }]));
const statsFor = (info, tracks) => ({ playlist: info, ...computeStats(tracks), lastfm_status: 'ok' });
const listenersFor = (tracks) => ({ enabled: true, complete: true, looked_up: tracks.length, eligible: tracks.length, ...summarizeListeners(tracks, lfm) });

put('GET /playlists/liked/contents', {
  count: liked.length,
  tracks: liked.map((t) => (split.handpicked.includes(t) ? t : { ...t, album_save: true })),
});
const likedStats = (which) => {
  const s = computeStats(which === 'all' ? liked : split.handpicked);
  if (which === 'all') s.top_artists = artistDepth(liked, split.events).deepest.map(({ id, name, count }) => ({ id: id ?? null, name, count }));
  return { playlist: likedInfo, ...s, lens: which, lens_counts: { handpicked: split.handpicked.length, all: liked.length, album_saves: split.bulkGroups.length }, lastfm_status: 'ok' };
};
put('GET /playlists/liked/stats?lens=handpicked', likedStats('handpicked'));
put('GET /playlists/liked/stats?lens=all', likedStats('all'));
put('GET /playlists/liked/simulate-dedupe', findDuplicates(liked));
put('GET /playlists/liked/listeners', listenersFor(liked));

const playlistSources = [];
for (const p of playlists) {
  const tracks = normalizeItems(p.tracksItems);
  const info = { id: p.id, name: p.name, description: p.description, owner: p.owner, public: p.public, collaborative: p.collaborative, image: p.images[1].url, url: '#' };
  playlistSources.push({ info, tracks });
  for (const t of tracks) if (!lfm.has(t.id)) lfm.set(t.id, { listeners: listeners.get(t.id), playcount: listeners.get(t.id) * 9 });
  put(`GET /playlists/${p.id}/contents`, { count: tracks.length, tracks });
  put(`GET /playlists/${p.id}/stats`, statsFor(info, tracks));
  put(`GET /playlists/${p.id}/simulate-dedupe`, findDuplicates(tracks));
  put(`GET /playlists/${p.id}/listeners`, listenersFor(tracks));
}

const playTracks = [...new Map(RANGES.flatMap((r) => top[r].tracks).map((t) => [t.id, t])).values()];
const playGenres = [...new Map(RANGES.flatMap((r) => top[r].artists).map((a) => [a.id, a])).values()].flatMap((a) => a.genres);
put('GET /insights/summary', {
  liked_status: 'ok',
  liked_synced_at: new Date(now).toISOString(),
  lenses: { handpicked: lens(split.handpicked, split.handpicked), all: lens(liked, split.events) },
  album_saves: {
    saves: split.bulkGroups.length,
    songs: liked.length - split.handpicked.length,
    biggest: split.bulkGroups.map((g) => ({ id: g.album.id, name: g.name, artist: g.artists[0]?.name ?? '', image: g.album.image, songs: g.tracks, added_at: g.added_at })),
  },
  taste: { play: tasteProfile(playTracks, playGenres), liked: tasteProfile(split.handpicked) },
  listening: { top: { status: 'ok', data: top }, recent: { status: 'ok', data: recent } },
});

const followedArtists = artists.filter((_, i) => i % 3 === 0).map((a) => ({ id: a.id, name: a.name, genres: [], images: a.albums[0].images }))
  .concat(['Orbit Ensemble', 'Glass Pilots'].map((name) => ({ id: spotifyId(), name, genres: [], images: pick(albums).images })));
const savedAlbums = albums.filter((_, i) => i % 4 === 0).map((al) => ({ added_at: dateIn(int(2017, 2026)).toISOString(), album: { ...al, artists: [{ name: al.artist.name }] } }));
const shows = ['Song Exploder Club', 'History of Synths', 'The Quiet Hour'].map((name) => ({ show: { id: spotifyId(), name, publisher: 'Demo Radio', images: pick(albums).images, total_episodes: int(20, 300) } }));
const episodes = Array.from({ length: 24 }, () => ({ episode: { duration_ms: int(20, 70) * 60_000, show: { name: pick(shows).show.name } } }));
put('GET /insights/collection', {
  follow: { status: 'ok', ...followGap(followedArtists, split.events, top.long_term.artists) },
  albums: { status: 'ok', ...savedAlbumsStats(savedAlbums) },
  podcasts: { status: 'ok', ...podcastStats(shows, episodes, []) },
});
const syncedAt = new Date(now - 4 * 60_000).toISOString();
put('GET /insights/overlap', { status: 'ok', synced_at: syncedAt, failed_playlists: [], ...likedOverlap(liked, playlistSources) });
const unplayableLiked = liked.map((t, i) => ({ ...t, is_playable: i % 97 !== 5 }));
put('GET /insights/unplayable', { status: 'ok', synced_at: syncedAt, failed_playlists: [], ...findUnplayable([{ info: likedInfo, tracks: unplayableLiked }]) });

const done = (total) => ({ status: 'completed', total, done: total, failed: 0, error: null, finished_at: syncedAt });
const enrichment = { deezer: done(liked.length), lastfm: done(artists.length), musicbrainz: done(artists.length) };
const deep = (which) => {
  const songs = which === 'all' ? liked : split.handpicked;
  const events = which === 'all' ? split.events : split.handpicked;
  return {
    status: 'ok', lens: which, enrichment,
    sound_map: soundMap(songs, { bpm, artists: artistInfo, listeners }),
    eras: tasteEras(events, artistInfo),
    atlas: musicAtlas(events, artistInfo),
    constellation: constellation(events, artistInfo),
    tags: topTags(events, artistInfo),
    classical: classicalCorner(songs, works),
  };
};
put('GET /insights/deep?lens=handpicked', deep('handpicked'));
put('GET /insights/deep?lens=all', deep('all'));

const syncState = { status: 'completed', total: 13, done: 13, failed: 0, current: null, error: null, started_at: syncedAt, finished_at: syncedAt, playlists: 13, failed_playlists: [] };
put('GET /library/sync', syncState);
put('POST /library/sync', syncState);
put('GET /library/enrichment', enrichment);
put('POST /library/enrichment', enrichment);
put('POST /auth/logout', { success: true });

// ---- Library views: Home, Health, artist, album and compare pages ------------------------
// The synced library as librarySync.load() returns it; playlists "changed" at
// different times so Home has a recently-changed order.
const libSources = [
  { info: likedInfo, tracks: unplayableLiked, synced_at: new Date(now - 4 * 60_000) },
  ...playlistSources.map((s, i) => ({ ...s, synced_at: new Date(now - (i * 3 + 1) * 86_400_000) })),
];
const libSyncedAt = new Date(now - 4 * 60_000).toISOString();
put('GET /library/overview', { status: 'ok', synced_at: libSyncedAt, ...libraryOverview(libSources) });
put('GET /library/duplicates', { status: 'ok', synced_at: libSyncedAt, ...crossPlaylistDuplicates(libSources) });
const libArtists = libraryArtistIds(libSources);
for (const a of artists) {
  const view = artistView(libSources, a.id, { info: { name: a.name, ...artistInfo.get(artistKey(a.name)) }, libraryArtists: libArtists });
  put(`GET /library/artists/${a.id}`, { status: 'ok', ...view, name: view.name ?? a.name, photo: null, genres: FAMILY_SPECS[a.fam].tags.slice(0, 2), url: '#' });
}
for (const al of albums) {
  const view = albumView(libSources, al.id);
  const have = new Set(view.songs.map((s) => s.id));
  put(`GET /library/albums/${al.id}`, {
    status: 'ok', ...view,
    name: view.name ?? al.name, image: view.image ?? al.images[1].url, image_lg: view.image_lg ?? al.images[0].url,
    release_date: al.release_date, total_tracks: al.total_tracks,
    artists: view.artists.length ? view.artists : [{ id: al.artist.id, name: al.artist.name }],
    tracklist: al.tracks.map((t, i) => ({ id: t.id, name: t.name, number: i + 1, disc: 1, duration_ms: t.duration_ms, in_library: have.has(t.id) })),
    url: '#',
  });
}
for (const A of playlistSources) {
  for (const B of playlistSources) {
    if (A === B) continue;
    const ids = (s) => new Set(s.tracks.map((t) => t.id).filter(Boolean));
    const [ia, ib] = [ids(A), ids(B)];
    put(`GET /simulate-merge?a=${A.info.id}&b=${B.info.id}`, {
      playlist_a: { id: A.info.id, name: A.info.name, image: A.info.image, tracks: ia.size },
      playlist_b: { id: B.info.id, name: B.info.name, image: B.info.image, tracks: ib.size },
      union_count: new Set([...ia, ...ib]).size,
      intersection_count: [...ia].filter((x) => ib.has(x)).length,
      would_add_from_b_to_a: [...ib].filter((x) => !ia.has(x)).length,
      ...compareTracks(A.tracks, B.tracks),
    });
  }
}

mkdirSync(dirname(OUT_JSON), { recursive: true });
writeFileSync(OUT_JSON, JSON.stringify(responses));
console.log(`${Object.keys(responses).length} responses, ${liked.length} liked songs (${split.handpicked.length} hand-picked), ${coverN} covers`);
