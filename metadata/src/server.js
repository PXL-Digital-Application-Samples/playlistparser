// Metadata service: public facts about music (Last.fm listener counts, tags
// and similar artists; Deezer tempo and song previews; MusicBrainz origins and
// composers), looked up on demand or in background jobs and cached in its own
// database. Only the API calls it; it never sees user accounts or Spotify
// tokens. Not meant to be reachable from the internet.
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

import { loadConfig } from './config.js';
import { buildApp } from './app.js';

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: config.databaseUrl }, { schema: config.dbSchema }),
});
const app = await buildApp({ config, prisma });

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
  app.log.info({ host: config.host, dbSchema: config.dbSchema ?? 'public', lastfm: app.lastfm.status }, 'configuration');
  app.lastfm.verify();
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
