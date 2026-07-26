import { defineConfig } from "vite";

/** Static standalone site — relative asset paths work on any host/path. */
export default defineConfig({
  base: "./",
  server: {
    port: 5299,
    strictPort: true,
    open: true,
  },
  preview: {
    port: 4299,
    open: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: 0,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ["phaser"],
        },
      },
    },
  },
});
