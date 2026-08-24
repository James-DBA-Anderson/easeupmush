import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { consumeDir, isTouchUi } from "../touch";

export type ShopStock = { id: string; label: string; price: number; line: string; stack?: boolean };

type ShopCallbacks = {
  onPick: (item: ShopStock) => void;
  cash: () => number;
};

export class ShopMenu {
  private root: Phaser.GameObjects.Container;
  private cursor: Phaser.GameObjects.Text;
  private rows: Phaser.GameObjects.Text[] = [];
  private pocket: Phaser.GameObjects.Text;
  private index = 0;
  private open = false;

  constructor(
    scene: Phaser.Scene,
    private readonly stock: ShopStock[],
    private readonly callbacks: ShopCallbacks,
    titleText = "SHOP",
  ) {
    const w = 216;
    const h = 104;
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

    this.cursor = scene.add.text(x + 10, y + 28, ">", {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: "8px",
      color: "#f2e6d0",
    });

    this.pocket = scene.add.text(x + 22, y + h - 22, "", {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: "7px",
      color: "#c8e0a8",
    });

    const hint = scene.add
      .text(GBA_W / 2, y + h - 8, isTouchUi() ? "LOOK  BUY    BACK" : "SPACE  BUY    ESC  BACK", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "6px",
        color: "#8aa3b0",
      })
      .setOrigin(0.5, 1);

    this.root = scene.add.container(0, 0, [dim, plate, title, this.cursor, this.pocket, hint]);
    this.root.setDepth(42);
    this.root.setScrollFactor(0);
    this.root.setVisible(false);
    this.paintRows(scene, x, y);
  }

  get active(): boolean {
    return this.open;
  }

  show(): void {
    this.open = true;
    this.index = 0;
    this.refresh();
    this.root.setVisible(true);
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
    const n = this.stock.length;
    if (n > 1) {
      if (Phaser.Input.Keyboard.JustDown(cursors.up) || Phaser.Input.Keyboard.JustDown(wasd.W) || consumeDir("up")) {
        this.index = (this.index + n - 1) % n;
        this.refresh();
      }
      if (Phaser.Input.Keyboard.JustDown(cursors.down) || Phaser.Input.Keyboard.JustDown(wasd.S) || consumeDir("down")) {
        this.index = (this.index + 1) % n;
        this.refresh();
      }
    }
    if (confirm) {
      const item = this.stock[this.index];
      this.hide();
      if (item) this.callbacks.onPick(item);
      return;
    }
    if (cancel) this.hide();
  }

  private paintRows(scene: Phaser.Scene, x: number, y: number): void {
    this.rows = this.stock.map((item, i) =>
      scene.add.text(x + 22, y + 28 + i * 14, `${item.label}  £${item.price}`, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "8px",
        color: "#e8f0f4",
      }),
    );
    for (const row of this.rows) this.root.add(row);
  }

  private refresh(): void {
    this.pocket.setText(`Dosh  £${this.callbacks.cash()}`);
    const y = (GBA_H - 104) / 2 - 6;
    this.cursor.setY(y + 28 + this.index * 14);
  }
}
