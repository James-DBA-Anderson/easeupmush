import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { run } from "../run";
import { southDoor } from "./drawCommon";

export type Solid = { x: number; y: number; w: number; h: number };

export type KitchenLayout = {
  solids: Solid[];
  spawn: { x: number; y: number };
  door: Solid;
  cooker: Solid;
  sink: Solid;
  fridge: Solid;
  table: Solid;
  mum: Solid;
  bag: Solid;
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
  lino: 0xc8b090,
  linoD: 0xb09878,
  paper: 0xf0e0c8,
  paperStripe: 0xe0d0b4,
  wallDark: 0xb8a888,
  skirting: 0x7a6248,
  wood: 0xd2a05c,
  woodDark: 0xa07038,
  woodLite: 0xe8c078,
  white: 0xf0ece4,
  whiteD: 0xc8c4bc,
  ink: 0x201c18,
  chrome: 0xa8b0b8,
  hob: 0x2a2a30,
  kettle: 0xc0c4c8,
  glass: 0xc8e0e8,
  glassD: 0x68a0b0,
  wine: 0x4a1830,
  wineL: 0x6a2848,
};

/** Empty wine bottle — dark glass, no fill, cork gone. */
function wineBottle(g: Phaser.GameObjects.Graphics, x: number, y: number, tip = false): void {
  if (tip) {
    px(g, C.wine, x, y + 2, 10, 4);
    px(g, C.wineL, x, y + 2, 10, 1);
    px(g, C.wine, x + 9, y + 1, 3, 3);
    px(g, C.ink, x + 11, y + 2, 2, 1);
    return;
  }
  px(g, C.wine, x, y + 3, 5, 10);
  px(g, C.wineL, x, y + 3, 5, 1);
  px(g, C.wine, x + 1, y, 3, 4);
  px(g, C.ink, x + 2, y - 1, 1, 2);
}

/** Empty wine glass — stem + bowl rim. */
function wineGlass(g: Phaser.GameObjects.Graphics, x: number, y: number, tip = false): void {
  if (tip) {
    px(g, C.glassD, x, y + 2, 7, 3);
    px(g, C.glass, x, y + 2, 7, 1);
    px(g, C.glassD, x + 6, y + 3, 4, 1);
    return;
  }
  px(g, C.glassD, x, y, 5, 4);
  px(g, C.glass, x, y, 5, 1);
  px(g, C.glass, x + 1, y + 1, 3, 2);
  px(g, C.glassD, x + 2, y + 4, 1, 3);
  px(g, C.glassD, x + 1, y + 7, 3, 1);
}


