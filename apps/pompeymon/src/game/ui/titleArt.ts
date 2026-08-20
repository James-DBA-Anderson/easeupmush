import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";

function px(g: Phaser.GameObjects.Graphics, c: number, x: number, y: number, w = 1, h = 1): void {
  g.fillStyle(c, 1);
  g.fillRect(x, y, w, h);
}

function disc(g: Phaser.GameObjects.Graphics, c: number, cx: number, cy: number, r: number): void {
  const r2 = r * r;
  for (let dy = -r; dy <= r; dy += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      if (dx * dx + dy * dy <= r2) px(g, c, cx + dx, cy + dy);
    }
  }
}

/** Harbour daytime — looking south: Pompey, Solent + IoW, canal + bridge. */
export function drawTitleSkyline(g: Phaser.GameObjects.Graphics): void {
  const skyTop = 0x4aa0e0;
  const skyMid = 0x78c4f0;
  const skyLo = 0xc0e8fc;

  for (let i = 0; i < 5; i += 1) {
    const t = i / 4;
    px(g, mix(skyTop, skyLo, t), 0, i * 10, GBA_W, 11);
  }
  px(g, skyMid, 0, 48, GBA_W, 8);

  // Round sun
  disc(g, 0xfff4b8, 24, 18, 8);
  disc(g, 0xffe868, 24, 18, 6);
  disc(g, 0xfff8e0, 24, 18, 3);

  // Far Pompey land strip + Spinnaker (viewer looks south from north of town)
  px(g, 0x6a9888, 0, 52, GBA_W, 12);
  px(g, 0x5a8878, 0, 52, GBA_W, 2);
  farRow(g, 54);
  spinnakerFar(g, 158, 44);

  // Nearer harbour frontage — Pompey
  terrace(g, 2, 62, 36, 22, 0xd0c0a8, 0x3a3428);
  terrace(g, 36, 66, 30, 18, 0xb87060, 0x3a2820);
  shop(g, 64, 60, 0xc8b8a0);
  terrace(g, 96, 64, 32, 20, 0xc88870, 0x3a2820);
  warehouse(g, 126, 62);
  px(g, 0x6a9888, 154, 62, 24, 22);
  px(g, 0x588878, 154, 62, 24, 2);
  for (let i = 0; i < 3; i += 1) px(g, 0x4a7068, 158 + i * 6, 68, 3, 4);
  terrace(g, 176, 64, 28, 20, 0xb88870, 0x3a2820);
  terrace(g, 208, 64, 30, 20, 0xd0c0a8, 0x3a3428);

  // Solent — sea south of Pompey; Isle of Wight sits on that water
  const water = 0x3890c0;
  const waterL = 0x78c8e0;
  px(g, water, 0, 84, GBA_W, 24);
  px(g, 0x2a7088, 0, 84, GBA_W, 1);
  isleOfWight(g, 72, 86);
  px(g, waterL, 10, 96, 20, 1);
  px(g, waterL, 48, 100, 16, 1);
  px(g, waterL, 160, 98, 18, 1);
  px(g, waterL, 200, 94, 14, 1);
  px(g, 0x68b8d0, 30, 102, 12, 1);
  px(g, 0x68b8d0, 190, 104, 10, 1);

  // Canal (same band the quay/road used: y 108 → bottom)
  canal(g, 108, GBA_H - 108);
  // Bridge over the canal toward Pompey
  canalBridge(g, 72, 108);
}

/** Green Isle of Wight — low diamond silhouette on the horizon. */
function isleOfWight(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  const dark = 0x2a5838;
  const mid = 0x4a8850;
  const lit = 0x68a868;
  const chalk = 0xd8d0b8;
  // Diamond / diamond-ish island mass
  px(g, dark, x + 10, y + 2, 36, 8);
  px(g, mid, x + 12, y + 2, 32, 6);
  px(g, lit, x + 14, y + 2, 28, 2);
  // West tip
  px(g, dark, x + 4, y + 5, 8, 4);
  px(g, mid, x + 6, y + 5, 6, 3);
  // East tip toward Pompey
  px(g, dark, x + 44, y + 4, 10, 5);
  px(g, mid, x + 44, y + 4, 8, 3);
  // Soft downs bumps
  px(g, lit, x + 18, y + 1, 8, 2);
  px(g, lit, x + 30, y + 1, 6, 2);
  px(g, dark, x + 22, y, 4, 2);
  // Chalk cliff hint on the south edge
  px(g, chalk, x + 16, y + 8, 14, 1);
  px(g, 0xb8b098, x + 18, y + 9, 10, 1);
}

