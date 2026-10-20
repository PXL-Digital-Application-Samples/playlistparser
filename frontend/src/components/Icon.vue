<script setup>
// Small inline SVG icon set (stroke icons, 24x24 grid). Decorative by default.
defineProps({ name: { type: String, required: true }, size: { type: Number, default: 18 } });

const PATHS = {
  download: ['M12 3v12', 'M7 10l5 5 5-5', 'M5 21h14'],
  'arrow-left': ['M19 12H5', 'M12 19l-7-7 7-7'],
  external: ['M14 4h6v6', 'M10 14L20 4', 'M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M21 21l-4.35-4.35'],
  music: ['M9 18V5l12-2v13', 'M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M18 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  users: ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M23 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  close: ['M18 6L6 18', 'M6 6l12 12'],
  home: ['M3 10.5L12 3l9 7.5', 'M5 9.5V21h5v-6h4v6h5V9.5'],
  playlists: ['M3 6h12', 'M3 12h12', 'M3 18h8', 'M17 18V8l4-1', 'M17 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0z'],
  insights: ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2'],
  health: ['M3 12h4l3-8 4 16 3-8h4'],
  sun: ['M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z', 'M12 1v2', 'M12 21v2', 'M4.2 4.2l1.4 1.4', 'M18.4 18.4l1.4 1.4', 'M1 12h2', 'M21 12h2', 'M4.2 19.8l1.4-1.4', 'M18.4 5.6l1.4-1.4'],
  moon: ['M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z'],
  monitor: ['M3 4h18v12H3z', 'M8 20h8', 'M12 16v4'],
  compare: ['M8 3v18', 'M16 3v18', 'M3 8l5-5 5 5', 'M11 16l5 5 5-5'],
  disc: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  mic: ['M12 15a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v7a3 3 0 0 0 3 3z', 'M19 11a7 7 0 0 1-14 0', 'M12 18v4'],
  refresh: ['M21 12a9 9 0 1 1-2.6-6.4', 'M21 3v6h-6'],
  'chevron-right': ['M9 6l6 6-6 6'],
  heart: ['M12 20s-7-4.4-9-8.6C1.6 8.2 3.6 5 7 5c2 0 3.4 1 5 2.6C13.6 6 15 5 17 5c3.4 0 5.4 3.2 4 6.4-2 4.2-9 8.6-9 8.6z'],
  copy: ['M8 8h12v12H8z', 'M16 8V4H4v12h4'],
  alert: ['M12 3l10 18H2z', 'M12 10v4', 'M12 17.5v.5'],
};
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
    class="icon"
  >
    <path v-for="d in PATHS[name]" :key="d" :d="d" />
  </svg>
</template>
