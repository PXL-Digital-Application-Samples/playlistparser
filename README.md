# Playlist Parser

A comprehensive Spotify playlist analyzer built with Vue.js frontend and Fastify backend. Analyze your playlists, export data to CSV, visualize your musical taste, and simulate playlist operations without making changes to your actual playlists.

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Spotify Developer Account

### Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd playlistparser
   ```

2. **Configure Spotify API credentials**
   ```bash
   cd api
   cp .env.example .env
   # Edit .env file with your Spotify credentials (see Environment Variables section)
   ```

3. **Start the application**
   ```bash
   # From repository root
   docker compose up -d
   ```

4. **Access the application**
   - Frontend: http://127.0.0.1:5173
   - API: http://127.0.0.1:3000
   - Database: 127.0.0.1:5432

## Architecture

The application consists of three main services orchestrated by Docker Compose:

### Database Service

- **Technology**: PostgreSQL 17 Alpine
- **Port**: 5432
- **Purpose**: Stores user sessions, OAuth tokens, and authentication data
- **Data Persistence**: Uses Docker volume for data persistence across container restarts
- **Health Checks**: Monitors database readiness before starting dependent services

### API Backend Service

- **Technology**: Node.js with Fastify framework and Prisma ORM
- **Port**: 3000
- **Purpose**: 
  - Spotify OAuth authentication and token management
  - Playlist data retrieval and analysis
  - CSV export functionality with progress tracking
  - Audio features analysis
  - Playlist statistics and deduplication simulation

### Frontend Service

- **Technology**: Vue.js 3 with Vue Router, served via Nginx
- **Port**: 5173 (mapped to container port 80)
- **Purpose**:
  - Modern responsive user interface
  - Real-time export progress tracking
  - Playlist visualization and analysis
  - Audio features profile display

## Environment Variables

### API Backend (.env in api/ directory)

**Required - Spotify API Configuration**
```env
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/auth/callback
```

**Required - Application Configuration**
```env
DATABASE_URL=postgres://playlistparser:playlistparser@db:5432/playlistparser?schema=public
FRONTEND_ORIGIN=http://127.0.0.1:5173
```

**Required - Security**
```env
# Generate a random 32-character hex string for token encryption
TOKEN_ENC_KEY=your_32_character_hex_encryption_key

# Generate a random string for session cookie signing
SESSION_SECRET=your_32_plus_character_session_secret
```

**Optional - Application Settings**
```env
NODE_ENV=development
PORT=3000
LOG_LEVEL=info
```

### Frontend Configuration

The frontend uses Vite environment variables (prefixed with VITE_):

```env
VITE_API_BASE_URL=http://127.0.0.1:3000
```

Note: In production deployments, adjust URLs to match your domain configuration.

## Features

### Playlist Analysis
- View all Spotify playlists (owned and followed)
- Detailed track statistics including artists, albums, popularity scores
- Release date analysis and track duration statistics
- Duplicate track detection with position information
- Playlist merging simulation showing overlap and union statistics

### Data Export
- **Individual Playlist Export**: Complete CSV with track metadata, audio features, and playlist information
- **Bulk Export**: All playlists exported to a single comprehensive CSV file
- **Progress Tracking**: Real-time progress updates during export process
- **Smart Filenames**: Auto-generated filenames with timestamps and user identification

### Audio Features Analysis
- Musical DNA profile based on Spotify's audio feature analysis
- Visual breakdown of listening preferences:
  - Danceability: How suitable tracks are for dancing
  - Energy: Intensity and power of tracks
  - Valence: Musical positivity (happy vs melancholic)
  - Acousticness: Acoustic vs electronic sound characteristics
  - Instrumentalness: Proportion of instrumental vs vocal tracks
  - Liveness: Presence of live audience in recordings
  - Speechiness: Amount of spoken word content
- Average tempo and track duration analysis
- Summary statistics across entire music library

### Security and Privacy
- Secure Spotify OAuth 2.0 implementation using Authorization Code flow
- Encrypted refresh token storage in PostgreSQL database
- Session-based authentication with signed cookies
- No permanent storage of actual music content or sensitive user data
- Read-only access to Spotify data (no playlist modifications)

## Spotify Integration

### OAuth Scopes
The application requests minimal necessary permissions:
- `playlist-read-private`: Access to private playlists
- `playlist-read-collaborative`: Access to collaborative playlists
- `user-read-email`: User profile information

### API Rate Limiting
- Handles Spotify's rate limiting (HTTP 429 responses)
- Implements retry logic with exponential backoff
- Batch processing for efficient API usage
- Automatic token refresh when access tokens expire

### Data Model
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
  refreshEnc  String   // Encrypted refresh token
  scope       String
  expiresAt   DateTime
  user        User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

## API Endpoints

### Authentication
```
GET  /auth/login                     # Initiate Spotify OAuth flow
GET  /auth/callback                  # Handle OAuth callback
POST /auth/logout                    # Clear user session
```

### User Data
```
GET  /me                             # Current user profile
GET  /me/playlists                   # List user playlists
GET  /me/audio-features              # Audio features analysis
```

### Playlist Operations
```
GET  /playlists/:id/contents         # Playlist tracks (paginated)
GET  /playlists/:id/stats            # Playlist statistics
GET  /playlists/:id/simulate-dedupe  # Duplicate detection (read-only)
GET  /playlists/:id/export           # Download playlist as CSV
```

### Bulk Operations
```
POST /playlists/export-all           # Start bulk export job
GET  /playlists/export-progress/:jobId  # Check export progress
GET  /playlists/download/:jobId      # Download completed export
```

### Utility
```
GET  /simulate-merge?a=PL1&b=PL2     # Compare two playlists
GET  /healthz                        # Health check endpoint
GET  /readyz                         # Readiness check endpoint
GET  /metrics                        # Prometheus metrics
```

## Development

### Local Development Setup

1. **API Development**
   ```bash
   cd api
   cp .env.example .env
   # Configure .env with your Spotify credentials
   docker compose up -d  # Starts database and API
   ```

2. **Frontend Development**
   ```bash
   cd frontend
   npm install
   npm run dev
   # Frontend available at http://127.0.0.1:5173
   ```

3. **Full Stack Development**
   ```bash
   # From repository root
   docker compose up -d
   ```

### Docker Commands

**Basic Operations**
```bash
# Start all services
docker compose up -d