/** Canal fill — same footprint as the old quay road. */
function canal(g: Phaser.GameObjects.Graphics, y: number, h: number): void {
  const deep = 0x286888;
  const mid = 0x3a98b0;
  const lit = 0x68c0d0;
  const bank = 0x4a5a48;
  const bankL = 0x6a7a58;
  px(g, deep, 0, y, GBA_W, h);
  px(g, bank, 0, y, GBA_W, 2);
  px(g, bankL, 0, y, GBA_W, 1);
  px(g, mid, 0, y + 2, GBA_W, 3);
  // Ripples
  for (let i = 0; i < 7; i += 1) {
    const ry = y + 8 + ((i * 7) % (h - 12));
    const rx = (i * 37 + 12) % (GBA_W - 24);
    px(g, lit, rx, ry, 14 + (i % 3) * 4, 1);
  }
  px(g, 0x58b0c8, 20, y + 18, 18, 1);
  px(g, 0x58b0c8, 90, y + 28, 22, 1);
  px(g, 0x58b0c8, 160, y + 22, 16, 1);
  px(g, 0x58b0c8, 200, y + 36, 20, 1);
  // Far bank lip under the harbour water
  px(g, 0x3a4a38, 0, y, GBA_W, 1);
}

/**
 * Bridge spanning the canal toward Pompey.
 * Deck sits where the kid / mons stand (~y 118–126).
 */
function canalBridge(g: Phaser.GameObjects.Graphics, x: number, canalY: number): void {
  const ink = 0x2a2820;
  const stone = 0x8a8070;
  const stoneL = 0xa89880;
  const stoneD = 0x5a5448;
  const rail = 0x3a3830;
  const deck = 0x6a5a48;
  const deckL = 0x8a7860;
  const w = 96;
  const deckY = canalY + 10;
  const deckH = 8;

  // Piers in the canal
  for (const px0 of [x + 18, x + 48, x + 78]) {
    px(g, ink, px0 - 1, canalY + 4, 8, GBA_H - (canalY + 4));
    px(g, stoneD, px0, canalY + 4, 6, GBA_H - (canalY + 4));
    px(g, stone, px0, canalY + 4, 6, 3);
    // Arch cut suggestion
    px(g, 0x286888, px0 - 4, canalY + 16, 14, 10);
    px(g, 0x3a98b0, px0 - 3, canalY + 17, 12, 8);
  }

  // Approach ramps toward Pompey (up) and Cosham side (down / foreground)
  px(g, ink, x - 10, deckY + 2, 14, deckH + 2);
  px(g, deck, x - 9, deckY + 3, 12, deckH);
  px(g, deckL, x - 9, deckY + 3, 12, 1);
  px(g, ink, x + w - 4, deckY - 2, 18, deckH + 4);
  px(g, deck, x + w - 3, deckY - 1, 16, deckH + 2);
  px(g, deckL, x + w - 3, deckY - 1, 16, 1);
  // Ramp up into Pompey frontage
  px(g, ink, x + w + 10, canalY - 2, 14, 14);
  px(g, deck, x + w + 11, canalY - 1, 12, 12);
  px(g, deckL, x + w + 11, canalY - 1, 12, 1);
  px(g, 0x5a4a3a, x + w + 14, canalY + 4, 6, 8);

  // Main deck
  px(g, ink, x, deckY, w, deckH + 2);
  px(g, deck, x + 1, deckY + 1, w - 2, deckH);
  px(g, deckL, x + 1, deckY + 1, w - 2, 2);
  px(g, 0x5a4a3a, x + 1, deckY + deckH, w - 2, 1);
  // Plank lines
  for (let lx = x + 6; lx < x + w - 4; lx += 8) px(g, 0x5a4a3a, lx, deckY + 2, 1, deckH - 2);

  // Railings
  px(g, rail, x, deckY - 4, w, 2);
  px(g, stoneL, x, deckY - 3, w, 1);
  for (let lx = x + 4; lx < x + w; lx += 8) {
    px(g, rail, lx, deckY - 6, 2, 4);
    px(g, stoneL, lx, deckY - 6, 2, 1);
  }
  px(g, rail, x, deckY + deckH + 1, w, 2);
  for (let lx = x + 4; lx < x + w; lx += 8) px(g, rail, lx, deckY + deckH - 1, 2, 4);
}

function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  return (
    (Math.round(ar + (br - ar) * t) << 16) |
    (Math.round(ag + (bg - ag) * t) << 8) |
    Math.round(ab + (bb - ab) * t)
  );
}

/** Tiny distant roof-line on the Pompey bank. */
function farRow(g: Phaser.GameObjects.Graphics, y: number): void {
  const ink = 0x3a4840;
  const mid = 0x7a9088;
  const lit = 0x98b0a8;
  const bumps = [
    [8, 4, 6],
    [22, 3, 5],
    [40, 5, 7],
    [58, 3, 4],
    [78, 4, 6],
    [100, 5, 7],
    [128, 4, 6],
    [148, 3, 5],
    [190, 5, 7],
    [210, 3, 5],
    [222, 4, 6],
  ];
  for (const [bx, w, h] of bumps) {
    px(g, ink, bx, y + 2, w + 1, h);
    px(g, mid, bx, y + 2, w, h - 1);
    px(g, lit, bx, y + 2, w, 1);
  }
}

