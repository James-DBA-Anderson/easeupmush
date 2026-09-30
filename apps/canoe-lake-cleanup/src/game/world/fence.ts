import * as THREE from "three";
import { PATH_SPURS } from "./lake";
import { PAVEMENT_WIDTH, ROAD_WIDTH, roadGapsAlong } from "./buildings";
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
const GATE_WIDTH = 6.5;

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
    ROAD_WIDTH * 0.5 + PAVEMENT_WIDTH + 1.25,
  )) {
    const start = Math.max(0.4, gs);
    const end = Math.min(length - 0.4, gs + gw);
    if (end - start < 3) continue;
    gates.push([start, end - start]);
  }

  // Only spur / road openings — no mid-edge guesswork that punches holes
  // where there is no path or van gate.

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

/** A few metres of fence that can be knocked flat. */
interface FencePanel {
  root: THREE.Group;
  hinge: THREE.Group;
  runIndex: number;
  s0: number;
  s1: number;
  /** Ground midpoint. */
  x: number;
  z: number;
  /** Unit along the run. */
  ax: number;
  az: number;
  smashed: boolean;
  fall: number;
  sign: number;
}

const panels: FencePanel[] = [];
const CHUNK = 2.6;

function clearPanels(scene: THREE.Scene): void {
  for (const panel of panels) scene.remove(panel.root);
  panels.length = 0;
}

function openPanel(
  scene: THREE.Scene,
  runIndex: number,
  from: THREE.Vector2,
  along: THREE.Vector2,
  s0: number,
  s1: number,
): THREE.Group {
  const mid = (s0 + s1) / 2;
  const x = from.x + along.x * mid;
  const z = from.y + along.y * mid;
  const root = new THREE.Group();
  root.position.set(x, groundHeight(x, z), z);
  root.rotation.y = Math.atan2(-along.y, along.x);
  const hinge = new THREE.Group();
  root.add(hinge);
  scene.add(root);
  panels.push({
    root,
    hinge,
    runIndex,
    s0,
    s1,
    x,
    z,
    ax: along.x,
    az: along.y,
    smashed: false,
    fall: 0,
    sign: 1,
  });
  return hinge;
}

function localBox(
  parent: THREE.Object3D,
  material: THREE.Material,
  length: number,
  height: number,
  thick: number,
  y0: number,
): void {
  if (length < 0.04) return;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, height, thick), material);
  mesh.position.set(0, y0 + height / 2, 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
}

function localPost(
  parent: THREE.Object3D,
  material: THREE.Material,
  localX: number,
  height: number,
  radius: number,
): void {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 6),
    material,
  );
  mesh.position.set(localX, height / 2 - 0.02, 0);
  mesh.castShadow = true;
  parent.add(mesh);
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

function wirePanels(scene: THREE.Scene, run: Run, runIndex: number): void {
  const span = new THREE.Vector2().subVectors(run.to, run.from);
  const length = span.length();
  if (length < 0.02) return;
  const along = span.clone().normalize();
  const { from, gates } = run;

  for (const [bayStart, bayEnd] of solidBays(length, gates)) {
    for (let s = bayStart; s < bayEnd - 0.15; s += CHUNK) {
      const s0 = s;
      const s1 = Math.min(bayEnd, s + CHUNK);
      const hinge = openPanel(scene, runIndex, from, along, s0, s1);
      const mid = (s0 + s1) / 2;
      const lo = Math.max(s0 + HOOP_SPAN * 0.2, bayStart + HOOP_SPAN * 0.35);
      const hi = Math.min(s1 - HOOP_SPAN * 0.2, bayEnd - HOOP_SPAN * 0.35);
      let placed = 0;
      for (let at = lo; at <= hi + 0.01; at += HOOP_STEP) {
        const localX = at - mid;
        const half = HOOP_SPAN / 2;
        const left = new THREE.Vector3(localX - half, -0.08, 0);
        const peak = new THREE.Vector3(localX, WIRE_HEIGHT * 2 + 0.08, 0);
        const right = new THREE.Vector3(localX + half, -0.08, 0);
        const curve = new THREE.QuadraticBezierCurve3(left, peak, right);
        const hoop = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 8, WIRE_R, 4, false),
          WIRE_MAT,
        );
        hoop.castShadow = true;
        hinge.add(hoop);
        placed += 1;
      }
      if (placed === 0 && s1 - s0 > 0.4) {
        const curve = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(-(s1 - s0) * 0.35, -0.08, 0),
          new THREE.Vector3(0, WIRE_HEIGHT * 2 + 0.08, 0),
          new THREE.Vector3((s1 - s0) * 0.35, -0.08, 0),
        );
        hinge.add(
          new THREE.Mesh(new THREE.TubeGeometry(curve, 8, WIRE_R, 4, false), WIRE_MAT),
        );
      }
    }
  }

  for (const [start, width] of gates ?? []) {
    for (const at of [start, start + width]) {
      if (at < -0.01 || at > length + 0.01) continue;
      const hinge = openPanel(scene, runIndex, from, along, at - 0.2, at + 0.2);
      localPost(hinge, WIRE_MAT, 0, WIRE_HEIGHT + 0.12, WIRE_R * 1.4);
    }
  }
}

