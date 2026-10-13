import { Game } from "./game/game";

const canvas = document.getElementById("game");
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("Missing #game canvas");
}

const game = new Game(canvas);
game.start();

if (import.meta.env.DEV) {
  void import("./game/debugMenu").then(({ mountDebugMenu }) => {
    mountDebugMenu(game);
  });
}
