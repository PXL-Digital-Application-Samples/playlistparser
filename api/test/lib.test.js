import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, parseTrustProxy } from '../src/lib/config.js';
import { csvField, playlistCsvRows, playlistCsvHeader } from '../src/lib/csv.js';
import { normalizeItems, computeStats, findDuplicates, parseReleaseDate } from '../src/lib/tracks.js';
import { createTokenCipher } from '../src/lib/crypto.js';

const baseEnv = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  SESSION_SECRET: 'x'.repeat(32),
  TOKEN_ENC_KEY: 'a'.repeat(64),
  SPOTIFY_CLIENT_ID: 'id',
  SPOTIFY_CLIENT_SECRET: 'secret',
  SPOTIFY_REDIRECT_URI: 'http://127.0.0.1:3000/auth/callback',
  METADATA_URL: 'http://127.0.0.1:3001',
  METADATA_TOKEN: 't'.repeat(32),
};

test('config: local defaults', () => {
  const c = loadConfig(baseEnv);
  assert.equal(c.basePath, '');
  assert.deepEqual(c.corsOrigins, ['http://127.0.0.1:5173']);
  assert.equal(c.cookie.sameSite, 'lax');
  assert.equal(c.cookie.secure, false);
  assert.equal(c.trustProxy, false);
});

test('config: rejects SameSite=None without Secure', () => {
  assert.throws(() => loadConfig({ ...baseEnv, COOKIE_SAMESITE: 'none' }), /requires COOKIE_SECURE=true/);
});

test('config: redirect URI must match API_BASE_PATH', () => {
  assert.throws(() => loadConfig({ ...baseEnv, API_BASE_PATH: '/api' }), /must end with "\/api\/auth\/callback"/);
  const c = loadConfig({
    ...baseEnv, API_BASE_PATH: '/api/', SPOTIFY_REDIRECT_URI: 'https://x.example/api/auth/callback',
  });
  assert.equal(c.basePath, '/api');
});

test('config: reports every missing variable at once', () => {
  try {
    loadConfig({});
    assert.fail('should throw');
  } catch (err) {
    assert.ok(err.configErrors.length >= 6);
  }
});

test('config: metadata service URL and token are checked', () => {
  assert.throws(() => loadConfig({ ...baseEnv, METADATA_URL: 'metadata:3001' }), /METADATA_URL/);
  assert.throws(() => loadConfig({ ...baseEnv, METADATA_TOKEN: 'short' }), /METADATA_TOKEN must be at least 32/);
  assert.equal(loadConfig(baseEnv).metadata.timeoutMs, 10_000);
});

test('config: CORS origins must be bare origins and not *', () => {
  assert.throws(() => loadConfig({ ...baseEnv, CORS_ORIGINS: '*' }), /cannot be "\*"/);
  assert.throws(() => loadConfig({ ...baseEnv, CORS_ORIGINS: 'https://a.example/app' }), /without a path/);
});

test('parseTrustProxy', () => {
  assert.equal(parseTrustProxy(undefined), false);
  assert.equal(parseTrustProxy('true'), true);
  assert.equal(parseTrustProxy('2'), 2);
  assert.deepEqual(parseTrustProxy('10.0.0.0/16, 127.0.0.1'), ['10.0.0.0/16', '127.0.0.1']);
});

test('csvField escapes quotes, commas and formula injection', () => {
  assert.equal(csvField('a,b'), '"a,b"');
  assert.equal(csvField('say "hi"'), '"say ""hi"""');
  assert.equal(csvField('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvField(-5), '-5');
  assert.equal(csvField(null), '');
});

const item = (id, name, extra = {}) => ({
  added_at: '2024-05-01T10:00:00Z',
  added_by: { id: 'me' },
  is_local: false,
  item: {
    type: 'track', id, name, duration_ms: 200_000, explicit: false,
    artists: [{ id: 'a1', name: 'Artist' }],
    album: { id: 'al1', name: 'Album', release_date: '1999-05', album_type: 'album' },
    external_ids: { isrc: `ISRC-${id}` },
    ...extra,
  },
});

test('normalizeItems accepts both item (2026) and track (legacy)', () => {
  const legacy = { track: item('t1', 'One').item, added_at: null };
  const [a, b] = normalizeItems([item('t1', 'One'), legacy]);
  assert.equal(a.name, 'One');
  assert.equal(b.name, 'One');
  assert.equal(a.isrc, 'ISRC-t1');
});

test('normalizeItems keeps the saved song id when Spotify relinks it', () => {
  const relinked = item('playable-id', 'One');
  relinked.item.linked_from = { id: 'saved-id', type: 'track' };
  assert.equal(normalizeItems([relinked])[0].id, 'saved-id');
});

test('computeStats and findDuplicates', () => {
  const tracks = normalizeItems([
    item('t1', 'One'),
    item('t2', 'Two', { explicit: true, duration_ms: 100_000 }),
    item('t1', 'One'),
    item('t3', 'One (single)', { external_ids: { isrc: 'ISRC-t1' } }),
  ]);
  const s = computeStats(tracks);
  assert.equal(s.tracks_total, 4);
  assert.equal(s.tracks_unique, 3);
  assert.equal(s.explicit.pct, 25);
  assert.deepEqual(s.decades, [{ decade: '1990s', count: 4 }]);
  assert.equal(s.duration.shortest.id, 't2');

  const d = findDuplicates(tracks);
  assert.equal(d.duplicates, 1);
  assert.equal(d.same_recording, 1);
  assert.equal(d.same_recording_sample[0].first_position, 0);
});

test('csv rows include Last.fm columns from cache', () => {
  const tracks = normalizeItems([item('t1', 'One')]);
  const lf = new Map([['t1', { listeners: 42, playcount: 99 }]]);
  const header = playlistCsvHeader(false).split(',');
  const row = playlistCsvRows(tracks, { lastfm: lf })[0].split(',');
  assert.equal(row[header.indexOf('Last.fm Listeners')], '42');
});

test('parseReleaseDate handles year/month/day precision', () => {
  assert.equal(parseReleaseDate('1999').toISOString().slice(0, 10), '1999-01-01');
  assert.equal(parseReleaseDate('1999-05').toISOString().slice(0, 10), '1999-05-01');
  assert.equal(parseReleaseDate('garbage'), null);
});

test('token cipher round-trips', () => {
  const c = createTokenCipher('b'.repeat(64));
  assert.equal(c.decrypt(c.encrypt('refresh-token')), 'refresh-token');
});
