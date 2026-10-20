import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import Home from './views/Home.vue';
import Playlist from './views/Playlist.vue';
import { setTitle } from './title.js';

const routes = [
  { path: '/', component: Home, meta: { title: 'Playlists' } },
  // Loaded on demand: it carries the map data and chart libraries.
  { path: '/insights', component: () => import('./views/Insights.vue'), meta: { title: 'Insights' } },
  // The title follows the playlist name once it is known.
  { path: '/playlist/:id', component: Playlist, props: true, meta: { title: 'Playlist', section: '/' } },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: (to, from, saved) => saved || (to.path !== from.path ? { top: 0 } : undefined),
});
router.afterEach((to) => setTitle(to.meta.title));
createApp(App).use(router).mount('#app');
