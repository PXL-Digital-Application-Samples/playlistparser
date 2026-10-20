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

watch([lens], () => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), lens: lens.value }));
  } catch {
    // Not remembered; the setting still applies for this visit.
  }
});
