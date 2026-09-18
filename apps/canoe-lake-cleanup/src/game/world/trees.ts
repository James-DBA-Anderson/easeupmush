import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TreeSpot } from '../../level/types';
import { hitsAny, type Footprint } from './collision';
import { surroundFootprints } from './buildings';
import { parkBuildingFootprints } from './park';
import { groundHeight } from './terrain';

/**
 * Park foliage comes only from the level editor / level JSON (trees, shrubs,
 * flower beds). An empty list means an empty park.
 */

/** How far south we look for a windbreak (metres). */
const WIND_FETCH = 52;
/** Sample step along the windward ray. */
const WIND_STEP = 3.2;
/**
 * Prevailing breeze off the Solent: from the south, a touch west of south —
 * trees lean inland (+Z) and slightly east (+X).
 */
const PREVAIL_LEAN_X = 0.28;
const PREVAIL_LEAN_Z = 0.85;

const BARK = new THREE.MeshStandardMaterial({ color: 0x4a4238, roughness: 1 });
const PLANE_BARK = new THREE.MeshStandardMaterial({ color: 0x9c9481, roughness: 0.95 });
/** Holm oak foliage is unusually dark, almost black against a bright sky. */
const HOLM_LEAF = new THREE.MeshStandardMaterial({ color: 0x27351d, roughness: 1, flatShading: true });
const PLANE_LEAF = new THREE.MeshStandardMaterial({ color: 0x4a6b2c, roughness: 1, flatShading: true });
const SCRUB_LEAF = new THREE.MeshStandardMaterial({ color: 0x6d7a54, roughness: 1, flatShading: true });

/** Seeded so the park is laid out the same way every time you load it. */
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

function meshFrom(parts: THREE.BufferGeometry[], material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(mergeGeometries(parts, false)!, material);
  mesh.castShadow = true;
  return mesh;
}

interface OakOptions {
  /** Overall size. Mature 1910 oaks are around 15m; younger infill is less. */
  scale: number;
  /** Direction the wind has pushed the crown, and how hard. */
  leanX: number;
  leanZ: number;
  rand: () => number;
}

/**
 * A holm oak: short thick bole dividing low into heavy limbs, carrying a dense
 * dome of very dark foliage that comes down almost to head height.
 */
export function buildHolmOak({ scale, leanX, leanZ, rand }: OakOptions): THREE.Group {
  const tree = new THREE.Group();
  const height = 15 * scale;
  const bole = height * 0.24;

  const wood: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.42 * scale, 0.7 * scale, bole, 7);
  trunk.translate(0, bole / 2, 0);
  wood.push(trunk);

  // Heavy limbs fanning out from the top of the bole into the crown.
  const limbs = 3 + Math.floor(rand() * 2);
  for (let i = 0; i < limbs; i++) {
    const angle = (i / limbs) * Math.PI * 2 + rand() * 0.7;
    const tilt = 0.5 + rand() * 0.45;
    const length = height * (0.34 + rand() * 0.16);
    const limb = new THREE.CylinderGeometry(0.16 * scale, 0.34 * scale, length, 6);
    limb.translate(0, length / 2, 0);
    limb.rotateZ(Math.sin(angle) * tilt);
    limb.rotateX(Math.cos(angle) * tilt);
    limb.translate(0, bole * 0.85, 0);
    wood.push(limb);
  }
  tree.add(meshFrom(wood, BARK));

  // Crown: overlapping lumps packed into a broad, slightly squashed dome.
  const spread = height * 0.46;
  const crownY = height * 0.6;
  const leaves: THREE.BufferGeometry[] = [];
  const blobs = 10 + Math.floor(rand() * 4);
  for (let i = 0; i < blobs; i++) {
    const angle = rand() * Math.PI * 2;
    const reach = Math.sqrt(rand()) * spread * 0.72;
    const size = spread * (0.36 + rand() * 0.2);
    const blob = new THREE.SphereGeometry(size, 7, 5);
    blob.scale(1, 0.85, 1);
    blob.translate(
      Math.cos(angle) * reach + leanX * reach * 0.5,
      crownY + (rand() - 0.42) * spread * 0.85,
      Math.sin(angle) * reach + leanZ * reach * 0.5,
    );
    leaves.push(blob);
  }

  // A skirt of lower foliage so the canopy hangs down over the limbs rather
  // than sitting on top of them like a parasol.
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + rand() * 0.9;
    const reach = spread * (0.5 + rand() * 0.25);
    const skirt = new THREE.SphereGeometry(spread * (0.3 + rand() * 0.12), 7, 5);
    skirt.scale(1, 0.7, 1);
    skirt.translate(
      Math.cos(angle) * reach + leanX * reach * 0.5,
      crownY - spread * (0.42 + rand() * 0.18),
      Math.sin(angle) * reach + leanZ * reach * 0.5,
    );
    leaves.push(skirt);
  }
  tree.add(meshFrom(leaves, HOLM_LEAF));

  // The whole tree leans away from the prevailing weather off the sea
  // (positive leanZ = inland / +Z; positive leanX = east).
  // +rotation.x tips the crown toward +Z; +rotation.z tips toward −X, so
  // east lean uses a negative Z rotation (same convention as updateTrees).
  tree.rotation.z = -leanX * 0.28;
  tree.rotation.x = leanZ * 0.28;
  return tree;
}

