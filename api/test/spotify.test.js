import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createSpotify } from '../src/lib/spotify.js';

test('getAllPaged fetches every page by offset and keeps order', async () => {
  const total = 237;
  const requested = [];
  mock.method(globalThis, 'fetch', async (url) => {
    const u = new URL(url);
    const offset = Number(u.searchParams.get('offset') || 0);
    const limit = Number(u.searchParams.get('limit') || 50);
    requested.push(offset);
    const items = [];
    for (let i = offset; i < Math.min(offset + limit, total); i++) items.push({ n: i });
    const next = offset + limit < total ? `https://api.spotify.com/v1/me/tracks?offset=${offset + limit}&limit=${limit}` : null;
    return new Response(JSON.stringify({ items, total, limit, offset, next }), { status: 200 });
  });

  const spotify = createSpotify({ clientId: 'a', clientSecret: 'b', redirectUri: 'http://127.0.0.1/cb' });
  const items = await spotify.getAllPaged('/me/tracks?limit=50', 'token');

  assert.equal(items.length, total);
  assert.deepEqual(items.map((i) => i.n), Array.from({ length: total }, (_, i) => i));
  assert.deepEqual([...requested].sort((a, b) => a - b), [0, 50, 100, 150, 200]);
  mock.restoreAll();
});