/** Back kitchen — small terrace room. */
export function drawKitchen(g: Phaser.GameObjects.Graphics): KitchenLayout {
  g.clear();
  px(g, C.void, 0, 0, GBA_W, GBA_H);

  const rx = 44;
  const ry = 24;
  const rw = 152;
  const rh = 116;

  px(g, C.lino, rx, ry + 22, rw, rh - 22);
  for (let y = ry + 22; y < ry + rh; y += 10) px(g, C.linoD, rx, y, rw, 1);

  px(g, C.paper, rx, ry, rw, 24);
  for (let x = rx; x < rx + rw; x += 8) px(g, C.paperStripe, x, ry, 3, 24);
  px(g, C.wallDark, rx, ry + 22, rw, 2);
  px(g, C.skirting, rx, ry + 24, rw, 2);
  px(g, C.paper, rx, ry, 8, rh);
  px(g, C.paper, rx + rw - 8, ry, 8, rh);
  px(g, C.paper, rx, ry + rh - 16, rw, GBA_H - (ry + rh - 16));
  px(g, C.skirting, rx + 8, ry + rh - 16, rw - 16, 2);

  furn(g, 54, 32, 88, 22, C.wood, C.woodLite, C.woodDark);
  px(g, C.woodLite, 56, 36, 18, 10);
  px(g, C.woodLite, 76, 36, 18, 10);
  px(g, C.white, 58, 36, 28, 10);
  px(g, 0x68a0b8, 64, 38, 16, 6);
  px(g, C.chrome, 70, 34, 4, 5);
  const sink: Solid = { x: 54, y: 32, w: 36, h: 22 };

  const cooker: Solid = { x: 96, y: 28, w: 32, h: 26 };
  furn(g, 96, 36, 32, 18, C.whiteD, C.white, 0xa8a49c);
  px(g, C.hob, 100, 28, 24, 10);
  px(g, 0x4a4a50, 102, 30, 6, 5);
  px(g, 0x4a4a50, 114, 30, 6, 5);
  px(g, 0xf0a23a, 108, 26, 5, 5);
  px(g, C.woodDark, 100, 46, 6, 4);
  px(g, C.woodDark, 118, 46, 6, 4);

  px(g, C.kettle, 132, 30, 10, 10);
  px(g, C.chrome, 134, 28, 5, 4);
  px(g, C.ink, 139, 32, 2, 2);

  const fridge: Solid = { x: 162, y: 28, w: 22, h: 42 };
  furn(g, 162, 28, 22, 42, C.white, 0xffffff, C.whiteD);
  px(g, C.whiteD, 164, 46, 18, 2);
  px(g, C.chrome, 178, 40, 3, 5);
  px(g, C.chrome, 178, 56, 3, 5);

  const table: Solid = { x: 70, y: 78, w: 52, h: 32 };
  furn(g, 70, 78, 52, 28, C.wood, C.woodLite, C.woodDark);
  px(g, C.woodDark, 74, 106, 5, 10);
  px(g, C.woodDark, 113, 106, 5, 10);
  px(g, 0xe8e0d0, 84, 84, 14, 8);
  px(g, 0xc45c3a, 102, 86, 10, 7);
  // Empty glasses + bottle on the table
  wineGlass(g, 78, 82);
  wineGlass(g, 112, 84, true);
  wineBottle(g, 94, 80);

  // Empties by Mum on the worktop / fridge end
  wineBottle(g, 146, 28);
  wineBottle(g, 154, 30);
  wineGlass(g, 142, 36);
  wineGlass(g, 150, 38);

  // A couple on the lino by the table leg
  wineBottle(g, 128, 108, true);
  wineGlass(g, 138, 112, true);
  wineBottle(g, 58, 100);
  wineGlass(g, 64, 108, true);

  const bag: Solid = { x: 172, y: 106, w: 16, h: 16 };
  if (!run.hasBag) {
    furn(g, 172, 108, 16, 14, 0x2a3a68, 0x4a5a88, 0x1a2848);
    px(g, 0xf0c030, 174, 114, 12, 2);
    px(g, 0x3a4a78, 176, 106, 8, 4);
    px(g, C.ink, 182, 110, 2, 2);
  }

  const mum: Solid = { x: 142, y: 44, w: 18, h: 26 };

  const southY = ry + rh - 16;
  const door = southDoor(g, 104, southY, 32, GBA_H - southY);

  const solids: Solid[] = [
    { x: 0, y: 0, w: rx, h: GBA_H },
    { x: rx + rw, y: 0, w: GBA_W - (rx + rw), h: GBA_H },
    { x: rx, y: 0, w: rw, h: ry + 24 },
    { x: rx, y: ry + rh - 16, w: 60, h: 16 },
    { x: 136, y: ry + rh - 16, w: rx + rw - 136, h: 16 },
    { x: 0, y: ry + rh, w: GBA_W, h: GBA_H - (ry + rh) },
    cooker,
    sink,
    fridge,
    table,
    mum,
  ];

  return {
    solids,
    spawn: { x: 120, y: 114 },
    door,
    cooker,
    sink,
    fridge,
    table,
    mum,
    bag,
  };
}
