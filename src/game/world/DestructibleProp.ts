import Phaser from "phaser";
import type { Obstacle } from "./obstacles";
import type { WeaponKind } from "./WeaponPickup";

export type DestructibleKey =
  | "prop_bin"
  | "prop_bin_green"
  | "prop_bollard"
  | "car";

export interface DestructibleSpawn {
  key: DestructibleKey;
  x: number;
  y: number;
  rx: number;
  ry: number;
  scale?: number;
  depth?: number;
}

const STATS: Record<
  DestructibleKey,
  { hits: number; broken: string; label: string; scrapChance: number; scrap?: WeaponKind }
> = {
  prop_bin: {
    hits: 3,
    broken: "prop_bin_broken",
    label: "bin",
    scrapChance: 0.45,
    scrap: "bottle",
  },
  prop_bin_green: {
    hits: 3,
    broken: "prop_bin_broken",
    label: "bin",
    scrapChance: 0.4,
    scrap: "bottle",
  },
  prop_bollard: {
    hits: 4,
    broken: "prop_bollard_broken",
    label: "bollard",
    scrapChance: 0.15,
    scrap: "brick",
  },
  car: {
    hits: 12,
    broken: "car_wrecked",
    label: "motor",
    scrapChance: 0.65,
    scrap: "brick",
  },
};

export type PropHitResult = {
  destroyed: boolean;
  label: string;
  scrap: WeaponKind | null;
};

/**
 * Fight-lane scenery that wears down under punches, kicks, weapons, throws.
 */
export class DestructibleProp {
  readonly key: DestructibleKey;
  x: number;
  y: number;
  rx: number;
  ry: number;
  readonly image: Phaser.GameObjects.Image;
  private hitsLeft: number;
  private readonly maxHits: number;
  destroyed = false;
  /** Still blocks movement (wrecks stay in the way). */
  blocks = true;
  private readonly hitLock = new Set<number>();
  private flashUntil = 0;

  constructor(scene: Phaser.Scene, spawn: DestructibleSpawn) {
    this.key = spawn.key;
    this.x = spawn.x;
    this.y = spawn.y;
    this.rx = spawn.rx;
    this.ry = spawn.ry;
    const stats = STATS[spawn.key];
    this.maxHits = stats.hits;
    this.hitsLeft = stats.hits;

    this.image = scene.add
      .image(spawn.x, spawn.y, spawn.key)
      .setOrigin(0.5, 1)
      .setScale(spawn.scale ?? 1)
      .setDepth(spawn.depth ?? 5);
  }

  get label(): string {
    return STATS[this.key].label;
  }

  get isCar(): boolean {
    return this.key === "car";
  }

  /** Visual Y of the bonnet surface (feet). */
  get bonnetY(): number {
    return this.y - 28;
  }

  /** Visual Y of the roof surface. */
  get roofY(): number {
    return this.y - 48;
  }

  asObstacle(): Obstacle | null {
    if (!this.blocks) return null;
    // Cars are climbable platforms — not solid walls
    if (this.isCar) return null;
    return {
      x: this.x,
      y: this.y,
      rx: this.destroyed ? this.rx * 0.85 : this.rx,
      ry: this.destroyed ? this.ry * 0.85 : this.ry,
      kind: "prop",
    };
  }

  /** One hit per attacker action id (actionUntil timestamp works as id). */
  canAcceptHit(actionId: number): boolean {
    if (this.destroyed) return false;
    if (this.hitLock.has(actionId)) return false;
    return true;
  }

  inReach(attackerX: number, attackerY: number, reach: number, facing: number): boolean {
    const dx = this.x - attackerX;
    const dy = this.y - attackerY;
    if (Math.abs(dy) > this.ry + 22) return false;
    if (facing > 0 && dx < -8) return false;
    if (facing < 0 && dx > 8) return false;
    return Math.abs(dx) <= reach + this.rx * 0.55;
  }

  takeHit(
    scene: Phaser.Scene,
    now: number,
    actionId: number,
    power: number,
    fromX: number,
  ): PropHitResult | null {
    if (this.destroyed || !this.canAcceptHit(actionId)) return null;
    this.hitLock.add(actionId);

    const dmg = Math.max(1, Math.round(power * 2.2));
    this.hitsLeft = Math.max(0, this.hitsLeft - dmg);
    this.flashUntil = now + 120;

    // Nudge away from the hit
    const dir = Math.sign(this.x - fromX) || 1;
    this.x += dir * (4 + power * 6);
    this.image.x = this.x;
    this.image.setTint(0xffdddd);
    scene.tweens.add({
      targets: this.image,
      angle: dir * (6 + power * 8),
      duration: 80,
      yoyo: true,
    });

    if (this.hitsLeft > 0) {
      const wear = 1 - this.hitsLeft / this.maxHits;
      this.image.setAlpha(1 - wear * 0.12);
      // SF2-style staged wreck
      if (this.key === "car") {
        if (wear >= 0.66 && scene.textures.exists("car_dent2")) {
          this.image.setTexture("car_dent2");
        } else if (wear >= 0.33 && scene.textures.exists("car_dent1")) {
          this.image.setTexture("car_dent1");
        }
        scene.tweens.add({
          targets: this.image,
          x: this.x + dir * 3,
          duration: 50,
          yoyo: true,
        });
      }
      return { destroyed: false, label: this.label, scrap: null };
    }

    return this.smash(scene);
  }

  /** Thrown bottle/brick — no action lock, one hit consumes the projectile. */
  takeThrow(scene: Phaser.Scene, now: number, power: number, fromX: number): PropHitResult | null {
    if (this.destroyed) return null;
    return this.takeHit(scene, now, now + Math.random(), power, fromX);
  }

  private smash(scene: Phaser.Scene): PropHitResult {
    this.destroyed = true;
    const stats = STATS[this.key];
    if (scene.textures.exists(stats.broken)) {
      this.image.setTexture(stats.broken);
    }
    this.image.clearTint();
    this.image.setAlpha(0.95);
    this.image.setAngle((Math.random() - 0.5) * 20);

    // Cars leave a wreck that still blocks; bins/bollards become debris you can walk through
    if (this.key === "car") {
      this.blocks = true;
      this.rx *= 0.9;
    } else {
      this.blocks = false;
      scene.tweens.add({
        targets: this.image,
        alpha: 0.35,
        scaleX: this.image.scaleX * 0.85,
        scaleY: this.image.scaleY * 0.55,
        duration: 400,
      });
    }

    const scrap =
      stats.scrap && Math.random() < stats.scrapChance ? stats.scrap : null;
    return { destroyed: true, label: this.label, scrap };
  }

  update(now: number): void {
    if (this.destroyed) return;
    if (now >= this.flashUntil) this.image.clearTint();
  }
}
