import { computeStats, findDuplicates } from '../lib/tracks.js';
import { playlistCsvHeader, playlistCsvRows, csvFilename, joinCsv } from '../lib/csv.js';
import { summarizeListeners } from '../lib/metadata.js';
import { LIKED_ID, isAnalyzable } from '../lib/library.js';
import { splitLikes, artistDepth } from '../lib/insights.js';
import { compareTracks } from '../lib/explore.js';

const PLAYLIST_ID = /^[A-Za-z0-9]{1,64}$/;
const LASTFM_EXPORT_BUDGET_MS = 3 * 60_000;

export default async function playlistRoutes(fastify) {
  const { spotify, metadata } = fastify;
  const auth = { preHandler: fastify.requireUser };

  const loadPlaylist = (user, id, accessToken) => fastify.library.load(user, id, accessToken);

  async function playlistFor(req) {
    const { id } = req.params;
    if (!PLAYLIST_ID.test(id)) throw fastify.httpErrors.badRequest('invalid playlist id');
    const accessToken = await fastify.accessTokenFor(req.user);
    return loadPlaylist(req.user, id, accessToken);
  }

  // Liked Songs mixes songs liked one by one with whole albums saved in one
  // go; tracks from album saves are flagged so the UI can tell them apart.
  fastify.get('/playlists/:id/contents', auth, async (req) => {
    const { tracks } = await playlistFor(req);
    if (req.params.id !== LIKED_ID) return { count: tracks.length, tracks };
    const handpicked = new Set(splitLikes(tracks).handpicked.map((t) => t.position));
    return { count: tracks.length, tracks: tracks.map((t) => (t.id && !handpicked.has(t.position) ? { ...t, album_save: true } : t)) };
  });

  // For Liked Songs, ?lens=handpicked (default) leaves whole-album saves out;
  // ?lens=all keeps every song but counts each album save once for artists.
  fastify.get('/playlists/:id/stats', auth, async (req) => {
    const { info, tracks } = await playlistFor(req);
    if (req.params.id !== LIKED_ID) return { playlist: info, ...computeStats(tracks), lastfm_status: await metadata.lastfmStatus() };

    const lens = req.query.lens === 'all' ? 'all' : 'handpicked';
    const split = splitLikes(tracks);
    const stats = computeStats(lens === 'all' ? tracks : split.handpicked);
    if (lens === 'all') {
      stats.top_artists = artistDepth(tracks, split.events).deepest.map(({ id, name, count }) => ({ id: id ?? null, name, count }));
    }
    return {
      playlist: info,
      ...stats,
      lens,
      lens_counts: { handpicked: split.handpicked.length, all: tracks.length, album_saves: split.bulkGroups.length },
      lastfm_status: await metadata.lastfmStatus(),
    };
  });

  fastify.get('/playlists/:id/simulate-dedupe', auth, async (req) => {
    const { tracks } = await playlistFor(req);
    return findDuplicates(tracks);
  });

  // Last.fm listener stats. The metadata service starts lookups for uncached
  // tracks and returns what is known so far; the frontend polls until
  // `complete`. Polls with ?queue=0 only read the cache (ids only), so a large
  // library isn't sent in full every few seconds.
  fastify.get('/playlists/:id/listeners', auth, async (req) => {
    const lastfmStatus = await metadata.lastfmStatus();
    if (lastfmStatus !== 'ok') return { enabled: false, status: lastfmStatus };
    const { tracks } = await playlistFor(req);
    const eligible = new Set(tracks.filter((t) => t.id && !t.is_local && t.name && t.artists.length).map((t) => t.id));
    const { status, cached } = await metadata.listeners(tracks, { queue: req.query.queue !== '0' });
    if (status !== 'ok') return { enabled: false, status };
    return {
      enabled: true,
      complete: cached.size >= eligible.size,
      looked_up: cached.size,
      eligible: eligible.size,
      ...summarizeListeners(tracks, cached),
    };
  });

  fastify.get('/playlists/:id/export', auth, async (req, reply) => {
    const { info, tracks } = await playlistFor(req);
    const { cached } = await metadata.listeners(tracks, { queue: false }); // what's known; no new lookups
    const csv = joinCsv(playlistCsvHeader(false), playlistCsvRows(tracks, { lastfm: cached }));
    return sendCsv(reply, csvFilename(req.user.spotifyId, info.name), csv);
  });

  fastify.get('/simulate-merge', auth, async (req, reply) => {
    const { a, b } = req.query;
    if (!PLAYLIST_ID.test(a || '') || !PLAYLIST_ID.test(b || '')) {
      return reply.code(400).send({ error: 'query_required', example: '/simulate-merge?a=PL1&b=PL2' });
    }
    const accessToken = await fastify.accessTokenFor(req.user);
    const [A, B] = await Promise.all([
      loadPlaylist(req.user, a, accessToken),
      loadPlaylist(req.user, b, accessToken),
    ]);
    const idsA = new Set(A.tracks.map((t) => t.id).filter(Boolean));
    const idsB = new Set(B.tracks.map((t) => t.id).filter(Boolean));
    const intersection = [...idsA].filter((x) => idsB.has(x));
    return {
      playlist_a: { id: a, name: A.info.name, image: A.info.image ?? null, tracks: idsA.size },
      playlist_b: { id: b, name: B.info.name, image: B.info.image ?? null, tracks: idsB.size },
      union_count: new Set([...idsA, ...idsB]).size,
      intersection_count: intersection.length,
      would_add_from_b_to_a: [...idsB].filter((x) => !idsA.has(x)).length,
      // The songs themselves, for the compare page (capped per list).
      ...compareTracks(A.tracks, B.tracks),
    };
  });

  // ---- Bulk export (async job stored in the database) ----------------------

  fastify.post('/playlists/export-all', auth, async (req) => {
    const job = await fastify.prisma.exportJob.create({
      data: { userId: req.user.id, status: 'starting' },
    });
    runExportAll(job.id, req.user).catch((err) => req.log.error({ err, jobId: job.id }, 'export job crashed'));
    return { jobId: job.id };
  });

  fastify.get('/playlists/export-progress/:jobId', auth, async (req, reply) => {
    const job = await findJob(req);
    if (!job) return reply.code(404).send({ error: 'job_not_found' });
    return {
      status: job.status,
      current: job.current,
      total: job.total,
      skipped: job.skipped,
      currentPlaylist: job.currentPlaylist,
      error: job.error,
      downloadUrl: job.status === 'completed' ? `${fastify.config.basePath}/playlists/download/${job.id}` : null,
    };
  });

  fastify.get('/playlists/download/:jobId', auth, async (req, reply) => {
    const job = await findJob(req, true);
    if (!job || job.status !== 'completed') return reply.code(404).send({ error: 'file_not_ready' });
    return sendCsv(reply, job.filename, job.csv);
  });

  async function findJob(req, withCsv = false) {
    const job = await fastify.prisma.exportJob.findFirst({
      where: { id: req.params.jobId, userId: req.user.id },
      ...(withCsv ? {} : { omit: { csv: true } }),
    });
    // A job whose instance died mid-way would otherwise poll forever.
    if (job && !['completed', 'error'].includes(job.status) && Date.now() - job.updatedAt.getTime() > 5 * 60_000) {
      return { ...job, status: 'error', error: 'export stalled, please try again' };
    }
    return job;
  }

  async function runExportAll(jobId, user) {
    const update = (data) => fastify.prisma.exportJob.update({ where: { id: jobId }, data });
    try {
      await update({ status: 'fetching_playlists' });
      const accessToken = await fastify.accessTokenFor(user);
      const all = await fastify.library.playlists(user, accessToken);
      const playlists = all.filter((p) => isAnalyzable(p, user.spotifyId));
      // Liked Songs first, when the session has the user-library-read scope.
      const hasLiked = await spotify.get('/me/tracks?limit=1', accessToken).then(() => true, () => false);
      const queue = [...(hasLiked ? [{ id: LIKED_ID, name: 'Liked Songs' }] : []), ...playlists];
      await update({ status: 'processing', total: queue.length, skipped: all.length - playlists.length });

      // Last.fm lookups are slow (~4/s). Wait for them within a time budget so
      // the export finishes; tracks not looked up yet get empty Last.fm columns.
      const lastfmDeadline = Date.now() + LASTFM_EXPORT_BUDGET_MS;
      const lastfmOn = (await metadata.lastfmStatus()) === 'ok';
      const rows = [];
      for (let i = 0; i < queue.length; i++) {
        const p = queue[i];
        await update({ current: i + 1, currentPlaylist: p.name });
        // Re-check the token every playlist; large libraries can outlive it.
        const token = await fastify.accessTokenFor(user);
        const { info, tracks } = await loadPlaylist(user, p.id, token);
        let cached = null;
        if (lastfmOn) {
          const remaining = Math.max(0, Math.min(lastfmDeadline - Date.now(), 60_000));
          ({ cached } = await metadata.listeners(tracks, { waitMs: remaining }));
        }
        rows.push(...playlistCsvRows(tracks, { playlist: info, lastfm: cached }));
      }

      await update({
        status: 'completed',
        currentPlaylist: null,
        filename: csvFilename(user.spotifyId, 'all_playlists'),
        csv: joinCsv(playlistCsvHeader(true), rows),
      });
    } catch (err) {
      fastify.log.error({ err, jobId }, 'export failed');
      await update({ status: 'error', error: err.message?.slice(0, 500) || 'export failed' }).catch(() => {});
    }
  }
}

function sendCsv(reply, filename, csv) {
  return reply
    .header('Content-Type', 'text/csv; charset=utf-8')
    .header('Content-Disposition', `attachment; filename="${filename}"`)
    .header('Cache-Control', 'no-store')
    .send(csv);
}
