import Phaser from "phaser";
import { ensureMonSheets, monOwAnim, monOwSheet } from "../sprites/mon";
import type { WildId } from "../species";
import type { Facing } from "../walk";

export type WanderBox = { x: number; y: number; w: number; h: number };

export type WanderSpec = {
  id: WildId;
  x: number;
  y: number;
  box: WanderBox;
};

export type Wanderer = WanderSpec & {
  sprite: Phaser.GameObjects.Sprite;
  facing: Facing;
  flip: number;
  dx: number;
  dy: number;
  until: number;
};

export function spawnWanderers(scene: Phaser.Scene, specs: WanderSpec[]): Wanderer[] {
  ensureMonSheets(scene);
  return specs.map((spec, i) => {
    const sprite = scene.add.sprite(spec.x, spec.y, monOwSheet(spec.id), "idle-down");
    sprite.setOrigin(0.5, 1);
    sprite.setDepth(spec.y);
    sprite.anims.play(monOwAnim(spec.id, "idle-down"));
    return {
      ...spec,
      sprite,
      facing: "down" as Facing,
      flip: 1,
      dx: 0,
      dy: 0,
      until: scene.time.now + 200 + i * 180,
    };
  });
}

export function tickWanderers(scene: Phaser.Scene, wanderers: Wanderer[]): void {
  const now = scene.time.now;
  const dt = scene.game.loop.delta / 1000;
  for (const w of wanderers) {
    if (now > w.until) {
      w.until = now + 420 + Math.random() * 1400;
      const r = Math.random();
      if (r < 0.3) {
        w.dx = 0;
        w.dy = 0;
      } else if (r < 0.52) {
        w.dx = 16;
        w.dy = 0;
        w.facing = "side";
        w.flip = 1;
      } else if (r < 0.74) {
        w.dx = -16;
        w.dy = 0;
        w.facing = "side";
        w.flip = -1;
      } else if (r < 0.87) {
        w.dx = 0;
        w.dy = 16;
        w.facing = "down";
        w.flip = 1;
      } else {
        w.dx = 0;
        w.dy = -16;
        w.facing = "up";
        w.flip = 1;
      }
    }
    let nx = w.sprite.x + w.dx * dt;
    let ny = w.sprite.y + w.dy * dt;
    const minX = w.box.x + 6;
    const maxX = w.box.x + w.box.w - 6;
    const minY = w.box.y + 10;
    const maxY = w.box.y + w.box.h - 2;
    if (nx < minX || nx > maxX) {
      w.dx *= -1;
      if (w.facing === "side") w.flip *= -1;
      nx = Phaser.Math.Clamp(nx, minX, maxX);
    }
    if (ny < minY || ny > maxY) {
      w.dy *= -1;
      w.facing = w.dy > 0 ? "down" : w.dy < 0 ? "up" : w.facing;
      ny = Phaser.Math.Clamp(ny, minY, maxY);
    }
    w.sprite.setPosition(nx, ny);
    w.sprite.setFlipX(w.flip < 0);
    w.sprite.setDepth(ny);
    const moving = w.dx !== 0 || w.dy !== 0;
    const anim = moving
      ? w.facing === "up"
        ? monOwAnim(w.id, "walk-up-loop")
        : w.facing === "side"
          ? monOwAnim(w.id, "walk-side-loop")
          : monOwAnim(w.id, "walk-down-loop")
      : w.facing === "up"
        ? monOwAnim(w.id, "idle-up")
        : w.facing === "side"
          ? monOwAnim(w.id, "idle-side")
          : monOwAnim(w.id, "idle-down");
    if (w.sprite.anims.currentAnim?.key !== anim) w.sprite.play(anim, true);
  }
}

export function wanderNear(
  player: { x: number; y: number },
  wanderers: Wanderer[],
  dist = 14,
): Wanderer | undefined {
  return wanderers.find(
    (w) => Phaser.Math.Distance.Between(player.x, player.y, w.sprite.x, w.sprite.y) < dist,
  );
}
