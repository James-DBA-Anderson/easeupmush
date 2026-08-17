import Phaser from "phaser";
import type { StallKind } from "../assets/doodleTextures";
import type { Obstacle } from "./obstacles";

export interface FoodStallSpawn {
  kind: StallKind;
  x: number;
  y: number;
  depth?: number;
}

interface StallStats {
  /** What the vendor calls a portion. */
  item: string;
  /** Vendor's trading name. */
  trader: string;
  price: number;
  /** How much condition one portion buys back (0–1). */
  quality: number;
  /** Portions before he's sold out. */
  servings: number;
  patter: string[];
}

const STATS: Record<StallKind, StallStats> = {
  chips: {
    item: "chips",
    trader: "Fryer Tuck's",
    price: 7,
    quality: 0.85,
    servings: 3,
    patter: [
      "Salt and vinegar on that, mate?",
      "Fresh out the fryer, that.",
      "Mind the seagulls with them.",
    ],
  },
  icecream: {
    item: "a whippy",
    trader: "Mr Sprinkle",
    price: 4,
    quality: 0.45,
    servings: 4,
    patter: [
      "Flake in it, is it?",
      "Eat it quick, it's going everywhere.",
      "Ninety-nine, coming up.",
    ],
  },
  doughnut: {
    item: "doughnuts",
    trader: "The Donut Hut",
    price: 5,
    quality: 0.6,
    servings: 3,
    patter: [
      "Bag of five, still warm.",
      "Sugar all down your front, that will be.",
      "Best on the front, these.",
    ],
  },
  eels: {
    item: "jellied eels",
    trader: "Eel Ada's",
    price: 6,
    quality: 0.75,
    servings: 2,
    patter: [
      "Puts hairs on your chest, love.",
      "Don't pull that face, get it down you.",
      "Proper seaside grub, that.",
    ],
  },
};

export type FeedOutcome =
  | { ok: true; item: string; price: number; quality: number; patter: string }
  | { ok: false; reason: "sold_out" | "skint" | "not_hungry" | "busy" };

/**
 * Seafront grub kiosk. Walk up, hand over cash, get your wind back.
 * Solid scenery — the vendor won't have you climbing over his counter.
 */
export class FoodStall {
  readonly kind: StallKind;
  readonly x: number;
  readonly y: number;
  readonly rx = 52;
  readonly ry = 14;
  private readonly stats: StallStats;
  private servingsLeft: number;
  private readonly image: Phaser.GameObjects.Image;
  private readonly board: Phaser.GameObjects.Text;
  private patterIndex = 0;

  constructor(scene: Phaser.Scene, spawn: FoodStallSpawn) {
    this.kind = spawn.kind;
    this.x = spawn.x;
    this.y = spawn.y;
    this.stats = STATS[spawn.kind];
    this.servingsLeft = this.stats.servings;

    // Behind the fighters (depth 0) but in front of the beach backdrop
    const depth = spawn.depth ?? -8;
    this.image = scene.add
      .image(spawn.x, spawn.y, `stall_${spawn.kind}`)
      .setOrigin(0.5, 1)
      .setDepth(depth);

    // Chalked price board so you can see the deal without walking up
    this.board = scene.add
      .text(spawn.x, spawn.y - 158, "", {
        fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
        fontSize: "13px",
        color: "#1a1410",
        backgroundColor: "#f2e6d8",
        padding: { x: 6, y: 3 },
        align: "center",
      })
      .setOrigin(0.5, 1)
      .setDepth(90);
    this.refreshBoard();
  }

  get label(): string {
    return this.stats.trader;
  }

  get item(): string {
    return this.stats.item;
  }

  get price(): number {
    return this.stats.price;
  }

  get soldOut(): boolean {
    return this.servingsLeft <= 0;
  }

  private refreshBoard(): void {
    this.board.setText(
      this.soldOut
        ? `${this.stats.trader}\nSOLD OUT`
        : `${this.stats.trader}\n${this.stats.item} £${this.stats.price}`,
    );
    this.board.setAlpha(this.soldOut ? 0.55 : 1);
  }

  /** Standing at the hatch? */
  inRange(px: number, py: number): boolean {
    return (
      Math.abs(px - this.x) <= this.rx + 26 && Math.abs(py - this.y) <= this.ry + 46
    );
  }

  asObstacle(): Obstacle {
    return { x: this.x, y: this.y, rx: this.rx, ry: this.ry, kind: "prop" };
  }

  /** Buy a portion. Money is only taken when the vendor actually serves. */
  buy(buyer: {
    money: number;
    structure: { isOut(): boolean; needsFeed(): boolean; feed(q: number): boolean };
  }): FeedOutcome {
    if (this.soldOut) return { ok: false, reason: "sold_out" };
    if (buyer.structure.isOut()) return { ok: false, reason: "busy" };
    if (!buyer.structure.needsFeed()) return { ok: false, reason: "not_hungry" };
    if (buyer.money < this.stats.price) return { ok: false, reason: "skint" };

    buyer.money -= this.stats.price;
    buyer.structure.feed(this.stats.quality);
    this.servingsLeft -= 1;
    this.refreshBoard();

    const patter = this.stats.patter[this.patterIndex % this.stats.patter.length]!;
    this.patterIndex += 1;

    return {
      ok: true,
      item: this.stats.item,
      price: this.stats.price,
      quality: this.stats.quality,
      patter,
    };
  }

  scorch(): void {
    this.image.setTint(0x3a342c);
    this.board.setVisible(false);
  }

  destroy(): void {
    this.image.destroy();
    this.board.destroy();
  }
}