/** A taller, lighter deciduous tree for the gardens away from the water. */
export function buildPlane(scale: number, rand: () => number): THREE.Group {
  const tree = new THREE.Group();
  const height = 17 * scale;
  const bole = height * 0.42;

  const wood: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.34 * scale, 0.58 * scale, bole, 7);
  trunk.translate(0, bole / 2, 0);
  wood.push(trunk);

  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 + rand();
    const length = height * 0.3;
    const limb = new THREE.CylinderGeometry(0.14 * scale, 0.26 * scale, length, 5);
    limb.translate(0, length / 2, 0);
    limb.rotateZ(Math.sin(angle) * 0.4);
    limb.rotateX(Math.cos(angle) * 0.4);
    limb.translate(0, bole * 0.92, 0);
    wood.push(limb);
  }
  tree.add(meshFrom(wood, PLANE_BARK));

  const spread = height * 0.34;
  const leaves: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const angle = rand() * Math.PI * 2;
    const reach = Math.sqrt(rand()) * spread * 0.66;
    const blob = new THREE.SphereGeometry(spread * (0.42 + rand() * 0.22), 7, 5);
    blob.translate(
      Math.cos(angle) * reach,
      height * 0.72 + (rand() - 0.4) * spread * 0.7,
      Math.sin(angle) * reach,
    );
    leaves.push(blob);
  }
  tree.add(meshFrom(leaves, PLANE_LEAF));
  return tree;
}

/** Low salt-burnt scrub, the sort that survives on the seafront side. */
export function buildScrub(scale: number, rand: () => number): THREE.Group {
  const bush = new THREE.Group();
  const leaves: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const blob = new THREE.SphereGeometry(scale * (0.7 + rand() * 0.5), 6, 4);
    blob.scale(1.3, 0.6, 1.1);
    blob.translate((rand() - 0.5) * scale * 2, scale * (0.6 + rand() * 0.3), (rand() - 0.5) * scale * 1.6);
    leaves.push(blob);
  }
  bush.add(meshFrom(leaves, SCRUB_LEAF));
  return bush;
}

const SHRUB_LEAF = new THREE.MeshStandardMaterial({
  color: 0x2f5a33,
  roughness: 1,
  flatShading: true,
});
const BED_SOIL = new THREE.MeshStandardMaterial({ color: 0x5a4433, roughness: 1 });
const BED_KERB = new THREE.MeshStandardMaterial({ color: 0x6a6e62, roughness: 1 });
const BLOOM_PINK = new THREE.MeshStandardMaterial({ color: 0xd8446a, roughness: 0.8 });
const BLOOM_GOLD = new THREE.MeshStandardMaterial({ color: 0xe8c04a, roughness: 0.8 });
const BLOOM_WHITE = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.85 });
const BLOOM_LILAC = new THREE.MeshStandardMaterial({ color: 0xa878c4, roughness: 0.8 });

/** Tidy ornamental shrub — denser and greener than seafront scrub. */
export function buildShrub(scale: number, rand: () => number): THREE.Group {
  const shrub = new THREE.Group();
  const leaves: THREE.BufferGeometry[] = [];
  const blobs = 5 + Math.floor(rand() * 3);
  for (let i = 0; i < blobs; i++) {
    const size = scale * (0.55 + rand() * 0.4);
    const blob = new THREE.SphereGeometry(size, 7, 5);
    blob.scale(1.15, 0.85, 1.1);
    blob.translate(
      (rand() - 0.5) * scale * 1.4,
      scale * (0.55 + rand() * 0.45),
      (rand() - 0.5) * scale * 1.4,
    );
    leaves.push(blob);
  }
  shrub.add(meshFrom(leaves, SHRUB_LEAF));
  return shrub;
}

