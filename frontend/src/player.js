import { ref, shallowRef } from 'vue';
import { endpoints } from './api.js';

// The in-app record player: one song at a time, a 30-second Deezer preview
// (looked up by the API), analysed live with the Web Audio API so the
// visualizer and the background can move to the music. In demo mode there
// are no real songs, so a small synth groove plays at the song's tempo.
export const current = shallowRef(null); // { key, name, artist, image }
export const status = ref('idle');       // idle | loading | playing | none | error
export const bpm = ref(null);
export const progress = ref(0);          // 0..1 of the preview

const DEMO = import.meta.env.VITE_DEMO === 'true';
let ctx = null;
let analyser = null;
let audio = null;
let mediaSource = null;
let synth = null;
let freq = null;
let raf = 0;

function ensureAudio() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.78;
  analyser.connect(ctx.destination);
  freq = new Uint8Array(analyser.frequencyBinCount);
  audio = new Audio();
  audio.crossOrigin = 'anonymous'; // Deezer's preview files allow it: needed to analyse them
  audio.preload = 'auto';
  mediaSource = ctx.createMediaElementSource(audio);
  mediaSource.connect(analyser);
  audio.addEventListener('ended', () => stop());
}

// Spectrum (0..255 per band) for visualizers; null when nothing plays.
export function spectrum() {
  if (!analyser || status.value !== 'playing') return null;
  analyser.getByteFrequencyData(freq);
  return freq;
}

// Overall loudness 0..1, weighted towards the bass (for pulsing things).
export function energy() {
  const f = spectrum();
  if (!f) return 0;
  let sum = 0;
  for (let i = 0; i < 24; i++) sum += f[i] * (1.4 - i / 40);
  return Math.min(1, sum / (24 * 255));
}

function tick() {
  if (audio && !audio.paused && audio.duration) progress.value = audio.currentTime / audio.duration;
  else if (synth) progress.value = Math.min(1, (ctx.currentTime - synth.start) / synth.length);
  if (synth && progress.value >= 1) return stop();
  raf = requestAnimationFrame(tick);
}

export const trackKey = (t) => t.id || `${t.name}|${t.artist}`;

// t: { id?, name, artist (string), isrc?, image? }
export async function play(t) {
  const key = trackKey(t);
  if (current.value?.key === key && (status.value === 'playing' || status.value === 'loading')) return stop();
  stop();
  ensureAudio();
  if (ctx.state === 'suspended') await ctx.resume();
  current.value = { key, name: t.name, artist: t.artist, image: t.image ?? null };
  status.value = 'loading';
  progress.value = 0;
  try {
    if (DEMO) {
      bpm.value = t.bpm || 112;
      startSynth(bpm.value);
    } else {
      const p = await endpoints.preview({ isrc: t.isrc, title: t.name, artist: t.artist });
      if (current.value?.key !== key) return; // another song was started meanwhile
      if (p.status !== 'ok') {
        status.value = 'none';
        return;
      }
      bpm.value = p.bpm;
      audio.src = p.preview;
      await audio.play();
    }
    if (current.value?.key !== key) return;
    status.value = 'playing';
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  } catch {
    if (current.value?.key === key) status.value = 'error';
  }
}

export function stop() {
  cancelAnimationFrame(raf);
  if (audio) {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }
  stopSynth();
  status.value = 'idle';
  progress.value = 0;
}

export function close() {
  stop();
  current.value = null;
}

// ---- Demo synth: kick, hats, bass and a chord stab, 8 bars ----------------
function startSynth(tempo) {
  const beat = 60 / tempo;
  const start = ctx.currentTime + 0.05;
  const out = ctx.createGain();
  out.gain.value = 0.5;
  out.connect(analyser);
  const nodes = [];
  const bars = 8;
  const noise = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const roots = [55, 55, 65.4, 49];
  for (let b = 0; b < bars * 4; b++) {
    const t = start + b * beat;
    // kick
    const k = ctx.createOscillator();
    const kg = ctx.createGain();
    k.frequency.setValueAtTime(140, t);
    k.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    kg.gain.setValueAtTime(0.9, t);
    kg.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    k.connect(kg).connect(out);
    k.start(t);
    k.stop(t + 0.3);
    nodes.push(k);
    // off-beat hat
    const h = ctx.createBufferSource();
    const hf = ctx.createBiquadFilter();
    const hg = ctx.createGain();
    h.buffer = noise;
    hf.type = 'highpass';
    hf.frequency.value = 7000;
    hg.gain.setValueAtTime(0.25, t + beat / 2);
    hg.gain.exponentialRampToValueAtTime(0.001, t + beat / 2 + 0.08);
    h.connect(hf).connect(hg).connect(out);
    h.start(t + beat / 2);
    nodes.push(h);
    // bass on each beat, chord stab on beats 2 and 4
    const root = roots[Math.floor(b / 4) % roots.length];
    const bass = ctx.createOscillator();
    const bg = ctx.createGain();
    bass.type = 'sawtooth';
    bass.frequency.value = root;
    bg.gain.setValueAtTime(0.18, t);
    bg.gain.exponentialRampToValueAtTime(0.001, t + beat * 0.9);
    bass.connect(bg).connect(out);
    bass.start(t);
    bass.stop(t + beat);
    nodes.push(bass);
    if (b % 2 === 1) {
      for (const m of [4, 5, 6]) {
        const o = ctx.createOscillator();
        const og = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = root * m;
        og.gain.setValueAtTime(0.05, t);
        og.gain.exponentialRampToValueAtTime(0.001, t + beat * 0.6);
        o.connect(og).connect(out);
        o.start(t);
        o.stop(t + beat);
        nodes.push(o);
      }
    }
  }
  synth = { out, nodes, start, length: bars * 4 * beat };
}

function stopSynth() {
  if (!synth) return;
  for (const n of synth.nodes) {
    try {
      n.stop();
    } catch {
      // already stopped
    }
  }
  synth.out.disconnect();
  synth = null;
}
