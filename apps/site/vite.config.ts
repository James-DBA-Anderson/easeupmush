import { defineConfig } from "vite";

export default defineConfig({
  base: "/",
  server: {
    port: 5300,
    strictPort: true,
    open: true,
  },
  preview: {
    port: 4300,
    open: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
