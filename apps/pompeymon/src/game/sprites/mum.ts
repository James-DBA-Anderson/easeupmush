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
};

const idleDown = [
  "....kkkkkk....",
  "...khHHHHHk...",
  "..khhhhhhhhk..",
  ".khhhhhhhhhhk.",
  ".khhsssssshhk.",
  ".khsswesewssk.",
  ".khsssssssshk.",
  "..khsssssshk..",
  "...kssssssk...",
  "...kcjjjjck...",
  "..kjlllllljk..",
  ".kjjjjjjjjjjk.",
  ".kjjjJjjJjJjk.",
  ".ksjjjjjjjjsk.",
  ".kjjjjjjjjjjk.",
  "..kJjjjjjjJk..",
  "...kttttttk...",
  "...ktTttTtk...",
  "...kttttttk...",
  "...koookook...",
  "....kOkkOk....",
];

export function ensureMum(scene: Phaser.Scene): void {
  if (scene.textures.exists("mum")) return;
  const g = scene.add.graphics().setVisible(false);
  idleDown.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = PAL[row[x]];
      if (color === undefined) continue;
      g.fillStyle(color, 1);
      g.fillRect(8 + x, 6 + y, 1, 1);
    }
  });
  g.generateTexture("mum", FW, FH);
  g.destroy();
}
