import * as THREE from "three";
import type { PlaceableId } from "../level/types";

export const PLACEABLE_LABELS: Record<PlaceableId, string> = {
  boathouse: "Boathouse",
  cafe: "Café",
  toilets: "Toilets",
  playPark: "Play park",
  roseGarden: "Rose garden",
};

export const PLACEABLE_IDS: PlaceableId[] = [
  "boathouse",
  "cafe",
  "toilets",
  "playPark",
  "roseGarden",
];

function mat(color: number, roughness = 0.85): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness });
}

function box(
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Lightweight stand-ins that match in-game massing for the editor preview. */
export function buildPreviewMesh(id: PlaceableId): THREE.Group {
  const group = new THREE.Group();
  switch (id) {
    case "boathouse": {
      const timber = mat(0x8b6914);
      const dark = mat(0x5c4510);
      const felt = mat(0x2a2a2a);
      const paint = mat(0xc94f3d);
      group.add(box(8, 2.8, 5, timber, 0, 1.4, 0));
      for (let y = 0.25; y < 2.7; y += 0.45) {
        group.add(box(8.12, 0.1, 5.12, dark, 0, y, 0));
      }
      group.add(box(3.2, 1.4, 0.2, felt, 0, 1.2, -2.55));
      group.add(box(5.5, 0.7, 0.16, paint, 0, 3.35, -2.35));
      const roofL = box(8.5, 0.12, 3.2, felt, 0, 3.2, -1.2);
      roofL.rotation.x = 0.4;
      group.add(roofL);
      const roofR = box(8.5, 0.12, 3.2, felt, 0, 3.2, 1.2);
      roofR.rotation.x = -0.4;
      group.add(roofR);
      break;
    }
    case "cafe": {
      const cream = mat(0xf0e6d2);
      const felt = mat(0x2a2a2a);
      const paint = mat(0xc94f3d);
      const white = mat(0xf5f5f0);
      const steel = mat(0x888890);
      group.add(box(9, 3, 6, cream, 0, 1.5, 0));
      group.add(box(9.8, 0.3, 6.8, felt, 0, 3.15, 0));
      group.add(box(4.4, 1.5, 0.25, felt, 0, 1.7, -3.05));
      for (let i = 0; i < 6; i++) {
        const strip = box(0.95, 0.08, 2.2, i % 2 ? white : paint, -2.4 + i * 0.96, 2.5, -4.1);
        strip.rotation.x = 0.18;
        group.add(strip);
      }
      for (const [tx, tz] of [
        [-3.2, -5.6],
        [0.4, -6.4],
        [3.6, -5.4],
      ] as const) {
        group.add(box(0.07, 2.4, 0.07, steel, tx, 1.2, tz));
        const parasol = new THREE.Mesh(
          new THREE.ConeGeometry(1.5, 0.5, 8),
          mat(0xc94f3d, 0.9),
        );
        parasol.position.set(tx, 2.4, tz);
        group.add(parasol);
      }
      break;
    }
    case "toilets": {
      const brick = mat(0x9a6b4f);
      const felt = mat(0x2a2a2a);
      const white = mat(0xf5f5f0);
      group.add(box(7, 2.8, 4.5, brick, 0, 1.4, 0));
      const roofL = box(7.5, 0.12, 2.8, felt, 0, 3.15, -1.0);
      roofL.rotation.x = 0.38;
      group.add(roofL);
      const roofR = box(7.5, 0.12, 2.8, felt, 0, 3.15, 1.0);
      roofR.rotation.x = -0.38;
      group.add(roofR);
      group.add(box(1.1, 2.1, 0.16, mat(0x3f6b9c), -1.8, 1.05, -2.3));
      group.add(box(1.1, 2.1, 0.16, mat(0x8b3a6b), 1.8, 1.05, -2.3));
      group.add(box(0.4, 0.4, 0.06, white, -1.8, 2.35, -2.3));
      group.add(box(0.4, 0.4, 0.06, white, 1.8, 2.35, -2.3));
      break;
    }
    case "playPark": {
      const rubber = mat(0xc94f3d);
      const paint = mat(0x3aa0b8);
      const steel = mat(0x888890);
      const surface = new THREE.Mesh(new THREE.PlaneGeometry(20, 16), rubber);
      surface.rotation.x = -Math.PI / 2;
      surface.position.y = 0.03;
      group.add(surface);
      group.add(box(20, 1, 0.12, paint, 0, 0.5, -8));
      group.add(box(20, 1, 0.12, paint, 0, 0.5, 8));
      group.add(box(0.12, 1, 16, paint, -10, 0.5, 0));
      group.add(box(0.12, 1, 16, paint, 10, 0.5, 0));
      group.add(box(9, 0.16, 0.16, steel, -4, 2.5, -2));
      group.add(box(0.16, 2.5, 0.16, steel, -8, 1.25, -2));
      group.add(box(0.16, 2.5, 0.16, steel, 0, 1.25, -2));
      const slide = box(1.2, 0.12, 5, mat(0xffd23a), 5, 1.2, 1);
      slide.rotation.x = 0.45;
      group.add(slide);
      break;
    }
    case "roseGarden": {
      const hedge = mat(0x2f5a33);
      const soil = mat(0x5a4433);
      const rose = mat(0xd8446a);
      for (const bx of [-5, 0, 5]) {
        group.add(box(4.2, 0.35, 6, soil, bx, 0.2, 0));
        group.add(box(4.6, 0.45, 6.4, hedge, bx, 0.25, 0));
        for (let i = 0; i < 6; i++) {
          const bush = new THREE.Mesh(new THREE.SphereGeometry(0.35, 7, 6), hedge);
          bush.position.set(bx + ((i % 3) - 1) * 1.1, 0.65, (Math.floor(i / 3) - 0.5) * 2.2);
          group.add(bush);
          const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), rose);
          bloom.position.copy(bush.position).add(new THREE.Vector3(0, 0.3, 0));
          group.add(bloom);
        }
      }
      break;
    }
  }

  // Facing marker: small arrow on −Z (water-facing front).
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.35, 1.1, 8),
    mat(0xffd23a, 0.5),
  );
  tip.rotation.x = Math.PI / 2;
  tip.position.set(0, 0.4, -getFrontZ(id) - 0.8);
  group.add(tip);

  return group;
}

function getFrontZ(id: PlaceableId): number {
  switch (id) {
    case "boathouse":
      return 2.5;
    case "cafe":
      return 3;
    case "toilets":
      return 2.25;
    case "playPark":
      return 8;
    case "roseGarden":
      return 3.2;
  }
}
