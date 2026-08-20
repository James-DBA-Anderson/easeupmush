import Phaser from "phaser";

const FW = 32;
const FH = 32;

const PAL: Record<string, number> = {
  k: 0x1a1410,
  h: 0x3a2414,
  H: 0x5a3820,
  n: 0x2a1c10,
  s: 0xe8b888,
  S: 0xc49068,
  w: 0xfff8f0,
  e: 0x201810,
  j: 0x8a3048,
  J: 0x5a2030,
  l: 0xb84860,
  c: 0x6a2438,
  t: 0x2a3048,
  T: 0x1c2034,
  o: 0x6a3820,
  O: 0x4a2414,
  /** Wine glass / hand prop */
  g: 0xc8e0e8,
  G: 0x68a0b0,
};

/**
 * Side lean on the kitchen units — elbow on the worktop, wine in hand, tip toward the counter.
 * Drawn facing right (counter on the right); flip in scene if needed.
 */
const leanSide = [
  "..............",
  "......kkkk....",
  ".....khHHHk...",
  "....khhhhhhk..",
  "...khhsssshk..",
  "...khsweshk...",
  "...khssssshk..",
  "....ksssssk...",
  "...kcjjjjck...",
  "..ksjllljJk...",
  ".kjjjjjjjJk...",
  "kjSjjjjjjJk...",
  "kSSjjjjjJjk...",
  ".kSjjjjjjjk..",
  "..kjjjjjjtk..",
  "...kjjjjttk..",
  "....kjjtttk..",
  ".....ktttOk..",
  "......ktOOk..",
  ".......kOOk..",
  "........kk...",
];

export function ensureMum(scene: Phaser.Scene): void {
  if (scene.textures.exists("mum")) scene.textures.remove("mum");
  const g = scene.add.graphics().setVisible(false);
  leanSide.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = PAL[row[x]];
      if (color === undefined) continue;
      g.fillStyle(color, 1);
      g.fillRect(8 + x, 6 + y, 1, 1);
    }
  });
  // Wine glass in the propped hand (near counter)
  g.fillStyle(PAL.G, 1);
  g.fillRect(22, 18, 3, 4);
  g.fillStyle(PAL.g, 1);
  g.fillRect(22, 17, 3, 2);
  g.fillStyle(PAL.k, 1);
  g.fillRect(23, 21, 1, 3);
  g.generateTexture("mum", FW, FH);
  g.destroy();
}
