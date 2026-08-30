import * as THREE from "three";
import { PATH_Y } from "../world/lake";

/** How long a print takes to wear off the paving on its own. */
const LIFE = 150;
/** How many hits of water it takes to shift one. */
const SCRUB_PER_HIT = 0.07;
/** How long a piece of tyre line is laid at a time. */
export const TYRE_SEGMENT = 0.6;

const SOLE = new THREE.MeshBasicMaterial({
  color: 0x4a4326,
  transparent: true,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});

/** Where the mark goes and which way it was pointing when it was made. */
export interface Tread {
  at: THREE.Vector3;
  yaw: number;
  /** How much came off the shoe: the first print is the worst of them. */
  strength: number;
  /** A shoe leaves a print; a tyre draws a line. */
  shape?: "shoe" | "tyre";
}

/**
 * A smeared shoe print left behind by somebody who's walked through a
 * dropping. They come in a short trail, getting fainter as it wears off the
 * sole, and they wash off easier than the mess that caused them.
 */
export class Footprint {
  private scene: THREE.Scene;
  private group: THREE.Group;
  private material: THREE.MeshBasicMaterial;
  private left: number;
  private age = 0;

  constructor(scene: THREE.Scene, tread: Tread) {
    this.scene = scene;
    this.left = tread.strength;

    this.material = SOLE.clone();
    this.material.opacity = this.left * 0.95;

    this.group = new THREE.Group();
    if (tread.shape === "tyre") this.buildStripe();
    else this.buildPrint();

    for (const part of this.group.children) part.rotation.x = -Math.PI / 2;
    // Sat just proud of the paving, which is itself a shade above the grass.
    this.group.position.set(tread.at.x, PATH_Y + 0.008, tread.at.z);
    this.group.rotation.y = tread.yaw;
    scene.add(this.group);
  }

  /** Sole and heel as two marks, which reads as a shoe from above. */
  private buildPrint(): void {
    const sole = new THREE.Mesh(
      new THREE.PlaneGeometry(0.13, 0.2),
      this.material,
    );
    sole.position.z = -0.05;
    this.group.add(sole);

    const heel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.12, 0.09),
      this.material,
    );
    heel.position.z = 0.11;
    this.group.add(heel);
  }

  /** A length of tyre line, with the tread pattern printed across it. */
  private buildStripe(): void {
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(0.07, TYRE_SEGMENT),
      this.material,
    );
    this.group.add(line);

    // Knobbles across the line, which is what you actually see of a tyre mark.
    const bars = Math.round(TYRE_SEGMENT / 0.11);
    for (let i = 0; i < bars; i++) {
      const bar = new THREE.Mesh(
        new THREE.PlaneGeometry(0.11, 0.035),
        this.material,
      );
      bar.position.z = (i / bars - 0.5) * TYRE_SEGMENT;
      this.group.add(bar);
    }
  }

  public getPosition(): THREE.Vector3 {
    return this.group.position.clone();
  }

  public isGone(): boolean {
    return this.left <= 0;
  }

  /** How much of a mess it still is, for the state of the park. */
  public weight(): number {
    return this.left;
  }

  /** A droplet landed on it. */
  public wash(): void {
    this.left = Math.max(0, this.left - SCRUB_PER_HIT);
    this.material.opacity = this.left * 0.95;
  }

  /** Footfall and weather see them off eventually without any help. */
  public update(delta: number): void {
    this.age += delta;
    if (this.age < LIFE) {
      this.material.opacity = this.left * 0.95 * (1 - this.age / LIFE);
      return;
    }
    this.left = 0;
  }

  public dispose(): void {
    this.scene.remove(this.group);
    for (const part of this.group.children) (part as THREE.Mesh).geometry.dispose();
    this.material.dispose();
  }
}
