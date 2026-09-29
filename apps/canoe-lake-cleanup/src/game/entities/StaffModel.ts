import * as THREE from "three";
import { Face } from "./Face";

function matt(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 1,
    metalness: 0,
    flatShading: true,
  });
}

const SKIN = matt(0xd9a066);
const BELT = matt(0x17171a);
const BUCKLE = new THREE.MeshStandardMaterial({
  color: 0x9a9aa0,
  roughness: 0.4,
  metalness: 0.7,
});
const BRASS = new THREE.MeshStandardMaterial({
  color: 0xc9a227,
  roughness: 0.35,
  metalness: 0.75,
});
const TAPE = new THREE.MeshStandardMaterial({
  color: 0xe8e8e0,
  roughness: 0.35,
  metalness: 0.4,
  emissive: 0x2a2a28,
  flatShading: true,
});
const STEEL = new THREE.MeshStandardMaterial({
  color: 0x6a7078,
  roughness: 0.45,
  metalness: 0.55,
});

export interface StaffRig {
  group: THREE.Group;
  face: Face;
  /** Shoulder pivots, left then right. */
  arms: THREE.Group[];
  /** Hip pivots, left then right. */
  legs: THREE.Group[];
  /** Right-hand hold — gardener's rake parents here. */
  rightHand: THREE.Group;
}

function part(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  shadow = true,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow;
  return mesh;
}

