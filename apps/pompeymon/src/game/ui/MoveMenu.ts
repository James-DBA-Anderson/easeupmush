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
  private enabled: boolean[] = [];
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

  /** `enabled` marks which moves can be picked; locked ones stay visible but are skipped. */
  show(moves: MoveDef[], enabled?: boolean[]): void {
    this.moves = moves.slice(0, 6);
    this.enabled = this.moves.map((_, i) => enabled?.[i] !== false);
    this.open = true;
    this.arm = false;
    this.drainDirs();
    this.labels.forEach((label, i) => {
      const m = this.moves[i];
      if (!m) {
        label.setText("");
        label.setVisible(false);
        return;
      }
      const ok = this.enabled[i];
      label.setText(ok ? m.name : `${m.name} --`);
      label.setColor(ok ? "#e8f0f4" : "#6a7880");
      label.setVisible(true);
    });
    this.index = this.firstEnabled();
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
    if (
      Phaser.Input.Keyboard.JustDown(cursors.up) ||
      Phaser.Input.Keyboard.JustDown(wasd.W) ||
      consumeDir("up")
    ) {
      this.step(-1);
    }
    if (
      Phaser.Input.Keyboard.JustDown(cursors.down) ||
      Phaser.Input.Keyboard.JustDown(wasd.S) ||
      consumeDir("down")
    ) {
      this.step(1);
    }
    if (confirm) {
      const move = this.moves[this.index];
      if (!move || !this.enabled[this.index]) return;
      this.hide();
      this.callbacks.onPick(move);
      return;
    }
    if (cancel) {
      this.hide();
      this.callbacks.onCancel();
    }
  }

  private firstEnabled(): number {
    const i = this.enabled.findIndex((ok, n) => ok && this.moves[n]);
    return i >= 0 ? i : 0;
  }

  private step(dir: 1 | -1): void {
    const n = this.moves.length;
    if (n <= 0) return;
    let i = this.index;
    for (let k = 0; k < n; k += 1) {
      i = (i + dir + n) % n;
      if (this.enabled[i] && this.moves[i]) {
        this.index = i;
        this.placeCursor();
        return;
      }
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
    this.cursor.setVisible(this.enabled[this.index] !== false);
  }
}
