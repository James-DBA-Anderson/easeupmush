import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { bagEntries, bagLabel, bagLine, battleBagEntries, isFood, run, syncBagChrome, type BagEntry } from "../run";
import { consumeBag, consumeDir, isTouchUi } from "../touch";
import { mountDebugBack } from "./debugBack";
import { FeedMenu } from "./FeedMenu";

type BagCallbacks = {
  onPick: (entry: BagEntry) => void;
};

const BAG_W = 216;
const BAG_H = 112;
const ROW = 12;
const VISIBLE = 5;
const LIST_Y = 28;

/** FireRed-style bag: items, then owned Pompeymon. */
export class BagMenu {
  private root: Phaser.GameObjects.Container;
  private cursor: Phaser.GameObjects.Text;
  private lines: Phaser.GameObjects.Text[] = [];
  private empty: Phaser.GameObjects.Text;
  private index = 0;
  private scroll = 0;
  private open = false;

  constructor(
    scene: Phaser.Scene,
    private readonly callbacks: BagCallbacks,
    private readonly battle = false,
  ) {
    const x = (GBA_W - BAG_W) / 2;
    const y = (GBA_H - BAG_H) / 2 - 8;

    const dim = scene.add.rectangle(GBA_W / 2, GBA_H / 2, GBA_W, GBA_H, 0x0b1c24, 0.45);
    const plate = scene.add.rectangle(GBA_W / 2, GBA_H / 2 - 8, BAG_W, BAG_H, 0x1a1814, 1);
    plate.setStrokeStyle(2, 0xf0a23a);

    const title = scene.add
      .text(GBA_W / 2, y + 8, "BAG", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "8px",
        color: "#f0a23a",
      })
      .setOrigin(0.5, 0);

    this.cursor = scene.add.text(x + 10, y + LIST_Y, ">", {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: "8px",
      color: "#f2e6d0",
    });

    this.empty = scene.add.text(x + 22, y + LIST_Y, this.battle ? "Nothing." : "Empty.", {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: "8px",
      color: "#8aa3b0",
    });

    const hint = scene.add
      .text(GBA_W / 2, y + BAG_H - 10, this.battle
          ? isTouchUi() ? "LOOK  PICK    BACK" : "SPACE  PICK    ESC  BACK"
          : isTouchUi() ? "LOOK  SEE    BACK" : "SPACE  SEE    ESC  BACK", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "6px",
        color: "#8aa3b0",
      })
      .setOrigin(0.5, 1);

    this.root = scene.add.container(0, 0, [dim, plate, title, this.cursor, this.empty, hint]);
    this.root.setDepth(42);
    this.root.setScrollFactor(0);
    this.root.setVisible(false);
  }

  get active(): boolean {
    return this.open;
  }

  show(): void {
    this.open = true;
    this.index = 0;
    this.scroll = 0;
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
    const entries = this.list();
    const n = entries.length;
    if (n > 1) {
      if (
        Phaser.Input.Keyboard.JustDown(cursors.up) ||
        Phaser.Input.Keyboard.JustDown(wasd.W) ||
        consumeDir("up")
      ) {
        this.index = (this.index + n - 1) % n;
        this.keepVisible();
        this.refresh();
      }
      if (
        Phaser.Input.Keyboard.JustDown(cursors.down) ||
        Phaser.Input.Keyboard.JustDown(wasd.S) ||
        consumeDir("down")
      ) {
        this.index = (this.index + 1) % n;
        this.keepVisible();
        this.refresh();
      }
    }
    if (confirm) {
      const entry = entries[this.index];
      this.hide();
      if (entry) this.callbacks.onPick(entry);
      return;
    }
    if (cancel) this.hide();
  }

  private list(): BagEntry[] {
    return this.battle ? battleBagEntries() : bagEntries();
  }

  private keepVisible(): void {
    if (this.index < this.scroll) this.scroll = this.index;
    if (this.index >= this.scroll + VISIBLE) this.scroll = this.index - VISIBLE + 1;
  }

  private refresh(): void {
    for (const line of this.lines) line.destroy();
    this.lines = [];
    const scene = this.root.scene;
    const x = (GBA_W - BAG_W) / 2;
    const y = (GBA_H - BAG_H) / 2 - 8;
    const entries = this.list();
    if (entries.length === 0) {
      this.empty.setVisible(true);
      this.cursor.setVisible(false);
      return;
    }
    this.empty.setVisible(false);
    this.cursor.setVisible(true);
    const slice = entries.slice(this.scroll, this.scroll + VISIBLE);
    this.lines = slice.map((entry, i) =>
      scene.add.text(x + 22, y + LIST_Y + i * ROW, bagLabel(entry), {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "8px",
        color: entry.kind === "mon" ? "#c8e0a8" : "#e8f0f4",
      }),
    );
    for (const line of this.lines) this.root.add(line);
    this.placeCursor();
  }

  private placeCursor(): void {
    const y = (GBA_H - BAG_H) / 2 - 8;
    this.cursor.setY(y + LIST_Y + (this.index - this.scroll) * ROW);
  }
}

