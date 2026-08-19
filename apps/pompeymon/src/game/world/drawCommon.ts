import Phaser from "phaser";

export type Solid = { x: number; y: number; w: number; h: number };

export function px(
  g: Phaser.GameObjects.Graphics,
  color: number,
  x: number,
  y: number,
  w = 1,
  h = 1,
): void {
  g.fillStyle(color, 1);
  g.fillRect(x, y, w, h);
}

export function furn(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: number,
  hi: number,
  lo: number,
): void {
  px(g, fill, x, y, w, h);
  px(g, hi, x, y, w, 2);
  px(g, lo, x, y + h - 3, w, 3);
  px(g, lo, x, y, 1, h);
  px(g, hi, x + w - 1, y, 1, h - 3);
}

const WOOD = 0xd2a05c;
const WOOD_HI = 0xe8c078;
const WOOD_LO = 0xa07038;
const INK = 0x201c18;
const STEP = 0x8a5c34;
const STEP_LO = 0x5a381c;
const STEP_HI = 0xc08a50;
const WELL = 0x1a100c;
const RAIL = 0x8a5a30;

/** Door in a south wall — sits in the wall band, never taller than it. */
export function southDoor(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  glass = false,
): Solid {
  furn(g, x, y, w, h, WOOD, WOOD_HI, WOOD_LO);
  const panelH = Math.max(3, Math.floor((h - 8) / 2));
  px(g, WOOD_HI, x + 3, y + 3, 11, panelH);
  px(g, WOOD_HI, x + w - 14, y + 3, 11, panelH);
  px(g, WOOD_LO, x + 15, y + 3, 2, panelH);
  const lowY = y + 4 + panelH;
  const lowH = Math.max(3, h - 8 - panelH);
  if (glass) {
    px(g, 0x68a0c8, x + 4, lowY, 10, lowH);
    px(g, 0x68a0c8, x + w - 14, lowY, 10, lowH);
    px(g, 0x88c0d8, x + 5, lowY + 1, 4, Math.min(3, lowH));
  } else {
    px(g, WOOD_HI, x + 3, lowY, 11, lowH);
    px(g, WOOD_HI, x + w - 14, lowY, 11, lowH);
  }
  px(g, INK, x + w - 7, y + Math.floor(h / 2) - 1, 2, 2);
  return { x, y, w, h };
}

/** Side door filling an east/west wall strip. */
export function sideDoor(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
): Solid {
  px(g, WOOD_LO, x, y, w, h);
  px(g, WOOD, x, y + 1, Math.max(1, w - 1), h - 2);
  px(g, WOOD_HI, x, y, w, 1);
  px(g, INK, x + 1, y + Math.floor(h / 2) - 1, 2, 2);
  return { x, y, w, h };
}

/** Small GBA wall photo — gold/wood frame, sits on the north wallpaper. */
export function wallFrame(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  inner: number,
  gold = true,
): void {
  const rim = gold ? 0xc8a048 : WOOD;
  const rimHi = gold ? 0xe8d078 : WOOD_HI;
  const rimLo = gold ? 0x8a6828 : WOOD_LO;
  px(g, rimLo, x, y, w, h);
  px(g, rim, x + 1, y + 1, w - 2, h - 2);
  px(g, rimHi, x + 1, y + 1, w - 2, 1);
  px(g, inner, x + 3, y + 3, w - 6, h - 6);
}

/** Receding stairwell going down (away from camera). */
export function stairsDown(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  px(g, WELL, x, y, w, h);
  const n = 6;
  const stepH = Math.floor((h - 4) / n);
  for (let i = 0; i < n; i++) {
    const sy = y + 2 + i * stepH;
    const inset = 2 + i * 2;
    const sw = w - 8 - inset;
    px(g, STEP_LO, x + inset, sy + 3, sw, stepH - 3);
    px(g, STEP, x + inset, sy, sw, 4);
    px(g, STEP_HI, x + inset, sy, sw, 1);
    px(g, INK, x + inset, sy + stepH - 1, sw, 1);
  }
  px(g, RAIL, x + w - 5, y, 4, h);
  px(g, WOOD_HI, x + w - 5, y, 4, 2);
  for (let yy = y + 8; yy < y + h - 4; yy += 10) px(g, WOOD_LO, x + w - 4, yy, 2, 5);
  px(g, STEP_HI, x + 4, y, w - 12, 2);
}

/** Stairs going up toward the north wall. */
export function stairsUp(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  px(g, WELL, x, y, w, h);
  const n = 6;
  const stepH = Math.floor((h - 4) / n);
  for (let i = 0; i < n; i++) {
    const sy = y + 2 + i * stepH;
    const inset = 2 + (n - 1 - i) * 2;
    const sw = w - 8 - inset;
    px(g, STEP_LO, x + 4, sy + 3, sw, stepH - 3);
    px(g, STEP, x + 4, sy, sw, 4);
    px(g, STEP_HI, x + 4, sy, sw, 1);
  }
  px(g, RAIL, x + w - 5, y, 4, h);
  px(g, WOOD_HI, x + w - 5, y, 4, 2);
  for (let yy = y + 8; yy < y + h - 4; yy += 10) px(g, WOOD_LO, x + w - 4, yy, 2, 5);
}
