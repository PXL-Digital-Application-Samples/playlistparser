<script setup>
import { ref, computed } from 'vue';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY } from 'd3-force';
import { spotifyUrl } from '../api.js';
import { familyColor } from '../families.js';

// Your top artists as a network: lines = Last.fm says they're similar, dot
// size = your likes, colour = genre family. Dashed "ghost" dots are artists
// you don't have yet that are similar to several of your favourites.
const props = defineProps({
  nodes: { type: Array, required: true },
  links: { type: Array, required: true },
});

const W = 680, H = 460;
const radius = (n) => (n.ghost ? 7 : Math.min(26, 5 + Math.sqrt(n.count) * 3));

const layout = computed(() => {
  const nodes = props.nodes.map((n) => ({ ...n, r: radius(n) }));
  const links = props.links.map((l) => ({ ...l }));
  const sim = forceSimulation(nodes)
    .force('link', forceLink(links).id((d) => d.id).distance((l) => 50 + (1 - l.match) * 90).strength((l) => 0.15 + l.match * 0.5))
    .force('charge', forceManyBody().strength(-140))
    .force('center', forceCenter(W / 2, H / 2))
    .force('x', forceX(W / 2).strength(0.05))
    .force('y', forceY(H / 2).strength(0.08))
    .force('collide', forceCollide((d) => d.r + 12))
    .stop();
  for (let i = 0; i < 320; i++) sim.tick();
  for (const n of nodes) {
    n.x = Math.max(n.r + 4, Math.min(W - n.r - 4, n.x));
    n.y = Math.max(n.r + 4, Math.min(H - n.r - 14, n.y));
    // Label position clamped so text never runs off the sides.
    n.lx = Math.max(48, Math.min(W - 48, n.x));
  }
  // Label the 14 biggest artists and all suggestions; others on hover.
  const big = new Set([...nodes].filter((n) => !n.ghost).sort((a, b) => b.count - a.count).slice(0, 14).map((n) => n.id));
  for (const n of nodes) n.labelled = n.ghost || big.has(n.id);
  return { nodes, links };
});

const hover = ref(null);
const neighbours = computed(() => {
  const set = new Set();
  if (!hover.value) return set;
  for (const l of layout.value.links) {
    if (l.source.id === hover.value) set.add(l.target.id);
    if (l.target.id === hover.value) set.add(l.source.id);
  }
  set.add(hover.value);
  return set;
});
const dim = (id) => hover.value && !neighbours.value.has(id);
const href = (n) => (n.spotify_id ? spotifyUrl('artist', n.spotify_id) : `https://open.spotify.com/search/${encodeURIComponent(n.name)}`);
const short = (s) => (s.length > 16 ? `${s.slice(0, 15)}…` : s);
</script>

<template>
  <div>
    <p v-if="!links.length" class="muted">Similar-artist data from Last.fm is still being collected.</p>
    <svg :viewBox="`0 0 ${W} ${H}`" width="100%" role="img" aria-label="Network of your top artists and similar artists">
      <line
        v-for="l in layout.links"
        :key="l.source.id + l.target.id"
        :x1="l.source.x" :y1="l.source.y" :x2="l.target.x" :y2="l.target.y"
        :stroke="l.ghost ? '#b8bcc2' : '#8f96a0'"
        :stroke-dasharray="l.ghost ? '3 3' : null"
        :stroke-width="0.6 + l.match * 1.8"
        :opacity="dim(l.source.id) || dim(l.target.id) ? 0.08 : 0.55"
      />
      <a
        v-for="n in layout.nodes"
        :key="n.id"
        :href="href(n)"
        target="_blank"
        rel="noopener noreferrer"
        tabindex="-1"
        :opacity="dim(n.id) ? 0.2 : 1"
        @mouseenter="hover = n.id"
        @mouseleave="hover = null"
        @focus="hover = n.id"
        @blur="hover = null"
      >
        <title>{{ n.ghost ? `${n.name}: similar to several of your artists (not in your Liked Songs)` : `${n.name}: ${n.count} likes` }}</title>
        <circle
          :cx="n.x" :cy="n.y" :r="n.r"
          :style="{ fill: n.ghost ? 'var(--surface)' : familyColor(n.family) }"
          :stroke="n.ghost ? '#7f6bd8' : 'white'"
          :stroke-width="n.ghost ? 1.6 : 1.2"
          :stroke-dasharray="n.ghost ? '3 2' : null"
        />
        <text
          v-if="hover ? neighbours.has(n.id) : n.labelled"
          :x="n.lx" :y="n.y + n.r + 11"
          text-anchor="middle"
          class="label"
          :class="{ ghost: n.ghost, strong: hover === n.id }"
        >{{ short(n.name) }}</text>
      </a>
    </svg>
    <p class="muted small">
      Lines: Last.fm calls them similar. Dot size: your likes. Dashed dots: artists you don't have yet, similar to two or more of yours. Click to open in Spotify.
    </p>
  </div>
</template>

<style scoped>
.label { font-size: 10.5px; fill: var(--text); paint-order: stroke; stroke: var(--surface); stroke-width: 3px; stroke-linejoin: round; }
.label.ghost { fill: #5a49b8; font-style: italic; }
.label.strong { font-weight: 700; font-size: 12px; }
a { cursor: pointer; }
.small { font-size: 13px; }
</style>
