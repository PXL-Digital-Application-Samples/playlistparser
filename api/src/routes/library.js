// Library sync: start it, and poll its progress.
export default async function libraryRoutes(fastify) {
  const auth = { preHandler: fastify.requireUser };

  fastify.get('/library/sync', auth, async (req) => fastify.librarySync.state(req.user.id));

  // Starts a sync unless one is already running; returns the current state.
  fastify.post('/library/sync', auth, async (req) => fastify.librarySync.start(req.user));

  // Enrichment (Deezer tempo, Last.fm tags, MusicBrainz origins) runs after
  // each sync; these show its progress or start it again.
  fastify.get('/library/enrichment', auth, async (req) => fastify.enricher.state(req.user.id));
  fastify.post('/library/enrichment', auth, async (req) => fastify.enricher.start(req.user));
}
