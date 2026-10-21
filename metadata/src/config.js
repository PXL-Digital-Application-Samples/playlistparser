// Central configuration. Everything that differs between environments is read
// from environment variables here, validated once at startup, and the process
// refuses to start with a clear message when something is wrong.

export function loadConfig(env = process.env) {
  const errors = [];

  const required = (name) => {
    const v = env[name];
    if (v === undefined || v === '') errors.push(`${name} is required`);
    return v;
  };

  const int = (name, fallback) => {
    const v = env[name];
    if (v === undefined || v === '') return fallback;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) errors.push(`${name} must be a non-negative integer (got "${v}")`);
    return n;
  };

  // Shared with the API: every request except the probes must carry it.
  const token = required('METADATA_TOKEN');
  if (token && token.length < 32) errors.push('METADATA_TOKEN must be at least 32 characters');

  const databaseUrl = required('DATABASE_URL');
  let dbSchema;
  if (databaseUrl) {
    try {
      dbSchema = new URL(databaseUrl).searchParams.get('schema') || undefined;
    } catch {
      errors.push('DATABASE_URL must be a valid postgres:// URL');
    }
  }

  const config = {
    // Loopback by default: this service is internal. Containers and other
    // hosts must set HOST=0.0.0.0 (or a private address) explicitly.
    host: env.HOST || '127.0.0.1',
    port: int('PORT', 3001),
    logLevel: env.LOG_LEVEL || 'info',
    token,
    databaseUrl,
    // The driver adapter ignores ?schema= in the URL, so it is passed on.
    dbSchema,
    bodyLimitMb: int('BODY_LIMIT_MB', 20),
    lastfm: {
      apiKey: env.LASTFM_API_KEY || null,
      cacheDays: int('LASTFM_CACHE_DAYS', 30),
    },
  };

  if (errors.length) {
    const err = new Error('Invalid configuration:\n  - ' + errors.join('\n  - '));
    err.configErrors = errors;
    throw err;
  }
  return config;
}
