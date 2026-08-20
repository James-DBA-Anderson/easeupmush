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
  tickWalk,
  type Facing,
  type WalkKeys,
} from "../walk";
import { drawBridge, type BridgeLayout } from "../world/drawBridge";
import {
  BRIDGE_NPCS,
  losTrainer,
  npcNear,
  npcTalk,
  spawnFieldNpcs,
  startTrainerFight,
  tickFieldNpcs,
  type FieldNpc,
} from "../world/npcs";

export class BridgeScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: WalkKeys;
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private layout!: BridgeLayout;
  private note?: MsgBox;
  private bagUi?: BagUi;
  private facing: Facing = "down";
  private flip = 1;
  private reaching = false;
  private from = "roundabout";
  private npcs: FieldNpc[] = [];

  constructor() {
    super("bridge");
  }

  init(data: { from?: string }): void {
    this.from = data.from ?? "roundabout";
  }

  create(): void {
    if (this.textures.exists("bridge")) this.textures.remove("bridge");
    const art = this.add.graphics().setVisible(false);
    this.layout = drawBridge(art);
    art.generateTexture("bridge", GBA_W, GBA_H);
    art.destroy();
    this.add.image(0, 0, "bridge").setOrigin(0);

    this.facing = this.from === "island" ? "up" : "down";
    const start = resumePos("bridge", this.from === "island" ? this.layout.spawnFromSouth : this.layout.spawn);
    this.player = spawnKid(this, start.x, start.y);
    this.npcs = spawnFieldNpcs(this, BRIDGE_NPCS);
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

    const spotted = losTrainer(this.player, this.npcs);
    if (spotted && startTrainerFight(this, spotted, "bridge", this.player)) return;

    if (this.player.y < 8) {
      this.scene.start("roundabout", { from: "bridge" });
      return;
    }
    if (this.facing === "down" && this.player.y > 118) {
      if (!run.starter) {
        this.reachThen("Over the bridge is Pompey. Not yet.");
        this.player.y = 116;
        return;
      }
      this.scene.start("island");
      return;
    }

    if (confirm) this.tryExamine();
  }

  private tryExamine(): void {
    const person = npcNear(this.player, this.npcs);
    if (person) {
      if (startTrainerFight(this, person, "bridge", this.player)) return;
      this.reachThen(npcTalk(person));
      return;
    }
    if (near(this.player, this.layout.water, 8) || near(this.player, this.layout.span, 10)) {
      this.reachThen("Creek. Then the island.");
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
