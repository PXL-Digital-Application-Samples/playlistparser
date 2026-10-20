<script setup>
// Ranked cover grid: #1 gets a big tile, the rest smaller ones.
defineProps({
  items: { type: Array, required: true }, // [{ id, name, sub, image, image_lg, url }]
});
</script>

<template>
  <ol class="grid" aria-label="Ranked by Spotify">
    <li v-for="(it, i) in items" :key="it.id" class="cell" :class="{ hero: i === 0 }">
      <a :href="it.url" target="_blank" rel="noopener noreferrer" class="sp-cover cover-a" :title="`Open ${it.name} in Spotify`">
      <img
        v-if="it.image"
        :src="i === 0 && it.image_lg ? it.image_lg : it.image"
        :srcset="it.image_lg ? `${it.image} 300w, ${it.image_lg} 640w` : undefined"
        :sizes="i === 0 ? '(max-width: 640px) 50vw, 34vw' : '(max-width: 640px) 25vw, 17vw'"
        alt=""
        loading="lazy"
        decoding="async"
      />
      <div v-else class="noimg"></div>
      <span class="rank">{{ i + 1 }}</span>
      <div class="cap">
        <strong>{{ it.name }}</strong>
        <span>{{ it.sub }}</span>
      </div>
      </a>
    </li>
  </ol>
</template>

<style scoped>
.grid {
  list-style: none; margin: 0; padding: 0;
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  grid-auto-rows: 1fr;
  gap: 6px;
}
.cell { position: relative; aspect-ratio: 1; border-radius: 8px; overflow: hidden; background: #111; }
.cell.hero { grid-column: span 2; grid-row: span 2; }
.cover-a { position: absolute; inset: 0; }
.cover-a:focus-visible { outline: 3px solid var(--focus); outline-offset: -3px; border-radius: 8px; }
.cell img, .noimg { width: 100%; height: 100%; object-fit: cover; display: block; }
.noimg { background: var(--surface-muted); }
.rank {
  position: absolute; top: 6px; left: 6px;
  min-width: 22px; height: 22px; padding: 0 6px; border-radius: 11px;
  background: rgba(0, 0, 0, 0.7); color: #fff; font-size: 12px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.cap {
  position: absolute; inset: auto 0 0 0; padding: 18px 8px 6px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.55) 35%, rgba(0, 0, 0, 0.9));
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  color: #fff; font-size: 12px; line-height: 1.25;
  display: flex; flex-direction: column;
}
.cap strong, .cap span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cap span { opacity: 0.85; }
.cell:not(.hero) .cap { font-size: 11px; padding: 22px 6px 5px; }
.hero .cap { font-size: 15px; padding: 30px 12px 10px; }
@media (max-width: 640px) { .grid { grid-template-columns: repeat(4, 1fr); } }
</style>
