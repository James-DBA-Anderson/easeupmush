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
 */
export function buildHand(
  side: 1 | -1,
  pose: "gun" | "picker" | "sack" = "gun",
): THREE.Group {
  const hand = new THREE.Group();

  // How hard the mitt curls around the handle.
  const curl =
    pose === "sack" ? 0.55 : pose === "picker" ? 0.95 : 1.15;

  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.04, 0.095), GLOVE);
  palm.position.set(0, 0, 0.015);
  palm.castShadow = true;
  hand.add(palm);

  // Single wide finger pad instead of four separate digits.
  const mitt = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.036, 0.07), GLOVE);
  mitt.geometry.translate(0, 0, 0.032);
  mitt.position.set(0, 0.004, 0.05);
  mitt.rotation.x = curl;
  mitt.castShadow = true;
  hand.add(mitt);

  // Fat thumb on the inward side.
  const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.028, 0.05), GLOVE);
  thumb.geometry.translate(0, 0, 0.022);
  thumb.position.set(side * -0.048, 0.012, -0.005);
  thumb.rotation.set(0.35 + curl * 0.15, side * 0.75, side * -0.55);
  hand.add(thumb);

  // Wrist cuff peeking out of the sleeve — boxy, not a smooth cylinder.
  const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.038), CUFF);
  cuff.position.set(0, 0, -0.055);
  hand.add(cuff);

  return hand;
}

/** Hi-vis forearm coming up into frame from below. */
export function buildSleeve(side: 1 | -1): THREE.Group {
  const sleeve = new THREE.Group();

  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.42, 0.1), HIVIS);
  arm.geometry.translate(0, -0.21, 0);
  arm.rotation.x = 1.15;
  arm.position.set(side * 0.02, 0.02, 0.08);
  arm.castShadow = true;
  sleeve.add(arm);

  // Reflective tape band near the cuff — flat white stripe.
  const tape = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.04, 0.105), TAPE);
  tape.geometry.translate(0, -0.02, 0);
  tape.rotation.x = 1.15;
  tape.position.set(side * 0.02, 0.02, 0.08);
  sleeve.add(tape);

  return sleeve;
}

/** Skin tone kept around for anything that isn't gloved. */
export { SKIN };