# View service status
docker compose ps

# View logs
docker compose logs -f
docker compose logs -f api  # Specific service logs

# Stop all services
docker compose down

# Rebuild and restart
docker compose build
docker compose up -d
```

**Development Workflows**
```bash
# Rebuild specific service after code changes
docker compose build frontend
docker compose up -d frontend

# Access database
docker compose exec db psql -U playlistparser -d playlistparser

# Shell access to API container
docker compose exec api sh

# Clean rebuild (removes cache)
docker compose build --no-cache
```

## Deployment

### Production Configuration

1. **Environment Variables**
   - Set `NODE_ENV=production` in API .env file
   - Use production domain URLs instead of 127.0.0.1
   - Generate strong random values for `TOKEN_ENC_KEY` and `SESSION_SECRET`
   - Configure proper `SPOTIFY_REDIRECT_URI` for your domain

2. **Security Considerations**
   - Enable HTTPS in production
   - Configure proper CORS origins
   - Use secure cookie settings
   - Implement proper logging and monitoring

3. **Database Setup**
   - Use managed PostgreSQL service for production
   - Configure regular backups
   - Set up connection pooling for high traffic

### Container Deployment
```bash
# Production build
docker compose -f compose.yml build

# Deploy with production configuration
docker compose up -d
```

## Troubleshooting

### Common Issues

**"Cannot connect to database"**
- Check if database container is healthy: `docker compose ps`
- Verify DATABASE_URL configuration matches compose.yml settings
- Wait for database health check to pass before starting API

**"CORS errors in browser"**
- Ensure FRONTEND_ORIGIN in API .env matches frontend URL exactly
- Verify both API and frontend services are running
- Check that no other services are using the same ports

**"401 Unauthorized" after login**
- Verify Spotify credentials in .env file are correct
- Check that SPOTIFY_REDIRECT_URI matches exactly with Spotify app settings
- Ensure OAuth callback URL is configured correctly in Spotify Developer Dashboard

**"Export functionality not working"**
- Check API logs for rate limiting or authentication errors
- Verify Spotify access token hasn't expired (tokens auto-refresh)
- Ensure sufficient Spotify API quota

**"Frontend won't load"**
- Verify API service is healthy: `curl http://127.0.0.1:3000/healthz`
- Check VITE_API_BASE_URL points to correct API endpoint
- Ensure frontend build completed successfully

### Health Monitoring
```bash
# Check all services
docker compose ps

# Test API health
curl http://127.0.0.1:3000/healthz

# Test frontend
curl http://127.0.0.1:5173

# Database connectivity
docker compose exec db pg_isready -U playlistparser -d playlistparser
```

## Project Structure

```
playlistparser/
├── compose.yml              # Root orchestration file
├── README.md               # This documentation
├── .dockerignore           # Docker build optimization
├── api/                    # Backend service
│   ├── Dockerfile
│   ├── compose.yml         # Local API development
│   ├── package.json
│   ├── .env.example        # Environment template
│   ├── prisma/             # Database schema and migrations
│   │   ├── schema.prisma
│   │   ├── seed.js
│   │   └── migrations/
│   └── src/                # API source code
│       ├── server.js       # Main application entry
│       ├── lib/            # Utilities (crypto, database, spotify)
│       └── routes/         # API route handlers
└── frontend/               # Frontend service
    ├── Dockerfile
    ├── package.json
    ├── vite.config.js      # Build configuration
    ├── index.html          # Application shell
    ├── src/                # Vue.js application
    │   ├── main.js         # Application entry and routing
    │   ├── App.vue         # Root component
    │   ├── api.js          # API client utilities
    │   └── views/          # Page components
    └── public/             # Static assets
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Make changes and test locally using `docker compose up -d`
4. Commit changes: `git commit -m 'Add new feature'`
5. Push to branch: `git push origin feature/new-feature`
6. Submit a Pull Request

## License

This project is licensed under the MIT License. See the LICENSE file for details.