import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { ensureLeadAlive, resumePos, returningTo, run } from "../run";
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
  atSouthEdge,
  tickWalk,
  type Facing,
  type WalkKeys,
} from "../walk";
import { drawRoundabout, type RoundaboutLayout } from "../world/drawRoundabout";
import {
  ROUNDABOUT_NPCS,
  losTrainer,
  npcNear,
  npcTalk,
  blockNpcs,
  spawnFieldNpcs,
  startTrainerFight,
  tickFieldNpcs,
  type FieldNpc,
} from "../world/npcs";
import { spawnAreaWilds, beginWildFight, leaveField, snapshotField, tickWanderers, wanderNear, areaDoorKeepOff, type Wanderer } from "../world/wander";
import { BikeField } from "../world/bike";
import { PalField } from "../world/pal";
import { TalkFx } from "../world/talkFx";

export class RoundaboutScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: WalkKeys;
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private layout!: RoundaboutLayout;
  private note?: MsgBox;
  private bagUi?: BagUi;
  private facing: Facing = "side";
  private flip = 1;
  private reaching = false;
  private from = "avenue";
  private npcs: FieldNpc[] = [];
  private wanderers: Wanderer[] = [];
  private bikes!: BikeField;
  private pal!: PalField;
  private talk!: TalkFx;

  constructor() {
    super("roundabout");
  }

  init(data: { from?: string }): void {
    this.from = data.from ?? "avenue";
  }

  create(): void {
    if (this.textures.exists("roundabout")) this.textures.remove("roundabout");
    const art = this.add.graphics().setVisible(false);
    this.layout = drawRoundabout(art);
    art.generateTexture("roundabout", GBA_W, GBA_H);
    art.destroy();
    this.add.image(0, 0, "roundabout").setOrigin(0);

    const fallback =
      this.from === "hill"
        ? this.layout.spawnFromNorth
        : this.from === "bridge"
          ? this.layout.spawnFromSouth
          : this.from === "highstreet"
            ? this.layout.spawnFromEast
            : this.layout.spawnFromWest;
    const returning = returningTo("roundabout") || this.from === "battle";
    const spawn = resumePos("roundabout", fallback);
    this.facing = returning
      ? "down"
      : this.from === "hill"
        ? "down"
        : this.from === "bridge"
          ? "up"
          : this.from === "highstreet"
            ? "side"
            : "side";
    this.flip = returning ? 1 : this.from === "avenue" ? 1 : this.from === "highstreet" ? -1 : 1;
    this.player = spawnKid(this, spawn.x, spawn.y);
    this.player.setFlipX(this.flip < 0);
    this.npcs = spawnFieldNpcs(this, ROUNDABOUT_NPCS, this.layout.solids);
    this.wanderers = spawnAreaWilds(this, "roundabout", returning);
    addWalls(this, this.player, this.layout.solids);
    blockNpcs(this, this.player, this.npcs);
    const keys = bindWalkKeys(this);
    this.cursors = keys.cursors;
    this.wasd = keys.wasd;
    this.talk = new TalkFx(this, () => [
      ...this.npcs.map((n) => ({ name: n.name, spr: n.sprite })),
      ...(this.pal?.cast() ?? []),
    ]);
    this.note = new MsgBox(this, this.talk.onPage);
    this.bagUi = new BagUi(this, (line) => this.showNote(line));
    this.bikes = new BikeField(this, this.player, (line) => this.showNote(line));
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
    this.bikes.tick(this.facing);
    this.pal.tick(this.facing, this.flip);
    tickFieldNpcs(this, this.npcs);
    tickWanderers(this, this.wanderers, this.player);
    this.player.setDepth(this.player.y);

    const spotted = losTrainer(this.player, this.npcs, areaDoorKeepOff("roundabout"));
    if (spotted) {
      snapshotField(this.wanderers);
      if (startTrainerFight(this, spotted, "roundabout", this.player)) return;
    }

    const moving = this.player.body.velocity.x !== 0 || this.player.body.velocity.y !== 0;
    const bumped = wanderNear(this.player, this.wanderers);
    if (moving) {
      if (run.grassCalm > 0) run.grassCalm -= 1;
      else if (bumped && run.starter) {
        this.startWild(bumped.id, bumped);
        return;
      }
    }

    if (this.player.x < 8 && this.player.y > 60 && this.player.y < 100) {
      leaveField("roundabout");
      this.scene.start("avenue", { from: "roundabout" });
      return;
    }
    if (this.player.y < 8 && this.player.x > 100 && this.player.x < 140) {
      leaveField("roundabout");
      this.scene.start("hill", { from: "roundabout" });
      return;
    }
    if (atSouthEdge(this.player) && this.player.x > 100 && this.player.x < 140) {
      leaveField("roundabout");
      this.scene.start("bridge", { from: "roundabout" });
      return;
    }
    if (this.player.x > GBA_W - 8 && this.player.y > 60 && this.player.y < 100) {
      leaveField("roundabout");
      this.scene.start("highstreet", { from: "roundabout" });
      return;
    }

    if (cancel && this.bikes.tryBack()) return;
    if (confirm) this.tryExamine();
  }

  private startWild(wild: WildId, map?: Wanderer): void {
    if (!run.starter) {
      this.reachThen(`A ${SPECIES[wild].name}. Need a partner first.`);
      return;
    }
    if ((ensureLeadAlive()?.hp ?? 0) <= 0) {
      this.reachThen("Your Pompeymon's out.");
      return;
    }
    run.grassCalm = 28;
    beginWildFight("roundabout", { x: this.player.x, y: this.player.y }, this.wanderers, map);
    this.scene.start("encounter", { wild, lv: map?.lv ?? rollWildLv(2, 3) });
  }

  private tryExamine(): void {
    if (this.bikes.tryExamine()) return;
    const person = npcNear(this.player, this.npcs, 16, areaDoorKeepOff("roundabout"));
    if (person) {
      snapshotField(this.wanderers);
      if (startTrainerFight(this, person, "roundabout", this.player)) return;
      this.reachThen(npcTalk(person));
      return;
    }
    const wild = wanderNear(this.player, this.wanderers);
    if (wild) {
      this.bagUi?.scanWild(wild.id);
      return;
    }
    if (near(this.player, this.layout.sign, 10)) {
      this.reachThen("Hill. Bridge. High Street. 2nd Avenue.");
      return;
    }
    if (near(this.player, this.layout.island, 8)) {
      this.reachThen("Roundabout. Give way.");
      return;
    }
    this.pal.tryTalk();
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
