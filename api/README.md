Env vars

Common: NODE_ENV, LOG_LEVEL

API: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REDIRECT_URI, SESSION_SECRET, DATABASE_URL, FRONTEND_ORIGIN

Frontend (Vite): VITE_API_BASE_URL (Vite exposes import.meta.env.*, prefix required). 
vitejs

OAuth and scopes

Server handles the Authorization Code flow. Scopes: playlist-read-private, playlist-read-collaborative, playlist-modify-public, playlist-modify-private, user-read-email. Prefer server flow; use PKCE only if you must start auth in the SPA. 
Spotify for Developers
+2
Spotify for Developers
+2

Spotify API notes

Create playlist endpoint exists and needs playlist-modify scopes. Handle 429 with retry-after. Spotify uses a rolling 30-second window. 
Spotify for Developers
+1

Features suited for coursework

Login with Spotify. Persist user + tokens.

“Merge” playlists the user owns or follows.

Deduplicate playlist items by track ID.

Sort and slice by artist, album, release date, popularity.

Snapshot playlists to DB and restore from a snapshot.

Scheduled nightly snapshot via Kubernetes CronJob hitting /tasks/snapshot.

Admin metrics at /metrics (Prometheus). Health probes at /healthz and /readyz.

Minimal API surface
GET  /auth/login              # redirects to Spotify
GET  /auth/callback
GET  /me                      # current user profile
GET  /me/playlists            # user playlists
POST /playlists               # create a playlist
POST /playlists/:id/items     # add tracks
DELETE /playlists/:id/items   # remove tracks
POST /playlists/:id/dedupe
POST /playlists/:id/merge     # body: { sourcePlaylistIds: [] }
POST /playlists/:id/snapshots # create snapshot
GET  /playlists/:id/snapshots
POST /playlists/:id/restore   # body: { snapshotId }
GET  /healthz | /readyz | /metrics

Data model (Prisma)
User(id, spotifyId, email, displayName, createdAt)
Token(userId FK, accessToken, refreshTokenEncrypted, expiresAt, scope)
PlaylistLocal(id, spotifyId, ownerUserId FK, name, lastSyncedAt)
Snapshot(id, playlistLocalId FK, createdAt, trackIds JSONB)

Frontend

Vue 3 + Vite. Login button hits /auth/login. Views: Dashboard (playlists), Playlist Detail (dedupe, merge, snapshots). Use fetch to VITE_API_BASE_URL. Vite env pattern per docs. 
vitejs