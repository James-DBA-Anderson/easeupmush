import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PATH_SPURS } from "./lake";
import { ROAD_WIDTH, roadGapsAlong } from "./buildings";
import { DEFAULT_LEVEL } from "../../level/defaultLevel";
import type { FenceStyle, XZ } from "../../level/types";
import { groundHeight } from "./terrain";

/**
 * Park perimeter fencing. The ring and style come from the level / editor.
 * Gate openings sit where path spurs and parade roads hit the fence.
 */

const WIRE_MAT = new THREE.MeshStandardMaterial({
  color: 0x3a453c,
  roughness: 0.65,
  metalness: 0.25,
});
const BRICK_MAT = new THREE.MeshStandardMaterial({
  color: 0x9a6a52,
  roughness: 0.95,
});
const COPING_MAT = new THREE.MeshStandardMaterial({
  color: 0xc4b8a4,
  roughness: 0.85,
});
const IRON_MAT = new THREE.MeshStandardMaterial({
  color: 0x1a1c1e,
  roughness: 0.45,
  metalness: 0.7,
});

/** Peak height — garden wire hoops. */
const WIRE_HEIGHT = 0.68;
/** Ground span of one hoop. */
const HOOP_SPAN = 1.05;
/** Spacing along the run — less than span so neighbouring hoops overlap. */
const HOOP_STEP = 0.52;
/** Wire thickness. */
const WIRE_R = 0.012;
/** Wide enough that a 4m spur of paving clears either side. */
const GATE_WIDTH = 8;

const BRICK_H = 1.05;
const BRICK_THICK = 0.32;
const RAIL_H = 1.12;
const BAR_STEP = 0.14;

/** A stretch of fencing, and the gaps in it. */
interface Run {
  from: THREE.Vector2;
  to: THREE.Vector2;
  /** Gate openings, as a distance along the run and a width. */
  gates?: readonly (readonly [number, number])[];
}

/**
 * Closed ring of the park fencing (XZ). Replaced when a level is applied.
 */
export let PARK_RING: ReadonlyArray<THREE.Vector2> =
  DEFAULT_LEVEL.parkRing.map(([x, z]) => new THREE.Vector2(x, z));

let fenceStyle: FenceStyle = DEFAULT_LEVEL.fenceStyle ?? "wire";

export function applyParkRing(
  ring: ReadonlyArray<XZ>,
  style: FenceStyle = "wire",
): void {
  PARK_RING = ring.map(([x, z]) => new THREE.Vector2(x, z));
  fenceStyle = style;
}

export function getFenceStyle(): FenceStyle {
  return fenceStyle;
}

