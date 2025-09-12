#!/bin/sh
set -e

# Optional DB setup
if [ "${RUN_DB_SETUP:-true}" = "true" ]; then
  npx prisma generate
  npx prisma migrate deploy
  if [ "${SEED_DB:-false}" = "true" ]; then
    npx prisma db seed || true
  fi
fi

exec node src/server.js
