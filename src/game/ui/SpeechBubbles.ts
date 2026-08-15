import Phaser from "phaser";
import type { Fighter } from "../entities/Fighter";

interface Bubble {
  owner: Fighter;
  root: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  text: Phaser.GameObjects.Text;
  born: number;
  life: number;
  sticky: boolean;
}

/**
 * Comic speech bubbles that stick above a character then fade.
 * Floored / KO'd folk keep quiet. Sticky lines wait for the scene to clear them.
 */
export class SpeechBubbles {
  private readonly bubbles: Bubble[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  private canSpeak(owner: Fighter): boolean {
    const s = owner.structure;
    if (s.isOut()) return false;
    if (s.downed) return false;
    if (owner.action === "down") return false;
    return true;
  }

  say(owner: Fighter, line: string, lifeMs = 2200): void {
    this.spawn(owner, line, lifeMs, false);
  }

  /** Stays up until clearOwner / clear — for paused story beats. */
  saySticky(owner: Fighter, line: string): void {
    this.spawn(owner, line, Number.POSITIVE_INFINITY, true);
  }

  clearOwner(owner: Fighter): void {
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      if (this.bubbles[i].owner === owner) {
        this.bubbles[i].root.destroy();
        this.bubbles.splice(i, 1);
      }
    }
  }

  private spawn(owner: Fighter, line: string, lifeMs: number, sticky: boolean): void {
    if (!this.canSpeak(owner) && !sticky) return;

    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      if (this.bubbles[i].owner === owner) {
        this.bubbles[i].root.destroy();
        this.bubbles.splice(i, 1);
      }
    }

    const root = this.scene.add.container(owner.x, owner.y - 100).setDepth(250);
    const text = this.scene.add
      .text(0, 0, line, {
        fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
        fontSize: "14px",
        color: "#1a1410",
        align: "center",
        wordWrap: { width: 200 },
      })
      .setOrigin(0.5);

    const padX = 10;
    const padY = 6;
    const w = Math.max(36, text.width + padX * 2);
    const h = Math.max(22, text.height + padY * 2);

    const bg = this.scene.add.graphics();
    this.drawBubble(bg, w, h);

    root.add([bg, text]);
    this.bubbles.push({
      owner,
      root,
      bg,
      text,
      born: this.scene.time.now,
      life: lifeMs,
      sticky,
    });
  }

  private drawBubble(g: Phaser.GameObjects.Graphics, w: number, h: number): void {
    g.clear();
    g.fillStyle(0xfff8e8, 1);
    g.lineStyle(3, 0x1a1410, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    g.fillTriangle(-6, h / 2 - 1, 6, h / 2 - 1, 0, h / 2 + 12);
    g.lineBetween(-6, h / 2 - 1, 0, h / 2 + 12);
    g.lineBetween(6, h / 2 - 1, 0, h / 2 + 12);
  }

  update(now: number): void {
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      const age = now - b.born;
      if (!b.owner.active || (!b.sticky && (age >= b.life || !this.canSpeak(b.owner)))) {
        b.root.destroy();
        this.bubbles.splice(i, 1);
        continue;
      }
      b.root.x = b.owner.x;
      b.root.y = b.owner.y - 96;
      b.root.setDepth(250 + Math.floor(b.owner.y));
      b.root.setAlpha(1);

      if (!b.sticky) {
        const fadeStart = b.life * 0.55;
        if (age > fadeStart) {
          b.root.setAlpha(1 - (age - fadeStart) / (b.life - fadeStart));
        }
      }
    }
  }

  clear(): void {
    for (const b of this.bubbles) b.root.destroy();
    this.bubbles.length = 0;
  }
}
