<script setup>
import { ref, watch, nextTick } from 'vue';
import { gsap } from 'gsap';
import { disco, toggleDisco } from '../disco.js';

// The disco ball (drops in on a string, spins) and the light spots that
// sweep over the page. Click the ball to stop the party.
const ball = ref(null);
watch(disco, async (on) => {
  if (!on) return;
  await nextTick();
  gsap.from(ball.value, { y: -260, duration: 1.1, ease: 'bounce.out' });
});
</script>

<template>
  <template v-if="disco">
    <div class="spots" aria-hidden="true"></div>
    <button ref="ball" type="button" class="ball-wrap" aria-label="Stop disco mode" title="Stop the party" @click="toggleDisco">
      <span class="string"></span>
      <span class="ball"></span>
    </button>
  </template>
</template>

<style scoped>
/* Fixed colours on purpose: a mirror ball and coloured stage lights. */
.spots {
  position: fixed; inset: 0; z-index: 80; pointer-events: none; mix-blend-mode: screen; opacity: 0.55;
  background:
    radial-gradient(circle at 20% 30%, rgba(255, 80, 180, 0.35) 0 6%, transparent 12%),
    radial-gradient(circle at 70% 20%, rgba(80, 200, 255, 0.35) 0 5%, transparent 11%),
    radial-gradient(circle at 40% 75%, rgba(255, 220, 80, 0.35) 0 5%, transparent 10%),
    radial-gradient(circle at 85% 65%, rgba(120, 255, 140, 0.3) 0 6%, transparent 12%);
  background-size: 140% 140%;
  animation: sweep 3.2s ease-in-out infinite alternate, flicker 0.5s steps(2) infinite;
}
@keyframes sweep {
  0% { background-position: 0% 0%, 100% 0%, 0% 100%, 100% 100%; }
  100% { background-position: 100% 100%, 0% 100%, 100% 0%, 0% 0%; }
}
@keyframes flicker { 50% { opacity: 0.4; } }
.ball-wrap {
  position: fixed; top: 0; left: calc(50% + var(--rail-w) / 2 + 40px); z-index: 85; display: flex; flex-direction: column; align-items: center;
  background: none; border: none; padding: 0; cursor: pointer;
}
.string { width: 2px; height: 60px; background: #9aa0a6; }
.ball {
  width: 74px; height: 74px; border-radius: 50%;
  background:
    radial-gradient(circle at 32% 28%, rgba(255, 255, 255, 0.95) 0 6%, transparent 18%),
    repeating-conic-gradient(from 0deg, #d9dde3 0 10deg, #6b7280 10deg 20deg),
    radial-gradient(circle, #f3f4f6, #4b5563);
  background-blend-mode: screen, multiply, normal;
  box-shadow: 0 0 40px rgba(255, 255, 255, 0.45), inset -10px -12px 20px rgba(0, 0, 0, 0.45);
  animation: spin-ball 2.4s linear infinite;
}
@keyframes spin-ball { to { rotate: 360deg; } }
@media (max-width: 960px) { .ball-wrap { left: 58%; } }
</style>
