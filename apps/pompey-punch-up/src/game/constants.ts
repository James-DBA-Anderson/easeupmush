export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

/**
 * Visible playfield width. On wide phones Scale.EXPAND grows past GAME_WIDTH
 * so the canvas fills the screen instead of letterboxing.
 */
export function viewportWidth(scene: {
  scale: { gameSize: { width: number } };
  cameras?: { main?: { width: number } };
}): number {
  const fromCam = scene.cameras?.main?.width;
  const fromScale = scene.scale.gameSize.width;
  return Math.max(GAME_WIDTH, Math.round(fromCam || fromScale || GAME_WIDTH));
}

/** Side-scrolling Southsea strip (Eastney → South Parade Pier → sea defences → Clarence Pier).
 *  World ends at the funfair — Level 2 destination. */
export const WORLD_WIDTH = 14400;

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
 * Draw-order bands (Phaser depth).
 * Fight-lane folk sort by laneY inside [FIGHT_DEPTH_BASE .. PASSING_TRAFFIC_DEPTH).
 * Passing motors sit on the road in front of the promenade — always above people.
 */
export const FIGHT_DEPTH_BASE = 10;
/** Ambient traffic — closer to camera than anyone on the fight strip. */
export const PASSING_TRAFFIC_DEPTH = 58;

/**
 * Where civilians amble — promenade only, not the road.
 * Fight lane still includes the road for the player / scraps.
 */
export const PROMENADE = {
  minY: LANE.minY,
  /** Just above the kerb so stroll feet stay off the tarmac. */
  maxY: ROAD.top - 10,
} as const;
