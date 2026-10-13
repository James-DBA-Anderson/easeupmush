import savedJson from "./tuning.json";

export const TUCK_SCHEMES = ["vertical", "horizontal", "holdJump"] as const;
export type TuckScheme = (typeof TUCK_SCHEMES)[number];

export interface Tuning {
  /** Air tuck: vertical stick, horizontal stick, or hold jump. */
  tuckScheme: TuckScheme;
  gravity: number;
  jumpVy: number;
  maxSpeed: number;
  accel: number;
  decel: number;
  turnAccel: number;
  flipDurationSlow: number;
  flipDurationFast: number;
  tuckLerp: number;
  tuckRateStraight: number;
  tuckRateCrouch: number;
  /** Feet-down window for a clean landing, degrees. Wider when extended. */
  cleanLandDeg: number;
  /** Beyond this (degrees from feet-down) is a fall, not a stumble. */
  stumbleLandDeg: number;
  /** Max crouch (0 layout … 1 tuck) that can still cushion a clean landing. */
  cleanTuck: number;
  /** At or above this crouch, landing is hard even on the feet. */
  hardTuck: number;
  stumbleTime: number;
  fallenTime: number;
  deathTime: number;
}

export const TUNING_DEFAULTS: Tuning = {
  tuckScheme: "horizontal",
  gravity: 24,
  jumpVy: 11.4,
  maxSpeed: 8.4,
  accel: 22,
  decel: 18,
  turnAccel: 32,
  flipDurationSlow: 1.28,
  flipDurationFast: 0.82,
  tuckLerp: 7.5,
  tuckRateStraight: 0.55,
  tuckRateCrouch: 1.52,
  cleanLandDeg: 22,
  stumbleLandDeg: 68,
  cleanTuck: 0.4,
  hardTuck: 0.75,
  stumbleTime: 0.7,
  fallenTime: 1.15,
  deathTime: 1.15,
};

/** Live values. Debug sliders mutate this; Save writes tuning.json for deploys. */
export const tuning: Tuning = sanitizeTuning(savedJson);

export function sanitizeTuning(raw: unknown): Tuning {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const n = (key: keyof Tuning, min: number, max: number): number => {
    const v = src[key];
    const num = typeof v === "number" && Number.isFinite(v) ? v : TUNING_DEFAULTS[key];
    return Math.min(max, Math.max(min, num as number));
  };
  const scheme = src.tuckScheme;
  const tuckScheme: TuckScheme = TUCK_SCHEMES.includes(scheme as TuckScheme)
    ? (scheme as TuckScheme)
    : TUNING_DEFAULTS.tuckScheme;
  const cleanLandDeg = n("cleanLandDeg", 4, 80);
  const stumbleLandDeg = Math.max(cleanLandDeg + 1, n("stumbleLandDeg", 10, 170));
  const cleanTuck = n("cleanTuck", 0.05, 0.7);
  const hardTuck = Math.max(cleanTuck + 0.05, n("hardTuck", 0.4, 1));
  return {
    tuckScheme,
    gravity: n("gravity", 6, 48),
    jumpVy: n("jumpVy", 3, 24),
    maxSpeed: n("maxSpeed", 1.5, 20),
    accel: n("accel", 2, 80),
    decel: n("decel", 2, 80),
    turnAccel: n("turnAccel", 2, 80),
    flipDurationSlow: n("flipDurationSlow", 0.35, 3),
    flipDurationFast: n("flipDurationFast", 0.25, 2.5),
    tuckLerp: n("tuckLerp", 1, 20),
    tuckRateStraight: n("tuckRateStraight", 0.15, 2),
    tuckRateCrouch: n("tuckRateCrouch", 0.4, 3),
    cleanLandDeg,
    stumbleLandDeg,
    cleanTuck,
    hardTuck,
    stumbleTime: n("stumbleTime", 0.1, 3),
    fallenTime: n("fallenTime", 0.15, 4),
    deathTime: n("deathTime", 0.2, 4),
  };
}

export function applyTuning(next: Partial<Tuning>): void {
  Object.assign(tuning, sanitizeTuning({ ...tuning, ...next }));
}

export function snapshotTuning(): Tuning {
  return { ...tuning };
}

export function hintForScheme(scheme: TuckScheme = tuning.tuckScheme): string {
  const air =
    scheme === "vertical"
      ? "In the air, up straightens (slows the spin), down tucks (speeds it)."
      : scheme === "horizontal"
        ? "In the air, left straightens (slows the spin), right tucks (speeds it)."
        : "In the air, hold FLIP to tuck (speeds it), release to stretch (slows it).";
  return `Run up, FLIP. ${air} Open up to land — stretch out so the knees can cushion.`;
}
