import { degToRad, HIP_HEIGHT, TAU } from "./constants";
import { tuning } from "./tuning";
import { groundAt, pushOutOfSolid, spawnGround, START_WALL_X, type Level } from "./world";

export type BillState = "ground" | "air" | "stumble" | "fallen" | "dead" | "done";

export type LandKind = "clean" | "stumble" | "fall";

export interface LandEvent {
  kind: LandKind;
  x: number;
  y: number;
}

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
  /** Knee-bend absorb after a clean, extended landing. */
  cushion = 0;
  /** Leftover flip rate, used to seed a crash ragdoll. */
  spinRate = 0;
  rag: Ragdoll | null = null;
  name = "Backflip Bill";
  landEvent: LandEvent | null = null;
  died = false;
  finished = false;
  /** Crash ragdoll finished — send back to the level spawn. */
  restarted = false;

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
    this.cushion = 0;
    this.spinRate = 0;
    this.rag = null;
    this.landEvent = null;
    this.died = false;
    this.finished = false;
    this.restarted = false;
  }

  public step(dt: number, run: number, jump: boolean, tuckAxis: number, level: Level): void {
    this.landEvent = null;
    this.died = false;
    this.finished = false;
    this.restarted = false;

    if (this.state === "dead") return;
    if (this.state === "done") return;

    if (this.rag) {
      this.stepRagdoll(dt, level);
      this.checkGapDeath(level);
      return;
    }

    if (this.state === "ground") {
      this.tuck = 0.5;
      this.cushion = Math.max(0, this.cushion - dt * 1.45);
      this.groundMove(dt, run);
      this.snapToGround(level);
      this.applyCushionDrop(level);
      const spd = Math.min(1, Math.abs(this.vx) / tuning.maxSpeed);
      this.runPhase += Math.abs(this.vx) * dt * (2.05 + 0.85 * spd);
      if (jump) this.takeOff();
      this.checkGapDeath(level);
      if (this.state === "ground" && this.x >= level.flagX) {
        this.state = "done";
        this.finished = true;
        this.vx = 0;
      }
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
    } else {
      this.rot = 0;
      this.spinRate = 0;
    }

    const g = groundAt(level, this.x);
    if (g !== null && this.vy <= 0 && this.y - HIP_HEIGHT <= g + 0.08) {
      this.land(g);
      if (this.rag) this.resolveBody(level, true);
    } else {
      // Sides only in the air — floor contacts during a flip were lifting him
      // so the hips never got close enough to land.
      this.resolveBody(level, false);
    }

    this.checkGapDeath(level);
  }

  private groundMove(dt: number, run: number): void {
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
      const next = Math.max(0, mag - tuning.decel * dt);
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
    this.rot = -0.26 * n * (0.4 + 0.6 * amp);
  }

  private takeOff(): void {
    this.state = "air";
    this.flipping = true;
    this.vy = tuning.jumpVy;
    this.flipTravel = 0;
    this.rot = 0;
    this.airTime = 0;
    this.tuck = 0.5;
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
      this.landEvent = { kind: "fall", x: this.x, y: g };
      return;
    }

    // Feet down and not in a ball: stick it. More extension = more knee cushion.
    if (off <= cleanAng && !tucked) {
      this.state = "ground";
      this.rot = 0;
      this.tuck = 0.5;
      this.cushion = 0.22 + 0.78 * extend;
      this.y = g + HIP_HEIGHT * (1 - 0.42 * this.cushion);
      this.landEvent = { kind: "clean", x: this.x, y: g };
      return;
    }

    this.beginRagdoll("hard", g);
    this.landEvent = { kind: "stumble", x: this.x, y: g };
  }

  private beginRagdoll(kind: "hard" | "crash", g: number): void {
    const crash = kind === "crash";
    const impact = Math.max(0, -this.vy);
    const slide = this.vx;
    const speed = Math.abs(slide);
    const rolling = speed >= 2.2;
    const spin = this.spinRate;
    const dir = Math.sign(spin || wrapPi(this.rot) || 1);
    const kick = dir * Math.min(8, speed * 0.55 + Math.abs(spin) * 0.4);
    const pose = clampLimbPose(
      rolling ? lerpPose(HEAP, lerpPose(LAYOUT, CROUCH, this.tuck), 0.4) : { ...HEAP },
    );
    this.state = crash ? "fallen" : "stumble";
    this.flipping = false;
    this.tuck = 0.5;
    this.cushion = 0;
    this.lockTimer = 0;
    this.rot = wrapPi(this.rot);
    this.vy = 0.4;
    this.y = g + 0.34;
    if (rolling) {
      this.vx *= 0.94;
    } else {
      this.vx = 0;
      if (Math.abs(this.rot) < 1.7) this.rot = dir * 1.62;
    }
    const omega = rolling
      ? clamp(spin * 0.8 + dir * speed * 0.22, -12, 12)
      : dir * 1.05;
    const rag: Ragdoll = {
      pose,
      vel: {
        lean: kick * 0.08,
        arch: crash ? -0.35 : -0.15,
        lThigh: -spin * 0.4 + kick * 0.1,
        rThigh: -spin * 0.28 - kick * 0.08,
        lShin: -spin * 0.2 + kick * 0.05,
        rShin: -spin * 0.16 - kick * 0.04,
        lArm: spin * 0.45 - kick * 0.14,
        rArm: spin * 0.35 + kick * 0.16,
        lFore: spin * 0.22 - kick * 0.06,
        rFore: spin * 0.18 + kick * 0.08,
      },
      omega,
      rolling,
      age: 0,
      stillTime: 0,
      maxAge: 8,
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
    clampLimbPose(rag.pose);
    this.resolveBody(level, true);
    if (!rag.rolling) {
      rag.omega *= Math.exp(-3.2 * dt);
      this.vx *= Math.exp(-2.4 * dt);
    }

    const floor = groundAt(level, this.x);
    const onGround = floor !== null;
    const moving =
      Math.abs(this.vx) > 0.35 || Math.abs(rag.omega) > 0.5 || Math.abs(this.vy) > 0.55;
    if (onGround && !moving && rag.age > 0.55) rag.stillTime += dt;
    else rag.stillTime = 0;

    if (rag.stillTime <= 0.32) return;

    const crash = this.state === "fallen";
    this.rag = null;
    this.spinRate = 0;
    this.vx = 0;
    this.vy = 0;
    if (crash) {
      this.restarted = true;
      return;
    }
    this.state = "ground";
    this.rot = 0;
    if (onGround) this.y = floor + HIP_HEIGHT;
  }

  /** Keep every sampled body part outside platform tops and vertical faces. */
  private resolveBody(level: Level, floorToo: boolean): void {
    const rag = this.rag;
    for (let pass = 0; pass < 6; pass++) {
      const pts = bodyWorldPoints(this);
      let up = 0;
      let left = 0;
      let right = 0;
      let accT = 0;
      let hits = 0;
      for (const pt of pts) {
        const hit = pushOutOfSolid(level, pt.x, pt.y, pt.r);
        if (!hit) continue;
        if (!floorToo && hit.ny > 0.5) continue;
        if (hit.ny > 0.5) up = Math.max(up, hit.depth);
        else if (hit.nx < 0) left = Math.max(left, hit.depth);
        else if (hit.nx > 0) right = Math.max(right, hit.depth);
        accT += (pt.x - this.x) * hit.ny - (pt.y - this.y) * hit.nx;
        hits++;
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
      if (up > 0 && this.vy < 0) this.vy = 0;
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
    if (g === null) {
      this.state = "air";
      this.flipping = false;
      this.vy = Math.min(this.vy, 0);
      this.rot = 0;
      return;
    }
    if (this.state !== "fallen") this.y = g + HIP_HEIGHT;
  }

  private checkGapDeath(level: Level): void {
    if (this.y < level.killY) {
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

export function burst(list: Dust[], x: number, y: number, n: number, color: string, speed: number): void {
  for (let i = 0; i < n; i++) {
    const a = -Math.PI * 0.15 - Math.random() * Math.PI * 0.7;
    const s = speed * (0.4 + Math.random());
    list.push({
      x,
      y,
      vx: Math.cos(a) * s * (Math.random() < 0.5 ? -1 : 1),
      vy: Math.sin(a) * s + 1.2,
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
  const arch = pose.arch;
  const grounded = bill.state === "ground" && !bill.rag;
  if (grounded) {
    const amp = Math.min(1, Math.abs(bill.vx) / tuning.maxSpeed);
    const bob = Math.abs(Math.sin(bill.runPhase)) * 0.055 * amp;
    ctx.translate(pose.lean * 0.04, -bob);
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const neck: Pt = {
    x: pose.lean * 0.2 - arch * 0.14,
    y: 0.64 - arch * 0.02,
  };
  const head: Pt = {
    x: neck.x + 0.05 + pose.lean * 0.06 - arch * 0.1,
    y: neck.y + 0.21,
  };

  const lHip: Pt = { x: -0.03 - pose.lean * 0.1, y: -0.01 };
  const rHip: Pt = { x: 0.03 - pose.lean * 0.1, y: -0.01 };
  const lKnee = polar(lHip, pose.lThigh, 0.46);
  const rKnee = polar(rHip, pose.rThigh, 0.46);
  const lAnkle = polar(lKnee, pose.lShin, 0.36);
  const rAnkle = polar(rKnee, pose.rShin, 0.36);

  const lSh: Pt = { x: neck.x - 0.05 - arch * 0.05, y: neck.y - 0.05 };
  const rSh: Pt = { x: neck.x + 0.06 - arch * 0.02, y: neck.y - 0.05 };
  const lSleeve = polar(lSh, pose.lArm, 0.15);
  const rSleeve = polar(rSh, pose.rArm, 0.15);
  const lElb = polar(lSh, pose.lArm, 0.32);
  const rElb = polar(rSh, pose.rArm, 0.32);
  const lHand = polar(lElb, pose.lFore, 0.3);
  const rHand = polar(rElb, pose.rFore, 0.3);

  drawHairBack(ctx, head, arch);
  strokeColored(ctx, SHIRT_DARK, 0.13, lSh, lSleeve);
  strokeColored(ctx, SKIN, 0.08, lSleeve, lElb, lHand);
  fillDot(ctx, lHand, 0.045, SKIN);
  strokeColored(ctx, JEANS_DARK, 0.155, lHip, lKnee, lAnkle);
  drawTrainer(ctx, lAnkle, footAngle(bill, pose.lShin));

  ctx.fillStyle = SHIRT;
  ctx.strokeStyle = SHIRT_DARK;
  ctx.lineWidth = 0.028;
  ctx.beginPath();
  ctx.moveTo(lSh.x - 0.05, lSh.y + 0.01);
  ctx.lineTo(rSh.x + 0.07, rSh.y);
  ctx.lineTo(rHip.x + 0.08, rHip.y + 0.06);
  ctx.lineTo(lHip.x - 0.06, lHip.y + 0.06);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  strokeColored(ctx, JEANS, 0.145, rHip, rKnee, rAnkle);
  drawTrainer(ctx, rAnkle, footAngle(bill, pose.rShin));

  strokeColored(ctx, SKIN, 0.1, neck, head);
  drawHeadProfile(ctx, head, bill, t);
  drawHairFront(ctx, head, arch);

  strokeColored(ctx, SHIRT, 0.135, rSh, rSleeve);
  strokeColored(ctx, SKIN, 0.082, rSleeve, rElb, rHand);
  fillDot(ctx, rHand, 0.045, SKIN);

  ctx.restore();
}

interface Pt {
  x: number;
  y: number;
}

interface Pose {
  lean: number;
  /** 0 = straight spine, 1 = hyperextended layout arch. */
  arch: number;
  lThigh: number;
  rThigh: number;
  lShin: number;
  rShin: number;
  lArm: number;
  rArm: number;
  lFore: number;
  rFore: number;
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

/** Knees / elbows may fold, but not past straight or into a pretzel. */
const KNEE_BEND = { min: -2.05, max: 0.06 };
const ELBOW_BEND = { min: -2.0, max: 0.06 };
const THIGH_RANGE = { min: -2.12, max: 1.15 };
const ARM_RANGE = { min: -2.0, max: 2.45 };
const LEAN_RANGE = { min: -0.62, max: 0.88 };
const ARCH_RANGE = { min: -0.18, max: 0.95 };

function poseFor(bill: Bill, t: number): Pose {
  if (bill.rag) return clampLimbPose(bill.rag.pose);

  if (bill.state === "air") {
    if (!bill.flipping) {
      const hang = -Math.PI / 2;
      return clampLimbPose({
        lean: 0.2,
        arch: 0,
        lThigh: hang + 0.15,
        rThigh: hang - 0.1,
        lShin: hang,
        rShin: hang - 0.05,
        lArm: hang + 0.4,
        rArm: hang - 0.3,
        lFore: hang + 0.2,
        rFore: hang - 0.15,
      });
    }
    return clampLimbPose(lerpPose(LAYOUT, CROUCH, bill.tuck));
  }

  const hang = -Math.PI / 2;
  const speed = bill.vx * bill.facing;
  const moving = Math.abs(bill.vx) > 0.28;
  const squat = bill.cushion;
  const amp =
    (moving ? Math.min(1, Math.abs(bill.vx) / tuning.maxSpeed) : 0) * (1 - squat * 0.88);
  const limp = bill.state === "stumble" ? 0.55 : 1;
  const a = amp * limp;
  const idle = moving ? 0 : Math.sin(t * 3) * 0.04;
  const backpedal = moving && speed < -0.12;
  const along = Math.max(-0.55, Math.min(1, speed / Math.max(0.01, tuning.maxSpeed)));

  if (!moving) {
    return clampLimbPose({
      lean: (bill.state === "stumble" ? 0.5 : 0) + squat * 0.28,
      arch: 0,
      lThigh: hang + idle + squat * 1.15,
      rThigh: hang - idle + squat * 1.02,
      lShin: hang - squat * 0.85,
      rShin: hang - squat * 0.72,
      lArm: hang - 0.18 + squat * 0.25,
      rArm: hang - 0.12 + squat * 0.2,
      lFore: hang - 0.08 + squat * 0.15,
      rFore: hang - 0.05 + squat * 0.12,
    });
  }

  const p = bill.runPhase;
  const L = gaitLeg(p, a, backpedal);
  const R = gaitLeg(p + Math.PI, a, backpedal);
  const lA = gaitArm(p + Math.PI, a, backpedal);
  const rA = gaitArm(p, a, backpedal);
  const lean = backpedal
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
  const thigh = hang + reachFwd * (0.82 * amp) - trail * (0.95 * amp);
  const swing = Math.max(0, c);
  const stance = Math.max(0, -c);
  const knee =
    -swing * (0.85 + 0.55 * amp) * (0.55 + 0.45 * (1 - reachFwd)) -
    stance * (0.1 + 0.16 * amp * (1 - trail));
  return { thigh, shin: thigh + knee };
}

function gaitArm(phase: number, amp: number, backpedal: boolean): { arm: number; fore: number } {
  const hang = -Math.PI / 2;
  const s = Math.sin(phase);
  if (backpedal) {
    const arm = hang + 0.15 - s * 0.38 * amp;
    const fore = arm - 0.55 - 0.12 * amp;
    return { arm, fore };
  }
  const arm = hang - 0.1 - s * (0.5 + 0.62 * amp);
  const pump = Math.max(0, s);
  const fore = arm - 0.28 - pump * (0.55 * amp) - 0.22 * amp;
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
  lFore: 2.12,
  rFore: 1.92,
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
  lFore: -0.35,
  rFore: -0.48,
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
  lFore: 0.15,
  rFore: -1.7,
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function hinge(child: number, parent: number, min: number, max: number): number {
  return parent + clamp(wrapPi(child - parent), min, max);
}

function clampLimbPose(pose: Pose): Pose {
  pose.lean = clamp(pose.lean, LEAN_RANGE.min, LEAN_RANGE.max);
  pose.arch = clamp(pose.arch, ARCH_RANGE.min, ARCH_RANGE.max);
  pose.lThigh = clamp(pose.lThigh, THIGH_RANGE.min, THIGH_RANGE.max);
  pose.rThigh = clamp(pose.rThigh, THIGH_RANGE.min, THIGH_RANGE.max);
  pose.lShin = hinge(pose.lShin, pose.lThigh, KNEE_BEND.min, KNEE_BEND.max);
  pose.rShin = hinge(pose.rShin, pose.rThigh, KNEE_BEND.min, KNEE_BEND.max);
  pose.lArm = clamp(pose.lArm, ARM_RANGE.min, ARM_RANGE.max);
  pose.rArm = clamp(pose.rArm, ARM_RANGE.min, ARM_RANGE.max);
  pose.lFore = hinge(pose.lFore, pose.lArm, ELBOW_BEND.min, ELBOW_BEND.max);
  pose.rFore = hinge(pose.rFore, pose.rArm, ELBOW_BEND.min, ELBOW_BEND.max);
  return pose;
}

function integrateJoint(pose: Pose, vel: Pose, key: keyof Pose, pull: number, dt: number, damp: number): void {
  vel[key] += (pull - vel[key] * damp) * dt;
  vel[key] = clamp(vel[key], -14, 14);
  pose[key] += vel[key] * dt;
}

function flopToward(rag: Ragdoll, hang: number, dt: number, grounded: boolean, heap = false): void {
  const { pose, vel } = rag;
  const gnd = grounded ? 1.2 : 1;
  const mix = heap && grounded ? 0.62 : heap ? 0.28 : 0;
  const pull = (ang: number, target: number, stiff: number) => {
    const goal = hang + mix * wrapPi(target - hang);
    return wrapPi(goal - ang) * stiff * gnd;
  };
  integrateJoint(pose, vel, "lean", wrapPi((heap ? HEAP.lean : 0) - pose.lean) * 5, dt, 4.2);
  integrateJoint(pose, vel, "arch", wrapPi((heap ? HEAP.arch : 0) - pose.arch) * 4, dt, 3.6);
  integrateJoint(pose, vel, "lThigh", pull(pose.lThigh, HEAP.lThigh, 7.2) - rag.omega * 1.6, dt, 3.4);
  integrateJoint(pose, vel, "rThigh", pull(pose.rThigh, HEAP.rThigh, 6.6) - rag.omega * 1.2, dt, 3.4);
  integrateJoint(pose, vel, "lShin", pull(pose.lShin, HEAP.lShin, 9.5) - rag.omega * 0.8, dt, 3.8);
  integrateJoint(pose, vel, "rShin", pull(pose.rShin, HEAP.rShin, 8.8) - rag.omega * 0.7, dt, 3.8);
  integrateJoint(pose, vel, "lArm", pull(pose.lArm, HEAP.lArm, 5.4) + rag.omega * 2.2, dt, 2.8);
  integrateJoint(pose, vel, "rArm", pull(pose.rArm, HEAP.rArm, 4.8) + rag.omega * 1.8, dt, 2.8);
  integrateJoint(pose, vel, "lFore", pull(pose.lFore, HEAP.lFore, 6.2) + rag.omega * 1.1, dt, 3.1);
  integrateJoint(pose, vel, "rFore", pull(pose.rFore, HEAP.rFore, 5.8) + rag.omega * 0.9, dt, 3.1);
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
  rag.vel.lean += s * 0.08;
  rag.omega += s * 0.85;
}

function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const u = Math.max(0, Math.min(1, t));
  return {
    lean: a.lean + (b.lean - a.lean) * u,
    arch: a.arch + (b.arch - a.arch) * u,
    lThigh: a.lThigh + (b.lThigh - a.lThigh) * u,
    rThigh: a.rThigh + (b.rThigh - a.rThigh) * u,
    lShin: a.lShin + (b.lShin - a.lShin) * u,
    rShin: a.rShin + (b.rShin - a.rShin) * u,
    lArm: a.lArm + (b.lArm - a.lArm) * u,
    rArm: a.rArm + (b.rArm - a.rArm) * u,
    lFore: a.lFore + (b.lFore - a.lFore) * u,
    rFore: a.rFore + (b.rFore - a.rFore) * u,
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

/** Collision samples matching the drawn skeleton (head, hands, feet, torso). */
function bodyWorldPoints(bill: Bill): { x: number; y: number; r: number }[] {
  const pose = bill.rag ? bill.rag.pose : poseFor(bill, 0);
  const arch = pose.arch;
  const neck: Pt = {
    x: pose.lean * 0.2 - arch * 0.14,
    y: 0.64 - arch * 0.02,
  };
  const head: Pt = {
    x: neck.x + 0.05 + pose.lean * 0.06 - arch * 0.1,
    y: neck.y + 0.21,
  };
  const lHip: Pt = { x: -0.03 - pose.lean * 0.1, y: -0.01 };
  const rHip: Pt = { x: 0.03 - pose.lean * 0.1, y: -0.01 };
  const lKnee = polar(lHip, pose.lThigh, 0.46);
  const rKnee = polar(rHip, pose.rThigh, 0.46);
  const lAnkle = polar(lKnee, pose.lShin, 0.36);
  const rAnkle = polar(rKnee, pose.rShin, 0.36);
  const lSh: Pt = { x: neck.x - 0.05 - arch * 0.05, y: neck.y - 0.05 };
  const rSh: Pt = { x: neck.x + 0.06 - arch * 0.02, y: neck.y - 0.05 };
  const lElb = polar(lSh, pose.lArm, 0.32);
  const rElb = polar(rSh, pose.rArm, 0.32);
  const lHand = polar(lElb, pose.lFore, 0.3);
  const rHand = polar(rElb, pose.rFore, 0.3);
  const lFoot = polar(lAnkle, bill.rag || bill.state === "air" ? pose.lShin : 0, 0.18);
  const rFoot = polar(rAnkle, bill.rag || bill.state === "air" ? pose.rShin : 0, 0.18);
  const samples: { p: Pt; r: number }[] = [
    { p: { x: 0, y: 0 }, r: 0.12 },
    { p: lHip, r: 0.1 },
    { p: rHip, r: 0.1 },
    { p: lKnee, r: 0.08 },
    { p: rKnee, r: 0.08 },
    { p: lAnkle, r: 0.07 },
    { p: rAnkle, r: 0.07 },
    { p: lFoot, r: 0.09 },
    { p: rFoot, r: 0.09 },
    { p: neck, r: 0.11 },
    { p: head, r: 0.26 },
    { p: { x: head.x - 0.05, y: head.y - 0.22 }, r: 0.16 },
    { p: { x: (lHip.x + lKnee.x) * 0.5, y: (lHip.y + lKnee.y) * 0.5 }, r: 0.09 },
    { p: { x: (rHip.x + rKnee.x) * 0.5, y: (rHip.y + rKnee.y) * 0.5 }, r: 0.09 },
    { p: { x: (lKnee.x + lAnkle.x) * 0.5, y: (lKnee.y + lAnkle.y) * 0.5 }, r: 0.08 },
    { p: { x: (rKnee.x + rAnkle.x) * 0.5, y: (rKnee.y + rAnkle.y) * 0.5 }, r: 0.08 },
    { p: { x: (lSh.x + rSh.x) * 0.5, y: (lSh.y + rSh.y) * 0.5 }, r: 0.12 },
    { p: lSh, r: 0.08 },
    { p: rSh, r: 0.08 },
    { p: lElb, r: 0.06 },
    { p: rElb, r: 0.06 },
    { p: lHand, r: 0.055 },
    { p: rHand, r: 0.055 },
  ];
  return samples.map(({ p, r }) => {
    const w = worldOf(bill, p.x, p.y);
    return { x: w.x, y: w.y, r };
  });
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

const EYE = "#3a2a22";
const MOUTH = "#b56c5e";
const MOUTH_DARK = "#8a4a40";
const TEETH = "#f6f1ea";
const BROW = "#6a5040";
const BLUSH = "rgba(214, 118, 108, 0.38)";

type FaceMood = "idle" | "run" | "back" | "focus" | "tuck" | "grin" | "wince" | "shock" | "dazed" | "win";

function faceMood(bill: Bill): FaceMood {
  if (bill.state === "dead") return "dazed";
  if (bill.state === "done") return "win";
  if (bill.rag) {
    if (bill.state === "fallen") {
      const rag = bill.rag;
      return rag.age < 0.32 || Math.abs(rag.omega) > 4 ? "shock" : "dazed";
    }
    return "wince";
  }
  if (bill.state === "air") {
    if (bill.flipping && bill.tuck >= 0.7) return "tuck";
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
  fillDot(ctx, { x: hx - 0.05, y: hy + 0.01 }, 0.038, SKIN);
  ctx.beginPath();
  ctx.arc(hx - 0.05, hy + 0.01, 0.03, 0.4, 3.8);
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

function footAngle(bill: Bill, shin: number): number {
  if (bill.state === "air" || bill.rag) return shin;
  const hang = -Math.PI / 2;
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
  ctx.restore();
}
