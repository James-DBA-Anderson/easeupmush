/** Walkable top surface (ground / lollipop discs). */
export interface Platform {
  x: number;
  y: number;
  z: number;
  radius: number;
  /** Top surface Y. */
  top: number;
  /** Optional rectangular slab (ground). */
  halfW?: number;
  halfD?: number;
}

/** Solid volume the player cannot walk through. */
export interface Solid {
  x: number;
  z: number;
  /** Bottom / top of the blocking volume. */
  y0: number;
  y1: number;
  kind: "cylinder" | "box";
  radius?: number;
  halfW?: number;
  halfD?: number;
}

/** Vertical volume a climber can scale (e.g. metal gate). */
export interface ClimbZone {
  x: number;
  z: number;
  y0: number;
  y1: number;
  halfW: number;
  halfD: number;
}

export type CharacterId = "bunsterstons" | "chippy";

/** Odd levels → Bunsterstons; even levels → Chippy. */
export function characterForLevel(level: number): CharacterId {
  return level % 2 === 1 ? "bunsterstons" : "chippy";
}

export function characterDisplayName(id: CharacterId): string {
  return id === "bunsterstons" ? "Bunsterstons" : "Chippy";
}
