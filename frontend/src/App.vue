<script setup>
import { ref, onMounted, provide } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { endpoints, describeError } from './api.js';
import Icon from './components/Icon.vue';
import SpotifyIcon from './components/SpotifyIcon.vue';

const router = useRouter();
const route = useRoute();
const me = ref(null);
const loading = ref(true);
const notice = ref(null);
const LOGIN_URL = endpoints.loginUrl();
provide('loginUrl', LOGIN_URL);

const LOGIN_ERRORS = {
  access_denied: 'Spotify login was cancelled.',
  bad_state: 'Login expired or was started in another tab. Please try again.',
  user_not_allowed:
    'This Spotify account is not allowed to use this app. In development mode the app owner must add it under "User Management" in the Spotify dashboard.',
  spotify_login_failed: 'Spotify login failed. Check the API logs and Spotify app settings.',
};

async function loadMe() {
  loading.value = true;
  try {
    me.value = await endpoints.me();
  } catch (err) {
    me.value = null;
    if (err.status !== 401) notice.value = describeError(err);
  }
  loading.value = false;
}

async function logout() {
  try {
    await endpoints.logout();
  } catch {
    // Clear local state even if the server call fails.
  }
  me.value = null;
  router.push('/');
}

onMounted(() => {
  const params = new URLSearchParams(window.location.search);
  const loginError = params.get('login_error');
  if (loginError) {
    notice.value = LOGIN_ERRORS[loginError] || `Login failed (${loginError}).`;
    params.delete('login_error');
    const qs = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
  }
  loadMe();
});
</script>

<template>
  <header class="app-header">
    <div class="brand">
      <router-link to="/" class="logo">PXL Playlist Parser</router-link>
      <nav v-if="me" class="main-nav" aria-label="Main">
        <router-link to="/" class="nav-link" exact-active-class="active">Playlists</router-link>
        <router-link to="/insights" class="nav-link" active-class="active">Insights</router-link>
      </nav>
    </div>
    <div class="user-section">
      <span v-if="loading" class="muted" aria-live="polite">…</span>
      <template v-else-if="me">
        <span class="user-name">{{ me.displayName || me.spotifyId }}</span>
        <button @click="logout" class="btn btn-secondary btn-sm">
          <Icon name="logout" :size="16" /> Log out
        </button>
      </template>
      <!-- The welcome page has its own login button; don't show two. -->
      <a v-else-if="route.path !== '/'" :href="LOGIN_URL" class="btn btn-primary btn-sm">
        <SpotifyIcon />
        Log in with Spotify
      </a>
    </div>
  </header>
  <div v-if="notice" class="notice" role="alert">
    <span>{{ notice }}</span>
    <button @click="notice = null" class="icon-btn" aria-label="Dismiss message">
      <Icon name="close" :size="16" />
    </button>
  </div>
  <main class="main-content">
    <router-view :me="me" :me-loading="loading" />
  </main>
</template>

<style>
/* ---- Design tokens ------------------------------------------------------ */
:root {
  --bg: #f6f7f9;
  --surface: #ffffff;
  --surface-muted: #f1f3f5;
  --border: #dde1e6;
  --text: #1c1f23;
  --muted: #555e68;          /* >= 4.5:1 on --bg and --surface */
  --accent: #1db954;         /* Spotify green, used with dark text */
  --accent-hover: #1ed760;
  --accent-ink: #0b2a17;
  --link: #0b5cad;
  --focus: #1a73e8;
  --danger-bg: #fdecec;
  --danger-text: #8a1c1c;
  --warn-bg: #fff4d6;
  --warn-text: #5c4400;
  --lastfm: #d51007;
  --radius: 10px;
  --shadow: 0 1px 2px rgba(16, 24, 40, 0.06), 0 1px 3px rgba(16, 24, 40, 0.08);
}

*, *::before, *::after { box-sizing: border-box; }

body {
  font-family: ui-sans-serif, system-ui, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  margin: 0;
  background: var(--bg);
  color: var(--text);
  line-height: 1.45;
}

a { color: var(--link); }

:focus-visible {
  outline: 3px solid var(--focus);
  outline-offset: 2px;
  border-radius: 4px;
}

.muted { color: var(--muted); }

.visually-hidden {
  position: absolute !important;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0);
  white-space: nowrap; border: 0;
}

/* ---- Buttons ------------------------------------------------------------ */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  border-radius: 999px;
  border: 1px solid transparent;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, border-color 0.15s;
}
.btn-sm { padding: 6px 12px; font-size: 13px; }
.btn-primary { background: var(--accent); color: var(--accent-ink); }
.btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
.btn-secondary { background: var(--surface); color: var(--text); border-color: var(--border); }
.btn-secondary:hover:not(:disabled) { background: var(--surface-muted); }
.btn-link { background: none; border: none; padding: 6px 0; color: var(--link); font-weight: 500; }
.btn-link:hover { text-decoration: underline; }
.btn:disabled { opacity: 0.55; cursor: not-allowed; }

.icon-btn {
  display: inline-flex;
  background: none;
  border: none;
  padding: 4px;
  color: inherit;
  cursor: pointer;
  border-radius: 6px;
}
.icon { flex: none; }

/* Links to Spotify: covers and names look the same, with a hover hint. */
.sp-link { color: inherit; text-decoration: none; }
.sp-link:hover { text-decoration: underline; }
a.sp-cover { display: block; color: inherit; text-decoration: none; }
a.sp-cover img { transition: filter 0.15s; }
a.sp-cover:hover img { filter: brightness(1.12) saturate(1.1); }

/* ---- Shared blocks ------------------------------------------------------ */
.alert {
  padding: 12px 16px;
  border-radius: var(--radius);
  font-size: 14px;
  margin: 12px 0;
}
.alert-error { background: var(--danger-bg); color: var(--danger-text); }
.alert-warn { background: var(--warn-bg); color: var(--warn-text); }

.badge {
  display: inline-block;
  font-size: 12px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: 999px;
  background: #e6f0fb;
  color: #0b4f96;
}

.src-lastfm {
  display: inline-block;
  vertical-align: middle;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: #fff;
  background: var(--lastfm);
  border-radius: 4px;
  padding: 1px 6px;
}

.skeleton {
  background: linear-gradient(90deg, #e9ecef 25%, #f4f5f7 50%, #e9ecef 75%);
  background-size: 200% 100%;
  animation: shimmer 1.2s infinite;
  border-radius: 6px;
}
@keyframes shimmer { to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) {
  .skeleton { animation: none; }
  * { transition: none !important; scroll-behavior: auto !important; }
}

/* ---- App shell ---------------------------------------------------------- */
.app-header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 24px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.logo {
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--text);
  text-decoration: none;
}

.brand { display: flex; align-items: center; gap: 20px; min-width: 0; }
.main-nav { display: flex; gap: 4px; }
.nav-link {
  padding: 6px 12px;
  border-radius: 999px;
  color: var(--text);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
}
.nav-link:hover { background: var(--surface-muted); }
.nav-link.active { background: var(--text); color: #fff; }

.user-section {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
}

.user-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 30vw;
}

.notice {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  max-width: 1200px;
  margin: 16px auto 0;
  padding: 12px 16px;
  background: var(--warn-bg);
  border-radius: var(--radius);
  color: var(--warn-text);
  font-size: 14px;
}

.main-content {
  min-height: calc(100vh - 60px);
}

.page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
}

@media (max-width: 640px) {
  .app-header { padding: 10px 16px; }
  .page { padding: 16px; }
  .user-name { display: none; }
  .logo { display: none; }
  .brand { gap: 8px; }
}
</style>
