import { imageSizes } from '../lib/tracks.js';
import { libraryOverview, crossPlaylistDuplicates, artistView, albumView, libraryArtistIds } from '../lib/explore.js';

const SPOTIFY_ID = /^[A-Za-z0-9]{1,64}$/;

// Library sync and enrichment progress, plus the library-wide views behind
// the Home, Health, artist and album pages. The views read only the synced
// copy (see lib/sync.js) and say so when it's missing.
export default async function libraryRoutes(fastify) {
  const auth = { preHandler: fastify.requireUser };

  fastify.get('/library/sync', auth, async (req) => fastify.librarySync.state(req.user.id));

  // Starts a sync unless one is already running; returns the current state.
  fastify.post('/library/sync', auth, async (req) => fastify.librarySync.start(req.user));

  // Enrichment (Deezer tempo, Last.fm tags, MusicBrainz origins) runs after
  // each sync; these show its progress or start it again.
  fastify.get('/library/enrichment', auth, async (req) => fastify.metadata.enrichmentState(req.user.id));
  fastify.post('/library/enrichment', auth, async (req) => fastify.metadata.startEnrichment(req.user));

  async function synced(req) {
    const sources = await fastify.librarySync.load(req.user.id);
    if (sources.length) return { sources };
    return { missing: { status: 'not_synced', sync: await fastify.librarySync.state(req.user.id) } };
  }
  const syncedAt = (sources) => sources.reduce((max, s) => (!max || s.synced_at > max ? s.synced_at : max), null);

  function validId(req) {
    if (!SPOTIFY_ID.test(req.params.id)) throw fastify.httpErrors.badRequest('invalid id');
    return req.params.id;
  }

  // Optional extra details straight from Spotify (artist photo, full album
  // track list). The pages work without them, so any failure is ignored.
  async function fromSpotify(req, path) {
    try {
      const token = await fastify.accessTokenFor(req.user);
      return await fastify.spotify.get(path, token);
    } catch (err) {
      req.log.debug({ err, path }, 'optional spotify lookup failed');
      return null;
    }
  }

  // Home: totals, library health counts, recently changed playlists.
  fastify.get('/library/overview', auth, async (req) => {
    const { sources, missing } = await synced(req);
    if (missing) return missing;
    return { status: 'ok', synced_at: syncedAt(sources), ...libraryOverview(sources) };
  });

  // Health: the same song (recording) in two or more playlists.
  fastify.get('/library/duplicates', auth, async (req) => {
    const { sources, missing } = await synced(req);
    if (missing) return missing;
    return { status: 'ok', synced_at: syncedAt(sources), ...crossPlaylistDuplicates(sources) };
  });

  // Artist page: everything in your library by one artist.
  fastify.get('/library/artists/:id', auth, async (req) => {
    const id = validId(req);
    const { sources, missing } = await synced(req);
    if (missing) return missing;
    const libraryArtists = libraryArtistIds(sources);
    const base = artistView(sources, id, { libraryArtists });
    const [known, spotify] = await Promise.all([
      base.name ? fastify.metadata.lookup({ artists: [base.name] }) : null,
      fromSpotify(req, `/artists/${id}`),
    ]);
    const info = known?.artists[base.name] ?? null;
    const view = info ? artistView(sources, id, { info, libraryArtists }) : base;
    return {
      status: 'ok',
      ...view,
      name: view.name ?? spotify?.name ?? null,
      photo: spotify ? imageSizes(spotify.images) : null,
      genres: spotify?.genres ?? [],
      url: spotify?.external_urls?.spotify ?? `https://open.spotify.com/artist/${id}`,
    };
  });

  // Album page: your songs from one album, and the full track list.
  fastify.get('/library/albums/:id', auth, async (req) => {
    const id = validId(req);
    const { sources, missing } = await synced(req);
    if (missing) return missing;
    const view = albumView(sources, id);
    const spotify = await fromSpotify(req, `/albums/${id}`);
    const have = new Set(view.songs.map((s) => s.id));
    return {
      status: 'ok',
      ...view,
      name: view.name ?? spotify?.name ?? null,
      ...(view.image ? {} : imageSizes(spotify?.images)),
      release_date: view.release_date ?? spotify?.release_date ?? null,
      total_tracks: view.total_tracks ?? spotify?.total_tracks ?? null,
      artists: view.artists.length ? view.artists : (spotify?.artists || []).map((a) => ({ id: a.id, name: a.name })),
      tracklist: spotify?.tracks?.items?.map((t) => ({
        id: t.id, name: t.name, number: t.track_number, disc: t.disc_number, duration_ms: t.duration_ms, in_library: have.has(t.id),
      })) ?? null,
      url: spotify?.external_urls?.spotify ?? `https://open.spotify.com/album/${id}`,
    };
  });
}
