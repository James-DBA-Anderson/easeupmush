export const TAU = Math.PI * 2;

/** Hip height above the ground when standing (world metres). */
export const HIP_HEIGHT = 0.92;

/** World width the camera tries to show. Tall portrait gets extra sky. */
export const VIEW_WIDTH = 6.6;

export const JOYSTICK_DEADZONE = 0.16;

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
