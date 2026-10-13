import {
  ACCEL,
  CLEAN_LAND_RAD,
  DECEL,
  FALLEN_TIME,
  FLAG_X,
  FLIP_DURATION_FAST,
  FLIP_DURATION_SLOW,
  GRAVITY,
  GROUND_Y,
  HIP_HEIGHT,
  JUMP_VY,
  KILL_Y,
  MAX_SPEED,
  SPAWN_X,
  STUMBLE_LAND_RAD,
  STUMBLE_TIME,
  TAU,
  TURN_ACCEL,
} from "./constants";
import { groundAt } from "./world";

export type BillState = "ground" | "air" | "stumble" | "fallen" | "dead" | "done";

export type LandKind = "clean" | "stumble" | "fall";

export interface LandEvent {
  kind: LandKind;
  x: number;
  y: number;
}

export class Bill {
  x = SPAWN_X;
  y = GROUND_Y + HIP_HEIGHT;
  vx = 0;
  vy = 0;
  /** Local backflip rotation, 0 = feet down. Always spins backward. */
  rot = 0;
  facing = 1;
  state: BillState = "ground";
  runPhase = 0;
  lockTimer = 0;
  flipTravel = 0;
  flipDuration = FLIP_DURATION_SLOW;
  airTime = 0;
  name = "Backflip Bill";
  landEvent: LandEvent | null = null;
  died = false;
  finished = false;

  public spawn(): void {
    this.x = SPAWN_X;
    this.y = GROUND_Y + HIP_HEIGHT;
    this.vx = 0;
    this.vy = 0;
    this.rot = 0;
    this.facing = 1;
    this.state = "ground";
    this.runPhase = 0;
    this.lockTimer = 0;
    this.flipTravel = 0;
    this.flipDuration = FLIP_DURATION_SLOW;
    this.airTime = 0;
    this.landEvent = null;
    this.died = false;
    this.finished = false;
  }

  public step(dt: number, run: number, jump: boolean): void {
    this.landEvent = null;
    this.died = false;
    this.finished = false;

    if (this.state === "dead") return;
    if (this.state === "done") return;

    if (this.state === "stumble") {
      this.lockTimer -= dt;
      this.groundMove(dt, run * 0.25);
      this.snapToGround();
      this.runPhase += Math.abs(this.vx) * dt * 3.2;
      if (this.lockTimer <= 0) {
        this.state = "ground";
        this.rot = 0;
      }
      this.checkGapDeath();
      return;
    }

    if (this.state === "fallen") {
      this.lockTimer -= dt;
      this.vx *= Math.exp(-8 * dt);
      this.snapToGround();
      if (this.lockTimer <= 0) {
        this.state = "ground";
        this.rot = 0;
        this.y = GROUND_Y + HIP_HEIGHT;
      }
      this.checkGapDeath();
      return;
    }

    if (this.state === "ground") {
      this.groundMove(dt, run);
      this.snapToGround();
      this.runPhase += Math.abs(this.vx) * dt * 2.6;
      if (jump) this.takeOff();
      this.checkGapDeath();
      if (this.state === "ground" && this.x >= FLAG_X) {
        this.state = "done";
        this.finished = true;
        this.vx = 0;
      }
      return;
    }

    // Air: trajectory locked at takeoff. No steering. One backflip.
    this.vy -= GRAVITY * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.airTime += dt;

    const omega = TAU / this.flipDuration;
    if (this.flipTravel < TAU) {
      const step = omega * dt;
      const left = TAU - this.flipTravel;
      const use = Math.min(step, left);
      this.flipTravel += use;
      this.rot = this.flipTravel;
    } else {
      this.rot = TAU;
    }

    const g = groundAt(this.x);
    if (g !== null && this.vy <= 0 && this.y - HIP_HEIGHT <= g + 0.04) {
      this.land(g);
    }

    this.checkGapDeath();
  }

  private groundMove(dt: number, run: number): void {
    const target = run * MAX_SPEED;
    if (Math.abs(run) > 0.05) {
      const accel = Math.sign(run) === Math.sign(this.vx) || Math.abs(this.vx) < 0.3 ? ACCEL : TURN_ACCEL;
      if (this.vx < target) this.vx = Math.min(target, this.vx + accel * dt);
      else this.vx = Math.max(target, this.vx - accel * dt);
      this.facing = run >= 0 ? 1 : -1;
    } else {
      const mag = Math.abs(this.vx);
      const next = Math.max(0, mag - DECEL * dt);
      this.vx = mag < 0.05 ? 0 : Math.sign(this.vx) * next;
    }
    this.x += this.vx * dt;
    this.rot = 0;
  }