/** Distant Spinnaker — ~12px tall on the Pompey bank. */
function spinnakerFar(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  const sail = 0xf0f4f8;
  const sailD = 0xb8c4d0;
  const mast = 0x3a4858;
  px(g, mast, x + 4, y, 1, 14);
  g.fillStyle(sailD, 1);
  g.fillTriangle(x + 4, y + 2, x + 4, y + 12, x + 1, y + 10);
  g.fillStyle(sail, 1);
  g.fillTriangle(x + 5, y + 1, x + 5, y + 12, x + 10, y + 9);
  px(g, 0xffffff, x + 3, y, 3, 1);
  px(g, 0x4a5460, x + 2, y + 13, 5, 1);
}

function terrace(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: number,
  ink: number,
): void {
  const roof = mix(fill, 0x2a2018, 0.5);
  const lip = mix(fill, 0xffffff, 0.25);
  const shade = mix(fill, 0x101018, 0.28);
  const brick = mix(fill, 0x401810, 0.15);
  px(g, ink, x - 2, y + 2, w + 4, 4);
  px(g, roof, x - 1, y + 2, w + 2, 3);
  px(g, lip, x - 1, y + 2, w + 2, 1);
  const cx = x + Math.floor(w * 0.72);
  px(g, ink, cx, y - 2, 5, 6);
  px(g, 0x6a5850, cx + 1, y - 1, 3, 4);
  px(g, 0x8a7060, cx + 1, y - 1, 3, 1);
  px(g, shade, x, y + 6, w, h - 6);
  px(g, fill, x, y + 6, w - 3, h - 7);
  for (let by = y + 8; by < y + h - 4; by += 3) {
    for (let bx = x + 2; bx < x + w - 5; bx += 4) {
      if ((bx + by) % 8 < 4) px(g, brick, bx, by, 2, 1);
    }
  }
  px(g, ink, x, y + h - 2, w, 2);
  for (let xx = x + 3; xx < x + w - 7; xx += 8) {
    px(g, 0x1a3048, xx, y + 8, 5, 5);
    px(g, 0x58a0c0, xx + 1, y + 9, 3, 1);
    px(g, 0x88c8e0, xx + 1, y + 9, 1, 1);
    px(g, ink, xx + 2, y + 8, 1, 5);
    px(g, ink, xx, y + 10, 5, 1);
    if (y + 16 < y + h - 4) {
      px(g, 0x1a3048, xx, y + 15, 5, 4);
      px(g, 0x58a0c0, xx + 1, y + 16, 3, 1);
      px(g, ink, xx + 2, y + 15, 1, 4);
    }
  }
  const dx = x + Math.floor(w / 2) - 2;
  px(g, 0x2a2418, dx - 1, y + h - 3, 7, 2);
  px(g, 0x3a3028, dx, y + h - 11, 5, 9);
  px(g, 0x5a4838, dx + 1, y + h - 10, 3, 7);
  px(g, 0xc8a040, dx + 3, y + h - 7, 1, 1);
}

function shop(g: Phaser.GameObjects.Graphics, x: number, y: number, fill: number): void {
  const ink = 0x2a2830;
  const shade = mix(fill, 0x101018, 0.2);
  px(g, ink, x, y + 4, 34, 24);
  px(g, shade, x + 1, y + 5, 32, 22);
  px(g, fill, x + 1, y + 5, 30, 20);
  px(g, 0x3a5060, x + 1, y, 32, 6);
  px(g, 0x5a7080, x + 2, y + 1, 30, 4);
  px(g, 0xf0a23a, x + 3, y + 2, 28, 2);
  px(g, 0x1a3048, x + 3, y + 10, 12, 8);
  px(g, 0x1a3048, x + 17, y + 10, 12, 8);
  px(g, 0x58a0c0, x + 4, y + 11, 10, 2);
  px(g, 0x58a0c0, x + 18, y + 11, 10, 2);
  px(g, 0x88c8e0, x + 4, y + 11, 2, 1);
  px(g, ink, x + 8, y + 10, 1, 8);
  px(g, ink, x + 22, y + 10, 1, 8);
  px(g, 0x3a2820, x + 13, y + 20, 6, 8);
  px(g, 0xc8a040, x + 16, y + 24, 1, 1);
}

function warehouse(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  px(g, 0x2a3038, x, y + 6, 28, 26);
  px(g, 0x6a7078, x + 1, y + 7, 26, 24);
  px(g, 0x4a5058, x + 1, y + 7, 26, 3);
  px(g, 0x8a9098, x + 8, y, 12, 8);
  px(g, 0x3a4858, x + 4, y + 12, 6, 5);
  px(g, 0x3a4858, x + 12, y + 12, 6, 5);
  px(g, 0x3a4858, x + 20, y + 12, 5, 5);
  px(g, 0x2a2830, x + 10, y + 22, 8, 10);
  px(g, 0x3a3830, x + 11, y + 23, 6, 8);
}
