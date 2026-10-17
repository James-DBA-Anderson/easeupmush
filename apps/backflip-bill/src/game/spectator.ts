import { HIP_HEIGHT, TAU } from "./constants";
import { drawCharShadow, spawnGround, worldToScreen, type Cam, type Level } from "./world";

/** Left of spawn, just in from the start wall. */
export const KID_START_X = 2.85;
const KID_HIP = HIP_HEIGHT * 0.86;

const SKIN = "#e8c4a4";
const SKIN_LIT = "#f3d4b6";
const SKIN_SHADE = "#c49270";
const SKIN_LINE = "#c9a07e";
const HAIR = "#4a3428";
const JUMPER = "#6a3a38";
const JUMPER_LIT = "#8a524c";
const JUMPER_DARK = "#4a2826";
const JOGGERS = "#3a3e46";
const JOGGERS_DARK = "#2a2e34";
const SHOE = "#2a2420";

interface Pt {
  x: number;
  y: number;
}

function polar(from: Pt, ang: number, len: number): Pt {
  return { x: from.x + Math.cos(ang) * len, y: from.y + Math.sin(ang) * len };
}

/** Two-bone arm; `preferBack` picks the elbow that sits further behind. */
function ikArm(
  sh: Pt,
  want: Pt,
  upper: number,
  lower: number,
  preferBack: boolean,
): { elb: Pt; hand: Pt } {
  const dx = want.x - sh.x;
  const dy = want.y - sh.y;
  let dist = Math.hypot(dx, dy) || 1e-6;
  const max = upper + lower - 0.002;
  const min = Math.abs(upper - lower) + 0.002;
  const scale = dist > max ? max / dist : dist < min ? min / dist : 1;
  const hand: Pt = { x: sh.x + dx * scale, y: sh.y + dy * scale };
  dist = Math.hypot(hand.x - sh.x, hand.y - sh.y);
  const a = Math.atan2(hand.y - sh.y, hand.x - sh.x);
  const cos = (upper * upper + dist * dist - lower * lower) / (2 * upper * dist);
  const bend = Math.acos(Math.max(-1, Math.min(1, cos)));
  const elbA = polar(sh, a + bend, upper);
  const elbB = polar(sh, a - bend, upper);
  const elb = preferBack === elbA.x < elbB.x ? elbA : elbB;
  return { elb, hand };
}

