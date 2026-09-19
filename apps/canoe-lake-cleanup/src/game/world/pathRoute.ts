import * as THREE from "three";
import { insidePark, parkGates } from "./fence";
import { PATH_LOOP } from "./lake";

/** Mutable follow state for walking the lakeside loop toward a goal. */
export interface LoopRoute {
  index: number;
  dir: 1 | -1;
  ready: boolean;
}

export function emptyRoute(): LoopRoute {
  return { index: 0, dir: 1, ready: false };
}

/** Closest fence gateway midpoint to a world point. */
export function nearestGate(x: number, z: number): THREE.Vector2 {
  const gates = parkGates();
  if (gates.length === 0) return new THREE.Vector2(x + 20, z + 20);
  let best = gates[0]!;
  let bestD = Infinity;
  for (const g of gates) {
    const d = (g.x - x) ** 2 + (g.y - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = g;
    }
  }
  return best.clone();
}

/**
 * A point just outside the park through a gateway — for arrivals and exits.
 * Picks a direction from the gate that leaves `insidePark`.
 */
export function gateOutside(gate: THREE.Vector2, meters = 8): THREE.Vector2 {
  let cx = 0;
  let cz = 0;
  if (PATH_LOOP.length > 0) {
    for (const p of PATH_LOOP) {
      cx += p.x;
      cz += p.y;
    }
    cx /= PATH_LOOP.length;
    cz /= PATH_LOOP.length;
  }
  const fromCenter = new THREE.Vector2(gate.x - cx, gate.y - cz);
  if (fromCenter.lengthSq() < 1e-4) fromCenter.set(0, 1);
  fromCenter.normalize();

  const dirs: THREE.Vector2[] = [fromCenter, fromCenter.clone().negate()];
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    dirs.push(new THREE.Vector2(Math.cos(ang), Math.sin(ang)));
  }

  for (const dir of dirs) {
    const probe = new THREE.Vector2(gate.x + dir.x * 3.2, gate.y + dir.y * 3.2);
    if (insidePark(probe.x, probe.y)) continue;
    return new THREE.Vector2(gate.x + dir.x * meters, gate.y + dir.y * meters);
  }
  return new THREE.Vector2(
    gate.x + fromCenter.x * meters,
    gate.y + fromCenter.y * meters,
  );
}

export function nearestLoopIndex(x: number, z: number): number {
  if (PATH_LOOP.length === 0) return 0;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < PATH_LOOP.length; i++) {
    const p = PATH_LOOP[i]!;
    const d = (p.x - x) ** 2 + (p.y - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Aim the route along the short way round PATH_LOOP toward a goal. */
export function setRouteToward(
  route: LoopRoute,
  fromX: number,
  fromZ: number,
  goalX: number,
  goalZ: number,
): void {
  if (PATH_LOOP.length < 4) {
    route.ready = false;
    return;
  }
  const fromI = nearestLoopIndex(fromX, fromZ);
  const goalI = nearestLoopIndex(goalX, goalZ);
  route.index = fromI;
  const n = PATH_LOOP.length;
  const cw = (goalI - fromI + n) % n;
  const ccw = (fromI - goalI + n) % n;
  route.dir = cw <= ccw ? 1 : -1;
  route.ready = true;
}

/**
 * Next walk target while following PATH_LOOP, or null once the walker should
 * peel off across grass toward the real goal.
 */
export function routeAim(
  route: LoopRoute,
  hereX: number,
  hereZ: number,
  goalX: number,
  goalZ: number,
  peelAt: number,
): THREE.Vector2 | null {
  const toGoal = Math.hypot(goalX - hereX, goalZ - hereZ);
  if (!route.ready || toGoal < peelAt || PATH_LOOP.length < 4) {
    route.ready = false;
    return null;
  }
  const n = PATH_LOOP.length;
  const node = PATH_LOOP[route.index]!;
  if (Math.hypot(node.x - hereX, node.y - hereZ) < 2.2) {
    route.index = (route.index + route.dir + n) % n;
  }
  const next = PATH_LOOP[route.index]!;
  // Peel early if the goal is closer than the next node.
  const toNext = Math.hypot(next.x - hereX, next.y - hereZ);
  if (toGoal < toNext * 0.9 && toGoal < peelAt * 1.35) {
    route.ready = false;
    return null;
  }
  return new THREE.Vector2(next.x, next.y);
}
