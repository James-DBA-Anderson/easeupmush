import { VIEW_WIDTH, VIEW_WIDTH_DESKTOP } from "./constants";
import { occupyWindow, type FolkSlot } from "./windowFolk";

/** World x of the start wall. Camera is locked here, so this sits on the left of the screen. */
export const START_WALL_X = 0.55;

/** Facade below the pads. Bill is ~1.75m; windows should read as real rooms, not dollhouse. */
const FACADE_STOREY = 3.2;
const FACADE_WIN_W = 1.12;
const FACADE_WIN_H = 1.52;
const FACADE_WIN_PITCH = 2.24;
const FACADE_WIN_DROP = 0.92;
const TRAIN_RAIL_DROP = 3.7;
const TRAIN_WIN_W = 1.12;
const TRAIN_WIN_H = 1.05;
const TRAIN_WIN_DROP = 0.5;
const TRAIN_WIN_PITCH = 1.72;

export interface Platform {
  x0: number;
  x1: number;
  y: number;
  /** Height at `x1`. When set, the pad pitches from `(x0, y)` to `(x1, y1)`. */
  y1?: number;
  /** Smoothstep the pitch so the ends are flat and the middle is steep. */
  ease?: boolean;
}

export interface Obstacle {
  x: number;
  w: number;
  h: number;
  /** Extra chimney / vent on top of the crate. */
  stack?: number;
  /** Bottom of river junk. Defaults to the roof for train crates. */
  y?: number;
  /** Tilt in the river, radians. */
  rot?: number;
  kind?: "tyre" | "trolley" | "bag" | "cone";
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
  /** High bar along Z — grab if 50% extended and a hand can touch it. */
  bar?: HighBar;
  /** Roof-height blocks that slide toward the player. */
  obstacles?: Obstacle[];
  train?: Train;
  hint?: string;
  /** Lawn / rec ground instead of terrace rooftops. */
  theme?: "park" | "woods";
  /** Land a no-run-up backflip. Default: reach the flag on your feet. */
  goal?: "standingFlip";
}

export interface Hoop {
  x: number;
  y: number;
  inner: number;
  outer: number;
  /** 0 layout … 1 crouch. Must be at least this tucked to pass. */
  tuck: number;
}

/** Horizontal bar through Z, same yaw as the hoop so it reads as a rail not a wall. */
export interface HighBar {
  x: number;
  y: number;
  /** Hip-to-bar hang length, metres. */
  reach?: number;
}

/** Face the runner, 10° off edge-on so the hole still reads as a hoop. */
const HOOP_YAW = (80 * Math.PI) / 180;
const HOOP_FORESHORTEN = Math.cos(HOOP_YAW);

