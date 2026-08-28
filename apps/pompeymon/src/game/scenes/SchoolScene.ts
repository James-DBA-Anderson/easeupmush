import Phaser from "phaser";
import { GBA_W } from "../constants";
import { ensureLeadAlive, persistRun, resumePos, returningTo, run } from "../run";
import { rollWildLv } from "../battle";
import { kidAnim } from "../sprites/kid";
import type { WildId } from "../species";
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
import { drawSchool, type GrassZone, type SchoolLayout } from "../world/drawSchool";
import { BikeField, grassOnBike } from "../world/bike";
import { PalField } from "../world/pal";
import {
  giveMateGift,
  mateGiftChat,
  mateNoGiftChat,
  mateWaitChat,
  spareGift,
  MATE_ID,
  MATE_NPC,
} from "../world/mate";
import { matchPending, PitchMatch } from "../world/pitchMatch";
import {
  SCHOOL_NPCS,
  losTrainer,
  npcNear,
  npcTalk,
  blockNpcs,
  spawnFieldNpcs,
  startTrainerFight,
  tickFieldNpcs,
  type FieldNpc,
} from "../world/npcs";
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

export class SchoolScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: WalkKeys;
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private layout!: SchoolLayout;
  private note?: MsgBox;
  private bagUi?: BagUi;
  private facing: Facing = "side";
  private flip = -1;
  private reaching = false;
  private steps = 0;
  private wanderers: Wanderer[] = [];
  private npcs: FieldNpc[] = [];
  private from = "island";
  private bikes!: BikeField;
  private pal!: PalField;
  private meeting = false;
  private match?: PitchMatch;

  constructor() {
    super("school");
  }

  init(data: { from?: string }): void {
    this.from = data.from ?? "island";
  }

  create(): void {
    if (this.textures.exists("school")) this.textures.remove("school");
    const art = this.add.graphics().setVisible(false);
    this.layout = drawSchool(art);
    art.generateTexture("school", GBA_W, this.layout.mapH);
    art.destroy();
    this.add.image(0, 0, "school").setOrigin(0);

    const returning = returningTo("school") || this.from === "battle";
    const fallback = this.from === "schoolin" ? this.layout.spawnFromIn : this.layout.spawnFromRoad;
    const spawn = resumePos("school", fallback, !returning && this.from === "schoolin");
    this.facing = returning ? "down" : this.from === "schoolin" ? "down" : "side";
    this.flip = returning ? 1 : this.from === "schoolin" ? 1 : -1;
    this.player = spawnKid(this, spawn.x, spawn.y, { w: GBA_W, h: this.layout.mapH });
    this.player.setFlipX(this.flip < 0);
    this.cameras.main.startFollow(this.player, true, 1, 1);
    const specs = run.mateSad && !run.mateJoined ? [...SCHOOL_NPCS, MATE_NPC] : SCHOOL_NPCS;
    this.npcs = spawnFieldNpcs(this, specs);
    this.wanderers = spawnAreaWilds(this, "school", returning);
    addWalls(this, this.player, this.layout.solids);
    blockNpcs(this, this.player, this.npcs);
    const keys = bindWalkKeys(this);
    this.cursors = keys.cursors;
    this.wasd = keys.wasd;
    this.note = new MsgBox(this);
    this.bagUi = new BagUi(this, (line) => this.showNote(line));
    this.bikes = new BikeField(this, this.player, (line) => this.showNote(line));
    this.pal = new PalField(this, this.player, (line) => this.showNote(line));

    this.meeting = false;
    if (matchPending(this.from)) this.watchMatch();

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

    if (this.reaching || this.meeting) {
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

    const spotted = losTrainer(this.player, this.npcs, areaDoorKeepOff("school"));
    if (spotted) {
      snapshotField(this.wanderers);
      if (startTrainerFight(this, spotted, "school", this.player)) return;
    }

    const moving = this.player.body.velocity.x !== 0 || this.player.body.velocity.y !== 0;
    const bumped = wanderNear(this.player, this.wanderers);
    if (moving && bumped) {
      this.startWild(bumped.id, bumped);
      return;
    }

    if (walkingInto(this.player, this.layout.gate, "right")) {
      leaveField("school");
      this.scene.start("island", { from: "school" });
      return;
    }
    if (walkingInto(this.player, this.layout.door, "up")) {
      this.bikes.stashIndoor();
      leaveField("school");
      this.scene.start("schoolin");
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

  /** First walk through the gate — Stevie J is doing Ollie on the pitch. */
  private watchMatch(): void {
    this.meeting = true;
    this.player.body.setVelocity(0, 0);
    this.player.body.setEnable(false);
    this.player.anims.play(kidAnim(run.outfit, "idle-side"), true);
    const cam = this.cameras.main;
    cam.stopFollow();
    cam.pan(PitchMatch.VIEW.x, PitchMatch.VIEW.y, 700, "Sine.easeInOut");
    this.match = new PitchMatch(this, (lines, onDone) => this.showNote(lines, onDone));
    this.match.place();
    this.time.delayedCall(820, () => this.match?.start(() => this.offerGift()));
  }

  /** Give the lad something, or don't. */
  private offerGift(): void {
    run.matchSeen = true;
    const gift = giveMateGift();
    if (gift) {
      this.showNote(mateGiftChat(gift), () => this.endMatch(true));
      return;
    }
    run.mateSad = true;
    persistRun();
    this.showNote(mateNoGiftChat(), () => this.endMatch(false));
  }

  private endMatch(joined: boolean): void {
    this.match?.clear();
    this.match = undefined;
    const cam = this.cameras.main;
    cam.pan(this.player.x, this.player.y, 500, "Sine.easeInOut");
    this.time.delayedCall(520, () => {
      cam.startFollow(this.player, true, 1, 1);
      this.player.body.setEnable(true);
      this.meeting = false;
      if (joined) this.pal.addMate(this, this.player);
      else this.spawnSadMate();
    });
  }

  /** He stays sat on the pitch until you come back with something. */
  private spawnSadMate(): void {
    if (this.npcs.some((n) => n.id === MATE_ID)) return;
    const [sad] = spawnFieldNpcs(this, [MATE_NPC]);
    if (!sad) return;
    this.npcs.push(sad);
    blockNpcs(this, this.player, [sad]);
  }

  /** Talking to Ollie while he's sat there — hand something over and he's yours. */
  private tryGiveMate(): boolean {
    if (!spareGift()) {
      this.reachThen(mateWaitChat());
      return true;
    }
    const gift = giveMateGift();
    if (!gift) return false;
    const i = this.npcs.findIndex((n) => n.id === MATE_ID);
    if (i >= 0) {
      this.npcs[i]!.sprite.destroy();
      this.npcs[i]!.zone.destroy();
      this.npcs.splice(i, 1);
    }
    this.reachThen(mateGiftChat(gift));
    this.pal.addMate(this, this.player);
    return true;
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
    beginWildFight("school", { x: this.player.x, y: this.player.y }, this.wanderers, map);
    this.scene.start("encounter", { wild, lv: map?.lv ?? rollWildLv(4, 6) });
  }

  private tryExamine(): void {
    if (this.bikes.tryExamine()) return;
    const person = npcNear(this.player, this.npcs, 16, areaDoorKeepOff("school"));
    if (person) {
      if (person.id === MATE_ID && this.tryGiveMate()) return;
      snapshotField(this.wanderers);
      if (startTrainerFight(this, person, "school", this.player)) return;
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
