import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { takeBag, takeStarter, run } from "../run";
import { ensureKidSheets, kidAnim, kidSheet } from "../sprites/kid";
import { ensureMonSheets, MON_IDS, monBattleKey, monOwAnim, monOwSheet } from "../sprites/mon";
import { consumeAction, isTouchUi } from "../touch";
import { drawEaseLogo, drawPompeymonLogo } from "../ui/pixelLogo";

/** GBA title — kid in the jumper, Ease Up Mush mark, no place name. */
export class TitleScene extends Phaser.Scene {
  private started = false;

  constructor() {
    super("title");
  }

  create(): void {
    const q = new URLSearchParams(location.search);
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
    g.fillStyle(0x102030, 1);
    g.fillRect(0, 0, GBA_W, GBA_H);
    g.fillStyle(0x183848, 1);
    g.fillRect(0, 0, GBA_W, 52);
    g.fillStyle(0x1c4058, 1);
    g.fillRect(0, 52, GBA_W, 8);
    g.fillStyle(0x8a6a38, 1);
    g.fillRect(0, 108, GBA_W, 1);
    g.fillStyle(0x6a5030, 1);
    g.fillRect(0, 109, GBA_W, 51);
    g.fillStyle(0x5a4028, 1);
    for (let y = 116; y < GBA_H; y += 8) g.fillRect(0, y, GBA_W, 1);

    g.fillStyle(0xf0a23a, 0.18);
    g.fillEllipse(GBA_W / 2, 92, 70, 28);

    drawPompeymonLogo(g, GBA_W / 2, 8);
    drawEaseLogo(g, GBA_W / 2, 128);

    ensureKidSheets(this);
    ensureMonSheets(this);

    if (new URLSearchParams(location.search).has("preview")) {
      this.showMonPreview();
      return;
    }

    const kid = this.add.sprite(GBA_W / 2, 100, kidSheet("jumper"), "idle-down");
    kid.setOrigin(0.5, 1);
    kid.setScale(2);
    kid.play(kidAnim("jumper", "idle-down"));
    this.tweens.add({
      targets: kid,
      y: 98,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    const prompt = this.add
      .text(GBA_W / 2, 112, isTouchUi() ? "PRESS LOOK" : "PRESS SPACE", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "8px",
        color: "#f8f0d8",
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
