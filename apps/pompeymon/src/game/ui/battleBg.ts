import Phaser from "phaser";
import { GBA_H, GBA_W } from "../constants";

type Tone = {
  skyHi: number;
  skyLo: number;
  haze: number;
  ground: number;
  ink: number;
  pad: number;
};

const TONES: Record<string, Tone> = {
  school: {
    skyHi: 0x8aa878,
    skyLo: 0x5a7860,
    haze: 0x1a2818,
    ground: 0x2a402c,
    ink: 0x243428,
    pad: 0x3e6840,
  },
  island: {
    skyHi: 0x7a90a0,
    skyLo: 0x4a6070,
    haze: 0x182028,
    ground: 0x2c343c,
    ink: 0x2a3038,
    pad: 0x484850,
  },
  highstreet: {
    skyHi: 0x7a8894,
    skyLo: 0x4a5864,
    haze: 0x181c24,
    ground: 0x2c3238,
    ink: 0x2a2830,
    pad: 0x4a4a52,
  },
  roundabout: {
    skyHi: 0x8aa888,
    skyLo: 0x5a7860,
    haze: 0x182018,
    ground: 0x2c3c2c,
    ink: 0x283428,
    pad: 0x425848,
  },
  bridge: {
    skyHi: 0x7aa8c0,
    skyLo: 0x487890,
    haze: 0x142430,
    ground: 0x2a3844,
    ink: 0x1c3848,
    pad: 0x485058,
  },
  field: {
    skyHi: 0x78a090,
    skyLo: 0x486868,
    haze: 0x142420,
    ground: 0x243830,
    ink: 0x1c3028,
    pad: 0x3a6a48,
  },
};

function toneFor(area: string): Tone {
  if (area in TONES) return TONES[area];
  return TONES.field;
}

function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

function sky(g: Phaser.GameObjects.Graphics, hi: number, lo: number): void {
  const steps = 8;
  const h = 88 / steps;
  for (let i = 0; i < steps; i += 1) {
    g.fillStyle(mix(hi, lo, i / (steps - 1)), 1);
    g.fillRect(0, Math.floor(i * h), GBA_W, Math.ceil(h) + 1);
  }
}

/** Sky + faded scenery, then solid fight platforms. */
export function paintBattleBg(scene: Phaser.Scene, area: string): void {
  const t = toneFor(area);
  const back = scene.add.graphics().setDepth(0);
  sky(back, t.skyHi, t.skyLo);
  back.fillStyle(t.ground, 1);
  back.fillRect(0, 88, GBA_W, GBA_H - 88);

  const world = scene.add.graphics().setDepth(1).setAlpha(0.38);
  if (area === "school") paintSchool(world, t);
  else if (area === "island") paintIsland(world, t);
  else if (area === "highstreet") paintHighStreet(world, t);
  else if (area === "roundabout") paintRoundabout(world, t);
  else if (area === "bridge") paintBridge(world, t);
  else paintField(world, t);

  const wash = scene.add.graphics().setDepth(2);
  wash.fillStyle(t.haze, 0.28);
  wash.fillRect(0, 0, GBA_W, 92);
  wash.fillStyle(t.haze, 0.12);
  wash.fillRect(0, 88, GBA_W, 24);

  const pads = scene.add.graphics().setDepth(3);
  pads.fillStyle(t.pad, 1);
  pads.fillEllipse(180, 102, 90, 28);
  pads.fillEllipse(52, 78, 70, 22);
}

function paintField(g: Phaser.GameObjects.Graphics, t: Tone): void {
  g.fillStyle(t.ink, 1);
  g.fillRect(20, 58, 36, 30);
  g.fillRect(170, 52, 48, 36);
  for (let x = 12; x < GBA_W; x += 16) g.fillRect(x, 80, 2, 8);
}

function paintSchool(g: Phaser.GameObjects.Graphics, t: Tone): void {
  g.fillStyle(t.ink, 1);
  g.fillRect(8, 40, 90, 48);
  g.fillRect(152, 36, 80, 52);
  g.fillStyle(mix(t.skyLo, t.ink, 0.4), 1);
  g.fillRect(16, 50, 14, 10);
  g.fillRect(38, 50, 14, 10);
  g.fillRect(162, 46, 16, 10);
  g.fillRect(186, 46, 16, 10);
  g.fillStyle(t.ink, 1);
  g.fillRect(0, 86, GBA_W, 2);
}

function paintIsland(g: Phaser.GameObjects.Graphics, t: Tone): void {
  g.fillStyle(t.ink, 1);
  g.fillRect(6, 44, 70, 44);
  g.fillRect(164, 40, 70, 48);
  g.fillStyle(mix(t.skyLo, t.ink, 0.4), 1);
  g.fillRect(14, 54, 12, 8);
  g.fillRect(34, 54, 12, 8);
  g.fillRect(174, 52, 14, 8);
  g.fillRect(196, 52, 14, 8);
  g.fillStyle(t.ink, 1);
  g.fillRect(108, 88, 24, GBA_H - 88);
}

function paintHighStreet(g: Phaser.GameObjects.Graphics, t: Tone): void {
  g.fillStyle(t.ink, 1);
  g.fillRect(4, 36, 78, 52);
  g.fillRect(158, 32, 78, 56);
  g.fillStyle(mix(t.skyLo, t.ink, 0.35), 1);
  g.fillRect(12, 48, 16, 12);
  g.fillRect(36, 48, 16, 12);
  g.fillRect(168, 44, 16, 12);
  g.fillRect(192, 44, 16, 12);
  g.fillStyle(t.ink, 1);
  g.fillRect(100, 88, 40, GBA_H - 88);
}

function paintRoundabout(g: Phaser.GameObjects.Graphics, t: Tone): void {
  g.fillStyle(t.ink, 1);
  g.fillCircle(120, 70, 22);
  g.fillRect(0, 66, 78, 16);
  g.fillRect(162, 66, 78, 16);
  g.fillRect(112, 48, 16, 22);
}

function paintBridge(g: Phaser.GameObjects.Graphics, t: Tone): void {
  g.fillStyle(t.ink, 1);
  g.fillRect(36, 40, 4, 40);
  g.fillRect(200, 40, 4, 40);
  g.fillRect(36, 40, 168, 4);
  g.fillRect(0, 76, GBA_W, 10);
  g.fillStyle(mix(t.skyHi, t.ink, 0.5), 1);
  g.fillRect(0, 84, GBA_W, 8);
}
