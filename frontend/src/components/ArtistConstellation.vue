<script setup>
import { ref, shallowRef, computed, watch, onBeforeUnmount } from 'vue';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY } from 'd3-force';
import { useRouter } from 'vue-router';
import { familyColor } from '../families.js';
import { motionOn } from '../motion.js';

// Your top artists as a network: lines = Last.fm says they're similar, dot
// size = your likes, colour = genre family. Dashed "ghost" dots are artists
// you don't have yet that are similar to several of your favourites.
// It's a live physics simulation: drag an artist and its similar artists
// follow; fling it and it bounces back. A press without dragging opens it.
const props = defineProps({
  nodes: { type: Array, required: true },
  links: { type: Array, required: true },
});

const W = 680, H = 460;
const radius = (n) => (n.ghost ? 7 : Math.min(26, 5 + Math.sqrt(n.count) * 3));

const graph = shallowRef({ nodes: [], links: [] });
const frame = ref(0); // bumped on every simulation tick, to re-render positions
let sim = null;
let raf = 0;

function build() {
  sim?.stop();
  const nodes = props.nodes.map((n) => ({ ...n, r: radius(n) }));
  const links = props.links.map((l) => ({ ...l }));
  sim = forceSimulation(nodes)
    .force('link', forceLink(links).id((d) => d.id).distance((l) => 50 + (1 - l.match) * 90).strength((l) => 0.15 + l.match * 0.5))
    .force('charge', forceManyBody().strength(-140))
    .force('center', forceCenter(W / 2, H / 2))
    .force('x', forceX(W / 2).strength(0.05))
    .force('y', forceY(H / 2).strength(0.08))
    .force('collide', forceCollide((d) => d.r + 12))
    .velocityDecay(0.25)
    .stop();
  for (let i = 0; i < 320; i++) sim.tick();
  // Label the 14 biggest artists and all suggestions; others on hover.
  const big = new Set([...nodes].filter((n) => !n.ghost).sort((a, b) => b.count - a.count).slice(0, 14).map((n) => n.id));
  for (const n of nodes) n.labelled = n.ghost || big.has(n.id);
  clamp(nodes);
  graph.value = { nodes, links };
}
watch(() => [props.nodes, props.links], build, { immediate: true });

function clamp(nodes) {
  for (const n of nodes) {
    n.x = Math.max(n.r + 4, Math.min(W - n.r - 4, n.x));
    n.y = Math.max(n.r + 4, Math.min(H - n.r - 14, n.y));
  }
}

// Runs the simulation frame by frame until it settles.
function loop() {
  cancelAnimationFrame(raf);
  const step = () => {
    sim.tick();
    clamp(graph.value.nodes);
    frame.value++;
    if (sim.alpha() > sim.alphaMin() || dragging) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}
onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  sim?.stop();
});

// ---- Dragging ---------------------------------------------------------------
const svg = ref(null);
let dragging = null;
let moved = 0;
let lastPos = null;
function toSvg(e) {
  const pt = svg.value.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  return pt.matrixTransform(svg.value.getScreenCTM().inverse());
}
function down(e, n) {
  if (!motionOn()) return;
  dragging = n;
  moved = 0;
  lastPos = toSvg(e);
  n.fx = n.x;
  n.fy = n.y;
  e.currentTarget.setPointerCapture?.(e.pointerId);
  sim.alphaTarget(0.3).alpha(Math.max(sim.alpha(), 0.3));
  loop();
}
function move(e) {
  if (!dragging) return;
  const p = toSvg(e);
  moved += Math.abs(p.x - lastPos.x) + Math.abs(p.y - lastPos.y);
  dragging.vx = (p.x - lastPos.x) * 0.9;
  dragging.vy = (p.y - lastPos.y) * 0.9;
  dragging.fx = p.x;
  dragging.fy = p.y;
  lastPos = p;
}
function up() {
  if (!dragging) return;
  // Let go: keep the throw's momentum and let the springs pull it back.
  dragging.fx = null;
  dragging.fy = null;
  dragging = null;
  sim.alphaTarget(0);
}

