import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));
const base = process.env.GAME_BASE ?? "./";

export default defineConfig({
  base,
  resolve: {
    alias: {
      "@easeupmush/shared/dialogue": resolve(root, "../../shared/dialogue.ts"),
    },
  },
  server: {
    port: 5308,
    strictPort: true,
    host: true,
    allowedHosts: true,
    open: false,
    watch: {
      // 125MB terrain bin + tree JSON — watching them full-reloads WebGL and can OOM the IDE.
      ignored: ["**/public/models/**"],
    },
  },
  preview: {
    port: 4308,
    open: false,
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
