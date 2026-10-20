import { ref, watch } from 'vue';

// App-wide viewer preferences, remembered in this browser. Storage can be
// unavailable (private windows, blocked site data), so every access is guarded
// and the defaults always work.
const KEY = 'pp.settings';

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

const saved = read();

// Liked Songs: count only songs liked one by one ('handpicked'), or also the
// songs added by saving a whole album ('all'). Used by every page that shows
// Liked Songs numbers, so they always agree.
export const lens = ref(saved.lens === 'all' ? 'all' : 'handpicked');

// 'system' follows the device; 'dark' / 'light' override it (theme.css).
export const theme = ref(['dark', 'light'].includes(saved.theme) ? saved.theme : 'system');

function applyTheme(t) {
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}
applyTheme(theme.value);

watch([lens, theme], () => {
  applyTheme(theme.value);
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), lens: lens.value, theme: theme.value }));
  } catch {
    // Not remembered; the setting still applies for this visit.
  }
});
