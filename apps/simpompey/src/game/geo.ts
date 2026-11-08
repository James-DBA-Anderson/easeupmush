/** Must match tools/osm-terrain-build/bbox.ts */
export const SOUTH = 50.76;
export const WEST = -1.224;
export const NORTH = 50.862;
export const EAST = -1.02;

const R_EARTH = 6_371_000;
const MID_LAT = (SOUTH + NORTH) / 2;
const SCALE_X = (Math.PI / 180) * R_EARTH * Math.cos((MID_LAT * Math.PI) / 180);
const SCALE_Y = (Math.PI / 180) * R_EARTH;

export function osmLocal(lat: number, lon: number) {
  return { x: (lon - WEST) * SCALE_X, y: (lat - NORTH) * SCALE_Y };
}