function paintBagIcon(g: Phaser.GameObjects.Graphics): void {
  g.clear();
  g.fillStyle(0x1a1814, 1);
  g.fillRect(0, 0, 18, 16);
  g.lineStyle(1, 0xf0a23a, 1);
  g.strokeRect(0, 0, 18, 16);
  g.fillStyle(0x2a3a68, 1);
  g.fillRect(4, 5, 10, 8);
  g.fillStyle(0x1a2848, 1);
  g.fillRect(4, 11, 10, 2);
  g.fillStyle(0xf0c030, 1);
  g.fillRect(4, 8, 10, 2);
  g.fillStyle(0x3a4a78, 1);
  g.fillRect(6, 3, 6, 3);
}

const ICON_X = GBA_W - 22;
const ICON_Y = 4;
const ICON_W = 18;
const ICON_H = 16;

/** On-screen bag + I / BAG button. Visible after you pick the bag up. */
export class BagUi {
  readonly menu: BagMenu;
  private readonly feed: FeedMenu;
  private readonly icon: Phaser.GameObjects.Graphics;
  private readonly keyI: Phaser.Input.Keyboard.Key;
  private pointerUsed = false;

  constructor(scene: Phaser.Scene, onItem: (line: string) => void) {
    this.menu = new BagMenu(scene, {
      onPick: (entry) => {
        if (entry.kind === "item" && isFood(entry.id)) {
          if (!run.party.length) {
            onItem("Need a Pompeymon.");
            return;
          }
          this.feed.show(entry.id);
          return;
        }
        onItem(bagLine(entry));
      },
    });
    this.feed = new FeedMenu(scene, { onDone: (line) => onItem(line) });
    this.icon = scene.add.graphics();
    paintBagIcon(this.icon);
    this.icon.setPosition(ICON_X, ICON_Y);
    this.icon.setDepth(41);
    this.icon.setScrollFactor(0);
    scene.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!run.hasBag || !this.icon.visible) return;
      if (!this.hitIcon(pointer)) return;
      this.pointerUsed = true;
      this.toggle();
    });
    this.keyI = scene.input.keyboard!.addKey("I");
    syncBagChrome();
    this.sync();
    mountDebugBack(scene);
  }

  private hitIcon(pointer: Phaser.Input.Pointer): boolean {
    return pointer.x >= ICON_X - 2 && pointer.x < ICON_X + ICON_W + 2 && pointer.y >= ICON_Y - 2 && pointer.y < ICON_Y + ICON_H + 2;
  }

  private toggle(): void {
    if (this.menu.active) this.menu.hide();
    else this.menu.show();
  }

  atePointer(): boolean {
    const hit = this.pointerUsed;
    this.pointerUsed = false;
    return hit;
  }

  get busy(): boolean {
    return this.menu.active || this.feed.active;
  }

  sync(): void {
    // Touch UI already has a BAG button on the control deck — hide the HUD icon.
    this.icon.setVisible(run.hasBag && !isTouchUi());
    syncBagChrome();
  }

  /** True if the bag ate this frame (menu open or just toggled). */
  update(
    cursors: Phaser.Types.Input.Keyboard.CursorKeys,
    wasd: Record<"W" | "S", Phaser.Input.Keyboard.Key>,
    confirm: boolean,
    cancel: boolean,
  ): boolean {
    this.sync();
    const toggle =
      run.hasBag && (Phaser.Input.Keyboard.JustDown(this.keyI) || consumeBag());
    if (toggle) {
      this.toggle();
      return true;
    }
    if (this.feed.active) {
      this.feed.update(cursors, wasd, confirm, cancel);
      return true;
    }
    if (this.menu.active) {
      this.menu.update(cursors, wasd, confirm, cancel);
      return true;
    }
    return false;
  }
}
