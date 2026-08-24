import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { ITEM, run, takePrize, takeStack, type ItemId } from "../run";
import { kidAnim } from "../sprites/kid";
import { ensureNpcSheets, npcAnim, npcSheet, type NpcLook } from "../sprites/npc";
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
import { drawJunkShop, type JunkKind, type JunkShopLayout } from "../world/drawJunkShop";

const CHARITY: ShopStock[] = [
  { id: "plaster", label: ITEM.plaster.label, price: 3, stack: true, line: "Old plaster. Barely sticks." },
  { id: "stale", label: ITEM.stale.label, price: 6, stack: true, line: "Out of date Chomp. Still a Chomp." },
  { id: "moth", label: ITEM.moth.label, price: 5, line: "Moth jumper. Itchy." },
  { id: "mug", label: ITEM.mug.label, price: 2, line: "Cracked mug. Stains." },
];

const PAWN: ShopStock[] = [
  { id: "plaster", label: ITEM.plaster.label, price: 5, stack: true, line: "Pawn plaster. Dear for what it is." },
  { id: "chain", label: ITEM.chain.label, price: 12, line: "Gold chain. It aint." },
  { id: "radio", label: ITEM.radio.label, price: 10, line: "Radio. Doesn't. Tape's stuck." },
];

type Street = "highstreet" | "island";

export class JunkShopScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: WalkKeys;
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private layout!: JunkShopLayout;
  private note?: MsgBox;
  private bagUi?: BagUi;
  private shop?: ShopMenu;
  private facing: Facing = "up";
  private flip = 1;
  private reaching = false;
  private kind: JunkKind = "charity";
  private from: Street = "highstreet";
  private southExit = { armed: false };

  constructor() {
    super("junkshop");
  }

  init(data: { kind?: JunkKind; from?: Street }): void {
    this.kind = data.kind === "pawn" ? "pawn" : "charity";
    this.from = data.from === "island" ? "island" : "highstreet";
    this.southExit = { armed: false };
  }

  create(): void {
    if (this.textures.exists("junkshop")) this.textures.remove("junkshop");
    const art = this.add.graphics().setVisible(false);
    this.layout = drawJunkShop(art, this.kind);
    art.generateTexture("junkshop", GBA_W, GBA_H);
    art.destroy();
    this.add.image(0, 0, "junkshop").setOrigin(0);

    const look: NpcLook = this.kind === "charity" ? "coat" : "drunk";
    ensureNpcSheets(this);
    this.add.sprite(156, 46, npcSheet(look), "idle-down").play(npcAnim(look, "idle-down")).setDepth(9);

    this.player = spawnKid(this, this.layout.spawn.x, this.layout.spawn.y);
    addWalls(this, this.player, this.layout.solids);
    const keys = bindWalkKeys(this);
    this.cursors = keys.cursors;
    this.wasd = keys.wasd;
    this.note = new MsgBox(this);
    this.bagUi = new BagUi(this, (line) => this.showNote(line));
    this.shop = new ShopMenu(
      this,
      this.kind === "charity" ? CHARITY : PAWN,
      { cash: () => run.cash, onPick: (item) => this.buy(item) },
      this.kind === "charity" ? "CHARITY" : "PAWN",
    );

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
      this.shop.update(this.cursors, { W: this.wasd.W, S: this.wasd.S }, confirm, cancel);
      return;
    }

    if (this.bagUi?.update(this.cursors, { W: this.wasd.W, S: this.wasd.S }, confirm, cancel)) {
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

    if (armSouthExit(this.player, this.cursors, this.wasd, this.southExit) && walkingInto(this.player, this.layout.door, "down")) {
      this.scene.start(this.from, { from: this.kind });
      return;
    }

    if (confirm) this.tryExamine();
  }

  private clerk(): string {
    return this.kind === "charity" ? "NAN" : "LEN";
  }

  private buy(item: ShopStock): void {
    const id = item.id as ItemId;
    if (!item.stack && run.items.includes(id)) {
      this.showNote({ who: this.clerk(), text: "You already got one mush." });
      return;
    }
    if (run.cash < item.price) {
      this.showNote({ who: this.clerk(), text: "Aint got the dosh." });
      return;
    }
    run.cash -= item.price;
    if (item.stack) takeStack(id === "stale" ? "stale" : "plaster");
    else takePrize(id);
    this.showNote([{ who: this.clerk(), text: this.kind === "pawn" ? "No returns." : "It's seen better days." }, `Bought ${item.label}.`]);
  }

  private tryExamine(): void {
    if (near(this.player, this.layout.counter, 14)) {
      const line =
        this.kind === "charity"
          ? { who: "NAN", text: "Charity. Cheap. Quality's gone." }
          : { who: "LEN", text: "Pawn. If it's here it's dodgy." };
      this.reachThen(line, () => this.shop?.show());
      return;
    }
    if (near(this.player, this.layout.rack, 10)) {
      this.reachThen(this.kind === "charity" ? "Rails of old coats. Moths." : "Trays of watches. Most stopped.");
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
