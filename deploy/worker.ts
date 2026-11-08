import { isFilthyName } from "../apps/backflip-bill/src/game/profanity.ts";
import { KNOWLEDGE_KEY, type JimKnowledge } from "../apps/pompey-jim/src/knowledge.ts";
import { clampHistory, clampUserText } from "../apps/pompey-jim/src/prompt.ts";
import {
  clampHintName,
  clampUserId,
  JIM_MODEL,
  jimChat,
  jimHello,
  jimPeek,
  jobKey,
} from "../apps/pompey-jim/src/turn.ts";
import type { JimJob } from "../apps/pompey-jim/src/knowledge.ts";

const BOARD_KEY = "backflip-bill:board";
const MAX_NAME = 18;
const MAX_SCORE = 1_000_000;
const MAX_ROWS = 50;

const TERRAIN_PATH = "/games/simpompey/models/portsmouth-terrain.bin";
const TERRAIN_KEY = "simpompey/portsmouth-terrain.bin";
const TERRAIN_MANIFEST_KEY = "simpompey/portsmouth-terrain.json";

type TerrainPart = { key: string; size: number };
type TerrainManifest = { hash?: string; size?: number; parts?: TerrainPart[] };

interface Env {
  SCORES: KVNamespace;
  MAPS: R2Bucket;
  AI: {
    run(
      model: string,
      inputs: {
        messages: { role: string; content: string }[];
        max_tokens?: number;
        temperature?: number;
      },
    ): Promise<unknown>;
  };
}

interface ScoreEntry {
  name: string;
  score: number;
  at: number;
  fails: number;
  flips: number;
  hang: number;
  cleans: number;
}

export default {
  async fetch(request: Request, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === TERRAIN_PATH) {
      return handleTerrain(request, env);
    }
    if (url.pathname === "/api/backflip-bill/scores") {
      return handleScores(request, env);
    }
    if (url.pathname === "/api/pompey-jim/chat") {
      return handleJimChat(request, env, ctx);
    }
    return new Response("Not found", { status: 404 });
  },
};

async function handleTerrain(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  const manifest = await readTerrainManifest(env);
  const parts = manifest?.parts?.filter((part) => part.key && part.size > 0) ?? [];
  if (!parts.length) {
    const object = await env.MAPS.get(TERRAIN_KEY);
    if (!object) return new Response("Map mesh missing", { status: 503 });
    return serveSingleTerrain(request, object);
  }
  const size = parts.reduce((sum, part) => sum + part.size, 0);

  const range = parseBytesRange(request.headers.get("Range"), size);
  if (range === "unsatisfiable") {
    const headers = terrainHeaders({ size, ranged: true, hash: manifest?.hash });
    headers.set("Content-Range", `bytes */${size}`);
    headers.set("Content-Length", "0");
    return new Response(null, { status: 416, headers });
  }
  const start = range?.start ?? 0;
  const end = range?.end ?? size - 1;
  const ranged = Boolean(range);
  const headers = terrainHeaders({ size, start, end, ranged, hash: manifest?.hash });

  if (request.method === "HEAD") {
    return new Response(null, { status: ranged ? 206 : 200, headers });
  }

  return new Response(streamTerrainParts(env, parts, start, end), {
    status: ranged ? 206 : 200,
    headers,
  });
}

async function readTerrainManifest(env: Env): Promise<TerrainManifest | null> {
  const object = await env.MAPS.get(TERRAIN_MANIFEST_KEY);
  if (!object) return null;
  try {
    return await object.json<TerrainManifest>();
  } catch {
    return null;
  }
}

function serveSingleTerrain(request: Request, object: R2ObjectBody): Response {
  const headers = terrainHeaders({
    size: object.size,
    start: 0,
    end: object.size - 1,
    ranged: false,
    hash: object.etag,
  });
  if (request.method === "HEAD") return new Response(null, { headers });
  return new Response(object.body, { headers });
}

function terrainHeaders(opts: {
  size: number;
  start?: number;
  end?: number;
  ranged: boolean;
  hash?: string;
}): Headers {
  const headers = new Headers();
  const start = opts.start ?? 0;
  const end = opts.end ?? opts.size - 1;
  headers.set("Content-Type", "application/octet-stream");
  headers.set("Accept-Ranges", "bytes");
  headers.set("Vary", "Range");
  headers.set("Content-Length", String(Math.max(0, end - start + 1)));
  if (opts.hash) headers.set("ETag", `"${opts.hash.replace(/"/g, "")}"`);
  if (opts.ranged && opts.start !== undefined) {
    headers.set("Content-Range", `bytes ${start}-${end}/${opts.size}`);
  }
  if (opts.ranged) {
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  } else {
    headers.set("Cache-Control", "no-store");
    headers.set("CDN-Cache-Control", "no-store");
    headers.set("Cloudflare-CDN-Cache-Control", "no-store");
  }
  return headers;
}

function parseBytesRange(header: string | null, size: number): { start: number; end: number } | "unsatisfiable" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match) return "unsatisfiable";
  const hasStart = match[1] !== "";
  const hasEnd = match[2] !== "";
  if (!hasStart && !hasEnd) return "unsatisfiable";
  let start = hasStart ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  let end = hasEnd && hasStart ? Number(match[2]) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size || start > end) {
    return "unsatisfiable";
  }
  end = Math.min(end, size - 1);
  return { start, end };
}

