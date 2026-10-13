import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));
const base = process.env.GAME_BASE ?? "./";
const underSite = base.includes("/games/");

export default defineConfig({
  base,
  server: {
    port: 5306,
    strictPort: true,
    host: true,
    allowedHosts: true,
    open: underSite ? false : true,
  },
  preview: {
    port: 4306,
    open: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
      },
    },
  },
});