/** True inside the park fence (the lake and its surrounding green). */
export function insidePark(x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = PARK_RING.length - 1; i < PARK_RING.length; j = i++) {
    const a = PARK_RING[i]!;
    const b = PARK_RING[j]!;
    const straddles = a.y > z !== b.y > z;
    if (straddles && x < ((b.x - a.x) * (z - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

class MeshBag {
  private geos: THREE.BufferGeometry[] = [];

  public add(geo: THREE.BufferGeometry): void {
    this.geos.push(geo);
  }

  public build(scene: THREE.Scene, material: THREE.Material): void {
    if (this.geos.length === 0) return;
    const merged = mergeGeometries(this.geos, false);
    for (const g of this.geos) g.dispose();
    this.geos = [];
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

/** Place a box centred on the run at `at`, length along the fence. */
function bayBox(
  bag: MeshBag,
  from: THREE.Vector2,
  along: THREE.Vector2,
  at: number,
  length: number,
  height: number,
  thick: number,
  y0: number,
): void {
  if (length < 0.04) return;
  // Local +X runs along the fence (ax, az).
  const yaw = Math.atan2(-along.y, along.x);
  const cx = from.x + along.x * at;
  const cz = from.y + along.y * at;
  const gy = groundHeight(cx, cz);
  const geo = new THREE.BoxGeometry(length, height, thick);
  geo.rotateY(yaw);
  geo.translate(cx, gy + y0 + height / 2, cz);
  bag.add(geo);
}

/** Upright post on the run. */
function post(
  bag: MeshBag,
  from: THREE.Vector2,
  along: THREE.Vector2,
  at: number,
  height: number,
  radius: number,
): void {
  const cx = from.x + along.x * at;
  const cz = from.y + along.y * at;
  const gy = groundHeight(cx, cz);
  const geo = new THREE.CylinderGeometry(radius, radius, height, 6);
  geo.translate(cx, gy + height / 2 - 0.02, cz);
  bag.add(geo);
}

class Wirework {
  private bag = new MeshBag();

  /** One overlapping hoop: wire up from the ground, over, and back down. */
  public hoop(at: number, origin: THREE.Vector2, along: THREE.Vector2): void {
    const half = HOOP_SPAN / 2;
    const lx = origin.x + along.x * (at - half);
    const lz = origin.y + along.y * (at - half);
    const mx = origin.x + along.x * at;
    const mz = origin.y + along.y * at;
    const rx = origin.x + along.x * (at + half);
    const rz = origin.y + along.y * (at + half);
    const left = new THREE.Vector3(lx, groundHeight(lx, lz) - 0.08, lz);
    const peak = new THREE.Vector3(
      mx,
      groundHeight(mx, mz) + WIRE_HEIGHT * 2 + 0.08,
      mz,
    );
    const right = new THREE.Vector3(rx, groundHeight(rx, rz) - 0.08, rz);
    const curve = new THREE.QuadraticBezierCurve3(left, peak, right);
    this.bag.add(new THREE.TubeGeometry(curve, 10, WIRE_R, 4, false));
  }

  public gatePost(at: number, origin: THREE.Vector2, along: THREE.Vector2): void {
    post(this.bag, origin, along, at, WIRE_HEIGHT + 0.12, WIRE_R * 1.4);
  }

  public build(scene: THREE.Scene): void {
    this.bag.build(scene, WIRE_MAT);
  }
}

/** True if this point along the run falls in a gateway. */
function inGate(at: number, gates: Run["gates"]): boolean {
  if (!gates) return false;
  return gates.some(([start, width]) => at > start && at < start + width);
}

/**
 * Solid stretches of a run (between gateways), as [start, end] along the edge.
 */
function solidBays(
  length: number,
  gates: Run["gates"],
): Array<readonly [number, number]> {
  const bays: Array<readonly [number, number]> = [];
  let start = 0;
  while (start < length - 0.01) {
    if (inGate(start + 1e-4, gates)) {
      let next = start + 0.05;
      while (next < length && inGate(next, gates)) next += 0.05;
      start = next;
      continue;
    }
    let end = length;
    for (const [g0] of gates ?? []) {
      if (g0 > start + 1e-4 && g0 < end) end = g0;
    }
    if (end - start > 0.04) bays.push([start, end]);
    start = end;
  }
  return bays;
}

/**
 * One straight stretch of garden wire. `perimeterAt` keeps hoop phasing even
 * across short editor edges.
 */
function wireRun(work: Wirework, run: Run, perimeterAt: number): void {
  const span = new THREE.Vector2().subVectors(run.to, run.from);
  const length = span.length();
  if (length < 0.02) return;
  const along = span.clone().normalize();
  const { from, gates } = run;
  const bays = solidBays(length, gates);

  const phase = ((perimeterAt % HOOP_STEP) + HOOP_STEP) % HOOP_STEP;
  let first = phase === 0 ? 0 : HOOP_STEP - phase;
  if (first < HOOP_STEP * 0.15) first += HOOP_STEP;

  for (const [bayStart, bayEnd] of bays) {
    const lo = bayStart + HOOP_SPAN * 0.45;
    const hi = bayEnd - HOOP_SPAN * 0.45;
    if (hi - lo < HOOP_STEP * 0.4) {
      if (bayEnd - bayStart > HOOP_SPAN * 0.55) {
        work.hoop((bayStart + bayEnd) / 2, from, along);
      }
      continue;
    }
    for (let at = first; at <= length + 0.01; at += HOOP_STEP) {
      if (at < lo || at > hi) continue;
      work.hoop(at, from, along);
    }
  }

  for (const [start, width] of gates ?? []) {
    for (const at of [start, start + width]) {
      if (at < -0.01 || at > length + 0.01) continue;
      work.gatePost(at, from, along);
    }
  }
}

function brickRun(brick: MeshBag, coping: MeshBag, run: Run): void {
  const span = new THREE.Vector2().subVectors(run.to, run.from);
  const length = span.length();
  if (length < 0.02) return;
  const along = span.clone().normalize();
  const { from, gates } = run;

  for (const [bayStart, bayEnd] of solidBays(length, gates)) {
    const len = bayEnd - bayStart;
    const mid = (bayStart + bayEnd) / 2;
    bayBox(brick, from, along, mid, len, BRICK_H, BRICK_THICK, 0);
    bayBox(coping, from, along, mid, len + 0.04, 0.08, BRICK_THICK + 0.08, BRICK_H);
  }

  for (const [start, width] of gates ?? []) {
    for (const at of [start, start + width]) {
      if (at < -0.01 || at > length + 0.01) continue;
      bayBox(brick, from, along, at, 0.42, BRICK_H + 0.12, BRICK_THICK + 0.1, 0);
      bayBox(
        coping,
        from,
        along,
        at,
        0.48,
        0.1,
        BRICK_THICK + 0.16,
        BRICK_H + 0.12,
      );
    }
  }
}

function railingsRun(iron: MeshBag, run: Run): void {
  const span = new THREE.Vector2().subVectors(run.to, run.from);
  const length = span.length();
  if (length < 0.02) return;
  const along = span.clone().normalize();
  const { from, gates } = run;

  for (const [bayStart, bayEnd] of solidBays(length, gates)) {
    const len = bayEnd - bayStart;
    const mid = (bayStart + bayEnd) / 2;
    bayBox(iron, from, along, mid, len, 0.04, 0.05, 0.12);
    bayBox(iron, from, along, mid, len, 0.04, 0.05, RAIL_H - 0.08);
    const lo = bayStart + 0.08;
    const hi = bayEnd - 0.08;
    for (let at = lo; at <= hi + 0.001; at += BAR_STEP) {
      post(iron, from, along, at, RAIL_H - 0.06, 0.018);
      const cx = from.x + along.x * at;
      const cz = from.y + along.y * at;
      const tip = new THREE.ConeGeometry(0.028, 0.1, 5);
      tip.translate(cx, groundHeight(cx, cz) + RAIL_H + 0.02, cz);
      iron.add(tip);
    }
  }

  for (const [start, width] of gates ?? []) {
    for (const at of [start, start + width]) {
      if (at < -0.01 || at > length + 0.01) continue;
      post(iron, from, along, at, RAIL_H + 0.15, 0.055);
      const cx = from.x + along.x * at;
      const cz = from.y + along.y * at;
      const ball = new THREE.SphereGeometry(0.07, 8, 6);
      ball.translate(cx, groundHeight(cx, cz) + RAIL_H + 0.22, cz);
      iron.add(ball);
    }
  }
}

/**
 * Gate openings worked out from where path spurs and roads meet each stretch,
 * so the fence never runs across the paving or the tarmac.
 */
function projectOnRun(
  x: number,
  z: number,
  from: THREE.Vector2,
  along: THREE.Vector2,
  length: number,
): { s: number; dist: number } {
  const ox = x - from.x;
  const oz = z - from.y;
  const s = ox * along.x + oz * along.y;
  const clamped = Math.min(length, Math.max(0, s));
  const px = from.x + along.x * clamped;
  const pz = from.y + along.y * clamped;
  return { s, dist: Math.hypot(x - px, z - pz) };
}

/** Distance along the run where path A→B crosses it, or null. */
function pathCrossesRun(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  from: THREE.Vector2,
  to: THREE.Vector2,
): number | null {
  const x1 = ax;
  const y1 = az;
  const x2 = bx;
  const y2 = bz;
  const x3 = from.x;
  const y3 = from.y;
  const x4 = to.x;
  const y4 = to.y;
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(den) < 1e-9) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;
  if (t < -0.08 || t > 1.08 || u < 0 || u > 1) return null;
  return u * Math.hypot(x4 - x3, y4 - y3);
}

function tryGateAt(
  gates: [number, number][],
  s: number,
  length: number,
  width = GATE_WIDTH,
): void {
  if (s < width * 0.35 || s > length - width * 0.35) return;
  gates.push([s - width / 2, width]);
}

function gatesOn(from: THREE.Vector2, to: THREE.Vector2): [number, number][] {
  const span = new THREE.Vector2().subVectors(to, from);
  const length = span.length();
  if (length < 1) return [];
  const along = span.clone().normalize();

  const MEET_DIST = 6;
  const gates: [number, number][] = [];

  for (const spur of PATH_SPURS) {
    const cross = pathCrossesRun(
      spur.ax,
      spur.az,
      spur.bx,
      spur.bz,
      from,
      to,
    );
    if (cross != null) tryGateAt(gates, cross, length);

    for (const [px, pz, ox, oz] of [
      [spur.ax, spur.az, spur.bx, spur.bz],
      [spur.bx, spur.bz, spur.ax, spur.az],
    ] as const) {
      const { s, dist } = projectOnRun(px, pz, from, along, length);
      if (dist > MEET_DIST) continue;
      if (s < 0 || s > length) continue;
      const approach = new THREE.Vector2(px - ox, pz - oz);
      if (approach.lengthSq() > 1e-6) {
        approach.normalize();
        const alongDot = Math.abs(approach.dot(along));
        if (alongDot > 0.92) continue;
      }
      tryGateAt(gates, s, length);
    }
  }

  for (const [gs, gw] of roadGapsAlong(
    from.x,
    from.y,
    to.x,
    to.y,
    ROAD_WIDTH * 0.5 + 1.25,
  )) {
    const start = Math.max(0.4, gs);
    const end = Math.min(length - 0.4, gs + gw);
    if (end - start < 3) continue;
    gates.push([start, end - start]);
  }

  if (length > 55) {
    gates.push([length * 0.35, 5], [length * 0.7, 5]);
  } else if (length > 35) {
    gates.push([length * 0.5, 5]);
  }

  gates.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const gate of gates) {
    const last = merged[merged.length - 1];
    if (last && gate[0] < last[0] + last[1] + 2) {
      const end = Math.max(last[0] + last[1], gate[0] + gate[1]);
      last[1] = end - last[0];
    } else {
      merged.push([gate[0], gate[1]]);
    }
  }
  return merged;
}

/** Rebuilt in `buildFencing` so applied level paths/ring drive the gates. */
let RUNS: readonly Run[] = [];

function rebuildRuns(): void {
  const runs: Run[] = [];
  for (let i = 0; i < PARK_RING.length; i++) {
    const from = PARK_RING[i]!;
    const to = PARK_RING[(i + 1) % PARK_RING.length]!;
    runs.push({ from, to, gates: gatesOn(from, to) });
  }
  RUNS = runs;
}

export function buildFencing(scene: THREE.Scene): void {
  rebuildRuns();
  if (fenceStyle === "brick") {
    const brick = new MeshBag();
    const coping = new MeshBag();
    for (const run of RUNS) brickRun(brick, coping, run);
    brick.build(scene, BRICK_MAT);
    coping.build(scene, COPING_MAT);
    return;
  }
  if (fenceStyle === "railings") {
    const iron = new MeshBag();
    for (const run of RUNS) railingsRun(iron, run);
    iron.build(scene, IRON_MAT);
    return;
  }

  const work = new Wirework();
  let perimeterAt = 0;
  for (const run of RUNS) {
    wireRun(work, run, perimeterAt);
    perimeterAt += new THREE.Vector2().subVectors(run.to, run.from).length();
  }
  work.build(scene);
}

/**
 * Midpoints of every gateway. People and animals come in and leave by these,
 * rather than materialising on the path.
 */
export function parkGates(): THREE.Vector2[] {
  const gates: THREE.Vector2[] = [];
  for (const run of RUNS) {
    const span = new THREE.Vector2().subVectors(run.to, run.from);
    const along = span.clone().normalize();
    for (const [start, width] of run.gates ?? []) {
      const at = start + width / 2;
      gates.push(
        new THREE.Vector2(
          run.from.x + along.x * at,
          run.from.y + along.y * at,
        ),
      );
    }
  }
  return gates;
}

/** Solid fencing underfoot — everywhere but the gateways. */
export function atRailings(x: number, z: number): boolean {
  const half = fenceStyle === "brick" ? 0.55 : 0.45;
  const here = new THREE.Vector2(x, z);
  for (const run of RUNS) {
    const span = new THREE.Vector2().subVectors(run.to, run.from);
    const length = span.length();
    const along = span.clone().normalize();
    const offset = new THREE.Vector2().subVectors(here, run.from);
    const at = offset.dot(along);
    if (at < 0 || at > length) continue;
    if (Math.abs(offset.x * along.y - offset.y * along.x) > half) continue;
    if (!inGate(at, run.gates)) return true;
  }
  return false;
}
