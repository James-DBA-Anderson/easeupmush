import Phaser from "phaser";
import { GBA_H, GBA_W } from "./constants";
import { resumePos, run, saveOverworld } from "./run";
import { attachAutosave } from "./save";
import { ensureKidSheets, kidAnim, kidSheet } from "./sprites/kid";
import { consumeAction, consumeCancel, pad } from "./touch";

export type Facing = "down" | "up" | "side";

export type WalkKeys = Record<"W" | "A" | "S" | "D" | "Z" | "X" | "ESC", Phaser.Input.Keyboard.Key>;

export type Solid = { x: number; y: number; w: number; h: number };

export function near(
  p: { x: number; y: number },
  s: Solid,
  pad = 12,
): boolean {
  return p.x > s.x - pad && p.x < s.x + s.w + pad && p.y > s.y - pad && p.y < s.y + s.h + pad;
}

export type DoorDir = "up" | "down" | "left" | "right";

/** True only when moving into the opening — not walking past it, not Look. */
export function walkingInto(
  player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
  door: Solid,
  dir: DoorDir,
): boolean {
  const { velocity, left, right, top, bottom } = player.body;
  const go = 20;
  if (dir === "up") {
    if (velocity.y > -go) return false;
    if (player.x < door.x || player.x > door.x + door.w) return false;
    return top <= door.y + door.h + 4;
  }
  if (dir === "down") {
    if (velocity.y < go) return false;
    if (player.x < door.x || player.x > door.x + door.w) return false;
    return bottom >= door.y - 2;
  }
  if (dir === "left") {
    if (velocity.x > -go) return false;
    if (player.y < door.y || player.y > door.y + door.h) return false;
    return left <= door.x + door.w + 4;
  }
  if (velocity.x < go) return false;
  if (player.y < door.y || player.y > door.y + door.h) return false;
  return right >= door.x - 4;
}

/**
 * Street shops share a south door. Walking N–S outside often keeps DOWN held,
 * which would fire the exit on the first interior frame. Arm once DOWN is released.
 */
export function armSouthExit(
  player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
  cursors: Phaser.Types.Input.Keyboard.CursorKeys,
  wasd: WalkKeys,
  gate: { armed: boolean },
): boolean {
  const holdDown = cursors.down.isDown || wasd.S.isDown || pad.down;
  if (!gate.armed) {
    if (holdDown) {
      if (player.body.velocity.y > 0) player.body.setVelocityY(0);
      return false;
    }
    gate.armed = true;
  }
  return true;
}

/** Feet body vs map edge — sprite centre never reaches y > 152 with collideWorldBounds. */
export function atSouthEdge(
  player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
  mapH = GBA_H,
): boolean {
  return player.body.bottom >= mapH - 1;
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
  world = { w: GBA_W, h: GBA_H },
): Phaser.Types.Physics.Arcade.SpriteWithDynamicBody {
  ensureKidSheets(scene);
  const pos = resumePos(scene.scene.key, { x, y });
  const player = scene.physics.add.sprite(pos.x, pos.y, kidSheet(run.outfit), "idle-down");
  player.setCollideWorldBounds(true);
  player.setSize(10, 6).setOffset(11, 24);
  player.setDepth(10);
  player.anims.play(kidAnim(run.outfit, "idle-down"));
  scene.physics.world.setBounds(0, 0, world.w, world.h);
  scene.cameras.main.setBounds(0, 0, world.w, world.h);
  scene.cameras.main.fadeIn(280, 18, 16, 22);
  if (scene.scene.key !== "bikeshop" && scene.scene.key !== "junkshop" && scene.scene.key !== "takeaway") {
    saveOverworld(scene.scene.key, pos);
  }
  attachAutosave(scene, player);
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
  const speed = run.mounted ? 118 : 68;
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
