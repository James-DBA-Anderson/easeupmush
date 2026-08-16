import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "/",
  server: {
    port: 5300,
    strictPort: true,
    open: true,
    proxy: {
      // Same paths as production / Cloudflare — game Vite must use GAME_BASE=/games/pompey-punch-up/
      "/games/pompey-punch-up": {
        target: "http://127.0.0.1:5299",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    port: 4300,
    open: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        about: resolve(__dirname, "about/index.html"),
      },
    },
  },
});
