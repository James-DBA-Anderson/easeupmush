import Phaser from "phaser";
import type { Obstacle } from "./obstacles";
import type { WeaponKind } from "./WeaponPickup";

export type DestructibleKey =
  | "prop_bin"
  | "prop_bin_green"
  | "prop_bollard"
  | "car"
  | "coffee_van";

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
  coffee_van: {
    hits: 12,
    broken: "coffee_van_wrecked",
    label: "coffee van",
    scrapChance: 0.55,
    scrap: "bottle",
  },
};

export type CarSurface = "bonnet" | "roof" | "boot";

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
  /** Cars and intact bins — large enough to duck behind. */
  readonly canHide: boolean;
  private readonly hitLock = new Set<number>();
  private flashUntil = 0;
  private readonly hideMark?: Phaser.GameObjects.Graphics;
  private readonly restScale: number;

  constructor(scene: Phaser.Scene, spawn: DestructibleSpawn) {
    this.key = spawn.key;
    this.x = spawn.x;
    this.y = spawn.y;
    this.rx = spawn.rx;
    this.ry = spawn.ry;
    const stats = STATS[spawn.key];
    this.maxHits = stats.hits;
    this.hitsLeft = stats.hits;
    this.canHide =
      spawn.key === "car" ||
      spawn.key === "coffee_van" ||
      spawn.key === "prop_bin" ||
      spawn.key === "prop_bin_green";

    this.restScale = spawn.scale ?? 1;
    this.image = scene.add
      .image(spawn.x, spawn.y, spawn.key)
      .setOrigin(0.5, 1)
      .setScale(this.restScale)
      .setDepth(spawn.depth ?? 5);

    // Chalk crescent only under motors — bins don't need a footprint mark
    if (this.canHide && this.isOccluder) {
      this.hideMark = scene.add.graphics().setDepth((spawn.depth ?? 5) - 1);
      this.drawHideMark(0.55);
    }
  }

  get label(): string {
    return STATS[this.key].label;
  }

  get isCar(): boolean {
    return this.key === "car";
  }

  /** Parked motors that dent, wreck, and stay on the road like saloons. */
  get isMotorWreck(): boolean {
    return this.key === "car" || this.key === "coffee_van";
  }

  /** Roadside motors / vans that fighters draw behind when north of them. */
  get isOccluder(): boolean {
    return this.key === "car" || this.key === "coffee_van";
  }

  /** Still usable cover (wrecked bins don't hide you). */
  get offersCover(): boolean {
    if (!this.canHide) return false;
    if (!this.isMotorWreck && this.destroyed) return false;
    return true;
  }

  /** Soft chalk crescent at the feet — marks a hide spot without a UI badge. */
  private lastHideAlpha = -1;
  private lastHideX = Number.NaN;

  drawHideMark(alpha = 0.55): void {
    if (!this.hideMark) return;
    if (
      Math.abs(this.lastHideAlpha - alpha) < 0.02 &&
      Math.abs(this.lastHideX - this.x) < 0.5
    ) {
      return;
    }
    this.lastHideAlpha = alpha;
    this.lastHideX = this.x;
    const g = this.hideMark;
    g.clear();
    g.lineStyle(2.5, 0x1a1410, alpha);
    // Dashed feel via two arcs under the prop
    g.beginPath();
    g.arc(this.x, this.y + 2, this.rx * 0.85, Math.PI * 0.15, Math.PI * 0.85, false);
    g.strokePath();
    g.lineStyle(1.5, 0xf2e6d8, alpha * 0.7);
    g.beginPath();
    g.arc(this.x, this.y + 2, this.rx * 0.7, Math.PI * 0.2, Math.PI * 0.8, false);
    g.strokePath();
    // Tiny chalk hash so it reads as "cover" not just a shadow
    g.lineStyle(2, 0x1a1410, alpha * 0.85);
    const hx = this.x - this.rx * 0.15;
    g.lineBetween(hx - 5, this.y - 4, hx + 5, this.y + 2);
    g.lineBetween(hx - 2, this.y - 6, hx + 8, this.y);
  }

  /** Player is tucked into this cover if close and roughly behind / beside it. */
  coversPoint(px: number, py: number): boolean {
    if (!this.offersCover) return false;
    const dx = Math.abs(px - this.x);
    const dy = Math.abs(py - this.y);
    const padX = this.isOccluder ? 8 : 18;
    const padY = this.isOccluder ? 16 : 28;
    if (dx > this.rx + padX) return false;
    if (dy > this.ry + padY) return false;
    // Prefer the fight-lane side of motors (north), or tight to bins
    if (this.isOccluder && py > this.y - 6) return false;
    return true;
  }

  /** Map saloon canvas X (0–240) onto world X. */
  worldFromCanvas(cx: number): number {
    return this.x + (cx - 120) * (this.image.displayWidth / 240);
  }

  get bonnetMinX(): number {
    return this.worldFromCanvas(16);
  }
  get bonnetMaxX(): number {
    // Stop before the windscreen so you can't walk in front of the glass
    return this.worldFromCanvas(82);
  }
  get roofMinX(): number {
    return this.worldFromCanvas(96);
  }
  get roofMaxX(): number {
    return this.worldFromCanvas(172);
  }
  get bootMinX(): number {
    return this.worldFromCanvas(176);
  }
  get bootMaxX(): number {
    return this.worldFromCanvas(226);
  }

  deckRange(surface: CarSurface): { min: number; max: number } {
    if (surface === "roof") return { min: this.roofMinX, max: this.roofMaxX };
    if (surface === "boot") return { min: this.bootMinX, max: this.bootMaxX };
    return { min: this.bonnetMinX, max: this.bonnetMaxX };
  }

  deckY(surface: CarSurface): number {
    return surface === "roof" ? this.roofY : this.bonnetY;
  }

  /** Which walkable deck this X sits on, or null if over the windscreen gap / past the bumpers. */
  surfaceAt(x: number): CarSurface | null {
    if (x >= this.bonnetMinX - 6 && x <= this.bonnetMaxX + 4) return "bonnet";
    if (x >= this.roofMinX - 4 && x <= this.roofMaxX + 4) return "roof";
    if (x >= this.bootMinX - 4 && x <= this.bootMaxX + 8) return "boot";
    return null;
  }

  /** Visual Y of the bonnet / hood surface (feet) — matched to saloon art. */
  get bonnetY(): number {
    // Hood line sits ~mid-body on the car canvas (y≈50 of 110)
    return this.image.y - Math.round(this.image.displayHeight * 0.55);
  }

  /** Visual Y of the roof surface — matched to saloon art. */
  get roofY(): number {
    // Roof crest ~ canvas y=22 of 110
    return this.image.y - Math.round(this.image.displayHeight * 0.8);
  }

  /** Hop when someone jumps on the motor. */
  bounce(amount = 1): void {
    const img = this.image;
    const scene = img.scene;
    scene.tweens.killTweensOf(img);
    img.setAngle(0);
    img.x = this.x;
    img.y = this.y;
    img.setScale(this.restScale);
    const dip = 5 + amount * 5;
    scene.tweens.add({
      targets: img,
      y: this.y + dip,
      scaleY: this.restScale * (1 - 0.05 * amount),
      duration: 85,
      yoyo: true,
      ease: "Sine.easeOut",
      onComplete: () => {
        img.y = this.y;
        img.x = this.x;
        img.setScale(this.restScale);
      },
    });
  }

  /** Body-toss slam — write the motor off. */
  wreck(scene: Phaser.Scene): PropHitResult {
    if (this.destroyed) return { destroyed: true, label: this.label, scrap: null };
    scene.tweens.killTweensOf(this.image);
    this.image.y = this.y;
    this.image.x = this.x;
    this.image.setScale(this.restScale);
    this.hitsLeft = 0;
    return this.smash(scene);
  }

  asObstacle(): Obstacle | null {
    if (!this.blocks) return null;
    // Motors use a thin road footprint (Y is lane depth, not sprite height).
    // Leave a strip north so you can walk behind / duck for cover.
    if (this.key === "coffee_van") {
      // Full steel body — not a thin road strip like cars (those leave a walk-behind lane).
      const halfW = this.image.displayWidth * 0.44;
      const bodyH = this.image.displayHeight * 0.52;
      return {
        x: this.x,
        y: this.y - this.image.displayHeight * 0.4,
        rx: Math.max(this.rx * 0.92, halfW),
        ry: Math.max(this.ry * 0.75, bodyH * 0.5),
        kind: "prop",
      };
    }
    // Solid mid-body so you can't walk through; bumper ends stay open for climbing.
    if (this.isOccluder) {
      return {
        x: this.x,
        y: this.y - 6,
        rx: this.rx * 0.5,
        ry: this.isCar ? 12 : 14,
        kind: "prop",
      };
    }
    // Bins / bollards — slim lane footprint so folk walk round, not into a wall
    if (this.key === "prop_bin" || this.key === "prop_bin_green") {
      return {
        x: this.x,
        y: this.y,
        rx: this.destroyed ? 16 : 18,
        ry: 11,
        kind: "prop",
      };
    }
    if (this.key === "prop_bollard") {
      return {
        x: this.x,
        y: this.y,
        rx: this.destroyed ? 12 : 14,
        ry: 10,
        kind: "prop",
      };
    }
    return {
      x: this.x,
      y: this.y,
      rx: this.destroyed ? this.rx * 0.85 : this.rx,
      ry: this.destroyed ? this.ry * 0.85 : this.ry,
      kind: "prop",
    };
  }

  private applyMotorWear(scene: Phaser.Scene, wear: number, dir: number): void {
    if (!this.isMotorWreck) return;
    const prefix = this.key === "car" ? "car" : "coffee_van";
    if (wear >= 0.66 && scene.textures.exists(`${prefix}_dent2`)) {
      this.image.setTexture(`${prefix}_dent2`);
    } else if (wear >= 0.33 && scene.textures.exists(`${prefix}_dent1`)) {
      this.image.setTexture(`${prefix}_dent1`);
    }
    scene.tweens.add({
      targets: this.image,
      x: this.x + dir * 3,
      duration: 50,
      yoyo: true,
    });
  }

  /** One hit per attacker action id (actionUntil timestamp works as id). */
  canAcceptHit(actionId: number): boolean {
    if (this.destroyed) return false;
    if (this.hitLock.has(actionId)) return false;
    return true;
  }

  inReach(attackerX: number, attackerY: number, reach: number, facing: number): boolean {
    const dx = this.x - attackerX;
    const motor = this.isOccluder;
    const spriteTop = this.y - this.image.displayHeight * (motor ? 0.85 : 1) - 4;
    const bodyPad = motor ? 10 : 28;
    const lanePad = motor ? 24 : 56;
    const hugPad = motor ? 6 : 18;
    const overlappingSprite =
      attackerY >= spriteTop &&
      attackerY <= this.y + (motor ? 8 : 18) &&
      Math.abs(dx) <= this.rx + bodyPad;
    const closeOnLane = Math.abs(this.y - attackerY) <= this.ry + lanePad;
    if (!overlappingSprite && !closeOnLane) return false;

    // Already on it / hugging the body — facing doesn't matter
    if (Math.abs(dx) <= this.rx + hugPad) return true;

    if (facing > 0 && dx < -8) return false;
    if (facing < 0 && dx > 8) return false;
    const reachMul = motor ? 0.45 : 0.75;
    return Math.abs(dx) <= reach + this.rx * reachMul;
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
      // SF2-style staged wreck — saloons and the Eastney coffee van
      if (this.isMotorWreck) {
        this.applyMotorWear(scene, wear, dir);
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

    // Motors leave a wreck that still blocks; bins/bollards become debris you can walk through
    if (this.isMotorWreck) {
      this.blocks = true;
      this.rx *= 0.9;
      this.drawHideMark(0.4);
    } else {
      this.blocks = false;
      this.hideMark?.clear();
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
    if (this.destroyed && !this.isMotorWreck) return;
    if (now >= this.flashUntil) this.image.clearTint();
    // Keep chalk mark under props that get nudged by hits
    if (this.hideMark && this.offersCover && Math.abs(this.image.x - this.x) > 0.5) {
      this.drawHideMark(0.55);
    }
  }

  destroy(): void {
    this.hideMark?.destroy();
    this.image.destroy();
    this.blocks = false;
    this.destroyed = true;
  }
}
