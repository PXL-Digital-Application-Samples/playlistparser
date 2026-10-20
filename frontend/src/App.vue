<script setup>
import { ref, computed, onMounted, provide, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { endpoints, describeError } from './api.js';
import { startStatus, stopStatus, healthCount } from './status.js';
import Icon from './components/Icon.vue';
import StatusPanel from './components/StatusPanel.vue';
import ThemeSwitch from './components/ThemeSwitch.vue';
import { INSIGHT_TABS } from './nav.js';

const router = useRouter();
const route = useRoute();
const me = ref(null);
const loading = ref(true);
const notice = ref(null);
const LOGIN_URL = endpoints.loginUrl();
provide('loginUrl', LOGIN_URL);

// The top-level section a route belongs to, so "Playlists" stays highlighted
// on a playlist's own page.
const section = computed(() => route.meta.section ?? route.path);
const NAV = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/playlists', label: 'Playlists', icon: 'playlists' },
  { to: '/insights', label: 'Insights', icon: 'insights' },
  { to: '/health', label: 'Health', icon: 'health' },
];

const LOGIN_ERRORS = {
  access_denied: 'Spotify login was cancelled.',
  bad_state: 'Login expired or was started in another tab. Please try again.',
  user_not_allowed:
    'This Spotify account is not allowed to use this app. In development mode the app owner must add it under "User Management" in the Spotify dashboard.',
  spotify_login_failed: 'Spotify login failed. Check the API logs and Spotify app settings.',
};

// Logged out on any page other than the welcome page: go to the welcome
// page, which has the (only) login button.
// Also re-checked when the route changes: the first navigation (e.g. to a
// lazily loaded page) can finish after the login check.
watch([loading, me, () => route.path], () => {
  if (!loading.value && !me.value && route.path !== '/') router.replace('/');
});
watch(me, (user) => (user ? startStatus() : stopStatus()));

// The phone menu closes when you navigate.
const menu = ref(null);
watch(() => route.fullPath, () => { if (menu.value) menu.value.open = false; });

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

const shell = computed(() => loading.value || me.value);
</script>

<template>
  <a href="#main" class="skip-link">Skip to content</a>

  <div :class="shell ? 'shell' : 'public'">
    <!-- Desktop: side rail -->
    <aside v-if="shell" class="rail" aria-label="App">
      <router-link to="/" class="brand">
        <span class="mark" aria-hidden="true"></span>
        <span class="brand-text">Playlist Parser</span>
      </router-link>
      <nav v-if="me" class="rail-nav" aria-label="Main">
        <template v-for="n in NAV" :key="n.to">
          <router-link :to="n.to" class="rail-link" :aria-current="section === n.to ? 'page' : null">
            <Icon :name="n.icon" :size="18" />
            <span>{{ n.label }}</span>
            <span v-if="n.to === '/health' && healthCount" class="count-pill" :aria-label="`${healthCount} things to check`">{{ healthCount }}</span>
          </router-link>
          <div v-if="n.to === '/insights' && section === '/insights'" class="rail-sub">
            <router-link
              v-for="t in INSIGHT_TABS"
              :key="t.key"
              :to="`/insights/${t.key}`"
              class="rail-sublink"
              :aria-current="route.params.tab === t.key ? 'page' : null"
            >{{ t.label }}</router-link>
          </div>
        </template>
      </nav>
      <div v-if="me" class="rail-foot">
        <StatusPanel />
        <div class="account">
          <span class="user-name" :title="me.displayName || me.spotifyId">{{ me.displayName || me.spotifyId }}</span>
          <ThemeSwitch />
        </div>
        <button class="btn btn-ghost btn-sm logout" @click="logout"><Icon name="logout" :size="16" /> Log out</button>
      </div>
    </aside>

    <!-- Phone: top bar with a menu -->
    <header v-if="shell" class="topbar">
      <router-link to="/" class="brand">
        <span class="mark" aria-hidden="true"></span>
        <span class="brand-text">Playlist Parser</span>
      </router-link>
      <details v-if="me" ref="menu" class="menu">
        <summary class="icon-btn" aria-label="Account and status">
          <span class="avatar" aria-hidden="true">{{ (me.displayName || me.spotifyId || '?').slice(0, 1).toUpperCase() }}</span>
        </summary>
        <div class="menu-sheet">
          <p class="menu-name">{{ me.displayName || me.spotifyId }}</p>
          <StatusPanel />
          <div class="menu-row"><span class="muted small">Theme</span><ThemeSwitch /></div>
          <button class="btn btn-secondary btn-sm" @click="logout"><Icon name="logout" :size="16" /> Log out</button>
        </div>
      </details>
    </header>

    <main id="main" class="main" tabindex="-1">
      <div v-if="notice" class="notice" role="alert">
        <span>{{ notice }}</span>
        <button @click="notice = null" class="icon-btn" aria-label="Dismiss message">
          <Icon name="close" :size="16" />
        </button>
      </div>
      <router-view :me="me" :me-loading="loading" />
    </main>

    <!-- Phone: bottom tabs -->
    <nav v-if="me" class="tabbar" aria-label="Main">
      <router-link v-for="n in NAV" :key="n.to" :to="n.to" class="tab" :aria-current="section === n.to ? 'page' : null">
        <span class="tab-icon">
          <Icon :name="n.icon" :size="20" />
          <span v-if="n.to === '/health' && healthCount" class="tab-dot" aria-hidden="true"></span>
        </span>
        <span>{{ n.label }}</span>
      </router-link>
    </nav>
  </div>
