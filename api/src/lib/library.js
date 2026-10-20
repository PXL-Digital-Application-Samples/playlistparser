import { normalizeItems } from './tracks.js';

// "Liked Songs" is not a real playlist in the Web API; it's the user's saved
// tracks (GET /me/tracks, scope user-library-read). We expose it under the
// reserved id "liked", which can't collide with 22-character Spotify ids.
export const LIKED_ID = 'liked';

const MEMO_TTL_MS = 30_000;

export function likedInfo(user) {
  return {
    id: LIKED_ID,
    name: 'Liked Songs',
    description: null,
    owner: { id: user.spotifyId, display_name: user.displayName },
    public: false,
    collaborative: false,
    image: null,
    url: 'https://open.spotify.com/collection/tracks',
    liked: true,
  };
}

// Smallest image that is still at least ~120px wide; Spotify lists largest first.
export function pickImage(images) {
  if (!images?.length) return null;
  const ok = images.filter((i) => !i.width || i.width >= 120);
  return (ok.length ? ok[ok.length - 1] : images[0]).url;
}

export function isAnalyzable(p, spotifyUserId) {
  return p.owner?.id === spotifyUserId || Boolean(p.collaborative);
}

// Loads playlists (or Liked Songs) with a short-lived per-user memo, so the
// playlist page's parallel requests and the Insights page share one fetch.
export function createLibrary(spotify) {
  const memo = new Map();

  function memoize(key, fn) {
    const hit = memo.get(key);
    if (hit && hit.expires > Date.now()) return hit.promise;
    const promise = fn();
    memo.set(key, { promise, expires: Date.now() + MEMO_TTL_MS });
    promise.catch(() => memo.delete(key));
    if (memo.size > 1000) {
      for (const [k, v] of memo) if (v.expires <= Date.now()) memo.delete(k);
    }
    return promise;
  }

  // market=from_token makes Spotify include is_playable for every track.
  function load(user, id, accessToken, { playability = false } = {}) {
    const market = playability ? '&market=from_token' : '';
    return memoize(`${user.id}:${id}:${playability}`, () =>
      id === LIKED_ID ? fetchLiked(user, accessToken, market) : fetchPlaylist(id, accessToken, market)
    );
  }

  async function fetchPlaylist(id, accessToken, market) {
    const [info, items] = await Promise.all([
      spotify.get(`/playlists/${id}`, accessToken),
      spotify.getAllPaged(`/playlists/${id}/items?limit=50&additional_types=track,episode${market}`, accessToken),
    ]);
    return {
      info: {
        id: info.id,
        name: info.name,
        description: info.description || null,
        owner: { id: info.owner?.id ?? null, display_name: info.owner?.display_name ?? null },
        public: info.public ?? null,
        collaborative: Boolean(info.collaborative),
        image: pickImage(info.images),
        url: info.external_urls?.spotify ?? null,
      },
      tracks: normalizeItems(items),
    };
  }

  async function fetchLiked(user, accessToken, market) {
    const items = await spotify.getAllPaged(`/me/tracks?limit=50${market}`, accessToken);
    return { info: likedInfo(user), tracks: normalizeItems(items) };
  }

  // The user's playlists (owned + followed), memoized like the rest.
  function playlists(user, accessToken) {
    return memoize(`${user.id}:__playlists`, () => spotify.getAll('/me/playlists?limit=50', accessToken));
  }

  return { load, playlists };
}
