import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

function osmLocal(lat: number, lon: number) {
  const west = -1.17;
  const north = 50.835;
  const r = 6_371_000;
  const midLat = (50.76 + 50.835) / 2;
  const scaleX = (Math.PI / 180) * r * Math.cos((midLat * Math.PI) / 180);
  const scaleY = (Math.PI / 180) * r;
  return { x: (lon - west) * scaleX, y: (lat - north) * scaleY };
}

const WATER_Y = 0.06;

const FORTS = [
  { file: "fort-spitbank.glb", name: "Spitbank Fort", lat: 50.77028, lon: -1.09444, yaw: 0.4 },
  { file: "fort-horsesand.glb", name: "Horse Sand Fort", lat: 50.75028, lon: -1.0725, yaw: 0.15 },
  { file: "fort-nomans.glb", name: "No Man's Land Fort", lat: 50.7375, lon: -1.095, yaw: -0.2 },
  { file: "fort-sthelens.glb", name: "St Helens Fort", lat: 50.7074, lon: -1.0989, yaw: 0.6 },
] as const;

export async function addSeaForts(
  loader: GLTFLoader,
  mapScene: THREE.Object3D,
  labels: Array<{ kind: "road" | "building" | "area"; name: string; x: number; y: number; z: number }>,
): Promise<THREE.Group> {
  const group = new THREE.Group();
  group.name = "seaforts";
  const gltfs = await Promise.all(FORTS.map((f) => loader.loadAsync(`./models/${f.file}`)));
  FORTS.forEach((fort, i) => {
    const obj = gltfs[i].scene;
    obj.name = fort.name;
    const { x, y: z } = osmLocal(fort.lat, fort.lon);
    obj.position.set(x, WATER_Y, z);
    obj.rotation.y = fort.yaw;
    obj.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    const h = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3()).y;
    obj.userData.label = fort.name;
    labels.push({ kind: "building", name: fort.name, x, y: WATER_Y + h + 8, z });
    group.add(obj);
  });
  mapScene.add(group);
  return group;
}
