import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { hitsAny, type Footprint } from "./collision";
import { groundHeight } from "./terrain";

/**
 * What you can see from Canoe Lake, roughly where it really is.
 *
 * St Helens Parade wraps the west and north (+Z / −X): a long wall of tall
 * Victorian and Edwardian terraces and seafront hotels looking out over the
 * water. South (−Z) is Eastney Esplanade, the beach and the Solent, with
 * South Parade Pier well to the south-west along the front and the glass of
 * the Pyramids beside it. On a clear day the Spinnaker Tower stands up over
 * the rooftops away to the north-west, with the Isle of Wight a grey line
 * across the water.
 */

const RENDER = new THREE.MeshStandardMaterial({
  color: 0xdcd6c8,
  roughness: 1,
});
const BRICK = new THREE.MeshStandardMaterial({ color: 0x9d6d55, roughness: 1 });
const SLATE = new THREE.MeshStandardMaterial({ color: 0x474d55, roughness: 1 });
const TRIM = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 1 });
const GLASS = new THREE.MeshStandardMaterial({
  color: 0x2b3742,
  roughness: 0.35,
  metalness: 0.2,
});
const STONE = new THREE.MeshStandardMaterial({ color: 0x8d8577, roughness: 1 });
const ASPHALT = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.95 });
const ROAD_MARK = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.85 });
const TYRE = new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 1 });
const HUB = new THREE.MeshStandardMaterial({
  color: 0xb0b4b8,
  roughness: 0.45,
  metalness: 0.55,
});
const BUMPER = new THREE.MeshStandardMaterial({
  color: 0x1a1a1c,
  roughness: 0.7,
});
const LIGHT_FRONT = new THREE.MeshStandardMaterial({
  color: 0xf2f0e4,
  roughness: 0.35,
  metalness: 0.2,
  emissive: 0x2a2818,
  emissiveIntensity: 0.35,
});
const LIGHT_REAR = new THREE.MeshStandardMaterial({
  color: 0xa81818,
  roughness: 0.45,
  emissive: 0x3a0808,
  emissiveIntensity: 0.4,
});
const CAR_PAINT = [
  new THREE.MeshStandardMaterial({ color: 0xc45c4a, roughness: 0.42, metalness: 0.28 }),
  new THREE.MeshStandardMaterial({ color: 0x3d5a7a, roughness: 0.42, metalness: 0.28 }),
  new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.4, metalness: 0.32 }),
  new THREE.MeshStandardMaterial({ color: 0x2f2f32, roughness: 0.42, metalness: 0.3 }),
  new THREE.MeshStandardMaterial({ color: 0xb8a05a, roughness: 0.42, metalness: 0.28 }),
  new THREE.MeshStandardMaterial({ color: 0x5a7a5c, roughness: 0.42, metalness: 0.28 }),
  new THREE.MeshStandardMaterial({ color: 0x6a7c8c, roughness: 0.4, metalness: 0.35 }),
  new THREE.MeshStandardMaterial({ color: 0x5c3a4a, roughness: 0.42, metalness: 0.28 }),
];
const SAND = new THREE.MeshStandardMaterial({ color: 0xc9bb9a, roughness: 1 });
const SEA = new THREE.MeshStandardMaterial({ color: 0x466b7d, roughness: 0.5 });
const HAZE = new THREE.MeshStandardMaterial({ color: 0x6d7f8c, roughness: 1 });
const GROUND = new THREE.MeshStandardMaterial({
  color: 0x51704e,
  roughness: 1,
});

/** How deep a terrace house runs back from the parade. */
export const HOUSE_DEPTH = 9;
/** Parade road width in metres. */
export const ROAD_WIDTH = 14;
/** Centre-line dash length / gap. */
const MARK_DASH = 3.2;
const MARK_GAP = 3.8;
/** Only park cars on straights at least this long. */
const PARK_MIN_LEN = 45;

/** Surround footprints — terraces, pier pavilions, and the like. */
const surrounds: Footprint[] = [];

/** Level-authored parade roads and terrace runs (set via `applySurroundLayout`). */
let roadPolylines: [number, number][][] = [];
let terraceRuns: [number, number][][] = [];
/** Optional car park asphalt outline. */
let carParkOutline: [number, number][] = [];
/** Optional beach / shingle outline (empty → no sand pad). */
let beachOutline: [number, number][] = [];
/** Car park fill for the mini map (set when built). */
let carParkSite: ReadonlyArray<{ x: number; z: number }> | null = null;
/** Beach fill for the mini map (set when built). */
let beachSite: ReadonlyArray<{ x: number; z: number }> | null = null;

