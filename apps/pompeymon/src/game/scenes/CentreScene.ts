import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { consumeWhiteout, healParty, partyNeedsHeal, persistRun, run } from "../run";
import { kidAnim } from "../sprites/kid";
import { ensureNpcSheets, npcAnim, npcSheet } from "../sprites/npc";
import { BagUi } from "../ui/BagUi";
import { MsgBox, type Line } from "../ui/MsgBox";
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
import { drawCentre, type CentreLayout } from "../world/drawCentre";
import { PalField } from "../world/pal";
import { TalkFx } from "../world/talkFx";

const NURSE = "SANDRA";
const FEE = 20;

const nurse = (text: string): Line => ({ who: NURSE, text });

/** Hilsea Pompeymon Centre — patch-up for cash, and where you wake up if you go down over the bridge. */
export class CentreScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: WalkKeys;
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private layout!: CentreLayout;
  private note?: MsgBox;
  private talk!: TalkFx;
  private clerkSpr?: Phaser.GameObjects.Sprite;
  private bagUi?: BagUi;
  private pal!: PalField;
  private facing: Facing = "up";
  private flip = 1;
  private reaching = false;
  private southExit = { armed: false };

  constructor() {
    super("centre");
  }

  init(): void {
    this.southExit = { armed: false };
  }

  create(): void {
    if (this.textures.exists("centre")) this.textures.remove("centre");
    const art = this.add.graphics().setVisible(false);
    this.layout = drawCentre(art);
    art.generateTexture("centre", GBA_W, GBA_H);
    art.destroy();
    this.add.image(0, 0, "centre").setOrigin(0);

    ensureNpcSheets(this);
    this.clerkSpr = this.add
      .sprite(120, 50, npcSheet("lass"), "idle-down")
      .play(npcAnim("lass", "idle-down"))
      .setDepth(9);

    this.player = spawnKid(this, this.layout.spawn.x, this.layout.spawn.y);
    addWalls(this, this.player, this.layout.solids);
    const keys = bindWalkKeys(this);
    this.cursors = keys.cursors;
    this.wasd = keys.wasd;
    this.talk = new TalkFx(this, () => [
      { name: NURSE, spr: this.clerkSpr },
      ...(this.pal?.cast() ?? []),
    ]);
    this.note = new MsgBox(this, this.talk.onPage);
    this.bagUi = new BagUi(this, (line) => this.showNote(line));
    this.pal = new PalField(this, this.player, (line) => this.showNote(line));

    if (consumeWhiteout()) this.wakeUp();

    if (!isTouchUi()) {
      this.input.on("pointerdown", () => {
        if (this.bagUi?.atePointer()) return;
        if (this.note?.advance()) return;
        if (this.bagUi?.busy) return;
        if (!this.reaching) this.tryExamine();
      });
    }
  }

  /** Carried in off the field — patched up on the house. */
  private wakeUp(): void {
    healParty();
    persistRun();
    this.player.setPosition(120, 84);
    this.facing = "up";
    this.player.anims.play(kidAnim(run.outfit, "idle-up"));
    this.showNote([
      nurse("Alright mush. You went down on the Lines."),
      nurse("Someone carried you in. Don't ask who."),
      nurse("They're patched up. On the house this once."),
      nurse("Next time it's twenty quid."),
    ]);
  }

  update(): void {
    const confirm = justAction(this.cursors, this.wasd);
    const cancel = justCancel(this.wasd);

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
      this.scene.start("island", { from: "centre" });
      return;
    }

    if (cancel) return;
    if (confirm) this.tryExamine();
  }

  private tryExamine(): void {
    if (near(this.player, this.layout.counter, 14)) {
      this.askHeal();
      return;
    }
    if (near(this.player, this.layout.bed, 12)) {
      this.reachThen("Patch-up machine. Three pads, all humming.");
      return;
    }
    if (near(this.player, this.layout.plant, 10)) {
      this.reachThen("Plastic plant. Dusty.");
      return;
    }
    this.pal.tryTalk();
  }

  private askHeal(): void {
    if (!run.party.length) {
      this.reachThen(nurse("Come back when you've got one mush."));
      return;
    }
    if (!partyNeedsHeal()) {
      this.reachThen([nurse("They're all sound. Save your money.")]);
      return;
    }
    if (run.cash < FEE) {
      this.reachThen([
        nurse(`Twenty quid the lot. You've got £${run.cash}.`),
        nurse("Chore some empties in. I'm not a charity."),
      ]);
      return;
    }
    run.cash -= FEE;
    healParty();
    persistRun();
    this.reachThen([
      nurse("Twenty quid. Pop 'em on the pads."),
      nurse("...Right. Sorted. Don't let 'em get battered again."),
      `Paid £${FEE}. Your Pompeymon are fighting fit.`,
    ]);
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
