import { degToRad, HIP_HEIGHT, TAU } from "./constants";
import { tuning } from "./tuning";
import {
  approachingSolid,
  groundAt,
  onFlagPlatform,
  pushOutOfSolid,
  spawnGround,
  START_WALL_X,
  type Level,
} from "./world";

export type BillState = "ground" | "air" | "stumble" | "fallen" | "dead" | "done";

export type LandKind = "clean" | "stumble" | "fall";

export interface LandEvent {
  kind: LandKind;
  x: number;
  y: number;
  /** Full backflips completed this jump (nearest whole spin). */
  spins: number;
  /** Seconds held at full layout during this flip. */
  layoutHold: number;
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
  flipTravel = 0;
  flipDuration = tuning.flipDurationSlow;
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
    this.flipTravel = 0;
    this.flipDuration = tuning.flipDurationSlow;
    this.airTime = 0;
    this.flipping = false;
    this.tuck = 0.5;
    this.layoutHold = 0;
    this.cushion = 0;
    this.spinRate = 0;
    this.rag = null;
    this.landEvent = null;
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
    this.snapEvents.length = 0;
    this.time += dt;
    this.died = false;
    this.finished = false;
    this.restarted = false;
    if (touched) this.engaged = true;
    for (let i = this.snapFlashes.length - 1; i >= 0; i--) {
      const f = this.snapFlashes[i]!;
      f.life -= dt;
      if (f.life <= 0) this.snapFlashes.splice(i, 1);
    }

    if (this.state === "dead") return;
    if (this.state === "done") {
      if (this.celebrating) this.celebrateT += dt;
      return;
    }

    if (this.rag) {
      this.stepRagdoll(dt, level);
      this.checkGapDeath(level);
      this.tryFinish(level);
      return;
    }

    if (this.state === "ground") {
      this.tuck = 0.5;
      this.cushion = Math.max(0, this.cushion - dt * 1.45);
      if (!this.cleared) this.tryFinish(level);
      this.groundMove(dt, run);
      this.snapToGround(level);
      this.applyCushionDrop(level);
      const spd = Math.min(1, Math.abs(this.vx) / tuning.maxSpeed);
      this.runPhase += Math.abs(this.vx) * dt * (2.05 + 0.85 * spd);
      if (jump && !this.cleared) this.takeOff();
      this.checkGapDeath(level);
      this.tryFinish(level);
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
    } else {
      const spd = Math.min(1, Math.abs(this.vx) / tuning.maxSpeed);
      this.runPhase += (2.6 + 2.4 * spd) * dt;
      const pitch = -0.22 - Math.min(0.5, this.airTime * 0.9);
      this.rot += (pitch - this.rot) * (1 - Math.exp(-5.5 * dt));
      this.spinRate = 0;
    }

    this.updateBrace(dt, level);

    const g = groundAt(level, this.x);
    const floorLand = g !== null && this.vy <= 0 && this.y - HIP_HEIGHT <= g + 0.08;

    if (!this.flipping) {
      const wall = this.airTime > 0.08 && this.touchingSolid(level, false);
      if (floorLand || wall) {
        this.beginRagdoll("crash", floorLand ? g : null);
        this.landEvent = this.makeLand("fall", this.x, floorLand && g !== null ? g : this.y);
        this.resolveBody(level, true);
      } else {
        this.resolveBody(level, false);
      }
    } else if (floorLand) {
      this.land(g);
      if (this.rag) this.resolveBody(level, true);
    } else if (this.touchingSolid(level, false, this.brace < 0.28)) {
      this.beginRagdoll("crash", null);
      this.landEvent = this.makeLand("fall", this.x, this.y);
      this.resolveBody(level, true);
    } else {
      // Sides only in the air — floor contacts during a flip were lifting him
      // so the hips never got close enough to land.
      this.resolveBody(level, false);
    }

