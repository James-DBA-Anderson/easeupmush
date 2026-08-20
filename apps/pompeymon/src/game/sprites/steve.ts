import Phaser from "phaser";

export const STEVE_FW = 40;
export const STEVE_FH = 32;

const PAL: Record<string, number> = {
  k: 0x1a1410,
  h: 0x5a3818,
  H: 0x7a5428,
  n: 0x2a1c10,
  s: 0xf0c8a0,
  S: 0xd4a078,
  w: 0xfff8f0,
  e: 0x201810,
  /** Green track top */
  j: 0x2a9a48,
  J: 0x1a7034,
  l: 0x48c060,
  c: 0x1c5a30,
  /** Trousers */
  t: 0x2c3048,
  T: 0x1c2034,
  /** Trainers */
  o: 0xd45c28,
  O: 0x8a3018,
  /** BMX chrome / frame */
  m: 0xd0d8e0,
  M: 0x8a949c,
  /** Tyre */
  r: 0x1a1a20,
  R: 0x3a3a44,
  /** Hub / spokes hint */
  u: 0xf0f4f8,
  /** Blue pad / number plate vibe */
  b: 0x3a90d0,
  B: 0x2468a0,
  /** Yellow pegs / reflectors */
  y: 0xf0c030,
  Y: 0xc89020,
};

function padRow(row: string, w: number): string {
  if (row.length >= w) return row.slice(0, w);
  const left = Math.floor((w - row.length) / 2);
  return ".".repeat(left) + row + ".".repeat(w - row.length - left);
}

function blit(g: Phaser.GameObjects.Graphics, ox: number, oy: number, rows: string[]): void {
  const w = Math.max(...rows.map((row) => row.length), 1);
  rows.forEach((raw, y) => {
    const row = padRow(raw, w);
    for (let x = 0; x < row.length; x++) {
      const color = PAL[row[x]];
      if (color === undefined) continue;
      g.fillStyle(color, 1);
      g.fillRect(ox + x, oy + y, 1, 1);
    }
  });
}

/**
 * Idle — Steve sat on a proper side-on BMX (facing right).
 * Wheels are full rings; frame reads as top/down/seat tubes.
 */
const idle = [
  "........................................",
  "...............kkkkkk..................",
  "..............khHHHHHk.................",
  ".............knhhhhhhnk................",
  ".............khsswesesk................",
  ".............kssssssssk................",
  "..............kssssssk.................",
  "..............kcjjjjck.................",
  ".............kjlllllljk................",
  "............kjjjJjjJjjk................",
  "...........kjjjjjjjjjjk................",
  "..........ksjjjjjjjjjsk....y...........",
  ".........k.ktttttttk.k...yYy...........",
  "........RrR.kttTttk.RrR..y.............",
  ".......R.u.R.bBBBb.R.u.R...............",
  ".......RrRrRbbByyBbRrRrR...............",
  "........R.R..MmmMm..R.R................",
  ".......RrRrR.koook.RrRrR...............",
  "........R.R...kOkO...R.R...............",
  ".........R.............R...............",
];

/** Pedal down / forward lean — ride A. */
const rideA = [
  "........................................",
  "..............kkkkkk...................",
  ".............khHHHHHk..................",
  "............knhhhhhhnk.................",
  "............khsswesesk.................",
  "............kssssssssk.................",
  ".............kssssssk..................",
  ".............kcjjjjck..................",
  "............kjlllllljk.................",
  "...........kjjjJjjJjjk.................",
  "..........kjjjjjjjjjjk.....y...........",
  ".........ksjjjjjjjjjsk....yYy..........",
  "........k.ktttttttk.k.....y............",
  ".......RrR.kttTttk.RrR.................",
  "......R.u.R.bBBBb.R.u.R................",
  "......R.R.RMmmByyMmR.R.R...............",
  ".......RrR..koook..RrR.................",
  "........R....kOkO....R.................",
  ".......RrR..........RrR................",
  "........R............R.................",
];

/** Pedal up / hop — ride B. */
const rideB = [
  "........................................",
  ".............kkkkkk....................",
  "............khHHHHHk...................",
  "...........knhhhhhhnk..................",
  "...........khsswesesk..................",
  "...........kssssssssk..................",
  "............kssssssk...................",
  "............kcjjjjck...................",
  "...........kjlllllljk..................",
  "..........kjjjJjjJjjk......y...........",
  ".........kjjjjjjjjjjk.....yYy..........",
  "........ksjjjjjjjjjsk......y...........",
  ".......k.ktttttttk.k...................",
  "......RrR.kttTttk.RrR..................",
  ".....R.u.RbBBBbbBbR.u.R................",
  ".....RrRrMmmByyBmmRrRrR................",
  "......R.R..koook...R.R.................",
  ".....RrRrR..kOkO..RrRrR................",
  "......R.R..........R.R.................",
  ".......R............R..................",
];

/** Wheel spin C — spokes rotated. */
const rideC = [
  "........................................",
  "..............kkkkkk...................",
  ".............khHHHHHk..................",
  "............knhhhhhhnk.................",
  "............khsswesesk.................",
  "............kssssssssk.................",
  ".............kssssssk..................",
  ".............kcjjjjck..................",
  "............kjlllllljk.................",
  "...........kjjjJjjJjjk....y............",
  "..........kjjjjjjjjjjk...yYy...........",
  ".........ksjjjjjjjjjsk....y............",
  "........k.ktttttttk.k..................",
  ".......R.R.kttTttk.R.R.................",
  "......Ru.uRbBBBbbBbRu.uR...............",
  "......RrRrMmmByyBmmRrRrR...............",
  ".......R.R..koook...R.R................",
  "......R.R.R.kOkO..R.R.R................",
  ".......RrR..........RrR................",
  "........R............R.................",
];

const FRAMES = ["idle", "ride-1", "ride-2", "ride-3"] as const;
const ART: Record<(typeof FRAMES)[number], string[]> = {
  idle,
  "ride-1": rideA,
  "ride-2": rideB,
  "ride-3": rideC,
};

export function steveSheet(): string {
  return "steve";
}

export function steveRideAnim(): string {
  return "steve-ride";
}

export function ensureSteve(scene: Phaser.Scene): void {
  if (scene.textures.exists(steveSheet())) scene.textures.remove(steveSheet());
  if (scene.anims.exists(steveRideAnim())) scene.anims.remove(steveRideAnim());

  const g = scene.add.graphics().setVisible(false);
  FRAMES.forEach((name, i) => {
    blit(g, i * STEVE_FW + 2, 2, ART[name]);
  });
  g.generateTexture(steveSheet(), STEVE_FW * FRAMES.length, STEVE_FH);
  g.destroy();

  const tex = scene.textures.get(steveSheet());
  FRAMES.forEach((name, i) => {
    tex.add(name, 0, i * STEVE_FW, 0, STEVE_FW, STEVE_FH);
  });

  scene.anims.create({
    key: steveRideAnim(),
    frames: [
      { key: steveSheet(), frame: "ride-1" },
      { key: steveSheet(), frame: "ride-2" },
      { key: steveSheet(), frame: "ride-3" },
      { key: steveSheet(), frame: "ride-2" },
    ],
    frameRate: 12,
    repeat: -1,
  });
}
