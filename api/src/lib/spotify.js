// Minimal read-only Spotify Web API client (uses Node's built-in fetch).

const API = 'https://api.spotify.com/v1';
const ACCOUNTS = 'https://accounts.spotify.com';
const MAX_RETRIES = 2;
const MAX_RETRY_WAIT_MS = 10_000;

// All read-only. Adding a scope means existing users must log in again.
export const SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-top-read',
  'user-read-recently-played',
  'user-follow-read',
];
const PAGE_CONCURRENCY = 4;

export class SpotifyError extends Error {
  constructor(status, message, retryAfter = null) {
    super(message);
    this.name = 'SpotifyError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function createSpotify({ clientId, clientSecret, redirectUri }) {
  const basicAuth = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  async function tokenRequest(params) {
    const res = await fetch(`${ACCOUNTS}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: basicAuth },
      body: new URLSearchParams(params),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new SpotifyError(res.status, `token request failed: ${body.error || res.status}`);
    }
    return body;
  }

  async function get(pathOrUrl, accessToken) {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${API}${pathOrUrl}`;
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (res.ok) return res.json();

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after') || 1);
        const waitMs = retryAfter * 1000;
        if (attempt < MAX_RETRIES && waitMs <= MAX_RETRY_WAIT_MS) {
          await new Promise((r) => setTimeout(r, waitMs * (attempt + 1)));
          continue;
        }
        throw new SpotifyError(429, 'rate limited by Spotify', retryAfter);
      }
      const text = await res.text().catch(() => '');
      throw new SpotifyError(res.status, `GET ${url} -> ${res.status} ${text.slice(0, 200)}`);
    }
  }

  // Follows `next` links until every page has been collected.
  async function getAll(path, accessToken) {
    const out = [];
    let url = path;
    while (url) {
      const page = await get(url, accessToken);
      out.push(...(page.items || []));
      url = page.next;
    }
    return out;
  }

  // Like getAll, but once the first page reveals `total`, fetches the remaining
  // pages a few at a time by offset. Much faster for large lists (Liked Songs).
  async function getAllPaged(path, accessToken) {
    const first = await get(path, accessToken);
    const items = [...(first.items || [])];
    const limit = first.limit || items.length;
    const total = first.total ?? items.length;
    if (!first.next || !limit || items.length >= total) return items;

    const offsets = [];
    for (let o = (first.offset || 0) + limit; o < total; o += limit) offsets.push(o);
    const pages = new Array(offsets.length);
    let next = 0;
    const worker = async () => {
      while (next < offsets.length) {
        const k = next++;
        const url = new URL(path.startsWith('http') ? path : `${API}${path}`);
        url.searchParams.set('offset', String(offsets[k]));
        url.searchParams.set('limit', String(limit));
        pages[k] = (await get(url.href, accessToken)).items || [];
      }
    };
    await Promise.all(Array.from({ length: Math.min(PAGE_CONCURRENCY, offsets.length) }, worker));
    return items.concat(...pages);
  }

  return {
    authorizeUrl(state) {
      const p = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: SCOPES.join(' '),
        state,
      });
      return `${ACCOUNTS}/authorize?${p}`;
    },
    exchangeCode: (code) =>
      tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    refresh: (refreshToken) =>
      tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    get,
    getAll,
    getAllPaged,
  };
}
