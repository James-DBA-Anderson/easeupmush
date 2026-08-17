import Phaser from "phaser";
import { LANE } from "../constants";

/** Rare energy drink — bright blue disc, rolls away then drains in five seconds. */
export class BuzzballPickup extends Phaser.GameObjects.Container {
  static readonly LIFE_MS = 5000;

  taken = false;
  readonly expireAt: number;
  private readonly disc: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly bornAt: number;
  private readonly restY: number;
  private vx: number;
  private rollSpin = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, rollDir: number) {
    super(scene, x, y);
    this.bornAt = scene.time.now;
    this.expireAt = this.bornAt + BuzzballPickup.LIFE_MS;
    this.restY = y;
    const dir = rollDir >= 0 ? 1 : -1;
    this.vx = dir * (150 + Math.random() * 70);

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

  refresh(now: number, dt: number): void {
    if (Math.abs(this.vx) > 6) {
      this.x += this.vx * dt;
      this.vx *= Math.pow(0.985, dt * 60);
      if (this.x <= LANE.minX) {
        this.x = LANE.minX;
        this.vx = Math.abs(this.vx) * 0.32;
      } else if (this.x >= LANE.maxX) {
        this.x = LANE.maxX;
        this.vx = -Math.abs(this.vx) * 0.32;
      }
    } else {
      this.vx = 0;
    }

    this.rollSpin += this.vx * dt * 0.08;

    const t = this.remaining / BuzzballPickup.LIFE_MS;
    const r = 7 + 11 * t;
    const bob = Math.abs(this.vx) > 6 ? Math.sin(now * 0.04) * 2 : Math.sin(now * 0.012) * 3;
    this.y = this.restY + bob;

    this.disc.clear();
    this.disc.fillStyle(0xb8f7ff, 0.35);
    this.disc.fillCircle(0, -14, r + 5);
    this.disc.fillStyle(0x1ad0ff, 1);
    this.disc.fillCircle(0, -14, r);
    this.disc.lineStyle(2.5, 0x063a7a, 1);
    this.disc.strokeCircle(0, -14, r);
    this.disc.fillStyle(0xffffff, 0.35);
    this.disc.fillCircle(-4, -19, Math.max(2, r * 0.22));
    this.disc.setRotation(this.rollSpin);
    this.setAlpha(0.4 + 0.6 * t);
    this.label.setScale(0.85 + 0.15 * t);
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
