import { formatDuration } from './tracks.js';

const TRACK_COLUMNS = [
  ['Position', (t) => t.position + 1],
  ['Track Name', (t) => t.name],
  ['Artists', (t) => t.artists.map((a) => a.name).join('; ')],
  ['Album', (t) => t.album?.name],
  ['Album Type', (t) => t.album?.album_type],
  ['Release Date', (t) => t.album?.release_date],
  ['Duration (ms)', (t) => t.duration_ms],
  ['Duration (mm:ss)', (t) => formatDuration(t.duration_ms)],
  ['Explicit', (t) => t.explicit],
  ['ISRC', (t) => t.isrc],
  ['Last.fm Listeners', (t, lf) => lf?.get(t.id)?.listeners],
  ['Last.fm Playcount', (t, lf) => lf?.get(t.id)?.playcount],
  ['Track ID', (t) => t.id],
  ['Album ID', (t) => t.album?.id],
  ['Artist IDs', (t) => t.artists.map((a) => a.id).join('; ')],
  ['Added At', (t) => t.added_at],
  ['Added By', (t) => t.added_by],
  ['Is Local', (t) => t.is_local],
  ['Spotify URL', (t) => t.url],
];

const PLAYLIST_COLUMNS = [
  ['Playlist Name', (p) => p.name],
  ['Playlist ID', (p) => p.id],
  ['Playlist Description', (p) => p.description],
  ['Owner', (p) => p.owner?.display_name],
  ['Public', (p) => p.public],
  ['Collaborative', (p) => p.collaborative],
];

export function playlistCsvHeader(withPlaylistColumns) {
  const cols = withPlaylistColumns ? [...PLAYLIST_COLUMNS, ...TRACK_COLUMNS] : TRACK_COLUMNS;
  return cols.map(([h]) => csvField(h)).join(',');
}

// lastfm: optional Map<spotifyTrackId, { listeners, playcount }>
export function playlistCsvRows(tracks, { playlist = null, lastfm = null } = {}) {
  const prefix = playlist ? PLAYLIST_COLUMNS.map(([, get]) => get(playlist)) : [];
  return tracks.map((t) =>
    [...prefix, ...TRACK_COLUMNS.map(([, get]) => get(t, lastfm))].map(csvField).join(',')
  );
}

export function csvField(value) {
  if (value === null || value === undefined) return '';
  let s = String(value);
  // Neutralise spreadsheet formula injection (=, +, -, @, tab, CR at the start).
  if (/^[=+\-@\t\r]/.test(s) && typeof value === 'string') s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function csvFilename(spotifyId, name) {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '').replace('T', '_');
  const clean = (name || 'playlist')
    .replace(/[^a-zA-Z0-9\s\-_]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 50) || 'playlist';
  return `${spotifyId || 'unknown'}_${clean}_${timestamp}.csv`;
}

// UTF-8 BOM so Excel detects the encoding of non-ASCII titles correctly.
export function joinCsv(header, rows) {
  return '﻿' + [header, ...rows].join('\r\n') + '\r\n';
}