/** Raised soil bed with kerb and a scatter of blooms. */
export function buildFlowerBed(scale: number, rand: () => number): THREE.Group {
  const bed = new THREE.Group();
  const wide = 4.2 * scale;
  const deep = 2.6 * scale;

  const soil = new THREE.BoxGeometry(wide, 0.28, deep);
  soil.translate(0, 0.14, 0);
  bed.add(new THREE.Mesh(soil, BED_SOIL));

  const kerb = new THREE.BoxGeometry(wide + 0.35, 0.22, deep + 0.35);
  kerb.translate(0, 0.11, 0);
  bed.add(new THREE.Mesh(kerb, BED_KERB));

  const blooms = [BLOOM_PINK, BLOOM_GOLD, BLOOM_WHITE, BLOOM_LILAC];
  const count = 10 + Math.floor(rand() * 8);
  for (let i = 0; i < count; i++) {
    const paint = blooms[Math.floor(rand() * blooms.length)]!;
    const r = 0.1 + rand() * 0.12;
    const flower = new THREE.SphereGeometry(r, 6, 5);
    flower.translate(
      (rand() - 0.5) * wide * 0.78,
      0.32 + rand() * 0.18,
      (rand() - 0.5) * deep * 0.78,
    );
    bed.add(new THREE.Mesh(flower, paint));

    if (rand() > 0.45) {
      const leaf = new THREE.SphereGeometry(r * 1.4, 5, 4);
      leaf.scale(1, 0.4, 1);
      leaf.translate(
        (rand() - 0.5) * wide * 0.7,
        0.28,
        (rand() - 0.5) * deep * 0.7,
      );
      bed.add(new THREE.Mesh(leaf, SHRUB_LEAF));
    }
  }
  return bed;
}

/** Where the big trees ended up, for anything that needs to stand under one. */
const grown: THREE.Vector2[] = [];

/** Live canopy trees (holm / plane) — fire can climb these. */
export interface LiveTree {
  x: number;
  z: number;
  group: THREE.Group;
}

const liveCanopy: LiveTree[] = [];

/** Live plantings that tip with the breeze. */
interface SwayPlant {
  group: THREE.Group;
  /** Permanent lean (salt-blasted oaks etc) — sway adds on top. */
  baseX: number;
  baseZ: number;
  phase: number;
  rate: number;
  /** How much extra tip the wind can put on, in radians. */
  flex: number;
}

const swaying: SwayPlant[] = [];

/** Level-authored foliage from the editor / JSON. */
let parkTrees: TreeSpot[] = [];

export function applyTreeLayout(trees: ReadonlyArray<TreeSpot>): void {
  parkTrees = trees.map((t) => ({ ...t }));
}

export function treeSpots(): ReadonlyArray<THREE.Vector2> {
  return grown;
}

/** Holm oaks and planes still standing — grass fire can climb them. */
export function liveTrees(): ReadonlyArray<LiveTree> {
  return liveCanopy;
}

/**
 * Tip every planting with the park wind. Strength follows the breeze; each
 * tree keeps its own phase so the avenue doesn't flap in lockstep.
 */
export function updateTrees(time: number, wind: THREE.Vector2): void {
  const mag = Math.hypot(wind.x, wind.y);
  if (mag < 0.05) return;
  const nx = wind.x / mag;
  const nz = wind.y / mag;
  // A few m/s is a light breeze; Solent blows harder in the wet.
  const strength = Math.min(1.4, 0.4 + mag * 0.2);

  for (const plant of swaying) {
    const wave = Math.sin(time * plant.rate + plant.phase);
    const gust = Math.sin(time * 0.68 + plant.phase * 1.4);
    const flutter = Math.sin(time * plant.rate * 2.6 + plant.phase * 0.5);
    // Steady push downwind, plus a clear rock so the motion reads from the path.
    const lean = plant.flex * strength * 0.4;
    const rock =
      plant.flex * strength * (0.95 * wave + 0.4 * gust + 0.2 * flutter);
    plant.group.rotation.x = plant.baseX + nz * (lean + rock);
    plant.group.rotation.z = plant.baseZ - nx * (lean + rock);
  }
}

