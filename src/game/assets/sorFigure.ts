/** Streets of Rage 2–inspired side-on silhouettes + walk frames. */

import { buildMetrics, shadeSkin, type BodyBuild } from "./pompeyLooks";

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
  | "block"
  /** @deprecated kept for sheet gen alias */
  | "run";

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
  strokeFill(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(x0 + nx * r0, y0 + ny * r0);
    ctx.lineTo(x1 + nx * r1, y1 + ny * r1);
    ctx.arc(x1, y1, r1, Math.atan2(ny, nx), Math.atan2(-ny, -nx), false);
    ctx.lineTo(x0 - nx * r0, y0 - ny * r0);
    ctx.arc(x0, y0, r0, Math.atan2(-ny, -nx), Math.atan2(ny, nx), false);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }, fill);
}

function bootSide(ctx: CanvasRenderingContext2D, toeX: number, y: number): void {
  strokeFill(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(toeX - 14, y - 9);
    ctx.lineTo(toeX + 2, y - 7);
    ctx.lineTo(toeX + 4, y);
    ctx.lineTo(toeX - 16, y + 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }, "#2a2220", "#1a1410", 2);
}

type Pt = { x: number; y: number };

/** Stride phase 0..1 for walk/run leg swing (facing right). */
function strideLegs(
  hip: Pt,
  feetY: number,
  phase: number,
  amp: number,
): { back: { knee: Pt; foot: Pt }; front: { knee: Pt; foot: Pt } } {
  const a = Math.sin(phase * Math.PI * 2) * amp;
  const b = Math.sin(phase * Math.PI * 2 + Math.PI) * amp;
  const liftA = Math.max(0, Math.cos(phase * Math.PI * 2)) * (amp * 0.35);
  const liftB = Math.max(0, Math.cos(phase * Math.PI * 2 + Math.PI)) * (amp * 0.35);
  return {
    back: {
      knee: { x: hip.x - 4 + a * 0.45, y: hip.y + 14 - liftA * 0.3 },
      foot: { x: hip.x - 2 + a, y: feetY - liftA },
    },
    front: {
      knee: { x: hip.x + 2 + b * 0.45, y: hip.y + 14 - liftB * 0.3 },
      foot: { x: hip.x + 4 + b, y: feetY - liftB },
    },
  };
}

function strideArms(
  shoulder: Pt,
  phase: number,
  amp: number,
): { back: { elbow: Pt; hand: Pt }; front: { elbow: Pt; hand: Pt } } {
  const a = Math.sin(phase * Math.PI * 2) * amp;
  const b = Math.sin(phase * Math.PI * 2 + Math.PI) * amp;
  return {
    // opposite to legs
    back: {
      elbow: { x: shoulder.x + 2 - a * 0.5, y: shoulder.y + 12 },
      hand: { x: shoulder.x + 4 - a, y: shoulder.y + 24 },
    },
    front: {
      elbow: { x: shoulder.x + 6 - b * 0.5, y: shoulder.y + 12 },
      hand: { x: shoulder.x + 10 - b, y: shoulder.y + 24 },
    },
  };
}

