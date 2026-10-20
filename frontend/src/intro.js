import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { motionOn } from './motion.js';

gsap.registerPlugin(SplitText);

// Home's opening sequence, once per browser session: the greeting's letters
// fly in, highlight cards are dealt in like playing cards, the health panel
// slides up. (Numbers and cover rows animate through v-reveal.)
const KEY = 'pp.intro';

function seen() {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function playIntro(root) {
  if (!motionOn() || !root || seen()) return;
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    // Plays again next time; harmless.
  }
  const h1 = root.querySelector('h1');
  const split = h1 ? new SplitText(h1, { type: 'chars,words', aria: 'auto' }) : null;
  const tl = gsap.timeline({ defaults: { ease: 'back.out(1.8)' }, onComplete: () => split?.revert() });
  const eyebrow = root.querySelector('.eyebrow');
  if (eyebrow) tl.from(eyebrow, { y: -12, opacity: 0, duration: 0.4 });
  if (split) {
    tl.from(split.chars, {
      y: () => gsap.utils.random(-90, 90), x: () => gsap.utils.random(-40, 40),
      rotation: () => gsap.utils.random(-70, 70), scale: 0.2, opacity: 0,
      duration: 0.8, stagger: { each: 0.035, from: 'random' },
    }, '<0.1');
  }
  const sub = root.querySelector('.dash-head p.muted'); // missing until the totals have loaded
  if (sub) tl.from(sub, { y: 14, opacity: 0, duration: 0.5, ease: 'power3.out' }, '-=0.4');
  const cards = root.querySelectorAll('.story');
  if (cards.length) {
    tl.from(cards, {
      x: 260, y: -60, rotation: () => gsap.utils.random(-25, 25), opacity: 0,
      duration: 0.7, stagger: 0.09, ease: 'back.out(1.4)',
    }, '-=0.3');
  }
  const health = root.querySelector('.dash-health');
  if (health) tl.from(health, { y: 60, opacity: 0, duration: 0.6, ease: 'power3.out' }, '<0.2');
  return tl;
}
