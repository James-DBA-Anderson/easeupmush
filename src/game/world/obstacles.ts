export interface Obstacle {
  x: number;
  y: number;
  /** Horizontal radius */
  rx: number;
  /** Lane / depth radius */
  ry: number;
  kind: "prop" | "corpse" | "pickup";
}

/**
 * Soft steering — peel onto a freer lane when something sits ahead.
 * Keeps a solid forward walk so folk don't freeze and flip facing in place.
 * Prefer lane (Y) slides over reversing into a bin / bollard face.
 */
export function steerAway(
  x: number,
  y: number,
  vx: number,
  vy: number,
  obstacles: Obstacle[],
  preferDist = 50,
  laneMin = 0,
  laneMax = 9999,
): { vx: number; vy: number } {
  let ox = 0;
  let oy = 0;
  let forwardCut = 1;
  const travelX = Math.sign(vx) || 0;
  let bestAhead = 0;
  let sideSteer = 0;

  for (const o of obstacles) {
    const dx = x - o.x;
    const dy = y - o.y;
    const nx = dx / Math.max(o.rx, 1);
    const ny = dy / Math.max(o.ry, 1);
    const d = Math.hypot(nx, ny);

    // Soft push out if already overlapping — bias to lane so they slide round
    if (d < 1.4 && d > 0.001) {
      const strength = (1.4 - d) / 1.4;
      ox += (nx / d) * strength * preferDist * 0.3;
      oy += (ny / d) * strength * preferDist * 1.15;
      // Dead-on into the prop face → pick the freer lane and commit
      if (Math.abs(ny) < 0.45) {
        oy += pickLaneSide(y, laneMin, laneMax) * strength * preferDist * 0.95;
      }
    }

    const ahead = travelX === 0 ? 0 : (o.x - x) * travelX;
    const sideGap = Math.abs(dy) - o.ry;
    const inLane = sideGap < 30;
    const look = preferDist + o.rx * 0.9;

    // Obstacle ahead on this stroll line — start peeling early
    if (travelX !== 0 && ahead > -o.rx * 0.4 && ahead < look && inLane) {
      const closeness = 1 - Math.max(0, ahead) / look;
      if (closeness > bestAhead) {
        bestAhead = closeness;
        forwardCut = Math.min(forwardCut, 1 - closeness * 0.55);

        let side = 0;
        if (dy > 3) side = 1;
        else if (dy < -3) side = -1;
        else side = pickLaneSide(y, laneMin, laneMax);

        // Stay inside the lane if the "natural" side is jammed against the edge
        if (side < 0 && y - laneMin < 14) side = 1;
        if (side > 0 && laneMax - y < 14) side = -1;

        sideSteer = side * (0.6 + closeness * 1.35) * preferDist;
      }
    }
  }

  if (sideSteer !== 0) oy = sideSteer;

  let nvx = vx * forwardCut + ox * 0.07;
  let nvy = vy + oy * 0.09;

  // Close / overlapping: lean hard into the lane dodge so they don't grind
  if (bestAhead > 0.4) {
    const side = Math.sign(oy || sideSteer) || pickLaneSide(y, laneMin, laneMax);
    nvy += side * bestAhead * 0.95;
  }

  // Always keep intended travel direction when they meant to walk that way
  if (travelX !== 0 && Math.sign(nvx) !== 0 && Math.sign(nvx) !== travelX) {
    nvx = travelX * Math.max(0.35, Math.abs(nvx));
  } else if (travelX !== 0 && Math.abs(nvx) < 0.28) {
    nvx = travelX * 0.45;
  }

  const len = Math.hypot(nvx, nvy);
  if (len > 0.001) {
    nvx /= len;
    nvy /= len;
  }
  return { vx: nvx, vy: nvy };
}

/** -1 = toward beach (up), +1 = toward road (down). */
function pickLaneSide(y: number, laneMin: number, laneMax: number): number {
  const roomUp = y - laneMin;
  const roomDown = laneMax - y;
  if (roomUp < 12 && roomDown > 12) return 1;
  if (roomDown < 12 && roomUp > 12) return -1;
  return roomUp >= roomDown ? -1 : 1;
}

/** Push points apart so props/pickups don't stack. */
export function separateObstacles(list: { x: number; y: number; rx: number; ry: number }[]): void {
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const minX = a.rx + b.rx;
      const minY = a.ry + b.ry;
      if (Math.abs(dx) >= minX || Math.abs(dy) >= minY) continue;
      if (Math.abs(dx) < minX) {
        const push = ((minX - Math.abs(dx)) / 2 + 1) * Math.sign(dx || 1);
        a.x -= push;
        b.x += push;
      }
      if (Math.abs(dy) < minY) {
        const push = ((minY - Math.abs(dy)) / 2 + 1) * Math.sign(dy || 1);
        a.y -= push;
        b.y += push;
      }
    }
  }
}
