import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));
const base = process.env.GAME_BASE ?? "./";
const underSite = base.includes("/games/");

/** Dev-only chat: Workers AI REST if creds exist, else a phraseology-heavy Jim. */
function chatPlugin(): Plugin {
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
              const {
                buildMessages,
                clampHistory,
                clampUserText,
                JIM_MODEL,
                localJimReply,
                parseAiReply,
              } = await import("./src/prompt.ts");
              const rec = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
              const message = clampUserText(rec.message);
              if (!message) {
                send(res, { error: "Say something mush" }, 400);
                return;
              }
              const history = clampHistory(rec.history);
              const reply =
                (await workersAiReply(history, message, {
                  buildMessages,
                  JIM_MODEL,
                  parseAiReply,
                })) ?? localJimReply(message);
              send(res, { reply });
            } catch (err) {
              send(res, { error: err instanceof Error ? err.message : String(err) }, 500);
            }
          })();
        });
      });
    },
  };
}

async function workersAiReply(
  history: { role: "user" | "assistant"; content: string }[],
  message: string,
  ai: {
    JIM_MODEL: string;
    buildMessages: (
      history: { role: "user" | "assistant"; content: string }[],
      message: string,
    ) => { role: string; content: string }[];
    parseAiReply: (raw: unknown) => string | null;
  },
): Promise<string | null> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) return null;
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${ai.JIM_MODEL}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: ai.buildMessages(history, message),
        max_tokens: 140,
        temperature: 0.9,
      }),
    },
  );
  if (!res.ok) return null;
  const body: unknown = await res.json();
  const nested =
    body && typeof body === "object" && "result" in body
      ? (body as { result: unknown }).result
      : body;
  return ai.parseAiReply(nested) ?? ai.parseAiReply(body);
}

function send(
  res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (s?: string) => void },
  data: unknown,
  status = 200,
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
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
