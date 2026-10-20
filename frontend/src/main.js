import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import Home from './views/Home.vue';
import Playlist from './views/Playlist.vue';

const routes = [
  { path: '/', component: Home },
  // Loaded on demand: it carries the map data and chart libraries.
  { path: '/insights', component: () => import('./views/Insights.vue') },
  { path: '/playlist/:id', component: Playlist, props: true },
];

const router = createRouter({ history: createWebHistory(), routes });
createApp(App).use(router).mount('#app');
