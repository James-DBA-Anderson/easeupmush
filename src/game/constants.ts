export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

/** Side-scrolling Southsea strip (Eastney → South Parade Pier → sea defences → Clarence Pier). */
export const WORLD_WIDTH = 14500;

export const LANE = {
  minX: 80,
  maxX: WORLD_WIDTH - 80,
  minY: GAME_HEIGHT * 0.52,
  /** Bottom of the fight lane — includes the road strip. */
  maxY: GAME_HEIGHT - 14,
} as const;

/**
 * Shingle / common strip behind the promenade — background lads patrol here.
 * Kept below the sea band so they never paddle mid-Solent.
 */
export const COMMON = {
  minY: GAME_HEIGHT * 0.455,
  maxY: GAME_HEIGHT * 0.5,
} as const;

/** Visible kerb/road band at the bottom of the screen (cars park here). */
export const ROAD = {
  top: GAME_HEIGHT - 72,
  height: 72,
} as const;

/**
 * Where civilians amble — promenade only, not the road.
 * Fight lane still includes the road for the player / scraps.
 */
export const PROMENADE = {
  minY: LANE.minY,
  /** Just above the kerb so stroll feet stay off the tarmac. */
  maxY: ROAD.top - 10,
} as const;
