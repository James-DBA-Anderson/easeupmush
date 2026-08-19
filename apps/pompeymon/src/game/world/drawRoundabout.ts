import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { px, type Solid } from "./drawCommon";

export type RoundaboutLayout = {
  solids: Solid[];
  spawnFromWest: { x: number; y: number };
  spawnFromNorth: { x: number; y: number };
  spawnFromSouth: { x: number; y: number };
  spawnFromEast: { x: number; y: number };
  island: Solid;
  sign: Solid;
};

const C = {
  grass: 0x3a6a30,
  grassD: 0x2a5424,
  grassL: 0x4a8438,
  chalk: 0xd8d0b8,
  tarmac: 0x4a4a52,
  tarmacL: 0x5a5a64,
  kerb: 0xc0b8a8,
  water: 0x3a78a8,
  waterL: 0x68a0c8,
  brick: 0xb06048,
  wood: 0xd2a05c,
  ink: 0x201c18,
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

function roadH(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  px(g, C.tarmac, x, y, w, h);
  px(g, C.kerb, x, y, w, 3);
  px(g, C.kerb, x, y + h - 3, w, 3);
  for (let xx = x + 8; xx < x + w - 6; xx += 16) px(g, 0xc8b848, xx, y + Math.floor(h / 2) - 1, 8, 2);
}

function roadV(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  px(g, C.tarmac, x, y, w, h);
  px(g, C.kerb, x, y, 3, h);
  px(g, C.kerb, x + w - 3, y, 3, h);
  for (let yy = y + 6; yy < y + h - 4; yy += 12) px(g, 0xc8b848, x + Math.floor(w / 2) - 1, yy, 2, 6);
}

/** Cosham roundabout — west 2nd Ave, north hill, south bridge, east high street. */
export function drawRoundabout(g: Phaser.GameObjects.Graphics): RoundaboutLayout {
  g.clear();
  grass(g, 0, 0, GBA_W, GBA_H);

  px(g, C.chalk, 80, 0, 80, 18);
  px(g, C.grassL, 70, 10, 100, 10);
  px(g, C.water, 88, 148, 64, 12);
  px(g, C.waterL, 92, 150, 20, 4);

  px(g, C.brick, 200, 28, 32, 36);
  px(g, 0x6a3028, 198, 24, 36, 8);
  px(g, 0x68a0c8, 208, 36, 12, 10);

  const cx = 120;
  const cy = 80;
  g.fillStyle(C.tarmac, 1);
  g.fillCircle(cx, cy, 50);
  g.fillStyle(C.kerb, 1);
  g.fillCircle(cx, cy, 26);
  g.fillStyle(0x2e5828, 1);
  g.fillCircle(cx, cy, 22);
  g.fillStyle(0x4a8438, 1);
  g.fillCircle(cx, cy, 8);

  roadH(g, 0, 66, 72, 28);
  roadH(g, 168, 66, 72, 28);
  roadV(g, 106, 0, 28, 32);
  roadV(g, 106, 128, 28, 32);

  px(g, C.wood, 114, 70, 12, 18);
  px(g, C.ink, 116, 72, 8, 10);
  px(g, 0xf0e8d0, 117, 73, 6, 8);
  const sign: Solid = { x: 114, y: 70, w: 12, h: 18 };
  const island: Solid = { x: cx - 20, y: cy - 20, w: 40, h: 40 };

  const solids: Solid[] = [
    { x: 0, y: 0, w: 100, h: 60 },
    { x: 140, y: 0, w: 100, h: 60 },
    { x: 0, y: 100, w: 100, h: 60 },
    { x: 140, y: 100, w: 60, h: 28 },
    { x: 200, y: 28, w: 40, h: 36 },
    { x: 140, y: 128, w: 100, h: 32 },
  ];

  return {
    solids,
    spawnFromWest: { x: 28, y: 80 },
    spawnFromNorth: { x: 120, y: 24 },
    spawnFromSouth: { x: 120, y: 140 },
    spawnFromEast: { x: 214, y: 80 },
    island,
    sign,
  };
}
