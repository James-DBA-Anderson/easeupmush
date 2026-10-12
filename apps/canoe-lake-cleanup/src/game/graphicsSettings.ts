/** Graphics quality presets. High / Medium / Low gate view, sway, shadows, and sharpness. */

export type DrawDistance = "high" | "medium" | "low";

const KEY = "canoe-lake-draw-distance";

/** Nearby plantings still rock in the wind; far trunks stay put. */
export const NEAR_TREE_SWAY_METRES = 48;

export const DRAW_DISTANCE_LABELS: Record<DrawDistance, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export interface GraphicsProfile {
  cameraFar: number;
  fog: { scale: number; near?: number; far?: number };
  /** Metres from the camera that trees still sway. `0` skips sway. */
  treeSwayReach: number;
  shadows: boolean;
  shadowMap: number;
  shadowSoft: boolean;
  pixelRatioCap: number;
  /** Full-rate people / birds / cars inside this radius. */
  simFull: number;
  /** Hide walking/swimming actors past this. */
  hideActors: number;
  /** Shadow map refresh, in frames. `0` leaves shadows off. */
  shadowInterval: number;
  /** Lake mirror pass, in frames. */
  mirrorEvery: number;
}

export const GRAPHICS: Record<DrawDistance, GraphicsProfile> = {
  high: {
    cameraFar: 1100,
    fog: { scale: 1.75 },
    treeSwayReach: 70,
    shadows: true,
    shadowMap: 2048,
    shadowSoft: true,
    pixelRatioCap: 1.5,
    simFull: 50,
    hideActors: 130,
    shadowInterval: 1,
    mirrorEvery: 2,
  },
  medium: {
    cameraFar: 640,
    fog: { scale: 1 },
    treeSwayReach: NEAR_TREE_SWAY_METRES,
    shadows: true,
    shadowMap: 1024,
    shadowSoft: false,
    pixelRatioCap: 1.25,
    simFull: 36,
    hideActors: 85,
    shadowInterval: 2,
    mirrorEvery: 3,
  },
  low: {
    cameraFar: 120,
    fog: { scale: 1, near: 28, far: 95 },
    treeSwayReach: 0,
    shadows: false,
    shadowMap: 512,
    shadowSoft: false,
    pixelRatioCap: 1,
    simFull: 24,
    hideActors: 55,
    shadowInterval: 0,
    mirrorEvery: 8,
  },
};

/** Camera far plane. */
export const DRAW_CAMERA_FAR: Record<DrawDistance, number> = {
  high: GRAPHICS.high.cameraFar,
  medium: GRAPHICS.medium.cameraFar,
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
  medium: GRAPHICS.medium.fog,
  low: GRAPHICS.low.fog,
};

export function isDrawDistance(v: unknown): v is DrawDistance {
  return v === "high" || v === "medium" || v === "low";
}

export function readDrawDistance(): DrawDistance {
  try {
    const raw = localStorage.getItem(KEY);
    if (isDrawDistance(raw)) return raw;
    // Older builds stored Medium as "normal".
    if (raw === "normal") return "medium";
  } catch {
    /* private mode */
  }
  return "medium";
}

export function writeDrawDistance(level: DrawDistance): void {
  try {
    localStorage.setItem(KEY, level);
  } catch {
    /* private mode */
  }
}
