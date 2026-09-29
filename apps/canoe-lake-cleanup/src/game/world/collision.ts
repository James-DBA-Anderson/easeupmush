/**
 * An oriented footprint on the ground the player (and anything else) can't
 * walk through. `yaw` is the building's facing; half-extents are local.
 */
export interface Footprint {
  x: number;
  z: number;
  halfWide: number;
  halfDeep: number;
  yaw: number;
}

/** Benches and other park furniture — cleared/rebuilt with the park. */
const props: Footprint[] = [];

export function clearProps(): void {
  props.length = 0;
}

export function addProp(solid: Footprint): void {
  props.push(solid);
}

export function atProp(x: number, z: number, radius = 0.45): boolean {
  return hitsAny(x, z, props, radius);
}

/** True if (x, z) sits inside the footprint, with a body radius for padding. */
export function hitsFootprint(
  x: number,
  z: number,
  solid: Footprint,
  radius = 0.45,
): boolean {
  const dx = x - solid.x;
  const dz = z - solid.z;
  const cos = Math.cos(-solid.yaw);
  const sin = Math.sin(-solid.yaw);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  return (
    Math.abs(localX) < solid.halfWide + radius &&
    Math.abs(localZ) < solid.halfDeep + radius
  );
}

export function hitsAny(
  x: number,
  z: number,
  solids: readonly Footprint[],
  radius = 0.45,
): boolean {
  for (const solid of solids) {
    if (hitsFootprint(x, z, solid, radius)) return true;
  }
  return false;
}

/**
 * Shortest axis-aligned (in the footprint's frame) shove that puts a body
 * just outside. Null if they weren't overlapping.
 */
export function separateFromFootprint(
  x: number,
  z: number,
  solid: Footprint,
  radius = 0.45,
): { x: number; z: number } | null {
  const dx = x - solid.x;
  const dz = z - solid.z;
  const cos = Math.cos(-solid.yaw);
  const sin = Math.sin(-solid.yaw);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  const padW = solid.halfWide + radius;
  const padD = solid.halfDeep + radius;
  if (Math.abs(localX) >= padW || Math.abs(localZ) >= padD) return null;

  const slack = 0.05;
  let outX = localX;
  let outZ = localZ;
  const overlapX = padW - Math.abs(localX);
  const overlapZ = padD - Math.abs(localZ);
  if (overlapX <= overlapZ) {
    outX = (localX < 0 ? -1 : 1) * (padW + slack);
  } else {
    outZ = (localZ < 0 ? -1 : 1) * (padD + slack);
  }
  return {
    x: solid.x + outX * cos + outZ * sin,
    z: solid.z - outX * sin + outZ * cos,
  };
}

/** Resolve overlaps against a list of footprints (benches, bins, buildings). */
export function separateFromAny(
  x: number,
  z: number,
  solids: readonly Footprint[],
  radius = 0.45,
): { x: number; z: number } {
  let px = x;
  let pz = z;
  for (let iter = 0; iter < 6; iter++) {
    let moved = false;
    for (const solid of solids) {
      const out = separateFromFootprint(px, pz, solid, radius);
      if (out) {
        px = out.x;
        pz = out.z;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return { x: px, z: pz };
}

export function separateFromProps(
  x: number,
  z: number,
  radius = 0.45,
): { x: number; z: number } {
  return separateFromAny(x, z, props, radius);
}
