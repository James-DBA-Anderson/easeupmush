import { VIEW_WIDTH, VIEW_WIDTH_DESKTOP } from "./constants";

/** World x of the start wall. Camera is locked here, so this sits on the left of the screen. */
export const START_WALL_X = 0.55;

export interface Platform {
  x0: number;
  x1: number;
  y: number;
}

export interface Level {
  id: number;
  title: string;
  spawnX: number;
  platforms: Platform[];
  gapX0: number;
  gapX1: number;
  /** Solid floor at the bottom of the gap. */
  pitY: number;
  flagX: number;
  killY: number;
  endX: number;
}

export const LEVELS: Level[] = [
  {
    id: 1,
    title: "Level 1",
    spawnX: 4.2,
    platforms: [
      { x0: -4, x1: 16.2, y: 0 },
      { x0: 21.5, x1: 44, y: 0 },
    ],
    gapX0: 16.2,
    gapX1: 21.5,
    pitY: -3.4,
    flagX: 32.4,
    killY: -7,
    endX: 38,
  },
  {
    id: 2,
    title: "Level 2",
    spawnX: 4.2,
    platforms: [
      { x0: -4, x1: 16.2, y: 0 },
      { x0: 21.8, x1: 44, y: -3.15 },
    ],
    gapX0: 16.2,
    gapX1: 21.8,
    pitY: -6.4,
    flagX: 33.2,
    killY: -10,
    endX: 40,
  },
  {
    id: 3,
    title: "Level 3",
    spawnX: 4.2,
    platforms: [
      { x0: -4, x1: 15.4, y: 0 },
      { x0: 25.2, x1: 58, y: -16.8 },
    ],
    gapX0: 15.4,
    gapX1: 25.2,
    pitY: -20.6,
    flagX: 40.5,
    killY: -28,
    endX: 52,
  },
  {
    id: 4,
    title: "Level 4",
    spawnX: 4.2,
    platforms: [
      { x0: -4, x1: 16.2, y: 0 },
      { x0: 22.15, x1: 23.95, y: 0 },
    ],
    gapX0: 16.2,
    gapX1: 22.15,
    pitY: -3.4,
    flagX: 22.7,
    killY: -7,
    endX: 31,
  },
];

export function spawnGround(level: Level): number {
  return groundAt(level, level.spawnX) ?? 0;
}

/** Finish-line platform height. Altimeter 0. */
export function finishGround(level: Level): number {
  return groundAt(level, level.flagX) ?? 0;
}

/** Standing on the same platform the flag is planted on. */
export function onFlagPlatform(level: Level, x: number): boolean {
  for (const p of level.platforms) {
    if (level.flagX < p.x0 || level.flagX > p.x1) continue;
    return x >= p.x0 && x <= p.x1;
  }
  return false;
}

export function pitFloor(level: Level): Platform {
  return { x0: level.gapX0, x1: level.gapX1, y: level.pitY };
}

function pitSpans(level: Level): Platform[] {
  const plats = [...level.platforms].sort((a, b) => a.x0 - b.x0);
  const spans: Platform[] = [];
  for (let i = 0; i < plats.length - 1; i++) {
    const a = plats[i]!;
    const b = plats[i + 1]!;
    if (b.x0 - a.x1 > 0.2) spans.push({ x0: a.x1, x1: b.x0, y: level.pitY });
  }
  const last = plats[plats.length - 1];
  if (last) {
    const end = Math.max(level.endX, last.x1) + 24;
    if (end - last.x1 > 0.2) spans.push({ x0: last.x1, x1: end, y: level.pitY });
  }
  return spans;
}

function solids(level: Level): Platform[] {
  return [...level.platforms, ...pitSpans(level)];
}

export function groundAt(level: Level, x: number): number | null {
  let best: number | null = null;
  for (const p of solids(level)) {
    if (x < p.x0 || x > p.x1) continue;
    if (best === null || p.y > best) best = p.y;
  }
  return best;
}

/** Push a circle out of platform solids (top slab + vertical sides, infinite down). */
export interface NearSolid {
  px: number;
  py: number;
  nx: number;
  ny: number;
  dist: number;
}

