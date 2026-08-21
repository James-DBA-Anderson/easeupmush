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

/** Harbour daytime — looking south from north of Pompey. */
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

  // Far south — Solent + Isle of Wight on the horizon
  const water = 0x3890c0;
  const waterL = 0x78c8e0;
  px(g, water, 0, 48, GBA_W, 18);
  px(g, 0x2a7088, 0, 48, GBA_W, 1);
  isleOfWight(g, 78, 50);
  px(g, waterL, 12, 58, 18, 1);
  px(g, waterL, 160, 60, 16, 1);
  px(g, waterL, 200, 56, 14, 1);

  // Pompey land strip + Spinnaker (south of the canal, mid-distance)
  px(g, 0x6a9888, 0, 64, GBA_W, 8);
  px(g, 0x5a8878, 0, 64, GBA_W, 2);
  farRow(g, 66);
  spinnakerFar(g, 158, 56);

  // Pompey harbour frontage — road will run into this
  terrace(g, 2, 70, 36, 22, 0xd0c0a8, 0x3a3428);
  terrace(g, 36, 74, 28, 18, 0xb87060, 0x3a2820);
  shop(g, 62, 68, 0xc8b8a0);
  // Gap for the road mouth into Pompey (~x 100–128)
  terrace(g, 128, 72, 28, 20, 0xc88870, 0x3a2820);
  warehouse(g, 154, 70);
  terrace(g, 180, 72, 28, 20, 0xb88870, 0x3a2820);
  terrace(g, 206, 72, 32, 20, 0xd0c0a8, 0x3a3428);

  // Quay / street edge under the buildings
  px(g, 0x5a5448, 0, 90, GBA_W, 6);
  px(g, 0x6a6458, 0, 90, GBA_W, 1);
  px(g, 0x4a4838, 0, 94, GBA_W, 2);

  // Canal between Cosham grass and Pompey
  const canalY = 96;
  const canalH = 18;
  canal(g, canalY, canalH);

  // Foreground grass (Cosham side — nearest the viewer)
  grass(g, 0, canalY + canalH, GBA_W, GBA_H - (canalY + canalH));

  // Road from bottom of screen → over grass → canal bridge → into Pompey
  southRoad(g, 104, canalY, canalH);
}

/** Cosham-side grass in the foreground. */
function grass(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  const mid = 0x4a8850;
  const dark = 0x2a5838;
  const lit = 0x68a868;
  const tip = 0x88c878;
  px(g, mid, x, y, w, h);
  px(g, dark, x, y, w, 2);
  for (let gy = y + 4; gy < y + h; gy += 5) {
    for (let gx = x + ((gy * 3) % 7); gx < x + w; gx += 9) {
      px(g, lit, gx, gy, 2, 2);
      px(g, tip, gx + 1, gy - 1, 1, 2);
    }
  }
  for (let i = 0; i < 18; i += 1) {
    const bx = x + 4 + ((i * 41) % (w - 10));
    const by = y + 6 + ((i * 17) % (h - 10));
    px(g, dark, bx, by, 1, 3);
    px(g, tip, bx, by, 1, 1);
  }
}

/**
 * N–S road: bottom of screen (near) → grass → bridge over canal → into Pompey.
 * `x` is the left edge of the carriageway.
 */
function southRoad(
  g: Phaser.GameObjects.Graphics,
  x: number,
  canalY: number,
  canalH: number,
): void {
  const ink = 0x2a2820;
  const asphalt = 0x4a4840;
  const asphaltL = 0x6a6860;
  const line = 0xe8d8a0;
  const kerb = 0x8a8070;
  const w = 28;
  const grassTop = canalY + canalH;

  // Road on grass from bottom of screen up to the canal
  px(g, ink, x - 1, grassTop, w + 2, GBA_H - grassTop);
  px(g, asphalt, x, grassTop, w, GBA_H - grassTop);
  px(g, asphaltL, x, grassTop, w, 1);
  px(g, kerb, x - 2, grassTop, 2, GBA_H - grassTop);
  px(g, kerb, x + w, grassTop, 2, GBA_H - grassTop);
  // Centre dashes toward the viewer
  for (let dy = grassTop + 4; dy < GBA_H - 2; dy += 6) {
    px(g, line, x + Math.floor(w / 2) - 1, dy, 2, 3);
  }

  // Bridge over the canal (road continues, with rails + piers)
  const deckY = canalY + 4;
  const deckH = canalH - 4;
  // Piers
  for (const px0 of [x + 4, x + 12, x + 20]) {
    px(g, ink, px0, canalY + 2, 5, canalH);
    px(g, 0x5a5448, px0 + 1, canalY + 2, 3, canalH);
    px(g, 0x286888, px0 - 3, canalY + 8, 10, 6);
  }
  // Deck = road over water
  px(g, ink, x - 3, deckY, w + 6, deckH + 2);
  px(g, asphalt, x - 2, deckY + 1, w + 4, deckH);
  px(g, asphaltL, x - 2, deckY + 1, w + 4, 2);
  px(g, line, x + Math.floor(w / 2) - 1, deckY + 4, 2, deckH - 6);
  // Rails
  px(g, 0x3a3830, x - 4, deckY - 2, w + 8, 2);
  px(g, 0x3a3830, x - 4, deckY + deckH, w + 8, 2);
  for (let lx = x - 2; lx < x + w + 2; lx += 6) {
    px(g, 0x3a3830, lx, deckY - 4, 2, 4);
    px(g, 0x3a3830, lx, deckY + deckH - 2, 2, 4);
  }

  // Road into Pompey (above the canal, through the building gap)
  const pompeyY = 72;
  px(g, ink, x - 1, pompeyY, w + 2, canalY - pompeyY + 2);
  px(g, asphalt, x, pompeyY, w, canalY - pompeyY + 2);
  px(g, asphaltL, x, pompeyY, w, 1);
  px(g, kerb, x - 2, pompeyY, 2, canalY - pompeyY);
  px(g, kerb, x + w, pompeyY, 2, canalY - pompeyY);
  for (let dy = pompeyY + 4; dy < canalY; dy += 5) {
    px(g, line, x + Math.floor(w / 2) - 1, dy, 2, 2);
  }
  // Mouth under the terraces
  px(g, 0x3a3830, x - 4, 88, w + 8, 4);
  px(g, asphalt, x - 2, 89, w + 4, 3);
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

/** Canal fill between Cosham grass and Pompey. */
function canal(g: Phaser.GameObjects.Graphics, y: number, h: number): void {
  const deep = 0x286888;
  const mid = 0x3a98b0;
  const lit = 0x68c0d0;
  const bank = 0x4a5a48;
  const bankL = 0x6a7a58;
  px(g, deep, 0, y, GBA_W, h);
  px(g, bank, 0, y, GBA_W, 2);
  px(g, bankL, 0, y, GBA_W, 1);
  px(g, mid, 0, y + 2, GBA_W, Math.min(3, h - 2));
  for (let i = 0; i < 5; i += 1) {
    const ry = y + 6 + ((i * 5) % Math.max(1, h - 8));
    const rx = (i * 47 + 12) % (GBA_W - 24);
    px(g, lit, rx, ry, 14 + (i % 3) * 4, 1);
  }
  // Far bank under Pompey
  px(g, 0x3a4a38, 0, y, GBA_W, 1);
  // Near bank toward grass
  px(g, bank, 0, y + h - 2, GBA_W, 2);
  px(g, bankL, 0, y + h - 1, GBA_W, 1);
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
