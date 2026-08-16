import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "./constants";
import { BootScene } from "./scenes/BootScene";
import { BeachScene } from "./scenes/BeachScene";
import { isMobilePlay } from "./input/mobilePad";

export { GAME_HEIGHT, GAME_WIDTH };

const mobile = isMobilePlay();

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: "#2b2218",
  pixelArt: false,
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scale: {
    // Always fit the full 16:9 frame — ENVELOP cropped the title when the
    // mobile browser bar ate into the viewport height.
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: {
    activePointers: mobile ? 3 : 1,
  },
  scene: [BootScene, BeachScene],
};
