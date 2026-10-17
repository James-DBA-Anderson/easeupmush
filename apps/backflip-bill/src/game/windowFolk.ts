import { TAU } from "./constants";

/** Window the folk live in. Built by `visitWindows` in world.ts. */
export interface FolkSlot {
  id: string;
  wx: number;
  wy: number;
  ww: number;
  wh: number;
  storey: number;
  roofY: number;
  kind: "facade" | "train";
  /** Facade pad id so each building keeps at least one top-floor occupant. */
  block?: string;
}

type Habit = "coffee" | "phone" | "stare";

interface Folk {
  id: string;
  wx: number;
  wy: number;
  ww: number;
  wh: number;
  storey: number;
  roofY: number;
  kind: "facade" | "train";
  habit: Habit;
  hair: string;
  top: string;
  topDark: string;
  skin: string;
  skinLit: string;
  facing: 1 | -1;
  phase: number;
  bun: boolean;
  angryT: number;
  spillT: number;
  drip: number;
  dropped: boolean;
}

interface Drop {
  kind: "phone" | "coffee";
  x: number;
  y: number;
  vx: number;
  vy: number;
  ang: number;
  spin: number;
  life: number;
  max: number;
}

interface Pt {
  x: number;
  y: number;
}

const HAIR = ["#2a2018", "#5a3a24", "#c4a060", "#1a1a1c", "#7a3030", "#d8d0c4"];
const TOPS: [string, string][] = [
  ["#3a5c8a", "#2a3e5a"],
  ["#8a3a38", "#5a2424"],
  ["#d8d0c4", "#9a9288"],
  ["#2a6a4a", "#1a4a32"],
  ["#5a3a6a", "#3a2448"],
  ["#c46a38", "#8a4824"],
  ["#3a3e46", "#242830"],
];
const SKINS: [string, string][] = [
  ["#f3d2bc", "#f8e4d0"],
  ["#e8c4a4", "#f3d4b6"],
  ["#c48a62", "#d4a47a"],
  ["#f0dcc8", "#f8ece0"],
];

const folk = new Map<string, Folk>();
const drops: Drop[] = [];
let animT = 0;

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shouldOccupy(slot: FolkSlot): boolean {
  const h = hash32(slot.id);
  if (slot.kind === "train") return h % 5 === 1;
  if (slot.storey === 0) return h % 4 === 2;
  if (slot.storey === 1) return h % 8 === 1;
  if (slot.storey === 2) return h % 14 === 4;
  return false;
}

function polar(from: Pt, ang: number, len: number): Pt {
  return { x: from.x + Math.cos(ang) * len, y: from.y + Math.sin(ang) * len };
}

function stroke(ctx: CanvasRenderingContext2D, color: string, width: number, ...pts: Pt[]): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  ctx.stroke();
}

function makeFolk(slot: FolkSlot): Folk {
  const h = hash32(slot.id);
  const habit: Habit = (["coffee", "phone", "stare"] as const)[h % 3]!;
  const top = TOPS[(h >>> 8) % TOPS.length]!;
  const skin = SKINS[(h >>> 16) % SKINS.length]!;
  return {
    ...slot,
    habit,
    hair: HAIR[(h >>> 4) % HAIR.length]!,
    top: top[0],
    topDark: top[1],
    skin: skin[0],
    skinLit: skin[1],
    facing: (h >>> 12) & 1 ? 1 : -1,
    phase: ((h >>> 20) % 1000) / 1000 * 8,
    bun: ((h >>> 18) & 3) === 2,
    angryT: 0,
    spillT: 0,
    drip: 0,
    dropped: false,
  };
}

export function seedFolk(slot: FolkSlot): void {
  if (folk.has(slot.id)) return;
  if (!shouldOccupy(slot)) return;
  folk.set(slot.id, makeFolk(slot));
}

/** After hashing, put one person in the top windows of any empty facade. */
export function ensureOddFolk(slots: FolkSlot[]): void {
  const groups = new Map<string, FolkSlot[]>();
  for (const s of slots) {
    if (s.kind !== "facade") continue;
    const key = s.block ?? s.roofY.toFixed(2);
    const arr = groups.get(key) ?? [];
    arr.push(s);
    groups.set(key, arr);
  }
  for (const arr of groups.values()) {
    const top = Math.min(...arr.map((s) => s.storey));
    const tops = arr.filter((s) => s.storey === top);
    if (tops.some((s) => folk.has(s.id))) continue;
    const pick = tops.reduce((a, b) => (hash32(a.id) < hash32(b.id) ? a : b));
    folk.set(pick.id, makeFolk(pick));
  }
}

