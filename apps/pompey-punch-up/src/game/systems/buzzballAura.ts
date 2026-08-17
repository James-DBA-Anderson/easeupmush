import Phaser from "phaser";
import type { Fighter } from "../entities/Fighter";

export function spawnBuzzRings(scene: Phaser.Scene, x: number, y: number): void {
  for (let i = 0; i < 3; i++) {
    const ring = scene.add.circle(x, y - 36, 10 + i * 6, 0xffee88, 0).setDepth(190);
    ring.setStrokeStyle(3, 0xffcc22, 0.95);
    scene.tweens.add({
      targets: ring,
      scale: 4.2 + i * 0.8,
      alpha: 0,
      duration: 420 + i * 80,
      ease: "Cubic.easeOut",
      onComplete: () => ring.destroy(),
    });
  }
  for (let i = 0; i < 12; i++) {
    const ang = (Math.PI * 2 * i) / 12 + Math.random() * 0.25;
    const bolt = scene.add.rectangle(x, y - 40, 3, 14 + Math.random() * 22, 0xfff4cc, 0.95);
    bolt.setDepth(191).setRotation(ang);
    scene.tweens.add({
      targets: bolt,
      x: x + Math.cos(ang) * (36 + Math.random() * 55),
      y: y - 40 + Math.sin(ang) * (32 + Math.random() * 44),
      alpha: 0,
      duration: 260 + Math.random() * 200,
      onComplete: () => bolt.destroy(),
    });
  }
}

/** DBZ-style golden ki — full flames while buzzing, outline glow as it fades. */
export function drawBuzzAura(
  g: Phaser.GameObjects.Graphics,
  player: Fighter,
  now: number,
  awakening: boolean,
): void {
  const remaining = Math.max(0, player.buzzedUntil - now);
  const fadeWindow = 2000;
  const inFade = !awakening && remaining > 0 && remaining <= fadeWindow;
  const fadeT = inFade ? 1 - remaining / fadeWindow : 0;

  const bodyW = Math.max(26, player.sprite.displayWidth * 0.48);
  const bodyH = Math.max(64, player.sprite.displayHeight * 0.88);
  const cx = player.x;
  const feetY = player.y;
  const midY = feetY - bodyH * 0.46;
  const headY = feetY - bodyH * 0.88;

  g.clear();
  g.setDepth(Math.max(1, player.depth - 2));

  const pulse = 0.5 + Math.sin(now * 0.028) * 0.5;
  const flicker =
    0.78 + Math.sin(now * 0.09) * 0.12 + Math.sin(now * 0.17 + 1.3) * 0.1;
  const fullPower = awakening ? 1.15 + Math.sin(now * 0.045) * 0.2 : 0.82 + pulse * 0.18;
  const fullAlpha = (1 - fadeT) * fullPower * flicker;

  if (fullAlpha > 0.04) {
    drawBuzzDbzFlames(g, cx, feetY, midY, headY, bodyW, bodyH, now, fullAlpha, awakening);
  }

  if (inFade) {
    const outlineAlpha = fadeT * (1 - fadeT * 0.3) * 0.62;
    if (outlineAlpha > 0.02) {
      drawBuzzOutlineGlow(g, cx, bodyW, bodyH, midY, headY, now, outlineAlpha);
    }
  }
}

function drawBuzzDbzFlames(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  feetY: number,
  midY: number,
  headY: number,
  bodyW: number,
  bodyH: number,
  now: number,
  alpha: number,
  awakening: boolean,
): void {
  const scale = awakening ? 1.28 : 1;

  g.fillStyle(0xffcc44, alpha * 0.18);
  g.fillEllipse(cx, feetY - 4, bodyW * 2.1 * scale, 14 * scale);

  g.fillStyle(0xff9900, alpha * 0.13);
  g.fillEllipse(cx, midY, bodyW * 2.35 * scale, bodyH * 1.18 * scale);

  g.fillStyle(0xffcc22, alpha * 0.2);
  g.fillEllipse(cx, midY - 4, bodyW * 1.65 * scale, bodyH * 0.96 * scale);

  const count = awakening ? 16 : 12;
  for (let i = 0; i < count; i++) {
    const side = (i - count / 2) / (count / 2);
    const wobble = Math.sin(now * 0.022 + i * 1.9) * 0.15;
    const baseX = cx + side * bodyW * (0.58 + wobble * 0.18);
    const baseY = midY + Math.abs(side) * bodyH * 0.14;
    const len =
      (30 + Math.sin(now * 0.031 + i * 2.4) * 18) *
      scale *
      (1 - Math.abs(side) * 0.22);
    const tipX = baseX + wobble * 12;
    const tipY = headY - 6 - len * (0.88 + Math.sin(now * 0.04 + i) * 0.12);
    const halfW = 5 + Math.abs(side) * 3;
    const col = i % 3 === 0 ? 0xffee88 : i % 3 === 1 ? 0xffaa00 : 0xff6600;
    g.fillStyle(col, alpha * (0.26 + (1 - Math.abs(side)) * 0.2));
    g.fillTriangle(baseX - halfW, baseY, tipX, tipY, baseX + halfW, baseY);
  }

  g.fillStyle(0xffffff, alpha * (awakening ? 0.4 : 0.26));
  g.fillEllipse(cx, midY - 6, bodyW * 0.56 * scale, bodyH * 0.44 * scale);

  g.lineStyle(2, 0xa8f4ff, alpha * 0.32);
  g.strokeEllipse(cx, midY, bodyW * 1.05 * scale, bodyH * 0.9 * scale);
}

function drawBuzzOutlineGlow(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  bodyW: number,
  bodyH: number,
  midY: number,
  headY: number,
  now: number,
  alpha: number,
): void {
  const shimmer = 0.82 + Math.sin(now * 0.055) * 0.18;
  const a = alpha * shimmer;

  g.fillStyle(0xffdd66, a * 0.1);
  g.fillEllipse(cx, midY, bodyW * 1.12, bodyH * 1.02);

  g.lineStyle(4, 0xffeeaa, a * 0.58);
  g.strokeEllipse(cx, midY, bodyW * 0.94, bodyH * 0.92);

  g.lineStyle(2, 0xffffff, a * 0.38);
  g.strokeEllipse(cx, midY, bodyW * 0.84, bodyH * 0.84);

  g.lineStyle(3, 0xffcc44, a * 0.48);
  g.strokeEllipse(cx, headY + bodyH * 0.06, bodyW * 0.4, bodyH * 0.24);

  g.lineStyle(1.5, 0x7af0ff, a * 0.22);
  g.strokeEllipse(cx, midY, bodyW * 1.0, bodyH * 0.96);
}
