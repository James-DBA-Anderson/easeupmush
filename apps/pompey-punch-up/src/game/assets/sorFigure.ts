/** Streets of Rage 2–inspired side-on silhouettes + walk frames. */

import {
  buildMetrics,
  shadeSkin,
  type BodyBuild,
  type BottomStyle,
  type HairStyle,
  type KitStyle,
  type Present,
} from "./pompeyLooks";

export type SorPose =
  | "idle"
  | "walk0"
  | "walk1"
  | "walk2"
  | "walk3"
  | "run0"
  | "run1"
  | "run2"
  | "run3"
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
  | "limp_arm"
  | "limp_leg"
  | "down"
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
  | "block3"
  | "crouch"
  /** Seated on a bike — pedal frames. */
  | "ride0"
  | "ride1"
  /** Standing on a scooter — weight-shift frames. */
  | "ride_scooter0"
  | "ride_scooter1"
  /** Standing on a skateboard — push / cruise. */
  | "skate0"
  | "skate1"
  /** Ollie pop. */
  | "ollie"
  /** Kickflip mid-spin. */
  | "kickflip"
  /** Weight on the tail — rolling manual. */
  | "manual"
  /** @deprecated kept for sheet gen alias */
  | "run";

type PunchKind = "jab" | "hook" | "upper";

/** Map pose name → punch kind + 0..2 frame (wind-up / hit / follow-through). */
function punchAnim(pose: SorPose): { kind: PunchKind; frame: 0 | 1 | 2 } | null {
  if (pose === "jab0") return { kind: "jab", frame: 0 };
  if (pose === "jab" || pose === "jab1") return { kind: "jab", frame: 1 };
  if (pose === "jab2") return { kind: "jab", frame: 2 };
  if (pose === "punch0") return { kind: "hook", frame: 0 };
  if (pose === "punch" || pose === "punch1") return { kind: "hook", frame: 1 };
  if (pose === "punch2") return { kind: "hook", frame: 2 };
  if (pose === "upper0") return { kind: "upper", frame: 0 };
  if (pose === "upper" || pose === "upper1") return { kind: "upper", frame: 1 };
  if (pose === "upper2") return { kind: "upper", frame: 2 };
  return null;
}

/** Map pose name → kick 0..2 frame (chamber / thrust / recover). */
function kickAnim(pose: SorPose): { frame: 0 | 1 | 2 } | null {
  if (pose === "kick0") return { frame: 0 };
  if (pose === "kick" || pose === "kick1") return { frame: 1 };
  if (pose === "kick2") return { frame: 2 };
  return null;
}

/** Map pose name → jump 0..2 frame (rise / apex / fall). */
function jumpAnim(pose: SorPose): { frame: 0 | 1 | 2 } | null {
  if (pose === "jump0") return { frame: 0 };
  if (pose === "jump" || pose === "jump1") return { frame: 1 };
  if (pose === "jump2") return { frame: 2 };
  return null;
}

/** Map pose name → backhand 0..2 frame (glance / whip / recover). */
function backhandAnim(pose: SorPose): { frame: 0 | 1 | 2 } | null {
  if (pose === "backhand0") return { frame: 0 };
  if (pose === "backhand" || pose === "backhand1") return { frame: 1 };
  if (pose === "backhand2") return { frame: 2 };
  return null;
}

/** Map pose name → bat swing 0..2 frame (cock / contact / follow-through). */
function weaponSwingAnim(pose: SorPose): { frame: 0 | 1 | 2 } | null {
  if (pose === "weapon_swing0") return { frame: 0 };
  if (pose === "weapon_swing" || pose === "weapon_swing1") return { frame: 1 };
  if (pose === "weapon_swing2") return { frame: 2 };
  return null;
}

function strokeFill(
  ctx: CanvasRenderingContext2D,
  draw: () => void,
  fill: string,
  line = "#1a1410",
  width = 2.5,
): void {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = line;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  draw();
  ctx.restore();
}

/** Solid fill with no outline — used sparingly for interior pads. */
function fillOnly(
  ctx: CanvasRenderingContext2D,
  draw: () => void,
  fill: string,
): void {
  ctx.save();
  ctx.fillStyle = fill;
  draw();
  ctx.restore();
}

const OUTLINE = "#1a1410";
const POLICE_NAVY = "#1a2840";
const POLICE_HIVIS = "#e8d020";
const POLICE_HIVIS_EDGE = "#c8b018";
const POLICE_REFLECT = "#f4f0e0";

/**
 * Custodian helmet (bobby hat) — dome + brim + Sillitoe check band.
 * Sits on the crown so eyes/mouth stay readable underneath.
 */
function drawPoliceHelmet(
  ctx: CanvasRenderingContext2D,
  hx: number,
  hy: number,
  hs: number,
  headTilt = 0.1,
): void {
  const crownX = hx;
  const crownY = hy - 11 * hs;
  // Dome
  strokeFill(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(crownX, crownY, 11.2 * hs, 9 * hs, headTilt * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }, POLICE_NAVY, OUTLINE, 2);
  // Peak / brim — above the eye line
  strokeFill(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(hx + 6.5 * hs, hy - 5 * hs, 7.2 * hs, 2.2 * hs, headTilt + 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }, shadeSkin(POLICE_NAVY, 0.15), OUTLINE, 1.8);
  // Sillitoe tartan band
  const bandY = hy - 4.8 * hs;
  const bandL = hx - 9.5 * hs;
  const bandR = hx + 8 * hs;
  const bandH = 3.3 * hs;
  fillOnly(ctx, () => {
    ctx.beginPath();
    ctx.rect(bandL, bandY - bandH * 0.5, bandR - bandL, bandH);
    ctx.fill();
  }, "#f4f0e8");
  const checks = 7;
  for (let i = 0; i < checks; i++) {
    if (i % 2 === 0) continue;
    const cw = (bandR - bandL) / checks;
    fillOnly(ctx, () => {
      ctx.beginPath();
      ctx.rect(bandL + i * cw, bandY - bandH * 0.5, cw, bandH);
      ctx.fill();
    }, "#1a1410");
  }
  strokeFill(ctx, () => {
    ctx.beginPath();
    ctx.rect(bandL, bandY - bandH * 0.5, bandR - bandL, bandH);
    ctx.stroke();
  }, "transparent", OUTLINE, 1.4);
  // Silver badge on the dome
  strokeFill(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(hx + 3.5 * hs, hy - 11 * hs, 2.1 * hs, 2.6 * hs, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }, "#c8c4b8", OUTLINE, 1.2);
}

/** Hi-vis tabard over the navy tunic — yellow with reflective strips. */
function drawPoliceVest(
  ctx: CanvasRenderingContext2D,
  shoulder: { x: number; y: number },
  hip: { x: number; y: number },
  tw: number,
): void {
  const top = shoulder.y + 4;
  const bot = hip.y - 2;
  const midX = (shoulder.x + hip.x) * 0.5 + 1;
  const halfW = 11 * tw;
  strokeFill(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(midX - halfW + 1, top);
    ctx.lineTo(midX + halfW - 2, top + 1);
    ctx.lineTo(midX + halfW - 1, bot);
    ctx.lineTo(midX - halfW, bot - 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }, POLICE_HIVIS, OUTLINE, 1.8);
  // Reflective bands
  for (const t of [0.28, 0.58] as const) {
    const y = top + (bot - top) * t;
    strokeFill(ctx, () => {
      ctx.beginPath();
      ctx.rect(midX - halfW + 2, y - 1.4, halfW * 2 - 5, 2.8);
      ctx.fill();
      ctx.stroke();
    }, POLICE_REFLECT, POLICE_HIVIS_EDGE, 1);
  }
  // Tiny epaulette / radio hint on the near shoulder
  strokeFill(ctx, () => {
    ctx.beginPath();
    ctx.rect(midX + halfW - 5, top - 1, 4.5, 7);
    ctx.fill();
    ctx.stroke();
  }, "#2a2a32", OUTLINE, 1.2);
  fillOnly(ctx, () => {
    ctx.beginPath();
    ctx.arc(midX + halfW - 2.5, top + 1.5, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }, "#6a9a40");
}

/** Side-on helmet for floored / crawling coppers. */
function drawPoliceHelmetSide(
  ctx: CanvasRenderingContext2D,
  hx: number,
  hy: number,
  scale = 1,
): void {
  strokeFill(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(hx, hy - 3 * scale, 12 * scale, 9 * scale, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }, POLICE_NAVY, OUTLINE, 2);
  // Check band along the side
  fillOnly(ctx, () => {
    ctx.beginPath();
    ctx.rect(hx - 10 * scale, hy - 1 * scale, 18 * scale, 3.2 * scale);
    ctx.fill();
  }, "#f4f0e8");
  for (let i = 0; i < 6; i++) {
    if (i % 2 === 0) continue;
    fillOnly(ctx, () => {
      ctx.beginPath();
      ctx.rect(hx - 10 * scale + i * 3 * scale, hy - 1 * scale, 3 * scale, 3.2 * scale);
      ctx.fill();
    }, "#1a1410");
  }
  strokeFill(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(hx + 8 * scale, hy + 1 * scale, 5 * scale, 2 * scale, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }, shadeSkin(POLICE_NAVY, 0.12), OUTLINE, 1.5);
}

/** Capsule limb — fill only so segments blend; torso/head carry the outer outline. */
function limb(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r0: number,
  r1: number,
  fill: string,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  fillOnly(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(x0 + nx * r0, y0 + ny * r0);
    ctx.lineTo(x1 + nx * r1, y1 + ny * r1);
    ctx.arc(x1, y1, r1, Math.atan2(ny, nx), Math.atan2(-ny, -nx), false);
    ctx.lineTo(x0 - nx * r0, y0 - ny * r0);
    ctx.arc(x0, y0, r0, Math.atan2(-ny, -nx), Math.atan2(ny, nx), false);
    ctx.closePath();
    ctx.fill();
  }, fill);
}

/** Soft joint pad so thigh/shin and elbow seams stay opaque without a hard ring. */
function jointCap(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fill: string,
): void {
  fillOnly(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
  }, fill);
}

/** Fist / hand blob — fill only. */
function fistBlob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rot: number,
  fill: string,
): void {
  fillOnly(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    ctx.fill();
  }, fill);
}

/** Skull cap / bun / ponytail root — drawn under the face oval. */
function drawProfileHairBack(
  ctx: CanvasRenderingContext2D,
  hx: number,
  hy: number,
  hs: number,
  hair: string,
  style: HairStyle,
  headSnap: boolean,
): void {
  const snapX = headSnap ? -2 : 0;
  const snapRot = headSnap ? -0.45 : -0.15;
  if (style === "crop") {
    fistBlob(ctx, hx - 2 + snapX, hy - 2, 11 * hs, 12 * hs, snapRot, hair);
    return;
  }
  if (style === "bun") {
    fistBlob(ctx, hx - 2 + snapX, hy - 2, 11 * hs, 12 * hs, snapRot, hair);
    strokeFill(ctx, () => {
      ctx.beginPath();
      ctx.ellipse(hx - 4 + snapX, hy - 10, 5.5 * hs, 5 * hs, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }, hair, OUTLINE, 1.5);
    return;
  }
  if (style === "ponytail") {
    fistBlob(ctx, hx - 1 + snapX, hy - 2, 11.5 * hs, 12 * hs, snapRot, hair);
    strokeFill(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(hx - 8 + snapX, hy - 2);
      ctx.quadraticCurveTo(hx - 18, hy + 6, hx - 14, hy + 20);
      ctx.quadraticCurveTo(hx - 10, hy + 14, hx - 6, hy + 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }, hair, OUTLINE, 1.6);
    return;
  }
  // bob / shoulder — fuller crown behind the skull
  fistBlob(ctx, hx - 3 + snapX, hy - 1, 13 * hs, 13.5 * hs, snapRot, hair);
}

/** Fringe + hair cascading down the back — drawn over neck / jacket. */
function drawProfileHairFront(
  ctx: CanvasRenderingContext2D,
  hx: number,
  hy: number,
  hs: number,
  hair: string,
  style: HairStyle,
  headSnap: boolean,
  shoulderY: number,
): void {
  if (style === "crop") return;
  const snapX = headSnap ? -3 : 0;
  // Soft fringe over the forehead
  fillOnly(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(hx - 4 + snapX, hy - 8 * hs);
    ctx.quadraticCurveTo(hx + 4, hy - 11 * hs, hx + 10, hy - 4);
    ctx.quadraticCurveTo(hx + 2, hy - 6, hx - 4 + snapX, hy - 4);
    ctx.closePath();
    ctx.fill();
  }, hair);

  if (style === "bob") {
    strokeFill(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(hx - 10 + snapX, hy);
      ctx.quadraticCurveTo(hx - 14, hy + 10, hx - 8, hy + 16);
      ctx.quadraticCurveTo(hx - 4, hy + 8, hx - 6, hy + 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }, hair, OUTLINE, 1.5);
    return;
  }
  if (style === "bun") return;
  if (style === "ponytail") {
    // Tail already drawn behind; add a cheek curl
    fillOnly(ctx, () => {
      ctx.beginPath();
      ctx.ellipse(hx - 8 + snapX, hy + 6, 3.5, 5, -0.3, 0, Math.PI * 2);
      ctx.fill();
    }, hair);
    return;
  }
  // shoulder-length cascade down the back edge
  strokeFill(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(hx - 10 + snapX, hy - 2);
    ctx.quadraticCurveTo(hx - 16, hy + 8, hx - 14, shoulderY + 10);
    ctx.quadraticCurveTo(hx - 12, shoulderY + 18, hx - 6, shoulderY + 14);
    ctx.quadraticCurveTo(hx - 8, hy + 10, hx - 5, hy + 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }, hair, OUTLINE, 1.6);
  // Front lock over the cheek / shoulder
  fillOnly(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(hx + 2, hy - 4);
    ctx.quadraticCurveTo(hx + 8, hy + 6, hx + 4, hy + 14);
    ctx.quadraticCurveTo(hx + 2, hy + 6, hx, hy);
    ctx.closePath();
    ctx.fill();
  }, hair);
}


/**
 * Side-view trainer. Pivot at the ankle `(ankleX, soleY)`.
 * `angleRad` tips the toe: negative = toes up (chamber), positive = toes down (stomp/point).
 */
