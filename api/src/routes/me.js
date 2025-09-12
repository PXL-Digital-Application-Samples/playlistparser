import fp from 'fastify-plugin';
import { prisma } from '../lib/db.js';
import { ensureAccess } from './util.js';

export default fp(async function meRoutes(fastify) {
  fastify.get('/me', async (req, reply) => {
    const user = await authUser(req, fastify);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    return { id: user.id, spotifyId: user.spotifyId, email: user.email, displayName: user.displayName };
  });

  fastify.get('/me/playlists', async (req, reply) => {
    const user = await authUser(req, fastify);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    const { accessToken } = await ensureAccess(user.id, fastify);
    const res = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (res.status === 429) return reply.code(429).send({ error: 'rate_limited', retryAfter: res.headers.get('retry-after') });
    if (!res.ok) return reply.code(502).send({ error: 'spotify_failed' });
    return res.json();
  });
});

export async function authUser(req, fastify) {
  const sid = req.cookies.sid;            // no unsign
  if (!sid) return null;
  return fastify.prisma.user.findUnique({ where: { id: sid } });
}
