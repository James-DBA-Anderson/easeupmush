import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import type { JimJob, JimKnowledge } from "./src/knowledge";
import { clampHistory, clampUserText } from "./src/prompt";
import { makeAiRunner } from "@easeupmush/shared/ai";
import {
  clampHintName,
  clampUserId,
  jimChat,
  jimHello,
  jimPeek,
} from "./src/turn";

const root = fileURLToPath(new URL(".", import.meta.url));
const base = process.env.GAME_BASE ?? "./";
const underSite = base.includes("/games/");
const knowledgeFile = resolve(root, ".local/jim-knowledge.json");
const jobs = new Map<string, JimJob>();

/** Dev-only chat: Workers AI / OpenRouter REST if creds exist, else a phraseology-heavy Jim. Knowledge in `.local/`. */
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
          const hint = clampHintName(url.searchParams.get("name"));
          void jimHello(store, userId, hint).then((body) => {
            if (body.browse) void body.browse();
            send(res, { reply: body.reply, name: body.name });
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
              const { reply, reading, name, remember, follow, browse } = await jimChat({
                message,
                history: clampHistory(rec.history),
                userId: clampUserId(rec.user),
                hintName: clampHintName(rec.name),
                store,
                jobs: jobStore,
                runAi: makeAiRunner(),
              });
              await remember();
              if (follow) void follow();
              if (browse) void browse();
              send(res, { reply, reading, name });
            } catch (err) {
              send(res, { error: err instanceof Error ? err.message : String(err) }, 500);
            }
          })();
        });
      });
    },
  };
}

export default defineConfig({
  base,
  plugins: [chatPlugin()],
  resolve: {
    alias: {
      "@easeupmush/shared": resolve(root, "../../shared"),
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
