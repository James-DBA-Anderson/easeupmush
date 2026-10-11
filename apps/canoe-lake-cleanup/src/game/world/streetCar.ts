/**
 * Low-poly UK street cars — hatch, saloon, estate, mini, SUV, MPV, van, taxi.
 * Nose is local +X. Shared by parked bays and moving parade traffic.
 */

export type StreetCarKind =
  | "hatch"
  | "saloon"
  | "estate"
  | "mini"
  | "suv"
  | "mpv"
  | "van"
  | "taxi";

export type CarPart =
  | "paint"
  | "glass"
  | "bumper"
  | "tyre"
  | "hub"
  | "lightFront"
  | "lightRear"
  | "amber"
  | "plateFront"
  | "plateRear"
  | "chrome"
  | "trim"
  | "sign";

export interface CarSink {
  box(
    part: CarPart,
    size: readonly [number, number, number],
    at: readonly [number, number, number],
  ): void;
  wheel(x: number, y: number, z: number, radius: number, thick: number): void;
}

export const STREET_PAINT_COLORS = [
  0xc45c4a, 0x3d5a7a, 0xd8d4cc, 0x2f2f32, 0xb8a05a, 0x5a7a5c, 0x6a7c8c,
  0x5c3a4a, 0xe8e4dc, 0x8a9aaa, 0xc45a28, 0x1e2a4a, 0x6a8aaa, 0x8a3038,
  0xc8b89a, 0x4a6a4c,
] as const;

export interface StreetCarSize {
  kind: StreetCarKind;
  length: number;
  width: number;
  wheelR: number;
}

interface Body {
  length: number;
  width: number;
  ride: number;
  hullH: number;
  cabinH: number;
  cabinLen: number;
  cabinX: number;
  bonnetLen: number;
  bootLen: number;
  bootH: number;
  wheelR: number;
  wheelBase: number;
  roofRails: boolean;
  taxiSign: boolean;
  spoiler: boolean;
}

export function pickStreetCarKind(rand: () => number): StreetCarKind {
  const roll = rand();
  if (roll < 0.22) return "hatch";
  if (roll < 0.38) return "saloon";
  if (roll < 0.5) return "estate";
  if (roll < 0.62) return "mini";
  if (roll < 0.78) return "suv";
  if (roll < 0.86) return "mpv";
  if (roll < 0.94) return "van";
  return "taxi";
}

export function streetCarPaint(kind: StreetCarKind, rand: () => number): number {
  if (kind === "taxi") return 0x1a1a1c;
  if (kind === "van" && rand() < 0.55) return 0xe8e4dc;
  return STREET_PAINT_COLORS[Math.floor(rand() * STREET_PAINT_COLORS.length)]!;
}

function jitter(rand: () => number, lo: number, hi: number): number {
  return lo + rand() * (hi - lo);
}

