import Phaser from "phaser";
import { GAME_HEIGHT, LANE } from "../constants";
import { Structure, type StrikeInput, type StrikeResult } from "../combat/Structure";
import {
  sampleToss,
  tossDuration,
  tossReleaseT,
  type TossStyle,
} from "../combat/throwAnim";
import type { BodyBuild, Present } from "../assets/pompeyLooks";
import type { CarSurface, DestructibleProp } from "../world/DestructibleProp";
import { isThrowable } from "../world/ThrownWeapon";
import { chipSfx } from "../audio/ChipSfx";

/** Kickflip spin duration (ms) — keep pose + board spin in sync. */
export const KICKFLIP_MS = 320;

export type Team = "player" | "enemy" | "civilian" | "police";

export type FighterAction =
  | "idle"
  | "move"
  | "run"
  | "jump"
  | "jump_kick"
  | "backflip"
  | "punch"
  | "jab"
  | "hook"
  | "upper"
  | "backhand"
  | "headbutt"
  | "kick"
  | "stomp"
  | "weapon_swing"
  | "throw"
  | "low_blow"
  | "grab"
  | "hold"
  | "taser"
  | "cuff"
  | "hitstun"
  | "down"
  | "crawl"
  | "out_cold"
  | "cuffed"
  | "film"
  | "whirl"
  | "slide"
  | "body_toss"
  | "hurricanrana"
  | "swanton"
  | "block"
  | "call"
  | "loot"
  | "climb"
  | "ollie"
  | "kickflip";

export type SpritePrefix = string;

export interface FighterOptions {
  toughness?: number;
  loot?: Structure["loot"];
  /** Out-of-combat wind/guard recovery rate. */
  recovery?: number;
  /** Texture look id from pompeyLooks (e.g. look_c03). */
  lookId?: string;
  scaleX?: number;
  scaleY?: number;
  /** Figure build — used for face overlays (shades) on tall / petite lads. */
  build?: BodyBuild;
  present?: Present;
}

export type PoseKey =
  | "idle"
  | "walk0"
  | "walk1"
  | "walk2"
  | "walk3"
  | "run0"
  | "run1"
  | "run2"
  | "run3"
  | "run"
  | "jump"
  | "jump0"
  | "jump1"
  | "jump2"
  | "jump_kick"
  | "punch"
  | "punch0"
  | "punch1"
  | "punch2"
  | "jab"
  | "jab0"
  | "jab1"
  | "jab2"
  | "upper"
  | "upper0"
  | "upper1"
  | "upper2"
  | "backhand"
  | "backhand0"
  | "backhand1"
  | "backhand2"
  | "headbutt"
  | "kick"
  | "kick0"
  | "kick1"
  | "kick2"
  | "stomp_up"
  | "stomp"
  | "weapon_swing"
  | "weapon_swing0"
  | "weapon_swing1"
  | "weapon_swing2"
  | "hurt"
  | "hurt_head"
  | "hold_gut"
  | "crouch"
  | "ride0"
  | "ride1"
  | "ride_scooter0"
  | "ride_scooter1"
  | "skate0"
  | "skate1"
  | "ollie"
  | "kickflip"
  | "manual"
  | "limp_arm"
  | "limp_leg"
  | "down"
  | "stunned"
  | "crawl0"
  | "crawl1"
  | "angry"
  | "cuffed"
  | "bloodied"
  | "film"
  | "phone"
  | "phone0"
  | "phone1"
  | "phone2"
  | "phone3"
  | "block"
  | "block0"
  | "block1"
  | "block2"
  | "block3";

export class Fighter extends Phaser.GameObjects.Container {
  readonly team: Team;
  readonly structure: Structure;
  readonly spritePrefix: SpritePrefix;

  facing = 1;
  /** Strike direction — flipped for back attacks */
  attackDir = 1;
  action: FighterAction = "idle";
  actionUntil = 0;
  invulnUntil = 0;
  /** Buzzball — wrecking-ball window. */
  buzzedUntil = 0;
  /** Tossed into the Hovertravel fans — skip AI / floor pin while they mince. */
  inFanMince = false;
  speed = 160;
  runSpeed = 280;
  running = false;
  /** Drive-by / run strike — boosts weapon swing power + lunge. */
  rushStrike = false;
  airborne = false;
  /** True while blocking and strafing — drives the guard-walk cycle. */
  guardStepping = false;
  jumpVy = 0;
  groundY = 0;
  /** When standing on a car bonnet/roof — visual Y for landing. */
  platformY: number | null = null;
  /** Which bit of the motor you're on — bonnet/boot stay off the windows. */
  carSurface: CarSurface | null = null;
  mountedCar: DestructibleProp | null = null;
  /** Cached deck heights while mounted (so Up can climb bonnet → roof). */
  carBonnetY: number | null = null;
  carRoofY: number | null = null;
  /** One bounce per hop off a motor (takeoff). */
  carJumpBounced = false;
  /** Mid hop onto a car — lerps feet up onto the deck. */
  climbing = false;
  /** Don't auto-remount the same motor for a beat after hopping off. */
  carDismountUntil = 0;
  private climbFromX = 0;
  private climbFromY = 0;
  private climbToX = 0;
  private climbToY = 0;
  private climbStartAt = 0;
  private readonly climbMs = 440;
  /** Crawl direction when KO'd into crawl-away. */
  crawlDir: 1 | -1 = 1;
  /** Batman-style: flying body after a toss — damages others on impact. */
  tossVx = 0;
  tossUntil = 0;
  /** When the body toss began — drives the flip spin. */
  tossStartedAt = 0;
  /** Already tried the close-range head clash for this flight. */
  private headbangChecked = false;
  /** Grabbed victim for body toss. */
  heldTarget: Fighter | null = null;
  /** Clinch started from behind them — L toss becomes a German suplex. */
  holdFromBehind = false;
  /** Aim X while diving off a motor (Swanton / hurricanrana). */
  diveAimX: number | null = null;
  /** Active throw sheet while body_toss / hurricanrana plays. */
  private tossStyle: TossStyle = "powerbomb";
  /** Mid powerbomb / German / hurricanrana — glued until release. */
  private tossVictim: Fighter | null = null;
  /** Who is currently flipping this fighter over their hip. */
  private thrower: Fighter | null = null;
  /** Scene reads this once to play throw impact FX. */
  private pendingTossVictim: Fighter | null = null;
  /** True once the flip has launched the missile. */
  private tossLaunchDone = false;
  /** Swanton splash just cratered — scene shakes / dusts. */
  private pendingSwantonLand = false;
  /** Who's clinching this fighter (skip floor pin while dragged). */
  heldBy: Fighter | null = null;
  /**
   * Breathing room while getting off the floor (classic beat-'em-up rising
   * invincibility). 0 = no grace, so boots still finish a floored thug.
   */
  protected getUpGraceMs = 0;
  /** Floored / KO lock — stop anything from skating the body along the lane. */
  private plantLock = false;
  private plantX = 0;
  private plantY = 0;
  money = 0;
  weapon: Structure["loot"]["weapon"] = "none";
  /** Hits remaining before the weapon breaks / drops */
  weaponDurability = 0;
  /** Hopped on a dropped board. */
  skating = false;
  private skateSprite: Phaser.GameObjects.Image | null = null;
  /** Weight on the tail — nose up while rolling (Down + move). */
  boardManual = false;
  /** Scene should spawn a ground board (or snap debris) after a forced dismount. */
  private pendingBoardDrop: { x: number; y: number; broken: boolean } | null = null;

  takeBoardDrop(): { x: number; y: number; broken: boolean } | null {
    const d = this.pendingBoardDrop;
    this.pendingBoardDrop = null;
    return d;
  }

  readonly sprite: Phaser.GameObjects.Image;
  readonly weaponSprite: Phaser.GameObjects.Image;
  /** Display name for HUD / portrait — not drawn over the sprite. */
  readonly displayName: string;
  /** Council nuke — char the sprite so refreshVisuals keeps the scorch. */
  charred = false;

