import type { LevelData } from "./types";
import { applyLakeLevel } from "../game/world/lake";
import { applyParkRing } from "../game/world/fence";
import { applyParkLayout } from "../game/world/park";
import { applyTreeLayout } from "../game/world/trees";
import { applySurroundLayout } from "../game/world/buildings";
import { applyElevationZones } from "../game/world/terrain";
import { applyFairyLightRuns } from "../game/world/fairyLights";
import { applyMissionSpots } from "../game/world/missions";

/** Push level geometry into the world modules before `new Game()`. */
export function applyLevel(level: LevelData): void {
  applyLakeLevel(level.shoreOutline, level.pathPolylines);
  applyParkRing(level.parkRing, level.fenceStyle ?? "wire");
  applyParkLayout(level.placeables, level.bins, level.playParkOutline);
  applyTreeLayout(level.trees);
  applySurroundLayout(
    level.roadPolylines,
    level.terraceRuns,
    level.carParkOutline ?? [],
    level.beachOutline ?? [],
  );
  applyElevationZones(level.elevationZones ?? []);
  applyFairyLightRuns(level.fairyLightRuns ?? []);
  applyMissionSpots(level.missionSpots ?? []);
}
