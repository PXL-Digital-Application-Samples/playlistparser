import { randomToken } from '../lib/crypto.js';
import {
  SESSION_COOKIE, STATE_COOKIE, cookieOptions, createSession, deleteSession,
} from '../lib/auth.js';
import { SpotifyError } from '../lib/spotify.js';

export default async function authRoutes(fastify) {
  const { config, prisma, spotify, cipher } = fastify;

  // The state cookie must survive the top-level redirect back from Spotify,
  // so it is always SameSite=Lax regardless of COOKIE_SAMESITE.
  const stateCookie = {
    ...cookieOptions(config, 600),
    sameSite: 'lax',
    path: `${config.basePath}/auth`,
  };

  const backToFrontend = (reply, error, extra = {}) => {
    const url = new URL(config.frontendOrigin);
    if (error) url.searchParams.set('login_error', error);
    for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, String(v));
    return reply.redirect(url.href);
  };

  fastify.get('/auth/login', async (req, reply) => {
    const state = randomToken(16);
    reply.setCookie(STATE_COOKIE, state, stateCookie);
    return reply.redirect(spotify.authorizeUrl(state));
  });

  fastify.get('/auth/callback', async (req, reply) => {
    const { code, state, error } = req.query;
    const expected = req.unsignCookie(req.cookies[STATE_COOKIE] || '');
    reply.clearCookie(STATE_COOKIE, stateCookie);

    if (error) return backToFrontend(reply, error); // e.g. access_denied
    if (!code || !state || !expected.valid || expected.value !== state) {
      return backToFrontend(reply, 'bad_state');
    }

    // Someone is waiting on this page, so Spotify rate limits fail at once
    // with a clear message instead of retrying silently for half a minute.
    const t0 = Date.now();
    let tok, me, exchangeMs;
    try {
      tok = await spotify.exchangeCode(code);
      exchangeMs = Date.now() - t0;
      me = await spotify.get('/me', tok.access_token, { retry: false });
    } catch (err) {
      req.log.warn({ err, ms: Date.now() - t0 }, 'spotify login failed');
      if (err instanceof SpotifyError && err.status === 429) {
        return backToFrontend(reply, 'spotify_rate_limited', err.retryAfter ? { retry_after: err.retryAfter } : {});
      }
      // In development mode Spotify answers 403 for accounts that aren't
      // added under "User Management" in the developer dashboard.
      const reason = err instanceof SpotifyError && err.status === 403 ? 'user_not_allowed'
        : err instanceof SpotifyError && err.status === 504 ? 'spotify_timeout' : 'spotify_login_failed';
      return backToFrontend(reply, reason);
    }
    const spotifyMs = Date.now() - t0;

    const user = await prisma.user.upsert({
      where: { spotifyId: me.id },
      create: { spotifyId: me.id, displayName: me.display_name ?? null },
      update: { displayName: me.display_name ?? null },
    });

    const tokenData = {
      accessToken: tok.access_token,
      scope: tok.scope ?? '',
      expiresAt: new Date(Date.now() + tok.expires_in * 1000),
      ...(tok.refresh_token ? { refreshEnc: cipher.encrypt(tok.refresh_token) } : {}),
    };
    await prisma.token.upsert({
      where: { userId: user.id },
      create: { userId: user.id, refreshEnc: '', ...tokenData },
      update: tokenData,
    });

    const session = await createSession(prisma, user.id, config.sessionTtlDays);
    reply.setCookie(SESSION_COOKIE, session.id, cookieOptions(config, config.sessionTtlDays * 86_400));
    req.log.info({ exchangeMs, meMs: spotifyMs - exchangeMs, totalMs: Date.now() - t0 }, 'login completed');
    return backToFrontend(reply);
  });

  fastify.post('/auth/logout', async (req, reply) => {
    const sid = fastify.readSessionId(req);
    if (sid) await deleteSession(prisma, sid);
    reply.clearCookie(SESSION_COOKIE, cookieOptions(config));
    return { success: true };
  });
}
