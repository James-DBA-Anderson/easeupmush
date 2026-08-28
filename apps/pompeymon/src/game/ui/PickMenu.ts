import Phaser from "phaser";
import { GBA_H, GBA_W, UI_DEPTH } from "../constants";
import { consumeDir, isTouchUi } from "../touch";

export type PickOption = { id: string; label: string };

type PickCallbacks = {
  /** `undefined` when they back out. */
  onPick: (option: PickOption | undefined) => void;
};

const ROW = 14;

/** Small GBA list picker — title, a few labels, pick or back out. */
export class PickMenu {
  private root?: Phaser.GameObjects.Container;
  private cursor?: Phaser.GameObjects.Text;
  private opts: PickOption[] = [];
  private index = 0;
  private open = false;
  private top = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly callbacks: PickCallbacks,
  ) {}

  get active(): boolean {
    return this.open;
  }

  show(title: string, opts: PickOption[]): void {
    this.hide();
    if (!opts.length) return;
    this.opts = opts;
    this.index = 0;

    const w = 176;
    const h = 34 + opts.length * ROW;
    const x = (GBA_W - w) / 2;
    const y = Math.max(6, (GBA_H - h) / 2 - 4);
    this.top = y + 26;

    const scene = this.scene;
    const dim = scene.add.rectangle(GBA_W / 2, GBA_H / 2, GBA_W, GBA_H, 0x0b1c24, 0.45);
    const plate = scene.add.rectangle(x + w / 2, y + h / 2, w, h, 0x1a1814, 1);
    plate.setStrokeStyle(2, 0xf0a23a);
    const head = scene.add
      .text(GBA_W / 2, y + 8, title, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "8px",
        color: "#f0a23a",
      })
      .setOrigin(0.5, 0);
    this.cursor = scene.add.text(x + 12, this.top, ">", {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: "8px",
      color: "#f2e6d0",
    });
    const rows = opts.map((opt, i) =>
      scene.add.text(x + 24, this.top + i * ROW, opt.label, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "8px",
        color: "#e8f0f4",
      }),
    );
    const hint = scene.add
      .text(GBA_W / 2, y + h - 4, isTouchUi() ? "LOOK  GIVE" : "SPACE  GIVE   ESC  BACK", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "6px",
        color: "#8aa3b0",
      })
      .setOrigin(0.5, 1);

    this.root = scene.add.container(0, 0, [dim, plate, head, this.cursor, ...rows, hint]);
    this.root.setDepth(UI_DEPTH);
    this.root.setScrollFactor(0);
    this.open = true;
    this.drainDirs();
  }

  hide(): void {
    this.open = false;
    this.root?.destroy(true);
    this.root = undefined;
    this.cursor = undefined;
  }

  update(
    cursors: Phaser.Types.Input.Keyboard.CursorKeys,
    wasd: Record<"W" | "S", Phaser.Input.Keyboard.Key>,
    confirm: boolean,
    cancel: boolean,
  ): void {
    if (!this.open) return;
    const n = this.opts.length;
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
      const pick = this.opts[this.index];
      this.hide();
      this.callbacks.onPick(pick);
      return;
    }
    if (cancel) {
      this.hide();
      this.callbacks.onPick(undefined);
    }
  }

  private placeCursor(): void {
    this.cursor?.setY(this.top + this.index * ROW);
  }

  private drainDirs(): void {
    consumeDir("up");
    consumeDir("down");
    consumeDir("left");
    consumeDir("right");
  }
}
