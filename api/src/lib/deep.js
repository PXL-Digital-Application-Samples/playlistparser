// "Deep dive" insights that combine the user's Liked Songs with enrichment
// data (Deezer BPM, Last.fm tags/similar artists, MusicBrainz origins and
// composers). Pure functions: callers pass in the looked-up maps.
import { parseReleaseDate } from './tracks.js';
import { artistKey } from './metadata.js';

// Broad genre families derived from Last.fm tags (first match wins).
export const FAMILIES = [
  ['classical', ['classical', 'baroque', 'opera', 'romantic', 'composer', 'chamber', 'orchestral', 'early music', 'piano']],
  ['electronic', ['electronic', 'electronica', 'techno', 'house', 'trance', 'ambient', 'edm', 'dance', 'idm', 'drum and bass', 'dubstep', 'electro', 'downtempo', 'trip-hop', 'trip hop', 'synth']],
  ['hip hop', ['hip-hop', 'hip hop', 'rap', 'trap', 'grime']],
  ['jazz & soul', ['jazz', 'soul', 'funk', 'r&b', 'rnb', 'blues', 'disco', 'motown']],
  ['folk & country', ['folk', 'country', 'americana', 'bluegrass', 'singer-songwriter', 'acoustic']],
  ['rock', ['rock', 'indie', 'alternative', 'punk', 'grunge', 'metal', 'emo', 'shoegaze', 'garage', 'noise', 'psychedelic', 'hardcore', 'post-']],
  ['pop', ['pop']],
  ['world', ['latin', 'world', 'reggae', 'afro', 'bossa', 'chanson', 'french', 'samba', 'fado', 'flamenco']],
];
// Last.fm tags that say nothing about the music: bare years, personal labels.
const JUNK_TAGS = new Set(['seen live', 'favorites', 'favourites', 'favorite', 'albums i own', 'spotify']);
export const isUsefulTag = (name) => !/^\d{4}$/.test(name.trim()) && !JUNK_TAGS.has(name.trim().toLowerCase());
const familyOfTag = (tag) => FAMILIES.find(([, words]) => words.some((w) => tag.includes(w)))?.[0] ?? null;

export function familyOf(info) {
  for (const t of info?.tags || []) {
    const f = familyOfTag(t.name);
    if (f) return f;
  }
  return null;
}

const primary = (e) => e.artists[0];
const infoOf = (artists, e) => (primary(e) ? artists.get(artistKey(primary(e).name)) : null);

// Every song with a known tempo: release year x BPM, sized by Last.fm listeners.
export function soundMap(tracks, { bpm, artists, listeners }) {
  const points = [];
  let withIsrc = 0;
  for (const t of tracks) {
    if (!t.id || t.type === 'episode') continue;
    if (t.isrc) withIsrc++;
    const b = t.isrc ? bpm.get(t.isrc) : null;
    const rd = parseReleaseDate(t.album?.release_date);
    if (!b || !rd) continue;
    points.push({
      id: t.id,
      name: t.name,
      artist: t.artists.map((a) => a.name).join(', '),
      year: Math.round((rd.getUTCFullYear() + rd.getUTCMonth() / 12) * 10) / 10,
      bpm: b,
      listeners: listeners.get(t.id) ?? null,
      family: familyOf(infoOf(artists, t)),
      image: t.album?.image ?? null,
      isrc: t.isrc ?? null, // lets the record player find a preview
    });
  }
  return { points: points.slice(0, 1500), coverage: { with_bpm: points.length, songs: withIsrc } };
}

// Genre families per year you added songs (shares), for a streamgraph.
export function tasteEras(events, artists) {
  const years = new Map();
  for (const e of events) {
    const y = e.added_at ? Number(e.added_at.slice(0, 4)) : null;
    if (!y || y < 2000) continue;
    const fam = familyOf(infoOf(artists, e)) ?? 'other';
    if (!years.has(y)) years.set(y, new Map());
    const m = years.get(y);
    m.set(fam, (m.get(fam) || 0) + 1);
  }
  const families = [...FAMILIES.map(([f]) => f), 'other'];
  const rows = [...years.keys()].sort().map((year) => {
    const m = years.get(year);
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    return { year, total, counts: Object.fromEntries(families.map((f) => [f, m.get(f) || 0])) };
  });
  const used = families.filter((f) => rows.some((r) => r.counts[f] > 0));
  return { families: used, rows };
}

