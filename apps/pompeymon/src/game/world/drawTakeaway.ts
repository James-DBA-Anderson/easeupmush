import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { furn, px, southDoor, type Solid } from "./drawCommon";

export type TakeawayKind = "chippy" | "spice";

export type TakeawayLayout = {
  solids: Solid[];
  spawn: { x: number; y: number };
  door: Solid;
  counter: Solid;
  rack: Solid;
};

const INK = 0x201c18;
const STEEL = 0x8a9298;
const STEEL_L = 0xc0c8cc;
const STEEL_D = 0x5a6268;
const WOOD = 0xd2a05c;
const WOOD_HI = 0xe8c078;
const WOOD_LO = 0xa07038;

function tiles(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, a: number, b: number): void {
    for (let yy = y; yy < y + h; yy += 8) {
    for (let xx = x; xx < x + w; xx += 8) {
      px(g, ((xx + yy) / 8) % 2 === 0 ? a : b, xx, yy, 8, 8);
    }
  }
}

function fryer(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  furn(g, x, y, 34, 28, STEEL, STEEL_L, STEEL_D);
  px(g, INK, x + 3, y + 4, 28, 10);
  px(g, 0xc07020, x + 4, y + 5, 26, 8);
  px(g, 0xf0c040, x + 6, y + 7, 10, 4);
  px(g, 0xf0c040, x + 18, y + 7, 10, 4);
  px(g, STEEL_L, x + 4, y + 16, 12, 6);
  px(g, STEEL_L, x + 18, y + 16, 12, 6);
  px(g, 0xe8d090, x + 38, y + 6, 10, 8);
  px(g, 0xf4e8c0, x + 39, y + 7, 8, 6);
  px(g, INK, x + 40, y + 8, 6, 1);
}

function spit(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  px(g, STEEL_D, x + 10, y, 4, 32);
  px(g, STEEL_L, x + 11, y, 2, 32);
  px(g, 0xf07030, x + 6, y + 4, 3, 22);
  px(g, 0x8a4030, x + 14, y + 6, 14, 20);
  px(g, 0xa05038, x + 16, y + 8, 10, 16);
  px(g, 0xc06040, x + 18, y + 12, 6, 8);
  px(g, INK, x + 20, y + 4, 2, 4);
  px(g, STEEL, x + 8, y + 28, 20, 4);
  px(g, 0x6a3020, x + 10, y + 29, 16, 2);
}

function curryPans(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  furn(g, x, y, 40, 22, STEEL, STEEL_L, STEEL_D);
  px(g, 0xd4a040, x + 3, y + 4, 10, 8);
  px(g, 0xc04028, x + 15, y + 4, 10, 8);
  px(g, 0x6a8040, x + 27, y + 4, 10, 8);
  px(g, 0xf0c060, x + 5, y + 5, 6, 3);
  px(g, 0xe06038, x + 17, y + 5, 6, 3);
  px(g, INK, x + 4, y + 14, 32, 4);
}

function glassCounter(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, chippy: boolean): void {
  furn(g, x, y, w, h, WOOD, WOOD_HI, WOOD_LO);
  px(g, INK, x + 4, y + 3, w - 8, 12);
  px(g, 0x68a0c8, x + 5, y + 4, w - 10, 10);
  px(g, 0x88c0d8, x + 6, y + 5, 8, 4);
  if (chippy) {
    px(g, 0xf0d060, x + 8, y + 8, 10, 4);
    px(g, 0xf8f0d0, x + 20, y + 8, 8, 4);
    px(g, 0x6a9040, x + 32, y + 8, 8, 4);
    px(g, 0xc8c8c0, x + 8, y + 16, 3, 8);
    px(g, 0xe8e8e0, x + 9, y + 17, 1, 6);
    px(g, 0xc8c8c0, x + 14, y + 16, 3, 8);
  } else {
    px(g, 0xd4a040, x + 8, y + 8, 8, 4);
    px(g, 0xc04028, x + 18, y + 8, 8, 4);
    px(g, 0x8a4030, x + 28, y + 7, 8, 6);
    px(g, 0xc04028, x + 40, y + 10, 3, 8);
    px(g, 0xc04028, x + 44, y + 12, 3, 6);
  }
  px(g, 0x3a3a38, x + w - 16, y + 16, 10, 8);
  px(g, 0xf0c030, x + w - 14, y + 18, 6, 4);
}

export function drawTakeaway(g: Phaser.GameObjects.Graphics, kind: TakeawayKind): TakeawayLayout {
  g.clear();
  const chippy = kind === "chippy";

  px(g, 0x000000, 0, 0, GBA_W, GBA_H);
  const rx = 28;
  const ry = 18;
  const rw = 184;
  const rh = 124;

  if (chippy) {
    tiles(g, rx, ry + 20, rw, rh - 20, 0xe8e0d0, 0xb03028);
    px(g, 0xf4eee4, rx, ry, rw, 20);
    for (let x = rx + 2; x < rx + rw; x += 6) px(g, 0xd8d0c4, x, ry + 2, 1, 16);
    for (let y = ry + 4; y < ry + 20; y += 6) px(g, 0xd8d0c4, rx, y, rw, 1);
  } else {
    px(g, 0x8a6840, rx, ry + 20, rw, rh - 20);
    for (let y = ry + 22; y < ry + rh; y += 6) px(g, 0x6a5030, rx, y, rw, 1);
    px(g, 0xa04028, rx, ry, rw, 20);
    for (let x = rx; x < rx + rw; x += 10) px(g, 0xc06030, x, ry, 4, 20);
  }
  px(g, 0x5a5040, rx, ry + 20, rw, 3);

  px(g, INK, 88, 22, 64, 14);
  px(g, chippy ? 0xb03028 : 0xd4a040, 89, 23, 62, 12);
  px(g, 0xf8f0e0, 94, 26, 8, 6);
  px(g, 0xf8f0e0, 106, 26, 8, 6);
  px(g, 0xf8f0e0, 118, 26, 8, 6);
  px(g, 0xf8f0e0, 130, 26, 8, 6);
  px(g, 0xf8f0e0, 142, 26, 6, 6);

  const rack: Solid = { x: 40, y: 44, w: 72, h: 36 };
  if (chippy) fryer(g, 40, 46);
  else {
    spit(g, 40, 42);
    curryPans(g, 72, 50);
  }

  const counter: Solid = { x: 128, y: 48, w: 60, h: 32 };
  glassCounter(g, 128, 48, 60, 30, chippy);

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
  ];
  return { solids, spawn: { x: 120, y: 100 }, door, counter, rack };
}
