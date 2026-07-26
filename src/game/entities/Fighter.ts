import Phaser from "phaser";
import { Structure, type StrikeInput, type StrikeResult } from "../combat/Structure";

export type Team = "player" | "enemy" | "civilian" | "police";

export type FighterAction =
  | "idle"
  | "move"
  | "run"
  | "jump"
  | "jump_kick"
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
  | "block"
  | "call";

export type SpritePrefix = string;

export interface FighterOptions {
  toughness?: number;
  loot?: Structure["loot"];
  /** Texture look id from pompeyLooks (e.g. look_c03). */
  lookId?: string;
  scaleX?: number;
  scaleY?: number;
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
  | "jump_kick"
  | "punch"
  | "jab"
  | "upper"
  | "backhand"
  | "headbutt"
  | "kick"
  | "stomp_up"
  | "stomp"
  | "weapon_swing"
  | "hurt"
  | "hold_gut"
  | "limp_arm"
  | "limp_leg"
  | "down"
  | "angry"
  | "cuffed"
  | "bloodied"
  | "film"
  | "block";

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
  speed = 160;
  runSpeed = 280;
  running = false;
  airborne = false;
  jumpVy = 0;
  groundY = 0;
  /** When standing on a car bonnet/roof — visual Y for landing. */
  platformY: number | null = null;
  /** Crawl direction when KO'd into crawl-away. */
  crawlDir: 1 | -1 = 1;
  /** Batman-style: flying body after a toss — damages others on impact. */
  tossVx = 0;
  tossUntil = 0;
  /** Grabbed victim for body toss. */
  heldTarget: Fighter | null = null;
  /** Who's clinching this fighter (skip floor pin while dragged). */
  heldBy: Fighter | null = null;
  /** Floored / KO lock — stop anything from skating the body along the lane. */
  private plantLock = false;
  private plantX = 0;
  private plantY = 0;
  money = 0;
  weapon: Structure["loot"]["weapon"] = "none";
  /** Hits remaining before the weapon breaks / drops */
  weaponDurability = 0;

  readonly sprite: Phaser.GameObjects.Image;
  readonly weaponSprite: Phaser.GameObjects.Image;
  readonly label?: Phaser.GameObjects.Text;

  private hitFlashUntil = 0;
  private painPoseUntil = 0;
  /** Walk/run cycle 0..1 */
  private walkPhase = Math.random();
  /** Don't flip facing every frame when bodies shove past each other */
  private facingLockUntil = 0;
  private readonly facingLockMs = 160;
  /** Prevent multi-hit on same swing */
  private hitLock = new Set<Fighter>();
  /** Ensures one projectile per throw action */
  private throwReleased = false;

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
    this.groundY = y;
    this.structure = new Structure({
      toughness: opts.toughness ?? (team === "player" ? 2.2 : 1),
      loot: opts.loot,
    });

    this.sprite = scene.add.image(0, 0, `${spritePrefix}_idle`).setOrigin(0.5, 1);
    if (opts.scaleX || opts.scaleY) {
      this.sprite.setScale(opts.scaleX ?? 1, opts.scaleY ?? 1);
    }
    this.weaponSprite = scene.add
      .image(18, -28, "weapon_bottle")
      .setOrigin(0.5, 1)
      .setVisible(false)
      .setScale(0.85);
    this.add([this.sprite, this.weaponSprite]);

    if (name) {
      this.label = scene.add
        .text(0, 0, name, {
          fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
          fontSize: "12px",
          color: "#1a1410",
          backgroundColor: "#f2e6d8",
          padding: { x: 4, y: 1 },
        })
        .setOrigin(0.5, 1);
      this.add(this.label);
      this.placeNameLabel("idle");
    }

