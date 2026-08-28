import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { clearSave, continueScene, hasSave, loadRun, resetNewGame, run, takeBag, takeStarter } from "../run";
import { ensureKidSheets, kidAnim, kidSheet } from "../sprites/kid";
import { ensureMonSheets, MON_IDS, monBattleKey, monFlyAnim, monFlySheet, monOwAnim, monOwSheet } from "../sprites/mon";
import { consumeAction, consumeDir, isTouchUi } from "../touch";
import { drawEaseLogo, drawPompeymonLogo } from "../ui/pixelLogo";
import { drawTitleSkyline } from "../ui/titleArt";

/** Right-hand menu column. 8px reads on a big screen; 184 keeps "PRESS D DEBUG" on it. */
const MENU_PX = "8px";
const MENU_X = 184;

/** GBA title — harbour skyline, kid, a few Pompeymon. No place name. */
export class TitleScene extends Phaser.Scene {
  private started = false;
  private saved = false;
  private pick = 0;
  private wiping = false;
  private menu: Phaser.GameObjects.Text[] = [];

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

    this.saved = hasSave();
    const prompt = this.add
      .text(MENU_X, 128, this.saved ? (isTouchUi() ? "LOOK  PICK" : "SPACE  PICK") : isTouchUi() ? "PRESS LOOK" : "PRESS SPACE", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: MENU_PX,
        color: "#fff8e8",
      })
      .setOrigin(0.5)
      .setDepth(9)
      .setShadow(1, 1, "#0b1c24", 0, false, true);

    if (this.saved) {
      this.menu = ["CONTINUE", "NEW GAME"].map((label, i) =>
        this.add
          .text(MENU_X, 108 + i * 10, label, {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: MENU_PX,
            color: "#fff8e8",
          })
          .setOrigin(0.5)
          .setDepth(9)
          .setShadow(1, 1, "#0b1c24", 0, false, true),
      );
      this.paintMenu();
    }

    this.add
      .text(MENU_X, 144, isTouchUi() ? "OPEN ?DEBUG" : "PRESS D DEBUG", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: MENU_PX,
        color: "#e0d0b0",
      })
      .setOrigin(0.5)
      .setDepth(9)
      .setShadow(1, 1, "#0b1c24", 0, false, true);

    this.add
      .text(4, GBA_H - 3, `v${__APP_VERSION__}`, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "6px",
        color: "#8aa3b0",
      })
      .setOrigin(0, 1)
      .setDepth(9);

    this.tweens.add({
      targets: prompt,
      alpha: 0.18,
      duration: 520,
      yoyo: true,
      repeat: -1,
    });

    this.input.keyboard?.on("keydown-SPACE", () => this.startGame());
    this.input.keyboard?.on("keydown-UP", () => this.movePick(-1));
    this.input.keyboard?.on("keydown-DOWN", () => this.movePick(1));
    this.input.keyboard?.on("keydown-W", () => this.movePick(-1));
    this.input.keyboard?.on("keydown-S", () => this.movePick(1));
    this.input.keyboard?.on("keydown-ESC", () => this.cancelWipe());
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
    if (consumeDir("up")) this.movePick(-1);
    if (consumeDir("down")) this.movePick(1);
    if (consumeAction()) this.startGame();
  }

  private movePick(dir: number): void {
    if (this.started || !this.saved) return;
    this.pick = (this.pick + dir + 2) % 2;
    this.paintMenu();
  }

  private paintMenu(): void {
    const labels = this.wiping ? ["YES  WIPE", "NO  KEEP"] : ["CONTINUE", "NEW GAME"];
    this.menu.forEach((text, i) => {
      const on = i === this.pick;
      text.setText(`${on ? ">" : " "} ${labels[i]}`);
      text.setColor(on ? "#f0a23a" : "#e0d0b0");
    });
  }

  private cancelWipe(): void {
    if (!this.wiping || this.started) return;
    this.wiping = false;
    this.pick = 1;
    this.paintMenu();
  }

  private startGame(): void {
    if (this.started) return;
    if (!this.saved) {
      this.started = true;
      this.scene.start("bedroom");
      return;
    }
    if (this.wiping) {
      if (this.pick === 1) {
        this.cancelWipe();
        return;
      }
      this.started = true;
      clearSave();
      resetNewGame();
      this.scene.start("bedroom");
      return;
    }
    if (this.pick === 1) {
      this.wiping = true;
      this.pick = 1;
      this.paintMenu();
      return;
    }
    if (!loadRun()) {
      this.started = true;
      resetNewGame();
      this.scene.start("bedroom");
      return;
    }
    this.started = true;
    this.scene.start(continueScene());
  }
}
