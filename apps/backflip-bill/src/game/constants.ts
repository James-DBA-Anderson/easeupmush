export const TAU = Math.PI * 2;

/** Hip height above the ground when standing (world metres). */
export const HIP_HEIGHT = 0.92;

/** World width the camera tries to show. Tall portrait gets extra sky. */
export const VIEW_WIDTH = 6.6;

/** Desktop shows more world than portrait (another 20% out from the last zoom). */
export const VIEW_WIDTH_DESKTOP = VIEW_WIDTH * 1.44;

export const JOYSTICK_DEADZONE = 0.16;

/** Max takeoff |vx| (m/s) that still counts as a standing backflip. */
export const STANDING_FLIP_MAX_VX = 1.4;

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
