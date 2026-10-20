<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { gsap } from 'gsap';
import { motionOn } from '../motion.js';
import { plural } from '../playlistCache.js';

// iPod-style Cover Flow: the centred cover faces you, the others tilt away
// on both sides with a reflection underneath. Drag, scroll or use the arrow
// keys; it snaps to the nearest cover with momentum. Clicking the centred
// cover opens it; clicking another one brings it to the centre.
const props = defineProps({
  items: { type: Array, required: true }, // [{ id, name, sub, image, to, liked? }]
});
const router = useRouter();

const pos = ref(0); // fractional index of the centred cover
const center = computed(() => Math.max(0, Math.min(props.items.length - 1, Math.round(pos.value))));
const current = computed(() => props.items[center.value]);
const SPACING = 64;
const SIDE = 150;

function style(i) {
  const o = i - pos.value;
  const a = Math.abs(o);
  const s = Math.sign(o);
  const near = Math.min(1, a); // 0 at the centre, 1 from one step away
  return {
    transform: `translateX(${o * SPACING + s * near * SIDE}px) translateZ(${-near * 180 - a * 6}px) rotateY(${-s * near * 62}deg)`,
    zIndex: 1000 - Math.round(a * 10),
    opacity: a > 9 ? 0 : 1,
  };
}

let tween = null;
function goTo(i, duration = 0.55) {
  const target = Math.max(0, Math.min(props.items.length - 1, i));
  tween?.kill();
  if (!motionOn()) {
    pos.value = target;
    return;
  }
  const state = { p: pos.value };
  tween = gsap.to(state, { p: target, duration, ease: 'power3.out', onUpdate: () => (pos.value = state.p) });
}

// ---- Dragging with momentum -------------------------------------------------
let drag = null;
let suppressClick = false; // a drag that ends on a cover isn't a click
function down(e) {
  tween?.kill();
  drag = { x: e.clientX, start: pos.value, last: e.clientX, t: performance.now(), v: 0, moved: 0 };
  e.currentTarget.setPointerCapture?.(e.pointerId);
}
function move(e) {
  if (!drag) return;
  const now = performance.now();
  const dx = e.clientX - drag.last;
  drag.v = dx / Math.max(1, now - drag.t); // px per ms
  drag.last = e.clientX;
  drag.t = now;
  drag.moved += Math.abs(dx);
  pos.value = Math.max(-0.4, Math.min(props.items.length - 0.6, drag.start - (e.clientX - drag.x) / (SPACING * 1.4)));
}
function up() {
  if (!drag) return;
  const fling = -drag.v * 6; // momentum in covers
  const wasDrag = drag.moved > 6;
  drag = null;
  suppressClick = wasDrag;
  if (wasDrag) goTo(Math.round(pos.value + fling), 0.9);
}
function click(i) {
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  if (Math.abs(i - pos.value) < 0.5) router.push(props.items[i].to);
  else goTo(i);
}

let wheelLock = 0;
function wheel(e) {
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (!d) return;
  e.preventDefault();
  const now = performance.now();
  if (now - wheelLock < 90) return;
  wheelLock = now;
  goTo(center.value + Math.sign(d));
}
function key(e) {
  if (e.key === 'ArrowRight') goTo(center.value + 1);
  else if (e.key === 'ArrowLeft') goTo(center.value - 1);
  else if (e.key === 'Home') goTo(0);
  else if (e.key === 'End') goTo(props.items.length - 1);
  else if (e.key === 'Enter' && current.value) router.push(current.value.to);
  else return;
  e.preventDefault();
}

const stage = ref(null);
onMounted(() => stage.value?.addEventListener('wheel', wheel, { passive: false }));
onBeforeUnmount(() => {
  tween?.kill();
  stage.value?.removeEventListener('wheel', wheel);
});
</script>

<template>
  <div class="flow">
    <div
      ref="stage"
      class="stage"
      tabindex="0"
      role="listbox"
      :aria-label="`Playlists, Cover Flow. ${current ? `${current.name}, ${center + 1} of ${items.length}` : ''}. Use the arrow keys; Enter opens.`"
      :aria-activedescendant="current ? `flow-${current.id}` : null"
      @keydown="key"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="up"
    >
      <div class="track">
        <div
          v-for="(it, i) in items"
          :id="`flow-${it.id}`"
          :key="it.id"
          class="item"
          role="option"
          :aria-selected="i === center"
          :style="style(i)"
          @click="click(i)"
        >
          <img v-if="it.image" :src="it.image" alt="" draggable="false" loading="lazy" />
          <span v-else class="noimg" :class="{ liked: it.liked }">{{ it.liked ? '♥' : '♪' }}</span>
        </div>
      </div>
    </div>
    <div v-if="current" class="caption" aria-hidden="true">
      <strong>{{ current.name }}</strong>
      <span>{{ current.sub }}</span>
    </div>
    <input
      class="scrub"
      type="range"
      min="0"
      :max="items.length - 1"
      :value="center"
      aria-label="Scroll through playlists"
      @input="goTo(Number($event.target.value), 0.3)"
    />
    <p class="hint">Drag, scroll or use the arrow keys · click the middle cover to open it · {{ plural(items.length, 'playlist') }}</p>
  </div>
</template>

<style scoped>
.flow { display: flex; flex-direction: column; align-items: center; gap: 10px; }
.stage {
  position: relative; width: 100%; height: 400px; overflow: hidden;
  perspective: 900px; perspective-origin: 50% 40%;
  cursor: grab; touch-action: pan-y; user-select: none; border-radius: var(--radius);
}
.stage:active { cursor: grabbing; }
.stage:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.track { position: absolute; left: 50%; top: 40px; transform-style: preserve-3d; }
.item {
  position: absolute; left: -120px; top: 0; width: 240px; height: 240px;
  transform-style: preserve-3d; will-change: transform; cursor: pointer;
  /* A mirror image under each cover, fading out. */
  -webkit-box-reflect: below 4px linear-gradient(transparent 55%, rgba(255, 255, 255, 0.28));
}
.item img, .noimg { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 4px; box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45); }
.noimg { display: flex; align-items: center; justify-content: center; font-size: 64px; color: var(--faint); background: var(--surface-muted); }
/* Fixed artwork colours: it stands in for the Liked Songs cover. */
.noimg.liked { color: #fff; background: linear-gradient(135deg, #4a1fb8 0%, #7f6bd8 55%, #b9d9d3 100%); }
.caption { display: flex; flex-direction: column; align-items: center; text-align: center; min-height: 48px; }
.caption strong { font-family: var(--font-display); font-size: 1.3rem; }
.caption span { font-size: 14px; color: var(--muted); }
.scrub { width: min(520px, 90%); accent-color: var(--mark); }
.hint { margin: 0; font-size: 12.5px; color: var(--muted); }
@media (max-width: 640px) {
  .stage { height: 300px; }
  .item { width: 170px; height: 170px; left: -85px; }
}
</style>