export function getCarParkOutline(): ReadonlyArray<{ x: number; z: number }> | null {
  return carParkSite;
}

export function getBeachOutline(): ReadonlyArray<{ x: number; z: number }> | null {
  return beachSite;
}

/** How close two road vertices must be to count as a junction. */
const JUNCTION_GAP = 8;

export interface RoadLink {
  road: number;
  /** Vertex index on that road. */
  index: number;
}

export interface RoadGraph {
  roads: ReadonlyArray<ReadonlyArray<{ x: number; z: number }>>;
  /** Key `${road}:${index}` → other road vertices within junction range. */
  linksAt(road: number, index: number): readonly RoadLink[];
}

let roadGraph: RoadGraph | null = null;

function buildRoadGraph(): RoadGraph | null {
  if (roadPolylines.length === 0) return null;
  const roads = roadPolylines.map((line) =>
    line.map(([x, z]) => ({ x, z })),
  );
  const map = new Map<string, RoadLink[]>();
  const key = (r: number, i: number) => `${r}:${i}`;

  for (let r0 = 0; r0 < roads.length; r0++) {
    const a = roads[r0]!;
    for (let i0 = 0; i0 < a.length; i0++) {
      const p0 = a[i0]!;
      for (let r1 = 0; r1 < roads.length; r1++) {
        const b = roads[r1]!;
        for (let i1 = 0; i1 < b.length; i1++) {
          if (r0 === r1 && i0 === i1) continue;
          // Same road: only link distinct vertices that nearly coincide
          // (loops / duplicated points), not every neighbour along the run.
          if (r0 === r1 && Math.abs(i0 - i1) === 1) continue;
          const p1 = b[i1]!;
          const dx = p0.x - p1.x;
          const dz = p0.z - p1.z;
          if (dx * dx + dz * dz > JUNCTION_GAP * JUNCTION_GAP) continue;
          const k = key(r0, i0);
          const list = map.get(k) ?? [];
          list.push({ road: r1, index: i1 });
          map.set(k, list);
        }
      }
    }
  }

  return {
    roads,
    linksAt(road, index) {
      return map.get(key(road, index)) ?? [];
    },
  };
}

/** Parade road network for traffic — null if the level has no roads. */
export function getRoadGraph(): RoadGraph | null {
  return roadGraph;
}

/** Shortest distance from a point to any parade-road centre line. */
export function distanceToNearestRoad(x: number, z: number): number {
  let best = Infinity;
  for (const line of roadPolylines) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i]!;
      const b = line[i + 1]!;
      best = Math.min(best, distPointToSeg(x, z, a[0], a[1], b[0], b[1]));
    }
  }
  return best;
}

/**
 * Intervals along A→B (distance from A, then width) that sit inside a road
 * corridor. Used to gap terraces, fences and paths where a road crosses.
 */
export function roadGapsAlong(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  clearance = ROAD_WIDTH * 0.5 + 1,
  step = 0.4,
): [number, number][] {
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 0.01 || roadPolylines.length === 0) return [];
  const ux = (bx - ax) / len;
  const uz = (bz - az) / len;
  const n = Math.max(1, Math.ceil(len / step));
  const raw: [number, number][] = [];
  let gapStart: number | null = null;
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * len;
    const on = distanceToNearestRoad(ax + ux * s, az + uz * s) < clearance;
    if (on && gapStart == null) gapStart = Math.max(0, s - step * 0.5);
    if (!on && gapStart != null) {
      raw.push([gapStart, Math.max(0.01, s - gapStart)]);
      gapStart = null;
    }
  }
  if (gapStart != null) raw.push([gapStart, Math.max(0.01, len - gapStart)]);

  // Merge overlaps / near neighbours from sampling jitter.
  raw.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const gap of raw) {
    const last = merged[merged.length - 1];
    if (last && gap[0] <= last[0] + last[1] + step) {
      const end = Math.max(last[0] + last[1], gap[0] + gap[1]);
      last[1] = end - last[0];
    } else {
      merged.push([gap[0], gap[1]]);
    }
  }
  return merged.filter((g) => g[1] > 0.75);
}

function distPointToSeg(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-12) return Math.hypot(px - ax, pz - az);
  let t = ((px - ax) * dx + (pz - az) * dz) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/** Continuous stretches of [start, end] along a run that avoid `gaps`. */
export function freeSpansAlong(
  length: number,
  gaps: ReadonlyArray<readonly [number, number]>,
  minLen = 4.5,
): [number, number][] {
  const spans: [number, number][] = [];
  let cursor = 0;
  for (const [gs, gw] of gaps) {
    const g0 = Math.max(0, gs);
    const g1 = Math.min(length, gs + gw);
    if (g1 <= cursor) continue;
    if (g0 > cursor + minLen) spans.push([cursor, g0]);
    cursor = Math.max(cursor, g1);
  }
  if (length > cursor + minLen) spans.push([cursor, length]);
  return spans;
}

