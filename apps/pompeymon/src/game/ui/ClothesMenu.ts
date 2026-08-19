import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import type { OutfitId } from "../sprites/kid";
import { consumeDir, isTouchUi } from "../touch";

export type ClothesOption = {
  id: OutfitId;
  label: string;
  dressed: boolean;
};

export const CLOTHES: ClothesOption[] = [
  { id: "jumper", label: "SCHOOL JUMPER", dressed: true },
  { id: "trackies", label: "TRACKIES", dressed: true },
  { id: "pj", label: "Y-FRONTS", dressed: false },
];

type ClothesMenuCallbacks = {
  onWear: (option: ClothesOption) => void;
  onClose: () => void;
};

/** GBA-style wardrobe picker. */
export class ClothesMenu {
  private root: Phaser.GameObjects.Container;
  private cursor: Phaser.GameObjects.Text;
  private index = 0;
  private open = false;

  constructor(
    scene: Phaser.Scene,
    private readonly callbacks: ClothesMenuCallbacks,
  ) {
    const w = 176;
    const h = 88;
    const x = (GBA_W - w) / 2;
    const y = (GBA_H - h) / 2 - 6;

    const dim = scene.add.rectangle(GBA_W / 2, GBA_H / 2, GBA_W, GBA_H, 0x0b1c24, 0.45);
    const plate = scene.add.rectangle(GBA_W / 2, GBA_H / 2 - 6, w, h, 0x1a1814, 1);
    plate.setStrokeStyle(2, 0xf0a23a);

    const title = scene.add
      .text(GBA_W / 2, y + 10, "WEAR WHAT?", {
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

    const lines = CLOTHES.map((opt, i) =>
      scene.add.text(x + 24, y + 28 + i * 16, opt.label, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "8px",
        color: "#e8f0f4",
      }),
    );

    const hint = scene.add
      .text(GBA_W / 2, y + h - 12, isTouchUi() ? "LOOK  WEAR    BACK" : "SPACE  WEAR    ESC  BACK", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "6px",
        color: "#8aa3b0",
      })
      .setOrigin(0.5, 1);

    this.root = scene.add.container(0, 0, [dim, plate, title, this.cursor, ...lines, hint]);
    this.root.setDepth(40);
    this.root.setVisible(false);
  }

  get active(): boolean {
    return this.open;
  }

  show(current: OutfitId): void {
    this.index = Math.max(
      0,
      CLOTHES.findIndex((opt) => opt.id === current),
    );
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
      Phaser.Input.Keyboard.JustDown(cursors.left) ||
      Phaser.Input.Keyboard.JustDown(wasd.W) ||
      consumeDir("up") ||
      consumeDir("left")
    ) {
      this.index = (this.index + CLOTHES.length - 1) % CLOTHES.length;
      this.placeCursor();
    }
    if (
      Phaser.Input.Keyboard.JustDown(cursors.down) ||
      Phaser.Input.Keyboard.JustDown(cursors.right) ||
      Phaser.Input.Keyboard.JustDown(wasd.S) ||
      consumeDir("down") ||
      consumeDir("right")
    ) {
      this.index = (this.index + 1) % CLOTHES.length;
      this.placeCursor();
    }
    if (confirm) {
      this.hide();
      this.callbacks.onWear(CLOTHES[this.index]);
      return;
    }
    if (cancel) {
      this.hide();
      this.callbacks.onClose();
    }
  }

  private placeCursor(): void {
    this.cursor.setY((GBA_H - 88) / 2 - 6 + 28 + this.index * 16);
  }
}
