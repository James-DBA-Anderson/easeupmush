import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));
const base = process.env.GAME_BASE ?? "./";
const underSite = base.includes("/games/");

/** Dev-only: debug menu Save writes `src/game/tuning.json`. */
function tuningSavePlugin(): Plugin {
  const tuningPath = resolve(root, "src/game/tuning.json");
  return {
    name: "backflip-bill-tuning-save",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split("?")[0] ?? "";
        if (req.method !== "POST" || !path.endsWith("/__debug/tuning")) {
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
              const data = JSON.parse(raw) as Record<string, unknown>;
              if (!data || typeof data !== "object") {
                res.statusCode = 400;
                res.setHeader("Content-Type", "text/plain");
                res.end("Expected a tuning object.");
                return;
              }
              await writeFile(tuningPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
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
  plugins: [tuningSavePlugin()],
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
