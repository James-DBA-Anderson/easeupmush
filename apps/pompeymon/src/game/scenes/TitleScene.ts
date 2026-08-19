import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { consumeAction, isTouchUi } from "../touch";

/** Placeholder title — GBA-ish, Cosham kid energy, no year on the tin. */
export class TitleScene extends Phaser.Scene {
  private started = false;

  constructor() {
    super("title");
  }

  create(): void {
    const g = this.add.graphics();
    g.fillStyle(0x0b1c24, 1);
    g.fillRect(0, 0, GBA_W, GBA_H);
    g.fillStyle(0x163040, 1);
    g.fillRect(6, 6, GBA_W - 12, GBA_H - 12);
    g.lineStyle(3, 0xf0a23a, 1);
    g.strokeRect(8, 8, GBA_W - 16, GBA_H - 16);
    g.lineStyle(1, 0x8a5a20, 1);
    g.strokeRect(11, 11, GBA_W - 22, GBA_H - 22);

    this.add
      .text(GBA_W / 2, 28, "POMPEYMON", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "16px",
        color: "#f0a23a",
        align: "center",
      })
      .setOrigin(0.5);

    this.add
      .text(GBA_W / 2, 50, "COSHAM", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "8px",
        color: "#c8dde6",
      })
      .setOrigin(0.5);

    g.fillStyle(0x08141c, 1);
    g.fillRect(28, 64, 184, 42);
    g.fillStyle(0x1a3848, 1);
    g.fillRect(32, 80, 22, 26);
    g.fillRect(56, 74, 18, 32);
    g.fillRect(78, 84, 30, 22);
    g.fillRect(112, 70, 16, 36);
    g.fillRect(132, 78, 24, 28);
    g.fillRect(160, 76, 44, 30);
    g.fillStyle(0xf0a23a, 0.7);
    g.fillRect(188, 68, 8, 8);
    g.fillStyle(0x2a5568, 1);
    g.fillRect(40, 92, 4, 4);
    g.fillRect(120, 86, 3, 3);

    const prompt = this.add
      .text(GBA_W / 2, 122, isTouchUi() ? "PRESS LOOK" : "PRESS SPACE", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "8px",
        color: "#e8f0f4",
      })
      .setOrigin(0.5);

    this.add
      .text(GBA_W / 2, 142, "EASE UP MUSH", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "8px",
        color: "#8aa3b0",
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: prompt,
      alpha: 0.18,
      duration: 520,
      yoyo: true,
      repeat: -1,
    });

    this.input.keyboard?.on("keydown-SPACE", () => this.startGame());
    this.input.once("pointerdown", () => this.startGame());
  }

  update(): void {
    if (consumeAction()) this.startGame();
  }

  private startGame(): void {
    if (this.started) return;
    this.started = true;
    this.scene.start("bedroom");
  }
}
