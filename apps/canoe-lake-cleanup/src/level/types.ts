/** World XZ point — one unit is one metre. */
export type XZ = [number, number];

export type PlaceableId =
  | "boathouse"
  | "cafe"
  | "toilets"
  | "playPark"
  | "roseGarden";

export interface Placeable {
  id: PlaceableId;
  x: number;
  z: number;
  /** Facing; park buildings look back toward the water on −Z of the group. */
  yaw: number;
  wide?: number;
  deep?: number;
}

export interface LevelData {
  version: 1;
  /** Lake control points — Catmull-Rom smoothed into the shoreline. */
  shoreOutline: XZ[];
  /** Footpath polylines beyond the lake ring. */
  pathPolylines: XZ[][];
  /** Iron railings around the park. */
  parkRing: XZ[];
  /** Named buildings / play kit. */
  placeables: Placeable[];
  /**
   * Bin positions. Empty means auto-space them around the outer path lip
   * from the current shore.
   */
  bins: XZ[];
}

export const LEVEL_STORAGE_KEY = "canoe-lake-level-v1";
export const LEVEL_FILE = "levels/canoe-lake.json";
/** Editor camera (pan/zoom) — not used by the game. */
export const EDITOR_VIEW_STORAGE_KEY = "canoe-lake-editor-view-v1";
