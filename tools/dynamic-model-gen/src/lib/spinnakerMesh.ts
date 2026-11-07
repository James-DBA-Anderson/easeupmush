import * as THREE from "three";

const WHITE = 0xf4f1e8;
const GLASS = 0x4f8b78;

function mat(color: number, extras?: THREE.MeshStandardMaterialParameters) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.78,
    metalness: 0.04,
    ...extras,
  });
}

function curve(pts: [number, number, number][]) {
  return new THREE.CatmullRomCurve3(
    pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    false,
    "catmullrom",
    0.12,
  );
}

function tube(
  path: THREE.CatmullRomCurve3,
  radius: number,
  tubular = 96,
  radial = 10,
  color = WHITE,
) {
  const mesh = new THREE.Mesh(
    new THREE.TubeGeometry(path, tubular, radius, radial, false),
    mat(color),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Real Spinnaker silhouette: two curves making a leaf, then a long needle. */
export function buildSpinnakerMesh(): THREE.Group {
  const root = new THREE.Group();
  root.name = "spinnaker";
  const white = mat(WHITE);
  const glass = mat(GLASS, {
    roughness: 0.18,
    metalness: 0.28,
    transparent: true,
    opacity: 0.62,
  });

  // Metres. Y-up. Bow (sail) in -X toward the harbour. Spine almost vertical.
  const bow = curve([
    [-3.4, 0.5, 0.25],
    [-8.5, 18, 0.15],
    [-16, 36, 0.05],
    [-24, 54, 0],
    [-29.5, 72, 0],
    [-29, 86, 0],
    [-22, 100, 0],
    [-10, 109, 0],
    [-1.5, 112.4, 0],
  ]);
  const spine = curve([
    [3.6, 0.5, -0.25],
    [3.3, 24, -0.12],
    [2.9, 52, 0],
    [2.4, 82, 0],
    [1.7, 104, 0],
    [1.2, 112.2, 0],
  ]);
  const needle = curve([
    [1.2, 111.8, 0],
    [0.95, 130, 0],
    [0.55, 150, 0],
    [0.22, 163, 0],
    [0.08, 170.5, 0],
  ]);

  root.add(tube(bow, 2.45, 128, 12));
  root.add(tube(spine, 2.25, 80, 12));
  root.add(tube(needle, 0.82, 56, 8));

  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.55, 8.5, 10), white);
  tip.position.set(0.08, 173.8, 0);
  tip.rotation.z = 0.04;
  tip.castShadow = true;
  root.add(tip);

  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(9.5, 10.5, 1.4, 24), white);
  plaza.position.y = 0.7;
  plaza.receiveShadow = true;
  root.add(plaza);

  const ribCount = 12;
  for (let i = 0; i < ribCount; i++) {
    const u = i / (ribCount - 1);
    const a = bow.getPointAt(0.12 + u * 0.82);
    const b = spine.getPointAt(0.12 + u * 0.84);
    const mid = a.clone().lerp(b, 0.5);
    const bulge = Math.sin(Math.PI * u) * 2.2;
    mid.x -= bulge * 0.15;
    mid.y += bulge * 0.12;
    const rib = curve([
      [a.x, a.y, a.z],
      [mid.x, mid.y, mid.z],
      [b.x, b.y, b.z],
    ]);
    root.add(tube(rib, 0.42, 18, 6));
  }

  const pod = new THREE.Mesh(new THREE.SphereGeometry(6.4, 22, 16), glass);
  pod.scale.set(1.25, 0.7, 1.12);
  pod.position.set(-2.2, 110.4, 0);
  pod.castShadow = true;
  root.add(pod);

  const lip = new THREE.Mesh(new THREE.TorusGeometry(5.4, 0.42, 8, 20), white);
  lip.position.copy(pod.position);
  lip.rotation.x = Math.PI / 2;
  lip.scale.set(1.15, 1.05, 0.7);
  root.add(lip);

  const deck = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.5, 1.1, 16), white);
  deck.position.set(-1.8, 106.6, 0);
  root.add(deck);

  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  return root;
}
