import type { PoseKey } from "../entities/Fighter";

/**
 * Throw sheets — powerbomb (front), German suplex (behind), hurricanrana (off a motor).
 * `t` is normalized progress (0 = clinch, 1 = slam / release).
 */
export type ThrowFrame = {
  t: number;
  hero: PoseKey;
  heroAngle: number;
  victim: PoseKey;
  /** Offset along thrower facing (px). Negative = behind the thrower. */
  victimNudge: number;
  /** Lift above feet (px). */
  victimLift: number;
  /** Degrees — hoist / bridge / roll. */
  victimAngle: number;
};

type RawFrame = {
  ms: number;
  hero: PoseKey;
  heroAngle?: number;
  victim: PoseKey;
  victimNudge?: number;
  victimLift?: number;
  victimAngle?: number;
};

/**
 * Powerbomb — scoop, hoist onto the shoulders, sit-out and drive them into the mat.
 */
const POWERBOMB_RAW: RawFrame[] = [
  // Scoop / clinch
  { ms: 90, hero: "punch0", victim: "idle", victimNudge: 24 },
  { ms: 100, hero: "punch1", victim: "hurt", victimNudge: 20 },
  { ms: 110, hero: "punch", heroAngle: -4, victim: "hold_gut", victimNudge: 16, victimLift: 10 },
  // Hoist — legs up, head going back
  { ms: 100, hero: "crouch", heroAngle: -8, victim: "limp_arm", victimNudge: 10, victimLift: 26, victimAngle: -45 },
  { ms: 110, hero: "upper0", heroAngle: 2, victim: "hurt", victimNudge: 4, victimLift: 42, victimAngle: -95 },
  { ms: 120, hero: "upper0", heroAngle: 8, victim: "jump0", victimNudge: 0, victimLift: 58, victimAngle: -145 },
  // Peak — parked on the shoulders
  { ms: 140, hero: "upper1", heroAngle: 12, victim: "kick0", victimNudge: 2, victimLift: 64, victimAngle: -175 },
  // Sit-out drive — drop and plant them in front
  { ms: 100, hero: "crouch", heroAngle: 18, victim: "limp_leg", victimNudge: 16, victimLift: 46, victimAngle: -215 },
  { ms: 100, hero: "crouch", heroAngle: 24, victim: "hold_gut", victimNudge: 28, victimLift: 24, victimAngle: -255 },
  { ms: 90, hero: "crouch", heroAngle: 10, victim: "hurt", victimNudge: 38, victimLift: 8, victimAngle: -285 },
  { ms: 90, hero: "punch2", heroAngle: -4, victim: "stunned", victimNudge: 42, victimLift: 0, victimAngle: 0 },
];

/**
 * German suplex — waist lock from behind, bridge back, plant them behind you.
 * Victim angles go the other way so they flip over your head onto their back.
 */
const SUPLEX_RAW: RawFrame[] = [
  { ms: 90, hero: "punch0", victim: "idle", victimNudge: 18 },
  { ms: 100, hero: "punch1", victim: "hurt", victimNudge: 14 },
  { ms: 110, hero: "punch", heroAngle: 8, victim: "hold_gut", victimNudge: 10, victimLift: 4 },
  { ms: 100, hero: "crouch", heroAngle: 14, victim: "limp_arm", victimNudge: 6, victimLift: 10, victimAngle: 35 },
  { ms: 110, hero: "crouch", heroAngle: 28, victim: "hurt", victimNudge: 0, victimLift: 22, victimAngle: 70 },
  { ms: 100, hero: "upper0", heroAngle: 48, victim: "limp_leg", victimNudge: -8, victimLift: 38, victimAngle: 110 },
  { ms: 110, hero: "upper0", heroAngle: 72, victim: "jump0", victimNudge: -16, victimLift: 52, victimAngle: 150 },
  { ms: 100, hero: "upper1", heroAngle: 96, victim: "kick0", victimNudge: -28, victimLift: 58, victimAngle: 185 },
  { ms: 110, hero: "upper1", heroAngle: 118, victim: "limp_arm", victimNudge: -40, victimLift: 46, victimAngle: 220 },
  { ms: 100, hero: "upper2", heroAngle: 132, victim: "hold_gut", victimNudge: -48, victimLift: 28, victimAngle: 250 },
  { ms: 100, hero: "upper2", heroAngle: 140, victim: "hurt", victimNudge: -54, victimLift: 12, victimAngle: 275 },
  { ms: 90, hero: "crouch", heroAngle: 28, victim: "stunned", victimNudge: -58, victimLift: 0, victimAngle: 0 },
];

