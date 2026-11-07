import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type MarkKind = "buoy" | "beacon" | "light" | "mooring";
type MarkColour = "red" | "green" | "yellow" | "white";
type HarbourData = {
  marks: Array<{ x: number; z: number; kind: MarkKind; colour: MarkColour; name?: string }>;
};

const MARK_HEX: Record<MarkColour, number> = {
  red: 0xc43b3b,
  green: 0x2f8a4a,
  yellow: 0xd6b23a,
  white: 0xe8e4d8,
};

function tint(root: THREE.Object3D, hex: number) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.material as THREE.MeshLambertMaterial | THREE.MeshStandardMaterial;
    const mat = src.clone();
    mat.color.setHex(hex);
    mesh.material = mat;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
}

export async function addHarbourKit(
  loader: GLTFLoader,
  mapScene: THREE.Object3D,
  sampleGround: (x: number, z: number) => number | null,
  labels: Array<{ kind: "road" | "building" | "area"; name: string; x: number; y: number; z: number }>,
): Promise<THREE.Group> {
  const group = new THREE.Group();
  group.name = "harbour-kit";
  const [data, buoyG, beaconG, lightG, bollardG] = await Promise.all([
    fetch("./models/portsmouth-harbour.json?v=1").then((r) => {
      if (!r.ok) throw new Error(`harbour json ${r.status}`);
      return r.json() as Promise<HarbourData>;
    }),
    loader.loadAsync("./models/harbour-buoy.glb"),
    loader.loadAsync("./models/harbour-beacon.glb"),
    loader.loadAsync("./models/harbour-light.glb"),
    loader.loadAsync("./models/harbour-bollard.glb"),
  ]);
  const proto: Record<MarkKind, THREE.Object3D> = {
    buoy: buoyG.scene,
    beacon: beaconG.scene,
    light: lightG.scene,
    mooring: bollardG.scene,
  };

  for (const mark of data.marks ?? []) {
    const src = proto[mark.kind] ?? proto.beacon;
    const obj = src.clone(true);
    tint(obj, MARK_HEX[mark.colour] ?? MARK_HEX.white);
    const probe = new THREE.Vector3(mark.x, 40, mark.z);
    mapScene.localToWorld(probe);
    const ground = sampleGround(probe.x, probe.z);
    const at = new THREE.Vector3(mark.x, mark.kind === "buoy" ? 0.28 : 0.12, mark.z);
    if (ground !== null) {
      const y = mark.kind === "buoy" ? Math.max(0.22, ground) : ground;
      at.set(probe.x, y, probe.z);
      mapScene.worldToLocal(at);
    }
    obj.position.copy(at);
    if (mark.name) {
      obj.userData.label = mark.name;
      labels.push({ kind: "building", name: mark.name, x: at.x, y: at.y + 8, z: at.z });
    }
    group.add(obj);
  }

  mapScene.add(group);
  return group;
}
