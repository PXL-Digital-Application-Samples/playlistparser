<script setup>
import { ref, computed } from 'vue';

// Wraps a chart with a "Show as list" switch that renders the same data as a
// table. The chart's own marks stay out of the tab order (they're decoration
// for pointer users); keyboard and screen-reader users get the table.
//
// columns: [{ key, label, num? }]
// rows:    [{ [key]: value, links?: { [key]: url } }]   (url: http… or /app/path)
const props = defineProps({
  label: { type: String, required: true }, // what the chart shows, e.g. "Sound map"
  columns: { type: Array, required: true },
  rows: { type: Array, required: true },
  limit: { type: Number, default: 100 },
});

const asList = ref(false);
const showAll = ref(false);
const visible = computed(() => (showAll.value ? props.rows : props.rows.slice(0, props.limit)));
const fmt = (v) => (typeof v === 'number' ? v.toLocaleString() : v ?? '—');
const isInternal = (url) => typeof url === 'string' && url.startsWith('/');
</script>

<template>
  <div class="chart-frame">
    <div class="cf-bar">
      <slot name="toolbar" />
      <button type="button" class="cf-toggle" :aria-pressed="asList" @click="asList = !asList">
        {{ asList ? 'Show as chart' : 'Show as list' }}
      </button>
    </div>
    <div v-show="!asList">
      <slot />
    </div>
    <div v-if="asList" class="cf-table-wrap">
      <table class="cf-table">
        <caption class="visually-hidden">{{ label }}</caption>
        <thead>
          <tr><th v-for="c in columns" :key="c.key" scope="col" :class="{ num: c.num }">{{ c.label }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in visible" :key="i">
            <td v-for="c in columns" :key="c.key" :class="{ num: c.num }">
              <router-link v-if="isInternal(r.links?.[c.key])" :to="r.links[c.key]">{{ fmt(r[c.key]) }}</router-link>
              <a v-else-if="r.links?.[c.key]" :href="r.links[c.key]" target="_blank" rel="noopener noreferrer">{{ fmt(r[c.key]) }}</a>
              <template v-else>{{ fmt(r[c.key]) }}</template>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="rows.length > limit" class="cf-more">
        <span>{{ visible.length.toLocaleString() }} of {{ rows.length.toLocaleString() }} rows</span>
        <button v-if="!showAll" type="button" class="btn btn-secondary btn-sm" @click="showAll = true">Show all</button>
      </p>
    </div>
  </div>
</template>

<style scoped>
.cf-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; margin-bottom: 8px; }
.cf-bar :slotted(*:first-child:not(.cf-toggle)) { margin-right: auto; }
.cf-toggle {
  font: inherit; font-size: 13px; font-weight: 600; color: var(--link);
  background: none; border: 1px solid var(--border); border-radius: 999px;
  padding: 4px 12px; min-height: 30px; cursor: pointer;
}
.cf-toggle[aria-pressed='true'] { background: var(--surface-muted); }
.cf-table-wrap { overflow-x: auto; }
.cf-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.cf-table th, .cf-table td { padding: 6px 10px; border-bottom: 1px solid var(--surface-muted); text-align: left; }
.cf-table th { font-weight: 600; color: var(--muted); font-size: 13px; }
.cf-table .num { text-align: right; font-variant-numeric: tabular-nums; }
.cf-more { display: flex; align-items: center; justify-content: center; gap: 12px; font-size: 13px; color: var(--muted); padding-top: 10px; margin: 0; }
</style>
