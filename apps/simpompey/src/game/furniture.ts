import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export type FurnitureKind = "bench" | "bin" | "postbox" | "phone" | "rack" | "bus" | "signal" | "table" | "pub" | "memorial";
type FurnitureKit = { x: number; z: number; y?: number; kind: FurnitureKind; heading?: number };
type FurnitureData = { kits: FurnitureKit[] };

const CELL = 90;
const KINDS: FurnitureKind[] = ["bench", "bin", "postbox", "phone", "rack", "bus", "signal", "table", "pub", "memorial"];

function firstMesh(root: THREE.Object3D): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!found && mesh.isMesh) found = mesh;
  });
  return found;
}

function instanceCell(
  name: string,
  proto: THREE.Mesh,
  kits: Array<{ at: THREE.Vector3; heading: number }>,
): THREE.InstancedMesh | null {
  if (kits.length === 0) return null;
  const dummy = new THREE.Object3D();
  const srcMat = proto.material as THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;
  const hasColors = Boolean(proto.geometry.getAttribute("color"));
  const mat = new THREE.MeshLambertMaterial({
    color: hasColors ? 0xffffff : srcMat.color,
    vertexColors: hasColors,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(proto.geometry, mat, kits.length);
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.frustumCulled = true;
  mesh.visible = false;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < kits.length; i++) {
    const k = kits[i];
    dummy.position.copy(k.at);
    dummy.rotation.set(0, k.heading, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    cx += k.at.x;
    cz += k.at.z;
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.userData.cellX = cx / kits.length;
  mesh.userData.cellZ = cz / kits.length;
  return mesh;
}

function drapeOffRoad(
  mapScene: THREE.Object3D,
  sampleGround: (x: number, z: number) => number | null,
  onCarriage: (x: number, z: number) => boolean,
  x: number,
  z: number,
): THREE.Vector3 | null {
  const tryAt = (lx: number, lz: number) => {
    const probe = new THREE.Vector3(lx, 40, lz);
    mapScene.localToWorld(probe);
    const ground = sampleGround(probe.x, probe.z);
    if (ground === null || onCarriage(probe.x, probe.z)) return null;
    const at = new THREE.Vector3(probe.x, ground, probe.z);
    mapScene.worldToLocal(at);
    return at;
  };
  const here = tryAt(x, z);
  if (here) return here;
  const dirs = 12;
  for (const dist of [2.4, 4, 5.5, 7.5, 10]) {
    for (let i = 0; i < dirs; i++) {
      const a = (i / dirs) * Math.PI * 2;
      const at = tryAt(x + Math.cos(a) * dist, z + Math.sin(a) * dist);
      if (at) return at;
    }
  }
  return null;
}

export async function addFurnitureKit(
  loader: GLTFLoader,
  mapScene: THREE.Object3D,
  sampleGround: (x: number, z: number) => number | null,
  onCarriage: (x: number, z: number) => boolean,
): Promise<THREE.Group> {
  const group = new THREE.Group();
  group.name = "furniture-kit";
  const [data, ...gltfs] = await Promise.all([
    fetch("./models/portsmouth-furniture.json?v=noroad1").then((r) => {
      if (!r.ok) throw new Error(`furniture json ${r.status}`);
      return r.json() as Promise<FurnitureData>;
    }),
    ...KINDS.map((kind) => loader.loadAsync(`./models/furniture-${kind}.glb`)),
  ]);
  const proto: Record<FurnitureKind, THREE.Mesh | null> = {
    bench: null, bin: null, postbox: null, phone: null, rack: null, bus: null, signal: null, table: null, pub: null, memorial: null,
  };
  KINDS.forEach((kind, i) => {
    proto[kind] = firstMesh(gltfs[i].scene);
  });

  const bins = new Map<string, Record<FurnitureKind, Array<{ at: THREE.Vector3; heading: number }>>>();
  for (const kit of data.kits ?? []) {
    if (!proto[kit.kind]) continue;
    const at = drapeOffRoad(mapScene, sampleGround, onCarriage, kit.x, kit.z);
    if (!at) continue;
    const key = `${Math.floor(kit.x / CELL)},${Math.floor(kit.z / CELL)}`;
    let bin = bins.get(key);
    if (!bin) {
      bin = { bench: [], bin: [], postbox: [], phone: [], rack: [], bus: [], signal: [], table: [], pub: [], memorial: [] };
      bins.set(key, bin);
    }
    bin[kit.kind].push({ at, heading: kit.heading ?? 0 });
  }
  for (const [key, byKind] of bins) {
    for (const kind of KINDS) {
      const src = proto[kind];
      if (!src) continue;
      const mesh = instanceCell(`furniture-${kind}-${key}`, src, byKind[kind]);
      if (mesh) group.add(mesh);
    }
  }
  mapScene.add(group);
  return group;
}
