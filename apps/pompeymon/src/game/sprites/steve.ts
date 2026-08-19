import Phaser from "phaser";

const FW = 32;
const FH = 32;

const PAL: Record<string, number> = {
  k: 0x1a1410,
  h: 0x5a3818,
  H: 0x7a5428,
  s: 0xf0c8a0,
  S: 0xd4a078,
  w: 0xfff8f0,
  e: 0x201810,
  j: 0x2a8a48,
  J: 0x1a6834,
  l: 0x48b060,
  c: 0x1c5a30,
  t: 0x2c3048,
  T: 0x1c2034,
  o: 0xd45c28,
  O: 0x8a3018,
  b: 0x3a90d0,
  B: 0x2468a0,
  r: 0xc8d0d8,
  R: 0x1a1a20,
  y: 0xf0c030,
};

/** Steve on a new BMX, side-on, facing right (flipX to face the player's house). */
const art = [
  "................",
  "......kkkkkk....",
  ".....khHHHHHk...",
  "....knhhhhhhnk..",
  "....khsswesesk..",
  "....kssssssssk..",
  ".....kssssssk...",
  ".....kcjjjjck...",
  "....kjlllllljk..",
  "...kjjjJjjJjjk..",
  "..R.kjjjjjjk.R..",
  ".RrR.kttttk.RrR.",
  ".R R.bBBBbb.R R.",
  ".RrRbbByyBbbRrR.",
  "..R..bBBBb...R..",
  ".....koooko.....",
  "......kOkO......",
];

export function ensureSteve(scene: Phaser.Scene): void {
  if (scene.textures.exists("steve")) return;
  const g = scene.add.graphics().setVisible(false);
  art.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = PAL[row[x]];
      if (color === undefined) continue;
      g.fillStyle(color, 1);
      g.fillRect(8 + x, 8 + y, 1, 1);
    }
  });
  g.generateTexture("steve", FW, FH);
  g.destroy();
}
