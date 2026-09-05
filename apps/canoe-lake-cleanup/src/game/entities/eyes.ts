import * as THREE from "three";

const WHITE = new THREE.MeshStandardMaterial({
  color: 0xf5f2ea,
  roughness: 0.55,
});
const DARK = new THREE.MeshStandardMaterial({
  color: 0x14120f,
  roughness: 0.35,
});

export interface EyeOptions {
  /** Distance from centreline to each eye. */
  spread: number;
  y?: number;
  z?: number;
  /** Eyeball radius. */
  size?: number;
  /** Pupil as a fraction of the eyeball. */
  pupil?: number;
  /** Optional iris tint (else plain dark). */
  iris?: number;
  /** +1 for noses along +Z, −1 for the squirrel style. */
  face?: 1 | -1;
}

/** Dots a pair of readable eyes onto a head (or the body group). */
export function addEyes(parent: THREE.Object3D, opts: EyeOptions): void {
  const size = opts.size ?? 0.04;
  const face = opts.face ?? 1;
  const y = opts.y ?? 0.02;
  const z = opts.z ?? 0.12 * face;
  const iris =
    opts.iris != null
      ? new THREE.MeshStandardMaterial({ color: opts.iris, roughness: 0.4 })
      : DARK;

  for (const side of [-1, 1] as const) {
    const eye = new THREE.Group();
    eye.position.set(side * opts.spread, y, z);

    eye.add(new THREE.Mesh(new THREE.SphereGeometry(size, 7, 5), WHITE));

    const pupil = new THREE.Mesh(
      new THREE.SphereGeometry(size * (opts.pupil ?? 0.55), 6, 4),
      iris,
    );
    pupil.position.z = face * size * 0.55;
    eye.add(pupil);

    parent.add(eye);
  }
}
