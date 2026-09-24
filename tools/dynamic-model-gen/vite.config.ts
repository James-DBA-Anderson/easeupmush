import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    host: true,
    proxy: {
      '/api': 'http://127.0.0.1:8788',
      '/generated': 'http://127.0.0.1:8788',
    },
  },
})
