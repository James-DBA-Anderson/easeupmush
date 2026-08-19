import Phaser from "phaser";
import { GBA_W } from "../constants";
import { partnerMon, resumePos, run, saveOverworld } from "../run";
import { rollWildLv } from "../battle";
import { kidAnim } from "../sprites/kid";
import { SPECIES, type WildId } from "../species";
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
import { drawHighStreet, type HighStreetLayout } from "../world/drawHighStreet";
import {
  HIGH_STREET_NPCS,
  losTrainer,
  npcNear,
  npcTalk,
  spawnFieldNpcs,
  startTrainerFight,
  tickFieldNpcs,
  type FieldNpc,
} from "../world/npcs";
import { spawnWanderers, tickWanderers, wanderNear, type Wanderer } from "../world/wander";

const WANDER = [
  { id: "pidgeon" as const, x: 116, y: 188, box: { x: 96, y: 164, w: 44, h: 48 } },
  { id: "donerrat" as const, x: 116, y: 304, box: { x: 96, y: 278, w: 44, h: 52 } },
  { id: "chipgull" as const, x: 116, y: 428, box: { x: 96, y: 404, w: 44, h: 52 } },
];

export class HighStreetScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: WalkKeys;
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private layout!: HighStreetLayout;
  private note?: MsgBox;
  private bagUi?: BagUi;
  private facing: Facing = "side";
  private flip = 1;
  private reaching = false;
  private from = "roundabout";
  private npcs: FieldNpc[] = [];
  private wanderers: Wanderer[] = [];
  private meeting = false;

  constructor() {
    super("highstreet");
  }

  init(data: { from?: string }): void {
    this.from = data.from ?? "roundabout";
  }

  create(): void {
    if (this.textures.exists("highstreet")) this.textures.remove("highstreet");
    const art = this.add.graphics().setVisible(false);
    this.layout = drawHighStreet(art);
    art.generateTexture("highstreet", GBA_W, this.layout.mapH);
    art.destroy();
    this.add.image(0, 0, "highstreet").setOrigin(0);

    const rude = this.from === "lab-rude";
    const fallback = this.from === "lab" || rude ? this.layout.spawnFromLab : this.layout.spawnFromWest;
    const spawn = resumePos("highstreet", fallback);
    this.facing = "side";
    this.flip = 1;
    this.player = spawnKid(this, spawn.x, spawn.y, {
      w: GBA_W,
      h: this.layout.mapH,
    });
    this.npcs = spawnFieldNpcs(this, HIGH_STREET_NPCS);
    this.wanderers = spawnWanderers(this, WANDER);
    addWalls(this, this.player, this.layout.solids);
    const keys = bindWalkKeys(this);
    this.cursors = keys.cursors;
    this.wasd = keys.wasd;
    this.note = new MsgBox(this);
    this.bagUi = new BagUi(this, (line) => this.showNote(line));

    if (rude) this.meetOutside();
    else this.cameras.main.startFollow(this.player, true, 1, 1);

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

    if (this.meeting) {
      this.player.body.setVelocity(0, 0);
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
    tickWanderers(this, this.wanderers);
    this.player.setDepth(this.player.y);

    const spotted = losTrainer(this.player, this.npcs);
    if (spotted && startTrainerFight(this, spotted, "highstreet", this.player)) return;

    const moving = this.player.body.velocity.x !== 0 || this.player.body.velocity.y !== 0;
    const bumped = wanderNear(this.player, this.wanderers);
    if (moving) {
      if (run.grassCalm > 0) run.grassCalm -= 1;
      else if (bumped && run.starter) {
        this.startWild(bumped.id);
        return;
      }
    }

    if (this.player.x < 8 && near(this.player, this.layout.join, 16)) {
      this.scene.start("roundabout", { from: "highstreet" });
      return;
    }
    if (walkingInto(this.player, this.layout.centreDoor, "left")) {
      this.scene.start("lab");
      return;
    }

    if (confirm) this.tryExamine();
  }

  private meetOutside(): void {
    this.meeting = true;
    this.player.body.setEnable(false);
    const cam = this.cameras.main;
    cam.stopFollow();
    const c = this.layout.centre;
    cam.centerOn(c.x + c.w / 2, c.y + 28);
    this.player.anims.play(kidAnim(run.outfit, "walk-side"), true);
    this.player.setFlipX(false);
    this.tweens.add({
      targets: this.player,
      x: this.player.x + 36,
      duration: 720,
      ease: "Linear",
    });
    this.time.delayedCall(240, () => {
      cam.pan(this.player.x + 28, this.player.y, 580, "Sine.easeInOut");
    });
    this.time.delayedCall(860, () => {
      this.player.body.setEnable(true);
      cam.startFollow(this.player, true, 1, 1);
      this.meeting = false;
      this.player.anims.play(kidAnim(run.outfit, "idle-side"), true);
    });
  }

  private startWild(wild: WildId): void {
    if (!run.starter) {
      this.reachThen(`A ${SPECIES[wild].name}. Need a partner first.`);
      return;
    }
    if ((partnerMon()?.hp ?? 0) <= 0) {
      this.reachThen("Your Pompeymon's out.");
      return;
    }
    run.grassCalm = 28;
    saveOverworld("highstreet", { x: this.player.x, y: this.player.y });
    this.scene.start("encounter", { wild, lv: rollWildLv(3, 4) });
  }

  private tryExamine(): void {
    const person = npcNear(this.player, this.npcs);
    if (person) {
      if (startTrainerFight(this, person, "highstreet", this.player)) return;
      this.reachThen(npcTalk(person));
      return;
    }
    const wild = wanderNear(this.player, this.wanderers);
    if (wild) {
      this.startWild(wild.id);
      return;
    }
    for (const spot of this.layout.spots) {
      if (near(this.player, spot.at, 8)) {
        this.reachThen(spot.line);
        return;
      }
    }
    this.reachThen("Cosham High Street.");
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