export function resetWindowFolk(): void {
  folk.clear();
  drops.length = 0;
  animT = 0;
}

export function stepWindowFolk(dt: number): void {
  animT += dt;
  for (const f of folk.values()) {
    f.angryT = Math.max(0, f.angryT - dt);
    f.spillT = Math.max(0, f.spillT - dt);
    if (f.habit === "coffee" && f.spillT > 0) {
      f.drip += dt;
      if (f.drip > 0.048) {
        f.drip = 0;
        emitCoffee(f, 1);
      }
    }
  }
  for (const d of drops) {
    d.vy -= 11.6 * dt;
    d.vx *= Math.max(0.55, 1 - 0.32 * dt);
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.ang += d.spin * dt;
    d.life -= dt;
  }
  for (let i = drops.length - 1; i >= 0; i--) {
    if (drops[i]!.life <= 0) drops.splice(i, 1);
  }
}

function emitCoffee(f: Folk, n: number): void {
  const hx = f.wx + f.ww * 0.5 + f.facing * 0.14;
  const hy = f.wy - f.wh * 0.4;
  for (let i = 0; i < n; i++) {
    drops.push({
      kind: "coffee",
      x: hx + (Math.random() - 0.5) * 0.1,
      y: hy + (Math.random() - 0.5) * 0.05,
      vx: f.facing * (0.25 + Math.random() * 1.1) + (Math.random() - 0.5) * 0.9,
      vy: 0.15 + Math.random() * 1.4,
      ang: Math.random() * TAU,
      spin: (Math.random() - 0.5) * 10,
      life: 0.5 + Math.random() * 0.45,
      max: 0.95,
    });
  }
}

function scare(f: Folk): { dropped: boolean } {
  f.angryT = 2.7;
  let dropped = false;
  if (f.habit === "coffee") {
    f.spillT = Math.max(f.spillT, 1.55);
    emitCoffee(f, 8);
  }
  if (f.habit === "phone" && !f.dropped) {
    f.dropped = true;
    dropped = true;
    drops.push({
      kind: "phone",
      x: f.wx + f.ww * 0.5 + f.facing * 0.1,
      y: f.wy - f.wh * 0.42,
      vx: f.facing * (0.7 + Math.random() * 1.3) + (Math.random() - 0.5) * 0.4,
      vy: 0.85 + Math.random() * 0.7,
      ang: 0.35,
      spin: (Math.random() < 0.5 ? -1 : 1) * (7 + Math.random() * 9),
      life: 3.6,
      max: 3.6,
    });
  }
  return { dropped };
}

/** Startle anyone in the storey immediately under a landing. */
export function startleWindowFolk(
  landX: number,
  landY: number,
): { count: number; dropped: boolean } {
  let count = 0;
  let dropped = false;
  for (const f of folk.values()) {
    if (f.roofY - f.wy > 2.05) continue;
    if (Math.abs(f.roofY - landY) > 1.2) continue;
    const mid = f.wx + f.ww * 0.5;
    if (Math.abs(mid - landX) > 1.55) continue;
    const r = scare(f);
    count += 1;
    if (r.dropped) dropped = true;
  }
  return { count, dropped };
}

