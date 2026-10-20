import { watch, nextTick } from 'vue';
import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
import { motionOn } from './motion.js';

gsap.registerPlugin(Flip);

// When `source` changes, items (matched by Vue's keyed elements) glide from
// their old place and size to the new one; new items pop in. Use in a
// component: useFlip(containerRef, '.cell', () => props.items).
export function useFlip(container, selector, source, { duration = 0.75 } = {}) {
  let state = null;
  watch(source, () => {
    if (motionOn() && container.value) state = Flip.getState(container.value.querySelectorAll(selector));
  }, { flush: 'pre' });
  watch(source, async () => {
    if (!state || !container.value) return;
    await nextTick();
    const captured = state;
    state = null;
    Flip.from(captured, {
      targets: container.value.querySelectorAll(selector),
      duration,
      ease: 'power3.inOut',
      stagger: 0.015,
      onEnter: (els) => gsap.fromTo(els, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.7)', stagger: 0.02 }),
    });
  }, { flush: 'post' });
}
