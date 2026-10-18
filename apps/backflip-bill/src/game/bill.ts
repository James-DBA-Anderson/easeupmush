import { degToRad, HIP_HEIGHT, STANDING_FLIP_MAX_VX, TAU } from "./constants";
import { tuning } from "./tuning";
import {
  approachingSolid,
  BAR_GRAB_EXTEND,
  BAR_RADIUS,
  barReach,
  groundAt,
  obstacleHits,
  onFlagPlatform,
  padDownhill,
  pitchedAt,
  plantAngle,
  platformNormal,
  platformY,
  pushOutOfBar,
  pushOutOfHoop,
  pushOutOfSolid,
  supportAt,
  spawnGround,
  START_WALL_X,
  type HighBar,
  type Level,
  type Platform,
} from "./world";

export type BillState = "ground" | "air" | "stumble" | "slide" | "swing" | "fallen" | "dead" | "done";

export type LandKind = "clean" | "stumble" | "fall" | "slide";

export interface LandEvent {
  kind: LandKind;
  x: number;
  y: number;
  /** Full backflips completed this jump (nearest whole spin). */
  spins: number;
  /** Seconds held at full layout during this flip. */
  layoutHold: number;
  /** Downward speed at contact, m/s. */
  impact: number;
}

export interface HitEvent {
  mag: number;
  hoop: boolean;
  bar?: boolean;
}

export interface SnapEvent {
  x: number;
  y: number;
}

export interface SnapFlash {
  x: number;
  y: number;
  life: number;
  max: number;
}

export interface Board {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  omega: number;
  on: boolean;
  wet: number;
}

const SKATE_CAP = 9.7;
/** Hip-to-deck length while riding — keeps the board under the shoes. */
const BOARD_RIDE = 0.05;
const JUMP_TO_BOARD = 0.4;
const BAR_SWING_MAX = 20;
/** Reach for the rail from well before it is on camera. */
const BAR_REACH_DIST = 12;

/** Sit the torso back from the pitch so a 45° roof isn't a full 45° plant. */
function slideSitRot(want: number): number {
  return want * 0.72;
}

function skateHipFactor(ny: number): number {
  return 1 - 0.16 * Math.min(1, (1 - ny) * 2.2);
}

function slideHip(ny: number, board: boolean): number {
  if (board) return skateHipFactor(ny);
  return Math.max(0.48, ny * 0.88);
}

function skateLeanBack(slope: number): number {
  const steep = Math.min(1, Math.abs(slope) / 0.85);
  return slope * (0.86 - 0.08 * steep);
}

type BandageSpot = "lKnee" | "rKnee" | "lElb" | "rElb";
type SoreSpot = "lHip" | "rHip" | "coccyx" | "back";
type SnapKind = BandageSpot | SoreSpot;

export class Bill {
  x = 0;
  y = HIP_HEIGHT;
  vx = 0;
  vy = 0;
  /** Local backflip rotation, 0 = feet down. Always spins backward. */
  rot = 0;
  facing = 1;
  /** Idle and slow — next stick press may turn him. Reverse at speed stays a backpedal. */
  private canTurn = true;
  state: BillState = "ground";
  runPhase = 0;
  lockTimer = 0;
  /** Seconds a jump press is remembered so a tap just before landing still takes off. */
  private jumpBuf = 0;
  flipTravel = 0;
  flipDuration = tuning.flipDurationSlow;
  /** |vx| at takeoff — standing-flip levels reject a run-up. */
  takeoffSpeed = 0;
  airTime = 0;
  flipping = false;
  /** 0 = layout / straight, 1 = full crouch. Default 0.5. */
  tuck = 0.5;
  /** Seconds spent fully stretched during the current flip. */
  layoutHold = 0;
  /** Knee-bend absorb after a clean, extended landing. */
  cushion = 0;
  /** Leftover flip rate, used to seed a crash ragdoll. */
  spinRate = 0;
  rag: Ragdoll | null = null;
  landEvent: LandEvent | null = null;
  /** Ragdoll / hoop contact this frame — consumed for sfx. */
  hitEvent: HitEvent | null = null;
  /** Just started the post-finish pose. */
  celebrateEvent = false;
  /** Joints that snapped this frame — consumed by the game for sfx + dust. */
  snapEvents: SnapEvent[] = [];
  /** Lingering crack flashes at snapped joints. */
  snapFlashes: SnapFlash[] = [];
  /** Seconds since spawn — joint snap cooldowns key off this, not ragdoll age. */
  time = 0;
  /** A joint may snap at most once per attempt. */
  snappedThisRun = false;
  /** Bandages from snaps on earlier failed attempts. */
  bandages = new Set<BandageSpot>();
  /** Snaps this attempt — applied on the next spawn if the run fails. */
  pendingBandages = new Set<BandageSpot>();
  /** Hip / coccyx / spine snaps — no bandage, just a sore rub at idle. */
  sore = new Set<SoreSpot>();
  pendingSore = new Set<SoreSpot>();
  died = false;
  finished = false;
  /** Crossed the flag this attempt — trying to come to a halt. */
  cleared = false;
  /** Tumbled through the flag — standing up past it does not count. */
  private botchedFinish = false;
  celebrating = false;
  celebrateT = 0;
  /** Player has touched a control this spawn — no more idle stretches. */
  engaged = false;
  /** Crash ragdoll finished — send back to the level spawn. */
  restarted = false;
  /** 0–1 reach toward an incoming wall or floor while falling. */
  brace = 0;
  braceAng = 0;
  braceNx = 0;
  braceNy = 0;
  braceClosing = 0;
  braceLArm = 0;
  braceRArm = 0;
  braceLLeg = 0;
  braceRLeg = 0;
  /** 0–1: square legs and feet for a landing. Pose only — never changes spin. */
  landPrep = 0;
  /** 0–1: arms by the sides and extra layout arch while opening over a gap. */
  gapArmTuck = 0;
  /** 0–1: head-first panic — arms out at the floor. Pose only, does not save the landing. */
  panic = 0;
  /** 0–1: arms reaching for the high bar. Pose only until a hand actually touches. */
  barGrab = 0;
  barGrabAng = 0;
  /** Missed the pad and hit the pit — angry fail, then restart. */
  gapFail = false;
  /** Left a pitched roof — next floor contact is a drop landing, not a crash. */
  slideDrop = false;
  swingAng = 0;
  swingOmega = 0;
  swingTravel = 0;
  barLooped = false;
  barLockT = 0;
  /** After a missed catch — clamp joints, do not snap them past their stops. */
  barProtectT = 0;
  grabEvent = false;
  takeoffEvent = false;
  barHitEvent = false;
  barKickEvent = false;
  barLoopEvent = false;
  board: Board | null = null;
  boardKickEvent = false;
  boardSplashEvent = false;
  splashEvent = false;
  /** 0–1: holding run-forward on the board — extra push. */
  push = 0;
  /** Slope the deck follows while riding. Body lean-back is separate. */
  boardAng = 0;
  /** 0–1: kicking foot off the ground for a push. */
  pushKick = 0;
  private pushT = 0;
  private pushU = 0;
  pushPlantEvent = false;
  /** Debug sim: mouse is carrying him. */
  held = false;

  public spawn(level: Level): void {
    this.x = level.spawnX;
    this.y = spawnGround(level) + HIP_HEIGHT;
    this.vx = 0;
    this.vy = 0;
    this.rot = 0;
    this.facing = 1;
    this.canTurn = true;
    this.state = "ground";
    this.runPhase = 0;
    this.lockTimer = 0;
    this.jumpBuf = 0;
    this.flipTravel = 0;
    this.flipDuration = tuning.flipDurationSlow;
    this.takeoffSpeed = 0;
    this.airTime = 0;
    this.flipping = false;
    this.tuck = 0.5;
    this.layoutHold = 0;
    this.cushion = 0;
    this.spinRate = 0;
    this.rag = null;
    this.landEvent = null;
    this.hitEvent = null;
    this.celebrateEvent = false;
    this.snapEvents = [];
    this.snapFlashes = [];
    this.time = 0;
    this.snappedThisRun = false;
    for (const spot of this.pendingBandages) this.bandages.add(spot);
    this.pendingBandages.clear();
    for (const spot of this.pendingSore) this.sore.add(spot);
    this.pendingSore.clear();
    this.died = false;
    this.finished = false;
    this.cleared = false;
    this.botchedFinish = false;
    this.celebrating = false;
    this.celebrateT = 0;
    this.engaged = false;
    this.restarted = false;
    this.brace = 0;
    this.braceAng = 0;
    this.braceNx = 0;
    this.braceNy = 0;
    this.braceClosing = 0;
    this.braceLArm = 0;
    this.braceRArm = 0;
    this.braceLLeg = 0;
    this.braceRLeg = 0;
    this.landPrep = 0;
    this.gapArmTuck = 0;
    this.panic = 0;
    this.barGrab = 0;
    this.barGrabAng = 0;
    this.gapFail = false;
    this.slideDrop = false;
    this.swingAng = 0;
    this.swingOmega = 0;
    this.swingTravel = 0;
    this.barLooped = false;
    this.barLockT = 0;
    this.barProtectT = 0;
    this.grabEvent = false;
    this.takeoffEvent = false;
    this.barHitEvent = false;
    this.barKickEvent = false;
    this.barLoopEvent = false;
    this.boardKickEvent = false;
    this.boardSplashEvent = false;
    this.splashEvent = false;
    this.push = 0;
    this.boardAng = 0;
    this.pushKick = 0;
    this.pushT = 0;
    this.pushU = 0;
    this.pushPlantEvent = false;
    this.held = false;
    this.board = level.theme === "woods"
      ? { x: this.x, y: this.y - (HIP_HEIGHT - BOARD_RIDE), vx: 0, vy: 0, rot: 0, omega: 0, on: true, wet: 0 }
      : null;
  }

  public goLimp(): void {
    this.flipping = false;
    this.landPrep = 0;
    this.gapArmTuck = 0;
    this.panic = 0;
    this.barGrab = 0;
    this.brace = 0;
    this.spinRate = 0;
    this.held = true;
    this.restarted = false;
    this.state = "fallen";
    if (this.rag) {
      this.rag.maxAge = 1e9;
      this.rag.age = 0;
      this.rag.stillTime = 0;
      this.rag.rolling = false;
      this.rag.pose = clampLimbPose(lerpPose(this.rag.pose, HEAP, 0.55));
      return;
    }
    const now = poseFor(this, 0);
    const pose = clampLimbPose(lerpPose(now, HEAP, 0.78));
    this.rag = {
      pose,
      vel: {
        lean: 0.4,
        arch: -0.2,
        spineLumbar: -0.15,
        spineThoracic: 0.1,
        spineCervical: 0.2,
        lThigh: -1.4,
        rThigh: 1.1,
        lShin: -0.8,
        rShin: 0.6,
        lArm: 1.6,
        rArm: -1.2,
        lFore: 0.9,
        rFore: -0.7,
        lFoot: 0.4,
        rFoot: -0.3,
      },
      omega: 1.35,
      rolling: false,
      age: 0,
      stillTime: 0,
      maxAge: 1e9,
    };
  }

  public carry(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
  }

  public drop(vx: number, vy: number): void {
    this.held = false;
    this.vx = clamp(vx, -18, 18);
    this.vy = clamp(vy, -18, 18);
    const rag = this.rag;
    if (!rag) return;
    rag.rolling = Math.hypot(this.vx, this.vy) >= 2.2;
    rag.omega = clamp(-this.vx * 0.55, -10, 10);
    rag.age = 0;
    rag.stillTime = 0;
    rag.maxAge = 1e9;
  }

  public step(
    dt: number,
    run: number,
    jump: boolean,
    tuckAxis: number,
    level: Level,
    touched = false,
  ): void {
    this.landEvent = null;
    this.hitEvent = null;
    this.celebrateEvent = false;
    this.grabEvent = false;
    this.takeoffEvent = false;
    this.barHitEvent = false;
    this.barKickEvent = false;
    this.barLoopEvent = false;
    this.boardKickEvent = false;
    this.boardSplashEvent = false;
    this.splashEvent = false;
    this.pushPlantEvent = false;
    this.snapEvents.length = 0;
    this.time += dt;
    this.died = false;
    this.finished = false;
    this.restarted = false;
    if (touched) this.engaged = true;
    this.push = this.board?.on && !this.cleared ? Math.max(0, run) : 0;
    // FLIP in the air is tuck / layout, not a queued bounce. Only buffer a
    // takeoff from a press that already happened on the pad.
    const onPad = this.state === "ground" || this.state === "stumble";
    const onBoard = this.state === "slide" && !!this.board?.on;
    if (jump && (onPad || onBoard) && !this.cleared) this.jumpBuf = 0.16;
    this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    this.barLockT = Math.max(0, this.barLockT - dt);
    this.barProtectT = Math.max(0, this.barProtectT - dt);
    for (let i = this.snapFlashes.length - 1; i >= 0; i--) {
      const f = this.snapFlashes[i]!;
      f.life -= dt;
      if (f.life <= 0) this.snapFlashes.splice(i, 1);
    }

    if (this.state === "dead") {
      this.stepBoard(dt, level);
      return;
    }
    if (this.state === "done") {
      if (this.celebrating) this.celebrateT += dt;
      this.stepBoard(dt, level);
      return;
    }

    if (this.rag) {
      this.stepRagdoll(dt, level);
      if (!this.held) this.checkGapDeath(level, dt);
      this.tryFinish(level);
      this.stepBoard(dt, level);
      return;
    }

    if (this.state === "slide") {
      this.stepSlide(dt, level, run);
      this.checkGapDeath(level, dt);
      this.tryFinish(level);
      this.stepBoard(dt, level);
      return;
    }

    if (this.state === "swing") {
      this.stepSwing(dt, jump, tuckAxis, level);
      this.checkGapDeath(level, dt);
      this.tryFinish(level);
      this.stepBoard(dt, level);
      return;
    }

    if (this.state === "ground" || this.state === "stumble") {
      this.tuck = 0.5;
      this.cushion = Math.max(0, this.cushion - dt * 1.45);
      if (this.state === "stumble") {
        this.lockTimer -= dt;
        if (this.lockTimer <= 0) this.state = "ground";
      }
      const pitch = pitchedAt(level, this.x);
      if (pitch && this.state === "ground") {
        this.beginSlide(pitch, plantAngle(pitch, this.x));
        this.stepSlide(dt, level, run);
        this.checkGapDeath(level, dt);
        this.tryFinish(level);
        this.stepBoard(dt, level);
        return;
      }
      if (!this.cleared) this.tryFinish(level);
      this.groundMove(dt, run);
      this.snapToGround(level);
      this.applyCushionDrop(level);
      if (this.hitsObstacle(level)) {
        const g = groundAt(level, this.x);
        this.beginRagdoll("crash", g);
        this.landEvent = this.makeLand("fall", this.x, g ?? this.y);
        this.resolveBody(level, true);
        this.checkGapDeath(level, dt);
        this.stepBoard(dt, level);
        return;
      }
      const spd = Math.min(1, Math.abs(this.vx) / tuning.maxSpeed);
      this.runPhase += Math.abs(this.vx) * dt * (2.05 + 0.85 * spd);
      if (this.jumpBuf > 0 && !this.cleared) this.takeOff(level);
      this.checkGapDeath(level, dt);
      this.tryFinish(level);
      this.stepBoard(dt, level);
      return;
    }

    // Air: horizontal trajectory locked. Stick / hold-jump only tucks the flip.
    this.vy -= tuning.gravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.airTime += dt;

    if (this.flipping) {
      const targetTuck = 0.5 + 0.5 * Math.max(-1, Math.min(1, tuckAxis));
      const k = 1 - Math.exp(-tuning.tuckLerp * dt);
      this.tuck += (targetTuck - this.tuck) * k;
      const rate =
        tuning.tuckRateStraight +
        (tuning.tuckRateCrouch - tuning.tuckRateStraight) * this.tuck;
      const omega = (TAU / this.flipDuration) * rate;
      this.flipTravel += omega * dt;
      this.rot = this.flipTravel;
      this.spinRate = omega;
      if (this.tuck <= 0.12) this.layoutHold += dt;
    } else if (this.slideDrop) {
      this.rot += wrapPi(0 - wrapPi(this.rot)) * (1 - Math.exp(-5.2 * dt));
      this.spinRate = 0;
    } else {
      const spd = Math.min(1, Math.abs(this.vx) / tuning.maxSpeed);
      this.runPhase += (2.6 + 2.4 * spd) * dt;
      const pitch = -0.22 - Math.min(0.5, this.airTime * 0.9);
      this.rot += (pitch - this.rot) * (1 - Math.exp(-5.5 * dt));
      this.spinRate = 0;
    }

    this.updateBrace(dt, level);
    this.updateLandPrep(dt, level);
    this.updateGapArmTuck(dt, level);
    this.updatePanic(dt, level);
    this.updateBarGrab(dt, level);

    if (this.tryGrabBar(level)) {
      this.checkGapDeath(level, dt);
      this.tryFinish(level);
      this.stepBoard(dt, level);
      return;
    }
    if (this.hitsBar(level)) {
      this.strikeBar(level);
      this.resolveBody(level, true);
      this.checkGapDeath(level, dt);
      this.tryFinish(level);
      this.stepBoard(dt, level);
      return;
    }

    const g = groundAt(level, this.x);
    const pitch = pitchedAt(level, this.x);
    const floorLand = pitch
      ? this.hittingPitch(pitch)
      : g !== null && this.vy <= 0 && this.y - HIP_HEIGHT <= g + 0.08;

    if ((this.flipping || this.slideDrop) && floorLand && g !== null) {
      this.land(g, level);
      if (this.rag) this.resolveBody(level, true);
      else this.shoveFromHazards(level);
    } else if (this.hitsObstacle(level)) {
      this.beginRagdoll("crash", floorLand ? g : null);
      this.landEvent = this.makeLand("fall", this.x, floorLand && g !== null ? g : this.y);
      this.resolveBody(level, true);
      this.checkGapDeath(level, dt);
      this.tryFinish(level);
      this.stepBoard(dt, level);
      return;
    } else if (!this.flipping && !this.slideDrop) {
      const wall = this.airTime > 0.08 && this.touchingSolid(level, false);
      if (floorLand || wall) {
        if (floorLand && padAt(level, this.x) === null) this.gapFail = true;
        this.beginRagdoll("crash", floorLand ? g : null);
        this.landEvent = this.makeLand("fall", this.x, floorLand && g !== null ? g : this.y);
        this.resolveBody(level, true);
      } else {
        this.resolveBody(level, false);
      }
    } else if (this.touchingSolid(level, false, this.brace < 0.28)) {
      this.beginRagdoll("crash", null);
      this.landEvent = this.makeLand("fall", this.x, this.y);
      this.resolveBody(level, true);
    } else {
      // Sides only in the air — floor contacts during a flip were lifting him
      // so the hips never got close enough to land.
      this.resolveBody(level, false);
    }

    this.checkGapDeath(level, dt);
    this.tryFinish(level);
    this.stepBoard(dt, level);
  }

  private onFeet(): boolean {
    const standing = this.state === "ground" || this.state === "stumble";
    return standing && !this.rag && Math.abs(wrapPi(this.rot)) < 0.5;
  }

  private tryFinish(level: Level): void {
    if (this.held) return;
    if (level.goal === "standingFlip") {
      this.tryStandingFlip();
      return;
    }
    if (level.noFlag) return;
    if (this.cleared) {
      if (this.onFeet() && Math.abs(this.vx) < 0.32 && onFlagPlatform(level, this.x)) {
        this.vx = 0;
        this.rot = 0;
        this.state = "done";
        this.beginCelebrate();
      }
      return;
    }
    const tumbling = !!(this.rag || this.state === "fallen");
    if (tumbling && this.x >= level.flagX) {
      this.botchedFinish = true;
      return;
    }
    if (
      !this.botchedFinish &&
      this.x >= level.flagX &&
      this.onFeet() &&
      onFlagPlatform(level, this.x)
    ) {
      this.succeed();
    }
  }

