import { ref, computed, watch } from 'vue';
import { gsap } from 'gsap';

// Motion preference. `calm` is null until the viewer chooses: then the app
// follows the system's "reduce motion" setting. Calm turns off every
// animation in the app (also the CSS ones, via data-motion on <html>).
const KEY = 'pp.motion';
function readCalm() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'calm' ? true : v === 'lively' ? false : null;
  } catch {
    return null;
  }
}

const media = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const systemReduced = ref(Boolean(media?.matches));
media?.addEventListener?.('change', (e) => (systemReduced.value = e.matches));

export const calmChoice = ref(readCalm());
export const calm = computed(() => (calmChoice.value === null ? systemReduced.value : calmChoice.value));
export const motionOn = () => !calm.value;

export function setCalm(value) {
  calmChoice.value = value;
  try {
    localStorage.setItem(KEY, value ? 'calm' : 'lively');
  } catch {
    // Not remembered; applies for this visit.
  }
}

watch(calm, (c) => {
  document.documentElement.dataset.motion = c ? 'calm' : 'lively';
  gsap.globalTimeline.timeScale(c ? 1000 : 1); // any running tween jumps to its end
}, { immediate: true });

// ---- Count-up numbers -------------------------------------------------------

// Animates the number at the start of an element's text ("1,673", "36.4%",
// "42 h") from 0, keeping its format. Text without a leading number is left.
export function countUp(el, { duration = 1.2, delay = 0 } = {}) {
  const text = el.textContent.trim();
  const m = text.match(/^([\d][\d,.]*)(.*)$/s);
  if (!m) return;
  const raw = m[1];
  const decimals = raw.includes('.') ? raw.split('.').pop().length : 0;
  const grouped = raw.includes(',');
  const target = parseFloat(raw.replace(/,/g, ''));
  if (!Number.isFinite(target) || target === 0) return;
  const fmt = (v) => (grouped
    ? v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : v.toFixed(decimals));
  const state = { v: 0 };
  el.textContent = fmt(0) + m[2];
  gsap.to(state, {
    v: target, duration, delay, ease: 'power3.out',
    onUpdate: () => (el.textContent = fmt(state.v) + m[2]),
    onComplete: () => (el.textContent = text),
  });
}

// ---- v-reveal: animate things as they scroll into view ---------------------
//
//   v-reveal            fade and rise
//   v-reveal="'bars'"   bars grow from zero (BarList)
//   v-reveal="'count'"  numbers in <strong> elements count up, tiles cascade
//   v-reveal="'cascade'" children drop in one after another (cover rows)
//   v-reveal="'columns'" vertical bars rise (decades, likes per year)
//   v-reveal="'svgbars'" SVG <rect class="bar"> rise (monthly chart)
const observer = typeof IntersectionObserver === 'function'
  ? new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        observer.unobserve(e.target);
        e.target.__reveal?.();
      }
    }, { rootMargin: '0px 0px -8% 0px' })
  : null;

function play(el, kind) {
  if (kind === 'bars') {
    gsap.from(el.querySelectorAll('.bar'), { scaleX: 0, transformOrigin: 'left center', duration: 0.9, ease: 'power3.out', stagger: 0.04 });
  } else if (kind === 'columns') {
    gsap.from(el.querySelectorAll('.bar, .ycol i'), { scaleY: 0, transformOrigin: '50% 100%', duration: 0.8, ease: 'back.out(1.4)', stagger: 0.05 });
  } else if (kind === 'svgbars') {
    gsap.from(el.querySelectorAll('rect.bar'), { scaleY: 0, transformOrigin: '50% 100%', duration: 0.6, ease: 'power2.out', stagger: { amount: 0.8 } });
  } else if (kind === 'count') {
    const kids = [...el.children].slice(0, 24);
    gsap.from(kids, { y: 18, opacity: 0, duration: 0.6, ease: 'back.out(1.6)', stagger: 0.06 });
    el.querySelectorAll('strong').forEach((s, i) => countUp(s, { delay: i * 0.06 }));
  } else if (kind === 'cascade') {
    gsap.from([...el.children].slice(0, 30), { y: -40, rotation: () => gsap.utils.random(-8, 8), opacity: 0, duration: 0.7, ease: 'bounce.out', stagger: 0.05 });
  } else {
    gsap.from(el, { y: 28, opacity: 0, duration: 0.7, ease: 'power3.out' });
  }
}

export const reveal = {
  mounted(el, binding) {
    if (!observer || !motionOn()) return;
    el.__reveal = () => play(el, binding.value);
    observer.observe(el);
  },
  unmounted(el) {
    observer?.unobserve(el);
    delete el.__reveal;
  },
};
