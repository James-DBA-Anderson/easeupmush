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

new Phaser.Game({ ...gameConfig, parent });
