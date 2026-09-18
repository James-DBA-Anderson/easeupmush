/** Built-in scripted jobs the game already wires up. */
export type MissionId = "picnic" | "geese" | "fire" | "rebels" | "racers";

export const MISSION_IDS: readonly MissionId[] = [
  "picnic",
  "geese",
  "fire",
  "rebels",
  "racers",
] as const;

export const MISSION_LABELS: Record<MissionId, string> = {
  picnic: "Picnic raid",
  geese: "Geese inbound",
  fire: "Grass fire",
  rebels: "Rebel raid",
  racers: "Boy racers",
};

/**
 * When a mission may begin on the shift clock.
 * - `gameStart` / `gameEnd` — clock-on and end of the 24h shift (06:00).
 * - number — fractional hour 0–24 (e.g. 15.5 = 15:30).
 */
export type MissionClock = "gameStart" | "gameEnd" | number;

/**
 * Authored mission pin. Built-ins use a fixed `id`; placeholders use a
 * generated id plus a `name` so you can sketch jobs before wiring them.
 */
export interface MissionSpot {
  id: string;
  /** Display name. Built-ins fall back to {@link MISSION_LABELS} when omitted. */
  name?: string;
  x: number;
  z: number;
  /** Earliest the mission may begin. */
  start: MissionClock;
  /** After this, the mission will no longer start (wraps past midnight). */
  end: MissionClock;
}

/** Shift clock-on hour — matches DayCycle. */
export const MISSION_SHIFT_START = 6;

/** Sensible fallbacks matching the old hard-coded spawn / aim / hours. */
export const DEFAULT_MISSION_SPOTS: readonly MissionSpot[] = [
  { id: "picnic", x: 140, z: -10, start: 9.5, end: 17 },
  { id: "geese", x: 0, z: -8, start: 10, end: 18 },
  { id: "fire", x: 118, z: -28, start: 15, end: 19.5 },
  { id: "racers", x: 20, z: -117, start: 22, end: 1 },
  { id: "rebels", x: 10, z: -150, start: 1, end: 6 },
];

export function isMissionId(v: unknown): v is MissionId {
  return typeof v === "string" && (MISSION_IDS as readonly string[]).includes(v);
}

export function isPlaceholderMission(m: Pick<MissionSpot, "id">): boolean {
  return !isMissionId(m.id);
}

export function missionLabel(m: Pick<MissionSpot, "id" | "name">): string {
  const named = m.name?.trim();
  if (named) return named;
  if (isMissionId(m.id)) return MISSION_LABELS[m.id];
  return "Untitled mission";
}

