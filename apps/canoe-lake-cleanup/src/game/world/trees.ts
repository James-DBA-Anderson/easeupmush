import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PATH_OUTER, PATH_SPURS, distanceToShore, isInLake } from './lake';

/**
 * The planting round Canoe Lake, following the real park.
 *
 * The lake runs WSW-ENE with St Helens Parade along the north side (+Z) and
 * the Esplanade and the beach along the south (-Z). The rows of evergreen holm
 * oaks that frame the water were planted in 1910: one line parallel to St
 * Helens Parade, another along the southern boundary, and more wrapping the
 * rounded western end. The seaward side is salt-blasted and leans inland.
 * Nothing is planted at the water's edge itself, which is kept for bedding.
 */

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

  // The whole tree leans away from the prevailing weather off the sea.
  tree.rotation.z = -leanX * 0.22;
  tree.rotation.x = leanZ * 0.22;
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

/** Keeps planting off the paved spurs that run out from the lake. */
function onSpur(x: number, z: number): boolean {
  for (const [dx, dz] of PATH_SPURS) {
    const len = Math.hypot(dx, dz);
    const ux = dx / len;
    const uz = dz / len;
    const along = x * ux + z * uz;
    if (along <= 0) continue;
    if (Math.abs(x * -uz + z * ux) < 4.5) return true;
  }
  return false;
}

function plantable(x: number, z: number): boolean {
  if (isInLake(x, z)) return false;
  if (distanceToShore(x, z) < PATH_OUTER + 2.5) return false;
  return !onSpur(x, z);
}

/** Where the big trees ended up, for anything that needs to stand under one. */
const grown: THREE.Vector2[] = [];

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

export function treeSpots(): ReadonlyArray<THREE.Vector2> {
  return grown;
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

/** Lays out the park's trees as they stand round the real lake. */
export function plantTrees(scene: THREE.Scene): void {
  const rand = seeded(1886);
  grown.length = 0;
  swaying.length = 0;

  const place = (
    tree: THREE.Group,
    x: number,
    z: number,
    hasBranches = true,
  ): void => {
    tree.position.set(x, 0, z);
    tree.rotation.y = rand() * Math.PI * 2;
    scene.add(tree);
    if (hasBranches) grown.push(new THREE.Vector2(x, z));
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

  // The 1910 avenue along St Helens Parade: a formal, evenly spaced line of
  // big mature oaks, the ones you see behind the lake in every photograph.
  for (let x = -140; x <= 145; x += 12) {
    const z = 95 + (rand() - 0.5) * 3;
    if (!plantable(x, z)) continue;
    place(
      buildHolmOak({ scale: 1.05 + rand() * 0.25, leanX: 0, leanZ: 0.35, rand }),
      x + (rand() - 0.5) * 1.5,
      z,
    );
  }

  // The southern line, between the lake and the Esplanade. More exposed, so
  // they're smaller and pushed over inland by the wind off the Solent.
  for (let x = -125; x <= 135; x += 13) {
    const z = -88 - rand() * 4;
    if (!plantable(x, z)) continue;
    place(
      buildHolmOak({ scale: 0.8 + rand() * 0.25, leanX: 0, leanZ: 0.85, rand }),
      x + (rand() - 0.5) * 2,
      z,
    );
  }

  // Oaks wrapping the rounded western end, closing the view up that end.
  for (let i = 0; i < 11; i++) {
    const angle = Math.PI * (0.62 + (i / 10) * 0.76);
    const reach = 158 + rand() * 12;
    const x = Math.cos(angle) * reach;
    const z = Math.sin(angle) * reach * 0.62;
    if (!plantable(x, z)) continue;
    place(buildHolmOak({ scale: 0.9 + rand() * 0.3, leanX: 0.5, leanZ: 0, rand }), x, z);
  }

  // Rose garden planting inside the Lumps Fort walls at the eastern end.
  for (let i = 0; i < 9; i++) {
    const x = 158 + rand() * 36;
    const z = (rand() - 0.5) * 115;
    if (!plantable(x, z)) continue;
    place(buildPlane(0.75 + rand() * 0.35, rand), x, z);
  }

  // A looser second rank of deciduous trees set back behind the north avenue.
  for (let x = -130; x <= 130; x += 28) {
    const z = 108 + rand() * 10;
    if (!plantable(x, z)) continue;
    place(buildPlane(0.85 + rand() * 0.3, rand), x + (rand() - 0.5) * 8, z);
  }

  // Wind-burnt scrub scattered along the seafront edge.
  for (let x = -130; x <= 130; x += 10) {
    const z = -105 - rand() * 7;
    if (!plantable(x, z)) continue;
    place(buildScrub(1.1 + rand() * 0.8, rand), x + (rand() - 0.5) * 4, z, false);
  }
}