    this.checkGapDeath(level);
    this.tryFinish(level);
  }

  private onFeet(): boolean {
    return this.state === "ground" && !this.rag && Math.abs(wrapPi(this.rot)) < 0.5;
  }

  private tryFinish(level: Level): void {
    if (this.cleared) {
      if (this.onFeet() && Math.abs(this.vx) < 0.32 && onFlagPlatform(level, this.x)) {
        this.vx = 0;
        this.rot = 0;
        this.state = "done";
        this.beginCelebrate();
      }
      return;
    }
    const tumbling = !!(this.rag || this.state === "fallen" || this.state === "stumble");
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
    else this.rot = -0.26 * n * (0.4 + 0.6 * amp);
  }

  private takeOff(): void {
    this.state = "air";
    this.flipping = true;
    this.vy = tuning.jumpVy;
    this.flipTravel = 0;
    this.rot = 0;
    this.airTime = 0;
    this.tuck = 0.5;
    this.layoutHold = 0;
    this.cushion = 0;
    this.spinRate = 0;
    this.rag = null;
    const speed = Math.min(1, Math.abs(this.vx) / tuning.maxSpeed);
    this.flipDuration =
      tuning.flipDurationSlow +
      (tuning.flipDurationFast - tuning.flipDurationSlow) * speed;
  }

  private land(g: number): void {
    this.y = g + HIP_HEIGHT;
    const ang = wrapPi(this.rot);
    const off = Math.abs(ang);
    const extend = Math.max(0, 1 - this.tuck);
    const cleanAng = degToRad(tuning.cleanLandDeg);
    const stumbleAng = degToRad(tuning.stumbleLandDeg);

    this.flipping = false;

    const still = Math.abs(this.vx) < 1.7;
    const tucked = this.tuck >= tuning.hardTuck;
    // In-place tucked flips often complete near 360°, so leftover angle is tiny.
    // Landing in a ball from a standing backflip is always a dump.
    const crashAng = still ? degToRad(Math.max(30, tuning.cleanLandDeg + 8)) : stumbleAng;
    if (off > crashAng || (still && tucked) || (tucked && off > cleanAng)) {
      this.beginRagdoll("crash", g);
      this.landEvent = this.makeLand("fall", this.x, g);
      return;
    }

    // Feet down and not in a ball: stick it. More extension = more knee cushion.
    if (off <= cleanAng && !tucked) {
      this.state = "ground";
      this.rot = 0;
      this.tuck = 0.5;
      this.cushion = 0.22 + 0.78 * extend;
      this.y = g + HIP_HEIGHT * (1 - 0.42 * this.cushion);
      this.landEvent = this.makeLand("clean", this.x, g);
      return;
    }

    this.beginRagdoll("hard", g);
    this.landEvent = this.makeLand("stumble", this.x, g);
  }

  private makeLand(kind: LandKind, x: number, y: number): LandEvent {
    return {
      kind,
      x,
      y,
      spins: Math.max(0, Math.round(this.flipTravel / TAU)),
      layoutHold: this.layoutHold,
    };
  }

  private beginRagdoll(kind: "hard" | "crash", g: number | null): void {
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

    const stopped = rag.stillTime >= 0.12;
    const timedOut = rag.age >= rag.maxAge;
    // After a standing finish he may tumble off a ledge — let that play out until
    // he actually stops (or hits killY). Fail ragdolls still cap at maxAge.
    if (this.cleared) {
      if (!stopped) return;
    } else if (!stopped && !timedOut) {
      return;
    }

    const crash = this.state === "fallen";
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
    if (crash || timedOut) {
      this.restarted = true;
      return;
    }
    this.state = "ground";
    this.rot = 0;
    if (onGround) this.y = floor + HIP_HEIGHT;
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

  private touchingSolid(level: Level, floorToo: boolean, coreOnly = false): boolean {
    for (const pt of bodyWorldPoints(this)) {
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
      for (const pt of pts) {
        const hit = pushOutOfSolid(level, pt.x, pt.y, pt.r);
        if (!hit) continue;
        if (!floorToo && hit.ny > 0.5) continue;
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
      if (rag && pass === 0) {
        const floorSpeed = up > 0 ? Math.max(0, -this.vy) : 0;
        const wallSpeed =
          left > right ? Math.max(0, this.vx) : right > left ? Math.max(0, -this.vx) : 0;
        const impact = Math.max(floorSpeed, wallSpeed);
        // Resting contact is only about gravity*dt (~0.8). A real hit is faster.
        if (impact > 2) {
          const slide = floorSpeed >= wallSpeed ? this.vx : this.vy;
          joltPose(rag, impact, slide);
        }
      }
      this.y += up;
      if (right > left) this.x += right;
      else if (left > 0) this.x -= left;
      if (up > 0 && this.vy < 0 && (!rag || coreHit)) this.vy = 0;
      if (right > left) this.vx = Math.max(0, this.vx);
      else if (left > right) this.vx = Math.min(0, this.vx);
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
    const floor = groundAt(level, this.x);
    if (floor !== null) this.y = floor + HIP_HEIGHT * (1 - 0.42 * this.cushion);
  }

  private snapToGround(level: Level): void {
    const g = groundAt(level, this.x);
    if (g === null || this.y - HIP_HEIGHT - g > 0.2) {
      this.state = "air";
      this.flipping = false;
      this.vy = Math.min(this.vy, 0);
      this.airTime = 0;
      return;
    }
    if (this.state !== "fallen") this.y = g + HIP_HEIGHT;
  }

  private beginCelebrate(): void {
    this.celebrating = true;
    this.celebrateT = 0;
  }

  private checkGapDeath(level: Level): void {
    if (this.y < level.killY) {
      if (this.cleared) {
        this.state = "done";
        this.vx = 0;
        this.vy = 0;
        return;
      }
      this.state = "dead";
      this.died = true;
      this.vx = 0;
      this.vy = 0;
    }
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
const SKIN_LINE = "#d9ae96";
const HAIR = "#efd56a";
const HAIR_DARK = "#d4b445";
const SHIRT = "#9aa0a6";
const SHIRT_DARK = "#6e747a";
const JEANS = "#3a5c9e";
const JEANS_DARK = "#2a4478";
const SHOE = "#f6f6f4";
const SHOE_SOLE = "#c5c5c0";

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
  const chain = torsoChain(pose);
  const arch = pose.arch;
  const grounded = bill.state === "ground" && !bill.rag;
  if (grounded) {
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

  const neck = chain.neck;
  const head = chain.head;

  const lHip: Pt = { x: -0.03 - pose.lean * 0.1, y: -0.01 };
  const rHip: Pt = { x: 0.03 - pose.lean * 0.1, y: -0.01 };
  const lKnee = polar(lHip, pose.lThigh, 0.46);
  const rKnee = polar(rHip, pose.rThigh, 0.46);
  const lAnkle = polar(lKnee, pose.lShin, 0.36);
  const rAnkle = polar(rKnee, pose.rShin, 0.36);

  const cervical = pose.spineCervical ?? arch * 0.24;
  const lSh: Pt = { x: neck.x - 0.05 - cervical * 0.08, y: neck.y - 0.05 };
  const rSh: Pt = { x: neck.x - 0.04 - cervical * 0.08, y: neck.y - 0.05 };
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

  ctx.fillStyle = SHIRT;
  ctx.strokeStyle = SHIRT_DARK;
  ctx.lineWidth = 0.028;
  ctx.beginPath();
  ctx.moveTo(lSh.x - 0.05, lSh.y + 0.01);
  ctx.lineTo(rSh.x + 0.07, rSh.y);
  ctx.lineTo(rHip.x + 0.09, rHip.y - 0.05);
  ctx.lineTo(lHip.x - 0.07, lHip.y - 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  strokeColored(ctx, SKIN, 0.1, neck, head);
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
const ARM_RANGE = { min: -2.0, max: 2.45 };
const LEAN_RANGE = { min: -0.62, max: 0.88 };
const ARCH_RANGE = { min: -0.18, max: 0.95 };
const LUMBAR_RANGE = { min: -0.16, max: 0.5 };
const THORACIC_RANGE = { min: -0.14, max: 0.4 };
const CERVICAL_RANGE = { min: -0.18, max: 0.32 };
/** 0 = pointed (in line with shin). Positive = toes toward shin. */
const ANKLE_BEND = { min: -0.55, max: 1.45 };

function fillSpine(pose: Pose): void {
  pose.spineLumbar = pose.spineLumbar ?? pose.arch * 0.42;
  pose.spineThoracic = pose.spineThoracic ?? pose.arch * 0.36;
  pose.spineCervical = pose.spineCervical ?? pose.arch * 0.24;
}

function torsoChain(pose: Pose): { lumbar: Pt; thoracic: Pt; neck: Pt; head: Pt } {
  fillSpine(pose);
  const pelvis: Pt = { x: -pose.lean * 0.04, y: 0.02 };
  let ang = Math.PI / 2 + pose.lean * 0.18;
  ang += pose.spineLumbar!;
  const lumbar = polar(pelvis, ang, 0.21);
  ang += pose.spineThoracic!;
  const thoracic = polar(lumbar, ang, 0.23);
  ang += pose.spineCervical!;
  const neck = polar(thoracic, ang, 0.2);
  const head = polar(neck, ang + 0.12 + pose.lean * 0.08, 0.21);
  return { lumbar, thoracic, neck, head };
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
    return applyBrace(clampLimbPose(lerpPose(LAYOUT, CROUCH, bill.tuck)), bill);
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
  const lean = bill.cleared
    ? -0.16 - 0.3 * a
    : backpedal
      ? 0.06 + along * 0.95
      : 0.28 + 0.52 * a;

  return clampLimbPose({
    lean: lean + (bill.state === "stumble" ? 0.5 : 0) + squat * 0.28,
    arch: backpedal ? 0.04 : 0.06 * a,
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

/** Layout: arched back, full extension, arms and legs trailing the spin. */
const LAYOUT: Pose = {
  lean: -0.28,
  arch: 0.92,
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
  for (const h of hits) noteSnap(bill, h.key, h.excess, h.speed);
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
  const heapLumbar = HEAP.arch * 0.42;
  const heapThoracic = HEAP.arch * 0.36;
  const heapCervical = HEAP.arch * 0.24;
  integrateJoint(pose, vel, "spineLumbar", wrapPi((heap ? heapLumbar : 0) - pose.spineLumbar!) * (torsoStiff * 0.9), dt, heap ? 4.2 : 2.4);
  integrateJoint(pose, vel, "spineThoracic", wrapPi((heap ? heapThoracic : 0) - pose.spineThoracic!) * (torsoStiff * 0.7), dt, heap ? 3.6 : 1.8);
  integrateJoint(pose, vel, "spineCervical", wrapPi((heap ? heapCervical : 0) - pose.spineCervical!) * (torsoStiff * 0.55), dt, heap ? 3.0 : 1.35);
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
  rag.vel.spineLumbar = (rag.vel.spineLumbar ?? 0) - j * 0.38;
  rag.vel.spineThoracic = (rag.vel.spineThoracic ?? 0) + j * 0.22 + s * 0.12;
  rag.vel.spineCervical = (rag.vel.spineCervical ?? 0) + j * 0.4;
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
  const lHip: Pt = { x: -0.03 - pose.lean * 0.1, y: -0.01 };
  const rHip: Pt = { x: 0.03 - pose.lean * 0.1, y: -0.01 };
  const lKnee = polar(lHip, pose.lThigh, 0.46);
  const rKnee = polar(rHip, pose.rThigh, 0.46);
  const lAnkle = polar(lKnee, pose.lShin, 0.36);
  const rAnkle = polar(rKnee, pose.rShin, 0.36);
  const cervical = pose.spineCervical ?? pose.arch * 0.24;
  const lSh: Pt = { x: neck.x - 0.05 - cervical * 0.08, y: neck.y - 0.05 };
  const rSh: Pt = { x: neck.x - 0.04 - cervical * 0.08, y: neck.y - 0.05 };
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
    { rig: "neck", r: 0.11, kind: "core" },
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
    const scale = Math.min(1.2, left / bestGain);
    pose[joint] = orig + bestStep * scale;
    vel[joint] = (vel[joint] ?? 0) * 0.18;
    enforceRagdollJoints(bill);
    const now = makeRig(pose, airFeet)[rigKey];
    const w = worldOf(bill, now.x, now.y);
    left -= (w.x - w0.x) * nx + (w.y - w0.y) * ny;
  }
  if (left > 0.08 && joints[0]) {
    noteSnap(bill, joints[0], 0, Math.abs(vel[joints[0]] ?? 0), left);
  }
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

type FaceMood = "idle" | "run" | "back" | "focus" | "tuck" | "grin" | "wince" | "shock" | "dazed" | "win";

function faceMood(bill: Bill): FaceMood {
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
  if (bill.state === "air") {
    if (!bill.flipping) return "shock";
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
  ctx.fillStyle = SKIN;
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

  if (mood === "tuck" || mood === "run" || mood === "wince") {
    ctx.fillStyle = BLUSH;
    ctx.beginPath();
    ctx.ellipse(hx + 0.07, hy - 0.01, 0.032, 0.018, 0.2, 0, TAU);
    ctx.fill();
  }

  ctx.strokeStyle = BROW;
  ctx.lineCap = "round";
  ctx.lineWidth = 0.018;
  ctx.beginPath();
  if (mood === "shock" || mood === "focus") {
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
    const wide = mood === "shock" ? 0.034 : mood === "focus" ? 0.03 : 0.026;
    const tall =
      mood === "shock" ? 0.034 : mood === "run" || mood === "tuck" ? 0.018 : mood === "grin" || mood === "win" ? 0.02 : 0.024;
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
  if (bill.state === "air" || bill.rag) return shin;
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
