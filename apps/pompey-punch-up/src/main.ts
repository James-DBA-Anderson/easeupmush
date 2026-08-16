import Phaser from "phaser";
import { gameConfig } from "./game/config";
import {
  isMobilePlay,
  mountMobileControls,
  syncPadVisibility,
  tryEnforceLandscape,
} from "./game/input/mobilePad";

const parent = document.getElementById("game-root");

if (!parent) {
  throw new Error("Missing #game-root");
}

if (isMobilePlay()) {
  document.body.classList.add("mobile-play");
  syncPadVisibility();
  mountMobileControls();

  const armLandscape = () => {
    void tryEnforceLandscape();
  };
  window.addEventListener("pointerdown", armLandscape, { once: true });
  window.addEventListener("orientationchange", () => {
    syncPadVisibility();
    // Re-assert lock after rotate when the browser allows it
    void tryEnforceLandscape();
  });
  window.addEventListener("resize", syncPadVisibility);
}

const game = new Phaser.Game({ ...gameConfig, parent });

/** Keep FIT sizing in sync when the mobile URL bar shows / hides. */
function refreshMobileScale(): void {
  if (!game.scale) return;
  game.scale.refresh();
  syncPadVisibility();
}

window.addEventListener("resize", refreshMobileScale);
window.addEventListener("orientationchange", () => {
  window.setTimeout(refreshMobileScale, 120);
});
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", refreshMobileScale);
  window.visualViewport.addEventListener("scroll", refreshMobileScale);
}
