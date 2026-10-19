import { isFilthyName } from "../apps/backflip-bill/src/game/profanity.ts";

const BOARD_KEY = "backflip-bill:board";
const MAX_NAME = 18;
const MAX_SCORE = 1_000_000;
const MAX_ROWS = 50;

interface Env {
  SCORES: KVNamespace;
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
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/backflip-bill/scores") {
      return handleScores(request, env);
    }
    return new Response("Not found", { status: 404 });
  },
};

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
