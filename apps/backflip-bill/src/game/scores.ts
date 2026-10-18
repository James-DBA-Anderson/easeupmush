export const SCORES_API = "/api/backflip-bill/scores";
export const BOARD_TOP = 10;
const NAME_KEY = "backflip-bill-name";

export interface ScoreRow {
  name: string;
  score: number;
  at: number;
  fails: number;
  flips: number;
  hang: number;
  cleans: number;
}

export interface ScoreStats {
  fails: number;
  flips: number;
  hang: number;
  cleans: number;
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

export function wouldMakeBoard(entries: ScoreRow[], score: number): boolean {
  const top = ranked(entries).slice(0, BOARD_TOP);
  if (top.length < BOARD_TOP) return true;
  const tenth = top[BOARD_TOP - 1];
  return !!tenth && score >= tenth.score;
}

export async function fetchBoard(): Promise<ScoreRow[]> {
  const res = await fetch(SCORES_API);
  if (!res.ok) return [];
  return ranked(readEntries(await res.json()));
}

export async function submitScore(
  name: string,
  score: number,
  stats: ScoreStats,
): Promise<ScoreRow[]> {
  const res = await fetch(SCORES_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, score, ...stats }),
  });
  if (!res.ok) throw new Error("Could not save score");
  return ranked(readEntries(await res.json()));
}

function ranked(entries: ScoreRow[]): ScoreRow[] {
  return [...entries].sort((a, b) => b.score - a.score || a.at - b.at);
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
      fails: cleanCount(r.fails),
      flips: cleanCount(r.flips),
      hang: cleanHang(r.hang),
      cleans: cleanCount(r.cleans),
    });
  }
  return out;
}

function cleanCount(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(9999, Math.floor(raw)));
}

function cleanHang(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(600, Math.round(raw * 100) / 100));
}