export function occupyWindow(
  ctx: CanvasRenderingContext2D,
  spec: {
    sx: number;
    sy: number;
    sw: number;
    sh: number;
    ppm: number;
    slot: FolkSlot;
  },
): void {
  seedFolk(spec.slot);
  const f = folk.get(spec.slot.id);
  if (!f) return;
  const { sx, sy, sw, sh, ppm } = spec;
  ctx.save();
  ctx.beginPath();
  ctx.rect(sx, sy, sw, sh);
  ctx.clip();
  ctx.fillStyle = f.kind === "train" ? "rgba(48, 62, 72, 0.55)" : "rgba(72, 42, 32, 0.62)";
  ctx.fillRect(sx, sy, sw, sh);
  const lamp = ctx.createRadialGradient(
    sx + sw * 0.5,
    sy + sh * 0.62,
    sw * 0.08,
    sx + sw * 0.5,
    sy + sh * 0.55,
    sw * 0.7,
  );
  lamp.addColorStop(0, "rgba(255, 196, 110, 0.42)");
  lamp.addColorStop(1, "rgba(40, 20, 16, 0)");
  ctx.fillStyle = lamp;
  ctx.fillRect(sx, sy, sw, sh);
  ctx.fillStyle = "rgba(40, 22, 18, 0.35)";
  ctx.fillRect(sx, sy, sw * 0.12, sh);
  ctx.fillRect(sx + sw * 0.88, sy, sw * 0.12, sh);

  ctx.save();
  ctx.translate(sx + sw * 0.5, sy + sh);
  ctx.scale(f.facing * ppm * 1.12, -ppm * 1.12);
  ctx.translate(0, 0.22);
  drawBust(ctx, f);
  ctx.restore();
  ctx.restore();

  if (f.angryT > 0.04) {
    const a = Math.min(1, f.angryT * 1.8);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = "#f4ead8";
    ctx.strokeStyle = "rgba(20, 12, 10, 0.55)";
    ctx.lineWidth = 2;
    const fs = Math.max(13, 0.28 * ppm);
    ctx.font = `800 ${fs}px 'Source Sans 3', 'Segoe UI', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    const bang = 1 + 0.08 * Math.sin(animT * 28);
    ctx.translate(sx + sw * 0.78, sy - 2);
    ctx.scale(bang, bang);
    ctx.strokeText("!", 0, 0);
    ctx.fillText("!", 0, 0);
    ctx.restore();
  }
}

function sipAmt(f: Folk): number {
  if (f.habit !== "coffee" || f.angryT > 0 || f.spillT > 0) return 0;
  const cycle = (animT + f.phase) % 7.4;
  if (cycle < 5.5 || cycle > 6.85) return 0;
  const u = (cycle - 5.5) / 1.35;
  if (u < 0.28) return u / 0.28;
  if (u > 0.72) return 1 - (u - 0.72) / 0.28;
  return 1;
}

function drawBust(ctx: CanvasRenderingContext2D, f: Folk): void {
  const angry = f.angryT > 0;
  const spill = f.spillT > 0;
  const sip = sipAmt(f);
  const breathe = Math.sin((animT + f.phase) * 1.55) * 0.01;
  const shake = angry ? Math.sin(animT * 40) * 0.018 : 0;
  const bang = angry ? Math.abs(Math.sin(animT * 22)) * 0.016 : 0;
  ctx.translate(shake, bang);

  const neck: Pt = { x: 0.03, y: 0.48 + breathe };
  const lookDown = f.habit === "phone" && !f.dropped && !angry ? 0.05 : 0;
  const head: Pt = {
    x: 0.06 + lookDown * 0.4,
    y: 0.66 + breathe - lookDown - (angry ? 0.01 : 0),
  };
  const farSh: Pt = { x: -0.11, y: neck.y - 0.03 };
  const nearSh: Pt = { x: 0.12, y: neck.y - 0.02 };
  const hang = -Math.PI / 2;

  let farElb: Pt;
  let farHand: Pt;
  let nearElb: Pt;
  let nearHand: Pt;

  if (f.habit === "coffee") {
    const mug: Pt = spill
      ? { x: 0.2, y: 0.34 }
      : { x: 0.14 + sip * 0.04, y: 0.4 + sip * 0.18 };
    nearElb = polar(nearSh, mix(hang + 0.55, 0.55, sip), 0.2);
    nearHand = mug;
    farElb = polar(farSh, hang - 0.15, 0.18);
    farHand = { x: -0.08, y: 0.08 };
  } else if (f.habit === "phone" && !f.dropped) {
    const ph: Pt = { x: 0.1, y: 0.32 };
    nearElb = { x: 0.16, y: 0.28 };
    nearHand = { x: ph.x + 0.05, y: ph.y };
    farElb = { x: 0.02, y: 0.26 };
    farHand = { x: ph.x - 0.04, y: ph.y - 0.01 };
  } else if (f.habit === "phone") {
    nearElb = polar(nearSh, 0.95 + Math.sin(animT * 18) * 0.2, 0.2);
    nearHand = polar(nearElb, 1.15, 0.16);
    farElb = polar(farSh, hang - 0.4, 0.18);
    farHand = polar(farElb, hang - 0.2, 0.15);
  } else if (angry) {
    nearElb = { x: 0.16, y: 0.3 };
    nearHand = { x: 0.22, y: 0.5 + Math.sin(animT * 22) * 0.04 };
    farElb = polar(farSh, hang - 0.2, 0.17);
    farHand = { x: -0.1, y: 0.08 };
  } else {
    farElb = { x: -0.1, y: 0.16 };
    farHand = { x: -0.06, y: 0.07 };
    nearElb = { x: 0.16, y: 0.16 };
    nearHand = { x: 0.12, y: 0.07 };
  }

  stroke(ctx, f.topDark, 0.13, farSh, farElb);
  stroke(ctx, f.skin, 0.08, farElb, farHand);
  ctx.fillStyle = f.skin;
  ctx.beginPath();
  ctx.arc(farHand.x, farHand.y, 0.042, 0, TAU);
  ctx.fill();

  ctx.fillStyle = f.top;
  ctx.strokeStyle = f.topDark;
  ctx.lineWidth = 0.024;
  ctx.beginPath();
  ctx.moveTo(-0.14, 0.05);
  ctx.quadraticCurveTo(farSh.x - 0.08, 0.22, farSh.x - 0.04, farSh.y);
  ctx.lineTo(nearSh.x + 0.05, nearSh.y);
  ctx.quadraticCurveTo(0.2, 0.2, 0.15, 0.04);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  stroke(ctx, f.top, 0.14, nearSh, nearElb);
  stroke(ctx, f.skin, 0.085, nearElb, nearHand);
  ctx.fillStyle = f.skin;
  ctx.beginPath();
  ctx.arc(nearHand.x, nearHand.y, 0.045, 0, TAU);
  ctx.fill();

  if (f.habit === "coffee") drawMug(ctx, nearHand, spill, sip);
  if (f.habit === "phone" && !f.dropped) drawPhone(ctx, { x: 0.1, y: 0.32 }, 0.12, false);

  stroke(ctx, f.skin, 0.09, neck, head);
  drawHead(ctx, f, head, angry, lookDown > 0);

  if (angry) {
    ctx.strokeStyle = "rgba(232, 240, 244, 0.45)";
    ctx.lineWidth = 0.018;
    ctx.beginPath();
    ctx.arc(nearHand.x, nearHand.y, 0.07 + 0.02 * Math.sin(animT * 22), 0, TAU);
    ctx.stroke();
  }
}

function mix(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

function drawMug(ctx: CanvasRenderingContext2D, hand: Pt, spill: boolean, sip: number): void {
  ctx.save();
  ctx.translate(hand.x + 0.02, hand.y + 0.02);
  ctx.rotate(spill ? 1.25 : -0.18 + sip * 0.4);
  ctx.fillStyle = "#efe6d8";
  ctx.strokeStyle = "#b8a890";
  ctx.lineWidth = 0.012;
  ctx.fillRect(-0.038, 0, 0.076, 0.1);
  ctx.strokeRect(-0.038, 0, 0.076, 0.1);
  ctx.beginPath();
  ctx.arc(0.042, 0.04, 0.028, -1.1, 1.1);
  ctx.stroke();
  if (!spill) {
    ctx.fillStyle = "#3a2218";
    ctx.beginPath();
    ctx.ellipse(0, 0.092, 0.03, 0.012, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(232, 228, 220, 0.45)";
    const t = animT;
    for (let i = 0; i < 3; i++) {
      const u = (t * 0.7 + i * 0.33) % 1;
      ctx.globalAlpha = 0.4 * (1 - u);
      ctx.beginPath();
      ctx.ellipse(0.01 * Math.sin(t + i), 0.11 + u * 0.08, 0.012, 0.008, 0, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = "#4a2a18";
    ctx.beginPath();
    ctx.moveTo(0.02, 0.08);
    ctx.quadraticCurveTo(0.08, 0.02, 0.12, -0.04);
    ctx.lineTo(0.08, -0.04);
    ctx.quadraticCurveTo(0.05, 0.02, 0.01, 0.06);
    ctx.fill();
  }
  ctx.restore();
}

function drawPhone(ctx: CanvasRenderingContext2D, p: Pt, ang: number, falling: boolean): void {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(ang);
  const w = falling ? 0.07 : 0.055;
  const h = falling ? 0.13 : 0.1;
  ctx.fillStyle = "#1a1c20";
  ctx.fillRect(-w * 0.5, -h * 0.5, w, h);
  ctx.fillStyle = falling ? "#4a88aa" : "#7ec8ff";
  ctx.fillRect(-w * 0.36, -h * 0.34, w * 0.72, h * 0.7);
  ctx.restore();
}

function drawHead(
  ctx: CanvasRenderingContext2D,
  f: Folk,
  head: Pt,
  angry: boolean,
  lookDown: boolean,
): void {
  const hx = head.x;
  const hy = head.y;
  const shade = ctx.createLinearGradient(hx + 0.12, hy + 0.1, hx - 0.1, hy - 0.1);
  shade.addColorStop(0, f.skinLit);
  shade.addColorStop(1, f.skin);
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.ellipse(hx + 0.015, hy, 0.145, 0.155, 0.08, 0, TAU);
  ctx.fill();

  ctx.fillStyle = f.hair;
  ctx.beginPath();
  ctx.ellipse(hx - 0.05, hy + 0.04, 0.11, 0.13, -0.5, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(hx - 0.14, hy + 0.02);
  ctx.quadraticCurveTo(hx - 0.08, hy + 0.2, hx + 0.06, hy + 0.18);
  ctx.quadraticCurveTo(hx + 0.02, hy + 0.08, hx - 0.04, hy + 0.05);
  ctx.closePath();
  ctx.fill();
  if (f.bun) {
    ctx.beginPath();
    ctx.ellipse(hx - 0.12, hy + 0.08, 0.055, 0.05, -0.3, 0, TAU);
    ctx.fill();
  }

  const eye: Pt = { x: hx + 0.07, y: hy + (lookDown ? -0.01 : 0.025) };
  ctx.fillStyle = "#3a2a22";
  if (angry) {
    ctx.strokeStyle = "#3a2a22";
    ctx.lineWidth = 0.022;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(eye.x - 0.04, eye.y + 0.03);
    ctx.lineTo(eye.x + 0.04, eye.y - 0.01);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(eye.x, eye.y - 0.005, 0.026, 0.028, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(eye.x + 0.008, eye.y + 0.006, 0.008, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#5a2824";
    ctx.beginPath();
    ctx.ellipse(hx + 0.09, hy - 0.06, 0.04, 0.03 + 0.01 * Math.abs(Math.sin(animT * 16)), 0.1, 0, TAU);
    ctx.fill();
  } else {
    const blink = (animT + f.phase) % 3.8 > 3.64;
    ctx.strokeStyle = "#3a2a22";
    ctx.lineCap = "round";
    if (blink) {
      ctx.lineWidth = 0.016;
      ctx.beginPath();
      ctx.moveTo(eye.x - 0.028, eye.y);
      ctx.lineTo(eye.x + 0.032, eye.y - 0.004);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.ellipse(eye.x, eye.y, 0.026, lookDown ? 0.02 : 0.03, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(eye.x + 0.008, eye.y + 0.008, 0.009, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = "#8a4a40";
    ctx.lineWidth = 0.016;
    ctx.beginPath();
    if (lookDown) {
      ctx.moveTo(hx + 0.06, hy - 0.05);
      ctx.quadraticCurveTo(hx + 0.1, hy - 0.04, hx + 0.13, hy - 0.048);
    } else {
      ctx.moveTo(hx + 0.07, hy - 0.048);
      ctx.quadraticCurveTo(hx + 0.11, hy - 0.07, hx + 0.145, hy - 0.042);
    }
    ctx.stroke();
  }
}

export function drawFolkDrops(
  ctx: CanvasRenderingContext2D,
  toScreen: (x: number, y: number) => { x: number; y: number; ppm: number },
): void {
  for (const d of drops) {
    const s = toScreen(d.x, d.y);
    const a = Math.min(1, d.life / Math.min(0.35, d.max));
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(s.x, s.y);
    if (d.kind === "phone") {
      ctx.scale(s.ppm, -s.ppm);
      drawPhone(ctx, { x: 0, y: 0 }, d.ang, true);
    } else {
      ctx.rotate(d.ang);
      ctx.fillStyle = "#4a2818";
      ctx.beginPath();
      ctx.ellipse(0, 0, Math.max(2.2, 0.045 * s.ppm), Math.max(1.6, 0.032 * s.ppm), 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}
