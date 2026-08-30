import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const COUNT = 26;
/** Half the width of the box the clouds live in, recentred on the player. */
const SPAN = 420;
const BASE_HEIGHT = 110;

interface Puff {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  /** Cover at which this one turns up, so they fill in and clear out in order. */
  threshold: number;
  height: number;
  drift: number;
}

/** The cloud deck: lumps of cumulus drifting downwind across the sky. */
export class Clouds {
  private puffs: Puff[] = [];

  constructor(scene: THREE.Scene) {
    const group = new THREE.Group();
    for (let i = 0; i < COUNT; i++) {
      const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 1,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        // Ground fog shouldn't wash the sky out — they'd vanish in the murk.
        fog: false,
      });
      const mesh = new THREE.Mesh(Clouds.build(), material);
      mesh.position.set(
        (Math.random() - 0.5) * SPAN * 2,
        0,
        (Math.random() - 0.5) * SPAN * 2,
      );
      mesh.renderOrder = -1;
      mesh.visible = false;
      group.add(mesh);

      this.puffs.push({
        mesh,
        material,
        // A stack of thresholds, so a clearing sky loses them one at a time.
        threshold: i / COUNT,
        height: BASE_HEIGHT + (Math.random() - 0.4) * 55,
        drift: 0.75 + Math.random() * 0.6,
      });
    }
    scene.add(group);
  }

  /** One cloud: a handful of squashed blobs shoved together. */
  private static build(): THREE.BufferGeometry {
    const blobs: THREE.BufferGeometry[] = [];
    const lumps = 6 + Math.floor(Math.random() * 5);
    const stretch = 1 + Math.random();

    for (let i = 0; i < lumps; i++) {
      const radius = 13 + Math.random() * 14;
      const blob = new THREE.SphereGeometry(radius, 7, 5);
      // Flat underneath, piled up on top: cumulus, near enough.
      blob.scale(1, 0.5, 0.85);
      blob.translate(
        (Math.random() - 0.5) * 46 * stretch,
        Math.random() * 9,
        (Math.random() - 0.5) * 30,
      );
      blobs.push(blob);
    }

    return mergeGeometries(blobs, false) ?? blobs[0]!;
  }

  /**
   * `cover` is how much of the sky is filled, `gloom` how heavy and grey the
   * clouds look, both coming straight off the weather.
   */
  public update(
    delta: number,
    wind: THREE.Vector2,
    camera: THREE.Vector3,
    cover: number,
    gloom: number,
    light: THREE.Color,
  ): void {
    // We only ever see the underside, so they're lit from the sky colour
    // rather than the sun, then greyed down as the weather closes in.
    const tone = light.clone().lerp(new THREE.Color(0x596069), gloom);
    const shade = tone.clone().multiplyScalar(0.4);
    const glow = tone.clone().multiplyScalar(0.75);

    for (const puff of this.puffs) {
      const { mesh } = puff;
      mesh.position.x += wind.x * puff.drift * delta;
      mesh.position.z += wind.y * puff.drift * delta;

      // Wrap them round the player so the sky never runs out of clouds.
      if (mesh.position.x - camera.x > SPAN) mesh.position.x -= SPAN * 2;
      if (mesh.position.x - camera.x < -SPAN) mesh.position.x += SPAN * 2;
      if (mesh.position.z - camera.z > SPAN) mesh.position.z -= SPAN * 2;
      if (mesh.position.z - camera.z < -SPAN) mesh.position.z += SPAN * 2;

      // Heavier weather sits lower, and spreads until the gaps close up.
      mesh.position.y = puff.height - gloom * 35;
      mesh.scale.setScalar(1 + gloom * 1.4);

      // Fades in over a slice of cover either side of its own threshold.
      const showing = THREE.MathUtils.clamp((cover - puff.threshold) * 6, 0, 1);
      mesh.visible = showing > 0.01;
      puff.material.opacity = showing * (0.9 + gloom * 0.1);
      puff.material.color.copy(shade);
      puff.material.emissive.copy(glow);
    }
  }
}
