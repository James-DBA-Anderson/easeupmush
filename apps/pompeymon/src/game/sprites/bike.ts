import Phaser from "phaser";

const PAL: Record<string, number> = {
  k: 0x1a1410,
  m: 0xd0d8e0,
  M: 0x8a949c,
  r: 0x1a1a20,
  R: 0x3a3a44,
  u: 0xf0f4f8,
  b: 0x3a90d0,
  y: 0xf0c030,
  Y: 0xc89020,
};

function blit(g: Phaser.GameObjects.Graphics, ox: number, oy: number, rows: string[]): void {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = PAL[row[x]];
      if (c === undefined) continue;
      g.fillStyle(c, 1);
      g.fillRect(ox + x, oy + y, 1, 1);
    }
  });
}

const PARKED = [
  "........................",
  "........y...............",
  ".......yYy....b.........",
  "........y....bMb........",
  "....RrR.mmmmmmm.RrR.....",
  "...R.u.R.m.M.m.R.u.R....",
  "...R...RmmmmmmmR...R....",
  "....RrR.........RrR.....",
];

const PARKED_LOCK = [
  "........................",
  "........y...............",
  ".......yYy....b.........",
  "........y....bMb........",
  "....RrR.mmmmmmm.RrR.....",
  "...R.u.R.m.M.m.R.u.R....",
  "...RYY.RmmmmmmmR...R....",
  "....RrR.........RrR.....",
];

const WHEEL = [
  "............",
  "...RrR......",
  "..R.u.R.YY..",
  "..R...RYY...",
  "...RrR......",
];

export function ensureBikeArt(scene: Phaser.Scene): void {
  paint(scene, "bike-park", 24, 8, PARKED);
  paint(scene, "bike-lock", 24, 8, PARKED_LOCK);
  paint(scene, "bike-wheel", 12, 5, WHEEL);
}

function paint(scene: Phaser.Scene, key: string, w: number, h: number, rows: string[]): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const g = scene.add.graphics().setVisible(false);
  blit(g, 0, 0, rows);
  g.generateTexture(key, w, h);
  g.destroy();
}
