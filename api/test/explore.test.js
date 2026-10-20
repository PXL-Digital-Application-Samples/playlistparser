import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeItems } from '../src/lib/tracks.js';
import {
  libraryOverview, crossPlaylistDuplicates, artistView, albumView, compareTracks, libraryArtistIds,
} from '../src/lib/explore.js';

const item = (id, { artist = 'A', artistId = 'a', album = 'al1', isrc = `isrc-${id}`, added = '2020-01-01T10:00:00Z', ms = 200_000, playable } = {}) => ({
  added_at: added,
  track: {
    type: 'track', id, name: `Song ${id}`, duration_ms: ms, explicit: false,
    artists: [{ id: artistId, name: artist }],
    album: { id: album, name: `Album ${album}`, release_date: '2001-01-01', album_type: 'album', total_tracks: 10, images: [{ url: `img-${album}`, width: 300 }] },
    external_ids: { isrc },
    ...(playable === undefined ? {} : { is_playable: playable }),
  },
});
const source = (id, name, items, syncedAt = '2026-01-01T00:00:00Z') => ({
  info: { id, name, image: null }, tracks: normalizeItems(items), synced_at: new Date(syncedAt),
});

const liked = source('liked', 'Liked Songs', [
  item('t1', { added: '2019-05-01T00:00:00Z' }),
  item('t2', { added: '2021-03-01T00:00:00Z' }),
  item('t5', { artist: 'B', artistId: 'b', album: 'al2' }),
]);
// p1 was synced earlier but had a song added more recently than p2.
const p1 = source('p1', 'Road trip', [item('t1'), item('t3', { playable: false, added: '2024-06-01T00:00:00Z' }), item('t4', { artist: 'B', artistId: 'b', album: 'al2' })], '2025-01-01T00:00:00Z');
// t1b: a different release of t1 (same ISRC) - the same song for duplicates.
const p2 = source('p2', 'Focus', [item('t1b', { isrc: 'isrc-t1' }), item('t4', { artist: 'B', artistId: 'b', album: 'al2' })]);
const library = [liked, p1, p2];

test('libraryOverview totals and health counts', () => {
  const o = libraryOverview(library);
  assert.equal(o.totals.playlists, 2);
  assert.equal(o.totals.songs, 6); // t1, t2, t5, t3, t4, t1b
  assert.equal(o.totals.liked, 3);
  assert.equal(o.totals.artists, 2);
  assert.equal(o.health.duplicates, 2); // t1 (two versions) and t4
  assert.equal(o.health.unplayable, 1);
  assert.equal(o.health.liked_in_no_playlist, 2); // t2 and t5
  assert.equal(o.recent_playlists[0].id, 'p1'); // newest addition wins, not the latest sync
  assert.equal(o.recent_playlists[0].last_added, '2024-06-01T00:00:00Z');
});

test('crossPlaylistDuplicates groups versions by ISRC and flags liked songs', () => {
  const d = crossPlaylistDuplicates(library);
  assert.equal(d.total, 2);
  const t1 = d.songs.find((s) => s.track.id === 't1');
  assert.equal(t1.versions, 2);
  assert.equal(t1.liked, true);
  assert.deepEqual(t1.playlists.map((p) => p.id), ['p1', 'p2']);
  assert.equal(d.songs.find((s) => s.track.id === 't4').liked, false);
});

test('artistView collects songs, likes per year, playlists and similar artists', () => {
  const ids = libraryArtistIds(library);
  const v = artistView(library, 'a', {
    libraryArtists: ids,
    info: { name: 'A', tags: [{ name: '2022' }, { name: 'indie' }, { name: 'seen live' }], similar: [{ name: 'B', match: 0.8 }, { name: 'Zed', match: 0.5 }], country: 'BE', area: 'Belgium' },
  });
  assert.equal(v.name, 'A');
  assert.deepEqual(v.counts, { songs: 4, liked: 2, playlists: 2, albums: 1 });
  assert.deepEqual(v.likes_by_year, [{ year: 2019, count: 1 }, { year: 2020, count: 0 }, { year: 2021, count: 1 }]);
  assert.equal(v.first_liked, '2019-05-01T00:00:00Z');
  assert.equal(v.songs[0].id, 't1'); // liked and in a playlist ranks first
  assert.deepEqual(v.similar.map((s) => [s.name, s.id]), [['B', 'b'], ['Zed', null]]);
  assert.equal(v.origin.area, 'Belgium');
  assert.deepEqual(v.tags, ['indie']); // bare years and 'seen live' are left out
});

test('albumView counts liked songs and playlists', () => {
  const v = albumView(library, 'al2');
  assert.equal(v.name, 'Album al2');
  assert.deepEqual(v.counts, { songs: 2, liked: 1, playlists: 2 });
  assert.equal(v.artists[0].name, 'B');
});

test('compareTracks splits two playlists into only-A, both and only-B', () => {
  const c = compareTracks(p1.tracks, p2.tracks);
  assert.deepEqual(c.counts, { only_a: 2, both: 1, only_b: 1 });
  assert.equal(c.both[0].id, 't4');
  assert.equal(c.only_b[0].id, 't1b');
});
