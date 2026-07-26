export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

/** Side-scrolling Southsea strip (Clarence Pier → South Parade Pier). */
export const WORLD_WIDTH = 4000;

export const LANE = {
  minX: 80,
  maxX: WORLD_WIDTH - 80,
  minY: GAME_HEIGHT * 0.52,
  /** Bottom of the fight lane — includes the road strip. */
  maxY: GAME_HEIGHT - 14,
} as const;

/** Visible kerb/road band at the bottom of the screen (cars park here). */
export const ROAD = {
  top: GAME_HEIGHT - 72,
  height: 72,
} as const;
