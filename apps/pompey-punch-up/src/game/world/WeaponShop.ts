import Phaser from "phaser";
import type { WeaponKind } from "./WeaponPickup";
import type { Obstacle } from "./obstacles";

export interface WeaponStock {
  kind: WeaponKind;
  name: string;
  price: number;
}

/** Unique pier hardware — not on the ground loot table. */
export const UNIQUE_WEAPON_STOCK: WeaponStock[] = [
  { kind: "chain", name: "bike chain", price: 28 },
  { kind: "cue", name: "pool cue", price: 36 },
  { kind: "knuckle", name: "brass knuckles", price: 45 },
];

export type WeaponBuyOutcome =
  | { ok: true; kind: WeaponKind; name: string; price: number; patter: string }
  | { ok: false; reason: "sold_out" | "skint" | "busy" };

/**
 * Dodgy kiosk that fences unique scrap weapons for cash.
 */
export class WeaponShop {
  readonly x: number;
  readonly y: number;
  readonly rx = 54;
  readonly ry = 14;
  readonly label: string;
  private readonly stock: WeaponStock[];
  private readonly image: Phaser.GameObjects.Image;
  private readonly board: Phaser.GameObjects.Text;
  private patterIndex = 0;

  private static readonly PATTER = [
    "Don't flash that about, yeah?",
    "Cash only. I never saw you.",
    "Proper bit of kit, that.",
    "Keep it off the Bill.",
  ];

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    opts: { label?: string; stock?: WeaponStock[]; depth?: number } = {},
  ) {
    this.x = x;
    this.y = y;
    this.label = opts.label ?? "Dodgy Dave's";
    this.stock = [...(opts.stock ?? UNIQUE_WEAPON_STOCK)];

    const depth = opts.depth ?? -8;
    this.image = scene.add
      .image(x, y, "stall_weapons")
      .setOrigin(0.5, 1)
      .setDepth(depth);

    this.board = scene.add
      .text(x, y - 168, "", {
        fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
        fontSize: "12px",
        color: "#1a1410",
        backgroundColor: "#f2e6d8",
        padding: { x: 6, y: 3 },
        align: "center",
      })
      .setOrigin(0.5, 1)
      .setDepth(90);
    this.refreshBoard();
  }

  get soldOut(): boolean {
    return this.stock.length === 0;
  }

  get offer(): WeaponStock | null {
    return this.stock[0] ?? null;
  }

  private refreshBoard(): void {
    const next = this.offer;
    this.board.setText(
      next
        ? `${this.label}\n${next.name} £${next.price}`
        : `${this.label}\nSOLD OUT`,
    );
    this.board.setAlpha(next ? 1 : 0.55);
  }

  inRange(px: number, py: number): boolean {
    return (
      Math.abs(px - this.x) <= this.rx + 26 && Math.abs(py - this.y) <= this.ry + 46
    );
  }

  asObstacle(): Obstacle {
    return { x: this.x, y: this.y, rx: this.rx, ry: this.ry, kind: "prop" };
  }

  buy(buyer: { money: number; structure: { isOut(): boolean } }): WeaponBuyOutcome {
    if (this.soldOut) return { ok: false, reason: "sold_out" };
    if (buyer.structure.isOut()) return { ok: false, reason: "busy" };
    const item = this.stock[0]!;
    if (buyer.money < item.price) return { ok: false, reason: "skint" };

    buyer.money -= item.price;
    this.stock.shift();
    this.refreshBoard();

    const patter =
      WeaponShop.PATTER[this.patterIndex % WeaponShop.PATTER.length]!;
    this.patterIndex += 1;

    return {
      ok: true,
      kind: item.kind,
      name: item.name,
      price: item.price,
      patter,
    };
  }

  destroy(): void {
    this.image.destroy();
    this.board.destroy();
  }
}
