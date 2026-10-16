import { HIP_HEIGHT, TAU } from "./constants";
import { spawnGround, worldToScreen, type Cam, type Level } from "./world";

/** Left of spawn, just in from the start wall. */
export const KID_START_X = 2.85;
const KID_HIP = HIP_HEIGHT * 0.86;

const SKIN = "#e8c4a4";
const SKIN_LINE = "#c9a07e";
const HAIR = "#4a3428";
const JUMPER = "#6a3a38";
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

/** Chubby park kid holding a wad of notes — smug until Bill lands the standing backflip. */
export function drawParkKid(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  level: Level,
  sad: boolean,
  t: number,
): void {
  if (level.train) return;
  const ground = spawnGround(level);
  const x = KID_START_X;
  const y = ground + KID_HIP;
  const s = worldToScreen(cam, cssW, cssH, x, y);
  if (s.x < -80 || s.x > cssW + 80) return;

  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "#000";
  const sh = worldToScreen(cam, cssW, cssH, x, ground);
  ctx.beginPath();
  ctx.ellipse(sh.x, sh.y, s.ppm * 0.38, s.ppm * 0.1, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  const breathe = Math.sin(t * 1.45);
  const slump = sad ? 0.22 : 0;
  const hang = -Math.PI / 2;
  const lean = 0.08 + slump * 0.55 + 0.02 * breathe;

  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.scale(s.ppm, -s.ppm);
  ctx.rotate(slump * 0.18);

  const pelvis: Pt = { x: -lean * 0.05, y: 0.02 };
  const belly: Pt = { x: pelvis.x + 0.08, y: pelvis.y + 0.22 };
  const chest: Pt = { x: pelvis.x - 0.02, y: pelvis.y + 0.48 };
  const neck: Pt = { x: chest.x - 0.02, y: chest.y + 0.2 };
  const head: Pt = { x: neck.x + 0.02, y: neck.y + 0.2 + (sad ? -0.04 : 0) };

  const lHip: Pt = { x: -0.08, y: 0 };
  const rHip: Pt = { x: 0.1, y: 0 };
  const lKnee = polar(lHip, hang + 0.12, 0.4);
  const rKnee = polar(rHip, hang - 0.08, 0.4);
  const lAnkle = polar(lKnee, hang + 0.04, 0.32);
  const rAnkle = polar(rKnee, hang - 0.04, 0.32);

  const lSh: Pt = { x: neck.x - 0.08, y: neck.y - 0.04 };
  const rSh: Pt = { x: neck.x + 0.02, y: neck.y - 0.02 };
  const cashArm = sad ? hang + 0.28 : 0.12;
  const cashFore = sad ? hang + 0.55 : 0.42;
  const lElb = polar(lSh, hang - 0.2, 0.28);
  const lHand = polar(lElb, hang + 0.15, 0.26);
  const rElb = polar(rSh, cashArm, 0.3);
  const rHand = polar(rElb, cashFore, 0.28);

  stroke(ctx, JOGGERS_DARK, 0.2, lHip, lKnee, lAnkle);
  stroke(ctx, JOGGERS, 0.19, rHip, rKnee, rAnkle);
  drawShoe(ctx, lAnkle);
  drawShoe(ctx, rAnkle);

  ctx.fillStyle = JUMPER;
  ctx.strokeStyle = JUMPER_DARK;
  ctx.lineWidth = 0.03;
  ctx.beginPath();
  ctx.moveTo(lHip.x - 0.14, lHip.y);
  ctx.quadraticCurveTo(belly.x + 0.28, belly.y - 0.02, rHip.x + 0.18, rHip.y);
  ctx.lineTo(rSh.x + 0.14, rSh.y + 0.02);
  ctx.lineTo(lSh.x - 0.12, lSh.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = JUMPER;
  ctx.beginPath();
  ctx.ellipse(belly.x + 0.06, belly.y - 0.04, 0.24, 0.18, 0.18, 0, TAU);
  ctx.fill();

  stroke(ctx, JUMPER_DARK, 0.16, lSh, lElb);
  stroke(ctx, SKIN, 0.09, lElb, lHand);
  stroke(ctx, JUMPER, 0.17, rSh, rElb);
  stroke(ctx, SKIN, 0.09, rElb, rHand);
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.arc(lHand.x, lHand.y, 0.05, 0, TAU);
  ctx.arc(rHand.x, rHand.y, 0.05, 0, TAU);
  ctx.fill();

  drawNotes(ctx, rHand, sad);

  stroke(ctx, SKIN, 0.11, neck, head);
  drawKidHead(ctx, head, sad, t);

  ctx.restore();

  if (!sad) drawBetBubble(ctx, cam, cssW, cssH, x, y + 0.42);
}

function drawShoe(ctx: CanvasRenderingContext2D, ankle: Pt): void {
  ctx.fillStyle = SHOE;
  ctx.beginPath();
  ctx.ellipse(ankle.x + 0.07, ankle.y - 0.01, 0.11, 0.045, 0.05, 0, TAU);
  ctx.fill();
}

function drawNotes(ctx: CanvasRenderingContext2D, hand: Pt, sad: boolean): void {
  ctx.save();
  ctx.translate(hand.x, hand.y);
  ctx.rotate(sad ? -0.85 : 0.35);
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

function drawKidHead(ctx: CanvasRenderingContext2D, head: Pt, sad: boolean, t: number): void {
  const hx = head.x;
  const hy = head.y;
  ctx.fillStyle = SKIN;
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

  const blink = !sad && t % 3.6 > 3.46;
  const eye: Pt = { x: hx + 0.08, y: hy + 0.03 };
  ctx.strokeStyle = "#3a2a22";
  ctx.lineCap = "round";
  ctx.lineWidth = 0.02;
  ctx.beginPath();
  if (sad) {
    ctx.moveTo(hx + 0.03, hy + 0.08);
    ctx.lineTo(hx + 0.12, hy + 0.05);
  } else {
    ctx.moveTo(hx + 0.04, hy + 0.09);
    ctx.lineTo(hx + 0.13, hy + 0.08);
  }
  ctx.stroke();
  ctx.fillStyle = "#3a2a22";
  if (blink) {
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

  ctx.strokeStyle = "#8a4a40";
  ctx.lineWidth = 0.018;
  ctx.beginPath();
  const mx = hx + 0.11;
  const my = hy - 0.05;
  if (sad) {
    ctx.moveTo(mx - 0.04, my - 0.02);
    ctx.quadraticCurveTo(mx + 0.01, my + 0.03, mx + 0.05, my - 0.016);
  } else {
    ctx.moveTo(mx - 0.03, my);
    ctx.quadraticCurveTo(mx + 0.02, my - 0.034, mx + 0.055, my + 0.004);
  }
  ctx.stroke();
}

function drawBetBubble(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  x: number,
  y: number,
): void {
  const s = worldToScreen(cam, cssW, cssH, x, y);
  const w = Math.min(220, Math.max(150, s.ppm * 2.15));
  const h = Math.max(44, s.ppm * 0.72);
  const bx = Math.max(8, s.x - w * 0.22);
  const by = s.y - h - s.ppm * 0.14;
  ctx.save();
  ctx.fillStyle = "rgba(232, 240, 244, 0.94)";
  ctx.strokeStyle = "rgba(7, 20, 26, 0.55)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, bx, by, w, h, 10);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(bx + w * 0.42, by + h);
  ctx.lineTo(s.x + 4, s.y - 2);
  ctx.lineTo(bx + w * 0.58, by + h);
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
