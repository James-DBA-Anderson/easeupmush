import * as THREE from "three";
import {
  SHORE,
  WATER_Y,
  isInLake,
  nearestShore,
  outwardAt,
  PATH_OUTER,
  offsetShore,
} from "./lake";
import type { Wall } from "../entities/Graffiti";
import { hitsAny, clearProps, addProp, type Footprint } from "./collision";
import { MuckFlecks } from "../effects/MuckFlecks";
import { DEFAULT_LEVEL } from "../../level/defaultLevel";
import type { Placeable, PlaceableId, XZ } from "../../level/types";
import { placeBench } from "./bench";
import { groundHeight } from "./terrain";
import { parkAudio } from "../audio/ParkAudio";

/** Park surface under a spot (berms raise buildings with the ground). */
function footY(x: number, z: number): number {
  return groundHeight(x, z);
}

/**
 * The buildings and fittings marked on a map of Canoe Lake: the small boat
 * house with swan pedalos moored on the shore beside it, the café out on
 * the east green toward the splash, the toilet block south of the lake by
 * the esplanade, the play park on the east green, the rose beds toward St
 * Helens Parade, bins round the circuit, and bus shelters along the parade.
 *
 * +Z is inland (St Helens Parade), −Z is the seafront, and the lake runs
 * south-west to north-east.
 */

const TIMBER = new THREE.MeshStandardMaterial({
  color: 0x8a6a44,
  roughness: 0.95,
});
const TIMBER_DARK = new THREE.MeshStandardMaterial({
  color: 0x5f4630,
  roughness: 1,
});
const PAINT = new THREE.MeshStandardMaterial({
  color: 0x2f5d4a,
  roughness: 0.8,
});
const FELT = new THREE.MeshStandardMaterial({
  color: 0x3a3a40,
  roughness: 1,
});
const BRICK = new THREE.MeshStandardMaterial({
  color: 0x9c6a52,
  roughness: 1,
});
const WHITE = new THREE.MeshStandardMaterial({
  color: 0xf2f0e8,
  roughness: 0.7,
});
const CREAM = new THREE.MeshStandardMaterial({
  color: 0xe8dcc0,
  roughness: 0.9,
});
const STEEL = new THREE.MeshStandardMaterial({
  color: 0x8f969c,
  roughness: 0.4,
  metalness: 0.6,
});
const GLASS = new THREE.MeshStandardMaterial({
  color: 0xa8c4d4,
  roughness: 0.15,
  metalness: 0.1,
  transparent: true,
  opacity: 0.45,
});
const BUS_BLUE = new THREE.MeshStandardMaterial({
  color: 0x1f4e9a,
  roughness: 0.55,
});

/**
 * Bark / wood-chip mulch under the play kit — speckled browns, not wet-pour rubber.
 */
function woodChipTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#6a4a2e";
  ctx.fillRect(0, 0, size, size);
  // Soft base mottling.
  for (let i = 0; i < 180; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 4 + Math.random() * 14;
    ctx.fillStyle = `rgba(${90 + Math.random() * 50 | 0},${55 + Math.random() * 35 | 0},${25 + Math.random() * 20 | 0},${0.25 + Math.random() * 0.35})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.4 + Math.random() * 0.6), Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // Distinct chip flakes.
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const w = 2 + Math.random() * 7;
    const h = 1 + Math.random() * 2.8;
    const shade = 55 + Math.random() * 95;
    const warm = shade * (0.55 + Math.random() * 0.25);
    ctx.fillStyle = `rgb(${shade | 0},${warm | 0},${(warm * 0.45) | 0})`;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.random() * Math.PI);
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(0.12, 0.12);
  tex.needsUpdate = true;
  return tex;
}

const WOOD_CHIP = new THREE.MeshStandardMaterial({
  map: woodChipTexture(),
  color: 0xc4a06a,
  roughness: 1,
});
/** Soft play kit grips / seats — not the floor. */
const RUBBER = new THREE.MeshStandardMaterial({
  color: 0x4a3f4a,
  roughness: 1,
});

/**
 * How far back from the water each thing sits. The paving runs out to 14m,
 * so anything built has to clear that — and the play / splash sit out on the
 * east green the way the real ones do. Bins sit on the grass hard against the
 * outer path lip.
 */
const BOATHOUSE_OUT = 26;
const TOILETS_OUT = 18;
/** Just clear of the paving edge so the bins aren't mid-path. */
const BIN_OUT = PATH_OUTER + 0.9;

/** Layout from the level file — placeables + optional explicit bins. */
let parkPlaceables: Placeable[] = DEFAULT_LEVEL.placeables.map((p) => ({
  ...p,
}));
let parkBins: XZ[] = DEFAULT_LEVEL.bins.map((b) => [b[0], b[1]]);
let parkPlayOutline: XZ[] = DEFAULT_LEVEL.playParkOutline.map(
  (p) => [p[0], p[1]] as XZ,
);

export function applyParkLayout(
  placeables: readonly Placeable[],
  bins: readonly XZ[],
  playParkOutline: readonly XZ[] = [],
): void {
  parkPlaceables = placeables.map((p) => ({ ...p }));
  parkBins = bins.map((b) => [b[0], b[1]]);
  parkPlayOutline = playParkOutline.map((p) => [p[0], p[1]] as XZ);
}

function placeable(id: PlaceableId): Placeable | undefined {
  return parkPlaceables.find((p) => p.id === id);
}

function placeablesOf(id: PlaceableId): Placeable[] {
  return parkPlaceables.filter((p) => p.id === id);
}

/** Bus shelters from the level — for the cleaner van / shift start. */
export function busStopSpots(): ReadonlyArray<{ x: number; z: number; yaw: number }> {
  return placeablesOf("busStop").map((p) => ({
    x: p.x,
    z: p.z,
    yaw: p.yaw,
  }));
}

/** Where the play park sits, filled when it's built — kids walk here to play. */
export interface PlayParkSite {
  /** Rubber boundary in world XZ. */
  outline: ReadonlyArray<{ x: number; z: number }>;
  /** Rough centre — used for crowding / approach. */
  x: number;
  z: number;
  /**
   * Just inside the gate on the wood chips. `along` runs the opening; `inward`
   * points into the park so parents can stand clear of the rails.
   */
  gate: {
    x: number;
    z: number;
    alongX: number;
    alongZ: number;
    inwardX: number;
    inwardZ: number;
    yaw: number;
  };
  /** Benches on the inside edge, yaw facing the centre. */
  benches: ReadonlyArray<{ x: number; z: number; yaw: number }>;
  /** World-space activity spots from placed kit. */
  swings: ReadonlyArray<{ x: number; z: number }>;
  slide: { x: number; z: number } | null;
  spring: { x: number; z: number } | null;
  run: ReadonlyArray<{ x: number; z: number }>;
}

let playParkSite: PlayParkSite | null = null;

export function getPlayPark(): PlayParkSite | null {
  return playParkSite;
}

/** Footprints the player can't walk through, as x/z half-extents and a yaw. */
const solids: Footprint[] = [];

/** Pedalos tied beside the boat house, kept so they can be made to bob. */
const moored: {
  mesh: THREE.Object3D;
  phase: number;
  /** Crank / paddle spin while pedalling. */
  pedalPhase: number;
  crank: THREE.Object3D;
  wheels: THREE.Object3D[];
  /** Water rising in the footwell as the hull takes on lake. */
  bilge: THREE.Mesh;
  y: number;
  flecks: MuckFlecks;
  heading: number;
  speed: number;
  hired: boolean;
  /** 0 dry … 1 awash — keeps rising after a hard bank hit. */
  flood: number;
  /** Going under after flooding out. */
  sunk: boolean;
  /** Seconds until a sunk boat is hauled back to its mooring. */
  sinkLeft: number;
  /** Player-facing bump strength to consume (0–1). */
  impactPulse: number;
  /** This wreck was the cleaner's fault — hire bloke wants words. */
  wreckByPlayer: boolean;
  homeX: number;
  homeZ: number;
  homeHeading: number;
}[] = [];

/** 0 calm … 1 rough water — driven by weather each frame. */
let lakeChop = 0;

/** Which pedalo the cleaner has hired, if any. */
let hiredIndex = -1;

/** Seat eject point after the hired swan goes under — consumed once. */
let sinkEject: { x: number; z: number } | null = null;
/** True once when a player-wrecked boat finishes sinking. */
let wreckPending = false;

/** Hire office pose — hatch faces local −Z. */
let boatHouseAt: { x: number; z: number; yaw: number } | null = null;
/** Café / kiosk poses — hatch faces local −Z, same as the boat house. */
const cafeSpots: { x: number; z: number; yaw: number }[] = [];

/** How close you must be to hop in. */
const BOARD_RANGE = 2.4;
/** Pedal cruise speed on open water. */
const PEDALO_CRUISE = 3.4;
/** Bank bump above this (m/s) starts the boat taking on water. */
const IMPACT_FLOOD_SPEED = 1.15;
/** Sitting eye height above the pedalo origin (seats ~0.55, eye ~1.35). */
const SEAT_EYE = new THREE.Vector3(0, 1.35, 0.42);

/** Blank walls round the park, which is where the tags end up. */
const walls: Wall[] = [];

/** Where the bins stand, filled in as they're placed. */
const binSpots: { x: number; z: number }[] = [];

/**
 * Records a flat face of a building as somewhere a tag can go. Offsets are
 * measured in the building's own frame: `out` is away from the water, `along`
 * is sideways.
 */
function taggable(
  at: Pitch,
  along: number,
  out: number,
  turn: number,
  width: number,
  centreY: number,
): void {
  const back = new THREE.Vector3(Math.sin(at.yaw), 0, Math.cos(at.yaw));
  const side = new THREE.Vector3(back.z, 0, -back.x);
  walls.push({
    x: at.x + back.x * out + side.x * along,
    z: at.z + back.z * out + side.z * along,
    y: centreY,
    yaw: at.yaw + turn,
    width,
    height: centreY * 2,
  });
}

interface Pitch {
  x: number;
  z: number;
  /** Facing back towards the water. */
  yaw: number;
}

/**
 * A patch of ground out beyond the paving, on the bearing given in degrees
 * round from the eastern end, pushed `out` metres clear of the water.
 */
function pitch(bearing: number, out: number): Pitch {
  const want = (bearing * Math.PI) / 180;
  let best = SHORE[0]!;
  let closest = Infinity;
  for (const point of SHORE) {
    const angle = Math.atan2(point.y, point.x);
    let gap = Math.abs(angle - want);
    if (gap > Math.PI) gap = Math.PI * 2 - gap;
    if (gap < closest) {
      closest = gap;
      best = point;
    }
  }

  const away = best.clone().normalize();
  return {
    x: best.x + away.x * out,
    z: best.y + away.y * out,
    // Turned so the group's -Z, where every front is built, looks at the water.
    yaw: Math.atan2(away.x, away.y),
  };
}

function block(
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Pitched roof, built as two slabs leaning against each other. */
function gable(width: number, depth: number, rise: number): THREE.Group {
  const roof = new THREE.Group();
  const slope = Math.atan2(rise, depth / 2);
  const length = Math.hypot(rise, depth / 2) + 0.2;
  for (const side of [-1, 1]) {
    const slab = block(width + 0.5, 0.12, length, FELT);
    slab.position.set(0, rise / 2, (side * depth) / 4);
    slab.rotation.x = -side * slope;
    roof.add(slab);
  }
  return roof;
}

/** Timber picnic set in café-local space — table with a bench either side. */
function placePicnicSet(
  cafe: THREE.Group,
  x: number,
  z: number,
  yaw: number,
): void {
  const set = new THREE.Group();
  set.position.set(x, footY(x, z), z);
  set.rotation.y = yaw;

  const table = block(1.95, 0.08, 0.78, TIMBER);
  table.position.y = 0.72;
  set.add(table);
  for (const sx of [-0.8, 0.8] as const) {
    for (const sz of [-0.28, 0.28] as const) {
      const leg = block(0.08, 0.7, 0.08, TIMBER_DARK);
      leg.position.set(sx, 0.35, sz);
      set.add(leg);
    }
  }
  for (const side of [-1, 1] as const) {
    const seat = block(1.95, 0.07, 0.34, TIMBER);
    seat.position.set(0, 0.42, side * 0.75);
    set.add(seat);
    for (const sx of [-0.75, 0.75] as const) {
      const leg = block(0.07, 0.4, 0.07, TIMBER_DARK);
      leg.position.set(sx, 0.2, side * 0.75);
      set.add(leg);
    }
  }
  cafe.add(set);

  const cy = cafe.rotation.y;
  const cos = Math.cos(cy);
  const sin = Math.sin(cy);
  addProp({
    x: cafe.position.x + cos * x - sin * z,
    z: cafe.position.z + sin * x + cos * z,
    halfWide: 1.05,
    halfDeep: 0.95,
    yaw: cy + yaw,
  });
}

/**
 * The boat house: a small timber hire office on the green by the hire path.
 * Swan pedalos raft on the shore next to wherever this sits.
 */
function boatHouse(scene: THREE.Scene): void {
  const placed = placeable("boathouse");
  const at = placed
    ? { x: placed.x, z: placed.z, yaw: placed.yaw }
    : pitch(112, BOATHOUSE_OUT);
  const group = new THREE.Group();
  group.position.set(at.x, footY(at.x, at.z), at.z);
  group.rotation.y = at.yaw;

  const WIDE = 8;
  const DEEP = 5;

  const walls = block(WIDE, 2.8, DEEP, TIMBER);
  walls.position.y = 1.4;
  group.add(walls);

  // Boarding, so the timber reads as clapboard rather than a plain box.
  for (let y = 0.25; y < 2.7; y += 0.45) {
    const board = block(WIDE + 0.12, 0.1, DEEP + 0.12, TIMBER_DARK);
    board.position.y = y;
    group.add(board);
  }

  // Serving hatch facing the path / water.
  const hatch = block(3.2, 1.4, 0.2, FELT);
  hatch.position.set(0, 1.2, -DEEP / 2 - 0.05);
  group.add(hatch);

  const lintel = block(3.6, 0.28, 0.35, PAINT);
  lintel.position.set(0, 2.05, -DEEP / 2 - 0.08);
  group.add(lintel);

  const roof = gable(WIDE, DEEP, 1.2);
  roof.position.y = 2.8;
  group.add(roof);

  // The board over the hatch.
  const sign = block(5.5, 0.7, 0.16, PAINT);
  sign.position.set(0, 3.35, -DEEP / 2 + 0.15);
  group.add(sign);
  const lettering = block(4.6, 0.24, 0.08, CREAM);
  lettering.position.set(0, 3.35, -DEEP / 2 + 0.04);
  group.add(lettering);

  scene.add(group);
  solids.push({
    x: at.x,
    z: at.z,
    halfWide: WIDE / 2,
    halfDeep: DEEP / 2,
    yaw: at.yaw,
  });

  taggable(at, 0, DEEP / 2 + 0.1, 0, WIDE, 1.4);
  taggable(at, WIDE / 2 + 0.1, 0, Math.PI / 2, DEEP, 1.4);

  boatHouseAt = { x: at.x, z: at.z, yaw: at.yaw };
  moorPedalos(scene, at);
}

/** Consecutive shore samples centred on `centre`, spanning ~`halfSpan` metres. */
function shoreBandAround(
  centre: THREE.Vector2,
  halfSpan: number,
): THREE.Vector2[] {
  const n = SHORE.length;
  if (n < 2) return [];
  let bestI = 0;
  let bestDist = Infinity;
  for (let i = 0; i < n; i++) {
    const d = SHORE[i]!.distanceToSquared(centre);
    if (d < bestDist) {
      bestDist = d;
      bestI = i;
    }
  }

  let left = 0;
  let right = 0;
  let leftLen = 0;
  let rightLen = 0;
  while (leftLen < halfSpan && left < n / 2) {
    const a = SHORE[(bestI - left + n) % n]!;
    const b = SHORE[(bestI - left - 1 + n) % n]!;
    leftLen += a.distanceTo(b);
    left++;
  }
  while (rightLen < halfSpan && right < n / 2) {
    const a = SHORE[(bestI + right) % n]!;
    const b = SHORE[(bestI + right + 1) % n]!;
    rightLen += a.distanceTo(b);
    right++;
  }

  const band: THREE.Vector2[] = [];
  for (let d = -left; d <= right; d++) {
    band.push(SHORE[(bestI + d + n) % n]!);
  }
  return band;
}

/**
 * Swan pedalos rafted on the near bank by the hire office, noses toward
 * open water. Follows the boathouse wherever the level puts it.
 */
function moorPedalos(
  scene: THREE.Scene,
  hire: { x: number; z: number },
): void {
  const near = nearestShore(hire.x, hire.z);
  const band = shoreBandAround(near, 12);
  if (band.length < 2) return;

  const count = 8;
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const shore =
      band[Math.min(band.length - 1, Math.floor(t * (band.length - 1)))]!;
    const out = outwardAt(shore);
    const inward = out.clone().negate();
    const at = shore.clone().addScaledVector(inward, 2.5 + (i % 2) * 0.3);

    const boat = swanPedalo();
    boat.mesh.position.set(at.x, WATER_Y, at.y);
    const heading = Math.atan2(inward.x, inward.y) + Math.PI;
    boat.mesh.rotation.y = heading;
    scene.add(boat.mesh);
    moored.push({
      mesh: boat.mesh,
      phase: i * 1.3,
      pedalPhase: Math.random() * Math.PI * 2,
      crank: boat.crank,
      wheels: boat.wheels,
      bilge: boat.bilge,
      y: WATER_Y,
      flecks: new MuckFlecks(boat.mesh, 48),
      heading,
      speed: 0,
      hired: false,
      flood: 0,
      sunk: false,
      sinkLeft: 0,
      impactPulse: 0,
      wreckByPlayer: false,
      homeX: at.x,
      homeZ: at.y,
      homeHeading: heading,
    });
  }
}

/**
 * One of the white swan pedalos: moulded hull, bird up front, pedals in the
 * well and paddle wheels on the flanks.
 */
function swanPedalo(): {
  mesh: THREE.Group;
  crank: THREE.Object3D;
  wheels: THREE.Object3D[];
  bilge: THREE.Mesh;
} {
  const boat = new THREE.Group();

  const hull = block(1.7, 0.5, 2.6, WHITE);
  hull.position.y = 0.16;
  boat.add(hull);

  const rim = block(1.5, 0.12, 2.4, PAINT);
  rim.position.y = 0.42;
  boat.add(rim);

  // Lake water pooling in the well — rises as the hull floods.
  const bilge = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 0.1, 1.9),
    new THREE.MeshStandardMaterial({
      color: 0x3d6f7c,
      transparent: true,
      opacity: 0.62,
      roughness: 0.25,
      metalness: 0.05,
      depthWrite: false,
    }),
  );
  bilge.position.set(0, 0.2, 0.15);
  bilge.visible = false;
  boat.add(bilge);

  // Two seats behind the neck, and the pedals down in the well.
  for (const x of [-0.38, 0.38]) {
    const seat = block(0.5, 0.28, 0.5, PAINT);
    seat.position.set(x, 0.55, 0.5);
    boat.add(seat);
  }

  // Pedal crank in the footwell — opposite pedals, 180° apart.
  const crank = new THREE.Group();
  crank.position.set(0, 0.22, 0.12);
  boat.add(crank);
  const axle = block(0.85, 0.035, 0.035, STEEL);
  crank.add(axle);
  for (const side of [-1, 1] as const) {
    const arm = new THREE.Group();
    arm.position.x = side * 0.32;
    arm.rotation.x = side > 0 ? 0 : Math.PI;
    const bar = block(0.035, 0.035, 0.26, STEEL);
    bar.position.z = 0.13;
    arm.add(bar);
    const pedal = block(0.2, 0.035, 0.1, RUBBER);
    pedal.position.set(0, -0.02, 0.26);
    arm.add(pedal);
    crank.add(arm);
  }

  // Side paddle wheels — spin with the crank.
  const wheels: THREE.Object3D[] = [];
  const paddleMat = new THREE.MeshStandardMaterial({
    color: 0xd8d2c4,
    roughness: 0.85,
  });
  for (const side of [-1, 1] as const) {
    const wheel = new THREE.Group();
    wheel.position.set(side * 0.98, 0.32, 0.15);
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.14, 10),
      STEEL,
    );
    hub.rotation.z = Math.PI / 2;
    wheel.add(hub);
    for (let i = 0; i < 8; i++) {
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.42, 0.14),
        paddleMat,
      );
      const a = (i / 8) * Math.PI * 2;
      blade.position.set(0, Math.sin(a) * 0.28, Math.cos(a) * 0.28);
      blade.rotation.x = a;
      wheel.add(blade);
    }
    boat.add(wheel);
    wheels.push(wheel);
  }

  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.16, 1.1, 8),
    WHITE,
  );
  neck.position.set(0, 0.95, -0.9);
  neck.rotation.x = 0.18;
  boat.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), WHITE);
  head.position.set(0, 1.5, -1.02);
  boat.add(head);

  const beak = new THREE.Mesh(
    new THREE.ConeGeometry(0.09, 0.3, 7),
    new THREE.MeshStandardMaterial({ color: 0xe08a2c, roughness: 0.7 }),
  );
  beak.position.set(0, 1.46, -1.26);
  beak.rotation.x = -Math.PI / 2;
  boat.add(beak);

  // Folded wings moulded into the sides of the hull.
  for (const side of [-1, 1]) {
    const wing = block(0.2, 0.55, 1.5, WHITE);
    wing.position.set(side * 0.82, 0.5, -0.15);
    wing.rotation.z = side * 0.12;
    boat.add(wing);
  }

  boat.scale.setScalar(0.95);
  return { mesh: boat, crank, wheels, bilge };
}

/** The café on the east green, on the play-triangle’s south-east path edge. */
function cafe(scene: THREE.Scene): void {
  const listed = placeablesOf("cafe");
  const kiosks = placeablesOf("cafeKiosk");
  const all =
    listed.length + kiosks.length > 0
      ? [
          ...listed.map((p) => ({ pl: p, seating: true })),
          ...kiosks.map((p) => ({ pl: p, seating: false })),
        ]
      : [
          {
            pl: {
              id: "cafe" as const,
              x: 148,
              z: 28,
              yaw: Math.atan2(148, 28),
            },
            seating: true,
          },
        ];
  for (const { pl, seating } of all) placeCafe(scene, pl, seating);
}

/** Cream kiosk / café — optional patio tables out front under parasols. */
function placeCafe(
  scene: THREE.Scene,
  pl: Placeable,
  seating: boolean,
): void {
  const at = { x: pl.x, z: pl.z, yaw: pl.yaw };
  cafeSpots.push({ x: at.x, z: at.z, yaw: at.yaw });
  const group = new THREE.Group();
  group.position.set(at.x, footY(at.x, at.z), at.z);
  group.rotation.y = at.yaw;

  const WIDE = 9;
  const DEEP = 6;

  const walls = block(WIDE, 3, DEEP, CREAM);
  walls.position.y = 1.5;
  group.add(walls);

  const roof = block(WIDE + 0.8, 0.3, DEEP + 0.8, FELT);
  roof.position.y = 3.15;
  group.add(roof);

  // Serving hatch and counter facing the lake.
  const hatch = block(4.4, 1.5, 0.25, FELT);
  hatch.position.set(0, 1.7, -DEEP / 2 - 0.05);
  group.add(hatch);
  const counter = block(4.8, 0.16, 0.6, TIMBER);
  counter.position.set(0, 1.0, -DEEP / 2 - 0.3);
  group.add(counter);

  // Striped awning over the hatch, on two thin poles.
  for (let i = 0; i < 6; i++) {
    const strip = block(0.95, 0.08, 2.2, i % 2 ? WHITE : PAINT);
    strip.position.set(-2.4 + i * 0.96, 2.5, -DEEP / 2 - 1.1);
    strip.rotation.x = 0.18;
    group.add(strip);
  }
  for (const x of [-2.6, 2.6]) {
    const pole = block(0.08, 2.3, 0.08, STEEL);
    pole.position.set(x, 1.15, -DEEP / 2 - 2.1);
    group.add(pole);
  }

  const board = block(0.9, 1.1, 0.1, TIMBER_DARK);
  board.position.set(-3.4, 0.6, -DEEP / 2 - 1.6);
  board.rotation.set(0.2, 0.3, 0);
  group.add(board);

  if (seating) {
    // Round tables out front under parasols.
    const patio: ReadonlyArray<readonly [number, number]> = [
      [-4.4, -5.4],
      [-1.6, -6.6],
      [1.4, -6.8],
      [4.2, -5.6],
      [-5.2, -8.2],
      [-2.2, -9.0],
      [1.0, -9.2],
      [4.0, -8.4],
    ];
    for (const [tx, tz] of patio) {
      const top = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 0.08, 12),
        WHITE,
      );
      top.position.set(tx, 0.74, tz);
      top.castShadow = true;
      group.add(top);

      const pole = block(0.07, 2.4, 0.07, STEEL);
      pole.position.set(tx, 1.2, tz);
      group.add(pole);

      const parasol = new THREE.Mesh(
        new THREE.ConeGeometry(1.5, 0.5, 8),
        new THREE.MeshStandardMaterial({ color: 0xc94f3d, roughness: 0.9 }),
      );
      parasol.position.set(tx, 2.4, tz);
      parasol.castShadow = true;
      group.add(parasol);

      for (const side of [-1, 1]) {
        const chair = block(0.4, 0.06, 0.4, WHITE);
        chair.position.set(tx + side * 0.95, 0.45, tz);
        group.add(chair);
        const back = block(0.4, 0.45, 0.06, WHITE);
        back.position.set(tx + side * 1.13, 0.68, tz);
        group.add(back);
      }
    }

    // Picnic benches further out on the grass — longer timber sets.
    const picnics: ReadonlyArray<readonly [number, number, number]> = [
      [-7.2, -6.8, 0.35],
      [-7.6, -10.4, -0.2],
      [6.8, -7.0, -0.4],
      [7.2, -10.6, 0.25],
      [0.2, -11.8, 0.05],
    ];
    for (const [px, pz, yaw] of picnics) {
      placePicnicSet(group, px, pz, yaw);
    }
  }

  taggable(at, 0, DEEP / 2 + 0.1, 0, WIDE, 1.5);

  scene.add(group);
  solids.push({
    x: at.x,
    z: at.z,
    halfWide: WIDE / 2,
    halfDeep: DEEP / 2,
    yaw: at.yaw,
  });
}

/**
 * Glass bus shelter — open front faces local −Z (point it at the kerb).
 * Stamp as many as you like along the parade roads.
 */
function busStops(scene: THREE.Scene): void {
  for (const pl of placeablesOf("busStop")) placeBusStop(scene, pl);
}

function placeBusStop(scene: THREE.Scene, pl: Placeable): void {
  const at = { x: pl.x, z: pl.z, yaw: pl.yaw };
  const group = new THREE.Group();
  group.position.set(at.x, footY(at.x, at.z), at.z);
  group.rotation.y = at.yaw;

  const WIDE = 3.6;
  const DEEP = 1.2;

  // Back + side glass in a steel frame.
  const back = block(WIDE, 2.2, 0.06, GLASS);
  back.position.set(0, 1.3, DEEP / 2 - 0.05);
  group.add(back);
  for (const side of [-1, 1]) {
    const pane = block(0.06, 2.2, DEEP - 0.1, GLASS);
    pane.position.set(side * (WIDE / 2 - 0.03), 1.3, 0);
    group.add(pane);
    const post = block(0.1, 2.45, 0.1, STEEL);
    post.position.set(side * (WIDE / 2 - 0.05), 1.25, DEEP / 2 - 0.08);
    group.add(post);
  }
  const frontPostL = block(0.1, 2.45, 0.1, STEEL);
  frontPostL.position.set(-(WIDE / 2 - 0.05), 1.25, -DEEP / 2 + 0.08);
  group.add(frontPostL);
  const frontPostR = block(0.1, 2.45, 0.1, STEEL);
  frontPostR.position.set(WIDE / 2 - 0.05, 1.25, -DEEP / 2 + 0.08);
  group.add(frontPostR);

  const roof = block(WIDE + 0.35, 0.08, DEEP + 0.25, STEEL);
  roof.position.set(0, 2.48, 0);
  group.add(roof);

  // Perch bench under the shelter.
  const seat = block(WIDE - 0.3, 0.08, 0.42, FELT);
  seat.position.set(0, 0.55, -0.1);
  group.add(seat);
  for (const x of [-1.2, 0, 1.2]) {
    const leg = block(0.08, 0.5, 0.08, STEEL);
    leg.position.set(x, 0.28, -0.1);
    group.add(leg);
  }

  // Flag pole + timetable board on the kerb-side corner.
  const pole = block(0.09, 2.9, 0.09, STEEL);
  pole.position.set(WIDE / 2 + 0.2, 1.45, -DEEP / 2 + 0.05);
  group.add(pole);
  const flag = block(0.55, 0.45, 0.05, BUS_BLUE);
  flag.position.set(WIDE / 2 + 0.2, 2.95, -DEEP / 2 + 0.05);
  group.add(flag);
  const board = block(0.55, 0.7, 0.05, WHITE);
  board.position.set(WIDE / 2 + 0.2, 1.55, -DEEP / 2 - 0.02);
  group.add(board);

  scene.add(group);
  solids.push({
    x: at.x,
    z: at.z,
    halfWide: WIDE / 2 + 0.25,
    halfDeep: DEEP / 2 + 0.15,
    yaw: at.yaw,
  });
}

/** The toilet block, south of the lake between the path and the esplanade. */
function toilets(scene: THREE.Scene): void {
  const placed = placeable("toilets");
  const at = placed
    ? { x: placed.x, z: placed.z, yaw: placed.yaw }
    : pitch(-105, TOILETS_OUT);
  const group = new THREE.Group();
  group.position.set(at.x, footY(at.x, at.z), at.z);
  group.rotation.y = at.yaw;

  const WIDE = 7;
  const DEEP = 4.5;

  const walls = block(WIDE, 2.8, DEEP, BRICK);
  walls.position.y = 1.4;
  group.add(walls);

  const roof = gable(WIDE, DEEP, 1);
  roof.position.y = 2.8;
  group.add(roof);

  for (const [x, colour] of [
    [-1.8, 0x3f6b9c],
    [1.8, 0x8b3a6b],
  ] as const) {
    const door = block(1.1, 2.1, 0.16, new THREE.MeshStandardMaterial({
      color: colour,
      roughness: 0.8,
    }));
    door.position.set(x, 1.05, -DEEP / 2 - 0.05);
    group.add(door);

    const plate = block(0.4, 0.4, 0.06, WHITE);
    plate.position.set(x, 2.35, -DEEP / 2 - 0.05);
    group.add(plate);
  }

  // The back of the toilets is the most tagged wall in the park, obviously.
  taggable(at, 0, DEEP / 2 + 0.1, 0, WIDE, 1.4);
  taggable(at, WIDE / 2 + 0.1, 0, Math.PI / 2, DEEP, 1.4);
  taggable(at, -WIDE / 2 - 0.1, 0, -Math.PI / 2, DEEP, 1.4);

  scene.add(group);
  solids.push({ x: at.x, z: at.z, halfWide: WIDE / 2, halfDeep: DEEP / 2, yaw: at.yaw });
}

/**
 * The play park — wood-chip floor from the level outline, kit from
 * swing/slide/spring/zip placeables. Gate gap sits on the longest edge.
 */
function playPark(scene: THREE.Scene): void {
  if (parkPlayOutline.length < 3) return;

  const outline = parkPlayOutline.map(([x, z]) => ({ x, z }));
  let cx = 0;
  let cz = 0;
  for (const p of outline) {
    cx += p.x;
    cz += p.z;
  }
  cx /= outline.length;
  cz /= outline.length;

  const shape = new THREE.Shape();
  outline.forEach((p, i) => {
    // Shape lives in XY; after −90° X the shape's Y becomes world −Z.
    if (i === 0) shape.moveTo(p.x, -p.z);
    else shape.lineTo(p.x, -p.z);
  });
  shape.closePath();
  const surface = new THREE.Mesh(new THREE.ShapeGeometry(shape), WOOD_CHIP);
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = 0.03;
  surface.receiveShadow = true;
  scene.add(surface);

  // Railings along each edge; leave a gate on the longest side.
  let gateEdge = 0;
  let gateLen = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len > gateLen) {
      gateLen = len;
      gateEdge = i;
    }
  }
  const GATE = Math.min(4, gateLen * 0.35);
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.2) continue;
    const yaw = Math.atan2(dx, dz);
    if (i === gateEdge && len > GATE + 1) {
      const t0 = (len - GATE) / 2 / len;
      const t1 = (len + GATE) / 2 / len;
      for (const [tA, tB] of [
        [0, t0],
        [t1, 1],
      ] as const) {
        const seg = (tB - tA) * len;
        if (seg < 0.3) continue;
        const mx = a.x + dx * ((tA + tB) / 2);
        const mz = a.z + dz * ((tA + tB) / 2);
        const rail = block(0.12, 1, seg, PAINT);
        rail.position.set(mx, 0.5, mz);
        rail.rotation.y = yaw;
        scene.add(rail);
      }
    } else {
      const rail = block(0.12, 1, len, PAINT);
      rail.position.set(a.x + dx / 2, 0.5, a.z + dz / 2);
      rail.rotation.y = yaw;
      scene.add(rail);
    }
  }

  // Gate midpoint, stepped onto the chips so carers wait inside.
  const gateEdgeA = outline[gateEdge]!;
  const gateEdgeB = outline[(gateEdge + 1) % outline.length]!;
  const gateDx = gateEdgeB.x - gateEdgeA.x;
  const gateDz = gateEdgeB.z - gateEdgeA.z;
  const gateEdgeLen = Math.hypot(gateDx, gateDz) || 1;
  const gateAlongX = gateDx / gateEdgeLen;
  const gateAlongZ = gateDz / gateEdgeLen;
  let gateInwardX = -gateAlongZ;
  let gateInwardZ = gateAlongX;
  const gateMidX = gateEdgeA.x + gateDx * 0.5;
  const gateMidZ = gateEdgeA.z + gateDz * 0.5;
  if (
    (cx - gateMidX) * gateInwardX + (cz - gateMidZ) * gateInwardZ <
    0
  ) {
    gateInwardX = -gateInwardX;
    gateInwardZ = -gateInwardZ;
  }
  const gate = {
    x: gateMidX + gateInwardX * 2.4,
    z: gateMidZ + gateInwardZ * 2.4,
    alongX: gateAlongX,
    alongZ: gateAlongZ,
    inwardX: gateInwardX,
    inwardZ: gateInwardZ,
    yaw: Math.atan2(gateInwardX, gateInwardZ),
  };

  // Benches scattered along the inside of the fence, facing the kit.
  const benches: { x: number; z: number; yaw: number }[] = [];
  const BENCH_GAP = 7.2;
  const BENCH_INSET = 1.4;
  const placeBenchStrip = (
    a: { x: number; z: number },
    ux: number,
    uz: number,
    nx: number,
    nz: number,
    t0: number,
    t1: number,
  ): void => {
    const span = t1 - t0;
    if (span < BENCH_GAP * 0.7) return;
    for (let t = t0 + BENCH_GAP * 0.45; t <= t1 - BENCH_GAP * 0.35; t += BENCH_GAP) {
      const x = a.x + ux * t + nx * BENCH_INSET;
      const z = a.z + uz * t + nz * BENCH_INSET;
      const yaw = Math.atan2(cx - x, cz - z);
      placeBench(scene, x, z, yaw);
      benches.push({ x, z, yaw });
    }
  };
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < BENCH_GAP) continue;
    const ux = dx / len;
    const uz = dz / len;
    let nx = -uz;
    let nz = ux;
    const midX = a.x + dx * 0.5;
    const midZ = a.z + dz * 0.5;
    if ((cx - midX) * nx + (cz - midZ) * nz < 0) {
      nx = -nx;
      nz = -nz;
    }
    if (i === gateEdge && len > GATE + 1) {
      const gateT0 = (len - GATE) / 2;
      const gateT1 = (len + GATE) / 2;
      placeBenchStrip(a, ux, uz, nx, nz, 0.8, gateT0 - 0.6);
      placeBenchStrip(a, ux, uz, nx, nz, gateT1 + 0.6, len - 0.8);
    } else {
      placeBenchStrip(a, ux, uz, nx, nz, 0.8, len - 0.8);
    }
  }

  const swings: { x: number; z: number }[] = [];
  let slideSpot: { x: number; z: number } | null = null;
  let springSpot: { x: number; z: number } | null = null;

  for (const pl of placeablesOf("swing")) {
    placeSwing(scene, pl);
    swings.push({ x: pl.x, z: pl.z });
  }
  for (const pl of placeablesOf("slide")) {
    placeSlide(scene, pl);
    // Kids queue at the foot of the chute, a few metres along +Z of the kit.
    const footX = pl.x + Math.sin(pl.yaw) * 4.2;
    const footZ = pl.z + Math.cos(pl.yaw) * 4.2;
    slideSpot = { x: footX, z: footZ };
  }
  for (const pl of placeablesOf("spring")) {
    placeSpring(scene, pl);
    springSpot = { x: pl.x, z: pl.z };
  }
  for (const pl of placeablesOf("zip")) {
    placeZip(scene, pl);
  }

  const run: { x: number; z: number }[] = [{ x: cx, z: cz }];
  for (const p of outline) {
    run.push({
      x: (p.x + cx) * 0.5,
      z: (p.z + cz) * 0.5,
    });
  }

  playParkSite = {
    outline,
    x: cx,
    z: cz,
    gate,
    benches,
    swings,
    slide: slideSpot,
    spring: springSpot,
    run,
  };
}

function placeSwing(scene: THREE.Scene, pl: Placeable): void {
  const group = new THREE.Group();
  group.position.set(pl.x, footY(pl.x, pl.z), pl.z);
  group.rotation.y = pl.yaw;

  const beam = block(4.5, 0.16, 0.16, STEEL);
  beam.position.set(0, 2.5, 0);
  group.add(beam);
  for (const x of [-2.1, 2.1]) {
    for (const z of [-1.1, 1.1]) {
      const leg = block(0.14, 2.6, 0.14, STEEL);
      leg.position.set(x, 1.3, z);
      leg.rotation.x = z < 0 ? -0.2 : 0.2;
      group.add(leg);
    }
  }
  const chain = block(0.05, 1.6, 0.05, STEEL);
  chain.position.set(0, 1.7, 0);
  group.add(chain);
  const seat = block(0.6, 0.08, 0.3, RUBBER);
  seat.position.set(0, 0.9, 0);
  group.add(seat);
  scene.add(group);
}

function placeSlide(scene: THREE.Scene, pl: Placeable): void {
  const group = new THREE.Group();
  group.position.set(pl.x, footY(pl.x, pl.z), pl.z);
  group.rotation.y = pl.yaw;

  const tower = block(1.8, 2.1, 1.8, TIMBER);
  tower.position.set(0, 1.05, -3);
  group.add(tower);
  const canopy = gable(2.2, 2.2, 0.7);
  canopy.position.set(0, 2.1, -3);
  group.add(canopy);
  const slide = block(1.0, 0.12, 5.2, STEEL);
  slide.position.set(0, 1.2, 1.2);
  slide.rotation.x = 0.4;
  group.add(slide);
  for (const side of [-1, 1]) {
    const kerb = block(0.12, 0.3, 5.2, STEEL);
    kerb.position.set(side * 0.55, 1.3, 1.2);
    kerb.rotation.x = 0.4;
    group.add(kerb);
  }
  scene.add(group);
}

function placeSpring(scene: THREE.Scene, pl: Placeable): void {
  const group = new THREE.Group();
  group.position.set(pl.x, footY(pl.x, pl.z), pl.z);
  group.rotation.y = pl.yaw;

  const spring = block(0.2, 0.5, 0.2, STEEL);
  spring.position.set(0, 0.28, 0);
  group.add(spring);
  const rider = block(
    0.5,
    0.4,
    1.3,
    new THREE.MeshStandardMaterial({ color: 0xd8452f, roughness: 0.9 }),
  );
  rider.position.set(0, 0.72, 0);
  group.add(rider);
  scene.add(group);
}

function placeZip(scene: THREE.Scene, pl: Placeable): void {
  const group = new THREE.Group();
  group.position.set(pl.x, footY(pl.x, pl.z), pl.z);
  group.rotation.y = pl.yaw;

  for (const x of [-4, 4]) {
    const post = block(0.2, 2.8, 0.2, STEEL);
    post.position.set(x, 1.4, 0);
    group.add(post);
  }
  const zip = block(8.2, 0.06, 0.06, STEEL);
  zip.position.set(0, 2.7, 0);
  group.add(zip);
  scene.add(group);
}

/** Weathered stump bole shared by the carved ornaments. */
function stumpBase(group: THREE.Group): void {
  const bole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.38, 0.48, 0.58, 12),
    TIMBER,
  );
  bole.position.y = 0.29;
  bole.castShadow = true;
  bole.receiveShadow = true;
  group.add(bole);

  // Cut face with rings.
  const face = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.36, 0.05, 12),
    TIMBER_DARK,
  );
  face.position.y = 0.58;
  face.castShadow = true;
  group.add(face);

  // A couple of root flares.
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + 0.3;
    const root = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 6, 5),
      TIMBER_DARK,
    );
    root.scale.set(1.4, 0.45, 0.9);
    root.position.set(Math.cos(ang) * 0.38, 0.08, Math.sin(ang) * 0.38);
    root.castShadow = true;
    group.add(root);
  }
}

function placeStumpProp(
  scene: THREE.Scene,
  pl: Placeable,
  carve: (group: THREE.Group) => void,
): void {
  const group = new THREE.Group();
  group.position.set(pl.x, footY(pl.x, pl.z), pl.z);
  group.rotation.y = pl.yaw;
  stumpBase(group);
  carve(group);
  scene.add(group);
  solids.push({
    x: pl.x,
    z: pl.z,
    halfWide: 0.45,
    halfDeep: 0.45,
    yaw: pl.yaw,
  });
}

function carveCrab(group: THREE.Group): void {
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 10, 7),
    TIMBER_DARK,
  );
  body.scale.set(1.45, 0.42, 1.15);
  body.position.set(0, 0.74, 0.02);
  body.castShadow = true;
  group.add(body);

  // Shell ridges.
  for (const ox of [-0.08, 0.08]) {
    const ridge = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.04, 0.22),
      TIMBER,
    );
    ridge.position.set(ox, 0.82, 0);
    group.add(ridge);
  }

  for (const side of [-1, 1] as const) {
    const claw = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 7, 5),
      TIMBER_DARK,
    );
    claw.scale.set(1.35, 0.55, 0.95);
    claw.position.set(side * 0.28, 0.72, 0.16);
    claw.rotation.y = side * 0.35;
    claw.castShadow = true;
    group.add(claw);

    const pincer = new THREE.Mesh(
      new THREE.ConeGeometry(0.04, 0.1, 5),
      TIMBER,
    );
    pincer.rotation.z = side * 1.2;
    pincer.position.set(side * 0.36, 0.72, 0.22);
    group.add(pincer);

    for (let i = 0; i < 3; i++) {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.035, 0.035),
        TIMBER,
      );
      leg.position.set(side * 0.26, 0.62, -0.02 - i * 0.07);
      leg.rotation.z = side * 0.45;
      leg.rotation.y = side * (0.15 + i * 0.08);
      group.add(leg);
    }
  }

  // Eyestalks.
  for (const side of [-1, 1] as const) {
    const stalk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.1, 5),
      TIMBER,
    );
    stalk.position.set(side * 0.06, 0.86, 0.14);
    group.add(stalk);
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 5, 4),
      TIMBER_DARK,
    );
    eye.position.set(side * 0.06, 0.92, 0.14);
    group.add(eye);
  }
}

function carveSnail(group: THREE.Group): void {
  // Spiral shell — stacked torus rings.
  for (let i = 0; i < 3; i++) {
    const r = 0.16 - i * 0.035;
    const tube = 0.055 - i * 0.008;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r, tube, 6, 12),
      i % 2 === 0 ? TIMBER_DARK : TIMBER,
    );
    ring.rotation.x = 1.05;
    ring.rotation.z = i * 0.4;
    ring.position.set(-0.02, 0.78 + i * 0.04, -0.04);
    ring.castShadow = true;
    group.add(ring);
  }

  // Body / foot poking forward.
  const foot = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 6),
    TIMBER,
  );
  foot.scale.set(0.7, 0.45, 1.5);
  foot.position.set(0.02, 0.66, 0.22);
  foot.castShadow = true;
  group.add(foot);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 7, 5),
    TIMBER_DARK,
  );
  head.position.set(0.02, 0.74, 0.36);
  group.add(head);

  for (const side of [-1, 1] as const) {
    const feeler = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.01, 0.14, 5),
      TIMBER,
    );
    feeler.position.set(side * 0.04, 0.84, 0.4);
    feeler.rotation.x = -0.5;
    feeler.rotation.z = side * 0.25;
    group.add(feeler);
    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 5, 4),
      TIMBER_DARK,
    );
    tip.position.set(side * 0.05, 0.9, 0.46);
    group.add(tip);
  }
}

function carveStarfish(group: THREE.Group): void {
  const hub = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 6),
    TIMBER_DARK,
  );
  hub.scale.set(1.1, 0.35, 1.1);
  hub.position.set(0, 0.66, 0);
  hub.castShadow = true;
  group.add(hub);

  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const arm = new THREE.Group();
    arm.rotation.y = ang;

    const limb = new THREE.Mesh(
      new THREE.ConeGeometry(0.09, 0.38, 6),
      i % 2 === 0 ? TIMBER_DARK : TIMBER,
    );
    limb.rotation.x = Math.PI / 2;
    limb.position.set(0, 0.66, 0.22);
    limb.castShadow = true;
    arm.add(limb);

    // Bumpy texture along the arm.
    for (const z of [0.12, 0.22, 0.3]) {
      const bump = new THREE.Mesh(
        new THREE.SphereGeometry(0.03, 5, 4),
        TIMBER,
      );
      bump.position.set(0, 0.7, z);
      arm.add(bump);
    }
    group.add(arm);
  }
}

function carvedStumps(scene: THREE.Scene): void {
  for (const pl of placeablesOf("stumpCrab")) {
    placeStumpProp(scene, pl, carveCrab);
  }
  for (const pl of placeablesOf("stumpSnail")) {
    placeStumpProp(scene, pl, carveSnail);
  }
  for (const pl of placeablesOf("stumpStarfish")) {
    placeStumpProp(scene, pl, carveStarfish);
  }
}

/** The rose beds on the east lawn, past the play park. */
function roseGarden(scene: THREE.Scene): void {
  // East of the lake, north of the play park.
  const placed = placeable("roseGarden");
  const at = placed
    ? { x: placed.x, z: placed.z, yaw: placed.yaw }
    : { x: 150, z: 101, yaw: Math.atan2(150, 101) };
  const group = new THREE.Group();
  group.position.set(at.x, footY(at.x, at.z), at.z);
  group.rotation.y = at.yaw;

  const hedge = new THREE.MeshStandardMaterial({
    color: 0x2f5a33,
    roughness: 1,
  });
  const soil = new THREE.MeshStandardMaterial({
    color: 0x5a4433,
    roughness: 1,
  });

  for (const bx of [-7, 0, 7]) {
    const bed = block(5.4, 0.3, 7, soil);
    bed.position.set(bx, 0.15, 0);
    group.add(bed);

    const kerb = block(5.8, 0.5, 7.4, hedge);
    kerb.position.set(bx, 0.25, 0);
    group.add(kerb);

    const inner = block(5.2, 0.4, 6.8, soil);
    inner.position.set(bx, 0.35, 0);
    group.add(inner);

    // Rose bushes, a few in bloom.
    for (let i = 0; i < 10; i++) {
      const bush = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 7, 6),
        hedge,
      );
      bush.position.set(
        bx + (Math.random() - 0.5) * 4.2,
        0.7,
        (Math.random() - 0.5) * 5.6,
      );
      bush.castShadow = true;
      group.add(bush);

      if (Math.random() > 0.4) {
        const bloom = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 6, 5),
          new THREE.MeshStandardMaterial({
            color: Math.random() < 0.5 ? 0xd8446a : 0xe8c04a,
            roughness: 0.8,
          }),
        );
        bloom.position.copy(bush.position).add(new THREE.Vector3(0, 0.34, 0));
        group.add(bloom);
      }
    }
  }

  scene.add(group);
}

export function buildParkBuildings(scene: THREE.Scene): void {
  for (const boat of moored) boat.flecks.dispose();
  solids.length = 0;
  clearProps();
  moored.length = 0;
  hiredIndex = -1;
  sinkEject = null;
  wreckPending = false;
  boatHouseAt = null;
  cafeSpots.length = 0;
  walls.length = 0;
  binSpots.length = 0;
  playParkSite = null;

  boatHouse(scene);
  cafe(scene);
  toilets(scene);
  playPark(scene);
  roseGarden(scene);
  busStops(scene);
  carvedStumps(scene);

  // Bin stations: explicit from the level, or auto on the outer path lip.
  if (parkBins.length > 0) {
    for (const [x, z] of parkBins) binSpots.push({ x, z });
  } else {
    const rim = offsetShore(BIN_OUT);
    const count = 9;
    for (let i = 0; i < count; i++) {
      const point = rim[Math.floor((i / count) * rim.length)]!;
      binSpots.push({ x: point.x, z: point.y });
    }
  }
}

/** Where the council bins stand. */
export function binStations(): ReadonlyArray<{ x: number; z: number }> {
  return binSpots;
}

/** Blank walls a tag could end up on. */
export function taggableWalls(): ReadonlyArray<Wall> {
  return walls;
}

/** How choppy the lake is (0–1) — weather drives this each frame. */
export function setPedaloChop(amount: number): void {
  lakeChop = THREE.MathUtils.clamp(amount, 0, 1);
}

/** The moored pedalos riding the water — idle ones bob; a hired one is driven. */
export function bobPedalos(time: number, delta = 0): void {
  const chop = lakeChop;
  for (let i = 0; i < moored.length; i++) {
    const boat = moored[i]!;
    if (delta > 0) {
      tickPedaloFlood(i, delta);
      boat.flecks.update(delta);
    }
    if (boat.hired && !boat.sunk) continue;
    if (boat.sunk) {
      poseSunkPedalo(boat, delta);
      continue;
    }
    const bobAmp = 0.04 + chop * 0.11;
    const rollAmp = 0.035 + chop * 0.12;
    const pitchAmp = chop * 0.07;
    const rate = 1.3 + chop * 1.1;
    boat.mesh.position.y =
      boat.y + Math.sin(time * rate + boat.phase) * bobAmp;
    boat.mesh.rotation.z =
      Math.sin(time * (0.9 + chop * 0.9) + boat.phase) * rollAmp;
    boat.mesh.rotation.x =
      Math.sin(time * 0.75 + boat.phase * 1.1) * pitchAmp;
  }
}

/** True if a free pedalo is close enough to board. */
export function pedaloInReach(x: number, z: number): boolean {
  return nearestFreePedalo(x, z) >= 0;
}

/** Whether the cleaner is currently in a hire swan. */
export function isPedaloHired(): boolean {
  return hiredIndex >= 0;
}

/** Hull of the cleaner's hired swan, if any. */
export function hiredPedaloHull(): THREE.Vector3 | null {
  if (hiredIndex < 0) return null;
  const boat = moored[hiredIndex];
  return boat ? boat.mesh.position.clone() : null;
}

/**
 * Hop into the nearest free pedalo. Returns false if none are in reach.
 */
export function boardPedalo(x: number, z: number): boolean {
  if (hiredIndex >= 0) return false;
  const i = nearestFreePedalo(x, z);
  if (i < 0) return false;
  const boat = moored[i]!;
  boat.hired = true;
  boat.speed = 0;
  boat.heading = boat.mesh.rotation.y;
  hiredIndex = i;
  return true;
}

/**
 * Climb out onto the nearest bank. Returns the foot spot, or null if not aboard.
 */
export function disembarkPedalo(): { x: number; z: number } | null {
  if (hiredIndex < 0) return null;
  const boat = moored[hiredIndex]!;
  boat.hired = false;
  boat.speed = 0;
  // Abandoned half-full — keep flooding; dry boats settle again.
  if (boat.flood < 0.12 && !boat.sunk) {
    boat.flood = 0;
    boat.mesh.rotation.z = 0;
    boat.mesh.rotation.x = 0;
    paintBilge(boat);
  }
  hiredIndex = -1;

  const shore = nearestShore(boat.mesh.position.x, boat.mesh.position.z);
  const out = outwardAt(shore);
  return {
    x: shore.x + out.x * 1.5,
    z: shore.y + out.y * 1.5,
  };
}

/**
 * Pedal and steer. `throttle` is −1…1 (S/W), `steer` is −1…1 (right positive —
 * A/left stick turns the bow right under the CSS-flipped view).
 */
export function drivePedalo(
  delta: number,
  throttle: number,
  steer: number,
): void {
  if (hiredIndex < 0) return;
  drivePedaloIndex(hiredIndex, delta, throttle, steer);
}

/** Drive any hired pedalo (player or visitor). */
export function drivePedaloIndex(
  index: number,
  delta: number,
  throttle: number,
  steer: number,
): void {
  const boat = moored[index];
  if (!boat?.hired || boat.sunk) return;
  const mesh = boat.mesh;
  const chop = lakeChop;
  const playerBoat = index === hiredIndex;

  // Taking on water — sluggish and wallowy.
  const wet = boat.flood;
  const cruise = PEDALO_CRUISE * (1 - wet * 0.72);

  boat.heading += steer * (1.55 - wet * 0.7) * delta;
  const want = cruise * THREE.MathUtils.clamp(throttle, -0.55, 1);
  boat.speed += (want - boat.speed) * Math.min(1, (2.4 - wet) * delta);

  const stepX = -Math.sin(boat.heading) * boat.speed * delta;
  const stepZ = -Math.cos(boat.heading) * boat.speed * delta;
  const nx = mesh.position.x + stepX;
  const nz = mesh.position.z + stepZ;
  if (isInLake(nx, nz)) {
    mesh.position.x = nx;
    mesh.position.z = nz;
  } else {
    const impact = Math.abs(boat.speed);
    boat.speed *= -0.25;
    boat.heading += Math.PI * 0.35 * (Math.random() < 0.5 ? 1 : -1);
    if (playerBoat && impact >= IMPACT_FLOOD_SPEED) {
      const pulse = Math.min(1, impact / PEDALO_CRUISE);
      boat.impactPulse = Math.max(boat.impactPulse, pulse);
      boat.flood = Math.min(1, boat.flood + 0.22 + pulse * 0.2);
      boat.wreckByPlayer = true;
    } else if (impact >= IMPACT_FLOOD_SPEED) {
      // Visitor bump — a little water, no hire-bloke vendetta.
      boat.flood = Math.min(1, boat.flood + 0.08);
    }
  }

  // Pedals / paddles turn with forward speed.
  boat.pedalPhase += boat.speed * delta * 2.6;
  boat.crank.rotation.x = boat.pedalPhase;
  for (const wheel of boat.wheels) {
    wheel.rotation.x = boat.pedalPhase * 1.15;
  }

  boat.phase += delta * (1.2 + Math.abs(boat.speed) * 0.35 + chop * 1.5 + wet);
  const bob = Math.sin(boat.phase) * (0.035 + chop * 0.1) * (1 - wet * 0.5);
  const list =
    -steer * 0.12 +
    Math.sin(boat.phase * 0.7) * (0.03 + chop * 0.1) +
    wet * (0.18 + Math.sin(boat.phase * 1.4) * 0.08);
  const pitch =
    Math.sin(boat.phase * 0.9) * (0.025 + chop * 0.08) -
    throttle * 0.02 +
    wet * 0.12;
  mesh.position.y = WATER_Y + bob - wet * 0.55;
  mesh.rotation.set(pitch, boat.heading, list);
  paintBilge(boat);

  // Soft hull wash while under way (pedal churn is separate in ParkAudio).
  const haste = Math.abs(boat.speed);
  if (haste > 0.35 && Math.random() < haste * delta * 1.8) {
    parkAudio.boatWash(0.2 + Math.min(0.55, haste * 0.12));
  }

  if (boat.flood >= 1) beginPedaloSink(index);
}

/** Bank-bump intensity on the hired boat (0–1), cleared when read. */
export function consumePedaloImpact(): number {
  if (hiredIndex < 0) return 0;
  const boat = moored[hiredIndex];
  if (!boat) return 0;
  const pulse = boat.impactPulse;
  boat.impactPulse = 0;
  return pulse;
}

/** How full the hired swan is (0–1). */
export function pedaloFloodLevel(): number {
  if (hiredIndex < 0) return 0;
  return moored[hiredIndex]?.flood ?? 0;
}

/**
 * After a hired swan goes under — world XZ to dump the rider in the lake.
 * Cleared when read.
 */
export function consumePedaloSinkEject(): { x: number; z: number } | null {
  const spot = sinkEject;
  sinkEject = null;
  return spot;
}

/** True once when the cleaner sinks a hire boat. */
export function consumePedaloWreck(): boolean {
  if (!wreckPending) return false;
  wreckPending = false;
  return true;
}

function tickPedaloFlood(index: number, delta: number): void {
  const boat = moored[index];
  if (!boat || boat.sunk) return;
  if (boat.flood <= 0) return;
  // Crack in the hull — keeps filling until she's gone.
  const seep = boat.flood < 0.35 ? 0.035 : 0.055 + boat.flood * 0.04;
  boat.flood = Math.min(1, boat.flood + seep * delta);
  paintBilge(boat);
  if (boat.flood >= 1) beginPedaloSink(index);
}

function beginPedaloSink(index: number): void {
  const boat = moored[index];
  if (!boat || boat.sunk) return;
  boat.sunk = true;
  boat.flood = 1;
  boat.speed = 0;
  boat.sinkLeft = 10;
  boat.hired = false;
  paintBilge(boat);

  if (index === hiredIndex) {
    sinkEject = { x: boat.mesh.position.x, z: boat.mesh.position.z };
    hiredIndex = -1;
  }
  if (boat.wreckByPlayer) wreckPending = true;
}

function poseSunkPedalo(
  boat: (typeof moored)[number],
  delta: number,
): void {
  boat.sinkLeft -= delta;
  const age = 10 - boat.sinkLeft;
  const dive = Math.min(1.4, age * 0.35);
  boat.mesh.position.y = WATER_Y - dive;
  boat.mesh.rotation.x = Math.min(0.9, age * 0.22);
  boat.mesh.rotation.z = Math.sin(age * 2.2) * 0.25;
  paintBilge(boat);
  if (boat.sinkLeft > 0) return;

  // Hauled out and back on the raft — dry for the next hire.
  boat.sunk = false;
  boat.flood = 0;
  boat.wreckByPlayer = false;
  boat.impactPulse = 0;
  boat.mesh.position.set(boat.homeX, WATER_Y, boat.homeZ);
  boat.heading = boat.homeHeading;
  boat.mesh.rotation.set(0, boat.homeHeading, 0);
  paintBilge(boat);
}

function paintBilge(boat: (typeof moored)[number]): void {
  const wet = boat.flood;
  boat.bilge.visible = wet > 0.04 || boat.sunk;
  boat.bilge.position.y = 0.18 + wet * 0.28;
  const mat = boat.bilge.material as THREE.MeshStandardMaterial;
  mat.opacity = boat.sunk ? 0.35 : 0.4 + wet * 0.45;
  boat.bilge.scale.set(1, 0.6 + wet * 2.2, 1);
}

/** Crank angle on a hired boat — for feet / leg pedalling poses. */
export function pedaloPedalPhase(index = hiredIndex): number {
  if (index < 0) return 0;
  return moored[index]?.pedalPhase ?? 0;
}

/** Current cruise speed of a hired boat (m/s). */
export function pedaloSpeed(index = hiredIndex): number {
  if (index < 0) return 0;
  return moored[index]?.speed ?? 0;
}

/** World-space seat / eye pose while the cleaner is hired. */
export function pedaloSeatPose(): {
  x: number;
  y: number;
  z: number;
  yaw: number;
} | null {
  if (hiredIndex < 0) return null;
  return pedaloSeatPoseAt(hiredIndex, 0);
}

/** Pitch / roll of the hired boat — for first-person rocking. */
export function pedaloAttitude(): { pitch: number; roll: number } | null {
  if (hiredIndex < 0) return null;
  const boat = moored[hiredIndex];
  if (!boat) return null;
  return { pitch: boat.mesh.rotation.x, roll: boat.mesh.rotation.z };
}

/** Seat pose on a given boat; `side` −1 / 0 / 1 picks left, centre, right. */
export function pedaloSeatPoseAt(
  index: number,
  side = 0,
): { x: number; y: number; z: number; yaw: number } | null {
  const boat = moored[index];
  if (!boat) return null;
  const mesh = boat.mesh;
  const yaw = boat.heading;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const lx = SEAT_EYE.x + side * 0.38;
  const ly = side === 0 ? SEAT_EYE.y : 0.72;
  const lz = SEAT_EYE.z;
  return {
    x: mesh.position.x + lx * cos + lz * sin,
    y: mesh.position.y + ly,
    z: mesh.position.z + -lx * sin + lz * cos,
    yaw,
  };
}

/** Hire office — null until the park is built. */
export function boathouseSpot(): { x: number; z: number; yaw: number } | null {
  return boatHouseAt;
}

/** Spot in front of the hatch where visitors queue to pay. */
export function hatchQueueSpot(): THREE.Vector3 | null {
  if (!boatHouseAt) return null;
  const yaw = boatHouseAt.yaw;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  return new THREE.Vector3(
    boatHouseAt.x + fx * 4.5,
    0,
    boatHouseAt.z + fz * 4.5,
  );
}

/**
 * Queue spot in front of a café hatch. Pass `near` to pick the closest kiosk;
 * otherwise any will do.
 */
export function cafeQueueSpot(near?: THREE.Vector3): THREE.Vector3 | null {
  if (cafeSpots.length === 0) return null;
  let best = cafeSpots[0]!;
  if (near && cafeSpots.length > 1) {
    let closest = Infinity;
    for (const cafe of cafeSpots) {
      const gap =
        (cafe.x - near.x) * (cafe.x - near.x) +
        (cafe.z - near.z) * (cafe.z - near.z);
      if (gap < closest) {
        closest = gap;
        best = cafe;
      }
    }
  } else if (!near) {
    best = cafeSpots[Math.floor(Math.random() * cafeSpots.length)]!;
  }
  // Hatch faces local −Z — same convention as the boat-house counter.
  const fx = -Math.sin(best.yaw);
  const fz = -Math.cos(best.yaw);
  return new THREE.Vector3(best.x + fx * 5.2, 0, best.z + fz * 5.2);
}

/** Where the boatman loiters beside the hatch. */
export function boatmanStandSpot(): THREE.Vector3 | null {
  if (!boatHouseAt) return null;
  const yaw = boatHouseAt.yaw;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const sx = Math.cos(yaw);
  const sz = -Math.sin(yaw);
  return new THREE.Vector3(
    boatHouseAt.x + fx * 3.2 + sx * 2.4,
    0,
    boatHouseAt.z + fz * 3.2 + sz * 2.4,
  );
}

export function freePedaloCount(): number {
  return moored.reduce(
    (n, b) => n + (b.hired || b.sunk || b.flood > 0.05 ? 0 : 1),
    0,
  );
}

/**
 * Mark the nearest free pedalo as hired for an NPC visit. Returns index or −1.
 */
export function reservePedalo(nearX: number, nearZ: number): number {
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < moored.length; i++) {
    const boat = moored[i]!;
    if (boat.hired || boat.sunk || boat.flood > 0.05) continue;
    const d =
      (boat.mesh.position.x - nearX) ** 2 + (boat.mesh.position.z - nearZ) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  if (best < 0) return -1;
  const boat = moored[best]!;
  boat.hired = true;
  boat.speed = 0;
  boat.heading = boat.mesh.rotation.y;
  return best;
}

/** Free an NPC-hired pedalo and send it home to its mooring. */
export function releasePedalo(index: number): void {
  if (index < 0 || index === hiredIndex) return;
  const boat = moored[index];
  if (!boat || boat.sunk) return;
  boat.hired = false;
  boat.speed = 0;
  boat.flood = 0;
  boat.wreckByPlayer = false;
  boat.mesh.position.set(boat.homeX, WATER_Y, boat.homeZ);
  boat.heading = boat.homeHeading;
  boat.mesh.rotation.set(0, boat.homeHeading, 0);
  paintBilge(boat);
}

export function pedaloWorldPos(index: number): THREE.Vector3 | null {
  const boat = moored[index];
  if (!boat) return null;
  return boat.mesh.position.clone();
}

export function pedaloHeading(index: number): number {
  return moored[index]?.heading ?? 0;
}

/** True while that hire swan is going under. */
export function pedaloIsSunk(index: number): boolean {
  return moored[index]?.sunk === true;
}

function nearestFreePedalo(x: number, z: number): number {
  let best = -1;
  let bestDist = BOARD_RANGE * BOARD_RANGE;
  for (let i = 0; i < moored.length; i++) {
    const boat = moored[i]!;
    if (boat.hired || boat.sunk || boat.flood > 0.05) continue;
    const dx = boat.mesh.position.x - x;
    const dz = boat.mesh.position.z - z;
    const d = dx * dx + dz * dz;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/**
 * Spray caught a hire swan. Dirty bounce sticks as flecks on the hull;
 * clean water rinses nearby muck off.
 */
export function sprayPedalo(point: THREE.Vector3, dirty: boolean): boolean {
  for (const boat of moored) {
    if (!pedaloHit(boat.mesh, point)) continue;
    if (dirty) {
      boat.flecks.splat(point, 5 + Math.floor(Math.random() * 5));
    } else {
      boat.flecks.rinseNear(point, 0.75);
    }
    return true;
  }
  return false;
}

function pedaloHit(mesh: THREE.Object3D, point: THREE.Vector3): boolean {
  const here = mesh.position;
  const dx = point.x - here.x;
  const dz = point.z - here.z;
  // Hull is about 1.7 × 2.6 m — generous so bouncing spray still sticks.
  if (dx * dx + dz * dz > 1.55 * 1.55) return false;
  return point.y > here.y - 0.15 && point.y < here.y + 1.85;
}

/** Whether a point is inside one of the park's buildings. */
export function atParkBuilding(x: number, z: number): boolean {
  return hitsAny(x, z, solids);
}

/** Footprints for the mini map — boat house, café, toilets. */
export function parkBuildingFootprints(): readonly Footprint[] {
  return solids;
}
