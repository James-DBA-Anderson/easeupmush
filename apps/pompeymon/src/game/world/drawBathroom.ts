import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { southDoor } from "./drawCommon";

export type Solid = { x: number; y: number; w: number; h: number };

export type BathroomLayout = {
  solids: Solid[];
  spawn: { x: number; y: number };
  door: Solid;
  bath: Solid;
  loo: Solid;
  sink: Solid;
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

  const window: Solid = { x: 36, y: 6, w: 44, h: 28 };
  px(g, C.woodDark, window.x, window.y, window.w, window.h);
  px(g, C.wood, window.x + 1, window.y + 1, window.w - 2, window.h - 2);
  px(g, C.woodLite, window.x + 1, window.y + 1, window.w - 2, 1);
  px(g, 0xb8d0d8, 40, 10, 36, 20);
  px(g, 0xd0e4e8, 40, 10, 36, 8);
  px(g, C.wood, 56, 10, 2, 20);
  px(g, C.wood, 40, 18, 36, 2);
  px(g, C.chrome, 74, 20, 3, 4);

  px(g, C.paper, 0, 0, 20, GBA_H);
  px(g, C.paper, 220, 0, 20, GBA_H);
  px(g, C.paper, 0, 136, GBA_W, GBA_H - 136);
  px(g, C.skirting, 20, 136, 200, 2);
  px(g, C.wallDark, 18, 42, 2, 94);
  px(g, C.wallDark, 220, 42, 2, 94);

  const door = southDoor(g, 104, 136, 32, GBA_H - 136);

  const bath: Solid = { x: 24, y: 46, w: 72, h: 36 };
  furn(g, bath.x, bath.y, bath.w, bath.h, C.white, C.whiteL, C.whiteD);
  px(g, C.water, 30, 52, 60, 22);
  px(g, C.chrome, 86, 48, 6, 4);
  px(g, C.ink, 88, 49, 2, 2);

  const loo: Solid = { x: 186, y: 46, w: 28, h: 32 };
  furn(g, 190, 46, 20, 12, C.white, C.whiteL, C.whiteD);
  furn(g, 186, 56, 28, 22, C.white, C.whiteL, C.whiteD);
  px(g, C.whiteD, 194, 64, 12, 10);

  const sink: Solid = { x: 100, y: 46, w: 36, h: 28 };
  furn(g, 104, 58, 28, 16, C.wood, C.woodLite, C.woodDark);
  furn(g, 100, 46, 36, 16, C.white, C.whiteL, C.whiteD);
  px(g, C.water, 110, 50, 16, 8);
  px(g, C.chrome, 116, 46, 4, 5);
  px(g, C.white, 128, 42, 6, 8);
  px(g, C.whiteD, 128, 42, 6, 2);
  px(g, 0xf4ece0, 130, 36, 2, 8);
  px(g, 0x3a88c0, 129, 34, 4, 3);

  g.fillStyle(C.mat, 1);
  g.fillEllipse(120, 100, 36, 16);

  const solids: Solid[] = [
    { x: 0, y: 0, w: 20, h: GBA_H },
    { x: 220, y: 0, w: 20, h: GBA_H },
    { x: 0, y: 0, w: GBA_W, h: 44 },
    { x: 0, y: 136, w: door.x, h: GBA_H - 136 },
    { x: door.x + door.w, y: 136, w: GBA_W - (door.x + door.w), h: GBA_H - 136 },
    bath,
    loo,
    sink,
  ];

  return {
    solids,
    spawn: { x: 120, y: 108 },
    door,
    bath,
    loo,
    sink,
    window,
  };
}
