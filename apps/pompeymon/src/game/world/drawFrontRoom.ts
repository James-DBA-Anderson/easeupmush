import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { sideDoor, wallFrame } from "./drawCommon";

export type Solid = { x: number; y: number; w: number; h: number };

export type FrontRoomLayout = {
  solids: Solid[];
  spawn: { x: number; y: number };
  door: Solid;
  sofa: Solid;
  telly: Solid;
  fire: Solid;
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
  ink: 0x201c18,
  sofa: 0x3a5a48,
  sofaD: 0x2a4434,
  sofaL: 0x5a7a68,
  beige: 0xe0d4c0,
  beigeD: 0xc4b8a4,
  brick: 0xa05038,
};

/** Front room — street window, telly, sofa. */
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

  wallFrame(g, 76, 24, 14, 16, 0x68a0b8, true);
  px(g, 0x88c0d0, 79, 26, 8, 5);
  px(g, 0x3a5a38, 79, 31, 8, 6);
  wallFrame(g, 150, 24, 16, 14, 0xf0e0c8, false);
  px(g, 0xc49068, 154, 27, 3, 4);
  px(g, 0xd4a078, 159, 27, 3, 4);
  px(g, 0x3a5a48, 153, 31, 10, 4);

  g.fillStyle(0x6a2828, 1);
  g.fillEllipse(120, 78, 88, 28);
  px(g, 0x9a4a40, 80, 72, 80, 2);

  const fire: Solid = { x: 48, y: 28, w: 28, h: 36 };
  furn(g, 48, 42, 28, 22, C.brick, 0xc07050, 0x7a3828);
  px(g, C.wood, 50, 28, 24, 16);
  px(g, C.woodLite, 50, 28, 24, 2);
  px(g, 0x1a1010, 54, 48, 16, 12);
  px(g, 0xf0a23a, 58, 52, 8, 5);
  px(g, 0xc45c28, 60, 54, 4, 3);

  const telly: Solid = { x: 152, y: 32, w: 36, h: 38 };
  furn(g, 154, 50, 32, 16, C.wood, C.woodLite, C.woodDark);
  furn(g, 158, 32, 24, 22, C.beige, 0xf0e8d8, C.beigeD);
  px(g, 0x101820, 162, 36, 16, 14);
  px(g, 0x3a88c0, 164, 38, 10, 8);
  px(g, C.woodDark, 160, 62, 4, 6);
  px(g, C.woodDark, 176, 62, 4, 6);

  const table: Solid = { x: 96, y: 70, w: 48, h: 22 };
  furn(g, 96, 70, 48, 16, C.wood, C.woodLite, C.woodDark);
  px(g, C.woodDark, 100, 86, 4, 6);
  px(g, C.woodDark, 136, 86, 4, 6);
  px(g, 0xe8e0d0, 110, 74, 10, 6);

  const sofa: Solid = { x: 72, y: 90, w: 76, h: 30 };
  furn(g, 72, 90, 76, 30, C.sofa, C.sofaL, C.sofaD);
  px(g, C.sofaL, 76, 94, 18, 12);
  px(g, C.sofaL, 126, 94, 18, 12);
  px(g, C.sofaD, 96, 106, 28, 10);

  const door = sideDoor(g, rx, 70, 8, 40);

  const solids: Solid[] = [
    { x: 0, y: 0, w: rx, h: GBA_H },
    { x: rx + rw, y: 0, w: GBA_W - (rx + rw), h: GBA_H },
    { x: rx, y: 0, w: rw, h: ry + 24 },
    { x: rx, y: ry + rh - 12, w: rw, h: 12 },
    { x: 0, y: ry + rh, w: GBA_W, h: GBA_H - (ry + rh) },
    { x: rx, y: ry + 24, w: 8, h: 46 },
    { x: rx, y: 110, w: 8, h: 18 },
    fire,
    telly,
    table,
    sofa,
  ];

  return {
    solids,
    spawn: { x: 64, y: 92 },
    door,
    sofa,
    telly,
    fire,
    window,
  };
}
