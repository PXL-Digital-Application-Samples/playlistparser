import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import underPressure from '@fastify/under-pressure';
import rateLimit from '@fastify/rate-limit';
import client from 'prom-client';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

import { loadConfig } from './lib/config.js';
import { createTokenCipher } from './lib/crypto.js';
import { createSpotify, SpotifyError } from './lib/spotify.js';
import { createLastfm } from './lib/lastfm.js';
import { createLibrary } from './lib/library.js';
import { createLibrarySync } from './lib/sync.js';
import { SESSION_COOKIE, ensureAccess, findSessionUser, deleteExpiredSessions } from './lib/auth.js';
import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import playlistRoutes from './routes/playlists.js';
import insightsRoutes from './routes/insights.js';
import libraryRoutes from './routes/library.js';

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const app = Fastify({
  logger: { level: config.logLevel },
  trustProxy: config.trustProxy,
});

// Prisma 7 talks to Postgres through the node-postgres driver adapter.
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
app.decorate('config', config);
app.decorate('prisma', prisma);
app.decorate('cipher', createTokenCipher(config.tokenEncKey));
app.decorate('spotify', createSpotify(config.spotify));
app.decorate('library', createLibrary(app.spotify));
app.decorate('lastfm', createLastfm(config.lastfm, prisma, app.log));

app.decorate('readSessionId', (req) => {
  const raw = req.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const { valid, value } = req.unsignCookie(raw);
  return valid ? value : null;
});
app.decorate('requireUser', async (req, reply) => {
  const user = await findSessionUser(prisma, app.readSessionId(req));
  if (!user) return reply.code(401).send({ error: 'unauthorized' });
  req.user = user;
});
app.decorate('accessTokenFor', (user) =>
  ensureAccess({ prisma, spotify: app.spotify, cipher: app.cipher, log: app.log }, user.id)
);
app.decorate('librarySync', createLibrarySync({
  prisma, spotify: app.spotify, accessTokenFor: app.accessTokenFor, log: app.log,
}));

await app.register(sensible);
await app.register(cookie, { secret: config.sessionSecret });
await app.register(cors, {
  origin: config.corsOrigins,
  credentials: true,
  methods: ['GET', 'POST'],
});
await app.register(rateLimit, {
  max: config.rateLimit.max,
  timeWindow: config.rateLimit.windowSeconds * 1000,
});
await app.register(underPressure, { maxEventLoopDelay: 1000 });

// Cheap CSRF guard: state-changing requests must be JSON, which a cross-site
// HTML form can't send without a CORS preflight.
app.addHook('onRequest', async (req, reply) => {
  if (req.method === 'POST' && !String(req.headers['content-type'] || '').startsWith('application/json')) {
    return reply.code(415).send({ error: 'content_type_must_be_json' });
  }
});

app.setErrorHandler((err, req, reply) => {
  if (err.code === 'reauth_required') {
    return reply.code(401).send({ error: 'reauth_required' });
  }
  if (err instanceof SpotifyError) {
    req.log.warn({ err }, 'spotify error');
    if (err.status === 429) {
      if (err.retryAfter) reply.header('Retry-After', String(err.retryAfter));
      return reply.code(429).send({ error: 'rate_limited', retryAfter: err.retryAfter });
    }
    if (err.status === 401) return reply.code(401).send({ error: 'reauth_required' });
    if (err.status === 403) return reply.code(403).send({ error: 'playlist_not_accessible' });
    if (err.status === 404) return reply.code(404).send({ error: 'not_found' });
    return reply.code(502).send({ error: 'spotify_failed' });
  }
  if (err.statusCode && err.statusCode < 500) {
    return reply.code(err.statusCode).send({ error: err.code || err.message });
  }
  req.log.error({ err }, 'unhandled error');
  return reply.code(500).send({ error: 'internal_error' });
});

// Everything lives under API_BASE_PATH (default: root), including probes.
const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

await app.register(async (api) => {
  const noLimit = { config: { rateLimit: false } };
  api.get('/healthz', noLimit, async () => ({ ok: true }));
  api.get('/readyz', noLimit, async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  });
  api.get('/metrics', noLimit, async (req, reply) => {
    reply.header('Content-Type', registry.contentType);
    return registry.metrics();
  });

  await api.register(authRoutes);
  await api.register(meRoutes);
  await api.register(playlistRoutes);
  await api.register(insightsRoutes);
  await api.register(libraryRoutes);
}, { prefix: config.basePath });

// Housekeeping: expired sessions and old export jobs.
const cleanup = setInterval(async () => {
  try {
    await deleteExpiredSessions(prisma);
    await prisma.exportJob.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 3_600_000) } } });
  } catch (err) {
    app.log.warn({ err }, 'cleanup failed');
  }
}, 10 * 60_000);
cleanup.unref();

app.addHook('onClose', async () => {
  clearInterval(cleanup);
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
  app.log.info(
    { basePath: config.basePath || '/', corsOrigins: config.corsOrigins, trustProxy: config.trustProxy,
      cookie: config.cookie, lastfm: app.lastfm.status },
    'configuration'
  );
  app.lastfm.verify();
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