function brickPanels(scene: THREE.Scene, run: Run, runIndex: number): void {
  const span = new THREE.Vector2().subVectors(run.to, run.from);
  const length = span.length();
  if (length < 0.02) return;
  const along = span.clone().normalize();
  const { from, gates } = run;

  for (const [bayStart, bayEnd] of solidBays(length, gates)) {
    for (let s = bayStart; s < bayEnd - 0.15; s += CHUNK) {
      const s0 = s;
      const s1 = Math.min(bayEnd, s + CHUNK);
      const hinge = openPanel(scene, runIndex, from, along, s0, s1);
      const len = s1 - s0;
      localBox(hinge, BRICK_MAT, len, BRICK_H, BRICK_THICK, 0);
      localBox(hinge, COPING_MAT, len + 0.04, 0.08, BRICK_THICK + 0.08, BRICK_H);
    }
  }

  for (const [start, width] of gates ?? []) {
    for (const at of [start, start + width]) {
      if (at < -0.01 || at > length + 0.01) continue;
      const hinge = openPanel(scene, runIndex, from, along, at - 0.24, at + 0.24);
      localBox(hinge, BRICK_MAT, 0.42, BRICK_H + 0.12, BRICK_THICK + 0.1, 0);
      localBox(hinge, COPING_MAT, 0.48, 0.1, BRICK_THICK + 0.16, BRICK_H + 0.12);
    }
  }
}

function railPanels(scene: THREE.Scene, run: Run, runIndex: number): void {
  const span = new THREE.Vector2().subVectors(run.to, run.from);
  const length = span.length();
  if (length < 0.02) return;
  const along = span.clone().normalize();
  const { from, gates } = run;

  for (const [bayStart, bayEnd] of solidBays(length, gates)) {
    for (let s = bayStart; s < bayEnd - 0.15; s += CHUNK) {
      const s0 = s;
      const s1 = Math.min(bayEnd, s + CHUNK);
      const hinge = openPanel(scene, runIndex, from, along, s0, s1);
      const mid = (s0 + s1) / 2;
      const len = s1 - s0;
      localBox(hinge, IRON_MAT, len, 0.04, 0.05, 0.12);
      localBox(hinge, IRON_MAT, len, 0.04, 0.05, RAIL_H - 0.08);
      for (let at = s0 + 0.08; at <= s1 - 0.08; at += BAR_STEP) {
        localPost(hinge, IRON_MAT, at - mid, RAIL_H - 0.06, 0.018);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.1, 5), IRON_MAT);
        tip.position.set(at - mid, RAIL_H + 0.02, 0);
        hinge.add(tip);
      }
    }
  }

  for (const [start, width] of gates ?? []) {
    for (const at of [start, start + width]) {
      if (at < -0.01 || at > length + 0.01) continue;
      const hinge = openPanel(scene, runIndex, from, along, at - 0.2, at + 0.2);
      localPost(hinge, IRON_MAT, 0, RAIL_H + 0.15, 0.055);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), IRON_MAT);
      ball.position.set(0, RAIL_H + 0.22, 0);
      hinge.add(ball);
    }
  }
}

function distToSeg(
  px: number,
  pz: number,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): number {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len2 = dx * dx + dz * dz;
  const t =
    len2 < 1e-6
      ? 0
      : Math.max(0, Math.min(1, ((px - x0) * dx + (pz - z0) * dz) / len2));
  return Math.hypot(px - (x0 + dx * t), pz - (z0 + dz * t));
}

