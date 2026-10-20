import { plural } from './playlistCache.js';

// "Wrapped"-style highlight cards from the insights summary, one fact each.
// Used on Home (the first few) and on the Taste page (all of them).
const names = (t) => t.artists.map((a) => a.name).join(', ');
const fmtDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

export function highlightCards(summary, lensKey) {
  const out = [];
  if (!summary) return out;
  const top = summary.listening?.top?.status === 'ok' ? summary.listening.top.data : null;
  const l = summary.lenses?.[lensKey] ?? null;
  const unit = lensKey === 'all' ? 'like' : 'song';

  if (top?.short_term.artists[0]) {
    const now = top.short_term.artists[0];
    const year = top.long_term.artists[0];
    out.push({
      kicker: 'Your #1 artist lately', tone: 'purple', big: now.name, to: `/artist/${now.id}`, image: now.image,
      text: year && year.id !== now.id ? `Over the past year it was ${year.name}.` : 'Also your #1 over the past year.',
    });
  }
  if (top?.short_term.tracks[0]) {
    const t = top.short_term.tracks[0];
    out.push({ kicker: 'On repeat', tone: 'coral', big: t.name, image: t.image, text: `${names(t)}: your top song of the past 4 weeks.` });
  }
  if (l?.depth.deepest[0]) {
    const d = l.depth.deepest[0];
    out.push({ kicker: lensKey === 'all' ? 'Most liked artist' : 'Most hand-picked artist', tone: 'blue', big: d.name, to: d.id ? `/artist/${d.id}` : null, text: `${plural(d.count, unit)}.` });
  }
  if (l?.age.median_age_years !== null && l?.age.median_age_years !== undefined) {
    out.push({ kicker: 'Nostalgia score', tone: 'amber', big: `${l.age.median_age_years} years`, text: 'How old a song typically was when you liked it.' });
  }
  if (l?.calendar.busiest_day) {
    out.push({ kicker: 'Busiest day', tone: 'green', big: fmtDate(l.calendar.busiest_day.date), text: `${plural(l.calendar.busiest_day.count, unit)} that day.` });
  }
  if (l?.age.oldest_when_liked) {
    const o = l.age.oldest_when_liked;
    out.push({ kicker: 'Oldest find', tone: 'purple', big: o.track.name, text: `${names(o.track)}: ${Math.round(o.age)} years old when you liked it.` });
  }
  if (l?.depth.one_like_pct !== null && l?.depth.one_like_pct !== undefined) {
    out.push({ kicker: 'Explorer', tone: 'dark', big: `${Math.round(l.depth.one_like_pct)}%`, text: `of your ${l.depth.artists_total.toLocaleString()} artists you liked just once.` });
  }
  return out;
}
