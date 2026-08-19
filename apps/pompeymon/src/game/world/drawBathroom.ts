import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";

export type Solid = { x: number; y: number; w: number; h: number };

export type BathroomLayout = {
  solids: Solid[];
  spawn: { x: number; y: number };
  door: Solid;
  bath: Solid;
  loo: Solid;
  sink: Solid;
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
  tile: 0xe8e0d4,
  tileLine: 0xd4ccc0,
  paper: 0xd8e0e4,
  paperStripe: 0xc8d0d4,
  wallDark: 0xa8b0b4,
  skirting: 0x7a8488,
  wood: 0xd2a05c,
  woodDark: 0xa07038,
  woodLite: 0xe8c078,
  white: 0xf4f0e8,
  whiteD: 0xd0ccc4,
  whiteL: 0xffffff,
  ink: 0x201c18,
  water: 0x68a8c8,
  chrome: 0xa8b0b8,
  mat: 0x4a6a88,
};

/** Upstairs bathroom — Cosham house. */
export function drawBathroom(g: Phaser.GameObjects.Graphics): BathroomLayout {
  g.clear();

  px(g, C.tile, 0, 0, GBA_W, GBA_H);
  for (let y = 44; y < 144; y += 8) {
    px(g, C.tileLine, 20, y, 200, 1);
    for (let x = 20; x < 220; x += 8) px(g, C.tileLine, x, 44, 1, 100);
  }

  px(g, C.paper, 0, 0, GBA_W, 42);
  for (let x = 0; x < GBA_W; x += 8) px(g, C.paperStripe, x, 0, 3, 42);
  px(g, C.wallDark, 0, 40, GBA_W, 2);
  px(g, C.skirting, 0, 42, GBA_W, 3);

  px(g, C.paper, 0, 0, 20, GBA_H);
  px(g, C.paper, 220, 0, 20, GBA_H);
  px(g, C.paper, 0, 144, GBA_W, 16);
  px(g, C.skirting, 20, 142, 200, 2);
  px(g, C.wallDark, 18, 42, 2, 100);
  px(g, C.wallDark, 220, 42, 2, 100);

  const door: Solid = { x: 104, y: 126, w: 32, h: 18 };
  furn(g, door.x, door.y, door.w, door.h, C.wood, C.woodLite, C.woodDark);
  px(g, C.ink, 118, 136, 3, 3);

  const bath: Solid = { x: 24, y: 46, w: 72, h: 36 };
  furn(g, bath.x, bath.y, bath.w, bath.h, C.white, C.whiteL, C.whiteD);
  px(g, C.water, 30, 52, 60, 22);
  px(g, C.chrome, 86, 48, 6, 4);
  px(g, C.ink, 88, 49, 2, 2);

  const loo: Solid = { x: 176, y: 70, w: 28, h: 36 };
  furn(g, 180, 70, 20, 14, C.white, C.whiteL, C.whiteD);
  furn(g, 176, 82, 28, 24, C.white, C.whiteL, C.whiteD);
  px(g, C.whiteD, 184, 90, 12, 10);

  const sink: Solid = { x: 100, y: 46, w: 36, h: 28 };
  furn(g, 104, 58, 28, 16, C.wood, C.woodLite, C.woodDark);
  furn(g, 100, 46, 36, 16, C.white, C.whiteL, C.whiteD);
  px(g, C.water, 110, 50, 16, 8);
  px(g, C.chrome, 116, 46, 4, 5);

  g.fillStyle(C.mat, 1);
  g.fillEllipse(120, 100, 36, 16);

  const solids: Solid[] = [
    { x: 0, y: 0, w: 20, h: GBA_H },
    { x: 220, y: 0, w: 20, h: GBA_H },
    { x: 0, y: 0, w: GBA_W, h: 44 },
    { x: 0, y: 144, w: GBA_W, h: 16 },
    bath,
    loo,
    sink,
  ];

  return {
    solids,
    spawn: { x: 120, y: 112 },
    door,
    bath,
    loo,
    sink,
  };
}
