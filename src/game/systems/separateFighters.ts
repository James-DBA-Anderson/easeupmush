import type { Fighter } from "../entities/Fighter";
import { LANE } from "../constants";
import type { Obstacle } from "../world/obstacles";

const BODY_RX = 34;
const BODY_RY = 26;

/** Downed / KO / cuffed — stay put; living fighters step around them. */
function isImmobile(f: Fighter): boolean {
  return f.planted;
}

/**
 * Keep fighters from stacking (Streets of Rage lane spacing).
 * Airborne only push on X so jump-kicks can clear bodies.
 * Immobile bodies never move.
 */
export function separateFighters(fighters: Fighter[]): void {
  for (let i = 0; i < fighters.length; i++) {
    for (let j = i + 1; j < fighters.length; j++) {
      pushPair(fighters[i], fighters[j]);
    }
  }
}

/** Keep fighters from walking through bins / cars / bollards. */
export function separateFightersFromObstacles(
  fighters: Fighter[],
  obstacles: Obstacle[],
): void {
  for (const f of fighters) {
    if (f.airborne || isImmobile(f) || f.platformY !== null) continue;
    for (const o of obstacles) {
      const dx = f.x - o.x;
      const dy = f.y - o.y;
      const minX = BODY_RX * 0.7 + o.rx;
      const minY = BODY_RY * 0.7 + o.ry;
      if (Math.abs(dx) >= minX || Math.abs(dy) >= minY) continue;
      if (Math.abs(dx) / minX > Math.abs(dy) / minY) {
        f.x = o.x + Math.sign(dx || 1) * minX;
      } else {
        f.y = o.y + Math.sign(dy || 1) * minY;
        f.groundY = f.y;
      }
      f.x = clamp(f.x, LANE.minX, LANE.maxX);
      f.y = clamp(f.y, LANE.minY, LANE.maxY);
      f.groundY = f.y;
    }
  }
}

function pushPair(a: Fighter, b: Fighter): void {
  const aImm = isImmobile(a) && !a.airborne;
  const bImm = isImmobile(b) && !b.airborne;
  if (aImm && bImm) return;

  const ay = a.airborne ? a.groundY : a.y;
  const by = b.airborne ? b.groundY : b.y;
  let dx = b.x - a.x;
  let dy = by - ay;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  if (absX >= BODY_RX || absY >= BODY_RY) return;

  if (absX < 0.5 && absY < 0.5) {
    dx = 1;
    dy = 0;
  }

  const overlapX = BODY_RX - absX;
  const overlapY = BODY_RY - absY;

  if (overlapX <= overlapY || a.airborne || b.airborne) {
    const full = (overlapX / 2 + 0.5) * Math.sign(dx || 1);
    if (aImm) {
      b.x += full * 2;
    } else if (bImm) {
      a.x -= full * 2;
    } else {
      a.x -= full;
      b.x += full;
    }
  } else {
    const full = (overlapY / 2 + 0.5) * Math.sign(dy || 1);
    if (aImm) {
      b.y += full * 2;
      b.groundY = b.y;
    } else if (bImm) {
      a.y -= full * 2;
      a.groundY = a.y;
    } else {
      if (!a.airborne) {
        a.y -= full;
        a.groundY = a.y;
      }
      if (!b.airborne) {
        b.y += full;
        b.groundY = b.y;
      }
    }
  }

  if (!aImm) {
    a.x = clamp(a.x, LANE.minX, LANE.maxX);
    if (!a.airborne && a.platformY === null) {
      a.y = clamp(a.y, LANE.minY, LANE.maxY);
      a.groundY = a.y;
    }
  }
  if (!bImm) {
    b.x = clamp(b.x, LANE.minX, LANE.maxX);
    if (!b.airborne && b.platformY === null) {
      b.y = clamp(b.y, LANE.minY, LANE.maxY);
      b.groundY = b.y;
    }
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
