import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { furn, miniBike, px, southDoor, type Solid } from "./drawCommon";

export type BikeShopLayout = {
  solids: Solid[];
  spawn: { x: number; y: number };
  door: Solid;
  counter: Solid;
  rack: Solid;
};

const C = {
  void: 0x000000,
  floor: 0x6a6860,
  floorD: 0x5a5850,
  tape: 0xe8c030,
  wall: 0xc8b898,
  stripe: 0xb8a888,
  skirting: 0x5a5040,
  wood: 0xd2a05c,
  woodHi: 0xe8c078,
  woodLo: 0xa07038,
  steel: 0x8a9298,
  steelL: 0xb0b8bc,
  steelD: 0x5a6268,
  ink: 0x201c18,
  yellow: 0xe8c030,
  yellowL: 0xf8e070,
  yellowD: 0xb89018,
  navy: 0x2a3a68,
  red: 0xb04030,
  helmet: 0x3a90d0,
};

function pegboard(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  px(g, 0xa09070, x, y, w, h);
  px(g, 0xc8b898, x, y, w, 1);
  for (let yy = y + 3; yy < y + h - 2; yy += 4) {
    for (let xx = x + 3; xx < x + w - 2; xx += 4) px(g, 0x5a5040, xx, yy, 1, 1);
  }
}

function helmet(g: Phaser.GameObjects.Graphics, x: number, y: number, col: number): void {
  px(g, col, x, y, 8, 5);
  px(g, C.ink, x + 1, y + 1, 6, 2);
  px(g, 0xf0f4f8, x + 2, y + 4, 4, 1);
}

export function drawBikeShop(g: Phaser.GameObjects.Graphics): BikeShopLayout {
  g.clear();
  px(g, C.void, 0, 0, GBA_W, GBA_H);

  const rx = 28;
  const ry = 18;
  const rw = 184;
  const rh = 124;

  px(g, C.floor, rx, ry + 20, rw, rh - 20);
  for (let y = ry + 22; y < ry + rh; y += 6) px(g, C.floorD, rx, y, rw, 1);
  px(g, C.tape, rx + 8, ry + rh - 22, rw - 16, 2);

  px(g, C.wall, rx, ry, rw, 20);
  for (let x = rx; x < rx + rw; x += 8) px(g, C.stripe, x, ry, 3, 20);
  px(g, C.skirting, rx, ry + 20, rw, 3);

  px(g, C.yellowD, 96, 20, 56, 12);
  px(g, C.yellow, 97, 21, 54, 10);
  px(g, C.yellowL, 97, 21, 54, 2);
  px(g, C.navy, 104, 24, 8, 5);
  px(g, C.navy, 114, 24, 8, 5);
  px(g, C.navy, 124, 24, 8, 5);
  px(g, C.navy, 134, 24, 8, 5);

  pegboard(g, 38, 22, 52, 16);
  helmet(g, 42, 26, C.helmet);
  helmet(g, 54, 26, C.red);
  helmet(g, 66, 26, C.yellow);
  px(g, C.yellow, 78, 28, 6, 6);
  px(g, C.ink, 80, 30, 2, 2);

  miniBike(g, 40, 40);
  miniBike(g, 58, 40);
  miniBike(g, 76, 40);

  const rack: Solid = { x: 40, y: 52, w: 72, h: 28 };
  furn(g, 40, 58, 72, 18, C.steel, C.steelL, C.steelD);
  px(g, C.ink, 42, 60, 68, 2);
  miniBike(g, 44, 50);
  miniBike(g, 64, 50);
  miniBike(g, 84, 50);

  furn(g, 44, 88, 16, 20, C.steel, C.steelL, C.steelD);
  px(g, C.ink, 48, 80, 8, 10);
  px(g, C.steelL, 50, 82, 4, 6);

  const counter: Solid = { x: 132, y: 48, w: 56, h: 32 };
  furn(g, 132, 48, 56, 30, C.wood, C.woodHi, C.woodLo);
  px(g, C.ink, 140, 52, 28, 8);
  px(g, C.yellow, 172, 54, 10, 8);
  px(g, C.navy, 174, 56, 6, 4);
  px(g, C.steel, 140, 64, 12, 6);
  px(g, C.steelL, 144, 65, 4, 2);

  const southY = ry + rh - 16;
  const door = southDoor(g, 104, southY, 32, GBA_H - southY);

  const solids: Solid[] = [
    { x: 0, y: 0, w: rx, h: GBA_H },
    { x: rx + rw, y: 0, w: GBA_W - (rx + rw), h: GBA_H },
    { x: rx, y: 0, w: rw, h: ry + 22 },
    { x: rx, y: ry, w: 8, h: rh },
    { x: rx + rw - 8, y: ry, w: 8, h: rh },
    { x: rx, y: southY, w: 76, h: 16 },
    { x: 136, y: southY, w: rx + rw - 136, h: 16 },
    { x: 0, y: ry + rh, w: GBA_W, h: GBA_H - (ry + rh) },
    rack,
    counter,
    { x: 44, y: 88, w: 16, h: 20 },
  ];

  return {
    solids,
    spawn: { x: 120, y: 100 },
    door,
    counter,
    rack,
  };
}
