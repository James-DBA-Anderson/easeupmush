import * as THREE from "three";
import type { ElevEdgeStyle, ElevationZone, XZ } from "../../level/types";
import { PATH_Y } from "./lake";

/** ~riser height for stepped berms (metres). */
const STEP_RISE = 0.18;

let zones: ElevationZone[] = [];

/** Push authored berms into the world before meshes are built. */
export function applyElevationZones(next: ReadonlyArray<ElevationZone>): void {
  zones = next
    .filter((z) => z.outline.length >= 3 && z.height > 0.02)
    .map((z) => ({
      outline: z.outline.map((p) => [p[0], p[1]] as XZ),
      height: THREE.MathUtils.clamp(z.height, 0, 12),
      edge: z.edge === "steps" || z.edge === "slope" ? z.edge : "wall",
    }));
}

/**
 * Height of the walkable park surface above the flat ground plane.
 * Overlapping zones take the tallest.
 */
export function groundHeight(x: number, z: number): number {
  let h = 0;
  for (const zone of zones) {
    const local = zoneHeightAt(zone, x, z);
    if (local > h) h = local;
  }
  return h;
}

function zoneHeightAt(zone: ElevationZone, x: number, z: number): number {
  const edge = zone.edge ?? "wall";
  if (pointInPoly(x, z, zone.outline)) return zone.height;
  if (edge === "wall") return 0;

  const band = edgeBand(zone.height);
  const outer = offsetOutline(zone.outline, band);
  if (!pointInPoly(x, z, outer)) return 0;

  const dist = distToPolyEdges(x, z, zone.outline);
  const t = THREE.MathUtils.clamp(1 - dist / band, 0, 1);
  if (edge === "slope") return zone.height * t;

  const steps = stepCount(zone.height);
  return zone.height * (Math.floor(t * steps + 1e-6) / steps);
}

function edgeBand(height: number): number {
  return THREE.MathUtils.clamp(height * 1.35, 1.1, 4.5);
}

function stepCount(height: number): number {
  return Math.max(2, Math.round(height / STEP_RISE));
}

/** Raised tops + edge transitions for each elevation zone. */
export function buildElevation(scene: THREE.Scene): void {
  if (zones.length === 0) return;

  const topMat = new THREE.MeshStandardMaterial({
    color: 0x4a6b38,
    roughness: 1,
    flatShading: true,
  });
  const sideMat = new THREE.MeshStandardMaterial({
    color: 0x3a522c,
    roughness: 1,
    flatShading: true,
  });
  const treadMat = new THREE.MeshStandardMaterial({
    color: 0x456334,
    roughness: 1,
    flatShading: true,
  });

  for (const zone of zones) {
    addPlateauTop(scene, zone.outline, PATH_Y + zone.height, topMat);

    const edge: ElevEdgeStyle = zone.edge ?? "wall";
    if (edge === "wall") {
      addVerticalSkirt(scene, zone.outline, PATH_Y, PATH_Y + zone.height, sideMat);
    } else if (edge === "slope") {
      const outer = offsetOutline(zone.outline, edgeBand(zone.height));
      addRampSkirt(scene, zone.outline, PATH_Y + zone.height, outer, PATH_Y, sideMat);
    } else {
      addSteppedEdge(scene, zone, sideMat, treadMat);
    }
  }
}

function addPlateauTop(
  scene: THREE.Scene,
  outline: ReadonlyArray<XZ>,
  y: number,
  material: THREE.Material,
): void {
  const shape = new THREE.Shape();
  const first = outline[0]!;
  shape.moveTo(first[0], first[1]);
  for (let i = 1; i < outline.length; i++) {
    const p = outline[i]!;
    shape.lineTo(p[0], p[1]);
  }
  shape.closePath();

  // Remap ShapeGeometry XY → XZ (don't rotateX — that mirrors Z and parks
  // the top on the wrong side of the outline).
  const geo = new THREE.ShapeGeometry(shape);
  const pos = geo.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getY(i);
    pos.setXYZ(i, x, 0, z);
  }
  pos.needsUpdate = true;
  const index = geo.index;
  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      const b = index.getX(i + 1);
      const c = index.getX(i + 2);
      index.setX(i + 1, c);
      index.setX(i + 2, b);
    }
    index.needsUpdate = true;
  }
  geo.computeVertexNormals();

  const top = new THREE.Mesh(geo, material);
  top.position.y = y;
  top.receiveShadow = true;
  top.castShadow = true;
  scene.add(top);
}

