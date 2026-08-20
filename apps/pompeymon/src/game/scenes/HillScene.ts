import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { resumePos, run } from "../run";
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
  atSouthEdge,
  tickWalk,
  type Facing,
  type WalkKeys,
} from "../walk";
import { drawHill, type HillLayout } from "../world/drawHill";
import { HILL_NPCS, npcNear, npcTalk, spawnFieldNpcs, tickFieldNpcs, type FieldNpc } from "../world/npcs";

export class HillScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: WalkKeys;
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private layout!: HillLayout;
  private note?: MsgBox;
  private bagUi?: BagUi;
  private facing: Facing = "up";
  private flip = 1;
  private reaching = false;
  private npcs: FieldNpc[] = [];

  constructor() {
    super("hill");
  }

  create(): void {
    if (this.textures.exists("hill")) this.textures.remove("hill");
    const art = this.add.graphics().setVisible(false);
    this.layout = drawHill(art);
    art.generateTexture("hill", GBA_W, GBA_H);
    art.destroy();
    this.add.image(0, 0, "hill").setOrigin(0);

    const spawn = resumePos("hill", this.layout.spawn);
    this.player = spawnKid(this, spawn.x, spawn.y);
    this.npcs = spawnFieldNpcs(this, HILL_NPCS);
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
    tickFieldNpcs(this, this.npcs);
    this.player.setDepth(this.player.y);

    if (atSouthEdge(this.player)) {
      this.scene.start("roundabout", { from: "hill" });
      return;
    }

    if (confirm) this.tryExamine();
  }

  private tryExamine(): void {
    const person = npcNear(this.player, this.npcs);
    if (person) {
      this.reachThen(npcTalk(person));
      return;
    }
    if (near(this.player, this.layout.van, 10)) {
      this.reachThen("Burger van. Hatch is down.");
      return;
    }
    if (near(this.player, this.layout.view, 14)) {
      this.reachThen("Portsdown. That's the island.");
      return;
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
