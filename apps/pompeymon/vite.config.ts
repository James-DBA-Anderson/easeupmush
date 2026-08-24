import { defineConfig } from "vite";
import { appVersionPlugin } from "../../scripts/app-version.mjs";

export default defineConfig({
  plugins: [appVersionPlugin()],
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
