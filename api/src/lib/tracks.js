// Pure helpers that turn Spotify playlist items into a compact shape and
// compute statistics. No I/O here, so they're easy to unit test.

// Spotify renamed playlist item `track` -> `item` in 2026; accept both.
export function normalizeItems(items) {
  return items.map((it, idx) => {
    const t = it.item ?? it.track ?? null;
    const isTrack = t?.type === 'track' || (t && !t.type);
    return {
      position: idx,
      type: t?.type ?? null,
      id: t?.id ?? null,
      name: t?.name ?? null,
      artists: isTrack ? (t.artists || []).map((a) => ({ id: a.id, name: a.name })) : [],
      album: isTrack && t.album
        ? {
            id: t.album.id,
            name: t.album.name,
            release_date: t.album.release_date ?? null,
            album_type: t.album.album_type ?? null,
            total_tracks: t.album.total_tracks ?? null,
            ...imageSizes(t.album.images),
          }
        : null,
      duration_ms: t?.duration_ms ?? null,
      explicit: t?.explicit ?? null,
      isrc: t?.external_ids?.isrc ?? null,
      is_local: Boolean(it.is_local ?? t?.is_local),
      // Only present when fetched with a market (e.g. market=from_token).
      ...(typeof t?.is_playable === 'boolean' ? { is_playable: t.is_playable } : {}),
      added_at: it.added_at ?? null,
      added_by: it.added_by?.id ?? null,
      url: t?.external_urls?.spotify ?? null,
    };
  });
}

// Two sizes per cover: `image` (~300px, sharp up to ~150 CSS px on retina
// screens) and `image_lg` (the largest, usually 640px) for big tiles.
export function imageSizes(images) {
  if (!images?.length) return { image: null, image_lg: null };
  const sorted = [...images].sort((a, b) => (a.width || 0) - (b.width || 0));
  const md = sorted.find((i) => (i.width || 300) >= 280) || sorted.at(-1);
  return { image: md.url, image_lg: sorted.at(-1).url };
}

export function computeStats(tracks) {
  const songs = tracks.filter((t) => t.id || t.is_local);
  const ids = new Set();
  const artistFreq = new Map();
  const albumFreq = new Map();
  const decades = new Map();
  const albumTypes = new Map();
  const addedByYear = new Map();
  const contributors = new Map();
  let minDate = null, maxDate = null, firstAdded = null, lastAdded = null;
  let totalMs = 0, durCount = 0, explicitCount = 0, explicitKnown = 0;
  let longest = null, shortest = null;

  for (const t of songs) {
    if (t.id) ids.add(t.id);

    for (const a of t.artists) bump(artistFreq, a.name);
    if (t.album?.name) bump(albumFreq, `${t.album.name}\u0000${t.artists[0]?.name ?? ''}`);
    if (t.album?.album_type) bump(albumTypes, t.album.album_type);

    const rd = parseReleaseDate(t.album?.release_date);
    if (rd) {
      if (!minDate || rd < minDate) minDate = rd;
      if (!maxDate || rd > maxDate) maxDate = rd;
      bump(decades, `${Math.floor(rd.getUTCFullYear() / 10) * 10}s`);
    }

    if (typeof t.duration_ms === 'number') {
      totalMs += t.duration_ms;
      durCount++;
      if (!longest || t.duration_ms > longest.duration_ms) longest = t;
      if (!shortest || t.duration_ms < shortest.duration_ms) shortest = t;
    }

    if (typeof t.explicit === 'boolean') {
      explicitKnown++;
      if (t.explicit) explicitCount++;
    }

    if (t.added_at) {
      const d = new Date(t.added_at);
      if (!Number.isNaN(d.getTime()) && d.getUTCFullYear() > 1970) {
        if (!firstAdded || d < firstAdded) firstAdded = d;
        if (!lastAdded || d > lastAdded) lastAdded = d;
        bump(addedByYear, String(d.getUTCFullYear()));
      }
    }
    if (t.added_by) bump(contributors, t.added_by);
  }

  return {
    tracks_total: tracks.length,
    tracks_unique: ids.size,
    local_tracks: songs.filter((t) => t.is_local).length,
    episodes: tracks.filter((t) => t.type === 'episode').length,
    artists_unique: artistFreq.size,
    top_artists: topN(artistFreq, 10).map(([name, count]) => ({ name, count })),
    top_albums: topN(albumFreq, 5).map(([key, count]) => {
      const [name, artist] = key.split('\u0000');
      return { name, artist, count };
    }),
    duration: {
      total_ms: totalMs,
      avg_ms: durCount ? Math.round(totalMs / durCount) : null,
      longest: longest && pick(longest),
      shortest: shortest && pick(shortest),
    },
    explicit: {
      count: explicitCount,
      pct: explicitKnown ? round1((explicitCount / explicitKnown) * 100) : null,
    },
    release_range: {
      oldest: minDate ? minDate.toISOString().slice(0, 10) : null,
      newest: maxDate ? maxDate.toISOString().slice(0, 10) : null,
    },
    decades: [...decades.entries()].sort().map(([decade, count]) => ({ decade, count })),
    album_types: Object.fromEntries(albumTypes),
    added: {
      first: firstAdded ? firstAdded.toISOString().slice(0, 10) : null,
      last: lastAdded ? lastAdded.toISOString().slice(0, 10) : null,
      by_year: [...addedByYear.entries()].sort().map(([year, count]) => ({ year, count })),
    },
    contributors: topN(contributors, 10).map(([id, count]) => ({ id, count })),
  };
}

// Exact duplicates share a Spotify track id. "Same recording" duplicates have
// different ids but the same ISRC (e.g. the single and the album version).
export function findDuplicates(tracks) {
  const byId = new Map();
  const byIsrc = new Map();
  const exact = [];
  const sameRecording = [];

  for (const t of tracks) {
    if (!t.id) continue;
    if (byId.has(t.id)) {
      exact.push({ position: t.position, first_position: byId.get(t.id).position, track: pick(t) });
      continue;
    }
    byId.set(t.id, t);

    if (t.isrc) {
      const first = byIsrc.get(t.isrc);
      if (first) sameRecording.push({ position: t.position, first_position: first.position, track: pick(t) });
      else byIsrc.set(t.isrc, t);
    }
  }

  return {
    total: tracks.length,
    duplicates: exact.length,
    same_recording: sameRecording.length,
    sample: exact.slice(0, 20),
    same_recording_sample: sameRecording.slice(0, 20),
  };
}

export function parseReleaseDate(d) {
  if (!d) return null;
  const iso = d.length === 4 ? `${d}-01-01` : d.length === 7 ? `${d}-01` : d;
  const dt = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function formatDuration(ms) {
  if (typeof ms !== 'number') return '';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function pick(t) {
  return {
    id: t.id,
    name: t.name,
    artists: t.artists,
    album: t.album,
    duration_ms: t.duration_ms,
  };
}

function bump(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function topN(map, n) {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, n);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}
