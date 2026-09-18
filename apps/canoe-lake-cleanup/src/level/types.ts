import type { MissionSpot } from "./missions";

export type {
  MissionId,
  MissionClock,
  MissionSpot,
} from "./missions";
export {
  MISSION_IDS,
  MISSION_LABELS,
  DEFAULT_MISSION_SPOTS,
  normalizeMissionSpots,
  isInMissionWindow,
  formatMissionClock,
  missionLabel,
  isPlaceholderMission,
  createPlaceholderMission,
} from "./missions";

/** World XZ point — one unit is one metre. */
export type XZ = [number, number];

export type PlaceableId =
  | "boathouse"
  | "cafe"
  | "cafeKiosk"
  | "toilets"
  | "roseGarden"
  | "busStop"
  | "swing"
  | "slide"
  | "spring"
  | "zip"
  | "stumpCrab"
  | "stumpSnail"
  | "stumpStarfish";

/** One of each — hire office, toilets, rose beds. */
export const UNIQUE_PLACEABLES: readonly PlaceableId[] = [
  "boathouse",
  "toilets",
  "roseGarden",
];

/**
 * Anything you can stamp more than once: cafés, bus stops, play kit, and
 * carved stump ornaments.
 */
export const MULTI_PLACEABLES: readonly PlaceableId[] = [
  "cafe",
  "cafeKiosk",
  "busStop",
  "swing",
  "slide",
  "spring",
  "zip",
  "stumpCrab",
  "stumpSnail",
  "stumpStarfish",
];

/** @deprecated Prefer `isMultiPlaceable` — kept for call-site clarity on kit. */
export const EQUIPMENT_PLACEABLES: readonly PlaceableId[] = [
  "swing",
  "slide",
  "spring",
  "zip",
];

export function isMultiPlaceable(id: PlaceableId): boolean {
  return (MULTI_PLACEABLES as readonly string[]).includes(id);
}

export function isEquipment(id: PlaceableId): boolean {
  return (EQUIPMENT_PLACEABLES as readonly string[]).includes(id);
}

export interface Placeable {
  id: PlaceableId;
  x: number;
  z: number;
  /** Facing; park buildings look back toward the water on −Z of the group. */
  yaw: number;
}

export type TreeKind = "holm" | "plane" | "scrub" | "shrub" | "flowerBed";

/** Style of the closed park perimeter (editor Fencing tool). */
export type FenceStyle = "wire" | "brick" | "railings";

/** Coloured string-light runs (editor Fairy lights tool). */
export type FairyLightColor = "red" | "blue";

export interface FairyLightRun {
  color: FairyLightColor;
  /** Open polyline — a pole at each point, wire sagging between. */
  points: XZ[];
}

export interface TreeSpot {
  x: number;
  z: number;
  kind: TreeKind;
  /** Overall size. Defaults by kind if omitted. */
  scale?: number;
  /** Salt / wind lean. Positive Z = inland (+Z); positive X = east. */
  leanX?: number;
  leanZ?: number;
  /** Facing for beds / oriented plantings (radians). */
  yaw?: number;
}

/** How a berm drops to the flat park. */
export type ElevEdgeStyle = "wall" | "steps" | "slope";

/** A berm / bank — closed outline and height above the flat park (metres). */
export interface ElevationZone {
  outline: XZ[];
  height: number;
  /** Perimeter transition. Omit / wall = sheer drop (legacy). */
  edge?: ElevEdgeStyle;
}

export interface LevelData {
  version: 1;
  /** Lake control points — Catmull-Rom smoothed into the shoreline. */
  shoreOutline: XZ[];
  /** Footpath polylines beyond the lake ring. */
  pathPolylines: XZ[][];
  /** Closed park perimeter (fencing outline). */
  parkRing: XZ[];
  /** How the park perimeter is built — garden wire, brick, or metal railings. */
  fenceStyle: FenceStyle;
  /**
   * Play-park wood-chip boundary (closed polygon). Empty → no play park.
   * Edited like the shore / park ring.
   */
  playParkOutline: XZ[];
  /**
   * Car park asphalt (closed polygon). Empty → none. Edited like the play area.
   */
  carParkOutline: XZ[];
  /**
   * Beach / shingle (closed polygon). Empty → no sand; sea also needs a beach
   * so its north edge can sit on the outline’s south side.
   */
  beachOutline: XZ[];
  /**
   * Raised ground patches (closed polygons + height in metres above the flat
   * park). Empty → flat park. Overlapping zones use the taller height.
   */
  elevationZones: ElevationZone[];
  /**
   * Parade / esplanade road centre-lines (open polylines). Stone strips are
   * extruded along each segment. Empty → defaults from normalize / baked level.
   */
  roadPolylines: XZ[][];
  /**
   * Terrace façade runs (open polylines). Houses fill along each segment,
   * facing the park. Empty → defaults from normalize / baked level.
   */
  terraceRuns: XZ[][];
  /**
   * Fairy-light runs — each node is a 12 ft pole; coloured bulbs on a sagging
   * wire between them. Empty → none.
   */
  fairyLightRuns: FairyLightRun[];
  /** Named buildings / play kit. */
  placeables: Placeable[];
  /**
   * Bin positions. Empty means auto-space them around the outer path lip
   * from the current shore.
   */
  bins: XZ[];
  /**
   * Foliage from the level editor (trees, shrubs, flower beds).
   * Empty means none in the park.
   */
  trees: TreeSpot[];
  /**
   * Where scripted missions play out (red arrow targets / spawn anchors).
   * Always one entry per known mission id after normalize.
   */
  missionSpots: MissionSpot[];
}

export const LEVEL_STORAGE_KEY = "canoe-lake-level-v1";
export const LEVEL_FILE = "levels/canoe-lake.json";
/** Editor camera (pan/zoom) — not used by the game. */
export const EDITOR_VIEW_STORAGE_KEY = "canoe-lake-editor-view-v1";

export const TREE_KINDS: TreeKind[] = [
  "holm",
  "plane",
  "scrub",
  "shrub",
  "flowerBed",
];

export const TREE_LABELS: Record<TreeKind, string> = {
  holm: "Holm oak",
  plane: "Plane",
  scrub: "Scrub",
  shrub: "Shrub",
  flowerBed: "Flower bed",
};
