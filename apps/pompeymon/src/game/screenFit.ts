import Phaser from "phaser";
import { GBA_H, GBA_W } from "./constants";
import { isTouchUi } from "./touch";

/**
 * Desktop gets a whole-number zoom. Fitting 240x160 to the window lands on
 * things like 4.5x, which doubles some pixel rows and not others — the 6px
 * menu font turns to mush. Phones keep the stretch so the deck still lines up.
 */
export function keepPixelPerfect(game: Phaser.Game, parent: HTMLElement): void {
  const apply = (): void => {
    const scale = game.scale;
    scale.canvas.style.margin = "0";
    if (isTouchUi()) {
      scale.scaleMode = Phaser.Scale.FIT;
      scale.setZoom(1);
      scale.refresh();
      return;
    }
    const box = parent.getBoundingClientRect();
    const room = Math.min(box.width / GBA_W, box.height / GBA_H);
    scale.scaleMode = Phaser.Scale.NONE;
    scale.setZoom(Math.max(1, Math.floor(room)));
  };

  apply();
  window.addEventListener("resize", apply);
  window.addEventListener("orientationchange", apply);
}
