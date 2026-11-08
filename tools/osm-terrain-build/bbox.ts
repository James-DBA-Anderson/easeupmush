/**
 * SimPompey map window: PO1–PO6, PO12 and PO13.
 * Hayling Island (PO11) sits east of Langstone Harbour and is clipped out.
 */
export const SOUTH = 50.76;
export const WEST = -1.224;
export const NORTH = 50.862;
export const EAST = -1.02;

export const R_EARTH = 6_371_000;
export const MID_LAT = (SOUTH + NORTH) / 2;
export const SCALE_X = (Math.PI / 180) * R_EARTH * Math.cos((MID_LAT * Math.PI) / 180);
export const SCALE_Y = (Math.PI / 180) * R_EARTH;

export function localM(lat: number, lon: number) {
  return { x: (lon - WEST) * SCALE_X, y: (lat - NORTH) * SCALE_Y };
}

/** East of the Langstone channel, south of the A27 mainland. */
export function isHayling(lat: number, lon: number) {
  if (lon <= -1.031) return false;
  const t = Math.max(0, Math.min(1, (lat - 50.785) / 0.065));
  const channel = -1.03 + t * 0.009;
  return lon > channel;
}

export function inBox(lat: number, lon: number) {
  return lat >= SOUTH && lat <= NORTH && lon >= WEST && lon <= EAST && !isHayling(lat, lon);
}
