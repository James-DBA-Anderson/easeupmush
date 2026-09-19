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

/** Index of this walker's crowd slot, or -1 if not listed. */
function selfCrowdIndex(ignore?: CrowdIgnore, pad = 0.55): number {
  if (!ignore) return -1;
  let best = -1;
  let bestD = pad * pad;
  for (let i = 0; i < walkCrowd.length; i++) {
    const p = walkCrowd[i]!;
    const dx = p.x - ignore.x;
    const dz = p.z - ignore.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** True if a body at (x,z) would overlap another walker. */
export function hitsCrowd(
  x: number,
  z: number,
  radius = 0.55,
  ignore?: CrowdIgnore,
): boolean {
  const skip = selfCrowdIndex(ignore);
  const r2 = radius * radius;
  for (let i = 0; i < walkCrowd.length; i++) {
    if (i === skip) continue;
    const p = walkCrowd[i]!;
    const dx = p.x - x;
    const dz = p.z - z;
    if (dx * dx + dz * dz < r2) return true;
  }
  return false;
}

/**
 * Nearest walker ahead (or overlapping) — used to bias a sidestep before the
 * step stalls against them.
 */
function nearestCrowdAhead(
  x: number,
  z: number,
  fx: number,
  fz: number,
  ignore?: CrowdIgnore,
  reach = 2.6,
): { x: number; z: number; dist: number; ahead: number } | null {
  const skip = selfCrowdIndex(ignore);
  let best: { x: number; z: number; dist: number; ahead: number } | null =
    null;
  for (let i = 0; i < walkCrowd.length; i++) {
    if (i === skip) continue;
    const p = walkCrowd[i]!;
    const ox = p.x - x;
    const oz = p.z - z;
    const dist = Math.hypot(ox, oz);
    if (dist < 0.02 || dist > reach) continue;
    const ahead = ox * fx + oz * fz;
    // Overlap / very close counts even if slightly behind.
    if (ahead < -0.35 && dist > 0.7) continue;
    if (!best || dist < best.dist) {
      best = { x: ox, z: oz, dist, ahead };
    }
  }
  return best;
}

/**
 * Bias a desired step left around anyone ahead (British path etiquette — two
 * people head-on therefore peel to opposite world sides).
 */
function steerAroundCrowd(
  x: number,
  z: number,
  dx: number,
  dz: number,
  ignore?: CrowdIgnore,
): { x: number; z: number } {
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return { x: dx, z: dz };
  const fx = dx / len;
  const fz = dz / len;
  const near = nearestCrowdAhead(x, z, fx, fz, ignore);
  if (!near) return { x: dx, z: dz };

  // Facing-left in XZ.
  const leftX = -fz;
  const leftZ = fx;
  const urgency = Math.min(2.4, 1.35 / Math.max(near.dist, 0.18));
  // Stronger when head-on; softer when already clearing past.
  const headOn = Math.max(0, near.ahead / Math.max(near.dist, 0.01));
  const steer = len * urgency * (0.35 + 0.55 * headOn);
  let sx = dx + leftX * steer;
  let sz = dz + leftZ * steer;
  // Already overlapping — also push straight away from them.
  if (near.dist < 0.75) {
    const away = 1 / Math.max(near.dist, 0.12);
    sx -= near.x * away * len * 0.55;
    sz -= near.z * away * len * 0.55;
  }
  const sl = Math.hypot(sx, sz);
  if (sl < 1e-6) return { x: dx, z: dz };
  return { x: (sx / sl) * len, z: (sz / sl) * len };
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
 * Walk a step with crowd steering and multi-angle slips so folk walk around
 * each other instead of freezing nose-to-nose.
 */
export function stepWalk(
  x: number,
  z: number,
  dx: number,
  dz: number,
  radius = 0.45,
  ignore?: CrowdIgnore,
): { x: number; z: number } {
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return { x, z };

  const steered = steerAroundCrowd(x, z, dx, dz, ignore);
  let landed = slideWalk(x, z, steered.x, steered.z, radius, ignore);
  if (moved(landed, x, z)) return commitCrowd(landed, ignore);

  // Still stuck — try keep-left first, then right, at several angles / lengths.
  const fx = dx / len;
  const fz = dz / len;
  const leftX = -fz;
  const leftZ = fx;
  const angles = [0.4, 0.75, 1.05, 1.35, 1.7];
  const scales = [1, 1.25, 1.55];
  for (const side of [1, -1] as const) {
    for (const ang of angles) {
      const c = Math.cos(ang);
      const s = Math.sin(ang) * side;
      const dirX = fx * c + leftX * s;
      const dirZ = fz * c + leftZ * s;
      for (const scale of scales) {
        const tryStep = slideWalk(
          x,
          z,
          dirX * len * scale,
          dirZ * len * scale,
          radius,
          ignore,
        );
        if (moved(tryStep, x, z)) return commitCrowd(tryStep, ignore);
      }
    }
  }

  // Last ditch: pure lateral slip away from the nearest body.
  const near = nearestCrowdAhead(x, z, fx, fz, ignore, 3.2);
  if (near && near.dist > 0.02) {
    const awayLen = Math.max(len, 0.35);
    const ax = -near.x / near.dist;
    const az = -near.z / near.dist;
    const escape = slideWalk(x, z, ax * awayLen, az * awayLen, radius, ignore);
    if (moved(escape, x, z)) return commitCrowd(escape, ignore);
    const slip = slideWalk(
      x,
      z,
      leftX * awayLen * 1.2,
      leftZ * awayLen * 1.2,
      radius,
      ignore,
    );
    if (moved(slip, x, z)) return commitCrowd(slip, ignore);
  }

  return landed;
}

function moved(at: { x: number; z: number }, x: number, z: number): boolean {
  return at.x !== x || at.z !== z;
}

/** Keep the live crowd list in sync so the next walker this frame sees us. */
function commitCrowd(
  at: { x: number; z: number },
  ignore?: CrowdIgnore,
): { x: number; z: number } {
  const i = selfCrowdIndex(ignore);
  if (i >= 0) {
    walkCrowd[i]!.x = at.x;
    walkCrowd[i]!.z = at.z;
  }
  return at;
}
