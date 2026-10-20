// Library-wide views behind the Home, Health, artist, album and compare
// pages. Input is the synced library: `sources` as returned by
// librarySync.load() ([{ info, tracks, synced_at }], Liked Songs has id
// LIKED_ID). Pure functions, no I/O.
import { LIKED_ID } from './library.js';
import { splitLikes } from './insights.js';

const songs = (tracks) => tracks.filter((t) => t.id && t.type !== 'episode' && !t.is_local);
const year = (iso) => (iso ? Number(String(iso).slice(0, 4)) : null);

export function briefSong(t) {
  return {
    id: t.id,
    name: t.name,
    artists: t.artists,
    album: t.album ? { id: t.album.id, name: t.album.name } : null,
    image: t.album?.image ?? null,
    release_date: t.album?.release_date ?? null,
    duration_ms: t.duration_ms ?? null,
    explicit: t.explicit ?? null,
  };
}

const playlistRef = (info) => ({ id: info.id, name: info.name, image: info.image ?? null });

// Where every song is: track id -> { track, liked_at, playlists: [ref] }.
function locate(sources) {
  const byId = new Map();
  for (const { info, tracks } of sources) {
    const liked = info.id === LIKED_ID;
    for (const t of songs(tracks)) {
      if (!byId.has(t.id)) byId.set(t.id, { track: t, liked: false, liked_at: null, playlists: new Map() });
      const entry = byId.get(t.id);
      if (liked) {
        entry.liked = true;
        entry.liked_at = t.added_at ?? null;
      }
      else entry.playlists.set(info.id, playlistRef(info));
    }
  }
  return byId;
}

// ---- Home: one summary of the whole library -----------------------------------

export function libraryOverview(sources) {
  const where = locate(sources);
  const artists = new Set();
  const albums = new Set();
  let ms = 0;
  for (const { track } of where.values()) {
    for (const a of track.artists) artists.add(a.id || a.name);
    if (track.album?.id) albums.add(track.album.id);
    ms += track.duration_ms || 0;
  }
  const liked = sources.find((s) => s.info.id === LIKED_ID);
  const playlists = sources.filter((s) => s.info.id !== LIKED_ID);
  const unplayable = new Set();
  for (const { tracks } of sources) for (const t of songs(tracks)) if (t.is_playable === false) unplayable.add(t.id);
  const likedNowhere = [...where.values()].filter((e) => e.liked && e.playlists.size === 0).length;

  return {
    totals: {
      playlists: playlists.length,
      songs: where.size,
      liked: liked ? songs(liked.tracks).length : null,
      artists: artists.size,
      albums: albums.size,
      hours: Math.round(ms / 3_600_000),
    },
    health: {
      duplicates: crossPlaylistDuplicates(sources).total,
      unplayable: unplayable.size,
      liked_in_no_playlist: liked ? likedNowhere : null,
    },
    // Spotify doesn't say when a playlist was last edited, so this uses the
    // date the newest song was added. (Not the sync time: a first sync reads
    // every playlist at once, in no meaningful order.)
    recent_playlists: playlists
      .map((s) => ({ ...playlistRef(s.info), tracks: s.tracks.length, last_added: lastAdded(s.tracks) }))
      .filter((p) => p.last_added)
      .sort((a, b) => b.last_added.localeCompare(a.last_added))
      .slice(0, 6),
  };
}

function lastAdded(tracks) {
  let max = null;
  for (const t of tracks) if (t.added_at && t.added_at > '1971' && (!max || t.added_at > max)) max = t.added_at;
  return max;
}

// ---- Health: the same song in several playlists -------------------------------

// Grouped by recording (ISRC) so the single and the album version count as
// the same song; Liked Songs doesn't count as a playlist here (a liked song in
// a playlist is normal) but is reported per song.
export function crossPlaylistDuplicates(sources, limit = 500) {
  const likedIds = new Set();
  const groups = new Map();
  for (const { info, tracks } of sources) {
    if (info.id === LIKED_ID) {
      for (const t of songs(tracks)) likedIds.add(t.id);
      continue;
    }
    for (const t of songs(tracks)) {
      const key = t.isrc || t.id;
      if (!groups.has(key)) groups.set(key, { track: t, ids: new Set(), playlists: new Map() });
      const g = groups.get(key);
      g.ids.add(t.id);
      g.playlists.set(info.id, playlistRef(info));
    }
  }
  const dupes = [...groups.values()]
    .filter((g) => g.playlists.size >= 2)
    .map((g) => ({
      track: briefSong(g.track),
      versions: g.ids.size,
      liked: [...g.ids].some((id) => likedIds.has(id)),
      playlists: [...g.playlists.values()],
    }))
    .sort((a, b) => b.playlists.length - a.playlists.length || String(a.track.name).localeCompare(String(b.track.name)));
  return { total: dupes.length, songs: dupes.slice(0, limit) };
}

// ---- Artist page ---------------------------------------------------------------

