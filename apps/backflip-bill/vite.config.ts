import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));
const base = process.env.GAME_BASE ?? "./";
const underSite = base.includes("/games/");

/** Dev-only: high scores in a gitignored file instead of Cloudflare KV. */
function scoresPlugin(): Plugin {
  const file = resolve(root, ".local/scores.json");
  const maxName = 18;
  const maxScore = 1_000_000;
  const maxRows = 50;

  const cleanName = (raw: unknown): string | null => {
    if (typeof raw !== "string") return null;
    const name = raw.replace(/\s+/g, " ").trim();
    if (name.length < 1 || name.length > maxName) return null;
    if (!/^[\p{L}\p{N} .'\-]+$/u.test(name)) return null;
    return name;
  };
  const cleanScore = (raw: unknown): number | null => {
    if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
    const n = Math.floor(raw);
    if (n < 0 || n > maxScore) return null;
    return n;
  };
  const cleanCount = (raw: unknown): number => {
    if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
    return Math.max(0, Math.min(9999, Math.floor(raw)));
  };
  const cleanHang = (raw: unknown): number => {
    if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
    return Math.max(0, Math.min(600, Math.round(raw * 100) / 100));
  };
  type ScoreEntry = {
    name: string;
    score: number;
    at: number;
    fails: number;
    flips: number;
    hang: number;
    cleans: number;
  };
  const parseBoard = (raw: unknown): ScoreEntry[] => {
    if (!raw || typeof raw !== "object") return [];
    const entries = (raw as { entries?: unknown }).entries;
    if (!Array.isArray(entries)) return [];
    const out: ScoreEntry[] = [];
    for (const row of entries) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const name = cleanName(r.name);
      const score = cleanScore(r.score);
      const at = typeof r.at === "number" && Number.isFinite(r.at) ? r.at : 0;
      if (name && score !== null) {
        out.push({
          name,
          score,
          at,
          fails: cleanCount(r.fails),
          flips: cleanCount(r.flips),
          hang: cleanHang(r.hang),
          cleans: cleanCount(r.cleans),
        });
      }
    }
    return out;
  };
  const readBoard = async () => {
    try {
      return parseBoard(JSON.parse(await readFile(file, "utf8")));
    } catch {
      return [];
    }
  };
  const send = (res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (s?: string) => void }, data: unknown, status = 200) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(data));
  };

  return {
    name: "backflip-bill-scores",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split("?")[0] ?? "";
        if (!path.endsWith("/api/backflip-bill/scores")) {
          next();
          return;
        }
        if (req.method === "GET") {
          void readBoard().then((entries) => send(res, { entries }));
          return;
        }
        if (req.method !== "POST") {
          send(res, { error: "Method not allowed" }, 405);
          return;
        }
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });
        req.on("end", () => {
          void (async () => {
            try {
              const rec = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
              const name = cleanName(rec.name);
              const score = cleanScore(rec.score);
              if (!name || score === null) {
                send(res, { error: "Need a name and a score" }, 400);
                return;
              }
              const prev = await readBoard();
              const key = name.toLowerCase();
              const rest = prev.filter((e) => e.name.toLowerCase() !== key);
              const old = prev.find((e) => e.name.toLowerCase() === key);
              const next = {
                name,
                score,
                at: Date.now(),
                fails: cleanCount(rec.fails),
                flips: cleanCount(rec.flips),
                hang: cleanHang(rec.hang),
                cleans: cleanCount(rec.cleans),
              };
              const best = old && old.score > score ? old : next;
              rest.push(best);
              rest.sort((a, b) => b.score - a.score || a.at - b.at);
              const entries = rest.slice(0, maxRows);
              await mkdir(dirname(file), { recursive: true });
              await writeFile(file, `${JSON.stringify({ entries }, null, 2)}\n`, "utf8");
              const rank = entries.findIndex((e) => e.name.toLowerCase() === key) + 1;
              send(res, { entries, rank });
            } catch (err) {
              send(res, { error: err instanceof Error ? err.message : String(err) }, 500);
            }
          })();
        });
      });
    },
  };
}

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
  plugins: [tuningSavePlugin(), scoresPlugin()],
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