// Where your music comes from: songs per artist country.
export function musicAtlas(events, artists) {
  const byCountry = new Map();
  let known = 0;
  for (const e of events) {
    const info = infoOf(artists, e);
    if (!info?.country) continue;
    known++;
    if (!byCountry.has(info.country)) byCountry.set(info.country, { country: info.country, area: info.area, count: 0, artists: new Map() });
    const c = byCountry.get(info.country);
    c.count++;
    c.artists.set(primary(e).name, (c.artists.get(primary(e).name) || 0) + 1);
  }
  return {
    known,
    total: events.length,
    countries: [...byCountry.values()].sort((a, b) => b.count - a.count).map((c) => ({
      country: c.country, area: c.area, count: c.count,
      artists: [...c.artists.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, count]) => ({ name, count })),
    })),
  };
}

// Your top artists as a network linked by Last.fm similarity, plus "ghost"
// artists you don't have that are similar to several of your favourites.
export function constellation(events, artists, size = 40) {
  const counts = new Map();
  const ids = new Map();
  for (const e of events) {
    for (const a of e.artists.slice(0, 2)) {
      const k = artistKey(a.name);
      counts.set(k, (counts.get(k) || 0) + 1);
      if (a.id) ids.set(k, a.id);
      if (!ids.has(`n:${k}`)) ids.set(`n:${k}`, a.name);
    }
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, size).map(([k]) => k);
  const inTop = new Set(top);
  const library = new Set(counts.keys());
  const nodes = top.map((k) => ({
    id: k, name: ids.get(`n:${k}`), spotify_id: ids.get(k) ?? null, count: counts.get(k),
    family: familyOf(artists.get(k)), ghost: false,
  }));
  const links = [];
  const ghostScore = new Map();
  for (const k of top) {
    for (const s of artists.get(k)?.similar || []) {
      const sk = artistKey(s.name);
      if (inTop.has(sk)) {
        // Undirected: store each pair once, in a fixed order.
        if (sk !== k) links.push(k < sk ? { source: k, target: sk, match: s.match } : { source: sk, target: k, match: s.match });
      } else if (!library.has(sk) && s.match >= 0.3) {
        if (!ghostScore.has(sk)) ghostScore.set(sk, { name: s.name, score: 0, links: [] });
        const g = ghostScore.get(sk);
        g.score += s.match;
        g.links.push({ source: k, match: s.match });
      }
    }
  }
  const uniqLinks = [...new Map(links.map((l) => [`${l.source}|${l.target}`, l])).values()];
  const ghosts = [...ghostScore.entries()]
    .filter(([, g]) => g.links.length >= 2)
    .sort((a, b) => b[1].score - a[1].score).slice(0, 10);
  for (const [gk, g] of ghosts) {
    nodes.push({ id: `ghost:${gk}`, name: g.name, spotify_id: null, count: 0, family: null, ghost: true, score: Math.round(g.score * 100) / 100 });
    for (const l of g.links) uniqLinks.push({ source: l.source, target: `ghost:${gk}`, match: l.match, ghost: true });
  }
  return { nodes, links: uniqLinks };
}

// Most common Last.fm tags, weighted by likes.
export function topTags(events, artists, n = 15) {
  const tags = new Map();
  for (const e of events) {
    for (const t of (infoOf(artists, e)?.tags || []).filter((x) => isUsefulTag(x.name)).slice(0, 3)) tags.set(t.name, (tags.get(t.name) || 0) + 1);
  }
  return [...tags.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([tag, count]) => ({ tag, count, family: familyOfTag(tag) }));
}

// Classical corner: composers and works behind your classical recordings.
export function classicalCorner(tracks, works) {
  const composers = new Map();
  for (const t of tracks) {
    const w = t.isrc ? works.get(t.isrc) : null;
    if (!w?.composer) continue;
    if (!composers.has(w.composer)) composers.set(w.composer, { name: w.composer, count: 0, works: new Map(), performers: new Map() });
    const c = composers.get(w.composer);
    c.count++;
    if (w.work) c.works.set(w.work, (c.works.get(w.work) || 0) + 1);
    for (const a of t.artists) if (a.name !== w.composer) c.performers.set(a.name, (c.performers.get(a.name) || 0) + 1);
  }
  return [...composers.values()].sort((a, b) => b.count - a.count).slice(0, 10).map((c) => ({
    name: c.name, count: c.count,
    works: [...c.works.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([title, count]) => ({ title, count })),
    performers: [...c.performers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, count]) => ({ name, count })),
  }));
}