function streamTerrainParts(
  env: Env,
  parts: TerrainPart[],
  start: number,
  end: number,
): ReadableStream<Uint8Array> {
  const slices: { key: string; offset: number; length: number }[] = [];
  let cursor = 0;
  for (const part of parts) {
    const partEnd = cursor + part.size;
    const sliceStart = Math.max(start, cursor);
    const sliceEnd = Math.min(end + 1, partEnd);
    if (sliceStart < sliceEnd) {
      slices.push({ key: part.key, offset: sliceStart - cursor, length: sliceEnd - sliceStart });
    }
    cursor = partEnd;
    if (cursor > end) break;
  }

  let index = 0;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  return new ReadableStream({
    async pull(controller) {
      while (true) {
        if (!reader) {
          if (index >= slices.length) {
            controller.close();
            return;
          }
          const slice = slices[index++];
          const object = await env.MAPS.get(slice.key, {
            range: { offset: slice.offset, length: slice.length },
          });
          if (!object?.body) throw new Error(`Map mesh part missing: ${slice.key}`);
          reader = object.body.getReader();
        }
        const { done, value } = await reader.read();
        if (done) {
          reader = null;
          continue;
        }
        if (value) controller.enqueue(value);
        return;
      }
    },
    cancel() {
      void reader?.cancel();
    },
  });
}

function jimStore(env: Env) {
  return {
    async load(): Promise<unknown> {
      return env.SCORES.get(KNOWLEDGE_KEY, "json");
    },
    async save(kb: JimKnowledge): Promise<void> {
      await env.SCORES.put(KNOWLEDGE_KEY, JSON.stringify(kb));
    },
  };
}

function jimJobs(env: Env) {
  return {
    async get(userId: string): Promise<unknown> {
      return env.SCORES.get(jobKey(userId), "json");
    },
    async set(job: JimJob): Promise<void> {
      await env.SCORES.put(jobKey(job.userId), JSON.stringify(job));
    },
    async clear(userId: string): Promise<void> {
      await env.SCORES.delete(jobKey(userId));
    },
  };
}

function jimAi(env: Env) {
  return (
    messages: { role: string; content: string }[],
    opts: { max_tokens: number; temperature: number },
  ) => env.AI.run(JIM_MODEL, { messages, ...opts });
}

async function handleJimChat(
  request: Request,
  env: Env,
  ctx: { waitUntil(p: Promise<unknown>): void },
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }
  const store = jimStore(env);
  const jobs = jimJobs(env);
  if (request.method === "GET") {
    const url = new URL(request.url);
    const userId = clampUserId(url.searchParams.get("user"));
    if (url.searchParams.get("job") === "1") {
      return json(await jimPeek(jobs, userId));
    }
    const hint = clampHintName(url.searchParams.get("name"));
    const hello = await jimHello(store, userId, hint);
    if (hello.browse) ctx.waitUntil(hello.browse());
    return json({ reply: hello.reply, name: hello.name });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Expected JSON" }, 400);
  }
  const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const message = clampUserText(rec.message);
  if (!message) {
    return json({ error: "Say something mush" }, 400);
  }
  const { reply, reading, name, remember, follow, browse } = await jimChat({
    message,
    history: clampHistory(rec.history),
    userId: clampUserId(rec.user),
    hintName: clampHintName(rec.name),
    store,
    jobs,
    runAi: jimAi(env),
  });
  ctx.waitUntil(remember());
  if (follow) ctx.waitUntil(follow());
  if (browse) ctx.waitUntil(browse());
  return json({ reply, reading, name });
}

async function handleScores(request: Request, env: Env): Promise<Response> {
  if (request.method === "GET") {
    const entries = await readBoard(env);
    return json({ entries });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Expected JSON" }, 400);
  }
  const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (typeof rec.name === "string" && isFilthyName(rec.name)) {
    return json({ error: "filth" }, 400);
  }
  const name = cleanName(rec.name);
  const score = cleanScore(rec.score);
  if (!name || score === null) {
    return json({ error: "Need a name and a score" }, 400);
  }
  const prev = await readBoard(env);
  const entries = upsert(prev, {
    name,
    score,
    at: Date.now(),
    fails: cleanCount(rec.fails),
    flips: cleanCount(rec.flips),
    hang: cleanHang(rec.hang),
    cleans: cleanCount(rec.cleans),
  });
  await env.SCORES.put(BOARD_KEY, JSON.stringify({ entries }));
  const rank = entries.findIndex((e) => e.name.toLowerCase() === name.toLowerCase()) + 1;
  return json({ entries, rank });
}

async function readBoard(env: Env): Promise<ScoreEntry[]> {
  const raw = await env.SCORES.get(BOARD_KEY, "json");
  return parseBoard(raw);
}

function parseBoard(raw: unknown): ScoreEntry[] {
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
}

function upsert(board: ScoreEntry[], next: ScoreEntry): ScoreEntry[] {
  const key = next.name.toLowerCase();
  const rest = board.filter((e) => e.name.toLowerCase() !== key);
  const prev = board.find((e) => e.name.toLowerCase() === key);
  const best = prev && prev.score > next.score ? prev : next;
  rest.push(best);
  rest.sort((a, b) => b.score - a.score || a.at - b.at);
  return rest.slice(0, MAX_ROWS);
}

function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim();
  if (name.length < 1 || name.length > MAX_NAME) return null;
  if (!/^[\p{L}\p{N} .'\-]+$/u.test(name)) return null;
  if (isFilthyName(name)) return null;
  return name;
}

function cleanScore(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const n = Math.floor(raw);
  if (n < 0 || n > MAX_SCORE) return null;
  return n;
}

function cleanCount(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(9999, Math.floor(raw)));
}

function cleanHang(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(600, Math.round(raw * 100) / 100));
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
