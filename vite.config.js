import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Local-only admin tool - the API lives on a separate small Express
// server (server/index.mjs) since PDF parsing (pdfjs-dist) and the WP
// Application Password credentials both need to stay server-side, never
// shipped to the browser. Proxied under /api the same way the main
// lach-hockey-app proxies to lach.lv in dev.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