/** Sheer face between y0 (foot) and y1 (lip) on the plateau outline. */
function addVerticalSkirt(
  scene: THREE.Scene,
  outline: ReadonlyArray<XZ>,
  y0: number,
  y1: number,
  material: THREE.Material,
): void {
  const n = outline.length;
  for (let i = 0; i < n; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % n]!;
    // CCW outline: wind so normals face outward (visible from the park).
    const positions = new Float32Array([
      a[0], y0, a[1],
      a[0], y1, a[1],
      b[0], y1, b[1],

      a[0], y0, a[1],
      b[0], y1, b[1],
      b[0], y0, b[1],
    ]);
    const wallGeo = new THREE.BufferGeometry();
    wallGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    wallGeo.computeVertexNormals();
    const wall = new THREE.Mesh(wallGeo, material);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);
  }
}

/** Sloped apron from the plateau lip down to an outer ring on the flat. */
function addRampSkirt(
  scene: THREE.Scene,
  topRing: ReadonlyArray<XZ>,
  topY: number,
  bottomRing: ReadonlyArray<XZ>,
  bottomY: number,
  material: THREE.Material,
): void {
  const n = Math.min(topRing.length, bottomRing.length);
  if (n < 3) return;
  const positions: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = topRing[i]!;
    const b = topRing[j]!;
    const c = bottomRing[i]!;
    const d = bottomRing[j]!;
    // Face up / outward so treads and slopes aren't backface-culled.
    positions.push(
      a[0], topY, a[1],
      d[0], bottomY, d[1],
      c[0], bottomY, c[1],

      a[0], topY, a[1],
      b[0], topY, b[1],
      d[0], bottomY, d[1],
    );
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

/** Concentric risers + treads from the plateau out to the flat. */
function addSteppedEdge(
  scene: THREE.Scene,
  zone: ElevationZone,
  sideMat: THREE.Material,
  treadMat: THREE.Material,
): void {
  const band = edgeBand(zone.height);
  const steps = stepCount(zone.height);
  for (let k = 0; k < steps; k++) {
    const r0 = (band * k) / steps;
    const r1 = (band * (k + 1)) / steps;
    const yTop = PATH_Y + zone.height * (1 - k / steps);
    const yBot = PATH_Y + zone.height * (1 - (k + 1) / steps);
    const ring = offsetOutline(zone.outline, r0);
    const next = offsetOutline(zone.outline, r1);
    addVerticalSkirt(scene, ring, yBot, yTop, sideMat);
    // Flat tread out to the next riser (or the park floor on the last step).
    addRampSkirt(scene, ring, yBot, next, yBot, treadMat);
  }
}

/**
 * Expand (positive) or shrink a closed outline along outward normals.
 * Assumes CCW winding when viewed from above (+Z "north" on the map).
 */
function offsetOutline(outline: ReadonlyArray<XZ>, distance: number): XZ[] {
  const n = outline.length;
  if (n < 3 || Math.abs(distance) < 1e-6) {
    return outline.map((p) => [p[0], p[1]] as XZ);
  }
  const abs = Math.abs(distance);
  const out: XZ[] = [];
  for (let i = 0; i < n; i++) {
    const prev = outline[(i - 1 + n) % n]!;
    const cur = outline[i]!;
    const next = outline[(i + 1) % n]!;
    const e0x = cur[0] - prev[0];
    const e0z = cur[1] - prev[1];
    const e1x = next[0] - cur[0];
    const e1z = next[1] - cur[1];
    const len0 = Math.hypot(e0x, e0z) || 1;
    const len1 = Math.hypot(e1x, e1z) || 1;
    // Outward = right of edge for CCW: (dz, -dx).
    const n0x = e0z / len0;
    const n0z = -e0x / len0;
    const n1x = e1z / len1;
    const n1z = -e1x / len1;
    let nx = n0x + n1x;
    let nz = n0z + n1z;
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl;
    nz /= nl;
    const turn = THREE.MathUtils.clamp(
      (e0x * e1x + e0z * e1z) / (len0 * len1),
      -1,
      1,
    );
    const miter = turn < 0.2 ? 0.85 : 1;
    const dist =
      Math.sign(distance) *
      Math.min(abs * miter, abs * (turn < -0.3 ? 0.75 : 1));
    out.push([cur[0] + nx * dist, cur[1] + nz * dist]);
  }
  return out;
}

function pointInPoly(x: number, z: number, outline: ReadonlyArray<XZ>): boolean {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const xi = outline[i]![0]!;
    const zi = outline[i]![1]!;
    const xj = outline[j]![0]!;
    const zj = outline[j]![1]!;
    const straddles = zi > z !== zj > z;
    if (straddles && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Shortest distance from a point to any edge of a closed polyline. */
function distToPolyEdges(
  x: number,
  z: number,
  outline: ReadonlyArray<XZ>,
): number {
  let best = Infinity;
  const n = outline.length;
  for (let i = 0; i < n; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % n]!;
    best = Math.min(best, distToSegment(x, z, a[0], a[1], b[0], b[1]));
  }
  return best;
}

function distToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-12) return Math.hypot(px - ax, pz - az);
  let t = ((px - ax) * dx + (pz - az) * dz) / lenSq;
  t = THREE.MathUtils.clamp(t, 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
