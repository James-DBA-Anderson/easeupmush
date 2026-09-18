import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

const base = process.env.GAME_BASE ?? "./";
const underSite = base.includes("/games/");

/** Dev-only: editor Save writes `public/levels/canoe-lake.json`. */
function levelSavePlugin(): Plugin {
  const levelPath = resolve(root, "public/levels/canoe-lake.json");
  return {
    name: "canoe-lake-level-save",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== "POST" || req.url?.split("?")[0] !== "/__canoe_lake_save_level") {
          next();
          return;
        }

        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });
        req.on("end", () => {
          void (async () => {
            try {
              const raw = Buffer.concat(chunks).toString("utf8");
              const data = JSON.parse(raw) as { version?: number };
              if (data?.version !== 1) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "text/plain");
                res.end("Expected level version 1.");
                return;
              }
              await mkdir(resolve(root, "public/levels"), { recursive: true });
              await writeFile(
                levelPath,
                `${JSON.stringify(data, null, 2)}\n`,
                "utf8",
              );
              res.statusCode = 204;
              res.end();
            } catch (err) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "text/plain");
              res.end(err instanceof Error ? err.message : String(err));
            }
          })();
        });
      });
    },
  };
}

export default defineConfig({
  base,
  plugins: [levelSavePlugin()],
  server: {
    port: 5304,
    strictPort: true,
    // Reachable on the LAN so you can play from a phone on the same Wi‑Fi.
    host: true,
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
        editor: resolve(root, "editor.html"),
      },
      output: {
        manualChunks: {
          three: ["three"],
        },
      },
    },
  },
});
