import { ref, nextTick } from 'vue';
import { motionOn } from './motion.js';

// Page transitions with the browser's View Transitions API: the page fades
// and slides, and a clicked cover flies into the next page's big cover (and
// back again). Browsers without the API, and Zen mode, switch instantly.
//
// The cover pair is matched by route: clicking a link that contains an image
// remembers that image and its destination (heroPath). The element on each
// page that should take part asks heroName(path) for its
// view-transition-name, so at most one element per page carries it.
export const heroPath = ref(null);
export const heroSrc = ref(null);

export const heroName = (path) => (heroPath.value === path ? { viewTransitionName: 'hero' } : null);
// The destination page's image until its own data has loaded.
export const heroFallback = (path) => (heroPath.value === path ? heroSrc.value : null);

function onClick(e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
  const a = e.target.closest?.('a[href^="/"]');
  const pic = a?.querySelector('img, .liked-cover');
  if (!a || !pic) return;
  heroPath.value = new URL(a.href).pathname;
  heroSrc.value = pic.tagName === 'IMG' ? pic.currentSrc || pic.src : null;
}

export function installTransitions(router) {
  document.addEventListener('click', onClick, true);
  let finish = null;
  router.beforeResolve((to, from) => {
    // A transition still waiting for its page must be finished first, or the
    // browser keeps showing its old snapshot until it times out.
    finish?.();
    finish = null;
    if (!document.startViewTransition || !motionOn() || !from.matched.length || to.path === from.path) return;
    return new Promise((resolve) => {
      const t = document.startViewTransition(() => new Promise((done) => {
        finish = done;
        resolve();
      }));
      // A failed or skipped transition must never block the navigation.
      t.ready.catch(() => resolve());
    });
  });
  router.afterEach(() => nextTick(() => {
    finish?.();
    finish = null;
  }));
}
