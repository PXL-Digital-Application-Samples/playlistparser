<script setup>
import { lens } from '../settings.js';

// The one switch for "do songs from whole-album saves count?". The setting is
// shared by every page (see settings.js), so Liked Songs numbers always agree.
defineProps({
  handpicked: { type: Number, required: true },
  all: { type: Number, required: true },
  saves: { type: Number, default: null },
});

const toggle = () => (lens.value = lens.value === 'all' ? 'handpicked' : 'all');
</script>

<template>
  <div class="lens-toggle">
    <button
      type="button"
      role="switch"
      class="switch"
      :aria-checked="lens === 'all'"
      @click="toggle"
    >
      <span class="track" aria-hidden="true"><span class="thumb"></span></span>
      <span>Count songs from saved albums</span>
    </button>
    <p class="hint">
      <template v-if="lens === 'all'">
        {{ all.toLocaleString() }} songs, each whole-album save counted as one like.
      </template>
      <template v-else>
        {{ handpicked.toLocaleString() }} songs liked one by one<template v-if="saves">; {{ saves.toLocaleString() }} whole-album saves left out</template>.
      </template>
    </p>
  </div>
</template>

<style scoped>
.lens-toggle { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 14px; }
.switch {
  display: inline-flex; align-items: center; gap: 10px; min-height: 36px;
  font: inherit; font-size: 14px; font-weight: 600; color: var(--text);
  background: none; border: none; padding: 4px 0; cursor: pointer;
}
.track {
  position: relative; width: 36px; height: 20px; border-radius: 999px; flex: none;
  background: var(--surface-muted); border: 1px solid var(--border); transition: background 0.15s;
}
.thumb {
  position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%;
  background: var(--muted); transition: transform 0.15s, background 0.15s;
}
.switch[aria-checked='true'] .track { background: var(--accent); border-color: var(--accent); }
.switch[aria-checked='true'] .thumb { transform: translateX(16px); background: var(--accent-ink); }
.hint { margin: 0; font-size: 13px; color: var(--muted); }
</style>
