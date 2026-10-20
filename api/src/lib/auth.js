import { randomToken } from './crypto.js';

export const SESSION_COOKIE = 'pp_session';
export const STATE_COOKIE = 'pp_oauth_state';

// ---- Sessions ---------------------------------------------------------------

export async function createSession(prisma, userId, ttlDays) {
  const id = randomToken(32);
  const expiresAt = new Date(Date.now() + ttlDays * 86_400_000);
  await prisma.session.create({ data: { id, userId, expiresAt } });
  return { id, expiresAt };
}

export async function findSessionUser(prisma, sessionId) {
  if (!sessionId) return null;
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt <= new Date()) {
    await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
    return null;
  }
  return session.user;
}

export function deleteSession(prisma, sessionId) {
  return prisma.session.deleteMany({ where: { id: sessionId } });
}

export function deleteExpiredSessions(prisma) {
  return prisma.session.deleteMany({ where: { expiresAt: { lte: new Date() } } });
}

export function cookieOptions(config, maxAgeSeconds) {
  return {
    path: config.basePath || '/',
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    domain: config.cookie.domain,
    signed: true,
    ...(maxAgeSeconds !== undefined ? { maxAge: maxAgeSeconds } : {}),
  };
}

// ---- Spotify access tokens --------------------------------------------------

export class ReauthRequired extends Error {
  constructor() {
    super('Spotify authorization expired, log in again');
    this.statusCode = 401;
    this.code = 'reauth_required';
  }
}

// One in-flight refresh per user, so parallel requests don't all refresh.
const refreshing = new Map();

export async function ensureAccess({ prisma, spotify, cipher, log }, userId) {
  const tok = await prisma.token.findUnique({ where: { userId } });
  if (!tok) throw new ReauthRequired();

  if (tok.expiresAt.getTime() - Date.now() > 60_000) {
    return tok.accessToken;
  }

  if (!refreshing.has(userId)) {
    const p = (async () => {
      let refreshed;
      try {
        refreshed = await spotify.refresh(cipher.decrypt(tok.refreshEnc));
      } catch (err) {
        // Refresh tokens expire (or get revoked). Force a fresh login.
        log?.warn({ err, userId }, 'spotify token refresh failed');
        await prisma.token.deleteMany({ where: { userId } });
        await prisma.session.deleteMany({ where: { userId } });
        throw new ReauthRequired();
      }
      await prisma.token.update({
        where: { userId },
        data: {
          accessToken: refreshed.access_token,
          expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
          scope: refreshed.scope ?? tok.scope,
          // Spotify may rotate the refresh token; keep the old one otherwise.
          ...(refreshed.refresh_token ? { refreshEnc: cipher.encrypt(refreshed.refresh_token) } : {}),
        },
      });
      return refreshed.access_token;
    })().finally(() => refreshing.delete(userId));
    refreshing.set(userId, p);
  }
  return refreshing.get(userId);
}
