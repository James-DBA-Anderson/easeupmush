import { Game } from "./game/Game";

const canvas = document.getElementById("game");
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("Missing #game canvas");
}

const game = new Game(canvas);
game.start();
