import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@easeupmush/shared/tool-switch': fileURLToPath(
        new URL('../../shared/toolSwitch.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/generated': 'http://127.0.0.1:8787',
    },
  },
})
