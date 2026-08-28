import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { sideDoor, southDoor, stairsUp } from "./drawCommon";

export type Solid = { x: number; y: number; w: number; h: number };

export type HallLayout = {
  solids: Solid[];
  spawnFromLanding: { x: number; y: number };
  spawnFromKitchen: { x: number; y: number };
  spawnFromFront: { x: number; y: number };
  spawnFromAvenue: { x: number; y: number };
  stairs: Solid;
  stairFoot: Solid;
  kitchenDoor: Solid;
  frontRoomDoor: Solid;
  frontDoor: Solid;
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
  void: 0x000000,
  /** Downstairs — cool sage, not the cream stripe upstairs. */
  paper: 0xb8c8a8,
  paperHi: 0xc8d8b8,
  paperLo: 0x98a888,
  wallDark: 0x7a8a68,
  skirting: 0x5a4830,
  floor: 0xb07040,
  floorDark: 0x945830,
  floorLite: 0xc88850,
  wood: 0xd2a05c,
  woodDark: 0xa07038,
  woodLite: 0xe8c078,
  ink: 0x201c18,
  glass: 0x68a0c8,
  step: 0x6a4830,
  stepDark: 0x4a3020,
  well: 0x2a1c14,
  rail: 0x8a5a30,
};

function floorPlanks(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  px(g, C.floor, x, y, w, h);
  for (let yy = y; yy < y + h; yy += 8) {
    px(g, C.floorDark, x, yy, w, 1);
    for (let xx = x; xx < x + w; xx += 16) {
      const shift = (yy / 8) % 2 === 0 ? 0 : 8;
      px(g, C.floorLite, xx + shift, yy + 2, 6, 1);
    }
  }
}

/** Ground-floor paper — soft diamonds, distinct from upstairs cream stripes. */
function paperWall(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  px(g, C.paper, x, y, w, h);
  px(g, C.paperHi, x, y, w, 1);
  for (let yy = y + 4; yy < y + h; yy += 8) {
    for (let xx = x + 3; xx < x + w; xx += 8) {
      const ox = ((yy - y) / 8) % 2 === 0 ? 0 : 4;
      px(g, C.paperLo, xx + ox, yy, 2, 2);
      px(g, C.paperHi, xx + ox + 1, yy - 1, 1, 1);
    }
  }
}

/** Ground-floor hall — stairs, kitchen, front room, front door. */
export function drawHall(g: Phaser.GameObjects.Graphics): HallLayout {
  g.clear();
  px(g, C.void, 0, 0, GBA_W, GBA_H);

  const hallX = 102;
  const hallW = 44;
  const topY = 46;
  const stairX = 58;
  const stairW = 44;
  const stairY = 46;
  const stairH = 48;

  paperWall(g, stairX - 8, 20, 96, 26);
  px(g, C.wallDark, stairX - 8, 44, 96, 2);
  px(g, C.skirting, stairX - 8, 46, 96, 2);
  paperWall(g, stairX - 8, 20, 8, 118);
  paperWall(g, hallX + hallW, 20, 8, 118);
  px(g, C.wallDark, stairX - 8, 48, 2, 88);
  px(g, C.wallDark, hallX + hallW, 48, 2, 88);

  floorPlanks(g, hallX, topY, hallW, 84);
  floorPlanks(g, stairX, 94, stairW, 22);

  paperWall(g, stairX - 8, 116, hallX + hallW + 16 - (stairX - 8), GBA_H - 116);
  px(g, C.skirting, stairX, 116, hallX + hallW - stairX, 2);

  const kitchenDoor: Solid = { x: 108, y: 18, w: 28, h: 28 };
  furn(g, kitchenDoor.x, kitchenDoor.y, kitchenDoor.w, kitchenDoor.h, C.wood, C.woodLite, C.woodDark);
  px(g, C.woodLite, 112, 24, 9, 16);
  px(g, C.woodLite, 123, 24, 9, 16);
  px(g, C.woodDark, 121, 24, 2, 16);
  px(g, C.ink, 130, 34, 3, 3);

  const frontRoomDoor = sideDoor(g, hallX + hallW, 72, 8, 40);

  const frontDoor = southDoor(g, 108, 116, 32, GBA_H - 116, true);

  const stairs: Solid = { x: stairX, y: stairY, w: stairW, h: stairH };
  stairsUp(g, stairX, stairY, stairW, stairH);
  const stairFoot: Solid = { x: stairX, y: 94, w: stairW, h: 22 };

  const northRight = hallX + hallW;
  const solids: Solid[] = [
    { x: 0, y: 0, w: stairX, h: GBA_H },
    { x: northRight, y: 0, w: GBA_W - northRight, h: GBA_H },
    // North wall with a gap at the kitchen door so you can walk in
    { x: stairX, y: 0, w: kitchenDoor.x - stairX, h: topY },
    { x: kitchenDoor.x + kitchenDoor.w, y: 0, w: northRight - (kitchenDoor.x + kitchenDoor.w), h: topY },
    { x: kitchenDoor.x, y: 0, w: kitchenDoor.w, h: kitchenDoor.y },
    { x: stairX, y: stairY, w: hallX - stairX, h: stairH },
    { x: stairX, y: 116, w: frontDoor.x - stairX, h: GBA_H - 116 },
    {
      x: frontDoor.x + frontDoor.w,
      y: 116,
      w: hallX + hallW - (frontDoor.x + frontDoor.w),
      h: GBA_H - 116,
    },
    stairs,
  ];

  return {
    solids,
    spawnFromLanding: { x: 80, y: 98 },
    spawnFromKitchen: { x: 124, y: 62 },
    spawnFromFront: { x: 124, y: 92 },
    spawnFromAvenue: { x: 124, y: 108 },
    stairs,
    stairFoot,
    kitchenDoor,
    frontRoomDoor,
    frontDoor,
  };
}