/** Plant only foliage authored in the level. Empty list → bare park. */
export function plantTrees(scene: THREE.Scene): void {
  const rand = seeded(1886);
  grown.length = 0;
  liveCanopy.length = 0;
  swaying.length = 0;

  const place = (
    tree: THREE.Group,
    x: number,
    z: number,
    opts: {
      hasBranches?: boolean;
      yaw?: number;
      sway?: boolean;
      canopy?: boolean;
    } = {},
  ): void => {
    const hasBranches = opts.hasBranches !== false;
    tree.position.set(x, groundHeight(x, z), z);
    tree.rotation.y =
      opts.yaw !== undefined ? opts.yaw : rand() * Math.PI * 2;
    scene.add(tree);
    if (hasBranches) grown.push(new THREE.Vector2(x, z));
    if (opts.canopy ?? hasBranches) {
      liveCanopy.push({ x, z, group: tree });
    }
    if (opts.sway === false) return;
    // Scrub bends more; mature oaks only nod. Slight per-tree rate so rows ripple.
    swaying.push({
      group: tree,
      baseX: tree.rotation.x,
      baseZ: tree.rotation.z,
      phase: rand() * Math.PI * 2,
      rate: hasBranches ? 0.45 + rand() * 0.55 : 0.85 + rand() * 0.9,
      flex: hasBranches ? 0.08 + rand() * 0.05 : 0.14 + rand() * 0.08,
    });
  };

  // Buildings must already be up so surround / park footprints can shield.
  const shields = windShields();

  for (const spot of parkTrees) {
    const lean = resolveLean(spot, parkTrees, shields, rand);
    if (spot.kind === "holm") {
      place(
        buildHolmOak({
          scale: spot.scale ?? 1,
          leanX: lean.x,
          leanZ: lean.z,
          rand,
        }),
        spot.x,
        spot.z,
      );
    } else if (spot.kind === "plane") {
      const tree = buildPlane(spot.scale ?? 0.9, rand);
      tipForWind(tree, lean.x * 0.75, lean.z * 0.75);
      place(tree, spot.x, spot.z);
    } else if (spot.kind === "shrub") {
      place(buildShrub(spot.scale ?? 1.1, rand), spot.x, spot.z, {
        hasBranches: false,
      });
    } else if (spot.kind === "flowerBed") {
      place(buildFlowerBed(spot.scale ?? 1, rand), spot.x, spot.z, {
        hasBranches: false,
        yaw: spot.yaw ?? 0,
        sway: false,
      });
    } else {
      const tree = buildScrub(spot.scale ?? 1.2, rand);
      tipForWind(tree, lean.x * 0.55, lean.z * 0.55);
      place(tree, spot.x, spot.z, { hasBranches: false });
    }
  }
}

/** Apply the same trunk tip holm oaks use for permanent wind lean. */
function tipForWind(tree: THREE.Group, leanX: number, leanZ: number): void {
  tree.rotation.z = -leanX * 0.28;
  tree.rotation.x = leanZ * 0.28;
}

function windShields(): Footprint[] {
  return [...surroundFootprints(), ...parkBuildingFootprints()];
}

/**
 * Authored lean wins; otherwise bake a south-wind lean scaled by how open the
 * fetch is toward the sea (−Z).
 */
function resolveLean(
  spot: TreeSpot,
  peers: ReadonlyArray<TreeSpot>,
  buildings: readonly Footprint[],
  rand: () => number,
): { x: number; z: number } {
  if (spot.leanX !== undefined || spot.leanZ !== undefined) {
    return { x: spot.leanX ?? 0, z: spot.leanZ ?? 0 };
  }
  if (spot.kind === "flowerBed" || spot.kind === "shrub") {
    return { x: 0, z: 0 };
  }
  const open = southFetchOpen(spot.x, spot.z, spot, peers, buildings);
  if (open < 0.12) return { x: 0, z: 0 };
  // A little per-tree scatter so an avenue doesn't all tip the same.
  const jitter = 0.85 + rand() * 0.3;
  return {
    x: PREVAIL_LEAN_X * open * jitter,
    z: PREVAIL_LEAN_Z * open * jitter,
  };
}

/**
 * 1 = clear fetch to the sea, 0 = fully sheltered by buildings or larger
 * plantings to the south.
 */
function southFetchOpen(
  x: number,
  z: number,
  self: TreeSpot,
  peers: ReadonlyArray<TreeSpot>,
  buildings: readonly Footprint[],
): number {
  let blocked = 0;
  let samples = 0;
  for (let d = WIND_STEP; d <= WIND_FETCH; d += WIND_STEP) {
    samples += 1;
    // Slight west-of-south sample so SW buildings count as windward.
    const sx = x - d * 0.12;
    const sz = z - d;
    if (hitsAny(sx, sz, buildings, 1.2)) {
      // Solid wall — shut the fetch down hard, nearer blocks more.
      blocked += 1.6 * (1 - d / (WIND_FETCH + 8));
      break;
    }
    for (const peer of peers) {
      if (peer === self) continue;
      if (peer.kind === "flowerBed" || peer.kind === "shrub") continue;
      const gap = Math.hypot(peer.x - sx, peer.z - sz);
      const canopy =
        peer.kind === "holm" || peer.kind === "plane"
          ? 5.2 * (peer.scale ?? 1)
          : 2.4 * (peer.scale ?? 1);
      if (gap > canopy) continue;
      const weight =
        peer.kind === "holm" || peer.kind === "plane" ? 0.7 : 0.35;
      blocked += weight * (1 - d / (WIND_FETCH + 8));
      break;
    }
  }
  if (samples === 0) return 1;
  return THREE.MathUtils.clamp(1 - blocked / 2.1, 0, 1);
}

