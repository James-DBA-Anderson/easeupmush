import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { takeBag, takeStarter, run } from "../run";
import { ensureKidSheets, kidAnim, kidSheet } from "../sprites/kid";
import { ensureMonSheets, MON_IDS, monBattleKey, monFlyAnim, monFlySheet, monOwAnim, monOwSheet } from "../sprites/mon";
import { consumeAction, isTouchUi } from "../touch";
import { drawEaseLogo, drawPompeymonLogo } from "../ui/pixelLogo";
import { drawTitleSkyline } from "../ui/titleArt";

/** GBA title — harbour skyline, kid, a few Pompeymon. No place name. */
export class TitleScene extends Phaser.Scene {
  private started = false;

  constructor() {
    super("title");
  }

  create(): void {
    const q = new URLSearchParams(location.search);
    if (q.has("debug")) {
      this.scene.start("debug");
      return;
    }
    if (q.has("preview")) {
      const g = this.add.graphics();
      g.fillStyle(0x102030, 1);
      g.fillRect(0, 0, GBA_W, GBA_H);
      ensureKidSheets(this);
      ensureMonSheets(this);
      this.showMonPreview();
      return;
    }
    if (q.has("island")) {
      run.outfit = "jumper";
      run.dressed = true;
      takeBag();
      takeStarter("scabfox");
      this.scene.start("island");
      return;
    }
    if (q.has("school")) {
      run.outfit = "jumper";
      run.dressed = true;
      takeBag();
      takeStarter("scabfox");
      this.scene.start("school");
      return;
    }
    const wild = q.get("encounter");
    if (wild) {
      takeStarter("scabfox");
      this.scene.start("encounter", { wild, lv: 5 });
      return;
    }

    const g = this.add.graphics();
    drawTitleSkyline(g);
    drawPompeymonLogo(g, GBA_W / 2, 4);
    drawEaseLogo(g, 48, 128);

    ensureKidSheets(this);
    ensureMonSheets(this);

    const kid = this.add.sprite(118, 148, kidSheet("jumper"), "idle-down");
    kid.setOrigin(0.5, 1);
    kid.setScale(2);
    kid.setDepth(8);
    kid.play(kidAnim("jumper", "idle-down"));
    this.tweens.add({
      targets: kid,
      y: 146,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    const fox = this.add.image(88, 146, monBattleKey("scabfox")).setOrigin(0.5, 1).setDepth(7);
    this.tweens.add({
      targets: fox,
      y: 144,
      duration: 820,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
      delay: 80,
    });

    const gull = this.add.sprite(200, 42, monFlySheet("chipgull"), "fly-up");
    gull.setOrigin(0.5, 1).setDepth(6);
    gull.play(monFlyAnim("chipgull"));
    this.tweens.add({
      targets: gull,
      x: 218,
      y: 34,
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    const bird = this.add.sprite(52, 38, monFlySheet("pidgeon"), "fly-up");
    bird.setOrigin(0.5, 1).setDepth(6);
    bird.play(monFlyAnim("pidgeon"));
    this.tweens.add({
      targets: bird,
      x: 72,
      y: 32,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
      delay: 200,
    });

    const rat = this.add.image(152, 148, monBattleKey("donerrat")).setOrigin(0.5, 1).setDepth(7);
    this.tweens.add({
      targets: rat,
      y: 146,
      duration: 640,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
      delay: 140,
    });

    const prompt = this.add
      .text(200, 132, isTouchUi() ? "PRESS LOOK" : "PRESS SPACE", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "8px",
        color: "#fff8e8",
      })
      .setOrigin(0.5)
      .setDepth(9);

    this.add
      .text(200, 144, isTouchUi() ? "OPEN ?DEBUG" : "PRESS D DEBUG", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "8px",
        color: "#e0d0b0",
      })
      .setOrigin(0.5)
      .setDepth(9);

    this.tweens.add({
      targets: prompt,
      alpha: 0.18,
      duration: 520,
      yoyo: true,
      repeat: -1,
    });

    this.input.keyboard?.on("keydown-SPACE", () => this.startGame());
    this.input.keyboard?.on("keydown-D", () => this.scene.start("debug"));
  }

  private showMonPreview(): void {
    this.add
      .text(GBA_W / 2, 4, "POMPEYMON", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "8px",
        color: "#f0a23a",
      })
      .setOrigin(0.5, 0);
    MON_IDS.forEach((id, i) => {
      const col = i % 5;
      const row = Math.floor(i / 5);
      const x = 8 + col * 46;
      const y = 18 + row * 72;
      this.add.image(x + 16, y + 32, monBattleKey(id)).setOrigin(0.5, 1);
      const walk = this.add.sprite(x + 34, y + 48, monOwSheet(id), "idle-down");
      walk.setOrigin(0.5, 1);
      walk.play(monOwAnim(id, "walk-down-loop"));
    });
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
