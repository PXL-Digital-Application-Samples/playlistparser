import { endpoints } from './api.js';

// Keeps the playlist list for the session so navigating back to the list is
// instant and the detail page can show the name/cover before its data loads.
let cache = { userId: null, data: null, promise: null };

// Resolves to { liked, items }: `liked` is the user's Liked Songs pseudo-playlist.
export function loadPlaylists(userId, { force = false } = {}) {
  if (cache.userId !== userId) cache = { userId, data: null, promise: null };
  if (cache.data && !force) return Promise.resolve(cache.data);
  if (!cache.promise || force) {
    cache.promise = endpoints.playlists()
      .then((data) => (cache.data = { liked: data.liked ?? null, items: data.items || [] }))
      .finally(() => (cache.promise = null));
  }
  return cache.promise;
}

export function cachedPlaylist(id) {
  if (!cache.data) return null;
  if (cache.data.liked?.id === id) return cache.data.liked;
  return cache.data.items.find((p) => p.id === id) ?? null;
}

export function plural(n, word) {
  return `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
}
