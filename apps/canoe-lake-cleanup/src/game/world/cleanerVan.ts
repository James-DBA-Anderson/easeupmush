import * as THREE from "three";
import { getRoadGraph, ROAD_WIDTH } from "./buildings";
import { isBlocked } from "./blocking";
import { isInLake, isOnPath, pathPolylines } from "./lake";
import { busStopSpots } from "./park";
import { addProp, type Footprint } from "./collision";
import { atRailings, insidePark } from "./fence";
import { groundHeight } from "./terrain";

/** White council Transit — parked by the bus stop at the top of the path. */
const BODY = new THREE.MeshStandardMaterial({
  color: 0xe8e6e0,
  roughness: 0.75,
});
const TRIM = new THREE.MeshStandardMaterial({
  color: 0x2a6b3a,
  roughness: 0.7,
});
const GLASS = new THREE.MeshStandardMaterial({
  color: 0x6a8a9a,
  roughness: 0.25,
  metalness: 0.2,
  transparent: true,
  opacity: 0.55,
});
const TYRE = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 1 });
const HUB = new THREE.MeshStandardMaterial({ color: 0xb0b0b0, roughness: 0.45 });
const BUMPER = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.9 });
const LIGHT_F = new THREE.MeshStandardMaterial({
  color: 0xfff2c8,
  emissive: 0xfff2c8,
  emissiveIntensity: 0.15,
  roughness: 0.4,
});
const LIGHT_R = new THREE.MeshStandardMaterial({
  color: 0xc03030,
  emissive: 0x401010,
  emissiveIntensity: 0.2,
  roughness: 0.5,
});
const CABIN = new THREE.MeshStandardMaterial({
  color: 0x3a3e42,
  roughness: 0.9,
});
const SEAT_FABRIC = new THREE.MeshStandardMaterial({
  color: 0x2a3036,
  roughness: 0.95,
});
const DASH = new THREE.MeshStandardMaterial({
  color: 0x1e2226,
  roughness: 0.85,
});
const LINING = new THREE.MeshStandardMaterial({
  color: 0xc8c2b4,
  roughness: 0.92,
});

const VAN_LEN = 5.4;
const VAN_WIDE = 2.05;
/** Driver's seat (UK right-hand drive); the wheel and dials line up on it. */
const SEAT_LOCAL = new THREE.Vector3(0.95, 1.42, -0.38);
/** Kerb-side front seat, by the door the cleaner gets out of. */
const RIDE_SEAT_LOCAL = new THREE.Vector3(0.95, 1.21, 0.38);
/** Stand just outside the kerb-side (left, +Z) cab door, park side. */
const EXIT_LOCAL = new THREE.Vector3(1.15, 0, 1.65);
/** Threshold in the middle of the cab door opening, so the get-out clears the pillars. */
const DOORWAY_LOCAL = new THREE.Vector3(1.2, 0, VAN_WIDE * 0.46);

export interface CleanerVanPose {
  x: number;
  z: number;
  yaw: number;
  seatX: number;
  /** Top of the seat cushion. */
  seatY: number;
  seatZ: number;
  /** World facing while seated — along the road, away from the park. */
  seatYaw: number;
  /** Middle of the cab door opening, passed through on the way out. */
  doorX: number;
  doorZ: number;
  exitX: number;
  exitZ: number;
  /** Face the path after hopping out. */
  exitYaw: number;
  /** Spot on the footpath to walk to before first-person takes over. */
  pathX: number;
  pathZ: number;
  pathYaw: number;
  /** Waypoints from the door, through a gate, to the handoff spot. */
  walkVia: ReadonlyArray<{ x: number; z: number }>;
}

let pose: CleanerVanPose | null = null;
let mesh: THREE.Group | null = null;
/** Kerb-side cab door — hinged at the front edge, opens outward. */
let kerbDoor: THREE.Group | null = null;
/** Barn doors on the load bay — heavy hose lives inside. */
let rearDoorL: THREE.Group | null = null;
let rearDoorR: THREE.Group | null = null;
let heavyHoseProp: THREE.Object3D | null = null;
/** True once the cleaner has taken the reel out of the bay. */
let heavyHoseTaken = false;

export function getCleanerVanPose(): CleanerVanPose | null {
  return pose;
}

/** World spot behind the load bay — grab the heavy hose here. */
export function rearHatchWorld(): { x: number; z: number } | null {
  if (!pose) return null;
  const tail = -VAN_LEN * 0.46;
  return localToWorld(pose.x, pose.z, pose.yaw, tail - 1.05, 0);
}

/** Stand facing the open load bay. */
export function hoseStandWorld(): { x: number; z: number; yaw: number } | null {
  if (!pose) return null;
  const hatch = rearHatchWorld()!;
  // Face into the bay (toward the nose / +local X).
  const yaw = Math.atan2(Math.cos(pose.yaw), -Math.sin(pose.yaw));
  return { x: hatch.x, z: hatch.z, yaw };
}

/**
 * Footpath after collecting the heavy hose — hatch, then through a gate back
 * to the spot the shift intro hands off on.
 */
