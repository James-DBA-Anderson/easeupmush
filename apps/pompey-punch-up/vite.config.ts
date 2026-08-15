import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { debugArenaPlugin } from "./vite.debug-plugin";

const root = fileURLToPath(new URL(".", import.meta.url));

/** Production path under easeupmush.com; relative `./` for local preview of this app alone. */
const base = process.env.GAME_BASE ?? "./";

/** Static standalone site — relative asset paths work on any host/path. */
export default defineConfig({
  base,
  plugins: [debugArenaPlugin()],
  server: {
    port: 5299,
    strictPort: true,
    open: true,
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
