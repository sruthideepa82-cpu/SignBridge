import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    proxy: {
      // The interpretation server. Port 8000 belongs to the existing SignBridge backend.
      '/api': 'http://localhost:8100',
    },
  },
});
