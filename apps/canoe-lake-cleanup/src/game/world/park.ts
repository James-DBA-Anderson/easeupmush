import * as THREE from "three";
import { SHORE, WATER_Y } from "./lake";
import type { Wall } from "../entities/Graffiti";
import { hitsAny, type Footprint } from "./collision";

/**
 * The buildings and fittings marked on a map of Canoe Lake: the wooden boat
 * house at the eastern end with the swan pedalos lined up beside it, the
 * café and its terrace on the seaward side, the toilet block, the play park,
 * the rose beds on the parade side, and bins round the whole circuit.
 *
 * +Z is St Helens Parade, -Z is the seafront, and the lake runs along X.
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
const RUBBER = new THREE.MeshStandardMaterial({
  color: 0x4a3f4a,
  roughness: 1,
});

/**
 * How far back from the water each thing sits. The paving runs out to 14m,
 * so anything built has to clear that — and the play park sits well out on
 * the green the way the real one does.
 */
const BOATHOUSE_OUT = 22;
const CAFE_OUT = 22;
const TOILETS_OUT = 21;
const PLAY_OUT = 34;
const ROSES_OUT = 30;
const BIN_OUT = 11;

/** Where the play park sits, filled when it's built — kids walk here to play. */
export interface PlayParkSite {
  x: number;
  z: number;
  yaw: number;
  wide: number;
  deep: number;
  /** Local-space spots on the rubber: swings, slide foot, spring, open run. */
  swings: ReadonlyArray<{ x: number; z: number }>;
  slide: { x: number; z: number };
  spring: { x: number; z: number };
  run: ReadonlyArray<{ x: number; z: number }>;
}

let playParkSite: PlayParkSite | null = null;

export function getPlayPark(): PlayParkSite | null {
  return playParkSite;
}

/** Footprints the player can't walk through, as x/z half-extents and a yaw. */
const solids: Footprint[] = [];

/** Pedalos tied beside the boat house, kept so they can be made to bob. */
const moored: { mesh: THREE.Object3D; phase: number; y: number }[] = [];

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

/**
 * The boat house: a long timber shed with its bays open to the water and a
 * hand-painted board over the doors. Swan pedalos sit in a line beside it —
 * no jetty, no porch.
 */
function boatHouse(scene: THREE.Scene): void {
  const at = pitch(14, BOATHOUSE_OUT);
  const group = new THREE.Group();
  group.position.set(at.x, 0, at.z);
  group.rotation.y = at.yaw;

  const WIDE = 14;
  const DEEP = 7;

  const walls = block(WIDE, 3.4, DEEP, TIMBER);
  walls.position.y = 1.7;
  group.add(walls);

  // Boarding, so the timber reads as clapboard rather than a plain box.
  for (let y = 0.3; y < 3.3; y += 0.5) {
    const board = block(WIDE + 0.12, 0.1, DEEP + 0.12, TIMBER_DARK);
    board.position.y = y;
    group.add(board);
  }

  // Three bays open onto the water, with the boats kept inside overnight.
  for (const x of [-4.6, 0, 4.6]) {
    const bay = block(3.6, 2.6, 0.3, FELT);
    bay.position.set(x, 1.3, -DEEP / 2 - 0.05);
    group.add(bay);

    const lintel = block(4, 0.35, 0.5, PAINT);
    lintel.position.set(x, 2.75, -DEEP / 2 - 0.1);
    group.add(lintel);
  }

  const roof = gable(WIDE, DEEP, 1.6);
  roof.position.y = 3.4;
  group.add(roof);

  // The board over the doors, facing anyone walking round the lake.
  const sign = block(9, 1, 0.2, PAINT);
  sign.position.set(0, 4.1, -DEEP / 2 + 0.2);
  group.add(sign);
  const lettering = block(7.6, 0.32, 0.1, CREAM);
  lettering.position.set(0, 4.1, -DEEP / 2 + 0.05);
  group.add(lettering);

  scene.add(group);
  solids.push({
    x: at.x,
    z: at.z,
    halfWide: WIDE / 2,
    halfDeep: DEEP / 2,
    yaw: at.yaw,
  });

  // The blank back and gable ends, out of sight of the café.
  taggable(at, 0, DEEP / 2 + 0.1, 0, WIDE, 1.6);
  taggable(at, WIDE / 2 + 0.1, 0, Math.PI / 2, DEEP, 1.6);

  moorPedalos(scene, at, WIDE);
}