export function hoseWalkVia(): { x: number; z: number }[] | null {
  if (!pose) return null;
  const hatch = rearHatchWorld()!;
  const target = pose;
  const route = findWalkRoute(
    hatch,
    { x: pose.x, z: pose.z, yaw: pose.yaw },
    (x, z) => Math.hypot(x - target.pathX, z - target.pathZ) < 0.8,
  );
  if (!route) {
    return [{ x: hatch.x, z: hatch.z }, ...pose.walkVia];
  }
  route[route.length - 1] = { x: pose.pathX, z: pose.pathZ };
  return route;
}

/** Show / hide the reel prop in the load bay (taken during the hose pickup). */
export function setHeavyHoseBayVisible(visible: boolean): void {
  heavyHoseTaken = !visible;
  if (heavyHoseProp) heavyHoseProp.visible = visible;
}

/** Where the council van is parked — mission arrow target. */
export function vanSpotWorld(): { x: number; z: number } | null {
  if (!pose) return null;
  return { x: pose.x, z: pose.z };
}

/**
 * True when the cleaner is on the path by the van (same spot the shift intro
 * ends) or close enough to the load bay — enough to start the heavy-hose grab.
 */
export function nearHeavyHosePickup(x: number, z: number): boolean {
  if (!pose) return false;
  // Path drop-off from the morning get-out — primary trigger.
  if (Math.hypot(x - pose.pathX, z - pose.pathZ) < 10) return true;
  // Walked round to the open bay.
  const hatch = rearHatchWorld();
  if (hatch && Math.hypot(x - hatch.x, z - hatch.z) < 9) return true;
  // Anywhere around the van body while the arrow is pointing here.
  return Math.hypot(x - pose.x, z - pose.z) < 12;
}

/** Kerb-side cab door: 0 shut → 1 open (~70°). */
export function setKerbDoorOpen(amount: number): void {
  if (!kerbDoor) return;
  const t = Math.max(0, Math.min(1, amount));
  // Left-hand door (local +Z): positive Y swings the panel out.
  kerbDoor.rotation.y = t * 1.2;
}

/** Load-bay barn doors — 0 shut, 1 wide open. */
export function setRearDoorsOpen(amount: number): void {
  const t = Math.max(0, Math.min(1, amount));
  if (rearDoorL) rearDoorL.rotation.y = t * 1.45;
  if (rearDoorR) rearDoorR.rotation.y = -t * 1.45;
  if (heavyHoseProp) {
    heavyHoseProp.visible = !heavyHoseTaken && t > 0.25;
  }
}

/** Drop the van on the parade by the north-path bus stop. */
export function buildCleanerVan(scene: THREE.Scene): CleanerVanPose | null {
  pose = resolvePose();
  if (!pose) return null;

  if (mesh) {
    scene.remove(mesh);
    mesh = null;
    kerbDoor = null;
    rearDoorL = null;
    rearDoorR = null;
    heavyHoseProp = null;
    heavyHoseTaken = false;
  }

  mesh = buildMesh();
  mesh.position.set(pose.x, groundHeight(pose.x, pose.z), pose.z);
  mesh.rotation.y = pose.yaw;
  scene.add(mesh);
  setKerbDoorOpen(0);
  setRearDoorsOpen(0);

  addProp({
    x: pose.x,
    z: pose.z,
    halfWide: VAN_LEN * 0.5,
    halfDeep: VAN_WIDE * 0.5,
    yaw: pose.yaw,
  } satisfies Footprint);

  return pose;
}

/**
 * Bus stop at the north end of the path that runs up from mid-lake, then the
 * lake-side kerb just before the shelter — nose pointing away from the park.
 */
function resolvePose(): CleanerVanPose | null {
  const spot = northPathBusStop();
  const anchor = spot?.stop ?? { x: -45.2, z: 89.6 };
  const tip = spot?.tip ?? { x: -53.3, z: 97.4 };
  const road = nearestRoadSample(anchor.x, anchor.z);
  if (!road) return null;

  // Nose along the road in the direction that leaves the park behind.
  let fx = road.ux;
  let fz = road.uz;
  if (fx * road.x + fz * road.z < 0) {
    fx = -fx;
    fz = -fz;
  }
  const yaw = Math.atan2(-fz, fx);

  // Lake / park side of the carriageway (toward the origin), not the inland kerb.
  let nx = -fz;
  let nz = fx;
  if (nx * road.x + nz * road.z > 0) {
    nx = -nx;
    nz = -nz;
  }
  const kerb = ROAD_WIDTH * 0.5 - 1.7;
  // Just before the bus stop when arriving from the park (opposite of away).
  const before = 6.5;
  const alongStop =
    (anchor.x - road.x) * fx + (anchor.z - road.z) * fz;
  const along = alongStop - before;
  const x = road.x + fx * along + nx * kerb;
  const z = road.z + fz * along + nz * kerb;

  // Sit in the driver's seat (wheel side); they shuffle across to the kerb door.
  const seat = localToWorld(x, z, yaw, SEAT_LOCAL.x, SEAT_LOCAL.z);
  const exit = localToWorld(x, z, yaw, EXIT_LOCAL.x, EXIT_LOCAL.z);
  const door = localToWorld(x, z, yaw, DOORWAY_LOCAL.x, DOORWAY_LOCAL.z);

  // Nearest spot the player can stand on inside the park, reached on foot
  // through a gate rather than over the railings.
  const route = findWalkRoute(exit, { x, z, yaw }, playableSpot);
  let walkVia: { x: number; z: number }[];
  let pathX: number;
  let pathZ: number;
  let pathYaw: number;
  if (route && route.length >= 2) {
    walkVia = route.slice(1);
    const end = route[route.length - 1]!;
    const prev = route[route.length - 2]!;
    pathX = end.x;
    pathZ = end.z;
    pathYaw = Math.atan2(end.x - prev.x, end.z - prev.z);
  } else {
    const arrive = pathArriveNear(tip, exit.x, exit.z);
    walkVia = [...arrive.via, { x: arrive.x, z: arrive.z }];
    pathX = arrive.x;
    pathZ = arrive.z;
    pathYaw = Math.atan2(arrive.faceX - arrive.x, arrive.faceZ - arrive.z);
  }
  const first = walkVia[0] ?? { x: pathX, z: pathZ };
  const exitYaw = Math.atan2(first.x - exit.x, first.z - exit.z);

  return {
    x,
    z,
    yaw,
    seatX: seat.x,
    // Cushion top — matches the seat mesh at floorY + 0.42 (ride 0.42 + floor 0.28).
    seatY: groundHeight(x, z) + 1.12,
    seatZ: seat.z,
    seatYaw: yaw,
    doorX: door.x,
    doorZ: door.z,
    exitX: exit.x,
    exitZ: exit.z,
    exitYaw,
    pathX,
    pathZ,
    pathYaw,
    walkVia,
  };
}

