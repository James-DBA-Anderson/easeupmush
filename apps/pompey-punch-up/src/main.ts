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

/**
 * Stop accidental browser zoom (double-tap / pinch). Viewport meta helps,
 * but iOS Safari still zooms without these gesture / touchend guards.
 */
function disableMobileBrowserZoom(): void {
  const block = (ev: Event) => {
    ev.preventDefault();
  };
  // Non-standard Safari pinch gestures
  document.addEventListener("gesturestart", block, { passive: false });
  document.addEventListener("gesturechange", block, { passive: false });
  document.addEventListener("gestureend", block, { passive: false });

  // Double-tap zoom
  let lastTouchEnd = 0;
  document.addEventListener(
    "touchend",
    (ev) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 350) {
        ev.preventDefault();
      }
      lastTouchEnd = now;
    },
    { passive: false },
  );

  // Multi-finger pinch on some WebViews
  document.addEventListener(
    "touchmove",
    (ev) => {
      if (ev.touches.length > 1) ev.preventDefault();
    },
    { passive: false },
  );
}

if (isMobilePlay()) {
  document.body.classList.add("mobile-play");
  disableMobileBrowserZoom();
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

/** Keep scale sizing in sync when the mobile URL bar shows / hides. */
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
