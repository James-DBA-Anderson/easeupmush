import Phaser from "phaser";
import { GAME_WIDTH } from "../constants";
import type { Fighter } from "../entities/Fighter";
import type { WeaponKind } from "./WeaponPickup";

export type ThrowableKind = Extract<WeaponKind, "bottle" | "brick">;

/** ~⅔ of the screen — how far a throw travels before landing. */
const THROW_RANGE = GAME_WIDTH * (2 / 3);
const GRAVITY = 1100;
/** Hand height when released. */
const RELEASE_Z = 42;

/**
 * Bottle / brick in flight — thrown forward with a slight arc, lands ~⅔ screen away.
 */
export class ThrownWeapon extends Phaser.GameObjects.Container {
  readonly kind: ThrowableKind;
  readonly owner: Fighter;
  readonly facing: number;
  alive = true;
  /** Lane depth (fight plane Y) — stays fixed; height is airZ. */
  groundY: number;
  /** Height above the lane (visual = -airZ). */
  private airZ = RELEASE_Z;
  private vx: number;
  /** Upward positive. */
  private vz: number;
  private readonly sprite: Phaser.GameObjects.Image;
  private spin = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    groundY: number,
    kind: ThrowableKind,
    owner: Fighter,
    facing: number,
  ) {
    super(scene, x, groundY);
    this.kind = kind;
    this.owner = owner;
    this.facing = facing;
    this.groundY = groundY;

    // Tune flight time so horizontal travel ≈ THROW_RANGE with a mild arc
    const flightTime = kind === "brick" ? 0.78 : 0.72;
    this.vx = facing * (THROW_RANGE / flightTime);
    // vz0 so we return to ground at ~flightTime: z0 + vz0*T - 0.5*g*T^2 ≈ 0
    this.vz = (0.5 * GRAVITY * flightTime * flightTime - RELEASE_Z) / flightTime;

    this.sprite = scene.make.image({ x: 0, y: -this.airZ, key: `weapon_${kind}`, add: false });
    this.sprite.setOrigin(0.5, 0.5);
    this.sprite.setScale(kind === "brick" ? 0.95 : 0.85);
    this.add(this.sprite);
    scene.add.existing(this);
    this.setDepth(20);
  }

  update(dt: number): "flying" | "landed" | "dead" {
    if (!this.alive) return "dead";

    // Cap dt so a hitch doesn't bury the projectile or invert the arc
    const step = Math.min(dt, 1 / 30);

    this.x += this.vx * step;
    this.vz -= GRAVITY * step;
    this.airZ += this.vz * step;

    this.spin += this.facing * 540 * step;
    this.sprite.setAngle(this.spin);
    this.y = this.groundY;

    if (this.airZ <= 0) {
      this.airZ = 0;
      this.sprite.y = 0;
      this.alive = false;
      return "landed";
    }

    this.sprite.y = -this.airZ;
    return "flying";
  }

  /** Hit while airborne (not on the pebbles). */
  canHit(target: Fighter): boolean {
    if (!this.alive || this.airZ < 10) return false;
    if (target === this.owner) return false;
    if (target.structure.isOut()) return false;
    const dx = Math.abs(target.x - this.x);
    const dy = Math.abs(target.laneY - this.groundY);
    return dx < 38 && dy < 30;
  }

  destroySelf(): void {
    this.alive = false;
    this.destroy(true);
  }
}

export function isThrowable(kind: string): kind is ThrowableKind {
  return kind === "bottle" || kind === "brick";
}
