import Phaser from "phaser";
import type { LootDrop } from "../combat/Structure";

export type WeaponKind = Exclude<LootDrop["weapon"], "none">;

/**
 * Ground weapon pickup (bottle / bat / brick + shop uniques).
 * Sprite is container-owned only so destroy() removes it from the world.
 */
export class WeaponPickup extends Phaser.GameObjects.Container {
  readonly kind: WeaponKind;
  taken = false;
  readonly sprite: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number, kind: WeaponKind) {
    super(scene, x, y);
    this.kind = kind;
    const key = `weapon_${kind}`;
    this.sprite = scene.make.image({ x: 0, y: 0, key, add: false });
    this.sprite.setOrigin(0.5, 1);
    this.add(this.sprite);
    scene.add.existing(this);
    this.setDepth(6);
  }

  get laneY(): number {
    return this.y;
  }

  /** Remove from ground — call when picked up. */
  collect(): void {
    if (this.taken) return;
    this.taken = true;
    this.destroy(true);
  }
}