/** Push editor / level surround polylines into the world before `buildSurrounds`. */
export function applySurroundLayout(
  roads: [number, number][][],
  terraces: [number, number][][],
  carPark: [number, number][] = [],
  beach: [number, number][] = [],
): void {
  roadPolylines = roads.map((line) => line.map((p) => [p[0], p[1]] as [number, number]));
  terraceRuns = terraces.map((line) =>
    line.map((p) => [p[0], p[1]] as [number, number]),
  );
  carParkOutline = carPark.map((p) => [p[0], p[1]] as [number, number]);
  beachOutline = beach.map((p) => [p[0], p[1]] as [number, number]);
  roadGraph = buildRoadGraph();
}

/** Seeded, so the terraces look the same every time you load the park. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Collects geometry per material so the whole skyline is a handful of meshes. */
class Yard {
  private piles = new Map<THREE.Material, THREE.BufferGeometry[]>();

  public add(material: THREE.Material, geometry: THREE.BufferGeometry): void {
    const pile = this.piles.get(material);
    if (pile) pile.push(geometry);
    else this.piles.set(material, [geometry]);
  }

  public box(
    material: THREE.Material,
    size: [number, number, number],
    at: [number, number, number],
  ): void {
    const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
    geometry.translate(at[0], at[1], at[2]);
    this.add(material, geometry);
  }

  /** Everything built so far, swung round to `yaw` and dropped at `x,z`. */
  public place(x: number, z: number, yaw: number): Yard {
    const gy = groundHeight(x, z);
    for (const pile of this.piles.values()) {
      for (const geometry of pile) {
        geometry.rotateY(yaw);
        geometry.translate(x, gy, z);
      }
    }
    return this;
  }

  public drain(into: Yard): void {
    for (const [material, pile] of this.piles) {
      for (const geometry of pile) into.add(material, geometry);
    }
    this.piles.clear();
  }

