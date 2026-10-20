// Central configuration. Everything that differs between environments is read
// from environment variables here, validated once at startup, and the process
// refuses to start with a clear message when something is wrong.

const SAMESITE_VALUES = ['lax', 'strict', 'none'];

export function loadConfig(env = process.env) {
  const errors = [];

  const required = (name) => {
    const v = env[name];
    if (v === undefined || v === '') errors.push(`${name} is required`);
    return v;
  };

  const bool = (name, fallback) => {
    const v = env[name];
    if (v === undefined || v === '') return fallback;
    if (/^(true|1|yes)$/i.test(v)) return true;
    if (/^(false|0|no)$/i.test(v)) return false;
    errors.push(`${name} must be true or false (got "${v}")`);
    return fallback;
  };

  const int = (name, fallback) => {
    const v = env[name];
    if (v === undefined || v === '') return fallback;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) errors.push(`${name} must be a non-negative integer (got "${v}")`);
    return n;
  };

  const sessionSecret = required('SESSION_SECRET');
  if (sessionSecret && sessionSecret.length < 32) {
    errors.push('SESSION_SECRET must be at least 32 characters');
  }

  const tokenEncKey = required('TOKEN_ENC_KEY');
  if (tokenEncKey && !/^[0-9a-fA-F]{64}$/.test(tokenEncKey)) {
    errors.push('TOKEN_ENC_KEY must be exactly 64 hex characters (32 bytes)');
  }

  const frontendOrigin = env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173';
  checkUrl('FRONTEND_ORIGIN', frontendOrigin, errors);

  const corsOrigins = (env.CORS_ORIGINS || new URL(safeUrl(frontendOrigin)).origin)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  corsOrigins.forEach((o) => {
    if (o !== '*' && checkUrl('CORS_ORIGINS', o, errors) && new URL(o).origin !== o) {
      errors.push(`CORS_ORIGINS entries must be bare origins without a path (got "${o}")`);
    }
  });
  if (corsOrigins.includes('*')) {
    errors.push('CORS_ORIGINS cannot be "*" because the API uses cookies (credentials)');
  }

  const sameSite = (env.COOKIE_SAMESITE || 'lax').toLowerCase();
  if (!SAMESITE_VALUES.includes(sameSite)) {
    errors.push(`COOKIE_SAMESITE must be one of ${SAMESITE_VALUES.join(', ')} (got "${env.COOKIE_SAMESITE}")`);
  }
  const cookieSecure = bool('COOKIE_SECURE', false);
  if (sameSite === 'none' && !cookieSecure) {
    errors.push('COOKIE_SAMESITE=none requires COOKIE_SECURE=true (browsers reject it otherwise)');
  }

  const basePath = normalizeBasePath(env.API_BASE_PATH || '', errors);

  const redirectUri = required('SPOTIFY_REDIRECT_URI');
  if (redirectUri && checkUrl('SPOTIFY_REDIRECT_URI', redirectUri, errors)) {
    const expected = `${basePath}/auth/callback`;
    if (!new URL(redirectUri).pathname.endsWith(expected)) {
      errors.push(`SPOTIFY_REDIRECT_URI path must end with "${expected}" (API_BASE_PATH is "${basePath || '(empty)'}")`);
    }
  }

  const config = {
    isProd: env.NODE_ENV === 'production',
    host: env.HOST || '0.0.0.0',
    port: int('PORT', 3000),
    logLevel: env.LOG_LEVEL || 'info',
    basePath,
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    frontendOrigin,
    corsOrigins,
    cookie: {
      secure: cookieSecure,
      sameSite,
      domain: env.COOKIE_DOMAIN || undefined,
    },
    sessionSecret,
    sessionTtlDays: int('SESSION_TTL_DAYS', 7),
    tokenEncKey,
    rateLimit: {
      max: int('RATE_LIMIT_MAX', 120),
      windowSeconds: int('RATE_LIMIT_WINDOW_SECONDS', 30),
    },
    spotify: {
      clientId: required('SPOTIFY_CLIENT_ID'),
      clientSecret: required('SPOTIFY_CLIENT_SECRET'),
      redirectUri,
    },
    lastfm: {
      apiKey: env.LASTFM_API_KEY || null,
      cacheDays: int('LASTFM_CACHE_DAYS', 30),
    },
  };
  required('DATABASE_URL');

  if (errors.length) {
    const err = new Error('Invalid configuration:\n  - ' + errors.join('\n  - '));
    err.configErrors = errors;
    throw err;
  }
  return config;
}

// TRUST_PROXY accepts: true/false, a hop count ("1"), or a comma-separated
// list of IPs/CIDRs ("10.0.0.0/16,127.0.0.1"). Passed to Fastify's trustProxy.
export function parseTrustProxy(v) {
  if (v === undefined || v === '' || /^(false|0|no)$/i.test(v)) return false;
  if (/^(true|yes)$/i.test(v)) return true;
  if (/^\d+$/.test(v)) return Number(v);
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

function normalizeBasePath(p, errors) {
  if (!p || p === '/') return '';
  if (!p.startsWith('/')) {
    errors.push(`API_BASE_PATH must start with "/" (got "${p}")`);
    return '';
  }
  return p.replace(/\/+$/, '');
}

function checkUrl(name, value, errors) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error();
    return true;
  } catch {
    errors.push(`${name} must be an absolute http(s) URL (got "${value}")`);
    return false;
  }
}

function safeUrl(v) {
  try { return new URL(v).href; } catch { return 'http://invalid'; }
}