function closestOnPlatform(p: Platform, x: number, y: number): NearSolid {
  if (x >= p.x0 && x <= p.x1 && y <= p.y) {
    const penUp = p.y - y;
    const penL = x - p.x0;
    const penR = p.x1 - x;
    let nx = 0;
    let ny = 1;
    let depth = penUp;
    if (penL < depth) {
      depth = penL;
      nx = -1;
      ny = 0;
    }
    if (penR < depth) {
      depth = penR;
      nx = 1;
      ny = 0;
    }
    return { px: x, py: y, nx, ny, dist: 0 };
  }
  if (x >= p.x0 && x <= p.x1) {
    return { px: x, py: p.y, nx: 0, ny: 1, dist: y - p.y };
  }
  if (y <= p.y) {
    if (x < p.x0) return { px: p.x0, py: y, nx: -1, ny: 0, dist: p.x0 - x };
    return { px: p.x1, py: y, nx: 1, ny: 0, dist: x - p.x1 };
  }
  const cx = x < p.x0 ? p.x0 : p.x1;
  const dx = x - cx;
  const dy = y - p.y;
  const dist = Math.hypot(dx, dy);
  const inv = dist > 1e-6 ? 1 / dist : 1;
  return { px: cx, py: p.y, nx: dx * inv, ny: dy * inv, dist };
}

/** Closest solid he is heading toward — floor, pit, platform face, or start wall. */
export function approachingSolid(
  level: Level,
  x: number,
  y: number,
  vx: number,
  vy: number,
  maxDist = 1.85,
): NearSolid | null {
  let best: NearSolid | null = null;
  let bestEta = Infinity;
  const consider = (hit: NearSolid) => {
    if (hit.dist > maxDist) return;
    const closing = Math.max(0, -vx * hit.nx - vy * hit.ny);
    const eta = hit.dist / Math.max(0.35, closing);
    if (eta < bestEta) {
      bestEta = eta;
      best = hit;
    }
  };
  for (const p of solids(level)) consider(closestOnPlatform(p, x, y));
  consider({ px: START_WALL_X, py: y, nx: 1, ny: 0, dist: x - START_WALL_X });
  return best;
}

export function pushOutOfSolid(
  level: Level,
  x: number,
  y: number,
  r: number,
): { nx: number; ny: number; depth: number } | null {
  let best: { nx: number; ny: number; depth: number } | null = null;
  for (const p of solids(level)) {
    const left = p.x0 - r;
    const right = p.x1 + r;
    const top = p.y + r;
    if (x < left || x > right || y > top) continue;
    const penUp = top - y;
    const penL = x - left;
    const penR = right - x;
    let nx = 0;
    let ny = 1;
    let depth = penUp;
    if (penL < depth) {
      depth = penL;
      nx = -1;
      ny = 0;
    }
    if (penR < depth) {
      depth = penR;
      nx = 1;
      ny = 0;
    }
    if (depth > 0 && (!best || depth > best.depth)) best = { nx, ny, depth };
  }
  const wallDepth = START_WALL_X + r - x;
  if (wallDepth > 0 && (!best || wallDepth > best.depth)) {
    best = { nx: 1, ny: 0, depth: wallDepth };
  }
  return best;
}

