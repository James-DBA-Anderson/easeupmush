import Phaser from "phaser";
import { GBA_H, GBA_W, UI_DEPTH } from "../constants";
import type { MoveDef } from "../moves";
import { consumeDir, isTouchUi } from "../touch";

type MoveMenuCallbacks = {
  onPick: (move: MoveDef) => void;
  onCancel: () => void;
};

/** Pick one of the lead's moves after FIGHT. Esc / BACK returns to the battle menu. */
export class MoveMenu {
  private root: Phaser.GameObjects.Container;
  private cursor: Phaser.GameObjects.Text;
  private labels: Phaser.GameObjects.Text[] = [];
  private moves: MoveDef[] = [];
  private index = 0;
  private open = false;
  private arm = false;
  private readonly x: number;
  private readonly y: number;
  private readonly w = 128;
  private readonly h = 72;

  constructor(
    scene: Phaser.Scene,
    private readonly callbacks: MoveMenuCallbacks,
  ) {
    this.x = GBA_W - this.w - 8;
    this.y = GBA_H - this.h - 8;

    const plate = scene.add.rectangle(this.x + this.w / 2, this.y + this.h / 2, this.w, this.h, 0x1a1814, 1);
    plate.setStrokeStyle(2, 0xf0a23a);

    this.cursor = scene.add.text(this.x + 6, this.y + 8, ">", {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: "8px",
      color: "#f2e6d0",
    });

    for (let i = 0; i < 6; i += 1) {
      this.labels.push(
        scene.add.text(this.x + 16, this.y + 8 + i * 10, "", {
          fontFamily: '"Press Start 2P", monospace',
          fontSize: "8px",
          color: "#e8f0f4",
        }),
      );
    }

    const hint = scene.add.text(this.x + 8, this.y + this.h - 2, isTouchUi() ? "LOOK / BACK" : "SPACE / ESC", {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: "6px",
      color: "#8aa3b0",
    });
    hint.setOrigin(0, 1);

    this.root = scene.add.container(0, 0, [plate, this.cursor, ...this.labels, hint]);
    this.root.setDepth(UI_DEPTH + 1);
    this.root.setScrollFactor(0);
    this.root.setVisible(false);
  }

  get active(): boolean {
    return this.open;
  }

  show(moves: MoveDef[]): void {
    this.moves = moves.slice(0, 6);
    this.index = 0;
    this.open = true;
    this.arm = false;
    this.drainDirs();
    this.labels.forEach((label, i) => {
      const m = this.moves[i];
      label.setText(m ? m.name : "");
      label.setVisible(!!m);
    });
    this.root.setVisible(true);
    this.placeCursor();
  }

  hide(): void {
    this.open = false;
    this.root.setVisible(false);
  }

  update(
    cursors: Phaser.Types.Input.Keyboard.CursorKeys,
    wasd: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>,
    confirm: boolean,
    cancel = false,
  ): void {
    if (!this.open) return;
    if (!this.arm) {
      this.arm = true;
      this.drainDirs();
      return;
    }
    const n = Math.max(1, this.moves.length);
    if (
      Phaser.Input.Keyboard.JustDown(cursors.up) ||
      Phaser.Input.Keyboard.JustDown(wasd.W) ||
      consumeDir("up")
    ) {
      this.index = (this.index + n - 1) % n;
      this.placeCursor();
    }
    if (
      Phaser.Input.Keyboard.JustDown(cursors.down) ||
      Phaser.Input.Keyboard.JustDown(wasd.S) ||
      consumeDir("down")
    ) {
      this.index = (this.index + 1) % n;
      this.placeCursor();
    }
    if (confirm) {
      const move = this.moves[this.index];
      this.hide();
      if (move) this.callbacks.onPick(move);
      else this.callbacks.onCancel();
      return;
    }
    if (cancel) {
      this.hide();
      this.callbacks.onCancel();
    }
  }

  private drainDirs(): void {
    consumeDir("up");
    consumeDir("down");
    consumeDir("left");
    consumeDir("right");
  }

  private placeCursor(): void {
    this.cursor.setPosition(this.x + 6, this.y + 8 + this.index * 10);
  }
}