function bootSide(
  ctx: CanvasRenderingContext2D,
  ankleX: number,
  soleY: number,
  angleRad = 0,
): void {
  // Local space: ankle at origin (shin attach), sole a short drop below
  const heel = -9;
  const tip = 13;
  const cuffBack = -6;
  const cuffFront = 3;
  const cuffTop = -8;
  const vamp = -1;
  const sole = 5;

  const body = (): void => {
    ctx.beginPath();
    ctx.moveTo(cuffBack, cuffTop);
    ctx.lineTo(cuffFront, cuffTop + 1);
    ctx.quadraticCurveTo(8, vamp, tip - 1, sole - 4);
    ctx.quadraticCurveTo(tip + 3, sole - 2, tip, sole);
    ctx.lineTo(heel, sole);
    ctx.quadraticCurveTo(heel - 2, sole - 6, cuffBack, cuffTop);
    ctx.closePath();
  };

  ctx.save();
  ctx.translate(ankleX, soleY);
  ctx.rotate(angleRad);
  // Slightly undersize vs the doodle body so boots don't dominate the silhouette
  ctx.scale(0.86, 0.86);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.fillStyle = "#2a2220";
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2;
  body();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#4a4540";
  ctx.beginPath();
  ctx.moveTo(heel + 1, sole - 2);
  ctx.lineTo(tip - 1, sole - 2);
  ctx.lineTo(tip, sole);
  ctx.lineTo(heel, sole);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#1a1614";
  ctx.beginPath();
  ctx.moveTo(heel, sole - 4);
  ctx.lineTo(-3, sole - 4);
  ctx.lineTo(-3, sole);
  ctx.lineTo(heel, sole);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cuffFront - 2, cuffTop + 3);
  ctx.lineTo(5, vamp + 1);
  ctx.stroke();
  ctx.lineWidth = 1.3;
  for (const t of [0.35, 0.65] as const) {
    const lx = cuffFront - 2 + (5 - (cuffFront - 2)) * t;
    const ly = cuffTop + 3 + (vamp + 1 - (cuffTop + 3)) * t;
    ctx.beginPath();
    ctx.moveTo(lx - 2, ly - 1);
    ctx.lineTo(lx + 2, ly + 1);
    ctx.stroke();
  }

  ctx.fillStyle = "#3a3532";
  ctx.beginPath();
  ctx.ellipse(tip - 3, sole - 3.5, 3.2, 2.2, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

type Pt = { x: number; y: number };

/** Pull `to` toward `from` if the segment is longer than maxLen. */
function reach(from: Pt, to: Pt, maxLen: number): Pt {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  if (len <= maxLen) return to;
  const s = maxLen / len;
  return { x: from.x + dx * s, y: from.y + dy * s };
}

/** Stride phase 0..1 for walk/run leg swing (facing right). */
function strideLegs(
  hip: Pt,
  feetY: number,
  phase: number,
  amp: number,
): { back: { knee: Pt; foot: Pt }; front: { knee: Pt; foot: Pt } } {
  const t = phase * Math.PI * 2;
  // Opposite feet — clear contact vs passing frames
  const farX = Math.sin(t) * amp;
  const nearX = Math.sin(t + Math.PI) * amp;
  // Lift peaks mid-swing (when that foot is off the ground)
  const farLift = Math.max(0, Math.cos(t)) * amp * 0.72;
  const nearLift = Math.max(0, Math.cos(t + Math.PI)) * amp * 0.72;
  // Knee rises with the swing and bends more on the planted side
  const farKneeBend = 12 + farLift * 0.45 + Math.max(0, -farX) * 0.15;
  const nearKneeBend = 12 + nearLift * 0.45 + Math.max(0, -nearX) * 0.15;
  return {
    back: {
      knee: {
        x: hip.x - 5 + farX * 0.55,
        y: hip.y + farKneeBend - farLift * 0.35,
      },
      foot: { x: hip.x - 3 + farX, y: feetY - farLift },
    },
    front: {
      knee: {
        x: hip.x + 4 + nearX * 0.55,
        y: hip.y + nearKneeBend - nearLift * 0.35,
      },
      foot: { x: hip.x + 5 + nearX, y: feetY - nearLift },
    },
  };
}

function strideArms(
  shoulder: Pt,
  phase: number,
  amp: number,
  run = false,
): { back: { elbow: Pt; hand: Pt }; front: { elbow: Pt; hand: Pt } } {
  const t = phase * Math.PI * 2;
  // Opposite to legs — far arm stays behind the torso and pumps visibly
  const farSwing = Math.sin(t + Math.PI);
  const nearSwing = Math.sin(t);

  const arm = (swing: number, side: "far" | "near") => {
    const sx = side === "far" ? -1 : 1;
    if (run) {
      // Bent pump: elbow stays dropped so the forearm never lines up with the upper arm.
      // Forward half lifts the fist toward the chest; back half drops it by the hip.
      const elbow: Pt = {
        x: shoulder.x + sx * 5 + swing * amp * 0.2,
        y: shoulder.y + 13 + Math.abs(swing) * 1.5,
      };
      const hand: Pt = {
        x: shoulder.x + sx * 7 + swing * amp * 0.9,
        y: shoulder.y + 15 - swing * 12,
      };
      return { elbow, hand };
    }
    // Walk — softer swing, still a visible elbow bend
    return {
      elbow: {
        x: shoulder.x + sx * 5 + swing * amp * 0.32,
        y: shoulder.y + 12 + Math.abs(swing) * 0.2,
      },
      hand: {
        x: shoulder.x + sx * 8 + swing * amp * 0.8,
        y: shoulder.y + 22 + Math.max(0, -swing) * 0.25,
      },
    };
  };

  return {
    back: arm(farSwing, "far"),
    front: arm(nearSwing, "near"),
  };
}

function walkPhase(pose: SorPose): number | null {
  // Offset so we never land on sin=0 for both feet (walk0≈walk2 twin)
  if (pose === "walk0" || pose === "block0" || pose === "phone0") return 0.08;
  if (pose === "walk1" || pose === "block1" || pose === "phone1") return 0.33;
  if (pose === "walk2" || pose === "block2" || pose === "phone2") return 0.58;
  if (pose === "walk3" || pose === "block3" || pose === "phone3") return 0.83;
  if (pose === "run0" || pose === "run") return 0.08;
  if (pose === "run1") return 0.33;
  if (pose === "run2") return 0.58;
  if (pose === "run3") return 0.83;
  return null;
}

/** Canvas px from feet / center for the profile eye — keeps overlays on the face. */
export function standingFaceAnchor(
  build: BodyBuild = "average",
  present: Present = "masc",
  frameH = 92,
): { xFromCenter: number; yFromFeet: number } {
  const m = buildMetrics(build);
  const fem = present === "fem";
  const feetY = frameH - 4;
  const stand = 62 * m.height;
  const headY = feetY - stand;
  const shoulderY = headY + 12;
  const hy = shoulderY - (fem ? 12 : 11);
  // Idle: head sits slightly forward of the spine, eye at hx+6
  const hx = 2;
  const eyeX = hx + 6;
  const eyeY = hy;
  return {
    xFromCenter: eyeX,
    yFromFeet: feetY - eyeY,
  };
}

/**
 * Draw fighter facing RIGHT in side profile (flipX for left).
 */
export function drawSorFighter(
  ctx: CanvasRenderingContext2D,
  cx: number,
  feetY: number,
  skin: string,
  shirt: string,
  pose: SorPose,
  opts: {
    bloodied?: boolean;
    hair?: string;
    pants?: string;
    build?: BodyBuild;
    present?: Present;
    hairStyle?: HairStyle;
    bottom?: BottomStyle;
    kit?: KitStyle;
  } = {},
): void {
  const punchInfo = punchAnim(pose);
  const punch = punchInfo?.kind === "hook";
  const jab = punchInfo?.kind === "jab";
  const upper = punchInfo?.kind === "upper";
  const punchFrame = punchInfo?.frame ?? 1;
  const isPunching = punchInfo !== null;
  const kickInfo = kickAnim(pose);
  const isKicking = kickInfo !== null;
  const kickFrame = kickInfo?.frame ?? 1;
  const jumpInfo = jumpAnim(pose);
  const isJumping = jumpInfo !== null;
  const jumpFrame = jumpInfo?.frame ?? 1;
  const backInfo = backhandAnim(pose);
  const isBackhand = backInfo !== null;
  const backFrame = backInfo?.frame ?? 1;
  const swingInfo = weaponSwingAnim(pose);
  const weaponSwing = swingInfo !== null;
  const swingFrame = swingInfo?.frame ?? 1;
  const block =
    pose === "block" ||
    pose === "block0" ||
    pose === "block1" ||
    pose === "block2" ||
    pose === "block3";
  const headbutt = pose === "headbutt";
  const stompUp = pose === "stomp_up";
  const stomp = pose === "stomp";
  const jumpKick = pose === "jump_kick";
  const hurt = pose === "hurt" || pose === "bloodied" || pose === "hurt_head";
  const headSnap = pose === "hurt_head";
  const angry = pose === "angry";
  const holdGut = pose === "hold_gut";
  const limp = pose === "limp_arm";
  const limpLeg = pose === "limp_leg";
  const film = pose === "film";
  const phone =
    pose === "phone" ||
    pose === "phone0" ||
    pose === "phone1" ||
    pose === "phone2" ||
    pose === "phone3";
  const ducking = pose === "crouch";
  const riding = pose === "ride0" || pose === "ride1";
  const scooterRide = pose === "ride_scooter0" || pose === "ride_scooter1";
  const skating = pose === "skate0" || pose === "skate1";
  const ollie = pose === "ollie";
  const kickflip = pose === "kickflip";
  const manual = pose === "manual";
  const rideFrame =
    pose === "ride1" || pose === "ride_scooter1" || pose === "skate1" ? 1 : 0;
  const onWheels = riding || scooterRide || skating || ollie || kickflip || manual;
  const onSkate = skating || ollie || kickflip || manual;
  const bloodied = opts.bloodied || pose === "bloodied";
  const hair = opts.hair ?? "#2a2220";
  const pants = opts.pants ?? "#3a4558";
  const fem = opts.present === "fem";
  const hairStyle: HairStyle =
    opts.hairStyle ?? (fem ? "shoulder" : "crop");
  const bottom: BottomStyle = opts.bottom ?? (fem ? "skirt" : "pants");
  const police = opts.kit === "police";
  // Facial expression driven by what they're doing / taking
  type FaceExpr = "calm" | "angry" | "grit" | "snarl" | "hurt" | "strain";
  const face: FaceExpr = (() => {
    if (hurt || holdGut || limp || limpLeg) return "hurt";
    if (angry) return "angry";
    if (headbutt || stomp) return "snarl";
    if (stompUp || jumpKick) return "grit";
    if (weaponSwing) return swingFrame === 1 ? "snarl" : "grit";
    if (isBackhand) return backFrame === 1 ? "snarl" : "grit";
    if (isKicking) return kickFrame === 1 ? "snarl" : kickFrame === 0 ? "strain" : "grit";
    if (isPunching) {
      if (punchFrame === 0) return "strain";
      if (punchFrame === 1) return upper ? "snarl" : "grit";
      return "grit";
    }
    if (block) return "strain";
    return "calm";
  })();
  const m = buildMetrics(opts.build ?? "average");
  const skinBack = shadeSkin(skin, 0.1);
  // Mild shade only — heavy darkening read as see-through at debug zoom
  const pantsBack = shadeSkin(pants, 0.12);
  const phase = walkPhase(pose);
  const isRun =
    pose === "run" ||
    pose === "run0" ||
    pose === "run1" ||
    pose === "run2" ||
    pose === "run3";
  const isWalk = phase !== null && !isRun;

  // Body twist — keep modest so it doesn't fatten the silhouette
  // Backhand twists the other way (look + whip behind)
  const twistAmt =
    weaponSwing
      ? swingFrame === 0
        ? 7
        : swingFrame === 1
          ? 11
          : 3
      : isBackhand
      ? backFrame === 0
        ? -4
        : backFrame === 1
          ? -8
          : -3
      : !isPunching
        ? isKicking
          ? kickFrame === 1
            ? 3
            : 1
          : jumpKick
            ? 3
            : isJumping
              ? 1
              : 0
        : punchFrame === 0
          ? jab
            ? 2
            : upper
              ? 3
              : 3
          : punchFrame === 1
            ? jab
              ? 5
              : upper
                ? 5
                : 6
            : jab
              ? 3
              : upper
                ? 3
                : 4;

  const crouch = onWheels
    ? riding
      ? 14
      : scooterRide
        ? 12
        : onSkate
          ? kickflip
            ? 10
            : ollie
              ? 6
              : manual
                ? 10
                : rideFrame === 0
                  ? 6
                  : 8
          : 8
    : ducking
    ? 26
    : hurt || limpLeg || holdGut
      ? 5
      : isRun
        ? 3
        : stompUp || stomp
          ? 10
          : isKicking
            ? kickFrame === 0
              ? 10
              : kickFrame === 1
                ? 4
                : 6
            : jumpKick
              ? 4
              : isJumping
                ? jumpFrame === 0
                  ? 6
                  : jumpFrame === 2
                    ? 4
                    : 2
                : upper && punchFrame === 0
                  ? 8
                  : upper
                    ? 3
                    : block
                      ? 6
                      : jab && punchFrame === 0
                        ? 2
                        : isWalk
                          ? 0
                          : 0;
  // Spine lean — upper body tips over planted hips (not a horizontal stretch)
  const lean = onWheels
    ? riding
      ? 8
      : scooterRide
        ? 6
        : onSkate
          ? kickflip
            ? -2
            : manual
              ? -8
              : ollie
                ? 4
                : rideFrame === 0
                  ? 2
                  : 6
          : 6
    : isRun
    ? 5
    : jumpKick
      ? -6
      : isJumping
        ? jumpFrame === 0
          ? 4
          : jumpFrame === 1
            ? 1
            : -2
        : stomp || stompUp
          ? 6
          : weaponSwing
            ? swingFrame === 0
              ? -10
              : swingFrame === 1
                ? 12
                : 4
            : isBackhand
            ? backFrame === 0
              ? 2
              : backFrame === 1
                ? -5
                : 1
            : isKicking
              ? kickFrame === 0
                ? -2
                : kickFrame === 1
                  ? -6
                  : -2
              : isPunching
                ? punchFrame === 0
                  ? jab
                    ? -5
                    : upper
                      ? -6
                      : -7
                  : punchFrame === 1
                    ? jab
                      ? 6
                      : upper
                        ? 6
                        : 8
                    : jab
                      ? 3
                      : upper
                        ? 3
                        : 4
                : block
                  ? -2
                  : headSnap
                    ? -10
                    : hurt
                      ? -3
                      : isWalk
                        ? 2
                        : 0;
  const air = isJumping || jumpKick;
  const stand = 62 * m.height;
  // Head dips each step — stronger on a run
  const gaitBob =
    phase !== null ? Math.abs(Math.sin(phase * Math.PI * 2)) * (isRun ? 4.2 : 1.8) : 0;
  const headY = feetY - (air ? stand + 6 : stand) + crouch + gaitBob;
  const shoulderY = headY + 12;
  const hipY = feetY - (air ? 28 : 24) * m.height + crouch + m.belly * 0.4 + gaitBob * 0.2;

  // Hips stay planted; shoulders + head tip with the lean so the BACK edge slants
  const hip: Pt = { x: cx - lean * 0.12, y: hipY };
  const shoulder: Pt = {
    x: cx + lean + twistAmt * 0.2,
    y: shoulderY + (isPunching && punchFrame === 0 ? 1 : 0),
  };
  // Spine midpoint — used for head/seam alignment without widening the body
  const bx = hip.x * 0.35 + shoulder.x * 0.65;

  // --- Legs (far leg first, then near) ---
  let farKnee: Pt;
  let farFoot: Pt;
  let nearKnee: Pt;
  let nearFoot: Pt;

  if (riding) {
    // Pedal circle — opposite feet on the crank
    const a = rideFrame === 0 ? 0.35 : 0.35 + Math.PI;
    const r = 11;
    farKnee = { x: hip.x - 4, y: hip.y + 10 };
    farFoot = {
      x: hip.x - 2 + Math.cos(a + Math.PI) * r,
      y: hip.y + 16 + Math.sin(a + Math.PI) * 7,
    };
    nearKnee = { x: hip.x + 6, y: hip.y + 10 };
    nearFoot = {
      x: hip.x + 6 + Math.cos(a) * r,
      y: hip.y + 16 + Math.sin(a) * 7,
    };
  } else if (scooterRide) {
    // Both feet on the deck (aft of the stem), slight weight shift
    const shift = rideFrame === 0 ? -2 : 2;
    farKnee = { x: hip.x - 6, y: hip.y + 12 };
    farFoot = { x: hip.x - 12 + shift, y: feetY - 1 };
    nearKnee = { x: hip.x + 4, y: hip.y + 12 };
    nearFoot = { x: hip.x + 2 + shift, y: feetY - 1 };
  } else if (kickflip) {
    // Scoop + flick — rear foot pops the tail, front foot flicks across
    farKnee = { x: hip.x - 4, y: hip.y + 2 };
    farFoot = { x: hip.x - 2, y: hip.y + 18 };
    nearKnee = { x: hip.x + 10, y: hip.y - 4 };
    nearFoot = { x: hip.x + 20, y: hip.y + 6 };
  } else if (manual) {
    // Sit back over the tail — weight on rear trucks, nose up, body still tall
    farKnee = { x: hip.x - 6, y: hip.y + 10 };
    farFoot = { x: hip.x - 14, y: feetY - 2 };
    nearKnee = { x: hip.x + 8, y: hip.y + 2 };
    nearFoot = { x: hip.x + 14, y: feetY - 14 };
  } else if (ollie) {
    // Knees up, board rising with the feet
    farKnee = { x: hip.x - 2, y: hip.y + 8 };
    farFoot = { x: hip.x - 6, y: hip.y + 20 };
    nearKnee = { x: hip.x + 8, y: hip.y + 8 };
    nearFoot = { x: hip.x + 12, y: hip.y + 20 };
  } else if (skating) {
    // skate0 = plant / push (lead foot on the floor). skate1 = both boots on the deck.
    const push = rideFrame === 0;
    if (push) {
      // Stationary or push-off — rear foot on the board, leading foot on the pavement
      farKnee = { x: hip.x - 2, y: hip.y + 10 };
      farFoot = { x: hip.x - 8, y: feetY - 2 };
      nearKnee = { x: hip.x + 10, y: hip.y + 14 };
      nearFoot = { x: hip.x + 22, y: feetY + 1 };
    } else {
      farKnee = { x: hip.x - 2, y: hip.y + 11 };
      farFoot = { x: hip.x - 10, y: feetY - 2 };
      nearKnee = { x: hip.x + 6, y: hip.y + 11 };
      nearFoot = { x: hip.x + 9, y: feetY - 2 };
    }
  } else if (phase !== null) {
    // Guard shuffle uses a shorter step so the block doesn't look like a full walk
    const amp = (isRun ? 22 : block ? 12 : 18) * m.height;
    const legs = strideLegs(hip, feetY, phase, amp);
    farKnee = legs.back.knee;
    farFoot = legs.back.foot;
    nearKnee = legs.front.knee;
    nearFoot = legs.front.foot;
  } else if (stompUp) {
    // Supporting leg planted; stomping boot hiked high over the body on the floor
    farKnee = { x: hip.x - 2, y: hip.y + 16 };
    farFoot = { x: hip.x + 2, y: feetY };
    nearKnee = { x: hip.x + 10, y: hip.y - 10 };
    nearFoot = { x: hip.x + 18, y: hip.y - 22 };
  } else if (stomp) {
    // Boot slamming down into the floor in front — deep crouch, driving weight
    farKnee = { x: hip.x - 8, y: hip.y + 18 };
    farFoot = { x: hip.x - 10, y: feetY };
    nearKnee = { x: hip.x + 16, y: hip.y + 14 };
    nearFoot = { x: hip.x + 28, y: feetY + 2 };
  } else if (jumpKick) {
    // Flying side kick — rear leg tucked, lead leg out with toes up
    farKnee = { x: hip.x - 8, y: hip.y + 8 };
    farFoot = { x: hip.x - 12, y: hip.y + 16 };
    nearKnee = { x: hip.x + 20, y: hip.y };
    nearFoot = { x: hip.x + 38, y: hip.y - 6 };
  } else if (isKicking) {
    if (kickFrame === 0) {
      // Chamber — plant under the hip, knee cocked up with foot tucked under
      farKnee = { x: hip.x - 2, y: hip.y + 16 };
      farFoot = { x: hip.x - 4, y: feetY };
      nearKnee = { x: hip.x + 6, y: hip.y - 10 };
      nearFoot = { x: hip.x + 2, y: hip.y + 4 };
    } else if (kickFrame === 1) {
      // Snap — boot out at midriff, toes pointed up
      farKnee = { x: hip.x - 6, y: hip.y + 16 };
      farFoot = { x: hip.x - 8, y: feetY };
      nearKnee = { x: hip.x + 16, y: hip.y + 2 };
      nearFoot = { x: hip.x + 30, y: hip.y - 2 };
    } else {
      // Retract — knee folding back in before the foot drops
      farKnee = { x: hip.x - 3, y: hip.y + 15 };
      farFoot = { x: hip.x - 5, y: feetY };
      nearKnee = { x: hip.x + 8, y: hip.y };
      nearFoot = { x: hip.x + 6, y: hip.y + 12 };
    }
  } else if (isBackhand) {
    if (backFrame === 0) {
      // Glance — weight settles, feet ready to pivot
      farKnee = { x: hip.x - 8, y: hip.y + 14 };
      farFoot = { x: hip.x - 10, y: feetY };
      nearKnee = { x: hip.x + 8, y: hip.y + 12 };
      nearFoot = { x: hip.x + 12, y: feetY };
    } else if (backFrame === 1) {
      // Whip — plant the near foot, far foot trails as the body turns
      farKnee = { x: hip.x - 4, y: hip.y + 12 };
      farFoot = { x: hip.x + 2, y: feetY };
      nearKnee = { x: hip.x + 12, y: hip.y + 14 };
      nearFoot = { x: hip.x + 16, y: feetY };
    } else {
      farKnee = { x: hip.x - 6, y: hip.y + 14 };
      farFoot = { x: hip.x - 8, y: feetY };
      nearKnee = { x: hip.x + 8, y: hip.y + 14 };
      nearFoot = { x: hip.x + 12, y: feetY };
    }
  } else if (weaponSwing) {
    // Plant and step through the bat swing
    if (swingFrame === 0) {
      // Coil — deep on the rear foot, front foot light
      farKnee = { x: hip.x - 12, y: hip.y + 16 };
      farFoot = { x: hip.x - 16, y: feetY };
      nearKnee = { x: hip.x + 8, y: hip.y + 8 };
      nearFoot = { x: hip.x + 10, y: feetY - 5 };
    } else if (swingFrame === 1) {
      // Drive — long step into the hit
      farKnee = { x: hip.x - 18, y: hip.y + 14 };
      farFoot = { x: hip.x - 22, y: feetY };
      nearKnee = { x: hip.x + 20, y: hip.y + 12 };
      nearFoot = { x: hip.x + 30, y: feetY };
    } else {
      // Settle after the wrap
      farKnee = { x: hip.x - 6, y: hip.y + 14 };
      farFoot = { x: hip.x - 8, y: feetY };
      nearKnee = { x: hip.x + 14, y: hip.y + 14 };
      nearFoot = { x: hip.x + 20, y: feetY };
    }
  } else if (isPunching) {
    // Step into the punch so the forward slide reads as a lunge, not ice-skating
    if (punchFrame === 0) {
      // Coil — weight on the far (rear) foot, near foot light / starting forward
      farKnee = { x: hip.x - 8, y: hip.y + 16 };
      farFoot = { x: hip.x - 12, y: feetY };
      nearKnee = { x: hip.x + 10, y: hip.y + 10 };
      nearFoot = { x: hip.x + 14, y: feetY - (jab ? 2 : 4) };
    } else if (punchFrame === 1) {
      // Drive — near foot plants ahead, far leg pushes off behind
      farKnee = { x: hip.x - 14, y: hip.y + 14 };
      farFoot = { x: hip.x - 18, y: feetY };
      nearKnee = { x: hip.x + 16, y: hip.y + 12 };
      nearFoot = { x: hip.x + (jab ? 22 : upper ? 20 : 26), y: feetY };
    } else {
      // Settle — feet closing back toward stance while still a bit long
      farKnee = { x: hip.x - 8, y: hip.y + 14 };
      farFoot = { x: hip.x - 10, y: feetY };
      nearKnee = { x: hip.x + 10, y: hip.y + 14 };
      nearFoot = { x: hip.x + 16, y: feetY };
    }
  } else if (ducking) {
    // Tucked down on the haunches behind cover — knees folded up under them
    farKnee = { x: hip.x - 10, y: hip.y + 8 };
    farFoot = { x: hip.x - 4, y: feetY };
    nearKnee = { x: hip.x + 14, y: hip.y + 6 };
    nearFoot = { x: hip.x + 8, y: feetY };
  } else if (limpLeg) {
    farKnee = { x: hip.x - 2, y: hip.y + 14 };
    farFoot = { x: hip.x, y: feetY };
    nearKnee = { x: hip.x + 14, y: hip.y + 10 };
    nearFoot = { x: hip.x + 22, y: feetY };
  } else if (isJumping) {
    if (jumpFrame === 0) {
      // Rise — still pushing off, knees bent, feet trailing
      farKnee = { x: hip.x - 10, y: hip.y + 6 };
      farFoot = { x: hip.x - 14, y: hip.y + 16 };
      nearKnee = { x: hip.x + 8, y: hip.y + 4 };
      nearFoot = { x: hip.x + 6, y: hip.y + 14 };
    } else if (jumpFrame === 1) {
      // Apex — tucked ball, knees up under the body
      farKnee = { x: hip.x - 6, y: hip.y + 2 };
      farFoot = { x: hip.x - 4, y: hip.y + 12 };
      nearKnee = { x: hip.x + 10, y: hip.y };
      nearFoot = { x: hip.x + 12, y: hip.y + 10 };
    } else {
      // Fall — legs reaching down for the landing
      farKnee = { x: hip.x - 6, y: hip.y + 12 };
      farFoot = { x: hip.x - 8, y: feetY - 4 };
      nearKnee = { x: hip.x + 8, y: hip.y + 10 };
      nearFoot = { x: hip.x + 12, y: feetY - 2 };
    }
  } else {
    // idle / angry / hurt — side stance
    farKnee = { x: hip.x - 4, y: hip.y + 14 };
    farFoot = { x: hip.x - 6, y: feetY };
    nearKnee = { x: hip.x + 6, y: hip.y + 14 };
    nearFoot = { x: hip.x + 10, y: feetY };
  }

  const lr = m.limb;
  // Soft length cap on the kicking leg — keep the snap readable, not stilts
  if (isKicking) {
    const nearHip = { x: hip.x + 2, y: hip.y };
    nearKnee = reach(nearHip, nearKnee, 16 * lr);
    nearFoot = reach(nearKnee, nearFoot, 15 * lr);
  } else if (jumpKick) {
    const nearHip = { x: hip.x + 2, y: hip.y };
    nearKnee = reach(nearHip, nearKnee, 18 * lr);
    nearFoot = reach(nearKnee, nearFoot, 18 * lr);
  }
  // Far (back) leg only — near leg is drawn after the torso so it stays opaque
  // Kick foot pitch: chamber + snap toes-up (pointed); recover eases; stomp toes-down
  const nearBootAng = stompUp
    ? -1.05
    : stomp
      ? 0.55
      : jumpKick
        ? -0.85
        : kickflip
          ? 0.85
          : manual
            ? -0.35
            : isKicking
              ? kickFrame === 0
                ? -1.05
                : kickFrame === 1
                  ? -0.95
                  : -0.45
              : skating && rideFrame === 0
                ? 0.05
                : skating
                  ? -0.15
                  : 0;
  const farBootAng = kickflip
    ? 0.35
    : manual
      ? 0.55
      : skating || ollie
        ? -0.1
        : 0;
  limb(ctx, hip.x - 2, hip.y, farKnee.x, farKnee.y, 6.5 * lr, 5.5 * lr, pantsBack);
  jointCap(ctx, farKnee.x, farKnee.y, 5.2 * lr, pantsBack);
  limb(ctx, farKnee.x, farKnee.y, farFoot.x, farFoot.y - 4, 5.5 * lr, 5 * lr, pantsBack);
  bootSide(ctx, farFoot.x, farFoot.y - 4, farBootAng);

  // --- Arms (compute first; far/left arm drawn under the torso) ---
  let farElbow: Pt;
  let farHand: Pt;
  let nearElbow: Pt;
  let nearHand: Pt;

  if (onSkate) {
    // Arms out for balance / trick style
    if (kickflip) {
      // Counter-rotate — one arm high, one low while the board spins
      farElbow = { x: shoulder.x - 10, y: shoulder.y + 2 };
      farHand = { x: shoulder.x - 20, y: shoulder.y - 10 };
      nearElbow = { x: shoulder.x + 14, y: shoulder.y + 10 };
      nearHand = { x: shoulder.x + 22, y: shoulder.y + 4 };
    } else if (manual) {
      // Arms wide and back — counterweight while the nose floats
      farElbow = { x: shoulder.x - 10, y: shoulder.y + 4 };
      farHand = { x: shoulder.x - 22, y: shoulder.y - 6 };
      nearElbow = { x: shoulder.x + 16, y: shoulder.y + 2 };
      nearHand = { x: shoulder.x + 28, y: shoulder.y - 8 };
    } else if (ollie) {
      farElbow = { x: shoulder.x - 4, y: shoulder.y + 8 };
      farHand = { x: shoulder.x - 12, y: shoulder.y };
      nearElbow = { x: shoulder.x + 10, y: shoulder.y + 6 };
      nearHand = { x: shoulder.x + 18, y: shoulder.y - 2 };
    } else if (rideFrame === 0) {
      // Plant / push — soft arms, weight on the pavement foot
      farElbow = { x: shoulder.x, y: shoulder.y + 14 };
      farHand = { x: shoulder.x - 4, y: shoulder.y + 10 };
      nearElbow = { x: shoulder.x + 6, y: shoulder.y + 12 };
      nearHand = { x: shoulder.x + 10, y: shoulder.y + 8 };
    } else {
      // Cruise — soft balance, not a T-pose
      farElbow = { x: shoulder.x - 2, y: shoulder.y + 14 };
      farHand = { x: shoulder.x - 6, y: shoulder.y + 8 };
      nearElbow = { x: shoulder.x + 8, y: shoulder.y + 12 };
      nearHand = { x: shoulder.x + 14, y: shoulder.y + 6 };
    }
  } else if (scooterRide) {
    // Reach the T-bar — arms forward from a more upright stance over the deck
    farElbow = { x: shoulder.x + 2, y: shoulder.y + 8 };
    farHand = { x: shoulder.x + 2, y: shoulder.y + 2 };
    nearElbow = { x: shoulder.x + 10, y: shoulder.y + 6 };
    nearHand = { x: shoulder.x + 16, y: shoulder.y + 1 };
  } else if (onWheels) {
    // Hands planted on the flat bars — forward and down from the saddle lean
    farElbow = { x: shoulder.x + 2, y: shoulder.y + 12 };
    farHand = { x: shoulder.x + 4, y: shoulder.y + 15 };
    nearElbow = { x: shoulder.x + 10, y: shoulder.y + 11 };
    nearHand = { x: shoulder.x + 14, y: shoulder.y + 15 };
  } else if (block) {
    // High guard — both fists stacked in front of the face (not beside the head)
    // Kept even on block-walk frames so the shuffle keeps the guard up
    farElbow = { x: shoulder.x + 4, y: shoulder.y + 8 };
    farHand = { x: shoulder.x + 12, y: shoulder.y - 2 };
    nearElbow = { x: shoulder.x + 8, y: shoulder.y + 5 };
    nearHand = { x: shoulder.x + 18, y: shoulder.y - 8 };
  } else if (phase !== null) {
    const arms = strideArms(shoulder, phase, isRun ? 18 : 14, isRun);
    farElbow = arms.back.elbow;
    farHand = arms.back.hand;
    nearElbow = arms.front.elbow;
    nearHand = arms.front.hand;
  } else if (jab) {
    // Near (front) arm jab — wind-up → snap → retract; far fist guards behind
    if (punchFrame === 0) {
      farElbow = { x: shoulder.x - 8, y: shoulder.y + 10 };
      farHand = { x: shoulder.x - 6, y: shoulder.y };
      nearElbow = { x: shoulder.x + 4, y: shoulder.y + 8 };
      nearHand = { x: shoulder.x + 8, y: shoulder.y - 6 };
    } else if (punchFrame === 1) {
      farElbow = { x: shoulder.x - 10, y: shoulder.y + 12 };
      farHand = { x: shoulder.x - 8, y: shoulder.y + 4 };
      nearElbow = { x: shoulder.x + 18, y: shoulder.y + 1 };
      nearHand = { x: shoulder.x + 34, y: shoulder.y - 1 };
    } else {
      farElbow = { x: shoulder.x - 8, y: shoulder.y + 12 };
      farHand = { x: shoulder.x - 6, y: shoulder.y + 20 };
      nearElbow = { x: shoulder.x + 10, y: shoulder.y + 6 };
      nearHand = { x: shoulder.x + 18, y: shoulder.y + 3 };
    }
  } else if (upper) {
    // Uppercut — dip, drive, peak
    if (punchFrame === 0) {
      farElbow = { x: shoulder.x - 8, y: shoulder.y + 14 };
      farHand = { x: shoulder.x - 6, y: shoulder.y + 6 };
      nearElbow = { x: shoulder.x + 6, y: shoulder.y + 14 };
      nearHand = { x: shoulder.x + 10, y: shoulder.y + 22 };
    } else if (punchFrame === 1) {
      farElbow = { x: shoulder.x - 10, y: shoulder.y + 14 };
      farHand = { x: shoulder.x - 8, y: shoulder.y + 22 };
      nearElbow = { x: shoulder.x + 10, y: shoulder.y - 4 };
      nearHand = { x: shoulder.x + 16, y: shoulder.y - 22 };
    } else {
      farElbow = { x: shoulder.x - 8, y: shoulder.y + 12 };
      farHand = { x: shoulder.x - 6, y: shoulder.y + 18 };
      nearElbow = { x: shoulder.x + 8, y: shoulder.y - 2 };
      nearHand = { x: shoulder.x + 12, y: shoulder.y - 14 };
    }
  } else if (weaponSwing) {
    // Two-handed bat: high coil → long contact reach → wrap past the hip
    if (swingFrame === 0) {
      farElbow = { x: shoulder.x - 4, y: shoulder.y - 10 };
      farHand = { x: shoulder.x - 12, y: shoulder.y - 24 };
      nearElbow = { x: shoulder.x - 8, y: shoulder.y - 14 };
      nearHand = { x: shoulder.x - 18, y: shoulder.y - 30 };
    } else if (swingFrame === 1) {
      farElbow = { x: shoulder.x + 14, y: shoulder.y + 2 };
      farHand = { x: shoulder.x + 28, y: shoulder.y - 2 };
      nearElbow = { x: shoulder.x + 26, y: shoulder.y - 2 };
      nearHand = { x: shoulder.x + 46, y: shoulder.y - 6 };
    } else {
      farElbow = { x: shoulder.x + 6, y: shoulder.y + 16 };
      farHand = { x: shoulder.x + 12, y: shoulder.y + 24 };
      nearElbow = { x: shoulder.x + 16, y: shoulder.y + 14 };
      nearHand = { x: shoulder.x + 26, y: shoulder.y + 26 };
    }
  } else if (punch) {
    // Hook / cross — coil, whip across, follow-through
    if (punchFrame === 0) {
      // Coil — far arm tucked behind the back, near arm chambered
      farElbow = { x: shoulder.x - 8, y: shoulder.y + 8 };
      farHand = { x: shoulder.x - 6, y: shoulder.y - 2 };
      nearElbow = { x: shoulder.x, y: shoulder.y + 10 };
      nearHand = { x: shoulder.x - 8, y: shoulder.y + 4 };
    } else if (punchFrame === 1) {
      farElbow = { x: shoulder.x - 12, y: shoulder.y + 10 };
      farHand = { x: shoulder.x - 10, y: shoulder.y + 2 };
      nearElbow = { x: shoulder.x + 20, y: shoulder.y - 1 };
      nearHand = { x: shoulder.x + 38, y: shoulder.y - 3 };
    } else {
      farElbow = { x: shoulder.x - 8, y: shoulder.y + 12 };
      farHand = { x: shoulder.x - 6, y: shoulder.y + 20 };
      nearElbow = { x: shoulder.x + 14, y: shoulder.y + 5 };
      nearHand = { x: shoulder.x + 24, y: shoulder.y + 8 };
    }
  } else if (isBackhand) {
    if (backFrame === 0) {
      // Coil — look back, far fist chambered behind the hip
      farElbow = { x: shoulder.x - 6, y: shoulder.y + 14 };
      farHand = { x: shoulder.x - 4, y: shoulder.y + 24 };
      nearElbow = { x: shoulder.x + 8, y: shoulder.y + 10 };
      nearHand = { x: shoulder.x + 12, y: shoulder.y + 4 };
    } else if (backFrame === 1) {
      // Whip — far arm snaps straight back behind the head line
      farElbow = { x: shoulder.x - 20, y: shoulder.y + 2 };
      farHand = { x: shoulder.x - 36, y: shoulder.y - 4 };
      nearElbow = { x: shoulder.x + 6, y: shoulder.y + 12 };
      nearHand = { x: shoulder.x + 4, y: shoulder.y + 22 };
    } else {
      // Recover — arm folding back in
      farElbow = { x: shoulder.x - 12, y: shoulder.y + 8 };
      farHand = { x: shoulder.x - 18, y: shoulder.y + 16 };
      nearElbow = { x: shoulder.x + 8, y: shoulder.y + 12 };
      nearHand = { x: shoulder.x + 10, y: shoulder.y + 22 };
    }
  } else if (headbutt) {
    farElbow = { x: shoulder.x - 12, y: shoulder.y + 12 };
    farHand = { x: shoulder.x - 8, y: shoulder.y + 8 };
    nearElbow = { x: shoulder.x + 10, y: shoulder.y + 10 };
    nearHand = { x: shoulder.x + 16, y: shoulder.y + 8 };
  } else if (jumpKick) {
    // Arms flung back for counterweight
    farElbow = { x: shoulder.x - 16, y: shoulder.y + 2 };
    farHand = { x: shoulder.x - 26, y: shoulder.y - 6 };
    nearElbow = { x: shoulder.x + 2, y: shoulder.y + 14 };
    nearHand = { x: shoulder.x - 4, y: shoulder.y + 26 };
  } else if (isJumping) {
    if (jumpFrame === 0) {
      // Rise — arms swing up / back with the launch
      farElbow = { x: shoulder.x - 10, y: shoulder.y + 2 };
      farHand = { x: shoulder.x - 14, y: shoulder.y - 10 };
      nearElbow = { x: shoulder.x + 8, y: shoulder.y };
      nearHand = { x: shoulder.x + 12, y: shoulder.y - 12 };
    } else if (jumpFrame === 1) {
      // Apex — arms out for balance
      farElbow = { x: shoulder.x - 10, y: shoulder.y + 8 };
      farHand = { x: shoulder.x - 14, y: shoulder.y + 4 };
      nearElbow = { x: shoulder.x + 10, y: shoulder.y + 6 };
      nearHand = { x: shoulder.x + 16, y: shoulder.y + 2 };
    } else {
      // Fall — arms forward, bracing for land
      farElbow = { x: shoulder.x - 6, y: shoulder.y + 10 };
      farHand = { x: shoulder.x - 2, y: shoulder.y + 18 };
      nearElbow = { x: shoulder.x + 10, y: shoulder.y + 8 };
      nearHand = { x: shoulder.x + 16, y: shoulder.y + 16 };
    }
  } else if (isKicking) {
    if (kickFrame === 0) {
      // Hands up, loading the snap
      farElbow = { x: shoulder.x - 6, y: shoulder.y + 10 };
      farHand = { x: shoulder.x - 2, y: shoulder.y + 2 };
      nearElbow = { x: shoulder.x + 8, y: shoulder.y + 6 };
      nearHand = { x: shoulder.x + 12, y: shoulder.y - 2 };
    } else if (kickFrame === 1) {
      // Counterweight — far arm eases back, near fist stays ready
      farElbow = { x: shoulder.x - 10, y: shoulder.y + 8 };
      farHand = { x: shoulder.x - 14, y: shoulder.y + 14 };
      nearElbow = { x: shoulder.x + 8, y: shoulder.y + 8 };
      nearHand = { x: shoulder.x + 12, y: shoulder.y + 2 };
    } else {
      farElbow = { x: shoulder.x - 6, y: shoulder.y + 12 };
      farHand = { x: shoulder.x - 4, y: shoulder.y + 22 };
      nearElbow = { x: shoulder.x + 8, y: shoulder.y + 10 };
      nearHand = { x: shoulder.x + 10, y: shoulder.y + 20 };
    }
  } else if (stompUp || stomp) {
    // Arms out for balance — windmill on the way down
    farElbow = { x: shoulder.x - 16, y: shoulder.y + 4 };
    farHand = { x: shoulder.x - 26, y: shoulder.y - 6 };
    nearElbow = { x: shoulder.x + 14, y: shoulder.y + (stomp ? 8 : 2) };
    nearHand = { x: shoulder.x + 24, y: shoulder.y + (stomp ? 18 : -4) };
  } else if (ducking) {
    // Hands tucked in on the knees, keeping low and small
    farElbow = { x: shoulder.x - 12, y: shoulder.y + 10 };
    farHand = { x: shoulder.x - 4, y: shoulder.y + 18 };
    nearElbow = { x: shoulder.x + 8, y: shoulder.y + 10 };
    nearHand = { x: shoulder.x + 16, y: shoulder.y + 18 };
  } else if (holdGut) {
    farElbow = { x: shoulder.x - 10, y: shoulder.y + 12 };
    farHand = { x: bx - 6, y: hipY - 2 };
    nearElbow = { x: shoulder.x + 6, y: shoulder.y + 12 };
    nearHand = { x: bx + 4, y: hipY };
  } else if (limp) {
    farElbow = { x: shoulder.x - 10, y: shoulder.y + 14 };
    farHand = { x: shoulder.x - 8, y: shoulder.y + 26 };
    nearElbow = { x: shoulder.x + 6, y: shoulder.y + 18 };
    nearHand = { x: shoulder.x + 4, y: hipY + 2 };
  } else if (hurt) {
    farElbow = { x: shoulder.x - 12, y: shoulder.y + 16 };
    farHand = { x: shoulder.x - 16, y: shoulder.y + 26 };
    nearElbow = { x: shoulder.x + 8, y: shoulder.y + 16 };
    nearHand = { x: shoulder.x + 12, y: shoulder.y + 26 };
  } else if (angry) {
    farElbow = { x: shoulder.x - 10, y: shoulder.y + 12 };
    farHand = { x: shoulder.x - 6, y: shoulder.y + 22 };
    nearElbow = { x: shoulder.x + 10, y: shoulder.y + 10 };
    nearHand = { x: shoulder.x + 14, y: shoulder.y + 20 };
  } else if (phone) {
    // Phone to the ear — hand by the temple
    farElbow = { x: shoulder.x - 10, y: shoulder.y + 14 };
    farHand = { x: shoulder.x - 8, y: shoulder.y + 26 };
    nearElbow = { x: shoulder.x + 6, y: shoulder.y + 2 };
    nearHand = { x: shoulder.x + 8, y: shoulder.y - 12 };
  } else if (film) {
    // Phone up — arm raised toward the scrap
    farElbow = { x: shoulder.x - 10, y: shoulder.y + 14 };
    farHand = { x: shoulder.x - 8, y: shoulder.y + 26 };
    nearElbow = { x: shoulder.x + 10, y: shoulder.y - 4 };
    nearHand = { x: shoulder.x + 18, y: shoulder.y - 22 };
  } else {
    // idle fists ready — far fist behind, still socketed to the shoulder
    farElbow = { x: shoulder.x - 6, y: shoulder.y + 12 };
    farHand = { x: shoulder.x - 4, y: shoulder.y + 24 };
    nearElbow = { x: shoulder.x + 6, y: shoulder.y + 12 };
    nearHand = { x: shoulder.x + 10, y: shoulder.y + 24 };
  }

  // --- Side torso: jacket silhouette (shoulder slope, chest, waist tuck — not a brick) ---
  const tw = m.torsoW;
  const belly = m.belly;
  // Women: narrower shoulders, chest curve, tighter waist, hip flare
  const backW = (fem ? 5.8 : 7.2) * tw;
  const frontW = (fem ? 9.0 : 10.2) * tw + belly * 0.18;
  const shoulderBackX = shoulder.x - backW;
  const shoulderFrontX = shoulder.x + frontW;
  const chestY = shoulderY + (hipY - shoulderY) * (fem ? 0.28 : 0.3);
  const waistY = shoulderY + (hipY - shoulderY) * (fem ? 0.55 : 0.58);
  const chestFrontX = shoulder.x + frontW * (fem ? 1.2 : 1.02) + belly * 0.12;
  const chestBackX = shoulder.x - backW * 0.92;
  const waistBackX = hip.x - backW * (fem ? 0.58 : 0.68);
  const waistFrontX = hip.x + frontW * (fem ? 0.48 : 0.7) + belly * 0.28;
  const hipBackX = hip.x - backW * (fem ? 0.98 : 0.82);
  const hipFrontX = hip.x + frontW * (fem ? 1.08 : 0.86) + belly * 0.2;
  const farAttach: Pt = { x: shoulderBackX + 5, y: shoulderY + 5 };
  const nearAttach: Pt = { x: shoulderFrontX - 4, y: shoulderY + 4 };

  // Keep limbs socketed — punches/swings/backhands get a longer leash so the snap reads.
  // Ride poses need enough reach to plant fists on the bars / tiller.
  const onBars = riding || scooterRide;
  const nearArmMax = isPunching || weaponSwing || onBars ? 22 * lr : 17 * lr;
  const nearForeMax = isPunching || weaponSwing || onBars ? 22 * lr : 17 * lr;
  const farArmMax = isBackhand || weaponSwing || onBars ? 22 * lr : 15 * lr;
  const farForeMax = isBackhand || weaponSwing || onBars ? 22 * lr : 15 * lr;
  farElbow = reach(farAttach, farElbow, farArmMax);
  farHand = reach(farElbow, farHand, farForeMax);
  nearElbow = reach(nearAttach, nearElbow, nearArmMax);
  nearHand = reach(nearElbow, nearHand, nearForeMax);

  // Far / left arm — under the body (skip on block; both fists draw in front)
  if (!block) {
    limb(ctx, farAttach.x, farAttach.y, farElbow.x, farElbow.y, 5.2 * lr, 4.2 * lr, skinBack);
    jointCap(ctx, farElbow.x, farElbow.y, 4.4 * lr, skinBack);
    limb(ctx, farElbow.x, farElbow.y, farHand.x, farHand.y, 4.2 * lr, 3.8 * lr, skinBack);
    fistBlob(ctx, farHand.x, farHand.y, 4.6 * lr, 3.9 * lr, -0.15, skinBack);
  }

  // Jacket body — curved outline, tucked waist, soft hem
  strokeFill(ctx, () => {
    ctx.beginPath();
    // Back shoulder → shoulder line → front shoulder
    ctx.moveTo(shoulderBackX + 3, shoulderY + 5);
    ctx.quadraticCurveTo(shoulder.x - 1, shoulderY - 1.5, shoulderFrontX - 1, shoulderY + 3);
    // Front chest curve → waist
    ctx.quadraticCurveTo(chestFrontX + 1.5, chestY, waistFrontX, waistY);
    // Soft flare into the hip / hem
    ctx.quadraticCurveTo(hipFrontX + 0.5, hipY - 5, hipFrontX - 2, hipY + 1);
    // Hem (slight belly curve)
    ctx.quadraticCurveTo(hip.x + 1, hipY + 2.5, hipBackX + 2, hipY);
    // Back up through waist → shoulder blade
    ctx.quadraticCurveTo(waistBackX - 1.5, waistY + 1, chestBackX - 1, chestY);
    ctx.quadraticCurveTo(shoulderBackX - 0.5, shoulderY + 12, shoulderBackX + 3, shoulderY + 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }, shirt, OUTLINE, 2);

  // Soft collar notch at the neck — breaks the flat top edge
  fillOnly(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(shoulder.x - 3, shoulderY + 2);
    ctx.quadraticCurveTo(shoulder.x + 1, shoulderY + 6, shoulder.x + 5, shoulderY + 3);
    ctx.quadraticCurveTo(shoulder.x + 1, shoulderY + 1, shoulder.x - 3, shoulderY + 2);
    ctx.fill();
  }, shadeSkin(shirt, 0.12));

  if (police) {
    drawPoliceVest(ctx, { x: shoulder.x, y: shoulderY }, hip, tw);
  }

  // Compact hip join (not a wide oval — keeps them looking lean)
  jointCap(ctx, hip.x + 1, hip.y + 1, (fem ? 7.4 : 6.2) * tw, pants);

  // Near (front) leg — over the torso so pants stay fully opaque
  limb(ctx, hip.x + 2, hip.y, nearKnee.x, nearKnee.y, (fem ? 6.2 : 7) * lr, (fem ? 4.8 : 5.5) * lr, pants);
  jointCap(ctx, nearKnee.x, nearKnee.y, 5.4 * lr, pants);
  limb(ctx, nearKnee.x, nearKnee.y, nearFoot.x, nearFoot.y - 4, 5.5 * lr, 5 * lr, pants);
  if (stomp) {
    bootSide(ctx, nearFoot.x + 2, nearFoot.y - 4, nearBootAng);
    strokeFill(
      ctx,
      () => {
        ctx.beginPath();
        ctx.ellipse(nearFoot.x + 6, feetY + 3, 18, 5, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(nearFoot.x + 6, feetY + 3, 11, 3, 0, 0, Math.PI * 2);
        ctx.stroke();
        for (const [dx, dy] of [
          [-14, -2],
          [16, -1],
          [-6, -6],
          [10, -5],
        ] as const) {
          ctx.beginPath();
          ctx.arc(nearFoot.x + dx, feetY + dy, 1.4, 0, Math.PI * 2);
          ctx.fill();
        }
      },
      "rgba(26,20,16,0.35)",
      "rgba(26,20,16,0.55)",
      1.6,
    );
  } else {
    bootSide(ctx, nearFoot.x, nearFoot.y - 4, nearBootAng);
  }

  // Skirt over the upper thighs so legs still show below the hem
  if (bottom === "skirt") {
    strokeFill(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(hipBackX + 1, hipY - 2);
      ctx.quadraticCurveTo(hip.x, hipY + 2, hipFrontX - 1, hipY - 1);
      ctx.lineTo(hipFrontX + 5, hipY + 14);
      ctx.quadraticCurveTo(hip.x + 1, hipY + 17, hipBackX - 4, hipY + 14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }, pants, OUTLINE, 2);
  }

  // Far arm peek — redraw connected elbow→fist when it clears the back (no floating stump)
  if (!block && farElbow.x < shoulderBackX) {
    jointCap(ctx, farElbow.x, farElbow.y, 4.4 * lr, skinBack);
    limb(ctx, farElbow.x, farElbow.y, farHand.x, farHand.y, 4.2 * lr, 3.8 * lr, skinBack);
    fistBlob(ctx, farHand.x, farHand.y, 4.6 * lr, 3.9 * lr, -0.15, skinBack);
  } else if (!block && farHand.x < shoulderBackX + 1) {
    fistBlob(ctx, farHand.x, farHand.y, 4.6 * lr, 3.9 * lr, -0.15, skinBack);
  }

  // Near shoulder socket — jacket + skin pad so the arm is glued to the torso
  jointCap(ctx, nearAttach.x - 1, nearAttach.y, 5.2 * lr, shirt);
  jointCap(ctx, nearAttach.x, nearAttach.y, 4.2 * lr, skin);

  if (block) {
    // Both guard fists in front of the face (over the torso)
    const guardAttach = { x: nearAttach.x - 2, y: nearAttach.y + 1 };
    limb(ctx, guardAttach.x, guardAttach.y, farElbow.x, farElbow.y, 5.2 * lr, 4.2 * lr, skinBack);
    jointCap(ctx, farElbow.x, farElbow.y, 4.4 * lr, skinBack);
    limb(ctx, farElbow.x, farElbow.y, farHand.x, farHand.y, 4.2 * lr, 3.8 * lr, skinBack);
    fistBlob(ctx, farHand.x, farHand.y, 4.6 * lr, 3.9 * lr, -0.1, skinBack);
  }

  // Near / right arm — over the body, opaque joints
  limb(ctx, nearAttach.x, nearAttach.y, nearElbow.x, nearElbow.y, 5.8 * lr, 4.6 * lr, skin);
  jointCap(ctx, nearElbow.x, nearElbow.y, 4.6 * lr, skin);
  limb(ctx, nearElbow.x, nearElbow.y, nearHand.x, nearHand.y, 4.6 * lr, 4 * lr, skin);

  fistBlob(ctx, nearHand.x, nearHand.y, 5.2 * lr, 4.4 * lr, 0.2, skin);

  // Film phone stays up here; call handset is drawn again after the head so it isn't buried
  if (film) {
    // Phone held up — large enough to read as a mobile
    strokeFill(ctx, () => {
      ctx.beginPath();
      ctx.roundRect?.(nearHand.x - 4, nearHand.y - 20, 12, 18, 2);
      if (!ctx.roundRect) {
        ctx.rect(nearHand.x - 4, nearHand.y - 20, 12, 18);
      }
      ctx.fill();
      ctx.stroke();
    }, "#1a1a22");
    ctx.fillStyle = "#7ad0ff";
    ctx.fillRect(nearHand.x - 1.5, nearHand.y - 17, 7, 12);
    ctx.fillStyle = "#e02020";
    ctx.beginPath();
    ctx.arc(nearHand.x + 3, nearHand.y - 15, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Profile head — socketed on a short neck above the shoulders ---
  // hurt_head: chin shot / jab — skull rocks back over the shoulders
  const hx =
    shoulder.x +
    (headbutt ? 5 : isBackhand ? -2 : headSnap ? -8 : 2) +
    twistAmt * 0.35;
  const hy = shoulderY - (headSnap ? 15 : fem ? 12 : 11);
  const hs = (fem ? 0.88 : 0.92) + 0.08 * Math.min(m.torsoW, 1.15);
  const headTilt = headSnap ? -0.55 : fem ? 0.05 : 0.1;

  // neck bridge so the head doesn't float off the torso
  jointCap(ctx, (shoulder.x + hx) * 0.5, shoulderY - 2, fem ? 4.6 : 5.5, skin);
  fillOnly(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(shoulder.x - 3, shoulderY + 1);
    ctx.lineTo(hx - 4, hy + 8);
    ctx.lineTo(hx + 5, hy + 9);
    ctx.lineTo(shoulder.x + 5, shoulderY + 2);
    ctx.closePath();
    ctx.fill();
  }, skin);

  // Hair mass behind the skull (crop for lads; fuller styles for women)
  if (!police) {
    drawProfileHairBack(ctx, hx, hy, hs, hair, hairStyle, headSnap);
  }

  // face oval — flush when shouting / hit
  const faceFlush =
    bloodied || face === "angry" || face === "snarl"
      ? shadeSkin(skin, -0.14)
      : face === "hurt"
        ? shadeSkin(skin, 0.06)
        : face === "grit" || face === "strain"
          ? shadeSkin(skin, -0.06)
          : skin;
  strokeFill(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(hx + 2, hy + 1, (fem ? 9.2 : 10) * hs, (fem ? 11.2 : 12) * hs, headTilt, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }, faceFlush, OUTLINE, 2);

  if (police) {
    drawPoliceHelmet(ctx, hx, hy, hs, headTilt);
  }

  // nose — tipped skyward when the head snaps back
  strokeFill(ctx, () => {
    ctx.beginPath();
    if (headSnap) {
      ctx.moveTo(hx + 8, hy - 4);
      ctx.lineTo(hx + 14, hy - 8);
      ctx.lineTo(hx + 9, hy);
    } else {
      ctx.moveTo(hx + (fem ? 9 : 10), hy);
      ctx.lineTo(hx + (fem ? 14 : 16), hy + (fem ? 1 : 2));
      ctx.lineTo(hx + (fem ? 9 : 10), hy + (fem ? 4 : 5));
    }
    ctx.stroke();
  }, "#1a1410", "#1a1410", 2);

  // ear
  fillOnly(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(hx - 6, hy + (headSnap ? 4 : 2), 3, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }, skin);

  // Small hoop earring — quick gender cue at doodle scale
  if (fem) {
    strokeFill(ctx, () => {
      ctx.beginPath();
      ctx.arc(hx - 7, hy + 7, 2.2, 0, Math.PI * 2);
      ctx.stroke();
    }, "#d4a84a", "#d4a84a", 1.4);
  }

  // Fringe / hanging hair over the shoulders (after face so it layers right)
  if (!police) {
    drawProfileHairFront(ctx, hx, hy, hs, hair, hairStyle, headSnap, shoulderY);
  }

  // eye + mouth — expression by combat state
  strokeFill(ctx, () => {
    const ex = hx + 6;
    const ey = hy;
    if (face === "hurt") {
      // Winced eye + open grimace
      ctx.beginPath();
      ctx.moveTo(ex - 3, ey - 1);
      ctx.lineTo(ex + 3, ey + 2);
      ctx.moveTo(ex - 3, ey + 2);
      ctx.lineTo(ex + 3, ey - 1);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(hx + 8, hy + 8, 4.5, 3.2, 0.1, 0, Math.PI * 2);
      ctx.stroke();
    } else if (face === "snarl") {
      // Angry brow + yelling mouth
      ctx.beginPath();
      ctx.moveTo(ex - 3, ey - 2);
      ctx.lineTo(ex + 4, ey);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(hx + 8, hy + 8, 5, 3.8, 0.05, 0, Math.PI * 2);
      ctx.stroke();
      // teeth hint
      ctx.beginPath();
      ctx.moveTo(hx + 5, hy + 8);
      ctx.lineTo(hx + 11, hy + 8);
      ctx.stroke();
    } else if (face === "grit") {
      // Squint + clenched teeth
      ctx.beginPath();
      ctx.moveTo(ex - 3, ey);
      ctx.lineTo(ex + 4, ey + 1);
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(hx + 4, hy + 6, 8, 3.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(hx + 6, hy + 6);
      ctx.lineTo(hx + 6, hy + 9.5);
      ctx.moveTo(hx + 8.5, hy + 6);
      ctx.lineTo(hx + 8.5, hy + 9.5);
      ctx.stroke();
    } else if (face === "strain") {
      // Brow down, tight mouth (wind-up / block)
      ctx.beginPath();
      ctx.moveTo(ex - 3, ey - 1);
      ctx.lineTo(ex + 4, ey);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(hx + 4, hy + 7);
      ctx.lineTo(hx + 11, hy + 6);
      ctx.stroke();
    } else if (face === "angry") {
      ctx.beginPath();
      ctx.moveTo(ex - 2, ey - 2);
      ctx.lineTo(ex + 4, ey);
      ctx.moveTo(hx + 4, hy + 7);
      ctx.lineTo(hx + 11, hy + 7);
      ctx.stroke();
    } else {
      // Calm
      ctx.beginPath();
      ctx.arc(ex, ey, fem ? 1.35 : 1.5, 0, Math.PI * 2);
      ctx.moveTo(hx + 4, hy + (fem ? 7 : 6));
      ctx.lineTo(hx + 11, hy + (fem ? 7 : 6));
      ctx.stroke();
    }
  }, "#1a1410", "#1a1410", 2);

  if (fem && face === "calm") {
    fillOnly(ctx, () => {
      ctx.beginPath();
      ctx.ellipse(hx + 7.5, hy + 7.2, 4.2, 1.55, 0.04, 0, Math.PI * 2);
      ctx.fill();
    }, "#c45a6a");
  }

  if (bloodied) {
    strokeFill(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(hx + 8, hy - 1);
      ctx.lineTo(hx + 12, hy + 10);
      ctx.moveTo(hx + 5, hy + 2);
      ctx.lineTo(hx + 8, hy + 11);
      ctx.stroke();
    }, "#a01828", "#a01828", 2);
  }

  // Call handset drawn on top of the head so it actually reads
  if (phone) {
    const px = hx + 4;
    const py = hy - 4;
    strokeFill(ctx, () => {
      ctx.beginPath();
      ctx.rect(px - 3, py - 8, 9, 18);
      ctx.fill();
      ctx.stroke();
    }, "#1a1a28");
    ctx.fillStyle = "#8ad8ff";
    ctx.fillRect(px - 0.5, py - 5, 5, 11);
    ctx.fillStyle = "#3a3a48";
    ctx.fillRect(px - 1, py + 7, 6, 2);
    // Thumb / fingers gripping the bottom
    strokeFill(ctx, () => {
      ctx.beginPath();
      ctx.ellipse(px + 5, py + 6, 3.2, 2.4, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }, skin);
  }

  // subtle bob hint for walk (shadow under feet)
  if (isWalk || isRun) {
    strokeFill(ctx, () => {
      ctx.beginPath();
      ctx.ellipse(bx, feetY + 2, 16, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }, "rgba(26,20,16,0.22)");
  }
}

export function drawSorDown(
  ctx: CanvasRenderingContext2D,
  fw: number,
  fh: number,
  skin: string,
  shirt: string,
  cuffed: boolean,
  bloodied = false,
  opts: {
    pants?: string;
    hair?: string;
    build?: BodyBuild;
    present?: Present;
    hairStyle?: HairStyle;
    kit?: KitStyle;
  } = {},
): void {
  const y = fh - 12;
  const pants = opts.pants ?? "#3a4558";
  const pantsBack = shadeSkin(pants, 0.25);
  const m = buildMetrics(opts.build ?? "average");
  const lr = m.limb;
  const fem = opts.present === "fem";
  const hairStyle: HairStyle =
    opts.hairStyle ?? (fem ? "shoulder" : "crop");
  const police = opts.kit === "police";
  // Side-on KO — body along the ground, head to the left, feet flopped toes-up
  const hipX = fw * 0.5;
  const nearKnee = { x: fw * 0.64, y: y - 3 };
  const farKnee = { x: fw * 0.66, y: y + 3 };
  const nearAnkle = { x: fw * 0.78, y: y + 1 };
  const farAnkle = { x: fw * 0.81, y: y + 4 };

  limb(ctx, hipX, y + 2, farKnee.x, farKnee.y, 5 * lr, 4.2 * lr, pantsBack);
  limb(ctx, farKnee.x, farKnee.y, farAnkle.x, farAnkle.y, 4.6 * lr, 3.8 * lr, pantsBack);
  // Milder tip so heels stay in-frame while the body sits on the ground line
  bootSide(ctx, farAnkle.x, farAnkle.y, -1.05);

  limb(ctx, hipX, y, nearKnee.x, nearKnee.y, 5 * lr, 4.2 * lr, pants);
  limb(ctx, nearKnee.x, nearKnee.y, nearAnkle.x, nearAnkle.y, 4.6 * lr, 3.8 * lr, pants);
  bootSide(ctx, nearAnkle.x, nearAnkle.y, -0.9);

  const tw = m.torsoW;
  strokeFill(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(fw * 0.22, y - 4);
    ctx.lineTo(fw * 0.52, y - 6);
    ctx.lineTo(fw * 0.52, y + 8 * tw);
    ctx.lineTo(fw * 0.2, y + 6 * tw);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }, shirt);

  if (police) {
    // Hi-vis strip along the floored torso
    strokeFill(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(fw * 0.24, y - 2);
      ctx.lineTo(fw * 0.5, y - 3);
      ctx.lineTo(fw * 0.5, y + 5 * tw);
      ctx.lineTo(fw * 0.23, y + 4 * tw);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }, POLICE_HIVIS, OUTLINE, 1.5);
    fillOnly(ctx, () => {
      ctx.beginPath();
      ctx.rect(fw * 0.26, y + 0.5, fw * 0.22, 2.2);
      ctx.fill();
    }, POLICE_REFLECT);
  }

  if (cuffed) {
    limb(ctx, fw * 0.34, y, fw * 0.4, y + 10, 4 * lr, 3.5 * lr, skin);
    limb(ctx, fw * 0.36, y, fw * 0.46, y + 10, 4 * lr, 3.5 * lr, skin);
    strokeFill(ctx, () => {
      ctx.strokeRect(fw * 0.38, y + 8, 12, 5);
    }, "#888");
  } else {
    limb(ctx, fw * 0.3, y - 2, fw * 0.18, y + 6, 4 * lr, 3.5 * lr, skin);
    limb(ctx, fw * 0.38, y, fw * 0.48, y + 8, 4 * lr, 3.5 * lr, skin);
  }

  const hair = opts.hair ?? "#2a2220";
  // Longer hair pool under the head when she's KO'd
  if (!police) {
    if (hairStyle !== "crop") {
      strokeFill(ctx, () => {
        ctx.beginPath();
        ctx.ellipse(fw * 0.1, y - 2, 14, 11, -0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }, hair);
    } else {
      strokeFill(ctx, () => {
        ctx.beginPath();
        ctx.ellipse(fw * 0.14, y - 4, 10, 9, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }, hair);
    }
  }

  strokeFill(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(fw * 0.16, y - 2, fem ? 10 : 11, fem ? 9 : 10, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }, bloodied ? shadeSkin(skin, -0.1) : skin);
  if (police) {
    drawPoliceHelmetSide(ctx, fw * 0.14, y - 4, 0.95);
  }
  strokeFill(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(fw * 0.12, y - 5);
    ctx.lineTo(fw * 0.16, y - 1);
    ctx.moveTo(fw * 0.16, y - 5);
    ctx.lineTo(fw * 0.12, y - 1);
    ctx.stroke();
  }, "#1a1410", "#1a1410", 2);

  if (bloodied) {
    strokeFill(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(fw * 0.18, y - 4);
      ctx.lineTo(fw * 0.22, y + 4);
      ctx.stroke();
    }, "#a01828", "#a01828", 2);
  }
}

/**
 * Dragging themselves off the floor — head to the right so they crawl the way
 * they face. `phase` 0 reaches out, 1 pulls through.
 */
export function drawSorCrawl(
  ctx: CanvasRenderingContext2D,
  fw: number,
  fh: number,
  skin: string,
  shirt: string,
  phase: number,
  bloodied = false,
  opts: {
    pants?: string;
    hair?: string;
    build?: BodyBuild;
    present?: Present;
    hairStyle?: HairStyle;
    kit?: KitStyle;
  } = {},
): void {
  const y = fh - 12;
  const pants = opts.pants ?? "#3a4558";
  const pantsBack = shadeSkin(pants, 0.25);
  const m = buildMetrics(opts.build ?? "average");
  const lr = m.limb;
  const tw = m.torsoW;
  const fem = opts.present === "fem";
  const hairStyle: HairStyle =
    opts.hairStyle ?? (fem ? "shoulder" : "crop");
  const police = opts.kit === "police";
  const swing = Math.sin(phase * Math.PI * 2);
  // Whole body inches forward within the frame as the pull completes
  const shove = swing * 3;

  const hipX = fw * 0.42 + shove;
  const shoulderX = fw * 0.72 + shove;

  // Trailing legs — one knee tucks up to push, the other drags flat
  const tuck = Math.max(0, swing) * 9;
  limb(ctx, hipX, y + 2, hipX - 18 - tuck * 0.3, y + 6 - tuck, 5 * lr, 4 * lr, pantsBack);
  bootSide(ctx, hipX - 20 - tuck * 0.3, y + 3 - tuck);
  limb(ctx, hipX, y + 6, hipX - 22 + tuck * 0.2, y + 9, 5 * lr, 4 * lr, pants);
  bootSide(ctx, hipX - 23 + tuck * 0.2, y + 6);

  strokeFill(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(hipX - 2, y - 2);
    ctx.lineTo(shoulderX, y - 7);
    ctx.lineTo(shoulderX, y + 6 * tw);
    ctx.lineTo(hipX - 4, y + 8 * tw);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }, shirt);

  if (police) {
    strokeFill(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(hipX, y - 1);
      ctx.lineTo(shoulderX - 2, y - 5);
      ctx.lineTo(shoulderX - 2, y + 4 * tw);
      ctx.lineTo(hipX - 1, y + 5 * tw);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }, POLICE_HIVIS, OUTLINE, 1.5);
  }

  // Reaching arm claws forward, the other props the chest up
  const reach = 14 + Math.max(0, -swing) * 10;
  limb(ctx, shoulderX - 2, y - 3, shoulderX + reach, y + 4, 4 * lr, 3.5 * lr, shadeSkin(skin, 0.18));
  limb(ctx, shoulderX - 4, y + 1, shoulderX + 6, y + 9, 4 * lr, 3.5 * lr, skin);

  const headX = shoulderX + 9;
  const headLift = Math.max(0, swing) * 2;
  const hair = opts.hair ?? "#2a2220";
  if (!police) {
    strokeFill(ctx, () => {
      ctx.beginPath();
      ctx.ellipse(
        headX - 2,
        y - 8 - headLift,
        hairStyle === "crop" ? 10 : 13,
        hairStyle === "crop" ? 9 : 11,
        0.25,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.stroke();
    }, hair);
  }
  strokeFill(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(headX, y - 6 - headLift, fem ? 10 : 11, fem ? 9 : 10, 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }, bloodied ? shadeSkin(skin, -0.1) : skin);
  if (police) {
    drawPoliceHelmetSide(ctx, headX - 1, y - 8 - headLift, 0.9);
  }
  // Screwed-up face — still conscious, just done in
  strokeFill(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(headX + 2, y - 9 - headLift);
    ctx.lineTo(headX + 7, y - 7 - headLift);
    ctx.moveTo(headX + 2, y - 3 - headLift);
    ctx.lineTo(headX + 7, y - 4 - headLift);
    ctx.stroke();
  }, "#1a1410", "#1a1410", 2);

  if (bloodied) {
    strokeFill(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(headX + 3, y - 2 - headLift);
      ctx.lineTo(headX + 1, y + 5 - headLift);
      ctx.stroke();
    }, "#a01828", "#a01828", 2);
  }
}

