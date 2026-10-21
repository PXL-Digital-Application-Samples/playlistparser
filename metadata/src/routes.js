// The metadata service's HTTP interface, called only by the API. Field names
// in lookup results are the database columns (camelCase); everything else is
// snake_case like the API's own responses.
import { artistKey } from './enrich.js';

const MAX_ITEMS = 50_000;
const str = (max) => ({ type: 'string', maxLength: max });
const list = (items) => ({ type: 'array', maxItems: MAX_ITEMS, items });
const USER_ID = /^[A-Za-z0-9_-]{1,64}$/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function metadataRoutes(fastify) {
  const { prisma, lastfm, enricher } = fastify;

  // Whether Last.fm lookups work: ok | not_configured | key_rejected.
  fastify.get('/status', async () => ({ lastfm: lastfm.status }));

  // Everything known about these recordings, artists and tracks, from the
  // caches only (nothing is looked up). Used by the insights and artist pages.
  fastify.post('/lookup', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        properties: { isrcs: list(str(32)), artists: list(str(300)), track_ids: list(str(64)) },
      },
    },
  }, async (req) => {
    const { isrcs = [], artists = [], track_ids: trackIds = [] } = req.body;
    const [tempo, artistRows, listeners, works] = await Promise.all([
      isrcs.length ? prisma.deezerTrack.findMany({ where: { isrc: { in: isrcs } }, select: { isrc: true, bpm: true } }) : [],
      artists.length ? prisma.artistInfo.findMany({ where: { key: { in: artists.map(artistKey) } } }) : [],
      trackIds.length ? prisma.lastfmTrack.findMany({
        where: { spotifyTrackId: { in: trackIds } }, select: { spotifyTrackId: true, listeners: true, playcount: true },
      }) : [],
      isrcs.length ? prisma.recordingWork.findMany({ where: { isrc: { in: isrcs } } }) : [],
    ]);
    return { tempo, artists: artistRows, listeners, works };
  });

  // Last.fm listener counts for tracks ({ id, name, artist }). Queues lookups
  // for the ones not cached yet and returns what is known, after waiting up to
  // wait_ms for the lookups (0 = don't wait; the caller polls).
  fastify.post('/listeners', {
    schema: {
      body: {
        type: 'object',
        required: ['tracks'],
        additionalProperties: false,
        properties: {
          tracks: list({
            type: 'object',
            required: ['id', 'name', 'artist'],
            properties: { id: str(64), name: str(500), artist: str(300) },
          }),
          wait_ms: { type: 'integer', minimum: 0, maximum: 60_000 },
        },
      },
    },
  }, async (req) => {
    const { tracks, wait_ms: waitMs = 0 } = req.body;
    if (!lastfm.enabled) return { status: lastfm.status, listeners: {} };
    const lookups = lastfm.request(tracks).catch((err) => req.log.warn({ err }, 'last.fm request failed'));
    if (waitMs > 0) await Promise.race([lookups, sleep(waitMs)]);
    const cached = await lastfm.getCached(tracks);
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
            properties: { isrc: { type: ['string', 'null'], maxLength: 32 }, artists: { type: 'array', maxItems: 50, items: str(300) } },
          }),
        },
      },
    },
  }, async (req) => enricher.start(validUser(req), req.body.tracks));

  function validUser(req) {
    if (!USER_ID.test(req.params.userId)) throw Object.assign(new Error('invalid user id'), { statusCode: 400 });
    return req.params.userId;
  }
}

