import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development, API calls to /api and the chat socket are proxied to the Express server.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://localhost:5000',
        changeOrigin: true,
      },
      // Live chat (Socket.IO) — WebSocket upgrade must be proxied too.
      '/socket.io': {
        target: process.env.VITE_API_PROXY || 'http://localhost:5000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
