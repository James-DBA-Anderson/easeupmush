import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { px, type Solid } from "./drawCommon";

export type BridgeLayout = {
  solids: Solid[];
  spawn: { x: number; y: number };
  spawnFromSouth: { x: number; y: number };
  water: Solid;
  span: Solid;
};

const C = {
  grass: 0x3a6a30,
  tarmac: 0x4a4a52,
  kerb: 0xc0b8a8,
  water: 0x2a6898,
  waterL: 0x4a88b8,
  rail: 0x8a8a90,
  ink: 0x201c18,
};

/** Northern Road — bridge over the creek to Pompey. */
export function drawBridge(g: Phaser.GameObjects.Graphics): BridgeLayout {
  g.clear();
  px(g, C.grass, 0, 0, GBA_W, 36);
  px(g, C.water, 0, 36, GBA_W, 88);
  for (let y = 40; y < 120; y += 8) px(g, C.waterL, 8, y, GBA_W - 16, 2);
  px(g, C.grass, 0, 124, GBA_W, 36);

  px(g, C.tarmac, 100, 0, 40, GBA_H);
  px(g, C.kerb, 100, 0, 4, GBA_H);
  px(g, C.kerb, 136, 0, 4, GBA_H);
  for (let y = 8; y < GBA_H; y += 12) px(g, 0xc8b848, 118, y, 2, 6);

  px(g, C.rail, 96, 36, 4, 88);
  px(g, C.rail, 140, 36, 4, 88);
  for (let y = 40; y < 120; y += 10) {
    px(g, C.ink, 96, y, 4, 2);
    px(g, C.ink, 140, y, 4, 2);
  }

  const water: Solid = { x: 0, y: 36, w: 96, h: 88 };
  const span: Solid = { x: 100, y: 100, w: 40, h: 24 };

  const solids: Solid[] = [
    { x: 0, y: 0, w: 100, h: GBA_H },
    { x: 140, y: 0, w: GBA_W - 140, h: GBA_H },
  ];

  return {
    solids,
    spawn: { x: 120, y: 20 },
    spawnFromSouth: { x: 120, y: 140 },
    water,
    span,
  };
}
