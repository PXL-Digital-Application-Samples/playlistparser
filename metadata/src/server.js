// Metadata service: public facts about music (Last.fm listener counts, tags
// and similar artists; Deezer tempo and song previews; MusicBrainz origins and
// composers), looked up on demand or in background jobs and cached in its own
// database. Only the API calls it; it never sees user accounts or Spotify
// tokens. Not meant to be reachable from the internet.
import { timingSafeEqual } from 'node:crypto';
import Fastify from 'fastify';
import client from 'prom-client';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

import { loadConfig } from './config.js';
import { createLastfm } from './lastfm.js';
import { createEnricher } from './enrich.js';
import metadataRoutes from './routes.js';
import previewRoutes from './preview.js';

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const app = Fastify({
  logger: { level: config.logLevel },
  // Liked Songs can hold tens of thousands of tracks.
  bodyLimit: config.bodyLimitMb * 1024 * 1024,
});

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: config.databaseUrl }, { schema: config.dbSchema }),
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
  await prisma.$disconnect();
});

// Containers stop with SIGTERM; close gracefully so in-flight requests finish.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, async () => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  });
}

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info({ dbSchema: config.dbSchema ?? 'public', lastfm: app.lastfm.status }, 'configuration');
  app.lastfm.verify();
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