  private hitFlashUntil = 0;
  private painPoseUntil = 0;
  /** Chin / face shot — show the head-snap pose for a beat. */
  private headSnapUntil = 0;
  /** Empty grab — keep the sheepish recover pose after the action ends. */
  protected grabWhiffUntil = 0;
  /** Scene pops a float once when a grab catches nothing. */
  private pendingGrabWhiffFx = false;
  /** Pressed L with nobody in reach — don't double-announce at recover. */
  private grabLookedEmpty = false;
  /** Fire the miss float at the grasp beat, not on key-down. */
  private grabMissFxArmed = false;
  /** Grab wind-up length — keep in sync with isGrabActive / grabFrame. */
  protected readonly grabMs = 700;
  /** Floored body still reacting to a stomp — shake without sliding. */
  private twitchUntil = 0;
  private twitchDir: 1 | -1 = 1;
  /**
   * Facing locked when they hit the deck. Down art is side-on / asymmetric, so
   * any mid-floor flipX change looks like they rolled over (e.g. when you jump past).
   */
  private floorFacing: 1 | -1 | null = null;
  /** Walk/run cycle 0..1 */
  protected walkPhase = Math.random();
  /** Drag-yourself-along cycle 0..1 */
  private crawlPhase = 0;
  /** Skip redundant Phaser visual writes when nothing changed. */
  private visPoseKey = "";
  private visFlip = false;
  private visTint: number | null = null;
  private visAlpha = 1;
  private visScaleX = 0;
  private visScaleY = 0;
  private visWeaponBehind: boolean | null = null;
  private visWeaponOn = false;
  /** Don't flip facing every frame when bodies shove past each other */
  private facingLockUntil = 0;
  private readonly facingLockMs = 160;
  /** Prevent multi-hit on same swing */
  private hitLock = new Set<Fighter>();
  /** Ensures one projectile per throw action */
  private throwReleased = false;
  /** Natural sprite scale before lane-depth perspective. */
  protected baseScaleX = 1;
  /** Drawn width scale — Hardmen are ~1.28 so grab reach has to match. */
  get figureScaleX(): number {
    return this.baseScaleX;
  }
  protected baseScaleY = 1;
  /** Match pompeyLooks build — face overlays follow the drawn skull. */
  readonly bodyBuild: BodyBuild;
  readonly present: Present;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    team: Team,
    spritePrefix: SpritePrefix,
    name?: string,
    opts: FighterOptions = {},
  ) {
    super(scene, x, y);
    this.team = team;
    this.spritePrefix = spritePrefix;
    this.displayName = name ?? "";
    this.groundY = y;
    this.structure = new Structure({
      toughness: opts.toughness ?? (team === "player" ? 2.2 : 1),
      loot: opts.loot,
      recovery: opts.recovery,
    });

    this.baseScaleX = opts.scaleX ?? 1;
    this.baseScaleY = opts.scaleY ?? 1;
    this.bodyBuild = opts.build ?? "average";
    this.present = opts.present ?? "masc";
    this.sprite = scene.add.image(0, 0, `${spritePrefix}_idle`).setOrigin(0.5, 1);
    this.sprite.setScale(this.baseScaleX, this.baseScaleY);
    this.weaponSprite = scene.add
      .image(18, -28, "weapon_bottle")
      .setOrigin(0.5, 1)
      .setVisible(false)
      .setScale(0.85);
    this.add([this.sprite, this.weaponSprite]);

    scene.add.existing(this);
    this.setSize(48, 72);
  }

  get laneY(): number {
    if (this.airborne) return this.groundY;
    if (this.platformY !== null) return this.groundY;
    return this.y;
  }

  isBuzzed(now = this.scene.time.now): boolean {
    return now < this.buzzedUntil;
  }

  get attackReach(): number {
    const extra = this.isBuzzed() ? 28 : 0;
    if (this.action === "whirl") return 72 + extra;
    if (this.action === "slide") return 78 + extra;
    if (this.action === "stomp") return 64 + extra;
    if (this.action === "weapon_swing") return (this.rushStrike ? 82 : 70) + extra;
    if (this.action === "jump_kick") return 70 + extra;
    if (this.action === "backflip") return 76 + extra;
    if (this.action === "swanton") return 78 + extra;
    if (this.action === "headbutt") return (this.rushStrike && this.skating ? 64 : 56) + extra;
    if (this.action === "backhand") return 64 + extra;
    if (this.action === "kick") return 58 + extra;
    if (this.action === "jab") return 44 + extra;
    if (this.action === "hook" || this.action === "punch") return 52 + extra;
    if (this.action === "upper") return 48 + extra;
    return 52 + extra;
  }

  /** Hits everyone in a circle — whirl / stomps / crowd clearers. */
  get omniStrike(): boolean {
    return (
      this.isBuzzed() ||
      this.action === "whirl" ||
      this.action === "stomp" ||
      this.action === "swanton"
    );
  }

  /**
   * Nearer the bottom of the screen = closer to camera = larger.
   * Keeps people in scale with cars on the road strip.
   */
  protected depthScale(): number {
    const span = Math.max(1, LANE.maxY - LANE.minY);
    const t = Phaser.Math.Clamp((this.laneY - LANE.minY) / span, 0, 1);
    return 0.84 + t * 0.28;
  }

  /**
   * Common / shingle loiterers — shrink with distance from the fight lane
   * so they match foreshore walkers / BBQ folk, not full scrap size.
   */
  protected backgroundDepthScale(): number {
    const farY = GAME_HEIGHT * 0.32 + 60;
    const nearY = LANE.minY;
    const t = Phaser.Math.Clamp(
      (this.laneY - farY) / Math.max(1, nearY - farY),
      0,
      1,
    );
    return 0.58 + t * 0.2;
  }

  applyPerspectiveScale(): void {
    const d = this.isBackground ? this.backgroundDepthScale() : this.depthScale();
    const sx = this.baseScaleX * d;
    const sy = this.baseScaleY * d;
    if (sx === this.visScaleX && sy === this.visScaleY) return;
    this.visScaleX = sx;
    this.visScaleY = sy;
    this.sprite.setScale(sx, sy);
  }

  get busy(): boolean {
    return (
      this.action !== "idle" &&
      this.action !== "move" &&
      this.action !== "run" &&
      this.action !== "jump"
    );
  }

  /** Ducking behind cover — enemies on patrol won't clock you. */
  get isHidden(): boolean {
    return false;
  }

  /** Leaning out from cover for a look. */
  get isPeeking(): boolean {
    return false;
  }

  /** Radians of lean while peeking (sprite tilt). */
  get coverPeekLean(): number {
    return 0;
  }

  /** Loitering in the parallax / common — not in the fight lane yet. */
  get isBackground(): boolean {
    return false;
  }

  /** Beaten but still dragging themselves off — animated, not a sliding body. */
  get isCrawlingAway(): boolean {
    return this.structure.crawling && !this.structure.cuffed && !this.structure.outCold;
  }

  /** Temporary downs, KO, cuffs — stay put. Crawl-away and clinch still move. */
  get planted(): boolean {
    if (this.heldBy) return false;
    if (this.isInThrowArc) return false;
    if (this.structure.crawling && !this.structure.outCold && !this.structure.cuffed) return false;
    if (this.airborne && this.tossVx !== 0) return false;
    return (
      this.structure.isOut() ||
      this.structure.downed ||
      this.action === "down" ||
      this.action === "out_cold" ||
      this.action === "cuffed"
    );
  }

  /** Capture / reassert floor pin so separation, stomps, bikes can't skate bodies. */
  pinToFloor(): void {
    if (this.inFanMince) return;
    if (!this.planted) {
      this.plantLock = false;
      return;
    }
    if (this.airborne) return;
    if (!this.plantLock) {
      this.plantLock = true;
      this.plantX = this.x;
      this.plantY = this.y;
      this.endToss();
      return;
    }
    this.x = this.plantX;
    this.y = this.plantY;
    this.groundY = this.plantY;
    this.endToss();
  }

  /** Call after intentional knockdown shove so the plant sticks where they landed. */
  markPlantHere(): void {
    if (this.airborne) return;
    this.plantLock = true;
    this.plantX = this.x;
    this.plantY = this.y;
    this.groundY = this.y;
    this.lockFloorFacing();
    this.endToss();
  }

  clearPlantLock(): void {
    this.plantLock = false;
    this.floorFacing = null;
  }

  /** Freeze which way the down pose faces until they stand / crawl off. */
  private lockFloorFacing(): void {
    if (this.floorFacing !== null) return;
    this.floorFacing = this.facing < 0 ? -1 : 1;
  }

  /** Haul yourself along the floor in time with the crawl cycle — lurch, not glide. */
  crawlAlong(dt: number, speed: number, minX: number, maxX: number): void {
    const pull = Math.max(0, Math.sin(this.crawlPhase * Math.PI * 2));
    this.x = Phaser.Math.Clamp(this.x + this.crawlDir * speed * (0.2 + pull * 1.6) * dt, minX, maxX);
    this.setFacing(this.crawlDir);
    this.action = "crawl";
  }

  canAct(now: number): boolean {
    if (this.structure.isOut()) return false;
    if (this.structure.isDisabled(now) && this.action !== "hitstun") return false;
    if (now < this.actionUntil) return false;
    if (this.structure.downed && now < this.structure.groundedUntil) return false;
    return true;
  }

  setAction(action: FighterAction, now: number, durationMs: number): void {
    this.action = action;
    this.actionUntil = now + durationMs;
    this.hitLock.clear();
    this.throwReleased = false;
    this.attackDir = this.facing;
    if (
      action !== "headbutt" &&
      action !== "slide" &&
      action !== "weapon_swing" &&
      action !== "throw"
    ) {
      this.rushStrike = false;
    }
  }

  /**
   * Rolling on the board (or foot-running). Stationary skate doesn't count —
   * used for run-style attacks and wheel animation.
   */
  get isRushing(): boolean {
    return this.running || (this.skating && this.boardRolling);
  }

  /** True while the deck is actually travelling. */
  boardRolling = false;

  faceToward(x: number, now = 0): void {
    const dx = x - this.x;
    // Deadzone so overlapping / separation push doesn't flicker
    if (Math.abs(dx) < 16) return;
    this.setFacing(dx > 0 ? 1 : -1, now);
  }

  /** Change facing with a short lock so left/right don't strobe. */
  setFacing(dir: number, now = 0): void {
    // Planted bodies stay put — facing them mid-floor mirrors the KO doodle.
    if (
      (this.structure.downed || this.structure.isOut()) &&
      !this.isCrawlingAway &&
      !this.heldBy &&
      !this.isInThrowArc
    ) {
      return;
    }
    const next = dir >= 0 ? 1 : -1;
    if (next === this.facing) return;
    if (now > 0 && now < this.facingLockUntil) return;
    this.facing = next;
    if (now > 0) this.facingLockUntil = now + this.facingLockMs;
  }

  tryPunch(now: number, running = false): boolean {
    if (this.airborne) return this.tryJumpKick(now);
    if (!this.canAct(now)) return false;
    const rush = running || this.isRushing;
    if (rush) {
      // Rush / skate drive-by — weapon first, else headbutt
      if (this.weapon !== "none") {
        if (isThrowable(this.weapon)) {
          this.rushStrike = true;
          return this.tryThrow(now);
        }
        if (!this.structure.armsUsable()) {
          this.rushStrike = true;
          this.setAction("headbutt", now, 340);
          return true;
        }
        this.rushStrike = true;
        this.beginWeaponSwing(now);
        return true;
      }
      this.rushStrike = true;
      this.setAction("headbutt", now, 340);
      return true;
    }
    if (!this.structure.armsUsable()) return false;
    // Throwables sail; melee sticks (bat / chain / cue / knuckle) swing
    if (isThrowable(this.weapon)) {
      return this.tryThrow(now);
    }
    if (this.weapon !== "none") {
      this.beginWeaponSwing(now);
      return true;
    }
    // Generic scrap punch (enemies) — solid hook
    this.setAction("hook", now, 360);
    return true;
  }

  /** Jab — snappy, short reach. */
  tryJab(now: number): boolean {
    if (this.airborne) return this.tryJumpKick(now);
    if (!this.canAct(now)) return false;
    if (!this.structure.armsUsable()) return false;
    if (isThrowable(this.weapon)) return this.tryThrow(now);
    if (this.weapon !== "none") {
      this.beginWeaponSwing(now);
      return true;
    }
    this.setAction("jab", now, 280);
    return true;
  }

  /** Hook — body blow, mid reach. */
  tryHook(now: number): boolean {
    if (this.airborne) return this.tryJumpKick(now);
    if (!this.canAct(now)) return false;
    if (!this.structure.armsUsable()) return false;
    if (isThrowable(this.weapon)) return this.tryThrow(now);
    if (this.weapon !== "none") {
      this.beginWeaponSwing(now);
      return true;
    }
    this.setAction("hook", now, 360);
    return true;
  }

  /** Uppercut finisher — lifts the chin. */
  tryUpper(now: number): boolean {
    if (this.airborne) return this.tryJumpKick(now);
    if (!this.canAct(now)) return false;
    if (!this.structure.armsUsable()) return false;
    if (isThrowable(this.weapon)) return this.tryThrow(now);
    if (this.weapon !== "none") {
      this.beginWeaponSwing(now);
      return true;
    }
    this.setAction("upper", now, 440);
    return true;
  }

  private beginWeaponSwing(now: number): void {
    this.setAction("weapon_swing", now, 480);
    void chipSfx.weaponSwing(this.weapon);
  }

  /** Start a throw wind-up. Scene consumes the weapon when the projectile spawns. */
  tryThrow(now: number): boolean {
    if (!this.canAct(now)) return false;
    if (!isThrowable(this.weapon)) return false;
    if (!this.structure.armsUsable()) return false;
    this.setAction("throw", now, 280);
    return true;
  }

  /** True once per throw once the release beat is reached (no upper miss window). */
  takeThrowRelease(now: number): boolean {
    if (this.action !== "throw") return false;
    if (this.throwReleased) return false;
    const progress = 1 - (this.actionUntil - now) / 280;
    // Edge trigger from 40% — a hitch can't skip a narrow 40–55% band
    if (progress < 0.4) return false;
    this.throwReleased = true;
    return true;
  }

  /** Clear held weapon without spawning a drop (used when throwing). */
  consumeHeldWeapon(): Exclude<Structure["loot"]["weapon"], "none"> | null {
    if (this.weapon === "none") return null;
    const w = this.weapon;
    this.weapon = "none";
    this.weaponDurability = 0;
    this.syncWeaponSprite();
    return w;
  }

  tryKick(now: number): boolean {
    if (this.airborne) return this.tryJumpKick(now);
    if (!this.canAct(now)) return false;
    if (!this.structure.legsUsable()) return false;
    this.setAction("kick", now, 400);
    return true;
  }

  /** Boot into a floored body — wind-up then slam. */
  tryStomp(now: number): boolean {
    if (this.airborne) return false;
    if (!this.canAct(now)) return false;
    if (!this.structure.legsUsable()) return false;
    this.setAction("stomp", now, 520);
    return true;
  }

  /** High guard — fists up. Refreshable while already blocking. */
  tryBlock(now: number): boolean {
    if (this.airborne) return false;
    if (this.structure.isOut()) return false;
    if (!this.structure.armsUsable()) return false;
    if (this.structure.downed && now < this.structure.groundedUntil) return false;
    if (this.structure.isDisabled(now)) return false;
    if (this.action === "block") {
      this.actionUntil = now + 280;
      return true;
    }
    if (this.busy) return false;
    this.setAction("block", now, 340);
    return true;
  }

  get isBlocking(): boolean {
    return this.action === "block";
  }

  get isCalling(): boolean {
    return this.action === "call";
  }

  get isLooting(): boolean {
    return this.action === "loot";
  }

  /** Phone call wind-up — interruptible. */
  tryCall(now: number, durationMs = 3200): boolean {
    if (this.airborne) return false;
    if (this.structure.isOut()) return false;
    if (!this.structure.armsUsable()) return false;
    if (this.structure.downed && now < this.structure.groundedUntil) return false;
    if (this.structure.isDisabled(now)) return false;
    if (this.busy && this.action !== "call") return false;
    this.setAction("call", now, durationMs);
    return true;
  }

  /** Drop guard so an attack can start. */
  dropBlock(now: number): void {
    if (this.action !== "block") return;
    this.action = "idle";
    this.actionUntil = now;
    this.guardStepping = false;
  }

  /** Bend down over a body while rifling pockets. */
  startLooting(now: number, durationMs = 850): boolean {
    if (this.airborne) return false;
    if (this.structure.isOut()) return false;
    if (this.structure.downed && now < this.structure.groundedUntil) return false;
    if (this.action === "loot") {
      this.actionUntil = Math.max(this.actionUntil, now + durationMs * 0.5);
      return true;
    }
    this.setAction("loot", now, durationMs);
    return true;
  }

  /** Spinning roundhouse — hits everyone around you (Batman Returns crowd clear). */
  tryWhirl(now: number): boolean {
    if (this.airborne) return false;
    if (!this.canAct(now)) return false;
    if (!this.structure.legsUsable()) return false;
    this.setAction("whirl", now, 480);
    return true;
  }

  /** Running / skating slide through a line of lads. */
  trySlide(now: number): boolean {
    if (this.airborne) return false;
    if (!this.canAct(now)) return false;
    if (!this.structure.legsUsable()) return false;
    this.rushStrike = true;
    this.setAction("slide", now, 420);
    return true;
  }

  /** Hurl the grabbed body — powerbomb from the front, German from behind. */
  tryBodyToss(now: number): boolean {
    if (!this.heldTarget || this.heldTarget.structure.isOut()) {
      this.heldTarget = null;
      this.holdFromBehind = false;
      return false;
    }
    if (this.action !== "hold" && this.action !== "grab") return false;
    const victim = this.heldTarget;
    this.heldTarget = null;
    victim.heldBy = null;
    this.tossVictim = victim;
    this.tossLaunchDone = false;
    this.tossStyle = this.holdFromBehind ? "suplex" : "powerbomb";
    this.holdFromBehind = false;
    victim.thrower = this;
    victim.clearPlantLock();
    victim.structure.downed = false;
    victim.structure.groundedUntil = 0;
    // Soft crawl from a prior scrap must not stick through the bomb
    if (victim.structure.crawling && !victim.structure.outCold) {
      victim.structure.crawling = false;
    }
    victim.airborne = false;
    victim.jumpVy = 0;
    victim.tossVx = 0;
    victim.clearCarMount();
    victim.action = "hitstun";
    const dur = tossDuration(this.tossStyle);
    victim.actionUntil = now + dur + 80;
    this.setAction("body_toss", now, dur);
    this.syncThrowArc(now);
    return true;
  }

  /** True while the current body toss is a German suplex. */
  get isGermanSuplex(): boolean {
    return this.action === "body_toss" && this.tossStyle === "suplex";
  }

  /** Mid headscissors off a motor. */
  get isHurricanrana(): boolean {
    return this.action === "hurricanrana";
  }

  /** Any glued flip currently in progress. */
  get isThrowFlip(): boolean {
    return this.action === "body_toss" || this.action === "hurricanrana";
  }

  /** One-shot: victim just hurled — scene plays impact then clears. */
  consumeTossLaunch(): Fighter | null {
    const v = this.pendingTossVictim;
    this.pendingTossVictim = null;
    return v;
  }

  /** One-shot: Swanton just hit the deck. */
  consumeSwantonLand(): boolean {
    if (!this.pendingSwantonLand) return false;
    this.pendingSwantonLand = false;
    return true;
  }

  /** Still cartwheeling through the air after a body toss. */
  get isBeingTossed(): boolean {
    return this.tossVx !== 0 && this.airborne;
  }

  /** Glued into a powerbomb / flip (before missile launch). */
  get isInThrowArc(): boolean {
    return this.thrower !== null && !this.isBeingTossed;
  }

  /** Fly a tossed body along X while airborne / toss window lasts. */
  applyTossFlight(now: number, dt: number, minX: number, maxX: number): void {
    if (this.inFanMince) return;
    if (this.isThrowFlip && this.tossVictim) {
      this.syncThrowArc(now);
      return;
    }
    if (this.tossVx === 0) return;
    if (now >= this.tossUntil || !this.airborne) {
      this.endToss();
      return;
    }
    this.x += this.tossVx * dt;
    this.x = Phaser.Math.Clamp(this.x, minX, maxX);
  }

  /** Keep victim stuck to the thrower and release at the slam beat. */
  private syncThrowArc(now: number): void {
    const victim = this.tossVictim;
    if (!victim || !this.isThrowFlip) return;
    const dur = tossDuration(this.tossStyle);
    const progress = 1 - (this.actionUntil - now) / dur;
    const frame = sampleToss(this.tossStyle, progress);
    const dir = this.facing;

    victim.clearPlantLock();
    victim.structure.downed = false;
    victim.airborne = false;
    victim.jumpVy = 0;
    victim.x = this.x + dir * frame.victimNudge;
    victim.y = this.y;
    victim.groundY = this.groundY;
    // Suplex / rana: same facing. Powerbomb: face you.
    victim.facing =
      this.tossStyle === "suplex" || this.tossStyle === "hurricanrana" ? dir : -dir;
    victim.action = "hitstun";
    victim.actionUntil = Math.max(victim.actionUntil, this.actionUntil);

    if (!this.tossLaunchDone && progress >= tossReleaseT(this.tossStyle)) {
      this.releaseTossVictim(now);
    }
  }

  private releaseTossVictim(now: number): void {
    const victim = this.tossVictim;
    if (!victim || this.tossLaunchDone) return;
    this.tossLaunchDone = true;
    this.tossVictim = null;
    victim.thrower = null;

    const dir = this.facing;
    const bomb = this.tossStyle === "powerbomb";
    const suplex = this.tossStyle === "suplex";
    const rana = this.tossStyle === "hurricanrana";

    victim.clearPlantLock();
    // Suplex / rana plant behind; powerbomb drives them into the mat in front
    victim.x += dir * (suplex || rana ? -28 : 36);
    victim.hitLock.clear();
    victim.clearCarMount();
    victim.groundY = victim.y;
    const flyX = bomb ? 140 : suplex ? -220 : rana ? -260 : 480;
    const flyY = bomb ? -60 : suplex || rana ? -160 : -320;
    const flyMs = bomb ? 380 : suplex || rana ? 520 : 680;
    victim.tossVx = dir * flyX;
    victim.tossStartedAt = now;
    victim.tossUntil = now + flyMs;
    victim.airborne = true;
    victim.jumpVy = flyY;
    victim.headbangChecked = false;
    this.diveAimX = null;

    // Slam: can KO/crawl when they're worn; bomb / German survivors stay stunned
    victim.receiveStrike({
      kind: "hook",
      power: bomb ? 0.72 : suplex ? 0.62 : rana ? 0.78 : 0.55,
      critical: false,
      dirty: false,
      onOpening: false,
      softFloorOnly: true,
      now,
      bodyPart: rana ? "head" : "body",
      knockDir: suplex || rana ? -dir : dir,
    });

    victim.clearPlantLock();
    victim.tossVx = dir * flyX;
    victim.tossStartedAt = now;
    victim.tossUntil = now + flyMs;
    victim.airborne = true;
    if (victim.jumpVy > (bomb ? -40 : suplex || rana ? -80 : -180)) {
      victim.jumpVy = flyY;
    }
    victim.clearCarMount();
    // Cover the flight so mid-air punches don't soft-floor / flicker them
    victim.invulnUntil = Math.max(victim.invulnUntil, now + flyMs + 40);

    if (victim.structure.isOut()) {
      // Finished — stay down after the plant
      if (victim.structure.outCold) victim.setAction("out_cold", now, 999999);
      else if (victim.structure.crawling) victim.setAction("crawl", now, 999999);
    } else if (bomb || suplex) {
      // Powerbomb sits them on the mat; German leaves them stunned a beat
      const stunMs = bomb ? 1700 : 800;
      victim.structure.putOnFloor(now, stunMs, true);
      victim.action = "down";
      victim.actionUntil = victim.structure.groundedUntil;
    } else {
      // Rana survivors bounce up on landing
      victim.structure.downed = false;
      victim.structure.groundedUntil = 0;
      if (victim.structure.crawling && !victim.structure.outCold) {
        victim.structure.crawling = false;
      }
      victim.action = "hitstun";
      victim.actionUntil = victim.tossUntil;
    }
    this.pendingTossVictim = victim;
  }

  private endToss(): void {
    this.tossVx = 0;
    this.tossUntil = 0;
    this.tossStartedAt = 0;
    this.headbangChecked = false;
  }

  /**
   * Batman Returns — if another lad is right there when you hurl someone,
   * smash their heads together (once per flight, first beat only).
   */
  tryHeadbangClash(now: number, fighters: Fighter[]): Fighter | null {
    if (this.headbangChecked) return null;
    if (this.tossVx === 0 || now >= this.tossUntil) return null;
    // Only the fresh release — mid-flight pile-ups use resolveBodyTosses
    if (now - this.tossStartedAt > 130) {
      this.headbangChecked = true;
      return null;
    }

    const dir = Math.sign(this.tossVx) || this.facing;
    let best: Fighter | null = null;
    let bestAhead = 78;
    for (const t of fighters) {
      if (t === this) continue;
      if (t.structure.downed || t.structure.isOut()) continue;
      if (t.isInThrowArc || t.isBeingTossed) continue;
      if (t.team === "player") continue;
      if (
        t.team === "civilian" &&
        "isAlly" in t &&
        (t as { isAlly: boolean }).isAlly
      ) {
        continue;
      }
      if (t.team === "civilian" && this.team === "civilian") continue;
      const ahead = (t.x - this.x) * dir;
      if (ahead < -12 || ahead > 78) continue;
      if (Math.abs(t.laneY - this.laneY) > 46) continue;
      if (ahead < bestAhead) {
        bestAhead = ahead;
        best = t;
      }
    }
    if (!best || !this.markHit(best)) {
      return null;
    }
    this.headbangChecked = true;

    // Pull both skulls into the middle
    const midX = (this.x + best.x) * 0.5;
    this.x = midX - dir * 12;
    best.x = midX + dir * 12;
    best.y = this.y;
    best.groundY = this.groundY;
    best.faceToward(this.x, now);
    this.faceToward(best.x, now);

    best.receiveStrike({
      kind: "hook",
      power: 0.85,
      critical: true,
      dirty: false,
      onOpening: true,
      now,
      bodyPart: "head",
      knockDir: dir,
    });
    // Missile is i-framed for the flight — softFloorOnly still lands the clang
    this.receiveStrike({
      kind: "hook",
      power: 0.55,
      critical: false,
      dirty: false,
      onOpening: true,
      softFloorOnly: true,
      now,
      bodyPart: "head",
      knockDir: -dir,
    });

    // Both reel — no long missile flight after a head clash
    this.tossVx = dir * 55;
    this.tossUntil = now + 220;
    if (this.jumpVy < -80) this.jumpVy = -80;
    best.invulnUntil = Math.max(best.invulnUntil, now + 180);

    return best;
  }

  /** Jolt a floored body without moving their plant point. */
  private triggerFloorTwitch(now: number, dir: number, heavy: boolean): void {
    this.twitchUntil = now + (heavy ? 620 : 380);
    this.twitchDir = dir < 0 ? -1 : 1;
    this.hitFlashUntil = Math.max(this.hitFlashUntil, now + (heavy ? 260 : 160));
  }

  tryJumpKick(now: number, keepHeight = false): boolean {
    if (!this.airborne) return false;
    if (this.structure.isOut()) return false;
    if (!this.structure.legsUsable()) return false;
    if (
      this.action === "jump_kick" ||
      this.action === "backflip" ||
      this.action === "swanton" ||
      this.action === "hurricanrana"
    ) {
      return false;
    }
    this.setAction("jump_kick", now, 380);
    // Dive only once you've peaked — early boot (or a hop-kick) keeps the height
    if (!keepHeight && this.jumpVy >= -120) {
      this.jumpVy = Math.min(this.jumpVy, -80);
    }
    return true;
  }

  /** One-tap hop + boot — mobile Kick, so you don't need Jump and Punch together. */
  tryHopKick(now: number): boolean {
    if (this.airborne) return this.tryJumpKick(now, true);
    if (!this.tryJump(now)) return false;
    return this.tryJumpKick(now, true);
  }

  /**
   * Back + jump — flip over your shoulder and boot whoever's behind.
   * attackDir faces the rear; you drift that way through the flip.
   */
  tryBackflip(now: number): boolean {
    if (this.structure.isOut()) return false;
    if (this.airborne || this.climbing) return false;
    if (!this.structure.legsUsable()) return false;
    if (this.structure.downed && now < this.structure.groundedUntil) return false;
    if (this.structure.isDisabled(now)) return false;
    if (this.busy && this.action !== "jump" && this.action !== "ollie") return false;

    this.airborne = true;
    if (this.platformY !== null) {
      this.clearCarMount();
    } else {
      this.groundY = this.y;
    }
    const jumpScale = 0.85 + 0.15 * this.structure.moveSpeedFactor();
    this.jumpVy = -420 * jumpScale;
    this.hitLock.clear();
    // Strike behind — don't turn the sprite, just the hit cone
    this.attackDir = this.facing < 0 ? 1 : -1;
    this.setAction("backflip", now, 720);
    return true;
  }

  /**
   * Off a car roof/bonnet — backflip splash onto the road (or a floored lad).
   * K while stood on a motor.
   */
  trySwanton(now: number, target: Fighter | null = null): boolean {
    if (this.platformY === null || this.climbing) return false;
    if (this.structure.isOut()) return false;
    if (!this.structure.legsUsable()) return false;
    if (this.airborne) return false;
    if (this.structure.downed && now < this.structure.groundedUntil) return false;
    if (!this.canAct(now) && this.action !== "block") return false;

    // Leave the deck — fall toward the road (or the body you marked)
    this.clearCarMount();
    this.airborne = true;
    this.jumpVy = -460;
    this.hitLock.clear();
    if (target) {
      this.faceToward(target.x, now);
      this.diveAimX = target.x;
      this.groundY = target.laneY;
    } else {
      this.diveAimX = null;
    }
    this.attackDir = this.facing;
    this.setAction("swanton", now, 980);
    return true;
  }

  /**
   * Off a motor onto a standing lad — legs round the head, roll them over.
   */
  tryHurricanrana(now: number, target: Fighter): boolean {
    if (this.platformY === null || this.climbing) return false;
    if (this.structure.isOut() || target.structure.isOut()) return false;
    if (!this.structure.legsUsable()) return false;
    if (this.airborne) return false;
    if (target.structure.downed) return false;
    if (!this.canAct(now) && this.action !== "block") return false;

    this.clearCarMount();
    this.faceToward(target.x, now);
    this.diveAimX = target.x;
    this.groundY = target.laneY;
    // Drop in close so the scissors read, then a short hop into the flip
    this.y = Math.min(this.y, target.laneY - 36);
    this.airborne = true;
    this.jumpVy = -220;
    this.hitLock.clear();
    this.attackDir = this.facing;

    this.tossVictim = target;
    this.tossLaunchDone = false;
    this.tossStyle = "hurricanrana";
    target.thrower = this;
    target.heldBy = null;
    target.clearPlantLock();
    target.structure.downed = false;
    target.structure.groundedUntil = 0;
    target.airborne = false;
    target.jumpVy = 0;
    target.tossVx = 0;
    target.clearCarMount();
    target.action = "hitstun";
    const dur = tossDuration("hurricanrana");
    target.actionUntil = now + dur + 80;
    this.setAction("hurricanrana", now, dur);
    this.syncThrowArc(now);
    return true;
  }

  equipWeapon(kind: Exclude<Structure["loot"]["weapon"], "none">): void {
    this.weapon = kind;
    this.weaponDurability =
      kind === "knuckle"
        ? 12
        : kind === "chain"
          ? 10
          : kind === "cue"
            ? 9
            : kind === "bat"
              ? 8
              : kind === "brick"
                ? 4
                : 5;
    this.syncWeaponSprite();
  }

  consumeWeaponHit(): void {
    if (this.weapon === "none") return;
    this.weaponDurability -= 1;
    if (this.weaponDurability <= 0) {
      this.weapon = "none";
      this.weaponDurability = 0;
      this.syncWeaponSprite();
    }
  }

  dropWeapon(): Exclude<Structure["loot"]["weapon"], "none"> | null {
    if (this.weapon === "none") return null;
    const w = this.weapon;
    this.weapon = "none";
    this.weaponDurability = 0;
    this.syncWeaponSprite();
    return w;
  }

  private syncWeaponSprite(): void {
    if (this.weapon === "none") {
      this.weaponSprite.setVisible(false);
      return;
    }
    this.weaponSprite.setTexture(`weapon_${this.weapon}`);
    // Pivot from the grip so carry / swing arcs look attached to the hand
    if (this.weapon === "bat" || this.weapon === "cue" || this.weapon === "chain") {
      this.weaponSprite.setOrigin(0.1, 0.5);
    } else if (this.weapon === "bottle") {
      this.weaponSprite.setOrigin(0.45, 0.85);
    } else if (this.weapon === "knuckle") {
      this.weaponSprite.setOrigin(0.5, 0.55);
    } else {
      this.weaponSprite.setOrigin(0.5, 0.55);
    }
    this.weaponSprite.setVisible(true);
  }

  /**
   * Place the held weapon for the current pose — pumps with the stride,
   tucks on block/jump, and arcs through a proper bat swing.
   */
  private layoutHeldWeapon(
    now: number,
    pose: PoseKey,
  ): { x: number; y: number; angle: number; behind: boolean } {
    const f = this.facing;
    const bat =
      this.weapon === "bat" || this.weapon === "cue" || this.weapon === "chain";
    const brick = this.weapon === "brick" || this.weapon === "knuckle";

    if (this.action === "weapon_swing") {
      const duration = 480;
      const p = Phaser.Math.Clamp(1 - (this.actionUntil - now) / duration, 0, 1);
      // Ease: slow coil, snappy contact, soft follow-through
      let angle: number;
      let ox: number;
      let oy: number;
      let behind = false;
      if (p < 0.3) {
        const t = p / 0.3;
        const e = t * t * (3 - 2 * t);
        angle = Phaser.Math.Linear(bat ? -50 : -20, bat ? -155 : -110, e);
        ox = Phaser.Math.Linear(16, -2, e);
        oy = Phaser.Math.Linear(-30, -54, e);
        behind = true;
      } else if (p < 0.55) {
        const t = (p - 0.3) / 0.25;
        // Ease-in for the whip
        const e = t * t;
        angle = Phaser.Math.Linear(bat ? -155 : -110, bat ? 10 : 25, e);
        ox = Phaser.Math.Linear(-2, 38, e);
        oy = Phaser.Math.Linear(-54, -32, e);
        behind = t < 0.45;
      } else {
        const t = (p - 0.55) / 0.45;
        const e = 1 - Math.pow(1 - t, 2);
        angle = Phaser.Math.Linear(bat ? 10 : 25, bat ? 105 : 70, e);
        ox = Phaser.Math.Linear(38, 20, e);
        oy = Phaser.Math.Linear(-32, -14, e);
      }
      return { x: f * ox, y: oy, angle: f * angle, behind };
    }

    if (this.action === "throw") {
      return { x: f * 22, y: -44, angle: f * -60, behind: false };
    }

    // Default ready carry — bat tip up by the lead hip/hand
    let ox = bat ? 16 : brick ? 18 : 14;
    let oy = bat ? -30 : -26;
    let ang = bat ? -58 : brick ? -12 : -25;
    let behind = false;

    const stepping =
      pose.startsWith("walk") || pose.startsWith("run") || pose.startsWith("block");
    if (stepping) {
      const t = this.walkPhase * Math.PI * 2;
      const run = pose.startsWith("run");
      const guard = pose.startsWith("block");
      const amp = run ? 1 : guard ? 0.45 : 0.7;
      // Pump opposite the near-hand stride so it feels held, not glued on
      ox += Math.sin(t) * (run ? 6 : 4) * amp;
      oy += Math.cos(t) * (run ? 3.5 : 2.2) * amp;
      ang += Math.sin(t + 0.4) * (run ? 22 : guard ? 8 : 14) * amp;
      if (guard) {
        // Keep the weapon tucked while fists are up
        ox = bat ? 6 : 10;
        oy = bat ? -24 : -20;
        ang = bat ? -110 : -35;
        behind = bat;
      }
    } else if (pose.startsWith("jump") || pose === "jump_kick" || this.airborne) {
      ox = bat ? 12 : 14;
      oy = -40;
      ang = bat ? -80 : -40;
    } else if (pose === "block") {
      ox = bat ? 5 : 10;
      oy = bat ? -22 : -18;
      ang = bat ? -115 : -40;
      behind = bat;
    } else if (
      pose === "hurt" ||
      pose === "hurt_head" ||
      pose === "hold_gut" ||
      pose === "limp_arm" ||
      pose === "limp_leg"
    ) {
      ox = 10;
      oy = -18;
      ang = bat ? 35 : 20;
    } else if (pose.startsWith("kick") || pose === "stomp" || pose === "stomp_up") {
      ox = 14;
      oy = -28;
      ang = bat ? -48 : -18;
    } else if (
      pose === "crouch" ||
      pose === "down" ||
      pose === "stunned" ||
      pose.startsWith("crawl")
    ) {
      ox = 12;
      oy = -14;
      ang = bat ? -35 : -10;
    } else if (pose.startsWith("punch") || pose.startsWith("jab") || pose.startsWith("upper")) {
      // Still holding while punching isn't the bat swing — tuck aside
      ox = 8;
      oy = -34;
      ang = bat ? -90 : -50;
      behind = true;
    } else if (pose.startsWith("backhand") || pose === "headbutt") {
      ox = 10;
      oy = -26;
      ang = bat ? -40 : -15;
    } else {
      // Idle sway
      const sway = Math.sin(now * 0.005);
      oy += sway * 1.4;
      ang += sway * 4;
    }

    return { x: f * ox, y: oy, angle: f * ang, behind };
  }

  tryBackAttack(now: number): boolean {
    if (!this.canAct(now)) return false;
    if (!this.structure.armsUsable()) return false;
    this.setAction("backhand", now, 380);
    this.attackDir = -this.facing;
    return true;
  }

  /** Turn an early jab/kick into a backhand when the J+K chord lands late. */
  cancelIntoBackAttack(now: number): boolean {
    if (!this.structure.armsUsable()) return false;
    const totals: Partial<Record<FighterAction, number>> = {
      jab: 280,
      hook: 360,
      punch: 320,
      kick: 400,
    };
    const total = totals[this.action];
    if (!total) return false;
    const progress = 1 - (this.actionUntil - now) / total;
    if (progress > 0.42) return false;
    this.setAction("backhand", now, 380);
    this.attackDir = -this.facing;
    return true;
  }

  tryLowBlow(now: number): boolean {
    if (!this.canAct(now)) return false;
    if (!this.structure.armsUsable() && !this.structure.legsUsable()) return false;
    this.setAction("low_blow", now, 400);
    return true;
  }

  tryGrab(now: number, nearby: Fighter[] = []): boolean {
    if (this.structure.isOut()) return false;
    if (!this.structure.armsUsable()) return false;
    if (this.airborne || this.climbing) return false;
    if (this.structure.downed && now < this.structure.groundedUntil) return false;
    // Cancel recovery so L always answers — silent canAct fails felt like a dead key
    this.setAction("grab", now, this.grabMs);
    this.grabWhiffUntil = 0;
    this.pendingGrabWhiffFx = false;
    const best = this.nearestGrabTarget(nearby);
    this.grabLookedEmpty = !best;
    this.grabMissFxArmed = !best;
    // Latch before enemies take their step — bosses used to walk out of the
    // delayed grab window. Scoop goes straight into the throw.
    if (best && this.team === "player") {
      this.markHit(best);
      this.connectGrab(best, now);
    }
    return true;
  }

  /** Closest living foe in grab reach (bigger lads get a bit more pad). */
  nearestGrabTarget(fighters: Fighter[]): Fighter | null {
    let best: Fighter | null = null;
    let bestD = 9999;
    for (const target of fighters) {
      if (target === this) continue;
      if (target.team === this.team && this.team !== "police") continue;
      if (target.structure.isOut()) continue;
      if (!inReach(this, target, this.attackReach + 8)) continue;
      const d = Math.abs(target.x - this.x);
      if (d < bestD) {
        bestD = d;
        best = target;
      }
    }
    return best;
  }

  /** Player: scoop into a throw. AI: dump them. */
  connectGrab(target: Fighter, now: number): void {
    const fromBehind = (this.x - target.x) * target.facing < -8;
    target.structure.createOpening(now, 1000);
    if (this.team === "player") {
      this.startHoldOn(target, now, fromBehind);
      target.x = this.x + this.facing * (fromBehind ? 14 : 22);
      target.y = this.y;
      target.groundY = target.y;
      if (fromBehind) target.facing = this.facing;
      this.tryBodyToss(now);
    } else {
      target.takeDown(now);
    }
  }

  /** Latch a grab target so tryBodyToss can fire (no standing clinch). */
  startHoldOn(target: Fighter, now: number, fromBehind = false): void {
    this.heldTarget = target;
    this.holdFromBehind = fromBehind;
    this.grabLookedEmpty = false;
    this.grabMissFxArmed = false;
    this.pendingGrabWhiffFx = false;
    target.heldBy = this;
    target.clearPlantLock();
    target.structure.downed = false;
    target.structure.groundedUntil = 0;
    target.airborne = false;
    target.jumpVy = 0;
    target.endToss();
    target.action = "hitstun";
    target.actionUntil = now + 200;
    if (fromBehind) {
      // Waist lock — square up behind them, same facing
      const face = target.facing < 0 ? -1 : 1;
      this.setFacing(face, now);
      target.x = this.x + this.facing * 14;
    }
    // Brief hold latch — resolveCombat immediately calls tryBodyToss
    this.setAction("hold", now, 200);
  }

  /** Active throw sheet (powerbomb vs German suplex). */
  get activeTossStyle(): TossStyle {
    return this.tossStyle;
  }

  tryJump(now: number): boolean {
    if (this.structure.isOut()) return false;
    if (this.airborne || this.climbing) return false;
    if (!this.structure.legsUsable()) return false;
    if (this.structure.downed && now < this.structure.groundedUntil) return false;
    if (this.structure.isDisabled(now)) return false;
    if (this.busy && this.action !== "jump" && this.action !== "ollie") return false;

    this.airborne = true;
    if (this.platformY !== null) {
      this.platformY = null;
      this.carSurface = null;
    } else {
      this.groundY = this.y;
    }
    const jumpScale = 0.85 + 0.15 * this.structure.moveSpeedFactor();
    // Ollie pops a bit higher than a normal hop
    this.jumpVy = -(this.skating ? 440 : 380) * jumpScale;
    this.action = this.skating ? "ollie" : "jump";
    this.actionUntil = now + (this.skating ? 620 : 560);
    this.hitLock.clear();
    this.attackDir = this.facing;
    return true;
  }

  /** Airborne kick while skating — kickflip. */
  tryKickflip(now: number): boolean {
    if (!this.skating || !this.airborne) return false;
    if (this.action === "kickflip") return false;
    this.setAction("kickflip", now, KICKFLIP_MS);
    return true;
  }

  mountSkateboard(): void {
    if (this.skating) return;
    this.skating = true;
    if (!this.skateSprite) {
      const key = this.scene.textures.exists("mount_skate")
        ? "mount_skate"
        : "mount_scooter";
      this.skateSprite = this.scene.add
        .image(0, 4, key)
        .setOrigin(0.5, 1)
        .setDepth(1);
      this.add(this.skateSprite);
    }
    this.skateSprite.setVisible(true);
    this.speed = Math.max(this.speed, 195);
    this.runSpeed = Math.max(this.runSpeed, 265);
  }

  /** Hop off — returns world spot for a ground board if one should drop. */
  dismountSkateboard(leaveBoard: boolean): { x: number; y: number } | null {
    if (!this.skating) return null;
    this.skating = false;
    this.boardManual = false;
    this.skateSprite?.setVisible(false);
    if (this.action === "ollie" || this.action === "kickflip") {
      this.action = this.airborne ? "jump" : "idle";
    }
    this.speed = 160;
    this.runSpeed = 280;
    if (!leaveBoard) return null;
    return { x: this.x - this.facing * 18, y: this.y + 4 };
  }

  /** Hop onto a car deck — animated arc, not a teleport. */
  beginClimbOnto(
    toX: number,
    toY: number,
    groundY: number,
    now: number,
    decks?: {
      bonnet: number;
      roof: number;
      surface: CarSurface;
      car: DestructibleProp;
    },
  ): void {
    if (this.climbing || this.airborne) return;
    this.climbing = true;
    this.climbFromX = this.x;
    this.climbFromY = this.y;
    this.climbToX = toX;
    this.climbToY = toY;
    this.climbStartAt = now;
    this.groundY = groundY;
    this.platformY = toY;
    if (decks) {
      this.carBonnetY = decks.bonnet;
      this.carRoofY = decks.roof;
      this.carSurface = decks.surface;
      this.mountedCar = decks.car;
    }
    this.airborne = false;
    this.jumpVy = 0;
    this.setAction("climb", now, this.climbMs);
  }

  clearCarMount(): void {
    this.platformY = null;
    this.carBonnetY = null;
    this.carRoofY = null;
    this.carSurface = null;
    this.mountedCar = null;
    this.carJumpBounced = false;
  }

  /** Advance climb tween. Returns true while mid-climb. */
  updateClimbMotion(now: number): boolean {
    if (!this.climbing) return false;
    const t = Math.min(1, (now - this.climbStartAt) / this.climbMs);
    const ease = t * t * (3 - 2 * t);
    const lift = Math.sin(t * Math.PI) * 24;
    this.x = this.climbFromX + (this.climbToX - this.climbFromX) * ease;
    this.y = this.climbFromY + (this.climbToY - this.climbFromY) * ease - lift;
    if (t >= 1) {
      this.climbing = false;
      this.x = this.climbToX;
      this.y = this.climbToY;
      this.platformY = this.climbToY;
      if (this.action === "climb") {
        this.action = "idle";
        this.actionUntil = now;
      }
    }
    return true;
  }

  tryHold(now: number): boolean {
    if (!this.canAct(now)) return false;
    if (!this.structure.armsUsable()) return false;
    this.setAction("hold", now, 600);
    return true;
  }

  tryTaser(now: number): boolean {
    if (!this.canAct(now)) return false;
    if (!this.structure.armsUsable()) return false;
    this.setAction("taser", now, 400);
    return true;
  }

  tryCuff(now: number): boolean {
    if (!this.canAct(now)) return false;
    if (!this.structure.armsUsable()) return false;
    this.setAction("cuff", now, 500);
    return true;
  }

  updatePhysics(dt: number, laneMin: number, _laneMax: number): void {
    if (!this.airborne) return;
    this.jumpVy += 1600 * dt;
    this.y += this.jumpVy * dt;
    const floor = this.platformY ?? this.groundY;
    if (this.y >= floor) {
      this.y = floor;
      this.airborne = false;
      this.jumpVy = 0;
      // Remember before endToss() — that clears tossUntil / tossVx
      const landedFromToss = this.tossVx !== 0 || this.tossUntil > 0;
      this.endToss();
      if (this.action === "jump") this.action = "idle";
      if (this.action === "backflip") {
        this.action = "idle";
        this.actionUntil = 0;
        this.sprite.setOrigin(0.5, 1);
        this.sprite.y = 0;
        this.sprite.setRotation(0);
      }
      if (this.action === "swanton") {
        // Hold the splash pose through the end of the action
        this.sprite.setOrigin(0.5, 1);
        this.sprite.y = 0;
        this.sprite.setRotation(0);
        this.pendingSwantonLand = true;
      }
      // Snap out of the tumble into a proper floor pose
      if (this.structure.downed || this.structure.isOut()) {
        this.sprite.setOrigin(0.5, 1);
        this.sprite.y = 0;
        this.sprite.setRotation(0);
        this.markPlantHere();
        if (
          this.structure.downed &&
          !this.structure.isOut() &&
          Number.isFinite(this.structure.groundedUntil)
        ) {
          this.action = "down";
          this.actionUntil = this.structure.groundedUntil;
        }
      } else if (landedFromToss) {
        // Survived a body toss — on your feet straight away (with get-up grace)
        this.sprite.setOrigin(0.5, 1);
        this.sprite.y = 0;
        this.sprite.setRotation(0);
        this.structure.downed = false;
        this.structure.groundedUntil = 0;
        if (this.structure.crawling && !this.structure.outCold) {
          this.structure.crawling = false;
        }
        this.action = "idle";
        this.actionUntil = 0;
        this.clearPlantLock();
        this.grantGetUpGrace(this.scene.time.now);
      }
    } else {
      this.y = Math.min(this.y, floor);
      this.y = Math.max(this.y, laneMin - 80);
    }
  }

  receiveStrike(hit: StrikeInput): StrikeResult {
    const floored = this.structure.downed || this.structure.isOut();
    // Super armor through the bomb / rana — Hardmen punching the thrower
    // used to snap body_toss into hitstun and leave the victim glued.
    if (this.isThrowFlip && !hit.softFloorOnly) {
      this.hitFlashUntil = hit.now + 90;
      this.refreshVisuals(hit.now, 0);
      return "blocked";
    }
    if (this.isBuzzed(hit.now) && !hit.softFloorOnly) {
      this.hitFlashUntil = hit.now + 70;
      this.refreshVisuals(hit.now, 0);
      return "blocked";
    }
    // Short i-frames: still let a boot jolt a body on the floor,
    // and always allow toss soft-plants through
    if (hit.now < this.invulnUntil && !hit.softFloorOnly) {
      if (floored && hit.kind === "boot_head") {
        this.triggerFloorTwitch(hit.now, hit.knockDir ?? this.facing, true);
        this.refreshVisuals(hit.now, 0);
      }
      return "blocked";
    }
    const wasFloored = floored;
    // Shove along facing = hit in the back; opposite = hit from the front
    const hitFromBehind =
      hit.knockDir !== undefined &&
      hit.knockDir !== 0 &&
      Math.sign(hit.knockDir) === Math.sign(this.facing);
    const guardingFront = this.isBlocking && !hitFromBehind;
    const result = this.structure.applyStrike({
      ...hit,
      activeBlock: hit.activeBlock ?? guardingFront,
      hitFromBehind: hit.hitFromBehind ?? hitFromBehind,
    });
    this.hitFlashUntil = hit.now + 180;
    this.painPoseUntil = hit.now + 900;

    if (
      this.skating &&
      result !== "blocked"
    ) {
      // Hit off the board — deck snaps, no reclaim
      this.dismountSkateboard(false);
      this.pendingBoardDrop = {
        x: this.x - this.facing * 18,
        y: this.y + 4,
        broken: true,
      };
    }

    if (result === "blocked" && guardingFront) {
      // Keep the guard pose up so the block reads clearly
      this.actionUntil = Math.max(this.actionUntil, hit.now + 280);
      this.hitFlashUntil = hit.now + 90;
      this.painPoseUntil = 0;
      this.headSnapUntil = 0;
    } else if (hitFromBehind && this.isBlocking && result !== "blocked") {
      // Caught guarding the wrong way — drop the shell so the hit reads
      this.dropBlock(hit.now);
      this.setAction("hitstun", hit.now, 280);
    }

    // Getting clipped mid-call drops the phone
    if (this.action === "call" && result !== "blocked") {
      this.action = "hitstun";
      this.actionUntil = hit.now + 280;
    }

    // Floored bodies stay planted — no skate from stomps / pile-ons
    const nowFloored = wasFloored || this.structure.downed || this.structure.isOut();

    // Sometimes the skull rocks back on a head / face shot
    const toHead =
      hit.bodyPart === "head" ||
      hit.bodyPart === "face" ||
      hit.kind === "chin_shot" ||
      hit.kind === "jab" ||
      hit.kind === "headbutt" ||
      hit.kind === "backhand";
    if (
      result !== "blocked" &&
      toHead &&
      !nowFloored &&
      Math.random() < (hit.kind === "chin_shot" || hit.critical ? 0.85 : 0.45)
    ) {
      this.headSnapUntil = hit.now + 320 + hit.power * 180;
    }

    if (!wasFloored) {
      const upperBoost = hit.kind === "chin_shot" ? 10 : 0;
      const push =
        result === "blocked"
          ? 4
          : result === "flinch"
            ? 12
            : result === "stumble" || result === "disabled"
              ? 24 + upperBoost
              : result === "out_cold" || result === "crawl_away"
                ? 32 + upperBoost
                : 16 + upperBoost;
      const dir = hit.knockDir ?? this.facing;
      this.x += dir * push;
      if (hit.kind === "boot_head" && nowFloored && result !== "blocked") {
        this.triggerFloorTwitch(hit.now, dir, true);
      }
    } else if (hit.kind === "boot_head" || result !== "blocked") {
      // Boot / pile-on into a body on the floor — they twitch in place
      this.triggerFloorTwitch(
        hit.now,
        hit.knockDir ?? this.facing,
        hit.kind === "boot_head" || result === "out_cold",
      );
    }
    // Knock off car platforms
    if (result !== "blocked" && this.platformY !== null) {
      this.clearCarMount();
      this.airborne = false;
      this.jumpVy = 0;
      this.y = this.groundY;
    }

    if (result === "out_cold") {
      this.setAction("out_cold", hit.now, 999999);
      this.markPlantHere();
    } else if (result === "crawl_away") {
      this.setAction("crawl", hit.now, 999999);
      // Pick once: nearest visible screen edge, then keep dragging that way
      const cam = this.scene.cameras.main;
      const leftDist = this.x - cam.scrollX;
      const rightDist = cam.scrollX + cam.width - this.x;
      this.crawlDir = leftDist <= rightDist ? -1 : 1;
      this.plantLock = false;
      this.endToss();
    } else if (result === "cuffed") {
      this.setAction("cuffed", hit.now, 999999);
      this.markPlantHere();
    } else if (result === "tased" || result === "stumble" || result === "disabled") {
      this.setAction("hitstun", hit.now, result === "tased" ? 900 : 520);
      if (this.structure.downed) this.markPlantHere();
    } else if (result === "flinch" || result === "winded" || result === "opened") {
      // Floored flinch is just the twitch — don't snap into a standing hurt pose
      if (!nowFloored) {
        const stun =
          result === "winded" ? 400 : hit.critical || hit.power >= 0.7 ? 380 : 320;
        this.setAction("hitstun", hit.now, stun);
      } else this.markPlantHere();
    } else if (result !== "blocked" && !nowFloored) {
      // Any other connecting standing hit still freezes them a beat
      this.setAction("hitstun", hit.now, 300);
    } else if (wasFloored || this.structure.downed) {
      this.markPlantHere();
    }

    // Floor boots keep a short lock so multi-frame windows don't multi-hit;
    // don't extend invuln through the whole grounded window (that killed stomps).
    if (nowFloored && hit.kind === "boot_head") {
      this.invulnUntil = hit.now + 160;
    } else {
      this.invulnUntil = hit.now + 120;
      // Get-up grace is granted when they stand (tickKnockdown) — not for the
      // whole soft-down, or boots couldn't finish a powerbomb victim.
    }
    this.refreshVisuals(hit.now, 0);
    return result;
  }

  /**
   * Brief scramble-up i-frames after a soft down / take-down.
   * Not the whole floor timer — that blocked boot finishers on slam victims.
   */
  private grantGetUpGrace(now: number): void {
    if (this.getUpGraceMs <= 0) return;
    if (this.structure.isOut()) return;
    this.invulnUntil = Math.max(this.invulnUntil, now + this.getUpGraceMs);
  }

  onWhiff(now: number): void {
    const extra = 280 + this.structure.anger * 220;
    this.structure.createOpening(now, extra);
  }

  /** Peel off a thrower so a gag (fans, etc.) can take over the body. */
  detachFromThrower(): void {
    if (!this.thrower) return;
    if (this.thrower.tossVictim === this) this.thrower.tossVictim = null;
    this.thrower = null;
  }

  takeDown(now: number): void {
    this.structure.putOnFloor(now, 900);
    this.setAction("down", now, 900);
    this.airborne = false;
    this.jumpVy = 0;
    this.detachFromThrower();
    this.endToss();
    this.grantGetUpGrace(now);
    // Don't pin yet if about to be clinched — pin after hold ends
    if (!this.heldBy) this.markPlantHere();
    this.refreshVisuals(now, 0);
  }

  applyCuffs(now: number): StrikeResult {
    const r = this.structure.applyCuffs();
    this.setAction("cuffed", now, 999999);
    this.refreshVisuals(now, 0);
    return r;
  }

  /** Get hauled upright after the scrum moves on. */
  reviveFromHelp(now: number, pickup = 0.4): boolean {
    if (this.structure.cuffed) return false;
    if (!this.structure.revive(pickup)) {
      // Already upright — treat as success so the scene isn't stuck waiting
      if (!this.structure.isOut()) {
        this.action = "idle";
        this.actionUntil = now + 120;
        this.invulnUntil = Math.max(this.invulnUntil, now + 600);
        return true;
      }
      return false;
    }
    this.releaseHeldTarget();
    this.heldBy = null;
    this.airborne = false;
    this.jumpVy = 0;
    this.clearPlantLock();
    this.endToss();
    this.action = "idle";
    this.actionUntil = now + 240;
    this.invulnUntil = now + 900;
    this.groundY = this.y;
    this.refreshVisuals(now, 0);
    return true;
  }

  markHit(target: Fighter): boolean {
    if (this.hitLock.has(target)) return false;
    this.hitLock.add(target);
    return true;
  }

  refreshVisuals(now: number, dt: number): void {
    if (this.inFanMince) return;
    const s = this.structure;
    // recoverFloor is owned by tickKnockdown — don't double-clear mid-frame
    this.tickGrabMissFx(now);
    if (this.isThrowFlip) this.syncThrowArc(now);
    if (dt > 0) {
      s.decayPain(dt);
      // Only once they've been left alone for a beat
      if (now >= this.painPoseUntil) s.catchBreath(dt);
    }

    const moving =
      this.action === "move" ||
      this.action === "run" ||
      this.running ||
      this.boardRolling ||
      (this.action === "block" && this.guardStepping);
    if (moving && dt > 0 && !this.structure.isOut() && !this.airborne) {
      const rate = this.gaitAnimRate();
      this.walkPhase = (this.walkPhase + dt * rate) % 1;
    }
    if (dt > 0 && this.isCrawlingAway) {
      this.crawlPhase = (this.crawlPhase + dt * 1.1) % 1;
    }

    const pose = this.poseForState(now);
    const key = `${this.spritePrefix}_${pose}`;
    if (key !== this.visPoseKey) {
      if (this.scene.textures.exists(key)) {
        this.visPoseKey = key;
        this.sprite.setTexture(key);
      } else {
        // Don't get stuck on a missing frame — fall back so the action still reads
        const fallback = `${this.spritePrefix}_punch`;
        if (this.scene.textures.exists(fallback)) {
          this.visPoseKey = key;
          this.sprite.setTexture(fallback);
        }
      }
    }

    // Drawn facing right; flip for left — feet stay planted (no vertical bob).
    // Soft-down / KO doodles are asymmetric; freeze flipX so a jump past
    // doesn't look like they rolled over. Crawl still faces the drag direction.
    const pinnedFloorPose =
      pose === "down" || pose === "stunned" || pose === "cuffed";
    if (pinnedFloorPose) this.lockFloorFacing();
    const face =
      pinnedFloorPose && this.floorFacing !== null ? this.floorFacing : this.facing;
    const flip = face < 0;
    if (flip !== this.visFlip) {
      this.visFlip = flip;
      this.sprite.setFlipX(flip);
    }
    this.applyPerspectiveScale();

    if (this.isBeingTossed) {
      // After release — keep tumbling with a lighter spin (flip already sold the arc)
      const duration = Math.max(1, this.tossUntil - this.tossStartedAt);
      const elapsed = Phaser.Math.Clamp(now - this.tossStartedAt, 0, duration);
      const t = elapsed / duration;
      const spin = 1 - Math.pow(1 - t, 1.2);
      const dir = Math.sign(this.tossVx) || this.facing;
      this.sprite.setOrigin(0.5, 0.55);
      this.sprite.x = 0;
      this.sprite.y = -28;
      this.sprite.setRotation(dir * spin * Math.PI * 1.1);
    } else if (this.action === "backflip" && this.airborne) {
      // Flip back over the shoulder — one full rotation
      const progress = 1 - (this.actionUntil - now) / 720;
      const flip = Math.min(1, progress / 0.75);
      this.sprite.setOrigin(0.5, 0.5);
      this.sprite.x = 0;
      this.sprite.y = -28;
      this.sprite.setRotation(-this.facing * flip * Math.PI * 2);
    } else if (this.action === "swanton" && this.airborne) {
      // Backflip off the motor — full twist then splash
      const progress = 1 - (this.actionUntil - now) / 980;
      const flip = Math.min(1, progress / 0.72);
      this.sprite.setOrigin(0.5, 0.5);
      this.sprite.x = 0;
      this.sprite.y = -30;
      this.sprite.setRotation(this.facing * flip * Math.PI * 2.15);
    } else if (this.isInThrowArc && this.thrower) {
      // Glued flip — powerbomb hoist, or German bridge from behind
      const style = this.thrower.activeTossStyle;
      const progress = 1 - (this.thrower.actionUntil - now) / tossDuration(style);
      const frame = sampleToss(style, progress);
      const dir = this.thrower.facing;
      this.sprite.setOrigin(0.5, 0.55);
      this.sprite.x = 0;
      // Bigger lads (Hardmen) need more lift or they look planted on your shoulders
      this.sprite.y = -frame.victimLift * Math.max(1, this.baseScaleY);
      this.sprite.setRotation(((frame.victimAngle * Math.PI) / 180) * dir);
    } else if (this.action === "body_toss" || this.action === "hurricanrana") {
      const progress = 1 - (this.actionUntil - now) / tossDuration(this.tossStyle);
      const frame = sampleToss(this.tossStyle, progress);
      this.sprite.setOrigin(0.5, 1);
      this.sprite.x = 0;
      this.sprite.y = 0;
      this.sprite.setRotation((frame.heroAngle * Math.PI) / 180);
    } else if (now < this.twitchUntil) {
      // Stomp / pile-on — body stays planted but jerks under the boot
      // (Keep rotation small — big rolls read as flipping when you jump past.)
      const left = this.twitchUntil - now;
      const strength = Phaser.Math.Clamp(left / 520, 0.35, 1);
      const kick = Math.sin(now * 0.045) * Math.cos(now * 0.028);
      const jolt = Math.sin(now * 0.09) * 0.7;
      this.sprite.setOrigin(0.5, 1);
      this.sprite.x = this.twitchDir * (kick * 6 + jolt * 3) * strength;
      this.sprite.y = -Math.abs(Math.sin(now * 0.07)) * 5 * strength;
      this.sprite.setRotation(this.twitchDir * (kick * 0.08 + jolt * 0.04) * strength);
    } else {
      this.sprite.setOrigin(0.5, 1);
      this.sprite.x = 0;
      this.sprite.y = 0;
      this.sprite.setRotation(this.coverPeekLean);
    }

    this.setRotation(0);

    const wantTint = this.charred
      ? 0x3a342c
      : this.isBuzzed(now)
        ? now < this.hitFlashUntil
          ? 0xffffff
          : 0x7af0ff
        : now < this.hitFlashUntil
          ? s.bloodied
            ? 0xffaaaa
            : 0xffcccc
          : s.bloodied
            ? 0xffd0d0
            : null;
    if (wantTint !== this.visTint) {
      this.visTint = wantTint;
      if (wantTint === null) this.sprite.clearTint();
      else this.sprite.setTint(wantTint);
    }

    const wantAlpha =
      s.crawling && !s.cuffed
        ? Math.max(0.4, this.sprite.alpha)
        : this.isHidden
          ? this.isPeeking
            ? 0.9
            : 0.7
          : !s.isOut()
            ? 1
            : this.sprite.alpha;
    if (wantAlpha !== this.visAlpha) {
      this.visAlpha = wantAlpha;
      this.sprite.setAlpha(wantAlpha);
    }

    if (this.weapon !== "none") {
      if (!this.visWeaponOn) {
        this.visWeaponOn = true;
        this.weaponSprite.setVisible(true);
        this.weaponSprite.setFlipX(false);
      }
      const hold = this.layoutHeldWeapon(now, pose);
      this.weaponSprite.x = hold.x;
      this.weaponSprite.y = hold.y;
      this.weaponSprite.setAngle(hold.angle);
      if (hold.behind !== this.visWeaponBehind) {
        this.visWeaponBehind = hold.behind;
        if (hold.behind) this.moveTo(this.weaponSprite, 0);
        else this.bringToTop(this.weaponSprite);
      }
    } else if (this.visWeaponOn) {
      this.visWeaponOn = false;
      this.visWeaponBehind = null;
      this.weaponSprite.setVisible(false);
    }

    if (this.skateSprite) {
      if (this.skating) {
        this.skateSprite.setVisible(true);
        this.skateSprite.setFlipX(this.facing < 0);
        const spin =
          this.action === "kickflip"
            ? ((1 - (this.actionUntil - now) / KICKFLIP_MS) * 360 * this.facing) % 360
            : 0;
        if (spin !== 0) {
          this.skateSprite.setAngle(spin);
          this.skateSprite.setOrigin(0.5, 1);
          this.skateSprite.x = 0;
        } else if (this.boardManual) {
          // Pivot on the rear trucks so the nose floats cleanly
          this.skateSprite.setOrigin(this.facing > 0 ? 0.3 : 0.7, 1);
          this.skateSprite.setAngle(this.facing * -28);
          this.skateSprite.x = this.facing * -10;
        } else {
          this.skateSprite.setOrigin(0.5, 1);
          this.skateSprite.setAngle(0);
          // Stationary plant: board sits under the rear foot, ahead of the pavement foot
          this.skateSprite.x = this.boardRolling ? 0 : this.facing * -6;
        }
        // Deck under the soles when cruising; rise with tucked feet in the air
        this.skateSprite.y =
          this.action === "kickflip"
            ? -4
            : this.airborne || this.action === "ollie"
              ? -1
              : this.boardManual
                ? 6
                : this.boardRolling
                  ? 10
                  : 8;
        // Wheel spin only while rolling — planted board stays on one frame
        if (spin === 0 && this.boardRolling) {
          const wheelKey =
            Math.floor(this.walkPhase * 2) % 2 === 0 ? "mount_skate" : "mount_skate_1";
          if (
            this.scene.textures.exists(wheelKey) &&
            this.skateSprite.texture.key !== wheelKey
          ) {
            this.skateSprite.setTexture(wheelKey);
          }
        } else if (
          spin === 0 &&
          this.scene.textures.exists("mount_skate") &&
          this.skateSprite.texture.key !== "mount_skate"
        ) {
          this.skateSprite.setTexture("mount_skate");
        }
        this.sendToBack(this.skateSprite);
      } else {
        this.skateSprite.setVisible(false);
      }
    }
  }

  private walkFrame(prefix: "walk" | "run" | "block"): PoseKey {
    const i = Math.floor(this.walkPhase * 4) % 4;
    return `${prefix}${i}` as PoseKey;
  }

  /** Wind-up → hit → follow-through for jab / hook / upper. */
  private punchFrame(
    now: number,
    durationMs: number,
    kind: "jab" | "punch" | "upper",
  ): PoseKey {
    const progress = 1 - (this.actionUntil - now) / durationMs;
    const frame = progress < 0.28 ? 0 : progress < 0.62 ? 1 : 2;
    return `${kind}${frame}` as PoseKey;
  }

  /** Chamber → snap → retract for standing kicks. */
  private kickFrame(now: number, durationMs: number): PoseKey {
    const progress = 1 - (this.actionUntil - now) / durationMs;
    // Short load, hold the snap, quick retract
    const frame = progress < 0.2 ? 0 : progress < 0.62 ? 1 : 2;
    return `kick${frame}` as PoseKey;
  }

  /** Rise / apex / fall from vertical velocity while airborne. */
  private jumpAirFrame(): PoseKey {
    if (this.jumpVy < -90) return "jump0";
    if (this.jumpVy > 70) return "jump2";
    return "jump1";
  }

  /** Glance → whip behind → recover for the back attack. */
  private backhandFrame(now: number, durationMs: number): PoseKey {
    const progress = 1 - (this.actionUntil - now) / durationMs;
    const frame = progress < 0.26 ? 0 : progress < 0.6 ? 1 : 2;
    return `backhand${frame}` as PoseKey;
  }

  /** Cock → contact → follow-through for bat / melee weapon swings. */
  private weaponSwingFrame(now: number, durationMs: number): PoseKey {
    const progress = 1 - (this.actionUntil - now) / durationMs;
    const frame = progress < 0.3 ? 0 : progress < 0.55 ? 1 : 2;
    return `weapon_swing${frame}` as PoseKey;
  }

  /** Walk / run / pedal cadence for walkPhase. */
  protected gaitAnimRate(): number {
    if (this.skating) return 4.2;
    if (this.running) return 3.6;
    if (this.action === "block") return 1.8;
    return 2.6;
  }

  protected poseForState(now: number): PoseKey {
    const s = this.structure;
    // Mid throw arc — flail poses from the shared throw sheet
    if (this.isInThrowArc && this.thrower) {
      const style = this.thrower.activeTossStyle;
      const progress = 1 - (this.thrower.actionUntil - now) / tossDuration(style);
      return sampleToss(style, progress).victim;
    }
    // Mid-toss missile — keep limbs thrashing
    if (this.isBeingTossed) {
      const duration = Math.max(1, this.tossUntil - this.tossStartedAt);
      const t = (now - this.tossStartedAt) / duration;
      if (t < 0.25) return "kick0";
      if (t < 0.5) return "limp_arm";
      if (t < 0.75) return "jump0";
      return "hurt";
    }
    // Standing clinch — never show the floor pose while someone has hold of you
    if (this.heldBy) return "hurt";
    if (s.cuffed) return "cuffed";
    if (this.isCrawlingAway) return this.crawlPhase < 0.5 ? "crawl0" : "crawl1";
    if (s.outCold || s.crawling) return "down";
    if (s.downed && now < s.groundedUntil) return "stunned";
    // Empty-grab recover beats cover crouch so the miss still reads
    if (now < this.grabWhiffUntil) {
      return now < this.grabWhiffUntil - 180 ? "limp_arm" : "hurt";
    }
    if (this.isHidden) return "crouch";
    if (this.action === "swanton") {
      const progress = 1 - (this.actionUntil - now) / 980;
      if (progress < 0.18) return "jump0";
      if (progress < 0.38) return "jump1";
      if (this.airborne || progress < 0.78) return "jump_kick";
      return "stomp";
    }
    if (this.action === "jump_kick") return "jump_kick";
    if (this.action === "backflip") {
      const progress = 1 - (this.actionUntil - now) / 720;
      if (progress < 0.3) return "jump0";
      if (progress < 0.65) return "kick1";
      return "jump1";
    }
    if (this.action === "kickflip") return "kickflip";
    if (this.action === "ollie") return "ollie";
    if (this.skating && this.airborne) return "ollie";
    if (this.skating && this.boardManual && !this.airborne) return "manual";
    if (this.action === "stomp") {
      const progress = 1 - (this.actionUntil - now) / 520;
      return progress < 0.42 ? "stomp_up" : "stomp";
    }
    if (this.action === "whirl" || this.action === "slide") return "kick1";
    if (this.action === "body_toss" || this.action === "hurricanrana") {
      const progress = 1 - (this.actionUntil - now) / tossDuration(this.tossStyle);
      return sampleToss(this.tossStyle, progress).hero;
    }
    if (this.action === "weapon_swing") return this.weaponSwingFrame(now, 480);
    if (this.action === "throw") return "weapon_swing1";
    if (this.action === "headbutt") return "headbutt";
    if (this.action === "backhand") return this.backhandFrame(now, 380);
    if (this.action === "jab") return this.punchFrame(now, 280, "jab");
    if (this.action === "upper") return this.punchFrame(now, 440, "upper");
    if (this.action === "block") {
      if (this.guardStepping) return this.walkFrame("block");
      return "block";
    }
    if (this.action === "call") return "phone"; // handset to the ear
    if (this.action === "hook" || this.action === "punch") {
      return this.punchFrame(now, this.action === "punch" ? 320 : 360, "punch");
    }
    if (this.action === "grab") {
      return this.grabFrame(now, this.grabMs);
    }
    if (this.action === "hold" || this.action === "cuff") {
      return "punch";
    }
    if (this.action === "kick" || this.action === "low_blow") {
      return this.kickFrame(now, 400);
    }
    if (this.action === "taser") return "punch";
    if (this.action === "climb") {
      const prog = (now - this.climbStartAt) / this.climbMs;
      return prog < 0.35 ? "crouch" : "jump0";
    }
    if (this.action === "jump" || this.airborne) return this.jumpAirFrame();
    if (this.action === "hitstun") {
      return now < this.headSnapUntil ? "hurt_head" : "hurt";
    }
    if (this.action === "film") return "film";
    if (this.action === "loot") return "crouch";
    // Cruise on the deck — push cycle only while rolling
    if (this.skating) {
      if (this.boardRolling) {
        const frame = Math.floor(this.walkPhase * 2) % 2;
        return frame === 0 ? "skate0" : "skate1";
      }
      return "skate0";
    }
    // Keep the walk/run cycle going while moving — lingering pain flash used to
    // freeze you on a hurt frame even though you were shifting.
    if (this.running || this.action === "run") return this.walkFrame("run");
    if (this.action === "move") return this.walkFrame("walk");
    if (now < this.painPoseUntil || now < this.hitFlashUntil) {
      if (now < this.headSnapUntil) return "hurt_head";
      const focus = s.painFocus();
      if (focus === "leg") return "limp_leg";
      if (focus === "arm") return "limp_arm";
      if (focus === "gut" || focus === "face") return "hold_gut";
      return "hurt";
    }
    if (s.painFocus() === "leg") return "limp_leg";
    if (s.painFocus() === "arm") return "limp_arm";
    if (s.painFocus() === "gut") return "hold_gut";
    if (s.bloodied) return "bloodied";
    if (s.faceAnger() !== "calm") return "angry";
    return "idle";
  }

  strikeWindow(now: number): {
    kind: StrikeInput["kind"];
    power: number;
    critical: boolean;
    dirty: boolean;
    bodyPart: StrikeInput["bodyPart"];
  } | null {
    const elapsed = this.actionUntil - now;
    const totals: Partial<Record<FighterAction, number>> = {
      jab: 280,
      hook: 360,
      punch: 320,
      upper: 440,
      backhand: 380,
      headbutt: 340,
      kick: 400,
      stomp: 520,
      jump_kick: 380,
      backflip: 720,
      swanton: 980,
      weapon_swing: 480,
      low_blow: 400,
      taser: 400,
      whirl: 480,
      slide: 420,
    };
    const total = totals[this.action];
    if (!total) return null;
    const progress = 1 - elapsed / total;
    // Longer active frames on crowd moves so groups get clipped
    const lo =
      this.action === "whirl" ||
      this.action === "slide" ||
      this.action === "jump_kick" ||
      this.action === "backflip" ||
      this.action === "swanton"
        ? this.action === "swanton"
          ? 0.48
          : this.action === "backflip"
            ? 0.22
            : 0.12
        : this.action === "stomp"
          ? 0.42
          : this.action === "jab"
            ? 0.18
            : this.action === "backhand"
              ? 0.18
              : this.action === "upper"
                ? 0.35
                : this.action === "weapon_swing"
                  ? this.rushStrike
                    ? 0.22
                    : 0.32
                  : 0.22;
    const hi =
      this.action === "whirl" ||
      this.action === "slide" ||
      this.action === "jump_kick" ||
      this.action === "backflip" ||
      this.action === "swanton"
        ? this.action === "backflip"
          ? 0.78
          : 0.92
        : this.action === "stomp"
          ? 0.92
          : this.action === "jab"
            ? 0.62
            : this.action === "backhand"
              ? 0.85
              : this.action === "upper"
                ? 0.82
                : this.action === "weapon_swing"
                  ? this.rushStrike
                    ? 0.72
                    : 0.58
                  : 0.78;
    if (progress < lo || progress > hi) return null;

    if (this.action === "jab") {
      return { kind: "jab", power: 0.38, critical: false, dirty: false, bodyPart: "face" };
    }
    if (this.action === "hook" || this.action === "punch") {
      return { kind: "hook", power: 0.62, critical: false, dirty: false, bodyPart: "body" };
    }
    if (this.action === "upper") {
      return { kind: "chin_shot", power: 0.88, critical: true, dirty: false, bodyPart: "head" };
    }
    if (this.action === "backhand") {
      return { kind: "backhand", power: 0.6, critical: false, dirty: false, bodyPart: "face" };
    }
    if (this.action === "headbutt") {
      return { kind: "headbutt", power: 0.8, critical: true, dirty: false, bodyPart: "head" };
    }
    if (this.action === "kick") {
      return { kind: "kick", power: 0.7, critical: false, dirty: false, bodyPart: "leg" };
    }
    if (this.action === "stomp") {
      return { kind: "boot_head", power: 0.9, critical: true, dirty: false, bodyPart: "head" };
    }
    if (this.action === "whirl") {
      return { kind: "kick", power: 0.75, critical: true, dirty: false, bodyPart: "leg" };
    }
    if (this.action === "slide") {
      return { kind: "kick", power: 0.7, critical: false, dirty: false, bodyPart: "leg" };
    }
    if (this.action === "jump_kick") {
      return { kind: "jump_kick", power: 0.85, critical: true, dirty: false, bodyPart: "leg" };
    }
    if (this.action === "backflip") {
      return {
        kind: "jump_kick",
        power: 0.82,
        critical: true,
        dirty: false,
        bodyPart: "leg",
      };
    }
    if (this.action === "swanton") {
      // Only while diving — rising frames are the backflip wind-up
      if (this.jumpVy < 0 && progress < 0.55) return null;
      // Aimed at a floored body — put the boots in
      if (this.diveAimX !== null) {
        return {
          kind: "boot_head",
          power: 1.1,
          critical: true,
          dirty: false,
          bodyPart: "head",
        };
      }
      return {
        kind: "jump_kick",
        power: 1.05,
        critical: true,
        dirty: false,
        bodyPart: "body",
      };
    }
    if (this.action === "weapon_swing") {
      let power =
        this.weapon === "knuckle"
          ? 0.95
          : this.weapon === "chain"
            ? 0.9
            : this.weapon === "cue"
              ? 0.86
              : this.weapon === "bat"
                ? 0.85
                : this.weapon === "brick"
                  ? 0.75
                  : 0.7;
      if (this.rushStrike) power = Math.min(1.12, power + 0.18);
      return {
        kind: "weapon_swing",
        power,
        critical: this.rushStrike && power >= 0.95,
        dirty: false,
        bodyPart: "arm",
      };
    }
    if (this.action === "low_blow") {
      return { kind: "low_blow", power: 0.5, critical: false, dirty: true, bodyPart: "low" };
    }
    if (this.action === "taser") {
      return { kind: "taser", power: 0.5, critical: false, dirty: false, bodyPart: "body" };
    }
    return null;
  }

  isGrabActive(now: number): boolean {
    if (this.action !== "grab") return false;
    const progress = 1 - (this.actionUntil - now) / this.grabMs;
    // Early window so a rushing Hardman can still step into the scoop
    return progress >= 0.04 && progress <= 0.62;
  }

  /** Reach → clinch attempt → empty-handed recover if nobody was there. */
  private grabFrame(now: number, durationMs: number): PoseKey {
    const progress = 1 - (this.actionUntil - now) / durationMs;
    if (progress < 0.18) return "upper0";
    if (progress < 0.48) return "upper1";
    if (this.heldTarget) return "punch";
    // Empty: hold the grasping / sheepish poses longer so the miss reads
    if (progress < 0.62) return "punch2";
    if (progress < 0.82) return "limp_arm";
    return "hurt";
  }

  /** Fire “thin air!” once the reach has fully extended. */
  private tickGrabMissFx(now: number): void {
    if (!this.grabMissFxArmed || this.heldTarget) return;
    if (this.action !== "grab") return;
    const progress = 1 - (this.actionUntil - now) / this.grabMs;
    if (progress < 0.5) return;
    this.grabMissFxArmed = false;
    this.pendingGrabWhiffFx = true;
  }

  /** One-shot: grab caught thin air — scene shows float then clears. */
  consumeGrabWhiffFx(): boolean {
    if (!this.pendingGrabWhiffFx) return false;
    this.pendingGrabWhiffFx = false;
    return true;
  }

  isCuffActive(now: number): boolean {
    if (this.action !== "cuff") return false;
    const progress = 1 - (this.actionUntil - now) / 500;
    return progress >= 0.4 && progress <= 0.8;
  }

  clearActionIfDue(now: number): void {
    if (this.structure.isOut()) {
      this.abortBodyToss(now);
      this.releaseHeldTarget();
      this.action = this.structure.cuffed
        ? "cuffed"
        : this.structure.outCold
          ? "out_cold"
          : "crawl";
      return;
    }
    if (now >= this.actionUntil && this.busy) {
      if (this.action === "grab" && !this.heldTarget) {
        this.grabWhiffUntil = now + 560;
        // Empty grabs announce mid-reach; near-misses announce here
        if (!this.grabLookedEmpty || this.grabMissFxArmed) {
          this.pendingGrabWhiffFx = true;
        }
        this.grabMissFxArmed = false;
        this.onWhiff(now);
      }
      if (this.action === "body_toss" || this.action === "hurricanrana") {
        if (this.tossVictim && !this.tossLaunchDone) this.releaseTossVictim(now);
        this.tossVictim = null;
        this.diveAimX = null;
      }
      this.rushStrike = false;
      this.releaseHeldTarget();
      if (this.structure.downed && now < this.structure.groundedUntil) {
        this.action = "down";
        this.actionUntil = this.structure.groundedUntil;
      } else {
        this.action = "idle";
      }
    }
  }

  /**
   * Soft-downs first, then action timers. Order matters — clearing the action
   * while still marked downed used to leave lads planted forever.
   */
  protected tickKnockdown(now: number): void {
    // Glued / airborne from a toss — don't stand them out of hitstun mid-flip
    if (this.isInThrowArc || this.isBeingTossed) return;
    // Absolute ceiling on soft downs — even if something keeps them open
    if (
      this.structure.downed &&
      !this.structure.isOut() &&
      Number.isFinite(this.structure.groundedUntil) &&
      now > this.structure.groundedUntil + 400
    ) {
      this.structure.downed = false;
      this.structure.groundedUntil = 0;
      if (this.structure.openUntil > now) this.structure.openUntil = now;
    }
    const stood = this.structure.recoverFloor(now);
    // Failsafe if downed flag drifted past a finite timer
    if (
      this.structure.downed &&
      !this.structure.isOut() &&
      Number.isFinite(this.structure.groundedUntil) &&
      now >= this.structure.groundedUntil
    ) {
      this.structure.downed = false;
      this.structure.groundedUntil = 0;
    }
    if (stood || (!this.structure.downed && !this.structure.isOut())) {
      if (
        this.action === "down" ||
        this.action === "hitstun" ||
        this.action === "crawl"
      ) {
        // Soft-down ended — never leave them in crawl/down after a finite plant
        if (!this.structure.crawling && !this.structure.outCold) {
          this.action = "idle";
          this.actionUntil = now;
          this.clearPlantLock();
          this.grantGetUpGrace(now);
        }
      }
    }
    // Don't re-assert "down" from a stale action timer after we just stood
    if (!this.structure.downed && !this.structure.isOut() && this.action === "down") {
      this.action = "idle";
      this.actionUntil = now;
      this.clearPlantLock();
    }
    this.clearActionIfDue(now);
  }

  private abortBodyToss(now: number): void {
    if (this.tossVictim) {
      this.tossVictim.thrower = null;
      if (!this.tossLaunchDone) this.releaseTossVictim(now);
      this.tossVictim = null;
    }
    if (this.thrower) {
      if (this.thrower.tossVictim === this) this.thrower.tossVictim = null;
      this.thrower = null;
    }
  }

  private releaseHeldTarget(): void {
    if (!this.heldTarget) return;
    const v = this.heldTarget;
    v.heldBy = null;
    if (v.structure.isOut()) {
      v.markPlantHere();
    } else {
      // Let go without dumping them — brief stun, then free
      v.structure.downed = false;
      v.structure.groundedUntil = 0;
      v.clearPlantLock();
      v.airborne = false;
      v.jumpVy = 0;
      v.endToss();
      if (v.action === "down" || v.action === "hitstun") {
        v.action = "hitstun";
        v.actionUntil = Math.max(v.actionUntil, this.scene.time.now + 280);
      }
    }
    this.heldTarget = null;
    this.holdFromBehind = false;
  }
}

