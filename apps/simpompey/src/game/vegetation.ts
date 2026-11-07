import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type TreeKind = "broadleaf" | "pine";
type TreePoint = { x: number; z: number; h: number; kind: TreeKind };
type CoverKind = "railway" | "paved" | "sand" | "allotment" | "courtyard" | "grass" | "garden" | "park" | "wood";
type VegetationData = {
  trees: TreePoint[];
  cover: Partial<Record<CoverKind, number[]>>;
};

const PROTO_HEIGHT: Record<TreeKind, number> = { broadleaf: 6.5, pine: 7.6 };
const COVER_COLOUR: Record<CoverKind, number> = {
  railway: 0xddd4c6,
  paved: 0x6a6964,
  sand: 0xc9c2b4,
  allotment: 0x7a7a48,
  courtyard: 0xc2bdb0,
  grass: 0x6eaa5c,
  garden: 0x74b05a,
  park: 0x5f9a55,
  wood: 0x5a8a4e,
};
const COVER_LIFT: Record<CoverKind, number> = {
  railway: 0.55,
  paved: 0.18,
  sand: 0.22,
  allotment: 0.26,
  courtyard: 0.28,
  grass: 0.34,
  garden: 0.38,
  park: 0.42,
  wood: 0.46,
};
const COVER_ORDER: CoverKind[] = ["paved", "sand", "allotment", "courtyard", "grass", "garden", "park", "wood", "railway"];

function firstMesh(root: THREE.Object3D): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!found && mesh.isMesh) found = mesh;
  });
  return found;
}

