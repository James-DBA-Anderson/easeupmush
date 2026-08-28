import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { furn, px, southDoor, type Solid } from "./drawCommon";

export type CentreLayout = {
  solids: Solid[];
  spawn: { x: number; y: number };
  door: Solid;
  counter: Solid;
  bed: Solid;
  plant: Solid;
};

const C = {
  void: 0x000000,
  floor: 0xd8d0c0,
  floorD: 0xc0b8a8,
  wall: 0xe8e4d8,
  stripe: 0xd0ccc0,
  skirting: 0x9a9080,
  ink: 0x201c18,
  red: 0xc03828,
  redL: 0xe05848,
  white: 0xf8f4ec,
  steel: 0x9aa2a8,
  steelL: 0xc0c8cc,
  steelD: 0x6a7278,
  wood: 0xd2a05c,
  woodHi: 0xe8c078,
  woodLo: 0xa07038,
  green: 0x3a7a44,
  greenL: 0x5aa060,
  pot: 0xa05838,
  sheet: 0xe8eef4,
  glow: 0x88d0f0,
};

/** Machine the mons go in — pads, lights, the lot. */
function healer(g: Phaser.GameObjects.Graphics, x: number, y: number): Solid {
  furn(g, x, y, 56, 22, C.steel, C.steelL, C.steelD);
  px(g, C.white, x + 4, y + 4, 48, 12);
  for (let i = 0; i < 3; i += 1) {
    const bx = x + 8 + i * 16;
    px(g, C.sheet, bx, y + 6, 10, 8);
    px(g, C.glow, bx + 2, y + 8, 6, 4);
  }
  px(g, C.redL, x + 24, y - 6, 8, 6);
  px(g, C.red, x + 26, y - 4, 4, 2);
  return { x, y: y - 6, w: 56, h: 28 };
}

function plantPot(g: Phaser.GameObjects.Graphics, x: number, y: number): Solid {
  px(g, C.pot, x + 2, y + 12, 12, 10);
  px(g, 0xc07048, x + 3, y + 13, 10, 2);
  px(g, C.green, x + 1, y, 14, 14);
  px(g, C.greenL, x + 3, y + 2, 4, 4);
  px(g, C.greenL, x + 9, y + 6, 3, 3);
  return { x, y, w: 16, h: 22 };
}

export function drawCentre(g: Phaser.GameObjects.Graphics): CentreLayout {
  g.clear();
  px(g, C.void, 0, 0, GBA_W, GBA_H);

  const rx = 24;
  const ry = 16;
  const rw = 192;
  const rh = 128;

  px(g, C.floor, rx, ry + 20, rw, rh - 20);
  for (let y = ry + 24; y < ry + rh; y += 8) px(g, C.floorD, rx, y, rw, 1);

  px(g, C.wall, rx, ry, rw, 20);
  for (let x = rx; x < rx + rw; x += 10) px(g, C.stripe, x, ry, 2, 20);
  px(g, C.skirting, rx, ry + 20, rw, 3);

  // Cross board on the back wall.
  px(g, C.ink, 100, 20, 40, 14);
  px(g, C.white, 101, 21, 38, 12);
  px(g, C.red, 117, 22, 6, 10);
  px(g, C.red, 113, 25, 14, 4);

  const counter: Solid = { x: 84, y: 52, w: 72, h: 26 };
  furn(g, 84, 52, 72, 24, C.wood, C.woodHi, C.woodLo);
  px(g, C.white, 92, 56, 20, 10);
  px(g, C.ink, 94, 58, 16, 2);
  px(g, C.steel, 132, 58, 14, 8);
  px(g, C.steelL, 134, 59, 5, 3);

  const bed = healer(g, 148, 26);

  furn(g, 36, 96, 28, 16, C.steel, C.steelL, C.steelD);
  px(g, C.sheet, 38, 92, 24, 6);
  furn(g, 36, 118, 28, 16, C.steel, C.steelL, C.steelD);
  px(g, C.sheet, 38, 114, 24, 6);

  const plant = plantPot(g, 190, 104);

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
    counter,
    bed,
    plant,
    { x: 36, y: 92, w: 28, h: 20 },
    { x: 36, y: 114, w: 28, h: 20 },
  ];

  return {
    solids,
    spawn: { x: 120, y: 108 },
    door,
    counter,
    bed,
    plant,
  };
}
