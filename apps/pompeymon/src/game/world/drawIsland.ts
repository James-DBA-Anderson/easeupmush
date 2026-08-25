import Phaser from "phaser";
import { GBA_W } from "../constants";
import type { WildId } from "../species";
import { chippyFront, cycleShopFront, furn, px, sideDoor, spiceFront, type Solid } from "./drawCommon";

export const ISLAND_H = 640;

export type GrassZone = { at: Solid; pool: WildId[] };

export type IslandSpot = { at: Solid; line: string };

export type IslandLayout = {
  mapH: number;
  solids: Solid[];
  grass: GrassZone[];
  spots: IslandSpot[];
  spawnFromNorth: { x: number; y: number };
  spawnFromSchool: { x: number; y: number };
  spawnFromBike: { x: number; y: number };
  spawnFromCharity: { x: number; y: number };
  spawnFromPawn: { x: number; y: number };
  spawnFromChippy: { x: number; y: number };
  spawnFromSpice: { x: number; y: number };
  schoolGate: Solid;
  bikeDoor: Solid;
  charityDoor: Solid;
  pawnDoor: Solid;
  chippyDoor: Solid;
  spiceDoor: Solid;
};

const C = {
  grass: 0x3a6a30,
  grassD: 0x2a5424,
  grassL: 0x4a8438,
  tall: 0x2e5828,
  tallL: 0x3e7830,
  tarmac: 0x4a4a52,
  tarmacL: 0x5a5a64,
  kerb: 0xc0b8a8,
  path: 0xa8a090,
  pathD: 0x8a8274,
  chalk: 0xd0c8b0,
  brick: 0xb06048,
  brickD: 0x8a4434,
  brickL: 0xc87858,
  pebble: 0xd4ccbc,
  pebbleD: 0xb8b0a0,
  pebbleL: 0xe8e0d0,
  cream: 0xe8e0d0,
  creamD: 0xb8a890,
  creamL: 0xf4eee0,
  roof: 0x6a3028,
  roofL: 0x8a4840,
  roof2: 0x3a4860,
  roof2L: 0x5a6880,
  earth: 0x6a5438,
  earthL: 0x8a7050,
  water: 0x3a78a8,
  waterL: 0x68a0c8,
  steel: 0x8a8a90,
  wood: 0xd2a05c,
  ink: 0x201c18,
  glass: 0x68a0c8,
  glassL: 0x88c0d8,
  green: 0x2a5840,
  greenL: 0x3e7854,
  greenD: 0x1a3a28,
  gold: 0xd4b060,
};

function turf(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  px(g, C.grass, x, y, w, h);
  for (let yy = y; yy < y + h; yy += 6) {
    for (let xx = x + ((yy / 6) % 2 === 0 ? 0 : 4); xx < x + w; xx += 8) {
      px(g, C.grassD, xx, yy, 2, 1);
      px(g, C.grassL, xx + 3, yy + 2, 1, 1);
    }
  }
}

function pavement(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  px(g, C.path, x, y, w, h);
  for (let yy = y + 6; yy < y + h; yy += 10) px(g, C.pathD, x, yy, w, 1);
}

function roadV(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  px(g, C.tarmac, x, y, w, h);
  px(g, C.tarmacL, x, y, w, 1);
  px(g, C.kerb, x, y, 3, h);
  px(g, C.kerb, x + w - 3, y, 3, h);
  for (let yy = y + 6; yy < y + h; yy += 14) px(g, 0xc8b848, x + Math.floor(w / 2) - 1, yy, 2, 6);
}

function tallGrass(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): Solid {
  px(g, C.tall, x, y, w, h);
  for (let yy = y + 2; yy < y + h; yy += 4) {
    for (let xx = x + ((yy / 4) % 2 === 0 ? 1 : 3); xx < x + w; xx += 5) {
      px(g, C.tallL, xx, yy, 2, 3);
    }
  }
  return { x, y, w, h };
}

function rampart(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): Solid {
  px(g, C.earth, x, y, w, h);
  px(g, C.earthL, x, y, w, 4);
  px(g, C.chalk, x, y + 4, w, 3);
  px(g, C.brick, x + 4, y + 10, w - 8, h - 16);
  px(g, C.brickD, x + 4, y + h - 8, w - 8, 4);
  return { x, y, w, h };
}