function hash01(x: number, z: number): number {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function drape(
  mapScene: THREE.Object3D,
  sampleGround: (x: number, z: number) => number | null,
  x: number,
  z: number,
  lift = 0,
): THREE.Vector3 | null {
  const probe = new THREE.Vector3(x, 40, z);
  mapScene.localToWorld(probe);
  const ground = sampleGround(probe.x, probe.z);
  if (ground === null) return null;
  const at = new THREE.Vector3(probe.x, ground + lift, probe.z);
  mapScene.worldToLocal(at);
  return at;
}

function tessellateCover(xz: number[], maxEdge = 48): number[] {
  const queue: number[][] = [];
  for (let i = 0; i + 5 < xz.length; i += 6) queue.push(xz.slice(i, i + 6));
  const out: number[] = [];
  while (queue.length) {
    const t = queue.pop()!;
    const [ax, az, bx, bz, cx, cz] = t;
    const ab = Math.hypot(bx - ax, bz - az);
    const bc = Math.hypot(cx - bx, cz - bz);
    const ca = Math.hypot(ax - cx, az - cz);
    const longest = Math.max(ab, bc, ca);
    if (longest <= maxEdge || queue.length > 80_000) {
      out.push(ax, az, bx, bz, cx, cz);
      continue;
    }
    if (ab >= bc && ab >= ca) {
      const mx = (ax + bx) * 0.5;
      const mz = (az + bz) * 0.5;
      queue.push([ax, az, mx, mz, cx, cz], [mx, mz, bx, bz, cx, cz]);
    } else if (bc >= ca) {
      const mx = (bx + cx) * 0.5;
      const mz = (bz + cz) * 0.5;
      queue.push([ax, az, bx, bz, mx, mz], [ax, az, mx, mz, cx, cz]);
    } else {
      const mx = (cx + ax) * 0.5;
      const mz = (cz + az) * 0.5;
      queue.push([ax, az, bx, bz, mx, mz], [mx, mz, bx, bz, cx, cz]);
    }
  }
  return out;
}

function coverMesh(
  kind: CoverKind,
  xz: number[],
  mapScene: THREE.Object3D,
  sampleGround: (x: number, z: number) => number | null,
): THREE.Mesh | null {
  if (xz.length < 6) return null;
  const lift = COVER_LIFT[kind];
  const pos: number[] = [];
  const col: number[] = [];
  const sand = kind === "sand";
  const draped = tessellateCover(xz);
  for (let i = 0; i + 5 < draped.length; i += 6) {
    const pts = [
      drape(mapScene, sampleGround, draped[i], draped[i + 1], lift),
      drape(mapScene, sampleGround, draped[i + 2], draped[i + 3], lift),
      drape(mapScene, sampleGround, draped[i + 4], draped[i + 5], lift),
    ];
    const good = pts.filter((p): p is THREE.Vector3 => p !== null);
    if (good.length === 0) continue;
    if (good.length < 3) {
      const y = good.reduce((s, p) => s + p.y, 0) / good.length;
      if (!pts[0]) pts[0] = new THREE.Vector3(draped[i], y, draped[i + 1]);
      if (!pts[1]) pts[1] = new THREE.Vector3(draped[i + 2], y, draped[i + 3]);
      if (!pts[2]) pts[2] = new THREE.Vector3(draped[i + 4], y, draped[i + 5]);
    }
    const [a, b, c] = pts as THREE.Vector3[];
    const lo = Math.min(a.y, b.y, c.y);
    const hi = Math.max(a.y, b.y, c.y);
    if (hi - lo > 40) continue;
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    if (sand) {
      for (const p of [a, b, c]) {
        const n = (hash01(p.x, p.z) - 0.5) * 0.08;
        // Flint shingle — pale grey / cream pebbles, not dune sand.
        col.push(0.82 + n, 0.80 + n, 0.74 + n * 0.6);
      }
    }
  }
  if (pos.length < 9) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const norms = new Float32Array(pos.length);
  for (let i = 1; i < norms.length; i += 3) norms[i] = 1;
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(norms, 3));
  if (sand) geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const layer = COVER_ORDER.indexOf(kind) + 1;
  const mat = new THREE.MeshLambertMaterial({
    color: sand ? 0xffffff : COVER_COLOUR[kind],
    vertexColors: sand,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -(layer + 2) * 4,
    polygonOffsetUnits: -(layer + 2) * 4,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `cover-${kind}`;
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  return mesh;
}

function instanceTrees(
  kind: TreeKind,
  proto: THREE.Mesh,
  points: TreePoint[],
  mapScene: THREE.Object3D,
  sampleGround: (x: number, z: number) => number | null,
): THREE.InstancedMesh | null {
  if (points.length === 0) return null;
  const dummy = new THREE.Object3D();
  const placed: Array<{ at: THREE.Vector3; h: number; rot: number }> = [];
  for (const t of points) {
    const at = drape(mapScene, sampleGround, t.x, t.z);
    if (!at) continue;
    placed.push({ at, h: t.h, rot: hash01(t.x, t.z) * Math.PI * 2 });
  }
  if (placed.length === 0) return null;

  const srcMat = proto.material as THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;
  const hasColors = Boolean(proto.geometry.getAttribute("color"));
  const mat = new THREE.MeshLambertMaterial({
    color: hasColors ? 0xffffff : srcMat.color,
    vertexColors: hasColors,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(proto.geometry, mat, placed.length);
  mesh.name = `trees-${kind}`;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  const protoH = PROTO_HEIGHT[kind];
  for (let i = 0; i < placed.length; i++) {
    const p = placed[i];
    dummy.position.copy(p.at);
    dummy.rotation.set(0, p.rot, 0);
    dummy.scale.setScalar(Math.max(0.35, p.h / protoH));
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

export async function addVegetation(
  loader: GLTFLoader,
  mapScene: THREE.Object3D,
  sampleGround: (x: number, z: number) => number | null,
): Promise<{ trees: THREE.Group; cover: THREE.Group }> {
  const trees = new THREE.Group();
  trees.name = "vegetation";
  const cover = new THREE.Group();
  cover.name = "ground-cover";
  const [data, broadleafGltf, pineGltf] = await Promise.all([
    fetch("./models/portsmouth-trees.json?v=rail1").then((r) => {
      if (!r.ok) throw new Error(`trees json ${r.status}`);
      return r.json() as Promise<VegetationData>;
    }),
    loader.loadAsync("./models/tree-broadleaf.glb"),
    loader.loadAsync("./models/tree-pine.glb"),
  ]);

  for (const kind of COVER_ORDER) {
    const mesh = coverMesh(kind, data.cover?.[kind] ?? [], mapScene, sampleGround);
    if (mesh) cover.add(mesh);
  }
  const broadleaf = firstMesh(broadleafGltf.scene);
  const pine = firstMesh(pineGltf.scene);
  const byKind = { broadleaf: data.trees.filter((t) => t.kind !== "pine"), pine: data.trees.filter((t) => t.kind === "pine") };
  if (broadleaf) {
    const mesh = instanceTrees("broadleaf", broadleaf, byKind.broadleaf, mapScene, sampleGround);
    if (mesh) trees.add(mesh);
  }
  if (pine) {
    const mesh = instanceTrees("pine", pine, byKind.pine, mapScene, sampleGround);
    if (mesh) trees.add(mesh);
  }
  mapScene.add(cover);
  mapScene.add(trees);
  return { trees, cover };
}
