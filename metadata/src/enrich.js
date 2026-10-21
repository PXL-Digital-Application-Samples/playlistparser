// Enrichment: looks up public facts about the songs and artists the API sends
// (a user's Liked Songs), in the background, and caches them for everyone:
//   deezer      -> tempo (BPM) per recording, by ISRC (no key needed)
//   lastfm      -> tags and similar artists per artist (needs LASTFM_API_KEY)
//   musicbrainz -> country / start year per artist, and composer + work for
//                  classical recordings (no key; 1 request per second)
// Each source runs as its own job with progress in EnrichJob, so any
// instance can report it. Lookups that fail are counted and retried on the
// next run; nothing is cached for them.
import { limiter } from './ratelimit.js';
import { lastfmLimit } from './lastfm.js';

const STALL_MS = 2 * 60_000;
const REFRESH_DAYS = 90;
const CLASSICAL_TAGS = ['classical', 'baroque', 'opera', 'romantic', 'composer', 'chamber music', 'orchestral', 'early music'];
const MB_USER_AGENT = 'playlistparser/1.0 ( https://github.com/PXL-Digital-Application-Samples/playlistparser )';

const deezerLimit = limiter('deezer', 8);
const mbLimit = limiter('musicbrainz', 1);

export const SOURCES = ['deezer', 'lastfm', 'musicbrainz'];
export const artistKey = (name) => name.trim().toLowerCase();

