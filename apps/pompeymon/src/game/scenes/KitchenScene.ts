import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { run, takeBag } from "../run";
import { kidAnim } from "../sprites/kid";
import { MsgBox, type Line } from "../ui/MsgBox";
import { BagUi } from "../ui/BagUi";
import {
  addWalls,
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
import { isTouchUi } from "../touch";
import { ensureMum } from "../sprites/mum";
import { drawKitchen, type KitchenLayout } from "../world/drawKitchen";

export class KitchenScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: WalkKeys;
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private layout!: KitchenLayout;
  private room!: Phaser.GameObjects.Image;
  private note?: MsgBox;
  private bagUi?: BagUi;
  private facing: Facing = "up";
  private flip = 1;
  private reaching = false;

  constructor() {
    super("kitchen");
  }

  create(): void {
    if (this.textures.exists("kitchen")) this.textures.remove("kitchen");
    const art = this.add.graphics().setVisible(false);
    this.layout = drawKitchen(art);
    art.generateTexture("kitchen", GBA_W, GBA_H);
    art.destroy();
    this.room = this.add.image(0, 0, "kitchen").setOrigin(0);

    ensureMum(this);
    this.add.image(this.layout.mum.x + 8, this.layout.mum.y + 10, "mum").setDepth(9);

    this.player = spawnKid(this, this.layout.spawn.x, this.layout.spawn.y);
    addWalls(this, this.player, this.layout.solids);
    const keys = bindWalkKeys(this);
    this.cursors = keys.cursors;
    this.wasd = keys.wasd;
    this.note = new MsgBox(this);
    this.bagUi = new BagUi(this, (line) => this.showNote(line));

    if (!isTouchUi()) {
      this.input.on("pointerdown", () => {
        if (this.bagUi?.atePointer()) return;
        if (this.note?.advance()) return;
        if (this.bagUi?.menu.active) return;
        if (!this.reaching) this.tryExamine();
      });
    }
  }

  update(): void {
    const confirm = justAction(this.cursors, this.wasd);
    const cancel = justCancel(this.wasd);

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

    if (walkingInto(this.player, this.layout.door, "down")) {
      this.scene.start("hall", { from: "kitchen" });
      return;
    }

    if (confirm) this.tryExamine();
  }

  private tryExamine(): void {
    if (!run.hasBag && near(this.player, this.layout.bag, 10)) {
      takeBag();
      this.bagUi?.sync();
      if (this.textures.exists("kitchen")) this.textures.remove("kitchen");
      const art = this.add.graphics().setVisible(false);
      this.layout = drawKitchen(art);
      art.generateTexture("kitchen", GBA_W, GBA_H);
      art.destroy();
      this.room.destroy();
      this.room = this.add.image(0, 0, "kitchen").setOrigin(0).setDepth(0);
      this.reachThen("Bag. Pogs in the front.");
      return;
    }
    if (near(this.player, this.layout.mum, 10)) {
      this.reachThen({ who: "MUM", text: run.hasBag ? "Go on then." : "Don't forget your bag." });
      return;
    }
    if (near(this.player, this.layout.cooker, 8)) {
      this.reachThen("Hob's going. Don't touch.");
      return;
    }
    if (near(this.player, this.layout.sink, 8)) {
      this.reachThen("Washing up from last night.");
      return;
    }
    if (near(this.player, this.layout.table, 8)) {
      this.reachThen("Toast crusts. Tea's milky.");
      return;
    }
    if (near(this.player, this.layout.fridge, 8)) {
      this.reachThen("Milk. Leftover mash. Don't.");
      return;
    }
    this.reachThen("Kitchen. Mum's in here.");
  }

  private reachThen(line: Line | Line[]): void {
    this.reaching = true;
    this.player.body.setVelocity(0, 0);
    const reach = this.facing === "down" ? "reach-down" : "reach-side";
    this.player.anims.play(kidAnim(run.outfit, reach));
    this.showNote(line);
    this.time.delayedCall(520, () => {
      this.reaching = false;
      const idle = this.facing === "up" ? "idle-up" : this.facing === "side" ? "idle-side" : "idle-down";
      this.player.anims.play(kidAnim(run.outfit, idle));
    });
  }

  private showNote(text: Line | Line[]): void {
    this.note?.show(text);
  }
}
