import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { furn, px, southDoor, type Solid } from "./drawCommon";

export type JunkKind = "charity" | "pawn";

export type JunkShopLayout = {
  solids: Solid[];
  spawn: { x: number; y: number };
  door: Solid;
  counter: Solid;
  rack: Solid;
};

export function drawJunkShop(g: Phaser.GameObjects.Graphics, kind: JunkKind): JunkShopLayout {
  g.clear();
  const charity = kind === "charity";
  const voidC = 0x000000;
  const floor = charity ? 0xc8bca8 : 0x6a6860;
  const floorD = charity ? 0xb0a490 : 0x4a4840;
  const wall = charity ? 0xd8c8b0 : 0x3a3a40;
  const stripe = charity ? 0xc8b498 : 0x2a2a30;
  const wood = 0xd2a05c;
  const woodHi = 0xe8c078;
  const woodLo = 0xa07038;
  const ink = 0x201c18;

  px(g, voidC, 0, 0, GBA_W, GBA_H);

  const rx = 28;
  const ry = 18;
  const rw = 184;
  const rh = 124;

  px(g, floor, rx, ry + 20, rw, rh - 20);
  for (let y = ry + 22; y < ry + rh; y += 8) px(g, floorD, rx, y, rw, 1);

  px(g, wall, rx, ry, rw, 20);
  for (let x = rx; x < rx + rw; x += 8) px(g, stripe, x, ry, 3, 20);
  px(g, 0x5a5040, rx, ry + 20, rw, 3);

  const rack: Solid = { x: 40, y: 44, w: 72, h: 36 };
  furn(g, 40, 44, 72, 34, 0x8a7050, 0xa88860, 0x6a5038);
  px(g, charity ? 0x8a4860 : 0xc8a040, 48, 50, 14, 10);
  px(g, ink, 50, 56, 10, 3);
  px(g, charity ? 0x6a8048 : 0x4a4a54, 68, 50, 14, 10);
  px(g, charity ? 0xc07050 : 0x68a0c8, 88, 50, 16, 12);

  const counter: Solid = { x: 132, y: 48, w: 56, h: 32 };
  furn(g, 132, 48, 56, 30, wood, woodHi, woodLo);
  px(g, ink, 140, 54, 40, 8);
  if (!charity) {
    px(g, 0xc8a040, 144, 66, 12, 6);
    px(g, 0x88c0d8, 162, 66, 10, 8);
  }

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
