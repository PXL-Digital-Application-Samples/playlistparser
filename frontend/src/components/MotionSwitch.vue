<script setup>
import { calm, setCalm } from '../motion.js';
</script>

<template>
  <button type="button" role="switch" class="motion-switch" :aria-checked="calm" @click="setCalm(!calm)">
    <span class="track" aria-hidden="true"><span class="thumb"></span></span>
    <span>Zen mode</span>
  </button>
</template>

<style scoped>
.motion-switch {
  display: inline-flex; align-items: center; gap: 8px; min-height: 30px;
  font: inherit; font-size: 13px; font-weight: 600; color: var(--muted);
  background: none; border: none; padding: 0; cursor: pointer;
}
.motion-switch:hover { color: var(--text); }
.track {
  position: relative; width: 30px; height: 18px; border-radius: 999px; flex: none;
  background: var(--surface-muted); border: 1px solid var(--border-strong);
}
.thumb {
  position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%;
  background: var(--muted); transition: transform 0.15s;
}
.motion-switch[aria-checked='true'] .track { background: var(--mark); border-color: var(--mark); }
.motion-switch[aria-checked='true'] .thumb { transform: translateX(12px); background: var(--surface); }
</style>
