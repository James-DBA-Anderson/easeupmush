import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";

const BOX_W = 232;
const BOX_H = 48;
const BOX_X = 4;
const BOX_Y = GBA_H - BOX_H - 4;

function paintFrame(g: Phaser.GameObjects.Graphics, w: number, h: number): void {
  g.clear();
  g.fillStyle(0x000000, 1);
  g.fillRect(1, 1, w, h);

  g.fillStyle(0xf8f0c8, 1);
  g.fillRect(0, 0, w, h);

  g.fillStyle(0x183068, 1);
  g.fillRect(0, 0, w, 2);
  g.fillRect(0, h - 2, w, 2);
  g.fillRect(0, 0, 2, h);
  g.fillRect(w - 2, 0, 2, h);

  g.fillStyle(0xf8f8f0, 1);
  g.fillRect(2, 2, w - 4, 1);
  g.fillRect(2, 2, 1, h - 4);

  g.fillStyle(0x90a0c8, 1);
  g.fillRect(2, h - 3, w - 4, 1);
  g.fillRect(w - 3, 2, 1, h - 4);

  g.fillStyle(0x183068, 1);
  g.fillRect(3, 3, w - 6, 1);
  g.fillRect(3, 3, 1, h - 6);
  g.fillRect(3, h - 4, w - 6, 1);
  g.fillRect(w - 4, 3, 1, h - 6);

  g.fillStyle(0x183068, 1);
  g.fillRect(0, 0, 3, 3);
  g.fillRect(w - 3, 0, 3, 3);
  g.fillRect(0, h - 3, 3, 3);
  g.fillRect(w - 3, h - 3, 3, 3);
  g.fillStyle(0xf8f8f0, 1);
  g.fillRect(1, 1, 2, 2);
  g.fillRect(w - 3, 1, 2, 2);
  g.fillRect(1, h - 3, 2, 2);
  g.fillRect(w - 3, h - 3, 2, 2);
}

function paintArrow(g: Phaser.GameObjects.Graphics): void {
  g.clear();
  g.fillStyle(0x183068, 1);
  g.fillRect(0, 0, 7, 1);
  g.fillRect(1, 1, 5, 1);
  g.fillRect(2, 2, 3, 1);
  g.fillRect(3, 3, 1, 1);
}

/** FireRed-style message window along the bottom of the GBA screen. */
export class MsgBox {
  private readonly root: Phaser.GameObjects.Container;
  private readonly label: Phaser.GameObjects.Text;
  private readonly arrow: Phaser.GameObjects.Graphics;
  private hideTimer?: Phaser.Time.TimerEvent;

  constructor(private readonly scene: Phaser.Scene) {
    const frame = scene.add.graphics();
    paintFrame(frame, BOX_W, BOX_H);

    this.label = scene.add.text(10, 8, "", {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: "8px",
      color: "#181828",
      wordWrap: { width: BOX_W - 28 },
      lineSpacing: 6,
    });

    this.arrow = scene.add.graphics();
    paintArrow(this.arrow);
    this.arrow.setPosition(BOX_W - 16, BOX_H - 12);

    this.root = scene.add.container(BOX_X, BOX_Y, [frame, this.label, this.arrow]);
    this.root.setDepth(50);
    this.root.setScrollFactor(0);
    this.root.setVisible(false);

    scene.tweens.add({
      targets: this.arrow,
      alpha: 0.15,
      duration: 380,
      yoyo: true,
      repeat: -1,
    });
  }

  show(text: string): void {
    this.hideTimer?.remove(false);
    this.hideTimer = undefined;
    this.label.setText(text);
    this.root.setVisible(true);
  }

  get open(): boolean {
    return this.root.visible;
  }

  /** Space / Look: close the box. Returns true if the press was used. */
  advance(): boolean {
    if (!this.open) return false;
    this.hide();
    return true;
  }

  hide(): void {
    this.hideTimer?.remove(false);
    this.hideTimer = undefined;
    this.root.setVisible(false);
  }
}
