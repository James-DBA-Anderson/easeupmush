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
    // Wide phones: expand the playfield sideways so the canvas fills the
    // screen (no side letterbox). Desktop keeps FIT for clean 16:9.
    mode: mobile ? Phaser.Scale.EXPAND : Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: {
    activePointers: mobile ? 3 : 1,
  },
  scene: [BootScene, BeachScene],
};
