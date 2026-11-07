import * as THREE from "three";

/** Nose faces +Z, wheels on y=0. Length along Z. */
function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  color: number,
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function finish(root: THREE.Group, name: string) {
  root.name = name;
  root.updateMatrixWorld(true);
  const box3 = new THREE.Box3().setFromObject(root);
  root.position.y -= box3.min.y;
  root.updateMatrixWorld(true);
  return root;
}

type Livery = {
  body: number;
  stripe: number;
  roof: number;
  window: number;
  door: number;
};

const LIVERIES: Record<"swr" | "southern" | "gwr", Livery> = {
  swr: { body: 0xc31230, stripe: 0xf4f1ea, roof: 0x5c6166, window: 0x1b2834, door: 0x3a3e44 },
  southern: { body: 0x2f6b3c, stripe: 0xe8e4d8, roof: 0x4e5558, window: 0x1b2834, door: 0xd9d4c6 },
  gwr: { body: 0x0c3d30, stripe: 0xc4a35a, roof: 0x3f4548, window: 0x1b2834, door: 0x1a1a1a },
};

function addCar(g: THREE.Group, z: number, livery: Livery, nose: boolean) {
  g.add(box(2.72, 3.15, 19.2, 0, 1.85, z, livery.body));
  g.add(box(2.78, 0.22, 19.2, 0, 3.52, z, livery.roof));
  g.add(box(2.74, 0.18, 19.0, 0, 2.55, z, livery.stripe));
  g.add(box(2.6, 1.05, 14.5, 0, 2.55, z, livery.window));
  g.add(box(0.12, 2.1, 0.9, -1.38, 1.7, z - 4.2, livery.door));
  g.add(box(0.12, 2.1, 0.9, 1.38, 1.7, z - 4.2, livery.door));
  g.add(box(0.12, 2.1, 0.9, -1.38, 1.7, z + 4.2, livery.door));
  g.add(box(0.12, 2.1, 0.9, 1.38, 1.7, z + 4.2, livery.door));
  g.add(box(2.5, 0.35, 18.6, 0, 0.22, z, 0x2a2a2a));
  if (nose) {
    g.add(box(2.7, 2.4, 0.28, 0, 1.7, z + 9.72, 0xf5d000));
    g.add(box(0.35, 0.28, 0.2, -0.7, 1.15, z + 9.88, 0xf4f1ea));
    g.add(box(0.35, 0.28, 0.2, 0.7, 1.15, z + 9.88, 0xf4f1ea));
  }
}

/** ~60 m 3-car EMU. Nose +Z. */
export function buildEmu(kind: "swr" | "southern" | "gwr"): THREE.Group {
  const g = new THREE.Group();
  const livery = LIVERIES[kind];
  addCar(g, -20.4, livery, false);
  addCar(g, 0, livery, false);
  addCar(g, 20.4, livery, true);
  g.add(box(0.08, 1.6, 0.08, -0.7, 4.4, 0, 0x222226));
  g.add(box(0.08, 1.6, 0.08, 0.7, 4.4, 0, 0x222226));
  g.add(box(1.4, 0.08, 0.08, 0, 5.18, 0, 0x222226));
  return finish(g, `train-${kind}`);
}