function mix(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

function clamp01(u: number): number {
  return Math.max(0, Math.min(1, u));
}

function ease(u: number): number {
  const t = clamp01(u);
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

let kidLevel = -1;
let kidT0 = 0;

function kidTime(levelId: number, t: number): number {
  if (levelId !== kidLevel) {
    kidLevel = levelId;
    kidT0 = t;
  }
  return Math.max(0, t - kidT0);
}

/** 1 = cash held out and waving, 0 = arm down by his side. */
function offerAmt(lt: number, mood: KidMood): number {
  if (mood === "sad") return 0;
  const waveFor = 4.8;
  const lowerFor = 0.95;
  if (lt < waveFor) return 1;
  return 1 - ease((lt - waveFor) / lowerFor);
}

/** Occasional near-hand itch after he settles. */
function scratchAmt(lt: number, offer: number): number {
  if (offer > 0.12) return 0;
  const first = 6.6;
  if (lt < first) return 0;
  const period = 13.5;
  const cycle = Math.floor((lt - first) / period);
  if (cycle % 3 === 1) return 0;
  const u = (lt - first) % period;
  const dur = cycle === 0 ? 3.1 : 1.9;
  if (u > dur) return 0;
  if (u < 0.22) return ease(u / 0.22);
  if (u > dur - 0.34) return 1 - ease((u - (dur - 0.34)) / 0.34);
  return 1;
}

function stroke(
  ctx: CanvasRenderingContext2D,
  color: string,
  width: number,
  ...pts: Pt[]
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  ctx.stroke();
}

export type KidMood = "smug" | "sad" | "laugh";

/** Chubby park kid holding a wad of notes — smug until Bill lands the standing backflip. */
export function drawParkKid(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  level: Level,
  mood: KidMood,
  t: number,
  howl = 0,
): void {
  if (level.train) return;
  const ground = spawnGround(level);
  const x = KID_START_X;
  const y = ground + KID_HIP;
  const s = worldToScreen(cam, cssW, cssH, x, y);
  if (s.x < -80 || s.x > cssW + 80) return;

  const lt = kidTime(level.id, t);
  const sad = mood === "sad";
  const laugh = sad ? 0 : clamp01(howl);
  const offer = laugh > 0.12 ? 0 : offerAmt(lt, mood);
  const scratch = laugh ? 0 : scratchAmt(lt, offer);
  const wag = offer * Math.sin(lt * 5.2);
  const breathe = Math.sin(t * 1.45);
  const jigHz = 6.4 + 16 * laugh;
  const jig = Math.abs(Math.sin(t * jigHz));
  const slump = sad ? 0.16 : 0;
  const hang = -Math.PI / 2;
  const lean = 0.03 + slump * 0.4 + 0.015 * breathe - laugh * laugh * 0.28;

  drawCharShadow(ctx, cam, cssW, cssH, x, ground, {
    width: 1.18 + offer * 0.08,
    stretch: 1.05 + Math.abs(lean) * 0.2,
  });

  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.scale(s.ppm, -s.ppm);
  ctx.translate(0, laugh * laugh * 0.13 * jig);

  const pelvis: Pt = { x: -lean * 0.04, y: 0.02 };
  const belly: Pt = {
    x: pelvis.x + 0.1 + wag * 0.01 + laugh * 0.04 * jig,
    y: pelvis.y + 0.2 + laugh * 0.035 * jig,
  };
  const chest: Pt = { x: pelvis.x + 0.01 - lean * 0.04, y: pelvis.y + 0.4 };
  const neck: Pt = { x: chest.x + 0.01, y: chest.y + 0.12 };
  const head: Pt = {
    x: neck.x + 0.03 - laugh * 0.08,
    y: neck.y + 0.17 + (sad ? -0.03 : 0) + laugh * 0.07 * jig,
  };

  const lHip: Pt = { x: -0.05, y: 0 };
  const rHip: Pt = { x: 0.07, y: 0 };
  const lKnee = polar(lHip, hang + 0.05, 0.4);
  const rKnee = polar(rHip, hang + 0.02, 0.4);
  const lAnkle = polar(lKnee, hang - 0.02, 0.34);
  const rAnkle = polar(rKnee, hang - 0.03, 0.34);

  const lSh: Pt = { x: neck.x - 0.11, y: neck.y - 0.05 };
  const rSh: Pt = { x: neck.x + 0.07, y: neck.y - 0.03 };
  const cashArm = mix(hang + 0.12, 0.18, offer) + 0.22 * wag;
  const cashFore = mix(hang + 0.06, 0.4, offer) + 0.3 * wag;
  const cashElb = polar(lSh, cashArm, 0.28);
  const cashHand = polar(cashElb, cashFore, 0.24);

  const lHangElb = polar(lSh, hang - 0.05, 0.26);
  const lHangHand = polar(lHangElb, hang + 0.1, 0.22);
  const laughHand: Pt = { x: belly.x + 0.08, y: belly.y + 0.02 };
  const clutchBack = clamp01((laugh - 0.22) / 0.45);
  const lArm =
    offer > 0.02
      ? { elb: cashElb, hand: cashHand }
      : clutchBack > 0.02
        ? ikArm(
            lSh,
            {
              x: mix(lHangHand.x, laughHand.x, clutchBack),
              y: mix(lHangHand.y, laughHand.y, clutchBack),
            },
            0.26,
            0.22,
            false,
          )
        : { elb: lHangElb, hand: lHangHand };
  const lElb = lArm.elb;
  const lHand = lArm.hand;

  const rHangElb = polar(rSh, hang + 0.08, 0.27);
  const rHangHand = polar(rHangElb, hang + 0.05, 0.23);
  const rub = scratch * 0.035 * Math.sin(t * 13.5);
  const scratchHand: Pt = { x: rHip.x - 0.06, y: rHip.y + 0.1 + rub };
  const rBelly: Pt = { x: belly.x + 0.16, y: belly.y + 0.01 };
  const rWant: Pt = scratch > 0.02 ? scratchHand : rBelly;
  const rReach = scratch > 0.02 ? scratch : clamp01((laugh - 0.48) / 0.4);
  const rArm =
    rReach > 0.02
      ? ikArm(
          rSh,
          {
            x: mix(rHangHand.x, rWant.x, rReach),
            y: mix(rHangHand.y, rWant.y, rReach),
          },
          0.27,
          0.23,
          scratch > 0.02,
        )
      : { elb: rHangElb, hand: rHangHand };
  const rElb = rArm.elb;
  const rHand = rArm.hand;

  stroke(ctx, JUMPER_DARK, 0.16, lSh, lElb);
  stroke(ctx, SKIN, 0.09, lElb, lHand);
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.arc(lHand.x, lHand.y, 0.05, 0, TAU);
  ctx.fill();
  if (laugh < 0.12) drawNotes(ctx, lHand, offer, wag);

  stroke(ctx, JOGGERS_DARK, 0.18, lHip, lKnee, lAnkle);
  stroke(ctx, JOGGERS, 0.17, rHip, rKnee, rAnkle);
  drawShoe(ctx, lAnkle);
  drawShoe(ctx, rAnkle);

  const jumperShade = ctx.createLinearGradient(
    rSh.x + 0.1,
    rSh.y + 0.08,
    lHip.x - 0.12,
    lHip.y,
  );
  jumperShade.addColorStop(0, JUMPER_LIT);
  jumperShade.addColorStop(0.48, JUMPER);
  jumperShade.addColorStop(1, "#3a1c1a");
  ctx.fillStyle = jumperShade;
  ctx.strokeStyle = JUMPER_DARK;
  ctx.lineWidth = 0.028;
  ctx.beginPath();
  ctx.moveTo(lHip.x - 0.1, lHip.y + 0.02);
  ctx.quadraticCurveTo(lSh.x - 0.14, (lHip.y + lSh.y) * 0.55, lSh.x - 0.1, lSh.y);
  ctx.lineTo(rSh.x + 0.1, rSh.y + 0.01);
  ctx.quadraticCurveTo(belly.x + 0.28, belly.y + 0.08, rHip.x + 0.16, rHip.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const bellyShade = ctx.createRadialGradient(
    belly.x + 0.1,
    belly.y + 0.04,
    0.02,
    belly.x + 0.02,
    belly.y - 0.02,
    0.22,
  );
  bellyShade.addColorStop(0, JUMPER_LIT);
  bellyShade.addColorStop(0.6, JUMPER);
  bellyShade.addColorStop(1, "#3a1c1a");
  ctx.fillStyle = bellyShade;
  ctx.beginPath();
  ctx.ellipse(belly.x + 0.04, belly.y, 0.2, 0.16, 0.12, 0, TAU);
  ctx.fill();

  stroke(ctx, JUMPER, 0.17, rSh, rElb);
  stroke(ctx, SKIN, 0.09, rElb, rHand);
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.arc(rHand.x, rHand.y, 0.05, 0, TAU);
  ctx.fill();

  stroke(ctx, SKIN, 0.11, neck, head);
  drawKidHead(ctx, head, mood, t, laugh);

  ctx.restore();

  if (mood === "smug" && level.id === 1) {
    const fade = 1 - ease((lt - 3) / 0.55);
    if (fade > 0.02) drawBetBubble(ctx, cam, cssW, cssH, x, y + 0.92, fade);
  }
}

function drawShoe(ctx: CanvasRenderingContext2D, ankle: Pt): void {
  ctx.fillStyle = SHOE;
  ctx.beginPath();
  ctx.ellipse(ankle.x + 0.07, ankle.y - 0.01, 0.11, 0.045, 0.05, 0, TAU);
  ctx.fill();
}

function drawNotes(
  ctx: CanvasRenderingContext2D,
  hand: Pt,
  offer: number,
  wag: number,
): void {
  ctx.save();
  ctx.translate(hand.x, hand.y);
  ctx.rotate(mix(-0.85, 0.28, offer) + wag * 0.16);
  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.rotate(-0.14 * i);
    ctx.fillStyle = i % 2 === 0 ? "#7a9a5a" : "#c8d4b0";
    ctx.strokeStyle = "#2a3a1c";
    ctx.lineWidth = 0.012;
    ctx.fillRect(0.02, -0.02 - i * 0.01, 0.24, 0.12);
    ctx.strokeRect(0.02, -0.02 - i * 0.01, 0.24, 0.12);
    ctx.restore();
  }
  ctx.fillStyle = "#1a2414";
  ctx.font = "0.09px 'Source Sans 3', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("£", 0.14, 0.06);
  ctx.restore();
}

function drawKidHead(
  ctx: CanvasRenderingContext2D,
  head: Pt,
  mood: KidMood,
  t: number,
  howl = 0,
): void {
  const hx = head.x;
  const hy = head.y;
  const sad = mood === "sad";
  const laugh = howl > 0.02;
  const shade = ctx.createLinearGradient(hx + 0.14, hy + 0.12, hx - 0.12, hy - 0.12);
  shade.addColorStop(0, SKIN_LIT);
  shade.addColorStop(0.5, SKIN);
  shade.addColorStop(1, SKIN_SHADE);
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.ellipse(hx + 0.02, hy, 0.16, 0.168, 0.1, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(hx + 0.05, hy + 0.08);
  ctx.quadraticCurveTo(hx + 0.18, hy + 0.06, hx + 0.2, hy - 0.02);
  ctx.quadraticCurveTo(hx + 0.16, hy - 0.12, hx + 0.04, hy - 0.16);
  ctx.quadraticCurveTo(hx - 0.1, hy - 0.06, hx - 0.06, hy + 0.08);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = SKIN_LINE;
  ctx.lineWidth = 0.014;
  ctx.stroke();

  ctx.fillStyle = HAIR;
  ctx.beginPath();
  ctx.ellipse(hx - 0.06, hy + 0.02, 0.12, 0.13, -0.55, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(hx - 0.16, hy);
  ctx.quadraticCurveTo(hx - 0.12, hy + 0.2, hx + 0.02, hy + 0.18);
  ctx.quadraticCurveTo(hx - 0.02, hy + 0.06, hx - 0.06, hy + 0.02);
  ctx.closePath();
  ctx.fill();

  const blink = mood === "smug" && t % 3.6 > 3.46;
  const eye: Pt = { x: hx + 0.08, y: hy + 0.03 };
  const shut = clamp01((howl - 0.28) / 0.42);
  ctx.strokeStyle = "#3a2a22";
  ctx.lineCap = "round";
  ctx.lineWidth = 0.02;
  ctx.beginPath();
  if (laugh) {
    ctx.moveTo(hx + 0.03, hy + 0.07 + 0.02 * howl);
    ctx.quadraticCurveTo(hx + 0.08, hy + 0.08 + 0.04 * howl, hx + 0.13, hy + 0.06);
  } else if (sad) {
    ctx.moveTo(hx + 0.03, hy + 0.08);
    ctx.lineTo(hx + 0.12, hy + 0.05);
  } else {
    ctx.moveTo(hx + 0.04, hy + 0.09);
    ctx.lineTo(hx + 0.13, hy + 0.08);
  }
  ctx.stroke();
  ctx.fillStyle = "#3a2a22";
  if (shut > 0.08) {
    ctx.lineWidth = 0.016 + 0.006 * shut;
    ctx.beginPath();
    ctx.moveTo(eye.x - 0.032, eye.y + 0.006);
    ctx.quadraticCurveTo(eye.x, eye.y + 0.008 + 0.016 * shut, eye.x + 0.036, eye.y + 0.004);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(eye.x - 0.032, eye.y + 0.006);
    ctx.quadraticCurveTo(eye.x, eye.y - 0.004 - 0.012 * shut, eye.x + 0.036, eye.y + 0.004);
    ctx.stroke();
  } else if (blink) {
    ctx.lineWidth = 0.016;
    ctx.beginPath();
    ctx.moveTo(eye.x - 0.03, eye.y);
    ctx.lineTo(eye.x + 0.035, eye.y - 0.004);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.ellipse(eye.x, eye.y, 0.028, sad ? 0.022 : 0.032, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(eye.x + 0.01, eye.y + 0.01, 0.01, 0, TAU);
    ctx.fill();
  }
  if (howl > 0.72) {
    const drop = (howl - 0.72) / 0.28;
    ctx.fillStyle = "rgba(170, 210, 230, 0.85)";
    ctx.beginPath();
    ctx.ellipse(eye.x + 0.02, eye.y - 0.04 - 0.03 * drop, 0.012, 0.018 + 0.01 * drop, 0.2, 0, TAU);
    ctx.fill();
  }

  const mx = hx + 0.11;
  const my = hy - 0.05;
  if (laugh) {
    const gab = clamp01((howl - 0.12) / 0.55);
    if (gab < 0.18) {
      ctx.strokeStyle = "#8a4a40";
      ctx.lineWidth = 0.02;
      ctx.beginPath();
      ctx.moveTo(mx - 0.04, my + 0.004);
      ctx.quadraticCurveTo(mx + 0.02, my - 0.05, mx + 0.06, my + 0.01);
      ctx.stroke();
    } else {
      const open = (0.012 + 0.05 * howl) * (0.65 + 0.35 * Math.abs(Math.sin(t * (6.4 + 16 * howl))));
      ctx.fillStyle = "#5a2824";
      ctx.beginPath();
      ctx.ellipse(mx + 0.01, my - 0.008, 0.028 + 0.032 * howl, open, 0.12, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#f2ead8";
      ctx.beginPath();
      ctx.ellipse(mx + 0.01, my + 0.006, 0.02 + 0.018 * howl, 0.006 + 0.01 * howl, 0.12, 0, TAU);
      ctx.fill();
    }
  } else {
    ctx.strokeStyle = "#8a4a40";
    ctx.lineWidth = 0.018;
    ctx.beginPath();
    if (sad) {
      ctx.moveTo(mx - 0.04, my - 0.02);
      ctx.quadraticCurveTo(mx + 0.01, my + 0.03, mx + 0.05, my - 0.016);
    } else {
      ctx.moveTo(mx - 0.03, my);
      ctx.quadraticCurveTo(mx + 0.02, my - 0.034, mx + 0.055, my + 0.004);
    }
    ctx.stroke();
  }
}

function drawBetBubble(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  x: number,
  y: number,
  alpha: number,
): void {
  const s = worldToScreen(cam, cssW, cssH, x, y);
  const w = Math.min(220, Math.max(150, s.ppm * 2.15));
  const h = Math.max(44, s.ppm * 0.72);
  const gap = Math.max(16, s.ppm * 0.34);
  const bx = Math.max(8, Math.min(cssW - w - 8, s.x - w * 0.5));
  const by = s.y - h - gap;
  const a = Math.max(0, Math.min(1, alpha));
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = "rgba(232, 240, 244, 0.94)";
  ctx.strokeStyle = "rgba(7, 20, 26, 0.55)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, bx, by, w, h, 10);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(s.x - 8, by + h);
  ctx.lineTo(s.x, s.y - 2);
  ctx.lineTo(s.x + 8, by + h);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#07141a";
  ctx.font = `600 ${Math.max(12, Math.min(16, s.ppm * 0.2))}px "Source Sans 3", "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Bet you can't", bx + w * 0.5, by + h * 0.34);
  ctx.fillText("do a backflip.", bx + w * 0.5, by + h * 0.68);
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
