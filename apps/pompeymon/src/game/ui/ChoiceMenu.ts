import Phaser from "phaser";
import { GBA_H, GBA_W, UI_DEPTH } from "../constants";
import { consumeDir, isTouchUi } from "../touch";

type Pick = (index: number) => void;

/** Two-line YES/NO style picker. */
export class ChoiceMenu {
  private root: Phaser.GameObjects.Container;
  private cursor: Phaser.GameObjects.Text;
  private index = 0;
  private open = false;
  private onPick?: Pick;

  constructor(
    scene: Phaser.Scene,
    labels: [string, string],
    titleText: string,
  ) {
    const w = 168;
    const h = 72;
    const x = (GBA_W - w) / 2;
    const y = (GBA_H - h) / 2 - 6;

    const dim = scene.add.rectangle(GBA_W / 2, GBA_H / 2, GBA_W, GBA_H, 0x0b1c24, 0.45);
    const plate = scene.add.rectangle(GBA_W / 2, GBA_H / 2 - 6, w, h, 0x1a1814, 1);
    plate.setStrokeStyle(2, 0xf0a23a);

    const title = scene.add
      .text(GBA_W / 2, y + 8, titleText, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "8px",
        color: "#f0a23a",
      })
      .setOrigin(0.5, 0);

    this.cursor = scene.add.text(x + 12, y + 28, ">", {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: "8px",
      color: "#f2e6d0",
    });

    const rows = labels.map((label, i) =>
      scene.add.text(x + 24, y + 28 + i * 14, label, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "8px",
        color: "#e8f0f4",
      }),
    );

    const hint = scene.add
      .text(GBA_W / 2, y + h - 8, isTouchUi() ? "LOOK  PICK" : "SPACE  PICK", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "6px",
        color: "#8aa3b0",
      })
      .setOrigin(0.5, 1);

    this.root = scene.add.container(0, 0, [dim, plate, title, this.cursor, ...rows, hint]);
    this.root.setDepth(UI_DEPTH);
    this.root.setScrollFactor(0);
    this.root.setVisible(false);
  }

  get active(): boolean {
    return this.open;
  }

  show(onPick: Pick): void {
    this.onPick = onPick;
    this.index = 0;
    this.open = true;
    this.root.setVisible(true);
    this.place();
  }

  hide(): void {
    this.open = false;
    this.onPick = undefined;
    this.root.setVisible(false);
  }

  update(
    cursors: Phaser.Types.Input.Keyboard.CursorKeys,
    wasd: Record<"W" | "S", Phaser.Input.Keyboard.Key>,
    confirm: boolean,
    cancel: boolean,
  ): void {
    if (!this.open) return;
    if (Phaser.Input.Keyboard.JustDown(cursors.up) || Phaser.Input.Keyboard.JustDown(wasd.W) || consumeDir("up")) {
      this.index = 0;
      this.place();
    }
    if (Phaser.Input.Keyboard.JustDown(cursors.down) || Phaser.Input.Keyboard.JustDown(wasd.S) || consumeDir("down")) {
      this.index = 1;
      this.place();
    }
    if (confirm) {
      const pick = this.onPick;
      this.hide();
      pick?.(this.index);
      return;
    }
    if (cancel) {
      const pick = this.onPick;
      this.hide();
      pick?.(1);
    }
  }

  private place(): void {
    const y = (GBA_H - 72) / 2 - 6;
    this.cursor.setY(y + 28 + this.index * 14);
  }
}