const ROUTE_CELL = 0.5;
const ROUTE_REACH = 70;
/** Keep the route this far off the railings so the spline never grazes them. */
const RAIL_CLEAR = 0.6;
/** Handoff spot sits this far inside the fence, not pinned in the gateway. */
const ARRIVE_CLEAR = 1.8;

function railsWithin(x: number, z: number, r: number): boolean {
  if (atRailings(x, z)) return true;
  for (let a = 0; a < 8; a++) {
    const t = (a / 8) * Math.PI * 2;
    if (atRailings(x + Math.cos(t) * r, z + Math.sin(t) * r)) return true;
  }
  return false;
}

/** Where the player may stand once first-person takes over (see Player.canStand). */
function playableSpot(x: number, z: number): boolean {
  if (!insidePark(x, z) || isInLake(x, z) || isBlocked(x, z, 0.6)) {
    return false;
  }
  if (railsWithin(x, z, ARRIVE_CLEAR)) return false;
  // Gateways have no railings, so also demand clear park all round.
  for (let a = 0; a < 8; a++) {
    const t = (a / 8) * Math.PI * 2;
    const px = x + Math.cos(t) * ARRIVE_CLEAR;
    const pz = z + Math.sin(t) * ARRIVE_CLEAR;
    if (!insidePark(px, pz)) return false;
  }
  return true;
}

/**
 * Shortest on-foot route from `from` to the first spot passing `goal`,
 * steering round the parked van, buildings, props, the lake, and the fence
 * (gateways only). Returned points are ~1 m apart for a tight spline.
 */
function findWalkRoute(
  from: { x: number; z: number },
  van: { x: number; z: number; yaw: number },
  goal: (x: number, z: number) => boolean,
): { x: number; z: number }[] | null {
  const cos = Math.cos(van.yaw);
  const sin = Math.sin(van.yaw);
  const inVan = (x: number, z: number) => {
    const dx = x - van.x;
    const dz = z - van.z;
    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;
    return (
      Math.abs(lx) < VAN_LEN * 0.5 + 0.45 &&
      Math.abs(lz) < VAN_WIDE * 0.5 + 0.45
    );
  };
  const open = (x: number, z: number) =>
    !inVan(x, z) &&
    !isInLake(x, z) &&
    !isBlocked(x, z, 0.45) &&
    !railsWithin(x, z, RAIL_CLEAR);

  const span = Math.ceil(ROUTE_REACH / ROUTE_CELL);
  const side = span * 2 + 1;
  const key = (ix: number, iz: number) => (iz + span) * side + (ix + span);
  const worldX = (ix: number) => from.x + ix * ROUTE_CELL;
  const worldZ = (iz: number) => from.z + iz * ROUTE_CELL;

  const passCache = new Map<number, boolean>();
  const passable = (ix: number, iz: number) => {
    if (Math.abs(ix) > span || Math.abs(iz) > span) return false;
    if (ix === 0 && iz === 0) return true;
    const k = key(ix, iz);
    let v = passCache.get(k);
    if (v === undefined) {
      v = open(worldX(ix), worldZ(iz));
      passCache.set(k, v);
    }
    return v;
  };

  const cost = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  const heap = new MinHeap();
  cost.set(key(0, 0), 0);
  heap.push(key(0, 0), 0);
  let reached = -1;
  const steps: [number, number, number][] = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, Math.SQRT2],
    [1, -1, Math.SQRT2],
    [-1, 1, Math.SQRT2],
    [-1, -1, Math.SQRT2],
  ];

  while (heap.size > 0) {
    const [k, d] = heap.pop()!;
    if (d > (cost.get(k) ?? Infinity)) continue;
    const ix = (k % side) - span;
    const iz = Math.floor(k / side) - span;
    if (goal(worldX(ix), worldZ(iz))) {
      reached = k;
      break;
    }
    for (const [sx, sz, w] of steps) {
      const nx = ix + sx;
      const nz = iz + sz;
      if (!passable(nx, nz)) continue;
      // No squeezing diagonally past a post.
      if (sx !== 0 && sz !== 0 && (!passable(ix + sx, iz) || !passable(ix, iz + sz))) {
        continue;
      }
      const nk = key(nx, nz);
      const nd = d + w * ROUTE_CELL;
      if (nd < (cost.get(nk) ?? Infinity)) {
        cost.set(nk, nd);
        cameFrom.set(nk, k);
        heap.push(nk, nd);
      }
    }
  }
  if (reached < 0) return null;

  const cells: { x: number; z: number }[] = [];
  for (let k: number | undefined = reached; k !== undefined; k = cameFrom.get(k)) {
    const ix = (k % side) - span;
    const iz = Math.floor(k / side) - span;
    cells.push({ x: worldX(ix), z: worldZ(iz) });
  }
  cells.reverse();
  cells[0] = { x: from.x, z: from.z };

  // String-pull: keep only the corners needed to stay clear.
  const clearLine = (a: { x: number; z: number }, b: { x: number; z: number }) => {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(len / 0.2));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (!open(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
    }
    return true;
  };
  const corners = [cells[0]!];
  let at = 0;
  while (at < cells.length - 1) {
    let next = at + 1;
    for (let j = cells.length - 1; j > at + 1; j--) {
      if (clearLine(cells[at]!, cells[j]!)) {
        next = j;
        break;
      }
    }
    corners.push(cells[next]!);
    at = next;
  }

  // Resample so the Catmull-Rom can't bow out across the railings.
  const out = [corners[0]!];
  for (let i = 1; i < corners.length; i++) {
    const a = corners[i - 1]!;
    const b = corners[i]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.round(len / 1.0));
    for (let s = 1; s <= n; s++) {
      const t = s / n;
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  return out;
}

