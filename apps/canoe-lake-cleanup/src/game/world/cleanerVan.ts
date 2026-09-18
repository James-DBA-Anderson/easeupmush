import * as THREE from "three";
import { getRoadGraph, ROAD_WIDTH } from "./buildings";
import { isBlocked } from "./blocking";
import { isOnPath, pathPolylines } from "./lake";
import { busStopSpots } from "./park";
import { addProp, type Footprint } from "./collision";
import { insidePark } from "./fence";
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
/** Eye in the driver's seat (UK right-hand drive). */
const SEAT_LOCAL = new THREE.Vector3(0.55, 1.42, -0.38);
/** Stand just outside the driver's door. */
const EXIT_LOCAL = new THREE.Vector3(0.15, 0, -1.55);

export interface CleanerVanPose {
  x: number;
  z: number;
  yaw: number;
  seatX: number;
  seatY: number;
  seatZ: number;
  /** World facing while seated — along the road, away from the park. */
  seatYaw: number;
  exitX: number;
  exitZ: number;
  /** Face the path after hopping out. */
  exitYaw: number;
  /** Spot on the footpath to walk to before first-person takes over. */
  pathX: number;
  pathZ: number;
  pathYaw: number;
  /** Waypoints from the door around the nose to the path. */
  walkVia: ReadonlyArray<{ x: number; z: number }>;
}

let pose: CleanerVanPose | null = null;
let mesh: THREE.Group | null = null;
/** Driver's door — hinged at the front edge, opens outward. */
let driverDoor: THREE.Group | null = null;
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
 * Footpath after collecting the heavy hose — hatch, around the kerb side,
 * then the same gate run used by the shift intro.
 */
