import { Game } from "./game/Game";
import {
  isLandscape,
  isMobilePlay,
} from "./game/MobileControls";

/**
 * Stop accidental browser zoom (pinch / double-tap). Viewport meta helps,
 * but iOS Safari still zooms without these gesture guards.
 */
function disableMobileBrowserZoom(): void {
  const block = (ev: Event) => {
    ev.preventDefault();
  };
  document.addEventListener("gesturestart", block, { passive: false });
  document.addEventListener("gesturechange", block, { passive: false });
  document.addEventListener("gestureend", block, { passive: false });

  let lastTap = 0;
  document.addEventListener(
    "touchend",
    (ev) => {
      const now = performance.now();
      if (now - lastTap < 320) ev.preventDefault();
      lastTap = now;
    },
    { passive: false },
  );
}

function setRotatePrompt(on: boolean): void {
  const prompt = document.getElementById("rotate-prompt");
  prompt?.classList.toggle("visible", on);
}

function markTouchShell(on: boolean): void {
  document.documentElement.classList.toggle("touch-device", on);
  document.documentElement.classList.toggle("touch-ui", on);
  document.body.classList.toggle("touch-device", on);
  document.body.classList.toggle("touch-ui", on);
}

disableMobileBrowserZoom();

let game: Game | null = null;

/**
 * On phones the world must not exist in portrait — only the rotate prompt.
 * Landscape (or desktop) boots the game once; flipping back freezes it.
 */
function syncBoot(): void {
  const mobile = isMobilePlay();
  const land = isLandscape();

  if (mobile) markTouchShell(true);

  if (mobile && !land) {
    setRotatePrompt(true);
    // Do not construct the world until they tip the phone.
    if (game) game.setFrozen(true);
    return;
  }

  setRotatePrompt(false);

  if (!game) {
    game = new Game();
    game.start();
    (window as unknown as { __game: Game }).__game = game;
  } else {
    game.setFrozen(false);
  }

  if (!mobile) markTouchShell(false);
}

window.addEventListener("resize", () => syncBoot());
window.addEventListener("orientationchange", () => {
  // iOS often reports the old size until the next frame.
  requestAnimationFrame(() => syncBoot());
});
window.visualViewport?.addEventListener("resize", () => syncBoot());

syncBoot();
