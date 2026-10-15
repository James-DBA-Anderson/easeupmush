import { VIEW_WIDTH, VIEW_WIDTH_DESKTOP } from "./constants";

/** World x of the start wall. Camera is locked here, so this sits on the left of the screen. */
export const START_WALL_X = 0.55;

export interface Platform {
  x0: number;
  x1: number;
  y: number;
}

export interface Obstacle {
  x: number;
  w: number;
  h: number;
  /** Extra chimney / vent on top of the crate. */
  stack?: number;
}

export interface Train {
  /** World-units per second the countryside and oncoming blocks slide left. */
  speed: number;
  /** Visual rail / tree offset, in metres. */
  scroll: number;
}

export interface Level {
  id: number;
  title: string;
  spawnX: number;
  platforms: Platform[];
  /** Crates: `y` is the top. Collision is a solid block down to the floor. */
  boxes?: Platform[];
  gapX0: number;
  gapX1: number;
  /** Solid floor at the bottom of the gap. */
  pitY: number;
  flagX: number;
  killY: number;
  endX: number;
  /** Debug sandbox: no finish, ragdoll does not reset the level. */
  sandbox?: boolean;
  noFlag?: boolean;
  /** Circus hoop: only a tucked pose fits the hole. */
  hoop?: Hoop;
  /** Roof-height blocks that slide toward the player. */
  obstacles?: Obstacle[];
  train?: Train;
  hint?: string;
}

export interface Hoop {
  x: number;
  y: number;
  inner: number;
  outer: number;
  /** 0 layout … 1 crouch. Must be at least this tucked to pass. */
  tuck: number;
}

/** Face the runner, 10° off edge-on so the hole still reads as a hoop. */
const HOOP_YAW = (80 * Math.PI) / 180;
const HOOP_FORESHORTEN = Math.cos(HOOP_YAW);

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
    flagX: 24.8,
    killY: -7,
    endX: 32,
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
    flagX: 24.6,
    killY: -10,
    endX: 32,
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
  {
    id: 5,
    title: "Level 5",
    spawnX: 4.2,
    platforms: [
      { x0: -4, x1: 15.4, y: 0 },
      { x0: 25.0, x1: 50, y: -6.4 },
    ],
    gapX0: 15.4,
    gapX1: 25.0,
    pitY: -9.8,
    flagX: 28.0,
    killY: -15,
    endX: 38,
    hoop: { x: 18.5, y: 3.35, inner: 0.86, outer: 1.26, tuck: 0.7 },
  },
  {
    id: 6,
    title: "Level 6",
    spawnX: 4.2,
    platforms: [{ x0: -4, x1: 42, y: 0 }],
    gapX0: 42,
    gapX1: 8.5,
    pitY: -9.2,
    flagX: 33.6,
    killY: -14,
    endX: 44,
    train: { speed: 4.7, scroll: 0 },
    obstacles: [
      { x: 16.8, w: 1.08, h: 1.18 },
      { x: 24.6, w: 1.14, h: 1.26 },
      { x: 31.2, w: 1.22, h: 1.28, stack: 0.64 },
    ],
    hint: "You're on the 6:42 out of Fratton. Flip over three oncoming blocks — look right for the warning.",
  },
];

export function cloneLevel(src: Level): Level {
  return {
    ...src,
    platforms: src.platforms.map((p) => ({ ...p })),
    boxes: src.boxes?.map((p) => ({ ...p })),
    hoop: src.hoop ? { ...src.hoop } : undefined,
    obstacles: src.obstacles?.map((o) => ({ ...o })),
    train: src.train ? { ...src.train, scroll: 0 } : undefined,
  };
}

export function stepTrain(level: Level, dt: number): void {
  if (!level.train) return;
  const v = level.train.speed;
  level.train.scroll += v * dt;
  for (const o of level.obstacles ?? []) o.x -= v * dt;
}

function roofY(level: Level): number {
  return level.platforms[0]?.y ?? 0;
}

export function obstacleBox(level: Level, o: Obstacle): { x0: number; x1: number; y0: number; y1: number } {
  const roof = roofY(level);
  return { x0: o.x, x1: o.x + o.w, y0: roof, y1: roof + o.h + (o.stack ?? 0) };
}

function aabbHit(
  b: { x0: number; x1: number; y0: number; y1: number },
  x: number,
  y: number,
  r: number,
): { nx: number; ny: number; depth: number } | null {
  const left = b.x0 - r;
  const right = b.x1 + r;
  const bot = b.y0 - r;
  const top = b.y1 + r;
  if (x < left || x > right || y < bot || y > top) return null;
  const penL = x - left;
  const penR = right - x;
  const penD = y - bot;
  const penU = top - y;
  let nx = -1;
  let ny = 0;
  let depth = penL;
  if (penR < depth) {
    depth = penR;
    nx = 1;
    ny = 0;
  }
  if (penD < depth) {
    depth = penD;
    nx = 0;
    ny = -1;
  }
  if (penU < depth) {
    depth = penU;
    nx = 0;
    ny = 1;
  }
  return depth > 0 ? { nx, ny, depth } : null;
}

