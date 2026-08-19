import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { px, sideDoor, type Solid } from "./drawCommon";

export type AvenueLayout = {
  solids: Solid[];
  spawnFromHall: { x: number; y: number };
  spawnFromEast: { x: number; y: number };
  flyer: Solid;
  homeDoor: Solid;
  steve: Solid;
  fence: Solid;
  southRoad: Solid;
  houses: { player: Solid; ne: Solid; sw: Solid; se: Solid };
};

const C = {
  grass: 0x3a6a30,
  grassD: 0x2a5424,
  grassL: 0x4a8438,
  tarmac: 0x4a4a52,
  tarmacL: 0x5a5a64,
  kerb: 0xc0b8a8,
  path: 0xa8a090,
  pathD: 0x8a8274,
  fence: 0x8a7048,
  fenceD: 0x6a5434,
  ink: 0x201c18,
  brick: 0xb06048,
  brickD: 0x8a4434,
  brickL: 0xc87858,
  pebble: 0xd4ccbc,
  pebbleD: 0xb8b0a0,
  pebbleL: 0xe8e0d0,
  roof: 0x6a3028,
  roofL: 0x8a4840,
  roof2: 0x3a4860,
  roof2L: 0x5a6880,
  wood: 0xd2a05c,
  woodL: 0xe8c078,
  glass: 0x68a0c8,
  glassL: 0x88c0d8,
};

function grass(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  px(g, C.grass, x, y, w, h);
  for (let yy = y; yy < y + h; yy += 6) {
    for (let xx = x + ((yy / 6) % 2 === 0 ? 0 : 4); xx < x + w; xx += 8) {
      px(g, C.grassD, xx, yy, 2, 1);
      px(g, C.grassL, xx + 3, yy + 2, 1, 1);
    }
  }
}

function tarmac(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, vertical: boolean): void {
  px(g, C.tarmac, x, y, w, h);
  px(g, C.tarmacL, x, y, w, 1);
  if (vertical) {
    for (let yy = y + 4; yy < y + h - 2; yy += 10) px(g, 0xc8b848, x + Math.floor(w / 2) - 1, yy, 2, 5);
  } else {
    for (let xx = x + 6; xx < x + w - 4; xx += 14) px(g, 0xc8b848, xx, y + Math.floor(h / 2) - 1, 8, 2);
  }
}

function house(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  pebble: boolean,
  roof: number,
  roofHi: number,
  doorEast: boolean,
): Solid {
  px(g, roof, x - 2, y, w + 4, 12);
  px(g, roofHi, x - 2, y, w + 4, 2);
  px(g, C.ink, x + w - 10, y - 4, 6, 8);
  px(g, roofHi, x + w - 9, y - 4, 4, 1);
  const wall = pebble ? C.pebble : C.brick;
  const wallD = pebble ? C.pebbleD : C.brickD;
  const wallL = pebble ? C.pebbleL : C.brickL;
  px(g, wall, x, y + 10, w, h - 10);
  px(g, wallL, x, y + 10, w, 2);
  px(g, wallD, x, y + h - 3, w, 3);
  for (let yy = y + 16; yy < y + h - 6; yy += 5) {
    for (let xx = x + 4; xx < x + w - 4; xx += 6) px(g, wallD, xx, yy, 4, 1);
  }
  const wx = doorEast ? x + 8 : x + w - 28;
  px(g, C.wood, wx, y + 16, 18, 14);
  px(g, C.glass, wx + 2, y + 18, 14, 10);
  px(g, C.glassL, wx + 3, y + 19, 5, 4);
  const dx = doorEast ? x + w - 8 : x;
  sideDoor(g, dx, y + 22, 8, 22);
  return { x, y, w, h };
}

/** 2nd Avenue — short N–S cul-de-sac, four houses, T-junction south. */
export function drawAvenue(g: Phaser.GameObjects.Graphics): AvenueLayout {
  g.clear();
  grass(g, 0, 0, GBA_W, GBA_H);

  const roadX = 100;
  const roadW = 40;
  tarmac(g, roadX, 10, roadW, 112, true);
  px(g, C.kerb, roadX - 6, 10, 6, 112);
  px(g, C.path, roadX - 14, 10, 8, 112);
  px(g, C.kerb, roadX + roadW, 10, 6, 112);
  px(g, C.path, roadX + roadW + 6, 10, 8, 112);

  tarmac(g, 0, 122, GBA_W, 24, false);
  px(g, C.kerb, 0, 118, GBA_W, 4);
  px(g, C.path, 0, 112, GBA_W, 6);
  px(g, C.kerb, 0, 146, GBA_W, 4);
  px(g, C.path, 0, 150, GBA_W, 10);
  tarmac(g, roadX, 112, roadW, 12, true);

  px(g, C.fenceD, 0, 2, GBA_W, 8);
  for (let x = 2; x < GBA_W; x += 8) {
    px(g, C.fence, x, 0, 3, 12);
    px(g, C.fence, x - 2, 4, 7, 2);
  }
  const fence: Solid = { x: 0, y: 0, w: GBA_W, h: 12 };

  const player = house(g, 6, 12, 78, 48, true, C.roof, C.roofL, true);
  const ne = house(g, 156, 12, 78, 48, false, C.roof2, C.roof2L, false);
  const sw = house(g, 6, 64, 78, 48, false, C.roof2, C.roof2L, true);
  const se = house(g, 156, 64, 78, 48, true, C.roof, C.roofL, false);

  const homeDoor: Solid = { x: player.x + player.w - 8, y: player.y + 22, w: 8, h: 22 };
  px(g, C.path, homeDoor.x + 8, homeDoor.y + 14, 12, 8);
  px(g, C.pathD, homeDoor.x + 8, homeDoor.y + 20, 12, 1);

  px(g, C.wood, 148, 108, 18, 14);
  px(g, C.woodL, 148, 108, 18, 2);
  px(g, C.ink, 151, 112, 12, 6);
  px(g, 0xf0e8d0, 152, 113, 10, 4);

  const steve: Solid = { x: 108, y: 38, w: 22, h: 20 };
  const southRoad: Solid = { x: 0, y: 118, w: GBA_W, h: 42 };
  const flyer: Solid = { x: 168, y: 128, w: 12, h: 8 };

  const solids: Solid[] = [
    fence,
    { x: 0, y: 0, w: 6, h: 118 },
    { x: 234, y: 0, w: 6, h: 118 },
    player,
    ne,
    sw,
    se,
    steve,
  ];

  return {
    solids,
    spawnFromHall: { x: 98, y: 48 },
    spawnFromEast: { x: 220, y: 132 },
    flyer,
    homeDoor,
    steve,
    fence,
    southRoad,
    houses: { player, ne, sw, se },
  };
}
