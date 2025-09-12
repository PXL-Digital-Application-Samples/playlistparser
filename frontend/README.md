# playlistparser-frontend

Vue 3 + Vite client for playlistparser.

Connects to the [playlistparser-api](../api).

## Environment variables

Create `.env` in the frontend root:

```env
VITE_API_BASE_URL=http://localhost:3000
```

Notes:

* All frontend env vars must be prefixed with `VITE_`.
* Use the API service URL in Docker/Kubernetes when deployed.

## Development

```bash
npm install
npm run dev
```

Default dev server: [http://localhost:5173](http://localhost:5173)
The app proxies API requests to `VITE_API_BASE_URL`.

## Features

* **Login with Spotify** → redirect to `/auth/login` on the API
* **Dashboard** → list user playlists
* **Playlist detail view** →

  * Show playlist tracks (artists, albums, popularity, added date)
  * Show statistics (track count, unique artists, release date range, top artists)
  * Run **simulate dedup** (report duplicate tracks without modifying anything)
  * Run **simulate merge** (compare two playlists, show overlap and union sizes)

## Integration with API

Expected API endpoints:

```bash
GET  /auth/login
GET  /auth/callback
GET  /me
GET  /me/playlists
GET  /playlists/:id/contents
GET  /playlists/:id/stats
GET  /playlists/:id/simulate-dedupe
GET  /simulate-merge?a=PL1&b=PL2
GET  /healthz | /readyz | /metrics
```

## Build

```bash
npm run build
```

The build output is in `dist/`, ready to be served by Nginx or another static server.

## Docker (local)

```bash
docker build -t playlistparser-frontend .
docker run --rm -p 5173:80 playlistparser-frontend
```

---

## Setup

1. Copy `.env.example` to `.env` and set:

```bash
VITE\_API\_BASE\_URL=[http://localhost:3000](http://localhost:3000)

```

1. Install and run:

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Click **Login with Spotify**.

## Build

```bash
npm run build
```

## Docker

```bash
docker build -t playlistparser-frontend .
docker run --rm -p 5173:80 playlistparser-frontend
```
