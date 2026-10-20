import { coverTint } from './coverTint.js';

// Draws a highlight as a 1080 x 1920 image (the story format of most social
// apps) and shares or downloads it. Always dark, whatever the app theme, so
// every card looks the same. Cover images must allow CORS (Spotify's do);
// without that the card is drawn without the cover.
const W = 1080;
const H = 1920;
const PAD = 96;
const DISPLAY = '"Bricolage Grotesque Variable", "Figtree Variable", system-ui, sans-serif';
const BODY = '"Figtree Variable", system-ui, sans-serif';
const COLORS = { bg: '#0e1210', text: '#ecf1ed', muted: '#a1ada5', accent: '#f0a95b' };

function loadImage(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Splits text into lines that fit `width`; returns at most `max` lines, the
// last one ending in "…" when the text is longer.
function wrap(ctx, text, width, max) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= width || !line) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= max) return lines;
  const kept = lines.slice(0, max);
  let last = kept[max - 1];
  while (last && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
  kept[max - 1] = `${last.trimEnd()}…`;
  return kept;
}

function roundedImage(ctx, img, x, y, size, r) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, r);
  ctx.clip();
  // Cover: crop the image to a square.
  const s = Math.min(img.width, img.height);
  ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, x, y, size, size);
  ctx.restore();
}

export async function renderCard({ kicker, big, text, image }) {
  await Promise.all([
    document.fonts.load(`700 120px ${DISPLAY}`),
    document.fonts.load(`500 48px ${BODY}`),
  ]).catch(() => {});
  const [img, tint] = await Promise.all([loadImage(image), coverTint(image)]);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Background: the cover's colour fading into the dark ground.
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);
  if (tint) {
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.75);
    g.addColorStop(0, tint);
    g.addColorStop(1, COLORS.bg);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  // App name, top left, with the record mark.
  ctx.fillStyle = COLORS.accent;
  ctx.beginPath();
  ctx.arc(PAD + 22, PAD + 22, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.bg;
  ctx.beginPath();
  ctx.arc(PAD + 22, PAD + 22, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.text;
  ctx.font = `700 40px ${DISPLAY}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('Playlist Parser', PAD + 64, PAD + 24);
  ctx.textBaseline = 'alphabetic';

  let y = 250;
  if (img) {
    const size = 760;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 60;
    ctx.shadowOffsetY = 24;
    ctx.fillStyle = COLORS.bg;
    ctx.beginPath();
    ctx.roundRect(PAD, y, size, size, 28);
    ctx.fill();
    ctx.restore();
    roundedImage(ctx, img, PAD, y, size, 28);
    y += size + 130;
  } else {
    y = 720;
  }

  const width = W - PAD * 2;
  ctx.fillStyle = COLORS.accent;
  ctx.font = `700 42px ${BODY}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
  ctx.fillText(String(kicker).toUpperCase(), PAD, y);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  y += 40;

  // The fact: as large as fits in three lines.
  let size = 128;
  let lines;
  for (; size >= 64; size -= 8) {
    ctx.font = `700 ${size}px ${DISPLAY}`;
    lines = wrap(ctx, big, width, 3);
    if (!lines.at(-1).endsWith('…')) break;
  }
  ctx.fillStyle = COLORS.text;
  for (const line of lines) {
    y += size * 1.08;
    ctx.fillText(line, PAD, y);
  }

  if (text) {
    y += 96;
    ctx.fillStyle = COLORS.muted;
    ctx.font = `500 48px ${BODY}`;
    for (const line of wrap(ctx, text, width, img ? 3 : 4)) {
      ctx.fillText(line, PAD, y);
      y += 66;
    }
  }

  ctx.fillStyle = COLORS.muted;
  ctx.font = `500 34px ${BODY}`;
  ctx.fillText(new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }), PAD, H - PAD);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

// Opens the share sheet where the device supports sharing files (phones),
// otherwise downloads the PNG.
export async function shareCard(card) {
  const blob = await renderCard(card);
  if (!blob) throw new Error('Could not draw the image.');
  const name = `${String(card.kicker).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'highlight'}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: card.kicker });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      // Fall through to a download.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