export function sameLane(a: Fighter, b: Fighter, tolerance = 42): boolean {
  return Math.abs(a.laneY - b.laneY) <= tolerance;
}

export function inReach(
  attacker: Fighter,
  target: Fighter,
  reach = attacker.attackReach,
  dir = attacker.attackDir,
): boolean {
  // Whirl / stomp / omni — anyone in the circle
  if (attacker.omniStrike) {
    const d = Math.hypot(target.x - attacker.x, target.laneY - attacker.laneY);
    const pad = attacker.action === "stomp" || attacker.action === "swanton" ? 28 : 12;
    return d < reach + pad;
  }
  const laneTol =
    attacker.action === "slide" ||
    attacker.action === "jump_kick" ||
    attacker.action === "backflip" ||
    attacker.action === "swanton"
      ? 56
      : attacker.action === "stomp"
        ? 58
        : 42;
  const dx = (target.x - attacker.x) * dir;
  // Slide forgives more behind so the rush clips a packed line
  const behind =
    attacker.action === "slide"
      ? -28
      : attacker.action === "stomp"
        ? -28
        : attacker.action === "backhand"
          ? -20
          : attacker.action === "backflip"
            ? -24
            : -12;
  // Hardmen are drawn larger; grab reach has to cover the extra sprite
  const grabPad =
    attacker.action === "grab" ? Math.max(0, target.figureScaleX - 1) * 48 : 0;
  return dx > behind && dx < reach + 18 + grabPad && sameLane(attacker, target, laneTol);
}
