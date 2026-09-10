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
const TAPE = matt(0xe8e8e0);

/**
 * Chunky mitten hand for the viewmodels — palm, one finger pad, stub thumb.
 * Reads as a grip without looking like articulated digits.
 *
 * Local space: palm faces −Y (down onto a handle), fingers curl toward −Y/−Z,
 * wrist cuff sits at −Z. Parent a sleeve at the cuff so the arm stays attached.
 */
export function buildHand(
  side: 1 | -1,
  pose: "gun" | "picker" | "sack" = "gun",
): THREE.Group {
  const hand = new THREE.Group();

  // How hard the mitt curls around the handle.
  const curl = pose === "sack" ? 0.55 : pose === "picker" ? 0.85 : 0.95;

  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.038, 0.09), GLOVE);
  palm.position.set(0, 0, 0.01);
  palm.castShadow = true;
  hand.add(palm);

  // Single wide finger pad instead of four separate digits.
  const mitt = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.034, 0.065), GLOVE);
  mitt.geometry.translate(0, 0, 0.03);
  mitt.position.set(0, -0.002, 0.048);
  mitt.rotation.x = curl;
  mitt.castShadow = true;
  hand.add(mitt);

  // Fat thumb on the inward side, wrapping the grip.
  const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.028, 0.048), GLOVE);
  thumb.geometry.translate(0, 0, 0.02);
  thumb.position.set(side * -0.045, 0.008, 0.0);
  thumb.rotation.set(0.45, side * 0.65, side * -0.7);
  hand.add(thumb);

  // Wrist cuff — sleeve should meet this face.
  const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.052, 0.04), CUFF);
  cuff.position.set(0, 0, -0.052);
  hand.add(cuff);

  return hand;
}

/**
 * Hi-vis forearm. Origin is the wrist (matches the hand cuff at local −Z).
 * The arm runs back toward the camera (+Z) and down out of frame so it reads
 * as coming from the player's shoulder, not floating next to the tool.
 */
export function buildSleeve(side: 1 | -1): THREE.Group {
  const sleeve = new THREE.Group();

  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.42), HIVIS);
  // Pivot at the wrist end; length runs toward the camera and slightly down.
  arm.geometry.translate(side * 0.015, -0.05, 0.21);
  arm.rotation.x = 0.42;
  arm.rotation.z = side * 0.18;
  arm.castShadow = true;
  sleeve.add(arm);

  // Reflective tape band just back from the cuff.
  const tape = new THREE.Mesh(new THREE.BoxGeometry(0.108, 0.125, 0.05), TAPE);
  tape.geometry.translate(side * 0.015, -0.02, 0.0);
  tape.position.set(0, 0, 0.055);
  tape.rotation.x = 0.42;
  tape.rotation.z = side * 0.18;
  sleeve.add(tape);

  return sleeve;
}

/** Gloved hand with the hi-vis sleeve already snapped to the cuff. */
export function buildArmedHand(
  side: 1 | -1,
  pose: "gun" | "picker" | "sack" = "gun",
): THREE.Group {
  const hand = buildHand(side, pose);
  const sleeve = buildSleeve(side);
  // Cuff centre is at z = −0.052; seat the sleeve origin on the cuff's back face.
  sleeve.position.set(0, 0, -0.072);
  hand.add(sleeve);
  return hand;
}

/** Skin tone kept around for anything that isn't gloved. */
export { SKIN };
