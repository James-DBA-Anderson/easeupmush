import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export type BarrierKind = "bollard" | "gate" | "cycle" | "lift";
type BarrierKit = { x: number; z: number; y?: number; kind: BarrierKind; heading?: number };
type BarrierData = { kits: BarrierKit[] };

const CELL = 90;

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
  kits: BarrierKit[],
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
    dummy.position.set(k.x, k.y ?? 0, k.z);
    dummy.rotation.set(0, k.heading ?? 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    cx += k.x;
    cz += k.z;
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.userData.cellX = cx / kits.length;
  mesh.userData.cellZ = cz / kits.length;
  return mesh;
}

export async function addBarrierKit(
  loader: GLTFLoader,
  mapScene: THREE.Object3D,
): Promise<THREE.Group> {
  const group = new THREE.Group();
  group.name = "barrier-kit";
  const [data, bollardG, gateG, cycleG, liftG] = await Promise.all([
    fetch("./models/portsmouth-barriers.json?v=1").then((r) => {
      if (!r.ok) throw new Error(`barriers json ${r.status}`);
      return r.json() as Promise<BarrierData>;
    }),
    loader.loadAsync("./models/barrier-bollard.glb"),
    loader.loadAsync("./models/barrier-gate.glb"),
    loader.loadAsync("./models/barrier-cycle.glb"),
    loader.loadAsync("./models/barrier-lift.glb"),
  ]);
  const proto: Record<BarrierKind, THREE.Mesh | null> = {
    bollard: firstMesh(bollardG.scene),
    gate: firstMesh(gateG.scene),
    cycle: firstMesh(cycleG.scene),
    lift: firstMesh(liftG.scene),
  };
  const bins = new Map<string, Record<BarrierKind, BarrierKit[]>>();
  for (const kit of data.kits ?? []) {
    if (!proto[kit.kind]) continue;
    const key = `${Math.floor(kit.x / CELL)},${Math.floor(kit.z / CELL)}`;
    let bin = bins.get(key);
    if (!bin) {
      bin = { bollard: [], gate: [], cycle: [], lift: [] };
      bins.set(key, bin);
    }
    bin[kit.kind].push(kit);
  }
  for (const [key, byKind] of bins) {
    for (const kind of ["bollard", "gate", "cycle", "lift"] as const) {
      const src = proto[kind];
      if (!src) continue;
      const mesh = instanceCell(`barrier-${kind}-${key}`, src, byKind[kind]);
      if (mesh) group.add(mesh);
    }
  }
  mapScene.add(group);
  return group;
}