class MinHeap {
  private keys: number[] = [];
  private pri: number[] = [];

  public get size(): number {
    return this.keys.length;
  }

  public push(k: number, p: number): void {
    this.keys.push(k);
    this.pri.push(p);
    let i = this.keys.length - 1;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (this.pri[up]! <= this.pri[i]!) break;
      this.swap(i, up);
      i = up;
    }
  }

  public pop(): [number, number] | undefined {
    if (this.keys.length === 0) return undefined;
    const top: [number, number] = [this.keys[0]!, this.pri[0]!];
    const lastK = this.keys.pop()!;
    const lastP = this.pri.pop()!;
    if (this.keys.length > 0) {
      this.keys[0] = lastK;
      this.pri[0] = lastP;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.keys.length && this.pri[l]! < this.pri[m]!) m = l;
        if (r < this.keys.length && this.pri[r]! < this.pri[m]!) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.keys[a], this.keys[b]] = [this.keys[b]!, this.keys[a]!];
    [this.pri[a], this.pri[b]] = [this.pri[b]!, this.pri[a]!];
  }
}

/**
 * Path running north from mid-lake, its northern tip, and the bus stop there.
 */
function northPathBusStop(): {
  tip: { x: number; z: number };
  inland: { x: number; z: number };
  stop: { x: number; z: number };
} | null {
  const stops = busStopSpots();
  const lines = pathPolylines();
  let best: {
    tip: { x: number; z: number };
    inland: { x: number; z: number };
    stop: { x: number; z: number };
    score: number;
  } | null = null;

  for (const line of lines) {
    if (line.length < 2) continue;
    let north = line[0]!;
    let south = line[0]!;
    for (const p of line) {
      if (p.z > north.z) north = p;
      if (p.z < south.z) south = p;
    }
    const run = north.z - south.z;
    if (run < 18) continue;
    // Southern end should sit toward the middle of the lake / park.
    const midDist = Math.hypot(south.x, Math.max(0, south.z));
    if (midDist > 95) continue;

    let nearStop = Infinity;
    let stop: { x: number; z: number } | null = null;
    for (const s of stops) {
      const d = Math.hypot(north.x - s.x, north.z - s.z);
      if (d < nearStop) {
        nearStop = d;
        stop = s;
      }
    }
    if (!stop || nearStop > 32) continue;

    // Prefer a clear northward run with the tip tight on a shelter.
    const score = run * 1.2 - midDist * 0.35 - nearStop * 2.5 + north.z * 0.15;
    if (!best || score > best.score) {
      best = { tip: north, inland: south, stop, score };
    }
  }

  if (best) return best;

  // Fallback: northernmost bus stop + nearest path tip.
  if (stops.length === 0) return null;
  const stop = stops.reduce((a, b) => (a.z >= b.z ? a : b));
  let tip = { x: stop.x, z: stop.z };
  let tipDist = Infinity;
  for (const line of lines) {
    for (const p of line) {
      const d = Math.hypot(p.x - stop.x, p.z - stop.z);
      if (d < tipDist) {
        tipDist = d;
        tip = p;
      }
    }
  }
  return { tip, inland: { x: 0, z: 0 }, stop };
}

/**
 * Walkable handoff on the north path: through the gate and a few metres onto
 * park paving (the tip by the bus stop sits outside the fence).
 */
