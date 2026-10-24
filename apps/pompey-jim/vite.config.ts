import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import type { JimJob, JimKnowledge } from "./src/knowledge";
import { clampHistory, clampUserText } from "./src/prompt";
import { clampUserId, JIM_MODEL, jimChat, jimHello, jimPeek, type AiRunner } from "./src/turn";

const root = fileURLToPath(new URL(".", import.meta.url));
const base = process.env.GAME_BASE ?? "./";
const underSite = base.includes("/games/");
const knowledgeFile = resolve(root, ".local/jim-knowledge.json");
const jobs = new Map<string, JimJob>();

/** Dev-only chat: Workers AI REST if creds exist, else a phraseology-heavy Jim. Knowledge in `.local/`. */
function chatPlugin(): Plugin {
  const store = {
    async load(): Promise<unknown> {
      try {
        return JSON.parse(await readFile(knowledgeFile, "utf8")) as unknown;
      } catch {
        return null;
      }
    },
    async save(kb: JimKnowledge): Promise<void> {
      await mkdir(dirname(knowledgeFile), { recursive: true });
      await writeFile(knowledgeFile, `${JSON.stringify(kb, null, 2)}\n`, "utf8");
    },
  };

  const jobStore = {
    async get(userId: string): Promise<unknown> {
      return jobs.get(userId) ?? null;
    },
    async set(job: JimJob): Promise<void> {
      jobs.set(job.userId, job);
    },
    async clear(userId: string): Promise<void> {
      jobs.delete(userId);
    },
  };

  const send = (
    res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (s?: string) => void },
    data: unknown,
    status = 200,
  ) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(data));
  };

  return {
    name: "pompey-jim-chat",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split("?")[0] ?? "";
        if (!path.endsWith("/api/pompey-jim/chat")) {
          next();
          return;
        }
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method === "GET") {
          const url = new URL(req.url ?? "/", "http://pompey-jim.local");
          const userId = clampUserId(url.searchParams.get("user"));
          if (url.searchParams.get("job") === "1") {
            void jimPeek(jobStore, userId).then((body) => send(res, body));
            return;
          }
          void jimHello(store, userId).then((reply) => {
            send(res, { reply });
          });
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
              const message = clampUserText(rec.message);
              if (!message) {
                send(res, { error: "Say something mush" }, 400);
                return;
              }
              const { reply, reading, remember, follow } = await jimChat({
                message,
                history: clampHistory(rec.history),
                userId: clampUserId(rec.user),
                store,
                jobs: jobStore,
                runAi: cloudflareAi(),
              });
              await remember();
              if (follow) void follow();
              send(res, { reply, reading });
            } catch (err) {
              send(res, { error: err instanceof Error ? err.message : String(err) }, 500);
            }
          })();
        });
      });
    },
  };
}

function cloudflareAi(): AiRunner | null {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) return null;
  return async (messages, opts) => {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${JIM_MODEL}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages, ...opts }),
      },
    );
    if (!res.ok) throw new Error(`Workers AI ${res.status}`);
    const body: unknown = await res.json();
    return body && typeof body === "object" && "result" in body
      ? (body as { result: unknown }).result
      : body;
  };
}

export default defineConfig({
  base,
  plugins: [chatPlugin()],
  resolve: {
    alias: {
      "@easeupmush/shared/phraseology": resolve(root, "../../shared/phraseology.json"),
    },
  },
  server: {
    port: 5307,
    strictPort: true,
    host: true,
    allowedHosts: true,
    open: underSite ? false : true,
  },
  preview: {
    port: 4307,
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
