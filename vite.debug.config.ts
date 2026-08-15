import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { debugArenaPlugin } from "./vite.debug-plugin";

const root = fileURLToPath(new URL(".", import.meta.url));

/**
 * Debug arena: no file watching / no auto-reload.
 * `hmr: false` alone still full-reloads on save — watch must be off too.
 * Edits land only when you hit Refresh (restarts the server, then reloads /debug).
 */
export default defineConfig({
  base: "./",
  plugins: [debugArenaPlugin({ freeze: true })],
  server: {
    port: 5299,
    strictPort: true,
    open: "/debug",
    hmr: false,
    // null = do not watch the project; saves never push a reload
    watch: null,
  },
  preview: {
    port: 4299,
    open: true,
  },
  optimizeDeps: {
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
