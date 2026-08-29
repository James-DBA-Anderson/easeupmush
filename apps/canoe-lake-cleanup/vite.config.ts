import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

const base = process.env.GAME_BASE ?? "./";
const underSite = base.includes("/games/");

export default defineConfig({
  base,
  server: {
    port: 5304,
    strictPort: true,
    host: "127.0.0.1",
    open: underSite ? false : true,
  },
  preview: {
    port: 4304,
    open: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: 0,
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
      },
      output: {
        manualChunks: {
          three: ["three"],
        },
      },
    },
  },
});