export interface Cam {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function makeCam(viewW: number, viewH: number): Cam {
  return { x: 0, y: 0, w: viewW, h: viewH };
}

export function fitView(cssW: number, cssH: number, desktop = false): { w: number; h: number } {
  const w = desktop ? VIEW_WIDTH_DESKTOP : VIEW_WIDTH;
  const h = w * (cssH / Math.max(1, cssW));
  return { w, h };
}

export function followCam(
  cam: Cam,
  px: number,
  py: number,
  vx: number,
  dt: number,
  level: Level,
): void {
  const look = Math.max(-2.2, Math.min(2.2, vx * 0.28));
  const targetX = px + look;
  cam.x += (targetX - cam.x) * Math.min(1, dt * 6);
  const minX = cam.w * 0.45;
  const maxX = level.endX - cam.w * 0.4;
  cam.x = Math.max(minX, Math.min(maxX, cam.x));
  const floor = groundAt(level, px);
  const falling = floor === null || py - floor > 1.4;
  const targetY = falling
    ? py + cam.h * 0.22
    : floor + cam.h * 0.22;
  cam.y += (targetY - cam.y) * Math.min(1, dt * (falling ? 14 : 5.5));
}

export function drawSky(ctx: CanvasRenderingContext2D, cam: Cam, cssW: number, cssH: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, cssH);
  g.addColorStop(0, "#1b3348");
  g.addColorStop(0.45, "#3a5570");
  g.addColorStop(0.72, "#c47a4a");
  g.addColorStop(1, "#f0a23a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cssW, cssH);

  const sx = worldToScreenX(cam, cssW, 10);
  const sy = worldToScreenY(cam, cssH, 7);
  const glow = ctx.createRadialGradient(sx, sy, 4, sx, sy, cssW * 0.55);
  glow.addColorStop(0, "rgba(240,162,58,0.28)");
  glow.addColorStop(1, "rgba(240,162,58,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, cssW, cssH);
}

export function drawWorld(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  level: Level,
): void {
  drawSea(ctx, cam, cssW, cssH);
  drawBackdrop(ctx, cam, cssW, cssH, level);
  drawPit(ctx, cam, cssW, cssH, level);
  drawGround(ctx, cam, cssW, cssH, level);
  drawStartWall(ctx, cam, cssW, cssH, level);
  drawFlag(ctx, cam, cssW, cssH, level);
}

function drawSea(ctx: CanvasRenderingContext2D, cam: Cam, cssW: number, cssH: number): void {
  const horizon = worldToScreenY(cam, cssH, 1.8);
  ctx.fillStyle = "#163445";
  ctx.fillRect(0, horizon, cssW, cssH);
  ctx.strokeStyle = "rgba(200,221,230,0.25)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  ctx.lineTo(cssW, horizon);
  ctx.stroke();

  ctx.strokeStyle = "rgba(200,221,230,0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const y = horizon + 18 + i * 22;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(cssW, y);
    ctx.stroke();
  }
}

function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  level: Level,
): void {
  for (const p of level.platforms) {
    for (let x = p.x0 + 1.5; x < p.x1 - 0.8; x += 6.5) {
      const sx = worldToScreenX(cam, cssW, x);
      const gy = worldToScreenY(cam, cssH, p.y);
      if (sx < -40 || sx > cssW + 40) continue;
      ctx.strokeStyle = "#2a1c14";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx, gy);
      ctx.lineTo(sx, gy - 86);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,196,107,0.85)";
      ctx.beginPath();
      ctx.arc(sx, gy - 90, 6, 0, Math.PI * 2);
      ctx.fill();
      const lamp = ctx.createRadialGradient(sx, gy - 90, 2, sx, gy - 90, 48);
      lamp.addColorStop(0, "rgba(255,196,107,0.28)");
      lamp.addColorStop(1, "rgba(255,196,107,0)");
      ctx.fillStyle = lamp;
      ctx.beginPath();
      ctx.arc(sx, gy - 90, 48, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawPit(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  level: Level,
): void {
  const leftY = level.platforms[0]?.y ?? 0;
  const landY = level.platforms[1]?.y ?? leftY;
  const drop = leftY - landY;
  const y0 = worldToScreenY(cam, cssH, leftY);
  const yFloor = worldToScreenY(cam, cssH, level.pitY);
  const h = Math.max(0, yFloor - y0);
  ctx.font = "700 13px 'Source Sans 3', sans-serif";
  ctx.textAlign = "center";
  for (const span of pitSpans(level)) {
    const x0 = worldToScreenX(cam, cssW, span.x0);
    const x1 = worldToScreenX(cam, cssW, span.x1);
    const w = Math.max(0, x1 - x0);
    if (w < 2) continue;
    if (drop > 8 && span.x0 <= level.gapX0 + 0.05 && span.x1 >= level.gapX1 - 0.05) {
      ctx.fillStyle = "rgba(7, 16, 24, 0.28)";
      ctx.fillRect(x0, y0, w, h);
      ctx.fillStyle = "rgba(80, 30, 20, 0.55)";
      ctx.fillText("the drop", (x0 + x1) / 2, y0 + 28);
      continue;
    }
    const g = ctx.createLinearGradient(0, y0, 0, yFloor);
    g.addColorStop(0, "#0a1218");
    g.addColorStop(1, "#1a1612");
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, w, h);
    ctx.fillStyle = "rgba(80, 30, 20, 0.45)";
    const labelX =
      span.x0 >= level.gapX1 - 0.05
        ? worldToScreenX(cam, cssW, span.x0 + 1.8)
        : (x0 + x1) / 2;
    ctx.fillText("the gap", labelX, y0 + 28);
  }
}

function drawGround(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  level: Level,
): void {
  const ppm = cssW / cam.w;

  for (const p of solids(level)) {
    const x0 = worldToScreenX(cam, cssW, p.x0);
    const x1 = worldToScreenX(cam, cssW, p.x1);
    const gy = worldToScreenY(cam, cssH, p.y);
    const depth = Math.max(180, cssH - gy + 48);
    ctx.fillStyle = "#5c5348";
    ctx.fillRect(x0, gy, x1 - x0, depth);
    ctx.fillStyle = "#8a8378";
    ctx.fillRect(x0, gy, x1 - x0, 10);
    ctx.fillStyle = "#d8cbb8";
    ctx.fillRect(x0, gy - 4, x1 - x0, 6);

    ctx.strokeStyle = "rgba(40,32,24,0.25)";
    ctx.lineWidth = 1;
    const slab = 1.6 * ppm;
    for (let x = x0; x < x1; x += slab) {
      ctx.beginPath();
      ctx.moveTo(x, gy - 4);
      ctx.lineTo(x, gy + depth);
      ctx.stroke();
    }
  }

  ctx.fillStyle = "#2a2420";
  for (const p of level.platforms) {
    const gy = worldToScreenY(cam, cssH, p.y);
    const a = worldToScreenX(cam, cssW, p.x0);
    const b = worldToScreenX(cam, cssW, p.x1);
    ctx.fillRect(a - 3, gy - 6, 8, 18);
    ctx.fillRect(b - 5, gy - 6, 8, 18);
  }
}

function drawStartWall(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  level: Level,
): void {
  const x = worldToScreenX(cam, cssW, START_WALL_X);
  if (x < 2) return;
  const roof = level.platforms[0]?.y ?? 0;
  const gy = worldToScreenY(cam, cssH, roof);
  ctx.fillStyle = "#3d3832";
  ctx.fillRect(0, 0, x, cssH);
  ctx.fillStyle = "#2a2622";
  ctx.fillRect(0, gy, x, cssH - gy);
  ctx.fillStyle = "#8a8378";
  ctx.fillRect(x - 10, 0, 10, cssH);
  ctx.fillStyle = "#d8cbb8";
  ctx.fillRect(x - 4, 0, 4, cssH);
}

function drawFlag(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  level: Level,
): void {
  const gyWorld = finishGround(level);
  const sx = worldToScreenX(cam, cssW, level.flagX);
  const gy = worldToScreenY(cam, cssH, gyWorld);
  ctx.strokeStyle = "#1a1410";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(sx, gy);
  ctx.lineTo(sx, gy - 78);
  ctx.stroke();
  ctx.fillStyle = "#f0a23a";
  ctx.beginPath();
  ctx.moveTo(sx, gy - 78);
  ctx.lineTo(sx + 36, gy - 64);
  ctx.lineTo(sx, gy - 50);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#e8f0f4";
  ctx.font = "700 12px 'Source Sans 3', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Bill", sx + 6, gy - 60);
}

export function worldToScreenX(cam: Cam, cssW: number, x: number): number {
  return ((x - (cam.x - cam.w * 0.5)) / cam.w) * cssW;
}

export function worldToScreenY(cam: Cam, cssH: number, y: number): number {
  return ((cam.y + cam.h * 0.5 - y) / cam.h) * cssH;
}

export function worldToScreen(
  cam: Cam,
  cssW: number,
  cssH: number,
  x: number,
  y: number,
): { x: number; y: number; ppm: number } {
  return {
    x: worldToScreenX(cam, cssW, x),
    y: worldToScreenY(cam, cssH, y),
    ppm: cssW / cam.w,
  };
}