function backPrint(line1: string, line2: string, ink: number): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext("2d")!;
  // Game canvas is CSS-flipped on X; paint mirrored so it reads forwards.
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.fillStyle = `#${ink.toString(16).padStart(6, "0")}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '900 40px "Arial Black", Impact, sans-serif';
  ctx.fillText(line1, canvas.width / 2, 28);
  ctx.font = '900 32px "Arial Black", Impact, sans-serif';
  ctx.fillText(line2, canvas.width / 2, 70);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.32, 0.12),
    new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );
  mesh.rotation.y = Math.PI;
  return mesh;
}

type Kit = {
  jumper: THREE.MeshStandardMaterial;
  trousers: THREE.MeshStandardMaterial;
  boot: THREE.MeshStandardMaterial;
  sole: THREE.MeshStandardMaterial;
  glove: THREE.MeshStandardMaterial;
  hat: THREE.MeshStandardMaterial;
  stripe?: THREE.MeshStandardMaterial;
  cuff?: THREE.MeshStandardMaterial;
  elbowPatch?: THREE.MeshStandardMaterial;
  vest?: THREE.MeshStandardMaterial;
  bootBand?: THREE.MeshStandardMaterial;
  hatKind: "straw" | "skipper";
  print?: { line1: string; line2: string; ink: number };
  /** Seed pouch / keys on the hip: −1 left, +1 right. */
  hip: "pouch" | "keys";
};

function dress(kit: Kit): StaffRig {
  const group = new THREE.Group();
  const arms: THREE.Group[] = [];
  const legs: THREE.Group[] = [];
  let rightHand = new THREE.Group();

  group.add(part(new THREE.BoxGeometry(0.35, 0.2, 0.23), kit.trousers, 0, 0.92, 0));
  group.add(part(new THREE.BoxGeometry(0.37, 0.05, 0.245), BELT, 0, 1.0, 0, false));
  group.add(
    part(new THREE.BoxGeometry(0.06, 0.04, 0.02), BUCKLE, 0, 1.0, 0.125, false),
  );

  const torso = new THREE.Group();
  torso.position.y = 1.0;
  group.add(torso);

  torso.add(part(new THREE.BoxGeometry(0.4, 0.3, 0.25), kit.jumper, 0, 0.12, 0));
  torso.add(part(new THREE.BoxGeometry(0.46, 0.28, 0.27), kit.jumper, 0, 0.42, 0));
  torso.add(part(new THREE.BoxGeometry(0.41, 0.05, 0.26), kit.jumper, 0, -0.02, 0));
  if (kit.stripe) {
    for (const y of [0.32, 0.4, 0.48]) {
      torso.add(
        part(new THREE.BoxGeometry(0.465, 0.045, 0.275), kit.stripe, 0, y, 0, false),
      );
    }
  }
  torso.add(part(new THREE.BoxGeometry(0.28, 0.07, 0.22), kit.jumper, 0, 0.585, 0));
  torso.add(
    part(new THREE.BoxGeometry(0.012, 0.5, 0.004), BELT, 0, 0.29, 0.137, false),
  );
  torso.add(part(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8), SKIN, 0, 0.62, 0));

  if (kit.vest) {
    addLifejacket(torso, kit.vest);
  } else {
    // Fleece pockets and a name badge so the jumper isn't a blank slab.
    torso.add(
      part(new THREE.BoxGeometry(0.12, 0.1, 0.04), kit.jumper, -0.12, 0.18, 0.14),
    );
    torso.add(
      part(new THREE.BoxGeometry(0.12, 0.1, 0.04), kit.jumper, 0.12, 0.18, 0.14),
    );
    torso.add(
      part(new THREE.BoxGeometry(0.07, 0.025, 0.006), matt(0xf0ead8), 0.13, 0.5, 0.138, false),
    );
  }

  if (kit.print) {
    const print = backPrint(kit.print.line1, kit.print.line2, kit.print.ink);
    print.position.set(0, kit.vest ? 0.28 : 0.32, kit.vest ? -0.155 : -0.139);
    torso.add(print);
  }

  const head = new THREE.Group();
  head.position.y = 0.74;
  torso.add(head);
  const face = new Face(SKIN, 1, true);
  head.add(face.group);
  addHat(head, kit);

  for (const side of [-1, 1] as const) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.27, 0.48, 0);
    torso.add(arm);

    arm.add(part(new THREE.SphereGeometry(0.075, 8, 6), kit.jumper, 0, -0.01, 0));
    const upper = part(new THREE.BoxGeometry(0.115, 0.32, 0.125), kit.jumper);
    upper.geometry.translate(0, -0.16, 0);
    arm.add(upper);
    if (kit.elbowPatch) {
      arm.add(
        part(new THREE.BoxGeometry(0.13, 0.09, 0.04), kit.elbowPatch, 0, -0.28, -0.05, false),
      );
    }
    const elbow = new THREE.Group();
    elbow.position.y = -0.32;
    elbow.rotation.x = -0.12;
    arm.add(elbow);
    const fore = part(new THREE.BoxGeometry(0.105, 0.26, 0.11), kit.jumper);
    fore.geometry.translate(0, -0.13, 0);
    elbow.add(fore);
    if (kit.stripe) {
      elbow.add(
        part(new THREE.BoxGeometry(0.11, 0.035, 0.115), kit.stripe, 0, -0.16, 0, false),
      );
    }
    if (kit.cuff) {
      elbow.add(part(new THREE.BoxGeometry(0.112, 0.04, 0.117), kit.cuff, 0, -0.24, 0, false));
    }

    const hand = new THREE.Group();
    hand.position.y = -0.28;
    elbow.add(hand);
    hand.add(part(new THREE.BoxGeometry(0.1, 0.035, 0.1), kit.jumper, 0, 0.01, 0, false));
    hand.add(part(new THREE.BoxGeometry(0.09, 0.1, 0.1), kit.glove, 0, -0.05, 0.005));
    hand.add(
      part(new THREE.BoxGeometry(0.03, 0.05, 0.035), kit.glove, -side * 0.055, -0.035, 0.03),
    );
    if (side === 1) rightHand = hand;
    arms.push(arm);
  }

  for (const side of [-1, 1] as const) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.1, 0.91, 0);
    group.add(leg);

    const thigh = part(new THREE.BoxGeometry(0.15, 0.42, 0.17), kit.trousers);
    thigh.geometry.translate(0, -0.21, 0);
    leg.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.41;
    leg.add(knee);
    const shin = part(new THREE.BoxGeometry(0.135, 0.38, 0.155), kit.trousers);
    shin.geometry.translate(0, -0.19, 0);
    knee.add(shin);
    if (kit.elbowPatch) {
      knee.add(
        part(new THREE.BoxGeometry(0.145, 0.08, 0.04), kit.elbowPatch, 0, -0.08, 0.07, false),
      );
    }

    const foot = new THREE.Group();
    foot.position.y = -0.38;
    knee.add(foot);
    // Wellies: tall shaft, buckle, capped toe, chunky tread.
    foot.add(part(new THREE.BoxGeometry(0.145, 0.26, 0.16), kit.boot, 0, 0.04, 0));
    if (kit.bootBand) {
      foot.add(part(new THREE.BoxGeometry(0.15, 0.035, 0.165), kit.bootBand, 0, 0.15, 0, false));
    }
    foot.add(part(new THREE.BoxGeometry(0.06, 0.025, 0.02), BELT, 0.04, 0.08, 0.085, false));
    foot.add(part(new THREE.BoxGeometry(0.145, 0.08, 0.16), kit.boot, 0, -0.07, 0.1));
    foot.add(part(new THREE.BoxGeometry(0.14, 0.055, 0.05), kit.boot, 0, -0.075, 0.175));
    foot.add(part(new THREE.BoxGeometry(0.15, 0.035, 0.3), kit.sole, 0, -0.115, 0.05));
    legs.push(leg);
  }

  if (kit.hip === "pouch") addSeedPouch(group);
  else addKeys(group);

  return { group, face, arms, legs, rightHand };
}

function addLifejacket(torso: THREE.Group, vest: THREE.MeshStandardMaterial): void {
  for (const x of [-0.12, 0.12]) {
    torso.add(part(new THREE.BoxGeometry(0.2, 0.42, 0.08), vest, x, 0.28, 0.145));
  }
  torso.add(part(new THREE.BoxGeometry(0.46, 0.34, 0.08), vest, 0, 0.3, -0.155));
  torso.add(part(new THREE.BoxGeometry(0.1, 0.08, 0.06), vest, 0, 0.5, 0.12));
  for (const z of [0.18, -0.19]) {
    torso.add(part(new THREE.BoxGeometry(0.44, 0.04, 0.02), TAPE, 0, 0.22, z, false));
    torso.add(part(new THREE.BoxGeometry(0.44, 0.04, 0.02), TAPE, 0, 0.34, z, false));
  }
  torso.add(part(new THREE.BoxGeometry(0.05, 0.04, 0.04), BELT, 0, 0.28, 0.185, false));
  // Brass buttons down the jumper where the vest splits.
  for (const y of [0.14, 0.26, 0.38]) {
    torso.add(part(new THREE.BoxGeometry(0.02, 0.02, 0.01), BRASS, 0, y, 0.128, false));
  }
  const whistle = part(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 6), BRASS);
  whistle.rotation.z = Math.PI / 2;
  whistle.position.set(0.08, 0.52, 0.16);
  torso.add(whistle);
  torso.add(part(new THREE.BoxGeometry(0.004, 0.16, 0.004), BELT, 0.04, 0.44, 0.15, false));
}

function addSeedPouch(group: THREE.Group): void {
  const leather = matt(0x6b4a28);
  group.add(part(new THREE.BoxGeometry(0.1, 0.12, 0.07), leather, 0.22, 0.96, 0.04));
  group.add(part(new THREE.BoxGeometry(0.11, 0.04, 0.08), leather, 0.22, 1.03, 0.04, false));
  group.add(part(new THREE.BoxGeometry(0.03, 0.02, 0.02), BRASS, 0.22, 1.0, 0.085, false));
  // Secateurs clipped on the other hip.
  const handle = part(new THREE.BoxGeometry(0.03, 0.12, 0.025), matt(0x2a4a28), -0.22, 1.02, 0.04);
  group.add(handle);
  const blade = part(new THREE.BoxGeometry(0.02, 0.1, 0.012), STEEL, -0.22, 1.12, 0.05, false);
  group.add(blade);
}

function addKeys(group: THREE.Group): void {
  group.add(part(new THREE.TorusGeometry(0.025, 0.006, 6, 10), STEEL, -0.2, 1.02, 0.08, false));
  for (let i = 0; i < 3; i++) {
    const key = part(
      new THREE.BoxGeometry(0.012, 0.07, 0.02),
      BRASS,
      -0.2 + i * 0.012,
      0.97,
      0.09,
      false,
    );
    key.rotation.z = (i - 1) * 0.18;
    group.add(key);
  }
  // Ticket wad on the other hip.
  group.add(part(new THREE.BoxGeometry(0.08, 0.1, 0.03), matt(0xf0ead8), 0.21, 0.98, 0.05));
  group.add(part(new THREE.BoxGeometry(0.07, 0.02, 0.008), BELT, 0.21, 1.0, 0.07, false));
}

function addHat(head: THREE.Group, kit: Kit): void {
  if (kit.hatKind === "straw") {
    head.add(part(new THREE.CylinderGeometry(0.3, 0.32, 0.03, 12), kit.hat, 0, 0.11, -0.01));
    head.add(part(new THREE.CylinderGeometry(0.15, 0.18, 0.16, 10), kit.hat, 0, 0.2, -0.01));
    head.add(
      part(
        new THREE.CylinderGeometry(0.182, 0.182, 0.028, 10),
        matt(0x3d6b3a),
        0,
        0.135,
        -0.01,
        false,
      ),
    );
    // Ribbon tails off the back of the brim.
    const ribbon = matt(0x3d6b3a);
    head.add(part(new THREE.BoxGeometry(0.04, 0.12, 0.01), ribbon, -0.04, 0.04, -0.2, false));
    head.add(part(new THREE.BoxGeometry(0.04, 0.16, 0.01), ribbon, 0.03, 0.02, -0.2, false));
    return;
  }
  const crown = part(
    new THREE.SphereGeometry(0.168, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    kit.hat,
    0,
    0.105,
    0.02,
  );
  crown.scale.set(1.02, 0.72, 1.04);
  head.add(crown);
  head.add(part(new THREE.CylinderGeometry(0.165, 0.165, 0.032, 12), kit.hat, 0, 0.11, 0.02));
  const peak = part(
    new THREE.BoxGeometry(0.18, 0.014, 0.1),
    kit.hat,
    0,
    0.095,
    0.175,
  );
  peak.rotation.x = 0.12;
  head.add(peak);
  head.add(part(new THREE.BoxGeometry(0.055, 0.038, 0.008), BRASS, 0, 0.145, 0.175, false));
}

/** Council gardener — green fleece, straw hat, wellies, seed pouch. */
export function buildGardener(): StaffRig {
  return dress({
    jumper: matt(0x3d6b3a),
    trousers: matt(0x5a4630),
    boot: matt(0x2a4a28),
    sole: matt(0x1a2818),
    glove: matt(0xb08a4a),
    hat: matt(0xc8b06a),
    cuff: matt(0x2a4a28),
    elbowPatch: matt(0x6b4a28),
    bootBand: matt(0xc8b06a),
    hatKind: "straw",
    print: { line1: "PARKS", line2: "GARDENS", ink: 0x1e3018 },
    hip: "pouch",
  });
}

/** Boat-hire bloke — navy guernsey, orange lifejacket, red skipper cap. */
export function buildBoatman(): StaffRig {
  return dress({
    jumper: matt(0x2a4a62),
    trousers: matt(0x3a3a42),
    boot: matt(0x1c1a18),
    sole: matt(0x2a2420),
    glove: matt(0xc4a070),
    hat: matt(0xc94f3d),
    stripe: matt(0xe8e0d0),
    cuff: matt(0x1a2838),
    vest: matt(0xe07020),
    bootBand: matt(0xe8e0d0),
    hatKind: "skipper",
    print: { line1: "BOAT", line2: "HIRE", ink: 0x5a2808 },
    hip: "keys",
  });
}
