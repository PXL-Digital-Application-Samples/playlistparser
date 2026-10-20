import '@fontsource-variable/figtree';
import '@fontsource-variable/bricolage-grotesque';
import './theme.css';
import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import Home from './views/Home.vue';
import Playlists from './views/Playlists.vue';
import Playlist from './views/Playlist.vue';
import { setTitle } from './title.js';
import { INSIGHT_TABS } from './nav.js';
import { reveal } from './motion.js';

// `section` = the main navigation item a page belongs to (highlighted in the
// rail and tab bar). Pages about one thing set their own title from its name.
const routes = [
  { path: '/', component: Home, meta: { title: 'Home', section: '/' } },
  { path: '/playlists', component: Playlists, meta: { title: 'Playlists', section: '/playlists' } },
  { path: '/playlist/:id', component: Playlist, props: true, meta: { title: 'Playlist', section: '/playlists' } },
  { path: '/compare', component: () => import('./views/Compare.vue'), meta: { title: 'Compare playlists', section: '/playlists' } },
  { path: '/insights', redirect: '/insights/taste' },
  // Loaded on demand: carries the map data and chart libraries.
  {
    path: `/insights/:tab(${INSIGHT_TABS.map((t) => t.key).join('|')})`,
    component: () => import('./views/Insights.vue'),
    props: true,
    meta: { title: 'Insights', section: '/insights' },
  },
  { path: '/health', component: () => import('./views/Health.vue'), meta: { title: 'Library health', section: '/health' } },
  { path: '/artist/:id', component: () => import('./views/Artist.vue'), props: true, meta: { title: 'Artist' } },
  { path: '/album/:id', component: () => import('./views/Album.vue'), props: true, meta: { title: 'Album' } },
  { path: '/:rest(.*)*', redirect: '/' },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: (to, from, saved) => saved || (to.path !== from.path ? { top: 0 } : undefined),
});
router.afterEach((to) => {
  const tab = INSIGHT_TABS.find((t) => t.key === to.params.tab);
  setTitle(tab ? `${tab.label} · Insights` : to.meta.title);
});
createApp(App).use(router).directive('reveal', reveal).mount('#app');
