import Phaser from "phaser";
import { GBA_W } from "../constants";
import { ensureLeadAlive, isBeaten, resumePos, returningTo, run } from "../run";
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
  needsTrainerIntro,
  npcNear,
  npcTalk,
  spawnFieldNpcs,
  startTrainerFight,
  tickFieldNpcs,
  trainerLead,
  type FieldNpc,
} from "../world/npcs";
import { BikeField } from "../world/bike";
import { PalField } from "../world/pal";
import { spawnSteveWait, startSteveFight, steveFightPending, STEVE_AMBUSH } from "../world/steve";
import { spawnAreaWilds, beginWildFight, leaveField, snapshotField, tickWanderers, wanderNear, type Wanderer } from "../world/wander";

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
  private bikes!: BikeField;
  private pal!: PalField;
  private steveSpr?: Phaser.GameObjects.Sprite;

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
    const fallback =
      this.from === "charity"
        ? this.layout.spawnFromCharity
        : this.from === "pawn"
          ? this.layout.spawnFromPawn
          : this.from === "chippy"
            ? this.layout.spawnFromChippy
            : this.from === "spice"
              ? this.layout.spawnFromSpice
              : this.from === "bikeshop"
                ? this.layout.spawnFromBike
                : this.from === "lab" || rude
                  ? this.layout.spawnFromLab
                  : this.layout.spawnFromWest;
    const returning = returningTo("highstreet");
    const atDoor =
      this.from === "charity" ||
      this.from === "pawn" ||
      this.from === "chippy" ||
      this.from === "spice" ||
      this.from === "bikeshop" ||
      this.from === "lab" ||
      rude;
    const spawn = resumePos("highstreet", fallback, atDoor);
    this.facing = "side";
    this.flip = 1;
    this.player = spawnKid(this, spawn.x, spawn.y, {
      w: GBA_W,
      h: this.layout.mapH,
    });
    this.npcs = spawnFieldNpcs(this, HIGH_STREET_NPCS);
    this.wanderers = spawnAreaWilds(this, "highstreet", returning);
    addWalls(this, this.player, this.layout.solids);
    const keys = bindWalkKeys(this);
    this.cursors = keys.cursors;
    this.wasd = keys.wasd;
    this.note = new MsgBox(this);
    this.bagUi = new BagUi(this, (line) => this.showNote(line));
    this.bikes = new BikeField(this, this.player, (line) => this.showNote(line));
    this.pal = new PalField(this, this.player, (line) => this.showNote(line));

    const wantSteve = (this.from === "lab" || rude) && steveFightPending();
    if (rude) this.meetOutside(wantSteve ? () => this.ambushSteve() : undefined);
    else {
      this.cameras.main.startFollow(this.player, true, 1, 1);
      if (wantSteve) this.ambushSteve();
    }

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
    this.bikes.tick();
    this.pal.tick(this.facing, this.flip);
    tickFieldNpcs(this, this.npcs);
    tickWanderers(this, this.wanderers, this.player);
    this.player.setDepth(this.player.y);

    const spotted = losTrainer(this.player, this.npcs);
    if (spotted) {
      snapshotField(this.wanderers);
      if (startTrainerFight(this, spotted, "highstreet", this.player)) return;
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

    if (this.player.x < 8 && near(this.player, this.layout.join, 16)) {
      leaveField("highstreet");
      this.scene.start("roundabout", { from: "highstreet" });
      return;
    }
    if (walkingInto(this.player, this.layout.centreDoor, "left")) {
      this.bikes.stashIndoor();
      leaveField("highstreet");
      this.scene.start("lab");
      return;
    }
    if (walkingInto(this.player, this.layout.bikeDoor, "left")) {
      this.bikes.stashIndoor();
      leaveField("highstreet");
      this.scene.start("bikeshop", { from: "highstreet" });
      return;
    }
    if (walkingInto(this.player, this.layout.charityDoor, "right")) {
      this.bikes.stashIndoor();
      leaveField("highstreet");
      this.scene.start("junkshop", { kind: "charity", from: "highstreet" });
      return;
    }
    if (walkingInto(this.player, this.layout.pawnDoor, "right")) {
      this.bikes.stashIndoor();
      leaveField("highstreet");
      this.scene.start("junkshop", { kind: "pawn", from: "highstreet" });
      return;
    }
    if (walkingInto(this.player, this.layout.chippyDoor, "left")) {
      this.bikes.stashIndoor();
      leaveField("highstreet");
      this.scene.start("takeaway", { kind: "chippy", from: "highstreet" });
      return;
    }
    if (walkingInto(this.player, this.layout.spiceDoor, "right")) {
      this.bikes.stashIndoor();
      leaveField("highstreet");
      this.scene.start("takeaway", { kind: "spice", from: "highstreet" });
      return;
    }

    if (cancel && this.bikes.tryBack()) return;
    if (confirm) this.tryExamine();
  }

  private meetOutside(onDone?: () => void): void {
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
      onDone?.();
    });
  }

  private ambushSteve(): void {
    if (!steveFightPending()) return;
    this.meeting = true;
    this.player.body.setVelocity(0, 0);
    const door = this.layout.spawnFromLab;
    this.steveSpr = spawnSteveWait(this, door.x + 28, door.y + 8);
    this.showNote(STEVE_AMBUSH, () => {
      this.steveSpr?.destroy();
      this.steveSpr = undefined;
      startSteveFight(this, "highstreet", { x: this.player.x, y: this.player.y });
    });
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
    beginWildFight("highstreet", { x: this.player.x, y: this.player.y }, this.wanderers, map);
    this.scene.start("encounter", { wild, lv: map?.lv ?? rollWildLv(2, 3) });
  }

  private tryExamine(): void {
    if (this.bikes.tryExamine()) return;
    if (this.pal.tryTalk()) return;
    const person = npcNear(this.player, this.npcs);
    if (person) {
      snapshotField(this.wanderers);
      const lead = trainerLead(person, this.npcs);
      if (lead.trainer && !isBeaten(lead.id)) {
        if (!run.starter) {
          this.reachThen(npcTalk(person, this.npcs));
          return;
        }
        if ((ensureLeadAlive()?.hp ?? 0) <= 0) {
          this.reachThen("Your Pompeymon's out.");
          return;
        }
        if (needsTrainerIntro(person, this.npcs)) {
          this.reachThen(lead.intro!, () => {
            startTrainerFight(this, lead, "highstreet", this.player, this.npcs);
          });
          return;
        }
        if (startTrainerFight(this, lead, "highstreet", this.player, this.npcs)) return;
      }
      this.reachThen(npcTalk(person, this.npcs));
      return;
    }
    const wild = wanderNear(this.player, this.wanderers);
    if (wild) {
      this.startWild(wild.id, wild);
      return;
    }
    for (const spot of this.layout.spots) {
      if (near(this.player, spot.at, 8)) {
        this.reachThen(spot.line);
        return;
      }
    }
  }

  private reachThen(line: Line | Line[], onDone?: () => void): void {
    this.reaching = true;
    this.player.body.setVelocity(0, 0);
    const reach = this.facing === "down" ? "reach-down" : "reach-side";
    this.player.anims.play(kidAnim(run.outfit, reach));
    this.showNote(line, onDone);
    this.time.delayedCall(520, () => {
      this.reaching = false;
      const idle = this.facing === "up" ? "idle-up" : this.facing === "side" ? "idle-side" : "idle-down";
      this.player.anims.play(kidAnim(run.outfit, idle));
    });
  }

  private showNote(text: Line | Line[], onDone?: () => void): void {
    this.note?.show(text, onDone);
  }
}