  private takeOff(): void {
    this.state = "air";
    this.vy = JUMP_VY;
    this.flipTravel = 0;
    this.rot = 0;
    this.airTime = 0;
    const speed = Math.min(1, Math.abs(this.vx) / MAX_SPEED);
    this.flipDuration =
      FLIP_DURATION_SLOW + (FLIP_DURATION_FAST - FLIP_DURATION_SLOW) * speed;
    // Facing at takeoff decides which way "back" is. vx is frozen after this.
  }

  private land(g: number): void {
    this.y = g + HIP_HEIGHT;
    const ang = wrapPi(this.rot);
    const off = Math.abs(ang);

    if (off <= CLEAN_LAND_RAD) {
      this.state = "ground";
      this.rot = 0;
      this.landEvent = { kind: "clean", x: this.x, y: g };
    } else if (off <= STUMBLE_LAND_RAD) {
      this.state = "stumble";
      this.lockTimer = STUMBLE_TIME;
      this.vx *= 0.28;
      this.rot = Math.sign(ang || 1) * 0.35;
      this.landEvent = { kind: "stumble", x: this.x, y: g };
    } else {
      this.state = "fallen";
      this.lockTimer = FALLEN_TIME;
      this.vx = 0;
      this.rot = Math.abs(ang) > Math.PI * 0.75 ? Math.PI : Math.sign(ang || 1) * (Math.PI / 2);
      this.y = g + HIP_HEIGHT * 0.38;
      this.landEvent = { kind: "fall", x: this.x, y: g };
    }
  }

  private snapToGround(): void {
    const g = groundAt(this.x);
    if (g === null) {
      this.state = "air";
      this.vy = Math.min(this.vy, 0);
      this.flipTravel = TAU;
      this.rot = 0;
      return;
    }
    if (this.state !== "fallen") this.y = g + HIP_HEIGHT;
  }

  private checkGapDeath(): void {
    if (this.y < KILL_Y) {
      this.state = "dead";
      this.died = true;
      this.vx = 0;
      this.vy = 0;
    }
  }
}

function wrapPi(a: number): number {
  let x = ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return x;
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

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#11110e";
  ctx.fillStyle = "#11110e";

  const hip: Pt = { x: 0, y: 0 };
  const neck: Pt = { x: pose.lean * 0.08, y: 0.62 };
  const head: Pt = { x: neck.x + pose.lean * 0.05, y: neck.y + 0.24 };

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
  strokeSeg(ctx, hip, neck, 0.1);
  strokeSeg(ctx, lSh, lElb, lHand, 0.08);
  strokeSeg(ctx, rSh, rElb, rHand, 0.08);

  ctx.beginPath();
  ctx.arc(head.x, head.y, 0.19, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#c43c2a";
  ctx.beginPath();
  ctx.ellipse(head.x, head.y + 0.12, 0.2, 0.08, 0, 0, TAU);
  ctx.fill();
  ctx.fillRect(head.x - 0.02, head.y + 0.1, 0.24, 0.045);

  ctx.restore();
}

interface Pt {
  x: number;
  y: number;
}

interface Pose {
  lean: number;
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
    const tuck = 0.08 * Math.sin(t * 14);
    return {
      lean: 0.12,
      lThigh: 2.45 + tuck,
      rThigh: 2.2 - tuck,
      lShin: 0.65,
      rShin: 0.5,
      lArm: 3.35,
      rArm: 3.05,
      lFore: 2.15,
      rFore: 1.95,
    };
  }

  const moving = Math.abs(bill.vx) > 0.35;
  const amp = moving ? Math.min(1, Math.abs(bill.vx) / MAX_SPEED) : 0;
  const p = bill.runPhase;
  const limp = bill.state === "stumble" ? 0.55 : 1;
  const lSwing = Math.sin(p) * 0.85 * amp * limp;
  const rSwing = Math.sin(p + Math.PI) * 0.85 * amp * limp;
  const idle = moving ? 0 : Math.sin(t * 3) * 0.04;

  const hang = -Math.PI / 2;
  return {
    lean: (moving ? 0.35 * amp : 0) + (bill.state === "stumble" ? 0.5 : 0),
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