/**
 * Knock over every fence panel the wreck's path crosses. `vx, vz` is the
 * way it's travelling, so the top falls with the car rather than against it.
 */
export function smashFencesAlong(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  vx: number,
  vz: number,
): void {
  for (const panel of panels) {
    if (panel.smashed) continue;
    const half = Math.max(0.35, (panel.s1 - panel.s0) / 2);
    if (distToSeg(panel.x, panel.z, x0, z0, x1, z1) > half + 1.25) continue;
    panel.smashed = true;
    const dot = vx * -panel.az + vz * panel.ax;
    panel.sign = dot >= 0 ? 1 : -1;
  }
}

/** Finish the topple after the car has gone past. */
export function updateBrokenFences(delta: number): void {
  for (const panel of panels) {
    if (!panel.smashed || panel.fall >= 1) continue;
    panel.fall = Math.min(1, panel.fall + delta * 2.6);
    panel.hinge.rotation.x = panel.sign * panel.fall * 1.4;
  }
}

function fenceGap(runIndex: number, at: number): boolean {
  for (const panel of panels) {
    if (!panel.smashed || panel.runIndex !== runIndex) continue;
    if (at >= panel.s0 - 0.2 && at <= panel.s1 + 0.2) return true;
  }
  return false;
}

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
  clearPanels(scene);
  for (let i = 0; i < RUNS.length; i++) {
    const run = RUNS[i]!;
    if (fenceStyle === "brick") brickPanels(scene, run, i);
    else if (fenceStyle === "railings") railPanels(scene, run, i);
    else wirePanels(scene, run, i);
  }
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

function railHalf(): number {
  return fenceStyle === "brick" ? 0.55 : 0.45;
}

/** Solid fencing underfoot — everywhere but the gateways. */
export function atRailings(x: number, z: number): boolean {
  const half = railHalf();
  const here = new THREE.Vector2(x, z);
  for (const run of RUNS) {
    const span = new THREE.Vector2().subVectors(run.to, run.from);
    const length = span.length();
    const along = span.clone().normalize();
    const offset = new THREE.Vector2().subVectors(here, run.from);
    const at = offset.dot(along);
    if (at < 0 || at > length) continue;
    if (Math.abs(offset.x * along.y - offset.y * along.x) > half) continue;
    if (fenceGap(RUNS.indexOf(run), at)) continue;
    if (!inGate(at, run.gates)) return true;
  }
  return false;
}

/**
 * True if the straight step from A to B crosses a fence bay (not a gate).
 * Endpoint sampling can skip a thin wall on a long frame.
 */
export function railingsBlockSpan(
  ax: number,
  az: number,
  bx: number,
  bz: number,
): boolean {
  for (const run of RUNS) {
    const along = pathCrossesRun(ax, az, bx, bz, run.from, run.to);
    if (along == null) continue;
    if (fenceGap(RUNS.indexOf(run), along)) continue;
    if (!inGate(along, run.gates)) return true;
  }
  return false;
}

/** Nudge off a fence bay without crossing to the far side. */
export function pushOffRailings(
  x: number,
  z: number,
): { x: number; z: number } {
  const half = railHalf() + 0.06;
  let px = x;
  let pz = z;
  for (const run of RUNS) {
    const span = new THREE.Vector2().subVectors(run.to, run.from);
    const length = span.length();
    if (length < 1e-4) continue;
    const along = span.clone().normalize();
    const ox = px - run.from.x;
    const oz = pz - run.from.y;
    const at = ox * along.x + oz * along.y;
    if (at < 0 || at > length) continue;
    if (inGate(at, run.gates)) continue;
    if (fenceGap(RUNS.indexOf(run), at)) continue;
    const side = ox * along.y - oz * along.x;
    if (Math.abs(side) > half) continue;
    let dir = side < 0 ? -1 : 1;
    if (Math.abs(side) < 1e-4) {
      dir = insidePark(px + along.y * half, pz - along.x * half) ? 1 : -1;
    }
    const k = dir * half - side;
    px += along.y * k;
    pz += -along.x * k;
  }
  return { x: px, z: pz };
}