function specFor(kind: StreetCarKind, rand: () => number): Body {
  switch (kind) {
    case "mini":
      return {
        length: jitter(rand, 3.42, 3.62),
        width: jitter(rand, 1.58, 1.66),
        ride: 0.3,
        hullH: 0.5,
        cabinH: 0.52,
        cabinLen: 0.5,
        cabinX: -0.02,
        bonnetLen: 0.26,
        bootLen: 0.14,
        bootH: 0.4,
        wheelR: 0.3,
        wheelBase: 0.3,
        roofRails: false,
        taxiSign: false,
        spoiler: rand() < 0.15,
      };
    case "hatch":
      return {
        length: jitter(rand, 3.92, 4.18),
        width: jitter(rand, 1.7, 1.78),
        ride: 0.33,
        hullH: 0.5,
        cabinH: 0.48,
        cabinLen: 0.46,
        cabinX: -0.04,
        bonnetLen: 0.3,
        bootLen: 0.16,
        bootH: 0.42,
        wheelR: 0.32,
        wheelBase: 0.31,
        roofRails: false,
        taxiSign: false,
        spoiler: rand() < 0.22,
      };
    case "saloon":
      return {
        length: jitter(rand, 4.42, 4.72),
        width: jitter(rand, 1.76, 1.84),
        ride: 0.34,
        hullH: 0.5,
        cabinH: 0.46,
        cabinLen: 0.38,
        cabinX: -0.02,
        bonnetLen: 0.32,
        bootLen: 0.26,
        bootH: 0.24,
        wheelR: 0.33,
        wheelBase: 0.32,
        roofRails: false,
        taxiSign: false,
        spoiler: false,
      };
    case "estate":
      return {
        length: jitter(rand, 4.52, 4.78),
        width: jitter(rand, 1.78, 1.86),
        ride: 0.34,
        hullH: 0.5,
        cabinH: 0.5,
        cabinLen: 0.54,
        cabinX: -0.1,
        bonnetLen: 0.28,
        bootLen: 0.14,
        bootH: 0.48,
        wheelR: 0.33,
        wheelBase: 0.33,
        roofRails: true,
        taxiSign: false,
        spoiler: false,
      };
    case "suv":
      return {
        length: jitter(rand, 4.32, 4.58),
        width: jitter(rand, 1.84, 1.94),
        ride: 0.44,
        hullH: 0.56,
        cabinH: 0.56,
        cabinLen: 0.46,
        cabinX: -0.05,
        bonnetLen: 0.3,
        bootLen: 0.18,
        bootH: 0.48,
        wheelR: 0.38,
        wheelBase: 0.32,
        roofRails: true,
        taxiSign: false,
        spoiler: false,
      };
    case "mpv":
      return {
        length: jitter(rand, 4.48, 4.72),
        width: jitter(rand, 1.82, 1.9),
        ride: 0.38,
        hullH: 0.54,
        cabinH: 0.58,
        cabinLen: 0.6,
        cabinX: -0.08,
        bonnetLen: 0.22,
        bootLen: 0.12,
        bootH: 0.52,
        wheelR: 0.34,
        wheelBase: 0.32,
        roofRails: rand() < 0.5,
        taxiSign: false,
        spoiler: false,
      };
    case "van":
      return {
        length: jitter(rand, 4.72, 5.08),
        width: jitter(rand, 1.86, 1.96),
        ride: 0.4,
        hullH: 0.58,
        cabinH: 0.74,
        cabinLen: 0.66,
        cabinX: -0.1,
        bonnetLen: 0.2,
        bootLen: 0.1,
        bootH: 0.7,
        wheelR: 0.35,
        wheelBase: 0.33,
        roofRails: false,
        taxiSign: false,
        spoiler: false,
      };
    case "taxi":
      return {
        length: jitter(rand, 4.5, 4.7),
        width: jitter(rand, 1.78, 1.86),
        ride: 0.34,
        hullH: 0.5,
        cabinH: 0.48,
        cabinLen: 0.4,
        cabinX: -0.02,
        bonnetLen: 0.3,
        bootLen: 0.24,
        bootH: 0.26,
        wheelR: 0.33,
        wheelBase: 0.32,
        roofRails: false,
        taxiSign: true,
        spoiler: false,
      };
  }
}