export function hoseWalkVia(): { x: number; z: number }[] | null {
  if (!pose) return null;
  const hatch = rearHatchWorld()!;
  const corner = localToWorld(
    pose.x,
    pose.z,
    pose.yaw,
    -VAN_LEN * 0.28,
    EXIT_LOCAL.z - 0.35,
  );
  return [
    { x: hatch.x, z: hatch.z },
    { x: corner.x, z: corner.z },
    ...pose.walkVia.map((p) => ({ x: p.x, z: p.z })),
  ];
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

/** 0 shut → 1 open (~70°). */
export function setDriverDoorOpen(amount: number): void {
  if (!driverDoor) return;
  const t = Math.max(0, Math.min(1, amount));
  // Right-hand door (local −Z): negative Y swings the panel out.
  driverDoor.rotation.y = -t * 1.2;
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
    driverDoor = null;
    rearDoorL = null;
    rearDoorR = null;
    heavyHoseProp = null;
    heavyHoseTaken = false;
  }

  mesh = buildMesh();
  mesh.position.set(pose.x, groundHeight(pose.x, pose.z), pose.z);
  mesh.rotation.y = pose.yaw;
  scene.add(mesh);
  setDriverDoorOpen(0);
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

  const seat = localToWorld(x, z, yaw, SEAT_LOCAL.x, SEAT_LOCAL.z);
  const exit = localToWorld(x, z, yaw, EXIT_LOCAL.x, EXIT_LOCAL.z);

  const arrive = pathArriveNear(tip, exit.x, exit.z);
  const pathYaw = Math.atan2(
    arrive.faceX - arrive.x,
    arrive.faceZ - arrive.z,
  );

  // Walk around the nose on a gentle arc (lake side), then follow the path
  // through the gate onto walkable park paving.
  const around = localToWorld(x, z, yaw, VAN_LEN * 0.2, EXIT_LOCAL.z - 0.55);
  const nose = localToWorld(x, z, yaw, VAN_LEN * 0.62, -VAN_WIDE * 0.55);
  const clear = localToWorld(x, z, yaw, VAN_LEN * 0.72, -VAN_WIDE * 1.15);
  const exitYaw = Math.atan2(around.x - exit.x, around.z - exit.z);

  return {
    x,
    z,
    yaw,
    seatX: seat.x,
    seatY: groundHeight(x, z) + SEAT_LOCAL.y,
    seatZ: seat.z,
    seatYaw: yaw,
    exitX: exit.x,
    exitZ: exit.z,
    exitYaw,
    pathX: arrive.x,
    pathZ: arrive.z,
    pathYaw,
    walkVia: [
      { x: around.x, z: around.z },
      { x: nose.x, z: nose.z },
      { x: clear.x, z: clear.z },
      ...arrive.via,
      { x: arrive.x, z: arrive.z },
    ],
  };
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

  // Passenger (+Z) wall — full run.
  const passWall = new THREE.Mesh(
    new THREE.BoxGeometry(VAN_LEN * 0.88, roofY - floorY, wall),
    BODY,
  );
  passWall.position.set(-0.08, (floorY + roofY) / 2, halfW);
  passWall.castShadow = true;
  van.add(passWall);

  // Driver (−Z) wall: load bay up to the door's rear edge, then sill /
  // header / A-pillar so the open hole matches the door panel.
  const loadFront = doorRearX + frame;
  const loadLen = loadFront - (tail + wall);
  const driveLoad = new THREE.Mesh(
    new THREE.BoxGeometry(loadLen, roofY - floorY, wall),
    BODY,
  );
  driveLoad.position.set(
    (loadFront + tail + wall) / 2,
    (floorY + roofY) / 2,
    -halfW,
  );
  driveLoad.castShadow = true;
  van.add(driveLoad);

  // B-pillar strip at the rear of the door (overlaps the panel slightly).
  const bPillar = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, roofY - floorY, wall),
    BODY,
  );
  bPillar.position.set(doorRearX + frame * 0.5, (floorY + roofY) / 2, -halfW);
  bPillar.castShadow = true;
  van.add(bPillar);

  // A-pillar / hinge strip ahead of the door.
  const aPillar = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, roofY - floorY, wall),
    BODY,
  );
  aPillar.position.set(doorHingeX + 0.04, (floorY + roofY) / 2, -halfW);
  aPillar.castShadow = true;
  van.add(aPillar);

  // Sill under the door.
  const sillH = Math.max(0.08, doorBot - floorY + frame);
  const sill = new THREE.Mesh(
    new THREE.BoxGeometry(DOOR_W - frame * 2, sillH, wall),
    BODY,
  );
  sill.position.set(
    doorHingeX - DOOR_W * 0.5,
    floorY + sillH * 0.5,
    -halfW,
  );
  van.add(sill);

  // Header above the door.
  const headH = Math.max(0.06, roofY - doorTop + frame);
  const header = new THREE.Mesh(
    new THREE.BoxGeometry(DOOR_W - frame * 2, headH, wall),
    BODY,
  );
  header.position.set(
    doorHingeX - DOOR_W * 0.5,
    roofY - headH * 0.5,
    -halfW,
  );
  van.add(header);

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

  // Council stripe along both sides (passenger full; driver on load bay).
  const stripeH = 0.2;
  const stripeY = ride + 1.05;
  const passStripe = new THREE.Mesh(
    new THREE.BoxGeometry(VAN_LEN * 0.86, stripeH, 0.04),
    TRIM,
  );
  passStripe.position.set(-0.08, stripeY, halfW + 0.02);
  van.add(passStripe);
  const driveStripe = new THREE.Mesh(
    new THREE.BoxGeometry(loadLen * 0.95, stripeH, 0.04),
    TRIM,
  );
  driveStripe.position.set(driveLoad.position.x, stripeY, -halfW - 0.02);
  van.add(driveStripe);

  // Windscreen.
  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.55, VAN_WIDE * 0.78),
    GLASS,
  );
  screen.position.set(nose - 0.02, ride + 1.75, 0);
  van.add(screen);

  // Passenger-side window.
  const passPane = new THREE.Mesh(
    new THREE.BoxGeometry(VAN_LEN * 0.28, 0.4, 0.05),
    GLASS,
  );
  passPane.position.set(VAN_LEN * 0.16, ride + 1.7, halfW + 0.01);
  van.add(passPane);

  // ── Cabin interior (visible through the open door) ──────────────────
  addCabinInterior(van, floorY, halfW, cabBack, nose);

  // Driver's door — hinge at the forward edge on the right (−Z).
  const door = new THREE.Group();
  door.position.set(doorHingeX, doorY, -halfW);
  const doorPanel = new THREE.Mesh(
    new THREE.BoxGeometry(DOOR_W, DOOR_H, 0.07),
    BODY,
  );
  doorPanel.position.set(-DOOR_W * 0.5, 0, 0);
  doorPanel.castShadow = true;
  door.add(doorPanel);
  // Inner door card — reads when the door swings open.
  const doorCard = new THREE.Mesh(
    new THREE.BoxGeometry(DOOR_W - 0.1, DOOR_H - 0.15, 0.04),
    CABIN,
  );
  doorCard.position.set(-DOOR_W * 0.5, -0.02, 0.05);
  door.add(doorCard);
  const doorWin = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.38, 0.05),
    GLASS,
  );
  doorWin.position.set(-DOOR_W * 0.38, 0.28, -0.02);
  door.add(doorWin);
  const handle = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.04, 0.05),
    BUMPER,
  );
  handle.position.set(-DOOR_W * 0.81, 0.05, -0.05);
  door.add(handle);
  van.add(door);
  driverDoor = door;

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

/** Seat, dash, wheel, and lining — enough to read as a cab when the door's open. */
function addCabinInterior(
  van: THREE.Group,
  floorY: number,
  halfW: number,
  cabBack: number,
  nose: number,
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
    new THREE.BoxGeometry(0.48, 0.55, 0.12),
    SEAT_FABRIC,
  );
  seatBack.position.set(SEAT_LOCAL.x - 0.18, floorY + 0.72, SEAT_LOCAL.z);
  van.add(seatBack);

  // Passenger perch (simpler bench).
  const passSeat = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.14, 0.42),
    SEAT_FABRIC,
  );
  passSeat.position.set(SEAT_LOCAL.x, floorY + 0.4, 0.42);
  van.add(passSeat);

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

  // Inner passenger wall lining (reads through the aperture).
  const innerPass = new THREE.Mesh(
    new THREE.BoxGeometry(nose - cabBack - 0.2, 1.2, 0.04),
    LINING,
  );
  innerPass.position.set((nose + cabBack) / 2 - 0.05, floorY + 0.7, halfW - 0.06);
  van.add(innerPass);
}
