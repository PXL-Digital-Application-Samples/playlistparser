<script setup>
import { computed } from 'vue';
import { play, current, status, trackKey } from '../player.js';

// Round play button laid over a cover (the parent needs position: relative
// and the class "playable"). Shows on hover/focus, always on touch screens.
const props = defineProps({
  track: { type: Object, required: true }, // { id?, name, artist, isrc?, image? }
  size: { type: Number, default: 34 },
  center: { type: Boolean, default: false }, // centred on a small cover instead of in its corner
});
const mine = computed(() => current.value?.key === trackKey(props.track));
const playing = computed(() => mine.value && (status.value === 'playing' || status.value === 'loading'));
</script>

<template>
  <button
    type="button"
    class="play-btn"
    :class="{ on: playing, center }"
    :style="{ width: `${size}px`, height: `${size}px` }"
    :aria-label="`${playing ? 'Stop' : 'Play a preview of'} ${track.name}`"
    @click.stop.prevent="play(track)"
  >
    <svg v-if="!playing" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg>
    <span v-else class="eq" aria-hidden="true"><i></i><i></i><i></i></span>
  </button>
</template>

<style scoped>
.play-btn {
  position: absolute; z-index: 3; right: 6px; bottom: 6px;
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: 50%; padding: 0; cursor: pointer;
  background: var(--accent); color: var(--accent-ink);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
  opacity: 0; transform: translateY(6px) scale(0.85);
  transition: opacity 0.15s, transform 0.2s cubic-bezier(0.2, 1.4, 0.4, 1);
}
.play-btn.center { inset: 0; margin: auto; }
.play-btn svg { width: 55%; height: 55%; margin-left: 8%; }
/* Wrapped whole in :global: Vue drops anything after a :global(...) part. */
:global(.playable:hover .play-btn), :global(.playable:focus-within .play-btn), .play-btn:focus-visible, .play-btn.on {
  opacity: 1; transform: none;
}
.play-btn:hover { transform: scale(1.08); }
@media (hover: none) { .play-btn { opacity: 1; transform: none; } }
/* Little equalizer while this song plays. */
.eq { display: inline-flex; align-items: flex-end; gap: 2px; height: 42%; }
.eq i { width: 3px; background: currentColor; border-radius: 1px; animation: eq 0.8s ease-in-out infinite; }
.eq i:nth-child(2) { animation-delay: -0.3s; }
.eq i:nth-child(3) { animation-delay: -0.55s; }
@keyframes eq { 0%, 100% { height: 30%; } 50% { height: 100%; } }
</style>
