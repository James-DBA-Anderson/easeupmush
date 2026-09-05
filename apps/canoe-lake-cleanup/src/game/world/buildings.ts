import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { hitsAny, type Footprint } from "./collision";

/**
 * What you can see from Canoe Lake, roughly where it really is.
 *
 * St Helens Parade runs along the north side (+Z): a long wall of tall
 * Victorian and Edwardian terraces and seafront hotels looking out over the
 * water. Eastern Parade carries on round the west end (-X). South (-Z) is
 * Clarence Esplanade, the beach and the Solent, with South Parade Pier out
 * over the water to the south-west and the glass of the Pyramids beyond it.
 * Lumps Fort holds the eastern edge, and on a clear day the Spinnaker Tower
 * stands up over the rooftops away to the north-west, with the Isle of Wight
 * a grey line across the water.
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
const SAND = new THREE.MeshStandardMaterial({ color: 0xc9bb9a, roughness: 1 });
const SEA = new THREE.MeshStandardMaterial({ color: 0x466b7d, roughness: 0.5 });
const HAZE = new THREE.MeshStandardMaterial({ color: 0x6d7f8c, roughness: 1 });
const GROUND = new THREE.MeshStandardMaterial({
  color: 0x51704e,
  roughness: 1,
});

/** How deep a terrace house runs back from the parade. */
const HOUSE_DEPTH = 9;

/** Surround footprints — terraces, pier pavilions, and the like. */
const surrounds: Footprint[] = [];

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
    for (const pile of this.piles.values()) {
      for (const geometry of pile) {
        geometry.rotateY(yaw);
        geometry.translate(x, 0, z);
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
 * A run of houses shoulder to shoulder, with the odd taller hotel in it and a
 * gap where a road comes down to the sea.
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
  while (walked < length) {
    if (rand() < 0.09) {
      // A side road running back off the parade.
      walked += 12 + rand() * 8;
      continue;
    }

    const hotel = rand() < 0.14;
    const width = hotel ? 16 + rand() * 10 : 6.5 + rand() * 2.5;
    if (walked + width > length) break;

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

    walked += width + 0.2;
  }
}

/** The Solent, the beach and the Esplanade along the south side. */
function seafront(yard: Yard): void {
  // The park's own grass runs out at 200m, so there's a wider apron of ground
  // beyond it — as a ring, so it can't cover the lake.
  yard.box(GROUND, [1500, 0.2, 550], [0, -0.03, 475]);
  yard.box(GROUND, [1500, 0.2, 550], [0, -0.03, -475]);
  yard.box(GROUND, [550, 0.2, 400], [-475, -0.03, 0]);
  yard.box(GROUND, [550, 0.2, 400], [475, -0.03, 0]);

  // Esplanade, then shingle, then water out to the horizon. Each layer sits a
  // touch higher than the last so it covers the grass underneath.
  yard.box(STONE, [1100, 0.3, 12], [0, 0.09, -128]);
  yard.box(SAND, [1100, 0.3, 34], [0, 0.07, -152]);
  yard.box(SEA, [1600, 0.3, 580], [0, 0.03, -450]);

  // Railings along the top of the sea wall, as a broken white line.
  for (let x = -260; x <= 260; x += 4) {
    yard.box(TRIM, [0.18, 1.1, 0.18], [x, 0.85, -122]);
  }
  yard.box(TRIM, [520, 0.16, 0.16], [0, 1.4, -122]);
}

/**
 * South Parade Pier: a long timber deck out over the water on iron legs, with
 * the pavilion at the shore end.
 */
function pier(yard: Yard): void {
  const x = -178;
  const shore = -118;

  yard.box(SLATE, [16, 0.8, 190], [x, 4.4, shore - 95]);
  for (let z = shore - 12; z > shore - 190; z -= 14) {
    for (const side of [-6, 6]) {
      yard.box(STONE, [1, 4.4, 1], [x + side, 2.2, z]);
    }
  }

  // Pavilion at the landward end: a big hall with a domed roof and turrets.
  const hall = shore - 16;
  yard.box(RENDER, [30, 12, 34], [x, 10.8, hall]);
  yard.box(SLATE, [32, 2, 36], [x, 17.8, hall]);
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
  dome.translate(x, 18.6, hall);
  yard.add(SLATE, dome);
  for (const [dx, dz] of [
    [-13, 15],
    [13, 15],
    [-13, -15],
    [13, -15],
  ] as const) {
    yard.box(RENDER, [4, 18, 4], [x + dx, 9, hall + dz]);
    const spire = new THREE.ConeGeometry(3, 7, 8);
    spire.translate(x + dx, 21.5, hall + dz);
    yard.add(SLATE, spire);
  }

  // The smaller pavilion out at the seaward head.
  yard.box(RENDER, [18, 7, 22], [x, 8.3, shore - 175]);
  yard.box(SLATE, [20, 1.4, 24], [x, 12.5, shore - 175]);

  surrounds.push(
    { x, z: hall, halfWide: 15, halfDeep: 17, yaw: 0 },
    { x, z: shore - 175, halfWide: 9, halfDeep: 11, yaw: 0 },
  );
}

/** The Pyramids, further west along the front: all glass, and unmistakable. */
function pyramids(yard: Yard): void {
  const x = -285;
  yard.box(STONE, [64, 3, 44], [x, 1.5, -108]);
  for (const [dx, size, height] of [
    [-14, 30, 21],
    [14, 26, 17],
  ] as const) {
    const pyramid = new THREE.ConeGeometry(size, height, 4);
    pyramid.rotateY(Math.PI / 4);
    pyramid.translate(x + dx, 3 + height / 2, -108);
    yard.add(GLASS, pyramid);
  }
  surrounds.push({ x, z: -108, halfWide: 32, halfDeep: 22, yaw: 0 });
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
  const yard = new Yard();
  const rand = seeded(0x50ea);

  seafront(yard);
  island(yard);
  pier(yard);
  pyramids(yard);
  spinnaker(yard);

  // St Helens Parade: the wall of houses along the north side, close enough
  // to the water that the roofs and chimneys stand above the oaks.
  yard.box(STONE, [560, 0.2, 14], [0, 0.05, 138]);
  terrace(
    yard,
    new THREE.Vector2(-280, 152),
    new THREE.Vector2(1, 0),
    540,
    0,
    rand,
  );

  // Eastern Parade carrying on round the west end, facing back east.
  yard.box(STONE, [14, 0.2, 260], [-195, 0.05, 20]);
  terrace(
    yard,
    new THREE.Vector2(-210, -100),
    new THREE.Vector2(0, 1),
    240,
    Math.PI / 2,
    rand,
  );

  // Eastney, away behind the fort and facing back west across the park.
  terrace(
    yard,
    new THREE.Vector2(255, -85),
    new THREE.Vector2(0, 1),
    220,
    -Math.PI / 2,
    rand,
  );

  yard.build(scene);
}

/** Whether a point is inside a surround building (terraces, pier, pyramids). */
export function atSurroundBuilding(x: number, z: number): boolean {
  return hitsAny(x, z, surrounds);
}
