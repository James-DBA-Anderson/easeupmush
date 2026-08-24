import Phaser from "phaser";
import { GBA_W } from "../constants";
import type { WildId } from "../species";
import { furn, px, southDoor, type Solid } from "./drawCommon";

export const SCHOOL_H = 256;

export type GrassZone = { at: Solid; pool: WildId[] };
export type SchoolSpot = { at: Solid; line: string };

export type SchoolLayout = {
  mapH: number;
  solids: Solid[];
  grass: GrassZone[];
  spots: SchoolSpot[];
  gate: Solid;
  door: Solid;
  spawnFromRoad: { x: number; y: number };
  spawnFromIn: { x: number; y: number };
};

const C = {
  grass: 0x3a6a30,
  grassD: 0x2a5424,
  grassL: 0x4a8438,
  tall: 0x2e5828,
  tallL: 0x3e7830,
  pitch: 0x3e7834,
  chalk: 0xf0f0e4,
  tarmac: 0x4a4a52,
  path: 0xa8a090,
  pathD: 0x8a8274,
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
  wood: 0xd2a05c,
  ink: 0x201c18,
  glass: 0x68a0c8,
  glassL: 0x88c0d8,
  steel: 0x8a8a90,
  fence: 0x6a5438,
};

function turf(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, fill = C.grass): void {
  px(g, fill, x, y, w, h);
  for (let yy = y; yy < y + h; yy += 6) {
    for (let xx = x + ((yy / 6) % 2 === 0 ? 0 : 4); xx < x + w; xx += 8) {
      px(g, C.grassD, xx, yy, 2, 1);
      px(g, C.grassL, xx + 3, yy + 2, 1, 1);
    }
  }
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

function fenceV(g: Phaser.GameObjects.Graphics, x: number, y: number, h: number): Solid {
  px(g, 0x3a2a18, x, y, 5, h);
  for (let yy = y; yy < y + h; yy += 5) px(g, 0xc8c0b0, x, yy, 5, 1);
  for (let yy = y + 1; yy < y + h; yy += 5) px(g, 0x5a4030, x + 2, yy, 1, 4);
  return { x, y, w: 5, h };
}

function fenceH(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number): Solid {
  px(g, 0x3a2a18, x, y, w, 5);
  for (let xx = x; xx < x + w; xx += 5) px(g, 0xc8c0b0, xx, y, 1, 5);
  px(g, 0xc8c0b0, x, y + 1, w, 1);
  px(g, 0xc8c0b0, x, y + 3, w, 1);
  return { x, y, w, h: 5 };
}

function block(
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
  px(g, roof, x - 2, y, w + 4, 10);
  px(g, C.roofL, x - 2, y, w + 4, 2);
  furn(g, x, y + 8, w, h - 8, fill, hi, lo);
  for (let yy = y + 18; yy < y + h - 8; yy += 5) {
    for (let xx = x + 6; xx < x + w - 6; xx += 6) px(g, lo, xx, yy, 4, 1);
  }
  px(g, C.glass, x + 10, y + 18, 16, 12);
  px(g, C.glass, x + 32, y + 18, 16, 12);
  px(g, C.glassL, x + 11, y + 19, 6, 4);
  return { x, y, w, h };
}

function goal(g: Phaser.GameObjects.Graphics, x: number, y: number, h: number): Solid {
  px(g, C.chalk, x, y, 3, h);
  px(g, C.chalk, x + 10, y, 3, h);
  px(g, C.chalk, x, y, 13, 2);
  px(g, C.steel, x + 3, y + 2, 7, h - 4);
  return { x, y, w: 13, h };
}

/** City of Portsmouth Boys School — field, blocks, gate back to Northern Road. */
export function drawSchool(g: Phaser.GameObjects.Graphics): SchoolLayout {
  const mapH = SCHOOL_H;
  g.clear();
  turf(g, 0, 0, GBA_W, mapH);

  px(g, C.path, 188, 108, 52, 36);
  for (let yy = 114; yy < 140; yy += 10) px(g, C.pathD, 188, yy, 52, 1);
  px(g, C.tarmac, 120, 72, 18, 54);
  px(g, C.path, 16, 72, 122, 16);

  const main = block(g, 8, 8, 148, 60, C.brick, C.brickL, C.brickD, C.roof);
  const door = southDoor(g, 64, 58, 22, 10);
  const gym = block(g, 164, 8, 60, 60, C.pebble, C.pebbleL, C.pebbleD, C.roof2);
  px(g, C.cream, 20, 12, 72, 8);
  px(g, C.ink, 28, 14, 56, 4);

  const hut = block(g, 8, 204, 52, 40, C.cream, C.creamL, C.creamD, C.roof);
  px(g, C.wood, 64, 216, 28, 24);
  px(g, C.ink, 64, 216, 28, 3);
  const shed: Solid = { x: 64, y: 216, w: 28, h: 24 };

  turf(g, 24, 96, 156, 88, C.pitch);
  px(g, C.chalk, 24, 96, 156, 1);
  px(g, C.chalk, 24, 183, 156, 1);
  px(g, C.chalk, 24, 96, 1, 88);
  px(g, C.chalk, 179, 96, 1, 88);
  px(g, C.chalk, 101, 96, 2, 88);
  px(g, C.chalk, 90, 132, 24, 1);
  px(g, C.chalk, 90, 132, 1, 16);
  px(g, C.chalk, 113, 132, 1, 16);
  px(g, C.chalk, 90, 147, 24, 1);
  const pitch: Solid = { x: 24, y: 96, w: 156, h: 88 };
  const goalW = goal(g, 26, 118, 44);
  const goalE = goal(g, 165, 118, 44);

  const gWest = tallGrass(g, 8, 96, 14, 72);
  const gSouth = tallGrass(g, 100, 196, 80, 40);
  const gEast = tallGrass(g, 182, 150, 36, 36);

  const northF = fenceH(g, 0, 0, GBA_W);
  const westF = fenceV(g, 0, 0, mapH);
  const southF = fenceH(g, 0, mapH - 6, GBA_W);
  const eastN = fenceV(g, 234, 0, 108);
  const eastS = fenceV(g, 234, 144, mapH - 144);

  px(g, C.brickD, 228, 108, 12, 36);
  px(g, C.brick, 228, 108, 12, 2);
  px(g, C.pitch, 232, 114, 8, 24);
  for (let yy = 116; yy < 136; yy += 4) px(g, C.steel, 234, yy, 2, 2);
  const gate: Solid = { x: 220, y: 108, w: 20, h: 36 };

  const grass: GrassZone[] = [
    { at: gWest, pool: ["squirral", "starlimur", "pidgeon"] },
    { at: gSouth, pool: ["squirral", "spikehedge", "starlimur"] },
    { at: gEast, pool: ["pidgeon", "starlimur"] },
  ];

  const spots: SchoolSpot[] = [
    { at: main, line: "City of Portsmouth Boys' School." },
    { at: gym, line: "Gym. Atkins. Go in the main doors." },
    { at: hut, line: "Huts. Art and geography." },
    { at: shed, line: "Bike shed. Don't." },
    { at: pitch, line: "The field. Mud." },
    { at: goalW, line: "Goals. Nets are ripped." },
    { at: goalE, line: "Goals. Nets are ripped." },
    { at: gate, line: "Gate. Northern Road." },
  ];

  const solids: Solid[] = [
    northF,
    westF,
    southF,
    eastN,
    eastS,
    { x: main.x, y: main.y, w: main.w, h: 50 },
    { x: main.x, y: 58, w: 56, h: 10 },
    { x: 86, y: 58, w: main.x + main.w - 86, h: 10 },
    gym,
    hut,
    shed,
    goalW,
    goalE,
  ];

  return {
    mapH,
    solids,
    grass,
    spots,
    gate,
    door,
    spawnFromRoad: { x: 214, y: 128 },
    spawnFromIn: { x: 75, y: 78 },
  };
}
