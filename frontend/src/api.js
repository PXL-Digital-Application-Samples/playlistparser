// Base URL of the API, fixed at build time (`VITE_API_BASE_URL`).
// Empty means "same origin as the frontend".
const BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

// Link to a song/album/artist/show on Spotify (opens the app when installed).
export function spotifyUrl(type, id) {
  return id ? `https://open.spotify.com/${type}/${encodeURIComponent(id)}` : undefined;
}

export class ApiError extends Error {
  constructor(status, code) {
    super(code || `HTTP ${status}`);
    this.status = status;
    this.code = code;
  }
}

async function request(method, path) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
    body: method === 'POST' ? '{}' : undefined,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body?.error);
  return body;
}

const get = (path) => request('GET', path);
const post = (path) => request('POST', path);
const enc = encodeURIComponent;

export const endpoints = {
  loginUrl: () => `${BASE}/auth/login`,
  logout: () => post('/auth/logout'),
  me: () => get('/me'),
  playlists: () => get('/me/playlists'),
  playlistContents: (id) => get(`/playlists/${enc(id)}/contents`),
  playlistStats: (id) => get(`/playlists/${enc(id)}/stats`),
  playlistListeners: (id) => get(`/playlists/${enc(id)}/listeners`),
  simulateDedupe: (id) => get(`/playlists/${enc(id)}/simulate-dedupe`),
  simulateMerge: (a, b) => get(`/simulate-merge?a=${enc(a)}&b=${enc(b)}`),
  exportPlaylistUrl: (id) => `${BASE}/playlists/${enc(id)}/export`,
  startExportAll: () => post('/playlists/export-all'),
  getExportProgress: (jobId) => get(`/playlists/export-progress/${enc(jobId)}`),
  downloadExportUrl: (jobId) => `${BASE}/playlists/download/${enc(jobId)}`,
  insightsSummary: () => get('/insights/summary'),
  insightsCollection: () => get('/insights/collection'),
  insightsOverlap: () => get('/insights/overlap'),
  insightsUnplayable: () => get('/insights/unplayable'),
  librarySyncState: () => get('/library/sync'),
  startLibrarySync: () => post('/library/sync'),
};

// Human-readable messages for API error codes.
export function describeError(err) {
  const messages = {
    reauth_required: 'Your Spotify session expired. Please log in again.',
    unauthorized: 'Please log in with Spotify.',
    playlist_not_accessible:
      'Spotify only allows reading playlists you own or collaborate on.',
    rate_limited: 'Spotify is rate limiting requests. Try again in a moment.',
    spotify_failed: 'Spotify returned an error. Try again later.',
    not_found: 'Playlist not found.',
  };
  if (err instanceof TypeError) return 'Cannot reach the API. Is it running, and is VITE_API_BASE_URL correct?';
  return messages[err?.code] || err?.message || 'Something went wrong.';
}
