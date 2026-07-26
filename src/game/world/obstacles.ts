export interface Obstacle {
  x: number;
  y: number;
  /** Horizontal radius */
  rx: number;
  /** Lane / depth radius */
  ry: number;
  kind: "prop" | "corpse" | "pickup";
}

/** Soft steering away from an obstacle circle. */
export function steerAway(
  x: number,
  y: number,
  vx: number,
  vy: number,
  obstacles: Obstacle[],
  preferDist = 50,
): { vx: number; vy: number } {
  let ox = 0;
  let oy = 0;
  for (const o of obstacles) {
    const dx = x - o.x;
    const dy = y - o.y;
    const nx = dx / Math.max(o.rx, 1);
    const ny = dy / Math.max(o.ry, 1);
    const d = Math.hypot(nx, ny);
    if (d < 1.35 && d > 0.01) {
      const strength = (1.35 - d) / 1.35;
      ox += (dx / Math.max(Math.abs(dx), 1)) * strength * preferDist;
      oy += (dy / Math.max(Math.abs(dy), 1)) * strength * preferDist * 0.8;
    }
  }
  let nvx = vx + ox * 0.04;
  let nvy = vy + oy * 0.04;
  const len = Math.hypot(nvx, nvy);
  if (len > 0.001) {
    nvx /= len;
    nvy /= len;
  }
  return { vx: nvx, vy: nvy };
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
