import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";

export type Solid = { x: number; y: number; w: number; h: number };

export type LandingLayout = {
  solids: Solid[];
  spawnFromBedroom: { x: number; y: number };
  spawnFromBathroom: { x: number; y: number };
  bedroomDoor: Solid;
  bathDoor: Solid;
  stairs: Solid;
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
  paper: 0xe4d8c4,
  paperStripe: 0xd4c8b4,
  wallDark: 0xb8a888,
  skirting: 0x7a6248,
  floor: 0xb88858,
  floorDark: 0x9a6840,
  floorLite: 0xc89868,
  wood: 0xd2a05c,
  woodDark: 0xa07038,
  woodLite: 0xe8c078,
  ink: 0x201c18,
  rail: 0x8a5a30,
  step: 0x6a4830,
  stepDark: 0x4a3020,
  well: 0x2a1c14,
};

/** Upstairs landing — bedroom behind you, loo, stairs down. */
export function drawLanding(g: Phaser.GameObjects.Graphics): LandingLayout {
  g.clear();

  px(g, C.floor, 0, 0, GBA_W, GBA_H);
  for (let y = 44; y < 144; y += 8) {
    px(g, C.floorDark, 20, y, 200, 1);
    for (let x = 20; x < 220; x += 28) {
      const shift = (y / 8) % 2 === 0 ? 0 : 14;
      px(g, C.floorLite, x + shift, y + 2, 10, 1);
    }
  }

  px(g, C.paper, 0, 0, GBA_W, 42);
  for (let x = 0; x < GBA_W; x += 8) px(g, C.paperStripe, x, 0, 3, 42);
  px(g, C.wallDark, 0, 40, GBA_W, 2);
  px(g, C.skirting, 0, 42, GBA_W, 3);

  px(g, C.paper, 0, 0, 20, GBA_H);
  px(g, C.paper, 220, 0, 20, GBA_H);
  for (let y = 0; y < GBA_H; y += 8) {
    px(g, C.paperStripe, 0, y, 20, 3);
    px(g, C.paperStripe, 220, y, 20, 3);
  }
  px(g, C.paper, 0, 144, GBA_W, 16);
  px(g, C.skirting, 20, 142, 200, 2);
  px(g, C.wallDark, 18, 42, 2, 100);
  px(g, C.wallDark, 220, 42, 2, 100);

  // Bathroom door — north
  const bathDoor: Solid = { x: 148, y: 6, w: 28, h: 34 };
  furn(g, bathDoor.x, bathDoor.y, bathDoor.w, bathDoor.h, C.wood, C.woodLite, C.woodDark);
  px(g, C.woodLite, 152, 12, 9, 22);
  px(g, C.woodLite, 163, 12, 9, 22);
  px(g, C.woodDark, 161, 12, 2, 22);
  px(g, C.ink, 170, 24, 3, 3);

  // Bedroom door — south wall (you came from here)
  const bedroomDoor: Solid = { x: 100, y: 126, w: 32, h: 18 };
  furn(g, bedroomDoor.x, bedroomDoor.y, bedroomDoor.w, bedroomDoor.h, C.wood, C.woodLite, C.woodDark);
  px(g, C.woodLite, 104, 130, 10, 10);
  px(g, C.woodLite, 118, 130, 10, 10);
  px(g, C.ink, 114, 136, 3, 3);

  // Stairs down — west well + steps
  const stairs: Solid = { x: 20, y: 46, w: 52, h: 88 };
  px(g, C.well, 20, 46, 48, 88);
  for (let i = 0; i < 8; i++) {
    const y = 50 + i * 10;
    const w = 40 - i * 2;
    px(g, i % 2 === 0 ? C.step : C.stepDark, 24, y, w, 8);
    px(g, C.woodLite, 24, y, w, 1);
  }
  px(g, C.rail, 68, 46, 4, 90);
  px(g, C.woodLite, 68, 46, 4, 2);
  for (let y = 52; y < 130; y += 12) px(g, C.woodDark, 69, y, 2, 6);

  const solids: Solid[] = [
    { x: 0, y: 0, w: 20, h: GBA_H },
    { x: 220, y: 0, w: 20, h: GBA_H },
    { x: 0, y: 0, w: GBA_W, h: 44 },
    { x: 20, y: 144, w: 80, h: 16 },
    { x: 132, y: 144, w: 88, h: 16 },
    { x: 20, y: 46, w: 52, h: 88 },
  ];

  return {
    solids,
    spawnFromBedroom: { x: 116, y: 100 },
    spawnFromBathroom: { x: 162, y: 52 },
    bedroomDoor,
    bathDoor,
    stairs,
  };
}