export function obstacleHits(level: Level, x: number, y: number, r: number): boolean {
  for (const o of level.obstacles ?? []) {
    if (aabbHit(obstacleBox(level, o), x, y, r)) return true;
  }
  return false;
}

/** Next block still ahead of the player, if it's close enough to warn. */
export function approachingObstacle(
  level: Level,
  px: number,
  maxDist = 13.5,
): { dist: number } | null {
  let best: { dist: number } | null = null;
  for (const o of level.obstacles ?? []) {
    const dist = o.x - px;
    if (dist + o.w < 0.35) continue;
    if (dist > maxDist) continue;
    if (!best || dist < best.dist) best = { dist };
  }
  return best;
}

/** Debug sandbox: flat run, optional gap and crates, no finish line. */
export function makeSimLevel(gap: boolean, boxes: boolean): Level {
  const platforms: Platform[] = gap
    ? [
        { x0: -4, x1: 14.2, y: 0 },
        { x0: 18.6, x1: 44, y: 0 },
      ]
    : [{ x0: -4, x1: 44, y: 0 }];
  const crate: Platform[] = [];
  if (boxes) {
    crate.push({ x0: 7.5, x1: 9.05, y: 0.7 });
    crate.push({ x0: 9.35, x1: 10.9, y: 1.22 });
    crate.push(gap ? { x0: 20.4, x1: 22.1, y: 0.92 } : { x0: 16.6, x1: 18.3, y: 0.52 });
  }
  return {
    id: 0,
    title: "Sim",
    spawnX: 4.2,
    platforms,
    boxes: crate,
    gapX0: gap ? 14.2 : 0,
    gapX1: gap ? 18.6 : 0,
    pitY: -3.6,
    flagX: 99,
    killY: -10,
    endX: 36,
    sandbox: true,
    noFlag: true,
  };
}

export function spawnGround(level: Level): number {
  return groundAt(level, level.spawnX) ?? 0;
}

/** Finish-line platform height. Altimeter 0. */
export function finishGround(level: Level): number {
  return groundAt(level, level.flagX) ?? 0;
}

/**
 * Height of the run at x — pads and crates, never the pit floor.
 * Across a gap, lerp takeoff to landing so a preview cam flies the drop.
 */
export function routeAt(level: Level, x: number): number {
  const pads = [...level.platforms, ...(level.boxes ?? [])];
  let under: number | null = null;
  let left: Platform | null = null;
  let right: Platform | null = null;
  for (const p of pads) {
    if (x >= p.x0 && x <= p.x1) {
      if (under === null || p.y > under) under = p.y;
    }
    if (p.x1 <= x && (!left || p.x1 > left.x1)) left = p;
    if (p.x0 >= x && (!right || p.x0 < right.x0)) right = p;
  }
  if (under !== null) return under;
  if (left && right) {
    const span = Math.max(0.01, right.x0 - left.x1);
    const u = Math.max(0, Math.min(1, (x - left.x1) / span));
    return left.y + (right.y - left.y) * u;
  }
  return left?.y ?? right?.y ?? 0;
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
  return [...level.platforms, ...(level.boxes ?? []), ...pitSpans(level)];
}

