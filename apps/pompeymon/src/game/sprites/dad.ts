import Phaser from "phaser";

const FW = 56;
const FH = 24;

const PAL: Record<string, number> = {
  k: 0x1a1410,
  h: 0x2a1c10,
  H: 0x4a3020,
  s: 0xe8b888,
  S: 0xc49068,
  e: 0x201810,
  w: 0xfff0e0,
  j: 0x2a4868,
  J: 0x1a3048,
  l: 0x3a6890,
  t: 0x3a3a48,
  T: 0x242430,
  o: 0x4a2818,
  O: 0x2a1810,
  b: 0xc45c28,
  B: 0xe8d8b0,
};

/**
 * Passed out on the sofa — clearer head, belly, dangling arm + can, shoes off-ish.
 * Head on the right, feet left.
 */
const sprawled = [
  "........................................................",
  "..........................kkkk..........................",
  ".........................khHHHk.........................",
  "........................khsssshk........................",
  "........................khsweShk........................",
  "........................khssSshk........................",
  ".........................ksssssk...kj...................",
  ".............kjjjjjjjjjjjjssssljjjjJk...................",
  "............kjJJJJJJJJJJJJJJJJllllJJk...................",
  "...........kjJJJJJJJJJJJJJJJJJJJJJJJk...................",
  "..........kjttJJJJJJJJJJJJJJJJJJJJttk...................",
  ".........kjtttJ.................Jtttk...................",
  "........kjOtOk...................kOtOk..................",
  "........kOOO......................OOOk..................",
  ".........kk.........................kk..................",
];

export function ensureDad(scene: Phaser.Scene): void {
  if (scene.textures.exists("dad")) scene.textures.remove("dad");
  const g = scene.add.graphics().setVisible(false);
  sprawled.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === ".") continue;
      if (ch === "w") {
        g.fillStyle(PAL.s, 1);
        g.fillRect(x, 3 + y, 1, 1);
        continue;
      }
      const color = PAL[ch];
      if (color === undefined) continue;
      g.fillStyle(color, 1);
      g.fillRect(x, 3 + y, 1, 1);
    }
  });
  // Open mouth / snore
  g.fillStyle(PAL.e, 1);
  g.fillRect(32, 8, 3, 2);
  // Nose
  g.fillStyle(PAL.S, 1);
  g.fillRect(31, 7, 2, 1);
  // Dangling arm + lager can
  g.fillStyle(PAL.s, 1);
  g.fillRect(46, 10, 3, 2);
  g.fillStyle(PAL.b, 1);
  g.fillRect(48, 11, 4, 6);
  g.fillStyle(PAL.B, 1);
  g.fillRect(48, 10, 4, 2);
  g.fillStyle(PAL.k, 1);
  g.fillRect(49, 12, 2, 1);
  // Belly rise hint
  g.fillStyle(PAL.l, 1);
  g.fillRect(22, 11, 8, 2);
  g.generateTexture("dad", FW, FH);
  g.destroy();
}
