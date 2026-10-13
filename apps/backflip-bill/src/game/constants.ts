export const TAU = Math.PI * 2;

/** Hip height above the ground when standing (world metres). */
export const HIP_HEIGHT = 0.92;

export const GRAVITY = 26;
export const JUMP_VY = 10.6;
export const MAX_SPEED = 8.4;
export const ACCEL = 22;
export const DECEL = 18;
export const TURN_ACCEL = 32;

/** One full backflip over this many seconds at a standing takeoff. */
export const FLIP_DURATION_SLOW = 1.18;
/** One full backflip over this many seconds at max run-up. */
export const FLIP_DURATION_FAST = 0.7;

export const CLEAN_LAND_RAD = (22 * Math.PI) / 180;
export const STUMBLE_LAND_RAD = (68 * Math.PI) / 180;

export const STUMBLE_TIME = 0.7;
export const FALLEN_TIME = 1.15;
export const DEATH_TIME = 1.15;

export const SPAWN_X = 4.2;
export const GROUND_Y = 0;
export const LEFT_END = 16.2;
export const GAP_END = 21.5;
export const LEVEL_END = 38;
export const FLAG_X = 32.4;
export const KILL_Y = -7;

/** World width the camera tries to show. Tall portrait gets extra sky. */
export const VIEW_WIDTH = 9.2;

export const JOYSTICK_DEADZONE = 0.16;
