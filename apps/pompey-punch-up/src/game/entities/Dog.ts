import Phaser from "phaser";
import { LANE } from "../constants";
import type { Civilian } from "./Civilian";

/**
 * Companion dog — heeled while owner walks; bolts when owner is downed.
 * Can be kicked — yelps and runs off.
 */
export class Dog extends Phaser.GameObjects.Container {
  private readonly sprite: Phaser.GameObjects.Image;
  private freed = false;
  private fleeDir = Math.random() < 0.5 ? 1 : -1;
  private rethinkAt = 0;
  private bob = Math.random() * 10;
  private hp = 2;
  private hitFlashUntil = 0;
  private hitLock = new Set<number>();
  yelping = false;

  constructor(scene: Phaser.Scene, x: number, y: number, _owner: Civilian) {
    super(scene, x, y);
    this.sprite = scene.make.image({ x: 0, y: 0, key: "dog", add: false });
    this.sprite.setOrigin(0.5, 1);
    this.add(this.sprite);
    scene.add.existing(this);
    this.setDepth(8);
  }

  get laneY(): number {
    return this.y;
  }

  get alive(): boolean {
    return this.hp > 0 && this.active;
  }

  get knockedOut(): boolean {
    return this.hp <= 0;
  }

  release(now: number): void {
    this.freed = true;
    this.rethinkAt = now + 200;
    this.fleeDir = Math.random() < 0.5 ? 1 : -1;
  }

  inKickReach(attackerX: number, attackerY: number, facing: number, reach = 58): boolean {
    if (!this.alive) return false;
    const dx = (this.x - attackerX) * facing;
    const dy = Math.abs(this.y - attackerY);
    return dx > -10 && dx < reach + 16 && dy < 36;
  }

  /** Returns true if the kick connected. */
  receiveKick(now: number, fromX: number, actionId: number): boolean {
    if (!this.alive) return false;
    if (this.hitLock.has(actionId)) return false;
    this.hitLock.add(actionId);
    this.hp -= 1;
    this.hitFlashUntil = now + 280;
    this.yelping = true;
    this.freed = true;
    this.fleeDir = this.x >= fromX ? 1 : -1;
    this.x += this.fleeDir * 32;
    this.y += (Math.random() - 0.5) * 10;
    this.sprite.setTint(0xffaaaa);
    this.scene.tweens.add({
      targets: this,
      x: this.x + this.fleeDir * 18,
      duration: 120,
      yoyo: false,
    });
    if (this.hp <= 0) {
      this.scene.tweens.add({
        targets: this,
        alpha: 0.25,
        y: this.y + 8,
        angle: this.fleeDir * 25,
        duration: 450,
        onComplete: () => {
          this.setVisible(false);
          this.setActive(false);
        },
      });
    }
    return true;
  }

  updateDog(now: number, dt: number, owner: Civilian): void {
    if (!this.alive) return;
    this.bob += dt * 8;
    this.sprite.y = Math.sin(this.bob) * 1.5;
    if (now >= this.hitFlashUntil) {
      this.sprite.clearTint();
      this.yelping = false;
    }

    if (!this.freed) {
      const side = owner.facing > 0 ? -28 : 28;
      this.x = Phaser.Math.Linear(this.x, owner.x + side, 0.12);
      this.y = Phaser.Math.Linear(this.y, owner.y + 4, 0.12);
      this.sprite.setFlipX(owner.facing < 0);
      this.setDepth(owner.depth - 1);
      return;
    }

    if (now >= this.rethinkAt && this.hp > 0) {
      this.rethinkAt = now + 350 + Math.random() * 400;
      // Keep fleeing mostly same way after a kick
      if (Math.random() < 0.25) this.fleeDir *= -1;
    }

    const spd = this.hp <= 1 ? 280 : 220;
    this.x += this.fleeDir * spd * dt;
    this.y += Math.sin(now * 0.008) * 20 * dt;
    this.sprite.setFlipX(this.fleeDir < 0);
    this.x = Phaser.Math.Clamp(this.x, LANE.minX, LANE.maxX);
    this.y = Phaser.Math.Clamp(this.y, LANE.minY, LANE.maxY);
    this.setDepth(10);
  }
}