function terrace(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  pebble: boolean,
  doorEast: boolean,
): Solid {
  px(g, pebble ? C.roof2 : C.roof, x - 2, y, w + 4, 10);
  px(g, pebble ? C.roof2L : C.roofL, x - 2, y, w + 4, 2);
  px(g, C.ink, x + (doorEast ? w - 12 : 6), y - 3, 5, 7);
  const wall = pebble ? C.pebble : C.brick;
  const wallD = pebble ? C.pebbleD : C.brickD;
  const wallL = pebble ? C.pebbleL : C.brickL;
  furn(g, x, y + 8, w, h - 8, wall, wallL, wallD);
  for (let yy = y + 16; yy < y + h - 8; yy += 5) {
    for (let xx = x + 5; xx < x + w - 5; xx += 6) px(g, wallD, xx, yy, 4, 1);
  }
  const wx = doorEast ? x + 8 : x + w - 26;
  px(g, C.wood, wx, y + 16, 16, 12);
  px(g, C.glass, wx + 2, y + 18, 12, 8);
  px(g, C.glassL, wx + 3, y + 19, 4, 3);
  const dx = doorEast ? x + w - 8 : x;
  sideDoor(g, dx, y + 20, 8, h - 28);
  return { x, y, w, h };
}

function shop(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: number,
  hi: number,
  lo: number,
  doorEast: boolean,
): Solid {
  px(g, C.roof, x - 2, y, w + 4, 8);
  px(g, C.roofL, x - 2, y, w + 4, 2);
  furn(g, x, y + 6, w, h - 6, fill, hi, lo);
  const gx = doorEast ? x + 8 : x + w - 28;
  px(g, C.glass, gx, y + 14, 18, 12);
  px(g, C.glassL, gx + 1, y + 15, 6, 4);
  const dx = doorEast ? x + w - 10 : x;
  px(g, C.wood, dx, y + 18, 8, h - 26);
  px(g, C.ink, dx + (doorEast ? 5 : 2), y + 30, 2, 2);
  return { x, y, w, h };
}

function post(g: Phaser.GameObjects.Graphics, x: number, y: number): Solid {
  px(g, C.greenD, x, y + 4, 6, 16);
  px(g, C.greenL, x + 1, y + 4, 4, 16);
  px(g, C.gold, x, y, 6, 6);
  px(g, 0xf0e090, x + 1, y + 1, 4, 3);
  px(g, C.gold, x, y + 16, 6, 2);
  return { x, y, w: 6, h: 20 };
}

function greenPostsPub(g: Phaser.GameObjects.Graphics, x: number, y: number): { pub: Solid; posts: Solid[] } {
  const w = 76;
  const h = 70;
  px(g, 0x4a3020, x - 2, y, w + 4, 12);
  px(g, 0x6a4830, x - 2, y, w + 4, 3);
  furn(g, x, y + 10, w, h - 10, C.green, C.greenL, C.greenD);
  for (let yy = y + 28; yy < y + h - 10; yy += 5) {
    for (let xx = x + 5; xx < x + w - 5; xx += 7) px(g, C.greenD, xx, yy, 5, 1);
  }
  px(g, C.gold, x + 8, y + 14, w - 16, 14);
  px(g, C.cream, x + 10, y + 16, w - 20, 10);
  px(g, C.green, x + 14, y + 18, 8, 6);
  px(g, C.green, x + 28, y + 18, 8, 6);
  px(g, C.green, x + 42, y + 18, 8, 6);
  px(g, C.greenD, x + 16, y + 20, 4, 3);
  px(g, C.greenD, x + 30, y + 20, 4, 3);
  px(g, C.greenD, x + 44, y + 20, 4, 3);
  px(g, C.glass, x + 36, y + 32, 18, 12);
  px(g, C.glassL, x + 37, y + 33, 7, 4);
  px(g, C.wood, x, y + 36, 8, h - 46);
  px(g, C.ink, x + 2, y + 50, 2, 2);
  px(g, C.ink, x + 4, y + 22, 2, 18);
  px(g, C.cream, x - 10, y + 24, 14, 10);
  px(g, C.green, x - 8, y + 26, 10, 6);
  const postA = post(g, x - 8, y + 32);
  const postB = post(g, x - 8, y + 54);
  return { pub: { x, y, w, h }, posts: [postA, postB] };
}

function hedge(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number): Solid {
  px(g, C.tall, x, y, w, 6);
  px(g, C.tallL, x + 1, y + 1, w - 2, 2);
  for (let xx = x + 2; xx < x + w; xx += 5) px(g, C.grassL, xx, y, 2, 3);
  return { x, y, w, h: 6 };
}

function garden(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  turf(g, x, y, w, h);
  px(g, C.brickD, x, y, 1, h);
  px(g, C.brickD, x + w - 1, y, 1, h);
}

function binCan(g: Phaser.GameObjects.Graphics, x: number, y: number): Solid {
  px(g, C.ink, x, y, 8, 12);
  px(g, 0x4a4a50, x, y + 3, 8, 9);
  px(g, C.steel, x + 1, y + 1, 6, 2);
  return { x, y, w: 8, h: 12 };
}

