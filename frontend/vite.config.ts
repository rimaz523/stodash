import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The .NET API runs on :5080. Proxying /api keeps the browser on one origin (no CORS)
// and means API keys never reach the frontend.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:5080', changeOrigin: true },
      // Live watchlist prices (WebSocket relay of Finnhub trades).
      '/ws': { target: 'ws://localhost:5080', ws: true },
    },
  },
})
