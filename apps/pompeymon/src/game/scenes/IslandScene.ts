import Phaser from "phaser";
import { GBA_W } from "../constants";
import { ensureLeadAlive, findStolenMon, resumePos, returningTo, run } from "../run";
import { rollWildLv } from "../battle";
import { kidAnim } from "../sprites/kid";
import type { WildId } from "../species";
import { BagUi } from "../ui/BagUi";
import { MsgBox, type Line } from "../ui/MsgBox";
import { isTouchUi } from "../touch";
import {
  addWalls,
  atSouthEdge,
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
import { drawIsland, type GrassZone, type IslandLayout } from "../world/drawIsland";
import {
  ISLAND_NPCS,
  losTrainer,
  npcNear,
  npcTalk,
  blockNpcs,
  spawnFieldNpcs,
  startTrainerFight,
  tickFieldNpcs,
  type FieldNpc,
} from "../world/npcs";
import { BikeField, grassOnBike } from "../world/bike";
import { PalField, PAL_AMBUSH, palJoinChat, runPalAmbush, startPalFight } from "../world/pal";
import { TalkFx } from "../world/talkFx";
import {
  beginWildFight,
  leaveField,
  snapshotField,
  spawnAreaWilds,
  tickWanderers,
  wanderNear,
  wanderInGrass,
  areaDoorKeepOff,
  type Wanderer,
} from "../world/wander";

export class IslandScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: WalkKeys;
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private layout!: IslandLayout;
  private note?: MsgBox;
  private bagUi?: BagUi;
  private facing: Facing = "down";
  private flip = 1;
  private reaching = false;
  private steps = 0;
  private wanderers: Wanderer[] = [];
  private npcs: FieldNpc[] = [];
  private from = "bridge";
  private bikes!: BikeField;
  private pal!: PalField;
  private talk!: TalkFx;
  private palAfter?: "fight" | "greet";
  private palSpr?: Phaser.GameObjects.Sprite;

  constructor() {
    super("island");
  }

  init(data: { from?: string }): void {
    this.from = data.from ?? "bridge";
  }

  create(): void {
    if (this.textures.exists("island")) this.textures.remove("island");
    const art = this.add.graphics().setVisible(false);
    this.layout = drawIsland(art);
    art.generateTexture("island", GBA_W, this.layout.mapH);
    art.destroy();
    this.add.image(0, 0, "island").setOrigin(0);

    const fallback =
      this.from === "school"
        ? this.layout.spawnFromSchool
        : this.from === "bikeshop"
          ? this.layout.spawnFromBike
          : this.from === "charity"
            ? this.layout.spawnFromCharity
            : this.from === "pawn"
              ? this.layout.spawnFromPawn
              : this.from === "chippy"
                ? this.layout.spawnFromChippy
                : this.from === "spice"
                  ? this.layout.spawnFromSpice
                  : this.from === "centre"
                    ? this.layout.spawnFromCentre
                    : this.layout.spawnFromNorth;
    const returning = returningTo("island") || this.from === "battle";
    const atDoor =
      !returning &&
      (this.from === "school" ||
        this.from === "bikeshop" ||
        this.from === "charity" ||
        this.from === "pawn" ||
        this.from === "chippy" ||
        this.from === "spice" ||
        this.from === "centre");
    const spawn = resumePos("island", fallback, atDoor);
    this.player = spawnKid(this, spawn.x, spawn.y, { w: GBA_W, h: this.layout.mapH });
    if (this.from === "school") {
      this.facing = "side";
      this.flip = 1;
      this.player.setFlipX(false);
    } else if (returning) {
      this.facing = "down";
      this.flip = 1;
    }
    this.cameras.main.startFollow(this.player, true, 1, 1);
    this.npcs = spawnFieldNpcs(this, ISLAND_NPCS, this.layout.solids);
    this.wanderers = spawnAreaWilds(this, "island", returning);
    run.islandPos = null;
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

    if (run.palJoined && !run.palGreeted) {
      this.reaching = true;
      this.time.delayedCall(240, () => {
        this.palAfter = "greet";
        this.showNote(palJoinChat());
      });
    } else if (
      this.from === "bridge" &&
      run.starter &&
      !run.palJoined &&
      findStolenMon()?.cheeky
    ) {
      this.reaching = true;
      this.palSpr = runPalAmbush(this, this.player, () => {
        this.palAfter = "fight";
        this.showNote(PAL_AMBUSH);
      });
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

    if (this.bagUi?.update(this.cursors, { W: this.wasd.W, A: this.wasd.A, S: this.wasd.S, D: this.wasd.D }, confirm, cancel)) {
      this.player.body.setVelocity(0, 0);
      return;
    }

    if (this.note?.open) {
      this.player.body.setVelocity(0, 0);
      if (confirm) this.note.advance();
      return;
    }

    if (this.palAfter === "greet") {
      this.palAfter = undefined;
      run.palGreeted = true;
      this.reaching = false;
    }

    if (this.palAfter === "fight") {
      this.palAfter = undefined;
      this.palSpr?.destroy();
      startPalFight(this, "island", { x: this.player.x, y: this.player.y });
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
    tickWanderers(this, this.wanderers, this.player);
    tickFieldNpcs(this, this.npcs);
    this.player.setDepth(this.player.y);

    const spotted = losTrainer(this.player, this.npcs, areaDoorKeepOff("island"));
    if (spotted) {
      snapshotField(this.wanderers);
      if (startTrainerFight(this, spotted, "island", this.player)) return;
    }

    const moving = this.player.body.velocity.x !== 0 || this.player.body.velocity.y !== 0;
    const bumped = wanderNear(this.player, this.wanderers);
    if (moving && bumped) {
      this.startWild(bumped.id, bumped);
      return;
    }

    if (this.player.y < 8) {
      leaveField("island");
      this.scene.start("bridge", { from: "island" });
      return;
    }
    if (walkingInto(this.player, this.layout.schoolGate, "left")) {
      this.bikes.stashIndoor();
      leaveField("island");
      this.scene.start("school");
      return;
    }
    if (walkingInto(this.player, this.layout.bikeDoor, "left")) {
      this.bikes.stashIndoor();
      leaveField("island");
      this.scene.start("bikeshop", { from: "island" });
      return;
    }
    if (walkingInto(this.player, this.layout.centreDoor, "right")) {
      this.bikes.stashIndoor();
      leaveField("island");
      this.scene.start("centre");
      return;
    }
    if (walkingInto(this.player, this.layout.charityDoor, "right")) {
      this.bikes.stashIndoor();
      leaveField("island");
      this.scene.start("junkshop", { kind: "charity", from: "island" });
      return;
    }
    if (walkingInto(this.player, this.layout.pawnDoor, "right")) {
      this.bikes.stashIndoor();
      leaveField("island");
      this.scene.start("junkshop", { kind: "pawn", from: "island" });
      return;
    }
    if (walkingInto(this.player, this.layout.chippyDoor, "right")) {
      this.bikes.stashIndoor();
      leaveField("island");
      this.scene.start("takeaway", { kind: "chippy", from: "island" });
      return;
    }
    if (walkingInto(this.player, this.layout.spiceDoor, "right")) {
      this.bikes.stashIndoor();
      leaveField("island");
      this.scene.start("takeaway", { kind: "spice", from: "island" });
      return;
    }
    if (atSouthEdge(this.player, this.layout.mapH)) {
      this.reachThen("North End. Later.");
      this.player.y = this.layout.mapH - 20;
      return;
    }

    const zone = this.grassZone();
    if (moving && zone && !grassOnBike()) {
      const mapMon = wanderInGrass(this.player, this.wanderers, zone.at);
      if (mapMon) {
        this.startWild(mapMon.id, mapMon);
        return;
      }
      if (run.grassCalm > 0) run.grassCalm -= 1;
      else {
        this.steps += 1;
        if (this.steps > 7 && Math.random() < 0.12) {
          const wild = zone.pool[Math.floor(Math.random() * zone.pool.length)];
          this.startWild(wild);
        }
      }
    }

    if (cancel && this.bikes.tryBack()) return;
    if (confirm) this.tryExamine();
  }

  private grassZone(): GrassZone | undefined {
    return this.layout.grass.find((z) => near(this.player, z.at, 0));
  }

  private startWild(wild: WildId, map?: Wanderer): void {
    if ((ensureLeadAlive()?.hp ?? 0) <= 0) {
      this.reachThen("Your Pompeymon's out.");
      return;
    }
    this.steps = 0;
    run.grassCalm = 28;
    beginWildFight("island", { x: this.player.x, y: this.player.y }, this.wanderers, map);
    this.scene.start("encounter", { wild, lv: map?.lv ?? rollWildLv(3, 5) });
  }

  private tryExamine(): void {
    if (this.bikes.tryExamine()) return;
    const person = npcNear(this.player, this.npcs, 16, areaDoorKeepOff("island"));
    if (person) {
      snapshotField(this.wanderers);
      if (startTrainerFight(this, person, "island", this.player)) return;
      this.reachThen(npcTalk(person));
      return;
    }
    const wild = wanderNear(this.player, this.wanderers);
    if (wild) {
      this.bagUi?.scanWild(wild.id);
      return;
    }
    for (const spot of this.layout.spots) {
      if (near(this.player, spot.at, 8)) {
        this.reachThen(spot.line);
        return;
      }
    }
    if (this.grassZone()) {
      this.reachThen("Tall grass. Pompeymon in there.");
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
