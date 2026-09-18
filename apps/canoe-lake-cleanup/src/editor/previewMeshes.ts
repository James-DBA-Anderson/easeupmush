import * as THREE from "three";
import type { PlaceableId } from "../level/types";

export const PLACEABLE_LABELS: Record<PlaceableId, string> = {
  boathouse: "Boathouse",
  cafe: "Café (patio)",
  cafeKiosk: "Café (no seats)",
  toilets: "Toilets",
  roseGarden: "Rose garden",
  busStop: "Bus stop",
  swing: "Swing",
  slide: "Slide",
  spring: "Spring rider",
  zip: "Zip line",
  stumpCrab: "Stump (crab)",
  stumpSnail: "Stump (snail)",
  stumpStarfish: "Stump (starfish)",
};

export const PLACEABLE_IDS: PlaceableId[] = [
  "boathouse",
  "cafe",
  "cafeKiosk",
  "toilets",
  "roseGarden",
  "busStop",
  "swing",
  "slide",
  "spring",
  "zip",
  "stumpCrab",
  "stumpSnail",
  "stumpStarfish",
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
    case "cafe":
    case "cafeKiosk": {
      const cream = mat(0xf0e6d2);
      const felt = mat(0x2a2a2a);
      const paint = mat(0xc94f3d);
      const white = mat(0xf5f5f0);
      const steel = mat(0x888890);
      group.add(box(9, 3, 6, cream, 0, 1.5, 0));
      group.add(box(9.4, 0.2, 6.4, felt, 0, 3.1, 0));
      group.add(box(3.5, 2.2, 0.15, white, 0, 1.4, -3.05));
      group.add(box(2.2, 0.9, 2.2, paint, -2.8, 1.2, 1.5));
      group.add(box(0.15, 2.4, 0.15, steel, 3.8, 1.2, -2.2));
      group.add(box(0.15, 2.4, 0.15, steel, 3.8, 1.2, 2.2));
      if (id === "cafe") {
        for (const [tx, tz] of [
          [-2.5, -5.2],
          [2.5, -5.2],
        ] as const) {
          group.add(box(0.9, 0.08, 0.9, white, tx, 0.74, tz));
          group.add(box(0.08, 2.2, 0.08, steel, tx, 1.2, tz));
          const parasol = new THREE.Mesh(
            new THREE.ConeGeometry(1.2, 0.4, 8),
            paint,
          );
          parasol.position.set(tx, 2.3, tz);
          group.add(parasol);
        }
      }
      break;
    }
    case "toilets": {
      const brick = mat(0x9c6a52);
      const felt = mat(0x2a2a2a);
      const white = mat(0xf5f5f0);
      group.add(box(7, 2.6, 4.5, brick, 0, 1.3, 0));
      group.add(box(7.4, 0.18, 4.9, felt, 0, 2.7, 0));
      group.add(box(1.1, 2.1, 0.16, mat(0x3f6b9c), -1.8, 1.05, -2.3));
      group.add(box(1.1, 2.1, 0.16, mat(0x8b3a6b), 1.8, 1.05, -2.3));
      group.add(box(0.4, 0.4, 0.06, white, -1.8, 2.35, -2.3));
      group.add(box(0.4, 0.4, 0.06, white, 1.8, 2.35, -2.3));
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
          const bush = new THREE.Mesh(
            new THREE.SphereGeometry(0.35, 7, 6),
            hedge,
          );
          bush.position.set(
            bx + ((i % 3) - 1) * 1.1,
            0.65,
            (Math.floor(i / 3) - 0.5) * 2.2,
          );
          group.add(bush);
          const bloom = new THREE.Mesh(
            new THREE.SphereGeometry(0.1, 6, 5),
            rose,
          );
          bloom.position.copy(bush.position).add(new THREE.Vector3(0, 0.3, 0));
          group.add(bloom);
        }
      }
      break;
    }
    case "busStop": {
      const steel = mat(0x6a7278, 0.35);
      const glass = mat(0xa8c4d4, 0.2);
      const seat = mat(0x3a3e42);
      const blue = mat(0x1f4e9a, 0.55);
      group.add(box(3.6, 2.2, 0.08, glass, 0, 1.3, 0.55));
      group.add(box(0.08, 2.2, 1.1, glass, -1.75, 1.3, 0));
      group.add(box(0.08, 2.2, 1.1, glass, 1.75, 1.3, 0));
      group.add(box(3.9, 0.08, 1.4, steel, 0, 2.45, 0));
      group.add(box(3.4, 0.08, 0.45, seat, 0, 0.55, -0.15));
      group.add(box(0.1, 2.8, 0.1, steel, 1.95, 1.4, -0.35));
      group.add(box(0.55, 0.45, 0.06, blue, 1.95, 2.85, -0.35));
      break;
    }
    case "swing": {
      const steel = mat(0x888890);
      const rubber = mat(0x4a3f4a);
      group.add(box(4.5, 0.16, 0.16, steel, 0, 2.5, 0));
      for (const x of [-2.1, 2.1]) {
        for (const z of [-1.1, 1.1]) {
          const leg = box(0.14, 2.6, 0.14, steel, x, 1.3, z);
          leg.rotation.x = z < 0 ? -0.2 : 0.2;
          group.add(leg);
        }
      }
      group.add(box(0.05, 1.6, 0.05, steel, 0, 1.7, 0));
      group.add(box(0.6, 0.08, 0.3, rubber, 0, 0.9, 0));
      break;
    }
    case "slide": {
      const timber = mat(0x8a6a44);
      const steel = mat(0x888890);
      const felt = mat(0x2a2a2a);
      group.add(box(1.8, 2.1, 1.8, timber, 0, 1.05, -3));
      group.add(box(2.2, 0.12, 2.2, felt, 0, 2.2, -3));
      const chute = box(1.0, 0.12, 5.2, steel, 0, 1.2, 1.2);
      chute.rotation.x = 0.4;
      group.add(chute);
      break;
    }
    case "spring": {
      const steel = mat(0x888890);
      const red = mat(0xd8452f);
      group.add(box(0.2, 0.5, 0.2, steel, 0, 0.28, 0));
      group.add(box(0.5, 0.4, 1.3, red, 0, 0.72, 0));
      break;
    }
    case "zip": {
      const steel = mat(0x888890);
      group.add(box(0.2, 2.8, 0.2, steel, -4, 1.4, 0));
      group.add(box(0.2, 2.8, 0.2, steel, 4, 1.4, 0));
      group.add(box(8.2, 0.06, 0.06, steel, 0, 2.7, 0));
      break;
    }
    case "stumpCrab":
    case "stumpSnail":
    case "stumpStarfish": {
      const timber = mat(0x8a6a44);
      const dark = mat(0x5f4630);
      const stump = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.5, 0.55, 10),
        timber,
      );
      stump.position.y = 0.28;
      group.add(stump);
      const top = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 0.04, 10),
        dark,
      );
      top.position.y = 0.56;
      group.add(top);
      if (id === "stumpCrab") {
        const body = new THREE.Mesh(
          new THREE.SphereGeometry(0.16, 8, 6),
          dark,
        );
        body.scale.set(1.4, 0.45, 1.1);
        body.position.set(0, 0.72, 0);
        group.add(body);
        for (const side of [-1, 1]) {
          const claw = new THREE.Mesh(
            new THREE.SphereGeometry(0.07, 6, 5),
            dark,
          );
          claw.scale.set(1.3, 0.6, 0.9);
          claw.position.set(side * 0.22, 0.7, 0.12);
          group.add(claw);
        }
      } else if (id === "stumpSnail") {
        const shell = new THREE.Mesh(
          new THREE.TorusGeometry(0.14, 0.07, 6, 10),
          dark,
        );
        shell.rotation.x = 0.9;
        shell.position.set(0, 0.78, -0.02);
        group.add(shell);
        group.add(box(0.22, 0.08, 0.28, timber, 0, 0.64, 0.16));
      } else {
        for (let i = 0; i < 5; i++) {
          const arm = box(0.1, 0.06, 0.32, dark, 0, 0.64, 0.12);
          arm.rotation.y = (i / 5) * Math.PI * 2;
          group.add(arm);
        }
        const hub = new THREE.Mesh(
          new THREE.SphereGeometry(0.1, 7, 5),
          dark,
        );
        hub.scale.set(1, 0.35, 1);
        hub.position.y = 0.64;
        group.add(hub);
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
    case "cafeKiosk":
      return 3;
    case "toilets":
      return 2.25;
    case "roseGarden":
      return 3.2;
    case "busStop":
      return 0.7;
    case "swing":
      return 1.2;
    case "slide":
      return 4;
    case "spring":
      return 0.7;
    case "zip":
      return 0.4;
    case "stumpCrab":
    case "stumpSnail":
    case "stumpStarfish":
      return 0.45;
  }
}