export function makePlaceholderMissionId(): string {
  return `ph_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function isMissionClock(v: unknown): v is MissionClock {
  if (v === "gameStart" || v === "gameEnd") return true;
  return typeof v === "number" && Number.isFinite(v);
}

/** Parse editor / JSON clock values. */
export function parseMissionClock(raw: unknown, fallback: MissionClock): MissionClock {
  if (raw === "gameStart" || raw === "gameEnd") return raw;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return ((raw % 24) + 24) % 24;
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n)) return ((n % 24) + 24) % 24;
  }
  return fallback;
}

export function formatMissionClock(c: MissionClock): string {
  if (c === "gameStart") return "Game start";
  if (c === "gameEnd") return "Game end";
  const h = Math.floor(c);
  const m = Math.round((c - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Resolve to a hour-of-day for window maths (gameEnd → next 06:00). */
export function missionClockHour(c: MissionClock): number {
  if (c === "gameStart") return MISSION_SHIFT_START;
  if (c === "gameEnd") return MISSION_SHIFT_START;
  return ((c % 24) + 24) % 24;
}

/**
 * True if `hour` lies in [start, end) on the shift clock.
 * `gameStart`→`gameEnd` is the whole shift. Windows may wrap past midnight
 * (e.g. rebels 01:00–06:00).
 */
export function isInMissionWindow(
  hour: number,
  start: MissionClock,
  end: MissionClock,
): boolean {
  if (start === "gameStart" && end === "gameEnd") return true;

  const h = ((hour % 24) + 24) % 24;
  const s = missionClockHour(start);
  const e = missionClockHour(end);

  // Identical clock hours with mixed anchors still mean "all day".
  if (start !== "gameStart" && end !== "gameEnd" && Math.abs(s - e) < 1e-6) {
    return true;
  }
  // end gameEnd → open from start until next shift start (wrap).
  if (end === "gameEnd") {
    if (start === "gameStart") return true;
    return h >= s || h < MISSION_SHIFT_START;
  }
  if (s < e) return h >= s && h < e;
  return h >= s || h < e;
}

function fallbackForId(id: string): Pick<MissionSpot, "start" | "end" | "name"> {
  if (isMissionId(id)) {
    const d = DEFAULT_MISSION_SPOTS.find((s) => s.id === id)!;
    return { start: d.start, end: d.end };
  }
  return { start: "gameStart", end: "gameEnd", name: "New mission" };
}

function parseMissionSpot(item: unknown): MissionSpot | null {
  if (!item || typeof item !== "object") return null;
  const m = item as Partial<MissionSpot> & { start?: unknown; end?: unknown };
  if (typeof m.id !== "string" || !m.id.trim()) return null;
  if (typeof m.x !== "number" || typeof m.z !== "number") return null;
  if (!Number.isFinite(m.x) || !Number.isFinite(m.z)) return null;
  const id = m.id.trim();
  const fallback = fallbackForId(id);
  const name =
    typeof m.name === "string"
      ? m.name
      : isMissionId(id)
        ? undefined
        : (fallback.name ?? "New mission");
  return {
    id,
    ...(name !== undefined ? { name } : {}),
    x: m.x,
    z: m.z,
    start: parseMissionClock(m.start, fallback.start),
    end: parseMissionClock(m.end, fallback.end),
  };
}

/**
 * Built-ins always present (one each); placeholders append after.
 * Duplicate built-in ids keep the first; duplicate placeholder ids get a new id.
 */
export function normalizeMissionSpots(raw: unknown): MissionSpot[] {
  const builtins = new Map<MissionId, MissionSpot>();
  const placeholders: MissionSpot[] = [];
  const seenPh = new Set<string>();

  if (Array.isArray(raw)) {
    for (const item of raw) {
      const spot = parseMissionSpot(item);
      if (!spot) continue;
      if (isMissionId(spot.id)) {
        if (!builtins.has(spot.id)) builtins.set(spot.id, spot);
        continue;
      }
      let id = spot.id;
      if (seenPh.has(id) || isMissionId(id)) {
        id = makePlaceholderMissionId();
      }
      seenPh.add(id);
      placeholders.push({ ...spot, id });
    }
  }

  const built = MISSION_IDS.map((id) => {
    const have = builtins.get(id);
    if (have) return have;
    const fallback = DEFAULT_MISSION_SPOTS.find((s) => s.id === id)!;
    return {
      id,
      x: fallback.x,
      z: fallback.z,
      start: fallback.start,
      end: fallback.end,
    };
  });

  return [...built, ...placeholders];
}

export function createPlaceholderMission(
  x: number,
  z: number,
  name = "New mission",
  start: MissionClock = "gameStart",
  end: MissionClock = "gameEnd",
): MissionSpot {
  return {
    id: makePlaceholderMissionId(),
    name,
    x,
    z,
    start,
    end,
  };
}

/** Half-hour options for the editor clock dropdowns. */
export function missionClockChoices(): MissionClock[] {
  const hours: MissionClock[] = ["gameStart"];
  for (let h = 0; h < 24; h += 0.5) hours.push(h);
  hours.push("gameEnd");
  return hours;
}

export function missionClockSelectValue(c: MissionClock): string {
  if (c === "gameStart" || c === "gameEnd") return c;
  return String(c);
}

export function missionClockFromSelectValue(v: string): MissionClock {
  return parseMissionClock(
    v === "gameStart" || v === "gameEnd" ? v : Number(v),
    "gameStart",
  );
}
