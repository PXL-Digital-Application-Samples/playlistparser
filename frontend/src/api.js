const BASE = import.meta.env.VITE_API_BASE_URL;

export async function apiGet(path) {
  const res = await fetch(`${BASE}${path}`, { credentials: 'include' });
  console.log(`API call to ${path}:`, {
    url: `${BASE}${path}`,
    status: res.status,
    ok: res.ok,
    headers: Object.fromEntries(res.headers.entries())
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data = await res.json();
  console.log(`API response for ${path}:`, data);
  return data;
}

export const endpoints = {
  login: () => `${BASE}/auth/login`,
  me: () => apiGet('/me'),
  playlists: () => apiGet('/me/playlists'),
  playlistContents: (id) => apiGet(`/playlists/${id}/contents`),
  playlistStats: (id) => apiGet(`/playlists/${id}/stats`),
  simulateDedupe: (id) => apiGet(`/playlists/${id}/simulate-dedupe`),
  simulateMerge: (a, b) => apiGet(`/simulate-merge?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`),
  exportPlaylist: (id) => `${BASE}/playlists/${id}/export`
};
