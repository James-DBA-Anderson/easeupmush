import { cloneLevel, DEFAULT_LEVEL } from "./defaultLevel";
import {
  EQUIPMENT_PLACEABLES,
  LEVEL_FILE,
  LEVEL_STORAGE_KEY,
  MULTI_PLACEABLES,
  TREE_KINDS,
  UNIQUE_PLACEABLES,
  type LevelData,
  type ElevationZone,
  type ElevEdgeStyle,
  type FairyLightColor,
  type FairyLightRun,
  type FenceStyle,
  type Placeable,
  type PlaceableId,
  type TreeKind,
  type TreeSpot,
  type XZ,
} from "./types";
import { normalizeMissionSpots } from "./missions";

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

function isTreeKind(v: unknown): v is TreeKind {
  return typeof v === "string" && (TREE_KINDS as string[]).includes(v);
}

const ALL_PLACEABLE_IDS: readonly string[] = [
  ...UNIQUE_PLACEABLES,
  ...MULTI_PLACEABLES,
];

function isPlaceableId(v: unknown): v is PlaceableId {
  return typeof v === "string" && ALL_PLACEABLE_IDS.includes(v);
}

function normalizeTrees(raw: unknown): TreeSpot[] {
  if (!Array.isArray(raw)) return [];
  const out: TreeSpot[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const t = item as Partial<TreeSpot>;
    if (typeof t.x !== "number" || typeof t.z !== "number") continue;
    if (!Number.isFinite(t.x) || !Number.isFinite(t.z)) continue;
    if (!isTreeKind(t.kind)) continue;
    const spot: TreeSpot = { x: t.x, z: t.z, kind: t.kind };
    if (typeof t.scale === "number" && Number.isFinite(t.scale)) {
      spot.scale = t.scale;
    }
    if (typeof t.leanX === "number" && Number.isFinite(t.leanX)) {
      spot.leanX = t.leanX;
    }
    if (typeof t.leanZ === "number" && Number.isFinite(t.leanZ)) {
      spot.leanZ = t.leanZ;
    }
    if (typeof t.yaw === "number" && Number.isFinite(t.yaw)) {
      spot.yaw = t.yaw;
    }
    out.push(spot);
  }
  return out;
}

/** Local play-park offset → world, matching the old oriented AABB. */
function localToWorld(
  cx: number,
  cz: number,
  yaw: number,
  lx: number,
  lz: number,
): XZ {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [cx + lx * c + lz * s, cz - lx * s + lz * c];
}

/**
 * Older levels used a single `playPark` placeable with wide/deep. Turn that
 * into a wood-chip outline plus swing/slide/spring/zip placeables.
 */
function migrateLegacyPlayPark(
  placeables: Array<{
    id: string;
    x: number;
    z: number;
    yaw: number;
    wide?: number;
    deep?: number;
  }>,
  outline: XZ[],
): { placeables: Placeable[]; outline: XZ[] } {
  const legacy = placeables.find((p) => p.id === "playPark");
  const without = placeables.filter(
    (p) => p.id !== "playPark" && isPlaceableId(p.id),
  );
  const hasEquipment = without.some((p) =>
    (EQUIPMENT_PLACEABLES as readonly string[]).includes(p.id),
  );

  let nextOutline = outline;
  if (nextOutline.length < 3 && legacy) {
    const wide = typeof legacy.wide === "number" ? legacy.wide : 34;
    const deep = typeof legacy.deep === "number" ? legacy.deep : 26;
    const hw = wide / 2;
    const hd = deep / 2;
    nextOutline = [
      localToWorld(legacy.x, legacy.z, legacy.yaw, -hw, -hd),
      localToWorld(legacy.x, legacy.z, legacy.yaw, hw, -hd),
      localToWorld(legacy.x, legacy.z, legacy.yaw, hw, hd),
      localToWorld(legacy.x, legacy.z, legacy.yaw, -hw, hd),
    ];
  }

  let nextPlaceables: Placeable[] = without.map((p) => ({
    id: p.id as PlaceableId,
    x: p.x,
    z: p.z,
    yaw: p.yaw,
  }));

  if (!hasEquipment && legacy) {
    const yaw = legacy.yaw;
    const kit: Array<[PlaceableId, number, number]> = [
      ["swing", -10.5, -4],
      ["swing", -8, -4],
      ["swing", -5.5, -4],
      ["slide", 8, -3],
      ["spring", -2, 6],
      ["zip", 8, 8],
    ];
    for (const [id, lx, lz] of kit) {
      const [x, z] = localToWorld(legacy.x, legacy.z, yaw, lx, lz);
      nextPlaceables.push({ id, x, z, yaw });
    }
  }

  return { placeables: nextPlaceables, outline: nextOutline };
}

function normalizePolylines(raw: unknown): XZ[][] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((line) => Array.isArray(line) && line.length >= 2)
    .map((line) =>
      (line as unknown[]).filter(isXZ).map((p) => [p[0], p[1]] as XZ),
    )
    .filter((line) => line.length >= 2);
}

function isFairyColor(v: unknown): v is FairyLightColor {
  return v === "red" || v === "blue";
}

function normalizeFairyLightRuns(raw: unknown): FairyLightRun[] {
  if (!Array.isArray(raw)) return [];
  const out: FairyLightRun[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Partial<FairyLightRun>;
    if (!isFairyColor(r.color) || !Array.isArray(r.points)) continue;
    const points = (r.points as unknown[])
      .filter(isXZ)
      .map((p) => [p[0], p[1]] as XZ);
    if (points.length < 1) continue;
    out.push({ color: r.color, points });
  }
  return out;
}

