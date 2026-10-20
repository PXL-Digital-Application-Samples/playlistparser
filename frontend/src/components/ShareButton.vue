<script setup>
import { ref } from 'vue';
import { shareCard } from '../shareCard.js';
import { burstFrom } from '../confetti.js';
import Icon from './Icon.vue';

// "Save image": draws the highlight as a story-format PNG and shares it
// (phones) or downloads it (desktop).
const props = defineProps({
  card: { type: Object, required: true }, // { kicker, big, text, image }
  label: { type: String, default: 'Save image' },
  compact: { type: Boolean, default: false },
});

const state = ref('idle'); // idle | working | done | error
const btn = ref(null);
async function run() {
  if (state.value === 'working') return;
  state.value = 'working';
  try {
    const result = await shareCard(props.card);
    state.value = 'done';
    if (result !== 'cancelled') burstFrom(btn.value, { count: 70 });
  } catch {
    state.value = 'error';
  }
  setTimeout(() => (state.value = 'idle'), 2500);
}
const text = () => ({ working: 'Drawing…', done: 'Saved', error: 'Failed, try again' }[state.value] || props.label);
</script>

<template>
  <button
    ref="btn"
    type="button"
    class="share"
    :class="{ compact }"
    :aria-label="compact ? `${label}: ${card.kicker}` : null"
    :title="compact ? label : null"
    :disabled="state === 'working'"
    @click.stop.prevent="run"
  >
    <Icon name="download" :size="compact ? 15 : 16" />
    <span :class="{ 'visually-hidden': compact && state === 'idle' }" aria-live="polite">{{ text() }}</span>
  </button>
</template>

<style scoped>
.share {
  display: inline-flex; align-items: center; gap: 6px;
  font: inherit; font-size: 13px; font-weight: 650; color: var(--text);
  background: var(--surface); border: 1px solid var(--border-strong); border-radius: 999px;
  padding: 5px 12px; min-height: 32px; cursor: pointer;
}
.share:hover:not(:disabled) { background: var(--surface-muted); }
.share:disabled { opacity: 0.7; cursor: progress; }
.share.compact { padding: 5px 9px; min-width: 32px; justify-content: center; }
</style>