  private tryStandingFlip(): void {
    if (this.cleared) {
      this.settleStandingWin();
      return;
    }
    const e = this.landEvent;
    if (!e || e.kind === "fall" || e.spins < 1) return;
    if (this.takeoffSpeed > STANDING_FLIP_MAX_VX) return;
    this.succeed();
    this.settleStandingWin();
  }

  private settleStandingWin(): void {
    if (this.state === "stumble" || this.rag) return;
    if (!this.onFeet() || Math.abs(this.vx) >= 0.32) return;
    this.vx = 0;
    this.rot = 0;
    this.state = "done";
    this.beginCelebrate();
  }

  private succeed(): void {
    this.cleared = true;
    this.finished = true;
    this.bandages.clear();
    this.pendingBandages.clear();
    this.sore.clear();
    this.pendingSore.clear();
  }

  private groundMove(dt: number, run: number): void {
    if (this.cleared) run = 0;
    if (this.board?.on) {
      this.vx += this.stepSkatePush(dt, run);
      this.vx *= Math.exp(-(this.cleared ? 2.4 : this.pushKick > 0.4 ? 0.18 : 0.55) * dt);
      if (this.vx > SKATE_CAP) this.vx = SKATE_CAP;
      if (this.vx < -8) this.vx = -8;
      this.x += this.vx * dt;
      const minX = START_WALL_X + 0.5;
      if (this.x < minX) {
        this.x = minX;
        if (this.vx < 0) this.vx = 0;
      }
      this.boardAng += (0 - this.boardAng) * (1 - Math.exp(-10 * dt));
      this.rot += (0 - wrapPi(this.rot)) * (1 - Math.exp(-12 * dt));
      this.tuck = 0.22;
      this.canTurn = false;
      this.facing = 1;
      this.runPhase += (Math.abs(this.vx) * 1.2 + this.pushKick * 4.2) * dt;
      return;
    }
    const target = run * tuning.maxSpeed;
    if (Math.abs(run) > 0.05) {
      const accel =
        Math.sign(run) === Math.sign(this.vx) || Math.abs(this.vx) < 0.3
          ? tuning.accel
          : tuning.turnAccel;
      if (this.vx < target) this.vx = Math.min(target, this.vx + accel * dt);
      else this.vx = Math.max(target, this.vx - accel * dt);
      const want = run >= 0 ? 1 : -1;
      if (this.canTurn) this.facing = want;
    } else {
      const mag = Math.abs(this.vx);
      const brake = this.cleared ? tuning.decel * 1.35 : tuning.decel;
      const next = Math.max(0, mag - brake * dt);
      this.vx = mag < 0.05 ? 0 : Math.sign(this.vx) * next;
    }
    this.canTurn = Math.abs(this.vx) < 0.5 && Math.abs(run) < 0.05;
    this.x += this.vx * dt;
    const minX = START_WALL_X + 0.5;
    if (this.x < minX) {
      this.x = minX;
      if (this.vx < 0) this.vx = 0;
    }
    const along = this.facing * this.vx / Math.max(0.01, tuning.maxSpeed);
    const n = Math.max(-0.55, Math.min(1, along));
    const amp = Math.min(1, Math.abs(this.vx) / tuning.maxSpeed);
    if (this.cleared && amp > 0.04) this.rot = 0.22 * amp;
    else this.rot = -0.36 * n * (0.5 + 0.5 * amp);
  }

  private takeOff(level: Level): void {
    const riding = !!this.board?.on;
    const fromSlide = this.state === "slide";
    const pitch = fromSlide ? pitchedAt(level, this.x) : null;
    const n = pitch ? platformNormal(pitch, this.x) : { nx: 0, ny: 1 };
    const kick = tuning.jumpVy;
    if (riding) this.kickBoard(n.nx, n.ny, kick * JUMP_TO_BOARD);
    this.state = "air";
    this.flipping = true;
    this.vy = kick * (riding ? 0.82 : 1);
    this.takeoffSpeed = Math.abs(this.vx);
    this.flipTravel = 0;
    this.rot = 0;
    this.airTime = 0;
    this.tuck = 0.5;
    this.layoutHold = 0;
    this.cushion = 0;
    this.spinRate = 0;
    this.rag = null;
    this.landPrep = 0;
    this.gapArmTuck = 0;
    this.panic = 0;
    this.barGrab = 0;
    this.lockTimer = 0;
    this.jumpBuf = 0;
    this.takeoffEvent = true;
    const speed = Math.min(1, Math.abs(this.vx) / tuning.maxSpeed);
    this.flipDuration =
      tuning.flipDurationSlow +
      (tuning.flipDurationFast - tuning.flipDurationSlow) * speed;
  }

  private land(g: number, level: Level): void {
    this.jumpBuf = 0;
    this.y = g + HIP_HEIGHT;
    const impact = Math.max(0.4, -this.vy);
    const ang = wrapPi(this.rot);
    const off = Math.abs(ang);
    const extend = Math.max(0, 1 - this.tuck);
    const cleanAng = degToRad(tuning.cleanLandDeg);
    const stumbleAng = degToRad(tuning.stumbleLandDeg);
    const planted = this.feetLinedUp();
    const tucked = this.tuck >= tuning.hardTuck;
    const opened = this.tuck <= tuning.cleanTuck;

    this.flipping = false;
    this.landPrep = 0;
    this.gapArmTuck = 0;
    this.barGrab = 0;
    // Keep panic until the ragdoll snapshot, then clear.

    if (padAt(level, this.x) === null) {
      this.gapFail = true;
      this.beginRagdoll("crash", g);
      this.landEvent = this.makeLand("fall", this.x, g, impact);
      return;
    }

    const pitch = pitchedAt(level, this.x);
    if (pitch) {
      if (this.slideDrop) {
        this.slideDrop = false;
        this.beginSlide(pitch, plantAngle(pitch, this.x));
        return;
      }
      this.landOnPitch(g, level, pitch, impact, planted, tucked, opened, off);
      return;
    }
    this.slideDrop = false;

    // On your feet: leftover angle in the stumble window, or land-prep lined the shins up.
    const onFeet = planted || off <= stumbleAng;
    if (!onFeet) {
      this.beginRagdoll("crash", g);
      this.landEvent = this.makeLand("fall", this.x, g, impact);
      return;
    }

    this.panic = 0;

    // Stick it only when opened out and close to feet-down.
    if (opened && off <= cleanAng && !tucked) {
      this.state = "ground";
      this.rot = 0;
      this.tuck = 0.5;
      this.cushion = 0.22 + 0.78 * extend;
      this.y = g + HIP_HEIGHT * (1 - 0.42 * this.cushion);
      this.landEvent = this.makeLand("clean", this.x, g, impact);
      return;
    }

    this.beginStumble(g);
    this.landEvent = this.makeLand("stumble", this.x, g, impact);
  }

  private hittingPitch(p: Platform): boolean {
    const n = platformNormal(p, this.x);
    const surf = platformY(p, this.x);
    const closing = this.vx * n.nx + this.vy * n.ny;
    const hip = surf + HIP_HEIGHT * Math.max(0.55, n.ny);
    return closing <= 0.4 && this.y <= hip + 0.12;
  }

  private landOnPitch(
    g: number,
    _level: Level,
    pitch: Platform,
    impact: number,
    planted: boolean,
    tucked: boolean,
    opened: boolean,
    _worldOff: number,
  ): void {
    const want = plantAngle(pitch, this.x);
    const off = Math.abs(wrapPi(this.rot - want));
    // Must actually match the slope — a world-upright plant on a 45° roof is ~45° off
    // and used to snap into a frozen 45° stand.
    const slideAng = degToRad(32);
    const onFeet = planted || off <= slideAng;
    if (!opened || tucked || !onFeet) {
      this.beginRagdoll("crash", g);
      this.landEvent = this.makeLand("fall", this.x, g, impact);
      return;
    }
    this.panic = 0;
    this.beginSlide(pitch, want);
    this.landEvent = this.makeLand("slide", this.x, g, impact);
  }

  private beginSlide(pitch: Platform, want: number): void {
    this.state = "slide";
    this.flipping = false;
    this.slideDrop = false;
    this.tuck = this.board?.on ? 0.22 : 0.28;
    this.cushion = 0.22;
    if (!this.board?.on) this.rot = slideSitRot(want);
    this.spinRate = 0;
    this.landPrep = 0;
    this.gapArmTuck = 0;
    this.panic = 0;
    this.barGrab = 0;
    this.lockTimer = 0;
    if (!this.board?.on) this.jumpBuf = 0;
    const { dx, dy } = padDownhill(pitch, this.x);
    const along = this.vx * dx + this.vy * dy;
    const speed = this.board?.on ? Math.max(0.35, along) : Math.max(4.6, along);
    this.vx = speed * dx;
    this.vy = speed * dy;
    const n = platformNormal(pitch, this.x);
    this.y = platformY(pitch, this.x) + HIP_HEIGHT * slideHip(n.ny, !!this.board?.on);
  }

  private stepSlide(dt: number, level: Level, run = 0): void {
    if (this.jumpBuf > 0 && this.board?.on && !this.cleared) {
      this.takeOff(level);
      return;
    }
    const pitch = pitchedAt(level, this.x);
    if (!pitch) {
      this.leaveSlide(null, level);
      return;
    }
    const endPad = this.board?.on ? pitch.x1 : pitch.x1 - 0.08;
    if (this.x >= endPad) {
      this.leaveSlide(pitch, level);
      return;
    }
    const { dx, dy } = padDownhill(pitch, this.x);
    let speed = this.vx * dx + this.vy * dy;
    speed += tuning.gravity * -dy * dt;
    if (this.board?.on) speed += this.stepSkatePush(dt, run);
    speed *= Math.exp(-(this.board?.on ? (this.pushKick > 0.4 ? 0.12 : 0.28) : 0.22) * dt);
    if (!this.board?.on && speed < 3.8) speed = 3.8;
    const cap = this.board?.on ? SKATE_CAP : 1e9;
    if (speed > cap) speed = cap;
    this.vx = speed * dx;
    this.vy = speed * dy;
    this.x += this.vx * dt;
    const want = plantAngle(pitch, this.x);
    if (this.board?.on) this.boardAng = want;
    const sit = this.board?.on ? skateLeanBack(want) : slideSitRot(want);
    this.rot += (sit - this.rot) * (1 - Math.exp(-14 * dt));
    this.tuck = this.board?.on ? 0.22 : 0.28;
    this.runPhase += (Math.abs(speed) * 1.4 + this.pushKick * 4.2) * dt;
    const next = pitchedAt(level, this.x);
    const nextEnd = next ? (this.board?.on ? next.x1 : next.x1 - 0.08) : 0;
    if (!next || this.x >= nextEnd) {
      this.leaveSlide(next ?? pitch, level);
      return;
    }
    const n = platformNormal(next, this.x);
    this.y = platformY(next, this.x) + HIP_HEIGHT * slideHip(n.ny, !!this.board?.on);
  }

  private leaveSlide(pitch: Platform | null, level: Level): void {
    if (pitch && this.x < pitch.x1 + 0.04 && !this.board?.on) {
      this.x = pitch.x1 + 0.08;
      const { dx, dy } = padDownhill(pitch, this.x);
      const speed = Math.max(4.2, this.vx * dx + this.vy * dy);
      this.vx = speed * dx;
      this.vy = speed * dy;
    }
    if (this.board?.on) {
      const feet = this.y - HIP_HEIGHT * skateHipFactor(Math.cos(this.boardAng));
      const floor = supportAt(level, this.x, feet, 0.8);
      if (floor !== null && this.x < level.gapX0 - 0.04) {
        const { dx, dy } = pitch ? padDownhill(pitch, this.x) : { dx: 1, dy: 0 };
        const speed = Math.max(0, this.vx * dx + this.vy * dy);
        this.state = "ground";
        this.flipping = false;
        this.slideDrop = false;
        this.vx = speed;
        this.vy = 0;
        this.y = floor + HIP_HEIGHT;
        return;
      }
      this.kickBoard(0, 1, 1.6);
    }
    this.state = "air";
    this.flipping = false;
    this.slideDrop = true;
    this.airTime = 0;
    this.landPrep = 0;
    this.gapArmTuck = 0;
    this.panic = 0;
    this.barGrab = 0;
  }

  private stepSkatePush(dt: number, run: number): number {
    if (this.cleared || run < 0.18 || Math.abs(this.boardAng) > 0.22) {
      this.pushKick += (0 - this.pushKick) * Math.min(1, dt * 9);
      this.pushT = 0;
      this.pushU = 0;
      return 0;
    }
    this.pushT += dt / 0.56;
    const u = this.pushT % 1;
    let kick = 0;
    if (u > 0.3 && u < 0.48) kick = (u - 0.3) / 0.18;
    else if (u >= 0.48 && u < 0.7) kick = 1;
    else if (u >= 0.7 && u < 0.88) kick = 1 - (u - 0.7) / 0.18;
    this.pushKick = kick;
    const planted = u >= 0.5 && this.pushU < 0.5;
    this.pushU = u;
    if (!planted) return 0;
    this.pushPlantEvent = true;
    return 3.3;
  }

  private kickBoard(nx: number, ny: number, impulse: number): void {
    const b = this.board;
    if (!b || !b.on) return;
    this.syncBoardRide();
    b.on = false;
    b.x += 0.1;
    b.vx = this.vx * 1.1 + 2.2 - nx * impulse;
    b.vy = 1.6 - ny * impulse * 0.85;
    b.omega = -2.6 - Math.abs(this.vx) * 0.18;
    this.boardKickEvent = true;
  }

  private syncBoardRide(): void {
    const b = this.board;
    if (!b?.on) return;
    const nx = -Math.sin(this.boardAng);
    const ny = Math.cos(this.boardAng);
    const surfY = this.y - HIP_HEIGHT * skateHipFactor(ny);
    b.x = this.x + nx * BOARD_RIDE;
    b.y = surfY + ny * BOARD_RIDE;
    b.vx = this.vx;
    b.vy = this.vy;
    b.rot = this.boardAng;
    b.omega = 0;
  }

  private stepBoard(dt: number, level: Level): void {
    const b = this.board;
    if (!b) return;
    if (b.on) {
      this.syncBoardRide();
      return;
    }
    b.vy -= tuning.gravity * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.rot += b.omega * dt;
    b.omega *= Math.exp(-0.45 * dt);
    const water = level.theme === "woods" ? level.pitY : null;
    const inRiver =
      water !== null && b.x > level.gapX0 - 0.2 && b.x < level.gapX1 + 0.4 && b.y < water + 0.22;
    if (inRiver && water !== null) {
      if (b.wet <= 0 && b.vy < -1) this.boardSplashEvent = true;
      b.wet = Math.min(1, b.wet + dt * 0.85);
      b.vy *= Math.exp(-4.2 * dt);
      b.vx *= Math.exp(-1.5 * dt);
      b.omega *= Math.exp(-2.4 * dt);
      const sink = water - 0.1 - b.wet * 0.55;
      b.y += (sink - b.y) * Math.min(1, dt * 2.4);
      return;
    }
    const floor = supportAt(level, b.x, b.y + 0.2, 0.5);
    if (floor !== null && b.y < floor + 0.05) {
      b.y = floor + 0.05;
      if (b.vy < 0) b.vy *= -0.28;
      b.vx *= Math.exp(-0.9 * dt);
      b.omega *= 0.72;
      b.rot += (0 - wrapPi(b.rot)) * (1 - Math.exp(-8 * dt));
    }
  }

  private tryGrabBar(level: Level): boolean {
    const bar = level.bar;
    if (!bar || this.barLockT > 0 || this.cleared) return false;
    if (1 - this.tuck < BAR_GRAB_EXTEND) return false;
    if (!this.handsOnBar(bar)) return false;
    this.catchBar(bar);
    return true;
  }

  private handsOnBar(bar: HighBar): boolean {
    const pose = poseFor(this, 0);
    const rig = makeRig(pose, true);
    const touch = BAR_RADIUS + 0.12;
    for (const h of [rig.lHand, rig.rHand]) {
      const w = worldOf(this, h.x, h.y);
      if (Math.hypot(w.x - bar.x, w.y - bar.y) < touch) return true;
    }
    return false;
  }

  /** Any body part clipping the rail — tucked or not, this is a smash if you did not catch. */
  private hitsBar(level: Level): boolean {
    const bar = level.bar;
    if (!bar || this.barLockT > 0 || this.state === "swing") return false;
    return this.barContact(bar) !== null;
  }

  private barContact(
    bar: HighBar,
  ): { nx: number; ny: number; depth: number; core: boolean } | null {
    let best: { nx: number; ny: number; depth: number; core: boolean } | null = null;
    for (const pt of bodyWorldPoints(this)) {
      const hit = pushOutOfBar(bar, pt.x, pt.y, pt.r);
      if (!hit) continue;
      if (!best || hit.depth > best.depth) best = { ...hit, core: pt.kind === "core" };
    }
    return best;
  }

  /** Too tucked (or hands missed): bounce off a glancing hit, or fold over a body hit. */
  private strikeBar(level: Level): void {
    const bar = level.bar;
    if (!bar) return;
    const hit = this.barContact(bar);
    if (!hit) return;
    const rx = this.x - bar.x;
    const ry = this.y - bar.y;
    const dist = Math.hypot(rx, ry) || 1;
    const nx = hit.nx;
    const ny = hit.ny;
    const vn = this.vx * nx + this.vy * ny;
    const speed = Math.hypot(this.vx, this.vy);
    const wrap = hit.core && vn < -0.8 && dist < 1.05;

    this.x += nx * (hit.depth + 0.05);
    this.y += ny * (hit.depth + 0.05);

    let outVx = this.vx;
    let outVy = this.vy;
    let omega = this.spinRate;
    if (wrap) {
      const r = Math.max(0.5, dist);
      omega = (rx * this.vy - ry * this.vx) / (r * r);
      omega += this.spinRate * 0.35;
      omega += (Math.sign(omega) || this.facing) * 2.8;
      omega = clamp(omega, -14, 14);
      const nr = Math.max(dist, BAR_RADIUS + 0.38);
      this.x = bar.x + (rx / dist) * nr;
      this.y = bar.y + (ry / dist) * nr;
      outVx = -omega * (this.y - bar.y) * 0.85;
      outVy = omega * (this.x - bar.x) * 0.85;
    } else {
      if (vn < 0) {
        const e = 0.55;
        outVx -= (1 + e) * vn * nx;
        outVy -= (1 + e) * vn * ny;
      }
      outVx += nx * 1.15;
      outVy += ny * 1.15;
      const torque = (rx * ny - ry * nx) * Math.max(2.2, -vn);
      omega = clamp(this.spinRate + torque * 0.9 + this.facing * 1.6, -14, 14);
    }

    this.beginRagdoll("crash", null);
    this.vx = outVx;
    this.vy = outVy;
    this.barLockT = 0.16;
    this.barProtectT = 0.65;
    this.barHitEvent = true;
    this.hitEvent = { mag: Math.max(3.2, speed), hoop: false, bar: true };
    if (this.rag) {
      this.rag.rolling = true;
      this.rag.omega = omega;
      this.foldOverBar(wrap);
    }
  }

  private foldOverBar(wrap: boolean): void {
    const rag = this.rag;
    if (!rag) return;
    const p = rag.pose;
    const k = wrap ? 1 : 0.55;
    p.spineLumbar = (p.spineLumbar ?? 0) - 0.5 * k;
    p.spineThoracic = (p.spineThoracic ?? 0) + 0.22 * k;
    p.spineCervical = (p.spineCervical ?? 0) + 0.18 * k;
    p.lThigh += 0.7 * k;
    p.rThigh += 0.62 * k;
    p.lShin -= 0.35 * k;
    p.rShin -= 0.3 * k;
    p.lArm -= 0.4 * k;
    p.rArm += 0.35 * k;
    clampLimbPose(p);
    rag.vel.spineLumbar = (rag.vel.spineLumbar ?? 0) - 2.2 * k;
    rag.vel.lThigh += 2.8 * k;
    rag.vel.rThigh += 2.4 * k;
    rag.vel.lArm -= 1.6 * k;
    rag.vel.rArm += 1.6 * k;
    limitJointVel(p, rag.vel);
  }

