// Last.fm listener/playcount lookups, used as a popularity signal because
// Spotify removed `popularity` in 2026. Results are cached in Postgres so all
// API instances share them. Lookups go through one throttled queue per
// process to respect Last.fm's ~5 requests/second guideline.

const API = 'https://ws.audioscrobbler.com/2.0/';
const REQUEST_SPACING_MS = 250;

export function createLastfm({ apiKey, cacheDays }, prisma, log) {
  const enabled = Boolean(apiKey);
  const queue = [];
  const inFlight = new Map(); // spotifyTrackId -> Promise
  let working = false;
  let keyRejected = false;

  const eligible = (t) => t.id && !t.is_local && t.name && t.artists.length;

  async function getCached(tracks) {
    const ids = [...new Set(tracks.filter(eligible).map((t) => t.id))];
    if (!ids.length) return new Map();
    const since = new Date(Date.now() - cacheDays * 86_400_000);
    const rows = await prisma.lastfmTrack.findMany({
      where: { spotifyTrackId: { in: ids }, fetchedAt: { gte: since } },
    });
    return new Map(rows.map((r) => [r.spotifyTrackId, { listeners: r.listeners, playcount: r.playcount }]));
  }

  // Queue lookups for tracks that aren't cached yet. Returns a promise that
  // resolves once all of them have been looked up.
  async function request(tracks) {
    if (!enabled || keyRejected) return;
    const cached = await getCached(tracks);
    const waits = [];
    const seen = new Set();
    const fresh = [];
    for (const t of tracks) {
      if (!eligible(t) || cached.has(t.id) || seen.has(t.id)) continue;
      seen.add(t.id);
      if (!inFlight.has(t.id)) {
        const p = new Promise((resolve) => fresh.push({ track: t, resolve }))
          .finally(() => inFlight.delete(t.id));
        inFlight.set(t.id, p);
      }
      waits.push(inFlight.get(t.id));
    }
    // Newest request first: the playlist someone is looking at right now
    // shouldn't wait behind a large library that's being filled in.
    queue.unshift(...fresh);
    work();
    await Promise.all(waits);
  }

  async function work() {
    if (working) return;
    working = true;
    try {
      while (queue.length) {
        const job = queue.shift();
        if (keyRejected) { job.resolve(); continue; }
        try {
          const result = await lookup(job.track);
          if (result !== undefined) {
            await prisma.lastfmTrack.upsert({
              where: { spotifyTrackId: job.track.id },
              create: { spotifyTrackId: job.track.id, ...result, fetchedAt: new Date() },
              update: { ...result, fetchedAt: new Date() },
            });
          }
        } catch (err) {
          log.warn({ err, trackId: job.track.id }, 'last.fm lookup failed');
        }
        job.resolve();
        await sleep(REQUEST_SPACING_MS);
      }
    } finally {
      working = false;
    }
  }

  // Returns { listeners, playcount } (nulls when unknown) or undefined when
  // the lookup failed and shouldn't be cached.
  async function lookup(track) {
    const artist = track.artists[0].name;
    let res = await call(artist, track.name);
    if (res === null && / - /.test(track.name)) {
      // "Song - Remastered 2011" style names: retry with the base title.
      await sleep(REQUEST_SPACING_MS);
      res = await call(artist, track.name.split(' - ')[0]);
    }
    return res === null ? { listeners: null, playcount: null } : res;
  }

  async function call(artist, title) {
    const params = new URLSearchParams({
      method: 'track.getInfo', api_key: apiKey, artist, track: title, autocorrect: '1', format: 'json',
    });
    const res = await fetch(`${API}?${params}`, { headers: { 'User-Agent': 'playlistparser/1.0' } });
    const body = await res.json().catch(() => ({}));
    if (body.error === 6) return null; // track not found
    if (body.error === 10 || body.error === 26) {
      keyRejected = true;
      log.error(`LASTFM_API_KEY was rejected by Last.fm (${body.message}); listener stats disabled until restart`);
      return undefined;
    }
    if (body.error === 29) {
      await sleep(5000); // rate limited; skip for now, a later request retries it
      return undefined;
    }
    if (!res.ok || body.error || !body.track) return undefined;
    return { listeners: toInt(body.track.listeners), playcount: toInt(body.track.playcount) };
  }

  // One lookup at startup so a wrong key is reported immediately, not on the
  // first playlist someone opens. Network failures are not treated as fatal.
  async function verify() {
    if (!enabled) return;
    try {
      const result = await call('Radiohead', 'Creep');
      if (result) log.info('last.fm API key verified');
    } catch (err) {
      log.warn({ err }, 'could not reach last.fm to verify the API key');
    }
  }

  return {
    get enabled() { return enabled && !keyRejected; },
    // not_configured | key_rejected | ok
    get status() { return !enabled ? 'not_configured' : keyRejected ? 'key_rejected' : 'ok'; },
    verify,
    getCached,
    request,
    pending: () => queue.length,
  };
}

function toInt(v) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function summarizeListeners(tracks, cached) {
  const rows = tracks
    .filter((t) => t.id && cached.has(t.id) && cached.get(t.id).listeners !== null)
    .map((t) => ({ id: t.id, name: t.name, artists: t.artists, ...cached.get(t.id) }));
  const uniq = [...new Map(rows.map((r) => [r.id, r])).values()];
  const sorted = [...uniq].sort((a, b) => b.listeners - a.listeners);
  const listeners = sorted.map((r) => r.listeners);
  return {
    matched: uniq.length,
    by_track: Object.fromEntries(uniq.map((r) => [r.id, { listeners: r.listeners, playcount: r.playcount }])),
    avg_listeners: listeners.length ? Math.round(listeners.reduce((a, b) => a + b, 0) / listeners.length) : null,
    median_listeners: listeners.length ? listeners[Math.floor(listeners.length / 2)] : null,
    most_listened: sorted.slice(0, 5),
    hidden_gems: sorted.slice(-5).reverse(),
  };
}
