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
import { drawLanding, type LandingLayout } from "../world/drawLanding";
import { PalField } from "../world/pal";

export class LandingScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: WalkKeys;
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private layout!: LandingLayout;
  private note?: MsgBox;
  private bagUi?: BagUi;
  private pal!: PalField;
  private facing: Facing = "up";
  private flip = 1;
  private reaching = false;
  private from = "bedroom";
  private dressedWarn = false;

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
      this.from === "bathroom"
        ? this.layout.spawnFromBathroom
        : this.from === "hall"
          ? this.layout.spawnFromHall
          : this.layout.spawnFromBedroom;
    this.facing = this.from === "bathroom" ? "down" : "up";
    this.player = spawnKid(this, spawn.x, spawn.y);
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

    if (walkingInto(this.player, this.layout.bathDoor, "up")) {
      this.scene.start("bathroom");
      return;
    }
    if (walkingInto(this.player, this.layout.bedroomDoor, "down")) {
      this.scene.start("bedroom", { from: "landing" });
      return;
    }

    const onStairDown =
      this.facing === "down" &&
      this.player.x > this.layout.stairHead.x &&
      this.player.x < this.layout.stairHead.x + this.layout.stairHead.w &&
      this.player.y >= this.layout.stairHead.y &&
      this.player.y <= this.layout.stairs.y + 2;

    if (onStairDown) {
      if (!run.dressed) {
        if (!this.dressedWarn) {
          this.dressedWarn = true;
          this.reachThen("Not downstairs in Y-fronts.");
        }
        return;
      }
      this.scene.start("hall", { from: "landing" });
      return;
    }
    this.dressedWarn = false;

    if (confirm) this.tryExamine();
  }

  private tryExamine(): void {
    if (near(this.player, this.layout.parentsDoor, 8)) {
      this.reachThen("Mum and Dad's. Locked.");
      return;
    }
    if (near(this.player, this.layout.stairHead, 8) || near(this.player, this.layout.stairs, 6)) {
      if (!run.dressed) {
        this.reachThen("Not downstairs in Y-fronts.");
        return;
      }
      this.scene.start("hall", { from: "landing" });
      return;
    }
    this.pal.tryTalk();
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
