import { defineConfig } from "vite";
import { appVersionPlugin } from "../../scripts/app-version.mjs";

/** Proxied path under easeupmush.com; relative `./` when the game runs on its own. */
const base = process.env.GAME_BASE ?? "./";
const underSite = base.includes("/games/");

export default defineConfig({
  plugins: [appVersionPlugin()],
  base,
  server: {
    host: true,
    port: 5303,
    strictPort: true,
    open: !underSite,
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
