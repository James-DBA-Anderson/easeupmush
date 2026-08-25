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

/** Tiny side-on BMX for shop windows and racks. */
export function miniBike(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  px(g, 0xf0c030, x + 3, y, 4, 2);
  px(g, 0x3a90d0, x + 4, y + 2, 7, 2);
  px(g, 0x3a90d0, x + 10, y, 4, 2);
  px(g, 0x201c18, x + 11, y + 1, 3, 1);
  px(g, 0x2a2a32, x, y + 3, 5, 5);
  px(g, 0xe8ecf0, x + 1, y + 4, 3, 3);
  px(g, 0x2a2a32, x + 10, y + 3, 5, 5);
  px(g, 0xe8ecf0, x + 11, y + 4, 3, 3);
}

/** High-street cycle shop: yellow fascia, bikes in the window. Door on the street side. */
export function cycleShopFront(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  doorEast: boolean,
): Solid {
  const yellow = 0xe8c030;
  const yellowL = 0xf8e070;
  const yellowD = 0xb89018;
  const navy = 0x2a3a68;
  const cream = 0xd8ccb4;
  const creamL = 0xe8e0d0;
  const creamD = 0xb8a890;
  const glass = 0x68a0c8;
  const glassL = 0x88c0d8;
  const roof = 0x6a3028;
  px(g, roof, x - 2, y, w + 4, 8);
  px(g, 0x8a4840, x - 2, y, w + 4, 2);
  furn(g, x, y + 6, w, h - 6, cream, creamL, creamD);
  px(g, yellowD, x + 4, y + 8, w - 8, 10);
  px(g, yellow, x + 5, y + 9, w - 10, 8);
  px(g, yellowL, x + 5, y + 9, w - 10, 2);
  px(g, navy, x + 10, y + 11, 8, 4);
  px(g, navy, x + 20, y + 11, 8, 4);
  px(g, navy, x + 30, y + 11, 8, 4);
  px(g, navy, x + 40, y + 11, 6, 4);
  const gx = doorEast ? x + 6 : x + w - 42;
  px(g, INK, gx - 1, y + 18, 34, 18);
  px(g, glass, gx, y + 19, 32, 16);
  px(g, glassL, gx + 1, y + 20, 8, 5);
  px(g, 0x5a5040, gx + 2, y + 28, 28, 6);
  miniBike(g, gx + 2, y + 22);
  miniBike(g, gx + 16, y + 22);
  const dx = doorEast ? x + w - 10 : x;
  px(g, WOOD_LO, dx, y + 18, 8, h - 24);
  px(g, WOOD, dx, y + 19, 7, h - 26);
  px(g, WOOD_HI, dx, y + 18, 8, 1);
  px(g, INK, dx + (doorEast ? 5 : 2), y + 30, 2, 2);
  return { x, y, w, h };
}

function shopDoor(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  doorEast: boolean,
): void {
  const dx = doorEast ? x + w - 10 : x;
  px(g, WOOD_LO, dx, y + 18, 8, h - 24);
  px(g, WOOD, dx, y + 19, 7, h - 26);
  px(g, WOOD_HI, dx, y + 18, 8, 1);
  px(g, INK, dx + (doorEast ? 5 : 2), y + 30, 2, 2);
}

/** Fish-and-chip shop: red fascia, paper parcels in the window. */
export function chippyFront(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  doorEast: boolean,
): Solid {
  const cream = 0xe8e0d0;
  const creamL = 0xf4eee4;
  const creamD = 0xc8c0b0;
  const red = 0xb03028;
  const redL = 0xd04838;
  const redD = 0x781818;
  const glass = 0x68a0c8;
  const glassL = 0x88c0d8;
  const paper = 0xf4e8c0;
  const fish = 0xf0d060;
  px(g, 0x6a3028, x - 2, y, w + 4, 8);
  px(g, 0x8a4840, x - 2, y, w + 4, 2);
  furn(g, x, y + 6, w, h - 6, cream, creamL, creamD);
  px(g, redD, x + 4, y + 8, w - 8, 10);
  px(g, red, x + 5, y + 9, w - 10, 8);
  px(g, redL, x + 5, y + 9, w - 10, 2);
  px(g, 0xf8f0e0, x + 10, y + 11, 6, 4);
  px(g, 0xf8f0e0, x + 18, y + 11, 6, 4);
  px(g, 0xf8f0e0, x + 26, y + 11, 6, 4);
  px(g, 0xf8f0e0, x + 34, y + 11, 6, 4);
  px(g, 0xf8f0e0, x + 42, y + 11, 4, 4);
  const gx = doorEast ? x + 6 : x + w - 42;
  px(g, INK, gx - 1, y + 18, 34, 18);
  px(g, glass, gx, y + 19, 32, 16);
  px(g, glassL, gx + 1, y + 20, 8, 5);
  px(g, paper, gx + 4, y + 26, 10, 7);
  px(g, fish, gx + 6, y + 28, 6, 3);
  px(g, paper, gx + 16, y + 26, 10, 7);
  px(g, 0xe8c030, gx + 18, y + 28, 6, 3);
  shopDoor(g, x, y, w, h, doorEast);
  return { x, y, w, h };
}

/** Kebab / curry shop: gold fascia, spit glow in the window. */
export function spiceFront(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  doorEast: boolean,
): Solid {
  const body = 0x6a3028;
  const bodyL = 0x8a4840;
  const bodyD = 0x4a2018;
  const gold = 0xd4a040;
  const goldL = 0xf0c060;
  const goldD = 0xa07020;
  const glass = 0x68a0c8;
  const glassL = 0x88c0d8;
  const meat = 0x8a4030;
  const glow = 0xf07030;
  px(g, 0x3a2018, x - 2, y, w + 4, 8);
  px(g, goldD, x - 2, y, w + 4, 2);
  furn(g, x, y + 6, w, h - 6, body, bodyL, bodyD);
  px(g, goldD, x + 4, y + 8, w - 8, 10);
  px(g, gold, x + 5, y + 9, w - 10, 8);
  px(g, goldL, x + 5, y + 9, w - 10, 2);
  px(g, 0x4a2018, x + 12, y + 11, 8, 4);
  px(g, 0x4a2018, x + 22, y + 11, 8, 4);
  px(g, 0x4a2018, x + 32, y + 11, 8, 4);
  px(g, 0x4a2018, x + 42, y + 11, 6, 4);
  const gx = doorEast ? x + 6 : x + w - 42;
  px(g, INK, gx - 1, y + 18, 34, 18);
  px(g, glass, gx, y + 19, 32, 16);
  px(g, glassL, gx + 1, y + 20, 8, 5);
  px(g, glow, gx + 14, y + 21, 3, 12);
  px(g, meat, gx + 17, y + 22, 8, 11);
  px(g, 0xa05038, gx + 18, y + 24, 6, 7);
  px(g, 0xc04028, gx + 6, y + 24, 3, 8);
  px(g, 0xc04028, gx + 10, y + 26, 3, 6);
  shopDoor(g, x, y, w, h, doorEast);
  return { x, y, w, h };
}