function boysSchool(g: Phaser.GameObjects.Graphics, x: number, y: number): { walls: Solid[]; gate: Solid; face: Solid } {
  const w = 76;
  const h = 108;
  px(g, C.roof, x - 2, y, w + 4, 12);
  px(g, C.roofL, x - 2, y, w + 4, 3);
  furn(g, x, y + 10, w, h - 10, C.brick, C.brickL, C.brickD);
  for (let yy = y + 22; yy < y + h - 8; yy += 5) {
    for (let xx = x + 5; xx < x + w - 5; xx += 6) px(g, C.brickD, xx, yy, 4, 1);
  }
  px(g, C.cream, x + 8, y + 16, w - 16, 14);
  px(g, C.ink, x + 14, y + 19, 48, 8);
  px(g, C.glass, x + 10, y + 36, 16, 12);
  px(g, C.glass, x + 32, y + 36, 16, 12);
  px(g, C.glassL, x + 11, y + 37, 6, 4);
  const gateH = 28;
  const gateW = 12;
  const gateY = y + 42;
  const gate: Solid = { x: x + w - gateW, y: gateY, w: gateW, h: gateH };
  px(g, C.brickD, gate.x, gate.y, 3, gate.h);
  px(g, C.brickL, gate.x, gate.y, 3, 2);
  px(g, C.brickD, gate.x + gate.w - 3, gate.y, 3, gate.h);
  px(g, C.brickL, gate.x + gate.w - 3, gate.y, 3, 2);
  px(g, C.grass, gate.x + 3, gate.y + 3, gate.w - 6, gate.h - 6);
  px(g, C.steel, gate.x + 3, gate.y, gate.w - 6, 2);
  const walls: Solid[] = [
    { x, y, w, h: gateY - y },
    { x, y: gateY + gateH, w, h: y + h - (gateY + gateH) },
    { x, y: gateY, w: w - gateW, h: gateH },
  ];
  return { walls, gate, face: { x, y, w, h } };
}

function lamp(g: Phaser.GameObjects.Graphics, x: number, y: number): Solid {
  px(g, C.steel, x + 1, y, 2, 16);
  px(g, 0xe8d878, x, y, 4, 4);
  return { x, y, w: 4, h: 16 };
}