export function drawDistantPerson(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const cx = w / 2;
  strokeFill(ctx, () => {
    ctx.fillStyle = "#4a4038";
    ctx.fillRect(cx - 2, h * 0.32, 5, 12);
    ctx.beginPath();
    ctx.ellipse(cx + 1, h * 0.26, 3.5, 4, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - 1, h * 0.7);
    ctx.lineTo(cx - 5, h - 2);
    ctx.moveTo(cx + 2, h * 0.7);
    ctx.lineTo(cx + 6, h - 2);
    ctx.stroke();
  }, "#4a4038", "#2a2218", 1.5);
}

export function drawFisherman(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  frame = 0,
): void {
  const cx = w * 0.38;
  const feet = h - 2;
  const rodTipY = frame === 0 ? h * 0.12 : h * 0.18;
  const rodTipX = w * (frame === 0 ? 0.92 : 0.88);
  const lineSlack = frame === 0 ? 0 : 4;

  // Boots
  strokeFill(ctx, () => {
    ctx.fillStyle = "#2a2420";
    ctx.fillRect(cx - 7, feet - 4, 7, 4);
    ctx.fillRect(cx + 1, feet - 4, 7, 4);
  }, "#2a2420", "#1a1410", 1);

  // Legs
  strokeFill(ctx, () => {
    ctx.strokeStyle = "#3a4558";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(cx - 2, h * 0.58);
    ctx.lineTo(cx - 4, feet - 4);
    ctx.moveTo(cx + 2, h * 0.58);
    ctx.lineTo(cx + 5, feet - 4);
    ctx.stroke();
  }, "#3a4558", "#1a1410", 1.2);

  // Coat / torso
  strokeFill(ctx, () => {
    ctx.fillStyle = "#3d5a4a";
    ctx.beginPath();
    ctx.moveTo(cx - 8, h * 0.34);
    ctx.lineTo(cx + 9, h * 0.35);
    ctx.lineTo(cx + 8, h * 0.6);
    ctx.lineTo(cx - 7, h * 0.59);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }, "#3d5a4a", "#1a1410", 1.4);

  // Arms holding rod
  strokeFill(ctx, () => {
    ctx.strokeStyle = "#c4a882";
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(cx + 6, h * 0.4);
    ctx.lineTo(cx + 14, h * 0.36);
    ctx.lineTo(cx + 18, h * 0.32);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 4, h * 0.42);
    ctx.lineTo(cx + 10, h * 0.38);
    ctx.stroke();
  }, "#c4a882", "#1a1410", 1);

  // Head + beanie
  strokeFill(ctx, () => {
    ctx.fillStyle = "#c4a882";
    ctx.beginPath();
    ctx.ellipse(cx + 1, h * 0.26, 5, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#2a4060";
    ctx.beginPath();
    ctx.ellipse(cx + 1, h * 0.21, 5.5, 3.5, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }, "#c4a882", "#1a1410", 1.2);

  // Rod + line out over the Solent
  strokeFill(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(cx + 16, h * 0.32);
    ctx.lineTo(rodTipX, rodTipY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rodTipX, rodTipY);
    ctx.quadraticCurveTo(
      rodTipX + 2,
      (rodTipY + h * 0.72) / 2 + lineSlack,
      rodTipX + 1,
      h * 0.78,
    );
    ctx.stroke();
    // Float bobbing on the water
    ctx.fillStyle = "#c02828";
    ctx.beginPath();
    ctx.arc(rodTipX + 1, h * 0.78, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }, "#2a2218", "#2a2218", 1.4);
}

export function drawBeachBbq(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  frame = 0,
): void {
  // Disposable tray BBQ + a little shingle party. `frame` 0..3 loops smoke / tongs / chat.
  const f = ((frame % 4) + 4) % 4;
  const grillY = h * 0.78;
  const glowPulse = f === 1 || f === 2 ? 1 : f === 3 ? 0.75 : 0.55;
  const smokeLift = f * 5;
  const tongsFlip = f === 1 || f === 2;
  const tongsUp = f === 2;
  const sitterLean = f === 1 || f === 3 ? 3 : 0;
  const sitterArm = f === 3;

  // Soft ground shadow
  fillOnly(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.92, w * 0.38, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }, "rgba(20,14,10,0.28)");

  // ── Left sitter (hoodie, bottle) ─────────────────────────────────
  const lx = w * 0.2 + sitterLean;
  strokeFill(ctx, () => {
    // Legs stretched toward the grill
    ctx.strokeStyle = "#2a3344";
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(lx - 2, h * 0.62);
    ctx.lineTo(lx + 10, h * 0.78);
    ctx.lineTo(lx + 18, h * 0.8);
    ctx.moveTo(lx + 2, h * 0.62);
    ctx.lineTo(lx + 6, h * 0.76);
    ctx.lineTo(lx + 14, h * 0.78);
    ctx.stroke();
    // Trainers
    ctx.fillStyle = "#e8dcc8";
    ctx.beginPath();
    ctx.ellipse(lx + 20, h * 0.81, 4, 2.2, 0.2, 0, Math.PI * 2);
    ctx.ellipse(lx + 15, h * 0.79, 3.5, 2, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }, "#2a3344", "#1a1410", 1.4);

  strokeFill(ctx, () => {
    // Torso / hoodie
    ctx.fillStyle = "#3a6a9a";
    ctx.beginPath();
    ctx.moveTo(lx - 9, h * 0.42);
    ctx.lineTo(lx + 10, h * 0.44);
    ctx.lineTo(lx + 9, h * 0.64);
    ctx.lineTo(lx - 8, h * 0.63);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Hood
    ctx.fillStyle = "#2e5580";
    ctx.beginPath();
    ctx.ellipse(lx + 1, h * 0.4, 8, 4, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }, "#3a6a9a", "#1a1410", 1.5);

  strokeFill(ctx, () => {
    // Head
    ctx.fillStyle = "#c4a882";
    ctx.beginPath();
    ctx.ellipse(lx + 1, h * 0.34, 5.2, 5.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Hair tuft
    ctx.fillStyle = "#2a2218";
    ctx.beginPath();
    ctx.ellipse(lx + 1, h * 0.3, 5.4, 3.2, 0, Math.PI, Math.PI * 2);
    ctx.fill();
  }, "#c4a882", "#1a1410", 1.3);

  strokeFill(ctx, () => {
    // Near arm — drink or chat gesture
    ctx.strokeStyle = "#c4a882";
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(lx + 8, h * 0.48);
    if (sitterArm) {
      ctx.lineTo(lx + 16, h * 0.4);
      ctx.lineTo(lx + 18, h * 0.34);
    } else {
      ctx.lineTo(lx + 14, h * 0.54);
      ctx.lineTo(lx + 18, h * 0.58);
    }
    ctx.stroke();
    // Bottle
    ctx.fillStyle = sitterArm ? "#3a7a4a" : "#2a5a3a";
    const bx = sitterArm ? lx + 18 : lx + 18;
    const by = sitterArm ? h * 0.3 : h * 0.56;
    ctx.fillRect(bx - 2, by, 4, 10);
    ctx.strokeRect(bx - 2, by, 4, 10);
    ctx.fillStyle = "#c4a882";
    ctx.fillRect(bx - 1, by - 3, 2, 3);
  }, "#c4a882", "#1a1410", 1.2);

  // ── Grill tray ───────────────────────────────────────────────────
  strokeFill(ctx, () => {
    // Legs
    ctx.strokeStyle = "#3a3a40";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.36, grillY + 2);
    ctx.lineTo(w * 0.34, grillY + 12);
    ctx.moveTo(w * 0.64, grillY + 2);
    ctx.lineTo(w * 0.66, grillY + 12);
    ctx.moveTo(w * 0.42, grillY + 2);
    ctx.lineTo(w * 0.4, grillY + 11);
    ctx.moveTo(w * 0.58, grillY + 2);
    ctx.lineTo(w * 0.6, grillY + 11);
    ctx.stroke();

    // Foil tray body
    ctx.fillStyle = "#7a7a82";
    ctx.beginPath();
    ctx.moveTo(w * 0.3, grillY);
    ctx.lineTo(w * 0.7, grillY);
    ctx.lineTo(w * 0.66, grillY + 9);
    ctx.lineTo(w * 0.34, grillY + 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Rim
    ctx.fillStyle = "#9a9aa2";
    ctx.fillRect(w * 0.29, grillY - 5, w * 0.42, 6);
    ctx.strokeRect(w * 0.29, grillY - 5, w * 0.42, 6);

    // Coal bed glow
    const glow = ctx.createRadialGradient(
      w * 0.5,
      grillY,
      2,
      w * 0.5,
      grillY,
      22,
    );
    glow.addColorStop(0, `rgba(255,180,60,${0.55 * glowPulse})`);
    glow.addColorStop(0.45, `rgba(220,70,20,${0.4 * glowPulse})`);
    glow.addColorStop(1, "rgba(180,40,10,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(w * 0.32, grillY - 10, w * 0.36, 14);

    // Charcoal lumps
    ctx.fillStyle = "#2a2218";
    for (const [cx, cy, r] of [
      [0.38, -1, 2.2],
      [0.45, 0, 2.5],
      [0.52, -1.5, 2],
      [0.58, 0.5, 2.3],
      [0.48, 1.5, 1.8],
    ] as const) {
      ctx.beginPath();
      ctx.arc(w * cx, grillY + cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Hot coals
    ctx.fillStyle = `rgba(255,120,40,${0.7 * glowPulse})`;
    for (const [cx, cy] of [
      [0.4, -0.5],
      [0.5, 0],
      [0.56, -1],
    ] as const) {
      ctx.beginPath();
      ctx.arc(w * cx, grillY + cy, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }, "#7a7a82", "#1a1410", 1.5);

  // Sausages on the grill (one lifts with tongs on flip frames)
  strokeFill(ctx, () => {
    const drawBanger = (x: number, y: number, ang: number, lifted: boolean) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.fillStyle = lifted ? "#c45a3a" : "#a04830";
      ctx.beginPath();
      ctx.ellipse(0, 0, 9, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Grill marks
      ctx.strokeStyle = "rgba(40,20,10,0.45)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-5, -1);
      ctx.lineTo(-5, 1);
      ctx.moveTo(0, -1.2);
      ctx.lineTo(0, 1.2);
      ctx.moveTo(5, -1);
      ctx.lineTo(5, 1);
      ctx.stroke();
      ctx.restore();
    };
    drawBanger(w * 0.4, grillY - 3, -0.15, false);
    if (!tongsFlip) {
      drawBanger(w * 0.52, grillY - 4, 0.1, false);
    }
    drawBanger(w * 0.6, grillY - 2.5, -0.05, false);
  }, "#a04830", "#1a1410", 1.2);

  // Smoke wisps — rise & drift per frame
  strokeFill(ctx, () => {
    for (let i = 0; i < 4; i++) {
      const sx = w * 0.38 + i * 9;
      const phase = f * 0.9 + i * 1.1;
      const top = grillY - 28 - smokeLift - i * 3;
      ctx.globalAlpha = 0.28 + (i % 2) * 0.1;
      ctx.strokeStyle = i % 2 === 0 ? "rgba(90,90,95,0.7)" : "rgba(70,70,75,0.55)";
      ctx.lineWidth = 2.2 - i * 0.2;
      ctx.beginPath();
      ctx.moveTo(sx, grillY - 8);
      ctx.bezierCurveTo(
        sx + Math.sin(phase) * 8,
        grillY - 18 - smokeLift * 0.4,
        sx + Math.cos(phase * 0.8) * 10,
        grillY - 30 - smokeLift * 0.7,
        sx + Math.sin(phase + 1) * 6,
        top,
      );
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }, "rgba(80,80,85,0.4)", "rgba(80,80,85,0.4)", 1.5);

  // Soft flame lick on hot frames
  if (f === 1 || f === 2) {
    fillOnly(ctx, () => {
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(w * 0.46, grillY - 4);
      ctx.quadraticCurveTo(w * 0.48, grillY - 14, w * 0.5, grillY - 6);
      ctx.quadraticCurveTo(w * 0.52, grillY - 16, w * 0.54, grillY - 4);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }, "#ffe08a");
  }

  // ── Standing cook (right) with tongs ─────────────────────────────
  const rx = w * 0.78;
  const ry = tongsUp ? -2 : 0;
  strokeFill(ctx, () => {
    // Legs
    ctx.strokeStyle = "#3a4558";
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(rx - 3, h * 0.58 + ry);
    ctx.lineTo(rx - 6, h * 0.86);
    ctx.moveTo(rx + 4, h * 0.58 + ry);
    ctx.lineTo(rx + 8, h * 0.86);
    ctx.stroke();
    // Shoes
    ctx.fillStyle = "#2a2218";
    ctx.beginPath();
    ctx.ellipse(rx - 7, h * 0.88, 4.5, 2.2, 0, 0, Math.PI * 2);
    ctx.ellipse(rx + 9, h * 0.88, 4.5, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }, "#3a4558", "#1a1410", 1.4);

  strokeFill(ctx, () => {
    // Torso — warm brick shirt
    ctx.fillStyle = "#a04838";
    ctx.beginPath();
    ctx.moveTo(rx - 9, h * 0.36 + ry);
    ctx.lineTo(rx + 10, h * 0.37 + ry);
    ctx.lineTo(rx + 9, h * 0.6 + ry);
    ctx.lineTo(rx - 8, h * 0.59 + ry);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }, "#a04838", "#1a1410", 1.5);

  strokeFill(ctx, () => {
    // Head
    ctx.fillStyle = "#c4a882";
    ctx.beginPath();
    ctx.ellipse(rx + 1, h * 0.28 + ry, 5.4, 5.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Cap / hair
    ctx.fillStyle = "#1a3048";
    ctx.beginPath();
    ctx.ellipse(rx + 1, h * 0.23 + ry, 5.8, 3.4, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(rx - 2, h * 0.22 + ry, 8, 2.5);
  }, "#c4a882", "#1a1410", 1.3);

  // Arms + tongs reaching the tray
  strokeFill(ctx, () => {
    const handX = tongsUp ? w * 0.56 : tongsFlip ? w * 0.52 : w * 0.58;
    const handY = tongsUp ? grillY - 18 : tongsFlip ? grillY - 6 : grillY - 10;
    ctx.strokeStyle = "#c4a882";
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(rx - 6, h * 0.44 + ry);
    ctx.lineTo(handX + 8, handY + 4);
    ctx.lineTo(handX, handY);
    ctx.stroke();
    // Far arm akimbo / pocket
    ctx.beginPath();
    ctx.moveTo(rx + 8, h * 0.44 + ry);
    ctx.lineTo(rx + 12, h * 0.54 + ry);
    ctx.lineTo(rx + 6, h * 0.58 + ry);
    ctx.stroke();

    // Metal tongs
    ctx.strokeStyle = "#5a6068";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(handX + 6, handY + 2);
    ctx.lineTo(handX - 2, handY + (tongsUp ? 4 : 8));
    ctx.moveTo(handX + 4, handY);
    ctx.lineTo(handX - 4, handY + (tongsUp ? 2 : 6));
    ctx.stroke();
    // Tip grip
    ctx.beginPath();
    ctx.arc(handX - 3, handY + (tongsUp ? 3 : 7), 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }, "#c4a882", "#1a1410", 1.2);

  // Lifted banger in the tongs
  if (tongsFlip) {
    strokeFill(ctx, () => {
      const hx = tongsUp ? w * 0.54 : w * 0.5;
      const hy = tongsUp ? grillY - 16 : grillY - 5;
      ctx.fillStyle = "#c45a3a";
      ctx.beginPath();
      ctx.ellipse(hx, hy, 8, 2.5, tongsUp ? -0.6 : 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }, "#c45a3a", "#1a1410", 1.2);
  }

  // ── Third mate — crouched behind / left of tray (chat) ───────────
  const mx = w * 0.48;
  const my = f === 2 ? 1 : 0;
  strokeFill(ctx, () => {
    // Small crouch silhouette so the party reads as three
    ctx.fillStyle = "#5a7a4a";
    ctx.beginPath();
    ctx.ellipse(mx, h * 0.52 + my, 7, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#c4a882";
    ctx.beginPath();
    ctx.ellipse(mx + 1, h * 0.44 + my, 4.2, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Beanie
    ctx.fillStyle = "#c45a3a";
    ctx.beginPath();
    ctx.ellipse(mx + 1, h * 0.4 + my, 4.5, 2.8, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }, "#5a7a4a", "#1a1410", 1.2);
}

export function drawCoffeeVan(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // Roadside steel coffee van — brushed metal, rivets, service hatch
  strokeFill(ctx, () => {
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(w / 2, h - 4, w * 0.44, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Steel body panels
    const steel = ctx.createLinearGradient(0, h * 0.18, 0, h * 0.78);
    steel.addColorStop(0, "#c8d0d6");
    steel.addColorStop(0.45, "#9aa6b0");
    steel.addColorStop(1, "#6e7a84");
    ctx.fillStyle = steel;
    ctx.fillRect(10, h * 0.2, w - 20, h * 0.54);
    ctx.strokeRect(10, h * 0.2, w - 20, h * 0.54);

    // Panel seams
    ctx.strokeStyle = "rgba(40,45,50,0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(w * 0.35, h * 0.2);
    ctx.lineTo(w * 0.35, h * 0.74);
    ctx.moveTo(w * 0.68, h * 0.2);
    ctx.lineTo(w * 0.68, h * 0.74);
    ctx.stroke();

    // Rivets
    ctx.fillStyle = "#5a646c";
    for (const rx of [18, w * 0.35, w * 0.68, w - 18]) {
      for (const ry of [h * 0.28, h * 0.48, h * 0.66]) {
        ctx.beginPath();
        ctx.arc(rx, ry, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Roof lip / steel canopy
    ctx.fillStyle = "#7a8690";
    ctx.fillRect(8, h * 0.1, w - 16, 16);
    ctx.strokeStyle = "#1a1410";
    ctx.lineWidth = 2;
    ctx.strokeRect(8, h * 0.1, w - 16, 16);

    // Service hatch
    ctx.fillStyle = "#2a3036";
    ctx.fillRect(w * 0.2, h * 0.32, w * 0.52, h * 0.28);
    ctx.fillStyle = "#d8e0e6";
    ctx.fillRect(w * 0.22, h * 0.34, w * 0.48, h * 0.24);
    ctx.strokeRect(w * 0.22, h * 0.34, w * 0.48, h * 0.24);

    // Steel sign board
    ctx.fillStyle = "#3a444c";
    ctx.fillRect(w * 0.26, h * 0.4, w * 0.4, 18);
    ctx.strokeRect(w * 0.26, h * 0.4, w * 0.4, 18);
    ctx.fillStyle = "#e8f0f4";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText("COFFEE", w * 0.32, h * 0.525);

    // Chrome bumper strip
    ctx.fillStyle = "#b8c4cc";
    ctx.fillRect(12, h * 0.7, w - 24, 6);
    ctx.strokeRect(12, h * 0.7, w - 24, 6);

    // Wheels
    ctx.fillStyle = "#1a1410";
    ctx.beginPath();
    ctx.arc(36, h * 0.8, 14, 0, Math.PI * 2);
    ctx.arc(w - 36, h * 0.8, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#8a949c";
    ctx.beginPath();
    ctx.arc(36, h * 0.8, 5, 0, Math.PI * 2);
    ctx.arc(w - 36, h * 0.8, 5, 0, Math.PI * 2);
    ctx.fill();

    // Steam from hatch
    ctx.strokeStyle = "rgba(80,90,100,0.45)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(w * 0.72, h * 0.2);
    ctx.quadraticCurveTo(w * 0.78, h * 0.1, w * 0.72, h * 0.04);
    ctx.stroke();
  }, "#9aa6b0", "#1a1410", 2);
}

export function drawCoffeeCupCafe(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // The Coffee Cup — seafront cafe, feet planted on the prom (no hover gap)
  strokeFill(ctx, () => {
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.ellipse(w / 2, h - 2, w * 0.46, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Walls sit on the canvas floor so originY=1 plants them
    ctx.fillStyle = "#e8dcc8";
    ctx.fillRect(8, h * 0.28, w - 16, h * 0.72 - 4);
    ctx.strokeRect(8, h * 0.28, w - 16, h * 0.72 - 4);
    // windows
    ctx.fillStyle = "#7a9ab0";
    ctx.fillRect(20, h * 0.4, 40, 32);
    ctx.fillRect(w - 60, h * 0.4, 40, 32);
    ctx.strokeRect(20, h * 0.4, 40, 32);
    ctx.strokeRect(w - 60, h * 0.4, 40, 32);
    // door flush with the ground line
    ctx.fillStyle = "#5a4030";
    ctx.fillRect(w * 0.42, h * 0.44, 28, h * 0.56 - 4);
    ctx.strokeRect(w * 0.42, h * 0.44, 28, h * 0.56 - 4);
    // striped awning
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = i % 2 === 0 ? "#c02828" : "#f2e6d8";
      ctx.fillRect(10 + i * ((w - 20) / 10), h * 0.2, (w - 20) / 10, 18);
    }
    ctx.strokeRect(10, h * 0.2, w - 20, 18);
    // sign
    ctx.fillStyle = "#1a4060";
    ctx.fillRect(w * 0.18, h * 0.05, w * 0.64, 24);
    ctx.strokeRect(w * 0.18, h * 0.05, w * 0.64, 24);
    ctx.fillStyle = "#f2e6d8";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText("COFFEE CUP", w * 0.28, h * 0.165);
  }, "#e8dcc8", "#1a1410", 2);
}

/** Tiny seafront kids’ park — rubber pad, rail, swings, slide, spring rocker. */
export function drawKidsPark(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  strokeFill(ctx, () => {
    // Ground shadow
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.beginPath();
    ctx.ellipse(w / 2, h - 3, w * 0.46, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Rubber crumb pad
    ctx.fillStyle = "#c45a3a";
    ctx.beginPath();
    ctx.moveTo(6, h - 8);
    ctx.quadraticCurveTo(w * 0.5, h - 14, w - 6, h - 8);
    ctx.lineTo(w - 10, h * 0.72);
    ctx.quadraticCurveTo(w * 0.5, h * 0.68, 10, h * 0.72);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // crumb speckles
    ctx.fillStyle = "rgba(26,20,16,0.2)";
    for (let i = 0; i < 18; i++) {
      const sx = 18 + ((i * 37) % (w - 36));
      const sy = h * 0.74 + ((i * 19) % 18);
      ctx.fillRect(sx, sy, 2, 2);
    }

    // Low rail fence
    ctx.strokeStyle = "#1a1410";
    ctx.lineWidth = 2;
    ctx.fillStyle = "#e8c84a";
    const railY = h * 0.7;
    for (let i = 0; i < 9; i++) {
      const px = 12 + i * ((w - 24) / 8);
      ctx.fillRect(px - 2, railY, 4, h - 10 - railY);
      ctx.strokeRect(px - 2, railY, 4, h - 10 - railY);
    }
    ctx.fillStyle = "#3a8a5a";
    ctx.fillRect(10, railY - 3, w - 20, 5);
    ctx.strokeRect(10, railY - 3, w - 20, 5);

    // Swing frame (A-frame)
    const swingX = w * 0.28;
    const topY = h * 0.18;
    ctx.strokeStyle = "#1a1410";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(swingX - 28, h * 0.68);
    ctx.lineTo(swingX, topY);
    ctx.lineTo(swingX + 28, h * 0.68);
    ctx.moveTo(swingX - 22, topY + 4);
    ctx.lineTo(swingX + 22, topY + 4);
    ctx.stroke();
    // Seats + chains
    for (const dx of [-10, 10]) {
      ctx.beginPath();
      ctx.moveTo(swingX + dx - 2, topY + 4);
      ctx.lineTo(swingX + dx - 1, h * 0.52);
      ctx.moveTo(swingX + dx + 2, topY + 4);
      ctx.lineTo(swingX + dx + 1, h * 0.52);
      ctx.stroke();
      ctx.fillStyle = "#4a6a9a";
      ctx.fillRect(swingX + dx - 7, h * 0.52, 14, 5);
      ctx.strokeRect(swingX + dx - 7, h * 0.52, 14, 5);
    }

    // Slide
    const slideX = w * 0.62;
    ctx.fillStyle = "#d8d0c0";
    ctx.fillRect(slideX - 4, h * 0.28, 8, h * 0.4);
    ctx.strokeRect(slideX - 4, h * 0.28, 8, h * 0.4);
    // steps
    ctx.fillStyle = "#8a9098";
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(slideX - 18, h * 0.55 - i * 10, 14, 4);
      ctx.strokeRect(slideX - 18, h * 0.55 - i * 10, 14, 4);
    }
    // Chute
    ctx.fillStyle = "#c02828";
    ctx.beginPath();
    ctx.moveTo(slideX + 4, h * 0.3);
    ctx.quadraticCurveTo(slideX + 42, h * 0.42, slideX + 38, h * 0.66);
    ctx.lineTo(slideX + 28, h * 0.66);
    ctx.quadraticCurveTo(slideX + 30, h * 0.46, slideX + 4, h * 0.36);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }, "#c45a3a", "#1a1410", 2);
}

export function drawContainerShip(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  drawSeaGel(ctx, w * 0.52, h * 0.8, w * 0.48);
  strokeFill(ctx, () => {
    // Soft wake
    ctx.strokeStyle = "rgba(200,220,230,0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(2, h * 0.78);
    ctx.quadraticCurveTo(w * 0.12, h * 0.74, w * 0.22, h * 0.8);
    ctx.stroke();

    // Hull
    ctx.fillStyle = "#2a3540";
    ctx.beginPath();
    ctx.moveTo(4, h * 0.62);
    ctx.lineTo(w * 0.08, h * 0.52);
    ctx.lineTo(w * 0.88, h * 0.5);
    ctx.lineTo(w - 3, h * 0.58);
    ctx.lineTo(w - 5, h * 0.82);
    ctx.lineTo(6, h * 0.86);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Red waterline / antifoul
    ctx.fillStyle = "#8a3030";
    ctx.beginPath();
    ctx.moveTo(7, h * 0.74);
    ctx.lineTo(w - 6, h * 0.7);
    ctx.lineTo(w - 5, h * 0.82);
    ctx.lineTo(6, h * 0.86);
    ctx.closePath();
    ctx.fill();

    // Deck
    ctx.fillStyle = "#5a6570";
    ctx.fillRect(w * 0.1, h * 0.48, w * 0.72, 5);
    ctx.strokeRect(w * 0.1, h * 0.48, w * 0.72, 5);

    // Stacked containers — two tiers
    const colors = ["#c45c4a", "#3a6db0", "#e8a030", "#4a8a5a", "#8a4a9a", "#d8d0c0"];
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 7; i++) {
        const cx = 10 + i * 11;
        const cy = h * 0.28 - row * 11;
        ctx.fillStyle = colors[(i + row * 3) % colors.length]!;
        ctx.fillRect(cx, cy, 10, 11);
        ctx.strokeRect(cx, cy, 10, 11);
        // door corrugation hint
        ctx.strokeStyle = "rgba(26,20,16,0.35)";
        ctx.beginPath();
        ctx.moveTo(cx + 3, cy + 2);
        ctx.lineTo(cx + 3, cy + 9);
        ctx.moveTo(cx + 7, cy + 2);
        ctx.lineTo(cx + 7, cy + 9);
        ctx.stroke();
        ctx.strokeStyle = "#1a1410";
      }
    }

    // Bridge / superstructure aft
    ctx.fillStyle = "#d8d0c0";
    ctx.fillRect(w * 0.74, h * 0.18, 18, 22);
    ctx.strokeRect(w * 0.74, h * 0.18, 18, 22);
    ctx.fillStyle = "#7ab0c8";
    ctx.fillRect(w * 0.76, h * 0.22, 14, 8);
    ctx.strokeRect(w * 0.76, h * 0.22, 14, 8);
    // Funnel
    ctx.fillStyle = "#c02828";
    ctx.fillRect(w * 0.9, h * 0.12, 7, 14);
    ctx.strokeRect(w * 0.9, h * 0.12, 7, 14);
    ctx.fillStyle = "#1a1410";
    ctx.fillRect(w * 0.9, h * 0.12, 7, 3);
  }, "#1a1410", "#1a1410", 1.3);
}

/** Soft water contact under a floating sprite so the hull isn't a hard stamp. */
export function drawSeaGel(
  ctx: CanvasRenderingContext2D,
  cx: number,
  waterY: number,
  halfW: number,
): void {
  ctx.save();
  // Deep tint blot under the hull
  const blot = ctx.createRadialGradient(cx, waterY, 1, cx, waterY + 2, halfW);
  blot.addColorStop(0, "rgba(28,68,88,0.4)");
  blot.addColorStop(0.45, "rgba(50,110,130,0.22)");
  blot.addColorStop(1, "rgba(50,110,130,0)");
  ctx.fillStyle = blot;
  ctx.beginPath();
  ctx.ellipse(cx, waterY + 3, halfW, Math.max(4, halfW * 0.26), 0, 0, Math.PI * 2);
  ctx.fill();

  // Foam lip along the waterline
  ctx.strokeStyle = "rgba(232,244,250,0.6)";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  const left = cx - halfW * 0.92;
  const span = halfW * 1.84;
  ctx.moveTo(left, waterY);
  for (let i = 1; i <= 10; i++) {
    const t = i / 10;
    ctx.lineTo(left + span * t, waterY + Math.sin(t * Math.PI * 3) * 1.5);
  }
  ctx.stroke();

  // Soft reflection flashes under the bow / midships
  ctx.fillStyle = "rgba(200,230,240,0.28)";
  ctx.beginPath();
  ctx.ellipse(cx - halfW * 0.28, waterY + 4, halfW * 0.32, 2.4, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + halfW * 0.2, waterY + 5, halfW * 0.22, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Small Solent day-boat / cabin cruiser — facing right. */
export function drawMotorBoat(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  drawSeaGel(ctx, w * 0.5, h * 0.76, w * 0.44);
  strokeFill(ctx, () => {
    // Wake
    ctx.strokeStyle = "rgba(200,220,230,0.65)";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(2, h * 0.78);
    ctx.quadraticCurveTo(w * 0.1, h * 0.72, w * 0.18, h * 0.8);
    ctx.moveTo(3, h * 0.84);
    ctx.quadraticCurveTo(w * 0.08, h * 0.8, w * 0.14, h * 0.86);
    ctx.stroke();

    // Hull — white topsides
    ctx.fillStyle = "#eef2f6";
    ctx.beginPath();
    ctx.moveTo(6, h * 0.7);
    ctx.quadraticCurveTo(w * 0.12, h * 0.48, w * 0.28, h * 0.46);
    ctx.lineTo(w * 0.78, h * 0.46);
    ctx.quadraticCurveTo(w * 0.92, h * 0.48, w - 4, h * 0.62);
    ctx.lineTo(w - 6, h * 0.78);
    ctx.quadraticCurveTo(w * 0.5, h * 0.86, 8, h * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Blue antifoul below waterline
    ctx.fillStyle = "#2a5080";
    ctx.beginPath();
    ctx.moveTo(8, h * 0.72);
    ctx.lineTo(w - 7, h * 0.68);
    ctx.lineTo(w - 6, h * 0.78);
    ctx.quadraticCurveTo(w * 0.5, h * 0.86, 8, h * 0.8);
    ctx.closePath();
    ctx.fill();
    // Thin bootstripe
    ctx.strokeStyle = "#c02828";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(9, h * 0.7);
    ctx.lineTo(w - 8, h * 0.66);
    ctx.stroke();
    ctx.strokeStyle = "#1a1410";
    ctx.lineWidth = 1.5;

    // Deck / cockpit sole
    ctx.fillStyle = "#c8b898";
    ctx.beginPath();
    ctx.moveTo(w * 0.22, h * 0.5);
    ctx.lineTo(w * 0.74, h * 0.5);
    ctx.lineTo(w * 0.72, h * 0.58);
    ctx.lineTo(w * 0.24, h * 0.58);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cabin with raked windscreen
    ctx.fillStyle = "#3a6a9a";
    ctx.beginPath();
    ctx.moveTo(w * 0.36, h * 0.5);
    ctx.lineTo(w * 0.4, h * 0.26);
    ctx.lineTo(w * 0.62, h * 0.26);
    ctx.lineTo(w * 0.68, h * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Windows
    ctx.fillStyle = "#a8d4e8";
    ctx.beginPath();
    ctx.moveTo(w * 0.42, h * 0.32);
    ctx.lineTo(w * 0.45, h * 0.28);
    ctx.lineTo(w * 0.58, h * 0.28);
    ctx.lineTo(w * 0.6, h * 0.32);
    ctx.lineTo(w * 0.58, h * 0.44);
    ctx.lineTo(w * 0.44, h * 0.44);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Window mullion
    ctx.beginPath();
    ctx.moveTo(w * 0.51, h * 0.28);
    ctx.lineTo(w * 0.51, h * 0.44);
    ctx.stroke();

    // Bow rail
    ctx.beginPath();
    ctx.moveTo(w * 0.2, h * 0.48);
    ctx.lineTo(w * 0.14, h * 0.4);
    ctx.lineTo(w * 0.28, h * 0.38);
    ctx.lineTo(w * 0.34, h * 0.46);
    ctx.stroke();

    // Outboard motor on stern
    ctx.fillStyle = "#2a2a30";
    ctx.fillRect(w * 0.78, h * 0.52, 8, 10);
    ctx.strokeRect(w * 0.78, h * 0.52, 8, 10);
    ctx.fillStyle = "#4a4a55";
    ctx.beginPath();
    ctx.moveTo(w * 0.79, h * 0.62);
    ctx.lineTo(w * 0.85, h * 0.62);
    ctx.lineTo(w * 0.84, h * 0.74);
    ctx.lineTo(w * 0.8, h * 0.74);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Skipper silhouette in the cockpit
    ctx.fillStyle = "#e8c4a0";
    ctx.beginPath();
    ctx.arc(w * 0.55, h * 0.4, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#c02828";
    ctx.fillRect(w * 0.52, h * 0.44, 6, 6);
  }, "#1a1410", "#1a1410", 1.5);
}

/** Jet ski with rider silhouette — facing right. */
export function drawJetSki(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  drawSeaGel(ctx, w * 0.48, h * 0.76, w * 0.4);
  strokeFill(ctx, () => {
    // Spray / wake
    ctx.strokeStyle = "rgba(210,230,240,0.7)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(2, h * 0.78);
    ctx.quadraticCurveTo(w * 0.12, h * 0.7, w * 0.2, h * 0.82);
    ctx.stroke();

    // Hull — white + red flash
    ctx.fillStyle = "#f0f4f8";
    ctx.beginPath();
    ctx.moveTo(4, h * 0.72);
    ctx.quadraticCurveTo(w * 0.3, h * 0.48, w * 0.78, h * 0.5);
    ctx.lineTo(w - 3, h * 0.62);
    ctx.quadraticCurveTo(w * 0.55, h * 0.84, 6, h * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#d04040";
    ctx.beginPath();
    ctx.moveTo(w * 0.18, h * 0.62);
    ctx.quadraticCurveTo(w * 0.4, h * 0.52, w * 0.72, h * 0.55);
    ctx.lineTo(w * 0.7, h * 0.68);
    ctx.quadraticCurveTo(w * 0.4, h * 0.72, w * 0.2, h * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Seat
    ctx.fillStyle = "#1a1a22";
    ctx.beginPath();
    ctx.ellipse(w * 0.42, h * 0.58, 12, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Handlebars
    ctx.strokeStyle = "#1a1410";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.52, h * 0.52);
    ctx.lineTo(w * 0.6, h * 0.34);
    ctx.lineTo(w * 0.72, h * 0.36);
    ctx.moveTo(w * 0.6, h * 0.34);
    ctx.lineTo(w * 0.58, h * 0.42);
    ctx.stroke();

    // Rider leaning forward
    ctx.fillStyle = "#e8c4a0";
    ctx.beginPath();
    ctx.arc(w * 0.46, h * 0.3, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#2a6db0";
    ctx.beginPath();
    ctx.moveTo(w * 0.4, h * 0.36);
    ctx.lineTo(w * 0.54, h * 0.34);
    ctx.lineTo(w * 0.52, h * 0.56);
    ctx.lineTo(w * 0.38, h * 0.58);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Lifejacket
    ctx.fillStyle = "#e8a030";
    ctx.fillRect(w * 0.41, h * 0.38, 10, 5);
  }, "#1a1410", "#1a1410", 1.4);
}

/** Solo kayaker — frame 0 paddle forward, frame 1 paddle back. Facing right. */
export function drawKayak(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  frame = 0,
): void {
  const paddleFwd = frame === 0;
  drawSeaGel(ctx, w * 0.5, h * 0.74, w * 0.42);
  strokeFill(ctx, () => {
    // Hull
    ctx.fillStyle = "#e8a030";
    ctx.beginPath();
    ctx.moveTo(3, h * 0.72);
    ctx.quadraticCurveTo(w * 0.2, h * 0.58, w * 0.5, h * 0.56);
    ctx.quadraticCurveTo(w * 0.82, h * 0.58, w - 3, h * 0.7);
    ctx.quadraticCurveTo(w * 0.55, h * 0.82, 5, h * 0.78);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Cockpit rim
    ctx.fillStyle = "#2a2820";
    ctx.beginPath();
    ctx.ellipse(w * 0.48, h * 0.62, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Paddler — leans with the stroke so the frames read at distance
    const lean = paddleFwd ? -3 : 3;
    ctx.fillStyle = "#2a6db0";
    ctx.beginPath();
    ctx.moveTo(w * 0.42 + lean, h * 0.4);
    ctx.lineTo(w * 0.54 + lean, h * 0.4);
    ctx.lineTo(w * 0.52, h * 0.62);
    ctx.lineTo(w * 0.44, h * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Head + lifejacket hint
    ctx.fillStyle = "#e8c4a0";
    ctx.beginPath();
    ctx.arc(w * 0.48 + lean, h * 0.32, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#c02828";
    ctx.fillRect(w * 0.43 + lean, h * 0.42, 10, 5);

    // Arms reaching the shaft
    ctx.strokeStyle = "#e8c4a0";
    ctx.lineWidth = 2.2;
    const handL = { x: w * (paddleFwd ? 0.34 : 0.38), y: h * (paddleFwd ? 0.4 : 0.56) };
    const handR = { x: w * (paddleFwd ? 0.62 : 0.58), y: h * (paddleFwd ? 0.56 : 0.4) };
    ctx.beginPath();
    ctx.moveTo(w * 0.46 + lean, h * 0.46);
    ctx.lineTo(handL.x, handL.y);
    ctx.moveTo(w * 0.5 + lean, h * 0.46);
    ctx.lineTo(handR.x, handR.y);
    ctx.stroke();

    // Double paddle — big diagonal swing (must differ clearly between frames)
    const tipA = paddleFwd
      ? { x: w * 0.08, y: h * 0.18 }
      : { x: w * 0.1, y: h * 0.88 };
    const tipB = paddleFwd
      ? { x: w * 0.92, y: h * 0.88 }
      : { x: w * 0.9, y: h * 0.18 };
    ctx.strokeStyle = "#5a4030";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(tipA.x, tipA.y);
    ctx.lineTo(tipB.x, tipB.y);
    ctx.stroke();
    // Blades
    ctx.fillStyle = "#3a6db0";
    ctx.beginPath();
    ctx.ellipse(tipA.x, tipA.y, 6.5, 3.2, paddleFwd ? -0.85 : 0.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(tipB.x, tipB.y, 6.5, 3.2, paddleFwd ? 0.85 : -0.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Hands on shaft
    ctx.fillStyle = "#e8c4a0";
    ctx.beginPath();
    ctx.arc(handL.x, handL.y, 2.4, 0, Math.PI * 2);
    ctx.arc(handR.x, handR.y, 2.4, 0, Math.PI * 2);
    ctx.fill();

    // Splash at the dipped blade
    const splash = paddleFwd ? tipB : tipA;
    ctx.strokeStyle = "rgba(220,236,244,0.75)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(splash.x - 5, splash.y - 2);
    ctx.quadraticCurveTo(splash.x, splash.y - 8, splash.x + 5, splash.y - 2);
    ctx.stroke();
  }, "#1a1410", "#1a1410", 1.4);
}

export function drawDog(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  strokeFill(ctx, () => {
    ctx.fillStyle = "#8a6040";
    ctx.beginPath();
    ctx.ellipse(w * 0.45, h * 0.55, 14, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(w * 0.72, h * 0.45, 7, 6, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(w * 0.3, h * 0.65, 3, 10);
    ctx.fillRect(w * 0.4, h * 0.65, 3, 10);
    ctx.fillRect(w * 0.52, h * 0.65, 3, 10);
    ctx.fillRect(w * 0.58, h * 0.65, 3, 10);
    ctx.beginPath();
    ctx.moveTo(w * 0.3, h * 0.5);
    ctx.quadraticCurveTo(w * 0.15, h * 0.3, w * 0.22, h * 0.45);
    ctx.stroke();
  }, "#8a6040", "#1a1410", 2);
}

export function drawBike(ctx: CanvasRenderingContext2D, w: number, h: number, frame = 0): void {
  const rearX = 14;
  const frontX = w - 13;
  const hubY = h - 11;
  const r = 10;
  const rot = frame * 0.7;
  const bbX = w * 0.4;
  const bbY = hubY - 2;
  const seatX = w * 0.36;
  const seatY = hubY - 28;
  const headX = w * 0.62;
  const headY = hubY - 24;

  const wheel = (cx: number, cy: number, spin: number) => {
    // Tyre
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    // Rim
    ctx.fillStyle = "#c8c4bc";
    ctx.beginPath();
    ctx.arc(cx, cy, r - 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Spokes
    ctx.strokeStyle = "#6a6860";
    ctx.lineWidth = 1.1;
    for (let i = 0; i < 6; i++) {
      const a = spin + (i * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3));
      ctx.stroke();
    }
    // Hub
    ctx.fillStyle = "#3a3a38";
    ctx.beginPath();
    ctx.arc(cx, cy, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  };

  strokeFill(
    ctx,
    () => {
      // Chain stays / seat stays / down tube / top tube — classic diamond
      ctx.strokeStyle = "#2a6a9a";
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(rearX, hubY);
      ctx.lineTo(bbX, bbY);
      ctx.lineTo(frontX, hubY);
      ctx.moveTo(rearX, hubY);
      ctx.lineTo(seatX, seatY + 4);
      ctx.lineTo(bbX, bbY);
      ctx.moveTo(seatX, seatY + 4);
      ctx.lineTo(headX, headY);
      ctx.lineTo(bbX, bbY);
      ctx.stroke();
      // Outline pass
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(rearX, hubY);
      ctx.lineTo(bbX, bbY);
      ctx.lineTo(frontX, hubY);
      ctx.moveTo(rearX, hubY);
      ctx.lineTo(seatX, seatY + 4);
      ctx.lineTo(bbX, bbY);
      ctx.moveTo(seatX, seatY + 4);
      ctx.lineTo(headX, headY);
      ctx.lineTo(bbX, bbY);
      ctx.stroke();

      // Seat post + saddle
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(seatX, seatY + 4);
      ctx.lineTo(seatX, seatY - 2);
      ctx.stroke();
      ctx.fillStyle = "#2a2420";
      ctx.beginPath();
      ctx.moveTo(seatX - 8, seatY - 1);
      ctx.quadraticCurveTo(seatX, seatY - 5, seatX + 7, seatY);
      ctx.quadraticCurveTo(seatX, seatY + 3, seatX - 8, seatY - 1);
      ctx.fill();
      ctx.stroke();

      // Fork + stem + bars (reach back toward rider hands)
      ctx.strokeStyle = "#2a6a9a";
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.moveTo(frontX, hubY);
      ctx.lineTo(headX, headY);
      ctx.lineTo(headX - 2, headY - 6);
      ctx.stroke();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(frontX, hubY);
      ctx.lineTo(headX, headY);
      ctx.lineTo(headX - 2, headY - 6);
      ctx.stroke();
      // Flat bar — grips sit where the seated rider's fists land
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(headX - 10, headY - 4);
      ctx.lineTo(headX + 6, headY - 7);
      ctx.lineTo(headX + 10, headY - 3);
      ctx.stroke();
      ctx.fillStyle = "#1a1a1a";
      ctx.beginPath();
      ctx.arc(headX - 10, headY - 4, 2.6, 0, Math.PI * 2);
      ctx.arc(headX + 10, headY - 3, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Crank + pedals
      const crankA = rot;
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(bbX - Math.cos(crankA) * 7, bbY - Math.sin(crankA) * 7);
      ctx.lineTo(bbX + Math.cos(crankA) * 7, bbY + Math.sin(crankA) * 7);
      ctx.stroke();
      const ped = (side: 1 | -1) => {
        const px = bbX + Math.cos(crankA) * 7 * side;
        const py = bbY + Math.sin(crankA) * 7 * side;
        ctx.fillStyle = "#3a3a38";
        ctx.fillRect(px - 4, py - 1.5, 8, 3);
        ctx.strokeRect(px - 4, py - 1.5, 8, 3);
      };
      ped(1);
      ped(-1);
      // Chainring
      ctx.fillStyle = "#8a8880";
      ctx.beginPath();
      ctx.arc(bbX, bbY, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.4;
      ctx.stroke();

      wheel(rearX, hubY, rot);
      wheel(frontX, hubY, rot + 0.35);
    },
    "#2a6a9a",
    OUTLINE,
    2.2,
  );
}

export function drawSkateboard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  frame = 0,
): void {
  strokeFill(ctx, () => {
    const deckY = h - 14;
    ctx.fillStyle = "#3a5a8a";
    ctx.beginPath();
    ctx.moveTo(8, deckY);
    ctx.quadraticCurveTo(w * 0.5, deckY - 4, w - 8, deckY);
    ctx.lineTo(w - 10, deckY + 5);
    ctx.quadraticCurveTo(w * 0.5, deckY + 8, 10, deckY + 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Grip tape
    ctx.fillStyle = "#2a2a30";
    ctx.fillRect(14, deckY + 1, w - 28, 3);
    // Trucks + wheels
    const rot = frame * 0.6;
    const wheel = (cx: number) => {
      ctx.fillStyle = "#1a1a1a";
      ctx.beginPath();
      ctx.arc(cx, h - 6, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#8a8a92";
      ctx.beginPath();
      ctx.moveTo(cx, h - 6);
      ctx.lineTo(cx + Math.cos(rot) * 4, h - 6 + Math.sin(rot) * 4);
      ctx.stroke();
      ctx.strokeStyle = "#1a1410";
    };
    ctx.fillStyle = "#6a6a72";
    ctx.fillRect(16, deckY + 4, 10, 3);
    ctx.fillRect(w - 26, deckY + 4, 10, 3);
    wheel(20);
    wheel(w - 20);
  }, "#3a5a8a", "#1a1410", 2.2);
}

/** Snapped deck halves — left = tail, right = nose. */
export function drawBrokenSkateHalf(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  half: "tail" | "nose",
): void {
  strokeFill(
    ctx,
    () => {
      const deckY = h - 14;
      const isTail = half === "tail";
      ctx.fillStyle = "#3a5a8a";
      ctx.beginPath();
      if (isTail) {
        ctx.moveTo(6, deckY);
        ctx.quadraticCurveTo(w * 0.45, deckY - 3, w - 4, deckY - 1);
        ctx.lineTo(w - 2, deckY + 6);
        ctx.lineTo(w - 6, deckY + 8);
        ctx.quadraticCurveTo(w * 0.4, deckY + 7, 8, deckY + 5);
      } else {
        ctx.moveTo(4, deckY - 1);
        ctx.quadraticCurveTo(w * 0.55, deckY - 4, w - 6, deckY);
        ctx.lineTo(w - 8, deckY + 5);
        ctx.quadraticCurveTo(w * 0.5, deckY + 7, 6, deckY + 8);
        ctx.lineTo(2, deckY + 6);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Jagged break edge
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      if (isTail) {
        ctx.moveTo(w - 4, deckY - 1);
        ctx.lineTo(w - 8, deckY + 2);
        ctx.lineTo(w - 2, deckY + 6);
      } else {
        ctx.moveTo(4, deckY - 1);
        ctx.lineTo(8, deckY + 2);
        ctx.lineTo(2, deckY + 6);
      }
      ctx.stroke();
      ctx.fillStyle = "#2a2a30";
      ctx.fillRect(isTail ? 10 : 8, deckY + 1, w - 16, 2.5);
      // One truck + wheel per half
      const wx = isTail ? 14 : w - 14;
      ctx.fillStyle = "#6a6a72";
      ctx.fillRect(wx - 5, deckY + 4, 9, 3);
      ctx.fillStyle = "#1a1a1a";
      ctx.beginPath();
      ctx.arc(wx, h - 6, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.8;
      ctx.stroke();
    },
    "#3a5a8a",
    OUTLINE,
    2,
  );
}

export function drawScooter(ctx: CanvasRenderingContext2D, w: number, h: number, frame = 0): void {
  const rot = frame * 0.85;
  const deckY = h - 20;
  const rearX = 13;
  const frontX = w - 12;
  const hubY = h - 9;
  const stemBaseX = frontX - 2;
  const stemTopX = frontX;
  const gripY = 11;

  const wheel = (cx: number, cy: number, spin: number, radius: number) => {
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#d8d0c4";
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#7a786e";
    ctx.lineWidth = 1.1;
    for (let i = 0; i < 3; i++) {
      const a = spin + (i * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * (radius - 2.5), cy + Math.sin(a) * (radius - 2.5));
      ctx.stroke();
    }
    ctx.fillStyle = "#3a3a38";
    ctx.beginPath();
    ctx.arc(cx, cy, 1.8, 0, Math.PI * 2);
    ctx.fill();
  };

  strokeFill(
    ctx,
    () => {
      // Deck board
      ctx.fillStyle = "#3d7a9a";
      ctx.beginPath();
      ctx.moveTo(8, deckY + 1);
      ctx.lineTo(frontX - 6, deckY);
      ctx.quadraticCurveTo(frontX - 1, deckY + 1, frontX - 2, deckY + 5);
      ctx.lineTo(10, deckY + 7);
      ctx.quadraticCurveTo(7, deckY + 5, 8, deckY + 1);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      // Grip tape strip
      ctx.fillStyle = "#2a2a30";
      ctx.fillRect(12, deckY + 2, frontX - 22, 3);
      // Deck bolts
      ctx.fillStyle = "#8a8880";
      for (const bx of [16, 28, frontX - 18]) {
        ctx.beginPath();
        ctx.arc(bx, deckY + 3.5, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Neck / fork into front wheel
      ctx.strokeStyle = "#c45a2a";
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(stemBaseX, deckY + 2);
      ctx.lineTo(stemTopX, gripY + 8);
      ctx.stroke();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(stemBaseX, deckY + 2);
      ctx.lineTo(stemTopX, gripY + 8);
      ctx.stroke();
      // Front fork down to hub
      ctx.strokeStyle = "#c45a2a";
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(stemBaseX, deckY + 2);
      ctx.lineTo(frontX, hubY);
      ctx.stroke();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(stemBaseX, deckY + 2);
      ctx.lineTo(frontX, hubY);
      ctx.stroke();

      // T-bar: crossbar reaches BACK toward the rider's fists
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(stemTopX - 24, gripY + 4);
      ctx.lineTo(stemTopX + 2, gripY + 1);
      ctx.stroke();
      // Stem clamp nub
      ctx.fillStyle = "#c45a2a";
      ctx.beginPath();
      ctx.arc(stemTopX - 2, gripY + 6, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      // Soft grips
      ctx.fillStyle = "#1a1a1a";
      ctx.beginPath();
      ctx.arc(stemTopX - 24, gripY + 4, 3.4, 0, Math.PI * 2);
      ctx.arc(stemTopX + 2, gripY + 1, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Rear brake stub
      ctx.fillStyle = "#4a4a48";
      ctx.fillRect(rearX + 2, deckY - 2, 6, 3);
      ctx.strokeRect(rearX + 2, deckY - 2, 6, 3);

      wheel(rearX, hubY, rot, 6.5);
      wheel(frontX, hubY, rot + 0.4, 6.5);
    },
    "#3d7a9a",
    OUTLINE,
    2.2,
  );
}

export function drawWheelchair(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  strokeFill(ctx, () => {
    ctx.beginPath();
    ctx.arc(w * 0.35, h - 12, 12, 0, Math.PI * 2);
    ctx.arc(w * 0.75, h - 10, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w * 0.35, h - 24);
    ctx.lineTo(w * 0.7, h - 22);
    ctx.lineTo(w * 0.7, h - 36);
    ctx.lineTo(w * 0.4, h - 38);
    ctx.closePath();
    ctx.stroke();
  }, "#5a5a5a", "#1a1410", 2.5);
}
