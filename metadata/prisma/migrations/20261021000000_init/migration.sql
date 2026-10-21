-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "LastfmTrack" (
    "spotifyTrackId" TEXT NOT NULL,
    "listeners" INTEGER,
    "playcount" INTEGER,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LastfmTrack_pkey" PRIMARY KEY ("spotifyTrackId")
);

-- CreateTable
CREATE TABLE "DeezerTrack" (
    "isrc" TEXT NOT NULL,
    "bpm" DOUBLE PRECISION,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeezerTrack_pkey" PRIMARY KEY ("isrc")
);

-- CreateTable
CREATE TABLE "ArtistInfo" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tags" JSONB,
    "similar" JSONB,
    "lastfmAt" TIMESTAMP(3),
    "mbid" TEXT,
    "country" TEXT,
    "area" TEXT,
    "beginYear" INTEGER,
    "mbAt" TIMESTAMP(3),

    CONSTRAINT "ArtistInfo_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "RecordingWork" (
    "isrc" TEXT NOT NULL,
    "work" TEXT,
    "composer" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordingWork_pkey" PRIMARY KEY ("isrc")
);

-- CreateTable
CREATE TABLE "EnrichJob" (
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "done" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnrichJob_pkey" PRIMARY KEY ("userId","source")
);

