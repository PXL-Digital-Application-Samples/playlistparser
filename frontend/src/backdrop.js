import { ref } from 'vue';
import { coverTint } from './coverTint.js';

// The colour the animated background is tinted with. Pages about one thing
// (an artist, an album, a playlist) set it from their cover; every
// navigation resets it. Sampling a cover is async, so each navigation starts
// a new "epoch" and results that arrive after leaving their page are dropped.
export const backdropTint = ref(null); // 'rgb(r g b)' or null for the accent
let epoch = 0;

export function resetBackdropTint() {
  epoch++;
  backdropTint.value = null;
}

// Tints the background with a cover's colour (or `fallback`), unless the
// page changed while the colour was being sampled.
export async function tintFromCover(url, fallback = null) {
  const mine = epoch;
  const color = url ? await coverTint(url) : null;
  if (mine === epoch) backdropTint.value = color || fallback;
  return color;
}
