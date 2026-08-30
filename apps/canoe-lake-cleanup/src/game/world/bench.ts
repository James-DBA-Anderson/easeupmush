import * as THREE from 'three';

const LENGTH = 1.9;
const SEAT_H = 0.45;
const DEPTH = 0.52;

const IRON = new THREE.MeshStandardMaterial({ color: 0x1f3a30, roughness: 0.55, metalness: 0.5 });
const TIMBER = new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.85 });

/** Slats are all the same block, just scaled and placed. */
const SLAT = new THREE.BoxGeometry(1, 1, 1);

function slat(
  group: THREE.Group,
  width: number,
  thickness: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  tilt = 0,
): void {
  const piece = new THREE.Mesh(SLAT, TIMBER);
  piece.scale.set(width, thickness, depth);
  piece.position.set(x, y, z);
  piece.rotation.x = tilt;
  piece.castShadow = true;
  piece.receiveShadow = true;
  group.add(piece);
}

function ironwork(group: THREE.Group, side: number): void {
  const x = side * (LENGTH / 2 - 0.06);

  // Splayed cast-iron legs, front and back.
  for (const z of [DEPTH / 2 - 0.06, -DEPTH / 2 + 0.06]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, SEAT_H, 0.07), IRON);
    leg.position.set(x, SEAT_H / 2, z);
    leg.rotation.z = side * -0.06;
    leg.castShadow = true;
    group.add(leg);

    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.16), IRON);
    foot.position.set(x + side * 0.02, 0.025, z);
    foot.castShadow = true;
    group.add(foot);
  }

  // Rail tying the legs together under the seat.
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, DEPTH - 0.1), IRON);
  rail.position.set(x, SEAT_H - 0.12, 0);
  group.add(rail);

  // Armrest post rising from the front leg, with a scrolled end.
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.06), IRON);
  post.position.set(x, SEAT_H + 0.14, DEPTH / 2 - 0.08);
  post.castShadow = true;
  group.add(post);

  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, DEPTH * 0.85), TIMBER);
  arm.position.set(x, SEAT_H + 0.3, DEPTH * 0.08);
  arm.castShadow = true;
  group.add(arm);

  const scroll = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 6, 10), IRON);
  scroll.position.set(x, SEAT_H + 0.24, DEPTH / 2 - 0.02);
  scroll.rotation.y = Math.PI / 2;
  group.add(scroll);

  // Back frame, raked backwards like the originals.
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62, 0.07), IRON);
  frame.position.set(x, SEAT_H + 0.29, -DEPTH / 2 + 0.12);
  frame.rotation.x = 0.17;
  frame.castShadow = true;
  group.add(frame);

  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), IRON);
  finial.position.set(x, SEAT_H + 0.61, -DEPTH / 2 + 0.02);
  group.add(finial);
}

/**
 * A Victorian park bench: cast-iron ends and frame, wooden slats for the seat
 * and back. Built facing local +z, so it can be turned to face the water.
 */
export function buildBench(): THREE.Group {
  const bench = new THREE.Group();
  const width = LENGTH - 0.24;

  ironwork(bench, 1);
  ironwork(bench, -1);

  const seatSlats = 4;
  for (let i = 0; i < seatSlats; i++) {
    const z = DEPTH / 2 - 0.08 - (i * (DEPTH - 0.14)) / (seatSlats - 1);
    slat(bench, width, 0.04, 0.1, 0, SEAT_H, z);
  }

  const backSlats = 3;
  for (let i = 0; i < backSlats; i++) {
    const y = SEAT_H + 0.16 + i * 0.17;
    // Matches the rake of the iron frame it's bolted to.
    const z = -DEPTH / 2 + 0.12 - (y - SEAT_H) * 0.17;
    slat(bench, width, 0.09, 0.035, 0, y, z, 0.17);
  }

  return bench;
}