function pathArriveNear(
  tip: { x: number; z: number },
  _fromX: number,
  _fromZ: number,
): {
  x: number;
  z: number;
  faceX: number;
  faceZ: number;
  via: { x: number; z: number }[];
} {
  const lines = pathPolylines();
  let line: { x: number; z: number }[] | null = null;
  for (const pts of lines) {
    if (pts.length < 2) continue;
    let north = pts[0]!;
    for (const p of pts) if (p.z > north.z) north = p;
    if (Math.hypot(north.x - tip.x, north.z - tip.z) < 2.5) {
      line = pts.map((p) => ({ x: p.x, z: p.z }));
      break;
    }
  }

  if (!line) {
    const dx = -tip.x;
    const dz = -tip.z;
    const len = Math.hypot(dx, dz) || 1;
    const x = tip.x + (dx / len) * 22;
    const z = tip.z + (dz / len) * 22;
    return { x, z, faceX: 0, faceZ: 0, via: [] };
  }

  // Walk the polyline from the northern tip toward the lake / park.
  const northI =
    line[0]!.z >= line[line.length - 1]!.z ? 0 : line.length - 1;
  const dir = northI === 0 ? 1 : -1;
  const samples: { x: number; z: number; i: number }[] = [];
  let i = northI;
  let x = line[i]!.x;
  let z = line[i]!.z;
  samples.push({ x, z, i });
  while (true) {
    const next = i + dir;
    if (next < 0 || next >= line.length) break;
    const a = line[i]!;
    const b = line[next]!;
    const seg = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    // Dense samples so we don't miss the fence crossing.
    const steps = Math.max(1, Math.ceil(seg / 2.5));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      x = a.x + (b.x - a.x) * t;
      z = a.z + (b.z - a.z) * t;
      samples.push({ x, z, i: next });
    }
    i = next;
  }

  const standable = (px: number, pz: number) =>
    insidePark(px, pz) && isOnPath(px, pz) && !isBlocked(px, pz, 0.45);

  // First clear footing inside the park, then a little further in so the
  // handoff isn't jammed against the gate / railings.
  let enterAt = -1;
  for (let s = 0; s < samples.length; s++) {
    const p = samples[s]!;
    if (standable(p.x, p.z)) {
      enterAt = s;
      break;
    }
  }

  let arrive = samples[samples.length - 1]!;
  if (enterAt >= 0) {
    const enter = samples[enterAt]!;
    const wantPast = 5.5;
    let past = 0;
    arrive = enter;
    for (let s = enterAt + 1; s < samples.length; s++) {
      const prev = samples[s - 1]!;
      const cur = samples[s]!;
      past += Math.hypot(cur.x - prev.x, cur.z - prev.z);
      arrive = cur;
      if (past >= wantPast && standable(cur.x, cur.z)) break;
    }
    if (!standable(arrive.x, arrive.z)) {
      // Prefer any standable sample past the gate over the tip.
      for (let s = samples.length - 1; s >= enterAt; s--) {
        const p = samples[s]!;
        if (standable(p.x, p.z)) {
          arrive = p;
          break;
        }
      }
    }
  } else {
    // No park hit — nudge the furthest sample onto paving if we can.
    x = arrive.x;
    z = arrive.z;
    if (!isOnPath(x, z)) {
      for (const r of [0.5, 1, 1.5, 2, 2.5]) {
        let found = false;
        for (let a = 0; a < 8; a++) {
          const ang = (a / 8) * Math.PI * 2;
          const px = x + Math.cos(ang) * r;
          const pz = z + Math.sin(ang) * r;
          if (isOnPath(px, pz)) {
            x = px;
            z = pz;
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }
    arrive = { x, z, i: arrive.i };
  }

  // Waypoints along the path (skip the tip cluster; keep spacing).
  const via: { x: number; z: number }[] = [];
  let lastX = tip.x;
  let lastZ = tip.z;
  for (const p of samples) {
    if (p === arrive) break;
    const d = Math.hypot(p.x - lastX, p.z - lastZ);
    if (d < 4.5) continue;
    // Don't queue points past the handoff.
    if (Math.hypot(p.x - arrive.x, p.z - arrive.z) < 2) break;
    via.push({ x: p.x, z: p.z });
    lastX = p.x;
    lastZ = p.z;
  }

  const faceI = Math.max(0, Math.min(line.length - 1, arrive.i + dir * 2));
  const face = line[faceI]!;
  return {
    x: arrive.x,
    z: arrive.z,
    faceX: face.x,
    faceZ: face.z,
    via,
  };
}

function nearestRoadSample(
  x: number,
  z: number,
): { x: number; z: number; ux: number; uz: number } | null {
  const graph = getRoadGraph();
  if (!graph) return null;
  let best: {
    x: number;
    z: number;
    ux: number;
    uz: number;
    d: number;
  } | null = null;

  for (const line of graph.roads) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i]!;
      const b = line[i + 1]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len2 = dx * dx + dz * dz;
      if (len2 < 1) continue;
      let t = ((x - a.x) * dx + (z - a.z) * dz) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = a.x + dx * t;
      const pz = a.z + dz * t;
      const d = Math.hypot(px - x, pz - z);
      if (best && d >= best.d) continue;
      const len = Math.sqrt(len2);
      best = { x: px, z: pz, ux: dx / len, uz: dz / len, d };
    }
  }
  return best;
}

function localToWorld(
  x: number,
  z: number,
  yaw: number,
  lx: number,
  lz: number,
): { x: number; z: number } {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  // rotY: local +X → (cos, −sin), local +Z → (sin, cos)
  return {
    x: x + lx * cos + lz * sin,
    z: z - lx * sin + lz * cos,
  };
}

