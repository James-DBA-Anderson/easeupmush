import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { run } from "../run";
import { ensureKidSheets, kidAnim, kidSheet, type OutfitId } from "../sprites/kid";
import { ClothesMenu, type ClothesOption } from "../ui/ClothesMenu";
import { MsgBox } from "../ui/MsgBox";
import { isTouchUi } from "../touch";
import { bindWalkKeys, justAction, justCancel, walkAxis, type WalkKeys } from "../walk";
import { drawBedroom, type BedroomLayout } from "../world/drawBedroom";

type Facing = "down" | "up" | "side";

export class BedroomScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasdKeys!: WalkKeys;
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private layout!: BedroomLayout;
  private note?: MsgBox;
  private facing: Facing = "down";
  private flip = 1;
  private busy = true;
  private reaching = false;
  private outfit: OutfitId = "pj";
  private clothes!: ClothesMenu;
  private fromLanding = false;

  constructor() {
    super("bedroom");
  }

  init(data: { from?: string }): void {
    this.fromLanding = data.from === "landing";
  }

  create(): void {
    if (this.textures.exists("bedroom")) this.textures.remove("bedroom");
    const room = this.add.graphics().setVisible(false);
    this.layout = drawBedroom(room);
    room.generateTexture("bedroom", GBA_W, GBA_H);
    room.destroy();
    this.add.image(0, 0, "bedroom").setOrigin(0);

    ensureKidSheets(this);

    this.outfit = run.outfit;

    const start = this.fromLanding ? this.layout.doorSpawn : this.layout.spawn;
    this.player = this.physics.add.sprite(
      start.x,
      start.y,
      kidSheet(this.outfit),
      this.fromLanding ? "idle-down" : "sleep",
    );
    this.player.setCollideWorldBounds(true);
    this.player.setSize(10, 6).setOffset(11, 24);
    this.player.setDepth(10);
    if (this.fromLanding) {
      this.busy = false;
      this.player.anims.play(kidAnim(this.outfit, "idle-down"));
    } else {
      this.player.body.setEnable(false);
      this.player.anims.play(kidAnim("pj", "sleep"));
    }

    this.physics.world.setBounds(0, 0, GBA_W, GBA_H);
    for (const s of this.layout.solids) {
      const block = this.add.rectangle(s.x + s.w / 2, s.y + s.h / 2, s.w, s.h, 0x000000, 0);
      this.physics.add.existing(block, true);
      this.physics.add.collider(this.player, block);
    }

    const keys = bindWalkKeys(this);
    this.cursors = keys.cursors;
    this.wasdKeys = keys.wasd;

    this.cameras.main.setBounds(0, 0, GBA_W, GBA_H);
    this.cameras.main.fadeIn(500, 18, 16, 22);

    this.note = new MsgBox(this);

    this.clothes = new ClothesMenu(this, {
      onWear: (option) => this.wear(option),
      onClose: () => this.showNote("Leave it."),
    });

    this.time.delayedCall(400, () => {
      if (!this.fromLanding) this.showNote("…2nd Avenue. Mum's downstairs.");
    });
    if (!this.fromLanding) this.time.delayedCall(1400, () => this.playWakeSequence());
    if (this.fromLanding) {
      const s = this.layout.bed;
      const block = this.add.rectangle(s.x + s.w / 2, s.y + s.h / 2, s.w, s.h, 0x000000, 0);
      this.physics.add.existing(block, true);
      this.physics.add.collider(this.player, block);
    }

    if (!isTouchUi()) {
      this.input.on("pointerdown", () => {
        if (this.note?.advance()) return;
        if (this.clothes.active || this.busy || this.reaching) return;
        this.tryExamine();
      });
    }
  }

  update(): void {
    const confirm = justAction(this.cursors, this.wasdKeys);
    const cancel = justCancel(this.wasdKeys);

    if (this.clothes.active) {
      this.player.body.setVelocity(0, 0);
      this.clothes.update(this.cursors, { W: this.wasdKeys.W, S: this.wasdKeys.S }, confirm, cancel);
      return;
    }

    if (this.note?.open) {
      this.player.body.setVelocity(0, 0);
      if (confirm || cancel) this.note.advance();
      return;
    }

    if (this.busy || this.reaching) {
      this.player.body.setVelocity(0, 0);
      return;
    }

    const speed = 68;
    const { vx, vy } = walkAxis(this.cursors, this.wasdKeys);
    this.player.body.setVelocity(vx * speed, vy * speed);

    if (vx !== 0 || vy !== 0) {
      if (Math.abs(vx) >= Math.abs(vy)) {
        this.facing = "side";
        this.flip = vx < 0 ? -1 : 1;
        this.playMove("walk-side");
      } else if (vy < 0) {
        this.facing = "up";
        this.playMove("walk-up");
      } else {
        this.facing = "down";
        this.playMove("walk-down");
      }
    } else {
      this.playMove(this.idleKind());
    }
    this.player.setFlipX(this.flip < 0);

    if (
      !this.busy &&
      this.player.y < 56 &&
      this.player.x > 170 &&
      this.facing === "up"
    ) {
      this.scene.start("landing", { from: "bedroom" });
      return;
    }

    if (confirm || cancel) this.tryExamine();
  }

  private idleKind(): "idle-down" | "idle-side" | "idle-up" {
    if (this.facing === "up") return "idle-up";
    if (this.facing === "side") return "idle-side";
    return "idle-down";
  }

  private playMove(kind: "idle-down" | "idle-side" | "idle-up" | "walk-down" | "walk-side" | "walk-up"): void {
    const key = kidAnim(this.outfit, kind);
    if (this.player.anims.currentAnim?.key !== key) this.player.anims.play(key, true);
  }

  private playWakeSequence(): void {
    if (!this.busy) return;
    this.player.anims.play(kidAnim("pj", "sit"));
    this.time.delayedCall(420, () => {
      if (!this.busy) return;
      this.player.anims.play(kidAnim("pj", "stretch"));
    });
    this.time.delayedCall(1400, () => {
      if (!this.busy) return;
      this.player.anims.play(kidAnim("pj", "walk-side"));
      this.player.setFlipX(false);
      this.tweens.add({
        targets: this.player,
        x: this.layout.wake.x,
        y: this.layout.wake.y,
        duration: 380,
        ease: "Sine.easeInOut",
        onComplete: () => this.finishWake(),
      });
    });
  }

  private finishWake(): void {
    if (!this.busy) return;
    this.busy = false;
    this.facing = "down";
    this.flip = 1;
    this.player.setFlipX(false);
    this.player.anims.play(kidAnim("pj", "idle-down"));
    this.player.body.setEnable(true);
    const s = this.layout.bed;
    const block = this.add.rectangle(s.x + s.w / 2, s.y + s.h / 2, s.w, s.h, 0x000000, 0);
    this.physics.add.existing(block, true);
    this.physics.add.collider(this.player, block);
    this.showNote("Y-fronts. Wardrobe.");
  }

  private tryExamine(): void {
    const p = this.player;
    const near = (s: { x: number; y: number; w: number; h: number }, pad = 12) =>
      p.x > s.x - pad && p.x < s.x + s.w + pad && p.y > s.y - pad && p.y < s.y + s.h + pad;

    if (near(this.layout.wardrobe, 8)) {
      this.player.body.setVelocity(0, 0);
      this.clothes.show(this.outfit);
      return;
    }

    if (near(this.layout.door, 10)) {
      this.scene.start("landing", { from: "bedroom" });
      return;
    }
    if (near(this.layout.pc, 10)) {
      this.reachThen("Beige box humming. Blue screen.");
      return;
    }
    if (near(this.layout.bed, 8)) {
      this.reachThen("Duvet's a heap.");
      return;
    }
    if (p.y < 56 && p.x > 98 && p.x < 170) {
      this.reachThen("Shuttle, tape, footy. The lot.");
      return;
    }
    this.reachThen("Your room.");
  }

  private wear(option: ClothesOption): void {
    this.outfit = option.id;
    run.outfit = option.id;
    run.dressed = option.dressed;
    this.player.setTexture(kidSheet(option.id));
    this.player.anims.play(kidAnim(option.id, this.idleKind()));
    if (option.dressed) this.showNote("That'll do.");
    else this.showNote("Still in Y-fronts.");
  }

  private reachThen(line: string): void {
    this.reaching = true;
    this.player.body.setVelocity(0, 0);
    const reach = this.facing === "down" ? "reach-down" : "reach-side";
    this.player.anims.play(kidAnim(this.outfit, reach));
    this.showNote(line);
    this.time.delayedCall(520, () => {
      this.reaching = false;
      this.playMove(this.idleKind());
    });
  }

  private showNote(text: string): void {
    this.note?.show(text);
  }
}
