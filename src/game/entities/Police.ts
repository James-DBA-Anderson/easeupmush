import Phaser from "phaser";
import { Fighter, inReach } from "./Fighter";
import { LANE } from "../constants";
import { pickLook } from "../assets/pompeyLooks";

/**
 * Arrive at high wanted. Hold → taser → cuff to immobilise any scrap lads.
 * A bung buys them off — they pocket it and walk.
 */
export class Police extends Fighter {
  private thinkAt = 0;
  private target: Fighter | null = null;
  /** Took a bung — heading off the front. */
  bribed = false;
  private bribeDir = 1;

  constructor(scene: Phaser.Scene, x: number, y: number, name = "PC") {
    const look = pickLook("police");
    super(scene, x, y, "police", look.id, name, {
      toughness: 1.6,
      scaleX: look.scaleX,
      scaleY: look.scaleY,
      loot: { money: 0, weapon: "none" },
    });
    this.speed = 140;
    this.runSpeed = 220;
  }

  /** Pocket the cash and scarper. */
  takeBribe(now: number, awayFromX: number): void {
    this.bribed = true;
    this.target = null;
    this.bribeDir = this.x >= awayFromX ? 1 : -1;
    this.dropBlock(now);
    this.action = "run";
    this.actionUntil = now;
    this.running = true;
  }

  /** Off-camera after a bung — safe to despawn. */
  get leftAfterBribe(): boolean {
    if (!this.bribed) return false;
    return this.x < LANE.minX - 80 || this.x > LANE.maxX + 80;
  }

  updatePolice(now: number, dt: number, fighters: Fighter[]): void {
    this.tickKnockdown(now);

    try {
      if (this.structure.isOut()) return;
      if (this.heldBy) {
        this.action = "down";
        return;
      }

      if (this.bribed) {
        const spd = this.runSpeed * 0.9;
        this.x += this.bribeDir * spd * dt;
        this.running = true;
        this.action = "run";
        this.setFacing(this.bribeDir, now);
        this.groundY = this.y;
        return;
      }

      if (!this.canAct(now)) return;
      if (this.busy) return;

      // Prefer uncuffed fighters who are scrap (player/enemy), skip civilians unless attacking
      const candidates = fighters.filter(
        (f) =>
          f !== this &&
          !f.structure.isOut() &&
          (f.team === "player" || f.team === "enemy") &&
          Phaser.Math.Distance.Between(this.x, this.y, f.x, f.y) < 600,
      );

      candidates.sort(
        (a, b) =>
          Phaser.Math.Distance.Between(this.x, this.y, a.x, a.y) -
          Phaser.Math.Distance.Between(this.x, this.y, b.x, b.y),
      );

      this.target = candidates[0] ?? null;
      if (!this.target) {
        this.action = "idle";
        return;
      }

      this.faceToward(this.target.x, now);

      if (inReach(this, this.target, 50) && now >= this.thinkAt) {
        this.thinkAt = now + 450;
        const t = this.target;
        if (t.structure.isDisabled(now) || t.structure.downed || t.structure.isOpen(now)) {
          this.tryCuff(now);
        } else if (Math.random() < 0.4) {
          this.tryTaser(now);
        } else {
          this.tryHold(now);
        }
        return;
      }

      const dx = this.target.x - this.x;
      const dy = this.target.y - this.y;
      const len = Math.hypot(dx, dy) || 1;
      const legMul = this.structure.moveSpeedFactor();
      this.running = Math.abs(dx) > 160 && legMul > 0.55;
      const spd = (this.running ? this.runSpeed : this.speed) * legMul;
      this.x += (dx / len) * spd * dt;
      this.y += (dy / len) * spd * 0.8 * dt;
      this.groundY = this.y;
      this.action = this.running ? "run" : "move";
      this.x = Phaser.Math.Clamp(this.x, LANE.minX, LANE.maxX);
      this.y = Phaser.Math.Clamp(this.y, LANE.minY, LANE.maxY);
    } finally {
      this.refreshVisuals(now, dt);
    }
  }
}
