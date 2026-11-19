import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Override with SIGNBRIDGE_BACKEND_URL when the backend runs on another port.
const BACKEND_URL = process.env.SIGNBRIDGE_BACKEND_URL || 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: BACKEND_URL,
        changeOrigin: true,
        // Lets the live transcription WebSocket (/api/transcription/live) upgrade through the proxy.
        ws: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
  },
});