    scene.add.existing(this);
    this.setSize(48, 72);
  }

  get laneY(): number {
    if (this.airborne) return this.groundY;
    if (this.platformY !== null) return this.groundY;
    return this.y;
  }

  get attackReach(): number {
    if (this.action === "whirl") return 72;
    if (this.action === "slide") return 78;
    if (this.action === "weapon_swing") return 70;
    if (this.action === "jump_kick") return 70;
    if (this.action === "headbutt") return 56;
    if (this.action === "backhand") return 52;
    if (this.action === "kick") return 58;
    if (this.action === "jab") return 44;
    if (this.action === "hook" || this.action === "punch") return 52;
    if (this.action === "upper") return 48;
    return 52;
  }

  /** Hits everyone in a circle — whirl / crowd clearers. */
  get omniStrike(): boolean {
    return this.action === "whirl";
  }

  get busy(): boolean {
    return (
      this.action !== "idle" &&
      this.action !== "move" &&
      this.action !== "run" &&
      this.action !== "jump"
    );
  }

  /** Temporary downs, KO, cuffs — stay put. Crawl-away and clinch still move. */
  get planted(): boolean {
    if (this.heldBy) return false;
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
    if (!this.planted) {
      this.plantLock = false;
      return;
    }
    if (this.airborne) return;
    if (!this.plantLock) {
      this.plantLock = true;
      this.plantX = this.x;
      this.plantY = this.y;
      this.tossVx = 0;
      this.tossUntil = 0;
      return;
    }
    this.x = this.plantX;
    this.y = this.plantY;
    this.groundY = this.plantY;
    this.tossVx = 0;
    this.tossUntil = 0;
  }

  /** Call after intentional knockdown shove so the plant sticks where they landed. */
  markPlantHere(): void {
    if (this.airborne) return;
    this.plantLock = true;
    this.plantX = this.x;
    this.plantY = this.y;
    this.groundY = this.y;
    this.tossVx = 0;
    this.tossUntil = 0;
  }

  clearPlantLock(): void {
    this.plantLock = false;
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
  }

  faceToward(x: number, now = 0): void {
    const dx = x - this.x;
    // Deadzone so overlapping / separation push doesn't flicker
    if (Math.abs(dx) < 16) return;
    this.setFacing(dx > 0 ? 1 : -1, now);
  }

  /** Change facing with a short lock so left/right don't strobe. */
  setFacing(dir: number, now = 0): void {
    const next = dir >= 0 ? 1 : -1;
    if (next === this.facing) return;
    if (now > 0 && now < this.facingLockUntil) return;
    this.facing = next;
    if (now > 0) this.facingLockUntil = now + this.facingLockMs;
  }

  tryPunch(now: number, running = false): boolean {
    if (this.airborne) return this.tryJumpKick(now);
    if (!this.canAct(now)) return false;
    if (running || this.running) {
      // Headbutt doesn't need working arms
      this.setAction("headbutt", now, 340);
      return true;
    }
    if (!this.structure.armsUsable()) return false;
    // Bottles & bricks throw; bat still swings
    if (this.weapon === "bottle" || this.weapon === "brick") {
      return this.tryThrow(now);
    }
    if (this.weapon !== "none") {
      this.setAction("weapon_swing", now, 340);
      return true;
    }
    // Generic scrap punch (enemies) — solid hook
    this.setAction("hook", now, 300);
    return true;
  }

  /** Jab — snappy, short reach. */
  tryJab(now: number): boolean {
    if (this.airborne) return this.tryJumpKick(now);
    if (!this.canAct(now)) return false;
    if (!this.structure.armsUsable()) return false;
    if (this.weapon === "bottle" || this.weapon === "brick") return this.tryThrow(now);
    if (this.weapon !== "none") {
      this.setAction("weapon_swing", now, 340);
      return true;
    }
    this.setAction("jab", now, 200);
    return true;
  }

  /** Hook — body blow, mid reach. */
  tryHook(now: number): boolean {
    if (this.airborne) return this.tryJumpKick(now);
    if (!this.canAct(now)) return false;
    if (!this.structure.armsUsable()) return false;
    if (this.weapon === "bottle" || this.weapon === "brick") return this.tryThrow(now);
    if (this.weapon !== "none") {
      this.setAction("weapon_swing", now, 340);
      return true;
    }
    this.setAction("hook", now, 300);
    return true;
  }

  /** Uppercut finisher — lifts the chin. */
  tryUpper(now: number): boolean {
    if (this.airborne) return this.tryJumpKick(now);
    if (!this.canAct(now)) return false;
    if (!this.structure.armsUsable()) return false;
    if (this.weapon === "bottle" || this.weapon === "brick") return this.tryThrow(now);
    if (this.weapon !== "none") {
      this.setAction("weapon_swing", now, 340);
      return true;
    }
    this.setAction("upper", now, 380);
    return true;
  }

  /** Start a throw wind-up. Scene consumes the weapon when the projectile spawns. */
  tryThrow(now: number): boolean {
    if (!this.canAct(now)) return false;
    if (this.weapon !== "bottle" && this.weapon !== "brick") return false;
    if (!this.structure.armsUsable()) return false;
    this.setAction("throw", now, 280);
    return true;
  }

  /** True once per throw in the release window. */
  takeThrowRelease(now: number): boolean {
    if (this.action !== "throw") return false;
    if (this.throwReleased) return false;
    const progress = 1 - (this.actionUntil - now) / 280;
    if (progress < 0.4 || progress > 0.55) return false;
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
    this.setAction("kick", now, 360);
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
  }

  /** Spinning roundhouse — hits everyone around you (Batman Returns crowd clear). */
  tryWhirl(now: number): boolean {
    if (this.airborne) return false;
    if (!this.canAct(now)) return false;
    if (!this.structure.legsUsable()) return false;
    this.setAction("whirl", now, 480);
    return true;
  }

  /** Running slide through a line of lads. */
  trySlide(now: number): boolean {
    if (this.airborne) return false;
    if (!this.canAct(now)) return false;
    if (!this.structure.legsUsable()) return false;
    this.setAction("slide", now, 420);
    return true;
  }

  /** Hurl the grabbed body — they become a missile into the rest. */
  tryBodyToss(now: number): boolean {
    if (!this.heldTarget || this.heldTarget.structure.isOut()) {
      this.heldTarget = null;
      return false;
    }
    if (this.action !== "hold" && this.action !== "grab") return false;
    const victim = this.heldTarget;
    this.heldTarget = null;
    victim.heldBy = null;
    this.setAction("body_toss", now, 280);
    victim.clearPlantLock();
    victim.tossVx = this.facing * 520;
    victim.tossUntil = now + 520;
    victim.x += this.facing * 28;
    victim.hitLock.clear();
    victim.receiveStrike({
      kind: "hook",
      power: 0.65,
      critical: false,
      dirty: false,
      onOpening: true,
      now,
      bodyPart: "body",
      knockDir: this.facing,
    });
    // Brief airtime so the body flies through a packed lane
    victim.airborne = true;
    victim.jumpVy = -160;
    victim.groundY = victim.y;
    victim.platformY = null;
    victim.invulnUntil = now + 80;
    return true;
  }

  /** Fly a tossed body along X while airborne / toss window lasts. */
  applyTossFlight(now: number, dt: number, minX: number, maxX: number): void {
    if (this.tossVx === 0) return;
    if (now >= this.tossUntil || !this.airborne) {
      this.tossVx = 0;
      this.tossUntil = 0;
      return;
    }
    this.x += this.tossVx * dt;
    this.x = Phaser.Math.Clamp(this.x, minX, maxX);
  }

  tryJumpKick(now: number): boolean {
    if (!this.airborne) return false;
    if (this.structure.isOut()) return false;
    if (!this.structure.legsUsable()) return false;
    if (this.action === "jump_kick") return false;
    this.setAction("jump_kick", now, 380);
    // Dive a bit forward
    this.jumpVy = Math.min(this.jumpVy, -80);
    return true;
  }

  equipWeapon(kind: Exclude<Structure["loot"]["weapon"], "none">): void {
    this.weapon = kind;
    this.weaponDurability = kind === "bat" ? 8 : kind === "brick" ? 4 : 5;
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
    this.weaponSprite.setVisible(true);
  }

  tryBackAttack(now: number): boolean {
    if (!this.canAct(now)) return false;
    if (!this.structure.armsUsable()) return false;
    this.setAction("backhand", now, 300);
    this.attackDir = -this.facing;
    return true;
  }

  tryLowBlow(now: number): boolean {
    if (!this.canAct(now)) return false;
    if (!this.structure.armsUsable() && !this.structure.legsUsable()) return false;
    this.setAction("low_blow", now, 400);
    return true;
  }

  tryGrab(now: number): boolean {
    if (!this.canAct(now)) return false;
    if (!this.structure.armsUsable()) return false;
    this.setAction("grab", now, 320);
    return true;
  }

  /** After a successful grab — clinch so you can toss them. */
  startHoldOn(target: Fighter, now: number): void {
    this.heldTarget = target;
    target.heldBy = this;
    target.clearPlantLock();
    this.setAction("hold", now, 900);
  }

  tryJump(now: number): boolean {
    if (this.structure.isOut()) return false;
    if (this.airborne) return false;
    if (!this.structure.legsUsable()) return false;
    if (this.structure.downed && now < this.structure.groundedUntil) return false;
    if (this.structure.isDisabled(now)) return false;
    if (this.busy && this.action !== "jump") return false;

    this.airborne = true;
    // Jump from current surface (pavement or car)
    if (this.platformY === null) this.groundY = this.y;
    const jumpScale = 0.85 + 0.15 * this.structure.moveSpeedFactor();
    this.jumpVy = -340 * jumpScale;
    this.action = "jump";
    this.actionUntil = now + 520;
    this.hitLock.clear();
    this.attackDir = this.facing;
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
      // Landed — stop skating along the ground from a toss
      this.tossVx = 0;
      this.tossUntil = 0;
      if (this.action === "jump") this.action = "idle";
    } else {
      this.y = Math.min(this.y, floor);
      this.y = Math.max(this.y, laneMin - 80);
    }
  }

  receiveStrike(hit: StrikeInput): StrikeResult {
    if (hit.now < this.invulnUntil) return "blocked";
    const wasFloored = this.structure.downed || this.structure.isOut();
    const result = this.structure.applyStrike({
      ...hit,
      activeBlock: hit.activeBlock ?? this.isBlocking,
    });
    this.hitFlashUntil = hit.now + 180;
    this.painPoseUntil = hit.now + 900;

    if (result === "blocked" && this.isBlocking) {
      // Keep the guard pose up so the block reads clearly
      this.actionUntil = Math.max(this.actionUntil, hit.now + 280);
      this.hitFlashUntil = hit.now + 90;
      this.painPoseUntil = 0;
    }

    // Getting clipped mid-call drops the phone
    if (this.action === "call" && result !== "blocked") {
      this.action = "hitstun";
      this.actionUntil = hit.now + 280;
    }

    // Floored bodies stay planted — no skate from stomps / pile-ons
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
    }
    // Knock off car platforms
    if (result !== "blocked" && this.platformY !== null) {
      this.platformY = null;
      this.airborne = false;
      this.jumpVy = 0;
      this.y = this.groundY;
    }

    if (result === "out_cold") {
      this.setAction("out_cold", hit.now, 999999);
      this.markPlantHere();
    } else if (result === "crawl_away") {
      this.setAction("crawl", hit.now, 999999);
      this.crawlDir = Math.random() < 0.5 ? 1 : -1;
      this.plantLock = false;
      this.tossVx = 0;
      this.tossUntil = 0;
    } else if (result === "cuffed") {
      this.setAction("cuffed", hit.now, 999999);
      this.markPlantHere();
    } else if (result === "tased" || result === "stumble" || result === "disabled") {
      this.setAction("hitstun", hit.now, result === "tased" ? 900 : 520);
      if (this.structure.downed) this.markPlantHere();
    } else if (result === "flinch" || result === "winded" || result === "opened") {
      this.setAction("hitstun", hit.now, 280);
    } else if (wasFloored || this.structure.downed) {
      this.markPlantHere();
    }

    this.invulnUntil = hit.now + 120;
    this.refreshVisuals(hit.now, 0);
    return result;
  }

  onWhiff(now: number): void {
    const extra = 280 + this.structure.anger * 220;
    this.structure.createOpening(now, extra);
  }

  takeDown(now: number): void {
    this.structure.putOnFloor(now, 900);
    this.setAction("down", now, 900);
    this.airborne = false;
    this.jumpVy = 0;
    this.tossVx = 0;
    this.tossUntil = 0;
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

  markHit(target: Fighter): boolean {
    if (this.hitLock.has(target)) return false;
    this.hitLock.add(target);
    return true;
  }

  /** Keep the nameplate clear of the body — above the head, or beside when floored. */
  private placeNameLabel(pose: PoseKey): void {
    if (!this.label) return;
    const down =
      pose === "down" ||
      pose === "cuffed" ||
      this.action === "crawl" ||
      this.action === "out_cold";
    if (down) {
      this.label.setOrigin(0, 0.5);
      this.label.x = Math.max(28, this.sprite.displayWidth * 0.45);
      this.label.y = -Math.max(14, this.sprite.displayHeight * 0.35);
    } else {
      this.label.setOrigin(0.5, 1);
      this.label.x = 0;
      this.label.y = -this.sprite.displayHeight - 4;
    }
  }

  refreshVisuals(now: number, dt: number): void {
    const s = this.structure;
    s.recoverFloor(now);
    if (dt > 0) s.decayPain(dt);

    const moving = this.action === "move" || this.action === "run" || this.running;
    if (moving && dt > 0 && !this.structure.isOut() && !this.airborne) {
      const rate = this.running ? 3.2 : 2.0;
      this.walkPhase = (this.walkPhase + dt * rate) % 1;
    }

    const pose = this.poseForState(now);
    const key = `${this.spritePrefix}_${pose}`;
    if (this.scene.textures.exists(key) && this.sprite.texture.key !== key) {
      this.sprite.setTexture(key);
    }

    // Drawn facing right; flip for left — feet stay planted (no vertical bob)
    this.sprite.setFlipX(this.facing < 0);
    this.sprite.setOrigin(0.5, 1);
    this.sprite.y = 0;

    this.setRotation(0);

    if (now < this.hitFlashUntil) {
      this.sprite.setTint(s.bloodied ? 0xffaaaa : 0xffcccc);
    } else if (s.bloodied) {
      this.sprite.setTint(0xffd0d0);
    } else {
      this.sprite.clearTint();
    }

    if (s.crawling && !s.cuffed) {
      this.sprite.setAlpha(Math.max(0.4, this.sprite.alpha));
    } else if (!s.isOut()) {
      this.sprite.setAlpha(1);
    }

    if (this.label) this.placeNameLabel(pose);

    if (this.weapon !== "none") {
      this.weaponSprite.setVisible(true);
      this.weaponSprite.x = this.facing > 0 ? 22 : -22;
      this.weaponSprite.y =
        this.action === "weapon_swing" ? -36 : this.action === "jump_kick" ? -20 : -30;
      this.weaponSprite.setFlipX(this.facing < 0);
      this.weaponSprite.setAngle(this.action === "weapon_swing" ? this.facing * 25 : 0);
    } else {
      this.weaponSprite.setVisible(false);
    }
  }

  private walkFrame(prefix: "walk" | "run"): PoseKey {
    const i = Math.floor(this.walkPhase * 4) % 4;
    return `${prefix}${i}` as PoseKey;
  }

  private poseForState(now: number): PoseKey {
    const s = this.structure;
    if (s.cuffed) return "cuffed";
    if (s.outCold || s.crawling) return "down";
    if (s.downed && now < s.groundedUntil) return "down";
    if (this.action === "jump_kick") return "jump_kick";
    if (this.action === "stomp") {
      const progress = 1 - (this.actionUntil - now) / 520;
      return progress < 0.42 ? "stomp_up" : "stomp";
    }
    if (this.action === "whirl" || this.action === "slide") return "kick";
    if (this.action === "body_toss") return "punch";
    if (this.action === "weapon_swing") return "weapon_swing";
    if (this.action === "throw") return "weapon_swing";
    if (this.action === "headbutt") return "headbutt";
    if (this.action === "backhand") return "backhand";
    if (this.action === "jab") return "jab";
    if (this.action === "upper") return "upper";
    if (this.action === "block") return "block";
    if (this.action === "call") return "film"; // phone up — calling mates
    if (this.action === "hook" || this.action === "punch") return "punch";
    if (this.action === "grab" || this.action === "hold" || this.action === "cuff") {
      return "punch";
    }
    if (this.action === "kick" || this.action === "low_blow") return "kick";
    if (this.action === "taser") return "punch";
    if (this.action === "jump" || this.airborne) return "jump";
    if (this.action === "hitstun" || now < this.hitFlashUntil) return "hurt";
    if (this.action === "film") return "film";
    if (now < this.painPoseUntil) {
      const focus = s.painFocus();
      if (focus === "leg") return "limp_leg";
      if (focus === "arm") return "limp_arm";
      if (focus === "gut" || focus === "face") return "hold_gut";
      return "hurt";
    }
    if (s.painFocus() === "leg") return "limp_leg";
    if (s.painFocus() === "arm") return "limp_arm";
    if (s.painFocus() === "gut") return "hold_gut";
    if (this.running || this.action === "run") return this.walkFrame("run");
    if (this.action === "move") return this.walkFrame("walk");
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
      jab: 200,
      hook: 300,
      punch: 280,
      upper: 380,
      backhand: 300,
      headbutt: 340,
      kick: 360,
      stomp: 520,
      jump_kick: 380,
      weapon_swing: 340,
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
      this.action === "whirl" || this.action === "slide" || this.action === "jump_kick"
        ? 0.12
        : this.action === "stomp"
          ? 0.42
          : this.action === "jab"
            ? 0.18
            : this.action === "upper"
              ? 0.35
              : 0.22;
    const hi =
      this.action === "whirl" || this.action === "slide" || this.action === "jump_kick"
        ? 0.88
        : this.action === "stomp"
          ? 0.92
          : this.action === "jab"
            ? 0.62
            : this.action === "upper"
              ? 0.82
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
    if (this.action === "weapon_swing") {
      const power = this.weapon === "bat" ? 0.85 : this.weapon === "brick" ? 0.75 : 0.7;
      return { kind: "weapon_swing", power, critical: false, dirty: false, bodyPart: "arm" };
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
    const progress = 1 - (this.actionUntil - now) / 320;
    return progress >= 0.3 && progress <= 0.75;
  }

  isCuffActive(now: number): boolean {
    if (this.action !== "cuff") return false;
    const progress = 1 - (this.actionUntil - now) / 500;
    return progress >= 0.4 && progress <= 0.8;
  }

  clearActionIfDue(now: number): void {
    if (this.structure.isOut()) {
      this.releaseHeldTarget();
      this.action = this.structure.cuffed
        ? "cuffed"
        : this.structure.outCold
          ? "out_cold"
          : "crawl";
      return;
    }
    if (now >= this.actionUntil && this.busy) {
      this.releaseHeldTarget();
      if (this.structure.downed && now < this.structure.groundedUntil) {
        this.action = "down";
      } else {
        this.action = "idle";
      }
    }
  }

  private releaseHeldTarget(): void {
    if (!this.heldTarget) return;
    const v = this.heldTarget;
    v.heldBy = null;
    if (v.structure.downed || v.structure.isOut()) v.markPlantHere();
    this.heldTarget = null;
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
  // Whirl / omni — anyone in the circle
  if (attacker.omniStrike) {
    const d = Math.hypot(target.x - attacker.x, target.laneY - attacker.laneY);
    return d < reach + 12;
  }
  const laneTol = attacker.action === "slide" || attacker.action === "jump_kick" ? 56 : 42;
  const dx = (target.x - attacker.x) * dir;
  // Slide forgives more behind so the rush clips a packed line
  const behind = attacker.action === "slide" ? -28 : -12;
  return dx > behind && dx < reach + 18 && sameLane(attacker, target, laneTol);
}
