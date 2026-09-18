import { atSurroundBuilding } from "./buildings";
import { atProp } from "./collision";
import { atRailings } from "./fence";
import { isInLake } from "./lake";
import { atParkBuilding } from "./park";

/**
 * Solid ground blockers inside the park: railings, buildings, and furniture
 * (benches). Shared by the player and anyone else on foot. Does not include
 * the lake — players may wade; use {@link isBlockedWalk} for dry feet.
 */
export function isBlocked(x: number, z: number, radius = 0.45): boolean {
  return (
    atRailings(x, z) ||
    atParkBuilding(x, z) ||
    atSurroundBuilding(x, z) ||
    atProp(x, z, radius)
  );
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
