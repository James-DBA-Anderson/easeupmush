import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { run } from "../run";
import { kidAnim } from "../sprites/kid";
import { MsgBox } from "../ui/MsgBox";
import {
  addWalls,
  bindWalkKeys,
  justAction,
  near,
  spawnKid,
  tickWalk,
  type Facing,
  type WalkKeys,
} from "../walk";
import { isTouchUi } from "../touch";
import { drawBathroom, type BathroomLayout } from "../world/drawBathroom";

export class BathroomScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: WalkKeys;
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private layout!: BathroomLayout;
  private note?: MsgBox;
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

    if (!isTouchUi()) {
      this.input.on("pointerdown", () => {
        if (this.note?.advance()) return;
        if (!this.reaching) this.tryExamine();
      });
    }
  }

  update(): void {
    const confirm = justAction(this.cursors, this.wasd);

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

    if (this.player.y > 118 && near(this.player, this.layout.door, 14)) {
      this.scene.start("landing", { from: "bathroom" });
      return;
    }

    if (confirm) this.tryExamine();
  }

  private tryExamine(): void {
    if (near(this.player, this.layout.door, 10)) {
      this.scene.start("landing", { from: "bathroom" });
      return;
    }
    if (near(this.player, this.layout.bath, 8)) {
      this.reachThen("Cold enamel. Tide mark.");
      return;
    }
    if (near(this.player, this.layout.loo, 8)) {
      this.reachThen("The loo. Lid's down.");
      return;
    }
    if (near(this.player, this.layout.sink, 8)) {
      this.reachThen("Tap drips. Always has.");
      return;
    }
    this.reachThen("Bathroom.");
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

  private showNote(text: string): void {
    this.note?.show(text);
  }
}
