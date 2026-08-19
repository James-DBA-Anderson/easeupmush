import Phaser from "phaser";

const FW = 32;
const FH = 32;

const PAL: Record<string, number> = {
  k: 0x1a1410,
  h: 0x6a6a70,
  H: 0x8a8a90,
  n: 0x4a4a50,
  s: 0xe8c8a0,
  S: 0xc4a078,
  w: 0xf4f0e8,
  W: 0xd8d4cc,
  e: 0x201810,
  c: 0x3a78a8,
  t: 0x3a3a48,
  T: 0x282834,
  o: 0x4a3828,
  O: 0x2a2018,
  g: 0x88c0d8,
};

/** Professor Choke — lab coat, glasses, thinning hair. */
const idleDown = [
  "....kkkkkk....",
  "...khHHHHHnk...",
  "..knhhhhhhhnk..",
  ".knhsssssshnk.",
  ".khsswesewssk.",
  ".khssggggsshk.",
  ".khsssssssshk.",
  "..khsssssshk..",
  "...kssssssk...",
  "...kcWWWWck...",
  "..kwWWWWWWwk..",
  ".kwWWWWWWWWwk.",
  ".kwWWwWWwWWwk.",
  ".kswWWWWWWWsk.",
  ".kwWWWWWWWWwk.",
  "..kWWWWWWWWk..",
  "...kttttttk...",
  "...ktTttTtk...",
  "...kttttttk...",
  "...koookook...",
  "....kOkkOk....",
];

export function ensureChoke(scene: Phaser.Scene): void {
  if (scene.textures.exists("choke")) return;
  const g = scene.add.graphics().setVisible(false);
  idleDown.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = PAL[row[x]];
      if (color === undefined) continue;
      g.fillStyle(color, 1);
      g.fillRect(8 + x, 6 + y, 1, 1);
    }
  });
  g.generateTexture("choke", FW, FH);
  g.destroy();
}
