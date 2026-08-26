import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { run } from "../run";
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
import { drawBathroom, type BathroomLayout } from "../world/drawBathroom";
import { PalField } from "../world/pal";

export class BathroomScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: WalkKeys;
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private layout!: BathroomLayout;
  private note?: MsgBox;
  private bagUi?: BagUi;
  private pal!: PalField;
  private facing: Facing = "up";
  private flip = 1;
  private reaching = false;

  constructor() {
    super("bathroom");
  }

  create(): void {
    if (this.textures.exists("bathroom")) this.textures.remove("bathroom");
    const art = this.add.graphics().setVisible(false);
    this.layout = drawBathroom(art);
    art.generateTexture("bathroom", GBA_W, GBA_H);
    art.destroy();
    this.add.image(0, 0, "bathroom").setOrigin(0);

    this.player = spawnKid(this, this.layout.spawn.x, this.layout.spawn.y);
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

    if (walkingInto(this.player, this.layout.door, "down")) {
      this.scene.start("landing", { from: "bathroom" });
      return;
    }

    if (confirm) this.tryExamine();
  }

  private tryExamine(): void {
    if (this.pal.tryTalk()) return;
    if (near(this.player, this.layout.window, 10) && this.facing === "up") {
      this.reachThen("Frosted. Next door's fence.");
      return;
    }
    if (near(this.player, this.layout.bath, 8)) {
      this.reachThen("Cold enamel. Tide mark.");
      return;
    }
    if (near(this.player, this.layout.loo, 8)) {
      this.reachThen("Ahhhh.");
      return;
    }
    if (near(this.player, this.layout.sink, 8)) {
      this.reachThen("Mint. Gums sting.");
      return;
    }
  }

  private reachThen(line: string): void {
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

  private showNote(text: string | Line | Line[]): void {
    this.note?.show(text);
  }
}
