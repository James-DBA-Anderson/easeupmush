import { degToRad, HIP_HEIGHT, TAU } from "./constants";
import { tuning } from "./tuning";
import { groundAt, spawnGround, type Level } from "./world";

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
  state: BillState = "ground";
  runPhase = 0;
  lockTimer = 0;
  flipTravel = 0;
  flipDuration = tuning.flipDurationSlow;
  airTime = 0;
  flipping = false;
  /** 0 = layout / straight, 1 = full crouch. Default 0.5. */
  tuck = 0.5;
  name = "Backflip Bill";
  landEvent: LandEvent | null = null;
  died = false;
  finished = false;

  public spawn(level: Level): void {
    this.x = level.spawnX;
    this.y = spawnGround(level) + HIP_HEIGHT;
    this.vx = 0;
    this.vy = 0;
    this.rot = 0;
    this.facing = 1;
    this.state = "ground";
    this.runPhase = 0;
    this.lockTimer = 0;
    this.flipTravel = 0;
    this.flipDuration = tuning.flipDurationSlow;
    this.airTime = 0;
    this.flipping = false;
    this.tuck = 0.5;
    this.landEvent = null;
    this.died = false;
    this.finished = false;
  }

  public step(dt: number, run: number, jump: boolean, tuckAxis: number, level: Level): void {
    this.landEvent = null;
    this.died = false;
    this.finished = false;

    if (this.state === "dead") return;
    if (this.state === "done") return;

    if (this.state === "stumble") {
      this.lockTimer -= dt;
      this.groundMove(dt, run * 0.25);
      this.snapToGround(level);
      this.runPhase += Math.abs(this.vx) * dt * 3.2;
      if (this.lockTimer <= 0) {
        this.state = "ground";
        this.rot = 0;
      }
      this.checkGapDeath(level);
      return;
    }

    if (this.state === "fallen") {
      this.lockTimer -= dt;
      this.vx *= Math.exp(-8 * dt);
      this.snapToGround(level);
      if (this.lockTimer <= 0) {
        this.state = "ground";
        this.rot = 0;
        const g = groundAt(level, this.x);
        if (g !== null) this.y = g + HIP_HEIGHT;
      }
      this.checkGapDeath(level);
      return;
    }

    if (this.state === "ground") {
      this.tuck = 0.5;
      this.groundMove(dt, run);
      this.snapToGround(level);
      this.runPhase += Math.abs(this.vx) * dt * 2.6;
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
    } else {
      this.rot = 0;
    }

    const g = groundAt(level, this.x);
    if (g !== null && this.vy <= 0 && this.y - HIP_HEIGHT <= g + 0.04) {
      this.land(g);
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
      this.facing = run >= 0 ? 1 : -1;
    } else {
      const mag = Math.abs(this.vx);
      const next = Math.max(0, mag - tuning.decel * dt);
      this.vx = mag < 0.05 ? 0 : Math.sign(this.vx) * next;
    }
    this.x += this.vx * dt;
    this.rot = 0;
  }

  private takeOff(): void {
    this.state = "air";
    this.flipping = true;
    this.vy = tuning.jumpVy;
    this.flipTravel = 0;
    this.rot = 0;
    this.airTime = 0;
    this.tuck = 0.5;
    const speed = Math.min(1, Math.abs(this.vx) / tuning.maxSpeed);
    this.flipDuration =
      tuning.flipDurationSlow +
      (tuning.flipDurationFast - tuning.flipDurationSlow) * speed;
  }

  private land(g: number): void {
    this.y = g + HIP_HEIGHT;
    const ang = wrapPi(this.rot);
    const off = Math.abs(ang);

    if (off <= degToRad(tuning.cleanLandDeg)) {
      this.state = "ground";
      this.flipping = false;
      this.rot = 0;
      this.tuck = 0.5;
      this.landEvent = { kind: "clean", x: this.x, y: g };
    } else if (off <= degToRad(tuning.stumbleLandDeg)) {
      this.state = "stumble";
      this.flipping = false;
      this.lockTimer = tuning.stumbleTime;
      this.vx *= 0.28;
      this.rot = Math.sign(ang || 1) * 0.35;
      this.tuck = 0.5;
      this.landEvent = { kind: "stumble", x: this.x, y: g };
    } else {
      this.state = "fallen";
      this.flipping = false;
      this.lockTimer = tuning.fallenTime;
      this.vx = 0;
      this.rot = Math.abs(ang) > Math.PI * 0.75 ? Math.PI : Math.sign(ang || 1) * (Math.PI / 2);
      this.y = g + HIP_HEIGHT * 0.38;
      this.tuck = 0.5;
      this.landEvent = { kind: "fall", x: this.x, y: g };
    }
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

/** Draw Backflip Bill — animated stick man, always backflips backward. */
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

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#11110e";
  ctx.fillStyle = "#11110e";

  const hip: Pt = { x: 0, y: 0 };
  const chest: Pt = { x: arch * 0.16, y: 0.32 };
  const neck: Pt = {
    x: pose.lean * 0.08 - arch * 0.12,
    y: 0.62 - arch * 0.03,
  };
  const head: Pt = {
    x: neck.x + pose.lean * 0.05 - arch * 0.1,
    y: neck.y + 0.23 - arch * 0.02,
  };

  const lHip: Pt = { x: -0.07, y: -0.02 };
  const rHip: Pt = { x: 0.07, y: -0.02 };
  const lKnee = polar(lHip, pose.lThigh, 0.44);
  const rKnee = polar(rHip, pose.rThigh, 0.44);
  const lFoot = polar(lKnee, pose.lShin, 0.44);
  const rFoot = polar(rKnee, pose.rShin, 0.44);

  const lSh: Pt = { x: neck.x - 0.09, y: neck.y - 0.04 };
  const rSh: Pt = { x: neck.x + 0.09, y: neck.y - 0.04 };
  const lElb = polar(lSh, pose.lArm, 0.3);
  const rElb = polar(rSh, pose.rArm, 0.3);
  const lHand = polar(lElb, pose.lFore, 0.3);
  const rHand = polar(rElb, pose.rFore, 0.3);

  strokeSeg(ctx, lHip, lKnee, lFoot, 0.09);
  strokeSeg(ctx, rHip, rKnee, rFoot, 0.09);
  strokeCurve(ctx, hip, chest, neck, 0.1);
  strokeSeg(ctx, lSh, lElb, lHand, 0.08);
  strokeSeg(ctx, rSh, rElb, rHand, 0.08);

  ctx.beginPath();
  ctx.arc(head.x, head.y, 0.19, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.translate(head.x, head.y);
  ctx.rotate(-arch * 0.7);
  ctx.fillStyle = "#c43c2a";
  ctx.beginPath();
  ctx.ellipse(0, 0.12, 0.2, 0.08, 0, 0, TAU);
  ctx.fill();
  ctx.fillRect(-0.02, 0.1, 0.24, 0.045);
  ctx.restore();

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

function poseFor(bill: Bill, t: number): Pose {
  if (bill.state === "fallen") {
    return {
      lean: 0.2,
      arch: 0,
      lThigh: -2.4,
      rThigh: -2.1,
      lShin: -2.9,
      rShin: -2.7,
      lArm: 0.6,
      rArm: 2.4,
      lFore: 0.2,
      rFore: 2.1,
    };
  }

  if (bill.state === "air") {
    if (!bill.flipping) {
      const hang = -Math.PI / 2;
      return {
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
      };
    }
    return lerpPose(LAYOUT, CROUCH, bill.tuck);
  }

  const moving = Math.abs(bill.vx) > 0.35;
  const amp = moving ? Math.min(1, Math.abs(bill.vx) / tuning.maxSpeed) : 0;
  const p = bill.runPhase;
  const limp = bill.state === "stumble" ? 0.55 : 1;
  const lSwing = Math.sin(p) * 0.85 * amp * limp;
  const rSwing = Math.sin(p + Math.PI) * 0.85 * amp * limp;
  const idle = moving ? 0 : Math.sin(t * 3) * 0.04;

  const hang = -Math.PI / 2;
  return {
    lean: (moving ? 0.35 * amp : 0) + (bill.state === "stumble" ? 0.5 : 0),
    arch: 0,
    lThigh: hang + lSwing + idle,
    rThigh: hang + rSwing - idle,
    lShin: hang + lSwing * 0.35 - 0.15 * amp,
    rShin: hang + rSwing * 0.35 - 0.15 * amp,
    lArm: hang - 0.2 - rSwing * 0.85,
    rArm: hang - 0.2 - lSwing * 0.85,
    lFore: hang - 0.1 - rSwing * 0.4,
    rFore: hang - 0.1 - lSwing * 0.4,
  };
}

/** Layout: arched back, full extension, arms and legs trailing the spin. */
const LAYOUT: Pose = {
  lean: -0.28,
  arch: 1,
  lThigh: -1.98,
  rThigh: -1.82,
  lShin: -2.12,
  rShin: -1.94,
  lArm: 2.08,
  rArm: 1.88,
  lFore: 2.28,
  rFore: 2.06,
};

/** Tight crouch. */
const CROUCH: Pose = {
  lean: 0.18,
  arch: -0.12,
  lThigh: 2.55,
  rThigh: 2.28,
  lShin: 0.55,
  rShin: 0.38,
  lArm: 3.45,
  rArm: 3.12,
  lFore: 2.22,
  rFore: 1.95,
};

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

function strokeSeg(ctx: CanvasRenderingContext2D, ...ptsAndWidth: [...Pt[], number]): void {
  const w = ptsAndWidth[ptsAndWidth.length - 1] as number;
  const pts = ptsAndWidth.slice(0, -1) as Pt[];
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i]!.x, pts[i]!.y);
  }
  ctx.stroke();
}

function strokeCurve(ctx: CanvasRenderingContext2D, a: Pt, ctrl: Pt, b: Pt, w: number): void {
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.quadraticCurveTo(ctrl.x, ctrl.y, b.x, b.y);
  ctx.stroke();
}
