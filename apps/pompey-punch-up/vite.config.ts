import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { debugArenaPlugin } from "./vite.debug-plugin";

const root = fileURLToPath(new URL(".", import.meta.url));

/** Production / proxied path under easeupmush.com; relative `./` for solo game preview. */
const base = process.env.GAME_BASE ?? "./";
const underSite = base.includes("/games/");

/** Static standalone site — relative asset paths work on any host/path. */
export default defineConfig({
  base,
  plugins: [debugArenaPlugin()],
  server: {
    port: 5299,
    strictPort: true,
    host: "127.0.0.1",
    open: underSite ? false : true,
  },
  preview: {
    port: 4298,
    open: true,
  },
  optimizeDeps: {
    // Absolute entries so the scanner doesn't choke on relative rollup input
    entries: [resolve(root, "index.html"), resolve(root, "debug.html")],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: 0,
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        debug: resolve(root, "debug.html"),
      },
      output: {
        manualChunks: {
          phaser: ["phaser"],
        },
      },
    },
  },
});