  private catchBar(bar: HighBar): void {
    const r = barReach(bar);
    const ang = Math.atan2(this.x - bar.x, bar.y - this.y);
    const rx = r * Math.sin(ang);
    const ry = -r * Math.cos(ang);
    let omega = (rx * this.vy - ry * this.vx) / (r * r);
    omega += this.spinRate * 0.58;
    omega += (Math.sign(omega) || 1) * Math.hypot(this.vx, this.vy) * 0.2;
    omega *= 1.42;
    this.swingAng = ang;
    this.swingOmega = clamp(omega, -BAR_SWING_MAX, BAR_SWING_MAX);
    this.tuck = Math.min(this.tuck, 0.2);
    this.swingTravel = 0;
    this.barLooped = false;
    this.state = "swing";
    this.flipping = true;
    this.slideDrop = false;
    this.panic = 0;
    this.barGrab = 0;
    this.landPrep = 0;
    this.gapArmTuck = 0;
    this.brace = 0;
    this.rot = ang;
    this.x = bar.x + rx;
    this.y = bar.y + ry;
    this.vx = r * this.swingOmega * Math.cos(ang);
    this.vy = r * this.swingOmega * Math.sin(ang);
    this.grabEvent = true;
  }

  private stepSwing(dt: number, jump: boolean, tuckAxis: number, level: Level): void {
    const bar = level.bar;
    if (!bar) {
      this.releaseBar(false);
      return;
    }
    const r = barReach(bar);
    const targetTuck = 0.5 + 0.5 * Math.max(-1, Math.min(1, tuckAxis));
    const k = 1 - Math.exp(-tuning.tuckLerp * dt);
    this.tuck += (targetTuck - this.tuck) * k;
    this.swingOmega += -(tuning.gravity / r) * Math.sin(this.swingAng) * dt;
    this.swingOmega *= Math.exp(-0.055 * dt);
    this.swingOmega = clamp(this.swingOmega, -BAR_SWING_MAX, BAR_SWING_MAX);
    const prev = this.swingTravel;
    this.swingAng += this.swingOmega * dt;
    this.swingTravel += Math.abs(this.swingOmega) * dt;
    if (!this.barLooped && prev < TAU && this.swingTravel >= TAU) {
      this.barLooped = true;
      this.barLoopEvent = true;
    }
    this.rot = this.swingAng;
    this.x = bar.x + r * Math.sin(this.swingAng);
    this.y = bar.y - r * Math.cos(this.swingAng);
    this.vx = r * this.swingOmega * Math.cos(this.swingAng);
    this.vy = r * this.swingOmega * Math.sin(this.swingAng);
    this.spinRate = this.swingOmega;
    this.flipTravel = this.swingAng;
    if (jump) {
      this.releaseBar(true);
      return;
    }
    if (this.tuck > 0.58) {
      this.releaseBar(false);
      return;
    }
    const hang = Math.abs(wrapPi(this.swingAng));
    if (this.swingTravel > 1.15 && Math.abs(this.swingOmega) < 1.05 && hang < 0.7) {
      this.releaseBar(false);
    }
  }

  /** Kick off in the rising window, otherwise just let go with current speed. */
  private barKickGood(): boolean {
    const a = wrapPi(this.swingAng);
    return this.swingOmega > 2.4 && a > 0.28 && a < 1.52;
  }

  private releaseBar(kick: boolean): void {
    const good = kick && this.barKickGood();
    if (kick && good) {
      const tx = Math.cos(this.swingAng);
      const ty = Math.sin(this.swingAng);
      const dir = Math.sign(this.swingOmega) || 1;
      this.vx += dir * tx * 4.4;
      this.vy += dir * ty * 4.4 + 3.1;
      this.barKickEvent = true;
    } else if (kick) {
      this.vy += 1.35;
    }
    this.state = "air";
    this.flipping = true;
    this.barLockT = 0.32;
    this.airTime = 0;
    this.slideDrop = false;
    this.landPrep = 0;
    this.gapArmTuck = 0;
    this.panic = 0;
    this.barGrab = 0;
    const rate =
      tuning.tuckRateStraight +
      (tuning.tuckRateCrouch - tuning.tuckRateStraight) * this.tuck;
    const omega = Math.max(2.8, Math.abs(this.swingOmega));
    this.flipDuration = (TAU * Math.max(0.35, rate)) / omega;
    this.rot = wrapPi(this.rot);
    this.flipTravel = this.rot;
    this.spinRate = this.swingOmega;
  }

  /** Hard landing: stay up, dump the knees, keep the run. */
  private beginStumble(g: number): void {
    const crouch = this.tuck;
    this.state = "stumble";
    this.flipping = false;
    this.rag = null;
    this.tuck = 0.5;
    this.cushion = 0.58 + 0.38 * clamp(crouch, 0, 1);
    this.lockTimer = tuning.stumbleTime;
    this.rot = 0;
    this.spinRate = 0;
    this.landPrep = 0;
    this.gapArmTuck = 0;
    this.panic = 0;
    this.barGrab = 0;
    this.brace = 0;
    this.vx *= 0.52;
    this.vy = 0;
    this.y = g + HIP_HEIGHT * (1 - 0.42 * this.cushion);
  }

  private makeLand(kind: LandKind, x: number, y: number, impact?: number): LandEvent {
    return {
      kind,
      x,
      y,
      spins: Math.max(0, Math.round(this.flipTravel / TAU)),
      layoutHold: this.layoutHold,
      impact: impact ?? Math.max(0.4, -this.vy),
    };
  }

  private beginRagdoll(kind: "hard" | "crash", g: number | null): void {
    if (this.board?.on) this.kickBoard(0, 1, 2.2);
    const crash = kind === "crash";
    const impact = Math.max(0, -this.vy);
    const slide = this.vx;
    const speed = Math.abs(slide);
    const rolling = speed >= 2.2;
    const spin = this.spinRate;
    const dir = Math.sign(spin || wrapPi(this.rot) || 1);
    const kick = dir * Math.min(8, speed * 0.55 + Math.abs(spin) * 0.4);
    const now = poseFor(this, 0);
    const heap = rolling ? lerpPose(HEAP, lerpPose(LAYOUT, CROUCH, this.tuck), 0.4) : { ...HEAP };
    const pose = clampLimbPose(lerpPose(now, heap, this.brace > 0.3 ? 0.32 : rolling ? 0.4 : 0.55));
    pose.lFoot = footAngle(this, now.lShin, now.lThigh);
    pose.rFoot = footAngle(this, now.rShin, now.rThigh);
    clampLimbPose(pose);
    const bounce = this.brace > 0.3 ? this.brace * Math.min(2.4, 0.7 + this.braceClosing * 0.18) : 0;
    this.state = crash ? "fallen" : "stumble";
    this.flipping = false;
    this.tuck = 0.5;
    this.cushion = 0;
    this.lockTimer = 0;
    this.rot = wrapPi(this.rot);
    if (g !== null) {
      this.vy = rolling ? Math.min(this.vy, 0) + bounce * this.braceNy * 0.45 : 0;
      this.y = g + (rolling ? 0.22 : 0.14);
    } else {
      this.vy = Math.min(this.vy, 0) + bounce * Math.max(0, this.braceNy) * 0.5;
    }
    if (rolling) {
      this.vx *= 0.94;
      this.vx += this.braceNx * bounce;
    } else {
      this.vx = this.braceNx * bounce * 0.55;
      if (Math.abs(this.rot) < 1.7) this.rot = dir * 1.62;
    }
    this.brace = 0;
    this.landPrep = 0;
    this.gapArmTuck = 0;
    this.panic = 0;
    this.barGrab = 0;
    const omega = rolling
      ? clamp(spin * 0.8 + dir * speed * 0.22, -12, 12)
      : dir * 1.05;
    const rag: Ragdoll = {
      pose,
      vel: {
        lean: kick * 0.06,
        arch: crash ? -0.28 : -0.12,
        spineLumbar: crash ? -0.45 : -0.18,
        spineThoracic: crash ? 0.28 : 0.1,
        spineCervical: crash ? 0.4 : 0.14,
        lThigh: -spin * 0.85 + kick * 0.22,
        rThigh: -spin * 0.62 - kick * 0.18,
        lShin: -spin * 1.15 + kick * 0.14,
        rShin: -spin * 0.95 - kick * 0.12,
        lArm: spin * 1.35 - kick * 0.4,
        rArm: spin * 1.1 + kick * 0.45,
        lFore: spin * 1.6 - kick * 0.22,
        rFore: spin * 1.4 + kick * 0.28,
        lFoot: -spin * 1.45 + kick * 0.1,
        rFoot: -spin * 1.25 - kick * 0.08,
      },
      omega,
      rolling,
      age: 0,
      stillTime: 0,
      maxAge: 3,
    };
    this.rag = rag;
    // Fall speed and slide are cleared above; the dump still needs that hit on the limbs.
    joltPose(rag, impact, slide);
  }

  private stepRagdoll(dt: number, level: Level): void {
    const rag = this.rag;
    if (!rag) return;

    rag.age += dt;
    if (this.held) {
      const sag = wrapPi(1.22 - wrapPi(this.rot));
      rag.omega += sag * 5.5 * dt;
      rag.omega *= Math.exp(-2.4 * dt);
      this.rot += rag.omega * dt;
      flopToward(rag, wrapPi(-Math.PI / 2 - this.rot), dt, false, true);
      enforceRagdollJoints(this);
      return;
    }
    if (Math.abs(this.vx) < 1.5) rag.rolling = false;

    this.vy -= tuning.gravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (rag.rolling) {
      rag.omega = clamp(rag.omega, -12, 12);
      this.rot += rag.omega * dt;
      rag.omega *= Math.exp(-0.38 * dt);
      this.vx *= Math.exp(-0.7 * dt);
      this.vx += -this.facing * rag.omega * 0.45 * dt;
    } else {
      rag.omega *= Math.exp(-4.8 * dt);
      this.vx *= Math.exp(-5.5 * dt);
      const dir = Math.sign(this.rot || rag.omega || 1);
      const lie = dir * 1.62;
      this.rot += wrapPi(lie - wrapPi(this.rot)) * (1 - Math.exp(-6.5 * dt));
      this.rot += rag.omega * dt;
    }

    const worldDown = wrapPi(-Math.PI / 2 - this.rot);
    flopToward(rag, worldDown, dt, true, !rag.rolling);
    enforceRagdollJoints(this);
    this.resolveBody(level, true);
    if (!rag.rolling) {
      rag.omega *= Math.exp(-3.2 * dt);
      this.vx *= Math.exp(-2.4 * dt);
    }

    const floor = groundAt(level, this.x);
    const onGround = floor !== null;
    const moving =
      Math.abs(this.vx) > 0.4 ||
      Math.abs(rag.omega) > 0.55 ||
      Math.abs(this.vy) > 0.6;
    if (!moving) rag.stillTime += dt;
    else rag.stillTime = 0;

    const stopped = rag.stillTime >= (this.gapFail && level.theme === "woods" ? 0.9 : 0.12);
    const timedOut = rag.age >= rag.maxAge;
    if (this.gapFail && level.theme === "woods" && rag.age < 1.05) return;
    // After a standing finish he may tumble off a ledge — let that play out until
    // he actually stops (or hits killY). Fail ragdolls still cap at maxAge, then
    // always go back to the level start — never stand up mid-run.
    if (level.sandbox) {
      if (!stopped) return;
      this.spinRate = 0;
      this.vx = 0;
      this.vy = 0;
      this.rag = null;
      this.state = "ground";
      this.rot = 0;
      if (onGround && floor !== null) this.y = floor + HIP_HEIGHT;
      return;
    }
    if (this.cleared) {
      if (!stopped) return;
    } else if (!stopped && !timedOut) {
      return;
    }

    this.spinRate = 0;
    this.vx = 0;
    this.vy = 0;
    if (this.cleared) {
      this.state = "done";
      if (onGround && onFlagPlatform(level, this.x)) {
        this.rag = null;
        this.rot = 0;
        this.y = floor + HIP_HEIGHT;
        this.beginCelebrate();
      }
      return;
    }
    this.rag = null;
    this.restarted = true;
  }

  /** Reach the nearest hands/feet at an incoming wall or floor. */
  private updateBrace(dt: number, level: Level): void {
    const look = 1.45 + Math.min(0.85, Math.hypot(this.vx, this.vy) * 0.06);
    const hit = approachingSolid(level, this.x, this.y, this.vx, this.vy, look);
    const closing = hit ? Math.max(0, -this.vx * hit.nx - this.vy * hit.ny) : 0;
    const floorLand = this.flipping && !!hit && hit.ny > 0.55;
    const receding = !hit || closing < 0.2;
    if (!hit || floorLand || receding || (hit.dist > 1.15 && closing < 1.2)) {
      this.brace += (0 - this.brace) * (1 - Math.exp(-10 * dt));
      if (this.brace < 0.04) {
        this.brace = 0;
        this.braceLArm = 0;
        this.braceRArm = 0;
        this.braceLLeg = 0;
        this.braceRLeg = 0;
      }
      return;
    }

    const reach = clamp((1.35 - hit.dist) / 1.05, 0, 1);
    const rush = clamp(closing / 6, 0, 1);
    const want = Math.max(reach * 0.4, reach * (0.35 + 0.65 * rush));
    this.brace += (want - this.brace) * (1 - Math.exp(-13 * dt));
    this.braceNx = hit.nx;
    this.braceNy = hit.ny;
    this.braceClosing = closing;
    this.braceAng = worldDirToLocal(this, hit.px - this.x, hit.py - this.y);

    const saved = this.brace;
    this.brace = 0;
    const pose = poseFor(this, 0);
    this.brace = saved;
    const rig = makeRig(pose, true);
    const howFar = (lx: number, ly: number) => {
      const w = worldOf(this, lx, ly);
      return Math.hypot(w.x - hit.px, w.y - hit.py);
    };
    const tips: { id: "lArm" | "rArm" | "lLeg" | "rLeg"; d: number }[] = [
      { id: "lArm", d: howFar(rig.lHand.x, rig.lHand.y) },
      { id: "rArm", d: howFar(rig.rHand.x, rig.rHand.y) },
      { id: "lLeg", d: howFar(rig.lFoot.x, rig.lFoot.y) },
      { id: "rLeg", d: howFar(rig.rFoot.x, rig.rFoot.y) },
    ];
    tips.sort((a, b) => a.d - b.d);
    this.braceLArm = 0;
    this.braceRArm = 0;
    this.braceLLeg = 0;
    this.braceRLeg = 0;
    const setW = (id: (typeof tips)[0]["id"], w: number) => {
      if (id === "lArm") this.braceLArm = w;
      else if (id === "rArm") this.braceRArm = w;
      else if (id === "lLeg") this.braceLLeg = w;
      else this.braceRLeg = w;
    };
    setW(tips[0]!.id, 1);
    setW(tips[1]!.id, 0.82);
    if (tips[2] && tips[2].d < tips[0]!.d + 0.28) setW(tips[2].id, 0.4);
  }

  /**
   * Square legs and feet toward the floor as it comes up. Only when he can
   * actually see it — feet coming under him, not inverted mid-flip. Never
   * writes `rot` / spin.
   */
  private updateLandPrep(dt: number, level: Level): void {
    const extend = Math.max(0, 1 - this.tuck);
    const g = this.seenLanding(level);
    const height = g === null ? 99 : this.y - HIP_HEIGHT - g;
    const closing = Math.max(0, -this.vy);
    const spin = Math.abs(wrapPi(this.rot));
    // Full spot when roughly upright; dead once he is on his back / inverted.
    const spot = 1 - clamp((spin - 0.7) / 0.52, 0, 1);
    const near = g !== null && height < 3.45 && height > -0.2;
    const falling = this.vy < 0.45;
    const gate = clamp((extend - 0.7) / 0.18, 0, 1);
    const reach = clamp((3.2 - height) / 2.5, 0, 1);
    const rush = clamp(closing / 8, 0, 1);
    const want =
      this.flipping && near && falling && spot > 0.04 && gate > 0
        ? gate * spot * Math.min(1, 0.58 + 0.42 * reach + 0.2 * rush)
        : 0;
    const k = 1 - Math.exp(-(want > this.landPrep ? 28 : 13) * dt);
    this.landPrep += (want - this.landPrep) * k;
    if (this.landPrep < 0.02 && want <= 0) this.landPrep = 0;
  }

  /**
   * Head-first and opened out: throw the arms at the floor. Looks desperate,
   * does not change spin or save the landing.
   */
  private updatePanic(dt: number, level: Level): void {
    const extend = Math.max(0, 1 - this.tuck);
    const g = this.seenLanding(level);
    const height = g === null ? 99 : this.y - HIP_HEIGHT - g;
    const spin = Math.abs(wrapPi(this.rot));
    const headFirst = clamp((spin - 1.52) / 0.72, 0, 1);
    const near = g !== null && height < 4.15 && height > -0.15;
    const falling = this.vy < 0.35;
    const gate = clamp((extend - 0.62) / 0.22, 0, 1);
    const reach = clamp((3.9 - height) / 2.5, 0, 1);
    const rush = clamp(Math.max(0, -this.vy) / 9, 0, 1);
    const want =
      this.flipping && near && falling && headFirst > 0.08 && gate > 0
        ? gate * headFirst * Math.min(1, 0.48 + 0.52 * reach + 0.16 * rush)
        : 0;
    const k = 1 - Math.exp(-(want > this.panic ? 22 : 12) * dt);
    this.panic += (want - this.panic) * k;
    if (this.panic < 0.02 && want <= 0) this.panic = 0;
  }

  /**
   * Over a pit (or heading into one), pin the arms to his sides and add a
   * bit more banana — including the neck — once he starts to open.
   */
  private updateGapArmTuck(dt: number, level: Level): void {
    const want =
      !this.reachingForBar(level) &&
      this.flipping &&
      crossingGap(level, this.x, this.y, this.vx, this.facing)
        ? 1
        : 0;
    const k = 1 - Math.exp(-(want > this.gapArmTuck ? 22 : 8) * dt);
    this.gapArmTuck += (want - this.gapArmTuck) * k;
    if (this.gapArmTuck < 0.02 && want <= 0) this.gapArmTuck = 0;
  }

  /** Reach both arms at the rail once he is open enough — no need to see it yet. */
  private updateBarGrab(dt: number, level: Level): void {
    const bar = level.bar;
    const want = this.reachingForBar(level) ? 1 : 0;
    const k = 1 - Math.exp(-(want > this.barGrab ? 28 : 10) * dt);
    this.barGrab += (want - this.barGrab) * k;
    if (this.barGrab < 0.02 && want <= 0) this.barGrab = 0;
    if (bar && this.barGrab > 0.03) {
      this.barGrabAng = worldDirToLocal(this, bar.x - this.x, bar.y - this.y);
    }
  }

  private reachingForBar(level: Level): boolean {
    const bar = level.bar;
    if (!bar || !this.flipping || this.barLockT > 0 || this.cleared) return false;
    if (1 - this.tuck < BAR_GRAB_EXTEND) return false;
    const dist = Math.hypot(this.x - bar.x, this.y - bar.y);
    return dist > 0.14 && dist < BAR_REACH_DIST;
  }

  /** Closest floor in front of him — the pad he can see, not a pit behind it. */
  private seenLanding(level: Level): number | null {
    const lookT = clamp(2.4 / Math.max(0.45, -this.vy), 0.08, 0.38);
    const xs = [this.x, this.x + this.vx * lookT * 0.45, this.x + this.vx * lookT];
    let best: number | null = null;
    let bestH = Infinity;
    for (const sx of xs) {
      const g = groundAt(level, sx);
      if (g === null) continue;
      const h = this.y - HIP_HEIGHT - g;
      if (h < -0.22) continue;
      if (h < bestH) {
        bestH = h;
        best = g;
      }
    }
    return best;
  }

