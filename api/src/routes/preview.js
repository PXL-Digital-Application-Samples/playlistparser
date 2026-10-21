import { MetadataError } from '../lib/metadata.js';

// 30-second song previews for the in-app record player. The metadata service
// looks up the Deezer link; the browser can't reach that service, so the API
// passes the request on for signed-in users.
export default async function previewRoutes(fastify) {
  fastify.get('/preview', { preHandler: fastify.requireUser }, async (req, reply) => {
    const q = (name) => String(req.query[name] || '').slice(0, 200).trim();
    try {
      return await fastify.metadata.preview({ isrc: q('isrc'), title: q('title'), artist: q('artist') });
    } catch (err) {
      if (err instanceof MetadataError && err.status === 400) return reply.code(400).send({ error: 'isrc_or_title_required' });
      req.log.warn({ err: { message: err.message } }, 'preview lookup failed');
      return reply.code(502).send({ error: 'preview_unavailable' });
    }
  });
}
