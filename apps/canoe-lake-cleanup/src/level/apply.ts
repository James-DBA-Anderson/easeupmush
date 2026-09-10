import type { LevelData } from "./types";
import { applyLakeLevel } from "../game/world/lake";
import { applyParkRing } from "../game/world/fence";
import { applyParkLayout } from "../game/world/park";

/** Push level geometry into the world modules before `new Game()`. */
export function applyLevel(level: LevelData): void {
  applyLakeLevel(level.shoreOutline, level.pathPolylines);
  applyParkRing(level.parkRing);
  applyParkLayout(level.placeables, level.bins);
}
