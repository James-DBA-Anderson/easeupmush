import Phaser from "phaser";
import { gameConfig } from "./game/config";

const parent = document.getElementById("game-root");

if (!parent) {
  throw new Error("Missing #game-root");
}

new Phaser.Game({ ...gameConfig, parent });
