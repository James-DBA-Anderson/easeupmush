import Phaser from "phaser";
import { clearField } from "../world/wander";
import { run } from "../run";

const FLAG = "pm-debug-session";
const HIT_X = 4;
const HIT_Y = 4;
const HIT_W = 72;
const HIT_H = 16;

let leaving = false;

export function setDebugSession(on: boolean): void {
  run.debugSession = on;
  if (on) leaving = false;
  try {
    if (on) sessionStorage.setItem(FLAG, "1");
    else sessionStorage.removeItem(FLAG);
  } catch {
    /* private mode */
  }
}

export function inDebugSession(): boolean {
  if (run.debugSession) return true;
  try {
    if (sessionStorage.getItem(FLAG) === "1") {
      run.debugSession = true;
      return true;
    }
  } catch {
    /* private mode */
  }
  return false;
}

/** Call from DebugScene.create so a failed leave cannot stick the guard. */
export function clearDebugLeaveLock(): void {
  leaving = false;
}

function hitDebug(pointer: Phaser.Input.Pointer): boolean {
  return (
    pointer.x >= HIT_X &&
    pointer.x < HIT_X + HIT_W &&
    pointer.y >= HIT_Y &&
    pointer.y < HIT_Y + HIT_H
  );
}

/** Top-left escape hatch while testing from the debug menu. */
export function mountDebugBack(scene: Phaser.Scene): void {
  if (!inDebugSession()) return;
  leaving = false;

  const bg = scene.add.rectangle(HIT_X, HIT_Y, HIT_W, HIT_H, 0x1a1814, 1).setOrigin(0).setDepth(100).setScrollFactor(0);
  bg.setStrokeStyle(1, 0xf0a23a);

  scene.add
    .text(HIT_X + 4, HIT_Y + 3, "< DEBUG", {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: "8px",
      color: "#f0a23a",
    })
    .setDepth(101)
    .setScrollFactor(0);

  scene.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
    if (!hitDebug(pointer)) return;
    leaveDebugSession(scene);
  });
}

/**
 * Return to the debug menu. Defer scene.start past the input handler so the
 * encounter does not shut down mid-pointer event.
 */
export function leaveDebugSession(scene: Phaser.Scene): void {
  if (leaving) return;
  leaving = true;

  run.whiteout = false;
  run.overworld = null;
  run.field = null;
  run.wildKey = null;
  run.wildGone = false;
  clearField();
  setDebugSession(false);

  const startDebug = (): void => {
    leaving = false;
    if (!scene.sys.isActive()) {
      scene.game.scene.start("debug");
      return;
    }
    scene.scene.start("debug");
  };

  if (scene.sys.isActive()) {
    scene.time.delayedCall(1, startDebug);
  } else {
    window.setTimeout(startDebug, 0);
  }
}
