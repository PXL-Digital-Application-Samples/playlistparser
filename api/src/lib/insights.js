// Pure computations for the Insights page. Input is normalized tracks (see
// tracks.js) plus raw Spotify objects; no I/O here.
//
// Liked Songs mixes songs liked one by one with whole albums saved in one go
// (on Spotify, saving an album can add every track). Counting tracks lets a
// few album saves dominate everything, so we work with "like events": each
// hand-picked song is one event, and each bulk album save is one event.
import { parseReleaseDate, imageSizes } from './tracks.js';

const DAY_MS = 86_400_000;
const YEAR_MS = 365.25 * DAY_MS;
export const BULK_MIN_TRACKS = 5;

const validDate = (s) => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1990 ? null : d;
};
const songs = (tracks) => tracks.filter((t) => t.id && t.type !== 'episode');
const bump = (map, key, n = 1) => map.set(key, (map.get(key) || 0) + n);
const round1 = (n) => Math.round(n * 10) / 10;
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ---- Hand-picked vs. album saves ----------------------------------------------

// A bulk save = BULK_MIN_TRACKS+ songs from one album added within the same
// minute. Returns the hand-picked songs, the bulk groups, and the like events.
export function splitLikes(tracks) {
  const groups = new Map();
  for (const t of songs(tracks)) {
    if (!t.album?.id || !t.added_at) continue;
    const key = `${t.album.id}|${t.added_at.slice(0, 16)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  const bulkIds = new Set();
  const bulkGroups = [];
  for (const g of groups.values()) {
    if (g.length < BULK_MIN_TRACKS) continue;
    g.forEach((t) => bulkIds.add(t.position));
    const artists = new Map();
    for (const t of g) for (const a of t.artists) artists.set(a.id || a.name, a);
    bulkGroups.push({
      id: `album:${g[0].album.id}:${g[0].added_at}`,
      type: 'album',
      name: g[0].album.name,
      added_at: g[0].added_at,
      artists: [...artists.values()],
      album: g[0].album,
      tracks: g.length,
    });
  }
  const handpicked = songs(tracks).filter((t) => !bulkIds.has(t.position));
  return { handpicked, bulkGroups, events: [...handpicked, ...bulkGroups] };
}

// ---- Calendar / timeline -----------------------------------------------------

// Likes per calendar day (UTC date of added_at), with up to 3 covers per day.
export function likeCalendar(events) {
  const byDate = {};
  const covers = {};
  for (const e of events) {
    const d = validDate(e.added_at);
    if (!d) continue;
    const key = d.toISOString().slice(0, 10);
    byDate[key] = (byDate[key] || 0) + 1;
    const img = e.album?.image;
    if (img) {
      covers[key] ??= [];
      if (covers[key].length < 3 && !covers[key].includes(img)) covers[key].push(img);
    }
  }
  const years = [...new Set(Object.keys(byDate).map((k) => Number(k.slice(0, 4))))].sort();
  const busiest = Object.entries(byDate).sort((a, b) => b[1] - a[1])[0] || null;
  return { byDate, covers, years, busiest_day: busiest ? { date: busiest[0], count: busiest[1] } : null };
}

// Likes per month (gap-free) with a running total, and per year the top
// artists and covers ("eras").
export function libraryOverTime(events) {
  const perMonth = new Map();
  const perYear = new Map();
  for (const e of events) {
    const d = validDate(e.added_at);
    if (!d) continue;
    bump(perMonth, d.toISOString().slice(0, 7));
    const y = d.getUTCFullYear();
    if (!perYear.has(y)) perYear.set(y, { total: 0, artists: new Map(), ids: new Map(), albums: new Map() });
    const yr = perYear.get(y);
    yr.total++;
    const main = e.artists[0];
    if (main) {
      bump(yr.artists, main.name);
      if (main.id) yr.ids.set(main.name, main.id);
    }
    if (e.album?.image) {
      if (!yr.albums.has(e.album.id)) yr.albums.set(e.album.id, { id: e.album.id, image: e.album.image, image_lg: e.album.image_lg, name: e.album.name, n: 0 });
      yr.albums.get(e.album.id).n++;
    }
  }
  const keys = [...perMonth.keys()].sort();
  const months = [];
  if (keys.length) {
    let [y, m] = keys[0].split('-').map(Number);
    const [ly, lm] = keys[keys.length - 1].split('-').map(Number);
    let cumulative = 0;
    while (y < ly || (y === ly && m <= lm)) {
      const key = `${y}-${String(m).padStart(2, '0')}`;
      const count = perMonth.get(key) || 0;
      cumulative += count;
      months.push({ month: key, count, cumulative });
      if (++m > 12) { m = 1; y++; }
    }
  }
  const eras = [...perYear.keys()].sort().map((year) => {
    const yr = perYear.get(year);
    return {
      year,
      total: yr.total,
      artists: [...yr.artists.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, count]) => ({ id: yr.ids.get(name) ?? null, name, count })),
      covers: [...yr.albums.values()].sort((a, b) => b.n - a.n).slice(0, 4).map((a) => ({ id: a.id, image: a.image, image_lg: a.image_lg, name: a.name })),
    };
  });
  const busiestMonth = months.reduce((best, mo) => (!best || mo.count > best.count ? mo : best), null);
  return { months, eras, busiest_month: busiestMonth && { month: busiestMonth.month, count: busiestMonth.count } };
}

// ---- Song-level stats ----------------------------------------------------------

const AGE_BUCKETS = [
  ['Same year', 0, 1], ['1–2 years', 1, 3], ['3–5 years', 3, 6], ['6–10 years', 6, 11],
  ['11–20 years', 11, 21], ['21–40 years', 21, 41], ['40+ years', 41, Infinity],
];
const LENGTH_BUCKETS = [
  ['< 2 min', 0, 2], ['2–3 min', 2, 3], ['3–4 min', 3, 4], ['4–5 min', 4, 5],
  ['5–7 min', 5, 7], ['7–10 min', 7, 10], ['10+ min', 10, Infinity],
];

// How old songs were when added ("nostalgia"), length distribution, and
// explicit share per release decade.
export function musicAge(tracks) {
  const ages = [];
  const ageCounts = AGE_BUCKETS.map(() => 0);
  const lengthCounts = LENGTH_BUCKETS.map(() => 0);
  const decades = new Map();
  let oldest = null;

  for (const t of songs(tracks)) {
    const rd = parseReleaseDate(t.album?.release_date);
    const added = validDate(t.added_at);
    if (rd && added) {
      const age = Math.max(0, (added - rd) / YEAR_MS);
      ages.push(age);
      ageCounts[AGE_BUCKETS.findIndex(([, lo, hi]) => age >= lo && age < hi)]++;
      if (!oldest || age > oldest.age) oldest = { age: round1(age), track: brief(t) };
    }
    if (typeof t.duration_ms === 'number') {
      const min = t.duration_ms / 60_000;
      lengthCounts[LENGTH_BUCKETS.findIndex(([, lo, hi]) => min >= lo && min < hi)]++;
    }
    if (rd && typeof t.explicit === 'boolean') {
      const dec = `${Math.floor(rd.getUTCFullYear() / 10) * 10}s`;
      if (!decades.has(dec)) decades.set(dec, { total: 0, explicit: 0 });
      const d = decades.get(dec);
      d.total++;
      if (t.explicit) d.explicit++;
    }
  }

  const med = median(ages);
  return {
    median_age_years: med === null ? null : round1(med),
    same_year_pct: ages.length ? round1((ageCounts[0] / ages.length) * 100) : null,
    age_buckets: AGE_BUCKETS.map(([label], i) => ({ label, count: ageCounts[i] })),
    oldest_when_liked: oldest,
    length_buckets: LENGTH_BUCKETS.map(([label], i) => ({ label, count: lengthCounts[i] })),
    explicit_by_decade: [...decades.entries()].sort().map(([decade, d]) => ({
      decade, total: d.total, pct: round1((d.explicit / d.total) * 100),
    })),
  };
}

// How spread out your taste is over artists, counted in like events (an album
// save counts once), plus albums you liked (nearly) completely.
export function artistDepth(tracks, events = songs(tracks)) {
  const byArtist = new Map();
  for (const e of events) {
    for (const a of e.artists) {
      const key = a.id || a.name;
      if (!byArtist.has(key)) byArtist.set(key, { id: a.id, name: a.name, count: 0 });
      byArtist.get(key).count++;
    }
  }
  const artists = [...byArtist.values()].sort((a, b) => b.count - a.count);
  const buckets = [['1 like', 1, 1], ['2–4 likes', 2, 4], ['5–9 likes', 5, 9], ['10+ likes', 10, Infinity]]
    .map(([label, lo, hi]) => ({ label, count: artists.filter((a) => a.count >= lo && a.count <= hi).length }));
  const top10 = new Set(artists.slice(0, 10).map((a) => a.id || a.name));
  const withTop10 = events.filter((e) => e.artists.some((a) => top10.has(a.id || a.name))).length;

  return {
    artists_total: artists.length,
    one_like_pct: artists.length ? round1((buckets[0].count / artists.length) * 100) : null,
    top10_share_pct: events.length ? round1((withTop10 / events.length) * 100) : null,
    buckets,
    deepest: artists.slice(0, 10),
    complete_albums: completeAlbums(songs(tracks)),
  };
}

function completeAlbums(list) {
  const byAlbum = new Map();
  for (const t of list) {
    const al = t.album;
    if (!al?.id || !al.total_tracks || al.total_tracks < 4) continue;
    if (!byAlbum.has(al.id)) byAlbum.set(al.id, { id: al.id, name: al.name, artist: t.artists[0]?.name ?? '', image: al.image, total: al.total_tracks, ids: new Set() });
    byAlbum.get(al.id).ids.add(t.id);
  }
  return [...byAlbum.values()]
    .map((a) => ({ id: a.id, name: a.name, artist: a.artist, image: a.image, liked: a.ids.size, total: a.total, pct: Math.round((Math.min(a.ids.size, a.total) / a.total) * 100) }))
    .filter((a) => a.pct >= 80)
    .sort((a, b) => b.pct - a.pct || b.total - a.total)
    .slice(0, 20);
}

// Albums weighted by like events: each hand-picked song from an album adds 1,
// and saving the whole album adds 1. Feeds the cover wall.
export function albumWall(events, limit = 40) {
  const byAlbum = new Map();
  for (const e of events) {
    const al = e.album;
    if (!al?.id || !al.image) continue;
    if (!byAlbum.has(al.id)) byAlbum.set(al.id, { id: al.id, name: al.name, artist: e.artists[0]?.name ?? '', image: al.image, image_lg: al.image_lg, count: 0 });
    byAlbum.get(al.id).count++;
  }
  return [...byAlbum.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

// ---- Taste profile (the fingerprint) ---------------------------------------------

export const FINGERPRINT_DECADES = ['1950s', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];

// Summarizes a set of songs: release-decade shares, average length, explicit
// share, artist variety and how recent the music is. Same shape for "what you
// play" and "what you like", so the two can be overlaid.
export function tasteProfile(tracks, genres = []) {
  const list = tracks.filter((t) => t && t.id);
  const decadeCounts = new Map(FINGERPRINT_DECADES.map((d) => [d, 0]));
  const ages = [];
  let dated = 0, totalMs = 0, durN = 0, explicit = 0, explicitN = 0;
  const artists = new Set();
  const now = Date.now();

  for (const t of list) {
    const rd = parseReleaseDate(t.release_date ?? t.album?.release_date);
    if (rd) {
      let dec = `${Math.floor(rd.getUTCFullYear() / 10) * 10}s`;
      if (rd.getUTCFullYear() < 1950) dec = '1950s';
      if (decadeCounts.has(dec)) { bump(decadeCounts, dec); dated++; }
      ages.push((now - rd) / YEAR_MS);
    }
    if (typeof t.duration_ms === 'number') { totalMs += t.duration_ms; durN++; }
    if (typeof t.explicit === 'boolean') { explicitN++; if (t.explicit) explicit++; }
    for (const a of t.artists || []) artists.add(a.id || a.name);
  }

  const genreCounts = new Map();
  for (const g of genres) bump(genreCounts, g);

  return {
    songs: list.length,
    decades: FINGERPRINT_DECADES.map((d) => ({ decade: d, share: dated ? decadeCounts.get(d) / dated : 0 })),
    avg_length_ms: durN ? Math.round(totalMs / durN) : null,
    explicit_pct: explicitN ? round1((explicit / explicitN) * 100) : null,
    artist_variety_pct: list.length ? round1((artists.size / list.length) * 100) : null,
    median_age_years: ages.length ? round1(median(ages)) : null,
    top_genres: [...genreCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([genre, count]) => ({ genre, count })),
  };
}

// ---- Listening (Spotify Top / Recently played) ------------------------------

export function briefArtist(a) {
  return { id: a.id, name: a.name, genres: a.genres || [], ...imageSizes(a.images) };
}

export function briefTrack(t) {
  return {
    id: t.id,
    name: t.name,
    artists: (t.artists || []).map((a) => ({ id: a.id, name: a.name })),
    album: t.album?.name ?? null,
    ...imageSizes(t.album?.images),
    release_date: t.album?.release_date ?? null,
    duration_ms: t.duration_ms ?? null,
    explicit: t.explicit ?? null,
  };
}

function brief(t) {
  return {
    id: t.id, name: t.name, artists: t.artists, album: t.album?.name ?? null,
    image: t.album?.image ?? null, release_date: t.album?.release_date ?? null,
  };
}

// ---- Collection (followed artists, saved albums, podcasts) -------------------

export function followGap(followed, likedEvents, topArtists = []) {
  const likedCount = new Map();
  const names = new Map();
  for (const e of likedEvents) {
    for (const a of e.artists) {
      if (!a.id) continue;
      bump(likedCount, a.id);
      names.set(a.id, a.name);
    }
  }
  const followedIds = new Set(followed.map((a) => a.id));
  const neverLiked = followed.filter((a) => !likedCount.has(a.id));

  return {
    followed_total: followed.length,
    followed_never_liked: neverLiked.map(briefArtist).slice(0, 40),
    followed_never_liked_total: neverLiked.length,
    loved_not_followed: [...likedCount.entries()]
      .filter(([id, n]) => n >= 5 && !followedIds.has(id))
      .sort((a, b) => b[1] - a[1]).slice(0, 20)
      .map(([id, count]) => ({ id, name: names.get(id), count })),
    top_not_followed: topArtists.filter((a) => !followedIds.has(a.id)).slice(0, 10).map(briefArtist),
  };
}

export function savedAlbumsStats(items) {
  const albums = items.map((it) => ({ added_at: it.added_at, album: it.album })).filter((x) => x.album);
  const decades = new Map();
  for (const { album } of albums) {
    const rd = parseReleaseDate(album.release_date);
    if (rd) bump(decades, `${Math.floor(rd.getUTCFullYear() / 10) * 10}s`);
  }
  return {
    total: albums.length,
    tracks_total: albums.reduce((n, x) => n + (x.album.total_tracks || 0), 0),
    decades: [...decades.entries()].sort().map(([decade, count]) => ({ decade, count })),
    recent: albums
      .sort((a, b) => String(b.added_at).localeCompare(String(a.added_at)))
      .slice(0, 12)
      .map(({ album, added_at }) => ({
        id: album.id, name: album.name, artist: album.artists?.[0]?.name ?? '', ...imageSizes(album.images),
        release_date: album.release_date, added_at,
      })),
  };
}

export function podcastStats(shows, episodes, audiobooks) {
  const eps = episodes.map((it) => it.episode).filter(Boolean);
  const perShow = new Map();
  for (const e of eps) if (e.show?.name) bump(perShow, e.show.name);
  return {
    shows_total: shows.length,
    shows: shows.map((it) => it.show).filter(Boolean).slice(0, 12).map((s) => ({
      id: s.id, name: s.name, publisher: s.publisher, ...imageSizes(s.images), total_episodes: s.total_episodes ?? null,
    })),
    episodes_total: eps.length,
    episodes_hours: round1(eps.reduce((n, e) => n + (e.duration_ms || 0), 0) / 3_600_000),
    episodes_by_show: [...perShow.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count })),
    audiobooks_total: audiobooks.length,
    audiobooks: audiobooks.map((it) => it.audiobook ?? it).filter((b) => b?.name).slice(0, 8).map((b) => ({
      id: b.id, name: b.name, authors: (b.authors || []).map((a) => a.name).join(', '), ...imageSizes(b.images),
    })),
  };
}

// ---- Comparisons ---------------------------------------------------------------

export function likedOverlap(likedTracks, playlists) {
  const likedIds = new Set(songs(likedTracks).map((t) => t.id));
  const inAnyPlaylist = new Set();
  const perPlaylist = playlists.map(({ info, tracks }) => {
    const ids = new Set(songs(tracks).map((t) => t.id));
    let liked = 0;
    for (const id of ids) {
      inAnyPlaylist.add(id);
      if (likedIds.has(id)) liked++;
    }
    return { id: info.id, name: info.name, image: info.image, total: ids.size, liked, pct: ids.size ? Math.round((liked / ids.size) * 100) : 0 };
  });
  const orphans = songs(likedTracks).filter((t) => !inAnyPlaylist.has(t.id));
  return {
    liked_total: likedIds.size,
    liked_in_no_playlist: orphans.length,
    liked_in_no_playlist_sample: orphans
      .sort((a, b) => String(b.added_at).localeCompare(String(a.added_at)))
      .slice(0, 50).map((t) => ({ ...brief(t), added_at: t.added_at })),
    playlists: perPlaylist.filter((p) => p.total > 0).sort((a, b) => b.pct - a.pct || b.total - a.total),
  };
}

export function findUnplayable(sources) {
  const byTrack = new Map();
  for (const { info, tracks } of sources) {
    for (const t of tracks) {
      if (t.is_playable !== false || t.is_local || !t.id || t.type === 'episode') continue;
      if (!byTrack.has(t.id)) byTrack.set(t.id, { track: brief(t), in: [] });
      byTrack.get(t.id).in.push({ id: info.id, name: info.name });
    }
  }
  return { total: byTrack.size, tracks: [...byTrack.values()].slice(0, 300) };
}
