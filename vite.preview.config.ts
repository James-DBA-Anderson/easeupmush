import { defineConfig } from "vite";

/** Preview the assembled monorepo dist/ (site + games). */
export default defineConfig({
  preview: {
    port: 4299,
    open: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: false,
  },
});