  /** Extended plant: shins toward world-down and ankles under the hips. */
  private feetLinedUp(): boolean {
    if (this.tuck > 0.38 || this.landPrep < 0.12) return false;
    const pose = poseFor(this, 0);
    const down = worldDirToLocal(this, 0, -1);
    const err =
      0.5 *
      (Math.abs(wrapPi(pose.lShin - down)) + Math.abs(wrapPi(pose.rShin - down)));
    if (err > 0.78) return false;
    const rig = makeRig(pose, true);
    const hip = worldOf(this, (rig.lHip.x + rig.rHip.x) * 0.5, (rig.lHip.y + rig.rHip.y) * 0.5);
    const lAnk = worldOf(this, rig.lAnkle.x, rig.lAnkle.y);
    const rAnk = worldOf(this, rig.rAnkle.x, rig.rAnkle.y);
    return lAnk.y < hip.y - 0.16 && rAnk.y < hip.y - 0.16;
  }

  /** Slide off a roof crate after a stuck landing instead of eating it as a fall. */
  private shoveFromHazards(level: Level): void {
    if (!level.obstacles?.length) return;
    const hit = pushOutOfSolid(level, this.x, this.y, 0.32);
    if (hit && Math.abs(hit.nx) > 0.5) {
      this.x += hit.nx * hit.depth;
      this.vx = hit.nx > 0 ? Math.max(0, this.vx) : Math.min(0, this.vx);
    }
  }

  private hitsObstacle(level: Level): boolean {
    if (!level.obstacles?.length) return false;
    for (const pt of bodyWorldPoints(this)) {
      if (obstacleHits(level, pt.x, pt.y, pt.r)) return true;
    }
    return false;
  }

  private hoopHit(
    level: Level,
    x: number,
    y: number,
    r: number,
  ): { nx: number; ny: number; depth: number } | null {
    if (!level.hoop) return null;
    return pushOutOfHoop(level.hoop, x, y, r, this.tuck);
  }

  private touchingSolid(level: Level, floorToo: boolean, coreOnly = false): boolean {
    for (const pt of bodyWorldPoints(this)) {
      const hoop = this.hoopHit(level, pt.x, pt.y, pt.r);
      if (hoop && hoop.depth > 0.03) return true;
      if (coreOnly && pt.kind !== "core") continue;
      const hit = pushOutOfSolid(level, pt.x, pt.y, pt.r);
      if (!hit) continue;
      if (!floorToo && hit.ny > 0.5) continue;
      if (hit.depth > 0.03) return true;
    }
    return false;
  }

  /** Keep every sampled body part outside platform tops and vertical faces. */
  private resolveBody(level: Level, floorToo: boolean): void {
    const rag = this.rag;
    const airFeet = !!(rag || this.state === "air");
    for (let pass = 0; pass < 6; pass++) {
      const pts = bodyWorldPoints(this);
      let up = 0;
      let left = 0;
      let right = 0;
      let accT = 0;
      let hits = 0;
      let coreHit = false;
      let hoopContact = false;
      let barNx = 0;
      let barNy = 0;
      let barDepth = 0;
      const bar = this.state === "swing" ? null : level.bar;
      for (const pt of pts) {
        let hit = pushOutOfSolid(level, pt.x, pt.y, pt.r);
        if (hit && !floorToo && hit.ny > 0.5) hit = null;
        const hoop = this.hoopHit(level, pt.x, pt.y, pt.r);
        if (hoop && (!hit || hoop.depth > hit.depth)) {
          hit = hoop;
          hoopContact = true;
        }
        const rail = bar ? pushOutOfBar(bar, pt.x, pt.y, pt.r) : null;
        if (rail) {
          if (rag && pt.kind === "limb" && pt.joints) {
            foldLimb(this, rag.pose, rag.vel, pt.rig, airFeet, rail.nx, rail.ny, rail.depth, pt.joints);
          }
          if (rail.depth > barDepth) {
            barDepth = rail.depth;
            barNx = rail.nx;
            barNy = rail.ny;
          }
          accT += (pt.x - this.x) * rail.ny - (pt.y - this.y) * rail.nx;
          hits++;
          if (pt.kind === "core") coreHit = true;
        }
        if (!hit) continue;
        if (rag && pt.kind === "limb" && pt.joints) {
          foldLimb(this, rag.pose, rag.vel, pt.rig, airFeet, hit.nx, hit.ny, hit.depth, pt.joints);
          hits++;
          // Walls still shove the COM so a hand can't sink through a platform face.
          // Floor contacts never lift him — the torso is the heavy part.
          if (hit.ny > 0.5) continue;
        }
        if (hit.ny > 0.5) {
          up = Math.max(up, hit.depth);
          if (pt.kind === "core") coreHit = true;
        } else if (hit.nx < 0) left = Math.max(left, hit.depth);
        else if (hit.nx > 0) right = Math.max(right, hit.depth);
        accT += (pt.x - this.x) * hit.ny - (pt.y - this.y) * hit.nx;
        hits++;
        if (pt.kind === "core") coreHit = true;
      }
      if (!hits) return;
      if (pass === 0) {
        const floorSpeed = up > 0 ? Math.max(0, -this.vy) : 0;
        const wallSpeed =
          left > right ? Math.max(0, this.vx) : right > left ? Math.max(0, -this.vx) : 0;
        const railSpeed = barDepth > 0 ? Math.max(0, -(this.vx * barNx + this.vy * barNy)) : 0;
        const impact = Math.max(
          floorSpeed,
          wallSpeed,
          hoopContact || barDepth > 0 ? Math.hypot(this.vx, this.vy) : 0,
        );
        if (rag && impact > 2) {
          const slide = floorSpeed >= wallSpeed ? this.vx : this.vy;
          joltPose(rag, impact, slide);
        }
        if (impact > 2 || (hoopContact && impact > 1.2) || railSpeed > 1.2) {
          const mag = Math.max(impact, hoopContact || barDepth > 0 ? 3 : 0);
          if (!this.hitEvent || mag > this.hitEvent.mag) {
            this.hitEvent = { mag, hoop: hoopContact, bar: barDepth > 0 && !hoopContact };
          }
        }
      }
      this.y += up;
      if (right > left) this.x += right;
      else if (left > 0) this.x -= left;
      if (up > 0 && this.vy < 0 && (!rag || coreHit)) this.vy = 0;
      if (right > left) this.vx = Math.max(0, this.vx);
      else if (left > right) this.vx = Math.min(0, this.vx);
      if (barDepth > 0) {
        this.x += barNx * barDepth;
        this.y += barNy * barDepth;
        const vn = this.vx * barNx + this.vy * barNy;
        if (vn < 0) {
          const e = rag ? 0.32 : 0.5;
          this.vx -= (1 + e) * vn * barNx;
          this.vy -= (1 + e) * vn * barNy;
        }
      }
      if (rag?.rolling) {
        rag.omega += accT * 2.8;
        rag.omega = clamp(rag.omega, -12, 12);
        if (up > 0) rag.omega *= 0.82;
      } else if (rag) {
        rag.omega *= 0.5;
      } else if (up > 0 && this.flipping) {
        this.rot += accT * 0.12;
      }
    }
  }

  private applyCushionDrop(level: Level): void {
    if (this.cushion <= 0.02) return;
    const feet = this.y - HIP_HEIGHT;
    const floor = supportAt(level, this.x, feet);
    if (floor !== null && feet - floor <= 0.2) {
      this.y = floor + HIP_HEIGHT * (1 - 0.42 * this.cushion);
    }
  }

  private snapToGround(level: Level): void {
    const feet = this.y - HIP_HEIGHT;
    // Cushioned landings sit the feet ~0.4m below standing hip height.
    // That must still count as the same pad — not a cliff to climb.
    const climb = HIP_HEIGHT * 0.48;
    const g = supportAt(level, this.x, feet, climb);
    if (g !== null && feet - g <= climb + 0.06) {
      if (this.state !== "fallen") this.y = g + HIP_HEIGHT;
      return;
    }
    const cliff = groundAt(level, this.x);
    if (cliff !== null && cliff > feet + climb) {
      const hit = pushOutOfSolid(level, this.x, this.y, 0.28);
      if (hit && Math.abs(hit.nx) > 0.5) {
        this.x += hit.nx * hit.depth;
        if (hit.nx > 0) this.vx = Math.max(0, this.vx);
        else this.vx = Math.min(0, this.vx);
        const back = supportAt(level, this.x, feet, climb);
        if (back !== null && feet - back <= climb + 0.06) {
          if (this.state !== "fallen") this.y = back + HIP_HEIGHT;
          return;
        }
      }
    }
    this.state = "air";
    this.flipping = false;
    this.vy = Math.min(this.vy, 0);
    this.airTime = 0;
  }

  private beginCelebrate(): void {
    this.celebrating = true;
    this.celebrateT = 0;
    this.celebrateEvent = true;
  }

  private checkGapDeath(level: Level, dt: number): void {
    if (this.held) return;
    if (level.theme === "woods") {
      this.stepRiver(level, dt);
      return;
    }
    if (this.y >= level.killY) return;
    if (this.cleared) {
      this.state = "done";
      this.vx = 0;
      this.vy = 0;
      return;
    }
    this.gapFail = true;
    if (!this.rag) {
      this.y = level.pitY + HIP_HEIGHT;
      this.beginRagdoll("crash", level.pitY);
      this.landEvent = this.makeLand("fall", this.x, level.pitY, Math.max(0.4, -this.vy));
    }
    this.y = Math.max(this.y, level.killY + 0.2);
    this.vy = Math.max(this.vy, -3);
  }

  private stepRiver(level: Level, dt: number): void {
    const inRiver = this.x > level.gapX0 && this.x < level.gapX1;
    if (!inRiver) {
      if (this.y < level.killY && !this.cleared) {
        this.gapFail = true;
        this.y = Math.max(this.y, level.killY + 0.2);
        this.vy = Math.max(this.vy, -3);
      }
      return;
    }
    const water = level.pitY;
    if (this.y - 0.18 > water + 0.08) return;
    if (this.cleared) {
      this.state = "done";
      this.vx = 0;
      this.vy = 0;
      return;
    }
    if (!this.gapFail) {
      this.gapFail = true;
      this.splashEvent = true;
      this.landEvent = this.makeLand("fall", this.x, water, Math.max(0.4, -this.vy));
      if (!this.rag) this.beginRagdoll("crash", null);
      this.vy = Math.min(-0.35, this.vy * 0.32);
      this.vx *= 0.55;
    }
    this.vx *= Math.exp(-1.8 * dt);
    this.vy *= Math.exp(-3.2 * dt);
    this.vy -= 2.2 * dt;
    const settle = water - 0.4;
    if (this.y < settle) {
      this.y += (settle - this.y) * Math.min(1, dt * 4.5);
      this.vy = Math.max(this.vy, 0);
    }
    this.y = Math.max(this.y, level.killY + 0.2);
  }
}

function wrapPi(a: number): number {
  return ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

export interface Dust {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  streak?: boolean;
}

export function burst(
  list: Dust[],
  x: number,
  y: number,
  n: number,
  color: string,
  speed: number,
  omni = false,
): void {
  for (let i = 0; i < n; i++) {
    const a = omni ? Math.random() * TAU : -Math.PI * 0.15 - Math.random() * Math.PI * 0.7;
    const s = speed * (0.4 + Math.random());
    list.push({
      x,
      y,
      vx: Math.cos(a) * s * (omni || Math.random() < 0.5 ? 1 : -1),
      vy: omni ? Math.sin(a) * s : Math.sin(a) * s + 1.2,
      life: 0.35 + Math.random() * 0.25,
      max: 0.6,
      size: 2 + Math.random() * 3,
      color,
    });
  }
}

/** Grit and sparks trailing uphill from a shoe on a pitched roof. */
export function skidSpray(
  list: Dust[],
  x: number,
  y: number,
  dx: number,
  dy: number,
  nx: number,
  ny: number,
  speed: number,
): void {
  const n = 2 + (Math.random() < 0.5 ? 1 : 0);
  const rush = 0.55 + Math.min(1.35, speed / 8);
  for (let i = 0; i < n; i++) {
    const along = -(2.2 + Math.random() * 3.4) * rush;
    const lift = 1.15 + Math.random() * 2.6;
    const jitter = (Math.random() - 0.5) * 1.7;
    const spark = Math.random() < 0.24;
    list.push({
      x: x + (Math.random() - 0.5) * 0.14,
      y: y + 0.015 + Math.random() * 0.04,
      vx: dx * along + nx * lift * 0.4 - dy * jitter,
      vy: dy * along + ny * lift + dx * jitter,
      life: spark ? 0.16 + Math.random() * 0.12 : 0.3 + Math.random() * 0.28,
      max: spark ? 0.3 : 0.6,
      size: spark ? 1.1 + Math.random() * 1.5 : 2.1 + Math.random() * 3.2,
      color: spark ? "rgba(255, 214, 140, 0.92)" : "rgba(196, 178, 150, 0.72)",
      streak: true,
    });
  }
}

export function stepDust(list: Dust[], dt: number): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i]!;
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy -= 12 * dt;
    if (p.life <= 0) list.splice(i, 1);
  }
}

const SKIN = "#f3d2bc";
const SKIN_LIT = "#fbe6d4";
const SKIN_SHADE = "#c89676";
const SKIN_LINE = "#d9ae96";
const HAIR = "#efd56a";
const HAIR_DARK = "#d4b445";
const SHIRT = "#9aa0a6";
const SHIRT_LIT = "#c4c8cc";
const SHIRT_DARK = "#6e747a";
const JEANS = "#3a5c9e";
const JEANS_DARK = "#2a4478";
const SHOE = "#f6f6f4";
const SHOE_SOLE = "#c5c5c0";

