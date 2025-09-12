# playlistparser-api

Backend service for the **playlistparser** coursework project.
Built with **Fastify**, **Prisma**, and **PostgreSQL**.
Integrates with the **Spotify Web API** for OAuth and playlist data.

## Environment variables

**Common**

* `NODE_ENV` — `development` or `production`
* `LOG_LEVEL` — Fastify log level (default: `info`)

**API**

* `PORT` — port to listen on (default: 3000)
* `SESSION_SECRET` — secret for signing cookies (32+ chars recommended)
* `TOKEN_ENC_KEY` — 32-byte hex key for encrypting refresh tokens
* `DATABASE_URL` — PostgreSQL connection string
* `SPOTIFY_CLIENT_ID` — from [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
* `SPOTIFY_CLIENT_SECRET` — from dashboard
* `SPOTIFY_REDIRECT_URI` — must match dashboard, e.g. `http://localhost:3000/auth/callback`
* `FRONTEND_ORIGIN` — URL of the frontend, e.g. `http://localhost:5173`

**Frontend (Vite)**

* `VITE_API_BASE_URL` — base URL of this API (Vite requires the `VITE_` prefix).

## OAuth and scopes

This server implements the **Authorization Code** flow.
Scopes used (read-only):

* `playlist-read-private`
* `playlist-read-collaborative`
* `user-read-email`

Server-side OAuth is strongly preferred. PKCE is not required unless starting the flow in the SPA.

## Spotify API notes

* **No write endpoints** are exposed. The project never creates, modifies, or deletes playlists.
* Rate limits: Spotify may respond with HTTP 429 and a `Retry-After` header (sliding 30-second window).
* Always inspect headers before retrying.

## Features (coursework focus)

* Login with Spotify (OAuth)
* Persist user profile + tokens in Postgres (via Prisma)
* Report on playlists the user owns or follows
* Inspect playlist contents (tracks, artists, albums)
* Stats: counts, unique artists, top artists, release date ranges, average popularity
* Simulate deduplication (report duplicate tracks, but don't delete)
* Simulate merge (compare two playlists, report union/intersection sizes)
* Admin metrics:

  * `/metrics` → Prometheus format
  * `/healthz` and `/readyz` → liveness/readiness

## API surface

```
GET  /auth/login                 # start OAuth with Spotify
GET  /auth/callback              # handle OAuth redirect

GET  /me                         # current user profile
GET  /me/playlists               # list user playlists

GET  /playlists/:id/contents     # playlist tracks (compact)
GET  /playlists/:id/stats        # playlist statistics
GET  /playlists/:id/simulate-dedupe
                                 # detect duplicates (non-destructive)
GET  /simulate-merge?a=PL1&b=PL2 # compare two playlists

GET  /healthz | /readyz | /metrics
```

## Data model (Prisma)

```prisma
model User {
  id           String   @id @default(cuid())
  spotifyId    String   @unique
  email        String?
  displayName  String?
  createdAt    DateTime @default(now())
  tokens       Token?
}

model Token {
  userId      String   @id
  accessToken String
  refreshEnc  String
  scope       String
  expiresAt   DateTime
  user        User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

## Frontend

* Vue 3 + Vite (separate `/frontend` project)
* Login button → `/auth/login`
* Views:

  * **Dashboard**: list playlists
  * **Playlist detail**: view contents, run dedupe/merge simulations
* Use `fetch` against `VITE_API_BASE_URL`
* Follow [Vite env conventions](https://vitejs.dev/guide/env-and-mode.html)

---
