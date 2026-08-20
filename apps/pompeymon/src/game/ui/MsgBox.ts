import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";

const BOX_W = 232;
const BOX_H = 48;
const BOX_X = 4;
const BOX_Y = GBA_H - BOX_H - 4;

export type Line = string | { who?: string; text: string };

export function lineText(line: Line): string {
  return typeof line === "string" ? line : line.text;
}

export function lineWho(line: Line): string | undefined {
  return typeof line === "string" ? undefined : line.who;
}

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

function paintName(g: Phaser.GameObjects.Graphics, w: number, h: number): void {
  g.clear();
  g.fillStyle(0x183068, 1);
  g.fillRect(0, 0, w, h);
  g.fillStyle(0xf8f0c8, 1);
  g.fillRect(1, 1, w - 2, h - 2);
  g.fillStyle(0xf0a23a, 1);
  g.fillRect(1, 1, w - 2, 1);
  g.fillRect(1, 1, 1, h - 2);
}

/** FireRed-style message window. Optional speaker name on the top lip. */
export class MsgBox {
  private readonly root: Phaser.GameObjects.Container;
  private readonly label: Phaser.GameObjects.Text;
  private readonly arrow: Phaser.GameObjects.Graphics;
  private readonly nameFrame: Phaser.GameObjects.Graphics;
  private readonly nameLabel: Phaser.GameObjects.Text;
  private hideTimer?: Phaser.Time.TimerEvent;

  private pages: Line[] = [];
  private page = 0;
  private onDone?: () => void;

  constructor(
    scene: Phaser.Scene,
    private readonly onPage?: (line: Line | undefined) => void,
  ) {
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

    this.nameFrame = scene.add.graphics();
    this.nameLabel = scene.add.text(6, -10, "", {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: "8px",
      color: "#f0a23a",
    });

    this.root = scene.add.container(BOX_X, BOX_Y, [frame, this.label, this.arrow, this.nameFrame, this.nameLabel]);
    this.root.setDepth(2000);
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

  show(text: Line | Line[], onDone?: () => void): void {
    this.hideTimer?.remove(false);
    this.hideTimer = undefined;
    this.onDone = onDone;
    this.pages = Array.isArray(text) ? text : [text];
    this.page = 0;
    this.paintPage();
    this.root.setVisible(true);
  }

  get open(): boolean {
    return this.root.visible;
  }

  /** Space / Look: next page, or close. Returns true if the press was used. */
  advance(): boolean {
    if (!this.open) return false;
    if (this.page < this.pages.length - 1) {
      this.page += 1;
      this.paintPage();
      return true;
    }
    this.hide();
    return true;
  }

  hide(): void {
    this.hideTimer?.remove(false);
    this.hideTimer = undefined;
    this.root.setVisible(false);
    this.onPage?.(undefined);
    const done = this.onDone;
    this.onDone = undefined;
    done?.();
  }

  private paintPage(): void {
    const line = this.pages[this.page];
    this.label.setText(line ? lineText(line) : "");
    this.onPage?.(line);
    const who = line ? lineWho(line) : undefined;
    if (!who) {
      this.nameFrame.clear();
      this.nameLabel.setVisible(false);
      return;
    }
    this.nameLabel.setVisible(true);
    this.nameLabel.setText(who);
    this.nameLabel.setPosition(8, -9);
    const w = Math.max(36, who.length * 8 + 10);
    paintName(this.nameFrame, w, 12);
    this.nameFrame.setPosition(4, -12);
  }
}
