import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { persistRun, run, takeBag } from "../run";
import { ChoiceMenu } from "../ui/ChoiceMenu";
import { kidAnim } from "../sprites/kid";
import { MsgBox, type Line } from "../ui/MsgBox";
import { BagUi } from "../ui/BagUi";
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
import { isTouchUi } from "../touch";
import { ensureMum } from "../sprites/mum";
import { drawKitchen, type KitchenLayout } from "../world/drawKitchen";
import { PalField } from "../world/pal";

const RENT = 50;

const mumLine = (text: string): Line => ({ who: "MUM", text: withHic(text) });

/** Irritable drunk Mum — hic at the end of every line. */
function withHic(text: string): string {
  const t = text.trim().replace(/\s*hic\.?$/i, "");
  const end = /[.!?]$/.test(t) ? "" : ".";
  return `${t}${end} Hic.`;
}

export class KitchenScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: WalkKeys;
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private layout!: KitchenLayout;
  private room!: Phaser.GameObjects.Image;
  private note?: MsgBox;
  private bagUi?: BagUi;
  private pal!: PalField;
  private facing: Facing = "up";
  private flip = 1;
  private reaching = false;
  private mumSaid = false;
  private bye: "off" | "walk" | "wait" | "line" = "off";
  private rent?: ChoiceMenu;
  private doorGate = { armed: true };

  constructor() {
    super("kitchen");
  }

  create(): void {
    this.bye = "off";
    this.mumSaid = false;
    this.reaching = false;
    this.facing = "up";
    this.flip = 1;
    if (this.textures.exists("kitchen")) this.textures.remove("kitchen");
    const art = this.add.graphics().setVisible(false);
    this.layout = drawKitchen(art);
    art.generateTexture("kitchen", GBA_W, GBA_H);
    art.destroy();
    this.room = this.add.image(0, 0, "kitchen").setOrigin(0);

    ensureMum(this);
    // Lean on the units by the fridge — elbow on the worktop, facing into the room.
    this.add.image(this.layout.mum.x + 10, this.layout.mum.y + 14, "mum").setOrigin(0.5, 1).setDepth(9);

    this.player = spawnKid(this, this.layout.spawn.x, this.layout.spawn.y);
    addWalls(this, this.player, this.layout.solids);
    const keys = bindWalkKeys(this);
    this.cursors = keys.cursors;
    this.wasd = keys.wasd;
    this.note = new MsgBox(this);
    this.bagUi = new BagUi(this, (line) => this.showNote(line));
    this.pal = new PalField(this, this.player, (line) => this.showNote(line));
    this.rent = new ChoiceMenu(this, ["GIVE £50", "KEEP IT"], "RENT?");
    this.doorGate = { armed: false };

    if (!isTouchUi()) {
      this.input.on("pointerdown", () => {
        if (this.bye !== "off") return;
        if (this.rent?.active) return;
        if (this.bagUi?.atePointer()) return;
        if (this.note?.advance()) return;
        if (this.bagUi?.busy) return;
        if (!this.reaching) this.tryExamine();
      });
    }
  }

  update(): void {
    const confirm = justAction(this.cursors, this.wasd);
    const cancel = justCancel(this.wasd);

    if (this.bye !== "off") {
      this.player.body.setVelocity(0, 0);
      if (this.note?.open && confirm) this.note.advance();
      if (this.bye === "line" && !this.note?.open) {
        this.scene.start("hall", { from: "kitchen-bye" });
      }
      return;
    }

    if (this.rent?.active) {
      this.player.body.setVelocity(0, 0);
      this.rent.update(this.cursors, { W: this.wasd.W, S: this.wasd.S }, confirm, cancel);
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

    if (armSouthExit(this.player, this.cursors, this.wasd, this.doorGate) && walkingInto(this.player, this.layout.door, "down")) {
      if (!this.mumSaid) {
        this.playByeLeave();
        return;
      }
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
      this.mumSaid = true;
      if (run.hasBag && run.cash > 100 && !run.mumRentPaid) {
        this.reachThen(mumLine("Could I have some rent"), () =>
          this.rent?.show((pick) => this.pickRent(pick === 0)),
        );
        return;
      }
      this.reachThen(
        run.hasBag
          ? [mumLine("What now?"), mumLine("Go on then. Out")]
          : [mumLine("Oi"), mumLine("Don't forget your bag")],
      );
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
    this.pal.tryTalk();
  }

  private pickRent(give: boolean): void {
    if (give && run.cash > 100) {
      run.cash -= RENT;
      run.mumRentPaid = true;
      persistRun();
      this.showNote(mumLine("This'll help get the place sorted"));
      return;
    }
    this.showNote(mumLine("Suit yourself"));
  }

  private playByeLeave(): void {
    this.bye = "walk";
    this.player.body.setVelocity(0, 0);
    this.player.body.setEnable(false);
    this.player.setCollideWorldBounds(false);
    this.facing = "down";
    this.player.anims.play(kidAnim(run.outfit, "walk-down"), true);
    this.tweens.add({
      targets: this.player,
      y: GBA_H + 16,
      duration: 760,
      ease: "Linear",
      onComplete: () => {
        this.bye = "wait";
        this.time.delayedCall(480, () => {
          this.bye = "line";
          this.showNote(mumLine("Bye then"));
        });
      },
    });
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
