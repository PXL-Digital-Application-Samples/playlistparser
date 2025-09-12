import fp from 'fastify-plugin';
import { ensureAccess } from './util.js';

export default fp(async function playlistRoutes(fastify) {
  fastify.post('/playlists', async (req, reply) => {
    const user = await fastify.authUser(req);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    const { name } = req.body || {};
    if (!name) return reply.code(400).send({ error: 'name_required' });

    const { accessToken } = await ensureAccess(user.id, fastify);
    const r = await fetch(`https://api.spotify.com/v1/users/${encodeURIComponent(user.spotifyId)}/playlists`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, public: false })
    });
    if (r.status === 429) return reply.code(429).send({ error: 'rate_limited', retryAfter: r.headers.get('retry-after') });
    if (!r.ok) return reply.code(502).send({ error: 'spotify_failed' });
    return r.json();
  });

  fastify.post('/playlists/:id/dedupe', async (req, reply) => {
    const user = await fastify.authUser(req);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });

    const playlistId = req.params.id;
    const { accessToken } = await ensureAccess(user.id, fastify);

    // Fetch tracks paged
    const tracks = await collectAll(`/playlists/${playlistId}/tracks`, accessToken);
    const seen = new Set();
    const toRemove = [];
    tracks.forEach((item, idx) => {
      const t = item.track?.id;
      if (!t) return;
      if (seen.has(t)) toRemove.push({ uri: `spotify:track:${t}`, positions: [idx] });
      else seen.add(t);
    });
    if (toRemove.length === 0) return { removed: 0 };

    const r = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tracks: toRemove })
    });
    if (!r.ok) return reply.code(502).send({ error: 'spotify_failed' });
    const data = await r.json();
    return { removed: toRemove.length, snapshot_id: data.snapshot_id };
  });

  async function collectAll(path, accessToken) {
    let url = `https://api.spotify.com/v1${path}?limit=100`;
    const out = [];
    while (url) {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!r.ok) throw new Error('spotify_failed');
      const j = await r.json();
      out.push(...j.items);
      url = j.next;
    }
    return out;
  }
});
