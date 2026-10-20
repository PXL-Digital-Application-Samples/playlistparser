// Prisma CLI configuration (Prisma 7). Used by `prisma generate` and
// `prisma migrate deploy`; the running API doesn't read this file.
import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// The Prisma 7 CLI no longer loads .env by itself. Load it for local
// development; real environment variables take precedence.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Only needed for commands that talk to the database (migrate); `generate`
  // works without it, e.g. in a Docker build stage.
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
