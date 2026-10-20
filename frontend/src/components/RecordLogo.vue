<script setup>
import { ref } from 'vue';
import { gsap } from 'gsap';
import { motionOn } from '../motion.js';

// The app's record logo, scratchable: grab it and turn it like a DJ. It
// scratches (a generated sound whose pitch follows your speed), keeps
// spinning when you let go, and a hard spin makes the page wobble. A plain
// click still works as the link around it.
const el = ref(null);
let rot = 0;
let drag = null;
let audio = null;
let noise = null;
let lastSound = 0;
let spinTween = null;

function sound(velocity) {
  const now = performance.now();
  if (now - lastSound < 35) return;
  lastSound = now;
  if (!audio) {
    audio = new (window.AudioContext || window.webkitAudioContext)();
    noise = audio.createBuffer(1, audio.sampleRate * 0.5, audio.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  }
  const v = Math.min(3, Math.abs(velocity));
  const src = audio.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 0.4 + v * 0.9;
  const band = audio.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = (velocity > 0 ? 500 : 300) + v * 900;
  band.Q.value = 4;
  const gain = audio.createGain();
  const t = audio.currentTime;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  src.connect(band).connect(gain).connect(audio.destination);
  src.start(t);
  src.stop(t + 0.08);
}

const angle = (e, c) => Math.atan2(e.clientY - c.y, e.clientX - c.x);
function down(e) {
  if (!motionOn()) return;
  e.preventDefault();
  spinTween?.kill();
  const r = el.value.getBoundingClientRect();
  const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  drag = { c, a: angle(e, c), t: performance.now(), v: 0, total: 0 };
  el.value.setPointerCapture?.(e.pointerId);
  audio?.resume?.();
}
function move(e) {
  if (!drag) return;
  const a = angle(e, drag.c);
  let d = a - drag.a;
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  const now = performance.now();
  const deg = (d * 180) / Math.PI;
  drag.v = deg / Math.max(1, now - drag.t); // degrees per ms
  drag.a = a;
  drag.t = now;
  drag.total += Math.abs(deg);
  rot += deg;
  gsap.set(el.value, { rotation: rot });
  if (Math.abs(deg) > 1) sound(drag.v);
}
function up() {
  if (!drag) return;
  const { v, total } = drag;
  drag = null;
  if (total > 15) suppressClick = true;
  // Let it spin on and slow down.
  const state = { r: rot };
  spinTween = gsap.to(state, {
    r: rot + v * 900, duration: 1.6 + Math.min(2, Math.abs(v)), ease: 'power3.out',
    onUpdate: () => {
      rot = state.r;
      gsap.set(el.value, { rotation: rot });
    },
  });
  // Spun hard: the whole page wobbles.
  if (Math.abs(v) > 1.2) {
    gsap.fromTo('.main', { rotation: 0, x: 0 }, {
      rotation: () => gsap.utils.random(-1.6, 1.6), x: () => gsap.utils.random(-8, 8),
      duration: 0.07, repeat: 9, yoyo: true, ease: 'sine.inOut', clearProps: 'transform',
    });
  }
}

// After a scratch, the click that ends it must not follow the link.
let suppressClick = false;
function click(e) {
  if (!suppressClick) return;
  suppressClick = false;
  e.preventDefault();
  e.stopPropagation();
}
</script>

<template>
  <span
    ref="el"
    class="mark scratch"
    aria-hidden="true"
    @pointerdown="down"
    @pointermove="move"
    @pointerup="up"
    @pointercancel="up"
    @click.capture="click"
  ></span>
</template>

<style scoped>
.scratch { cursor: grab; touch-action: none; }
.scratch:active { cursor: grabbing; }
</style>
