import * as THREE from "three";

/** Soft matte fill — Goose Game style, no PBR shine. */
function matt(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 1,
    metalness: 0,
    flatShading: true,
  });
}

const SKIN = matt(0xd4a574);
const GLOVE = matt(0x3f7a4a);
const CUFF = matt(0x2a3a28);
const HIVIS = matt(0xf0a23a);
const TAPE = new THREE.MeshStandardMaterial({
  color: 0xe8e8e0,
  roughness: 0.35,
  metalness: 0.45,
  emissive: 0x222220,
  flatShading: true,
});

export type Grip = "gun" | "picker" | "sack" | "brace";

/**
 * Gloved hand for the viewmodels. Palm faces −Y onto a handle, fingers curl
 * toward −Y, wrist cuff sits at −Z so a sleeve can bolt on behind it.
 */
export function buildHand(side: 1 | -1, pose: Grip = "gun"): THREE.Group {
  const hand = new THREE.Group();
  const curl = pose === "sack" ? 0.7 : pose === "picker" ? 0.95 : pose === "brace" ? 0.8 : 1.05;

  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.032, 0.078), GLOVE);
  palm.position.set(0, 0.004, 0.008);
  palm.castShadow = true;
  hand.add(palm);

  const heel = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.028, 0.03), GLOVE);
  heel.position.set(0, -0.006, -0.028);
  hand.add(heel);

  // Knuckle row, then a curled pad so the mitt wraps the grip.
  const knuckles = new THREE.Group();
  knuckles.position.set(0, 0.01, 0.046);
  knuckles.rotation.x = curl * 0.55;
  hand.add(knuckles);

  const row = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.026, 0.028), GLOVE);
  row.position.z = 0.012;
  row.castShadow = true;
  knuckles.add(row);

  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.024, 0.042), GLOVE);
  pad.geometry.translate(0, 0, 0.018);
  pad.position.set(0, -0.004, 0.026);
  pad.rotation.x = curl * 0.85;
  pad.castShadow = true;
  knuckles.add(pad);

  const thumb = new THREE.Group();
  thumb.position.set(side * -0.04, 0.012, 0.0);
  thumb.rotation.set(0.35, side * 0.55, side * -0.85);
  hand.add(thumb);

  const thumbRoot = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.022, 0.032), GLOVE);
  thumbRoot.position.z = 0.012;
  thumbRoot.castShadow = true;
  thumb.add(thumbRoot);

  const thumbTip = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.02, 0.028), GLOVE);
  thumbTip.geometry.translate(0, 0, 0.012);
  thumbTip.position.set(0, -0.004, 0.026);
  thumbTip.rotation.x = 0.7;
  thumb.add(thumbTip);

  const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.048, 0.036), CUFF);
  cuff.position.set(0, 0, -0.05);
  hand.add(cuff);

  return hand;
}

/**
 * Hi-vis arm. Origin is the wrist. Forearm runs back to an elbow, then the
 * upper arm drops out of frame toward the shoulder.
 */
export function buildSleeve(side: 1 | -1, pose: Grip = "gun"): THREE.Group {
  const sleeve = new THREE.Group();
  const { elbow, shoulder } = armPose(side, pose);

  bone(sleeve, new THREE.Vector3(0, 0, 0), elbow, 0.046, 0.05, HIVIS);
  bone(sleeve, elbow, shoulder, 0.055, 0.062, HIVIS);

  const joint = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.07), HIVIS);
  joint.position.copy(elbow);
  joint.castShadow = true;
  sleeve.add(joint);

  const tape = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.028), TAPE);
  tape.position.copy(elbow).multiplyScalar(0.28);
  tape.quaternion.copy(lookZ(elbow));
  sleeve.add(tape);

  return sleeve;
}

/** Gloved hand with the hi-vis sleeve already snapped to the cuff. */
export function buildArmedHand(side: 1 | -1, pose: Grip = "gun"): THREE.Group {
  const hand = buildHand(side, pose);
  const sleeve = buildSleeve(side, pose);
  sleeve.position.set(0, 0, -0.068);
  hand.add(sleeve);
  return hand;
}

function armPose(
  side: 1 | -1,
  pose: Grip,
): { elbow: THREE.Vector3; shoulder: THREE.Vector3 } {
  if (pose === "picker") {
    return {
      elbow: new THREE.Vector3(side * 0.02, -0.05, 0.3),
      shoulder: new THREE.Vector3(side * 0.12, -0.36, 0.46),
    };
  }
  if (pose === "sack") {
    return {
      elbow: new THREE.Vector3(side * 0.04, -0.14, 0.16),
      shoulder: new THREE.Vector3(side * 0.22, -0.4, 0.08),
    };
  }
  if (pose === "brace") {
    return {
      elbow: new THREE.Vector3(side * 0.08, -0.16, 0.2),
      shoulder: new THREE.Vector3(side * 0.26, -0.42, 0.02),
    };
  }
  return {
    elbow: new THREE.Vector3(side * 0.03, -0.08, 0.26),
    shoulder: new THREE.Vector3(side * 0.16, -0.34, 0.5),
  };
}

function bone(
  parent: THREE.Object3D,
  from: THREE.Vector3,
  to: THREE.Vector3,
  rx: number,
  ry: number,
  material: THREE.Material,
): void {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  if (len < 1e-4) return;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(rx * 2, ry * 2, len), material);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.copy(lookZ(dir));
  mesh.castShadow = true;
  parent.add(mesh);
}

function lookZ(dir: THREE.Vector3): THREE.Quaternion {
  const n = dir.clone();
  if (n.lengthSq() < 1e-8) return new THREE.Quaternion();
  return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n.normalize());
}

/** Skin tone kept around for anything that isn't gloved. */
export { SKIN };