  public build(scene: THREE.Scene): void {
    for (const [material, pile] of this.piles) {
      const merged = mergeGeometries(pile, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      // All of it is well outside the shadow camera, so don't pay for it.
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      scene.add(mesh);
    }
    this.piles.clear();
  }
}

interface HouseOptions {
  width: number;
  storeys: number;
  brick: boolean;
  /** A bay window running up the front, as most of the seafront has. */
  bay: boolean;
  rand: () => number;
}

/**
 * One house out of a terrace, built facing -Z: tall and narrow, sash windows
 * in rows, a bay on the front and a chimney stack up the party wall.
 */
function house({ width, storeys, brick, bay, rand }: HouseOptions): Yard {
  const yard = new Yard();
  const depth = HOUSE_DEPTH;
  const floor = 3.4;
  const height = storeys * floor;
  const wall = brick ? BRICK : RENDER;

  yard.box(wall, [width, height, depth], [0, height / 2, 0]);

  // Slate roof, slightly overhanging, with a parapet band under it.
  yard.box(TRIM, [width + 0.5, 0.5, depth + 0.5], [0, height + 0.25, 0]);
  yard.box(SLATE, [width + 0.3, 1.9, depth], [0, height + 1.45, 0]);

  const stack = new THREE.BoxGeometry(1.5, 3, 2.4);
  stack.translate(width / 2, height + 3, -1);
  yard.add(BRICK, stack);
  for (const pot of [-0.6, 0.6]) {
    yard.box(STONE, [0.4, 0.9, 0.4], [width / 2 + pot * 0.5, height + 4.9, -1]);
  }

  // Windows: two per floor, and a door at the near end of the ground floor.
  const front = -depth / 2 - 0.06;
  for (let level = 0; level < storeys; level++) {
    const sill = level * floor + 1.1;
    for (const side of [-1, 1]) {
      const w = width * 0.26;
      yard.box(
        GLASS,
        [w, 1.9, 0.12],
        [side * width * 0.24, sill + 0.95, front],
      );
      yard.box(TRIM, [w + 0.35, 0.22, 0.3], [side * width * 0.24, sill, front]);
    }
  }
  yard.box(SLATE, [1.2, 2.3, 0.2], [width * 0.34, 1.15, front]);

  if (bay) {
    // Square bay, two or three storeys of it, with its own little roof.
    const tall = Math.min(storeys - 1, 2 + Math.floor(rand() * 2));
    const bayHeight = tall * floor;
    yard.box(
      wall,
      [width * 0.52, bayHeight, 1.6],
      [-width * 0.16, bayHeight / 2, front - 0.7],
    );
    yard.box(
      SLATE,
      [width * 0.58, 0.4, 1.9],
      [-width * 0.16, bayHeight + 0.2, front - 0.7],
    );
    for (let level = 0; level < tall; level++) {
      yard.box(
        GLASS,
        [width * 0.42, 2, 0.12],
        [-width * 0.16, level * floor + 2.05, front - 1.55],
      );
    }
  }

  return yard;
}

/**
 * A run of houses shoulder to shoulder, with the odd taller hotel in it.
 * Road crossings are gapped in `buildTerraces` before this runs.
 */
function terrace(
  into: Yard,
  from: THREE.Vector2,
  along: THREE.Vector2,
  length: number,
  yaw: number,
  rand: () => number,
): void {
  let walked = 0;
  while (walked < length - 4.5) {
    const remaining = length - walked;
    const hotel = remaining > 18 && rand() < 0.14;
    let width = hotel ? 16 + rand() * 10 : 6.5 + rand() * 2.5;
    if (width > remaining) {
      // Last plot — stretch or shrink to finish the run flush.
      if (remaining < 5) break;
      width = remaining;
    }

    const at = from.clone().addScaledVector(along, walked + width / 2);
    house({
      width,
      // Five and six storeys along the front, and the hotels taller again, so
      // the roofline stands above the oaks the way it does from the water.
      storeys: hotel ? 7 : 5 + Math.floor(rand() * 2),
      brick: rand() < 0.35,
      bay: !hotel && rand() < 0.8,
      rand,
    })
      .place(at.x, at.y, yaw)
      .drain(into);

    surrounds.push({
      x: at.x,
      z: at.y,
      halfWide: width / 2,
      halfDeep: HOUSE_DEPTH / 2,
      yaw,
    });

    walked += width;
  }
}

/** Yaw so local −Z (house front) points toward the park origin. */
function yawTowardPark(
  midX: number,
  midZ: number,
  alongX: number,
  alongZ: number,
): number {
  const n1x = -alongZ;
  const n1z = alongX;
  const n2x = alongZ;
  const n2z = -alongX;
  const toOx = -midX;
  const toOz = -midZ;
  const d1 = n1x * toOx + n1z * toOz;
  const d2 = n2x * toOx + n2z * toOz;
  const pickX = d1 >= d2 ? n1x : n2x;
  const pickZ = d1 >= d2 ? n1z : n2z;
  // Facing after rotateY: (−sin θ, −cos θ) in XZ.
  return Math.atan2(-pickX, -pickZ);
}

/** Axis-aligned box can't follow a diagonal — rotate a strip onto the segment. */
function roadStrip(
  yard: Yard,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): void {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 0.5) return;

  // Short flat chunks so asphalt follows berms instead of floating under them.
  const chunks = Math.max(1, Math.ceil(len / 3.5));
  const ux = dx / len;
  const uz = dz / len;
  const yaw = Math.atan2(-dz, dx);

  for (let c = 0; c < chunks; c++) {
    const t0 = (c / chunks) * len;
    const t1 = ((c + 1) / chunks) * len;
    const seg = t1 - t0;
    const x0 = ax + ux * t0;
    const z0 = az + uz * t0;
    const x1 = ax + ux * t1;
    const z1 = az + uz * t1;
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    const gy =
      (groundHeight(x0, z0) + groundHeight(x1, z1) + groundHeight(mx, mz)) / 3;

    const asphalt = new THREE.BoxGeometry(seg, 0.18, ROAD_WIDTH);
    asphalt.rotateY(yaw);
    asphalt.translate(mx, gy + 0.04, mz);
    yard.add(ASPHALT, asphalt);
  }

  // Dashes along the full run — not per asphalt chunk (chunks are shorter
  // than one dash, so per-chunk painting used to draw nothing).
  let walked = MARK_GAP * 0.35;
  while (walked + MARK_DASH < len) {
    const cx = ax + ux * (walked + MARK_DASH / 2);
    const cz = az + uz * (walked + MARK_DASH / 2);
    const gy = groundHeight(cx, cz);
    const dash = new THREE.BoxGeometry(MARK_DASH, 0.05, 0.28);
    dash.rotateY(yaw);
    dash.translate(cx, gy + 0.15, cz);
    yard.add(ROAD_MARK, dash);
    walked += MARK_DASH + MARK_GAP;
  }
}

/**
 * Cheap hatch or saloon, nose toward local +X. Built from a few boxes and
 * disc wheels so it reads from the path without looking like a fridge.
 */
