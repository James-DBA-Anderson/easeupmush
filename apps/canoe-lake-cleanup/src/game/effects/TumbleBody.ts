import * as THREE from "three";
import { isBlocked, slideMove } from "../world/blocking";
import { isInLake, PATH_Y, WATER_Y } from "../world/lake";
import { groundHeight } from "../world/terrain";

/**
 * Lightweight ragdoll tumble for a detached mesh — gravity, bounce off park
 * blockers, and eventually lie still. Not a real physics sim; just enough to
 * look like they've come off a bike.
 *
 * Floor clearance uses {@link radius} so a spinning body (origin at the feet /
 * seat) does not bury into the paving.
 */
export class TumbleBody {
  readonly mesh: THREE.Object3D;
  readonly vel = new THREE.Vector3();
  readonly spin = new THREE.Vector3();
  private grounded = 0;
  private radius: number;
  /** Seconds lying still before callers can tidy them away. */
  settledFor = 0;

  constructor(mesh: THREE.Object3D, radius = 0.55) {
    this.mesh = mesh;
    this.radius = radius;
  }

  /** Launch away from a blast, carrying some of the vehicle's speed. */
  kick(
    forward: THREE.Vector3,
    away: THREE.Vector3,
    carrySpeed: number,
  ): void {
    const shove =
      away.lengthSq() > 0.01
        ? away.clone().normalize()
        : forward.clone().negate();
    this.vel
      .copy(forward)
      .multiplyScalar(carrySpeed * 0.75)
      .addScaledVector(shove, 3.4 + Math.random() * 1.6);
    this.vel.y = 2.2 + Math.random() * 1.4;
    this.spin.set(
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 6,
      (Math.random() - 0.5) * 12,
    );
    this.grounded = 0;
    this.settledFor = 0;
    // Start clear of the deck so the first fall frame isn't underground.
    const here = this.mesh.position;
    here.y = Math.max(here.y, this.floorY(here.x, here.z));
  }

  private floorY(x: number, z: number): number {
    if (isInLake(x, z)) return WATER_Y + this.radius * 0.45;
    return groundHeight(x, z) + PATH_Y + this.radius;
  }

  public update(delta: number): void {
    this.vel.y -= 18 * delta;

    const here = this.mesh.position;
    const step = this.vel.clone().multiplyScalar(delta);
    const landed = slideMove(here.x, here.z, step.x, step.z, this.radius);
    const slid =
      Math.abs(landed.x - (here.x + step.x)) > 0.01 ||
      Math.abs(landed.z - (here.z + step.z)) > 0.01;

    if (slid || isBlocked(landed.x, landed.z, this.radius)) {
      // Glanced a wall / bench — bounce and tumble harder.
      if (Math.abs(landed.x - here.x) < 0.001) this.vel.x *= -0.55;
      if (Math.abs(landed.z - here.z) < 0.001) this.vel.z *= -0.55;
      this.vel.y = Math.max(this.vel.y, 1.2 + Math.random());
      this.spin.x += (Math.random() - 0.5) * 8;
      this.spin.z += (Math.random() - 0.5) * 8;
      this.vel.multiplyScalar(0.72);
    }

    here.x = landed.x;
    here.z = landed.z;
    here.y += this.vel.y * delta;

    const floor = this.floorY(here.x, here.z);
    if (here.y <= floor) {
      here.y = floor;
      if (this.vel.y < 0) this.vel.y *= -0.35;
      this.vel.x *= Math.max(0, 1 - 2.8 * delta);
      this.vel.z *= Math.max(0, 1 - 2.8 * delta);
      this.spin.multiplyScalar(Math.max(0, 1 - 2.2 * delta));
      this.grounded += delta;
    } else {
      this.grounded = 0;
    }

    this.mesh.rotation.x += this.spin.x * delta;
    this.mesh.rotation.y += this.spin.y * delta;
    this.mesh.rotation.z += this.spin.z * delta;

    const flat = Math.hypot(this.vel.x, this.vel.z);
    if (this.grounded > 0.35 && flat < 0.45 && Math.abs(this.vel.y) < 0.8) {
      this.settledFor += delta;
      // Ease onto their side once the bounce dies.
      const side = this.mesh.rotation.z > 0 ? Math.PI / 2 : -Math.PI / 2;
      this.mesh.rotation.z +=
        (side - this.mesh.rotation.z) * Math.min(1, 4 * delta);
      this.mesh.rotation.x *= Math.max(0, 1 - 3 * delta);
      here.y = floor;
    } else {
      this.settledFor = 0;
    }
  }

  public isSettled(forSeconds = 1.4): boolean {
    return this.settledFor >= forSeconds;
  }
}
