import Phaser from "phaser";

/**
 * Dropped skateboard — walk up and E to hop on.
 */
export class SkateboardPickup extends Phaser.GameObjects.Container {
  taken = false;
  readonly sprite: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    const key = scene.textures.exists("mount_skate") ? "mount_skate" : "mount_scooter";
    this.sprite = scene.make.image({ x: 0, y: 0, key, add: false });
    this.sprite.setOrigin(0.5, 1);
    this.sprite.setAngle(12);
    this.add(this.sprite);
    scene.add.existing(this);
    this.setDepth(6);
  }

  get laneY(): number {
    return this.y;
  }

  collect(): void {
    if (this.taken) return;
    this.taken = true;
    this.destroy(true);
  }
}