function parkedCar(rand: () => number): Yard {
  const yard = new Yard();
  const paint = CAR_PAINT[Math.floor(rand() * CAR_PAINT.length)]!;
  const hatch = rand() < 0.45;
  const length = hatch ? 3.9 + rand() * 0.25 : 4.25 + rand() * 0.35;
  const width = 1.72 + rand() * 0.1;
  const ride = 0.34;

  // Sill / undertray.
  yard.box(BUMPER, [length * 0.9, 0.1, width * 0.82], [0, ride * 0.45, 0]);

  // Main body waist.
  yard.box(paint, [length, 0.52, width], [0, ride + 0.28, 0]);

  // Bonnet — lower and shorter than the cabin.
  yard.box(
    paint,
    [length * 0.3, 0.2, width * 0.96],
    [length * 0.3, ride + 0.58, 0],
  );

  // Boot / tailgate.
  const bootLen = hatch ? length * 0.18 : length * 0.24;
  yard.box(
    paint,
    [bootLen, hatch ? 0.42 : 0.26, width * 0.96],
    [-length * (hatch ? 0.32 : 0.34), ride + (hatch ? 0.72 : 0.62), 0],
  );

  // Cabin shell.
  const cabinLen = hatch ? length * 0.48 : length * 0.4;
  const cabinX = hatch ? -length * 0.04 : -length * 0.02;
  yard.box(
    paint,
    [cabinLen, 0.48, width * 0.9],
    [cabinX, ride + 0.88, 0],
  );

  // Glazing — thin panes, not a solid brick of glass.
  yard.box(
    GLASS,
    [cabinLen * 0.72, 0.36, width * 0.84],
    [cabinX + length * 0.02, ride + 0.92, 0],
  );
  // Windscreen face.
  yard.box(
    GLASS,
    [0.06, 0.34, width * 0.8],
    [cabinX + cabinLen * 0.48, ride + 0.9, 0],
  );
  // Rear screen.
  yard.box(
    GLASS,
    [0.06, hatch ? 0.38 : 0.3, width * 0.78],
    [cabinX - cabinLen * 0.48, ride + (hatch ? 0.88 : 0.9), 0],
  );

  // Bumpers.
  yard.box(BUMPER, [0.18, 0.22, width * 0.98], [length * 0.5 - 0.05, ride + 0.28, 0]);
  yard.box(BUMPER, [0.18, 0.22, width * 0.98], [-length * 0.5 + 0.05, ride + 0.28, 0]);

  // Lights.
  for (const side of [-1, 1]) {
    yard.box(
      LIGHT_FRONT,
      [0.08, 0.12, 0.28],
      [length * 0.48, ride + 0.42, side * width * 0.32],
    );
    yard.box(
      LIGHT_REAR,
      [0.07, 0.12, 0.3],
      [-length * 0.48, ride + 0.42, side * width * 0.32],
    );
  }

  // Door crease — thin darker strip so the side isn't a blank slab.
  yard.box(
    BUMPER,
    [cabinLen * 0.7, 0.03, width * 1.01],
    [cabinX, ride + 0.5, 0],
  );

  // Wheels — discs on an axle, not tyre-shaped boxes.
  const wheelX = length * 0.3;
  const wheelZ = width * 0.5 - 0.06;
  for (const lx of [-wheelX, wheelX]) {
    for (const lz of [-wheelZ, wheelZ]) {
      const tyre = new THREE.CylinderGeometry(0.33, 0.33, 0.26, 9);
      tyre.rotateX(Math.PI / 2);
      tyre.translate(lx, 0.33, lz);
      yard.add(TYRE, tyre);

      const hub = new THREE.CylinderGeometry(0.14, 0.14, 0.28, 7);
      hub.rotateX(Math.PI / 2);
      hub.translate(lx, 0.33, lz);
      yard.add(HUB, hub);
    }
  }

  return yard;
}

/** Kerb-side cars along long straight parade sections. */
function parkCarsOnStraight(
  yard: Yard,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  rand: () => number,
): void {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < PARK_MIN_LEN) return;

  const ux = dx / len;
  const uz = dz / len;
  // Perpendicular — pick the side facing away from the park origin.
  let nx = -uz;
  let nz = ux;
  const midX = (ax + bx) / 2;
  const midZ = (az + bz) / 2;
  if (nx * midX + nz * midZ < 0) {
    nx = -nx;
    nz = -nz;
  }

  const kerb = ROAD_WIDTH * 0.5 - 1.55;
  // Face along the road (local +X → along).
  const yaw = Math.atan2(-uz, ux);

  let t = 14 + rand() * 12;
  while (t < len - 14) {
    if (rand() < 0.38) {
      t += 9 + rand() * 16;
      continue;
    }
    const x = ax + ux * t + nx * kerb;
    const z = az + uz * t + nz * kerb;
    parkedCar(rand).place(x, z, yaw).drain(yard);
    surrounds.push({
      x,
      z,
      halfWide: 2.2,
      halfDeep: 1.0,
      yaw,
    });
    t += 6.2 + rand() * 5;
  }
}

