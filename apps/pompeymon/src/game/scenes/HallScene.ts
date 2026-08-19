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
import { drawHall, type HallLayout } from "../world/drawHall";

export class HallScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: WalkKeys;
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private layout!: HallLayout;
  private note?: MsgBox;
  private bagUi?: BagUi;
  private facing: Facing = "down";
  private flip = 1;
  private reaching = false;
  private from = "landing";
  private dressedWarn = false;

  constructor() {
    super("hall");
  }

  init(data: { from?: string }): void {
    this.from = data.from ?? "landing";
  }

  create(): void {
    if (this.textures.exists("hall")) this.textures.remove("hall");
    const art = this.add.graphics().setVisible(false);
    this.layout = drawHall(art);
    art.generateTexture("hall", GBA_W, GBA_H);
    art.destroy();
    this.add.image(0, 0, "hall").setOrigin(0);

    const spawn =
      this.from === "kitchen"
        ? this.layout.spawnFromKitchen
        : this.from === "frontroom"
          ? this.layout.spawnFromFront
          : this.from === "avenue"
            ? this.layout.spawnFromAvenue
            : this.layout.spawnFromLanding;
    this.facing =
      this.from === "kitchen" ? "down" : this.from === "frontroom" ? "side" : this.from === "avenue" ? "up" : "up";
    this.flip = this.from === "frontroom" ? -1 : 1;
    this.player = spawnKid(this, spawn.x, spawn.y);
    this.player.setFlipX(this.flip < 0);
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

    if (walkingInto(this.player, this.layout.kitchenDoor, "up")) {
      this.scene.start("kitchen");
      return;
    }
    if (walkingInto(this.player, this.layout.frontRoomDoor, "right")) {
      this.scene.start("frontroom");
      return;
    }
    if (
      this.facing === "up" &&
      this.player.x > this.layout.stairs.x &&
      this.player.x < this.layout.stairs.x + this.layout.stairs.w &&
      this.player.y > 80 &&
      this.player.y < 96
    ) {
      this.scene.start("landing", { from: "hall" });
      return;
    }

    if (walkingInto(this.player, this.layout.frontDoor, "down")) {
      if (!run.dressed) {
        if (!this.dressedWarn) {
          this.dressedWarn = true;
          this.reachThen("Not going out in Y-fronts.");
        }
        return;
      }
      this.scene.start("avenue");
      return;
    }
    this.dressedWarn = false;

    if (confirm) this.tryExamine();
  }

  private tryExamine(): void {
    if (near(this.player, this.layout.stairFoot, 8) || near(this.player, this.layout.stairs, 6)) {
      this.scene.start("landing", { from: "hall" });
      return;
    }
    this.reachThen("Hall. Kitchen, front room, street.");
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
