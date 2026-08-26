import Phaser from "phaser";
import { GBA_H, GBA_W, UI_DEPTH } from "../constants";
import {
  bagLabel,
  bagLine,
  bagMons,
  bagPockets,
  battleBagMons,
  battleBagPockets,
  isFood,
  run,
  syncBagChrome,
  type BagEntry,
} from "../run";
import { consumeBag, consumeDir, isTouchUi } from "../touch";
import { mountDebugBack } from "./debugBack";
import { FeedMenu } from "./FeedMenu";
import { MonDetail } from "./MonDetail";
import type { Line } from "./MsgBox";
import { canScan, PompdexEntry } from "./Pompdex";
import type { SpeciesId } from "../species";

type BagCallbacks = {
  onPick: (entry: BagEntry) => void;
};

type Pocket = "mons" | "pockets";

const BAG_W = 216;
const BAG_H = 120;
const ROW = 12;
const VISIBLE = 5;
const LIST_Y = 36;

/** FireRed-style bag: MONS main, POCKETS for items. Left/right switches. */
export class BagMenu {
  private root: Phaser.GameObjects.Container;
  private title: Phaser.GameObjects.Text;
  private tabs: Phaser.GameObjects.Text;
  private cursor: Phaser.GameObjects.Text;
  private lines: Phaser.GameObjects.Text[] = [];
  private empty: Phaser.GameObjects.Text;
  private pocket: Pocket = "mons";
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

    this.title = scene.add
      .text(GBA_W / 2, y + 6, "BAG", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "8px",
        color: "#f0a23a",
      })
      .setOrigin(0.5, 0);

    this.tabs = scene.add
      .text(GBA_W / 2, y + 18, "", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "6px",
        color: "#c8e0a8",
      })
      .setOrigin(0.5, 0);

    this.cursor = scene.add.text(x + 10, y + LIST_Y, ">", {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: "8px",
      color: "#f2e6d0",
    });

    this.empty = scene.add.text(x + 22, y + LIST_Y, "Empty.", {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: "8px",
      color: "#8aa3b0",
    });

    const hint = scene.add
      .text(
        GBA_W / 2,
        y + BAG_H - 8,
        isTouchUi() ? "LOOK  PICK   <>  POCKET   BACK" : "SPACE  PICK   <>  POCKET   ESC",
        {
          fontFamily: '"Press Start 2P", monospace',
          fontSize: "6px",
          color: "#8aa3b0",
        },
      )
      .setOrigin(0.5, 1);

    this.root = scene.add.container(0, 0, [dim, plate, this.title, this.tabs, this.cursor, this.empty, hint]);
    this.root.setDepth(UI_DEPTH);
    this.root.setScrollFactor(0);
    this.root.setVisible(false);
  }

  get active(): boolean {
    return this.open;
  }

  show(): void {
    this.open = true;
    this.pocket = "mons";
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
    wasd: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>,
    confirm: boolean,
    cancel: boolean,
  ): void {
    if (!this.open) return;
    if (
      Phaser.Input.Keyboard.JustDown(cursors.left) ||
      Phaser.Input.Keyboard.JustDown(wasd.A) ||
      consumeDir("left")
    ) {
      this.switchPocket("mons");
      return;
    }
    if (
      Phaser.Input.Keyboard.JustDown(cursors.right) ||
      Phaser.Input.Keyboard.JustDown(wasd.D) ||
      consumeDir("right")
    ) {
      this.switchPocket("pockets");
      return;
    }
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

  private switchPocket(next: Pocket): void {
    if (this.pocket === next) return;
    this.pocket = next;
    this.index = 0;
    this.scroll = 0;
    this.refresh();
  }

  private list(): BagEntry[] {
    if (this.battle) {
      return this.pocket === "mons" ? battleBagMons() : battleBagPockets();
    }
    return this.pocket === "mons" ? bagMons() : bagPockets();
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
    const onMons = this.pocket === "mons";
    this.tabs.setText(onMons ? "> MONS   pockets" : "  mons   > POCKETS");
    this.tabs.setColor(onMons ? "#c8e0a8" : "#e8d0a0");
    const entries = this.list();
    if (entries.length === 0) {
      this.empty.setText(onMons ? (this.battle ? "No Pompeymon." : "No Pompeymon.") : "Pockets empty.");
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
  private readonly detail: MonDetail;
  private readonly pompdex: PompdexEntry;
  private readonly onSay: (msg: Line | Line[]) => void;
  private readonly icon: Phaser.GameObjects.Graphics;
  private readonly keyI: Phaser.Input.Keyboard.Key;
  private pointerUsed = false;

  constructor(scene: Phaser.Scene, onSay: (msg: Line | Line[]) => void) {
    this.onSay = onSay;
    this.menu = new BagMenu(scene, {
      onPick: (entry) => {
        if (entry.kind === "mon") {
          this.detail.show(entry.mon);
          return;
        }
        if (entry.kind === "item" && entry.id === "pompdex") {
          if (!run.seen.length) {
            onSay(["Pompdex empty.", "Look near a wild Pompeymon to scan."]);
            return;
          }
          const last = run.seen[run.seen.length - 1]!;
          this.pompdex.show(last);
          return;
        }
        if (entry.kind === "item" && isFood(entry.id)) {
          if (!run.party.length) {
            onSay("Need a Pompeymon.");
            return;
          }
          this.feed.show(entry.id);
          return;
        }
        onSay(bagLine(entry));
      },
    });
    this.feed = new FeedMenu(scene, { onDone: (line) => onSay(line) });
    this.detail = new MonDetail(scene, {
      onSay,
      onClose: () => {
        /* stay in overworld; bag already closed */
      },
    });
    this.pompdex = new PompdexEntry(scene);
    this.icon = scene.add.graphics();
    paintBagIcon(this.icon);
    this.icon.setPosition(ICON_X, ICON_Y);
    this.icon.setDepth(UI_DEPTH - 1);
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

  /** Look near a wild — open Pompdex page and mark seen. */
  scanWild(id: SpeciesId): boolean {
    if (!canScan()) {
      this.onSay("Need a Pompdex.");
      return false;
    }
    this.pompdex.show(id);
    return true;
  }

  private hitIcon(pointer: Phaser.Input.Pointer): boolean {
    return pointer.x >= ICON_X - 2 && pointer.x < ICON_X + ICON_W + 2 && pointer.y >= ICON_Y - 2 && pointer.y < ICON_Y + ICON_H + 2;
  }

  private toggle(): void {
    if (this.pompdex.active) {
      this.pompdex.hide();
      return;
    }
    if (this.detail.active) {
      this.detail.hide();
      return;
    }
    if (this.menu.active) this.menu.hide();
    else this.menu.show();
  }

  atePointer(): boolean {
    const hit = this.pointerUsed;
    this.pointerUsed = false;
    return hit;
  }

  get busy(): boolean {
    return this.menu.active || this.feed.active || this.detail.active || this.pompdex.active;
  }

  sync(): void {
    // Touch UI already has a BAG button on the control deck — hide the HUD icon.
    this.icon.setVisible(run.hasBag && !isTouchUi());
    syncBagChrome();
  }

  /** True if the bag ate this frame (menu open or just toggled). */
  update(
    cursors: Phaser.Types.Input.Keyboard.CursorKeys,
    wasd: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>,
    confirm: boolean,
    cancel: boolean,
  ): boolean {
    this.sync();
    if (this.pompdex.active) {
      this.pompdex.update(confirm, cancel);
      return true;
    }
    if (this.detail.active) {
      this.detail.update(cursors, { W: wasd.W, S: wasd.S }, confirm, cancel);
      return true;
    }
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
