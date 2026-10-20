import { ref } from 'vue';

// The colour the animated background is tinted with. Pages about one thing
// (an artist, an album, a playlist) set it from their cover; others reset it.
export const backdropTint = ref(null); // 'rgb(r g b)' or null for the accent

export function setBackdropTint(color) {
  backdropTint.value = color || null;
}
