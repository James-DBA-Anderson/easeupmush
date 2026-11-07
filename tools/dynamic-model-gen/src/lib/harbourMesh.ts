import * as THREE from "three";

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
) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(rTop, rBot, h, 8),
    new THREE.MeshLambertMaterial({ color }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cone(
  r: number,
  h: number,
  x: number,
  y: number,
  z: number,
  color: number,
) {
  const mesh = new THREE.Mesh(
    new THREE.ConeGeometry(r, h, 7),
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

/** Can / pillar buoy, ~2.4 m. Tint at runtime for lateral colours. */
export function buildBuoy(): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.62, 0.72, 1.35, 0, 0.85, 0, 0xd6b23a));
  g.add(cyl(0.18, 0.22, 0.7, 0, 1.72, 0, 0xd6b23a));
  g.add(cone(0.28, 0.42, 0, 2.22, 0, 0xf2efe6));
  g.add(cyl(0.04, 0.04, 0.7, 0, 2.55, 0, 0x4a453c));
  return finish(g, "harbour-buoy");
}

/** Pile beacon with a topmark, ~5.5 m. */
export function buildBeacon(): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.16, 0.2, 4.4, 0, 2.2, 0, 0xe8e4d8));
  g.add(box(0.7, 0.12, 0.7, 0, 4.45, 0, 0xc9c3b4));
  g.add(cone(0.32, 0.55, 0, 4.85, 0, 0xd6b23a));
  g.add(box(0.22, 0.22, 0.22, 0, 5.22, 0, 0xf4e27a));
  return finish(g, "harbour-beacon");
}

/** Minor light / lantern post, ~7 m. */
export function buildLight(): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.28, 0.34, 5.6, 0, 2.8, 0, 0xe8e4d8));
  g.add(box(1.05, 0.12, 1.05, 0, 5.65, 0, 0xc9c3b4));
  g.add(box(0.55, 0.7, 0.55, 0, 6.1, 0, 0xf4e27a));
  g.add(cyl(0.08, 0.1, 0.55, 0, 6.6, 0, 0x4a453c));
  return finish(g, "harbour-light");
}

/** Quay bollard / pile mooring. */
export function buildBollard(): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.22, 0.26, 0.95, 0, 0.48, 0, 0x6a6560));
  g.add(cyl(0.28, 0.28, 0.16, 0, 0.98, 0, 0x4a453c));
  return finish(g, "harbour-bollard");
}
