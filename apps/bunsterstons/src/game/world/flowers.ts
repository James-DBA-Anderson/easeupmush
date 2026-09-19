import * as THREE from "three";

export type FlowerSpot = {
  x: number;
  z: number;
  kind: "daisy" | "bright";
  s?: number;
};

const stemMat = new THREE.MeshStandardMaterial({
  color: 0x2f8f3a,
  roughness: 0.85,
});
const daisyPetal = new THREE.MeshStandardMaterial({
  color: 0xfff8ef,
  roughness: 0.55,
});
const daisyCentre = new THREE.MeshStandardMaterial({
  color: 0xffd23a,
  roughness: 0.45,
  emissive: 0xffaa00,
  emissiveIntensity: 0.15,
});
const brightPetals = [
  new THREE.MeshStandardMaterial({ color: 0xff4d8a, roughness: 0.5 }),
  new THREE.MeshStandardMaterial({ color: 0xff8a2b, roughness: 0.5 }),
  new THREE.MeshStandardMaterial({ color: 0xb44dff, roughness: 0.5 }),
  new THREE.MeshStandardMaterial({ color: 0xff5c5c, roughness: 0.5 }),
  new THREE.MeshStandardMaterial({ color: 0x4dcfff, roughness: 0.5 }),
];

/** Scatter daisies and bright blooms onto a level root (decoration only). */
export function addFlowers(
  root: THREE.Group,
  spots: readonly FlowerSpot[],
): void {
  let brightI = 0;
  for (const spot of spots) {
    const scale = spot.s ?? 1;
    if (spot.kind === "daisy") {
      root.add(makeFlower(spot.x, spot.z, scale, daisyPetal, daisyCentre, 8));
    } else {
      const petal = brightPetals[brightI % brightPetals.length]!;
      brightI += 1;
      root.add(makeFlower(spot.x, spot.z, scale, petal, daisyCentre, 6));
    }
  }
}

function makeFlower(
  x: number,
  z: number,
  scale: number,
  petalMat: THREE.MeshStandardMaterial,
  centreMat: THREE.MeshStandardMaterial,
  petals: number,
): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = (x * 1.7 + z * 2.3) % (Math.PI * 2);
  g.scale.setScalar(scale);

  const stemH = 0.28 + (Math.abs(x) % 5) * 0.02;
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.025, stemH, 5),
    stemMat,
  );
  stem.position.y = stemH * 0.5;
  stem.castShadow = true;
  g.add(stem);

  const head = new THREE.Group();
  head.position.y = stemH + 0.02;
  g.add(head);

  const centre = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 10, 8),
    centreMat,
  );
  centre.scale.set(1, 0.7, 1);
  centre.castShadow = true;
  head.add(centre);

  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    const petal = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 6),
      petalMat,
    );
    petal.scale.set(0.55, 0.28, 0.95);
    petal.position.set(Math.cos(a) * 0.11, 0.01, Math.sin(a) * 0.11);
    petal.lookAt(0, 0.4, 0);
    petal.castShadow = true;
    head.add(petal);
  }

  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), stemMat);
  leaf.scale.set(1.4, 0.25, 0.7);
  leaf.position.set(0.06, stemH * 0.45, 0);
  leaf.rotation.z = -0.6;
  g.add(leaf);

  return g;
}
