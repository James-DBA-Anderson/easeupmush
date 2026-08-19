import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";
import { drawEaseLogo } from "../ui/pixelLogo";

export type Solid = { x: number; y: number; w: number; h: number };

export type BedroomLayout = {
  solids: Solid[];
  bed: Solid;
  pc: Solid;
  wardrobe: Solid;
  spawn: { x: number; y: number };
  wake: { x: number; y: number };
  door: Solid;
  doorSpawn: { x: number; y: number };
  poster: Solid;
  shelf: Solid;
};

const C = {
  paper: 0xe8dcc4,
  paperStripe: 0xddd0b4,
  wallDark: 0xb8a888,
  skirting: 0x7a6248,
  floor: 0xc48848,
  floorDark: 0xa86c38,
  floorLite: 0xd49a58,
  wood: 0xd2a05c,
  woodDark: 0xa07038,
  woodLite: 0xe8c078,
  sheet: 0x3a78c0,
  sheetLite: 0x6aa0dc,
  sheetDark: 0x285898,
  pillow: 0xf4ece0,
  pillowSh: 0xd8d0c4,
  mat: 0x3c6840,
  matLite: 0x5a8a52,
  matDark: 0x2a4c30,
  navy: 0x142838,
  sodium: 0xf0a23a,
  cream: 0xf2e6d0,
  beige: 0xe0d4c0,
  beigeDark: 0xc4b8a4,
  bin: 0x4a4a50,
  ink: 0x201c18,
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

/** GBA furniture: top lip + front lip, axis-aligned. */
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

/** Cosham bedroom — 2nd Avenue. GBA 3/4 interior, late-90s kit without saying so. */
export function drawBedroom(g: Phaser.GameObjects.Graphics): BedroomLayout {
  g.clear();

  px(g, C.floor, 0, 0, GBA_W, GBA_H);
  for (let y = 44; y < 144; y += 8) {
    px(g, C.floorDark, 20, y, 200, 1);
    for (let x = 20; x < 220; x += 24) {
      const shift = (y / 8) % 2 === 0 ? 0 : 12;
      px(g, C.floorLite, x + shift, y + 2, 10, 1);
    }
  }

  px(g, C.paper, 0, 0, GBA_W, 42);
  for (let x = 0; x < GBA_W; x += 8) px(g, C.paperStripe, x, 0, 3, 42);
  px(g, C.wallDark, 0, 40, GBA_W, 2);
  px(g, C.skirting, 0, 42, GBA_W, 3);

  px(g, C.paper, 220, 0, 20, GBA_H);
  for (let y = 0; y < GBA_H; y += 8) px(g, C.paperStripe, 220, y, 20, 3);
  px(g, C.paper, 0, 0, 20, GBA_H);
  for (let y = 0; y < GBA_H; y += 8) px(g, C.paperStripe, 0, y, 20, 3);
  px(g, C.paper, 0, 144, GBA_W, 16);
  px(g, C.skirting, 20, 142, 200, 2);
  px(g, C.wallDark, 18, 42, 2, 100);
  px(g, C.wallDark, 220, 42, 2, 100);

  furn(g, 176, 6, 28, 34, C.wood, C.woodLite, C.woodDark);
  px(g, C.woodLite, 180, 12, 9, 22);
  px(g, C.woodLite, 191, 12, 9, 22);
  px(g, C.woodDark, 189, 12, 2, 22);
  px(g, C.ink, 198, 24, 3, 3);

  px(g, C.navy, 58, 8, 40, 28);
  px(g, C.sodium, 59, 9, 38, 1);
  px(g, C.navy, 60, 10, 36, 24);
  drawEaseLogo(g, 78, 10, 3);

  furn(g, 104, 14, 52, 8, C.wood, C.woodLite, C.woodDark);
  px(g, 0x2a3c4c, 108, 8, 10, 6);
  px(g, C.sodium, 110, 10, 6, 3);
  px(g, 0xe07070, 122, 6, 5, 8);
  px(g, 0xf0d8a0, 123, 4, 3, 3);
  px(g, C.ink, 124, 5, 1, 1);
  px(g, 0xf4f4f4, 132, 8, 8, 8);
  px(g, C.ink, 134, 10, 4, 4);
  px(g, 0xf4f4f4, 135, 11, 2, 2);
  px(g, 0xe8e4dc, 144, 8, 12, 4);
  px(g, 0xf4f0e8, 145, 7, 8, 2);
  px(g, 0xc45c28, 142, 11, 5, 3);
  px(g, 0xc45c28, 154, 11, 5, 3);
  px(g, 0x4a6a88, 148, 9, 4, 2);
  px(g, 0xf0a23a, 140, 12, 3, 2);

  const pc: Solid = { x: 22, y: 28, w: 38, h: 28 };

  furn(g, 22, 30, 38, 10, C.wood, C.woodLite, C.woodDark);
  furn(g, 44, 40, 16, 16, C.wood, C.woodLite, C.woodDark);
  px(g, C.woodDark, 46, 44, 12, 1);
  px(g, C.woodDark, 46, 48, 12, 1);
  px(g, C.woodDark, 46, 52, 12, 1);
  px(g, C.ink, 54, 45, 2, 2);
  px(g, C.ink, 54, 49, 2, 2);
  px(g, C.ink, 54, 53, 2, 2);

  px(g, C.beigeDark, 30, 42, 8, 14);
  px(g, C.beige, 31, 43, 6, 12);
  px(g, 0x101018, 32, 45, 4, 2);
  px(g, 0x6a2020, 33, 51, 2, 2);
  px(g, C.beigeDark, 32, 54, 4, 2);

  px(g, C.woodDark, 24, 40, 4, 16);
  px(g, C.wood, 25, 40, 2, 14);
  px(g, C.woodLite, 25, 40, 1, 3);
  px(g, C.woodDark, 24, 54, 4, 2);

  px(g, C.beigeDark, 28, 12, 18, 20);
  px(g, C.beige, 29, 13, 16, 18);
  px(g, 0xf0e8d8, 30, 14, 14, 2);
  px(g, C.ink, 31, 17, 12, 10);
  px(g, 0x3a88c0, 32, 18, 10, 8);
  px(g, 0x1a5070, 33, 19, 3, 6);
  px(g, C.beigeDark, 32, 28, 10, 4);
  px(g, C.beige, 34, 29, 6, 2);

  px(g, 0xc8c4bc, 28, 34, 16, 4);
  px(g, 0xa8a49c, 29, 35, 14, 2);
  px(g, C.ink, 32, 35, 1, 1);
  px(g, C.ink, 35, 35, 1, 1);
  px(g, C.ink, 38, 35, 1, 1);
  px(g, 0xc8c4bc, 46, 35, 4, 3);
  px(g, 0x8a8680, 47, 36, 2, 1);

  const wardrobe: Solid = { x: 188, y: 94, w: 32, h: 44 };
  px(g, C.woodDark, 208, 96, 12, 40);
  furn(g, 188, 94, 22, 44, C.wood, C.woodLite, C.woodDark);
  px(g, C.woodLite, 190, 98, 8, 36);
  px(g, C.woodLite, 200, 98, 8, 36);
  px(g, C.woodDark, 198, 98, 2, 36);
  px(g, C.ink, 192, 112, 2, 3);
  px(g, C.ink, 192, 124, 2, 3);

  g.fillStyle(C.matDark, 1);
  g.fillEllipse(120, 86, 78, 36);
  g.fillStyle(C.mat, 1);
  g.fillEllipse(120, 84, 74, 32);
  g.fillStyle(C.matLite, 1);
  g.fillEllipse(120, 82, 54, 20);
  g.fillStyle(C.mat, 1);
  g.fillEllipse(120, 82, 10, 5);

  const bed: Solid = { x: 20, y: 106, w: 62, h: 36 };
  furn(g, 20, 106, 62, 36, C.woodDark, C.wood, 0x8a5c28);
  px(g, C.sheetDark, 24, 110, 54, 28);
  px(g, C.sheet, 26, 112, 50, 24);
  px(g, C.sheetLite, 26, 112, 50, 7);
  px(g, C.sheetDark, 44, 122, 28, 10);
  px(g, C.pillowSh, 28, 114, 16, 10);
  px(g, C.pillow, 28, 112, 14, 10);
  px(g, C.cream, 30, 114, 8, 3);

  px(g, C.bin, 86, 126, 10, 13);
  px(g, 0x3a3a40, 87, 125, 8, 3);
  px(g, C.floorDark, 88, 130, 6, 5);

  const solids: Solid[] = [
    { x: 0, y: 0, w: 20, h: GBA_H },
    { x: 220, y: 0, w: 20, h: GBA_H },
    { x: 0, y: 0, w: GBA_W, h: 44 },
    { x: 0, y: 144, w: GBA_W, h: 16 },
    pc,
    wardrobe,
    { x: 86, y: 125, w: 10, h: 14 },
    { x: 104, y: 8, w: 52, h: 14 },
  ];

  return {
    solids,
    bed,
    pc,
    wardrobe,
    spawn: { x: 46, y: 124 },
    wake: { x: 78, y: 96 },
    door: { x: 176, y: 6, w: 28, h: 34 },
    doorSpawn: { x: 162, y: 62 },
    poster: { x: 58, y: 8, w: 40, h: 28 },
    shelf: { x: 104, y: 8, w: 52, h: 14 },
  };
}
