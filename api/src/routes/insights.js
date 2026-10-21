import { computeStats } from '../lib/tracks.js';
import { LIKED_ID } from '../lib/library.js';
import { artistKey } from '../lib/deep.js';
import { soundMap, tasteEras, musicAtlas, constellation, topTags, classicalCorner } from '../lib/deep.js';
import {
  splitLikes, likeCalendar, libraryOverTime, musicAge, artistDepth, albumWall, tasteProfile,
  briefArtist, briefTrack, followGap, savedAlbumsStats, podcastStats, likedOverlap, findUnplayable,
} from '../lib/insights.js';

const RANGES = ['short_term', 'medium_term', 'long_term']; // ~4 weeks, ~6 months, ~1 year
const CACHE_TTL_MS = 5 * 60_000;

// Library-wide insights. Each endpoint backs one part of the Insights page and
// is only called when that part is shown, because some are expensive (they
// read every playlist).
export default async function insightsRoutes(fastify) {
  const { spotify, library } = fastify;
  const auth = { preHandler: fastify.requireUser };

  // Keyed on the access token too: a new login (e.g. with extra permissions)
  // or a token refresh must not be answered from an older result.
  const cache = new Map();
  function cached(user, token, name, fn) {
    const key = `${user.id}:${token.slice(-16)}:${name}`;
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.promise;
    const promise = fn();
    cache.set(key, { promise, expires: Date.now() + CACHE_TTL_MS });
    promise.catch(() => cache.delete(key));
    if (cache.size > 500) for (const [k, v] of cache) if (v.expires <= Date.now()) cache.delete(k);
    return promise;
  }

  // Calls that need a scope the session may not have yet resolve to
  // { status: 'reauth' } instead of failing the whole response.
  async function optional(fn) {
    try {
      return { status: 'ok', data: await fn() };
    } catch (err) {
      if (err.status === 403 || err.status === 401) return { status: 'reauth' };
      throw err;
    }
  }

  async function listening(token) {
    const [top, recent] = await Promise.all([
      optional(async () => {
        const out = {};
        await Promise.all(RANGES.map(async (range) => {
          const [artists, tracks] = await Promise.all([
            spotify.get(`/me/top/artists?time_range=${range}&limit=50`, token),
            spotify.get(`/me/top/tracks?time_range=${range}&limit=50`, token),
          ]);
          out[range] = { artists: artists.items.map(briefArtist), tracks: tracks.items.map(briefTrack) };
        }));
        return out;
      }),
      optional(async () => {
        const res = await spotify.get('/me/player/recently-played?limit=50', token);
        return res.items.map((it) => ({ played_at: it.played_at, track: briefTrack(it.track) }));
      }),
    ]);
    return { top, recent };
  }

  // Liked Songs from the synced copy when there is one (fast), else live.
  async function likedTracks(user, token) {
    const row = await fastify.prisma.libraryPlaylist.findUnique({
      where: { userId_playlistId: { userId: user.id, playlistId: LIKED_ID } },
      select: { tracks: true, status: true, syncedAt: true },
    });
    if (row?.status === 'ok') return { tracks: row.tracks, synced_at: row.syncedAt };
    const live = await library.load(user, LIKED_ID, token);
    return { tracks: live.tracks, synced_at: null };
  }

  // Highlights: everything derived from Liked Songs plus listening history.
  fastify.get('/insights/summary', auth, async (req) => {
    const token = await fastify.accessTokenFor(req.user);
    const sync = await fastify.prisma.librarySync.findUnique({ where: { userId: req.user.id }, select: { finishedAt: true } });
    return cached(req.user, token, `summary:${sync?.finishedAt?.getTime() ?? 0}`, async () => {
      const [liked, listen] = await Promise.all([
        optional(() => likedTracks(req.user, token)),
        listening(token),
      ]);
      const tracks = liked.status === 'ok' ? liked.data.tracks : [];
      const split = splitLikes(tracks);
      const allSongs = tracks.filter((t) => t.id && t.type !== 'episode');
      const top = listen.top.status === 'ok' ? listen.top.data : null;
      return {
        liked_status: liked.status,
        liked_synced_at: liked.status === 'ok' ? liked.data.synced_at : null,
        // Two lenses: only songs liked one by one, or everything with each
        // whole-album save counted as a single like.
        lenses: liked.status === 'ok'
          ? { handpicked: lens(split.handpicked, split.handpicked), all: lens(allSongs, split.events) }
          : null,
        album_saves: {
          saves: split.bulkGroups.length,
          songs: allSongs.length - split.handpicked.length,
          biggest: [...split.bulkGroups].sort((a, b) => b.tracks - a.tracks).slice(0, 12).map((g) => ({
            id: g.album.id, name: g.name, artist: g.artists[0]?.name ?? '', image: g.album.image, songs: g.tracks, added_at: g.added_at,
          })),
        },
        taste: {
          play: top ? tasteProfile(dedupeById(RANGES.flatMap((r) => top[r].tracks)), dedupeById(RANGES.flatMap((r) => top[r].artists)).flatMap((a) => a.genres)) : null,
          liked: tasteProfile(split.handpicked),
        },
        listening: listen,
      };
    });
  });

  function lens(songList, events) {
    return {
      counts: { songs: songList.length, likes: events.length },
      stats: computeStats(songList),
      calendar: likeCalendar(events),
      over_time: libraryOverTime(events),
      age: musicAge(songList),
      depth: artistDepth(songList, events),
      wall: albumWall(events),
    };
  }

  // Followed artists, saved albums, podcasts and audiobooks.
  fastify.get('/insights/collection', auth, async (req) => {
    const token = await fastify.accessTokenFor(req.user);
    return cached(req.user, token, 'collection', async () => {
      const [followed, albums, shows, episodes, audiobooks, liked, topLong] = await Promise.all([
        optional(() => followedArtists(token)),
        optional(() => spotify.getAllPaged('/me/albums?limit=50', token)),
        optional(() => spotify.getAllPaged('/me/shows?limit=50', token)),
        optional(() => spotify.getAllPaged('/me/episodes?limit=50', token)),
        optional(() => spotify.getAllPaged('/me/audiobooks?limit=50', token)),
        optional(() => likedTracks(req.user, token)),
        optional(() => spotify.get('/me/top/artists?time_range=long_term&limit=50', token)),
      ]);
      const likedEvents = liked.status === 'ok' ? splitLikes(liked.data.tracks).events : [];
      return {
        follow: followed.status === 'ok'
          ? { status: 'ok', ...followGap(followed.data, likedEvents, topLong.status === 'ok' ? topLong.data.items : []) }
          : { status: followed.status },
        albums: albums.status === 'ok' ? { status: 'ok', ...savedAlbumsStats(albums.data) } : { status: albums.status },
        podcasts: shows.status === 'ok'
          ? { status: 'ok', ...podcastStats(shows.data, episodes.data || [], audiobooks.data || []) }
          : { status: shows.status },
      };
    });
  });

  // Deep dive: Liked Songs combined with enrichment data. Partial results are
  // fine while enrichment runs; the response includes its progress.
  fastify.get('/insights/deep', auth, async (req) => {
    const prisma = fastify.prisma;
    const row = await prisma.libraryPlaylist.findUnique({
      where: { userId_playlistId: { userId: req.user.id, playlistId: LIKED_ID } },
      select: { tracks: true, status: true },
    });
    const enrichment = await fastify.metadata.enrichmentState(req.user.id);
    if (row?.status !== 'ok') return { status: 'not_synced', enrichment };

    const tracks = row.tracks.filter((t) => t.id && t.type !== 'episode');
    const split = splitLikes(tracks);
    const lens = req.query.lens === 'all' ? 'all' : 'handpicked';
    const songs = lens === 'all' ? tracks : split.handpicked;
    const events = lens === 'all' ? split.events : split.handpicked;

    const isrcs = [...new Set(tracks.map((t) => t.isrc).filter(Boolean))];
    const names = [...new Set(tracks.flatMap((t) => t.artists.map((a) => a.name).filter(Boolean)))];
    const { tempo: bpmRows, artists: artistsByName, listeners: listenerRows, works: workRows } =
      await fastify.metadata.lookup({ isrcs, artists: names, trackIds: tracks.map((t) => t.id) });
    const bpm = new Map(bpmRows.filter((r) => r.bpm).map((r) => [r.isrc, r.bpm]));
    const artists = new Map(Object.entries(artistsByName).map(([n, r]) => [artistKey(n), r]));
    const listeners = new Map(listenerRows.filter((r) => r.listeners !== null).map((r) => [r.spotifyTrackId, r.listeners]));
    const works = new Map(workRows.map((r) => [r.isrc, r]));

    return {
      status: 'ok',
      lens,
      enrichment,
      sound_map: soundMap(songs, { bpm, artists, listeners }),
      eras: tasteEras(events, artists),
      atlas: musicAtlas(events, artists),
      constellation: constellation(events, artists),
      tags: topTags(events, artists),
      classical: classicalCorner(songs, works),
    };
  });

  // The next two read every playlist, so they only use the synced copy
  // (see lib/sync.js) and report when it's missing or incomplete.
  async function synced(userId) {
    const state = await fastify.librarySync.state(userId);
    const sources = await fastify.librarySync.load(userId);
    return { state, sources };
  }
  const meta = (state) => ({ synced_at: state.finished_at ?? null, failed_playlists: state.failed_playlists ?? [] });

  // Which liked songs are in playlists, and how "liked" each playlist is.
  fastify.get('/insights/overlap', auth, async (req) => {
    const { state, sources } = await synced(req.user.id);
    const liked = sources.find((s) => s.info.id === LIKED_ID);
    if (!liked) return { status: 'not_synced', sync: state };
    const playlists = sources.filter((s) => s.info.id !== LIKED_ID);
    return { status: 'ok', ...meta(state), ...likedOverlap(liked.tracks, playlists) };
  });

  // Songs Spotify greyed out (removed or not available in the user's country).
  fastify.get('/insights/unplayable', auth, async (req) => {
    const { state, sources } = await synced(req.user.id);
    if (!sources.length) return { status: 'not_synced', sync: state };
    return { status: 'ok', ...meta(state), ...findUnplayable(sources) };
  });

  async function followedArtists(token) {
    const out = [];
    let url = '/me/following?type=artist&limit=50';
    while (url) {
      const page = await spotify.get(url, token);
      out.push(...(page.artists?.items || []));
      url = page.artists?.next || null;
    }
    return out;
  }

}

function dedupeById(items) {
  return [...new Map(items.map((x) => [x.id, x])).values()];
}

