import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeItems } from '../src/lib/tracks.js';
import {
  likeCalendar, libraryOverTime, musicAge, artistDepth, followGap, likedOverlap, findUnplayable,
} from '../src/lib/insights.js';

const saved = (id, { added = '2015-03-10T10:00:00Z', release = '1999-05-01', artist = 'A', artistId = 'a', ms = 200_000, explicit = false, album = 'al1', total = 4, playable } = {}) => ({
  added_at: added,
  track: {
    type: 'track', id, name: `Song ${id}`, duration_ms: ms, explicit,
    artists: [{ id: artistId, name: artist }],
    album: { id: album, name: `Album ${album}`, release_date: release, album_type: 'album', total_tracks: total },
    ...(playable === undefined ? {} : { is_playable: playable }),
  },
});

const liked = normalizeItems([
  saved('t1'),
  saved('t2', { added: '2015-03-10T20:00:00Z' }),
  saved('t3', { added: '2015-05-01T00:00:00Z', release: '2015-01-01', explicit: true }),
  saved('t4', { added: '2016-01-02T00:00:00Z', artist: 'B', artistId: 'b', ms: 700_000, album: 'al2', total: 10 }),
]);

test('likeCalendar counts per day and finds the busiest one', () => {
  const c = likeCalendar(liked);
  assert.equal(c.byDate['2015-03-10'], 2);
  assert.deepEqual(c.years, [2015, 2016]);
  assert.deepEqual(c.busiest_day, { date: '2015-03-10', count: 2 });
});

test('libraryOverTime fills month gaps and keeps a running total', () => {
  const o = libraryOverTime(liked);
  assert.equal(o.months[0].month, '2015-03');
  assert.equal(o.months.at(-1).month, '2016-01');
  assert.equal(o.months.length, 11);
  assert.equal(o.months.at(-1).cumulative, 4);
  assert.equal(o.eras[0].artists[0].name, 'A');
});

test('musicAge buckets ages and lengths', () => {
  const a = musicAge(liked);
  assert.equal(a.age_buckets.find((b) => b.label === 'Same year').count, 1);
  assert.equal(a.age_buckets.find((b) => b.label === '11–20 years').count, 3);
  assert.equal(a.length_buckets.find((b) => b.label === '10+ min').count, 1);
  assert.equal(a.oldest_when_liked.track.id, 't4');
});

test('artistDepth and complete albums', () => {
  const d = artistDepth(liked);
  assert.equal(d.artists_total, 2);
  assert.equal(d.deepest[0].name, 'A');
  assert.equal(d.complete_albums.length, 0); // 3 of 4 tracks = 75%, below the 80% bar
  const full = artistDepth(normalizeItems([saved('x1'), saved('x2'), saved('x3'), saved('x4')]));
  assert.equal(full.complete_albums[0].pct, 100);
});

test('followGap finds followed-but-never-liked and loved-but-not-followed', () => {
  const many = normalizeItems(Array.from({ length: 5 }, (_, i) => saved(`b${i}`, { artist: 'B', artistId: 'b' })));
  const g = followGap([{ id: 'z', name: 'Z' }, { id: 'a', name: 'A' }], [...liked, ...many]);
  assert.deepEqual(g.followed_never_liked.map((a) => a.id), ['z']);
  assert.deepEqual(g.loved_not_followed.map((a) => a.id), ['b']);
});

test('likedOverlap and findUnplayable', () => {
  const pl = { info: { id: 'p1', name: 'P1' }, tracks: normalizeItems([saved('t1'), saved('zz')]) };
  const o = likedOverlap(liked, [pl]);
  assert.equal(o.liked_in_no_playlist, 3);
  assert.equal(o.playlists[0].pct, 50);

  const u = findUnplayable([{ info: { id: 'liked', name: 'Liked Songs' }, tracks: normalizeItems([saved('q', { playable: false }), saved('r', { playable: true })]) }]);
  assert.equal(u.total, 1);
  assert.equal(u.tracks[0].track.id, 'q');
});

test('splitLikes treats 5+ songs from one album in the same minute as one album save', async () => {
  const { splitLikes, artistDepth, tasteProfile } = await import('../src/lib/insights.js');
  const albumSave = normalizeItems(Array.from({ length: 6 }, (_, i) =>
    saved(`bach${i}`, { added: '2015-11-15T10:00:00Z', artist: 'Bach', artistId: 'bach', album: 'goldberg', total: 6 })));
  const picked = normalizeItems([saved('p1', { artist: 'Weezer', artistId: 'w' }), saved('p2', { artist: 'Weezer', artistId: 'w', added: '2016-02-01T00:00:00Z' })])
    .map((t, i) => ({ ...t, position: 100 + i }));
  const all = [...albumSave, ...picked];

  const split = splitLikes(all);
  assert.equal(split.handpicked.length, 2);
  assert.equal(split.bulkGroups.length, 1);
  assert.equal(split.bulkGroups[0].tracks, 6);
  assert.equal(split.events.length, 3);

  // Counted per track, Bach dominates; counted per like event, Weezer leads.
  assert.equal(artistDepth(all).deepest[0].name, 'Bach');
  assert.equal(artistDepth(all, split.events).deepest[0].name, 'Weezer');

  const p = tasteProfile(split.handpicked);
  assert.equal(p.songs, 2);
  assert.equal(p.decades.find((d) => d.decade === '1990s').share, 1);
});
