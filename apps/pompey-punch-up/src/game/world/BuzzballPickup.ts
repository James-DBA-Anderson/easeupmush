import Phaser from "phaser";

/** Rare energy drink — bright blue disc, gone in five seconds. */
export class BuzzballPickup extends Phaser.GameObjects.Container {
  static readonly LIFE_MS = 5000;

  taken = false;
  readonly expireAt: number;
  private readonly disc: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly bornAt: number;
  private readonly restY: number;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    this.bornAt = scene.time.now;
    this.expireAt = this.bornAt + BuzzballPickup.LIFE_MS;
    this.restY = y;

    this.disc = scene.add.graphics();
    this.label = scene.add
      .text(0, -15, "buzz", {
        fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
        fontSize: "12px",
        color: "#f4ffff",
        stroke: "#0a4a88",
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    this.add([this.disc, this.label]);
    scene.add.existing(this);
    this.setDepth(9);
    this.setScale(0.2);
    scene.tweens.add({
      targets: this,
      scale: 1,
      duration: 200,
      ease: "Back.easeOut",
    });
  }

  get laneY(): number {
    return this.y;
  }

  get remaining(): number {
    return Math.max(0, this.expireAt - this.scene.time.now);
  }

  get expired(): boolean {
    return !this.taken && this.scene.time.now >= this.expireAt;
  }

  refresh(now: number): void {
    const t = this.remaining / BuzzballPickup.LIFE_MS;
    const r = 7 + 11 * t;
    this.disc.clear();
    this.disc.fillStyle(0xb8f7ff, 0.35);
    this.disc.fillCircle(0, -14, r + 5);
    this.disc.fillStyle(0x1ad0ff, 1);
    this.disc.fillCircle(0, -14, r);
    this.disc.lineStyle(2.5, 0x063a7a, 1);
    this.disc.strokeCircle(0, -14, r);
    this.disc.fillStyle(0xffffff, 0.35);
    this.disc.fillCircle(-4, -19, Math.max(2, r * 0.22));
    this.setAlpha(0.4 + 0.6 * t);
    this.label.setScale(0.85 + 0.15 * t);
    this.y = this.restY + Math.sin(now * 0.012) * 3;
  }

  collect(): void {
    if (this.taken) return;
    this.taken = true;
    this.destroy(true);
  }

  poof(): void {
    if (this.taken) return;
    this.taken = true;
    this.scene.tweens.add({
      targets: this,
      scale: 0.2,
      alpha: 0,
      duration: 180,
      onComplete: () => this.destroy(true),
    });
  }
}
