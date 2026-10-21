import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createMetadata } from '../src/lib/metadata.js';

const silent = { warn() {}, info() {}, error() {} };

// A fake metadata service that records requests and answers with `reply`.
async function fakeService(reply) {
  const seen = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: body ? JSON.parse(body) : null });
      const [status, json] = reply(req);
      res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(json));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/prefix`, seen, close: () => server.close() };
}

test('metadata client: sends the token, keeps a path prefix, maps listeners', async () => {
  const svc = await fakeService(() => [200, { status: 'ok', listeners: { a: { listeners: 5, playcount: 9 } } }]);
  const md = createMetadata({ url: svc.url, token: 'secret', timeoutMs: 2000 }, { log: silent });
  const tracks = [
    { id: 'a', name: 'Song', artists: [{ name: 'Band' }, { name: 'Guest' }] },
    { id: 'a', name: 'Song', artists: [{ name: 'Band' }] }, // duplicate
    { id: null, name: 'Local', artists: [{ name: 'Me' }], is_local: true },
  ];
  const { status, cached } = await md.listeners(tracks, { waitMs: 500 });
  svc.close();
  assert.equal(status, 'ok');
  assert.deepEqual(cached.get('a'), { listeners: 5, playcount: 9 });
  assert.equal(svc.seen[0].url, '/prefix/listeners');
  assert.equal(svc.seen[0].auth, 'Bearer secret');
  assert.deepEqual(svc.seen[0].body, { tracks: [{ id: 'a', name: 'Song', artist: 'Band' }], queue: true, wait_ms: 500 });
});

test('metadata client: polls without queueing send ids only', async () => {
  const svc = await fakeService(() => [200, { status: 'ok', listeners: {} }]);
  const md = createMetadata({ url: svc.url, token: 'secret', timeoutMs: 2000 }, { log: silent });
  await md.listeners([{ id: 'a', name: 'Song', artists: [{ name: 'Band' }] }], { queue: false });
  svc.close();
  assert.deepEqual(svc.seen[0].body, { tracks: [{ id: 'a' }], queue: false, wait_ms: 0 });
});

test('metadata client: pages still work when the service fails', async () => {
  const svc = await fakeService(() => [500, { error: 'internal_error' }]);
  const md = createMetadata({ url: svc.url, token: 'secret', timeoutMs: 2000 }, { log: silent });
  assert.deepEqual(await md.lookup({ isrcs: ['X'] }), { tempo: [], artists: {}, listeners: [], works: [] });
  assert.equal(await md.lastfmStatus(), 'unavailable');
  const state = await md.enrichmentState('user1');
  assert.deepEqual(Object.keys(state), ['deezer', 'lastfm', 'musicbrainz']);
  assert.equal(state.deezer.status, 'error');
  await assert.rejects(md.preview({ title: 'x' }), (err) => err.status === 500);
  svc.close();
});

test('metadata client: unreachable service counts as unavailable', async () => {
  const md = createMetadata({ url: 'http://127.0.0.1:9', token: 'secret', timeoutMs: 1000 }, { log: silent });
  const { status, cached } = await md.listeners([{ id: 'a', name: 'S', artists: [{ name: 'B' }] }]);
  assert.equal(status, 'unavailable');
  assert.equal(cached.size, 0);
});
