<script setup>
import { computed } from 'vue';

// Horizontal bars with labels. `unit` is required on purpose: every number
// says what it counts ("songs", "plays", "%"), so 177 can't be mistaken.
const props = defineProps({
  rows: { type: Array, required: true }, // [{ label, value, sub?, to? (in-app), href? (Spotify) }]
  unit: { type: String, required: true },
  max: { type: Number, default: null },
  color: { type: String, default: 'var(--mark)' },
});
const top = computed(() => props.max ?? Math.max(1, ...props.rows.map((r) => r.value)));
const fmt = (v) => (typeof v === 'number' ? v.toLocaleString() : v);
// "1 song", "2 songs"; units like "%" or "added" stay as they are.
const unitFor = (v) => (v === 1 && /[a-z]s$/.test(props.unit) ? props.unit.slice(0, -1) : props.unit);
</script>

<template>
  <div class="bars" role="list">
    <div v-for="r in rows" :key="r.label" class="bar-row" role="listitem">
      <span class="bar-label" :title="r.label"><router-link v-if="r.to" :to="r.to" class="in-link">{{ r.label }}</router-link><a v-else-if="r.href" :href="r.href" target="_blank" rel="noopener noreferrer" class="sp-link">{{ r.label }}</a><template v-else>{{ r.label }}</template><span v-if="r.sub" class="bar-sub"> · {{ r.sub }}</span></span>
      <span class="bar-track"><span class="bar" :style="{ width: `${(r.value / top) * 100}%`, background: color }"></span></span>
      <span class="bar-value">{{ fmt(r.value) }} <span class="bar-unit">{{ unitFor(r.value) }}</span></span>
    </div>
  </div>
</template>

<style scoped>
.bar-row {
  display: grid;
  grid-template-columns: minmax(80px, 38%) 1fr auto;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  margin-bottom: 6px;
}
.bar-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar-sub { color: var(--muted); }
.bar-track { height: 10px; background: var(--surface-muted); border-radius: 5px; overflow: hidden; }
.bar { display: block; height: 100%; border-radius: 5px; min-width: 3px; }
.bar-value { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.bar-unit { color: var(--muted); font-size: 12px; }
</style>