function buildRoads(yard: Yard, rand: () => number): void {
  for (const line of roadPolylines) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i]!;
      const b = line[i + 1]!;
      roadStrip(yard, a[0], a[1], b[0], b[1]);
      parkCarsOnStraight(yard, a[0], a[1], b[0], b[1], rand);
    }
  }
}

function pointInCarPark(x: number, z: number): boolean {
  const outline = carParkOutline;
  if (outline.length < 3) return false;
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const xi = outline[i]![0]!;
    const zi = outline[i]![1]!;
    const xj = outline[j]![0]!;
    const zj = outline[j]![1]!;
    const straddles = zi > z !== zj > z;
    if (straddles && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** True if a nose-in bay centred here sits fully on the asphalt. */
function bayFitsInCarPark(
  x: number,
  z: number,
  alongX: number,
  alongZ: number,
  acrossX: number,
  acrossZ: number,
  halfWidth: number,
  halfDepth: number,
): boolean {
  for (const sw of [-halfWidth, halfWidth]) {
    for (const sd of [-halfDepth, halfDepth]) {
      if (
        !pointInCarPark(x + alongX * sw + acrossX * sd, z + alongZ * sw + acrossZ * sd)
      ) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Asphalt pad from the level outline, bay ticks, and a scatter of parked cars.
 */
function buildCarPark(scene: THREE.Scene, yard: Yard, rand: () => number): void {
  carParkSite = null;
  if (carParkOutline.length < 3) return;

  const outline = carParkOutline.map(([x, z]) => ({ x, z }));
  const shape = new THREE.Shape();
  outline.forEach((p, i) => {
    // Shape is XY; rotateX(−π/2) mirrors world Z unless we feed −z (see playPark).
    if (i === 0) shape.moveTo(p.x, -p.z);
    else shape.lineTo(p.x, -p.z);
  });
  shape.closePath();

  // Rows follow the longest edge; cars nose-in across the bays.
  let bestLen = 0;
  let alongX = 1;
  let alongZ = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len > bestLen) {
      bestLen = len;
      alongX = dx / len;
      alongZ = dz / len;
    }
  }
  const acrossX = -alongZ;
  const acrossZ = alongX;
  // Local +X is car length — point it across the bay, not along the row.
  const yaw = Math.atan2(-acrossZ, acrossX);

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of outline) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }

  const bayWidth = 2.55;
  const bayDepth = 5.2;
  const originX = (minX + maxX) / 2;
  const originZ = (minZ + maxZ) / 2;

  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  const pad = new THREE.Mesh(geo, ASPHALT);
  pad.position.y = groundHeight(originX, originZ) + 0.04;
  pad.receiveShadow = true;
  scene.add(pad);

  const span = Math.hypot(maxX - minX, maxZ - minZ) + 8;
  const halfAlong = Math.ceil(span / bayWidth);
  const halfAcross = Math.ceil(span / bayDepth);

  for (let ia = -halfAlong; ia <= halfAlong; ia++) {
    for (let ic = -halfAcross; ic <= halfAcross; ic++) {
      const x = originX + alongX * ia * bayWidth + acrossX * ic * bayDepth;
      const z = originZ + alongZ * ia * bayWidth + acrossZ * ic * bayDepth;
      if (
        !bayFitsInCarPark(x, z, alongX, alongZ, acrossX, acrossZ, 1.05, 2.2)
      ) {
        continue;
      }

      const gy = groundHeight(x, z);
      // Divider on the stall edge, running nose-to-tail — not through the car.
      const tick = new THREE.BoxGeometry(bayDepth * 0.82, 0.03, 0.08);
      tick.rotateY(yaw);
      tick.translate(
        x + alongX * (bayWidth * 0.5),
        gy + 0.12,
        z + alongZ * (bayWidth * 0.5),
      );
      yard.add(ROAD_MARK, tick);

      if (rand() < 0.4) continue;
      // Most nose-in; the odd one backed in.
      const face = yaw + (rand() < 0.15 ? Math.PI : 0);
      parkedCar(rand).place(x, z, face).drain(yard);
      surrounds.push({
        x,
        z,
        halfWide: 2.2,
        halfDeep: 1.0,
        yaw: face,
      });
    }
  }

  carParkSite = outline;
}

function buildTerraces(yard: Yard, rand: () => number): void {
  for (const line of terraceRuns) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i]!;
      const b = line[i + 1]!;
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const length = Math.hypot(dx, dz);
      if (length < 1) continue;
      const along = new THREE.Vector2(dx / length, dz / length);
      const gaps = roadGapsAlong(
        a[0],
        a[1],
        b[0],
        b[1],
        ROAD_WIDTH * 0.5 + 1.5,
      );
      for (const [s0, s1] of freeSpansAlong(length, gaps, 5)) {
        const spanLen = s1 - s0;
        const fx = a[0] + along.x * s0;
        const fz = a[1] + along.y * s0;
        const midX = fx + along.x * (spanLen * 0.5);
        const midZ = fz + along.y * (spanLen * 0.5);
        terrace(
          yard,
          new THREE.Vector2(fx, fz),
          along,
          spanLen,
          yawTowardPark(midX, midZ, along.x, along.y),
          rand,
        );
      }
    }
  }
}