export function assembleStreetCar(
  sink: CarSink,
  kind: StreetCarKind,
  rand: () => number,
): StreetCarSize {
  const spec = specFor(kind, rand);
  const L = spec.length;
  const W = spec.width;
  const ride = spec.ride;
  const hullH = spec.hullH;
  const hullY = ride + hullH * 0.5;
  const cabinLen = L * spec.cabinLen;
  const cabinX = L * spec.cabinX;
  const cabinY = ride + hullH + spec.cabinH * 0.35;
  const cabinTop = ride + hullH * 0.55 + spec.cabinH;

  sink.box("bumper", [L * 0.88, 0.1, W * 0.78], [0, ride * 0.42, 0]);
  sink.box("paint", [L * 0.96, hullH, W * 0.92], [0, hullY, 0]);
  sink.box("paint", [L * 0.7, hullH * 0.45, W], [0, hullY - 0.02, 0]);

  const bonnetLen = L * spec.bonnetLen;
  sink.box(
    "paint",
    [bonnetLen, 0.16, W * 0.94],
    [L * 0.5 - bonnetLen * 0.52, ride + hullH * 0.72, 0],
  );

  sink.box("paint", [cabinLen, spec.cabinH, W * 0.88], [cabinX, cabinY, 0]);
  sink.box(
    "paint",
    [cabinLen * 0.92, 0.08, W * 0.82],
    [cabinX - cabinLen * 0.02, cabinTop, 0],
  );

  const bootLen = L * spec.bootLen;
  sink.box(
    "paint",
    [bootLen, spec.bootH, W * 0.92],
    [-L * 0.5 + bootLen * 0.55, ride + spec.bootH * 0.55 + 0.12, 0],
  );

  sink.box("glass", [cabinLen * 0.7, spec.cabinH * 0.62, W * 0.82], [
    cabinX + L * 0.02,
    cabinY + 0.04,
    0,
  ]);
  sink.box("glass", [0.06, spec.cabinH * 0.62, W * 0.78], [
    cabinX + cabinLen * 0.48,
    cabinY + 0.04,
    0,
  ]);
  sink.box("glass", [0.06, spec.cabinH * 0.58, W * 0.76], [
    cabinX - cabinLen * 0.48,
    cabinY + 0.02,
    0,
  ]);
  for (const side of [-1, 1] as const) {
    sink.box("glass", [cabinLen * 0.55, spec.cabinH * 0.5, 0.05], [
      cabinX,
      cabinY + 0.02,
      side * W * 0.44,
    ]);
  }

  const bumperY = ride + 0.22;
  sink.box("bumper", [0.22, 0.24, W * 0.98], [L * 0.48, bumperY, 0]);
  sink.box("bumper", [0.22, 0.24, W * 0.98], [-L * 0.48, bumperY, 0]);
  sink.box("chrome", [0.08, 0.1, W * 0.42], [L * 0.5, bumperY + 0.04, 0]);

  for (const side of [-1, 1] as const) {
    sink.box("lightFront", [0.08, 0.12, 0.3], [
      L * 0.49,
      ride + hullH * 0.55,
      side * W * 0.32,
    ]);
    sink.box("amber", [0.06, 0.06, 0.1], [
      L * 0.48,
      ride + hullH * 0.4,
      side * W * 0.46,
    ]);
    sink.box("lightRear", [0.07, 0.14, 0.32], [
      -L * 0.49,
      ride + hullH * 0.55,
      side * W * 0.32,
    ]);
    sink.box("trim", [0.1, 0.06, 0.16], [cabinX + cabinLen * 0.28, cabinY, side * W * 0.48]);
  }

  sink.box("plateFront", [0.04, 0.12, 0.36], [L * 0.505, bumperY + 0.02, 0]);
  sink.box("plateRear", [0.04, 0.12, 0.36], [-L * 0.505, bumperY + 0.04, 0]);
  sink.box("bumper", [cabinLen * 0.72, 0.03, W * 1.01], [cabinX, ride + hullH * 0.35, 0]);

  if (spec.roofRails) {
    for (const side of [-1, 1] as const) {
      sink.box("trim", [cabinLen * 0.7, 0.04, 0.04], [
        cabinX,
        cabinTop + 0.06,
        side * W * 0.28,
      ]);
    }
  }

  if (spec.spoiler) {
    sink.box("paint", [0.14, 0.05, W * 0.72], [
      cabinX - cabinLen * 0.48,
      cabinTop + 0.04,
      0,
    ]);
  }

  if (spec.taxiSign) {
    sink.box("sign", [0.28, 0.12, 0.42], [cabinX + 0.08, cabinTop + 0.1, 0]);
  }

  if (kind === "suv" || kind === "van") {
    sink.box("bumper", [L * 0.62, 0.1, 0.08], [0, ride + 0.08, W * 0.5]);
    sink.box("bumper", [L * 0.62, 0.1, 0.08], [0, ride + 0.08, -W * 0.5]);
  }

  const wheelX = L * spec.wheelBase;
  const wheelZ = W * 0.5 - 0.04;
  const wheelY = spec.wheelR;
  const thick = kind === "suv" ? 0.3 : 0.26;
  for (const lx of [-wheelX, wheelX]) {
    for (const lz of [-wheelZ, wheelZ]) {
      sink.wheel(lx, wheelY, lz, spec.wheelR, thick);
    }
  }

  return { kind, length: L, width: W, wheelR: spec.wheelR };
}
