import type { MissionId, MissionSpot } from "../../level/missions";
import {
  isInMissionWindow,
  isMissionId,
  normalizeMissionSpots,
} from "../../level/missions";

let spots: MissionSpot[] = normalizeMissionSpots(null);

/** Push authored mission anchors before the shift builds. */
export function applyMissionSpots(next: ReadonlyArray<MissionSpot>): void {
  spots = normalizeMissionSpots(next);
}

export function getMission(id: MissionId): MissionSpot {
  const spot = spots.find((s) => s.id === id);
  if (spot) return spot;
  return normalizeMissionSpots(null).find((s) => s.id === id)!;
}

/** Look up any pin (built-in or placeholder) by id. */
export function getMissionById(id: string): MissionSpot | undefined {
  return spots.find((s) => s.id === id);
}

export function getMissionSpot(id: MissionId): { x: number; z: number } {
  const spot = getMission(id);
  return { x: spot.x, z: spot.z };
}

export function getMissionSpots(): ReadonlyArray<MissionSpot> {
  return spots;
}

/** Placeholder pins — authored but not yet wired in Game. */
export function getPlaceholderMissions(): ReadonlyArray<MissionSpot> {
  return spots.filter((s) => !isMissionId(s.id));
}

/** Whether this mission may begin at the current shift hour. */
export function missionWindowOpen(id: MissionId, hour: number): boolean {
  const m = getMission(id);
  return isInMissionWindow(hour, m.start, m.end);
}

export function missionWindowOpenSpot(spot: MissionSpot, hour: number): boolean {
  return isInMissionWindow(hour, spot.start, spot.end);
}
