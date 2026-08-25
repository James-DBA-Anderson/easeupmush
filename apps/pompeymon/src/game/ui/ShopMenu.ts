import Phaser from "phaser";
import { GBA_H, GBA_W, UI_DEPTH } from "../constants";
import { consumeDir, isTouchUi } from "../touch";

export type ShopStock = { id: string; label: string; price: number; line: string; stack?: boolean };

type ShopCallbacks = {
  onPick: (item: ShopStock, qty: number) => void;
  cash: () => number;
};

type ShopKeys = Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;

const BOX_H = 104;
const MAX_QTY = 99;

/** Counter menu. Stackable stock gets a left/right qty step before buy. */
export class ShopMenu {
  private root: Phaser.GameObjects.Container;
  private cursor: Phaser.GameObjects.Text;
  private rows: Phaser.GameObjects.Text[] = [];
  private pocket: Phaser.GameObjects.Text;
  private hint: Phaser.GameObjects.Text;
  private index = 0;
  private qty = 1;
  private phase: "list" | "qty" = "list";
  private open = false;

  constructor(
    scene: Phaser.Scene,
    private readonly stock: ShopStock[],
    private readonly callbacks: ShopCallbacks,
    titleText = "SHOP",
  ) {
    const w = 216;
    const x = (GBA_W - w) / 2;
    const y = (GBA_H - BOX_H) / 2 - 6;

    const dim = scene.add.rectangle(GBA_W / 2, GBA_H / 2, GBA_W, GBA_H, 0x0b1c24, 0.45);
    const plate = scene.add.rectangle(GBA_W / 2, GBA_H / 2 - 6, w, BOX_H, 0x1a1814, 1);
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

    this.pocket = scene.add.text(x + 22, y + BOX_H - 22, "", {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: "7px",
      color: "#c8e0a8",
    });

    this.hint = scene.add
      .text(GBA_W / 2, y + BOX_H - 8, this.listHint(), {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "6px",
        color: "#8aa3b0",
      })
      .setOrigin(0.5, 1);

    this.root = scene.add.container(0, 0, [dim, plate, title, this.cursor, this.pocket, this.hint]);
    this.root.setDepth(UI_DEPTH);
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
    this.phase = "list";
    this.qty = 1;
    this.refresh();
    this.root.setVisible(true);
  }

  hide(): void {
    this.open = false;
    this.phase = "list";
    this.root.setVisible(false);
  }

  update(cursors: Phaser.Types.Input.Keyboard.CursorKeys, wasd: ShopKeys, confirm: boolean, cancel: boolean): void {
    if (!this.open) return;
    const item = this.stock[this.index];

    if (this.phase === "qty") {
      if (Phaser.Input.Keyboard.JustDown(cursors.left) || Phaser.Input.Keyboard.JustDown(wasd.A) || consumeDir("left")) {
        this.qty = Math.max(1, this.qty - 1);
        this.refresh();
      }
      if (Phaser.Input.Keyboard.JustDown(cursors.right) || Phaser.Input.Keyboard.JustDown(wasd.D) || consumeDir("right")) {
        this.qty = Math.min(this.maxQty(item), this.qty + 1);
        this.refresh();
      }
      if (confirm) {
        this.hide();
        if (item) this.callbacks.onPick(item, this.qty);
        return;
      }
      if (cancel) {
        this.phase = "list";
        this.qty = 1;
        this.refresh();
      }
      return;
    }

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
      if (item?.stack && this.maxQty(item) >= 1) {
        this.phase = "qty";
        this.qty = 1;
        this.refresh();
        return;
      }
      this.hide();
      if (item) this.callbacks.onPick(item, 1);
      return;
    }
    if (cancel) this.hide();
  }

  private maxQty(item: ShopStock | undefined): number {
    if (!item) return 1;
    const cash = this.callbacks.cash();
    if (item.price <= 0) return 1;
    return Math.min(MAX_QTY, Math.max(0, Math.floor(cash / item.price)));
  }

  private listHint(): string {
    return isTouchUi() ? "LOOK  BUY    BACK" : "SPACE  BUY    ESC  BACK";
  }

  private qtyHint(): string {
    return isTouchUi() ? "LEFT RIGHT  QTY    LOOK  BUY" : "ARROWS  QTY    SPACE  BUY";
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
    const item = this.stock[this.index];
    const cash = this.callbacks.cash();
    if (this.phase === "qty" && item) {
      const total = item.price * this.qty;
      this.pocket.setText(`x${this.qty} £${total}  £${cash}`);
      this.hint.setText(this.qtyHint());
    } else {
      this.pocket.setText(`Dosh  £${cash}`);
      this.hint.setText(this.listHint());
    }
    const y = (GBA_H - BOX_H) / 2 - 6;
    this.cursor.setY(y + 28 + this.index * 14);
  }
}