</template>

<style>
/* ---- Shell: rail on the left (desktop), top bar + tab bar (phone) ---------- */
.shell { min-height: 100vh; }
.main { min-width: 0; }
.main:focus { outline: none; }

.brand { display: inline-flex; align-items: center; gap: 10px; color: var(--text); text-decoration: none; }
.brand-text { font-family: var(--font-display); font-weight: 700; font-size: 1.05rem; letter-spacing: -0.01em; }
/* The mark: a record seen from above, with an amber label. */
.mark {
  width: 26px; height: 26px; border-radius: 50%; flex: none;
  background:
    radial-gradient(circle, var(--bg) 0 2px, var(--accent) 2.5px 7px, transparent 7.5px),
    repeating-radial-gradient(circle, var(--text) 0 1px, var(--surface-muted) 1px 2.5px);
}

.rail {
  position: fixed; inset: 0 auto 0 0; width: var(--rail-w); z-index: 30;
  display: flex; flex-direction: column; gap: 18px;
  padding: 20px 14px 16px;
  background: var(--surface);
  border-right: 1px solid var(--border);
  overflow-y: auto;
}
.rail .brand { padding: 2px 8px 6px; }
.rail-nav { display: flex; flex-direction: column; gap: 2px; }
.rail-link {
  display: flex; align-items: center; gap: 12px;
  padding: 9px 10px; border-radius: 10px;
  color: var(--muted); text-decoration: none; font-weight: 600; font-size: 14.5px;
}
.rail-link:hover { background: var(--surface-muted); color: var(--text); }
.rail-link[aria-current='page'] { background: var(--accent-soft); color: var(--accent-strong); }
.count-pill {
  margin-left: auto; min-width: 22px; padding: 0 7px; border-radius: 999px;
  background: var(--warn-bg); color: var(--warn-text); font-size: 12px; font-weight: 700; text-align: center;
}
.rail-sub { display: flex; flex-direction: column; gap: 1px; margin: 2px 0 6px 40px; }
.rail-sublink { padding: 5px 10px; border-radius: 8px; color: var(--muted); text-decoration: none; font-size: 14px; }
.rail-sublink:hover { color: var(--text); background: var(--surface-muted); }
.rail-sublink[aria-current='page'] { color: var(--text); font-weight: 650; }
.rail-foot { margin-top: auto; display: flex; flex-direction: column; gap: 14px; padding: 14px 8px 0; border-top: 1px solid var(--border); }
.account { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
.user-name { font-weight: 650; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.logout { align-self: flex-start; color: var(--muted); padding-left: 6px; }

.topbar { display: none; }
.tabbar { display: none; }

.notice {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  max-width: 1180px; margin: 16px auto 0; padding: 12px 16px;
  background: var(--warn-bg); color: var(--warn-text);
  border-radius: var(--radius-sm); font-size: 14px;
}

@media (min-width: 961px) {
  .shell .main { margin-left: var(--rail-w); }
}

@media (max-width: 960px) {
  :root { --header-h: 56px; }
  .rail { display: none; }
  .topbar {
    position: sticky; top: 0; z-index: 30;
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    height: var(--header-h); padding: 0 16px;
    background: color-mix(in srgb, var(--bg) 88%, transparent);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--border);
  }
  .shell .main { padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px)); }
  .tabbar {
    position: fixed; inset: auto 0 0 0; z-index: 30;
    display: grid; grid-template-columns: repeat(4, 1fr);
    padding: 6px 4px calc(6px + env(safe-area-inset-bottom, 0px));
    background: var(--surface); border-top: 1px solid var(--border);
  }
  .tab {
    display: flex; flex-direction: column; align-items: center; gap: 2px; min-height: 48px; justify-content: center;
    color: var(--muted); text-decoration: none; font-size: 11.5px; font-weight: 600; border-radius: 10px;
  }
  .tab[aria-current='page'] { color: var(--accent-text); }
  .tab-icon { position: relative; display: inline-flex; }
  .tab-dot { position: absolute; top: -2px; right: -4px; width: 8px; height: 8px; border-radius: 50%; background: var(--warn-text); }

  .menu { position: relative; }
  .menu summary { list-style: none; }
  .menu summary::-webkit-details-marker { display: none; }
  .avatar {
    width: 32px; height: 32px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
    background: var(--accent-soft); color: var(--accent-strong); font-weight: 700;
  }
  .menu-sheet {
    position: absolute; right: 0; top: calc(100% + 8px); width: min(300px, calc(100vw - 32px));
    display: flex; flex-direction: column; gap: 14px; padding: 16px;
    background: var(--surface-raised); border: 1px solid var(--border); border-radius: var(--radius);
    box-shadow: var(--shadow);
  }
  .menu-name { margin: 0; font-weight: 700; }
  .menu-row { display: flex; align-items: center; justify-content: space-between; }
}
</style>
