<script setup>
import { ref, onMounted, watch } from 'vue';
import { endpoints } from '../api.js';
const props = defineProps({ me: Object, id: String });
const routeProps = defineProps(['id']); // for route param via props

const playlistId = routeProps.id;
const contents = ref(null);
const stats = ref(null);
const dedupe = ref(null);
const loading = ref(false);
const error = ref(null);

async function loadAll() {
  if (!props.me) return;
  loading.value = true;
  error.value = null;
  try {
    const [c, s, d] = await Promise.all([
      endpoints.playlistContents(playlistId),
      endpoints.playlistStats(playlistId),
      endpoints.simulateDedupe(playlistId)
    ]);
    contents.value = c;
    stats.value = s;
    dedupe.value = d;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
onMounted(loadAll);
watch(() => playlistId, loadAll);
</script>

<template>
  <section v-if="!me">
    <p>Authenticate to view playlist details.</p>
  </section>

  <section v-else>
    <h2>Playlist: {{ playlistId }}</h2>
    <p v-if="loading">Loading…</p>
    <p v-if="error" style="color:#b91c1c">Error: {{ error }}</p>

    <div v-if="stats" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:16px">
      <div style="border:1px solid #eee;border-radius:8px;padding:12px">
        <div>Total tracks</div><strong>{{ stats.tracks_total }}</strong>
      </div>
      <div style="border:1px solid #eee;border-radius:8px;padding:12px">
        <div>Unique tracks</div><strong>{{ stats.tracks_unique }}</strong>
      </div>
      <div style="border:1px solid #eee;border-radius:8px;padding:12px">
        <div>Unique artists</div><strong>{{ stats.artists_unique }}</strong>
      </div>
      <div style="border:1px solid #eee;border-radius:8px;padding:12px">
        <div>Avg popularity</div><strong>{{ stats.avg_popularity ?? '—' }}</strong>
      </div>
      <div style="border:1px solid #eee;border-radius:8px;padding:12px">
        <div>Oldest → Newest</div>
        <strong>{{ stats.release_range?.oldest || '—' }}</strong> →
        <strong>{{ stats.release_range?.newest || '—' }}</strong>
      </div>
    </div>

    <div v-if="stats?.top_artists?.length">
      <h3>Top artists</h3>
      <ol>
        <li v-for="a in stats.top_artists" :key="a.name">{{ a.name }} — {{ a.count }}</li>
      </ol>
    </div>

    <div v-if="dedupe">
      <h3>Simulated dedupe</h3>
      <p>Duplicates: <strong>{{ dedupe.duplicates }}</strong> of {{ dedupe.total }}</p>
      <details>
        <summary>Show sample</summary>
        <ul>
          <li v-for="d in dedupe.sample" :key="d.position">
            #{{ d.position }} — {{ d.track.name }} ·
            <span v-for="(ar, i) in d.track.artists" :key="ar.id">
              {{ ar.name }}<span v-if="i<d.track.artists.length-1">, </span>
            </span>
          </li>
        </ul>
      </details>
    </div>

    <div v-if="contents">
      <h3>Tracks</h3>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr>
            <th style="text-align:left;border-bottom:1px solid #eee;padding:6px">#</th>
            <th style="text-align:left;border-bottom:1px solid #eee;padding:6px">Title</th>
            <th style="text-align:left;border-bottom:1px solid #eee;padding:6px">Artist</th>
            <th style="text-align:left;border-bottom:1px solid #eee;padding:6px">Album</th>
            <th style="text-align:left;border-bottom:1px solid #eee;padding:6px">Popularity</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in contents.tracks" :key="t.position">
            <td style="padding:6px">{{ t.position + 1 }}</td>
            <td style="padding:6px">{{ t.name }}</td>
            <td style="padding:6px">
              <span v-for="(a,i) in t.artists" :key="a.id">
                {{ a.name }}<span v-if="i<t.artists.length-1">, </span>
              </span>
            </td>
            <td style="padding:6px">{{ t.album?.name || '—' }}</td>
            <td style="padding:6px">{{ t.popularity ?? '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
