// Builds the metadata service's Fastify app (hooks, routes, probes) without
// listening, so tests can run it with app.inject() and a stand-in database.
import { timingSafeEqual } from 'node:crypto';
import Fastify from 'fastify';
import client from 'prom-client';

import { createLastfm } from './lastfm.js';
import { createEnricher } from './enrich.js';
import metadataRoutes from './routes.js';
import previewRoutes from './preview.js';

export async function buildApp({ config, prisma, logger = { level: config.logLevel } }) {
  const app = Fastify({
    logger,
    // Liked Songs can hold tens of thousands of tracks.
    bodyLimit: config.bodyLimitMb * 1024 * 1024,
  });

  app.decorate('prisma', prisma);
  app.decorate('lastfm', createLastfm(config.lastfm, prisma, app.log));
  app.decorate('enricher', createEnricher({ prisma, config, log: app.log }));

  // Probes and metrics are open (for the load balancer or orchestrator);
  // everything else needs "Authorization: Bearer <METADATA_TOKEN>".
  const OPEN = new Set(['/healthz', '/readyz', '/metrics']);
  const expected = Buffer.from(`Bearer ${config.token}`);
  app.addHook('onRequest', async (req, reply) => {
    if (OPEN.has(req.routeOptions.url)) return;
    const got = Buffer.from(String(req.headers.authorization || ''));
    if (got.length !== expected.length || !timingSafeEqual(got, expected)) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err.statusCode && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: err.code || err.message });
    }
    req.log.error({ err }, 'unhandled error');
    return reply.code(500).send({ error: 'internal_error' });
  });

  const registry = new client.Registry();
  client.collectDefaultMetrics({ register: registry });

  app.get('/healthz', async () => ({ ok: true }));
  app.get('/readyz', async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  });
  app.get('/metrics', async (req, reply) => {
    reply.header('Content-Type', registry.contentType);
    return registry.metrics();
  });
  await app.register(metadataRoutes);
  await app.register(previewRoutes);

  app.addHook('onClose', async () => {
    await prisma.$disconnect?.();
  });
  return app;
}
