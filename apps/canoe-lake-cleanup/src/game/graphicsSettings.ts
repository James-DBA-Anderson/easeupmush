/** Graphics quality presets. High / Normal / Low also gate sway, shadows, and sharpness. */

export type DrawDistance = "high" | "normal" | "low";

const DISTANCE_KEY = "canoe-lake-draw-distance";
const DISTANT_SWAY_KEY = "canoe-lake-distant-tree-sway";

/** Nearby plantings still rock in the wind; beyond this they stay put unless distant sway is on. */
export const NEAR_TREE_SWAY_METRES = 90;

export const DRAW_DISTANCE_LABELS: Record<DrawDistance, string> = {
  high: "High",
  normal: "Normal",
  low: "Low",
};

export interface GraphicsProfile {
  cameraFar: number;
  fog: { scale: number; near?: number; far?: number };
  /**
   * Metres from the camera that trees still sway. `0` skips sway entirely.
   * Distant sway (when on) lifts this to Infinity on High / Normal.
   */
  treeSwayReach: number;
  shadows: boolean;
  shadowMap: number;
  shadowSoft: boolean;
  pixelRatioCap: number;
}

export const GRAPHICS: Record<DrawDistance, GraphicsProfile> = {
  high: {
    cameraFar: 4500,
    fog: { scale: 1.75 },
    treeSwayReach: NEAR_TREE_SWAY_METRES,
    shadows: true,
    shadowMap: 2048,
    shadowSoft: true,
    pixelRatioCap: 2,
  },
  normal: {
    cameraFar: 2500,
    fog: { scale: 1 },
    treeSwayReach: NEAR_TREE_SWAY_METRES,
    shadows: true,
    shadowMap: 2048,
    shadowSoft: false,
    pixelRatioCap: 1.5,
  },
  low: {
    cameraFar: 120,
    fog: { scale: 1, near: 28, far: 95 },
    treeSwayReach: 0,
    shadows: false,
    shadowMap: 512,
    shadowSoft: false,
    pixelRatioCap: 1,
  },
};

/** Camera far plane. */
export const DRAW_CAMERA_FAR: Record<DrawDistance, number> = {
  high: GRAPHICS.high.cameraFar,
  normal: GRAPHICS.normal.cameraFar,
  low: GRAPHICS.low.cameraFar,
};

/**
 * Low pulls fog in to the debug clip. High stretches the weather fog so
 * more of the park stays sharp before it fades.
 */
export const DRAW_FOG: Record<
  DrawDistance,
  { scale: number; near?: number; far?: number }
> = {
  high: GRAPHICS.high.fog,
  normal: GRAPHICS.normal.fog,
  low: GRAPHICS.low.fog,
};

export function isDrawDistance(v: unknown): v is DrawDistance {
  return v === "high" || v === "normal" || v === "low";
}

export function readDrawDistance(): DrawDistance {
  try {
    const raw = localStorage.getItem(DISTANCE_KEY);
    if (isDrawDistance(raw)) return raw;
  } catch {
    /* private mode */
  }
  return "normal";
}

export function writeDrawDistance(level: DrawDistance): void {
  try {
    localStorage.setItem(DISTANCE_KEY, level);
  } catch {
    /* private mode */
  }
}

/** High turns distant sway on; Normal / Low turn it off. User can override. */
export function defaultDistantTreeSway(level: DrawDistance): boolean {
  return level === "high";
}

export function readDistantTreeSway(level: DrawDistance): boolean {
  try {
    const raw = localStorage.getItem(DISTANT_SWAY_KEY);
    if (raw === "on") return true;
    if (raw === "off") return false;
  } catch {
    /* private mode */
  }
  return defaultDistantTreeSway(level);
}

export function writeDistantTreeSway(on: boolean): void {
  try {
    localStorage.setItem(DISTANT_SWAY_KEY, on ? "on" : "off");
  } catch {
    /* private mode */
  }
}

/** Metres of tree sway for this quality + distant-sway flag. */
export function treeSwayReachMetres(
  level: DrawDistance,
  distantSway: boolean,
): number {
  const near = GRAPHICS[level].treeSwayReach;
  if (near <= 0) return 0;
  return distantSway ? Number.POSITIVE_INFINITY : near;
}
