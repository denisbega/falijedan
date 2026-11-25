import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const API = process.env.API_URL ?? 'http://localhost:8787';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    // API i realtime (SSE) idu na Node server; kolačići ostaju na istoj adresi
    proxy: { '/api': { target: API, changeOrigin: false } },
  },
  build: { chunkSizeWarningLimit: 900 },
});
