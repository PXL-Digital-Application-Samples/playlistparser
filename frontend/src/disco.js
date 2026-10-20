import { ref, watch } from 'vue';
import { gsap } from 'gsap';
import { calm } from './motion.js';
import { bpm as playerBpm, status } from './player.js';

// Disco mode: the interface bounces on the beat (the playing song's tempo,
// otherwise 120 BPM), the accent colour cycles through the genre colours,
// a disco ball drops in and light spots sweep the page. Toggled with the
// switch or the Konami code; never in Zen mode.
export const disco = ref(false);
export const beatCount = ref(0); // bumps on every beat (the ball flashes)

const PALETTE = ['--fam-rock', '--fam-hip-hop', '--fam-folk-country', '--fam-jazz-soul', '--fam-classical', '--fam-electronic', '--fam-pop'];
// Bars, links and labels change colour; buttons keep theirs so their text stays readable.
const OVERRIDES = ['--mark', '--accent-text'];
let timer = 0;
let beat = 0;

function tempo() {
  return status.value === 'playing' && playerBpm.value ? playerBpm.value : 120;
}

function onBeat() {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  // Read the palette from the theme each beat (it follows light/dark).
  const color = cs.getPropertyValue(PALETTE[beat % PALETTE.length]).trim();
  for (const v of OVERRIDES) root.style.setProperty(v, color);
  const targets = document.querySelectorAll('main .panel, main .tile, main .story, main .card-link, main .cover-card');
  gsap.fromTo(targets, { scale: 1 }, { scale: beat % 2 ? 1.025 : 1.04, duration: 0.09, yoyo: true, repeat: 1, ease: 'power1.out', overwrite: 'auto' });
  beat++;
  beatCount.value = beat;
  timer = setTimeout(onBeat, 60_000 / tempo());
}

function stopBeat() {
  clearTimeout(timer);
  for (const v of OVERRIDES) document.documentElement.style.removeProperty(v);
}

watch([disco, calm], ([on, c]) => {
  stopBeat();
  if (on && c) disco.value = false;
  document.documentElement.toggleAttribute('data-disco', disco.value);
  if (disco.value) onBeat();
});

export function toggleDisco() {
  if (calm.value) return;
  disco.value = !disco.value;
}

// ↑ ↑ ↓ ↓ ← → ← → B A
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let progress = 0;
export function installKonami() {
  addEventListener('keydown', (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    progress = k === KONAMI[progress] ? progress + 1 : k === KONAMI[0] ? 1 : 0;
    if (progress === KONAMI.length) {
      progress = 0;
      toggleDisco();
    }
  });
}
