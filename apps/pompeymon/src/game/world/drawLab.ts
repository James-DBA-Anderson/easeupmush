import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { furn, px, southDoor, type Solid } from "./drawCommon";
import { run } from "../run";

export type LabLayout = {
  solids: Solid[];
  spawn: { x: number; y: number };
  door: Solid;
  choke: Solid;
  table: Solid;
  bin: Solid;
  desk: Solid;
  shelves: Solid;
  chomp: Solid;
};

const C = {
  void: 0x000000,
  tile: 0xc8d0d4,
  tileD: 0xb0b8bc,
  paper: 0xe8e4dc,
  paperStripe: 0xd8d4cc,
  wallDark: 0x8a9098,
  skirting: 0x5a6068,
  navy: 0x2a3a68,
  navyL: 0x4a5a88,
  wood: 0xd2a05c,
  woodHi: 0xe8c078,
  woodLo: 0xa07038,
  cream: 0xe8e0d0,
  ink: 0x201c18,
  steel: 0x8a9298,
  steelHi: 0xb0b8bc,
  steelLo: 0x5a6268,
  bin: 0x4a4a50,
};

/** Professor Choke's lab — table of three, bin in the corner. */
export function drawLab(g: Phaser.GameObjects.Graphics): LabLayout {
  g.clear();
  px(g, C.void, 0, 0, GBA_W, GBA_H);

  const rx = 24;
  const ry = 16;
  const rw = 192;
  const rh = 128;

  px(g, C.tile, rx, ry + 22, rw, rh - 22);
  for (let y = ry + 24; y < ry + rh; y += 8) {
    for (let x = rx; x < rx + rw; x += 8) {
      if (((x + y) / 8) % 2 === 0) px(g, C.tileD, x, y, 8, 8);
    }
  }

  px(g, C.paper, rx, ry, rw, 22);
  for (let x = rx; x < rx + rw; x += 8) px(g, C.paperStripe, x, ry, 3, 22);
  px(g, C.navy, rx, ry + 18, rw, 4);
  px(g, C.wallDark, rx, ry + 22, rw, 2);
  px(g, C.skirting, rx, ry + 22, rw, 3);

  const desk: Solid = { x: 32, y: 40, w: 44, h: 28 };
  furn(g, 32, 40, 44, 26, C.steel, C.steelHi, C.steelLo);
  px(g, 0x68a0c8, 38, 46, 18, 12);
  px(g, 0x88c0d8, 40, 48, 6, 4);
  px(g, C.ink, 60, 48, 10, 8);

  const table: Solid = { x: 92, y: 52, w: 64, h: 28 };
  furn(g, 92, 52, 64, 26, C.wood, C.woodHi, C.woodLo);

  const shelves: Solid = { x: 168, y: 40, w: 40, h: 36 };
  px(g, C.navy, shelves.x, shelves.y, shelves.w, shelves.h);
  px(g, C.navyL, shelves.x, shelves.y, shelves.w, 3);
  px(g, C.cream, 174, 48, 12, 10);
  px(g, C.cream, 190, 48, 12, 10);
  px(g, C.ink, 176, 50, 8, 6);

  const chomp: Solid = { x: 178, y: 68, w: 12, h: 6 };
  if (!run.items.includes("chomp")) {
    px(g, 0xe8c040, chomp.x, chomp.y, chomp.w, 5);
    px(g, 0xf0d878, chomp.x + 1, chomp.y + 1, chomp.w - 2, 2);
    px(g, 0x6a3a18, chomp.x, chomp.y, 2, 5);
    px(g, 0x6a3a18, chomp.x + chomp.w - 2, chomp.y, 2, 5);
  }

  const bin: Solid = { x: 36, y: 108, w: 16, h: 18 };
  furn(g, 36, 108, 16, 16, C.bin, C.steelHi, C.ink);
  px(g, C.ink, 40, 112, 8, 6);
  if (run.refusedStarters && !run.starter) {
    px(g, 0x6a5434, 40, 114, 8, 4);
  }

  const choke: Solid = { x: 112, y: 36, w: 16, h: 22 };

  const southY = ry + rh - 16;
  const door = southDoor(g, 104, southY, 32, GBA_H - southY);

  const solids: Solid[] = [
    { x: 0, y: 0, w: rx, h: GBA_H },
    { x: rx + rw, y: 0, w: GBA_W - (rx + rw), h: GBA_H },
    { x: rx, y: 0, w: rw, h: ry + 24 },
    { x: rx, y: southY, w: 80, h: 16 },
    { x: 136, y: southY, w: rx + rw - 136, h: 16 },
    { x: 0, y: ry + rh, w: GBA_W, h: GBA_H - (ry + rh) },
    desk,
    table,
    bin,
    choke,
    shelves,
  ];

  return {
    solids,
    spawn: { x: 120, y: 118 },
    door,
    choke,
    table,
    bin,
    desk,
    shelves,
    chomp,
  };
}
