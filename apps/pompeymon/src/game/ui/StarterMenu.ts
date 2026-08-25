import Phaser from "phaser";
import { GBA_H, GBA_W, UI_DEPTH } from "../constants";
import { consumeDir, isTouchUi } from "../touch";
import type { StarterId } from "../run";
import { ensureMonSheets, monOwSheet } from "../sprites/mon";

export type StarterOption = {
  id: StarterId | "none";
  label: string;
};

export const STARTERS: StarterOption[] = [
  { id: "scabfox", label: "SCABFOX" },
  { id: "chipgull", label: "CHIPGULL" },
  { id: "moggit", label: "MOGGIT" },
  { id: "none", label: "NO THANKS" },
];

type StarterMenuCallbacks = {
  onPick: (option: StarterOption) => void;
};

/** GBA picker for the three lab partners, plus refuse. */
export class StarterMenu {
  private root: Phaser.GameObjects.Container;
  private cursor: Phaser.GameObjects.Text;
  private index = 0;
  private open = false;

  constructor(
    scene: Phaser.Scene,
    private readonly callbacks: StarterMenuCallbacks,
  ) {
    const w = 176;
    const h = 104;
    const x = (GBA_W - w) / 2;
    const y = (GBA_H - h) / 2 - 6;

    const dim = scene.add.rectangle(GBA_W / 2, GBA_H / 2, GBA_W, GBA_H, 0x0b1c24, 0.45);
    const plate = scene.add.rectangle(GBA_W / 2, GBA_H / 2 - 6, w, h, 0x1a1814, 1);
    plate.setStrokeStyle(2, 0xf0a23a);

    const title = scene.add
      .text(GBA_W / 2, y + 8, "TAKE WHO?", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "8px",
        color: "#f0a23a",
      })
      .setOrigin(0.5, 0);

    this.cursor = scene.add.text(x + 12, y + 26, ">", {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: "8px",
      color: "#f2e6d0",
    });

    const lines = STARTERS.map((opt, i) =>
      scene.add.text(x + 24, y + 26 + i * 16, opt.label, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "8px",
        color: "#e8f0f4",
      }),
    );

    ensureMonSheets(scene);
    const icons = STARTERS.map((opt, i) => {
      if (opt.id === "none") return scene.add.rectangle(x + w - 18, y + 32 + i * 16, 1, 1, 0, 0);
      return scene.add.image(x + w - 18, y + 34 + i * 16, monOwSheet(opt.id), "idle-down").setOrigin(0.5, 1);
    });

    const hint = scene.add
      .text(GBA_W / 2, y + h - 10, isTouchUi() ? "LOOK  TAKE    BACK" : "SPACE  TAKE    ESC  BACK", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "6px",
        color: "#8aa3b0",
      })
      .setOrigin(0.5, 1);

    this.root = scene.add.container(0, 0, [dim, plate, title, this.cursor, ...lines, ...icons, hint]);
    this.root.setDepth(UI_DEPTH);
    this.root.setScrollFactor(0);
    this.root.setVisible(false);
  }

  get active(): boolean {
    return this.open;
  }

  show(): void {
    this.index = 0;
    this.open = true;
    this.root.setVisible(true);
    this.placeCursor();
  }

  hide(): void {
    this.open = false;
    this.root.setVisible(false);
  }

  update(
    cursors: Phaser.Types.Input.Keyboard.CursorKeys,
    wasd: Record<"W" | "S", Phaser.Input.Keyboard.Key>,
    confirm: boolean,
    cancel: boolean,
  ): void {
    if (!this.open) return;
    if (
      Phaser.Input.Keyboard.JustDown(cursors.up) ||
      Phaser.Input.Keyboard.JustDown(wasd.W) ||
      consumeDir("up")
    ) {
      this.index = (this.index + STARTERS.length - 1) % STARTERS.length;
      this.placeCursor();
    }
    if (
      Phaser.Input.Keyboard.JustDown(cursors.down) ||
      Phaser.Input.Keyboard.JustDown(wasd.S) ||
      consumeDir("down")
    ) {
      this.index = (this.index + 1) % STARTERS.length;
      this.placeCursor();
    }
    if (confirm) {
      this.hide();
      this.callbacks.onPick(STARTERS[this.index]);
      return;
    }
    if (cancel) {
      this.hide();
      const none = STARTERS.find((s) => s.id === "none") ?? STARTERS[3];
      this.callbacks.onPick(none);
    }
  }

  private placeCursor(): void {
    this.cursor.setY((GBA_H - 104) / 2 - 6 + 26 + this.index * 16);
  }
}
