import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { run } from "../run";
import { kidAnim } from "../sprites/kid";
import { MsgBox } from "../ui/MsgBox";
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
import { drawFrontRoom, type FrontRoomLayout } from "../world/drawFrontRoom";

export class FrontRoomScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: WalkKeys;
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private layout!: FrontRoomLayout;
  private note?: MsgBox;
  private bagUi?: BagUi;
  private facing: Facing = "side";
  private flip = 1;
  private reaching = false;

  constructor() {
    super("frontroom");
  }

  create(): void {
    if (this.textures.exists("frontroom")) this.textures.remove("frontroom");
    const art = this.add.graphics().setVisible(false);
    this.layout = drawFrontRoom(art);
    art.generateTexture("frontroom", GBA_W, GBA_H);
    art.destroy();
    this.add.image(0, 0, "frontroom").setOrigin(0);

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

    if (walkingInto(this.player, this.layout.door, "left")) {
      this.scene.start("hall", { from: "frontroom" });
      return;
    }

    if (confirm) this.tryExamine();
  }

  private tryExamine(): void {
    if (near(this.player, this.layout.telly, 10)) {
      this.reachThen("Telly's off. Aerial's bent.");
      return;
    }
    if (near(this.player, this.layout.sofa, 8)) {
      this.reachThen("Dad's chair. Don't sit there.");
      return;
    }
    if (near(this.player, this.layout.fire, 8)) {
      this.reachThen("Gas fire. Clicks.");
      return;
    }
    if (this.player.y < 58 && near(this.player, this.layout.window, 16)) {
      this.reachThen("2nd Avenue. Quiet out.");
      return;
    }
    this.reachThen("Front room. Best suite.");
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
