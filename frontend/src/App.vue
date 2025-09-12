<script setup>
import { ref, onMounted } from 'vue';
import { endpoints } from './api.js';

const me = ref(null);
const loading = ref(true);
const error = ref(null);

async function loadMe() {
  loading.value = true;
  error.value = null;
  try {
    me.value = await endpoints.me();
  } catch (e) {
    me.value = null;
  } finally {
    loading.value = false;
  }
}
onMounted(loadMe);
</script>

<template>
  <header style="display:flex;justify-content:space-between;align-items:center;padding:12px;border-bottom:1px solid #eee">
    <div><strong>playlistparser</strong></div>
    <div v-if="loading">…</div>
    <div v-else-if="me">Hello, {{ me.displayName || me.email || me.spotifyId }}</div>
    <div v-else><a :href="endpoints.login()">Login with Spotify</a></div>
  </header>
  <main style="max-width:960px;margin:24px auto;padding:0 12px">
    <router-view :me="me" />
  </main>
</template>

<script>
export default { methods: { endpoints } };
</script>

<style>
body{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
a{color:#2563eb;text-decoration:none} a:hover{text-decoration:underline}
code{background:#f6f8fa;padding:2px 4px;border-radius:4px}
</style>