export function drawSkateboard(
  ctx: CanvasRenderingContext2D,
  board: Board,
  sx: number,
  sy: number,
  ppm: number,
): void {
  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(ppm, -ppm);
  ctx.rotate(board.rot);
  ctx.globalAlpha *= 1 - board.wet * 0.42;
  const wr = 0.048;
  ctx.fillStyle = "#1a1410";
  ctx.beginPath();
  ctx.arc(-0.26, -0.038, wr, 0, TAU);
  ctx.arc(0.26, -0.038, wr, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#6a3a28";
  ctx.beginPath();
  ctx.moveTo(-0.42, 0.008);
  ctx.lineTo(-0.38, -0.012);
  ctx.lineTo(0.38, -0.012);
  ctx.lineTo(0.44, 0.028);
  ctx.lineTo(0.38, 0.03);
  ctx.lineTo(-0.38, 0.028);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#2a2622";
  ctx.fillRect(-0.36, 0.01, 0.74, 0.016);
  ctx.fillStyle = "#c45a3a";
  ctx.globalAlpha *= 0.85;
  ctx.beginPath();
  ctx.moveTo(-0.08, 0.012);
  ctx.lineTo(0.12, 0.012);
  ctx.lineTo(0.04, 0.026);
  ctx.lineTo(-0.14, 0.026);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Chest to camera, profile head looking ahead, feet facing us, kick off the ground. */
function drawBillSkate(ctx: CanvasRenderingContext2D, bill: Bill, pose: Pose, t: number): void {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const back = -pose.lean;
  const k = Math.max(0, Math.min(1, bill.pushKick));
  const arch =
    (pose.spineLumbar ?? 0) + (pose.spineThoracic ?? 0) + (pose.spineCervical ?? 0);
  const lHip: Pt = { x: -0.1 + back * 0.04, y: 0 };
  const rHip: Pt = { x: 0.1 + back * 0.04, y: 0 };
  const chest: Pt = { x: -back * 0.1, y: 0.4 };
  const collar: Pt = { x: -back * 0.1, y: 0.58 };
  const head: Pt = { x: 0.02 - back * 0.1, y: 0.78 };
  const lSh: Pt = { x: -0.16 - back * 0.08, y: 0.5 };
  const rSh: Pt = { x: 0.16 - back * 0.08, y: 0.5 };
  const lElb = polar(lSh, pose.lArm, 0.32);
  const rElb = polar(rSh, pose.rArm, 0.32);
  const lHand = polar(lElb, pose.lFore, 0.3);
  const rHand = polar(rElb, pose.rFore, 0.3);

  const deck = 0.055;
  const lPlant = skateDeckFoot(bill, -0.17, deck);
  const rPlant = skateDeckFoot(bill, 0.15, deck);
  const lKick = { x: lHip.x + 0.14, y: lPlant.y - 0.3 };
  const lAnkle = {
    x: lPlant.x + (lKick.x - lPlant.x) * k,
    y: lPlant.y + (lKick.y - lPlant.y) * k,
  };
  const rAnkle = rPlant;
  const lKnee = skateKnee(lHip, lAnkle, 1);
  const rKnee = skateKnee(rHip, rAnkle, 1);

  strokeColored(ctx, SHIRT_DARK, 0.12, lSh, polar(lSh, pose.lArm, 0.14));
  strokeColored(ctx, SKIN, 0.08, polar(lSh, pose.lArm, 0.14), lElb, lHand);
  fillDot(ctx, lHand, 0.045, SKIN);
  drawTrainerFront(ctx, rAnkle);
  strokeColored(ctx, JEANS, 0.15, rHip, rKnee, rAnkle);
  drawJeansWaist(ctx, lHip, rHip);
  drawShirtFront(ctx, lHip, rHip, lSh, rSh, collar, chest);
  drawHairBack(ctx, head, arch);
  drawHeadProfile(ctx, head, bill, t);
  drawHairFront(ctx, head, arch);
  strokeColored(ctx, SHIRT, 0.125, rSh, polar(rSh, pose.rArm, 0.14));
  strokeColored(ctx, SKIN, 0.082, polar(rSh, pose.rArm, 0.14), rElb, rHand);
  fillDot(ctx, rHand, 0.045, SKIN);
  strokeColored(ctx, JEANS_DARK, 0.15, lHip, lKnee, lAnkle);
  drawTrainerFront(ctx, lAnkle);
}

function skateDeckFoot(bill: Bill, along: number, lift: number): Pt {
  const b = bill.board;
  if (!b) return { x: along, y: -0.8 };
  const c = Math.cos(b.rot);
  const s = Math.sin(b.rot);
  return localOf(bill, b.x + along * c - lift * s, b.y + along * s + lift * c);
}

function skateKnee(hip: Pt, ankle: Pt, sign: number): Pt {
  const dx = ankle.x - hip.x;
  const dy = ankle.y - hip.y;
  const d = Math.hypot(dx, dy) || 1;
  const thigh = 0.46;
  const shin = 0.36;
  const a = (thigh * thigh - shin * shin + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, thigh * thigh - a * a));
  const ux = dx / d;
  const uy = dy / d;
  return { x: hip.x + ux * a - uy * h * sign, y: hip.y + uy * a + ux * h * sign };
}

function localOf(bill: Bill, wx: number, wy: number): Pt {
  const fx = bill.facing || 1;
  const dx = (wx - bill.x) / fx;
  const dy = wy - bill.y;
  const c = Math.cos(bill.rot);
  const s = Math.sin(bill.rot);
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
}

function drawJeansWaist(ctx: CanvasRenderingContext2D, lHip: Pt, rHip: Pt): void {
  const midX = (lHip.x + rHip.x) * 0.5;
  const belt = (lHip.y + rHip.y) * 0.5 + 0.05;
  const crotch = belt - 0.16;
  ctx.fillStyle = JEANS;
  ctx.beginPath();
  ctx.moveTo(lHip.x - 0.1, belt);
  ctx.lineTo(rHip.x + 0.1, belt);
  ctx.quadraticCurveTo(rHip.x + 0.08, crotch + 0.04, midX + 0.04, crotch);
  ctx.quadraticCurveTo(midX, crotch - 0.02, midX - 0.04, crotch);
  ctx.quadraticCurveTo(lHip.x - 0.08, crotch + 0.04, lHip.x - 0.1, belt);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#3d3428";
  ctx.fillRect(lHip.x - 0.09, belt - 0.018, rHip.x - lHip.x + 0.18, 0.04);
}

function drawShirtFront(
  ctx: CanvasRenderingContext2D,
  lHip: Pt,
  rHip: Pt,
  lSh: Pt,
  rSh: Pt,
  collar: Pt,
  chest: Pt,
): void {
  const hemY = (lHip.y + rHip.y) * 0.5 + 0.04;
  const waistY = hemY + 0.14;
  const lHem = { x: lHip.x - 0.09, y: hemY };
  const rHem = { x: rHip.x + 0.09, y: hemY };
  const lWaist = { x: Math.min(lHip.x, lSh.x) + 0.03, y: waistY };
  const rWaist = { x: Math.max(rHip.x, rSh.x) - 0.03, y: waistY };
  const shade = ctx.createLinearGradient(lSh.x, lSh.y, rSh.x, rHip.y);
  shade.addColorStop(0, SHIRT_DARK);
  shade.addColorStop(0.45, SHIRT);
  shade.addColorStop(1, SHIRT_LIT);
  ctx.fillStyle = shade;
  ctx.strokeStyle = SHIRT_DARK;
  ctx.lineWidth = 0.028;
  ctx.beginPath();
  ctx.moveTo(lHem.x, lHem.y);
  ctx.lineTo(lWaist.x, lWaist.y);
  ctx.lineTo(lSh.x - 0.04, lSh.y + 0.04);
  ctx.lineTo(collar.x - 0.04, collar.y + 0.02);
  ctx.lineTo(collar.x + 0.04, collar.y + 0.02);
  ctx.lineTo(rSh.x + 0.04, rSh.y + 0.04);
  ctx.lineTo(rWaist.x, rWaist.y);
  ctx.lineTo(rHem.x, rHem.y);
  ctx.quadraticCurveTo(chest.x, hemY - 0.05, lHem.x, lHem.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = SHIRT_LIT;
  ctx.beginPath();
  ctx.moveTo(collar.x - 0.055, collar.y + 0.01);
  ctx.quadraticCurveTo(collar.x, collar.y + 0.05, collar.x + 0.055, collar.y + 0.01);
  ctx.quadraticCurveTo(collar.x, collar.y - 0.01, collar.x - 0.055, collar.y + 0.01);
  ctx.fill();
}

/** Draw Backflip Bill — clothed figure, always backflips backward. */
export function drawBill(
  ctx: CanvasRenderingContext2D,
  bill: Bill,
  sx: number,
  sy: number,
  ppm: number,
  t: number,
): void {
  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(bill.facing * ppm, -ppm);
  ctx.rotate(bill.rot);

  const pose = poseFor(bill, t);
  if (bill.board?.on && !bill.rag && (bill.state === "ground" || bill.state === "slide")) {
    drawBillSkate(ctx, bill, pose, t);
    ctx.restore();
    return;
  }
  const chain = torsoChain(pose);
  const arch =
    (pose.spineLumbar ?? 0) + (pose.spineThoracic ?? 0) + (pose.spineCervical ?? 0);
  const grounded =
    (bill.state === "ground" || bill.state === "slide") && !bill.rag;
  if (grounded && !bill.board?.on) {
    const amp = Math.min(1, Math.abs(bill.vx) / tuning.maxSpeed);
    const bob = Math.abs(Math.sin(bill.runPhase)) * 0.055 * amp;
    // Don't hip-shift while idle — that skates the planted feet.
    const shift = amp > 0.04 ? pose.lean * 0.04 : 0;
    ctx.translate(shift, -bob);
  }
  if (bill.celebrating) {
    const hop =
      Math.max(0, Math.sin(bill.celebrateT * 11)) * 0.08 * Math.exp(-bill.celebrateT * 0.7);
    ctx.translate(0, hop);
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const head = chain.head;
  const { lSh, rSh, collar } = poseShoulders(chain);

  const lHip: Pt = { x: -0.03 - pose.lean * 0.1, y: -0.01 };
  const rHip: Pt = { x: 0.03 - pose.lean * 0.1, y: -0.01 };
  const lKnee = polar(lHip, pose.lThigh, 0.46);
  const rKnee = polar(rHip, pose.rThigh, 0.46);
  const lAnkle = polar(lKnee, pose.lShin, 0.36);
  const rAnkle = polar(rKnee, pose.rShin, 0.36);
  const lSleeve = polar(lSh, pose.lArm, 0.15);
  const rSleeve = polar(rSh, pose.rArm, 0.15);
  const lElb = polar(lSh, pose.lArm, 0.32);
  const rElb = polar(rSh, pose.rArm, 0.32);
  const lHand = polar(lElb, pose.lFore, 0.3);
  const rHand = polar(rElb, pose.rFore, 0.3);

  strokeColored(ctx, SHIRT_DARK, 0.13, lSh, lSleeve);
  strokeColored(ctx, SKIN, 0.08, lSleeve, lElb, lHand);
  fillDot(ctx, lHand, 0.045, SKIN);
  if (bill.bandages.has("lElb")) drawBandage(ctx, lElb, pose.lArm, 0.07, 0.042);
  drawHairBack(ctx, head, arch);

  const lFootAng = bill.rag ? (pose.lFoot ?? pose.lShin) : footAngle(bill, pose.lShin, pose.lThigh);
  const rFootAng = bill.rag ? (pose.rFoot ?? pose.rShin) : footAngle(bill, pose.rShin, pose.rThigh);
  const lHem = polar(polar(lAnkle, pose.lShin, 0.01), lFootAng, 0.02);
  const rHem = polar(polar(rAnkle, pose.rShin, 0.01), rFootAng, 0.02);
  drawTrainer(ctx, lAnkle, lFootAng);
  strokeColored(ctx, JEANS_DARK, 0.155, lHip, lKnee, lHem);
  if (bill.bandages.has("lKnee")) {
    drawBandage(ctx, lKnee, (pose.lThigh + pose.lShin) * 0.5, 0.09, 0.055);
  }
  drawTrainer(ctx, rAnkle, rFootAng);
  strokeColored(ctx, JEANS, 0.145, rHip, rKnee, rHem);
  if (bill.bandages.has("rKnee")) {
    drawBandage(ctx, rKnee, (pose.rThigh + pose.rShin) * 0.5, 0.09, 0.055);
  }

  drawShirt(ctx, chain, lHip, rHip, collar);

  strokeColored(ctx, SKIN, 0.11, collar, head);
  drawHeadProfile(ctx, head, bill, t);
  drawHairFront(ctx, head, arch);

  strokeColored(ctx, SHIRT, 0.135, rSh, rSleeve);
  strokeColored(ctx, SKIN, 0.082, rSleeve, rElb, rHand);
  fillDot(ctx, rHand, 0.045, SKIN);
  if (bill.bandages.has("rElb")) drawBandage(ctx, rElb, pose.rArm, 0.07, 0.042);

  ctx.restore();
}

interface Pt {
  x: number;
  y: number;
}

interface Pose {
  lean: number;
  /** 0 = straight spine, 1 = hyperextended layout arch. Split into joints when ragdolling. */
  arch: number;
  spineLumbar?: number;
  spineThoracic?: number;
  spineCervical?: number;
  lThigh: number;
  rThigh: number;
  lShin: number;
  rShin: number;
  lArm: number;
  rArm: number;
  lFore: number;
  rFore: number;
  /** Absolute foot angle. Relative to shin; optional on canned poses (defaults to pointed). */
  lFoot?: number;
  rFoot?: number;
}

interface Ragdoll {
  pose: Pose;
  vel: Pose;
  omega: number;
  rolling: boolean;
  age: number;
  stillTime: number;
  maxAge: number;
}

/** Knees fold backward (heel to seat). Elbows fold the other way (hand to shoulder). */
const KNEE_BEND = { min: -2.05, max: 0.06 };
const ELBOW_BEND = { min: -0.06, max: 2.0 };
const THIGH_RANGE = { min: -2.12, max: 1.15 };
const ARM_RANGE = { min: -2.28, max: 2.45 };
const LEAN_RANGE = { min: -0.62, max: 0.88 };
const ARCH_RANGE = { min: -0.18, max: 0.95 };
const LUMBAR_RANGE = { min: -0.62, max: 0.92 };
const THORACIC_RANGE = { min: -0.52, max: 0.78 };
const CERVICAL_RANGE = { min: -0.58, max: 0.7 };
/** 0 = pointed (in line with shin). Positive = toes toward shin. */
const ANKLE_BEND = { min: -0.55, max: 1.45 };

function fillSpine(pose: Pose): void {
  pose.spineLumbar = pose.spineLumbar ?? pose.arch * 0.42;
  pose.spineThoracic = pose.spineThoracic ?? pose.arch * 0.36;
  pose.spineCervical = pose.spineCervical ?? pose.arch * 0.24;
}

interface TorsoChain {
  lumbar: Pt;
  thoracic: Pt;
  neck: Pt;
  head: Pt;
  lumAng: number;
  chestAng: number;
  neckAng: number;
}

function torsoChain(pose: Pose): TorsoChain {
  fillSpine(pose);
  const pelvis: Pt = { x: -pose.lean * 0.04, y: 0.02 };
  let ang = Math.PI / 2 + pose.lean * 0.18;
  ang += pose.spineLumbar!;
  const lumbar = polar(pelvis, ang, 0.21);
  const lumAng = ang;
  ang += pose.spineThoracic!;
  const thoracic = polar(lumbar, ang, 0.23);
  const chestAng = ang;
  ang += pose.spineCervical!;
  const neck = polar(thoracic, ang, 0.2);
  const head = polar(neck, ang + 0.12 + pose.lean * 0.08, 0.21);
  return { lumbar, thoracic, neck, head, lumAng, chestAng, neckAng: ang };
}

/** Arms attach near the collar centre; the shirt yoke is wider than the neck. */
function poseShoulders(chain: TorsoChain): { lSh: Pt; rSh: Pt; collar: Pt } {
  const front = chain.chestAng - Math.PI / 2;
  const back = chain.chestAng + Math.PI / 2;
  const collar = polar(chain.neck, chain.chestAng + Math.PI, 0.05);
  return {
    collar,
    lSh: polar(collar, back, 0.03),
    rSh: polar(collar, front, 0.045),
  };
}

function idleRest(t: number): Pose {
  const hang = -Math.PI / 2;
  const breathe = Math.sin(t * 1.35);
  const lean = 0.02 * breathe;
  return {
    lean,
    arch: 0.04 + 0.03 * breathe,
    ...plantHang(lean),
    lArm: hang - 0.13 + 0.04 * breathe,
    rArm: hang - 0.13 + 0.03 * breathe,
    lFore: hang + 0.32 + 0.05 * breathe,
    rFore: hang + 0.32 + 0.04 * breathe,
  };
}

/** Keep hanging legs under a leaning torso so planted feet don't skate. */
function plantHang(lean: number): Pick<Pose, "lThigh" | "rThigh" | "lShin" | "rShin"> {
  const hang = -Math.PI / 2;
  const th = hang + (lean * 0.1) / 0.82;
  return { lThigh: th, rThigh: th, lShin: th, rShin: th };
}

/** Planted-foot idle: breathe, then cycle gymnastic stretches. Legs stay put unless a foot lifts. */
function idleStretch(t: number): Pose {
  const hang = -Math.PI / 2;
  const rest = idleRest(t);
  const overhead: Pose = {
    lean: -0.06,
    arch: 0.42,
    ...plantHang(-0.06),
    lArm: 1.48,
    rArm: 1.32,
    lFore: 1.82,
    rFore: 1.68,
  };
  const side: Pose = {
    lean: 0.48,
    arch: 0.12,
    ...plantHang(0.48),
    lArm: 1.52,
    rArm: hang + 0.2,
    lFore: 1.95,
    rFore: hang + 0.55,
  };
  const plantNear = plantHang(0.1);
  const quadNear: Pose = {
    lean: 0.1,
    arch: 0.08,
    lThigh: plantNear.lThigh,
    rThigh: hang - 0.82,
    lShin: plantNear.lShin,
    rShin: hang - 2.55,
    lArm: hang + 0.15,
    rArm: -1.92,
    lFore: hang + 0.45,
    rFore: -0.35,
  };
  const plantFar = plantHang(0.08);
  const quadFar: Pose = {
    lean: 0.08,
    arch: 0.08,
    lThigh: hang - 0.78,
    rThigh: plantFar.rThigh,
    lShin: hang - 2.5,
    rShin: plantFar.rShin,
    lArm: -1.88,
    rArm: hang + 0.12,
    lFore: -0.28,
    rFore: hang + 0.42,
  };
  const keys: { t: number; p: Pose }[] = [
    { t: 0, p: rest },
    { t: 0.1, p: rest },
    { t: 0.16, p: overhead },
    { t: 0.26, p: overhead },
    { t: 0.32, p: rest },
    { t: 0.38, p: side },
    { t: 0.48, p: side },
    { t: 0.54, p: rest },
    { t: 0.6, p: quadNear },
    { t: 0.72, p: quadNear },
    { t: 0.78, p: rest },
    { t: 0.84, p: quadFar },
    { t: 0.92, p: quadFar },
    { t: 0.97, p: rest },
    { t: 1, p: rest },
  ];
  const u = ((t % 26) + 26) % 26 / 26;
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1]!.t <= u) i++;
  const a = keys[i]!;
  const b = keys[i + 1] ?? a;
  const span = Math.max(1e-4, b.t - a.t);
  const s = (u - a.t) / span;
  const e = s * s * (3 - 2 * s);
  return lerpPose(a.p, b.p, e);
}

/** Sore hip, tailbone, or back: plant the feet and rub instead of stretching. */
function idleRub(t: number, sore: Set<SoreSpot>): Pose {
  const hang = -Math.PI / 2;
  const rest = idleRest(t);
  const spots: SoreSpot[] = [];
  if (sore.has("coccyx")) spots.push("coccyx");
  if (sore.has("back")) spots.push("back");
  if (sore.has("rHip")) spots.push("rHip");
  if (sore.has("lHip")) spots.push("lHip");
  const pick = spots[Math.floor(t / 3.6) % Math.max(1, spots.length)] ?? "coccyx";
  const rub = Math.sin(t * 8.2);
  if (pick === "back") {
    return {
      ...rest,
      lean: 0.22 + 0.05 * rub,
      arch: 0.42,
      spineLumbar: 0.4,
      spineThoracic: 0.22,
      spineCervical: 0.06,
      rArm: hang - 0.28 + 0.14 * rub,
      rFore: hang + 1.28 + 0.24 * rub,
      lArm: hang - 0.2 + 0.1 * rub,
      lFore: hang + 1.12 + 0.18 * rub,
    };
  }
  if (pick === "coccyx") {
    return {
      ...rest,
      lean: 0.18 + 0.05 * rub,
      arch: 0.2,
      rArm: hang - 0.48 + 0.14 * rub,
      rFore: hang + 0.95 + 0.22 * rub,
    };
  }
  if (pick === "rHip") {
    return {
      ...rest,
      lean: 0.12,
      rArm: hang + 0.38 + 0.18 * rub,
      rFore: hang + 1.42 + 0.24 * rub,
    };
  }
  return {
    ...rest,
    lean: -0.08,
    lArm: hang + 0.34 + 0.18 * rub,
    lFore: hang + 1.38 + 0.24 * rub,
  };
}

function celebratePose(t: number): Pose {
  const hang = -Math.PI / 2;
  const rise = 1 - Math.exp(-t * 8);
  const pump = Math.sin(t * 9.2);
  const pulse = 0.55 + 0.45 * Math.sin(t * 6.4);
  const squat = 0.05 + 0.06 * pulse * rise;
  const lArm = hang + rise * (2.92 + 0.2 * pump);
  const rArm = hang + rise * (2.78 - 0.18 * pump);
  return {
    lean: 0.1 * rise,
    arch: 0.28 * rise,
    lThigh: hang + squat * 0.9,
    rThigh: hang + squat * 0.9,
    lShin: hang - squat * 0.68,
    rShin: hang - squat * 0.68,
    lArm,
    rArm,
    lFore: lArm + 0.42 + 0.08 * pump,
    rFore: rArm + 0.4 - 0.06 * pump,
  };
}

function poseFor(bill: Bill, t: number): Pose {
  if (bill.celebrating) return clampLimbPose(celebratePose(bill.celebrateT));
  if (bill.rag) return clampLimbPose(bill.rag.pose);

  if (bill.state === "swing") {
    const hang = -Math.PI / 2;
    const stretch = 1 - bill.tuck;
    return clampLimbPose({
      lean: 0.08,
      arch: 0.22 * stretch,
      spineLumbar: 0.1 * stretch,
      spineThoracic: 0.08 * stretch,
      spineCervical: 0.12,
      lThigh: hang + 0.12 + 0.2 * stretch,
      rThigh: hang + 0.02 + 0.16 * stretch,
      lShin: hang - 0.08 - 0.12 * stretch,
      rShin: hang - 0.04 - 0.1 * stretch,
      lArm: Math.PI / 2 - 0.18,
      rArm: Math.PI / 2 - 0.1,
      lFore: Math.PI / 2 + 0.04,
      rFore: Math.PI / 2 + 0.08,
    });
  }

  if (bill.board?.on && (bill.state === "ground" || bill.state === "slide")) {
    const hang = -Math.PI / 2;
    const k = Math.max(0, Math.min(1, bill.pushKick));
    const steep = Math.min(1, Math.abs(bill.boardAng) / 0.85);
    const squat = 0.16 + 0.1 * k + 0.34 * steep;
    return clampLimbPose({
      lean: -0.04 - 0.12 * steep + 0.08 * k,
      arch: -0.06 - 0.06 * steep,
      spineLumbar: -0.08 - 0.16 * steep,
      spineThoracic: -0.04 - 0.04 * steep,
      spineCervical: 0.12 + 0.06 * steep,
      lThigh: hang - 0.08 - 0.72 * k + squat * 0.15,
      rThigh: hang + 0.1 + squat * 0.2,
      lShin: hang - 0.06 - 0.55 * k - squat * 0.35,
      rShin: hang - squat * 0.7,
      lArm: hang - 0.55 - 0.15 * k,
      rArm: hang + 0.72 + 0.08 * k,
      lFore: hang + 0.12 + 0.1 * k,
      rFore: hang + 0.95 + 0.06 * k,
    });
  }

  if (bill.state === "slide") {
    const hang = -Math.PI / 2;
    const wobble = Math.sin(bill.runPhase * 0.85);
    const steep = Math.min(1, Math.abs(bill.rot) / 0.62);
    return clampLimbPose({
      lean: 0.62 + 0.24 * steep + 0.05 * wobble,
      arch: -0.1,
      spineLumbar: -0.34 - 0.12 * steep,
      spineThoracic: -0.1,
      spineCervical: 0.16,
      lThigh: hang + 0.9 + 0.05 * wobble,
      rThigh: hang - 0.5 - 0.04 * wobble,
      lShin: hang - 0.2 + 0.03 * wobble,
      rShin: hang - 0.44,
      lArm: hang + 0.95 + 0.1 * wobble,
      rArm: hang - 0.72 - 0.08 * wobble,
      lFore: hang + 0.42,
      rFore: hang - 0.18,
    });
  }

  if (bill.state === "air") {
    if (!bill.flipping) {
      const fall = Math.min(1, bill.airTime * 2.1);
      const spd = Math.min(1, Math.abs(bill.vx) / tuning.maxSpeed);
      const a = Math.max(0.38, spd) * (1 - 0.28 * fall);
      const p = bill.runPhase;
      const L = gaitLeg(p, a, false);
      const R = gaitLeg(p + Math.PI, a, false);
      const lA = gaitArm(p, a, false);
      const rA = gaitArm(p + Math.PI, a, false);
      const flail = Math.sin(bill.airTime * 10.5);
      return applyBrace(
        clampLimbPose({
          lean: 0.38 + 0.42 * fall,
          arch: -0.1 * fall,
          lThigh: L.thigh + 0.22 * fall,
          rThigh: R.thigh - 0.18 * fall,
          lShin: L.shin - 0.4 * fall,
          rShin: R.shin - 0.32 * fall,
          lArm: lA.arm + (1.05 + 0.35 * flail) * fall,
          rArm: rA.arm + (0.85 - 0.4 * flail) * fall,
          lFore: lA.fore + 0.45 * fall,
          rFore: rA.fore + 0.4 * fall,
        }),
        bill,
      );
    }
    return applyLandPrep(
      applyBarReach(
        applyPanic(
          applyBrace(
            applyGapArms(clampLimbPose(lerpPose(LAYOUT, CROUCH, bill.tuck)), bill),
            bill,
          ),
          bill,
        ),
        bill,
      ),
      bill,
    );
  }

  const hang = -Math.PI / 2;
  const speed = bill.vx * bill.facing;
  const moving = Math.abs(bill.vx) > 0.28;
  const squat = bill.cushion;
  const amp =
    (moving ? Math.min(1, Math.abs(bill.vx) / tuning.maxSpeed) : 0) * (1 - squat * 0.88);
  const limp = bill.state === "stumble" ? 0.55 : 1;
  const a = amp * limp;
  const backpedal = moving && speed < -0.12;
  const along = Math.max(-0.55, Math.min(1, speed / Math.max(0.01, tuning.maxSpeed)));

  if (!moving) {
    if (bill.state === "stumble") {
      return clampLimbPose({
        lean: 0.5 + squat * 0.28,
        arch: 0,
        lThigh: hang + squat * 1.08,
        rThigh: hang + squat * 1.08,
        lShin: hang - squat * 0.8,
        rShin: hang - squat * 0.8,
        lArm: hang - 0.18 + squat * 0.25,
        rArm: hang - 0.12 + squat * 0.2,
        lFore: hang + 0.22 + squat * 0.4,
        rFore: hang + 0.26 + squat * 0.35,
      });
    }
    const stretch = bill.engaged
      ? idleRest(t)
      : bill.sore.size
        ? idleRub(t, bill.sore)
        : idleStretch(t);
    if (squat <= 0.04) return clampLimbPose(stretch);
    return clampLimbPose({
      ...stretch,
      lean: stretch.lean + squat * 0.28,
      lThigh: hang + squat * 1.08,
      rThigh: hang + squat * 1.08,
      lShin: hang - squat * 0.8,
      rShin: hang - squat * 0.8,
    });
  }

  const p = bill.runPhase;
  const L = gaitLeg(p, a, backpedal);
  const R = gaitLeg(p + Math.PI, a, backpedal);
  // Same phase as the legs: gaitArm swings back when the same-side thigh
  // comes forward, so the opposite arm leads (normal run).
  const lA = gaitArm(p, a, backpedal);
  const rA = gaitArm(p + Math.PI, a, backpedal);
  const into = !bill.cleared && !backpedal ? a : 0;
  const lean = bill.cleared
    ? -0.16 - 0.3 * a
    : backpedal
      ? 0.06 + along * 0.95
      : 0.16 + 0.28 * into;

  return clampLimbPose({
    lean: lean + (bill.state === "stumble" ? 0.5 : 0) + squat * 0.28,
    arch: backpedal ? 0.04 : -0.1 * into,
    spineLumbar: -0.14 * into,
    spineThoracic: -0.1 * into,
    spineCervical: -0.07 * into,
    lThigh: L.thigh + squat * 1.15,
    rThigh: R.thigh + squat * 1.02,
    lShin: L.shin - squat * 0.85,
    rShin: R.shin - squat * 0.72,
    lArm: lA.arm + squat * 0.25,
    rArm: rA.arm + squat * 0.2,
    lFore: lA.fore + squat * 0.15,
    rFore: rA.fore + squat * 0.12,
  });
}

/** One leg of a stride. `phase` 0 = under the hip, swinging forward. */
function gaitLeg(phase: number, amp: number, backpedal: boolean): { thigh: number; shin: number } {
  const hang = -Math.PI / 2;
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  if (backpedal) {
    // Reach behind to plant, recover with a bent knee under the body. Short steps.
    const reachFwd = Math.max(0, s);
    const trail = Math.max(0, -s);
    const thigh = hang + reachFwd * (0.32 * amp) - trail * (0.78 * amp);
    const recover = Math.max(0, c);
    const reachBack = Math.max(0, -c);
    const knee = -0.42 - recover * (0.9 * amp) - reachBack * 0.2 * amp;
    return { thigh, shin: thigh + knee };
  }
  // Forward run: high-knee recovery in front, long almost-straight push-off behind.
  const reachFwd = Math.max(0, s);
  const trail = Math.max(0, -s);
  const sprint = amp * amp;
  // Flatten the sine so the knee stays up through more of the stride at speed.
  const lift = Math.pow(reachFwd, 0.5);
  const thigh = hang + lift * (1.22 * amp + 0.62 * sprint) - trail * (0.95 * amp);
  const swing = Math.max(0, c);
  const stance = Math.max(0, -c);
  const knee =
    -lift * (1.02 + 0.48 * sprint) -
    swing * (0.72 + 0.42 * amp) * (0.4 + 0.6 * (1 - lift)) -
    stance * (0.1 + 0.16 * amp * (1 - trail));
  return { thigh, shin: thigh + knee };
}

function gaitArm(phase: number, amp: number, backpedal: boolean): { arm: number; fore: number } {
  const hang = -Math.PI / 2;
  const s = Math.sin(phase);
  if (backpedal) {
    const arm = hang + 0.15 - s * 0.38 * amp;
    const fore = arm + 0.55 + 0.12 * amp;
    return { arm, fore };
  }
  const arm = hang - 0.1 - s * (0.5 + 0.62 * amp);
  const pump = Math.max(0, -s);
  const fore = arm + 0.5 + 0.22 * amp + pump * (0.55 * amp);
  return { arm, fore };
}

/** Gap extend: arms pinned to the ribs, extra banana through the neck. */
const GAP_EXTEND = {
  lean: -0.38,
  arch: 0.95,
  spineLumbar: 0.5,
  spineThoracic: 0.46,
  spineCervical: 0.5,
  lArm: -Math.PI / 2 - 0.06,
  rArm: -Math.PI / 2 - 0.16,
  lFore: -Math.PI / 2 + 0.32,
  rFore: -Math.PI / 2 + 0.24,
};

/** Layout: arched back, full extension, arms and legs trailing the spin. */
const LAYOUT: Pose = {
  lean: -0.28,
  arch: 0.92,
  spineLumbar: 0.4,
  spineThoracic: 0.34,
  spineCervical: 0.22,
  lThigh: -1.98,
  rThigh: -1.82,
  lShin: -2.08,
  rShin: -1.9,
  lArm: 2.08,
  rArm: 1.88,
  lFore: 2.16,
  rFore: 1.96,
};

/** Gymnast tuck: knees up in front, not wrapped past the chest. */
const CROUCH: Pose = {
  lean: 0.14,
  arch: -0.1,
  spineLumbar: -0.08,
  spineThoracic: -0.04,
  spineCervical: 0.02,
  lThigh: 0.92,
  rThigh: 0.74,
  lShin: -0.95,
  rShin: -1.05,
  lArm: 1.42,
  rArm: 1.22,
  lFore: 2.97,
  rFore: 2.77,
};

/** Loose crumpled heap after a dump — joints stay inside clamp ranges. */
const HEAP: Pose = {
  lean: 0.22,
  arch: 0.12,
  spineLumbar: 0.52,
  spineThoracic: -0.28,
  spineCervical: 0.34,
  lThigh: 0.55,
  rThigh: -0.35,
  lShin: -1.35,
  rShin: -1.85,
  lArm: 1.85,
  rArm: -0.55,
  lFore: 3.4,
  rFore: 0.65,
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function hinge(child: number, parent: number, min: number, max: number): number {
  return parent + clamp(wrapPi(child - parent), min, max);
}

/** Angular speed still driving a hinge into a stop it has already hit. */
function stopDrive(value: number, vel: number, min: number, max: number): number {
  if (value <= min + 0.06 && vel < -0.5) return -vel;
  if (value >= max - 0.06 && vel > 0.5) return vel;
  return 0;
}

/**
 * How far past a stop an unconstrained pose would sit.
 * Per-frame overshoot is tiny (we clamp every tick), so also project ~50ms of
 * leftover drive into a stop — that's the "force past the limit".
 */
function jointOvershoot(
  pose: Pose,
  vel: Pose,
): { key: keyof Pose; excess: number; speed: number }[] {
  const out: { key: keyof Pose; excess: number; speed: number }[] = [];
  const abs = (key: keyof Pose, min: number, max: number) => {
    const v = pose[key] ?? 0;
    const speed = vel[key] ?? 0;
    const excess = v < min ? min - v : v > max ? v - max : 0;
    const drive = stopDrive(v, speed, min, max);
    const projected = excess + drive * 0.05;
    if (projected > 0.02) out.push({ key, excess: projected, speed: Math.abs(speed) });
  };
  const rel = (child: keyof Pose, parent: keyof Pose, min: number, max: number) => {
    const parentAng = pose[parent] ?? 0;
    const childAng = pose[child] ?? parentAng;
    const r = wrapPi(childAng - parentAng);
    const rVel = (vel[child] ?? 0) - (vel[parent] ?? 0);
    const excess = r < min ? min - r : r > max ? r - max : 0;
    const drive = stopDrive(r, rVel, min, max);
    const projected = excess + drive * 0.05;
    if (projected > 0.02) {
      out.push({ key: child, excess: projected, speed: Math.abs(rVel) });
    }
  };
  abs("lean", LEAN_RANGE.min, LEAN_RANGE.max);
  abs("arch", ARCH_RANGE.min, ARCH_RANGE.max);
  abs("spineLumbar", LUMBAR_RANGE.min, LUMBAR_RANGE.max);
  abs("spineThoracic", THORACIC_RANGE.min, THORACIC_RANGE.max);
  abs("spineCervical", CERVICAL_RANGE.min, CERVICAL_RANGE.max);
  abs("lThigh", THIGH_RANGE.min, THIGH_RANGE.max);
  abs("rThigh", THIGH_RANGE.min, THIGH_RANGE.max);
  abs("lArm", ARM_RANGE.min, ARM_RANGE.max);
  abs("rArm", ARM_RANGE.min, ARM_RANGE.max);
  rel("lShin", "lThigh", KNEE_BEND.min, KNEE_BEND.max);
  rel("rShin", "rThigh", KNEE_BEND.min, KNEE_BEND.max);
  rel("lFore", "lArm", ELBOW_BEND.min, ELBOW_BEND.max);
  rel("rFore", "rArm", ELBOW_BEND.min, ELBOW_BEND.max);
  rel("lFoot", "lShin", ANKLE_BEND.min, ANKLE_BEND.max);
  rel("rFoot", "rShin", ANKLE_BEND.min, ANKLE_BEND.max);
  return out;
}

function jointWorld(bill: Bill, key: keyof Pose): { x: number; y: number } {
  const pose = bill.rag?.pose;
  if (!pose) return { x: bill.x, y: bill.y };
  const rig = makeRig(pose, true);
  const map: Record<keyof Pose, keyof Rig> = {
    lean: "back",
    arch: "back",
    spineLumbar: "lumbar",
    spineThoracic: "thoracic",
    spineCervical: "neck",
    lThigh: "lHip",
    rThigh: "rHip",
    lShin: "lKnee",
    rShin: "rKnee",
    lArm: "lElb",
    rArm: "rElb",
    lFore: "lElb",
    rFore: "rElb",
    lFoot: "lFoot",
    rFoot: "rFoot",
  };
  if (key === "lean" || key === "arch") {
    return worldOf(bill, (rig.lHip.x + rig.rHip.x) * 0.5 - 0.08, 0.04);
  }
  if (key === "spineLumbar") return worldOf(bill, rig.lumbar.x, rig.lumbar.y);
  if (key === "spineThoracic") return worldOf(bill, rig.thoracic.x, rig.thoracic.y);
  if (key === "spineCervical") return worldOf(bill, rig.neck.x, rig.neck.y);
  const p = rig[map[key]];
  return worldOf(bill, p.x, p.y);
}

function noteSnap(
  bill: Bill,
  key: keyof Pose,
  excess: number,
  speed: number,
  leftover = 0,
): void {
  const rag = bill.rag;
  if (!rag || bill.snappedThisRun) return;
  const slam = leftover > 0;
  const significant = slam
    ? leftover > 0.2 && bill.vy < -8
    : excess >= 1.0 && speed > 13;
  const force = slam
    ? leftover * 6 + Math.abs(bill.vy) * 0.08
    : excess * (0.4 + 0.1 * speed);
  if (!significant || force < 1.35) return;
  bill.snappedThisRun = true;
  rag.vel[key] *= 0.12;
  const w = jointWorld(bill, key);
  bill.snapEvents.push({ x: w.x, y: w.y });
  bill.snapFlashes.push({ x: w.x, y: w.y, life: 0.42, max: 0.42 });
  const kind = snapKind(key);
  if (!kind) return;
  if (kind === "lKnee" || kind === "rKnee" || kind === "lElb" || kind === "rElb") {
    bill.pendingBandages.add(kind);
  } else {
    bill.pendingSore.add(kind);
  }
}

function snapKind(key: keyof Pose): SnapKind | null {
  if (key === "lShin") return "lKnee";
  if (key === "rShin") return "rKnee";
  if (key === "lThigh") return "lHip";
  if (key === "rThigh") return "rHip";
  if (key === "lArm" || key === "lFore") return "lElb";
  if (key === "rArm" || key === "rFore") return "rElb";
  if (key === "lFoot" || key === "rFoot") return null;
  if (key === "spineLumbar" || key === "spineThoracic" || key === "spineCervical") return "back";
  return "coccyx";
}

function enforceRagdollJoints(bill: Bill): void {
  const rag = bill.rag;
  if (!rag) return;
  const hits = jointOvershoot(rag.pose, rag.vel);
  clampLimbPose(rag.pose);
  limitJointVel(rag.pose, rag.vel);
  if (bill.barProtectT > 0) return;
  for (const h of hits) noteSnap(bill, h.key, h.excess, h.speed);
}

/** Kill drive that would push a clamped joint further through its stop. */
function limitJointVel(pose: Pose, vel: Pose): void {
  const abs = (key: keyof Pose, min: number, max: number) => {
    const v = pose[key] ?? 0;
    const s = vel[key] ?? 0;
    if (v <= min + 0.012 && s < 0) vel[key] = 0;
    if (v >= max - 0.012 && s > 0) vel[key] = 0;
  };
  const rel = (child: keyof Pose, parent: keyof Pose, min: number, max: number) => {
    const parentAng = pose[parent] ?? 0;
    const childAng = pose[child] ?? parentAng;
    const r = wrapPi(childAng - parentAng);
    const rVel = (vel[child] ?? 0) - (vel[parent] ?? 0);
    if (r <= min + 0.012 && rVel < 0) vel[child] = vel[parent] ?? 0;
    if (r >= max - 0.012 && rVel > 0) vel[child] = vel[parent] ?? 0;
  };
  abs("lean", LEAN_RANGE.min, LEAN_RANGE.max);
  abs("arch", ARCH_RANGE.min, ARCH_RANGE.max);
  abs("spineLumbar", LUMBAR_RANGE.min, LUMBAR_RANGE.max);
  abs("spineThoracic", THORACIC_RANGE.min, THORACIC_RANGE.max);
  abs("spineCervical", CERVICAL_RANGE.min, CERVICAL_RANGE.max);
  abs("lThigh", THIGH_RANGE.min, THIGH_RANGE.max);
  abs("rThigh", THIGH_RANGE.min, THIGH_RANGE.max);
  abs("lArm", ARM_RANGE.min, ARM_RANGE.max);
  abs("rArm", ARM_RANGE.min, ARM_RANGE.max);
  rel("lShin", "lThigh", KNEE_BEND.min, KNEE_BEND.max);
  rel("rShin", "rThigh", KNEE_BEND.min, KNEE_BEND.max);
  rel("lFore", "lArm", ELBOW_BEND.min, ELBOW_BEND.max);
  rel("rFore", "rArm", ELBOW_BEND.min, ELBOW_BEND.max);
  rel("lFoot", "lShin", ANKLE_BEND.min, ANKLE_BEND.max);
  rel("rFoot", "rShin", ANKLE_BEND.min, ANKLE_BEND.max);
}

function clampLimbPose(pose: Pose): Pose {
  fillSpine(pose);
  pose.lean = clamp(pose.lean, LEAN_RANGE.min, LEAN_RANGE.max);
  pose.arch = clamp(pose.arch, ARCH_RANGE.min, ARCH_RANGE.max);
  pose.spineLumbar = clamp(pose.spineLumbar!, LUMBAR_RANGE.min, LUMBAR_RANGE.max);
  pose.spineThoracic = clamp(pose.spineThoracic!, THORACIC_RANGE.min, THORACIC_RANGE.max);
  pose.spineCervical = clamp(pose.spineCervical!, CERVICAL_RANGE.min, CERVICAL_RANGE.max);
  pose.lThigh = clamp(pose.lThigh, THIGH_RANGE.min, THIGH_RANGE.max);
  pose.rThigh = clamp(pose.rThigh, THIGH_RANGE.min, THIGH_RANGE.max);
  pose.lShin = hinge(pose.lShin, pose.lThigh, KNEE_BEND.min, KNEE_BEND.max);
  pose.rShin = hinge(pose.rShin, pose.rThigh, KNEE_BEND.min, KNEE_BEND.max);
  pose.lArm = clamp(pose.lArm, ARM_RANGE.min, ARM_RANGE.max);
  pose.rArm = clamp(pose.rArm, ARM_RANGE.min, ARM_RANGE.max);
  pose.lFore = hinge(pose.lFore, pose.lArm, ELBOW_BEND.min, ELBOW_BEND.max);
  pose.rFore = hinge(pose.rFore, pose.rArm, ELBOW_BEND.min, ELBOW_BEND.max);
  pose.lFoot = hinge(pose.lFoot ?? pose.lShin, pose.lShin, ANKLE_BEND.min, ANKLE_BEND.max);
  pose.rFoot = hinge(pose.rFoot ?? pose.rShin, pose.rShin, ANKLE_BEND.min, ANKLE_BEND.max);
  return pose;
}

function integrateJoint(pose: Pose, vel: Pose, key: keyof Pose, pull: number, dt: number, damp: number): void {
  const v = vel[key] ?? 0;
  const next = clamp(v + (pull - v * damp) * dt, -18, 18);
  vel[key] = next;
  pose[key] = (pose[key] ?? 0) + next * dt;
}

function flopToward(rag: Ragdoll, hang: number, dt: number, _grounded: boolean, heap = false): void {
  const { pose, vel } = rag;
  // Torso stays heavy; limbs keep swinging with very little drag.
  const mix = heap ? 0.16 : 0;
  const pull = (ang: number, target: number, stiff: number) => {
    const goal = hang + mix * wrapPi(target - hang);
    return wrapPi(goal - ang) * stiff;
  };
  const torsoStiff = heap ? 6.2 : 3.4;
  const limbStiff = heap ? 1.15 : 0.7;
  const tipStiff = heap ? 0.7 : 0.38;
  fillSpine(pose);
  vel.spineLumbar = vel.spineLumbar ?? 0;
  vel.spineThoracic = vel.spineThoracic ?? 0;
  vel.spineCervical = vel.spineCervical ?? 0;
  integrateJoint(pose, vel, "lean", wrapPi((heap ? HEAP.lean : 0) - pose.lean) * torsoStiff, dt, heap ? 5.4 : 3.6);
  integrateJoint(pose, vel, "arch", wrapPi((heap ? HEAP.arch : 0) - pose.arch) * (torsoStiff * 0.8), dt, heap ? 4.8 : 3.2);
  const spineStiff = heap ? 4.4 : 0.58;
  const spineDamp = heap ? 3.4 : 0.62;
  integrateJoint(
    pose,
    vel,
    "spineLumbar",
    wrapPi((heap ? HEAP.spineLumbar! : 0) - pose.spineLumbar!) * spineStiff - rag.omega * (heap ? 0.12 : 0.55),
    dt,
    spineDamp,
  );
  integrateJoint(
    pose,
    vel,
    "spineThoracic",
    wrapPi((heap ? HEAP.spineThoracic! : 0) - pose.spineThoracic!) * (spineStiff * 0.85) + rag.omega * (heap ? 0.08 : 0.42),
    dt,
    spineDamp * 0.9,
  );
  integrateJoint(
    pose,
    vel,
    "spineCervical",
    wrapPi((heap ? HEAP.spineCervical! : 0) - pose.spineCervical!) * (spineStiff * 0.7) + rag.omega * (heap ? 0.1 : 0.7),
    dt,
    spineDamp * 0.75,
  );
  integrateJoint(pose, vel, "lThigh", pull(pose.lThigh, HEAP.lThigh, limbStiff) - rag.omega * 1.8, dt, 0.42);
  integrateJoint(pose, vel, "rThigh", pull(pose.rThigh, HEAP.rThigh, limbStiff * 0.9) - rag.omega * 1.35, dt, 0.4);
  integrateJoint(pose, vel, "lShin", pull(pose.lShin, HEAP.lShin, tipStiff) - rag.omega * 1.1, dt, 0.22);
  integrateJoint(pose, vel, "rShin", pull(pose.rShin, HEAP.rShin, tipStiff) - rag.omega * 0.95, dt, 0.2);
  integrateJoint(pose, vel, "lArm", pull(pose.lArm, HEAP.lArm, limbStiff * 0.75) + rag.omega * 2.6, dt, 0.28);
  integrateJoint(pose, vel, "rArm", pull(pose.rArm, HEAP.rArm, limbStiff * 0.7) + rag.omega * 2.2, dt, 0.26);
  integrateJoint(pose, vel, "lFore", pull(pose.lFore, HEAP.lFore, tipStiff * 0.7) + rag.omega * 1.6, dt, 0.16);
  integrateJoint(pose, vel, "rFore", pull(pose.rFore, HEAP.rFore, tipStiff * 0.65) + rag.omega * 1.4, dt, 0.14);
  const lFoot = pose.lFoot ?? pose.lShin;
  const rFoot = pose.rFoot ?? pose.rShin;
  pose.lFoot = lFoot;
  pose.rFoot = rFoot;
  vel.lFoot = vel.lFoot ?? 0;
  vel.rFoot = vel.rFoot ?? 0;
  integrateJoint(pose, vel, "lFoot", pull(lFoot, hang, tipStiff * 0.45) - rag.omega * 0.75, dt, 0.08);
  integrateJoint(pose, vel, "rFoot", pull(rFoot, hang, tipStiff * 0.4) - rag.omega * 0.65, dt, 0.07);
}

function joltPose(rag: Ragdoll, impact: number, slide: number): void {
  const j = Math.min(5.5, impact * 0.55);
  const s = clamp(slide * 0.18, -3.2, 3.2);
  rag.vel.lThigh += -j * 0.7 + s * 0.2;
  rag.vel.rThigh += -j * 0.5 - s * 0.15;
  rag.vel.lShin += -j * 0.35;
  rag.vel.rShin += -j * 0.28;
  rag.vel.lArm += j * 0.55 - s * 0.25;
  rag.vel.rArm += j * 0.7 + s * 0.3;
  rag.vel.lFore += j * 0.3;
  rag.vel.rFore += j * 0.4;
  rag.vel.lFoot = (rag.vel.lFoot ?? 0) - j * 0.22;
  rag.vel.rFoot = (rag.vel.rFoot ?? 0) - j * 0.18;
  rag.vel.lean += s * 0.08;
  rag.vel.spineLumbar = (rag.vel.spineLumbar ?? 0) - j * 0.85;
  rag.vel.spineThoracic = (rag.vel.spineThoracic ?? 0) + j * 0.55 + s * 0.22;
  rag.vel.spineCervical = (rag.vel.spineCervical ?? 0) + j * 0.9;
  rag.omega += s * 0.85;
}

function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const u = Math.max(0, Math.min(1, t));
  return {
    lean: a.lean + (b.lean - a.lean) * u,
    arch: a.arch + (b.arch - a.arch) * u,
    spineLumbar: (a.spineLumbar ?? a.arch * 0.42) + ((b.spineLumbar ?? b.arch * 0.42) - (a.spineLumbar ?? a.arch * 0.42)) * u,
    spineThoracic: (a.spineThoracic ?? a.arch * 0.36) + ((b.spineThoracic ?? b.arch * 0.36) - (a.spineThoracic ?? a.arch * 0.36)) * u,
    spineCervical: (a.spineCervical ?? a.arch * 0.24) + ((b.spineCervical ?? b.arch * 0.24) - (a.spineCervical ?? a.arch * 0.24)) * u,
    lThigh: a.lThigh + (b.lThigh - a.lThigh) * u,
    rThigh: a.rThigh + (b.rThigh - a.rThigh) * u,
    lShin: a.lShin + (b.lShin - a.lShin) * u,
    rShin: a.rShin + (b.rShin - a.rShin) * u,
    lArm: a.lArm + (b.lArm - a.lArm) * u,
    rArm: a.rArm + (b.rArm - a.rArm) * u,
    lFore: a.lFore + (b.lFore - a.lFore) * u,
    rFore: a.rFore + (b.rFore - a.rFore) * u,
    lFoot: (a.lFoot ?? a.lShin) + ((b.lFoot ?? b.lShin) - (a.lFoot ?? a.lShin)) * u,
    rFoot: (a.rFoot ?? a.rShin) + ((b.rFoot ?? b.rShin) - (a.rFoot ?? a.rShin)) * u,
  };
}

function polar(from: Pt, ang: number, len: number): Pt {
  return { x: from.x + Math.cos(ang) * len, y: from.y + Math.sin(ang) * len };
}

function worldOf(bill: Bill, lx: number, ly: number): Pt {
  const c = Math.cos(bill.rot);
  const s = Math.sin(bill.rot);
  const rx = lx * c - ly * s;
  const ry = lx * s + ly * c;
  return { x: bill.x + bill.facing * rx, y: bill.y + ry };
}

function worldDirToLocal(bill: Bill, wx: number, wy: number): number {
  const c = Math.cos(bill.rot);
  const s = Math.sin(bill.rot);
  const fx = wx / (bill.facing || 1);
  const lx = fx * c + wy * s;
  const ly = wy * c - fx * s;
  return Math.atan2(ly, lx);
}

function mixAng(cur: number, target: number, k: number): number {
  return cur + wrapPi(target - cur) * k;
}

function applyBrace(pose: Pose, bill: Bill): Pose {
  const u = bill.brace;
  if (u < 0.03) return pose;
  const ang = bill.braceAng;
  const p = { ...pose };
  const arm = (armKey: "lArm" | "rArm", foreKey: "lFore" | "rFore", w: number, bias: number) => {
    const k = Math.min(1, u * w);
    if (k < 0.02) return;
    p[armKey] = mixAng(p[armKey], ang + bias, k);
    p[foreKey] = mixAng(p[foreKey], p[armKey] + 0.12, k);
  };
  const leg = (thigh: "lThigh" | "rThigh", shin: "lShin" | "rShin", w: number, bias: number) => {
    const k = Math.min(1, u * w);
    if (k < 0.02) return;
    p[thigh] = mixAng(p[thigh], ang + bias, k);
    p[shin] = mixAng(p[shin], p[thigh] - 0.22, k);
  };
  arm("lArm", "lFore", bill.braceLArm, 0.14);
  arm("rArm", "rFore", bill.braceRArm, -0.1);
  leg("lThigh", "lShin", bill.braceLLeg, 0.08);
  leg("rThigh", "rShin", bill.braceRLeg, -0.06);
  return clampLimbPose(p);
}

/** Both arms toward the floor, a bit of shake — it will not break the fall. */
function applyPanic(pose: Pose, bill: Bill): Pose {
  const u = bill.panic;
  if (u < 0.03) return pose;
  const down = worldDirToLocal(bill, 0, -1);
  const shake = Math.sin(bill.time * 34) * 0.16 * u;
  const p = { ...pose };
  p.lArm = mixAng(p.lArm, down + 0.24 + shake, u);
  p.rArm = mixAng(p.rArm, down - 0.2 - shake * 0.7, u);
  p.lFore = mixAng(p.lFore, p.lArm + 0.18, u);
  p.rFore = mixAng(p.rFore, p.rArm + 0.16, u);
  return clampLimbPose(p);
}

/** Both arms toward the high bar so the hands can actually take it. */
function applyBarReach(pose: Pose, bill: Bill): Pose {
  const u = bill.barGrab;
  if (u < 0.03) return pose;
  const p = { ...pose };
  const reach = 1 - (1 - u) * (1 - u);
  const lWant = clamp(bill.barGrabAng + 0.1, ARM_RANGE.min, ARM_RANGE.max);
  const rWant = clamp(bill.barGrabAng - 0.08, ARM_RANGE.min, ARM_RANGE.max);
  p.lArm = p.lArm + (lWant - p.lArm) * reach;
  p.rArm = p.rArm + (rWant - p.rArm) * reach;
  p.lFore = hinge(p.lArm + 0.08, p.lArm, ELBOW_BEND.min, ELBOW_BEND.max);
  p.rFore = hinge(p.rArm + 0.08, p.rArm, ELBOW_BEND.min, ELBOW_BEND.max);
  return clampLimbPose(p);
}

/** Pin arms to his sides and deepen the layout arch, including the neck. */
function applyGapArms(pose: Pose, bill: Bill): Pose {
  const open = clamp((0.62 - bill.tuck) / 0.5, 0, 1);
  const u = bill.gapArmTuck * open;
  if (u < 0.03) return pose;
  const g = GAP_EXTEND;
  const p = { ...pose };
  p.lean = p.lean + (g.lean - p.lean) * u * 0.75;
  p.arch = p.arch + (g.arch - p.arch) * u;
  const lum = p.spineLumbar ?? p.arch * 0.42;
  const tho = p.spineThoracic ?? p.arch * 0.36;
  const cer = p.spineCervical ?? p.arch * 0.24;
  p.spineLumbar = lum + (g.spineLumbar - lum) * u;
  p.spineThoracic = tho + (g.spineThoracic - tho) * u;
  p.spineCervical = cer + (g.spineCervical - cer) * u;
  // Layout arms sit near +2.1; hang is -π/2. Shortest-angle mix wraps past
  // ARM_RANGE.max and the clamp leaves them trailing. Lerp in real numbers.
  const armU = 1 - (1 - u) * (1 - u);
  p.lArm = p.lArm + (g.lArm - p.lArm) * armU;
  p.rArm = p.rArm + (g.rArm - p.rArm) * armU;
  p.lFore = p.lFore + (g.lFore - p.lFore) * armU;
  p.rFore = p.rFore + (g.rFore - p.rFore) * armU;
  return clampLimbPose(p);
}

/** Highest standable pad at x — platforms and crates, never the pit floor. */
function padAt(level: Level, x: number): number | null {
  let best: number | null = null;
  for (const p of [...level.platforms, ...(level.boxes ?? [])]) {
    if (x < p.x0 || x > p.x1) continue;
    const y = platformY(p, x);
    if (best === null || y > best) best = y;
  }
  return best;
}

function overGap(level: Level, x: number, y: number): boolean {
  const g = padAt(level, x);
  if (g === null) return true;
  return y - HIP_HEIGHT - g > 1.55;
}

function crossingGap(
  level: Level,
  x: number,
  y: number,
  vx: number,
  facing: number,
): boolean {
  if (overGap(level, x, y)) return true;
  const dir = facing >= 0 ? 1 : -1;
  const reach = Math.max(10, Math.abs(vx) * 1.15 + 3);
  for (let s = 0.35; s <= reach; s += 0.4) {
    if (overGap(level, x + dir * s, y)) return true;
  }
  return false;
}

/** Point thighs at world-down and flatten the feet. Joint clamps only — no spin. */
function applyLandPrep(pose: Pose, bill: Bill): Pose {
  const u = bill.landPrep;
  if (u < 0.03) return pose;
  const down = worldDirToLocal(bill, 0, -1);
  const flat = worldDirToLocal(bill, 1, 0);
  const p = { ...pose };
  const plant = (
    thighK: "lThigh" | "rThigh",
    shinK: "lShin" | "rShin",
    footK: "lFoot" | "rFoot",
    split: number,
  ) => {
    const thighT = down + split;
    const shinT = thighT - 0.42;
    p[thighK] = mixAng(p[thighK], thighT, u);
    p[shinK] = mixAng(p[shinK], shinT, u);
    p[footK] = mixAng(p[footK] ?? p[shinK], flat, u);
  };
  plant("lThigh", "lShin", "lFoot", 0.07);
  plant("rThigh", "rShin", "rFoot", -0.05);
  return clampLimbPose(p);
}

type JointName = keyof Pose;

interface Rig {
  com: Pt;
  back: Pt;
  belly: Pt;
  chest: Pt;
  lumbar: Pt;
  thoracic: Pt;
  lHip: Pt;
  rHip: Pt;
  lKnee: Pt;
  rKnee: Pt;
  lAnkle: Pt;
  rAnkle: Pt;
  lFoot: Pt;
  rFoot: Pt;
  neck: Pt;
  head: Pt;
  hair: Pt;
  lThighMid: Pt;
  rThighMid: Pt;
  lShinMid: Pt;
  rShinMid: Pt;
  lSh: Pt;
  rSh: Pt;
  lElb: Pt;
  rElb: Pt;
  lHand: Pt;
  rHand: Pt;
}

type RigName = keyof Rig;

function makeRig(pose: Pose, airFeet: boolean): Rig {
  const chain = torsoChain(pose);
  const neck = chain.neck;
  const head = chain.head;
  const { lSh, rSh } = poseShoulders(chain);
  const lHip: Pt = { x: -0.03 - pose.lean * 0.1, y: -0.01 };
  const rHip: Pt = { x: 0.03 - pose.lean * 0.1, y: -0.01 };
  const lKnee = polar(lHip, pose.lThigh, 0.46);
  const rKnee = polar(rHip, pose.rThigh, 0.46);
  const lAnkle = polar(lKnee, pose.lShin, 0.36);
  const rAnkle = polar(rKnee, pose.rShin, 0.36);
  const lElb = polar(lSh, pose.lArm, 0.32);
  const rElb = polar(rSh, pose.rArm, 0.32);
  const lHand = polar(lElb, pose.lFore, 0.3);
  const rHand = polar(rElb, pose.rFore, 0.3);
  const lFoot = polar(lAnkle, airFeet ? (pose.lFoot ?? pose.lShin) : 0, 0.18);
  const rFoot = polar(rAnkle, airFeet ? (pose.rFoot ?? pose.rShin) : 0, 0.18);
  return {
    com: { x: 0, y: 0.04 },
    back: { x: chain.lumbar.x - 0.09, y: chain.lumbar.y },
    belly: { x: chain.lumbar.x + 0.08, y: chain.lumbar.y },
    chest: { x: (lSh.x + rSh.x) * 0.5, y: (lSh.y + rSh.y) * 0.5 },
    lumbar: chain.lumbar,
    thoracic: chain.thoracic,
    lHip,
    rHip,
    lKnee,
    rKnee,
    lAnkle,
    rAnkle,
    lFoot,
    rFoot,
    neck,
    head,
    hair: { x: head.x - 0.05, y: head.y - 0.22 },
    lThighMid: { x: (lHip.x + lKnee.x) * 0.5, y: (lHip.y + lKnee.y) * 0.5 },
    rThighMid: { x: (rHip.x + rKnee.x) * 0.5, y: (rHip.y + rKnee.y) * 0.5 },
    lShinMid: { x: (lKnee.x + lAnkle.x) * 0.5, y: (lKnee.y + lAnkle.y) * 0.5 },
    rShinMid: { x: (rKnee.x + rAnkle.x) * 0.5, y: (rKnee.y + rAnkle.y) * 0.5 },
    lSh,
    rSh,
    lElb,
    rElb,
    lHand,
    rHand,
  };
}

interface BodySample {
  x: number;
  y: number;
  r: number;
  kind: "core" | "limb";
  rig: RigName;
  joints?: JointName[];
}

/** Collision samples matching the drawn skeleton (head, hands, feet, torso). */
function bodyWorldPoints(bill: Bill): BodySample[] {
  const pose = bill.rag ? bill.rag.pose : poseFor(bill, 0);
  const airFeet = !!(bill.rag || bill.state === "air");
  const rig = makeRig(pose, airFeet);
  const samples: { rig: RigName; r: number; kind: "core" | "limb"; joints?: JointName[] }[] = [
    { rig: "com", r: 0.13, kind: "core" },
    { rig: "back", r: 0.13, kind: "core" },
    { rig: "belly", r: 0.13, kind: "core" },
    { rig: "chest", r: 0.13, kind: "core" },
    { rig: "lumbar", r: 0.1, kind: "limb", joints: ["spineLumbar"] },
    { rig: "thoracic", r: 0.1, kind: "limb", joints: ["spineThoracic", "spineLumbar"] },
    { rig: "lHip", r: 0.11, kind: "core" },
    { rig: "rHip", r: 0.11, kind: "core" },
    { rig: "neck", r: 0.1, kind: "limb", joints: ["spineCervical", "spineThoracic"] },
    { rig: "head", r: 0.22, kind: "core" },
    { rig: "hair", r: 0.14, kind: "core" },
    { rig: "lSh", r: 0.08, kind: "core" },
    { rig: "rSh", r: 0.08, kind: "core" },
    { rig: "lKnee", r: 0.08, kind: "limb", joints: ["lThigh"] },
    { rig: "rKnee", r: 0.08, kind: "limb", joints: ["rThigh"] },
    { rig: "lThighMid", r: 0.09, kind: "limb", joints: ["lThigh"] },
    { rig: "rThighMid", r: 0.09, kind: "limb", joints: ["rThigh"] },
    { rig: "lAnkle", r: 0.07, kind: "limb", joints: ["lShin", "lThigh"] },
    { rig: "rAnkle", r: 0.07, kind: "limb", joints: ["rShin", "rThigh"] },
    { rig: "lShinMid", r: 0.08, kind: "limb", joints: ["lShin", "lThigh"] },
    { rig: "rShinMid", r: 0.08, kind: "limb", joints: ["rShin", "rThigh"] },
    { rig: "lFoot", r: 0.09, kind: "limb", joints: ["lFoot", "lShin", "lThigh"] },
    { rig: "rFoot", r: 0.09, kind: "limb", joints: ["rFoot", "rShin", "rThigh"] },
    { rig: "lElb", r: 0.06, kind: "limb", joints: ["lArm"] },
    { rig: "rElb", r: 0.06, kind: "limb", joints: ["rArm"] },
    { rig: "lHand", r: 0.055, kind: "limb", joints: ["lFore", "lArm"] },
    { rig: "rHand", r: 0.055, kind: "limb", joints: ["rFore", "rArm"] },
  ];
  return samples.map((s) => {
    const p = rig[s.rig];
    const w = worldOf(bill, p.x, p.y);
    return { x: w.x, y: w.y, r: s.r, kind: s.kind, rig: s.rig, joints: s.joints };
  });
}

/** Bend a limb out of a solid instead of using it as a prop for the torso. */
function foldLimb(
  bill: Bill,
  pose: Pose,
  vel: Pose,
  rigKey: RigName,
  airFeet: boolean,
  nx: number,
  ny: number,
  depth: number,
  joints: JointName[],
): void {
  fillSpine(pose);
  let left = depth;
  for (const joint of joints) {
    if (left < 0.002) return;
    const orig = pose[joint] ?? 0;
    const p0 = makeRig(pose, airFeet)[rigKey];
    const w0 = worldOf(bill, p0.x, p0.y);
    let bestGain = 0;
    let bestStep = 0;
    for (const probe of [0.08, -0.08]) {
      pose[joint] = orig + probe;
      clampLimbPose(pose);
      const actual = pose[joint] - orig;
      const p1 = makeRig(pose, airFeet)[rigKey];
      const w1 = worldOf(bill, p1.x, p1.y);
      pose[joint] = orig;
      if (Math.abs(actual) < 1e-4) continue;
      const gain = (w1.x - w0.x) * nx + (w1.y - w0.y) * ny;
      if (gain > bestGain) {
        bestGain = gain;
        bestStep = actual;
      }
    }
    if (bestGain < 1e-4) continue;
    const scale = Math.min(1, left / bestGain);
    pose[joint] = orig + bestStep * scale;
    clampLimbPose(pose);
    vel[joint] = (vel[joint] ?? 0) * 0.18;
    enforceRagdollJoints(bill);
    const now = makeRig(pose, airFeet)[rigKey];
    const w = worldOf(bill, now.x, now.y);
    left -= (w.x - w0.x) * nx + (w.y - w0.y) * ny;
  }
  if (left > 0.08 && joints[0] && bill.barProtectT <= 0) {
    noteSnap(bill, joints[0], 0, Math.abs(vel[joints[0]] ?? 0), left);
  }
}

function drawShirt(
  ctx: CanvasRenderingContext2D,
  chain: TorsoChain,
  lHip: Pt,
  rHip: Pt,
  collar: Pt,
): void {
  const L = chain.lumbar;
  const T = chain.thoracic;
  const frontL = chain.lumAng - Math.PI / 2;
  const backL = chain.lumAng + Math.PI / 2;
  const frontC = chain.chestAng - Math.PI / 2;
  const backC = chain.chestAng + Math.PI / 2;
  const open = Math.max(0, chain.chestAng - Math.PI / 2);
  const puff = 0.04 * Math.min(1, open / 0.7);
  const backLumbar = polar(L, backL, 0.1);
  const frontLumbar = polar(L, frontL, 0.12);
  const backChest = polar(T, backC, 0.11);
  const frontChest = polar(T, frontC, 0.13 + puff);
  const nape = polar(collar, backC, 0.1);
  const yoke = polar(collar, frontC, 0.12 + puff * 0.5);
  const shade = ctx.createLinearGradient(frontChest.x, frontChest.y, backLumbar.x, backLumbar.y);
  shade.addColorStop(0, SHIRT_LIT);
  shade.addColorStop(0.45, SHIRT);
  shade.addColorStop(1, "#4e545a");
  ctx.fillStyle = shade;
  ctx.strokeStyle = SHIRT_DARK;
  ctx.lineWidth = 0.028;
  ctx.beginPath();
  ctx.moveTo(lHip.x - 0.07, lHip.y - 0.04);
  ctx.quadraticCurveTo(backLumbar.x, backLumbar.y, backChest.x, backChest.y);
  ctx.lineTo(nape.x, nape.y);
  ctx.lineTo(yoke.x, yoke.y);
  ctx.quadraticCurveTo(frontChest.x, frontChest.y, frontLumbar.x, frontLumbar.y);
  ctx.lineTo(rHip.x + 0.09, rHip.y - 0.04);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function strokeColored(
  ctx: CanvasRenderingContext2D,
  color: string,
  width: number,
  ...pts: Pt[]
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i]!.x, pts[i]!.y);
  }
  ctx.stroke();
}

