import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

const baseEnv = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db?schema=metadata',
  METADATA_TOKEN: 't'.repeat(32),
};

test('config: defaults and the schema from DATABASE_URL', () => {
  const c = loadConfig(baseEnv);
  assert.equal(c.port, 3001);
  assert.equal(c.host, '127.0.0.1');
  assert.equal(c.dbSchema, 'metadata');
  assert.equal(c.lastfm.apiKey, null);
  assert.equal(c.lastfm.cacheDays, 30);
  assert.equal(loadConfig({ ...baseEnv, DATABASE_URL: 'postgres://u:p@h/db' }).dbSchema, undefined);
});

test('config: token and database URL are required', () => {
  try {
    loadConfig({});
    assert.fail('should throw');
  } catch (err) {
    assert.deepEqual(err.configErrors, ['METADATA_TOKEN is required', 'DATABASE_URL is required']);
  }
  assert.throws(() => loadConfig({ ...baseEnv, METADATA_TOKEN: 'short' }), /at least 32/);
  assert.throws(() => loadConfig({ ...baseEnv, DATABASE_URL: 'not a url' }), /valid postgres/);
});