export function createEnricher({ prisma, config, log }) {
  const lastfmKey = config.lastfm.apiKey;
  const freshSince = () => new Date(Date.now() - REFRESH_DAYS * 86_400_000);

  async function claim(userId, source) {
    const fresh = { status: 'running', total: 0, done: 0, failed: 0, error: null, startedAt: new Date(), finishedAt: null };
    try {
      await prisma.enrichJob.create({ data: { userId, source, ...fresh } });
      return true;
    } catch {
      const { count } = await prisma.enrichJob.updateMany({
        where: {
          userId, source,
          OR: [{ status: { not: 'running' } }, { updatedAt: { lt: new Date(Date.now() - STALL_MS) } }],
        },
        data: fresh,
      });
      return count === 1;
    }
  }

  // tracks: [{ isrc, artists: [name] }], sent by the API.
  async function start(userId, tracks) {
    if (!tracks.length) return state(userId);
    for (const source of SOURCES) {
      if (source === 'lastfm' && !lastfmKey) continue;
      if (await claim(userId, source)) {
        RUNNERS[source](userId, tracks).catch((err) => log.error({ err, source }, 'enrichment crashed'));
      }
    }
    return state(userId);
  }

  async function state(userId) {
    const rows = await prisma.enrichJob.findMany({ where: { userId } });
    const out = {};
    for (const source of SOURCES) {
      const r = rows.find((x) => x.source === source);
      if (source === 'lastfm' && !lastfmKey) { out[source] = { status: 'disabled' }; continue; }
      if (!r) { out[source] = { status: 'never' }; continue; }
      const stalled = r.status === 'running' && Date.now() - r.updatedAt.getTime() > STALL_MS;
      out[source] = {
        status: stalled ? 'error' : r.status, total: r.total, done: r.done, failed: r.failed,
        error: stalled ? 'stopped responding' : r.error, finished_at: r.finishedAt,
      };
    }
    return out;
  }

  // Runs `fn` for every item, reporting progress at most every 2 seconds.
  async function runJob(userId, source, items, fn) {
    const update = (data) => prisma.enrichJob.update({ where: { userId_source: { userId, source } }, data });
    let done = 0, failed = 0, last = 0;
    try {
      await update({ total: items.length });
      for (const item of items) {
        try {
          await fn(item);
        } catch (err) {
          failed++;
          log.debug({ err, source }, 'enrichment lookup failed');
        }
        done++;
        if (Date.now() - last > 2000) {
          last = Date.now();
          await update({ done, failed });
        }
      }
      await update({ done, failed, status: 'completed', finishedAt: new Date() });
    } catch (err) {
      log.error({ err, source }, 'enrichment job failed');
      await update({ status: 'error', error: String(err.message || err).slice(0, 300), finishedAt: new Date() }).catch(() => {});
    }
  }

  // ---- Deezer: BPM by ISRC ----------------------------------------------------------
  async function runDeezer(userId, tracks) {
    const isrcs = [...new Set(tracks.map((t) => t.isrc).filter(Boolean))];
    const known = new Set((await prisma.deezerTrack.findMany({
      where: { isrc: { in: isrcs }, fetchedAt: { gte: freshSince() } }, select: { isrc: true },
    })).map((r) => r.isrc));
    await runJob(userId, 'deezer', isrcs.filter((i) => !known.has(i)), async (isrc) => {
      const url = `https://api.deezer.com/track/isrc:${encodeURIComponent(isrc)}`;
      let body = await getJson(deezerLimit, url);
      if (body.error?.code === 4) { // quota exceeded: back off once
        await new Promise((r) => setTimeout(r, 5000));
        body = await getJson(deezerLimit, url);
      }
      if (body.error && body.error.code !== 800) throw new Error(`deezer ${body.error.code}`); // 800 = not found
      const bpm = typeof body.bpm === 'number' && body.bpm > 0 ? Math.round(body.bpm * 10) / 10 : null;
      await prisma.deezerTrack.upsert({ where: { isrc }, create: { isrc, bpm }, update: { bpm, fetchedAt: new Date() } });
    });
  }

  // ---- Last.fm: tags and similar artists per artist -----------------------------------
  async function runLastfm(userId, tracks) {
    const names = uniqueArtists(tracks);
    const known = new Set((await prisma.artistInfo.findMany({
      where: { key: { in: names.map(artistKey) }, lastfmAt: { gte: freshSince() } }, select: { key: true },
    })).map((r) => r.key));
    await runJob(userId, 'lastfm', names.filter((n) => !known.has(artistKey(n))), async (name) => {
      const q = (method, extra = {}) => getJson(lastfmLimit, `https://ws.audioscrobbler.com/2.0/?${new URLSearchParams({
        method, artist: name, api_key: lastfmKey, autocorrect: '1', format: 'json', ...extra,
      })}`);
      const [tagsRes, simRes] = [await q('artist.getTopTags'), await q('artist.getSimilar', { limit: '20' })];
      if (tagsRes.error && tagsRes.error !== 6) throw new Error(`lastfm ${tagsRes.error}`); // 6 = not found
      const tags = (tagsRes.toptags?.tag || [])
        .filter((t) => Number(t.count) >= 10).slice(0, 8)
        .map((t) => ({ name: t.name.toLowerCase(), count: Number(t.count) }));
      const similar = (simRes.similarartists?.artist || [])
        .map((a) => ({ name: a.name, match: Math.round(Number(a.match) * 1000) / 1000 }));
      const data = { name, tags, similar, lastfmAt: new Date() };
      await prisma.artistInfo.upsert({ where: { key: artistKey(name) }, create: { key: artistKey(name), ...data }, update: data });
    });
  }

  // ---- MusicBrainz: artist origin, then composers for classical recordings -------------
  async function runMusicbrainz(userId, tracks) {
    const names = uniqueArtists(tracks);
    const known = new Set((await prisma.artistInfo.findMany({
      where: { key: { in: names.map(artistKey) }, mbAt: { gte: freshSince() } }, select: { key: true },
    })).map((r) => r.key));
    const artistItems = names.filter((n) => !known.has(artistKey(n))).map((name) => ({ kind: 'artist', name }));

    // Composer lookups only for recordings by artists Last.fm tags as classical.
    const infos = await prisma.artistInfo.findMany({ where: { key: { in: names.map(artistKey) } }, select: { key: true, tags: true } });
    const classical = new Set(infos.filter((i) => (i.tags || []).some((t) => CLASSICAL_TAGS.some((c) => t.name.includes(c)))).map((i) => i.key));
    const isrcs = [...new Set(tracks.filter((t) => t.isrc && t.artists.some((a) => classical.has(artistKey(a)))).map((t) => t.isrc))];
    const knownWorks = new Set((await prisma.recordingWork.findMany({ where: { isrc: { in: isrcs } }, select: { isrc: true } })).map((r) => r.isrc));
    // All of them in one run (no per-run cap): a cap made the job come back
    // on every sync until the backlog was gone. Origins go first.
    const workItems = isrcs.filter((i) => !knownWorks.has(i)).map((isrc) => ({ kind: 'work', isrc }));

    const composerOfWork = new Map();
    await runJob(userId, 'musicbrainz', [...artistItems, ...workItems], async (item) => {
      if (item.kind === 'artist') return lookupArtist(item.name);
      return lookupWork(item.isrc, composerOfWork);
    });
  }

  async function lookupArtist(name) {
    const body = await getJson(mbLimit, `https://musicbrainz.org/ws/2/artist?${new URLSearchParams({
      query: `artist:"${name.replace(/["\\]/g, '')}"`, limit: '3', fmt: 'json',
    })}`, { 'User-Agent': MB_USER_AGENT });
    const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    const hit = (body.artists || []).find((a) => a.score >= 90 && norm(a.name) === norm(name));
    const begin = hit?.['life-span']?.begin;
    const data = {
      name,
      mbid: hit?.id ?? null,
      country: hit?.country ?? hit?.area?.['iso-3166-1-codes']?.[0] ?? null,
      area: hit?.area?.name ?? null,
      beginYear: begin ? Number(begin.slice(0, 4)) : null,
      mbAt: new Date(),
    };
    await prisma.artistInfo.upsert({ where: { key: artistKey(name) }, create: { key: artistKey(name), ...data }, update: data });
  }

  async function lookupWork(isrc, composerOfWork) {
    const rec = await getJson(mbLimit, `https://musicbrainz.org/ws/2/isrc/${encodeURIComponent(isrc)}?inc=work-rels&fmt=json`, { 'User-Agent': MB_USER_AGENT });
    let work = null;
    for (const r of rec.recordings || []) {
      const rel = (r.relations || []).find((x) => x.type === 'performance' && x.work);
      if (rel) { work = rel.work; break; }
    }
    let composer = null;
    if (work) {
      if (!composerOfWork.has(work.id)) {
        const w = await getJson(mbLimit, `https://musicbrainz.org/ws/2/work/${encodeURIComponent(work.id)}?inc=artist-rels&fmt=json`, { 'User-Agent': MB_USER_AGENT });
        composerOfWork.set(work.id, (w.relations || []).find((x) => x.type === 'composer')?.artist?.name ?? null);
      }
      composer = composerOfWork.get(work.id);
    }
    const data = { work: work?.title ?? null, composer, fetchedAt: new Date() };
    await prisma.recordingWork.upsert({ where: { isrc }, create: { isrc, ...data }, update: data });
  }

  const RUNNERS = { deezer: runDeezer, lastfm: runLastfm, musicbrainz: runMusicbrainz };
  return { start, state };
}

function uniqueArtists(tracks) {
  const byKey = new Map();
  for (const t of tracks) for (const a of t.artists) if (a) byKey.set(artistKey(a), a);
  return [...byKey.values()];
}

// GET with the service's limiter; on HTTP 429/503 waits and retries twice.
async function getJson(limit, url, headers = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await limit(() => fetch(url, { headers: { Accept: 'application/json', ...headers } }));
    if ((res.status === 429 || res.status === 503) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
      continue;
    }
    // Errors that won't change on a retry (not found, a query it can't
    // parse): return the error body, so MusicBrainz finds no match and the
    // result is cached instead of looked up on every run, while Last.fm's
    // error codes still throw. Others (401/403 when a service blocks us)
    // throw and are retried next run, not cached as "nothing found".
    if ([400, 404, 410].includes(res.status)) return res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
    return res.json();
  }
}
