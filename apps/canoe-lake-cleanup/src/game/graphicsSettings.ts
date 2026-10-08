/** Draw-distance presets. Normal is the shipped fog / far plane. */

export type DrawDistance = "high" | "normal" | "low";

const KEY = "canoe-lake-draw-distance";

export const DRAW_DISTANCE_LABELS: Record<DrawDistance, string> = {
  high: "High",
  normal: "Normal",
  low: "Low",
};

/** Camera far plane. */
export const DRAW_CAMERA_FAR: Record<DrawDistance, number> = {
  high: 4500,
  normal: 2500,
  low: 120,
};

/**
 * Low pulls fog in to the debug clip. High stretches the weather fog so
 * more of the park stays sharp before it fades.
 */
export const DRAW_FOG: Record<
  DrawDistance,
  { scale: number; near?: number; far?: number }
> = {
  high: { scale: 1.75 },
  normal: { scale: 1 },
  low: { scale: 1, near: 28, far: 95 },
};

export function isDrawDistance(v: unknown): v is DrawDistance {
  return v === "high" || v === "normal" || v === "low";
}

export function readDrawDistance(): DrawDistance {
  try {
    const raw = localStorage.getItem(KEY);
    if (isDrawDistance(raw)) return raw;
  } catch {
    /* private mode */
  }
  return "normal";
}

export function writeDrawDistance(level: DrawDistance): void {
  try {
    localStorage.setItem(KEY, level);
  } catch {
    /* private mode */
  }
}
