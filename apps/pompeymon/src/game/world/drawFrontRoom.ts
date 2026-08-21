import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { sideDoor, wallFrame } from "./drawCommon";

export type Solid = { x: number; y: number; w: number; h: number };

export type FrontRoomLayout = {
  solids: Solid[];
  spawn: { x: number; y: number };
  door: Solid;
  sofa: Solid;
  dad: Solid;
  telly: Solid;
  fire: Solid;
  window: Solid;
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

/** Soft can / bottle / crisp pack clutter on the carpet. */
function floorMess(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  // Lager cans
  px(g, 0xc45c28, x, y, 4, 5);
  px(g, 0xe8d8b0, x, y, 4, 1);
  px(g, 0xc45c28, x + 10, y + 4, 4, 5);
  px(g, 0xe8d8b0, x + 10, y + 4, 4, 1);
  px(g, 0xa84820, x + 22, y + 2, 4, 5);
  px(g, 0xe8d8b0, x + 22, y + 2, 4, 1);
  // Bottle on its side
  px(g, 0x2a6848, x + 36, y + 6, 10, 3);
  px(g, 0x48a070, x + 45, y + 6, 3, 3);
  px(g, 0xe8e0d0, x + 36, y + 6, 2, 3);
  // Takeaway tray
  px(g, 0xe8d0a0, x + 6, y + 12, 14, 8);
  px(g, 0xd0b070, x + 6, y + 12, 14, 1);
  px(g, 0xc45c28, x + 9, y + 15, 4, 3);
  px(g, 0xf0e060, x + 14, y + 15, 3, 3);
  // Crisp packet
  px(g, 0xe0a028, x + 28, y + 14, 9, 6);
  px(g, 0xf0c848, x + 28, y + 14, 9, 1);
  px(g, 0xc03028, x + 31, y + 16, 3, 2);
  // Spilled bits
  px(g, 0xf0c848, x + 40, y + 14, 2, 2);
  px(g, 0xf0c848, x + 44, y + 16, 2, 1);
  // Another can tipped
  px(g, 0xb84828, x - 8, y + 8, 5, 3);
  px(g, 0xe8d8b0, x - 8, y + 8, 1, 3);
}

const C = {
  void: 0x000000,
  carpet: 0x8a3a38,
  carpetD: 0x6a2828,
  paper: 0xe8dcc8,
  paperStripe: 0xd8ccb4,
  wallDark: 0xb8a888,
  skirting: 0x7a6248,
  wood: 0xd2a05c,
  woodDark: 0xa07038,
  woodLite: 0xe8c078,
  ink: 0x201c18,
  sofa: 0x3a5a48,
  sofaD: 0x2a4434,
  sofaL: 0x5a7a68,
  sofaSeat: 0x4a6a58,
  beige: 0xe0d4c0,
  beigeD: 0xc4b8a4,
  brick: 0xa05038,
  brickL: 0xc07050,
  brickD: 0x7a3828,
};

/** Front room — centred gas fire, better sofa, Dad passed out. */
export function drawFrontRoom(g: Phaser.GameObjects.Graphics): FrontRoomLayout {
  g.clear();
  px(g, C.void, 0, 0, GBA_W, GBA_H);

  const rx = 40;
  const ry = 22;
  const rw = 160;
  const rh = 118;

  px(g, C.carpet, rx, ry + 24, rw, rh - 24);
  for (let y = ry + 28; y < ry + rh; y += 12) px(g, C.carpetD, rx, y, rw, 1);

  px(g, C.paper, rx, ry, rw, 24);
  for (let x = rx; x < rx + rw; x += 8) px(g, C.paperStripe, x, ry, 3, 24);
  px(g, C.wallDark, rx, ry + 22, rw, 2);
  px(g, C.skirting, rx, ry + 24, rw, 2);
  px(g, C.paper, rx, ry, 8, rh);
  px(g, C.paper, rx + rw - 8, ry, 8, rh);
  px(g, C.paper, rx, ry + rh - 12, rw, 12);
  px(g, C.skirting, rx + 8, ry + rh - 14, rw - 16, 2);

  // Street window — north wall, above the fire
  const window: Solid = { x: 92, y: 8, w: 56, h: 28 };
  px(g, 0x4a88b0, 96, 10, 48, 22);
  px(g, 0x78b4d0, 96, 10, 48, 10);
  px(g, 0x5a6a50, 96, 26, 48, 6);
  px(g, C.wood, 94, 8, 52, 3);
  px(g, C.wood, 94, 30, 52, 3);
  px(g, C.woodDark, 118, 10, 2, 20);

  wallFrame(g, 58, 24, 14, 16, 0x68a0b8, true);
  px(g, 0x88c0d0, 61, 26, 8, 5);
  px(g, 0x3a5a38, 61, 31, 8, 6);
  wallFrame(g, 168, 24, 16, 14, 0xf0e0c8, false);
  px(g, 0xc49068, 172, 27, 3, 4);
  px(g, 0xd4a078, 177, 27, 3, 4);
  px(g, 0x3a5a48, 171, 31, 10, 4);

  // Rug under the seating bit
  g.fillStyle(0x6a2828, 1);
  g.fillEllipse(120, 88, 96, 36);
  px(g, 0x9a4a40, 76, 80, 88, 2);

  // Gas fire — middle of the room / chimney breast under the window
  const fire: Solid = { x: 104, y: 28, w: 32, h: 40 };
  px(g, C.brickD, 102, 40, 36, 28);
  furn(g, 104, 42, 32, 24, C.brick, C.brickL, C.brickD);
  // Mantel
  px(g, C.wood, 100, 36, 40, 8);
  px(g, C.woodLite, 100, 36, 40, 2);
  px(g, C.woodDark, 100, 42, 40, 2);
  // Firebox + glow
  px(g, 0x1a1010, 110, 50, 20, 14);
  px(g, 0xf0a23a, 114, 54, 12, 7);
  px(g, 0xc45c28, 116, 56, 8, 4);
  px(g, 0xffe080, 118, 55, 4, 3);
  // Small ornaments on mantel
  px(g, 0xe8e0d0, 106, 32, 4, 5);
  px(g, 0xc8a060, 130, 33, 6, 4);

  // CRT on the east wall
  const telly: Solid = { x: 168, y: 48, w: 28, h: 40 };
  furn(g, 170, 64, 24, 14, C.wood, C.woodLite, C.woodDark);
  furn(g, 172, 48, 20, 20, C.beige, 0xf0e8d8, C.beigeD);
  px(g, 0x101820, 175, 52, 14, 12);
  px(g, 0x3a88c0, 177, 54, 8, 7);
  px(g, C.woodDark, 174, 74, 3, 5);
  px(g, C.woodDark, 186, 74, 3, 5);

  // Low coffee table between fire and sofa
  const table: Solid = { x: 108, y: 72, w: 28, h: 16 };
  furn(g, 108, 72, 28, 12, C.wood, C.woodLite, C.woodDark);
  px(g, C.woodDark, 112, 84, 3, 4);
  px(g, C.woodDark, 128, 84, 3, 4);
  px(g, 0xe8e0d0, 118, 75, 8, 5);
  px(g, 0xc45c28, 112, 76, 3, 4);

  // Sofa — 3/4 facing the fire (north), back + arms + seat cushion
  const sofa: Solid = { x: 78, y: 92, w: 84, h: 32 };
  // Shadow
  px(g, 0x5a2020, 80, 118, 80, 4);
  // Backrest (taller band at the top)
  furn(g, 82, 90, 76, 14, C.sofa, C.sofaL, C.sofaD);
  px(g, C.sofaL, 86, 92, 20, 8);
  px(g, C.sofaL, 134, 92, 20, 8);
  px(g, C.sofaD, 106, 94, 28, 8);
  // Seat
  furn(g, 78, 102, 84, 18, C.sofaSeat, C.sofaL, C.sofaD);
  px(g, C.sofaL, 84, 104, 28, 10);
  px(g, C.sofaL, 118, 104, 28, 10);
  px(g, C.sofaD, 112, 106, 4, 10);
  // Arms
  furn(g, 78, 96, 10, 22, C.sofa, C.sofaL, C.sofaD);
  furn(g, 152, 96, 10, 22, C.sofa, C.sofaL, C.sofaD);
  // Front lip / legs
  px(g, C.sofaD, 82, 118, 76, 3);
  px(g, C.woodDark, 86, 120, 4, 4);
  px(g, C.woodDark, 150, 120, 4, 4);

  // Dad sprawl hitbox (examine) — on the seat
  const dad: Solid = { x: 92, y: 98, w: 52, h: 22 };

  // Drinks and food on the floor around him
  floorMess(g, 70, 118);
  floorMess(g, 148, 112);

  const door = sideDoor(g, rx, 70, 8, 40);

  const solids: Solid[] = [
    { x: 0, y: 0, w: rx, h: GBA_H },
    { x: rx + rw, y: 0, w: GBA_W - (rx + rw), h: GBA_H },
    { x: rx, y: 0, w: rw, h: ry + 24 },
    { x: rx, y: ry + rh - 12, w: rw, h: 12 },
    { x: 0, y: ry + rh, w: GBA_W, h: GBA_H - (ry + rh) },
    { x: rx, y: ry + 24, w: 8, h: 46 },
    { x: rx, y: 110, w: 8, h: 18 },
    fire,
    telly,
    table,
    sofa,
  ];

  return {
    solids,
    spawn: { x: 64, y: 92 },
    door,
    sofa,
    dad,
    telly,
    fire,
    window,
  };
}
