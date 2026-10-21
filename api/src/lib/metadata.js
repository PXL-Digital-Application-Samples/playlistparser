// Client for the metadata service (../../../metadata): Last.fm listener
// counts, tags and similar artists, Deezer tempo and previews, MusicBrainz
// origins and composers, and the enrichment jobs that fill those caches.
// Every call has a timeout. When the service is down, pages still work: the
// helpers below return "nothing known" and log a warning, except preview(),
// which throws so the route can answer 502.
import { LIKED_ID } from './library.js';

export const SOURCES = ['deezer', 'lastfm', 'musicbrainz'];
// Must match the service's ArtistInfo.key.
export const artistKey = (name) => name.trim().toLowerCase();

export class MetadataError extends Error {
  constructor(status, path) {
    super(`metadata service ${path}: ${status}`);
    this.status = status;
  }
}

export function createMetadata({ url, token, timeoutMs }, { prisma, log }) {
  const base = url.endsWith('/') ? url : `${url}/`; // so a path prefix in the URL is kept
  let statusCache = { value: null, at: 0 };

  async function call(method, path, body, timeout = timeoutMs) {
    const res = await fetch(new URL(path, base), {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) throw new MetadataError(res.status, path);
    return res.json();
  }

  const warn = (err, what) => log.warn({ err: { message: err.message, status: err.status } }, `metadata service: ${what} failed`);

  // Last.fm: ok | not_configured | key_rejected, or unavailable when the
  // service can't be reached. Cached briefly: every playlist page asks.
  async function lastfmStatus() {
    if (Date.now() - statusCache.at < 30_000) return statusCache.value;
    let value;
    try {
      value = (await call('GET', 'status')).lastfm;
    } catch (err) {
      warn(err, 'status');
      value = 'unavailable';
    }
    statusCache = { value, at: Date.now() };
    return value;
  }

  // Cached facts for these recordings (ISRCs), artist names and Spotify track
  // ids: { tempo, artists, listeners, works }, empty lists when unavailable.
  async function lookup({ isrcs = [], artists = [], trackIds = [] }) {
    try {
      return await call('POST', 'lookup', { isrcs, artists, track_ids: trackIds });
    } catch (err) {
      warn(err, 'lookup');
      return { tempo: [], artists: [], listeners: [], works: [] };
    }
  }

  // Last.fm listener counts for normalized tracks. Starts lookups for the
  // ones not cached yet and waits up to waitMs for them. Returns
  // { status, cached: Map<trackId, { listeners, playcount }> }.
  async function listeners(tracks, waitMs = 0) {
    const byId = new Map();
    for (const t of tracks) {
      if (t.id && !t.is_local && t.name && t.artists.length && !byId.has(t.id)) {
        byId.set(t.id, { id: t.id, name: t.name, artist: t.artists[0].name });
      }
    }
    if (!byId.size) return { status: await lastfmStatus(), cached: new Map() };
    try {
      const res = await call('POST', 'listeners', { tracks: [...byId.values()], wait_ms: waitMs }, timeoutMs + waitMs);
      return { status: res.status, cached: new Map(Object.entries(res.listeners)) };
    } catch (err) {
      warn(err, 'listeners');
      return { status: 'unavailable', cached: new Map() };
    }
  }

  // Enrichment progress per source; every source reports an error when the
  // service can't be reached (the frontend then offers to try again).
  async function enrichmentState(userId) {
    try {
      return await call('GET', `enrichment/${encodeURIComponent(userId)}`);
    } catch (err) {
      warn(err, 'enrichment state');
      return unavailableState();
    }
  }

  // Starts enrichment for the user's synced Liked Songs.
  async function startEnrichment(user) {
    const row = await prisma.libraryPlaylist.findUnique({
      where: { userId_playlistId: { userId: user.id, playlistId: LIKED_ID } },
      select: { tracks: true, status: true },
    });
    const tracks = (row?.status === 'ok' ? row.tracks : [])
      .filter((t) => t.id && t.type !== 'episode')
      .map((t) => ({ isrc: t.isrc ?? null, artists: t.artists.map((a) => a.name).filter(Boolean).slice(0, 50) }));
    try {
      return await call('POST', `enrichment/${encodeURIComponent(user.id)}`, { tracks }, Math.max(timeoutMs, 30_000));
    } catch (err) {
      warn(err, 'start enrichment');
      return unavailableState();
    }
  }

  // Deezer preview link for the record player: { status, preview, bpm, ... }.
  async function preview({ isrc, title, artist }) {
    const q = new URLSearchParams();
    if (isrc) q.set('isrc', isrc);
    if (title) q.set('title', title);
    if (artist) q.set('artist', artist);
    return call('GET', `preview?${q}`);
  }

  return { lastfmStatus, lookup, listeners, enrichmentState, startEnrichment, preview };
}

function unavailableState() {
  return Object.fromEntries(SOURCES.map((s) => [s, { status: 'error', error: 'metadata service unavailable' }]));
}

// Popularity summary of a playlist from Last.fm listener counts.
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
