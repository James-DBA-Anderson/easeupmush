import Phaser from "phaser";
import { GBA_W } from "../constants";
import { furn, px, southDoor, type Solid } from "./drawCommon";

export const SCHOOL_IN_H = 320;

export type SchoolInSpot = { at: Solid; line: string };

export type SchoolInLayout = {
  mapH: number;
  solids: Solid[];
  spots: SchoolInSpot[];
  door: Solid;
  trophy: Solid;
  spawnFromField: { x: number; y: number };
};

const C = {
  void: 0x000000,
  lino: 0xc8b090,
  linoD: 0xb09878,
  wood: 0xd2a05c,
  woodHi: 0xe8c078,
  woodLo: 0xa07038,
  board: 0xc8a060,
  boardD: 0xa88848,
  paper: 0xe8dcc8,
  paperStripe: 0xd8ccb4,
  wallDark: 0xb8a888,
  skirting: 0x7a6248,
  brick: 0xb06048,
  cream: 0xe8e0d0,
  ink: 0x201c18,
  steel: 0x8a8a90,
  hall: 0x3a5a48,
};

function hallWall(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  px(g, C.paper, x, y, w, h);
  for (let xx = x; xx < x + w; xx += 8) px(g, C.paperStripe, xx, y, 3, Math.min(22, h));
}

/** Boys' school interior — corridor north into the gym. */
export function drawSchoolIn(g: Phaser.GameObjects.Graphics): SchoolInLayout {
  const mapH = SCHOOL_IN_H;
  g.clear();
  px(g, C.void, 0, 0, GBA_W, mapH);

  const rx = 16;
  const ry = 8;
  const rw = 208;
  const rh = mapH - 16;

  // Gym boards (north)
  px(g, C.board, rx, ry + 22, rw, 86);
  for (let y = ry + 24; y < ry + 108; y += 6) px(g, C.boardD, rx, y, rw, 1);

  // Corridor / canteen lino
  px(g, C.lino, rx, ry + 108, rw, rh - 108);
  for (let y = ry + 112; y < ry + rh; y += 10) px(g, C.linoD, rx, y, rw, 1);

  hallWall(g, rx, ry, rw, 24);
  px(g, C.wallDark, rx, ry + 22, rw, 2);
  px(g, C.skirting, rx, ry + 24, rw, 2);
  hallWall(g, rx, ry, 8, rh);
  hallWall(g, rx + rw - 8, ry, 8, rh);
  hallWall(g, rx, ry + rh - 16, rw, 16);
  px(g, C.skirting, rx + 8, ry + rh - 16, rw - 16, 2);

  // Gym markings
  px(g, 0xf0f0e4, 40, 40, 160, 1);
  px(g, 0xf0f0e4, 40, 96, 160, 1);
  px(g, 0xf0f0e4, 118, 40, 2, 56);
  furn(g, 28, 36, 18, 12, C.steel, 0xb0b0b8, 0x5a5a60);
  furn(g, 194, 36, 18, 12, C.steel, 0xb0b0b8, 0x5a5a60);
  px(g, C.hall, 100, 28, 40, 8);
  px(g, C.ink, 108, 30, 24, 4);

  // Gym / corridor lip
  px(g, C.brick, rx + 8, 108, rw - 16, 6);
  px(g, C.wood, 96, 106, 48, 10);
  px(g, C.woodHi, 96, 106, 48, 2);
  const gymMouth: Solid = { x: 96, y: 106, w: 48, h: 10 };

  // Canteen hatch west
  furn(g, 24, 228, 52, 28, C.cream, 0xf4eee0, 0xb8a890);
  px(g, 0x68a0c8, 30, 234, 18, 10);
  px(g, C.ink, 52, 236, 16, 8);
  const hatch: Solid = { x: 24, y: 228, w: 52, h: 28 };
  furn(g, 28, 264, 40, 18, C.wood, C.woodHi, C.woodLo);
  const canteen: Solid = { x: 28, y: 264, w: 40, h: 18 };

  // Classroom desks east
  furn(g, 168, 168, 44, 22, C.wood, C.woodHi, C.woodLo);
  px(g, 0x3a78c8, 174, 160, 32, 10);
  px(g, C.ink, 180, 162, 20, 6);
  const classroom: Solid = { x: 168, y: 160, w: 44, h: 30 };

  // Trophy / notice
  furn(g, 168, 128, 36, 20, C.steel, 0xb0b0b8, 0x5a5a60);
  px(g, 0xe8c040, 176, 134, 8, 8);
  const trophy: Solid = { x: 168, y: 128, w: 36, h: 20 };

  const mop: Solid = { x: 32, y: 180, w: 14, h: 22 };
  px(g, C.steel, 36, 180, 3, 18);
  px(g, 0x8a9a48, 32, 194, 12, 6);

  const southY = ry + rh - 16;
  const door = southDoor(g, 104, southY, 32, mapH - southY);

  const spots: SchoolInSpot[] = [
    { at: gymMouth, line: "Gym doors. Smells of plimsolls." },
    { at: hatch, line: "Dinner hatch. Fish today." },
    { at: canteen, line: "Canteen table. Gravy." },
    { at: classroom, line: "Classroom. Don't." },
    { at: trophy, line: "Hilsea Badge case. Empty." },
    { at: mop, line: "Mop. Wet floor." },
  ];

  const solids: Solid[] = [
    { x: 0, y: 0, w: rx, h: mapH },
    { x: rx + rw, y: 0, w: GBA_W - (rx + rw), h: mapH },
    { x: rx, y: 0, w: rw, h: ry + 24 },
    { x: rx, y: southY, w: 88, h: 16 },
    { x: 136, y: southY, w: rx + rw - 136, h: 16 },
    { x: 0, y: ry + rh, w: GBA_W, h: mapH - (ry + rh) },
    { x: rx, y: ry + 24, w: 8, h: rh - 40 },
    { x: rx + rw - 8, y: ry + 24, w: 8, h: rh - 40 },
    { x: rx + 8, y: 108, w: 80, h: 6 },
    { x: 144, y: 108, w: 72, h: 6 },
    hatch,
    canteen,
    classroom,
    trophy,
    mop,
    { x: 28, y: 36, w: 18, h: 12 },
    { x: 194, y: 36, w: 18, h: 12 },
  ];

  return {
    mapH,
    solids,
    spots,
    door,
    trophy,
    spawnFromField: { x: 120, y: southY - 6 },
  };
}