/** The Solent apron beyond the park — sea sits against the zoned beach. */
function seafront(yard: Yard): void {
  // The park's own grass runs out at 200m, so there's a wider apron of ground
  // beyond it — as a ring, so it can't cover the lake.
  yard.box(GROUND, [1500, 0.2, 550], [0, -0.03, 475]);
  yard.box(GROUND, [1500, 0.2, 550], [0, -0.03, -475]);
  yard.box(GROUND, [550, 0.2, 400], [-475, -0.03, 0]);
  yard.box(GROUND, [550, 0.2, 400], [475, -0.03, 0]);

  placeSea(yard);
}

/** Southernmost Z on the beach outline, or null when no beach is zoned. */
function beachSouthEdge(): number | null {
  if (beachOutline.length < 3) return null;
  let minZ = Infinity;
  for (const p of beachOutline) {
    const z = p[1]!;
    if (z < minZ) minZ = z;
  }
  return Number.isFinite(minZ) ? minZ : null;
}

/**
 * Solent water — northern lip flush with the south edge of the zoned beach.
 * No beach outline → no sea pad (draw a Beach zone in the editor).
 */
function placeSea(yard: Yard): void {
  const south = beachSouthEdge();
  if (south === null) return;
  const depth = 600;
  const gy = groundHeight(0, south - 40);
  yard.box(SEA, [1600, 0.3, depth], [0, gy + 0.03, south - depth / 2]);
}

/** Level-authored beach pad. */
function buildBeach(scene: THREE.Scene): void {
  beachSite = null;
  if (beachOutline.length < 3) return;

  const outline = beachOutline.map(([x, z]) => ({ x, z }));
  const shape = new THREE.Shape();
  outline.forEach((p, i) => {
    if (i === 0) shape.moveTo(p.x, -p.z);
    else shape.lineTo(p.x, -p.z);
  });
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  const pad = new THREE.Mesh(geo, SAND);
  let gy = 0;
  for (const p of outline) gy += groundHeight(p.x, p.z);
  gy /= outline.length;
  pad.position.y = gy + 0.07;
  pad.receiveShadow = true;
  scene.add(pad);
  beachSite = outline;
}

/**
 * South Parade Pier: a long timber deck out over the water on iron legs, with
 * the pavilion at the shore end. It sits well south-west of Canoe Lake — past
 * the Ocean Hotel along Eastney Esplanade — not beside the park railings.
 */
function pier(yard: Yard): void {
  // ~400m west of the lake centre, starting on the esplanade and running south
  // over the beach into the Solent.
  const x = -400;
  const shore = -130;
  const gy = groundHeight(x, shore);

  yard.box(SLATE, [16, 0.8, 200], [x, gy + 4.4, shore - 100]);
  for (let z = shore - 12; z > shore - 200; z -= 14) {
    for (const side of [-6, 6]) {
      yard.box(STONE, [1, 4.4, 1], [x + side, gy + 2.2, z]);
    }
  }

  // Pavilion at the landward end: a big hall with a domed roof and turrets.
  const hall = shore - 18;
  yard.box(RENDER, [30, 12, 34], [x, gy + 10.8, hall]);
  yard.box(SLATE, [32, 2, 36], [x, gy + 17.8, hall]);
  const dome = new THREE.SphereGeometry(
    9,
    12,
    8,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2,
  );
  dome.scale(1, 1.1, 1);
  dome.translate(x, gy + 18.6, hall);
  yard.add(SLATE, dome);
  for (const [dx, dz] of [
    [-13, 15],
    [13, 15],
    [-13, -15],
    [13, -15],
  ] as const) {
    yard.box(RENDER, [4, 18, 4], [x + dx, gy + 9, hall + dz]);
    const spire = new THREE.ConeGeometry(3, 7, 8);
    spire.translate(x + dx, gy + 21.5, hall + dz);
    yard.add(SLATE, spire);
  }

  // The smaller pavilion out at the seaward head.
  yard.box(RENDER, [18, 7, 22], [x, gy + 8.3, shore - 185]);
  yard.box(SLATE, [20, 1.4, 24], [x, gy + 12.5, shore - 185]);

  surrounds.push(
    { x, z: hall, halfWide: 15, halfDeep: 17, yaw: 0 },
    { x, z: shore - 185, halfWide: 9, halfDeep: 11, yaw: 0 },
  );
}