/**
 * Swan pedalos rafted beside the eastern gable — no jetty, just hire boats
 * lined up along the side of the shed with noses toward open water.
 */
function moorPedalos(scene: THREE.Scene, at: Pitch, shedWide: number): void {
  const group = new THREE.Group();
  group.position.set(at.x, 0, at.z);
  group.rotation.y = at.yaw;

  // Just past the gable, sitting in the water along the bank.
  const startX = shedWide / 2 + 2.2;
  const waterZ = -BOATHOUSE_OUT - 2.2;
  const count = 7;
  const spacing = 2.9;

  for (let i = 0; i < count; i++) {
    const boat = swanPedalo();
    boat.position.set(
      startX + i * spacing,
      WATER_Y,
      waterZ + (i % 2 === 0 ? 0 : -0.4),
    );
    // Nose toward open water, with a bit of natural stagger.
    boat.rotation.y = Math.PI + (i % 2 === 0 ? -0.05 : 0.07);
    group.add(boat);
    moored.push({ mesh: boat, phase: i * 1.3, y: WATER_Y });
  }

  scene.add(group);
}

/** One of the white swan pedalos: a moulded hull with the bird up front. */
function swanPedalo(): THREE.Group {
  const boat = new THREE.Group();

  const hull = block(1.7, 0.5, 2.6, WHITE);
  hull.position.y = 0.16;
  boat.add(hull);

  const rim = block(1.5, 0.12, 2.4, PAINT);
  rim.position.y = 0.42;
  boat.add(rim);

  // Two seats behind the neck, and the pedals down in the well.
  for (const x of [-0.38, 0.38]) {
    const seat = block(0.5, 0.28, 0.5, PAINT);
    seat.position.set(x, 0.55, 0.5);
    boat.add(seat);
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
  return boat;
}

/** The café on the seaward side, with a terrace of tables under parasols. */
function cafe(scene: THREE.Scene): void {
  const at = pitch(-155, CAFE_OUT);
  const group = new THREE.Group();
  group.position.set(at.x, 0, at.z);
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

  // Tables out front, each with a parasol up.
  for (const [tx, tz] of [
    [-3.2, -5.6],
    [0.4, -6.4],
    [3.6, -5.4],
  ] as const) {
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

  taggable(at, 0, DEEP / 2 + 0.1, 0, WIDE, 1.5);

  scene.add(group);
  solids.push({ x: at.x, z: at.z, halfWide: WIDE / 2, halfDeep: DEEP / 2, yaw: at.yaw });
}

/** The toilet block, tucked along the seaward path a little way off. */
function toilets(scene: THREE.Scene): void {
  const at = pitch(-120, TOILETS_OUT);
  const group = new THREE.Group();
  group.position.set(at.x, 0, at.z);
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

/** The play park on the seafront side: a proper stretch of rubber, swings, slide and a springy animal. */
function playPark(scene: THREE.Scene): void {
  const at = pitch(-70, PLAY_OUT);
  const group = new THREE.Group();
  group.position.set(at.x, 0, at.z);
  group.rotation.y = at.yaw;

  const WIDE = 36;
  const DEEP = 28;

  const surface = new THREE.Mesh(new THREE.PlaneGeometry(WIDE, DEEP), RUBBER);
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = 0.03;
  surface.receiveShadow = true;
  group.add(surface);

  // Low bow-top railing round the edge with a gap for the gate.
  for (const [x, z, w, d] of [
    [0, -DEEP / 2, WIDE, 0.12],
    [-WIDE / 2, 0, 0.12, DEEP],
    [WIDE / 2, 0, 0.12, DEEP],
    [-WIDE / 4 - 2, DEEP / 2, WIDE / 2 - 4, 0.12],
    [WIDE / 4 + 2, DEEP / 2, WIDE / 2 - 4, 0.12],
  ] as const) {
    const rail = block(w, 1, d, PAINT);
    rail.position.set(x, 0.5, z);
    group.add(rail);
  }

  // Swing frame with three seats hanging from the beam.
  const beam = block(9, 0.16, 0.16, STEEL);
  beam.position.set(-8, 2.5, -4);
  group.add(beam);
  for (const x of [-12.2, -3.8]) {
    for (const z of [-5.1, -2.9]) {
      const leg = block(0.14, 2.6, 0.14, STEEL);
      leg.position.set(x, 1.3, z);
      leg.rotation.x = z < -4 ? -0.2 : 0.2;
      group.add(leg);
    }
  }
  const swingSeats = [-10.5, -8, -5.5];
  for (const x of swingSeats) {
    const chain = block(0.05, 1.6, 0.05, STEEL);
    chain.position.set(x, 1.7, -4);
    group.add(chain);
    const seat = block(0.6, 0.08, 0.3, RUBBER);
    seat.position.set(x, 0.9, -4);
    group.add(seat);
  }

  // Slide up on a little tower, and a springy animal off to one side.
  const tower = block(1.8, 2.1, 1.8, TIMBER);
  tower.position.set(8, 1.05, -3);
  group.add(tower);
  const canopy = gable(2.2, 2.2, 0.7);
  canopy.position.set(8, 2.1, -3);
  group.add(canopy);
  const slide = block(1.0, 0.12, 5.2, STEEL);
  slide.position.set(8, 1.2, 1.2);
  slide.rotation.x = 0.4;
  group.add(slide);
  for (const side of [-1, 1]) {
    const kerb = block(0.12, 0.3, 5.2, STEEL);
    kerb.position.set(8 + side * 0.55, 1.3, 1.2);
    kerb.rotation.x = 0.4;
    group.add(kerb);
  }

  const spring = block(0.2, 0.5, 0.2, STEEL);
  spring.position.set(-2, 0.28, 6);
  group.add(spring);
  const rider = block(0.5, 0.4, 1.3, new THREE.MeshStandardMaterial({
    color: 0xd8452f,
    roughness: 0.9,
  }));
  rider.position.set(-2, 0.72, 6);
  group.add(rider);

  // Climbing frame / zip posts at the far end.
  for (const x of [4, 12]) {
    const post = block(0.2, 2.8, 0.2, STEEL);
    post.position.set(x, 1.4, 8);
    group.add(post);
  }
  const zip = block(8.2, 0.06, 0.06, STEEL);
  zip.position.set(8, 2.7, 8);
  group.add(zip);

  playParkSite = {
    x: at.x,
    z: at.z,
    yaw: at.yaw,
    wide: WIDE,
    deep: DEEP,
    swings: swingSeats.map((x) => ({ x, z: -4 })),
    slide: { x: 8, z: 3.2 },
    spring: { x: -2, z: 6 },
    run: [
      { x: 0, z: 0 },
      { x: -10, z: 4 },
      { x: 10, z: 5 },
      { x: 2, z: -8 },
    ],
  };

  // Not walled off in the collision sense: kids' gear is meant to be walked in.
  scene.add(group);
}

/** The rose beds on the parade side, hedged in and full of colour. */
function roseGarden(scene: THREE.Scene): void {
  const at = pitch(140, ROSES_OUT);
  const group = new THREE.Group();
  group.position.set(at.x, 0, at.z);
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
  solids.length = 0;
  moored.length = 0;
  walls.length = 0;
  binSpots.length = 0;
  playParkSite = null;

  boatHouse(scene);
  cafe(scene);
  toilets(scene);
  playPark(scene);
  roseGarden(scene);

  // Bin stations round the circuit; the bins themselves are entities.
  for (let bearing = 0; bearing < 360; bearing += 40) {
    const at = pitch(bearing, BIN_OUT);
    binSpots.push({ x: at.x, z: at.z });
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

/** The moored pedalos riding the water, which is all they do these days. */
export function bobPedalos(time: number): void {
  for (const boat of moored) {
    boat.mesh.position.y = boat.y + Math.sin(time * 1.3 + boat.phase) * 0.04;
    boat.mesh.rotation.z = Math.sin(time * 0.9 + boat.phase) * 0.035;
  }
}

/** Whether a point is inside one of the park's buildings. */
export function atParkBuilding(x: number, z: number): boolean {
  return hitsAny(x, z, solids);
}
