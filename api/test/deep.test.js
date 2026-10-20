import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeItems } from '../src/lib/tracks.js';
import { familyOf, soundMap, tasteEras, musicAtlas, constellation, topTags, classicalCorner } from '../src/lib/deep.js';

const saved = (id, artist, { added = '2016-05-01T10:00:00Z', release = '1994-01-01', isrc = `I${id}` } = {}) => ({
  added_at: added,
  track: {
    type: 'track', id, name: `Song ${id}`, duration_ms: 200_000, explicit: false,
    artists: [{ id: artist.toLowerCase(), name: artist }],
    album: { id: `al-${id}`, name: 'Album', release_date: release, images: [{ url: 'x', width: 300 }] },
    external_ids: { isrc },
  },
});

const tracks = normalizeItems([
  saved('1', 'Dinosaur Jr.'), saved('2', 'Dinosaur Jr.'), saved('3', 'Sebadoh', { added: '2017-01-01T00:00:00Z' }),
  saved('4', 'Bach', { release: '1981-01-01' }),
]);
const artists = new Map([
  ['dinosaur jr.', { tags: [{ name: 'alternative' }, { name: 'grunge' }], similar: [{ name: 'Sebadoh', match: 1 }, { name: 'Pavement', match: 0.6 }], country: 'US', area: 'United States' }],
  ['sebadoh', { tags: [{ name: 'indie rock' }], similar: [{ name: 'Dinosaur Jr.', match: 0.9 }, { name: 'Pavement', match: 0.8 }], country: 'US', area: 'United States' }],
  ['bach', { tags: [{ name: 'classical' }, { name: 'baroque' }], similar: [], country: 'DE', area: 'Germany' }],
]);

test('familyOf maps Last.fm tags to broad families', () => {
  assert.equal(familyOf(artists.get('dinosaur jr.')), 'rock');
  assert.equal(familyOf(artists.get('bach')), 'classical');
  assert.equal(familyOf({ tags: [{ name: 'seen live' }] }), null);
});

test('soundMap only plots songs with a known tempo', () => {
  const m = soundMap(tracks, { bpm: new Map([['I1', 120], ['I4', 80]]), artists, listeners: new Map([['1', 5000]]) });
  assert.equal(m.points.length, 2);
  assert.equal(m.points.find((p) => p.id === '1').listeners, 5000);
  assert.equal(m.coverage.songs, 4);
});

test('tasteEras, musicAtlas and topTags aggregate per like', () => {
  const eras = tasteEras(tracks, artists);
  assert.deepEqual(eras.rows.map((r) => r.year), [2016, 2017]);
  assert.equal(eras.rows[0].counts.rock, 2);
  assert.equal(eras.rows[0].counts.classical, 1);

  const atlas = musicAtlas(tracks, artists);
  assert.equal(atlas.countries[0].country, 'US');
  assert.equal(atlas.countries[0].count, 3);
  assert.equal(topTags(tracks, artists)[0].tag, 'alternative');
});

test('constellation links your artists and suggests shared similar artists', () => {
  const c = constellation(tracks, artists);
  assert.ok(c.links.some((l) => l.source === 'dinosaur jr.' && l.target === 'sebadoh'));
  assert.equal(c.links.filter((l) => !l.ghost).length, 1); // the pair is stored once
  const ghost = c.nodes.find((n) => n.ghost);
  assert.equal(ghost.name, 'Pavement'); // similar to both of your artists
});

test('classicalCorner groups by composer', () => {
  const c = classicalCorner(tracks, new Map([['I4', { composer: 'Johann Sebastian Bach', work: 'Goldberg Variations' }]]));
  assert.equal(c[0].name, 'Johann Sebastian Bach');
  assert.equal(c[0].works[0].title, 'Goldberg Variations');
});
