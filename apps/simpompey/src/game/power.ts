import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type PowerKind = "solar" | "kiosk" | "transformer";
type PowerKit = { x: number; z: number; y?: number; kind: PowerKind; heading?: number; name?: string };
type PowerData = { kits: PowerKit[] };

function firstMesh(root: THREE.Object3D): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!found && mesh.isMesh) found = mesh;
  });
  return found;
}

function instanceKits(
  name: string,
  proto: THREE.Mesh,
  kits: PowerKit[],
  mapScene: THREE.Object3D,
  sampleGround: (x: number, z: number) => number | null,
  labels: Array<{ kind: "road" | "building" | "area"; name: string; x: number; y: number; z: number }>,
): THREE.InstancedMesh | null {
  if (kits.length === 0) return null;
  const dummy = new THREE.Object3D();
  const placed: Array<{ at: THREE.Vector3; heading: number; name?: string }> = [];
  for (const kit of kits) {
    const local = new THREE.Vector3(kit.x, kit.y ?? 0, kit.z);
    if (kit.y === undefined) {
      const probe = new THREE.Vector3(kit.x, 40, kit.z);
      mapScene.localToWorld(probe);
      const ground = sampleGround(probe.x, probe.z);
      if (ground === null) continue;
      local.set(probe.x, ground, probe.z);
      mapScene.worldToLocal(local);
    }
    placed.push({ at: local, heading: kit.heading ?? 0, name: kit.name });
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
  mesh.name = `power-${name}`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = true;
  for (let i = 0; i < placed.length; i++) {
    const p = placed[i];
    dummy.position.copy(p.at);
    dummy.rotation.set(0, p.heading, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (p.name) {
      labels.push({ kind: "building", name: p.name, x: p.at.x, y: p.at.y + 6, z: p.at.z });
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

export async function addPowerKit(
  loader: GLTFLoader,
  mapScene: THREE.Object3D,
  sampleGround: (x: number, z: number) => number | null,
  labels: Array<{ kind: "road" | "building" | "area"; name: string; x: number; y: number; z: number }>,
): Promise<THREE.Group> {
  const group = new THREE.Group();
  group.name = "power-kit";
  const [data, solarG, kioskG, transformerG] = await Promise.all([
    fetch("./models/portsmouth-power.json?v=3").then((r) => {
      if (!r.ok) throw new Error(`power json ${r.status}`);
      return r.json() as Promise<PowerData>;
    }),
    loader.loadAsync("./models/power-solar.glb"),
    loader.loadAsync("./models/power-kiosk.glb"),
    loader.loadAsync("./models/power-transformer.glb"),
  ]);

  const proto: Record<PowerKind, THREE.Mesh | null> = {
    solar: firstMesh(solarG.scene),
    kiosk: firstMesh(kioskG.scene),
    transformer: firstMesh(transformerG.scene),
  };
  const byKind: Record<PowerKind, PowerKit[]> = { solar: [], kiosk: [], transformer: [] };
  for (const kit of data.kits ?? []) {
    if (byKind[kit.kind]) byKind[kit.kind].push(kit);
  }
  for (const kind of ["solar", "kiosk", "transformer"] as const) {
    const src = proto[kind];
    if (!src) continue;
    const mesh = instanceKits(kind, src, byKind[kind], mapScene, sampleGround, labels);
    if (mesh) group.add(mesh);
  }
  mapScene.add(group);
  return group;
}
