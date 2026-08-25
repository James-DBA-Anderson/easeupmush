import Phaser from "phaser";
import { GBA_W } from "../constants";
import { resumePos, returningTo, run } from "../run";
import { kidAnim } from "../sprites/kid";
import { BagUi } from "../ui/BagUi";
import { MsgBox, type Line } from "../ui/MsgBox";
import { isTouchUi } from "../touch";
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
import { drawSchoolIn, type SchoolInLayout } from "../world/drawSchoolIn";
import {
  SCHOOL_IN_NPCS,
  losTrainer,
  npcNear,
  npcTalk,
  spawnFieldNpcs,
  startTrainerFight,
  tickFieldNpcs,
  type FieldNpc,
} from "../world/npcs";
import { PalField } from "../world/pal";

export class SchoolInScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: WalkKeys;
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private layout!: SchoolInLayout;
  private note?: MsgBox;
  private bagUi?: BagUi;
  private facing: Facing = "up";
  private flip = 1;
  private reaching = false;
  private npcs: FieldNpc[] = [];
  private pal!: PalField;

  constructor() {
    super("schoolin");
  }

  create(): void {
    if (this.textures.exists("schoolin")) this.textures.remove("schoolin");
    const art = this.add.graphics().setVisible(false);
    this.layout = drawSchoolIn(art);
    art.generateTexture("schoolin", GBA_W, this.layout.mapH);
    art.destroy();
    this.add.image(0, 0, "schoolin").setOrigin(0);

    returningTo("schoolin");
    const spawn = resumePos("schoolin", this.layout.spawnFromField);
    this.facing = "up";
    this.flip = 1;
    this.player = spawnKid(this, spawn.x, spawn.y, { w: GBA_W, h: this.layout.mapH });
    this.cameras.main.startFollow(this.player, true, 1, 1);
    this.npcs = spawnFieldNpcs(this, SCHOOL_IN_NPCS);
    addWalls(this, this.player, this.layout.solids);
    const keys = bindWalkKeys(this);
    this.cursors = keys.cursors;
    this.wasd = keys.wasd;
    this.note = new MsgBox(this);
    this.bagUi = new BagUi(this, (line) => this.showNote(line));
    this.pal = new PalField(this, this.player, (line) => this.showNote(line));

    if (!isTouchUi()) {
      this.input.on("pointerdown", () => {
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
    this.pal.tick(this.facing, this.flip);
    tickFieldNpcs(this, this.npcs);
    this.player.setDepth(this.player.y);

    const spotted = losTrainer(this.player, this.npcs);
    if (spotted) {
      if (startTrainerFight(this, spotted, "schoolin", this.player, this.npcs)) return;
    }

    if (walkingInto(this.player, this.layout.door, "down")) {
      this.scene.start("school", { from: "schoolin" });
      return;
    }

    if (confirm) this.tryExamine();
  }

  private tryExamine(): void {
    if (this.pal.tryTalk()) return;
    const person = npcNear(this.player, this.npcs);
    if (person) {
      if (startTrainerFight(this, person, "schoolin", this.player, this.npcs)) return;
      this.reachThen(npcTalk(person, this.npcs));
      return;
    }
    for (const spot of this.layout.spots) {
      if (near(this.player, spot.at, 8)) {
        if (spot.at === this.layout.trophy && run.items.includes("hilsea")) {
          this.reachThen("Hilsea Badge case. Yours is in the bag.");
          return;
        }
        this.reachThen(spot.line);
        return;
      }
    }
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