/** The Pyramids, next to the pier on the seafront: all glass, and unmistakable. */
function pyramids(yard: Yard): void {
  const x = -375;
  const z = -118;
  const gy = groundHeight(x, z);
  yard.box(STONE, [64, 3, 44], [x, gy + 1.5, z]);
  for (const [dx, size, height] of [
    [-14, 30, 21],
    [14, 26, 17],
  ] as const) {
    const pyramid = new THREE.ConeGeometry(size, height, 4);
    pyramid.rotateY(Math.PI / 4);
    pyramid.translate(x + dx, gy + 3 + height / 2, z);
    yard.add(GLASS, pyramid);
  }
  surrounds.push({ x, z, halfWide: 32, halfDeep: 22, yaw: 0 });
}

/** The Spinnaker, standing up over the rooftops away to the north-west. */
function spinnaker(yard: Yard): void {
  const x = -300;
  const z = 330;
  const white = TRIM;

  // Two legs sweeping up to the mast, near enough the real silhouette.
  for (const lean of [-1, 1]) {
    const leg = new THREE.CylinderGeometry(1.6, 4.5, 96, 6);
    leg.translate(lean * 7, 48, 0);
    leg.rotateZ(lean * -0.075);
    leg.translate(x, 0, z);
    yard.add(white, leg);
  }
  const mast = new THREE.CylinderGeometry(0.5, 2.4, 78, 6);
  mast.translate(x, 122, z);
  yard.add(white, mast);

  // The viewing decks bulging out near the top.
  for (const [y, r] of [
    [88, 9],
    [95, 7.5],
    [101, 6],
  ] as const) {
    const deck = new THREE.CylinderGeometry(r, r, 4, 10);
    deck.translate(x, y, z);
    yard.add(GLASS, deck);
  }
}

/** The Isle of Wight, a grey line on the water when the weather allows. */
function island(yard: Yard): void {
  const rand = seeded(0x1ce);
  for (let x = -620; x <= 620; x += 55) {
    const height = 22 + rand() * 26;
    const hill = new THREE.SphereGeometry(60, 8, 5);
    hill.scale(1, height / 90, 0.5);
    hill.translate(x + (rand() - 0.5) * 20, 0, -415 - rand() * 30);
    yard.add(HAZE, hill);
  }
}

/**
 * Turns the windows on as the light goes. `amount` runs 0 in daylight to 1 in
 * the dark.
 */
export function lightWindows(amount: number): void {
  GLASS.emissive.setHex(0xffb457);
  GLASS.emissiveIntensity = amount * 0.85;
}

/** Everything beyond the park railings. */
export function buildSurrounds(scene: THREE.Scene): void {
  surrounds.length = 0;
  carParkSite = null;
  beachSite = null;
  roadGraph = buildRoadGraph();
  const yard = new Yard();
  const rand = seeded(0x50ea);

  seafront(yard);
  island(yard);
  pier(yard);
  pyramids(yard);
  spinnaker(yard);

  // Parade roads + terrace façades from level data (editor Roads / Terraces).
  buildRoads(yard, rand);
  buildTerraces(yard, rand);
  buildCarPark(scene, yard, rand);
  buildBeach(scene);

  yard.build(scene);
}

/** Whether a point is inside a surround building (terraces, pier, pyramids). */
export function atSurroundBuilding(x: number, z: number): boolean {
  return hitsAny(x, z, surrounds);
}

/** Surround footprints for the mini map — terraces and seafront buildings. */
export function surroundFootprints(): readonly Footprint[] {
  return surrounds;
}

/** Terrace centre-lines for a simple mini-map band (not per-house plots). */
export function getTerraceRuns(): ReadonlyArray<ReadonlyArray<{ x: number; z: number }>> {
  return terraceRuns.map((line) => line.map(([x, z]) => ({ x, z })));
}
