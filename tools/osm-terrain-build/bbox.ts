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

/** Decorative Isle of Wight mesh sits south of the playable window. */
export function isIsleOfWight(lat: number) {
  return lat < SOUTH;
}

export function inBox(lat: number, lon: number) {
  return lat >= SOUTH && lat <= NORTH && lon >= WEST && lon <= EAST && !isHayling(lat, lon) && !isIsleOfWight(lat);
}

export type Pt = { x: number; y: number };

function periT(p: Pt): number {
  const x0 = 0;
  const x1 = (EAST - WEST) * SCALE_X;
  const y0 = (SOUTH - NORTH) * SCALE_Y;
  const y1 = 0;
  const w = x1 - x0;
  const h = y1 - y0;
  const x = Math.min(x1, Math.max(x0, p.x));
  const y = Math.min(y1, Math.max(y0, p.y));
  const dW = Math.abs(p.x - x0);
  const dE = Math.abs(p.x - x1);
  const dS = Math.abs(p.y - y0);
  const dN = Math.abs(p.y - y1);
  const m = Math.min(dW, dE, dS, dN);
  if (m === dS) return x - x0;
  if (m === dE) return w + (y - y0);
  if (m === dN) return w + h + (x1 - x);
  return w + h + w + (y1 - y);
}

function periPoint(t: number): Pt {
  const x0 = 0;
  const x1 = (EAST - WEST) * SCALE_X;
  const y0 = (SOUTH - NORTH) * SCALE_Y;
  const y1 = 0;
  const w = x1 - x0;
  const h = y1 - y0;
  const per = 2 * (w + h);
  let u = ((t % per) + per) % per;
  if (u <= w) return { x: x0 + u, y: y0 };
  u -= w;
  if (u <= h) return { x: x1, y: y0 + u };
  u -= h;
  if (u <= w) return { x: x1 - u, y: y1 };
  u -= w;
  return { x: x0, y: y1 - u };
}

function walkPeri(from: Pt, to: Pt, dir: 1 | -1, step = 40): Pt[] {
  const x0 = 0;
  const x1 = (EAST - WEST) * SCALE_X;
  const y0 = (SOUTH - NORTH) * SCALE_Y;
  const y1 = 0;
  const per = 2 * (x1 - x0 + y1 - y0);
  const t0 = periT(from);
  let t1 = periT(to);
  const pts: Pt[] = [];
  if (dir === 1) {
    if (t1 <= t0 + 1e-6) t1 += per;
    for (let t = t0 + step; t < t1 - step * 0.5; t += step) pts.push(periPoint(t));
  } else {
    if (t1 >= t0 - 1e-6) t1 -= per;
    for (let t = t0 - step; t > t1 + step * 0.5; t -= step) pts.push(periPoint(t));
  }
  return pts;
}

function ringArea2(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a;
}

function pointInRing(x: number, y: number, pts: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const yi = pts[i].y, yj = pts[j].y;
    const xi = pts[i].x, xj = pts[j].x;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

/** A point on the land side of an OSM coastline (land is on the left). */
function landSample(chain: Pt[]): Pt {
  const i = Math.min(chain.length - 2, Math.max(0, chain.length >> 1));
  const a = chain[i];
  const b = chain[i + 1];
  const tx = b.x - a.x;
  const ty = b.y - a.y;
  const len = Math.hypot(tx, ty) || 1;
  return { x: a.x - (ty / len) * 40, y: a.y + (tx / len) * 40 };
}

/**
 * Close an open OSM coastline chain against the map window.
 * Already-closed rings pass through. Picks the closing that keeps land
 * (OSM left-hand side) inside, so we don't flood the whole bbox with land.
 */
export function closeOpenRing(chain: Pt[]): Pt[] {
  if (chain.length < 3) return chain;
  const first = chain[0];
  const last = chain[chain.length - 1];
  if (Math.hypot(first.x - last.x, first.y - last.y) < 8) {
    const ring = chain.slice();
    if (Math.hypot(ring[0].x - ring[ring.length - 1].x, ring[0].y - ring[ring.length - 1].y) < 8) {
      ring.pop();
    }
    return ring;
  }
  const fwd = [...chain, ...walkPeri(last, first, 1)];
  const back = [...chain, ...walkPeri(last, first, -1)];
  const land = landSample(chain);
  const fwdLand = pointInRing(land.x, land.y, fwd);
  const backLand = pointInRing(land.x, land.y, back);
  if (fwdLand !== backLand) return fwdLand ? fwd : back;
  const aF = Math.abs(ringArea2(fwd));
  const aB = Math.abs(ringArea2(back));
  return aF <= aB ? fwd : back;
}