function fillDot(ctx: CanvasRenderingContext2D, p: Pt, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, TAU);
  ctx.fill();
}

function drawBandage(
  ctx: CanvasRenderingContext2D,
  at: Pt,
  along: number,
  rx: number,
  ry: number,
): void {
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(along);
  ctx.fillStyle = "#efe4cc";
  ctx.strokeStyle = "#c8b48a";
  ctx.lineWidth = 0.014;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "rgba(176, 148, 108, 0.6)";
  ctx.lineWidth = 0.01;
  ctx.lineCap = "round";
  for (const y of [-ry * 0.42, 0.004, ry * 0.38]) {
    ctx.beginPath();
    ctx.moveTo(-rx * 0.82, y - 0.01);
    ctx.lineTo(rx * 0.82, y + 0.012);
    ctx.stroke();
  }
  ctx.fillStyle = "#d9c49a";
  ctx.beginPath();
  ctx.ellipse(rx * 0.12, 0, ry * 0.42, ry * 0.32, 0.4, 0, TAU);
  ctx.fill();
  ctx.restore();
}

const EYE = "#3a2a22";
const MOUTH = "#b56c5e";
const MOUTH_DARK = "#8a4a40";
const TEETH = "#f6f1ea";
const BROW = "#6a5040";
const BLUSH = "rgba(214, 118, 108, 0.38)";

