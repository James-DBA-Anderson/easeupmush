import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { consumeDir, isTouchUi } from "../touch";
import { bagLabel, eatFood, run, type ItemId, type PartyMon } from "../run";

type FeedCallbacks = {
  onDone: (line: string) => void;
};

/** Pick a party mon (and FIRE/WIND for curry). */
export class FeedMenu {
  private root: Phaser.GameObjects.Container;
  private cursor: Phaser.GameObjects.Text;
  private rows: Phaser.GameObjects.Text[] = [];
  private title: Phaser.GameObjects.Text;
  private index = 0;
  private open = false;
  private food: ItemId = "chips";
  private phase: "who" | "curry" = "who";

  constructor(
    scene: Phaser.Scene,
    private readonly callbacks: FeedCallbacks,
  ) {
    const w = 184;
    const h = 112;
    const x = (GBA_W - w) / 2;
    const y = (GBA_H - h) / 2 - 6;

    const dim = scene.add.rectangle(GBA_W / 2, GBA_H / 2, GBA_W, GBA_H, 0x0b1c24, 0.45);
    const plate = scene.add.rectangle(GBA_W / 2, GBA_H / 2 - 6, w, h, 0x1a1814, 1);
    plate.setStrokeStyle(2, 0xf0a23a);

    this.title = scene.add
      .text(GBA_W / 2, y + 8, "FEED WHO?", {
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

    const hint = scene.add
      .text(GBA_W / 2, y + h - 8, isTouchUi() ? "LOOK  FEED    BACK" : "SPACE  FEED    ESC  BACK", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "6px",
        color: "#8aa3b0",
      })
      .setOrigin(0.5, 1);

    this.root = scene.add.container(0, 0, [dim, plate, this.title, this.cursor, hint]);
    this.root.setDepth(44);
    this.root.setScrollFactor(0);
    this.root.setVisible(false);
  }

  get active(): boolean {
    return this.open;
  }

  show(food: ItemId): void {
    this.food = food;
    this.phase = "who";
    this.index = 0;
    this.open = true;
    this.title.setText("FEED WHO?");
    this.paint();
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
    const n = this.phase === "curry" ? 2 : run.party.length;
    if (n > 1) {
      if (Phaser.Input.Keyboard.JustDown(cursors.up) || Phaser.Input.Keyboard.JustDown(wasd.W) || consumeDir("up")) {
        this.index = (this.index + n - 1) % n;
        this.place();
      }
      if (Phaser.Input.Keyboard.JustDown(cursors.down) || Phaser.Input.Keyboard.JustDown(wasd.S) || consumeDir("down")) {
        this.index = (this.index + 1) % n;
        this.place();
      }
    }
    if (confirm) {
      if (this.phase === "curry") {
        const pick = this.index === 1 ? "wind" : "fire";
        const mon = this.picked;
        this.hide();
        if (mon) this.callbacks.onDone(eatFood(this.food, mon, pick));
        return;
      }
      const mon = run.party[this.index];
      if (!mon) return;
      if (this.food === "curry") {
        this.picked = mon;
        this.phase = "curry";
        this.index = 0;
        this.title.setText("FIRE OR WIND?");
        this.paint();
        return;
      }
      this.hide();
      this.callbacks.onDone(eatFood(this.food, mon));
      return;
    }
    if (cancel) {
      if (this.phase === "curry") {
        this.phase = "who";
        this.index = 0;
        this.title.setText("FEED WHO?");
        this.paint();
        return;
      }
      this.hide();
    }
  }

  private picked?: PartyMon;

  private paint(): void {
    for (const row of this.rows) row.destroy();
    this.rows = [];
    const scene = this.root.scene;
    const w = 184;
    const x = (GBA_W - w) / 2;
    const y = (GBA_H - 112) / 2 - 6;
    const labels =
      this.phase === "curry"
        ? ["FIRE", "WIND"]
        : run.party.map((mon) => bagLabel({ kind: "mon", mon }));
    this.rows = labels.map((label, i) =>
      scene.add.text(x + 22, y + 28 + i * 14, label, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "8px",
        color: "#e8f0f4",
      }),
    );
    for (const row of this.rows) this.root.add(row);
    this.place();
  }

  private place(): void {
    const y = (GBA_H - 112) / 2 - 6;
    this.cursor.setY(y + 28 + this.index * 14);
  }
}
