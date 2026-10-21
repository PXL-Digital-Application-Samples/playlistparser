import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';

const TOKEN = 't'.repeat(32);
const auth = { authorization: `Bearer ${TOKEN}` };
const config = {
  token: TOKEN, bodyLimitMb: 1, logLevel: 'silent',
  lastfm: { apiKey: 'key', cacheDays: 30 },
};

// A stand-in for Prisma that records queries and returns canned rows.
function fakePrisma(rows = {}) {
  const queries = [];
  const model = (name) => ({
    findMany: async (args) => {
      queries.push({ name, args });
      return rows[name] ?? [];
    },
  });
  return {
    queries,
    deezerTrack: model('deezerTrack'),
    artistInfo: model('artistInfo'),
    lastfmTrack: model('lastfmTrack'),
    recordingWork: model('recordingWork'),
    enrichJob: model('enrichJob'),
    $queryRaw: async () => [{ ok: 1 }],
  };
}

const app = (prisma = fakePrisma()) => buildApp({ config, prisma, logger: false });

test('probes are open, everything else needs the token', async () => {
  const a = await app();
  assert.equal((await a.inject({ url: '/healthz' })).statusCode, 200);
  assert.equal((await a.inject({ url: '/readyz' })).statusCode, 200);
  assert.equal((await a.inject({ url: '/metrics' })).statusCode, 200);
  assert.equal((await a.inject({ url: '/status' })).statusCode, 401);
  assert.equal((await a.inject({ url: '/status', headers: { authorization: `Bearer ${'x'.repeat(32)}` } })).statusCode, 401);
  assert.equal((await a.inject({ url: '/nope' })).statusCode, 401);
  const ok = await a.inject({ url: '/status', headers: auth });
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(ok.json(), { lastfm: 'ok' });
  await a.close();
});

test('lookup returns artists keyed by the names as sent and skips odd ids', async () => {
  const prisma = fakePrisma({ artistInfo: [{ key: 'the band', name: 'The Band', country: 'CA' }] });
  const a = await app(prisma);
  const res = await a.inject({
    method: 'POST', url: '/lookup', headers: auth,
    payload: { artists: ['The Band', ' the band ', 'x'.repeat(1000)], isrcs: ['GB1234567890', 'Z'.repeat(40)], track_ids: [] },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.artists['The Band'].country, 'CA');
  assert.equal(body.artists[' the band '].country, 'CA');
  const isrcQuery = prisma.queries.find((q) => q.name === 'deezerTrack');
  assert.deepEqual(isrcQuery.args.where.isrc.in, ['GB1234567890']);
  await a.close();
});

test('one over-long title does not fail the listeners request', async () => {
  const prisma = fakePrisma({ lastfmTrack: [{ spotifyTrackId: 'a', listeners: 7, playcount: 9 }] });
  const a = await app(prisma);
  const res = await a.inject({
    method: 'POST', url: '/listeners', headers: auth,
    payload: { tracks: [{ id: 'a', name: 'Song', artist: 'Band' }, { id: 'b', name: 'y'.repeat(5000), artist: 'Band' }], queue: false },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { status: 'ok', listeners: { a: { listeners: 7, playcount: 9 } } });
  // queue: false reads the cache once and looks nothing up.
  assert.equal(prisma.queries.filter((q) => q.name === 'lastfmTrack').length, 1);
  await a.close();
});

test('enrichment rejects a malformed user id', async () => {
  const a = await app();
  const res = await a.inject({ url: '/enrichment/bad%20id', headers: auth });
  assert.equal(res.statusCode, 400);
  await a.close();
});
