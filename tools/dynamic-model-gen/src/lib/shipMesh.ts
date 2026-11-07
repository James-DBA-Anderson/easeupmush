import * as THREE from "three";

/** Bow faces +Z, keel at y=0. Length along Z. */
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

function cyl(
  rTop: number,
  rBot: number,
  h: number,
  x: number,
  y: number,
  z: number,
  color: number,
  rotX = 0,
) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(rTop, rBot, h, 8),
    new THREE.MeshLambertMaterial({ color }),
  );
  mesh.position.set(x, y, z);
  mesh.rotation.x = rotX;
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

/** ~10 m leisure / workboat. */
export function buildBoat(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(2.4, 1.0, 8.2, 0, 0.55, 0, 0xc45c28));
  g.add(box(1.6, 0.9, 2.4, 0, 1.35, -0.6, 0xf2efe6));
  g.add(cyl(0.08, 0.08, 1.6, 0, 2.2, -1.4, 0x4a453c));
  return finish(g, "boat");
}

/** ~38 m harbour ferry (Gosport / FastCat). */
export function buildFerry(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(9.2, 2.6, 34, 0, 1.3, 0, 0xf4f1ea));
  g.add(box(8.6, 0.45, 33, 0, 2.7, 0, 0xe4572e));
  g.add(box(8.4, 2.2, 22, 0, 3.9, -2, 0xf7f4ee));
  g.add(box(7.2, 1.6, 6, 0, 5.5, 8, 0xe8f4fb));
  g.add(box(0.35, 1.1, 8, -4.7, 2.7, 6, 0xe4572e));
  g.add(box(0.35, 1.1, 8, 4.7, 2.7, 6, 0xe4572e));
  return finish(g, "ferry");
}

/** ~160 m Channel Ro-Ro. */
export function buildCargo(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(24, 8, 150, 0, 4.1, 0, 0x6d7178));
  g.add(box(22, 3.2, 148, 0, 9.4, 0, 0xb9c0c6));
  g.add(box(18, 14, 22, 0, 18, -52, 0xf3f0ea));
  g.add(box(16, 6, 10, 0, 28, -52, 0xd7e7f2));
  g.add(cyl(1.1, 1.3, 16, -5, 20, -40, 0xcfd4d8));
  g.add(cyl(1.1, 1.3, 16, 5, 20, -40, 0xcfd4d8));
  return finish(g, "cargo");
}

/** ~28 m Hovertravel skirted craft. */
export function buildHovercraft(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(12, 1.2, 24, 0, 0.9, 0, 0x2a2a28));
  g.add(box(10.5, 2.4, 16, 0, 2.6, -1, 0xf4f1ea));
  g.add(box(9.5, 0.4, 15, 0, 3.9, -1, 0xe4572e));
  g.add(box(6, 1.6, 5, 0, 4.8, 5, 0xd7e7f2));
  g.add(cyl(1.8, 1.8, 0.6, -3.2, 4.4, -7.5, 0x4a4a46, Math.PI / 2));
  g.add(cyl(1.8, 1.8, 0.6, 3.2, 4.4, -7.5, 0x4a4a46, Math.PI / 2));
  return finish(g, "hovercraft");
}

/** ~70 m wooden wall / ironclad stand-in. */
export function buildWarship(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(12, 5.5, 66, 0, 2.8, 0, 0x3b2a1a));
  g.add(box(11.2, 1.4, 64, 0, 5.9, 0, 0xc9a45c));
  g.add(box(10.4, 2.2, 62, 0, 7.6, 0, 0x2b2118));
  g.add(cyl(0.45, 0.55, 28, 0, 22, 12, 0x4a3a2a));
  g.add(cyl(0.4, 0.5, 32, 0, 24, 0, 0x4a3a2a));
  g.add(cyl(0.35, 0.45, 26, 0, 21, -14, 0x4a3a2a));
  g.add(box(18, 0.15, 6, 0, 18, 0, 0xf2efe6));
  g.add(box(16, 0.15, 5, 0, 16, -14, 0xf2efe6));
  return finish(g, "warship");
}

export const SHIP_LENGTH: Record<string, number> = {
  boat: 10,
  ferry: 38,
  cargo: 160,
  hovercraft: 28,
  warship: 70,
};