/** Hilsea — built-up Northern Road, Green Posts, scraps of grass, the Lines. */
export function drawIsland(g: Phaser.GameObjects.Graphics): IslandLayout {
  const mapH = ISLAND_H;
  g.clear();
  pavement(g, 0, 0, GBA_W, mapH);
  roadV(g, 96, 0, 48, mapH);

  px(g, C.chalk, 0, 0, GBA_W, 8);
  px(g, C.wood, 100, 10, 40, 8);
  px(g, C.ink, 108, 12, 24, 4);

  garden(g, 84, 28, 12, 104);
  garden(g, 144, 28, 12, 52);

  const t1w = terrace(g, 8, 28, 76, 52, true, true);
  const t1e = terrace(g, 156, 28, 76, 52, false, false);
  const h1w = hedge(g, 8, 78, 76);
  const h1e = hedge(g, 156, 78, 76);
  const t2w = terrace(g, 8, 84, 76, 48, false, true);
  const posts = greenPostsPub(g, 156, 84);
  garden(g, 84, 140, 12, 124);
  garden(g, 144, 162, 12, 106);

  const news = cycleShopFront(g, 8, 140, 76, 48, true);
  const spice = spiceFront(g, 156, 162, 76, 48, false);
  const hNews = hedge(g, 8, 186, 76);

  const school = boysSchool(g, 8, 196);
  garden(g, 84, 196, 12, 108);
  const chippyE = chippyFront(g, 156, 218, 76, 50, false);
  const binE = binCan(g, 148, 230);

  const shut = shop(g, 156, 276, 76, 48, C.brick, C.brickL, C.brickD, false);
  garden(g, 144, 276, 12, 104);

  px(g, C.steel, 16, 320, 40, 26);
  px(g, C.ink, 16, 320, 40, 3);
  px(g, C.wood, 20, 334, 12, 12);
  const stop: Solid = { x: 16, y: 320, w: 40, h: 26 };
  px(g, C.ink, 62, 336, 12, 14);
  px(g, 0x4a4a50, 62, 340, 12, 10);
  const bin: Solid = { x: 62, y: 336, w: 12, h: 14 };
  const gStop = tallGrass(g, 8, 352, 76, 40);

  const charity = shop(g, 156, 332, 76, 48, C.pebble, C.pebbleL, C.pebbleD, false);

  const lineW = rampart(g, 8, 400, 76, 36);
  const lineE = rampart(g, 156, 400, 76, 36);
  px(g, C.water, 8, 440, 76, 18);
  px(g, C.waterL, 12, 444, 24, 4);
  px(g, C.water, 156, 440, 76, 18);
  px(g, C.waterL, 160, 444, 20, 4);
  const ditchW: Solid = { x: 8, y: 440, w: 76, h: 18 };
  const ditchE: Solid = { x: 156, y: 440, w: 76, h: 18 };
  const gDitch = tallGrass(g, 8, 462, 76, 40);
  const gDitchE = tallGrass(g, 156, 462, 76, 40);

  const t7w = terrace(g, 8, 510, 76, 48, false, true);
  const t7e = terrace(g, 156, 510, 76, 48, true, false);
  garden(g, 84, 510, 12, 48);
  garden(g, 144, 510, 12, 48);
  const h7w = hedge(g, 8, 556, 76);
  const h7e = hedge(g, 156, 556, 76);

  const gSouthW = tallGrass(g, 8, 566, 76, 48);
  const gSouthE = tallGrass(g, 156, 566, 76, 48);

  px(g, C.earth, 0, mapH - 16, GBA_W, 16);
  px(g, C.chalk, 96, mapH - 16, 48, 4);

  const lampN = lamp(g, 90, 120);
  const lampM = lamp(g, 146, 200);
  const lampS = lamp(g, 90, 390);

  const grass: GrassZone[] = [
    { at: gStop, pool: ["busstopper", "donerrat", "pidgeon"] },
    { at: gDitch, pool: ["spikehedge", "starlimur", "squirral"] },
    { at: gDitchE, pool: ["chipgull", "starlimur"] },
    { at: gSouthW, pool: ["pidgeon", "squirral", "donerrat"] },
    { at: gSouthE, pool: ["chipgull", "pidgeon", "starlimur"] },
  ];

  const spots: IslandSpot[] = [
    { at: t1w, line: "Terrace. Telly's on." },
    { at: t1e, line: "Net curtains." },
    { at: t2w, line: "They're in." },
    { at: posts.pub, line: "The Green Posts. Not going in." },
    { at: news, line: "Hilsea Cycles. Bikes in the window. Get a lock." },
    { at: school.face, line: "City of Portsmouth Boys' School." },
    { at: school.gate, line: "School gate. Atkins. Hilsea Badge." },
    { at: spice, line: "Spice. Curry. Kebab." },
    { at: chippyE, line: "Chippy. Vinegar." },
    { at: shut, line: "Pawn. Len's in there." },
    { at: stop, line: "Bus stop. Something lives here." },
    { at: bin, line: "Bin. Don't look." },
    { at: charity, line: "Charity. Smells of coats." },
    { at: lineW, line: "Hilsea Lines. Old fort." },
    { at: lineE, line: "Rampart. South is North End." },
    { at: ditchW, line: "Ditch. Gulls eye it." },
    { at: ditchE, line: "Moat. Don't fall in." },
    { at: t7w, line: "Further houses." },
    { at: t7e, line: "Further houses." },
  ];

  const solids: Solid[] = [
    { x: 0, y: 0, w: 96, h: 24 },
    { x: 144, y: 0, w: 96, h: 24 },
    { x: 0, y: 24, w: 8, h: mapH - 40 },
    { x: 232, y: 24, w: 8, h: mapH - 40 },
    { x: 0, y: mapH - 16, w: 96, h: 16 },
    { x: 144, y: mapH - 16, w: 96, h: 16 },
    t1w,
    t1e,
    h1w,
    h1e,
    t2w,
    posts.pub,
    ...posts.posts,
    news,
    hNews,
    spice,
    ...school.walls,
    chippyE,
    binE,
    shut,
    stop,
    bin,
    charity,
    lineW,
    lineE,
    ditchW,
    ditchE,
    t7w,
    t7e,
    h7w,
    h7e,
    lampN,
    lampM,
    lampS,
  ];

  return {
    mapH,
    solids,
    grass,
    spots,
    spawnFromNorth: { x: 120, y: 28 },
    spawnFromSchool: { x: 90, y: 250 },
    spawnFromBike: { x: 90, y: 168 },
    spawnFromCharity: { x: 148, y: 356 },
    spawnFromPawn: { x: 148, y: 300 },
    spawnFromChippy: { x: 148, y: 244 },
    spawnFromSpice: { x: 148, y: 186 },
    schoolGate: school.gate,
    bikeDoor: { x: news.x + news.w - 12, y: news.y + 18, w: 10, h: news.h - 22 },
    charityDoor: { x: charity.x, y: charity.y + 18, w: 10, h: charity.h - 22 },
    pawnDoor: { x: shut.x, y: shut.y + 18, w: 10, h: shut.h - 22 },
    chippyDoor: { x: chippyE.x, y: chippyE.y + 18, w: 10, h: chippyE.h - 22 },
    spiceDoor: { x: spice.x, y: spice.y + 18, w: 10, h: spice.h - 22 },
  };
}
