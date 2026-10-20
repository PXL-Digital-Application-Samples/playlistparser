<script setup>
import { ref } from 'vue';

// "Wrapped"-style highlight cards, one fact each, scrolled horizontally.
defineProps({ cards: { type: Array, required: true } }); // [{ kicker, big, text, tone }]

const strip = ref(null);
const scroll = (dir) => strip.value?.scrollBy({ left: dir * strip.value.clientWidth * 0.8, behavior: 'smooth' });
</script>

<template>
  <div class="stories">
    <div ref="strip" class="strip" tabindex="0" aria-label="Highlights, scroll sideways">
      <article v-for="c in cards" :key="c.kicker" class="story" :class="`tone-${c.tone}`">
        <p class="kicker">{{ c.kicker }}</p>
        <p class="big">{{ c.big }}</p>
        <p class="text">{{ c.text }}</p>
      </article>
    </div>
    <div class="nav">
      <button class="icon-round" aria-label="Previous highlights" @click="scroll(-1)">‹</button>
      <button class="icon-round" aria-label="More highlights" @click="scroll(1)">›</button>
    </div>
  </div>
</template>

<style scoped>
.stories { position: relative; }
.strip {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(220px, 260px);
  gap: 12px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  padding-bottom: 6px;
  scrollbar-width: thin;
}
.story {
  scroll-snap-align: start;
  border-radius: 16px;
  padding: 18px;
  min-height: 190px;
  display: flex;
  flex-direction: column;
}
.kicker { margin: 0; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
.big { margin: 10px 0 6px; font-size: 1.6rem; font-weight: 800; line-height: 1.15; overflow-wrap: anywhere; }
.text { margin: auto 0 0; font-size: 14px; }
.tone-green { background: #d3f2df; color: #0b3d20; }
.tone-purple { background: #e4ddfb; color: #2a1a6e; }
.tone-coral { background: #fde0d6; color: #6b2310; }
.tone-amber { background: #fdefc8; color: #5a3a00; }
.tone-blue { background: #d9e9fb; color: #0b365e; }
.tone-dark { background: #1c1f23; color: #f1f3f5; }
.nav { display: flex; justify-content: flex-end; gap: 6px; margin-top: 6px; }
.icon-round {
  width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--border);
  background: var(--surface); color: var(--text); font-size: 18px; line-height: 1; cursor: pointer;
}
</style>