function isElevEdgeStyle(v: unknown): v is ElevEdgeStyle {
  return v === "wall" || v === "steps" || v === "slope";
}

function normalizeElevationZones(raw: unknown): ElevationZone[] {
  if (!Array.isArray(raw)) return [];
  const out: ElevationZone[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const z = item as { outline?: unknown; height?: unknown; edge?: unknown };
    if (!Array.isArray(z.outline) || z.outline.length < 3) continue;
    const outline = z.outline.filter(isXZ).map((p) => [p[0], p[1]] as XZ);
    if (outline.length < 3) continue;
    const height =
      typeof z.height === "number" && Number.isFinite(z.height)
        ? Math.max(0, Math.min(12, z.height))
        : 0.5;
    const edge = isElevEdgeStyle(z.edge) ? z.edge : "wall";
    out.push({ outline, height, edge });
  }
  return out;
}

function isFenceStyle(v: unknown): v is FenceStyle {
  return v === "wire" || v === "brick" || v === "railings";
}

function normalizeLevel(raw: unknown): LevelData | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Partial<LevelData> & {
    placeables?: Array<{
      id: string;
      x: number;
      z: number;
      yaw: number;
      wide?: number;
      deep?: number;
    }>;
  };
  if (data.version !== 1) return null;
  if (!Array.isArray(data.shoreOutline) || data.shoreOutline.length < 3) {
    return null;
  }
  if (!data.shoreOutline.every(isXZ)) return null;
  if (!Array.isArray(data.pathPolylines)) return null;
  if (!Array.isArray(data.parkRing) || data.parkRing.length < 3) return null;
  if (!Array.isArray(data.placeables)) return null;
  if (!Array.isArray(data.bins)) return null;

  const outlineRaw = Array.isArray(data.playParkOutline)
    ? data.playParkOutline.filter(isXZ).map((p) => [p[0], p[1]] as XZ)
    : [];

  const draftPlaceables = (
    data.placeables as Array<{
      id: string;
      x: number;
      z: number;
      yaw: number;
      wide?: number;
      deep?: number;
    }>
  )
    .filter(
      (p) =>
        !!p &&
        typeof p === "object" &&
        typeof p.id === "string" &&
        typeof p.x === "number" &&
        typeof p.z === "number" &&
        typeof p.yaw === "number",
    )
    .map((p) => ({
      id: p.id,
      x: p.x,
      z: p.z,
      yaw: p.yaw,
      wide: p.wide,
      deep: p.deep,
    }));

  const migrated = migrateLegacyPlayPark(draftPlaceables, outlineRaw);

  const roads = Array.isArray(data.roadPolylines)
    ? normalizePolylines(data.roadPolylines)
    : null;
  const terraces = Array.isArray(data.terraceRuns)
    ? normalizePolylines(data.terraceRuns)
    : null;

  return {
    version: 1,
    shoreOutline: data.shoreOutline.map((p) => [p[0], p[1]] as XZ),
    pathPolylines: data.pathPolylines
      .filter((line) => Array.isArray(line) && line.length >= 2)
      .map((line) => line.filter(isXZ).map((p) => [p[0], p[1]] as XZ)),
    parkRing: data.parkRing.filter(isXZ).map((p) => [p[0], p[1]] as XZ),
    fenceStyle: isFenceStyle(data.fenceStyle) ? data.fenceStyle : "wire",
    playParkOutline: migrated.outline,
    carParkOutline: Array.isArray(data.carParkOutline)
      ? data.carParkOutline.filter(isXZ).map((p) => [p[0], p[1]] as XZ)
      : [],
    beachOutline: Array.isArray(data.beachOutline)
      ? data.beachOutline.filter(isXZ).map((p) => [p[0], p[1]] as XZ)
      : [],
    roadPolylines:
      roads ??
      DEFAULT_LEVEL.roadPolylines.map((line) =>
        line.map((p) => [p[0], p[1]] as XZ),
      ),
    terraceRuns:
      terraces ??
      DEFAULT_LEVEL.terraceRuns.map((line) =>
        line.map((p) => [p[0], p[1]] as XZ),
      ),
    fairyLightRuns: normalizeFairyLightRuns(data.fairyLightRuns),
    placeables: migrated.placeables,
    bins: data.bins.filter(isXZ).map((p) => [p[0], p[1]] as XZ),
    trees: normalizeTrees(data.trees),
    elevationZones: normalizeElevationZones(data.elevationZones),
    missionSpots: normalizeMissionSpots(data.missionSpots),
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
    const res = await fetch(`${import.meta.env.BASE_URL}${LEVEL_FILE}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return normalizeLevel(await res.json());
  } catch {
    return null;
  }
}

/**
 * Persist the level to `public/levels/canoe-lake.json` via the Vite dev server.
 * Returns false when the endpoint is unavailable (production / preview).
 */
export async function shipLevel(level: LevelData): Promise<boolean> {
  try {
    const res = await fetch("/__canoe_lake_save_level", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(level),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Bundled `public/levels/…` JSON, or the baked TypeScript default. */
export async function loadShippedLevel(): Promise<LevelData> {
  const bundled = await fetchBundledLevel();
  if (bundled) return bundled;
  return cloneLevel(DEFAULT_LEVEL);
}

/**
 * Load order: localStorage (editor saves) → bundled public JSON → defaults.
 */
export async function loadLevel(): Promise<LevelData> {
  const local = readLocalLevel();
  if (local) return local;
  return loadShippedLevel();
}
