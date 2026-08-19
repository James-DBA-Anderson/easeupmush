import Phaser from "phaser";
import { gameConfig } from "./game/config";
import { mountTouchPad } from "./game/touch";

const parent = document.getElementById("game-screen");
if (!parent) throw new Error("Missing #game-screen");

mountTouchPad();
new Phaser.Game({ ...gameConfig, parent });
