import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@canoe-lake': fileURLToPath(
        new URL('../../apps/canoe-lake-cleanup/src/game', import.meta.url),
      ),
      '@easeupmush/canoe-lake-cleanup/dialogue': fileURLToPath(
        new URL(
          '../../apps/canoe-lake-cleanup/src/dialogue/index.ts',
          import.meta.url,
        ),
      ),
      '@easeupmush/shared/dialogue': fileURLToPath(
        new URL('../../shared/dialogue.ts', import.meta.url),
      ),
      '@easeupmush/shared/tool-switch': fileURLToPath(
        new URL('../../shared/toolSwitch.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5175,
    host: true,
    proxy: {
      '/api': 'http://127.0.0.1:8789',
      '/recordings': 'http://127.0.0.1:8789',
    },
  },
})
