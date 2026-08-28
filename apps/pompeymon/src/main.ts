import Phaser from "phaser";
import { gameConfig } from "./game/config";
import { keepPixelPerfect } from "./game/screenFit";
import { mountTouchPad } from "./game/touch";

const parent = document.getElementById("game-screen");
if (!parent) throw new Error("Missing #game-screen");

mountTouchPad();
const game = new Phaser.Game({ ...gameConfig, parent });
game.events.once(Phaser.Core.Events.READY, () => keepPixelPerfect(game, parent));