type FaceMood = "idle" | "run" | "back" | "focus" | "tuck" | "grin" | "wince" | "shock" | "dazed" | "win" | "angry";

function faceMood(bill: Bill): FaceMood {
  if (bill.gapFail) return "angry";
  if (bill.state === "dead") return "dazed";
  if (bill.state === "done" || bill.cleared) return "win";
  if (!bill.engaged && bill.sore.size && bill.state === "ground" && !bill.rag) return "wince";
  if (bill.rag) {
    if (bill.state === "fallen") {
      const rag = bill.rag;
      return rag.age < 0.32 || Math.abs(rag.omega) > 4 ? "shock" : "dazed";
    }
    return "wince";
  }
  if (bill.state === "swing") return "focus";
  if (bill.state === "air") {
    if (!bill.flipping) return "shock";
    if (bill.panic > 0.22) return "shock";
    if (bill.tuck >= 0.7) return "tuck";
    return "focus";
  }
  if (bill.cushion > 0.14) return "grin";
  if (Math.abs(bill.vx) > 0.35) {
    return bill.vx * bill.facing < -0.12 ? "back" : "run";
  }
  return "idle";
}

function drawHeadProfile(ctx: CanvasRenderingContext2D, head: Pt, bill: Bill, t: number): void {
  const hx = head.x;
  const hy = head.y;
  const shade = ctx.createLinearGradient(hx + 0.14, hy + 0.12, hx - 0.12, hy - 0.12);
  shade.addColorStop(0, SKIN_LIT);
  shade.addColorStop(0.52, SKIN);
  shade.addColorStop(1, SKIN_SHADE);
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.ellipse(hx + 0.02, hy, 0.145, 0.162, 0.12, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(hx + 0.06, hy + 0.1);
  ctx.quadraticCurveTo(hx + 0.16, hy + 0.08, hx + 0.2, hy + 0.02);
  ctx.lineTo(hx + 0.19, hy - 0.01);
  ctx.quadraticCurveTo(hx + 0.13, hy - 0.04, hx + 0.12, hy - 0.07);
  ctx.quadraticCurveTo(hx + 0.14, hy - 0.12, hx + 0.06, hy - 0.155);
  ctx.quadraticCurveTo(hx - 0.02, hy - 0.17, hx - 0.08, hy - 0.08);
  ctx.quadraticCurveTo(hx - 0.1, hy, hx - 0.04, hy + 0.08);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = SKIN_LINE;
  ctx.lineWidth = 0.015;
  ctx.stroke();
  drawFace(ctx, hx, hy, faceMood(bill), t);
}

function drawFace(ctx: CanvasRenderingContext2D, hx: number, hy: number, mood: FaceMood, t: number): void {
  const blink =
    (mood === "idle" || mood === "run" || mood === "back" || mood === "focus") && t % 3.35 > 3.22;
  const eye: Pt = { x: hx + 0.082, y: hy + 0.038 };
  const mouth: Pt = { x: hx + 0.112, y: hy - 0.052 };

  if (mood === "tuck" || mood === "run" || mood === "wince" || mood === "angry") {
    ctx.fillStyle = mood === "angry" ? "rgba(196, 60, 42, 0.42)" : BLUSH;
    ctx.beginPath();
    ctx.ellipse(hx + 0.07, hy - 0.01, 0.032, 0.018, 0.2, 0, TAU);
    ctx.fill();
  }

  ctx.strokeStyle = BROW;
  ctx.lineCap = "round";
  ctx.lineWidth = 0.018;
  ctx.beginPath();
  if (mood === "angry") {
    ctx.moveTo(hx + 0.026, hy + 0.102);
    ctx.lineTo(hx + 0.122, hy + 0.062);
  } else if (mood === "shock" || mood === "focus") {
    ctx.moveTo(hx + 0.03, hy + 0.092);
    ctx.lineTo(hx + 0.125, hy + 0.1);
  } else if (mood === "wince" || mood === "tuck") {
    ctx.moveTo(hx + 0.028, hy + 0.07);
    ctx.lineTo(hx + 0.13, hy + 0.052);
  } else if (mood === "grin" || mood === "win") {
    ctx.moveTo(hx + 0.03, hy + 0.078);
    ctx.quadraticCurveTo(hx + 0.08, hy + 0.092, hx + 0.128, hy + 0.074);
  } else if (mood === "back") {
    ctx.moveTo(hx + 0.03, hy + 0.086);
    ctx.lineTo(hx + 0.122, hy + 0.07);
  } else {
    ctx.moveTo(hx + 0.032, hy + 0.08);
    ctx.lineTo(hx + 0.124, hy + 0.078);
  }
  ctx.stroke();

  if (mood === "dazed") {
    ctx.strokeStyle = EYE;
    ctx.lineWidth = 0.016;
    ctx.beginPath();
    ctx.moveTo(eye.x - 0.028, eye.y + 0.02);
    ctx.lineTo(eye.x + 0.028, eye.y - 0.02);
    ctx.moveTo(eye.x - 0.028, eye.y - 0.02);
    ctx.lineTo(eye.x + 0.028, eye.y + 0.02);
    ctx.stroke();
  } else if (blink || mood === "wince") {
    ctx.strokeStyle = EYE;
    ctx.lineWidth = 0.016;
    ctx.beginPath();
    if (mood === "wince") {
      ctx.moveTo(eye.x - 0.03, eye.y + 0.008);
      ctx.quadraticCurveTo(eye.x, eye.y - 0.012, eye.x + 0.032, eye.y + 0.004);
    } else {
      ctx.moveTo(eye.x - 0.028, eye.y);
      ctx.quadraticCurveTo(eye.x, eye.y - 0.006, eye.x + 0.03, eye.y);
    }
    ctx.stroke();
  } else {
    const wide = mood === "shock" ? 0.034 : mood === "focus" ? 0.03 : mood === "angry" ? 0.028 : 0.026;
    const tall =
      mood === "shock"
        ? 0.034
        : mood === "angry"
          ? 0.014
          : mood === "run" || mood === "tuck"
            ? 0.018
            : mood === "grin" || mood === "win"
              ? 0.02
              : 0.024;
    ctx.fillStyle = EYE;
    ctx.beginPath();
    ctx.ellipse(eye.x, eye.y, wide, tall, 0.12, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.ellipse(eye.x + 0.008, eye.y + 0.008, wide * 0.28, tall * 0.28, 0, 0, TAU);
    ctx.fill();
  }

  ctx.strokeStyle = MOUTH;
  ctx.fillStyle = MOUTH_DARK;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 0.016;
  ctx.beginPath();
  if (mood === "shock") {
    ctx.ellipse(mouth.x + 0.008, mouth.y - 0.004, 0.022, 0.028, 0.1, 0, TAU);
    ctx.fill();
    ctx.stroke();
  } else if (mood === "angry") {
    ctx.moveTo(mouth.x - 0.03, mouth.y - 0.004);
    ctx.quadraticCurveTo(mouth.x + 0.002, mouth.y + 0.022, mouth.x + 0.034, mouth.y - 0.002);
    ctx.stroke();
    ctx.fillStyle = TEETH;
    ctx.fillRect(mouth.x - 0.016, mouth.y - 0.006, 0.032, 0.01);
    ctx.strokeRect(mouth.x - 0.016, mouth.y - 0.006, 0.032, 0.01);
  } else if (mood === "tuck") {
    ctx.moveTo(mouth.x - 0.028, mouth.y + 0.006);
    ctx.lineTo(mouth.x + 0.03, mouth.y + 0.004);
    ctx.stroke();
    ctx.fillStyle = TEETH;
    ctx.fillRect(mouth.x - 0.018, mouth.y - 0.004, 0.038, 0.012);
    ctx.strokeRect(mouth.x - 0.018, mouth.y - 0.004, 0.038, 0.012);
  } else if (mood === "run") {
    ctx.moveTo(mouth.x - 0.026, mouth.y);
    ctx.lineTo(mouth.x + 0.028, mouth.y + 0.006);
    ctx.stroke();
  } else if (mood === "wince") {
    ctx.moveTo(mouth.x - 0.024, mouth.y + 0.004);
    ctx.lineTo(mouth.x - 0.006, mouth.y - 0.008);
    ctx.lineTo(mouth.x + 0.01, mouth.y + 0.006);
    ctx.lineTo(mouth.x + 0.028, mouth.y - 0.004);
    ctx.stroke();
  } else if (mood === "dazed") {
    ctx.moveTo(mouth.x - 0.026, mouth.y);
    ctx.quadraticCurveTo(mouth.x - 0.004, mouth.y + 0.016, mouth.x + 0.012, mouth.y);
    ctx.quadraticCurveTo(mouth.x + 0.024, mouth.y - 0.012, mouth.x + 0.034, mouth.y + 0.004);
    ctx.stroke();
  } else if (mood === "back") {
    ctx.moveTo(mouth.x - 0.02, mouth.y + 0.004);
    ctx.quadraticCurveTo(mouth.x + 0.006, mouth.y - 0.01, mouth.x + 0.03, mouth.y);
    ctx.stroke();
  } else if (mood === "grin" || mood === "win") {
    ctx.fillStyle = MOUTH_DARK;
    ctx.moveTo(mouth.x - 0.03, mouth.y + 0.004);
    ctx.quadraticCurveTo(mouth.x + 0.004, mouth.y - 0.034, mouth.x + 0.038, mouth.y + 0.008);
    ctx.quadraticCurveTo(mouth.x + 0.004, mouth.y - 0.008, mouth.x - 0.03, mouth.y + 0.004);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (mood === "win") {
      ctx.fillStyle = TEETH;
      ctx.beginPath();
      ctx.moveTo(mouth.x - 0.016, mouth.y - 0.002);
      ctx.lineTo(mouth.x + 0.02, mouth.y);
      ctx.lineTo(mouth.x + 0.018, mouth.y - 0.01);
      ctx.lineTo(mouth.x - 0.014, mouth.y - 0.012);
      ctx.closePath();
      ctx.fill();
    }
  } else if (mood === "focus") {
    ctx.moveTo(mouth.x - 0.02, mouth.y);
    ctx.quadraticCurveTo(mouth.x + 0.004, mouth.y - 0.012, mouth.x + 0.028, mouth.y + 0.002);
    ctx.stroke();
  } else {
    ctx.moveTo(mouth.x - 0.018, mouth.y);
    ctx.quadraticCurveTo(mouth.x + 0.004, mouth.y - 0.008, mouth.x + 0.026, mouth.y + 0.002);
    ctx.stroke();
  }
}

function footAngle(bill: Bill, shin: number, thigh: number): number {
  if (bill.rag) return shin;
  if (bill.board?.on && (bill.state === "ground" || bill.state === "slide")) {
    if (bill.pushKick > 0.28 && Math.abs(wrapPi(thigh - shin)) < 2) {
      const kickShin = wrapPi(shin + Math.PI / 2) > 0.2;
      if (kickShin || thigh < -Math.PI / 2 - 0.2) return shin;
    }
    return 0;
  }
  if (bill.state === "slide" && !bill.board?.on) return -Math.PI / 2;
  if (bill.state === "air") {
    if (bill.landPrep > 0.04) {
      const flat = worldDirToLocal(bill, 1, 0);
      return mixAng(shin, flat, bill.landPrep);
    }
    return shin;
  }
  const hang = -Math.PI / 2;
  const idle = bill.state === "ground" && Math.abs(bill.vx) < 0.28 && !bill.celebrating;
  const lifted =
    idle && (Math.abs(wrapPi(thigh - hang)) > 0.28 || Math.abs(wrapPi(shin - hang)) > 0.5);
  if (lifted) {
    // Keep a ~90° ankle so a raised stretch foot isn't glued to the floor.
    return wrapPi(shin + Math.PI / 2);
  }
  const rel = wrapPi(shin - hang);
  // Trailing shin: toe points down a little. Leading/planted: flatter along the ground.
  if (rel < 0) return clamp(rel * 0.7, -0.62, 0);
  return clamp(rel * 0.28, 0, 0.38);
}

function drawTrainerFront(ctx: CanvasRenderingContext2D, ankle: Pt): void {
  ctx.save();
  ctx.translate(ankle.x, ankle.y);
  ctx.fillStyle = SHOE;
  ctx.beginPath();
  ctx.ellipse(0.01, -0.008, 0.068, 0.052, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = SHOE_SOLE;
  ctx.beginPath();
  ctx.ellipse(0.01, -0.04, 0.072, 0.02, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawTrainer(ctx: CanvasRenderingContext2D, ankle: Pt, ang: number): void {
  ctx.save();
  ctx.translate(ankle.x, ankle.y);
  ctx.rotate(ang);
  ctx.fillStyle = SHOE;
  ctx.beginPath();
  ctx.ellipse(0.09, 0.0, 0.125, 0.048, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = SHOE_SOLE;
  ctx.beginPath();
  ctx.ellipse(0.09, -0.03, 0.125, 0.022, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawHairBack(ctx: CanvasRenderingContext2D, head: Pt, arch: number): void {
  ctx.save();
  ctx.translate(head.x, head.y);
  ctx.rotate(-arch * 0.35);
  ctx.fillStyle = HAIR;
  ctx.beginPath();
  ctx.ellipse(-0.02, 0.08, 0.14, 0.12, -0.35, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-0.14, 0.04);
  ctx.quadraticCurveTo(-0.2, -0.08, -0.12, -0.28);
  ctx.quadraticCurveTo(-0.02, -0.32, 0.04, -0.18);
  ctx.quadraticCurveTo(0.02, -0.02, -0.02, 0.08);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = HAIR_DARK;
  ctx.lineCap = "round";
  ctx.lineWidth = 0.048;
  ctx.beginPath();
  ctx.moveTo(-0.08, 0.02);
  ctx.quadraticCurveTo(-0.14, -0.1, -0.08, -0.26);
  ctx.stroke();
  ctx.restore();
}

function drawHairFront(ctx: CanvasRenderingContext2D, head: Pt, arch: number): void {
  ctx.save();
  ctx.translate(head.x, head.y);
  ctx.rotate(-arch * 0.35);
  ctx.fillStyle = HAIR;
  // Side mass over the ear — stops short of the back-hair length.
  ctx.beginPath();
  ctx.ellipse(-0.05, 0.015, 0.09, 0.125, -0.22, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-0.12, 0.1);
  ctx.quadraticCurveTo(-0.15, -0.02, -0.08, -0.14);
  ctx.quadraticCurveTo(-0.02, -0.2, 0.04, -0.08);
  ctx.quadraticCurveTo(0.02, 0.04, -0.04, 0.13);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0.02, 0.13, 0.1, 0.04, 0.55, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = HAIR_DARK;
  ctx.lineCap = "round";
  ctx.lineWidth = 0.036;
  ctx.beginPath();
  ctx.moveTo(-0.02, 0.14);
  ctx.quadraticCurveTo(0.08, 0.12, 0.1, 0.04);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-0.08, 0.04);
  ctx.quadraticCurveTo(-0.1, -0.04, -0.05, -0.14);
  ctx.stroke();
  ctx.restore();
}
