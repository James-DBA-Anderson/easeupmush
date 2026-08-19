import Phaser from "phaser";
import { GBA_H, GBA_W } from "./constants";
import { BathroomScene } from "./scenes/BathroomScene";
import { BedroomScene } from "./scenes/BedroomScene";
import { LandingScene } from "./scenes/LandingScene";
import { TitleScene } from "./scenes/TitleScene";

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GBA_W,
  height: GBA_H,
  backgroundColor: "#0b1c24",
  pixelArt: true,
  roundPixels: true,
  physics: {
    default: "arcade",
    arcade: { debug: false },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [TitleScene, BedroomScene, LandingScene, BathroomScene],
};
