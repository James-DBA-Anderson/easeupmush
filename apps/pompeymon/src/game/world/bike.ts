import Phaser from "phaser";
import { GBA_W } from "../constants";
import { persistRun, run, saveOverworld, takeItem } from "../run";
import { ensureBikeArt } from "../sprites/bike";
import { ensureNpcSheets, npcAnim, npcSheet } from "../sprites/npc";
import { isTouchUi } from "../touch";
import type { Line } from "../ui/MsgBox";
import { near } from "../walk";

export const CHORE_LINE = "Ahh my biek's been chored.";

export function dismountHint(): string {
  return isTouchUi() ? "Press BACK to get off." : "Press ESC to get off.";
}

const HALF = GBA_W / 2;

type Say = (line: Line | Line[]) => void;

export class BikeField {
  private parkedSpr?: Phaser.GameObjects.Image;
  private rideSpr?: Phaser.GameObjects.Image;
  private thief?: Phaser.GameObjects.Sprite;
  private stealing = false;
  private wait = 90;
  private readonly key: string;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
    private readonly say: Say,
  ) {
    this.key = scene.scene.key;
    ensureBikeArt(scene);
    ensureNpcSheets(scene);
    (scene as Phaser.Scene & { bikes?: BikeField }).bikes = this;
    this.restore();
    this.syncRide();
  }

  tick(): void {
    this.syncRide();
    this.tryChore();
  }

  /** BACK / ESC while riding. */
  tryBack(): boolean {
    if (!run.mounted) return false;
    this.dismount();
    this.say("Got off.");
    return true;
  }

  tryExamine(): boolean {
    const p = run.parked;
    if (!p || p.scene !== this.key) return false;
    if (!near(this.player, { x: p.x - 10, y: p.y - 8, w: 20, h: 14 }, 10)) return false;
    if (p.wheel) {
      this.say("Front wheel. Lock's still on it.");
      return true;
    }
    this.mount();
    this.say(["Got on.", dismountHint()]);
    return true;
  }

  /** Park here if riding into a building. Always stamp the door so leaving does not use a stale street save. */
  stashIndoor(): void {
    saveOverworld(this.key, { x: this.player.x, y: this.player.y });
    if (!run.mounted) return;
    this.dismount();
  }

  private restore(): void {
    const p = run.parked;
    if (!p || p.scene !== this.key || run.mounted) return;
    this.drawParked();
  }

  private mount(): void {
    run.mounted = true;
    run.parked = null;
    this.parkedSpr?.destroy();
    this.parkedSpr = undefined;
    this.syncRide();
  }

  private dismount(): void {
    run.mounted = false;
    run.parked = {
      scene: this.key,
      x: this.player.x,
      y: this.player.y + 6,
      locked: run.items.includes("lock"),
      wheel: false,
    };
    this.rideSpr?.destroy();
    this.rideSpr = undefined;
    this.drawParked();
    this.wait = 120;
  }

  private drawParked(): void {
    this.parkedSpr?.destroy();
    const p = run.parked;
    if (!p || p.scene !== this.key) return;
    const tex = p.wheel ? "bike-wheel" : p.locked ? "bike-lock" : "bike-park";
    this.parkedSpr = this.scene.add.image(p.x, p.y, tex).setDepth(8);
  }

  private syncRide(): void {
    if (!run.mounted) {
      this.rideSpr?.destroy();
      this.rideSpr = undefined;
      return;
    }
    if (!this.rideSpr) {
      this.rideSpr = this.scene.add.image(this.player.x, this.player.y + 8, "bike-park").setDepth(9);
    }
    this.rideSpr.setPosition(this.player.x, this.player.y + 8);
    this.rideSpr.setFlipX(this.player.flipX);
    this.rideSpr.setDepth(this.player.y + 1);
  }

  private tryChore(): void {
    if (this.stealing || run.mounted || !run.items.includes("bmx")) return;
    const p = run.parked;
    if (!p || p.scene !== this.key || p.wheel) return;
    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y);
    if (dist < HALF) return;
    this.wait -= 1;
    if (this.wait > 0) return;
    this.wait = 80;
    if (Math.random() > 0.35) return;
    this.startSteal(p.locked);
  }

  private startSteal(locked: boolean): void {
    const p = run.parked;
    if (!p) return;
    if (locked && Math.random() < 0.55) return;
    this.stealing = true;
    const cam = this.scene.cameras.main.worldView;
    const fromLeft = this.player.x > p.x;
    const sx = fromLeft ? cam.x - 12 : cam.x + cam.width + 12;
    const sy = Phaser.Math.Clamp(p.y, cam.y + 8, cam.y + cam.height - 8);
    const thief = this.scene.add.sprite(sx, sy, npcSheet("hoodie"), "idle-side");
    thief.play(npcAnim("hoodie", "walk-side"));
    thief.setFlipX(fromLeft);
    thief.setDepth(12);
    this.thief = thief;
    const carry = locked && Math.random() < 0.7;
    this.scene.tweens.add({
      targets: thief,
      x: p.x,
      y: p.y - 8,
      duration: 700,
      ease: "Linear",
      onComplete: () => this.grab(carry),
    });
  }

  private grab(carry: boolean): void {
    const p = run.parked;
    const thief = this.thief;
    if (!p || !thief) {
      this.stealing = false;
      return;
    }
    const seen = this.scene.cameras.main.worldView.contains(p.x, p.y);
    const locked = p.locked || run.items.includes("lock");
    takeItem("bmx");
    if (locked) run.lockChored = true;
    persistRun();
    this.parkedSpr?.destroy();
    this.parkedSpr = undefined;
    if (carry) {
      run.parked = { ...p, wheel: true, locked: true };
      this.drawParked();
      const frame = this.scene.add.image(thief.x, thief.y - 4, "bike-park").setDepth(13);
      thief.setData("bike", frame);
    } else {
      run.parked = null;
      const bike = this.scene.add.image(thief.x, thief.y + 10, "bike-park").setDepth(13);
      thief.setData("bike", bike);
    }
    if (seen) this.say(CHORE_LINE);
    const cam = this.scene.cameras.main.worldView;
    const awayX = thief.x < this.player.x ? cam.x - 40 : cam.x + cam.width + 40;
    const held = thief.getData("bike") as Phaser.GameObjects.Image | undefined;
    this.scene.tweens.add({
      targets: thief,
      x: awayX,
      duration: 1100,
      ease: "Linear",
      onUpdate: () => {
        held?.setPosition(thief.x, thief.y + (carry ? -4 : 10));
        if (!this.scene.cameras.main.worldView.contains(thief.x, thief.y)) {
          held?.destroy();
        }
      },
      onComplete: () => {
        held?.destroy();
        thief.destroy();
        this.thief = undefined;
        this.stealing = false;
      },
    });
  }
}

export function grassOnBike(): boolean {
  return run.mounted && Math.random() < 0.88;
}
