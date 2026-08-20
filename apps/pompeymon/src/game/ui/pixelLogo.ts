import Phaser from "phaser";

const GLYPH: Record<string, string[]> = {
  A: ["01110", "10001", "11111", "10001", "10001"],
  E: ["11111", "10000", "11110", "10000", "11111"],
  H: ["10001", "10001", "11111", "10001", "10001"],
  M: ["10001", "11011", "10101", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001"],
  O: ["01110", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "11110", "10000", "10000"],
  S: ["01111", "10000", "01110", "00001", "11110"],
  U: ["10001", "10001", "10001", "10001", "01110"],
  Y: ["10001", "10001", "01110", "00100", "00100"],
  " ": ["00000", "00000", "00000", "00000", "00000"],
};

function px(
  g: Phaser.GameObjects.Graphics,
  color: number,
  x: number,
  y: number,
  s: number,
): void {
  g.fillStyle(color, 1);
  g.fillRect(x, y, s, s);
}

function wordWidth(text: string, scale: number, tracking: number): number {
  return text.length * 5 * scale + Math.max(0, text.length - 1) * tracking * scale;
}

function blitWord(
  g: Phaser.GameObjects.Graphics,
  text: string,
  x: number,
  y: number,
  fill: number,
  ink: number,
  scale: number,
  italic = false,
  tracking = 1,
  shadow = false,
): void {
  const s = scale;
  let ox = 0;
  for (const ch of text) {
    const glyph = GLYPH[ch] ?? GLYPH[" "];
    if (shadow) {
      for (let row = 0; row < 5; row++) {
        const slant = italic ? Math.floor((4 - row) / 2) * s : 0;
        for (let col = 0; col < 5; col++) {
          if (glyph[row][col] !== "1") continue;
          const pxX = x + ox + col * s + slant;
          const pxY = y + row * s;
          px(g, 0x182838, pxX + s, pxY + s, s);
        }
      }
    }
    // Thick GBA outline (8-neighbour)
    for (let row = 0; row < 5; row++) {
      const slant = italic ? Math.floor((4 - row) / 2) * s : 0;
      for (let col = 0; col < 5; col++) {
        if (glyph[row][col] !== "1") continue;
        const pxX = x + ox + col * s + slant;
        const pxY = y + row * s;
        for (let oy = -s; oy <= s; oy += s) {
          for (let ox2 = -s; ox2 <= s; ox2 += s) {
            if (ox2 === 0 && oy === 0) continue;
            px(g, ink, pxX + ox2, pxY + oy, s);
          }
        }
      }
    }
    for (let row = 0; row < 5; row++) {
      const slant = italic ? Math.floor((4 - row) / 2) * s : 0;
      for (let col = 0; col < 5; col++) {
        if (glyph[row][col] !== "1") continue;
        const pxX = x + ox + col * s + slant;
        const pxY = y + row * s;
        const hi = row === 0 || (row === 1 && col > 0 && col < 4);
        const mid = row === 2;
        px(g, hi ? 0xffe080 : mid ? fill : 0xd88828, pxX, pxY, s);
      }
    }
    ox += 5 * s + tracking * s;
  }
}

/** Pompeymon wordmark — bold outlined GBA title type. */
export function drawPompeymonLogo(g: Phaser.GameObjects.Graphics, cx: number, y: number): void {
  const scale = 3;
  const tracking = 1;
  const w = wordWidth("POMPEYMON", scale, tracking);
  const x = Math.floor(cx - w / 2);
  // Soft plate so letters read on bright sky
  g.fillStyle(0x183048, 0.35);
  g.fillRect(x - 4, y - 2, w + 8, 5 * scale + 4);
  blitWord(g, "POMPEYMON", x, y, 0xf0a23a, 0x101820, scale, false, tracking, true);
}

/** Stacked Ease Up Mush mark with a tiny wave, GBA palette. */
export function drawEaseLogo(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  y: number,
  waves = 4,
): void {
  const scale = 1;
  const tracking = 1;
  const lines = ["EASE", "UP", "MUSH"];
  let yy = y;
  for (const line of lines) {
    const w = wordWidth(line, scale, tracking);
    blitWord(g, line, Math.floor(cx - w / 2), yy, 0xf0a23a, 0x101018, scale, true, tracking);
    yy += 7;
  }

  const waveY = yy + 1;
  const span = waves * 10;
  const left = cx - Math.floor(span / 2);
  g.fillStyle(0x1a3848, 1);
  g.fillRect(left, waveY + 4, span, 3);
  for (let i = 0; i < waves; i++) {
    const x = left + i * 10;
    g.fillStyle(0x1a3848, 1);
    g.fillRect(x + 1, waveY + 2, 8, 3);
    g.fillRect(x + 2, waveY + 1, 5, 2);
    g.fillStyle(0xf4ece0, 1);
    g.fillRect(x + 2, waveY, 4, 2);
    g.fillRect(x + 1, waveY + 1, 2, 1);
    g.fillRect(x + 6, waveY + 1, 2, 1);
    g.fillRect(x + 4, waveY - 1, 2, 1);
  }
}
