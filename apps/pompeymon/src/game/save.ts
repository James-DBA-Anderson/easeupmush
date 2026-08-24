import type Phaser from "phaser";
import { persistRun, run, saveOverworld } from "./run";

const SKIP_SCENE = new Set(["title", "debug", "encounter"]);
const KEEP_PLACE = new Set(["bikeshop", "junkshop", "takeaway"]);

/** Snapshot the kid when leaving a map, hiding the tab, or closing the page. */
export function attachAutosave(
  scene: Phaser.Scene,
  player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
): void {
  const snap = (): void => {
    if (run.debugSession || SKIP_SCENE.has(scene.scene.key)) return;
    if (KEEP_PLACE.has(scene.scene.key) || !player.active) {
      persistRun();
      return;
    }
    saveOverworld(scene.scene.key, { x: player.x, y: player.y });
  };
  const vis = (): void => {
    if (document.visibilityState === "hidden") snap();
  };
  document.addEventListener("visibilitychange", vis);
  window.addEventListener("pagehide", snap);
  scene.events.once("shutdown", () => {
    snap();
    document.removeEventListener("visibilitychange", vis);
    window.removeEventListener("pagehide", snap);
  });
}
