import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { furn, px, southDoor, type Solid } from "./drawCommon";

export type TakeawayKind = "chippy" | "spice";

export type TakeawayLayout = {
  solids: Solid[];
  spawn: { x: number; y: number };
  door: Solid;
  counter: Solid;
  rack: Solid;
};

export function drawTakeaway(g: Phaser.GameObjects.Graphics, kind: TakeawayKind): TakeawayLayout {
  g.clear();
  const chippy = kind === "chippy";
  const floor = chippy ? 0xc8c0a8 : 0xb8a070;
  const floorD = chippy ? 0xa8a090 : 0x987850;
  const wall = chippy ? 0xe8d8b0 : 0xd4a040;
  const stripe = chippy ? 0xd0c090 : 0xc89030;

  px(g, 0x000000, 0, 0, GBA_W, GBA_H);
  const rx = 28;
  const ry = 18;
  const rw = 184;
  const rh = 124;

  px(g, floor, rx, ry + 20, rw, rh - 20);
  for (let y = ry + 22; y < ry + rh; y += 8) px(g, floorD, rx, y, rw, 1);
  px(g, wall, rx, ry, rw, 20);
  for (let x = rx; x < rx + rw; x += 8) px(g, stripe, x, ry, 3, 20);
  px(g, 0x5a5040, rx, ry + 20, rw, 3);

  const rack: Solid = { x: 40, y: 44, w: 72, h: 32 };
  furn(g, 40, 44, 72, 30, 0x6a6860, 0x8a8880, 0x4a4840);
  px(g, chippy ? 0xf0d060 : 0xc06030, 48, 50, 24, 12);
  px(g, chippy ? 0xf8f0d0 : 0x6a3020, 78, 50, 24, 12);

  const counter: Solid = { x: 132, y: 48, w: 56, h: 32 };
  furn(g, 132, 48, 56, 30, 0xd2a05c, 0xe8c078, 0xa07038);
  px(g, 0x201c18, 140, 54, 40, 8);

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
    rack,
    counter,
  ];
  return { solids, spawn: { x: 120, y: 100 }, door, counter, rack };
}
