import { defineConfig } from "vite";
import { resolve } from "node:path";
import { appVersionPlugin } from "../../scripts/app-version.mjs";

export default defineConfig({
  base: "/",
  plugins: [appVersionPlugin()],
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
      // Pompeymon is only linked from the back room, but it lives at the same kind of path.
      "/games/pompeymon": {
        target: "http://127.0.0.1:5303",
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
        mush: resolve(__dirname, "mush/index.html"),
        phraseology: resolve(__dirname, "mush/phraseology/index.html"),
      },
    },
  },
});