// ---- Hover and links ----------------------------------------------------------
const hover = ref(null);
const neighbours = computed(() => {
  const set = new Set();
  if (!hover.value) return set;
  for (const l of graph.value.links) {
    if (l.source.id === hover.value) set.add(l.target.id);
    if (l.target.id === hover.value) set.add(l.source.id);
  }
  set.add(hover.value);
  return set;
});
const dim = (id) => hover.value && !neighbours.value.has(id);
// Your artists open their page in the app; suggestions open a Spotify search.
const router = useRouter();
const href = (n) => (n.spotify_id && !n.ghost ? `/artist/${n.spotify_id}` : `https://open.spotify.com/search/${encodeURIComponent(n.name)}`);
function open(e, n) {
  if (moved > 6) return e.preventDefault(); // that was a drag, not a click
  if (n.ghost || !n.spotify_id || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  router.push(href(n));
}
const short = (s) => (s.length > 16 ? `${s.slice(0, 15)}…` : s);
const lx = (n) => Math.max(48, Math.min(W - 48, n.x)); // labels never run off the sides
</script>

<template>
  <div>
    <p v-if="!links.length" class="muted">Similar-artist data from Last.fm is still being collected.</p>
    <svg
      ref="svg"
      :viewBox="`0 0 ${W} ${H}`"
      width="100%"
      role="img"
      aria-label="Network of your top artists and similar artists"
      :data-frame="frame"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="up"
    >
      <line
        v-for="l in graph.links"
        :key="l.source.id + l.target.id"
        :x1="l.source.x" :y1="l.source.y" :x2="l.target.x" :y2="l.target.y"
        :style="{ stroke: l.ghost ? 'var(--faint)' : 'var(--border-strong)' }"
        :stroke-dasharray="l.ghost ? '3 3' : null"
        :stroke-width="0.6 + l.match * 1.8"
        :opacity="dim(l.source.id) || dim(l.target.id) ? 0.08 : 0.55"
      />
      <a
        v-for="n in graph.nodes"
        :key="n.id"
        :href="href(n)"
        :target="n.ghost ? '_blank' : null"
        :rel="n.ghost ? 'noopener noreferrer' : null"
        tabindex="-1"
        class="node"
        :class="{ grabbed: dragging === n }"
        :opacity="dim(n.id) ? 0.2 : 1"
        @click="open($event, n)"
        @pointerdown="down($event, n)"
        @mouseenter="hover = n.id"
        @mouseleave="hover = null"
      >
        <title>{{ n.ghost ? `${n.name}: similar to several of your artists (not in your Liked Songs)` : `${n.name}: ${n.count} likes` }}</title>
        <circle
          :cx="n.x" :cy="n.y" :r="n.r"
          :style="{ fill: n.ghost ? 'var(--surface)' : familyColor(n.family), stroke: n.ghost ? 'var(--accent-text)' : 'var(--surface)' }"
          :stroke-width="n.ghost ? 1.6 : 1.2"
          :stroke-dasharray="n.ghost ? '3 2' : null"
        />
        <text
          v-if="hover ? neighbours.has(n.id) : n.labelled"
          :x="lx(n)" :y="n.y + n.r + 11"
          text-anchor="middle"
          class="label"
          :class="{ ghost: n.ghost, strong: hover === n.id }"
        >{{ short(n.name) }}</text>
      </a>
    </svg>
    <p class="muted small">
      Lines: Last.fm calls them similar. Dot size: your likes. Dashed dots: artists you don't have yet, similar to two or more of yours.
      Drag an artist to pull its network around; click it for its page, or a suggestion to look it up on Spotify.
    </p>
  </div>
</template>

<style scoped>
.label { font-size: 10.5px; fill: var(--text); paint-order: stroke; stroke: var(--surface); stroke-width: 3px; stroke-linejoin: round; pointer-events: none; }
.label.ghost { fill: var(--accent-text); font-style: italic; }
.label.strong { font-weight: 700; font-size: 12px; }
.node { cursor: grab; touch-action: none; }
.node.grabbed { cursor: grabbing; }
.small { font-size: 13px; }
</style>
