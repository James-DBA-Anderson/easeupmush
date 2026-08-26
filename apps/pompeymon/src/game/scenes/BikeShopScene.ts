import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { ITEM, run, takePrize } from "../run";
import { kidAnim } from "../sprites/kid";
import { ensureNpcSheets, npcAnim, npcSheet } from "../sprites/npc";
import { BagUi } from "../ui/BagUi";
import { MsgBox, type Line } from "../ui/MsgBox";
import { ShopMenu, type ShopStock } from "../ui/ShopMenu";
import { isTouchUi } from "../touch";
import {
  addWalls,
  armSouthExit,
  bindWalkKeys,
  justAction,
  justCancel,
  near,
  spawnKid,
  tickWalk,
  walkingInto,
  type Facing,
  type WalkKeys,
} from "../walk";
import { dismountHint } from "../world/bike";
import { drawBikeShop, type BikeShopLayout } from "../world/drawBikeShop";
import { PalField } from "../world/pal";

const COSHAM: ShopStock[] = [{ id: "bmx", label: ITEM.bmx.label, price: 80, line: "Second-hand BMX. Faster. Wilds bounce off." }];
const HILSEA: ShopStock[] = [
  { id: "bmx", label: ITEM.bmx.label, price: 80, line: "BMX. Lock it or they'll chore it." },
  { id: "lock", label: ITEM.lock.label, price: 25, line: "D-lock. Front wheel. Sometimes they still take the rest." },
];

export class BikeShopScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: WalkKeys;
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private layout!: BikeShopLayout;
  private note?: MsgBox;
  private bagUi?: BagUi;
  private pal!: PalField;
  private shop?: ShopMenu;
  private facing: Facing = "up";
  private flip = 1;
  private reaching = false;
  private from: "highstreet" | "island" = "highstreet";
  private southExit = { armed: false };

  constructor() {
    super("bikeshop");
  }

  init(data: { from?: "highstreet" | "island" }): void {
    this.from = data.from === "island" ? "island" : "highstreet";
    this.southExit = { armed: false };
  }

  create(): void {
    if (this.textures.exists("bikeshop")) this.textures.remove("bikeshop");
    const art = this.add.graphics().setVisible(false);
    this.layout = drawBikeShop(art);
    art.generateTexture("bikeshop", GBA_W, GBA_H);
    art.destroy();
    this.add.image(0, 0, "bikeshop").setOrigin(0);

    ensureNpcSheets(this);
    this.add.sprite(156, 46, npcSheet("polo"), "idle-down").play(npcAnim("polo", "idle-down")).setDepth(9);

    this.player = spawnKid(this, this.layout.spawn.x, this.layout.spawn.y);
    addWalls(this, this.player, this.layout.solids);
    const keys = bindWalkKeys(this);
    this.cursors = keys.cursors;
    this.wasd = keys.wasd;
    this.note = new MsgBox(this);
    this.bagUi = new BagUi(this, (line) => this.showNote(line));
    this.pal = new PalField(this, this.player, (line) => this.showNote(line));
    this.shop = new ShopMenu(this, this.from === "island" ? HILSEA : COSHAM, {
      cash: () => run.cash,
      onPick: (item, qty) => this.buy(item, qty),
    }, "CYCLES");

    if (!isTouchUi()) {
      this.input.on("pointerdown", () => {
        if (this.bagUi?.atePointer()) return;
        if (this.note?.advance()) return;
        if (this.shop?.active || this.bagUi?.busy) return;
        if (!this.reaching) this.tryExamine();
      });
    }
  }

  update(): void {
    const confirm = justAction(this.cursors, this.wasd);
    const cancel = justCancel(this.wasd);

    if (this.shop?.active) {
      this.player.body.setVelocity(0, 0);
      this.shop.update(this.cursors, { W: this.wasd.W, A: this.wasd.A, S: this.wasd.S, D: this.wasd.D }, confirm, cancel);
      return;
    }

    if (this.bagUi?.update(this.cursors, { W: this.wasd.W, A: this.wasd.A, S: this.wasd.S, D: this.wasd.D }, confirm, cancel)) {
      this.player.body.setVelocity(0, 0);
      return;
    }

    if (this.note?.open) {
      this.player.body.setVelocity(0, 0);
      if (confirm) this.note.advance();
      return;
    }

    if (this.reaching) {
      this.player.body.setVelocity(0, 0);
      return;
    }

    const walked = tickWalk(this.player, this.cursors, this.wasd, this.facing, this.flip);
    this.facing = walked.facing;
    this.flip = walked.flip;
    this.pal.tick(this.facing, this.flip);

    if (armSouthExit(this.player, this.cursors, this.wasd, this.southExit) && walkingInto(this.player, this.layout.door, "down")) {
      this.scene.start(this.from, { from: "bikeshop" });
      return;
    }

    if (confirm) this.tryExamine();
  }

  private buy(item: ShopStock, _qty: number): void {
    if (run.items.includes(item.id as "bmx" | "lock")) {
      this.showNote({ who: "RAY", text: "You already got one mush." });
      return;
    }
    if (run.cash < item.price) {
      this.showNote({ who: "RAY", text: "Aint got the dosh." });
      return;
    }
    run.cash -= item.price;
    takePrize(item.id as "bmx" | "lock");
    if (item.id === "bmx") {
      run.mounted = true;
      run.parked = null;
      this.showNote([
        { who: "RAY", text: "Cushty. Ride it out." },
        { who: "RAY", text: "Most wild Pompeymon leave you alone on that." },
        dismountHint(),
      ]);
      return;
    }
    this.showNote([
      { who: "RAY", text: "Cushty." },
      `Bought ${item.label}.`,
    ]);
  }

  private tryExamine(): void {
    if (this.pal.tryTalk()) return;
    if (near(this.player, this.layout.counter, 14)) {
      if (run.lockChored && run.items.includes("lock") && !run.items.includes("bmx")) {
        run.lockChored = false;
        this.reachThen(
          [
            { who: "YOU", text: "Someone chored my bike. Even with the lock on it." },
            { who: "RAY", text: "Yeah beard on mush. No one beats my locks!" },
          ],
          () => this.shop?.show(),
        );
        return;
      }
      const own = run.items.includes("bmx");
      const intro: Line[] = [
        {
          who: "RAY",
          text: own
            ? "Most wild Pompeymon leave you alone on that."
            : this.from === "island"
              ? "Hilsea Cycles. Bike. Lock."
              : "Cosham Cycles. One BMX left.",
        },
      ];
      if (!own) intro.push({ who: "RAY", text: "Most wild Pompeymon leave you alone on that." });
      this.reachThen(intro, () => this.shop?.show());
      return;
    }
    if (near(this.player, this.layout.rack, 10)) {
      this.reachThen("Second-hand BMXs. Ray's on the till.");
    }
  }

  private reachThen(line: Line | Line[], onDone?: () => void): void {
    this.reaching = true;
    this.player.body.setVelocity(0, 0);
    const reach = this.facing === "down" ? "reach-down" : "reach-side";
    this.player.anims.play(kidAnim(run.outfit, reach));
    this.showNote(line, onDone);
    this.time.delayedCall(520, () => {
      this.reaching = false;
      const idle = this.facing === "up" ? "idle-up" : this.facing === "side" ? "idle-side" : "idle-down";
      this.player.anims.play(kidAnim(run.outfit, idle));
    });
  }

  private showNote(text: Line | Line[], onDone?: () => void): void {
    this.note?.show(text, onDone);
  }
}
