import { cloneLevel, DEFAULT_LEVEL } from "./defaultLevel";
import {
  LEVEL_FILE,
  LEVEL_STORAGE_KEY,
  type LevelData,
  type Placeable,
  type XZ,
} from "./types";

function isXZ(v: unknown): v is XZ {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    typeof v[0] === "number" &&
    typeof v[1] === "number" &&
    Number.isFinite(v[0]) &&
    Number.isFinite(v[1])
  );
}

function normalizeLevel(raw: unknown): LevelData | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Partial<LevelData>;
  if (data.version !== 1) return null;
  if (!Array.isArray(data.shoreOutline) || data.shoreOutline.length < 3) {
    return null;
  }
  if (!data.shoreOutline.every(isXZ)) return null;
  if (!Array.isArray(data.pathPolylines)) return null;
  if (!Array.isArray(data.parkRing) || data.parkRing.length < 3) return null;
  if (!Array.isArray(data.placeables)) return null;
  if (!Array.isArray(data.bins)) return null;

  return {
    version: 1,
    shoreOutline: data.shoreOutline.map((p) => [p[0], p[1]] as XZ),
    pathPolylines: data.pathPolylines
      .filter((line) => Array.isArray(line) && line.length >= 2)
      .map((line) => line.filter(isXZ).map((p) => [p[0], p[1]] as XZ)),
    parkRing: data.parkRing.filter(isXZ).map((p) => [p[0], p[1]] as XZ),
    placeables: data.placeables
      .filter(
        (p): p is Placeable =>
          !!p &&
          typeof p === "object" &&
          typeof (p as Placeable).id === "string" &&
          typeof (p as Placeable).x === "number" &&
          typeof (p as Placeable).z === "number" &&
          typeof (p as Placeable).yaw === "number",
      )
      .map((p) => ({ ...p })),
    bins: data.bins.filter(isXZ).map((p) => [p[0], p[1]] as XZ),
  };
}

export function readLocalLevel(): LevelData | null {
  try {
    const raw = localStorage.getItem(LEVEL_STORAGE_KEY);
    if (!raw) return null;
    return normalizeLevel(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeLocalLevel(level: LevelData): void {
  localStorage.setItem(LEVEL_STORAGE_KEY, JSON.stringify(level));
}

export function clearLocalLevel(): void {
  localStorage.removeItem(LEVEL_STORAGE_KEY);
}

export function downloadLevel(level: LevelData, name = "canoe-lake.json"): void {
  const blob = new Blob([JSON.stringify(level, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

async function fetchBundledLevel(): Promise<LevelData | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}${LEVEL_FILE}`);
    if (!res.ok) return null;
    return normalizeLevel(await res.json());
  } catch {
    return null;
  }
}

/**
 * Load order: localStorage (editor saves) → bundled public JSON → defaults.
 */
export async function loadLevel(): Promise<LevelData> {
  const local = readLocalLevel();
  if (local) return local;
  const bundled = await fetchBundledLevel();
  if (bundled) return bundled;
  return cloneLevel(DEFAULT_LEVEL);
}
