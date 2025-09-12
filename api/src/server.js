import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import underPressure from '@fastify/under-pressure';
import rateLimit from '@fastify/rate-limit';
import client from 'prom-client';
import { prisma } from './lib/db.js';

import authRoutes from './routes/auth.js';
import meRoutes, { authUser } from './routes/me.js';
import playlistRoutes from './routes/playlists.js';

const app = Fastify({ logger: true });

app.decorate('prisma', prisma);
app.decorate('config', { isProd: process.env.NODE_ENV === 'production' });
app.decorate('authUser', (req) => authUser(req, app));

app.register(sensible);
app.register(cookie, { secret: process.env.SESSION_SECRET });
app.register(cors, {
  origin: process.env.FRONTEND_ORIGIN || true,
  credentials: true
});
app.register(rateLimit, { max: 80, timeWindow: '30 seconds' });
app.register(underPressure, { maxEventLoopDelay: 1000 });

app.get('/healthz', async () => ({ ok: true }));
app.get('/readyz', async () => {
  await prisma.$queryRaw`SELECT 1`;
  return { ok: true };
});

// Prometheus metrics
const r = new client.Registry();
client.collectDefaultMetrics({ register: r });
app.get('/metrics', async (req, reply) => {
  reply.header('Content-Type', r.contentType);
  return r.metrics();
});

// Routes
app.register(authRoutes);
app.register(meRoutes);
app.register(playlistRoutes);

const port = Number(process.env.PORT || 3000);
app.listen({ port, host: '0.0.0.0' }).catch((e) => {
  app.log.error(e);
  process.exit(1);
});
