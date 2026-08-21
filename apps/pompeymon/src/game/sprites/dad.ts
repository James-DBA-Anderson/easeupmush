import Phaser from "phaser";

const FW = 48;
const FH = 20;

const PAL: Record<string, number> = {
  k: 0x1a1410,
  h: 0x2a1c10,
  H: 0x4a3020,
  s: 0xe0b080,
  S: 0xc48860,
  e: 0x201810,
  j: 0x2a4868,
  J: 0x1a3048,
  t: 0x3a3a48,
  T: 0x242430,
  o: 0x4a2818,
  O: 0x2a1810,
};

/**
 * Passed out on the sofa — on his back, mouth open, arm dangling with a can.
 * Head on the right, feet left (along the seat).
 */
const sprawled = [
  "................................................",
  "......................kkkk......................",
  ".....................khHHHk.....................",
  "....................khsssshk....................",
  "....................khsSeShk....................",
  "....................khsssshk....................",
  ".....................ksssssk..kj................",
  "..........kjjjjjjjjjjjssssjjjjJk................",
  ".........kjJJJJJJJJJJJJJJJJJJJJk................",
  "........kjJJJJJJJJJJJJJJJJJJJJJk................",
  ".......kjttJJJJJJJJJJJJJJJJJJttk................",
  "......kjttt.................tttk................",
  ".....kjOtO...................OtOk...............",
  ".....kOOO.....................OOk...............",
  "......kk.......................kk...............",
];

export function ensureDad(scene: Phaser.Scene): void {
  if (scene.textures.exists("dad")) scene.textures.remove("dad");
  const g = scene.add.graphics().setVisible(false);
  sprawled.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = PAL[row[x]];
      if (color === undefined) continue;
      g.fillStyle(color, 1);
      g.fillRect(x, 2 + y, 1, 1);
    }
  });
  // Open mouth (snoring)
  g.fillStyle(PAL.e, 1);
  g.fillRect(28, 7, 2, 1);
  // Can in dangling hand
  g.fillStyle(0xc45c28, 1);
  g.fillRect(40, 9, 3, 4);
  g.fillStyle(0xe8e0d0, 1);
  g.fillRect(40, 8, 3, 1);
  g.generateTexture("dad", FW, FH);
  g.destroy();
}
