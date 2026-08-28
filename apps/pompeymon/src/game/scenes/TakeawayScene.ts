import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { ITEM, run, takeStack } from "../run";
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
import { drawTakeaway, type TakeawayKind, type TakeawayLayout } from "../world/drawTakeaway";
import { PalField } from "../world/pal";

const CHIPPY: ShopStock[] = [
  { id: "chips", label: ITEM.chips.label, price: 4, stack: true, line: "Chip cone. EARTH if they eat it." },
  { id: "fish", label: ITEM.fish.label, price: 6, stack: true, line: "Battered fish. WATER." },
];

const SPICE: ShopStock[] = [
  { id: "curry", label: ITEM.curry.label, price: 5, stack: true, line: "Hot curry. FIRE or WIND." },
  { id: "doner", label: ITEM.doner.label, price: 5, stack: true, line: "Doner kebab. POISON." },
];

type Street = "highstreet" | "island";

export class TakeawayScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: WalkKeys;
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private layout!: TakeawayLayout;
  private note?: MsgBox;
  private bagUi?: BagUi;
  private pal!: PalField;
  private shop?: ShopMenu;
  private facing: Facing = "up";
  private flip = 1;
  private reaching = false;
  private kind: TakeawayKind = "chippy";
  private from: Street = "highstreet";
  private southExit = { armed: false };

  constructor() {
    super("takeaway");
  }

  init(data: { kind?: TakeawayKind; from?: Street }): void {
    this.kind = data.kind === "spice" ? "spice" : "chippy";
    this.from = data.from === "island" ? "island" : "highstreet";
    this.southExit = { armed: false };
  }

  create(): void {
    if (this.textures.exists("takeaway")) this.textures.remove("takeaway");
    const art = this.add.graphics().setVisible(false);
    this.layout = drawTakeaway(art, this.kind);
    art.generateTexture("takeaway", GBA_W, GBA_H);
    art.destroy();
    this.add.image(0, 0, "takeaway").setOrigin(0);

    ensureNpcSheets(this);
    const look = this.kind === "chippy" ? "polo" : "hoodie";
    this.add.sprite(156, 46, npcSheet(look), "idle-down").play(npcAnim(look, "idle-down")).setDepth(9);

    this.player = spawnKid(this, this.layout.spawn.x, this.layout.spawn.y);
    addWalls(this, this.player, this.layout.solids);
    const keys = bindWalkKeys(this);
    this.cursors = keys.cursors;
    this.wasd = keys.wasd;
    this.note = new MsgBox(this);
    this.bagUi = new BagUi(this, (line) => this.showNote(line));
    this.pal = new PalField(this, this.player, (line) => this.showNote(line));
    this.shop = new ShopMenu(
      this,
      this.kind === "chippy" ? CHIPPY : SPICE,
      { cash: () => run.cash, onPick: (item, qty) => this.buy(item, qty) },
      this.kind === "chippy" ? "CHIPPY" : "SPICE",
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
      this.scene.start(this.from, { from: this.kind });
      return;
    }

    if (confirm) this.tryExamine();
  }

  private clerk(): string {
    return this.kind === "chippy" ? "TERRY" : "RAJ";
  }

  private buy(item: ShopStock, qty: number): void {
    const n = Math.max(1, qty);
    const cost = item.price * n;
    if (run.cash < cost) {
      this.showNote({ who: this.clerk(), text: "Aint got the dosh." });
      return;
    }
    run.cash -= cost;
    takeStack(item.id as "curry" | "doner" | "chips" | "fish", n);
    const got = n > 1 ? `Bought ${item.label} x${n}.` : `Bought ${item.label}.`;
    this.showNote([{ who: this.clerk(), text: "There y'are." }, got]);
  }

  private tryExamine(): void {
    if (near(this.player, this.layout.counter, 14)) {
      const line =
        this.kind === "chippy"
          ? { who: "TERRY", text: "Chippy. Chips. Fish. Feed your Pompeymon." }
          : { who: "RAJ", text: "Curry. Kebab. Changes 'em." };
      this.reachThen(line, () => this.shop?.show());
      return;
    }
    if (near(this.player, this.layout.rack, 10)) {
      this.reachThen(this.kind === "chippy" ? "Hot fat. Papers." : "Chillies. Meat on the spit.");
    }
    this.pal.tryTalk();
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
