<script setup>
import { theme } from '../settings.js';
import Icon from './Icon.vue';

const OPTIONS = [
  { key: 'system', label: 'Match device', icon: 'monitor' },
  { key: 'dark', label: 'Dark', icon: 'moon' },
  { key: 'light', label: 'Light', icon: 'sun' },
];
</script>

<template>
  <div class="theme-switch" role="radiogroup" aria-label="Theme">
    <button
      v-for="o in OPTIONS"
      :key="o.key"
      type="button"
      role="radio"
      :aria-checked="theme === o.key"
      :title="o.label"
      @click="theme = o.key"
    >
      <Icon :name="o.icon" :size="16" />
      <span class="visually-hidden">{{ o.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.theme-switch { display: inline-flex; gap: 2px; padding: 3px; border-radius: 999px; background: var(--surface-muted); }
.theme-switch button {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 28px; border: none; border-radius: 999px;
  background: none; color: var(--muted); cursor: pointer;
}
.theme-switch button:hover { color: var(--text); }
.theme-switch button[aria-checked='true'] { background: var(--surface); color: var(--text); box-shadow: var(--shadow); }
</style>