export const LEVELS: Level[] = [
  {
    id: 1,
    title: "Level 1",
    spawnX: 4.2,
    platforms: [{ x0: -4, x1: 28, y: 0 }],
    gapX0: 28,
    gapX1: 28,
    pitY: -3.4,
    flagX: 4.2,
    killY: -7,
    endX: 16,
    noFlag: true,
    theme: "park",
    goal: "standingFlip",
    hint: "Standing backflip. No run-up — FLIP from a stand, hold to tuck, release to open, land on your feet.",
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
    platforms: [
      { x0: -4, x1: 15.4, y: 0 },
      { x0: 20.7, x1: 26.14, y: 0, y1: -5.44 },
      { x0: 26.14, x1: 52, y: -8.16 },
    ],
    gapX0: 15.4,
    gapX1: 20.7,
    pitY: -11.4,
    flagX: 29.6,
    killY: -16,
    endX: 40,
    hint: "Flip the gap onto the pitch — stay extended and match the roof, then stick the drop at first storey.",
  },
  {
    id: 7,
    title: "Level 7",
    spawnX: 4.2,
    platforms: [
      { x0: -2, x1: 5.55, y: 10.4 },
      { x0: 5.55, x1: 15.85, y: 10.4, y1: 0, ease: true },
      { x0: 15.85, x1: 19.15, y: 0 },
      { x0: 26.45, x1: 56, y: -0.22 },
    ],
    gapX0: 19.15,
    gapX1: 26.45,
    pitY: -0.68,
    flagX: 29.7,
    killY: -8,
    endX: 40,
    theme: "woods",
    obstacles: [
      { kind: "tyre", x: 19.95, y: -0.98, w: 0.82, h: 0.7, rot: -0.28 },
      { kind: "trolley", x: 21.55, y: -1.02, w: 1.12, h: 1.18, rot: 0.16 },
      { kind: "bag", x: 23.05, y: -0.9, w: 0.52, h: 0.4, rot: 0.42 },
      { kind: "tyre", x: 23.85, y: -1.0, w: 0.74, h: 0.62, rot: -0.46 },
      { kind: "cone", x: 24.85, y: -0.96, w: 0.36, h: 0.7, rot: 0.31 },
    ],
    hint: "Ride the board down the woods, FLIP off the flat, and clear the river junk.",
  },
  {
    id: 8,
    title: "Level 8",
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
  {
    id: 9,
    title: "Level 9",
    spawnX: 4.2,
    platforms: [
      { x0: -4, x1: 15.5, y: 0 },
      { x0: 24.9, x1: 50, y: -1.35 },
    ],
    gapX0: 15.5,
    gapX1: 24.9,
    pitY: -7.4,
    flagX: 28.6,
    killY: -13,
    endX: 38,
    bar: { x: 18.3, y: 3.22 },
    hint: "Stay at least 50% extended so your hands can catch the bar, swing a giant if you can, then FLIP on the way up to fly the gap.",
  },
];

export function cloneLevel(src: Level): Level {
  return {
    ...src,
    platforms: src.platforms.map((p) => ({ ...p })),
    boxes: src.boxes?.map((p) => ({ ...p })),
    hoop: src.hoop ? { ...src.hoop } : undefined,
    bar: src.bar ? { ...src.bar } : undefined,
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
  const y0 = o.y ?? roofY(level);
  return { x0: o.x, x1: o.x + o.w, y0, y1: y0 + o.h + (o.stack ?? 0) };
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

export function isPitched(p: Platform): boolean {
  return p.y1 !== undefined && Math.abs(p.y1 - p.y) > 0.05;
}

function padU(p: Platform, x: number): number {
  const span = Math.max(0.001, p.x1 - p.x0);
  return Math.max(0, Math.min(1, (x - p.x0) / span));
}

export function platformY(p: Platform, x: number): number {
  if (p.y1 === undefined) return p.y;
  const u = padU(p, x);
  const t = p.ease ? u * u * (3 - 2 * u) : u;
  return p.y + (p.y1 - p.y) * t;
}

export function platformSlope(p: Platform, x?: number): number {
  if (p.y1 === undefined) return 0;
  const span = Math.max(0.001, p.x1 - p.x0);
  const raw = (p.y1 - p.y) / span;
  if (!p.ease) return raw;
  const u = padU(p, x ?? p.x0);
  return raw * 6 * u * (1 - u);
}

/** Upward unit normal of the pad. */
export function platformNormal(p: Platform, x?: number): { nx: number; ny: number } {
  const s = platformSlope(p, x);
  const inv = 1 / Math.hypot(1, s);
  return { nx: -s * inv, ny: inv };
}

/** Unit tangent pointing downhill (the way world y falls). */
export function padDownhill(p: Platform, x: number): { dx: number; dy: number } {
  const s = platformSlope(p, x);
  const len = Math.hypot(1, s) || 1;
  const dx = 1 / len;
  const dy = s / len;
  const sign = dy <= 0 ? 1 : -1;
  return { dx: dx * sign, dy: dy * sign };
}

export function pitchedAt(level: Level, x: number): Platform | null {
  for (const p of level.platforms) {
    if (!isPitched(p)) continue;
    if (x >= p.x0 && x < p.x1) return p;
  }
  return null;
}

/** Body angle (feet-down = 0) that plants on this pad. Negative = lean down a right-hand pitch. */
export function plantAngle(p: Platform, x?: number): number {
  return Math.atan(platformSlope(p, x));
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
      const y = platformY(p, x);
      if (under === null || y > under) under = y;
    }
    if (p.x1 <= x && (!left || p.x1 > left.x1)) left = p;
    if (p.x0 >= x && (!right || p.x0 < right.x0)) right = p;
  }
  if (under !== null) return under;
  if (left && right) {
    const span = Math.max(0.01, right.x0 - left.x1);
    const u = Math.max(0, Math.min(1, (x - left.x1) / span));
    const ly = platformY(left, left.x1);
    const ry = platformY(right, right.x0);
    return ly + (ry - ly) * u;
  }
  return left ? platformY(left, left.x1) : right ? platformY(right, right.x0) : 0;
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

function rooftopWells(level: Level): boolean {
  return !level.train && level.theme !== "park" && level.theme !== "woods";
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

export function groundAt(level: Level, x: number): number | null {
  let best: number | null = null;
  for (const p of solids(level)) {
    if (x < p.x0 || x > p.x1) continue;
    const y = platformY(p, x);
    if (best === null || y > best) best = y;
  }
  return best;
}

/** Highest solid the feet can actually stand on — never a cliff above them. */
export function supportAt(level: Level, x: number, feetY: number, climb = 0.16): number | null {
  let best: number | null = null;
  for (const p of solids(level)) {
    if (x < p.x0 || x > p.x1) continue;
    const y = platformY(p, x);
    if (y > feetY + climb) continue;
    if (best === null || y > best) best = y;
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
  if (isPitched(p)) return closestOnPitched(p, x, y);
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

function closestOnPitched(p: Platform, x: number, y: number): NearSolid {
  if (p.ease) {
    const px = Math.max(p.x0, Math.min(p.x1, x));
    const py = platformY(p, px);
    const { nx, ny } = platformNormal(p, px);
    const signed = (x - px) * nx + (y - py) * ny;
    return { px, py, nx, ny, dist: Math.abs(signed) };
  }
  const dx = p.x1 - p.x0;
  const dy = (p.y1 ?? p.y) - p.y;
  const len2 = Math.max(1e-8, dx * dx + dy * dy);
  let t = ((x - p.x0) * dx + (y - p.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = p.x0 + t * dx;
  const py = p.y + t * dy;
  const rx = x - px;
  const ry = y - py;
  const { nx, ny } = platformNormal(p, px);
  if (t > 0.001 && t < 0.999) {
    const signed = rx * nx + ry * ny;
    return { px, py, nx, ny, dist: Math.abs(signed) };
  }
  const dist = Math.hypot(rx, ry);
  const inv = dist > 1e-6 ? 1 / dist : 1;
  return { px, py, nx: rx * inv, ny: ry * inv, dist };
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
    if (isPitched(p)) {
      if (x < p.x0 - r || x > p.x1 + r) continue;
      const cx = Math.max(p.x0, Math.min(p.x1, x));
      const surf = platformY(p, cx);
      const n = platformNormal(p, cx);
      const signed = (x - cx) * n.nx + (y - surf) * n.ny;
      const depth = r - signed;
      if (depth > 0 && (!best || depth > best.depth)) best = { nx: n.nx, ny: n.ny, depth };
      continue;
    }
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

export function camLookX(px: number, cam: Cam, vx = 0, ahead = CAM_AHEAD): number {
  const look = Math.max(-2.2, Math.min(2.2, vx * 0.28));
  return px + cam.w * ahead + look;
}

export function followCam(
  cam: Cam,
  px: number,
  py: number,
  vx: number,
  dt: number,
  level: Level,
): void {
  const ahead = level.goal === "standingFlip" ? 0 : CAM_AHEAD;
  const targetX = camLookX(px, cam, vx, ahead);
  cam.x += (targetX - cam.x) * Math.min(1, dt * 6);
  const minX = cam.w * 0.38;
  const maxX = level.endX - cam.w * 0.4;
  cam.x = Math.max(minX, Math.min(maxX, cam.x));
  const floor = groundAt(level, px);
  const falling = floor === null || py - floor > 1.4;
  let targetY = falling
    ? py + cam.h * 0.22
    : floor + cam.h * 0.22;
  if (level.bar && !falling) targetY += 0.55;
  cam.y += (targetY - cam.y) * Math.min(1, dt * (falling ? 14 : 5.5));
  // Keep a band of view under him so the ground can enter the frame before impact.
  const minBelow = cam.h * 0.34;
  const maxCamY = py + cam.h * 0.5 - minBelow;
  if (cam.y > maxCamY) cam.y = maxCamY;
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
  t = 0,
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
  if (level.theme === "woods") {
    drawWoodsBack(ctx, cam, cssW, cssH, level);
    drawWoodsGround(ctx, cam, cssW, cssH, level);
    drawWoodsRiver(ctx, cam, cssW, cssH, level, t);
    drawRiverJunk(ctx, cam, cssW, cssH, level);
    drawRiverSurface(ctx, cam, cssW, cssH, level, t);
    drawWoodsTrees(ctx, cam, cssW, cssH, level, false);
    drawWoodsSign(ctx, cam, cssW, cssH, level);
    drawStartWall(ctx, cam, cssW, cssH, level);
    if (!level.noFlag) drawFlag(ctx, cam, cssW, cssH, level);
    return;
  }
  if (level.theme === "park") {
    drawDistantHarbour(ctx, cam, cssW, cssH);
    drawParkHorizon(ctx, cam, cssW, cssH);
    drawParkFields(ctx, cam, cssW, cssH, level);
    drawPit(ctx, cam, cssW, cssH, level);
    drawParkGround(ctx, cam, cssW, cssH, level);
    drawParkProps(ctx, cam, cssW, cssH, level);
    drawStartWall(ctx, cam, cssW, cssH, level);
    return;
  }
  drawDistantHarbour(ctx, cam, cssW, cssH);
  drawBackdrop(ctx, cam, cssW, cssH, level);
  drawPit(ctx, cam, cssW, cssH, level);
  drawWellRoofs(ctx, cam, cssW, cssH, level);
  drawGround(ctx, cam, cssW, cssH, level);
  drawBoxes(ctx, cam, cssW, cssH, level);
  drawHoop(ctx, cam, cssW, cssH, level);
  drawBar(ctx, cam, cssW, cssH, level);
  drawStartWall(ctx, cam, cssW, cssH, level);
  if (!level.noFlag) drawFlag(ctx, cam, cssW, cssH, level);
}

/** Near-camera trees drawn after Bill so he rides behind the trunks. */
export function drawWorldForeground(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  level: Level,
): void {
  if (level.theme !== "woods") return;
  drawWoodsTrees(ctx, cam, cssW, cssH, level, true);
}

function drawWoodsBack(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  level: Level,
): void {
  const ridgeY = cssH * 0.3;
  const g = ctx.createLinearGradient(0, 0, 0, cssH);
  g.addColorStop(0, "rgba(16, 28, 20, 0.42)");
  g.addColorStop(0.38, "rgba(28, 42, 26, 0.55)");
  g.addColorStop(1, "rgba(22, 32, 18, 0.78)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cssW, cssH);

  const ppm = cssW / cam.w;
  const shift = cam.x * ppm * 0.07;
  const step = 22;
  const phase = ((shift % step) + step) % step;
  const first = Math.floor(shift / step) - 2;
  const n = Math.ceil(cssW / step) + 8;
  ctx.fillStyle = "rgba(14, 24, 14, 0.72)";
  ctx.beginPath();
  ctx.moveTo(-40, ridgeY + 28);
  for (let i = 0; i < n; i++) {
    const id = first + i;
    const sx = i * step - phase;
    const h = 42 + Math.abs((id * 17 + 3) % 48);
    const bw = 16 + Math.abs((id * 7) % 14);
    ctx.lineTo(sx, ridgeY - h);
    ctx.quadraticCurveTo(sx + bw * 0.5, ridgeY - h - 22, sx + bw, ridgeY - h * 0.35);
  }
  ctx.lineTo(cssW + 40, ridgeY + 28);
  ctx.closePath();
  ctx.fill();

  const crest = worldToScreenY(cam, cssH, level.platforms[0]?.y ?? 10);
  if (crest > ridgeY) {
    const floor = ctx.createLinearGradient(0, ridgeY, 0, Math.max(crest, cssH));
    floor.addColorStop(0, "rgba(32, 46, 26, 0.55)");
    floor.addColorStop(1, "#24301c");
    ctx.fillStyle = floor;
    ctx.fillRect(0, ridgeY, cssW, cssH - ridgeY);
  }
}

function drawWoodsGround(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  level: Level,
): void {
  const ppm = cssW / cam.w;
  const bot = cssH + 48;
  for (const p of level.platforms) {
    const sx0 = worldToScreenX(cam, cssW, p.x0);
    const sx1 = worldToScreenX(cam, cssW, p.x1);
    if (sx1 < -40 || sx0 > cssW + 40) continue;
    const steps = p.ease || isPitched(p) ? 20 : 1;
    const trace = (oy: number) => {
      for (let i = 0; i <= steps; i++) {
        const x = p.x0 + ((p.x1 - p.x0) * i) / steps;
        const sx = worldToScreenX(cam, cssW, x);
        const sy = worldToScreenY(cam, cssH, platformY(p, x)) + oy;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
    };
    ctx.fillStyle = "#2a3820";
    ctx.beginPath();
    trace(0);
    ctx.lineTo(sx1, bot);
    ctx.lineTo(sx0, bot);
    ctx.closePath();
    ctx.fill();
    const yTop = worldToScreenY(cam, cssH, Math.max(p.y, p.y1 ?? p.y));
    const shade = ctx.createLinearGradient(0, yTop, 0, bot);
    shade.addColorStop(0, "rgba(18, 26, 12, 0)");
    shade.addColorStop(1, "rgba(8, 12, 8, 0.5)");
    ctx.fillStyle = shade;
    ctx.beginPath();
    trace(0);
    ctx.lineTo(sx1, bot);
    ctx.lineTo(sx0, bot);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#4a3a28";
    ctx.lineWidth = Math.max(6, 0.16 * ppm);
    ctx.beginPath();
    trace(0);
    ctx.stroke();
    ctx.strokeStyle = "#6a5a40";
    ctx.lineWidth = Math.max(3, 0.08 * ppm);
    ctx.beginPath();
    trace(-2);
    ctx.stroke();
    ctx.strokeStyle = "#3d5230";
    ctx.lineWidth = Math.max(2, 0.05 * ppm);
    ctx.beginPath();
    trace(-4);
    ctx.stroke();
  }
}

function drawWoodsRiver(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  level: Level,
  t: number,
): void {
  const x0 = worldToScreenX(cam, cssW, level.gapX0);
  const x1 = worldToScreenX(cam, cssW, level.gapX1);
  const waterY = worldToScreenY(cam, cssH, level.pitY);
  const leftLip = worldToScreenY(cam, cssH, platformY(level.platforms[2] ?? level.platforms[0]!, level.gapX0));
  const rightLip = worldToScreenY(
    cam,
    cssH,
    platformY(level.platforms[3] ?? level.platforms[0]!, level.gapX1),
  );
  const w = Math.max(4, x1 - x0);
  if (x1 < -20 || x0 > cssW + 20) return;

  ctx.fillStyle = "#3a2c1c";
  ctx.beginPath();
  ctx.moveTo(x0 - 10, leftLip);
  ctx.lineTo(x0 + 18, waterY);
  ctx.lineTo(x0 - 10, waterY + 40);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x1 + 10, rightLip);
  ctx.lineTo(x1 - 18, waterY);
  ctx.lineTo(x1 + 10, waterY + 40);
  ctx.closePath();
  ctx.fill();

  const water = ctx.createLinearGradient(0, waterY - 8, 0, cssH);
  water.addColorStop(0, "#2a4a48");
  water.addColorStop(0.18, "#1c3a3c");
  water.addColorStop(0.55, "#163032");
  water.addColorStop(1, "#0c1c1e");
  ctx.fillStyle = water;
  ctx.fillRect(x0, waterY, w, cssH - waterY + 8);

  ctx.fillStyle = "rgba(70, 110, 96, 0.35)";
  ctx.fillRect(x0, waterY, w, Math.max(4, 0.08 * (cssW / cam.w)));
  ctx.strokeStyle = "rgba(180, 210, 196, 0.22)";
  ctx.lineWidth = 1.4;
  const ppm = cssW / cam.w;
  for (let i = 0; i < 7; i++) {
    const y = waterY + 6 + i * 9;
    const wobble = Math.sin(t * 1.7 + i * 1.3) * 10;
    ctx.globalAlpha = 0.18 + (i % 2) * 0.08;
    ctx.beginPath();
    ctx.moveTo(x0 + 6, y);
    ctx.bezierCurveTo(x0 + w * 0.3 + wobble, y + 3, x0 + w * 0.65 - wobble, y - 2, x1 - 6, y + 1);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = "#2a3a1c";
  for (let i = 0; i < 9; i++) {
    const side = i % 2 === 0 ? leftLip : rightLip;
    const edge = i % 2 === 0 ? x0 : x1;
    const reedX = i % 2 === 0 ? edge + 6 + (i % 3) * 5 : edge - 8 - (i % 3) * 4;
    ctx.fillRect(reedX, side - 10 - (i % 4) * 4, Math.max(2, 0.04 * ppm), 16 + (i % 3) * 6);
  }
}

function drawRiverJunk(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  level: Level,
): void {
  const ppm = cssW / cam.w;
  for (const o of level.obstacles ?? []) {
    if (!o.kind) continue;
    const b = obstacleBox(level, o);
    const x0 = worldToScreenX(cam, cssW, b.x0);
    const x1 = worldToScreenX(cam, cssW, b.x1);
    const top = worldToScreenY(cam, cssH, b.y1);
    const bot = worldToScreenY(cam, cssH, b.y0);
    const cx = (x0 + x1) * 0.5;
    const cy = (top + bot) * 0.5;
    const w = Math.max(6, x1 - x0);
    const h = Math.max(6, bot - top);
    if (x1 < -40 || x0 > cssW + 40) continue;
    const l = -w * 0.5;
    const r = w * 0.5;
    const t = -h * 0.5;
    const d = h * 0.5;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(o.rot ?? 0);
    if (o.kind === "tyre") {
      ctx.fillStyle = "#1a1614";
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.48, h * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3a3632";
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.22, h * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#5a5248";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.36, h * 0.3, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (o.kind === "trolley") {
      ctx.strokeStyle = "#6a6e72";
      ctx.lineWidth = Math.max(1.5, 0.03 * ppm);
      ctx.strokeRect(l + 4, t + 8, w - 8, h * 0.55);
      ctx.beginPath();
      ctx.moveTo(l + 6, t + 8);
      ctx.lineTo(l + 6, t + 8 + h * 0.55);
      ctx.moveTo(r - 6, t + 8);
      ctx.lineTo(r - 6, t + 8 + h * 0.55);
      ctx.moveTo(l + 4, t + 8 + h * 0.28);
      ctx.lineTo(r - 4, t + 8 + h * 0.28);
      ctx.stroke();
      ctx.strokeStyle = "#8a8e92";
      ctx.beginPath();
      ctx.moveTo(l + 8, t + 8);
      ctx.lineTo(l - 4, t - 6);
      ctx.lineTo(l + 10, t - 8);
      ctx.stroke();
      ctx.fillStyle = "#1a1614";
      const wr = Math.max(4, 0.08 * ppm);
      ctx.beginPath();
      ctx.arc(l + 10, d - 4, wr, 0, Math.PI * 2);
      ctx.arc(r - 10, d - 4, wr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(40, 70, 62, 0.35)";
      ctx.fillRect(l + 6, t + 10, w - 12, h * 0.22);
    } else if (o.kind === "bag") {
      ctx.fillStyle = "#2a2e28";
      ctx.beginPath();
      ctx.ellipse(0, h * 0.05, w * 0.48, h * 0.42, -0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3a3e36";
      ctx.beginPath();
      ctx.moveTo(-4, t + 4);
      ctx.lineTo(4, t + 4);
      ctx.lineTo(2, t - 4);
      ctx.lineTo(-2, t - 4);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = "#e07028";
      ctx.beginPath();
      ctx.moveTo(0, t);
      ctx.lineTo(r - 2, d - 4);
      ctx.lineTo(l + 2, d - 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#f0f4f6";
      ctx.fillRect(-4, t + h * 0.28, 8, Math.max(3, 0.06 * ppm));
    }
    ctx.restore();
  }
}

function drawRiverSurface(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  level: Level,
  t: number,
): void {
  const x0 = worldToScreenX(cam, cssW, level.gapX0);
  const x1 = worldToScreenX(cam, cssW, level.gapX1);
  const waterY = worldToScreenY(cam, cssH, level.pitY);
  const w = Math.max(4, x1 - x0);
  if (x1 < -20 || x0 > cssW + 20) return;
  const film = ctx.createLinearGradient(0, waterY, 0, cssH);
  film.addColorStop(0, "rgba(42, 74, 72, 0.38)");
  film.addColorStop(0.22, "rgba(22, 48, 50, 0.5)");
  film.addColorStop(1, "rgba(12, 28, 30, 0.28)");
  ctx.fillStyle = film;
  ctx.fillRect(x0, waterY, w, cssH - waterY + 8);
  ctx.fillStyle = "rgba(70, 110, 96, 0.32)";
  ctx.fillRect(x0, waterY, w, Math.max(3, 0.06 * (cssW / cam.w)));
  ctx.strokeStyle = "rgba(180, 210, 196, 0.2)";
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 5; i++) {
    const y = waterY + 5 + i * 10;
    const wobble = Math.sin(t * 1.7 + i * 1.3) * 10;
    ctx.globalAlpha = 0.16 + (i % 2) * 0.07;
    ctx.beginPath();
    ctx.moveTo(x0 + 6, y);
    ctx.bezierCurveTo(x0 + w * 0.3 + wobble, y + 3, x0 + w * 0.65 - wobble, y - 2, x1 - 6, y + 1);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

const WOODS_TREES: { x: number; s: number; fg: boolean }[] = [
  { x: 0.95, s: 1.2, fg: false },
  { x: 2.55, s: 1.35, fg: false },
  { x: 6.85, s: 1.18, fg: false },
  { x: 9.4, s: 1.12, fg: true },
  { x: 10.4, s: 1.08, fg: false },
  { x: 13.7, s: 1.0, fg: false },
  { x: 16.2, s: 1.14, fg: true },
  { x: 17.15, s: 1.12, fg: false },
  { x: 27.7, s: 1.15, fg: false },
  { x: 31.1, s: 1.18, fg: true },
  { x: 34.2, s: 1.05, fg: false },
];

/** Trail name board in the trees, just right of the crest spawn. */
function drawWoodsSign(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  level: Level,
): void {
  const x = 5.72;
  const gy = routeAt(level, x);
  const ppm = cssW / cam.w;
  const sx = worldToScreenX(cam, cssW, x);
  const sy = worldToScreenY(cam, cssH, gy);
  if (sx < -100 || sx > cssW + 100) return;

  const postH = 1.62 * ppm;
  const postW = Math.max(4, 0.1 * ppm);
  const boardW = 1.78 * ppm;
  const boardH = 0.82 * ppm;
  const boardY = sy - postH + 0.1 * ppm;
  const postInset = boardW * 0.36;

  ctx.fillStyle = "#2e2418";
  ctx.fillRect(sx - postInset - postW * 0.5, sy - postH, postW, postH);
  ctx.fillRect(sx + postInset - postW * 0.5, sy - postH, postW, postH);
  ctx.fillStyle = "rgba(18, 12, 8, 0.28)";
  ctx.fillRect(sx - postInset, sy - postH, postW * 0.28, postH);
  ctx.fillRect(sx + postInset + postW * 0.08, sy - postH, postW * 0.28, postH);

  ctx.fillStyle = "#4a3824";
  ctx.fillRect(sx - boardW * 0.5, boardY, boardW, boardH);
  ctx.fillStyle = "#5c4630";
  ctx.fillRect(sx - boardW * 0.5 + 4, boardY + 4, boardW - 8, boardH - 8);
  ctx.strokeStyle = "#c4a878";
  ctx.lineWidth = Math.max(1.6, 0.028 * ppm);
  ctx.strokeRect(sx - boardW * 0.5 + 8, boardY + 8, boardW - 16, boardH - 16);

  ctx.fillStyle = "#efe4c8";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `400 ${Math.max(13, 0.3 * ppm)}px Anton, Impact, sans-serif`;
  ctx.fillText("Foxes", sx, boardY + boardH * 0.36);
  ctx.font = `400 ${Math.max(12, 0.26 * ppm)}px Anton, Impact, sans-serif`;
  ctx.fillText("Forest", sx, boardY + boardH * 0.68);
}

function drawWoodsTrees(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  level: Level,
  foreground: boolean,
): void {
  const ppm = cssW / cam.w;
  for (const tree of WOODS_TREES) {
    if (tree.fg !== foreground) continue;
    const gy = routeAt(level, tree.x);
    const sx = worldToScreenX(cam, cssW, tree.x);
    const sy = worldToScreenY(cam, cssH, gy);
    if (sx < -90 || sx > cssW + 90) continue;
    const scale = tree.s * (foreground ? 1.12 : 1);
    drawWoodsTree(ctx, sx, sy, ppm, Math.abs(Math.floor(tree.x * 17)), scale, foreground);
  }
}

function drawWoodsTree(
  ctx: CanvasRenderingContext2D,
  sx: number,
  gy: number,
  ppm: number,
  seed: number,
  scale: number,
  near: boolean,
): void {
  const h = (4.8 + (seed % 7) * 0.55) * ppm * scale;
  const trunkW = Math.max(5, 0.18 * ppm * scale);
  ctx.fillStyle = near ? "#1a1410" : "#241c16";
  ctx.fillRect(sx - trunkW * 0.5, gy - h * 0.74, trunkW, h * 0.74);
  ctx.fillStyle = near ? "rgba(18, 12, 8, 0.28)" : "rgba(10, 8, 6, 0.18)";
  ctx.fillRect(sx + trunkW * 0.15, gy - h * 0.74, trunkW * 0.28, h * 0.74);
  const canopy = near ? "#1a3018" : "#243822";
  const dark = near ? "#122414" : "#1c2e1a";
  ctx.fillStyle = canopy;
  ctx.beginPath();
  ctx.ellipse(sx, gy - h * 0.82, h * 0.3, h * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.ellipse(sx - h * 0.16, gy - h * 0.7, h * 0.22, h * 0.18, -0.45, 0, Math.PI * 2);
  ctx.ellipse(sx + h * 0.18, gy - h * 0.72, h * 0.2, h * 0.16, 0.4, 0, Math.PI * 2);
  ctx.fill();
  if (near) {
    ctx.fillStyle = "rgba(28, 48, 24, 0.55)";
    ctx.beginPath();
    ctx.ellipse(sx + h * 0.05, gy - h * 0.9, h * 0.18, h * 0.14, 0.15, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTrainCountry(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  level: Level,
): void {
  const scroll = level.train?.scroll ?? 0;
  const horizon = worldToScreenY(cam, cssH, 3.1);
  const g = ctx.createLinearGradient(0, 0, 0, cssH);
  g.addColorStop(0, "#152030");
  g.addColorStop(0.38, "#3a4a58");
  g.addColorStop(0.62, "#6a7a62");
  g.addColorStop(1, "#3d4a32");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cssW, cssH);
  ctx.fillStyle = "#4a5a38";
  ctx.fillRect(0, horizon, cssW, cssH);
  ctx.strokeStyle = "rgba(200,221,230,0.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  ctx.lineTo(cssW, horizon);
  ctx.stroke();

  const left = cam.x - cam.w * 0.5;
  const right = cam.x + cam.w * 0.5;
  const start = Math.floor((left + scroll * 0.55) / 5.2) * 5.2;
  for (let wx = start; wx < right + scroll * 0.55 + 6; wx += 5.2) {
    const groundX = wx - scroll * 0.55;
    const sx = worldToScreenX(cam, cssW, groundX);
    if (sx < -40 || sx > cssW + 40) continue;
    const gy = horizon;
    ctx.fillStyle = "#1c2818";
    ctx.fillRect(sx - 5, gy - 52, 10, 52);
    ctx.fillStyle = "#3d5a32";
    ctx.beginPath();
    ctx.ellipse(sx, gy - 58, 22, 16, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const postStart = Math.floor((left + scroll) / 7.4) * 7.4;
  for (let wx = postStart; wx < right + scroll + 8; wx += 7.4) {
    const sx = worldToScreenX(cam, cssW, wx - scroll);
    if (sx < -20 || sx > cssW + 20) continue;
    ctx.fillStyle = "#2a2420";
    ctx.fillRect(sx - 2, horizon - 78, 4, 78);
    ctx.strokeStyle = "rgba(20,16,12,0.45)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx, horizon - 72);
    ctx.lineTo(sx + 48, horizon - 68);
    ctx.stroke();
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
  const rail = worldToScreenY(cam, cssH, roof - TRAIN_RAIL_DROP);
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
    const wheelY = rail - 4;
    const wr = Math.max(10, 0.46 * ppm);
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

  const frame = Math.max(2, 0.04 * ppm);
  visitTrainWindows(level, (slot) => {
    const win = worldToScreenX(cam, cssW, slot.wx);
    const ww = slot.ww * ppm;
    const wh = slot.wh * ppm;
    if (win < x0 || win > x1 - ww) return;
    const winTop = worldToScreenY(cam, cssH, slot.wy);
    ctx.fillStyle = "#b8e4f4";
    ctx.fillRect(win, winTop, ww, wh);
    occupyWindow(ctx, { sx: win, sy: winTop, sw: ww, sh: wh, ppm, slot });
    ctx.strokeStyle = "#2a343c";
    ctx.lineWidth = frame;
    ctx.strokeRect(win, winTop, ww, wh);
    ctx.beginPath();
    ctx.moveTo(win, winTop + wh * 0.5);
    ctx.lineTo(win + ww, winTop + wh * 0.5);
    ctx.stroke();
  });
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
    if (o.kind) continue;
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

function dropDepth(level: Level): number {
  return (level.platforms[0]?.y ?? 0) - finishGround(level);
}

/** Screen-space Buckland / harbour — a thin dusk ridge, never at Bill's scale. */
function drawDistantHarbour(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
): void {
  const hillY = cssH * 0.33;
  const shoreY = cssH * 0.4;
  const ppm = cssW / cam.w;
  const shift = cam.x * ppm * 0.055;

  const water = ctx.createLinearGradient(0, shoreY - 6, 0, shoreY + 26);
  water.addColorStop(0, "rgba(22, 52, 69, 0)");
  water.addColorStop(0.28, "rgba(22, 52, 69, 0.38)");
  water.addColorStop(1, "rgba(22, 52, 69, 0)");
  ctx.fillStyle = water;
  ctx.fillRect(0, shoreY - 6, cssW, 32);

  const hillShift = cam.x * ppm * 0.018;
  ctx.fillStyle = "rgba(40, 52, 54, 0.38)";
  ctx.beginPath();
  ctx.moveTo(-40 - hillShift, shoreY + 6);
  ctx.lineTo(cssW * 0.1 - hillShift, hillY + 22);
  ctx.lineTo(cssW * 0.24 - hillShift, hillY);
  ctx.lineTo(cssW * 0.42 - hillShift, hillY + 18);
  ctx.lineTo(cssW * 0.63 - hillShift, hillY + 4);
  ctx.lineTo(cssW * 0.86 - hillShift, hillY + 24);
  ctx.lineTo(cssW + 40 - hillShift, shoreY + 8);
  ctx.lineTo(cssW + 40 - hillShift, shoreY + 18);
  ctx.lineTo(-40 - hillShift, shoreY + 18);
  ctx.closePath();
  ctx.fill();

  const step = 20;
  const phase = ((shift % step) + step) % step;
  const first = Math.floor(shift / step) - 2;
  const n = Math.ceil(cssW / step) + 6;
  ctx.fillStyle = "rgba(16, 22, 28, 0.36)";
  ctx.beginPath();
  ctx.moveTo(-30, shoreY + 2);
  for (let i = 0; i < n; i++) {
    const id = first + i;
    const sx = i * step - phase;
    const h = 4 + Math.abs((id * 17 + 11) % 9);
    const bw = 9 + Math.abs((id * 5) % 6);
    ctx.lineTo(sx, shoreY - h);
    ctx.lineTo(sx + bw, shoreY - h);
  }
  ctx.lineTo(cssW + 30, shoreY + 2);
  ctx.closePath();
  ctx.fill();

  const spinX = cssW * 0.72 - (cam.x - 8) * ppm * 0.012;
  ctx.fillStyle = "rgba(232, 238, 244, 0.42)";
  ctx.beginPath();
  ctx.moveTo(spinX, hillY - 18);
  ctx.lineTo(spinX + 4, shoreY);
  ctx.lineTo(spinX + 1.2, shoreY);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(240, 162, 58, 0.5)";
  for (let i = 0; i < n; i++) {
    const id = first + i;
    if (Math.abs(id * 7) % 3 !== 0) continue;
    const sx = Math.round(i * step - phase + 5);
    const sy = Math.round(shoreY - 3 - Math.abs(id % 5));
    ctx.fillRect(sx, sy, 2, 2);
  }
}

/** Cover the dusk 'lake' with rec fields so the park sits on grass, not water. */
function drawParkFields(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  level: Level,
): void {
  const gy = worldToScreenY(cam, cssH, level.platforms[0]?.y ?? 0);
  const ridgeY = cssH * 0.4;
  const h = Math.max(0, gy - ridgeY);
  if (h < 2) return;
  const g = ctx.createLinearGradient(0, ridgeY, 0, gy);
  g.addColorStop(0, "rgba(46, 58, 38, 0.72)");
  g.addColorStop(0.4, "rgba(42, 56, 34, 0.9)");
  g.addColorStop(1, "#2c3a22");
  ctx.fillStyle = g;
  ctx.fillRect(0, ridgeY, cssW, h);
}

/** Distant tree line — silhouettes on a world-locked grid, never wrapping. */
function drawParkHorizon(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
): void {
  const ppm = cssW / cam.w;
  const ridgeY = cssH * 0.4;
  const shift = cam.x * ppm * 0.08;
  const step = 28;
  const phase = ((shift % step) + step) % step;
  const first = Math.floor(shift / step) - 2;
  const n = Math.ceil(cssW / step) + 6;
  ctx.fillStyle = "rgba(22, 34, 20, 0.55)";
  ctx.beginPath();
  ctx.moveTo(-40, ridgeY + 18);
  for (let i = 0; i < n; i++) {
    const id = first + i;
    const sx = i * step - phase;
    const h = 10 + Math.abs((id * 13 + 7) % 16);
    const bw = 16 + Math.abs((id * 5) % 10);
    ctx.lineTo(sx, ridgeY - h);
    ctx.quadraticCurveTo(sx + bw * 0.5, ridgeY - h - 8, sx + bw, ridgeY - h * 0.4);
  }
  ctx.lineTo(cssW + 40, ridgeY + 18);
  ctx.closePath();
  ctx.fill();
}

function drawParkGround(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  level: Level,
): void {
  const ppm = cssW / cam.w;
  for (const p of level.platforms) {
    const x0 = worldToScreenX(cam, cssW, p.x0);
    const x1 = worldToScreenX(cam, cssW, p.x1);
    const gy = worldToScreenY(cam, cssH, p.y);
    const w = x1 - x0;
    if (w < 2 || x1 < -30 || x0 > cssW + 30) continue;
    const depth = Math.max(cssH - gy + 28, 2.2 * ppm);
    ctx.fillStyle = "#2c3a22";
    ctx.fillRect(x0, gy, w, depth);
    const pitch = 0.48;
    const first = Math.ceil(p.x0 / pitch) * pitch;
    for (let wx = first; wx < p.x1; wx += pitch) {
      const sx = worldToScreenX(cam, cssW, wx);
      const stripe = Math.max(2, pitch * ppm);
      ctx.fillStyle = Math.abs(Math.floor(wx / pitch)) % 2 === 0 ? "#354628" : "#314224";
      ctx.fillRect(sx, gy, stripe, depth);
    }
    const shade = ctx.createLinearGradient(0, gy, 0, gy + depth);
    shade.addColorStop(0, "rgba(18, 28, 14, 0)");
    shade.addColorStop(1, "rgba(10, 16, 10, 0.42)");
    ctx.fillStyle = shade;
    ctx.fillRect(x0, gy, w, depth);
    ctx.fillStyle = "#4a5e34";
    ctx.fillRect(x0, gy, w, Math.max(5, 0.14 * ppm));
    ctx.fillStyle = "#6a5a44";
    ctx.fillRect(x0, gy + 3, w, Math.max(4, 0.1 * ppm));
    ctx.fillStyle = "#3d5230";
    ctx.fillRect(x0, gy - 2, w, 3);
  }
}

function drawParkTree(
  ctx: CanvasRenderingContext2D,
  sx: number,
  gy: number,
  ppm: number,
  seed: number,
): void {
  const h = (1.8 + (seed % 5) * 0.22) * ppm;
  const trunkW = Math.max(4, 0.14 * ppm);
  ctx.fillStyle = "#2a2018";
  ctx.fillRect(sx - trunkW * 0.5, gy - h * 0.55, trunkW, h * 0.55);
  ctx.fillStyle = seed % 2 === 0 ? "#243820" : "#2a4224";
  ctx.beginPath();
  ctx.ellipse(sx, gy - h * 0.62, h * 0.38, h * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1c2e18";
  ctx.beginPath();
  ctx.ellipse(sx - h * 0.16, gy - h * 0.5, h * 0.24, h * 0.2, -0.4, 0, Math.PI * 2);
  ctx.ellipse(sx + h * 0.18, gy - h * 0.52, h * 0.22, h * 0.18, 0.35, 0, Math.PI * 2);
  ctx.fill();
}

function drawParkProps(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  level: Level,
): void {
  const ppm = cssW / cam.w;
  const gy = worldToScreenY(cam, cssH, level.platforms[0]?.y ?? 0);
  const trees = [0.95, 2.15, 9.6, 13.2, 17.8];
  for (const wx of trees) {
    const sx = worldToScreenX(cam, cssW, wx);
    if (sx < -50 || sx > cssW + 50) continue;
    drawParkTree(ctx, sx, gy, ppm, Math.abs(Math.floor(wx * 11)));
  }

  const benchX = worldToScreenX(cam, cssW, 7.35);
  if (benchX > -40 && benchX < cssW + 40) {
    const bw = Math.max(18, 0.9 * ppm);
    const bh = Math.max(6, 0.18 * ppm);
    ctx.fillStyle = "#3a2c1c";
    ctx.fillRect(benchX - bw * 0.48, gy - bh * 1.8, 3, bh * 1.8);
    ctx.fillRect(benchX + bw * 0.42, gy - bh * 1.8, 3, bh * 1.8);
    ctx.fillStyle = "#6a5640";
    ctx.fillRect(benchX - bw * 0.5, gy - bh * 1.15, bw, bh);
    ctx.fillRect(benchX - bw * 0.5, gy - bh * 2.15, bw, Math.max(3, 0.08 * ppm));
  }

  const matX = level.spawnX;
  const mx0 = worldToScreenX(cam, cssW, matX - 0.95);
  const mx1 = worldToScreenX(cam, cssW, matX + 0.95);
  const mw = mx1 - mx0;
  const mh = Math.max(7, 0.16 * ppm);
  ctx.fillStyle = "#1e2a4a";
  ctx.fillRect(mx0 - 2, gy, mw + 4, 4);
  ctx.fillStyle = "#2a3a68";
  ctx.fillRect(mx0, gy - 3, mw, mh);
  ctx.strokeStyle = "#c8dde6";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(mx0 + 3, gy - 1, mw - 6, mh - 4);
}

function drawLamp(
  ctx: CanvasRenderingContext2D,
  sx: number,
  gy: number,
  hot: boolean,
): void {
  ctx.fillStyle = "#2a2420";
  ctx.fillRect(sx - 2.5, gy - 16, 5, 16);
  ctx.fillStyle = hot ? "#ffd24a" : "rgba(255,196,107,0.85)";
  ctx.beginPath();
  ctx.arc(sx, gy - 18, hot ? 5 : 4, 0, Math.PI * 2);
  ctx.fill();
  const lamp = ctx.createRadialGradient(sx, gy - 18, 1, sx, gy - 18, hot ? 36 : 28);
  lamp.addColorStop(0, hot ? "rgba(240,162,58,0.4)" : "rgba(255,196,107,0.24)");
  lamp.addColorStop(1, "rgba(255,196,107,0)");
  ctx.fillStyle = lamp;
  ctx.beginPath();
  ctx.arc(sx, gy - 18, hot ? 36 : 28, 0, Math.PI * 2);
  ctx.fill();
}

function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  level: Level,
): void {
  for (const p of level.platforms) {
    if (isPitched(p)) continue;
    for (let x = p.x0 + 1.5; x < p.x1 - 0.8; x += 6.5) {
      const sx = worldToScreenX(cam, cssW, x);
      const gy = worldToScreenY(cam, cssH, platformY(p, x));
      if (sx < -40 || sx > cssW + 40) continue;
      drawLamp(ctx, sx, gy, dropDepth(level) > 2.05 && Math.abs(p.y - finishGround(level)) < 0.2);
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
  for (const span of pitSpans(level)) {
    const x0 = worldToScreenX(cam, cssW, span.x0);
    const x1 = worldToScreenX(cam, cssW, span.x1);
    const w = Math.max(0, x1 - x0);
    const y0 = worldToScreenY(cam, cssH, leftY);
    const yFloor = worldToScreenY(cam, cssH, span.y);
    const h = Math.max(0, yFloor - y0);
    if (w < 2 || h < 2) continue;
    const g = ctx.createLinearGradient(0, y0, 0, yFloor);
    g.addColorStop(0, "rgba(8, 14, 22, 0.08)");
    g.addColorStop(0.22, "rgba(8, 14, 22, 0.22)");
    g.addColorStop(1, "rgba(6, 10, 16, 0.42)");
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, w, h);
  }
}

function drawWellRoofs(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  level: Level,
): void {
  if (!rooftopWells(level)) return;
  for (const span of pitSpans(level)) {
    drawRooftop(ctx, cam, cssW, cssH, span, level.id + 11);
  }
}

export function visitWindows(level: Level, fn: (w: FolkSlot) => void): void {
  if (level.theme === "park" || level.theme === "woods") return;
  if (level.train) {
    visitTrainWindows(level, fn);
    return;
  }
  for (const p of level.platforms) visitPadWindows(level.id, p, fn);
}

function visitPadWindows(levelId: number, p: Platform, fn: (w: FolkSlot) => void): void {
  const pitched = isPitched(p);
  const roofTop = Math.max(p.y, p.y1 ?? p.y);
  const first = Math.ceil((p.x0 + 0.7) / FACADE_WIN_PITCH) * FACADE_WIN_PITCH;
  for (let storey = 0; storey < 10; storey++) {
    const wy = roofTop - FACADE_WIN_DROP - storey * FACADE_STOREY;
    for (let wx = first; wx + FACADE_WIN_W * 0.5 < p.x1; wx += FACADE_WIN_PITCH) {
      if (pitched) {
        const surf = platformY(p, wx);
        if (wy > surf - 1.05) continue;
      }
      const mid = wx + FACADE_WIN_W * 0.5;
      fn({
        id: `${levelId}:f:${wx.toFixed(2)}:${storey}`,
        wx,
        wy,
        ww: FACADE_WIN_W,
        wh: FACADE_WIN_H,
        storey,
        roofY: pitched ? platformY(p, mid) : p.y,
        kind: "facade",
        block: `${levelId}:${p.x0.toFixed(2)}:${p.y.toFixed(2)}`,
      });
    }
  }
}

function visitTrainWindows(level: Level, fn: (w: FolkSlot) => void): void {
  const p = level.platforms[0];
  if (!p) return;
  const roof = p.y;
  const carW = 8.6;
  for (let carX = p.x0; carX < p.x1 - 0.4; carX += carW) {
    for (let i = 0; i < 4; i++) {
      const wx = carX + 1.15 + i * TRAIN_WIN_PITCH;
      if (wx < p.x0 || wx > p.x1 - TRAIN_WIN_W) continue;
      fn({
        id: `${level.id}:t:${wx.toFixed(2)}`,
        wx,
        wy: roof - TRAIN_WIN_DROP,
        ww: TRAIN_WIN_W,
        wh: TRAIN_WIN_H,
        storey: 0,
        roofY: roof,
        kind: "train",
      });
    }
  }
}

function drawGround(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  level: Level,
): void {
  for (const p of level.platforms) {
    drawRooftop(ctx, cam, cssW, cssH, p, level.id);
  }
}

function drawFacadeWindows(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  p: Platform,
  levelId: number,
): void {
  const ppm = cssW / cam.w;
  const x0 = worldToScreenX(cam, cssW, p.x0);
  const x1 = worldToScreenX(cam, cssW, p.x1);
  const winW = FACADE_WIN_W * ppm;
  const winH = FACADE_WIN_H * ppm;
  const pitched = isPitched(p);
  const roofTop = Math.max(p.y, p.y1 ?? p.y);
  const frame = Math.max(1.5, 0.03 * ppm);
  for (let storey = 0; storey < 10; storey++) {
    const wy = roofTop - FACADE_WIN_DROP - storey * FACADE_STOREY;
    const y = worldToScreenY(cam, cssH, wy);
    if (y > cssH + 8) break;
    if (!pitched) {
      ctx.strokeStyle = "rgba(40, 18, 16, 0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, y - 8);
      ctx.lineTo(x1, y - 8);
      ctx.stroke();
    }
  }
  visitPadWindows(levelId, p, (slot) => {
    const y = worldToScreenY(cam, cssH, slot.wy);
    if (y > cssH + 8) return;
    const sx = worldToScreenX(cam, cssW, slot.wx);
    if (sx + winW < x0 || sx > x1) return;
    const lit = Math.abs(Math.floor(slot.wx * 11 + slot.storey * 5)) % 5 === 0;
    ctx.fillStyle = lit ? "rgba(240, 162, 58, 0.58)" : "#1c2830";
    ctx.fillRect(sx, y, winW, winH);
    occupyWindow(ctx, { sx, sy: y, sw: winW, sh: winH, ppm, slot });
    ctx.strokeStyle = "rgba(210, 204, 196, 0.45)";
    ctx.lineWidth = frame;
    ctx.strokeRect(sx, y, winW, winH);
    ctx.beginPath();
    ctx.moveTo(sx, y + winH * 0.5);
    ctx.lineTo(sx + winW, y + winH * 0.5);
    ctx.moveTo(sx + winW * 0.5, y);
    ctx.lineTo(sx + winW * 0.5, y + winH);
    ctx.stroke();
  });
}

function drawRooftop(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  p: Platform,
  levelId: number,
): void {
  if (isPitched(p)) {
    drawPitchedRooftop(ctx, cam, cssW, cssH, p, levelId);
    return;
  }
  const ppm = cssW / cam.w;
  const x0 = worldToScreenX(cam, cssW, p.x0);
  const x1 = worldToScreenX(cam, cssW, p.x1);
  const gy = worldToScreenY(cam, cssH, p.y);
  const w = x1 - x0;
  if (w < 2 || x1 < -30 || x0 > cssW + 30) return;
  const depth = Math.max(cssH - gy + 36, 2.8 * ppm);
  const brick = Math.abs(Math.floor(p.x0 * 3)) % 2 === 0 ? "#7a4538" : "#6e3f34";

  ctx.fillStyle = brick;
  ctx.fillRect(x0, gy, w, depth);
  const down = ctx.createLinearGradient(0, gy, 0, gy + depth);
  down.addColorStop(0, "rgba(30, 10, 8, 0)");
  down.addColorStop(1, "rgba(12, 6, 8, 0.38)");
  ctx.fillStyle = down;
  ctx.fillRect(x0, gy, w, depth);

  drawFacadeWindows(ctx, cam, cssW, cssH, p, levelId);

  ctx.fillStyle = "#3c3c42";
  ctx.fillRect(x0, gy, w, Math.max(7, 0.2 * ppm));
  ctx.fillStyle = "#8a8680";
  ctx.fillRect(x0, gy, w, 3);
  ctx.fillStyle = "#d4cdc2";
  ctx.fillRect(x0, gy - 5, w, 6);

  const party = Math.max(6, 0.14 * ppm);
  ctx.fillStyle = "#5a322c";
  ctx.fillRect(x0 - 2, gy - 10, party, Math.max(18, 0.55 * ppm));
  ctx.fillRect(x1 - party + 2, gy - 10, party, Math.max(18, 0.55 * ppm));
  ctx.fillStyle = "#d4cdc2";
  ctx.fillRect(x0 - 3, gy - 13, party + 2, 5);
  ctx.fillRect(x1 - party + 1, gy - 13, party + 2, 5);

  if (p.x1 - p.x0 < 3.2) return;
  const chimStep = 4.8;
  const chim0 = Math.ceil((p.x0 + 1.4) / chimStep) * chimStep;
  for (let wx = chim0; wx < p.x1 - 1; wx += chimStep) {
    const sx = worldToScreenX(cam, cssW, wx);
    const cw = Math.max(8, 0.26 * ppm);
    const ch = Math.max(14, 0.55 * ppm);
    ctx.fillStyle = "#6a3830";
    ctx.fillRect(sx, gy - ch, cw, ch);
    ctx.fillStyle = "#d4cdc2";
    ctx.fillRect(sx - 2, gy - ch - 4, cw + 4, 6);
    ctx.fillStyle = "#4a2c28";
    ctx.fillRect(sx + 2, gy - ch - 11, 3, 8);
    ctx.fillRect(sx + cw - 5, gy - ch - 10, 3, 7);
  }
}

function drawPitchedRooftop(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  p: Platform,
  levelId: number,
): void {
  const ppm = cssW / cam.w;
  const x0 = worldToScreenX(cam, cssW, p.x0);
  const x1 = worldToScreenX(cam, cssW, p.x1);
  const y0 = worldToScreenY(cam, cssH, p.y);
  const y1 = worldToScreenY(cam, cssH, p.y1 ?? p.y);
  const bot = cssH + 40;
  if (x1 < -30 || x0 > cssW + 30) return;
  const brick = Math.abs(Math.floor(p.x0 * 3)) % 2 === 0 ? "#7a4538" : "#6e3f34";
  ctx.fillStyle = brick;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x1, bot);
  ctx.lineTo(x0, bot);
  ctx.closePath();
  ctx.fill();
  const shade = ctx.createLinearGradient(0, Math.min(y0, y1), 0, bot);
  shade.addColorStop(0, "rgba(30, 10, 8, 0)");
  shade.addColorStop(1, "rgba(12, 6, 8, 0.4)");
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x1, bot);
  ctx.lineTo(x0, bot);
  ctx.closePath();
  ctx.fill();

  drawFacadeWindows(ctx, cam, cssW, cssH, p, levelId);

  ctx.strokeStyle = "#3c3c42";
  ctx.lineWidth = Math.max(7, 0.2 * ppm);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.strokeStyle = "#8a8680";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = "#d4cdc2";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x0, y0 - 4);
  ctx.lineTo(x1, y1 - 4);
  ctx.stroke();

  const party = Math.max(6, 0.14 * ppm);
  ctx.fillStyle = "#5a322c";
  ctx.fillRect(x0 - 2, y0 - 10, party, Math.max(18, 0.55 * ppm));
  ctx.fillRect(x1 - party + 2, y1 - 10, party, Math.max(18, 0.55 * ppm));
  ctx.fillStyle = "#d4cdc2";
  ctx.fillRect(x0 - 3, y0 - 13, party + 2, 5);
  ctx.fillRect(x1 - party + 1, y1 - 13, party + 2, 5);
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

const BAR_LEN_Z = 2.9;
export const BAR_RADIUS = 0.11;
/** Minimum layout (0 tucked … 1 straight) to catch the bar. */
export const BAR_GRAB_EXTEND = 0.5;

export function barReach(bar: HighBar): number {
  return bar.reach ?? 0.76;
}

/** Circle vs the high bar. Normal points out from the rail. */
export function pushOutOfBar(
  bar: HighBar,
  x: number,
  y: number,
  r: number,
): { nx: number; ny: number; depth: number } | null {
  const dx = x - bar.x;
  const dy = y - bar.y;
  const dist = Math.hypot(dx, dy);
  const need = BAR_RADIUS + r;
  if (dist >= need) return null;
  if (dist < 1e-4) return { nx: 0, ny: 1, depth: need };
  return { nx: dx / dist, ny: dy / dist, depth: need - dist };
}

function drawBar(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  level: Level,
): void {
  const bar = level.bar;
  if (!bar) return;
  const ppm = cssW / cam.w;
  const sx = worldToScreenX(cam, cssW, bar.x);
  const sy = worldToScreenY(cam, cssH, bar.y);
  const half = Math.max(7, 0.5 * BAR_LEN_Z * HOOP_FORESHORTEN * ppm);
  const rad = Math.max(4.5, BAR_RADIUS * ppm);
  const nearX = sx - half;
  const farX = sx + half * 0.78;
  const farY = sy + rad * 0.38;
  const farR = rad * 0.7;
  const pit = worldToScreenY(cam, cssH, level.pitY);
  ctx.strokeStyle = "#3a342e";
  ctx.lineWidth = Math.max(3, 0.055 * ppm);
  ctx.beginPath();
  ctx.moveTo(farX, farY);
  ctx.lineTo(farX + 5, pit);
  ctx.stroke();
  ctx.strokeStyle = "#2a2420";
  ctx.lineWidth = Math.max(5, 0.1 * ppm);
  ctx.beginPath();
  ctx.moveTo(nearX, sy);
  ctx.lineTo(nearX - 3, pit);
  ctx.stroke();
  ctx.fillStyle = "rgba(42, 36, 32, 0.55)";
  ctx.beginPath();
  ctx.ellipse(sx - 4, sy + 3, half + rad * 0.4, rad * 1.2, 0, 0, Math.PI * 2);
  ctx.fill();
  const steel = ctx.createLinearGradient(sx, sy - rad * 2.2, sx, sy + rad * 2.2);
  steel.addColorStop(0, "#f2f6f8");
  steel.addColorStop(0.42, "#b7c0c6");
  steel.addColorStop(1, "#5e666c");
  ctx.fillStyle = steel;
  ctx.beginPath();
  ctx.ellipse(sx, sy, half, rad, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#dfe6ea";
  ctx.beginPath();
  ctx.arc(nearX, sy, rad * 1.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6e767c";
  ctx.beginPath();
  ctx.arc(farX, farY, farR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 248, 236, 0.62)";
  ctx.lineWidth = Math.max(1.6, 0.03 * ppm);
  ctx.beginPath();
  ctx.ellipse(sx, sy - rad * 0.32, half * 0.7, rad * 0.32, 0, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(246, 248, 250, 0.8)";
  ctx.beginPath();
  ctx.ellipse(sx, sy, Math.max(3, 0.07 * ppm), rad * 0.82, 0, 0, Math.PI * 2);
  ctx.fill();
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
  if (level.theme === "park" || level.theme === "woods") {
    ctx.fillStyle = "#24301c";
    ctx.fillRect(0, gy, x, cssH - gy);
    ctx.fillStyle = "#2f4a28";
    ctx.fillRect(0, gy - 58, x, 58);
    ctx.fillStyle = "#3d5a32";
    ctx.beginPath();
    ctx.moveTo(0, gy - 52);
    ctx.quadraticCurveTo(x * 0.35, gy - 78, x * 0.55, gy - 54);
    ctx.quadraticCurveTo(x * 0.78, gy - 82, x, gy - 50);
    ctx.lineTo(x, gy);
    ctx.lineTo(0, gy);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#3a2c1c";
    ctx.fillRect(x - 7, gy - 62, 7, cssH - gy + 62);
    return;
  }
  ctx.fillStyle = "#7a4538";
  ctx.fillRect(0, gy, x, cssH - gy);
  ctx.fillStyle = "#3c3c42";
  ctx.fillRect(0, gy, x, Math.max(7, (cssW / cam.w) * 0.2));
  ctx.fillStyle = "#d4cdc2";
  ctx.fillRect(0, gy - 5, x, 6);
  ctx.fillStyle = "#5a322c";
  ctx.fillRect(x - 10, gy - 12, 10, cssH - gy + 12);
  ctx.fillStyle = "#d4cdc2";
  ctx.fillRect(x - 11, gy - 14, 12, 5);
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
  ctx.font = "700 12px 'Source Sans 3', 'Segoe UI', sans-serif";
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

/** Soft dusk contact blob on the pad under a character. Shrinks and fades with height. */
export function drawCharShadow(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  x: number,
  surfaceY: number,
  opts: { air?: number; width?: number; stretch?: number; slope?: number } = {},
): void {
  const air = Math.max(0, opts.air ?? 0);
  if (air > 13) return;
  const s = worldToScreen(cam, cssW, cssH, x, surfaceY);
  if (s.x < -140 || s.x > cssW + 140) return;

  const close = 1 / (1 + air * 0.4);
  const fade = Math.max(0, 1 - air / 8.5);
  if (fade < 0.03) return;
  const width = opts.width ?? 1;
  const stretch = Math.max(0.72, opts.stretch ?? 1);
  const rx = s.ppm * (0.22 + 0.38 * close) * width * stretch;
  const ry = s.ppm * (0.05 + 0.09 * close) * width * (0.72 + 0.28 / Math.sqrt(stretch));
  const a = 0.58 * fade * close * close;
  const ox = -s.ppm * (0.045 + Math.min(0.28, air * 0.035));
  const oy = s.ppm * 0.02;

  ctx.save();
  ctx.translate(s.x + ox, s.y + oy);
  const slope = opts.slope ?? 0;
  if (Math.abs(slope) > 0.02) ctx.rotate(-Math.atan(slope));
  ctx.scale(rx, ry);

  const wash = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  wash.addColorStop(0, `rgba(10, 8, 16, ${a * 0.42})`);
  wash.addColorStop(0.42, `rgba(10, 8, 16, ${a * 0.22})`);
  wash.addColorStop(1, "rgba(10, 8, 16, 0)");
  ctx.fillStyle = wash;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();

  if (close > 0.32) {
    const coreA = a * 0.95 * close;
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.52);
    core.addColorStop(0, `rgba(6, 5, 10, ${coreA})`);
    core.addColorStop(0.5, `rgba(6, 5, 10, ${coreA * 0.38})`);
    core.addColorStop(1, "rgba(6, 5, 10, 0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, 0.52, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Small pad scuff at the last takeoff — sits on the roof so the player can walk the jump up again. */
export function drawTakeoffMark(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  cssW: number,
  cssH: number,
  x: number,
  y: number,
  slope = 0,
): void {
  const s = worldToScreen(cam, cssW, cssH, x, y);
  if (s.x < -48 || s.x > cssW + 48) return;
  const ppm = s.ppm;
  const arm = 0.09 * ppm;
  ctx.save();
  ctx.translate(s.x, s.y + 0.03 * ppm);
  if (Math.abs(slope) > 0.02) ctx.rotate(-Math.atan(slope));
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(18, 22, 28, 0.55)";
  ctx.lineWidth = Math.max(3, ppm * 0.04);
  ctx.beginPath();
  ctx.moveTo(-arm, -arm * 0.72);
  ctx.lineTo(arm, arm * 0.72);
  ctx.moveTo(arm, -arm * 0.72);
  ctx.lineTo(-arm, arm * 0.72);
  ctx.stroke();
  ctx.strokeStyle = "rgba(240, 162, 58, 0.95)";
  ctx.lineWidth = Math.max(1.6, ppm * 0.022);
  ctx.beginPath();
  ctx.moveTo(-arm, -arm * 0.72);
  ctx.lineTo(arm, arm * 0.72);
  ctx.moveTo(arm, -arm * 0.72);
  ctx.lineTo(-arm, arm * 0.72);
  ctx.stroke();
  ctx.restore();
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
