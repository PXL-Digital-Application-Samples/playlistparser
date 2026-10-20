<script setup>
import { computed, ref } from 'vue';
import { useFlip } from '../flip.js';
import { heroName } from '../transitions.js';

// Treemap of album covers: tile area = number of likes for that album.
const props = defineProps({
  albums: { type: Array, required: true }, // [{ id, name, artist, image, image_lg, count }]
  unit: { type: String, default: 'likes' },
  height: { type: Number, default: 480 },
  limit: { type: Number, default: 24 },
});

// Squarified treemap (Bruls et al.) in a unit square, then scaled by CSS %.
function squarify(values, x, y, w, h, out = []) {
  if (!values.length) return out;
  const total = values.reduce((s, v) => s + v.v, 0);
  if (values.length === 1) {
    out.push({ ...values[0], x, y, w, h });
    return out;
  }
  const short = Math.min(w, h);
  const area = w * h;
  let row = [];
  let best = Infinity;
  let i = 0;
  for (; i < values.length; i++) {
    const next = [...row, values[i]];
    const s = next.reduce((a, v) => a + v.v, 0) * (area / total);
    const worst = Math.max(...next.map((v) => {
      const a = v.v * (area / total);
      return Math.max((short * short * a) / (s * s), (s * s) / (short * short * a));
    }));
    if (worst > best) break;
    best = worst;
    row = next;
  }
  const rowArea = row.reduce((a, v) => a + v.v, 0) * (area / total);
  if (w >= h) {
    const rw = rowArea / h;
    let cy = y;
    for (const v of row) {
      const vh = (v.v * (area / total)) / rw;
      out.push({ ...v, x, y: cy, w: rw, h: vh });
      cy += vh;
    }
    return squarify(values.slice(i), x + rw, y, w - rw, h, out);
  }
  const rh = rowArea / w;
  let cx = x;
  for (const v of row) {
    const vw = (v.v * (area / total)) / rh;
    out.push({ ...v, x: cx, y, w: vw, h: rh });
    cx += vw;
  }
  return squarify(values.slice(i), x, y + rh, w, h - rh, out);
}

const tiles = computed(() => {
  const ratio = 680 / props.height;
  const vals = props.albums.filter((a) => a.image && a.count > 0).slice(0, props.limit).map((a) => ({ ...a, v: a.count }));
  return squarify(vals, 0, 0, ratio, 1).map((t) => ({
    ...t,
    // Tile width as a share of the viewport, so the browser picks 300px or
    // 640px covers (srcset) and big tiles stay sharp on high-DPI screens.
    sizes: `${Math.max(8, Math.ceil((t.w / ratio) * 100))}vw`,
    // Caption size follows the tile size (on the 680 x height design grid);
    // the smallest tiles show just the album name on one line.
    size: (t.w / ratio) * 680 < 100 || t.h * props.height < 80 ? 'tiny' : (t.w / ratio) * 680 < 160 ? 'small' : 'big',
    style: {
      left: `${(t.x / ratio) * 100}%`, top: `${t.y * 100}%`,
      width: `${(t.w / ratio) * 100}%`, height: `${t.h * 100}%`,
    },
  }));
});
// When the albums change (e.g. the album-save switch), tiles glide to their new size.
const wall = ref(null);
useFlip(wall, '.wall-tile', () => props.albums, { duration: 0.9 });
</script>

<template>
  <div ref="wall" class="wall" :style="{ height: `${height}px` }" role="list" aria-label="Album cover wall, larger covers have more likes">
    <figure v-for="t in tiles" :key="t.id" class="wall-tile" :class="t.size" :style="t.style" role="listitem">
      <router-link :to="`/album/${t.id}`" class="sp-cover tile-a" :title="t.name">
      <img
        :style="heroName(`/album/${t.id}`)"
        :src="t.image"
        :srcset="t.image_lg ? `${t.image} 300w, ${t.image_lg} 640w` : undefined"
        :sizes="t.sizes"
        :alt="`${t.name} by ${t.artist}`"
        loading="lazy"
        decoding="async"
      />
      <figcaption>
        <strong>{{ t.name }}</strong>
        <span>{{ t.artist }} · {{ t.count }} {{ t.count === 1 ? unit.replace(/s$/, '') : unit }}</span>
      </figcaption>
      </router-link>
    </figure>
  </div>
</template>

<style scoped>
.wall { position: relative; width: 100%; border-radius: 12px; overflow: hidden; background: var(--cover-bg); }
.wall-tile { position: absolute; margin: 0; padding: 1px; overflow: hidden; }
.wall-tile img { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 2px; transition: transform 0.3s ease, filter 0.3s ease; }
.wall-tile figcaption {
  position: absolute; inset: auto 1px 1px 1px;
  display: flex; flex-direction: column; gap: 1px;
  padding: 18px 8px 6px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.55) 35%, rgba(0, 0, 0, 0.9));
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  color: #fff; font-size: 12px; line-height: 1.25;
  transition: opacity 0.2s ease;
}
.wall-tile.big figcaption { font-size: 14px; padding: 28px 10px 8px; }
.wall-tile.small figcaption { font-size: 11px; padding: 16px 6px 4px; }
.wall-tile.tiny figcaption { font-size: 10px; padding: 12px 4px 3px; }
.wall-tile.tiny figcaption span { display: none; }
.wall-tile figcaption strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wall-tile figcaption span { opacity: 0.85; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wall-tile.tiny:hover figcaption span, .wall-tile.tiny:focus-within figcaption span { display: block; }
.wall-tile:hover img, .wall-tile:focus-within img { transform: scale(1.04); filter: saturate(1.15); }
.wall-tile-a { display: block; width: 100%; height: 100%; position: relative; }
.wall-tile-a:focus-visible { outline: 3px solid var(--focus); outline-offset: -3px; }
@media (prefers-reduced-motion: reduce) { .wall-tile img { transition: none; } }
</style>
