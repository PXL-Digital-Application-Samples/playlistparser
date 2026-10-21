import { limiter } from '../lib/ratelimit.js';

// 30-second song previews for the in-app record player, from Deezer (no key
// needed). Spotify no longer offers previews. The browser can't call
// Deezer's API itself (no CORS headers), but the preview MP3s allow it, so
// the API looks up the link and the browser plays and analyses the audio.
// Preview links are signed and expire, so results are cached briefly only.
const deezer = limiter('deezer', 8);
const CACHE_MS = 5 * 60_000;
const ISRC = /^[A-Z0-9]{8,15}$/i;

export default async function previewRoutes(fastify) {
  const cache = new Map();

  async function getJson(url) {
    const res = await deezer(() => fetch(url, { headers: { Accept: 'application/json' } }));
    if (!res.ok) throw new Error(`deezer ${res.status}`);
    return res.json();
  }

  async function lookup({ isrc, title, artist }) {
    let track = null;
    if (isrc) {
      const t = await getJson(`https://api.deezer.com/track/isrc:${encodeURIComponent(isrc)}`);
      if (!t.error && t.preview) track = t;
    }
    if (!track && title) {
      // Deezer's field syntax (artist:"…" track:"…") often finds nothing; a
      // plain search does, so search plainly and pick the best match.
      // `artist` may list several artists ("A, B") or be one name with a
      // comma ("Tyler, The Creator"): search with all of it and accept a hit
      // whose artist appears in it.
      const s = await getJson(`https://api.deezer.com/search?${new URLSearchParams({ q: `${artist} ${title}`, limit: '5' })}`);
      const norm = (x) => String(x || '').toLowerCase().replace(/\(.*?\)|\[.*?\]| - .*$/g, '').replace(/[^\p{L}\p{N}]+/gu, '');
      const hits = (s.data || []).filter((h) => h.preview);
      const ours = norm(artist);
      const hit = hits.find((h) => norm(h.title) === norm(title) && norm(h.artist?.name) && ours.includes(norm(h.artist.name)))
        ?? hits.find((h) => norm(h.title) === norm(title))
        ?? hits[0];
      // Search results don't include the tempo; the track itself does.
      if (hit?.preview) track = await getJson(`https://api.deezer.com/track/${hit.id}`).catch(() => hit);
    }
    if (!track?.preview) return { status: 'none' };
    return {
      status: 'ok',
      preview: track.preview,
      bpm: typeof track.bpm === 'number' && track.bpm > 0 ? track.bpm : null,
      title: track.title ?? null,
      artist: track.artist?.name ?? null,
    };
  }

  fastify.get('/preview', { preHandler: fastify.requireUser }, async (req, reply) => {
    const isrc = ISRC.test(req.query.isrc || '') ? req.query.isrc.toUpperCase() : null;
    const title = String(req.query.title || '').slice(0, 200).trim();
    const artist = String(req.query.artist || '').slice(0, 200).trim();
    if (!isrc && !title) return reply.code(400).send({ error: 'isrc_or_title_required' });

    const key = `${isrc}|${title.toLowerCase()}|${artist.toLowerCase()}`;
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
    try {
      const value = await lookup({ isrc, title, artist });
      cache.set(key, { value, expires: Date.now() + CACHE_MS });
      if (cache.size > 2000) for (const [k, v] of cache) if (v.expires <= Date.now()) cache.delete(k);
      return value;
    } catch (err) {
      req.log.warn({ err }, 'preview lookup failed');
      return reply.code(502).send({ error: 'preview_unavailable' });
    }
  });
}
