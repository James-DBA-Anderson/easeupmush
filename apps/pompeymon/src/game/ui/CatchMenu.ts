import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { consumeDir, isTouchUi } from "../touch";

export type BattleOpt = "fight" | "bag" | "defend" | "dodge" | "run";

type BattleMenuCallbacks = {
  onPick: (opt: BattleOpt) => void;
};

const COL = 56;

/** FIGHT / BAG / DEFEND / DODGE / RUN. Catch is via kebab boxes in the bag. */
export class CatchMenu {
  private root: Phaser.GameObjects.Container;
  private cursor: Phaser.GameObjects.Text;
  private index = 0;
  private open = false;
  /** Skip one update so leftover walk/touch input cannot move the cursor. */
  private arm = false;
  private readonly opts: BattleOpt[] = ["fight", "bag", "defend", "dodge", "run"];
  private readonly x: number;
  private readonly y: number;

  constructor(
    scene: Phaser.Scene,
    private readonly callbacks: BattleMenuCallbacks,
  ) {
    const w = 128;
    const h = 64;
    this.x = GBA_W - w - 8;
    this.y = GBA_H - h - 8;

    const plate = scene.add.rectangle(this.x + w / 2, this.y + h / 2, w, h, 0x1a1814, 1);
    plate.setStrokeStyle(2, 0xf0a23a);

    this.cursor = scene.add.text(this.x + 6, this.y + 10, ">", {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: "8px",
      color: "#f2e6d0",
    });

    const labels: Record<BattleOpt, string> = {
      fight: "FIGHT",
      bag: "BAG",
      defend: "DEFEND",
      dodge: "DODGE",
      run: "RUN",
    };
    const lines = this.opts.map((opt, i) => {
      const pos = this.slot(i);
      return scene.add.text(pos.x + 10, pos.y, labels[opt], {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "8px",
        color: "#e8f0f4",
      });
    });

    const hint = scene.add.text(this.x + 8, this.y + h - 2, isTouchUi() ? "LOOK" : "SPACE", {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: "6px",
      color: "#8aa3b0",
    });
    hint.setOrigin(0, 1);

    this.root = scene.add.container(0, 0, [plate, this.cursor, ...lines, hint]);
    this.root.setDepth(40);
    this.root.setScrollFactor(0);
    this.root.setVisible(false);
  }

  get active(): boolean {
    return this.open;
  }

  show(): void {
    this.index = 0;
    this.open = true;
    this.arm = false;
    this.drainDirs();
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
      this.index = 0;
      this.placeCursor();
      return;
    }
    const n = this.opts.length;
    if (
      Phaser.Input.Keyboard.JustDown(cursors.up) ||
      Phaser.Input.Keyboard.JustDown(wasd.W) ||
      consumeDir("up")
    ) {
      this.index = (this.index + n - 2 + n) % n;
      this.placeCursor();
    }
    if (
      Phaser.Input.Keyboard.JustDown(cursors.down) ||
      Phaser.Input.Keyboard.JustDown(wasd.S) ||
      consumeDir("down")
    ) {
      this.index = (this.index + 2) % n;
      this.placeCursor();
    }
    if (
      Phaser.Input.Keyboard.JustDown(cursors.left) ||
      Phaser.Input.Keyboard.JustDown(wasd.A) ||
      consumeDir("left")
    ) {
      this.index = (this.index + n - 1) % n;
      this.placeCursor();
    }
    if (
      Phaser.Input.Keyboard.JustDown(cursors.right) ||
      Phaser.Input.Keyboard.JustDown(wasd.D) ||
      consumeDir("right")
    ) {
      this.index = (this.index + 1) % n;
      this.placeCursor();
    }
    if (confirm) {
      this.hide();
      this.callbacks.onPick(this.opts[this.index] ?? "run");
      return;
    }
    if (cancel) {
      this.hide();
      this.callbacks.onPick("run");
    }
  }

  private drainDirs(): void {
    consumeDir("up");
    consumeDir("down");
    consumeDir("left");
    consumeDir("right");
  }

  private slot(i: number): { x: number; y: number } {
    const col = i % 2;
    const row = Math.floor(i / 2);
    return { x: this.x + 8 + col * COL, y: this.y + 10 + row * 16 };
  }

  private placeCursor(): void {
    const pos = this.slot(this.index);
    this.cursor.setPosition(pos.x - 8, pos.y);
  }
}