function buildMesh(): THREE.Group {
  const van = new THREE.Group();
  const ride = 0.42;
  const wall = 0.07;
  const floorY = ride + 0.28;
  const roofY = ride + 1.72;
  const cabTop = ride + 2.12;
  const halfW = VAN_WIDE * 0.46;
  // Cab occupies the forward third; load bay the rest.
  const cabBack = 0.05;
  const nose = VAN_LEN * 0.42;
  const tail = -VAN_LEN * 0.46;

  // Driver's door — sizes the aperture so the panel covers it shut.
  const DOOR_W = 1.05;
  const DOOR_H = 1.25;
  const doorHingeX = VAN_LEN * 0.34;
  const doorY = ride + 1.15;
  const doorRearX = doorHingeX - DOOR_W;
  const doorBot = doorY - DOOR_H * 0.5;
  const doorTop = doorY + DOOR_H * 0.5;
  const frame = 0.04; // lip under the shut door

  // ── Shell (hollow) so an open door shows the cabin ──────────────────
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(VAN_LEN * 0.9, 0.08, VAN_WIDE * 0.9),
    BODY,
  );
  floor.position.set(-0.05, floorY, 0);
  floor.receiveShadow = true;
  van.add(floor);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(VAN_LEN * 0.88, 0.08, VAN_WIDE * 0.9),
    BODY,
  );
  roof.position.set(-0.08, roofY, 0);
  roof.castShadow = true;
  van.add(roof);

  // Both side walls: load bay up to the cab door's rear edge, then sill /
  // header / pillars so the door hole matches the panel.
  const loadFront = doorRearX + frame;
  const loadLen = loadFront - (tail + wall);
  const sillH = Math.max(0.08, doorBot - floorY + frame);
  const headH = Math.max(0.06, roofY - doorTop + frame);
  for (const sz of [-halfW, halfW]) {
    const load = new THREE.Mesh(
      new THREE.BoxGeometry(loadLen, roofY - floorY, wall),
      BODY,
    );
    load.position.set((loadFront + tail + wall) / 2, (floorY + roofY) / 2, sz);
    load.castShadow = true;
    van.add(load);

    // B-pillar strip at the rear of the door (overlaps the panel slightly).
    const bPillar = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, roofY - floorY, wall),
      BODY,
    );
    bPillar.position.set(doorRearX + frame * 0.5, (floorY + roofY) / 2, sz);
    bPillar.castShadow = true;
    van.add(bPillar);

    // A-pillar / hinge strip ahead of the door.
    const aPillar = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, roofY - floorY, wall),
      BODY,
    );
    aPillar.position.set(doorHingeX + 0.04, (floorY + roofY) / 2, sz);
    aPillar.castShadow = true;
    van.add(aPillar);

    const sill = new THREE.Mesh(
      new THREE.BoxGeometry(DOOR_W - frame * 2, sillH, wall),
      BODY,
    );
    sill.position.set(doorHingeX - DOOR_W * 0.5, floorY + sillH * 0.5, sz);
    van.add(sill);

    const header = new THREE.Mesh(
      new THREE.BoxGeometry(DOOR_W - frame * 2, headH, wall),
      BODY,
    );
    header.position.set(doorHingeX - DOOR_W * 0.5, roofY - headH * 0.5, sz);
    van.add(header);
  }

  // Rear frame — barn doors fill the opening.
  const rearFrame = new THREE.Mesh(
    new THREE.BoxGeometry(wall, roofY - floorY, VAN_WIDE * 0.88),
    BODY,
  );
  rearFrame.position.set(tail + wall / 2, (floorY + roofY) / 2, 0);
  rearFrame.castShadow = true;
  van.add(rearFrame);

  const REAR_W = 0.92;
  const REAR_H = 1.28;
  const rearY = ride + 1.05;
  const rearX = tail + wall * 0.5;

  const doorL = new THREE.Group();
  doorL.position.set(rearX, rearY, -REAR_W * 0.5);
  const panelL = new THREE.Mesh(
    new THREE.BoxGeometry(wall + 0.02, REAR_H, REAR_W),
    BODY,
  );
  panelL.position.set(-(wall + 0.02) * 0.5, 0, 0);
  panelL.castShadow = true;
  doorL.add(panelL);
  const trimL = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, REAR_H * 0.92, REAR_W * 0.92),
    TRIM,
  );
  trimL.position.set(-(wall + 0.02) * 0.5, 0, 0);
  doorL.add(trimL);
  van.add(doorL);
  rearDoorL = doorL;

  const doorR = new THREE.Group();
  doorR.position.set(rearX, rearY, REAR_W * 0.5);
  const panelR = new THREE.Mesh(
    new THREE.BoxGeometry(wall + 0.02, REAR_H, REAR_W),
    BODY,
  );
  panelR.position.set(-(wall + 0.02) * 0.5, 0, 0);
  panelR.castShadow = true;
  doorR.add(panelR);
  const trimR = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, REAR_H * 0.92, REAR_W * 0.92),
    TRIM,
  );
  trimR.position.set(-(wall + 0.02) * 0.5, 0, 0);
  doorR.add(trimR);
  van.add(doorR);
  rearDoorR = doorR;

  // Heavy hose reel in the load bay — visible once the doors swing open.
  const hoseGroup = new THREE.Group();
  hoseGroup.position.set(cabBack - 1.15, floorY + 0.55, 0);
  const reel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 0.42, 10),
    TRIM,
  );
  reel.rotation.z = Math.PI / 2;
  hoseGroup.add(reel);
  const heavyLance = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.055, 1.35, 6),
    new THREE.MeshStandardMaterial({ color: 0x6a7078, roughness: 0.85 }),
  );
  heavyLance.rotation.z = Math.PI / 2;
  heavyLance.position.set(0.35, 0.12, 0);
  hoseGroup.add(heavyLance);
  const orangeBand = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.08, 0.55),
    new THREE.MeshStandardMaterial({ color: 0xe07020, roughness: 0.9 }),
  );
  orangeBand.position.set(0.55, 0.12, 0);
  hoseGroup.add(orangeBand);
  hoseGroup.visible = false;
  van.add(hoseGroup);
  heavyHoseProp = hoseGroup;

  // Nose below the windscreen.
  const nosePanel = new THREE.Mesh(
    new THREE.BoxGeometry(wall, 0.75, VAN_WIDE * 0.88),
    BODY,
  );
  nosePanel.position.set(nose - wall / 2, floorY + 0.4, 0);
  van.add(nosePanel);

  // Cab roof hump.
  const cab = new THREE.Mesh(
    new THREE.BoxGeometry(VAN_LEN * 0.38, 0.42, VAN_WIDE * 0.82),
    BODY,
  );
  cab.position.set(VAN_LEN * 0.2, cabTop - 0.05, 0);
  cab.castShadow = true;
  van.add(cab);

  // Council stripe along the load bay on both sides.
  const stripeH = 0.2;
  const stripeY = ride + 1.05;
  for (const sz of [-halfW - 0.02, halfW + 0.02]) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(loadLen * 0.95, stripeH, 0.04),
      TRIM,
    );
    stripe.position.set((loadFront + tail + wall) / 2, stripeY, sz);
    van.add(stripe);
  }

  // Windscreen.
  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.55, VAN_WIDE * 0.78),
    GLASS,
  );
  screen.position.set(nose - 0.02, ride + 1.75, 0);
  van.add(screen);

  // ── Cabin interior (visible through the open door) ──────────────────
  addCabinInterior(van, floorY, halfW, cabBack, nose, doorRearX);

  // Cab doors — hinged at the forward edge. Driver (right, −Z) stays shut;
  // the cleaner hops out the kerb side (left, +Z), toward the park.
  for (const out of [-1, 1] as const) {
    const door = new THREE.Group();
    door.position.set(doorHingeX, doorY, out * halfW);
    // Window opening in door-local space (hinge at x = 0, rear edge at −DOOR_W).
    const win = { x0: -DOOR_W * 0.38 - 0.275, x1: -DOOR_W * 0.38 + 0.275, y0: 0.09, y1: 0.47 };
    // Skin and inner card are built round the opening so the glass shows the cab.
    addPanelAround(door, BODY, -DOOR_W, 0, -DOOR_H * 0.5, DOOR_H * 0.5, win, 0.07, 0, true);
    // Inner door card — reads when the door swings open.
    addPanelAround(
      door,
      CABIN,
      -DOOR_W + 0.05,
      -0.05,
      -DOOR_H * 0.5 + 0.055,
      DOOR_H * 0.5 - 0.095,
      win,
      0.04,
      -out * 0.05,
      false,
    );
    const doorWin = new THREE.Mesh(
      new THREE.BoxGeometry(win.x1 - win.x0, win.y1 - win.y0, 0.02),
      GLASS,
    );
    doorWin.position.set((win.x0 + win.x1) / 2, (win.y0 + win.y1) / 2, 0);
    door.add(doorWin);
    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.04, 0.05),
      BUMPER,
    );
    handle.position.set(-DOOR_W * 0.81, 0.05, out * 0.05);
    door.add(handle);
    van.add(door);
    if (out === 1) kerbDoor = door;
  }

  // Bumpers + lights.
  for (const [lx, front] of [
    [VAN_LEN * 0.48, true],
    [-VAN_LEN * 0.48, false],
  ] as const) {
    const bump = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.28, VAN_WIDE * 0.95),
      BUMPER,
    );
    bump.position.set(lx, ride + 0.35, 0);
    van.add(bump);
    for (const side of [-1, 1]) {
      const lamp = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.14, 0.28),
        front ? LIGHT_F : LIGHT_R,
      );
      lamp.position.set(lx, ride + 0.5, side * VAN_WIDE * 0.32);
      van.add(lamp);
    }
  }

  // Wheels — axle along Z (left/right of a van facing +X).
  for (const lx of [-VAN_LEN * 0.28, VAN_LEN * 0.28]) {
    for (const lz of [-VAN_WIDE * 0.48, VAN_WIDE * 0.48]) {
      const tyre = new THREE.Mesh(
        new THREE.CylinderGeometry(0.38, 0.38, 0.28, 10),
        TYRE,
      );
      tyre.rotation.x = Math.PI / 2;
      tyre.position.set(lx, 0.38, lz);
      tyre.castShadow = true;
      van.add(tyre);
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.16, 0.3, 8),
        HUB,
      );
      hub.rotation.x = Math.PI / 2;
      hub.position.set(lx, 0.38, lz);
      van.add(hub);
    }
  }

  return van;
}

