<script setup>
import { ref, onMounted } from 'vue';
import { endpoints } from '../api.js';
const props = defineProps({ me: Object });

const playlists = ref([]);
const loading = ref(false);
const error = ref(null);

async function load() {
  if (!props.me) return;
  loading.value = true;
  error.value = null;
  try {
    const data = await endpoints.playlists();
    playlists.value = data.items || [];
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
onMounted(load);
</script>

<template>
  <section v-if="!me">
    <p>Authenticate to view your playlists.</p>
  </section>

  <section v-else>
    <h2>Your playlists</h2>
    <p v-if="loading">Loading…</p>
    <p v-if="error" style="color:#b91c1c">Error: {{ error }}</p>
    <ul v-if="!loading" style="list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">
      <li v-for="p in playlists" :key="p.id" style="border:1px solid #eee;border-radius:8px;padding:12px">
        <div style="font-weight:600">{{ p.name }}</div>
        <div style="font-size:12px;color:#666">Tracks: {{ p.tracks?.total ?? '—' }}</div>
        <div style="margin-top:8px">
          <router-link :to="`/playlist/${p.id}`">Open</router-link>
        </div>
      </li>
    </ul>
  </section>
</template>
