import Phaser from "phaser";
import { GBA_W } from "../constants";
import { chippyFront, cycleShopFront, furn, px, spiceFront, type Solid } from "./drawCommon";

export const HIGH_STREET_H = 480;

export type HighStreetSpot = { at: Solid; line: string };

export type HighStreetLayout = {
  mapH: number;
  solids: Solid[];
  spawnFromWest: { x: number; y: number };
  spawnFromLab: { x: number; y: number };
  spawnFromBike: { x: number; y: number };
  spawnFromCharity: { x: number; y: number };
  spawnFromPawn: { x: number; y: number };
  spawnFromChippy: { x: number; y: number };
  spawnFromSpice: { x: number; y: number };
  join: Solid;
  centre: Solid;
  centreDoor: Solid;
  bikeDoor: Solid;
  charityDoor: Solid;
  pawnDoor: Solid;
  chippyDoor: Solid;
  spiceDoor: Solid;
  spots: HighStreetSpot[];
};

const C = {
  tarmac: 0x4a4a52,
  tarmacL: 0x5a5a64,
  kerb: 0xc0b8a8,
  path: 0xa8a090,
  pathD: 0x8a8274,
  brick: 0xb06048,
  brickD: 0x8a4434,
  brickL: 0xc87858,
  cream: 0xd8ccb4,
  creamD: 0xb8a890,
  creamL: 0xe8e0d0,
  pebble: 0xc8b8a0,
  roof: 0x6a3028,
  roof2: 0x3a4860,
  glass: 0x68a0c8,
  glassL: 0x88c0d8,
  wood: 0xd2a05c,
  ink: 0x201c18,
  navy: 0x2a3a68,
  navyL: 0x4a5a88,
};

function pavement(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  px(g, C.path, x, y, w, h);
  for (let yy = y + 4; yy < y + h; yy += 10) px(g, C.pathD, x, yy, w, 1);
}

function roadV(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  px(g, C.tarmac, x, y, w, h);
  px(g, C.tarmacL, x, y, w, 1);
  px(g, C.kerb, x, y, 3, h);
  px(g, C.kerb, x + w - 3, y, 3, h);
  for (let yy = y + 6; yy < y + h; yy += 14) px(g, 0xc8b848, x + Math.floor(w / 2) - 1, yy, 2, 6);
}

function roadH(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  px(g, C.tarmac, x, y, w, h);
  px(g, C.kerb, x, y, w, 3);
  px(g, C.kerb, x, y + h - 3, w, 3);
  for (let xx = x + 8; xx < x + w; xx += 16) px(g, 0xc8b848, xx, y + Math.floor(h / 2) - 1, 8, 2);
}

function shopWest(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: number,
  hi: number,
  lo: number,
  roof: number,
): Solid {
  px(g, roof, x - 2, y, w + 4, 8);
  px(g, hi, x - 2, y, w + 4, 2);
  furn(g, x, y + 6, w, h - 6, fill, hi, lo);
  px(g, C.glass, x + w - 28, y + 14, 16, 12);
  px(g, C.glassL, x + w - 27, y + 15, 6, 4);
  px(g, C.wood, x + w - 10, y + 18, 8, h - 24);
  px(g, C.ink, x + w - 4, y + 28, 2, 2);
  return { x, y, w, h };
}

function shopEast(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: number,
  hi: number,
  lo: number,
  roof: number,
): Solid {
  px(g, roof, x - 2, y, w + 4, 8);
  px(g, hi, x - 2, y, w + 4, 2);
  furn(g, x, y + 6, w, h - 6, fill, hi, lo);
  px(g, C.glass, x + 8, y + 14, 16, 12);
  px(g, C.glassL, x + 9, y + 15, 6, 4);
  px(g, C.wood, x, y + 18, 8, h - 24);
  px(g, C.ink, x + 2, y + 28, 2, 2);
  return { x, y, w, h };
}

function researchCentre(g: Phaser.GameObjects.Graphics, x: number, y: number): Solid {
  const w = 72;
  const h = 78;
  px(g, C.roof2, x - 2, y, w + 4, 12);
  px(g, C.navyL, x - 2, y, w + 4, 3);
  furn(g, x, y + 10, w, h - 10, C.cream, C.creamL, C.creamD);
  px(g, C.navy, x + 6, y + 16, 60, 10);
  px(g, 0xf0e8d0, x + 10, y + 18, 52, 6);
  px(g, C.ink, x + 14, y + 19, 44, 4);
  px(g, C.glass, x + 8, y + 30, 18, 14);
  px(g, C.glass, x + 30, y + 30, 18, 14);
  px(g, C.glassL, x + 9, y + 31, 6, 5);
  px(g, C.wood, x + w - 14, y + 36, 10, h - 46);
  px(g, C.ink, x + w - 6, y + 50, 2, 2);
  px(g, C.navy, x + 8, y + h - 14, 36, 6);
  return { x, y, w, h };
}

