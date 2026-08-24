import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { sideDoor, wallFrame } from "./drawCommon";

export type Solid = { x: number; y: number; w: number; h: number };

export type FrontRoomLayout = {
  solids: Solid[];
  spawn: { x: number; y: number };
  door: Solid;
  sofa: Solid;
  dad: Solid;
  telly: Solid;
  table: Solid;
  window: Solid;
};

function px(
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

function furn(
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

/** Soft can / bottle / crisp pack clutter on the carpet. */
function floorMess(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  px(g, 0xc45c28, x, y, 4, 5);
  px(g, 0xe8d8b0, x, y, 4, 1);
  px(g, 0xc45c28, x + 10, y + 4, 4, 5);
  px(g, 0xe8d8b0, x + 10, y + 4, 4, 1);
  px(g, 0xa84820, x + 22, y + 2, 4, 5);
  px(g, 0xe8d8b0, x + 22, y + 2, 4, 1);
  px(g, 0x2a6848, x + 36, y + 6, 10, 3);
  px(g, 0x48a070, x + 45, y + 6, 3, 3);
  px(g, 0xe8e0d0, x + 36, y + 6, 2, 3);
  px(g, 0xe8d0a0, x + 6, y + 12, 14, 8);
  px(g, 0xd0b070, x + 6, y + 12, 14, 1);
  px(g, 0xc45c28, x + 9, y + 15, 4, 3);
  px(g, 0xf0e060, x + 14, y + 15, 3, 3);
  px(g, 0xe0a028, x + 28, y + 14, 9, 6);
  px(g, 0xf0c848, x + 28, y + 14, 9, 1);
  px(g, 0xc03028, x + 31, y + 16, 3, 2);
  px(g, 0xf0c848, x + 40, y + 14, 2, 2);
  px(g, 0xf0c848, x + 44, y + 16, 2, 1);
  px(g, 0xb84828, x - 8, y + 8, 5, 3);
  px(g, 0xe8d8b0, x - 8, y + 8, 1, 3);
}

const C = {
  void: 0x000000,
  carpet: 0x8a3a38,
  carpetD: 0x6a2828,
  paper: 0xe8dcc8,
  paperStripe: 0xd8ccb4,
  wallDark: 0xb8a888,
  skirting: 0x7a6248,
  wood: 0xd2a05c,
  woodDark: 0xa07038,
  woodLite: 0xe8c078,
  sofa: 0x3a5a48,
  sofaD: 0x2a4434,
  sofaL: 0x5a7a68,
  sofaSeat: 0x4a6a58,
  beige: 0xe0d4c0,
  beigeD: 0xc4b8a4,
};

/** Front room — sofa under the window, walk gap to the coffee table, CRT lower on the east wall. */
export function drawFrontRoom(g: Phaser.GameObjects.Graphics): FrontRoomLayout {
  g.clear();
  px(g, C.void, 0, 0, GBA_W, GBA_H);

  const rx = 40;
  const ry = 22;
  const rw = 160;
  const rh = 118;

  px(g, C.carpet, rx, ry + 24, rw, rh - 24);
  for (let y = ry + 28; y < ry + rh; y += 12) px(g, C.carpetD, rx, y, rw, 1);

  px(g, C.paper, rx, ry, rw, 24);
  for (let x = rx; x < rx + rw; x += 8) px(g, C.paperStripe, x, ry, 3, 24);
  px(g, C.wallDark, rx, ry + 22, rw, 2);
  px(g, C.skirting, rx, ry + 24, rw, 2);
  px(g, C.paper, rx, ry, 8, rh);
  px(g, C.paper, rx + rw - 8, ry, 8, rh);
  px(g, C.paper, rx, ry + rh - 12, rw, 12);
  px(g, C.skirting, rx + 8, ry + rh - 14, rw - 16, 2);

  const window: Solid = { x: 92, y: 8, w: 56, h: 28 };
  px(g, 0x4a88b0, 96, 10, 48, 22);
  px(g, 0x78b4d0, 96, 10, 48, 10);
  px(g, 0x5a6a50, 96, 26, 48, 6);
  px(g, C.wood, 94, 8, 52, 3);
  px(g, C.wood, 94, 30, 52, 3);
  px(g, C.woodDark, 118, 10, 2, 20);

  wallFrame(g, 58, 24, 14, 16, 0x68a0b8, true);
  px(g, 0x88c0d0, 61, 26, 8, 5);
  px(g, 0x3a5a38, 61, 31, 8, 6);
  wallFrame(g, 168, 24, 16, 14, 0xf0e0c8, false);
  px(g, 0xc49068, 172, 27, 3, 4);
  px(g, 0xd4a078, 177, 27, 3, 4);
  px(g, 0x3a5a48, 171, 31, 10, 4);

  // Rug under sofa / mess
  g.fillStyle(0x6a2828, 1);
  g.fillEllipse(120, 68, 100, 40);
  px(g, 0x9a4a40, 74, 58, 92, 2);

  // Sofa under the window (where the fire was) — back to the north wall
  const sofa: Solid = { x: 72, y: 46, w: 96, h: 34 };
  px(g, 0x5a2020, 74, 74, 92, 4);
  // Backrest against the wall
  furn(g, 76, 46, 88, 12, C.sofa, C.sofaL, C.sofaD);
  px(g, C.sofaL, 80, 48, 24, 7);
  px(g, C.sofaL, 136, 48, 24, 7);
  px(g, C.sofaD, 108, 50, 32, 6);
  // Seat cushion
  furn(g, 72, 56, 96, 20, C.sofaSeat, C.sofaL, C.sofaD);
  px(g, C.sofaL, 78, 58, 34, 12);
  px(g, C.sofaL, 120, 58, 34, 12);
  px(g, C.sofaD, 112, 60, 6, 12);
  // Arms
  furn(g, 72, 50, 12, 24, C.sofa, C.sofaL, C.sofaD);
  furn(g, 156, 50, 12, 24, C.sofa, C.sofaL, C.sofaD);
  px(g, C.sofaD, 76, 74, 88, 3);
  px(g, C.woodDark, 80, 76, 4, 4);
  px(g, C.woodDark, 156, 76, 4, 4);

  // Dad examine hitbox on the seat
  const dad: Solid = { x: 88, y: 52, w: 64, h: 24 };

  // Drinks and food around the sofa (not blocking the walk gap south of it)
  floorMess(g, 54, 70);
  floorMess(g, 148, 68);
  // Extra cans by the arms
  px(g, 0xc45c28, 84, 78, 4, 5);
  px(g, 0xe8d8b0, 84, 78, 4, 1);
  px(g, 0xa84820, 160, 76, 4, 5);
  px(g, 0xe8d8b0, 160, 76, 4, 1);
  px(g, 0x2a6848, 168, 82, 8, 3);
  px(g, 0xe8d0a0, 62, 88, 12, 7);
  px(g, 0xc45c28, 66, 90, 3, 3);

  // Walk gap ~ y 80–96 between sofa front and coffee table

  // Coffee table further south so you can walk between
  const table: Solid = { x: 106, y: 98, w: 32, h: 18 };
  furn(g, 106, 98, 32, 14, C.wood, C.woodLite, C.woodDark);
  px(g, C.woodDark, 110, 112, 3, 4);
  px(g, C.woodDark, 130, 112, 3, 4);
  px(g, 0xe8e0d0, 116, 101, 10, 6);
  px(g, 0xc45c28, 128, 102, 3, 4);

  // CRT lower on the east wall
  const telly: Solid = { x: 168, y: 72, w: 28, h: 40 };
  furn(g, 170, 88, 24, 14, C.wood, C.woodLite, C.woodDark);
  furn(g, 172, 72, 20, 20, C.beige, 0xf0e8d8, C.beigeD);
  px(g, 0x101820, 175, 76, 14, 12);
  px(g, 0x3a88c0, 177, 78, 8, 7);
  px(g, C.woodDark, 174, 98, 3, 5);
  px(g, C.woodDark, 186, 98, 3, 5);

  const door = sideDoor(g, rx, 70, 8, 40);

  const solids: Solid[] = [
    { x: 0, y: 0, w: rx, h: GBA_H },
    { x: rx + rw, y: 0, w: GBA_W - (rx + rw), h: GBA_H },
    { x: rx, y: 0, w: rw, h: ry + 24 },
    { x: rx, y: ry + rh - 12, w: rw, h: 12 },
    { x: 0, y: ry + rh, w: GBA_W, h: GBA_H - (ry + rh) },
    { x: rx, y: ry + 24, w: 8, h: 46 },
    { x: rx, y: 110, w: 8, h: 18 },
    telly,
    table,
    sofa,
  ];

  return {
    solids,
    spawn: { x: 64, y: 100 },
    door,
    sofa,
    dad,
    telly,
    table,
    window,
  };
}
