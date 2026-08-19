import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { furn, px, type Solid } from "./drawCommon";

export type HillLayout = {
  solids: Solid[];
  spawn: { x: number; y: number };
  view: Solid;
  van: Solid;
};

const C = {
  grass: 0x4a7c38,
  grassD: 0x3a642c,
  grassL: 0x5a9444,
  chalk: 0xe0d8c4,
  chalkD: 0xc8c0a8,
  path: 0xa89068,
  pathD: 0x8a7048,
  ink: 0x201c18,
  sky: 0x68a0c8,
  sea: 0x3a78a8,
  cream: 0xe8dcc4,
  creamHi: 0xf4eee0,
  creamLo: 0xc8b89c,
  rust: 0xa84838,
  rustHi: 0xc86850,
  steel: 0x6a6a72,
  wood: 0xd2a05c,
};

function burgerVan(g: Phaser.GameObjects.Graphics, x: number, y: number): Solid {
  const w = 50;
  const h = 36;
  px(g, 0x5a5040, x - 2, y + 28, w + 4, 8);
  px(g, C.ink, x + 6, y + 30, 8, 6);
  px(g, C.steel, x + 8, y + 31, 4, 4);
  px(g, C.ink, x + 34, y + 30, 8, 6);
  px(g, C.steel, x + 36, y + 31, 4, 4);

  furn(g, x, y, w, 32, C.cream, C.creamHi, C.creamLo);
  px(g, C.rust, x, y, w, 6);
  px(g, C.rustHi, x, y, w, 2);
  for (let xx = x + 2; xx < x + w; xx += 6) px(g, 0xf0e8d0, xx, y + 2, 3, 3);

  px(g, C.ink, x + 2, y + 10, 16, 14);
  px(g, C.steel, x + 3, y + 11, 14, 12);
  px(g, C.wood, x + 2, y + 22, 16, 3);
  px(g, 0xf0e8d0, x + 22, y + 12, 22, 6);
  px(g, C.ink, x + 24, y + 13, 18, 4);
  px(g, 0x68a0c8, x + 36, y + 20, 10, 8);
  px(g, 0x88c0d8, x + 37, y + 21, 4, 3);
  px(g, C.ink, x + w, y + 18, 4, 3);
  return { x, y, w, h };
}

/** Portsdown Hill — lookout over the island. */
export function drawHill(g: Phaser.GameObjects.Graphics): HillLayout {
  g.clear();
  px(g, C.sky, 0, 0, GBA_W, 28);
  px(g, C.sea, 40, 22, 160, 8);
  px(g, 0x4a6a50, 70, 24, 40, 4);
  px(g, C.chalk, 0, 28, GBA_W, 36);
  for (let y = 28; y < 64; y += 6) px(g, C.chalkD, 0, y, GBA_W, 1);
  px(g, C.grass, 0, 56, GBA_W, GBA_H - 56);
  for (let y = 60; y < GBA_H; y += 8) {
    for (let x = (y / 8) % 2 === 0 ? 0 : 4; x < GBA_W; x += 8) px(g, C.grassD, x, y, 2, 1);
  }

  px(g, C.path, 108, 64, 24, 96);
  px(g, C.pathD, 108, 64, 24, 1);
  for (let y = 72; y < 150; y += 10) px(g, C.pathD, 118, y, 4, 4);

  px(g, 0x8a7048, 40, 52, 160, 6);
  px(g, C.ink, 42, 54, 156, 2);
  const view: Solid = { x: 40, y: 40, w: 160, h: 20 };

  px(g, 0x7a7060, 140, 64, 64, 36);
  px(g, C.pathD, 140, 64, 64, 1);
  const van = burgerVan(g, 156, 60);

  const solids: Solid[] = [
    { x: 0, y: 0, w: GBA_W, h: 52 },
    { x: 0, y: 56, w: 100, h: 104 },
    van,
    { x: 208, y: 56, w: 32, h: 48 },
    { x: 140, y: 100, w: 100, h: 60 },
  ];

  return {
    solids,
    spawn: { x: 120, y: 140 },
    view,
    van,
  };
}
