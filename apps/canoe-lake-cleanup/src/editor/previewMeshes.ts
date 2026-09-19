import * as THREE from "three";
import type { PlaceableId } from "../level/types";

export const PLACEABLE_LABELS: Record<PlaceableId, string> = {
  boathouse: "Boathouse",
  cafe: "Café (patio)",
  cafeKiosk: "Café (no seats)",
  toilets: "Toilets",
  emanuelFountain: "Emanuel fountain",
  roseGarden: "Rose garden",
  busStop: "Bus stop",
  swing: "Swing",
  slide: "Slide",
  spring: "Spring rider",
  zip: "Zip line",
  gymPullUp: "Gym — pull-up",
  gymBars: "Gym — parallel bars",
  gymBench: "Gym — sit-up bench",
  gymWalker: "Gym — air walker",
  gymBike: "Gym — bike",
  stumpCrab: "Stump (crab)",
  stumpSnail: "Stump (snail)",
  stumpStarfish: "Stump (starfish)",
};

export const PLACEABLE_IDS: PlaceableId[] = [
  "boathouse",
  "cafe",
  "cafeKiosk",
  "toilets",
  "emanuelFountain",
  "roseGarden",
  "busStop",
  "swing",
  "slide",
  "spring",
  "zip",
  "gymPullUp",
  "gymBars",
  "gymBench",
  "gymWalker",
  "gymBike",
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
      const bays = 7;
      const arc = 0.52;
      const deep = 4.8;
      const midR = 30;
      const bayA = arc / bays;
      const bayW = 2 * midR * Math.sin(bayA / 2) * 1.14;
      for (let i = 0; i < bays; i++) {
        const amid = -arc / 2 + (i + 0.5) * bayA;
        const cx = Math.sin(amid) * midR;
        const cz = -Math.cos(amid) * midR + midR;
        const yaw = -amid;
        const bay = new THREE.Group();
        bay.position.set(cx, 0, cz);
        bay.rotation.y = yaw;
        bay.add(box(bayW, 2.6, deep, brick, 0, 1.3, 0));
        bay.add(box(bayW + 0.35, 0.16, deep + 0.35, felt, 0, 2.7, 0));
        if (i === 1 || i === bays - 2) {
          const colour = i === 1 ? 0x3f6b9c : 0x8b3a6b;
          bay.add(box(1.1, 2.1, 0.16, mat(colour), 0, 1.05, -deep / 2 - 0.05));
          bay.add(box(0.4, 0.4, 0.06, white, 0, 2.35, -deep / 2 - 0.05));
        }
        group.add(bay);
      }
      break;
    }
    case "emanuelFountain": {
      const stone = mat(0xc8c2b4, 0.92);
      const iron = mat(0x2a3228, 0.55);
      const basin = mat(0xb8b4a8, 0.75);
      group.add(box(1.55, 0.35, 1.55, stone, 0, 0.18, 0));
      group.add(box(1.15, 0.55, 1.15, stone, 0, 0.62, 0));
      const bowl = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.48, 0.22, 12),
        basin,
      );
      bowl.position.y = 1.05;
      group.add(bowl);
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.16, 0.7, 8),
        stone,
      );
      stem.position.y = 1.5;
      group.add(stem);
      for (const [x, z] of [
        [-0.48, -0.48],
        [0.48, -0.48],
        [-0.48, 0.48],
        [0.48, 0.48],
      ] as const) {
        group.add(box(0.09, 2.05, 0.09, iron, x, 1.85, z));
      }
      group.add(box(1.35, 0.08, 1.35, iron, 0, 2.95, 0));
      for (const [dx, dz] of [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ] as const) {
        const pitch = box(1.45, 0.06, 0.85, iron, dx * 0.2, 3.25, dz * 0.2);
        pitch.rotation.x = dz * 0.45;
        pitch.rotation.z = -dx * 0.45;
        group.add(pitch);
      }
      const finial = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 8, 6),
        iron,
      );
      finial.position.y = 3.55;
      group.add(finial);
      group.add(box(0.06, 0.35, 0.06, iron, 0, 3.35, 0));
      break;
    }
    case "roseGarden": {
      const hedge = mat(0x2f5a33);
      const soil = mat(0x5a4433);
      const gravel = mat(0x9a9080);
      const rose = mat(0xd8446a);
      group.add(box(38, 0.06, 28, gravel, 0, 0.03, 0));
      group.add(box(39, 1.0, 0.5, hedge, 0, 0.5, 14));
      group.add(box(39, 1.0, 0.5, hedge, 0, 0.5, -14));
      group.add(box(0.5, 1.0, 28, hedge, 19, 0.5, 0));
      group.add(box(0.5, 1.0, 28, hedge, -19, 0.5, 0));
      for (const bx of [-14, -7, 0, 7, 14]) {
        for (const bz of [-8, 0, 8]) {
          group.add(box(5.2, 0.3, 6.2, soil, bx, 0.2, bz));
          group.add(box(5.6, 0.4, 6.6, hedge, bx, 0.25, bz));
          for (let i = 0; i < 4; i++) {
            const bush = new THREE.Mesh(
              new THREE.SphereGeometry(0.32, 7, 6),
              hedge,
            );
            bush.position.set(
              bx + ((i % 2) - 0.5) * 1.6,
              0.6,
              bz + (Math.floor(i / 2) - 0.5) * 2.2,
            );
            group.add(bush);
            const bloom = new THREE.Mesh(
              new THREE.SphereGeometry(0.09, 6, 5),
              rose,
            );
            bloom.position.copy(bush.position).add(new THREE.Vector3(0, 0.28, 0));
            group.add(bloom);
          }
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
    case "gymPullUp": {
      const steel = mat(0x888890);
      const yellow = mat(0xd4a018);
      group.add(box(2.4, 0.12, 0.12, steel, 0, 2.35, 0));
      for (const x of [-1.1, 1.1]) {
        group.add(box(0.12, 2.4, 0.12, steel, x, 1.2, 0));
        group.add(box(0.7, 0.1, 0.7, yellow, x, 0.05, 0));
      }
      group.add(box(0.9, 0.08, 0.08, yellow, 0, 1.55, 0));
      break;
    }
    case "gymBars": {
      const steel = mat(0x888890);
      const yellow = mat(0xd4a018);
      for (const z of [-0.35, 0.35]) {
        group.add(box(2.2, 0.1, 0.1, steel, 0, 1.15, z));
        for (const x of [-1.0, 1.0]) {
          group.add(box(0.1, 1.2, 0.1, steel, x, 0.6, z));
          group.add(box(0.55, 0.08, 0.55, yellow, x, 0.04, z));
        }
      }
      break;
    }
    case "gymBench": {
      const steel = mat(0x888890);
      const pad = mat(0x2a2a32);
      const yellow = mat(0xd4a018);
      group.add(box(0.55, 0.12, 1.7, pad, 0, 0.55, 0.15));
      const back = box(0.55, 0.12, 1.1, pad, 0, 1.05, -0.85);
      back.rotation.x = -0.95;
      group.add(back);
      for (const x of [-0.22, 0.22]) {
        group.add(box(0.08, 0.55, 0.08, steel, x, 0.28, 0.5));
        group.add(box(0.08, 0.7, 0.08, steel, x, 0.5, -0.55));
      }
      group.add(box(0.7, 0.08, 0.7, yellow, 0, 0.04, 0));
      break;
    }
    case "gymWalker": {
      const steel = mat(0x888890);
      const yellow = mat(0xd4a018);
      const pad = mat(0x2a2a32);
      group.add(box(0.9, 0.1, 1.4, yellow, 0, 0.05, 0));
      group.add(box(0.12, 1.5, 0.12, steel, 0, 0.85, -0.35));
      group.add(box(0.7, 0.08, 0.08, steel, 0, 1.55, -0.35));
      for (const side of [-1, 1]) {
        const arm = box(0.08, 1.1, 0.08, steel, side * 0.35, 1.0, 0.1);
        arm.rotation.z = side * 0.25;
        arm.rotation.x = -0.35;
        group.add(arm);
        group.add(box(0.28, 0.06, 0.55, pad, side * 0.28, 0.35, 0.45));
      }
      break;
    }
    case "gymBike": {
      const steel = mat(0x888890);
      const yellow = mat(0xd4a018);
      const pad = mat(0x2a2a32);
      group.add(box(0.7, 0.1, 1.2, yellow, 0, 0.05, 0));
      group.add(box(0.1, 0.9, 0.1, steel, 0, 0.55, -0.25));
      group.add(box(0.35, 0.1, 0.45, pad, 0, 0.95, -0.15));
      group.add(box(0.5, 0.08, 0.08, steel, 0, 1.15, 0.35));
      const wheel = new THREE.Mesh(
        new THREE.TorusGeometry(0.32, 0.04, 6, 16),
        steel,
      );
      wheel.rotation.y = Math.PI / 2;
      wheel.position.set(0, 0.4, 0.35);
      group.add(wheel);
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
      return 3.2;
    case "emanuelFountain":
      return 0.9;
    case "roseGarden":
      return 14;
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
    case "gymPullUp":
      return 0.6;
    case "gymBars":
      return 0.7;
    case "gymBench":
      return 1.0;
    case "gymWalker":
      return 0.8;
    case "gymBike":
      return 0.7;
    case "stumpCrab":
    case "stumpSnail":
    case "stumpStarfish":
      return 0.45;
  }
}
