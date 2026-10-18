export const SCORES_API = "/api/backflip-bill/scores";
const NAME_KEY = "backflip-bill-name";

export interface ScoreRow {
  name: string;
  score: number;
  at: number;
}

export function loadSavedName(): string {
  try {
    return localStorage.getItem(NAME_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function rememberName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* private mode */
  }
}

export async function fetchBoard(): Promise<ScoreRow[]> {
  const res = await fetch(SCORES_API);
  if (!res.ok) return [];
  return readEntries(await res.json());
}

export async function submitScore(name: string, score: number): Promise<ScoreRow[]> {
  const res = await fetch(SCORES_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, score }),
  });
  if (!res.ok) throw new Error("Could not save score");
  return readEntries(await res.json());
}

function readEntries(data: unknown): ScoreRow[] {
  if (!data || typeof data !== "object") return [];
  const entries = (data as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return [];
  const out: ScoreRow[] = [];
  for (const row of entries) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (typeof r.name !== "string" || typeof r.score !== "number") continue;
    out.push({
      name: r.name,
      score: r.score,
      at: typeof r.at === "number" ? r.at : 0,
    });
  }
  return out;
}
