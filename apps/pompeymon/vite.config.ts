import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    host: true,
    port: 5303,
    strictPort: true,
    open: true,
  },
  preview: {
    port: 4303,
    open: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