function walkPhase(pose: SorPose): number | null {
  if (pose === "walk0") return 0;
  if (pose === "walk1") return 0.25;
  if (pose === "walk2") return 0.5;
  if (pose === "walk3") return 0.75;
  if (pose === "run0" || pose === "run") return 0;
  if (pose === "run1") return 0.25;
  if (pose === "run2") return 0.5;
  if (pose === "run3") return 0.75;
  return null;
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
  } = {},
): void {
  const punch = pose === "punch";
  const jab = pose === "jab";
  const upper = pose === "upper";
  const block = pose === "block";
  const weaponSwing = pose === "weapon_swing";
  const backhand = pose === "backhand";
  const headbutt = pose === "headbutt";
  const kick = pose === "kick";
  const stompUp = pose === "stomp_up";
  const stomp = pose === "stomp";
  const jumpKick = pose === "jump_kick";
  const hurt = pose === "hurt" || pose === "bloodied";
  const angry = pose === "angry";
  const jump = pose === "jump";
  const holdGut = pose === "hold_gut";
  const limp = pose === "limp_arm";
  const limpLeg = pose === "limp_leg";
  const film = pose === "film";
  const bloodied = opts.bloodied || pose === "bloodied";
  const hair = opts.hair ?? "#2a2220";
  const pants = opts.pants ?? "#3a4558";
  const m = buildMetrics(opts.build ?? "average");
  const skinBack = shadeSkin(skin, 0.18);
  const pantsBack = shadeSkin(pants, 0.25);
  const phase = walkPhase(pose);
  const isRun =
    pose === "run" ||
    pose === "run0" ||
    pose === "run1" ||
    pose === "run2" ||
    pose === "run3";
  const isWalk = phase !== null && !isRun;

  const crouch =
    hurt || limpLeg || holdGut
      ? 5
      : isRun
        ? 3
        : stompUp || stomp
          ? 10
          : upper
            ? 4
            : block
              ? 6
              : 0;
  const lean = isRun
    ? 6
    : jump || jumpKick
      ? 4
      : stomp || stompUp
        ? 8
        : upper
          ? 5
          : jab
            ? 2
            : block
              ? -2
              : 0;
  const air = jump || jumpKick;
  const stand = 62 * m.height;
  const headY = feetY - (air ? stand + 6 : stand) + crouch;
  const shoulderY = headY + 15;
  const hipY = feetY - (air ? 28 : 24) * m.height + crouch + m.belly * 0.4;

  // Body center shifts forward when leaning into a run
  const bx = cx + lean;

  const hip: Pt = { x: bx, y: hipY };
  const shoulder: Pt = { x: bx + 2, y: shoulderY };

  // --- Legs (far leg first, then near) ---
  let farKnee: Pt;
  let farFoot: Pt;
  let nearKnee: Pt;
  let nearFoot: Pt;

  if (phase !== null) {
    const legs = strideLegs(hip, feetY, phase, (isRun ? 16 : 11) * m.height);
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
    farKnee = { x: hip.x - 6, y: hip.y + 10 };
    farFoot = { x: hip.x - 8, y: feetY - 10 };
    nearKnee = { x: hip.x + 22, y: hip.y + 2 };
    nearFoot = { x: hip.x + 38, y: hip.y + 2 };
  } else if (kick) {
    farKnee = { x: hip.x - 4, y: hip.y + 14 };
    farFoot = { x: hip.x - 2, y: feetY };
    nearKnee = { x: hip.x + 24, y: hip.y + 4 };
    nearFoot = { x: hip.x + 36, y: hip.y - 2 };
  } else if (limpLeg) {
    farKnee = { x: hip.x - 2, y: hip.y + 14 };
    farFoot = { x: hip.x, y: feetY };
    nearKnee = { x: hip.x + 14, y: hip.y + 10 };
    nearFoot = { x: hip.x + 22, y: feetY };
  } else if (jump) {
    farKnee = { x: hip.x - 8, y: hip.y + 8 };
    farFoot = { x: hip.x - 10, y: feetY - 12 };
    nearKnee = { x: hip.x + 10, y: hip.y + 8 };
    nearFoot = { x: hip.x + 12, y: feetY - 12 };
  } else {
    // idle / angry / hurt — side stance
    farKnee = { x: hip.x - 4, y: hip.y + 14 };
    farFoot = { x: hip.x - 6, y: feetY };
    nearKnee = { x: hip.x + 6, y: hip.y + 14 };
    nearFoot = { x: hip.x + 10, y: feetY };
  }

  const lr = m.limb;
  // Far (back) leg — darker
  limb(ctx, hip.x - 2, hip.y, farKnee.x, farKnee.y, 5.5 * lr, 4.5 * lr, pantsBack);
  limb(ctx, farKnee.x, farKnee.y, farFoot.x, farFoot.y - 4, 4.5 * lr, 4 * lr, pantsBack);
  bootSide(ctx, farFoot.x + 6, farFoot.y);

  // Near (front) leg
  limb(ctx, hip.x + 2, hip.y, nearKnee.x, nearKnee.y, 6 * lr, 5 * lr, pants);
  limb(ctx, nearKnee.x, nearKnee.y, nearFoot.x, nearFoot.y - 4, 5 * lr, 4.5 * lr, pants);
  if (stomp) {
    // Bigger stomping boot + impact rings
    bootSide(ctx, nearFoot.x + 10, nearFoot.y);
    strokeFill(
      ctx,
      () => {
        ctx.beginPath();
        ctx.ellipse(nearFoot.x + 6, feetY + 3, 18, 5, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(nearFoot.x + 6, feetY + 3, 11, 3, 0, 0, Math.PI * 2);
        ctx.stroke();
        // dust flecks
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
    bootSide(ctx, nearFoot.x + 8, nearFoot.y);
  }

  // --- Side torso ---
  const tw = m.torsoW;
  const belly = m.belly;
  strokeFill(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(bx - 8 * tw, shoulderY);
    ctx.lineTo(bx + 12 * tw, shoulderY + 2);
    ctx.lineTo(bx + (10 + belly * 0.4) * tw, hipY);
    ctx.lineTo(bx - (10 + belly * 0.5) * tw, hipY - 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // jacket seam
    ctx.beginPath();
    ctx.moveTo(bx + 2, shoulderY + 4);
    ctx.lineTo(bx + 1, hipY - 4);
    ctx.stroke();
  }, shirt, "#1a1410", 2.8);

  // --- Arms ---
  let farElbow: Pt;
  let farHand: Pt;
  let nearElbow: Pt;
  let nearHand: Pt;

  if (phase !== null) {
    const arms = strideArms(shoulder, phase, isRun ? 12 : 8);
    farElbow = arms.back.elbow;
    farHand = arms.back.hand;
    nearElbow = arms.front.elbow;
    nearHand = arms.front.hand;
  } else if (block) {
    // High guard — both fists up covering the face (very readable)
    farElbow = { x: shoulder.x - 2, y: shoulder.y + 8 };
    farHand = { x: shoulder.x + 6, y: shoulder.y - 10 };
    nearElbow = { x: shoulder.x + 8, y: shoulder.y + 6 };
    nearHand = { x: shoulder.x + 14, y: shoulder.y - 14 };
  } else if (jab) {
    // Snappy short jab — arm not fully extended
    farElbow = { x: shoulder.x - 4, y: shoulder.y + 14 };
    farHand = { x: shoulder.x - 2, y: shoulder.y + 26 };
    nearElbow = { x: shoulder.x + 14, y: shoulder.y + 4 };
    nearHand = { x: shoulder.x + 24, y: shoulder.y + 2 };
  } else if (upper) {
    // Uppercut — fist driving up under the chin
    farElbow = { x: shoulder.x - 6, y: shoulder.y + 16 };
    farHand = { x: shoulder.x - 4, y: shoulder.y + 28 };
    nearElbow = { x: shoulder.x + 10, y: shoulder.y + 2 };
    nearHand = { x: shoulder.x + 16, y: shoulder.y - 18 };
  } else if (punch || weaponSwing) {
    farElbow = { x: shoulder.x - 4, y: shoulder.y + 14 };
    farHand = { x: shoulder.x - 2, y: shoulder.y + 26 };
    nearElbow = { x: shoulder.x + 20, y: shoulder.y + 2 };
    nearHand = { x: shoulder.x + (weaponSwing ? 36 : 32), y: shoulder.y - 2 };
  } else if (backhand) {
    farElbow = { x: shoulder.x - 18, y: shoulder.y + 2 };
    farHand = { x: shoulder.x - 30, y: shoulder.y - 2 };
    nearElbow = { x: shoulder.x + 8, y: shoulder.y + 14 };
    nearHand = { x: shoulder.x + 10, y: shoulder.y + 26 };
  } else if (headbutt) {
    farElbow = { x: shoulder.x - 2, y: shoulder.y + 12 };
    farHand = { x: shoulder.x + 4, y: shoulder.y + 10 };
    nearElbow = { x: shoulder.x + 10, y: shoulder.y + 10 };
    nearHand = { x: shoulder.x + 16, y: shoulder.y + 8 };
  } else if (jumpKick) {
    farElbow = { x: shoulder.x - 8, y: shoulder.y + 4 };
    farHand = { x: shoulder.x - 14, y: shoulder.y - 2 };
    nearElbow = { x: shoulder.x + 10, y: shoulder.y + 12 };
    nearHand = { x: shoulder.x + 14, y: shoulder.y + 22 };
  } else if (stompUp || stomp) {
    // Arms out for balance — windmill on the way down
    farElbow = { x: shoulder.x - 16, y: shoulder.y + 4 };
    farHand = { x: shoulder.x - 26, y: shoulder.y - 6 };
    nearElbow = { x: shoulder.x + 14, y: shoulder.y + (stomp ? 8 : 2) };
    nearHand = { x: shoulder.x + 24, y: shoulder.y + (stomp ? 18 : -4) };
  } else if (holdGut) {
    farElbow = { x: shoulder.x - 2, y: shoulder.y + 12 };
    farHand = { x: bx, y: hipY - 2 };
    nearElbow = { x: shoulder.x + 6, y: shoulder.y + 12 };
    nearHand = { x: bx + 4, y: hipY };
  } else if (limp) {
    farElbow = { x: shoulder.x - 2, y: shoulder.y + 14 };
    farHand = { x: shoulder.x, y: shoulder.y + 26 };
    nearElbow = { x: shoulder.x + 6, y: shoulder.y + 18 };
    nearHand = { x: shoulder.x + 4, y: hipY + 2 };
  } else if (hurt) {
    farElbow = { x: shoulder.x - 6, y: shoulder.y + 16 };
    farHand = { x: shoulder.x - 10, y: shoulder.y + 26 };
    nearElbow = { x: shoulder.x + 8, y: shoulder.y + 16 };
    nearHand = { x: shoulder.x + 12, y: shoulder.y + 26 };
  } else if (angry) {
    farElbow = { x: shoulder.x - 2, y: shoulder.y + 12 };
    farHand = { x: shoulder.x + 2, y: shoulder.y + 22 };
    nearElbow = { x: shoulder.x + 10, y: shoulder.y + 10 };
    nearHand = { x: shoulder.x + 14, y: shoulder.y + 20 };
  } else if (film) {
    // Phone up — arm raised toward the scrap
    farElbow = { x: shoulder.x - 2, y: shoulder.y + 14 };
    farHand = { x: shoulder.x, y: shoulder.y + 26 };
    nearElbow = { x: shoulder.x + 10, y: shoulder.y - 4 };
    nearHand = { x: shoulder.x + 18, y: shoulder.y - 22 };
  } else {
    // idle fists ready, side-on
    farElbow = { x: shoulder.x - 2, y: shoulder.y + 12 };
    farHand = { x: shoulder.x + 2, y: shoulder.y + 24 };
    nearElbow = { x: shoulder.x + 8, y: shoulder.y + 12 };
    nearHand = { x: shoulder.x + 12, y: shoulder.y + 24 };
  }

  // Far arm (behind)
  limb(ctx, shoulder.x - 2, shoulder.y, farElbow.x, farElbow.y, 4.5 * lr, 3.5 * lr, skinBack);
  limb(ctx, farElbow.x, farElbow.y, farHand.x, farHand.y, 3.5 * lr, 3.5 * lr, skinBack);

  // Near arm (front)
  limb(ctx, shoulder.x + 4, shoulder.y, nearElbow.x, nearElbow.y, 5 * lr, 4 * lr, skin);
  limb(ctx, nearElbow.x, nearElbow.y, nearHand.x, nearHand.y, 4 * lr, 3.5 * lr, skin);

  strokeFill(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(nearHand.x, nearHand.y, 5 * lr, 4.2 * lr, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }, skin);

  if (film) {
    // Phone held up
    strokeFill(ctx, () => {
      ctx.beginPath();
      ctx.rect(nearHand.x - 3, nearHand.y - 18, 10, 16);
      ctx.fill();
      ctx.stroke();
    }, "#1a1a22");
    ctx.fillStyle = "#6ec8ff";
    ctx.fillRect(nearHand.x - 1, nearHand.y - 15, 6, 10);
  }

  // --- Profile head (facing right) ---
  const hx = bx + (headbutt ? 8 : 4);
  const hy = headY;
  const hs = 0.92 + 0.08 * Math.min(m.torsoW, 1.15);

  // hair / back of skull
  strokeFill(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(hx - 2, hy - 2, 11 * hs, 12 * hs, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }, hair);

  // face oval — blush when hurt/angry still reads on all skin tones
  const faceFlush = bloodied || angry ? shadeSkin(skin, -0.12) : skin;
  strokeFill(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(hx + 2, hy + 1, 10 * hs, 12 * hs, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }, faceFlush);
  // nose
  strokeFill(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(hx + 10, hy);
    ctx.lineTo(hx + 16, hy + 2);
    ctx.lineTo(hx + 10, hy + 5);
    ctx.stroke();
  }, "#1a1410", "#1a1410", 2);

  // ear
  strokeFill(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(hx - 6, hy + 2, 3, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }, skin);

  // eye + mouth
  strokeFill(ctx, () => {
    if (angry) {
      ctx.beginPath();
      ctx.moveTo(hx + 4, hy - 2);
      ctx.lineTo(hx + 10, hy);
      ctx.moveTo(hx + 4, hy + 7);
      ctx.lineTo(hx + 11, hy + 7);
      ctx.stroke();
    } else if (hurt || holdGut) {
      ctx.beginPath();
      ctx.arc(hx + 6, hy, 1.4, 0, Math.PI * 2);
      ctx.moveTo(hx + 4, hy + 7);
      ctx.quadraticCurveTo(hx + 8, hy + 4, hx + 12, hy + 7);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(hx + 6, hy, 1.5, 0, Math.PI * 2);
      ctx.moveTo(hx + 4, hy + 6);
      ctx.lineTo(hx + 11, hy + 6);
      ctx.stroke();
    }
  }, "#1a1410", "#1a1410", 2);

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

  // subtle bob hint for walk (shadow under feet)
  if (isWalk || isRun) {
    strokeFill(ctx, () => {
      ctx.globalAlpha = 0.15;
      ctx.beginPath();
      ctx.ellipse(bx, feetY + 2, 16, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }, "#1a1410");
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
  opts: { pants?: string; hair?: string; build?: BodyBuild } = {},
): void {
  const y = fh - 12;
  const pants = opts.pants ?? "#3a4558";
  const pantsBack = shadeSkin(pants, 0.25);
  const m = buildMetrics(opts.build ?? "average");
  const lr = m.limb;
  // Side-on KO — body along the ground, head to the left
  limb(ctx, fw * 0.5, y, fw * 0.78, y - 2, 5 * lr, 4 * lr, pants);
  limb(ctx, fw * 0.5, y + 3, fw * 0.8, y + 6, 5 * lr, 4 * lr, pantsBack);
  bootSide(ctx, fw * 0.82, y);
  bootSide(ctx, fw * 0.84, y + 8);

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
  strokeFill(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(fw * 0.14, y - 4, 10, 9, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }, hair);

  strokeFill(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(fw * 0.16, y - 2, 11, 10, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }, bloodied ? shadeSkin(skin, -0.1) : skin);
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

export function drawFisherman(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  drawDistantPerson(ctx, w, h);
  strokeFill(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(w * 0.55, h * 0.4);
    ctx.lineTo(w * 0.9, h * 0.15);
    ctx.lineTo(w * 0.92, h * 0.55);
    ctx.stroke();
  }, "#2a2218", "#2a2218", 1.5);
}

export function drawContainerShip(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  strokeFill(ctx, () => {
    ctx.fillStyle = "#3a4550";
    ctx.beginPath();
    ctx.moveTo(2, h * 0.7);
    ctx.lineTo(w - 2, h * 0.65);
    ctx.lineTo(w - 4, h * 0.85);
    ctx.lineTo(4, h * 0.9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const colors = ["#c45c4a", "#3a6db0", "#e8a030", "#4a8a5a"];
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(8 + i * 10, h * 0.35, 9, 12);
      ctx.strokeRect(8 + i * 10, h * 0.35, 9, 12);
    }
    ctx.fillStyle = "#d8d0c0";
    ctx.fillRect(w * 0.72, h * 0.22, 14, 18);
    ctx.strokeRect(w * 0.72, h * 0.22, 14, 18);
  }, "#3a4550", "#1a1410", 1.2);
}

/** Small motorboat — mid Solent traffic. Facing right. */
export function drawMotorBoat(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  strokeFill(ctx, () => {
    // hull
    ctx.fillStyle = "#c8d0d8";
    ctx.beginPath();
    ctx.moveTo(4, h * 0.62);
    ctx.lineTo(w * 0.18, h * 0.48);
    ctx.lineTo(w * 0.72, h * 0.48);
    ctx.lineTo(w - 4, h * 0.58);
    ctx.lineTo(w - 6, h * 0.78);
    ctx.lineTo(6, h * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // cabin
    ctx.fillStyle = "#2a5080";
    ctx.beginPath();
    ctx.moveTo(w * 0.38, h * 0.48);
    ctx.lineTo(w * 0.42, h * 0.28);
    ctx.lineTo(w * 0.62, h * 0.28);
    ctx.lineTo(w * 0.66, h * 0.48);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // window
    ctx.fillStyle = "#9ec8e0";
    ctx.fillRect(w * 0.45, h * 0.32, 10, 8);
    ctx.strokeRect(w * 0.45, h * 0.32, 10, 8);
    // wake hint
    ctx.strokeStyle = "#a8c8d8";
    ctx.beginPath();
    ctx.moveTo(2, h * 0.72);
    ctx.lineTo(w * 0.12, h * 0.68);
    ctx.stroke();
  }, "#1a1410", "#1a1410", 1.5);
}

/** Jet ski with rider silhouette — facing right. */
export function drawJetSki(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  strokeFill(ctx, () => {
    // ski body
    ctx.fillStyle = "#d04040";
    ctx.beginPath();
    ctx.moveTo(4, h * 0.7);
    ctx.quadraticCurveTo(w * 0.35, h * 0.48, w * 0.85, h * 0.55);
    ctx.lineTo(w - 3, h * 0.68);
    ctx.quadraticCurveTo(w * 0.5, h * 0.82, 6, h * 0.78);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // seat stripe
    ctx.fillStyle = "#1a1a22";
    ctx.fillRect(w * 0.32, h * 0.55, w * 0.28, 5);
    // handlebars
    ctx.beginPath();
    ctx.moveTo(w * 0.55, h * 0.52);
    ctx.lineTo(w * 0.62, h * 0.38);
    ctx.lineTo(w * 0.72, h * 0.4);
    ctx.stroke();
    // rider
    ctx.fillStyle = "#e8c4a0";
    ctx.beginPath();
    ctx.arc(w * 0.48, h * 0.32, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#2a6db0";
    ctx.beginPath();
    ctx.moveTo(w * 0.42, h * 0.38);
    ctx.lineTo(w * 0.55, h * 0.38);
    ctx.lineTo(w * 0.52, h * 0.58);
    ctx.lineTo(w * 0.4, h * 0.58);
    ctx.closePath();
    ctx.fill();
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

export function drawBike(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  strokeFill(ctx, () => {
    ctx.beginPath();
    ctx.arc(16, h - 10, 10, 0, Math.PI * 2);
    ctx.arc(w - 16, h - 10, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(16, h - 10);
    ctx.lineTo(w / 2, h - 28);
    ctx.lineTo(w - 16, h - 10);
    ctx.moveTo(w / 2, h - 28);
    ctx.lineTo(w / 2, h - 36);
    ctx.lineTo(w - 20, h - 34);
    ctx.stroke();
  }, "#2a2a2a", "#1a1410", 2.5);
}

export function drawScooter(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  strokeFill(ctx, () => {
    ctx.fillStyle = "#4a4a4a";
    ctx.fillRect(8, h - 14, w - 16, 5);
    ctx.strokeRect(8, h - 14, w - 16, 5);
    ctx.beginPath();
    ctx.arc(14, h - 8, 6, 0, Math.PI * 2);
    ctx.arc(w - 14, h - 8, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w - 18, h - 14);
    ctx.lineTo(w - 18, h - 40);
    ctx.lineTo(w - 8, h - 40);
    ctx.stroke();
  }, "#4a4a4a", "#1a1410", 2.5);
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
