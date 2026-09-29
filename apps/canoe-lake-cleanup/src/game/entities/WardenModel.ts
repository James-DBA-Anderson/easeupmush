import * as THREE from "three";
import { Face } from "./Face";

/** Soft matte fill to match the first-person hands. */
function matt(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 1,
    metalness: 0,
    flatShading: true,
  });
}

/** Same kit as the viewmodel sleeves and gloves. */
const HIVIS = matt(0xf0a23a);
const TAPE = new THREE.MeshStandardMaterial({
  color: 0xe8e8e0,
  roughness: 0.35,
  metalness: 0.4,
  emissive: 0x2a2a28,
  flatShading: true,
});
const GLOVE = matt(0x3f7a4a);
const TROUSERS = matt(0x262c38);
const NAVY = matt(0x1e2430);
const BOOT = matt(0x1c1a18);
const SOLE = matt(0x3a3430);
const TOE = matt(0x2c2926);
const BELT = matt(0x17171a);
const BUCKLE = new THREE.MeshStandardMaterial({
  color: 0x9a9aa0,
  roughness: 0.4,
  metalness: 0.7,
});
const SKIN = matt(0xd9a066);

export interface WardenRig {
  group: THREE.Group;
  face: Face;
  /** Shoulder pivots, left then right; rotate on X to swing. */
  arms: THREE.Group[];
  /** Hip pivots, left then right; rotate on X to stride. */
  legs: THREE.Group[];
  /** Knee pivots, left then right; positive X folds the shin back. */
  knees: THREE.Group[];
}

/** Hip pivot height above the soles. */
export const WARDEN_HIP_Y = 0.91;
/** Underside of the seat of the trousers, for sitting on things. */
export const WARDEN_SEAT_Y = 0.82;

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

/** "PARK WARDEN" across the back of the jacket. */
function backPrint(): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext("2d")!;
  // Game canvas is CSS-flipped on X; paint mirrored so it reads forwards.
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.fillStyle = "#1e2430";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '900 44px "Arial Black", Impact, sans-serif';
  ctx.fillText("PARK", canvas.width / 2, 28);
  ctx.font = '900 34px "Arial Black", Impact, sans-serif';
  ctx.fillText("WARDEN", canvas.width / 2, 70);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.13),
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

/**
 * The park warden in third person: hi-vis jacket with reflective tape and
 * braces, navy work trousers with shin bands, safety boots, green gloves and a
 * cap. Pivots: torso at 1.0, shoulders ±0.27 / 0.48 up the torso, hips
 * ±0.1 at 0.91 with the boot soles on the ground.
 */
