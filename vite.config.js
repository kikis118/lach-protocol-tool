import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Packaged as an Electron app now - no more separate API server, so
// nothing to proxy. Relative asset paths (base: './') matter for the
// packaged build: electron/main.mjs loads dist/index.html via
// loadFile(), a file:// URL, not served from a domain root - an
// absolute base ('/') would 404 every asset under file://.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5174,
  },
})
