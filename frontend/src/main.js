import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import Home from './views/Home.vue';
import Playlist from './views/Playlist.vue';
import Insights from './views/Insights.vue';

const routes = [
  { path: '/', component: Home },
  { path: '/insights', component: Insights },
  { path: '/playlist/:id', component: Playlist, props: true },
];

const router = createRouter({ history: createWebHistory(), routes });
createApp(App).use(router).mount('#app');