export function buildWarden(): WardenRig {
  const group = new THREE.Group();
  const arms: THREE.Group[] = [];
  const legs: THREE.Group[] = [];
  const knees: THREE.Group[] = [];

  // Seat of the trousers and the belt line.
  group.add(part(new THREE.BoxGeometry(0.35, 0.2, 0.23), TROUSERS, 0, 0.92, 0));
  group.add(part(new THREE.BoxGeometry(0.37, 0.05, 0.245), BELT, 0, 1.0, 0, false));
  group.add(
    part(new THREE.BoxGeometry(0.06, 0.04, 0.02), BUCKLE, 0, 1.0, 0.125, false),
  );
  // Radio pouch on the right hip.
  group.add(part(new THREE.BoxGeometry(0.06, 0.1, 0.07), BELT, -0.2, 0.96, 0.02));

  const torso = new THREE.Group();
  torso.position.y = 1.0;
  group.add(torso);

  // Jacket: narrower at the waist, broad across the shoulders.
  torso.add(part(new THREE.BoxGeometry(0.4, 0.3, 0.25), HIVIS, 0, 0.12, 0));
  torso.add(part(new THREE.BoxGeometry(0.46, 0.28, 0.27), HIVIS, 0, 0.42, 0));
  // Hem sits just over the belt.
  torso.add(part(new THREE.BoxGeometry(0.41, 0.05, 0.26), HIVIS, 0, -0.02, 0));

  // Two reflective hoops round the body.
  for (const y of [0.1, 0.2]) {
    torso.add(part(new THREE.BoxGeometry(0.405, 0.04, 0.255), TAPE, 0, y, 0, false));
  }
  // Braces up over the shoulders, front and back.
  for (const x of [-0.11, 0.11]) {
    for (const z of [0.137, -0.137]) {
      torso.add(
        part(new THREE.BoxGeometry(0.045, 0.33, 0.004), TAPE, x, 0.4, z, false),
      );
    }
    torso.add(part(new THREE.BoxGeometry(0.045, 0.004, 0.27), TAPE, x, 0.562, 0, false));
  }
  // Zip down the front.
  torso.add(
    part(new THREE.BoxGeometry(0.012, 0.5, 0.004), NAVY, 0, 0.29, 0.137, false),
  );
  // Collar.
  torso.add(part(new THREE.BoxGeometry(0.28, 0.07, 0.22), HIVIS, 0, 0.585, 0));
  // Radio clipped to the left chest, stubby aerial.
  torso.add(part(new THREE.BoxGeometry(0.06, 0.1, 0.035), BELT, 0.15, 0.44, 0.15));
  torso.add(
    part(new THREE.CylinderGeometry(0.006, 0.006, 0.08, 5), BELT, 0.17, 0.53, 0.15, false),
  );
  const print = backPrint();
  print.position.set(0, 0.32, -0.139);
  torso.add(print);

  torso.add(part(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8), SKIN, 0, 0.62, 0));

  const head = new THREE.Group();
  head.position.y = 0.74;
  torso.add(head);
  const face = new Face(SKIN);
  head.add(face.group);

  // Navy cap: domed crown and a proper peak.
  const crown = part(
    new THREE.SphereGeometry(0.162, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    NAVY,
    0,
    0.085,
    -0.01,
  );
  crown.scale.set(1, 0.7, 1.02);
  head.add(crown);
  head.add(part(new THREE.CylinderGeometry(0.158, 0.158, 0.03, 12), NAVY, 0, 0.09, -0.01));
  const peak = part(
    new THREE.CylinderGeometry(0.13, 0.13, 0.014, 12, 1, false, -Math.PI / 2, Math.PI),
    NAVY,
    0,
    0.085,
    0.1,
  );
  peak.scale.set(1, 1, 0.75);
  peak.rotation.x = 0.1;
  head.add(peak);
  head.add(part(new THREE.BoxGeometry(0.07, 0.03, 0.005), HIVIS, 0, 0.125, 0.152, false));

  for (const side of [-1, 1] as const) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.27, 0.48, 0);
    torso.add(arm);

    arm.add(part(new THREE.SphereGeometry(0.075, 8, 6), HIVIS, 0, -0.01, 0));
    const upper = part(new THREE.BoxGeometry(0.115, 0.32, 0.125), HIVIS);
    upper.geometry.translate(0, -0.16, 0);
    arm.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.32;
    // A touch of bend so the arms don't hang dead straight.
    elbow.rotation.x = -0.12;
    arm.add(elbow);
    const fore = part(new THREE.BoxGeometry(0.105, 0.26, 0.11), HIVIS);
    fore.geometry.translate(0, -0.13, 0);
    elbow.add(fore);
    elbow.add(part(new THREE.BoxGeometry(0.112, 0.04, 0.117), TAPE, 0, -0.17, 0, false));

    const hand = new THREE.Group();
    hand.position.y = -0.28;
    elbow.add(hand);
    hand.add(part(new THREE.BoxGeometry(0.1, 0.04, 0.1), NAVY, 0, 0.01, 0, false));
    hand.add(part(new THREE.BoxGeometry(0.09, 0.1, 0.1), GLOVE, 0, -0.05, 0.005));
    hand.add(part(new THREE.BoxGeometry(0.03, 0.05, 0.035), GLOVE, -side * 0.055, -0.035, 0.03));
    arms.push(arm);
  }

  for (const side of [-1, 1] as const) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.1, WARDEN_HIP_Y, 0);
    group.add(leg);

    const thigh = part(new THREE.BoxGeometry(0.15, 0.42, 0.17), TROUSERS);
    thigh.geometry.translate(0, -0.21, 0);
    leg.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.41;
    leg.add(knee);
    const shin = part(new THREE.BoxGeometry(0.135, 0.38, 0.155), TROUSERS);
    shin.geometry.translate(0, -0.19, 0);
    knee.add(shin);
    // Reflective shin bands, like the jacket's.
    for (const y of [-0.2, -0.27]) {
      knee.add(part(new THREE.BoxGeometry(0.14, 0.03, 0.16), TAPE, 0, y, 0, false));
    }

    // Safety boot: ankle, upper, capped toe and a chunky sole.
    const foot = new THREE.Group();
    foot.position.y = -0.38;
    knee.add(foot);
    foot.add(part(new THREE.BoxGeometry(0.14, 0.09, 0.16), BOOT, 0, -0.04, 0));
    foot.add(part(new THREE.BoxGeometry(0.14, 0.07, 0.14), BOOT, 0, -0.075, 0.1));
    foot.add(part(new THREE.BoxGeometry(0.135, 0.06, 0.05), TOE, 0, -0.08, 0.17));
    foot.add(part(new THREE.BoxGeometry(0.15, 0.03, 0.3), SOLE, 0, -0.115, 0.05));
    legs.push(leg);
    knees.push(knee);
  }

  return { group, face, arms, legs, knees };
}