function groundSlabs(level: Level): Platform[] {
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

/** Highest solid the feet can actually stand on — never a cliff above them. */
export function supportAt(level: Level, x: number, feetY: number, climb = 0.16): number | null {
  let best: number | null = null;
  for (const p of solids(level)) {
    if (x < p.x0 || x > p.x1) continue;
    if (p.y > feetY + climb) continue;
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
  if (level.hoop) consider(closestOnHoop(level.hoop, x, y));
  for (const o of level.obstacles ?? []) {
    const b = obstacleBox(level, o);
    const hit = aabbHit(b, x, y, 0);
    if (hit) consider({ px: x, py: y, nx: hit.nx, ny: hit.ny, dist: 0 });
    else {
      const cx = Math.max(b.x0, Math.min(b.x1, x));
      const cy = Math.max(b.y0, Math.min(b.y1, y));
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);
      const inv = dist > 1e-6 ? 1 / dist : 1;
      consider({ px: cx, py: cy, nx: dx * inv, ny: dy * inv, dist });
    }
  }
  return best;
}

function hoopSlab(h: Hoop): number {
  return Math.max(0.2, h.outer * HOOP_FORESHORTEN + 0.1);
}

function closestOnHoop(h: Hoop, x: number, y: number): NearSolid {
  const py = Math.max(h.y - h.outer, Math.min(h.y + h.outer, y));
  const nx = x >= h.x ? 1 : -1;
  return {
    px: h.x,
    py,
    nx,
    ny: 0,
    dist: Math.abs(x - h.x) - hoopSlab(h),
  };
}

/**
 * Hoop faces along the run. The hole is open in X; only the top/bottom rim
 * (and the whole aperture if he is not tucked) is solid.
 */
export function pushOutOfHoop(
  hoop: Hoop,
  x: number,
  y: number,
  r: number,
  tuck: number,
): { nx: number; ny: number; depth: number } | null {
  const dx = x - hoop.x;
  const dy = y - hoop.y;
  const hw = hoopSlab(hoop) + r;
  if (Math.abs(dx) > hw) return null;
  const ady = Math.abs(dy);
  if (ady - r > hoop.outer) return null;
  const sx = dx >= 0 ? 1 : -1;
  if (tuck < hoop.tuck) {
    return { nx: sx, ny: 0, depth: hw - Math.abs(dx) };
  }
  if (ady + r < hoop.inner) return null;
  const ny = dy >= 0 ? 1 : -1;
  if (ady < (hoop.inner + hoop.outer) * 0.5) {
    return { nx: 0, ny: -ny, depth: Math.max(0.001, ady + r - hoop.inner) };
  }
  return { nx: 0, ny, depth: Math.max(0.001, hoop.outer + r - ady) };
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
  for (const o of level.obstacles ?? []) {
    const hit = aabbHit(obstacleBox(level, o), x, y, r);
    if (hit && (!best || hit.depth > best.depth)) best = hit;
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

/** Fraction of view width to keep ahead of Bill so more of the run is on screen. */
const CAM_AHEAD = 0.18;

export function camLookX(px: number, cam: Cam, vx = 0): number {
  const look = Math.max(-2.2, Math.min(2.2, vx * 0.28));
  return px + cam.w * CAM_AHEAD + look;
}

export function followCam(
  cam: Cam,
  px: number,
  py: number,
  vx: number,
  dt: number,
  level: Level,
): void {
  const targetX = camLookX(px, cam, vx);
  cam.x += (targetX - cam.x) * Math.min(1, dt * 6);
  const minX = cam.w * 0.38;
  const maxX = level.endX - cam.w * 0.4;
  cam.x = Math.max(minX, Math.min(maxX, cam.x));
  const floor = groundAt(level, px);
  const falling = floor === null || py - floor > 1.4;
  const targetY = falling
    ? py + cam.h * 0.22
    : floor + cam.h * 0.22;
  cam.y += (targetY - cam.y) * Math.min(1, dt * (falling ? 14 : 5.5));
  // Keep a band of view under him so the ground can enter the frame before impact.
  const minBelow = cam.h * 0.34;
  const maxCamY = py + cam.h * 0.5 - minBelow;
  if (cam.y > maxCamY) cam.y = maxCamY;
}

export function drawSky(ctx: CanvasRenderingContext2D, cam: Cam, cssW: number, cssH: number): void {
  const topY = cam.y + cam.h * 0.5;
  const botY = cam.y - cam.h * 0.5;
  const g = ctx.createLinearGradient(0, 0, 0, cssH);
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    g.addColorStop(t, skyAt(topY - t * (topY - botY)));
  }
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
  if (level.train) {
    drawTrainCountry(ctx, cam, cssW, cssH, level);
    drawPit(ctx, cam, cssW, cssH, level);
    drawTrain(ctx, cam, cssW, cssH, level);
    drawObstacles(ctx, cam, cssW, cssH, level);
    drawStartWall(ctx, cam, cssW, cssH, level);
    if (!level.noFlag) drawFlag(ctx, cam, cssW, cssH, level);
    return;
  }
  drawHarbour(ctx, cam, cssW, cssH);
  drawPortsdown(ctx, cam, cssW, cssH);
  drawSpinnaker(ctx, cam, cssW, cssH);
  drawTerraces(ctx, cam, cssW, cssH, level);
  drawBackdrop(ctx, cam, cssW, cssH, level);
  drawPit(ctx, cam, cssW, cssH, level);
  drawGround(ctx, cam, cssW, cssH, level);
  drawBoxes(ctx, cam, cssW, cssH, level);
  drawHoop(ctx, cam, cssW, cssH, level);
  drawStartWall(ctx, cam, cssW, cssH, level);
  if (!level.noFlag) drawFlag(ctx, cam, cssW, cssH, level);
}

function drawTrainCountry(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  level: Level,
): void {
  const scroll = level.train?.scroll ?? 0;
  const topY = cam.y + cam.h * 0.5;
  const botY = cam.y - cam.h * 0.5;
  const g = ctx.createLinearGradient(0, 0, 0, cssH);
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    g.addColorStop(t, skyAt(topY - t * (topY - botY)));
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cssW, cssH);
  drawHarbour(ctx, cam, cssW, cssH);
  drawPortsdown(ctx, cam, cssW, cssH);
  drawSpinnaker(ctx, cam, cssW, cssH);

  const horizon = worldToScreenY(cam, cssH, 1.6);
  const left = cam.x - cam.w * 0.5;
  const right = cam.x + cam.w * 0.5;
  const ppm = cssW / cam.w;
  const start = Math.floor((left + scroll * 0.45) / 3.1) * 3.1;
  for (let wx = start; wx < right + scroll * 0.45 + 4; wx += 3.1) {
    const sx = worldToScreenX(cam, cssW, wx - scroll * 0.45);
    if (sx < -50 || sx > cssW + 50) continue;
    drawHouseFront(ctx, sx, horizon, Math.max(18, 1.4 * ppm), 2, Math.abs(Math.floor(wx * 3)) % 5, ppm * 0.42);
  }
}

function drawTrain(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  level: Level,
): void {
  const roof = roofY(level);
  const p = level.platforms[0];
  if (!p) return;
  const scroll = level.train?.scroll ?? 0;
  const ppm = cssW / cam.w;
  const x0 = worldToScreenX(cam, cssW, p.x0);
  const x1 = worldToScreenX(cam, cssW, p.x1);
  const gy = worldToScreenY(cam, cssH, roof);
  const rail = worldToScreenY(cam, cssH, roof - 2.05);
  const w = x1 - x0;
  const bodyH = Math.max(8, rail - gy);

  ctx.fillStyle = "#1a1612";
  ctx.fillRect(x0, rail, w, cssH - rail);
  ctx.fillStyle = "#6a6358";
  ctx.fillRect(x0, rail - 4, w, 8);
  ctx.fillStyle = "#9a9388";
  ctx.fillRect(x0, rail + 10, w, 4);

  const sleeper = 0.72 * ppm;
  const shift = ((scroll * ppm) % Math.max(4, sleeper) + Math.max(4, sleeper)) % Math.max(4, sleeper);
  ctx.fillStyle = "#4a4036";
  for (let x = x0 - shift; x < x1; x += Math.max(8, sleeper)) {
    ctx.fillRect(x, rail + 2, Math.max(4, 0.16 * ppm), 18);
  }

  ctx.fillStyle = "#5c6e7a";
  ctx.fillRect(x0, gy, w, bodyH);
  ctx.fillStyle = "#4a5a66";
  ctx.fillRect(x0, gy + bodyH * 0.55, w, bodyH * 0.45);
  ctx.fillStyle = "#d8e0e6";
  ctx.fillRect(x0, gy - 6, w, 7);
  ctx.fillStyle = "#f0a23a";
  ctx.fillRect(x0, gy - 9, w, 4);

  const carW = 8.6;
  for (let wx = p.x0; wx < p.x1 - 0.4; wx += carW) {
    const xEnd = worldToScreenX(cam, cssW, Math.min(p.x1, wx + carW));
    ctx.fillStyle = "#2a343c";
    ctx.fillRect(xEnd - 4, gy + 6, 8, bodyH - 10);
    ctx.fillStyle = "#b8e4f4";
    ctx.strokeStyle = "#2a343c";
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const win = worldToScreenX(cam, cssW, wx + 1.15 + i * 1.55);
      const ww = Math.max(12, 0.48 * ppm);
      const wh = Math.max(16, 0.42 * ppm);
      if (win < x0 || win > x1 - ww) continue;
      ctx.fillRect(win, gy + 20, ww, wh);
      ctx.strokeRect(win, gy + 20, ww, wh);
    }
    const wheelY = rail - 4;
    const wr = Math.max(8, 0.26 * ppm);
    const w1 = worldToScreenX(cam, cssW, wx + 1.8);
    const w2 = worldToScreenX(cam, cssW, wx + 6.6);
    ctx.fillStyle = "#1a1410";
    ctx.beginPath();
    ctx.arc(w1, wheelY, wr, 0, Math.PI * 2);
    ctx.arc(w2, wheelY, wr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#8a8378";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(w1, wheelY, wr * 0.45, 0, Math.PI * 2);
    ctx.arc(w2, wheelY, wr * 0.45, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawObstacles(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  level: Level,
): void {
  const ppm = cssW / cam.w;
  for (const o of level.obstacles ?? []) {
    const b = obstacleBox(level, o);
    const x0 = worldToScreenX(cam, cssW, b.x0);
    const x1 = worldToScreenX(cam, cssW, b.x1);
    const top = worldToScreenY(cam, cssH, b.y1);
    const bot = worldToScreenY(cam, cssH, b.y0);
    const w = Math.max(6, x1 - x0);
    const stripe = Math.max(6, 0.16 * ppm);
    const crateTop = o.stack
      ? worldToScreenY(cam, cssH, b.y0 + o.h)
      : top;
    ctx.fillStyle = "#3d3832";
    ctx.fillRect(x0 - 7, crateTop, 8, bot - crateTop + 6);
    ctx.fillRect(x1 - 1, crateTop, 8, bot - crateTop + 6);
    ctx.fillStyle = "#8a8378";
    ctx.fillRect(x0 - 8, crateTop - 8, w + 16, 12);
    ctx.fillStyle = "#f0a23a";
    ctx.fillRect(x0 - 8, crateTop - 10, w + 16, 3);
    ctx.fillStyle = "#2a2622";
    ctx.fillRect(x0 + 2, crateTop + 6, w - 4, bot - crateTop - 8);
    ctx.strokeStyle = "rgba(232,240,244,0.18)";
    ctx.lineWidth = 1;
    for (let y = crateTop + 10; y < bot - 6; y += stripe) {
      ctx.beginPath();
      ctx.moveTo(x0 + 4, y);
      ctx.lineTo(x1 - 4, y);
      ctx.stroke();
    }
    if (o.stack) {
      const mid = (x0 + x1) * 0.5;
      const pipeW = Math.max(8, 0.22 * ppm);
      ctx.fillStyle = "#5a5348";
      ctx.fillRect(mid - pipeW * 0.5, top, pipeW, crateTop - top);
      ctx.fillStyle = "#8a8378";
      ctx.fillRect(mid - pipeW * 0.72, top - 6, pipeW * 1.44, 10);
      ctx.fillStyle = "#c8dde6";
      ctx.globalAlpha = 0.35;
      ctx.fillRect(mid - pipeW * 0.35, top - 22, pipeW * 0.7, 16);
      ctx.globalAlpha = 1;
    }
  }
}

function skyAt(y: number): string {
  const keys: { y: number; r: number; g: number; b: number }[] = [
    { y: 14, r: 112, g: 132, b: 148 },
    { y: 6.5, r: 88, g: 112, b: 132 },
    { y: 2.4, r: 108, g: 132, b: 152 },
    { y: 0.2, r: 186, g: 138, b: 108 },
    { y: -3, r: 98, g: 78, b: 76 },
    { y: -8, r: 68, g: 56, b: 56 },
    { y: -17, r: 48, g: 40, b: 42 },
  ];
  const top = keys[0]!;
  const bot = keys[keys.length - 1]!;
  if (y >= top.y) return `rgb(${top.r},${top.g},${top.b})`;
  if (y <= bot.y) return `rgb(${bot.r},${bot.g},${bot.b})`;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!;
    const b = keys[i + 1]!;
    if (y <= a.y && y >= b.y) {
      const t = (a.y - y) / Math.max(0.01, a.y - b.y);
      return `rgb(${Math.round(a.r + (b.r - a.r) * t)},${Math.round(a.g + (b.g - a.g) * t)},${Math.round(a.b + (b.b - a.b) * t)})`;
    }
  }
  return `rgb(${bot.r},${bot.g},${bot.b})`;
}

function dropDepth(level: Level): number {
  return (level.platforms[0]?.y ?? 0) - finishGround(level);
}

function streetAt(level: Level, x: number, y: number): boolean {
  for (const p of level.platforms) {
    if (Math.abs(p.y - y) > 0.35) continue;
    if (x >= p.x0 - 0.8 && x <= p.x1 + 0.8) return true;
  }
  return false;
}

const BRICK = ["#8a4a3a", "#9b5544", "#7a4034", "#cbb79a", "#a0604c"] as const;
const STOREY = 2.75;

function drawHarbour(ctx: CanvasRenderingContext2D, cam: Cam, cssW: number, cssH: number): void {
  const horizon = worldToScreenY(cam, cssH, 1.85);
  const shore = worldToScreenY(cam, cssH, -0.2);
  const y0 = Math.max(-2, horizon);
  const y1 = Math.min(cssH + 2, Math.max(horizon, shore));
  if (y1 <= y0) return;
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, "#4a6574");
  g.addColorStop(1, "#2a4452");
  ctx.fillStyle = g;
  ctx.fillRect(0, y0, cssW, y1 - y0);
  ctx.strokeStyle = "rgba(220,230,236,0.28)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  ctx.lineTo(cssW, horizon);
  ctx.stroke();
  ctx.strokeStyle = "rgba(200,221,230,0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const y = horizon + 16 + i * 20;
    if (y > y1) break;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(cssW, y);
    ctx.stroke();
  }
}

function drawPortsdown(ctx: CanvasRenderingContext2D, cam: Cam, cssW: number, cssH: number): void {
  const shift = cam.x * 0.06;
  const base = worldToScreenY(cam, cssH, 2.05);
  const peak = worldToScreenY(cam, cssH, 5.4);
  if (peak > cssH + 40 || base < -40) return;
  ctx.fillStyle = "#6a7a62";
  ctx.beginPath();
  ctx.moveTo(-40, base + 40);
  ctx.lineTo(-40, base);
  ctx.lineTo(cssW * 0.08 - shift, peak + 18);
  ctx.lineTo(cssW * 0.22 - shift, peak);
  ctx.lineTo(cssW * 0.4 - shift, peak + 22);
  ctx.lineTo(cssW * 0.62 - shift, peak + 8);
  ctx.lineTo(cssW * 0.86 - shift, peak + 28);
  ctx.lineTo(cssW + 40, base);
  ctx.lineTo(cssW + 40, base + 40);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(214, 206, 186, 0.35)";
  ctx.beginPath();
  ctx.moveTo(cssW * 0.16 - shift, peak + 10);
  ctx.lineTo(cssW * 0.22 - shift, peak);
  ctx.lineTo(cssW * 0.3 - shift, peak + 14);
  ctx.closePath();
  ctx.fill();
}

function drawSpinnaker(ctx: CanvasRenderingContext2D, cam: Cam, cssW: number, cssH: number): void {
  const x = 26.5 - cam.x * 0.12;
  const sx = worldToScreenX(cam, cssW, x);
  const base = worldToScreenY(cam, cssH, 1.85);
  const tip = worldToScreenY(cam, cssH, 7.1);
  if (sx < -40 || sx > cssW + 40) return;
  if (tip > cssH + 20 || base < -20) return;
  const ppm = cssW / cam.w;
  const w = Math.max(10, 0.55 * ppm);
  ctx.fillStyle = "rgba(232,238,244,0.88)";
  ctx.beginPath();
  ctx.moveTo(sx, tip);
  ctx.lineTo(sx + w, base);
  ctx.lineTo(sx + w * 0.22, base);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(200,210,220,0.9)";
  ctx.fillRect(sx - 2, tip, 3, base - tip);
}

function drawHouseFront(
  ctx: CanvasRenderingContext2D,
  sx: number,
  gy: number,
  w: number,
  storeys: number,
  seed: number,
  ppm: number,
): void {
  const brick = BRICK[seed % BRICK.length]!;
  const roofH = Math.max(8, 0.7 * ppm);
  const wallH = Math.max(16, storeys * STOREY * ppm);
  ctx.fillStyle = "#3c444c";
  ctx.beginPath();
  ctx.moveTo(sx - 2, gy - wallH);
  ctx.lineTo(sx + w * 0.5, gy - wallH - roofH);
  ctx.lineTo(sx + w + 2, gy - wallH);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = brick;
  ctx.fillRect(sx, gy - wallH, w, wallH);
  ctx.fillStyle = "#5a322c";
  ctx.fillRect(sx + w * 0.72, gy - wallH - roofH - 6, Math.max(3, 0.12 * ppm), roofH + 8);
  const winW = Math.max(4, 0.22 * ppm);
  const winH = Math.max(5, 0.32 * ppm);
  for (let s = 0; s < storeys; s++) {
    const wy = gy - 10 - s * (wallH / storeys);
    const lit = s === 0 || seed % 4 === s;
    ctx.fillStyle = lit ? "rgba(232, 176, 92, 0.78)" : "rgba(32, 42, 52, 0.7)";
    ctx.fillRect(sx + w * 0.14, wy - winH, winW, winH);
    ctx.fillRect(sx + w * 0.58, wy - winH, winW, winH);
  }
  ctx.fillStyle = "#2a2420";
  ctx.fillRect(sx + w * 0.38, gy - Math.max(8, 0.42 * ppm), Math.max(5, 0.2 * ppm), Math.max(8, 0.42 * ppm));
}

function drawTerraces(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  level: Level,
): void {
  const ppm = cssW / cam.w;
  const drop = dropDepth(level);
  const takeY = level.platforms[0]?.y ?? 0;
  const landY = finishGround(level);
  const shift = cam.x * 0.28;
  const left = cam.x - cam.w * 0.7 - shift;
  const right = cam.x + cam.w * 0.7 - shift;
  const rows: { y: number; storeys: number }[] = [{ y: takeY, storeys: 2 }];
  if (drop > 2.05) rows.push({ y: landY, storeys: 2 });
  for (let r = rows.length - 1; r >= 0; r--) {
    const row = rows[r]!;
    const gy = worldToScreenY(cam, cssH, row.y);
    if (gy < -80 || gy > cssH + 120) continue;
    const houseW = Math.max(22, 1.48 * ppm);
    const start = Math.floor(left / 1.55) * 1.55;
    for (let wx = start; wx < right + 2; wx += 1.55) {
      if (!streetAt(level, wx + shift, row.y)) continue;
      const sx = worldToScreenX(cam, cssW, wx + shift);
      if (sx < -60 || sx > cssW + 60) continue;
      const seed = Math.abs(Math.floor(wx * 4 + row.y * 3)) % 5;
      drawHouseFront(ctx, sx, gy, houseW, row.storeys, seed, ppm);
    }
  }
}

function drawLamp(
  ctx: CanvasRenderingContext2D,
  sx: number,
  gy: number,
  hot: boolean,
): void {
  ctx.strokeStyle = "#2a2420";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(sx, gy);
  ctx.lineTo(sx, gy - 86);
  ctx.stroke();
  ctx.fillStyle = hot ? "#ffd24a" : "rgba(255,196,107,0.85)";
  ctx.beginPath();
  ctx.arc(sx, gy - 90, hot ? 7 : 6, 0, Math.PI * 2);
  ctx.fill();
  const lamp = ctx.createRadialGradient(sx, gy - 90, 2, sx, gy - 90, hot ? 58 : 48);
  lamp.addColorStop(0, hot ? "rgba(240,162,58,0.42)" : "rgba(255,196,107,0.28)");
  lamp.addColorStop(1, "rgba(255,196,107,0)");
  ctx.fillStyle = lamp;
  ctx.beginPath();
  ctx.arc(sx, gy - 90, hot ? 58 : 48, 0, Math.PI * 2);
  ctx.fill();
}

function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  level: Level,
): void {
  const landY = finishGround(level);
  for (const p of level.platforms) {
    for (let x = p.x0 + 1.5; x < p.x1 - 0.8; x += 6.5) {
      const sx = worldToScreenX(cam, cssW, x);
      const gy = worldToScreenY(cam, cssH, p.y);
      if (sx < -40 || sx > cssW + 40) continue;
      const hot = dropDepth(level) > 2.05 && Math.abs(p.y - landY) < 0.2;
      drawLamp(ctx, sx, gy, hot);
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
  const ppm = cssW / cam.w;
  ctx.font = "700 13px 'Source Sans 3', sans-serif";
  ctx.textAlign = "center";
  for (const span of pitSpans(level)) {
    const x0 = worldToScreenX(cam, cssW, span.x0);
    const x1 = worldToScreenX(cam, cssW, span.x1);
    const w = Math.max(0, x1 - x0);
    if (w < 2) continue;
    const mainDrop = drop > 2.05 && span.x0 <= level.gapX0 + 0.05 && span.x1 >= level.gapX1 - 0.05;
    ctx.fillStyle = mainDrop ? "#5a3832" : "#2a2420";
    ctx.fillRect(x0, y0, w, h);
    if (mainDrop) {
      ctx.fillStyle = "#7a4a40";
      ctx.fillRect(x0, y0, Math.max(6, 0.18 * ppm), h);
      ctx.fillRect(x1 - Math.max(6, 0.18 * ppm), y0, Math.max(6, 0.18 * ppm), h);
      ctx.strokeStyle = "rgba(40, 24, 20, 0.35)";
      ctx.lineWidth = 1;
      for (let y = leftY; y > level.pitY; y -= STOREY) {
        const sy = worldToScreenY(cam, cssH, y);
        ctx.beginPath();
        ctx.moveTo(x0, sy);
        ctx.lineTo(x1, sy);
        ctx.stroke();
      }
      const yLand = worldToScreenY(cam, cssH, landY);
      drawLamp(ctx, x0 + 16, yLand, true);
      drawLamp(ctx, x1 - 16, yLand, true);
      const openGy = worldToScreenY(cam, cssH, landY + STOREY);
      if (openGy < yLand - 8) {
        drawLamp(ctx, (x0 + x1) * 0.5, openGy, true);
      }
    }
    ctx.fillStyle = "rgba(232, 220, 200, 0.45)";
    const labelX =
      span.x0 >= level.gapX1 - 0.05
        ? worldToScreenX(cam, cssW, span.x0 + 1.8)
        : (x0 + x1) / 2;
    ctx.fillText(mainDrop && drop > 8 ? "the drop" : "the gap", labelX, y0 + 28);
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

  for (const p of groundSlabs(level)) {
    const x0 = worldToScreenX(cam, cssW, p.x0);
    const x1 = worldToScreenX(cam, cssW, p.x1);
    const gy = worldToScreenY(cam, cssH, p.y);
    const depth = Math.max(180, cssH - gy + 48);
    ctx.fillStyle = "#3a3a3e";
    ctx.fillRect(x0, gy, x1 - x0, depth);
    ctx.fillStyle = "#8a8680";
    ctx.fillRect(x0, gy, x1 - x0, Math.max(8, 0.28 * ppm));
    ctx.fillStyle = "#c8c4bc";
    ctx.fillRect(x0, gy - 4, x1 - x0, 5);
    ctx.strokeStyle = "rgba(24,24,28,0.28)";
    ctx.lineWidth = 1;
    const slab = 1.4 * ppm;
    for (let x = x0; x < x1; x += slab) {
      ctx.beginPath();
      ctx.moveTo(x, gy - 4);
      ctx.lineTo(x, gy + depth);
      ctx.stroke();
    }
  }

  ctx.fillStyle = "#4a2c28";
  for (const p of level.platforms) {
    const gy = worldToScreenY(cam, cssH, p.y);
    const a = worldToScreenX(cam, cssW, p.x0);
    const b = worldToScreenX(cam, cssW, p.x1);
    ctx.fillRect(a - 3, gy - 6, 8, 18);
    ctx.fillRect(b - 5, gy - 6, 8, 18);
  }
}

function drawBoxes(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  level: Level,
): void {
  const ppm = cssW / cam.w;
  for (const b of level.boxes ?? []) {
    const x0 = worldToScreenX(cam, cssW, b.x0);
    const x1 = worldToScreenX(cam, cssW, b.x1);
    const top = worldToScreenY(cam, cssH, b.y);
    const bot = worldToScreenY(cam, cssH, 0);
    const h = Math.max(8, bot - top);
    const w = x1 - x0;
    ctx.fillStyle = "#8b5a2b";
    ctx.fillRect(x0, top, w, h);
    ctx.fillStyle = "#c4894a";
    ctx.fillRect(x0, top, w, 7);
    ctx.strokeStyle = "#5c3a18";
    ctx.lineWidth = 2;
    ctx.strokeRect(x0 + 1, top + 1, w - 2, h - 2);
    ctx.strokeStyle = "rgba(45, 28, 12, 0.45)";
    ctx.lineWidth = 1;
    const plank = Math.max(10, 0.28 * ppm);
    for (let y = top + 10; y < top + h; y += plank) {
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
    }
    ctx.fillStyle = "#3d2814";
    ctx.fillRect(x0 + w * 0.18, top + 4, 3, h - 8);
    ctx.fillRect(x0 + w * 0.78, top + 4, 3, h - 8);
  }
}

function hoopEllipse(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  rxO: number,
  ryO: number,
  rxI: number,
  ryI: number,
  fill: string,
): void {
  ctx.beginPath();
  ctx.ellipse(sx, sy, rxO, ryO, 0, 0, Math.PI * 2);
  ctx.ellipse(sx, sy, rxI, ryI, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill("evenodd");
}

function drawHoop(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  level: Level,
): void {
  const hoop = level.hoop;
  if (!hoop) return;
  const ppm = cssW / cam.w;
  const sx = worldToScreenX(cam, cssW, hoop.x);
  const sy = worldToScreenY(cam, cssH, hoop.y);
  const rxO = Math.max(4, hoop.outer * HOOP_FORESHORTEN * ppm);
  const ryO = hoop.outer * ppm;
  const rxI = Math.max(2, hoop.inner * HOOP_FORESHORTEN * ppm);
  const ryI = hoop.inner * ppm;
  const takeoff = level.platforms[0];
  if (takeoff) {
    const px = worldToScreenX(cam, cssW, takeoff.x1 - 0.32);
    const py = worldToScreenY(cam, cssH, takeoff.y);
    ctx.strokeStyle = "#2a2420";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, sy);
    ctx.lineTo(sx - rxO, sy);
    ctx.stroke();
    ctx.fillStyle = "#3d3832";
    ctx.fillRect(px - 8, py - 6, 16, 10);
  }
  const skew = Math.max(3, 0.08 * ppm);
  hoopEllipse(ctx, sx - skew, sy, rxO * 1.05, ryO, rxI, ryI, "#8a4e14");
  hoopEllipse(ctx, sx, sy, rxO, ryO, rxI, ryI, "#f0a23a");
  ctx.beginPath();
  ctx.ellipse(sx + rxO * 0.12, sy - ryO * 0.18, rxO * 0.4, ryO * 0.38, 0, -0.9, 0.45);
  ctx.strokeStyle = "rgba(255, 248, 230, 0.5)";
  ctx.lineWidth = Math.max(2, 0.035 * ppm);
  ctx.stroke();
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
  if (level.train) {
    ctx.fillStyle = "#1a2228";
    ctx.fillRect(0, 0, x, cssH);
    ctx.fillStyle = "#2c3640";
    ctx.fillRect(0, gy, x, cssH - gy);
    ctx.fillStyle = "#c8d0d6";
    ctx.fillRect(x - 8, gy - 6, 8, 8);
    ctx.fillStyle = "#f0a23a";
    ctx.fillRect(x - 5, 0, 5, gy);
    return;
  }
  ctx.fillStyle = "#8a4a3a";
  ctx.fillRect(0, 0, x, cssH);
  ctx.fillStyle = "#3a3a3e";
  ctx.fillRect(0, gy, x, cssH - gy);
  ctx.fillStyle = "#6a3830";
  ctx.fillRect(x - 10, 0, 10, cssH);
  ctx.fillStyle = "#c8c4bc";
  ctx.fillRect(x - 4, gy - 4, 4, 5);
  ctx.strokeStyle = "rgba(40, 20, 18, 0.35)";
  ctx.lineWidth = 1;
  for (let y = 8; y < gy; y += 14) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(x - 10, y);
    ctx.stroke();
  }
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

export function screenToWorld(
  cam: Cam,
  cssW: number,
  cssH: number,
  sx: number,
  sy: number,
): { x: number; y: number } {
  return {
    x: (sx / cssW) * cam.w + (cam.x - cam.w * 0.5),
    y: cam.y + cam.h * 0.5 - (sy / cssH) * cam.h,
  };
}
