import Phaser from "phaser";
import { GBA_H, GBA_W } from "./constants";
import { run } from "./run";
import { ensureKidSheets, kidAnim, kidSheet } from "./sprites/kid";
import { consumeAction, consumeCancel, consumeDir, pad } from "./touch";

export type Facing = "down" | "up" | "side";

export type WalkKeys = Record<"W" | "A" | "S" | "D" | "Z" | "X" | "ESC", Phaser.Input.Keyboard.Key>;

export type Facing = "down" | "up" | "side";

export type Solid = { x: number; y: number; w: number; h: number };

export function near(
  p: { x: number; y: number },
  s: Solid,
  pad = 12,
): boolean {
  return p.x > s.x - pad && p.x < s.x + s.w + pad && p.y > s.y - pad && p.y < s.y + s.h + pad;
}

export function addWalls(
  scene: Phaser.Scene,
  player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
  solids: Solid[],
): void {
  for (const s of solids) {
    const block = scene.add.rectangle(s.x + s.w / 2, s.y + s.h / 2, s.w, s.h, 0x000000, 0);
    scene.physics.add.existing(block, true);
    scene.physics.add.collider(player, block);
  }
}

export function spawnKid(
  scene: Phaser.Scene,
  x: number,
  y: number,
): Phaser.Types.Physics.Arcade.SpriteWithDynamicBody {
  ensureKidSheets(scene);
  const player = scene.physics.add.sprite(x, y, kidSheet(run.outfit), "idle-down");
  player.setCollideWorldBounds(true);
  player.setSize(10, 6).setOffset(11, 24);
  player.setDepth(10);
  player.anims.play(kidAnim(run.outfit, "idle-down"));
  scene.physics.world.setBounds(0, 0, GBA_W, GBA_H);
  scene.cameras.main.setBounds(0, 0, GBA_W, GBA_H);
  scene.cameras.main.fadeIn(280, 18, 16, 22);
  return player;
}

export function bindWalkKeys(scene: Phaser.Scene): {
  cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  wasd: WalkKeys;
} {
  return {
    cursors: scene.input.keyboard!.createCursorKeys(),
    wasd: {
      W: scene.input.keyboard!.addKey("W"),
      A: scene.input.keyboard!.addKey("A"),
      S: scene.input.keyboard!.addKey("S"),
      D: scene.input.keyboard!.addKey("D"),
      Z: scene.input.keyboard!.addKey("Z"),
      X: scene.input.keyboard!.addKey("X"),
      ESC: scene.input.keyboard!.addKey("ESC"),
    },
  };
}

export function justAction(
  cursors: Phaser.Types.Input.Keyboard.CursorKeys,
  wasd: WalkKeys,
): boolean {
  return (
    Phaser.Input.Keyboard.JustDown(cursors.space) ||
    Phaser.Input.Keyboard.JustDown(wasd.Z) ||
    consumeAction()
  );
}

export function justCancel(wasd: WalkKeys): boolean {
  return (
    Phaser.Input.Keyboard.JustDown(wasd.X) ||
    Phaser.Input.Keyboard.JustDown(wasd.ESC) ||
    consumeCancel()
  );
}

export function walkAxis(
  cursors: Phaser.Types.Input.Keyboard.CursorKeys,
  wasd: WalkKeys,
): { vx: number; vy: number } {
  let vx = 0;
  let vy = 0;
  if (cursors.left.isDown || wasd.A.isDown || pad.left) vx -= 1;
  if (cursors.right.isDown || wasd.D.isDown || pad.right) vx += 1;
  if (cursors.up.isDown || wasd.W.isDown || pad.up) vy -= 1;
  if (cursors.down.isDown || wasd.S.isDown || pad.down) vy += 1;
  if (vx !== 0 && vy !== 0) {
    vx *= Math.SQRT1_2;
    vy *= Math.SQRT1_2;
  }
  return { vx, vy };
}

export function tickWalk(
  player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
  cursors: Phaser.Types.Input.Keyboard.CursorKeys,
  wasd: WalkKeys,
  facing: Facing,
  flip: number,
): { facing: Facing; flip: number } {
  const speed = 68;
  const { vx, vy } = walkAxis(cursors, wasd);
  player.body.setVelocity(vx * speed, vy * speed);

  let nextFacing = facing;
  let nextFlip = flip;
  let kind: "idle-down" | "idle-side" | "idle-up" | "walk-down" | "walk-side" | "walk-up" =
    facing === "up" ? "idle-up" : facing === "side" ? "idle-side" : "idle-down";

  if (vx !== 0 || vy !== 0) {
    if (Math.abs(vx) >= Math.abs(vy)) {
      nextFacing = "side";
      nextFlip = vx < 0 ? -1 : 1;
      kind = "walk-side";
    } else if (vy < 0) {
      nextFacing = "up";
      kind = "walk-up";
    } else {
      nextFacing = "down";
      kind = "walk-down";
    }
  }
  const key = kidAnim(run.outfit, kind);
  if (player.anims.currentAnim?.key !== key) player.anims.play(key, true);
  player.setFlipX(nextFlip < 0);
  return { facing: nextFacing, flip: nextFlip };
}
