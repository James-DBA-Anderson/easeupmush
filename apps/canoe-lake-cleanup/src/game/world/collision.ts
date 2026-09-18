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
