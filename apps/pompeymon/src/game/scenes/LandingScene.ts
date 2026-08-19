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
import { drawLanding, type LandingLayout } from "../world/drawLanding";

export class LandingScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: WalkKeys;
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private layout!: LandingLayout;
  private note?: MsgBox;
  private facing: Facing = "up";
  private flip = 1;
  private reaching = false;
  private from = "bedroom";

  constructor() {
    super("landing");
  }

  init(data: { from?: string }): void {
    this.from = data.from ?? "bedroom";
  }

  create(): void {
    if (this.textures.exists("landing")) this.textures.remove("landing");
    const art = this.add.graphics().setVisible(false);
    this.layout = drawLanding(art);
    art.generateTexture("landing", GBA_W, GBA_H);
    art.destroy();
    this.add.image(0, 0, "landing").setOrigin(0);

    const spawn =
      this.from === "bathroom" ? this.layout.spawnFromBathroom : this.layout.spawnFromBedroom;
    this.facing = this.from === "bathroom" ? "down" : "up";
    this.player = spawnKid(this, spawn.x, spawn.y);
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

    if (this.player.y < 50 && near(this.player, this.layout.bathDoor, 14)) {
      this.scene.start("bathroom");
      return;
    }
    if (this.player.y > 118 && near(this.player, this.layout.bedroomDoor, 16)) {
      this.scene.start("bedroom", { from: "landing" });
      return;
    }

    if (confirm) this.tryExamine();
  }

  private tryExamine(): void {
    if (near(this.player, this.layout.bathDoor, 10)) {
      this.scene.start("bathroom");
      return;
    }
    if (near(this.player, this.layout.bedroomDoor, 10)) {
      this.scene.start("bedroom", { from: "landing" });
      return;
    }
    if (near(this.player, this.layout.stairs, 8)) {
      if (!run.dressed) {
        this.reachThen("Not downstairs in Y-fronts.");
        return;
      }
      this.reachThen("Mum's in the kitchen.");
      return;
    }
    this.reachThen("Landing. Loo and stairs.");
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
