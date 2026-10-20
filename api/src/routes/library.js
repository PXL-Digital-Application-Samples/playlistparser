// Library sync: start it, and poll its progress.
export default async function libraryRoutes(fastify) {
  const auth = { preHandler: fastify.requireUser };

  fastify.get('/library/sync', auth, async (req) => fastify.librarySync.state(req.user.id));

  // Starts a sync unless one is already running; returns the current state.
  fastify.post('/library/sync', auth, async (req) => fastify.librarySync.start(req.user));
}