/**
 * Hurricanrana — legs round the head off a motor, roll them over onto their back.
 */
const HURRICAN_RAW: RawFrame[] = [
  { ms: 80, hero: "jump0", victim: "idle", victimNudge: 28 },
  { ms: 90, hero: "jump1", victim: "hurt", victimNudge: 22, victimLift: 6 },
  { ms: 100, hero: "jump_kick", heroAngle: -16, victim: "hold_gut", victimNudge: 14, victimLift: 14, victimAngle: 40 },
  { ms: 100, hero: "kick1", heroAngle: -34, victim: "limp_arm", victimNudge: 4, victimLift: 30, victimAngle: 95 },
  { ms: 110, hero: "kick1", heroAngle: -58, victim: "jump0", victimNudge: -10, victimLift: 48, victimAngle: 150 },
  { ms: 110, hero: "jump_kick", heroAngle: -88, victim: "limp_leg", victimNudge: -24, victimLift: 52, victimAngle: 200 },
  { ms: 100, hero: "jump2", heroAngle: -118, victim: "hold_gut", victimNudge: -38, victimLift: 34, victimAngle: 250 },
  { ms: 100, hero: "crouch", heroAngle: -40, victim: "hurt", victimNudge: -48, victimLift: 12, victimAngle: 290 },
  { ms: 90, hero: "crouch", heroAngle: -6, victim: "stunned", victimNudge: -54, victimLift: 0, victimAngle: 0 },
];

function buildFrames(raw: RawFrame[]): { frames: ThrowFrame[]; totalMs: number } {
  const totalMs = raw.reduce((s, f) => s + f.ms, 0);
  let acc = 0;
  const frames = raw.map((f) => {
    const t = acc / totalMs;
    acc += f.ms;
    return {
      t,
      hero: f.hero,
      heroAngle: f.heroAngle ?? 0,
      victim: f.victim,
      victimNudge: f.victimNudge ?? 22,
      victimLift: f.victimLift ?? 0,
      victimAngle: f.victimAngle ?? 0,
    };
  });
  return { frames, totalMs };
}

const powerbomb = buildFrames(POWERBOMB_RAW);
const suplex = buildFrames(SUPLEX_RAW);
const hurrican = buildFrames(HURRICAN_RAW);

export type TossStyle = "powerbomb" | "suplex" | "hurricanrana";

export const BODY_TOSS_MS = powerbomb.totalMs;
export const GERMAN_SUPLEX_MS = suplex.totalMs;
export const HURRICANRANA_MS = hurrican.totalMs;

/** Progress at which the victim leaves the hands and becomes a missile. */
export const BODY_TOSS_RELEASE_T = 0.86;
export const GERMAN_SUPLEX_RELEASE_T = 0.88;
export const HURRICANRANA_RELEASE_T = 0.86;

export const BODY_TOSS_FRAMES: ThrowFrame[] = powerbomb.frames;
export const GERMAN_SUPLEX_FRAMES: ThrowFrame[] = suplex.frames;
export const HURRICANRANA_FRAMES: ThrowFrame[] = hurrican.frames;

function sample(frames: ThrowFrame[], progress: number): ThrowFrame {
  const p = Math.max(0, Math.min(1, progress));
  let cur = frames[0]!;
  for (const f of frames) {
    if (f.t <= p) cur = f;
    else break;
  }
  return cur;
}

export function sampleBodyToss(progress: number): ThrowFrame {
  return sample(BODY_TOSS_FRAMES, progress);
}

export function sampleGermanSuplex(progress: number): ThrowFrame {
  return sample(GERMAN_SUPLEX_FRAMES, progress);
}

export function sampleHurricanrana(progress: number): ThrowFrame {
  return sample(HURRICANRANA_FRAMES, progress);
}

export function tossDuration(style: TossStyle): number {
  if (style === "suplex") return GERMAN_SUPLEX_MS;
  if (style === "hurricanrana") return HURRICANRANA_MS;
  return BODY_TOSS_MS;
}

export function tossReleaseT(style: TossStyle): number {
  if (style === "suplex") return GERMAN_SUPLEX_RELEASE_T;
  if (style === "hurricanrana") return HURRICANRANA_RELEASE_T;
  return BODY_TOSS_RELEASE_T;
}

export function sampleToss(style: TossStyle, progress: number): ThrowFrame {
  if (style === "suplex") return sampleGermanSuplex(progress);
  if (style === "hurricanrana") return sampleHurricanrana(progress);
  return sampleBodyToss(progress);
}