/** A flat panel with a rectangular hole, as up to four boxes round the opening. */
function addPanelAround(
  parent: THREE.Object3D,
  mat: THREE.Material,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  hole: { x0: number; x1: number; y0: number; y1: number },
  depth: number,
  z: number,
  shadow: boolean,
): void {
  const add = (ax: number, bx: number, ay: number, by: number) => {
    if (bx - ax < 0.005 || by - ay < 0.005) return;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(bx - ax, by - ay, depth), mat);
    mesh.position.set((ax + bx) / 2, (ay + by) / 2, z);
    mesh.castShadow = shadow;
    parent.add(mesh);
  };
  add(x0, x1, y0, Math.min(y1, hole.y0));
  add(x0, x1, Math.max(y0, hole.y1), y1);
  add(x0, Math.max(x0, hole.x0), hole.y0, hole.y1);
  add(Math.min(x1, hole.x1), x1, hole.y0, hole.y1);
}

/** Seat, dash, wheel, and lining — enough to read as a cab when the door's open. */
function addCabinInterior(
  van: THREE.Group,
  floorY: number,
  halfW: number,
  cabBack: number,
  nose: number,
  doorRearX: number,
): void {
  // Cab floor mat.
  const mat = new THREE.Mesh(
    new THREE.BoxGeometry(nose - cabBack - 0.15, 0.03, VAN_WIDE * 0.78),
    CABIN,
  );
  mat.position.set((nose + cabBack) / 2 - 0.1, floorY + 0.06, 0);
  van.add(mat);

  // Bulkhead between cab and load bay.
  const bulk = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 1.35, VAN_WIDE * 0.82),
    LINING,
  );
  bulk.position.set(cabBack, floorY + 0.75, 0);
  van.add(bulk);

  // Load-bay glimpse — pale lining + a couple of kit shapes.
  const bayFloor = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.04, VAN_WIDE * 0.72),
    LINING,
  );
  bayFloor.position.set(cabBack - 1.35, floorY + 0.08, 0);
  van.add(bayFloor);
  const kit = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.45, 0.35),
    TRIM,
  );
  kit.position.set(cabBack - 1.1, floorY + 0.35, 0.35);
  van.add(kit);
  const broom = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6),
    new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.9 }),
  );
  broom.rotation.z = 0.35;
  broom.position.set(cabBack - 1.6, floorY + 0.75, -0.4);
  van.add(broom);

  // Driver seat (UK RHD — toward −Z), roughly under SEAT_LOCAL.
  const seatBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.18, 0.48),
    SEAT_FABRIC,
  );
  seatBase.position.set(SEAT_LOCAL.x, floorY + 0.42, SEAT_LOCAL.z);
  van.add(seatBase);
  const seatBack = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.55, 0.48),
    SEAT_FABRIC,
  );
  seatBack.position.set(SEAT_LOCAL.x - 0.24, floorY + 0.72, SEAT_LOCAL.z);
  van.add(seatBack);

  // Kerb-side front seat — where the cleaner rides.
  const passSeat = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.18, 0.48),
    SEAT_FABRIC,
  );
  passSeat.position.set(RIDE_SEAT_LOCAL.x, floorY + 0.42, RIDE_SEAT_LOCAL.z);
  van.add(passSeat);
  const passBack = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.55, 0.48),
    SEAT_FABRIC,
  );
  passBack.position.set(RIDE_SEAT_LOCAL.x - 0.24, floorY + 0.72, RIDE_SEAT_LOCAL.z);
  van.add(passBack);

  // Dashboard across the nose.
  const dash = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.28, VAN_WIDE * 0.78),
    DASH,
  );
  dash.position.set(nose - 0.45, floorY + 0.85, 0);
  van.add(dash);
  const dial = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.1, 0.35),
    new THREE.MeshStandardMaterial({
      color: 0x1a2a1a,
      roughness: 0.4,
      emissive: 0x0a2010,
      emissiveIntensity: 0.15,
    }),
  );
  dial.position.set(nose - 0.32, floorY + 0.98, SEAT_LOCAL.z);
  van.add(dial);

  // Steering wheel.
  const wheel = new THREE.Mesh(
    new THREE.TorusGeometry(0.18, 0.025, 8, 16),
    BUMPER,
  );
  wheel.rotation.y = Math.PI / 2;
  wheel.rotation.z = 0.25;
  wheel.position.set(nose - 0.55, floorY + 1.05, SEAT_LOCAL.z);
  van.add(wheel);
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.035, 0.35, 6),
    BUMPER,
  );
  column.rotation.z = 1.1;
  column.position.set(nose - 0.42, floorY + 0.95, SEAT_LOCAL.z);
  van.add(column);

  // Inner passenger wall lining behind the kerb door (reads through the aperture).
  const liningLen = doorRearX - cabBack;
  if (liningLen > 0.1) {
    const innerPass = new THREE.Mesh(
      new THREE.BoxGeometry(liningLen, 1.2, 0.04),
      LINING,
    );
    innerPass.position.set((doorRearX + cabBack) / 2, floorY + 0.7, halfW - 0.06);
    van.add(innerPass);
  }
}