/** Cosham High Street — N–S shops, west spur from the roundabout joins in the middle. */
export function drawHighStreet(g: Phaser.GameObjects.Graphics): HighStreetLayout {
  const mapH = HIGH_STREET_H;
  g.clear();
  pavement(g, 0, 0, GBA_W, mapH);

  const roadX = 92;
  const roadW = 48;
  roadV(g, roadX, 0, roadW, mapH);

  const joinY = 216;
  const joinH = 44;
  roadH(g, 0, joinY, roadX + 4, joinH);
  const join: Solid = { x: 0, y: joinY, w: 48, h: joinH };

  const centre = researchCentre(g, 8, 24);
  const centreDoor: Solid = { x: centre.x + centre.w - 14, y: centre.y + 36, w: 12, h: 28 };
  const chippy = chippyFront(g, 8, 108, 72, 48, true);
  const news = shopWest(g, 8, 160, 72, 48, C.cream, C.creamL, C.creamD, C.roof);
  const iceland = shopWest(g, 8, 280, 72, 52, C.navy, C.navyL, 0x1a2848, C.roof2);
  const chemistW = shopWest(g, 8, 340, 72, 48, C.pebble, C.creamL, C.creamD, C.roof);
  const lastW = cycleShopFront(g, 8, 396, 72, 48, true);

  const bookies = shopEast(g, 156, 20, 76, 52, C.brick, C.brickL, C.brickD, C.roof);
  const hair = shopEast(g, 156, 80, 76, 48, C.cream, C.creamL, C.creamD, C.roof);
  const charity = shopEast(g, 156, 152, 76, 48, C.pebble, C.creamL, C.creamD, C.roof2);
  const pub = shopEast(g, 156, 280, 76, 52, C.brick, C.brickL, C.brickD, C.roof);
  const shut = shopEast(g, 156, 340, 76, 48, C.cream, C.creamL, C.creamD, C.roof);
  const lastE = spiceFront(g, 156, 396, 76, 48, false);

  const spots: HighStreetSpot[] = [
    { at: centre, line: "Professor Choke's Pompeymon research centre." },
    { at: chippy, line: "Chippy. Open." },
    { at: news, line: "Papers. Not going in." },
    { at: iceland, line: "Iceland. Freezers humming." },
    { at: chemistW, line: "Chemist. Shut." },
    { at: lastW, line: "Cosham Cycles. Bikes in the window." },
    { at: bookies, line: "Bookies. Blokes in there." },
    { at: hair, line: "Hair. Smells of spray." },
    { at: charity, line: "Charity. Cheap coats." },
    { at: pub, line: "Pub. Not going in." },
    { at: shut, line: "Pawn. Watches in the window." },
    { at: lastE, line: "Spice. Curry. Kebab." },
  ];

  const solids: Solid[] = [
    { x: 0, y: 0, w: GBA_W, h: 8 },
    { x: 0, y: mapH - 8, w: GBA_W, h: 8 },
    { x: 0, y: 0, w: 8, h: joinY },
    { x: 0, y: joinY + joinH, w: 8, h: mapH - (joinY + joinH) },
    { x: GBA_W - 8, y: 0, w: 8, h: mapH },
    centre,
    chippy,
    news,
    iceland,
    chemistW,
    lastW,
    bookies,
    hair,
    charity,
    pub,
    shut,
    lastE,
  ];

  return {
    mapH,
    solids,
    spawnFromWest: { x: 40, y: joinY + 22 },
    spawnFromLab: { x: 90, y: 70 },
    spawnFromBike: { x: 90, y: 420 },
    spawnFromCharity: { x: 148, y: 178 },
    spawnFromPawn: { x: 148, y: 366 },
    spawnFromChippy: { x: 90, y: 132 },
    spawnFromSpice: { x: 148, y: 422 },
    join,
    centre,
    centreDoor,
    bikeDoor: { x: lastW.x + lastW.w - 12, y: lastW.y + 18, w: 10, h: lastW.h - 22 },
    charityDoor: { x: charity.x, y: charity.y + 18, w: 10, h: charity.h - 22 },
    pawnDoor: { x: shut.x, y: shut.y + 18, w: 10, h: shut.h - 22 },
    chippyDoor: { x: chippy.x + chippy.w - 12, y: chippy.y + 18, w: 10, h: chippy.h - 22 },
    spiceDoor: { x: lastE.x, y: lastE.y + 18, w: 10, h: lastE.h - 22 },
    spots,
  };
}
