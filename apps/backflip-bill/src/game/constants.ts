export const TAU = Math.PI * 2;

/** Hip height above the ground when standing (world metres). */
export const HIP_HEIGHT = 0.92;

export const GRAVITY = 22;
export const JUMP_VY = 12.2;
export const MAX_SPEED = 9;
export const ACCEL = 22;
export const DECEL = 18;
export const TURN_ACCEL = 32;

/** One full backflip over this many seconds at a standing takeoff (mid tuck). */
export const FLIP_DURATION_SLOW = 1.28;
/** One full backflip over this many seconds at max run-up (mid tuck). */
export const FLIP_DURATION_FAST = 0.82;

/** How quickly crouch eases toward the stick / keys. */
export const TUCK_LERP = 7.5;
/** Rotation rate at full layout (stick up). Mid tuck is 1. */
export const TUCK_RATE_STRAIGHT = 0.55;
/** Rotation rate at full crouch (stick down). */
export const TUCK_RATE_CROUCH = 1.52;

export const CLEAN_LAND_RAD = (22 * Math.PI) / 180;
export const STUMBLE_LAND_RAD = (68 * Math.PI) / 180;

export const STUMBLE_TIME = 0.7;
export const FALLEN_TIME = 1.15;
export const DEATH_TIME = 1.15;

/** World width the camera tries to show. Tall portrait gets extra sky. */
export const VIEW_WIDTH = 6.6;

export const JOYSTICK_DEADZONE = 0.16;
