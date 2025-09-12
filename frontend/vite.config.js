import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// No proxy. Calls go to VITE_API_BASE_URL with credentials.
export default defineConfig({
  plugins: [vue()],
  server: { port: 5173 }
});
