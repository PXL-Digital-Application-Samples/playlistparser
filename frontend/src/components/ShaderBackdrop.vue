<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { backdropTint } from '../backdrop.js';
import { calm } from '../motion.js';
import { energy, status, bpm } from '../player.js';

// Full-screen WebGL background: slow domain-warped noise ("liquid aurora")
// in the page's tint colour, behind everything. While a preview plays it
// swells with the music. Drawn at a third of the screen's resolution and
// paused when hidden or in Zen mode, so it stays cheap.
const canvas = ref(null);
let gl = null;
let prog = null;
let raf = 0;
let start = performance.now();
let uni = {};
let base = [0.06, 0.07, 0.065];
let tint = [0.94, 0.66, 0.36];
let target = tint.slice();
let pulse = 0;
let light = false;

const VERT = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `
precision mediump float;
uniform vec2 res; uniform float t; uniform vec3 base; uniform vec3 tint; uniform float pulse; uniform float strength;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
void main() {
  vec2 uv = gl_FragCoord.xy / res; vec2 p = uv * vec2(res.x / res.y, 1.0) * 1.6;
  float s = t * 0.05;
  vec2 q = vec2(fbm(p + s), fbm(p + vec2(5.2, 1.3) - s));
  vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + s * 1.6), fbm(p + 3.0 * q + vec2(8.3, 2.8) - s * 1.2));
  float f = fbm(p + 3.5 * r * (1.0 + pulse * 0.6));
  float glow = smoothstep(0.35, 0.95, f) * (0.65 + pulse * 0.9);
  // Stronger towards the top, fading into the page further down.
  float fade = smoothstep(-0.2, 1.0, uv.y);
  vec3 c = mix(base, tint, glow * strength * fade);
  c += tint * pow(glow, 3.0) * pulse * 0.25 * fade;
  gl_FragColor = vec4(c, 1.0);
}`;

function parseColor(str) {
  const m = String(str).match(/rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/) || [];
  if (m.length) return [m[1] / 255, m[2] / 255, m[3] / 255];
  const h = String(str).trim().replace('#', '');
  if (h.length === 6) return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return null;
}

function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  base = parseColor(cs.getPropertyValue('--bg')) || base;
  light = cs.colorScheme === 'light' || (base[0] + base[1] + base[2]) / 3 > 0.5;
  target = parseColor(backdropTint.value) || parseColor(cs.getPropertyValue('--accent')) || target;
}

function setup() {
  gl = canvas.value.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) return false;
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); // one big triangle
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  for (const n of ['res', 't', 'base', 'tint', 'pulse', 'strength']) uni[n] = gl.getUniformLocation(prog, n);
  return true;
}

function resize() {
  const c = canvas.value;
  const scale = 1 / 3;
  const w = Math.max(1, Math.round(innerWidth * scale));
  const h = Math.max(1, Math.round(innerHeight * scale));
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
    gl.viewport(0, 0, w, h);
  }
}

let last = 0;
function frame(now) {
  raf = requestAnimationFrame(frame);
  const playing = status.value === 'playing';
  // ~30 fps when idle is plenty for slow motion; full rate with music.
  if (!playing && now - last < 33) return;
  last = now;
  resize();
  // Ease towards the target tint and the music's energy.
  for (let i = 0; i < 3; i++) tint[i] += (target[i] - tint[i]) * 0.03;
  const e = playing ? energy() : 0;
  const beat = playing && bpm.value ? 0.15 * Math.max(0, Math.cos(((now / 1000) * bpm.value / 60) * Math.PI * 2)) : 0;
  pulse += (Math.max(e, beat) - pulse) * (e > pulse ? 0.5 : 0.08);
  gl.uniform2f(uni.res, canvas.value.width, canvas.value.height);
  gl.uniform1f(uni.t, (now - start) / 1000);
  gl.uniform3fv(uni.base, base);
  gl.uniform3fv(uni.tint, tint);
  gl.uniform1f(uni.pulse, pulse);
  gl.uniform1f(uni.strength, light ? 0.3 : 0.42);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function run() {
  cancelAnimationFrame(raf);
  if (!gl || calm.value || document.hidden) return;
  raf = requestAnimationFrame(frame);
}

const active = ref(false);
let themeObserver = null;
const media = matchMedia('(prefers-color-scheme: light)');
const onTheme = () => readTheme();
const onVisibility = () => run();

onMounted(() => {
  if (!setup()) return;
  active.value = true;
  readTheme();
  tint = target.slice();
  themeObserver = new MutationObserver(onTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  media.addEventListener('change', onTheme);
  document.addEventListener('visibilitychange', onVisibility);
  run();
});
watch(backdropTint, readTheme);
watch(calm, run);
onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  themeObserver?.disconnect();
  media.removeEventListener('change', onTheme);
  document.removeEventListener('visibilitychange', onVisibility);
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
});
</script>

<template>
  <canvas v-show="active && !calm" ref="canvas" class="backdrop" aria-hidden="true"></canvas>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: 0; pointer-events: none; }
</style>
