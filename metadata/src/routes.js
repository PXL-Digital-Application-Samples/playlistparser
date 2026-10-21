// The metadata service's HTTP interface, called only by the API. Field names
// in lookup results are the database columns (camelCase); everything else is
// snake_case like the API's own responses.
//
// The schemas check shapes and list sizes only. Over-long strings are trimmed
// (names) or dropped (ids) item by item in the handlers: one odd song title
// must not make a whole library's request fail.
import { artistKey } from './enrich.js';

const MAX_ITEMS = 50_000;
const list = (items) => ({ type: 'array', maxItems: MAX_ITEMS, items });
const USER_ID = /^[A-Za-z0-9_-]{1,64}$/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const NAME_MAX = 500;
const ARTIST_MAX = 300;
const name = (s, max) => (typeof s === 'string' ? s.slice(0, max) : '');
const ids = (xs, max) => xs.filter((x) => typeof x === 'string' && x.length > 0 && x.length <= max);

export default async function metadataRoutes(fastify) {
  const { prisma, lastfm, enricher } = fastify;

  // Whether Last.fm lookups work: ok | not_configured | key_rejected.
  fastify.get('/status', async () => ({ lastfm: lastfm.status }));

  // Everything known about these recordings, artists and tracks, from the
  // caches only (nothing is looked up). Used by the insights and artist pages.
  // Artist facts come back keyed by the names as sent, so the API needs no
  // knowledge of how this service normalizes them.
  fastify.post('/lookup', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        properties: { isrcs: list({ type: 'string' }), artists: list({ type: 'string' }), track_ids: list({ type: 'string' }) },
      },
    },
  }, async (req) => {
    const isrcs = ids(req.body.isrcs ?? [], 32);
    const trackIds = ids(req.body.track_ids ?? [], 64);
    const names = [...new Set((req.body.artists ?? []).map((a) => name(a, ARTIST_MAX)).filter((a) => a.trim()))];
    const [tempo, artistRows, listeners, works] = await Promise.all([
      isrcs.length ? prisma.deezerTrack.findMany({ where: { isrc: { in: isrcs } }, select: { isrc: true, bpm: true } }) : [],
      names.length ? prisma.artistInfo.findMany({ where: { key: { in: [...new Set(names.map(artistKey))] } } }) : [],
      trackIds.length ? prisma.lastfmTrack.findMany({
        where: { spotifyTrackId: { in: trackIds } }, select: { spotifyTrackId: true, listeners: true, playcount: true },
      }) : [],
      isrcs.length ? prisma.recordingWork.findMany({ where: { isrc: { in: isrcs } } }) : [],
    ]);
    const byKey = new Map(artistRows.map((r) => [r.key, r]));
    const artists = {};
    for (const n of names) if (byKey.has(artistKey(n))) artists[n] = byKey.get(artistKey(n));
    return { tempo, artists, listeners, works };
  });

  // Last.fm listener counts for tracks ({ id, name, artist }). With queue
  // (the default), starts lookups for the ones not cached yet; without it
  // only ids are needed and nothing is looked up (cheap polling). Returns what
  // is known, after waiting up to wait_ms for the lookups.
  fastify.post('/listeners', {
    schema: {
      body: {
        type: 'object',
        required: ['tracks'],
        additionalProperties: false,
        properties: {
          tracks: list({ type: 'object', required: ['id'], properties: { id: { type: 'string' }, name: { type: 'string' }, artist: { type: 'string' } } }),
          queue: { type: 'boolean' },
          wait_ms: { type: 'integer', minimum: 0, maximum: 60_000 },
        },
      },
    },
  }, async (req) => {
    const { queue = true, wait_ms: waitMs = 0 } = req.body;
    if (!lastfm.enabled) return { status: lastfm.status, listeners: {} };
    const tracks = req.body.tracks
      .filter((t) => t.id.length <= 64)
      .map((t) => ({ id: t.id, name: name(t.name, NAME_MAX), artist: name(t.artist, ARTIST_MAX) }));
    let cached = await lastfm.getCached(tracks);
    if (queue) {
      const lookups = lastfm.request(tracks, cached).catch((err) => req.log.warn({ err }, 'last.fm request failed'));
      if (waitMs > 0) {
        await Promise.race([lookups, sleep(waitMs)]);
        cached = await lastfm.getCached(tracks);
      }
    }
    return { status: lastfm.status, listeners: Object.fromEntries(cached) };
  });

  // Enrichment of one user's songs (tempo, tags, origins, composers): its
  // progress per source, or start it for these tracks ({ isrc, artists }).
  fastify.get('/enrichment/:userId', async (req) => enricher.state(validUser(req)));
  fastify.post('/enrichment/:userId', {
    schema: {
      body: {
        type: 'object',
        required: ['tracks'],
        additionalProperties: false,
        properties: {
          tracks: list({
            type: 'object',
            required: ['artists'],
            properties: { isrc: { type: ['string', 'null'] }, artists: { type: 'array', items: { type: 'string' } } },
          }),
        },
      },
    },
  }, async (req) => {
    const tracks = req.body.tracks.map((t) => ({
      isrc: typeof t.isrc === 'string' && t.isrc.length <= 32 ? t.isrc : null,
      artists: t.artists.slice(0, 50).map((a) => name(a, ARTIST_MAX)).filter((a) => a.trim()),
    }));
    return enricher.start(validUser(req), tracks);
  });

  function validUser(req) {
    if (!USER_ID.test(req.params.userId)) throw Object.assign(new Error('invalid user id'), { statusCode: 400 });
    return req.params.userId;
  }
}
