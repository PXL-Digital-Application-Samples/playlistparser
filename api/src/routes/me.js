import { likedInfo, pickImage, isAnalyzable } from '../lib/library.js';

export default async function meRoutes(fastify) {
  fastify.get('/me', { preHandler: fastify.requireUser }, async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    const { id, spotifyId, displayName } = req.user;
    return { id, spotifyId, displayName };
  });

  fastify.get('/me/playlists', { preHandler: fastify.requireUser }, async (req) => {
    const accessToken = await fastify.accessTokenFor(req.user);
    const [playlists, liked] = await Promise.all([
      fastify.library.playlists(req.user, accessToken),
      likedSummary(fastify.spotify, accessToken, req.user),
    ]);
    return { liked, items: playlists.map((p) => summarizePlaylist(p, req.user.spotifyId)) };
  });
}

async function likedSummary(spotify, accessToken, user) {
  try {
    const page = await spotify.get('/me/tracks?limit=1', accessToken);
    return { ...likedInfo(user), tracks_total: page.total ?? 0, analyzable: true };
  } catch (err) {
    // 403 = the session was created before the app asked for user-library-read.
    if (err.status === 403) return { ...likedInfo(user), tracks_total: null, analyzable: false, reauth: true };
    throw err;
  }
}

// Since February 2026 Spotify only returns playlist contents for playlists the
// user owns or collaborates on; others are listed but can't be analyzed.
export function summarizePlaylist(p, spotifyUserId) {
  return {
    id: p.id,
    name: p.name,
    description: p.description || null,
    owner: { id: p.owner?.id ?? null, display_name: p.owner?.display_name ?? null },
    public: p.public ?? null,
    collaborative: Boolean(p.collaborative),
    tracks_total: p.items?.total ?? p.tracks?.total ?? null,
    image: pickImage(p.images),
    url: p.external_urls?.spotify ?? null,
    analyzable: isAnalyzable(p, spotifyUserId),
  };
}