// Everything the library holds by one artist (matched by Spotify artist id).
// `info` is the cached ArtistInfo row (tags, similar, origin) or null;
// `libraryArtists` maps lower-cased names of all library artists to their id,
// so similar artists you already have can link to their own page.
export function artistView(sources, artistId, { info = null, libraryArtists = new Map() } = {}) {
  const where = locate(sources);
  const mine = [...where.values()].filter((e) => e.track.artists.some((a) => a.id === artistId));
  const name = mine[0]?.track.artists.find((a) => a.id === artistId)?.name ?? info?.name ?? null;

  const albums = new Map();
  const playlists = new Map();
  const likesByYear = new Map();
  let firstLiked = null;
  for (const e of mine) {
    const al = e.track.album;
    if (al?.id) {
      if (!albums.has(al.id)) albums.set(al.id, { id: al.id, name: al.name, image: al.image ?? null, image_lg: al.image_lg ?? null, release_date: al.release_date ?? null, songs: 0 });
      albums.get(al.id).songs++;
    }
    for (const p of e.playlists.values()) {
      if (!playlists.has(p.id)) playlists.set(p.id, { ...p, songs: 0 });
      playlists.get(p.id).songs++;
    }
    if (e.liked_at) {
      const y = year(e.liked_at);
      if (y) likesByYear.set(y, (likesByYear.get(y) || 0) + 1);
      if (!firstLiked || e.liked_at < firstLiked) firstLiked = e.liked_at;
    }
  }
  const albumList = [...albums.values()].sort((a, b) => b.songs - a.songs || String(b.release_date).localeCompare(String(a.release_date)));
  const years = [...likesByYear.keys()];
  const likes_by_year = years.length
    ? Array.from({ length: Math.max(...years) - Math.min(...years) + 1 }, (_, i) => {
        const y = Math.min(...years) + i;
        return { year: y, count: likesByYear.get(y) || 0 };
      })
    : [];

  const key = (n) => n.trim().toLowerCase();
  return {
    id: artistId,
    name,
    image: albumList[0]?.image_lg ?? albumList[0]?.image ?? null,
    counts: {
      songs: mine.length,
      liked: mine.filter((e) => e.liked).length,
      playlists: playlists.size,
      albums: albums.size,
    },
    first_liked: firstLiked,
    likes_by_year,
    songs: mine
      .map((e) => ({ ...briefSong(e.track), liked: e.liked, liked_at: e.liked_at, playlists: [...e.playlists.values()] }))
      .sort((a, b) => (b.playlists.length + (b.liked ? 1 : 0)) - (a.playlists.length + (a.liked ? 1 : 0)) || String(a.name).localeCompare(String(b.name))),
    albums: albumList,
    playlists: [...playlists.values()].sort((a, b) => b.songs - a.songs),
    tags: (info?.tags || []).slice(0, 6).map((t) => t.name),
    origin: info?.area || info?.country ? { country: info.country ?? null, area: info.area ?? null, since: info.beginYear ?? null } : null,
    similar: (info?.similar || []).slice(0, 12).map((s) => {
      const id = libraryArtists.get(key(s.name)) ?? null;
      return { name: s.name, match: s.match, id, in_library: Boolean(id) };
    }),
  };
}

// ---- Album page ----------------------------------------------------------------

export function albumView(sources, albumId) {
  const where = locate(sources);
  const mine = [...where.values()].filter((e) => e.track.album?.id === albumId);
  const al = mine[0]?.track.album ?? null;
  const liked = sources.find((s) => s.info.id === LIKED_ID);
  const saves = liked ? splitLikes(liked.tracks).bulkGroups.filter((g) => g.album.id === albumId) : [];
  const playlists = new Map();
  for (const e of mine) {
    for (const p of e.playlists.values()) {
      if (!playlists.has(p.id)) playlists.set(p.id, { ...p, songs: 0 });
      playlists.get(p.id).songs++;
    }
  }
  const artists = new Map();
  for (const e of mine) for (const a of e.track.artists.slice(0, 1)) artists.set(a.id || a.name, a);

  return {
    id: albumId,
    name: al?.name ?? null,
    image: al?.image ?? null,
    image_lg: al?.image_lg ?? null,
    release_date: al?.release_date ?? null,
    album_type: al?.album_type ?? null,
    total_tracks: al?.total_tracks ?? null,
    artists: [...artists.values()],
    counts: {
      songs: mine.length,
      liked: mine.filter((e) => e.liked).length,
      playlists: playlists.size,
    },
    saved_whole: saves.map((g) => g.added_at),
    songs: mine
      .map((e) => ({ ...briefSong(e.track), liked: e.liked, liked_at: e.liked_at, playlists: [...e.playlists.values()] }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name))),
    playlists: [...playlists.values()].sort((a, b) => b.songs - a.songs),
  };
}

// ---- Compare two playlists -----------------------------------------------------

export function compareTracks(a, b, limit = 500) {
  const mapOf = (tracks) => new Map(songs(tracks).map((t) => [t.id, t]));
  const A = mapOf(a);
  const B = mapOf(b);
  const pick = (m, keep) => [...m.values()].filter(keep).slice(0, limit).map(briefSong);
  const onlyA = [...A.keys()].filter((id) => !B.has(id));
  const onlyB = [...B.keys()].filter((id) => !A.has(id));
  const both = [...A.keys()].filter((id) => B.has(id));
  return {
    counts: { only_a: onlyA.length, both: both.length, only_b: onlyB.length },
    only_a: pick(A, (t) => !B.has(t.id)),
    both: pick(A, (t) => B.has(t.id)),
    only_b: pick(B, (t) => !A.has(t.id)),
  };
}

// Lower-cased artist name -> Spotify id, over the whole library.
export function libraryArtistIds(sources) {
  const out = new Map();
  for (const { tracks } of sources) {
    for (const t of songs(tracks)) for (const a of t.artists) if (a.id && a.name) out.set(a.name.trim().toLowerCase(), a.id);
  }
  return out;
}
