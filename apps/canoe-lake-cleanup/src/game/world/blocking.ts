import { atSurroundBuilding } from "./buildings";
import { atProp } from "./collision";
import { atRailings } from "./fence";
import { isInLake } from "./lake";
import { atParkBuilding } from "./park";

/**
 * Solid ground blockers inside the park: railings, buildings, and props
 * (benches, bins, trunks, flower beds). Shared by the player and anyone else
 * on foot. Does not include the lake — players may wade; use
 * {@link isBlockedWalk} for dry feet.
 */
export function isBlocked(x: number, z: number, radius = 0.45): boolean {
  return (
    atRailings(x, z) ||
    atParkBuilding(x, z) ||
    atSurroundBuilding(x, z) ||
    atProp(x, z, radius)
  );
}

/**
 * Nudge a preferred footfall off props / buildings / the lake. Searches
 * inland first (away from shore), then along a walk direction, so path folk
 * stay on the paving instead of clipping benches and trunks.
 */
export function clearWalkSpot(
  x: number,
  z: number,
  opts: {
    radius?: number;
    /** Unit vector away from the lake (inland). */
    inland?: { x: number; z: number };
    /** Unit vector along the path. */
    along?: { x: number; z: number };
    reach?: number;
  } = {},
): { x: number; z: number } {
  const radius = opts.radius ?? 0.45;
  if (!isBlocked(x, z, radius) && !isInLake(x, z)) return { x, z };

  const inland = opts.inland ?? { x: 0, z: 0 };
  const along = opts.along ?? { x: 1, z: 0 };
  const reach = opts.reach ?? 5;
  const rings = Math.ceil(reach / 0.35);

  for (let d = 1; d <= rings; d++) {
    const inDist = d * 0.35;
    const alongDist = d * 0.4;
    const tries: [number, number][] = [
      [inDist, 0],
      [inDist, alongDist * 0.55],
      [inDist, -alongDist * 0.55],
      [0, alongDist],
      [0, -alongDist],
      [inDist * 0.65, alongDist],
      [inDist * 0.65, -alongDist],
      [inDist * 1.35, 0],
    ];
    for (const [iOff, aOff] of tries) {
      const nx = x + inland.x * iOff + along.x * aOff;
      const nz = z + inland.z * iOff + along.z * aOff;
      if (!isBlocked(nx, nz, radius) && !isInLake(nx, nz)) {
        return { x: nx, z: nz };
      }
    }
  }

  // Last resort: ring search so they don't spawn inside a solid.
  for (let ring = 1; ring <= rings; ring++) {
    const dist = ring * 0.4;
    const samples = 8 + ring * 2;
    for (let i = 0; i < samples; i++) {
      const a = (i / samples) * Math.PI * 2;
      const nx = x + Math.cos(a) * dist;
      const nz = z + Math.sin(a) * dist;
      if (!isBlocked(nx, nz, radius) && !isInLake(nx, nz)) {
        return { x: nx, z: nz };
      }
    }
  }
  return { x, z };
}

/** Pedestrian positions for this frame — player, path folk, guests, etc. */
let walkCrowd: { x: number; z: number }[] = [];

/** Refresh who is on foot so walkers can steer around each other. */
export function setWalkCrowd(
  points: ReadonlyArray<{ x: number; z: number }>,
): void {
  walkCrowd = points.length === 0 ? [] : points.slice();
}

export type CrowdIgnore = { x: number; z: number };

function isSelf(
  px: number,
  pz: number,
  ignore?: CrowdIgnore,
  pad = 0.25,
): boolean {
  if (!ignore) return false;
  const dx = px - ignore.x;
  const dz = pz - ignore.z;
  return dx * dx + dz * dz < pad * pad;
}

/** True if a body at (x,z) would overlap another walker. */
export function hitsCrowd(
  x: number,
  z: number,
  radius = 0.55,
  ignore?: CrowdIgnore,
): boolean {
  const r2 = radius * radius;
  for (const p of walkCrowd) {
    if (isSelf(p.x, p.z, ignore)) continue;
    const dx = p.x - x;
    const dz = p.z - z;
    if (dx * dx + dz * dz < r2) return true;
  }
  return false;
}

/** Like {@link isBlocked}, plus the lake and other pedestrians. */
export function isBlockedWalk(
  x: number,
  z: number,
  radius = 0.45,
  ignore?: CrowdIgnore,
): boolean {
  if (isInLake(x, z) || isBlocked(x, z, radius)) return true;
  return hitsCrowd(x, z, Math.max(radius + 0.1, 0.5), ignore);
}

/**
 * Axis-slide a step so brushing a wall or bench glances off instead of
 * sticking. Returns the landed position.
 */
export function slideMove(
  x: number,
  z: number,
  dx: number,
  dz: number,
  radius = 0.45,
): { x: number; z: number } {
  let nx = x;
  let nz = z;
  if (!isBlocked(x + dx, z, radius)) nx = x + dx;
  if (!isBlocked(nx, z + dz, radius)) nz = z + dz;
  return { x: nx, z: nz };
}

/** {@link slideMove} that refuses the lake and other people. */
export function slideWalk(
  x: number,
  z: number,
  dx: number,
  dz: number,
  radius = 0.45,
  ignore?: CrowdIgnore,
): { x: number; z: number } {
  let nx = x;
  let nz = z;
  if (!isBlockedWalk(x + dx, z, radius, ignore)) nx = x + dx;
  if (!isBlockedWalk(nx, z + dz, radius, ignore)) nz = z + dz;
  return { x: nx, z: nz };
}

/**
 * Walk a step with axis slide; if fully stuck, try a side step so folk can
 * slip around benches and each other.
 */
export function stepWalk(
  x: number,
  z: number,
  dx: number,
  dz: number,
  radius = 0.45,
  ignore?: CrowdIgnore,
): { x: number; z: number } {
  const landed = slideWalk(x, z, dx, dz, radius, ignore);
  if (landed.x !== x || landed.z !== z) return landed;

  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return landed;
  const px = -dz;
  const pz = dx;
  for (const side of [1, -1] as const) {
    const sidestep = slideWalk(
      x,
      z,
      (px / len) * len * side,
      (pz / len) * len * side,
      radius,
      ignore,
    );
    if (sidestep.x !== x || sidestep.z !== z) return sidestep;
  }
  return landed;
}
