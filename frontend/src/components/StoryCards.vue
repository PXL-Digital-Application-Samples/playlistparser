<script setup>
// Highlight cards, one fact each, in a row that scrolls sideways (swipe on
// touch screens; arrow buttons beside the row with a mouse). A card with `to`
// links to that page in the app.
import { ref, onMounted, onBeforeUnmount } from 'vue';

defineProps({ cards: { type: Array, required: true } }); // [{ kicker, big, text, image?, to? }]

const strip = ref(null);
const atStart = ref(true);
const atEnd = ref(false);
const scroll = (dir) => strip.value?.scrollBy({ left: dir * strip.value.clientWidth * 0.8, behavior: 'smooth' });
// Each arrow shows only when there is something to scroll to on its side.
function update() {
  const el = strip.value;
  if (!el) return;
  atStart.value = el.scrollLeft < 4;
  atEnd.value = el.scrollLeft + el.clientWidth > el.scrollWidth - 4;
}
let ro = null;
onMounted(() => {
  update();
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(update);
    ro.observe(strip.value);
  }
});
onBeforeUnmount(() => ro?.disconnect());
</script>

<template>
  <div class="stories">
    <button v-show="!atStart" class="nav prev" aria-label="Previous highlights" @click="scroll(-1)">‹</button>
    <div ref="strip" class="strip" tabindex="0" aria-label="Highlights, scroll sideways" @scroll.passive="update">
      <component
        :is="c.to ? 'router-link' : 'article'"
        v-for="c in cards"
        :key="c.kicker"
        :to="c.to || undefined"
        class="story"
        :class="{ linked: c.to }"
      >
        <img v-if="c.image" :src="c.image" alt="" class="story-img" loading="lazy" />
        <p class="kicker">{{ c.kicker }}</p>
        <p class="big">{{ c.big }}</p>
        <p class="text">{{ c.text }}</p>
      </component>
    </div>
    <button v-show="!atEnd" class="nav next" aria-label="More highlights" @click="scroll(1)">›</button>
  </div>
</template>

<style scoped>
.stories { position: relative; }
.strip {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(220px, 250px);
  gap: 12px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  padding-bottom: 6px;
  scrollbar-width: none;
}
.strip::-webkit-scrollbar { display: none; }
.story {
  position: relative;
  scroll-snap-align: start;
  border-radius: var(--radius);
  padding: 16px 18px;
  min-height: 176px;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  text-decoration: none;
  overflow: hidden;
}
.story.linked:hover { border-color: var(--border-strong); background: var(--surface-raised); }
.story-img { position: absolute; top: 14px; right: 14px; width: 44px; height: 44px; border-radius: 8px; object-fit: cover; box-shadow: var(--shadow); }
.kicker { margin: 0; font-size: 11.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--accent-text); max-width: calc(100% - 52px); }
.big { margin: 12px 0 6px; font-family: var(--font-display); font-size: 1.45rem; font-weight: 700; line-height: 1.12; overflow-wrap: anywhere; }
.text { margin: auto 0 0; font-size: 14px; color: var(--muted); }
.nav {
  position: absolute; top: 50%; transform: translateY(-50%); z-index: 2;
  width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--border);
  background: var(--surface-raised); color: var(--text); font-size: 20px; line-height: 1; cursor: pointer;
  box-shadow: var(--shadow);
}
.prev { left: -14px; }
.next { right: -14px; }
@media (hover: none), (max-width: 640px) { .nav { display: none; } }
</style>
