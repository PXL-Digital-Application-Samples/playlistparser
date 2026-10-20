// Library sync: copies the user's analyzable playlists and Liked Songs into
// Postgres, so library-wide insights are computed from the database instead
// of reading ~100 playlists from Spotify on every request.
//
// - Runs in the background; progress lives in LibrarySync, so any API
//   instance can report it and a crashed instance shows up as "stalled".
// - Incremental: a playlist is only re-read when Spotify's snapshot_id (or,
//   for Liked Songs, total + newest added_at) changed, or its last sync failed.
// - Failures are retried, then recorded per playlist; never silently skipped.
import { normalizeItems } from './tracks.js';
import { LIKED_ID, pickImage, isAnalyzable } from './library.js';

const CONCURRENCY = 3;
// Bump when the stored track shape changes, so every playlist is re-read
// once instead of waiting for it to change on Spotify.
const FORMAT = 'f2';
const RETRY_DELAYS_MS = [2_000, 6_000];
const STALL_MS = 2 * 60_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createLibrarySync({ prisma, spotify, accessTokenFor, log, onComplete }) {
  // Atomically claim the user's sync row; returns false if a live sync runs.
  async function claim(userId) {
    const fresh = {
      status: 'running', total: 0, done: 0, failed: 0, current: 'Reading your playlists',
      error: null, startedAt: new Date(), finishedAt: null,
    };
    try {
      await prisma.librarySync.create({ data: { userId, ...fresh } });
      return true;
    } catch {
      const { count } = await prisma.librarySync.updateMany({
        where: {
          userId,
          OR: [{ status: { not: 'running' } }, { updatedAt: { lt: new Date(Date.now() - STALL_MS) } }],
        },
        data: fresh,
      });
      return count === 1;
    }
  }

  async function start(user) {
    if (await claim(user.id)) {
      run(user).catch((err) => log.error({ err, userId: user.id }, 'library sync crashed'));
    }
    return state(user.id);
  }

  async function run(user) {
    const update = (data) => prisma.librarySync.update({ where: { userId: user.id }, data });
    try {
      const token = await accessTokenFor(user);
      const [playlists, likedHead] = await Promise.all([
        spotify.getAll('/me/playlists?limit=50', token),
        spotify.get('/me/tracks?limit=1', token).catch((err) => (err.status === 403 ? null : Promise.reject(err))),
      ]);

      const targets = [
        ...(likedHead
          ? [{
              id: LIKED_ID, name: 'Liked Songs', version: `${FORMAT}:${likedHead.total}:${likedHead.items?.[0]?.added_at ?? ''}`,
              image: null, url: 'https://open.spotify.com/collection/tracks',
              ownerId: user.spotifyId, ownerName: user.displayName, collaborative: false,
            }]
          : []),
        ...playlists.filter((p) => isAnalyzable(p, user.spotifyId)).map((p) => ({
          id: p.id, name: p.name, version: `${FORMAT}:${p.snapshot_id ?? ''}`, image: pickImage(p.images),
          url: p.external_urls?.spotify ?? null, ownerId: p.owner?.id ?? null,
          ownerName: p.owner?.display_name ?? null, collaborative: Boolean(p.collaborative),
        })),
      ];

      const existing = await prisma.libraryPlaylist.findMany({
        where: { userId: user.id },
        select: { playlistId: true, version: true, status: true },
      });
      const known = new Map(existing.map((r) => [r.playlistId, r]));
      const keep = new Set(targets.map((t) => t.id));
      await prisma.libraryPlaylist.deleteMany({
        where: { userId: user.id, playlistId: { notIn: [...keep] } },
      });

      const todo = targets.filter((t) => {
        const row = known.get(t.id);
        return !row || row.version !== t.version || row.status !== 'ok';
      });
      await update({ total: todo.length, current: todo.length ? null : 'Everything up to date' });

      let done = 0;
      let failed = 0;
      await mapLimit(todo, CONCURRENCY, async (t) => {
        const ok = await syncOne(user, t);
        done++;
        if (!ok) failed++;
        await update({ done, failed, current: t.name });
      });

      await update({ status: 'completed', current: null, finishedAt: new Date() });
      // e.g. start enrichment (tempo, tags, origins) for the fresh data
      onComplete?.(user);
    } catch (err) {
      log.error({ err, userId: user.id }, 'library sync failed');
      await update({ status: 'error', error: String(err.message || err).slice(0, 300), finishedAt: new Date() }).catch(() => {});
    }
  }

  async function syncOne(user, t) {
    const meta = {
      version: t.version, name: t.name, image: t.image, url: t.url, ownerId: t.ownerId,
      ownerName: t.ownerName, collaborative: t.collaborative,
    };
    let lastErr;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        // Re-check the token per playlist: a first sync can outlive it.
        const token = await accessTokenFor(user);
        // market=from_token adds is_playable, used by the unplayable check.
        const path = t.id === LIKED_ID
          ? '/me/tracks?limit=50&market=from_token'
          : `/playlists/${t.id}/items?limit=50&additional_types=track,episode&market=from_token`;
        const tracks = normalizeItems(await spotify.getAllPaged(path, token));
        const data = { ...meta, tracks, trackCount: tracks.length, status: 'ok', error: null, syncedAt: new Date() };
        await prisma.libraryPlaylist.upsert({
          where: { userId_playlistId: { userId: user.id, playlistId: t.id } },
          create: { userId: user.id, playlistId: t.id, ...data },
          update: data,
        });
        return true;
      } catch (err) {
        lastErr = err;
        if (err.status === 404 || err.status === 403) break; // won't fix itself
        if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
      }
    }
    log.warn({ err: lastErr, playlist: t.id }, 'playlist sync failed');
    const error = String(lastErr?.message || lastErr).slice(0, 300);
    // Keep the previous copy (if any) but mark it, so it's retried next time.
    await prisma.libraryPlaylist.upsert({
      where: { userId_playlistId: { userId: user.id, playlistId: t.id } },
      create: { userId: user.id, playlistId: t.id, ...meta, version: '', tracks: [], status: 'error', error },
      update: { status: 'error', error, version: '' },
    });
    return false;
  }

  async function state(userId) {
    const [row, counts, failedRows] = await Promise.all([
      prisma.librarySync.findUnique({ where: { userId } }),
      prisma.libraryPlaylist.count({ where: { userId, status: 'ok' } }),
      prisma.libraryPlaylist.findMany({ where: { userId, status: 'error' }, select: { name: true, error: true } }),
    ]);
    if (!row) return { status: 'never', playlists: counts };
    const stalled = row.status === 'running' && Date.now() - row.updatedAt.getTime() > STALL_MS;
    return {
      status: stalled ? 'error' : row.status,
      error: stalled ? 'The sync stopped responding. Start it again.' : row.error,
      total: row.total,
      done: row.done,
      failed: row.failed,
      current: row.current,
      started_at: row.startedAt,
      finished_at: row.finishedAt,
      playlists: counts,
      failed_playlists: failedRows,
    };
  }

  // Synced playlists in the shape the insight functions expect.
  async function load(userId) {
    const rows = await prisma.libraryPlaylist.findMany({ where: { userId, status: 'ok' } });
    return rows.map((r) => ({
      info: {
        id: r.playlistId, name: r.name, image: r.image, url: r.url,
        owner: { id: r.ownerId, display_name: r.ownerName }, collaborative: r.collaborative,
      },
      tracks: r.tracks,
      synced_at: r.syncedAt,
    }));
  }

  return { start, state, load };
}

async function mapLimit(items, limit, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}
