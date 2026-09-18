import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { waterNormalsTexture } from './waterNormals';
import { DEFAULT_LEVEL } from '../../level/defaultLevel';
import type { XZ } from '../../level/types';
import { groundHeight } from './terrain';
import {
  ROAD_WIDTH,
  distanceToNearestRoad,
  freeSpansAlong,
  roadGapsAlong,
} from './buildings';

/**
 * Canoe Lake: bean / teardrop, SW tip by the Emmanuel Memorial, NE bulb toward
 * the pedalos. One world unit is one metre. +Z inland (St Helens Parade),
 * −Z sea. Shore + path spurs come from the level file / editor.
 */

function computeShore(outline: ReadonlyArray<XZ>): THREE.Vector2[] {
  const curve = new THREE.CatmullRomCurve3(
    outline.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true,
    "catmullrom",
    0.5,
  );
  // Dense enough that offset rings stay smooth on editor curves (~0.65m).
  const count = Math.max(280, Math.min(800, Math.round(curve.getLength() / 0.65)));
  return curve.getSpacedPoints(count).map((p) => new THREE.Vector2(p.x, p.z));
}

/** Smoothed shoreline — rebuilt when a level is applied. */
export let SHORE: ReadonlyArray<THREE.Vector2> = computeShore(
  DEFAULT_LEVEL.shoreOutline,
);

export function isInLake(x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = SHORE.length - 1; i < SHORE.length; j = i++) {
    const a = SHORE[i]!;
    const b = SHORE[j]!;
    const straddles = a.y > z !== b.y > z;
    if (straddles && x < ((b.x - a.x) * (z - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Closest point on the shoreline, used for swans hauling out and for spawns. */
export function nearestShore(x: number, z: number): THREE.Vector2 {
  let best = SHORE[0]!.clone();
  let bestDist = Infinity;
  for (let i = 0, j = SHORE.length - 1; i < SHORE.length; j = i++) {
    const a = SHORE[i]!;
    const b = SHORE[j]!;
    const seg = new THREE.Vector2().subVectors(b, a);
    const len2 = seg.lengthSq();
    const t = len2 === 0 ? 0 : THREE.MathUtils.clamp(((x - a.x) * seg.x + (z - a.y) * seg.y) / len2, 0, 1);
    const point = new THREE.Vector2(a.x + seg.x * t, a.y + seg.y * t);
    const dist = point.distanceToSquared(new THREE.Vector2(x, z));
    if (dist < bestDist) {
      bestDist = dist;
      best = point;
    }
  }
  return best;
}

/**
 * Outward normal at each shoreline point, taken across its neighbours rather
 * than straight out from the middle of the lake. On a shape this long the two
 * are well apart down the sides, and a radial guess leaves the kerb wider at
 * the ends than it is along the front.
 */
function computeShoreNormals(
  shore: ReadonlyArray<THREE.Vector2>,
): THREE.Vector2[] {
  const raw = shore.map((point, i) => {
    const n = shore.length;
    const before = shore[(i - 1 + n) % n]!;
    const after = shore[(i + 1) % n]!;
    const along = new THREE.Vector2().subVectors(after, before);
    const normal = new THREE.Vector2(along.y, -along.x).normalize();
    const probe = point.clone().addScaledVector(normal, 1.5);
    // isInLake reads current SHORE — caller must assign SHORE first.
    if (isInLake(probe.x, probe.y)) normal.negate();
    return normal;
  });

  // Blend neighbours so offset ribbons don't tear on tight bends.
  let cur = raw;
  for (let pass = 0; pass < 2; pass++) {
    cur = cur.map((n, i) => {
      const a = cur[(i - 1 + cur.length) % cur.length]!;
      const b = cur[(i + 1) % cur.length]!;
      const blended = n.clone().add(a).add(b);
      if (blended.lengthSq() < 1e-8) return n.clone();
      return blended.normalize();
    });
  }

  // Keep outward after smoothing.
  return cur.map((n, i) => {
    const point = shore[i]!;
    const probe = point.clone().addScaledVector(n, 1.5);
    if (isInLake(probe.x, probe.y)) n.negate();
    return n;
  });
}

let SHORE_NORMALS: ReadonlyArray<THREE.Vector2> = computeShoreNormals(SHORE);

/** Unit vector pointing away from the water at a given shoreline point. */
export function outwardAt(shorePoint: THREE.Vector2): THREE.Vector2 {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < SHORE.length; i++) {
    const d = shorePoint.distanceToSquared(SHORE[i]!);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return SHORE_NORMALS[best]!.clone();
}

export function distanceToShore(x: number, z: number): number {
  return nearestShore(x, z).distanceTo(new THREE.Vector2(x, z));
}

/**
 * How much a spot sits in the north-west feeding corner (0–1). Bird food and
 * most of the mess cluster here — west bank toward the parade.
 */
export function northwestScore(x: number, z: number): number {
  const cx = -48;
  const cz = 42;
  const dx = (x - cx) / 48;
  const dz = (z - cz) / 42;
  return THREE.MathUtils.clamp(1.05 - Math.hypot(dx, dz), 0, 1);
}

/** Weighted pick of a path-loop index toward the NW corner. */
export function pickNorthwestPathIndex(): number {
  const n = PATH_LOOP.length;
  if (n === 0) return 0;
  let total = 0;
  const weights = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const p = PATH_LOOP[i]!;
    const w = 0.08 + northwestScore(p.x, p.y) ** 2 * 3.2;
    weights[i] = w;
    total += w;
  }
  let pick = Math.random() * total;
  for (let i = 0; i < n; i++) {
    pick -= weights[i]!;
    if (pick <= 0) return i;
  }
  return n - 1;
}

/**
 * How far out from the waterline mess must sit so it isn't buried under the
 * coping. Matches KERB_OUT (0.55) plus splat half-width (~0.55) with a bit extra.
 */
export const RIM_CLEAR = 1.3;

/**
 * Nudge a ground mark off the lake and clear of the kerbstones so it stays
 * visible on the paving / grass.
 */
export function clearOfLakeRim(
  x: number,
  z: number,
  clearance = RIM_CLEAR,
): THREE.Vector2 {
  const shore = nearestShore(x, z);
  const out = outwardAt(shore);
  if (isInLake(x, z) || distanceToShore(x, z) < clearance) {
    return new THREE.Vector2(
      shore.x + out.x * clearance,
      shore.y + out.y * clearance,
    );
  }
  return new THREE.Vector2(x, z);
}

/** Shoreline pushed out (or in, for a negative distance) along the outward normal. */
export function offsetShore(distance: number): THREE.Vector2[] {
  const abs = Math.abs(distance);
  return SHORE.map((p, i) => {
    const n = SHORE.length;
    const out = SHORE_NORMALS[i]!;
    // Soft miter limit: when the local bend is sharp, don't let the offset
    // spike farther than ~2× the requested width (stops ribbon tears).
    const before = SHORE[(i - 1 + n) % n]!;
    const after = SHORE[(i + 1) % n]!;
    const d0 = new THREE.Vector2().subVectors(p, before).normalize();
    const d1 = new THREE.Vector2().subVectors(after, p).normalize();
    const turn = THREE.MathUtils.clamp(d0.dot(d1), -1, 1);
    const miterScale = turn < 0.2 ? 0.85 + 0.15 * Math.max(0, turn + 1) : 1;
    const dist = distance * miterScale;
    // Also clamp absolute offset on hairpin bends.
    const limited =
      Math.sign(dist) * Math.min(Math.abs(dist), abs * (turn < -0.3 ? 0.75 : 1));
    return new THREE.Vector2(p.x + out.x * limited, p.y + out.y * limited);
  });
}

/** A random spot out on open water, kept clear of the bank. */
export function waterSpot(): THREE.Vector2 {
  for (let attempt = 0; attempt < 40; attempt++) {
    const x = -95 + Math.random() * 200;
    const z = -85 + Math.random() * 180;
    if (isInLake(x, z) && distanceToShore(x, z) > 4) return new THREE.Vector2(x, z);
  }
  return new THREE.Vector2(10, 10);
}

function shapeFrom(points: ReadonlyArray<THREE.Vector2>): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i]!.x, points[i]!.y);
  shape.closePath();
  return shape;
}

/**
 * ShapeGeometry is built in XY. Map that onto XZ with Y up — do not use
 * `rotation.x = -π/2`, which mirrors world Z and puts the water over the path
 * on any lake that isn't symmetric about X. Remapping (x,y)→(x,0,z) flips the
 * winding, so each triangle is reversed so the normals still face the sky.
 */
function shapeGeometryXZ(shape: THREE.Shape, curveSegments = 12): THREE.ShapeGeometry {
  const geometry = new THREE.ShapeGeometry(shape, curveSegments);
  const pos = geometry.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getY(i);
    pos.setXYZ(i, x, 0, z);
  }
  pos.needsUpdate = true;

  const index = geometry.index;
  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i + 1);
      const b = index.getX(i + 2);
      index.setX(i + 1, b);
      index.setX(i + 2, a);
    }
    index.needsUpdate = true;
  }

  geometry.computeVertexNormals();
  return geometry;
}

function flatMesh(shape: THREE.Shape, material: THREE.Material, y: number): THREE.Mesh {
  const mesh = new THREE.Mesh(shapeGeometryXZ(shape), material);
  mesh.position.y = y;
  mesh.receiveShadow = true;
  return mesh;
}

/** Paving sits at ground level; the water sits 20cm down inside its wall. */
export const PATH_Y = 0.02;
export const WATER_Y = PATH_Y - 0.2;
/** Flat lake bed under the reflective surface — chest-deep for a wading adult. */
export const LAKE_BED_Y = WATER_Y - 0.9;
const BED_Y = LAKE_BED_Y;

/**
 * Boot height when standing in the lake. Ramps from the kerb down to the bed
 * over the first couple of metres so stepping in isn't a cliff.
 */
export function wadeFootY(x: number, z: number): number {
  if (!isInLake(x, z)) return PATH_Y;
  const t = THREE.MathUtils.clamp(distanceToShore(x, z) / 2, 0, 1);
  const ease = t * t * (3 - 2 * t);
  return THREE.MathUtils.lerp(PATH_Y - 0.08, BED_Y, ease);
}

/**
 * The coping: a run of pale kerbstones capping the lake wall all the way
 * round, sat a little proud of the paving. It's what stops the water reading
 * as a shape painted on the ground.
 */
export const KERB_OUT = 0.55;
const KERB_IN = 0.25;
export const KERB_Y = PATH_Y + 0.11;

/** Waterline in the shade of the wall, where the stone stays damp and green. */
const TIDE_Y = WATER_Y + 0.05;

/**
 * A skirt of triangles hung between two rings of points, one height per ring.
 * Both rings run the same way round the lake, so a segment is two triangles.
 */
function skirt(
  top: ReadonlyArray<THREE.Vector2>,
  topY: number,
  bottom: ReadonlyArray<THREE.Vector2>,
  bottomY: number,
  material: THREE.Material,
): THREE.Mesh {
  const positions: number[] = [];
  for (let i = 0; i < top.length; i++) {
    const j = (i + 1) % top.length;
    const a = top[i]!;
    const b = top[j]!;
    const c = bottom[i]!;
    const d = bottom[j]!;
    positions.push(
      a.x, topY, a.y,
      c.x, bottomY, c.y,
      d.x, bottomY, d.y,

      a.x, topY, a.y,
      d.x, bottomY, d.y,
      b.x, topY, b.y,
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

/** Flat strip of quads between two rings — same winding as `ribbon`. */
function ribbonGeometry(
  outer: ReadonlyArray<THREE.Vector2>,
  inner: ReadonlyArray<THREE.Vector2>,
): THREE.BufferGeometry {
  const positions: number[] = [];
  for (let i = 0; i < outer.length; i++) {
    const j = (i + 1) % outer.length;
    const a = outer[i]!;
    const b = outer[j]!;
    const c = inner[j]!;
    const d = inner[i]!;
    const ya = groundHeight(a.x, a.y);
    const yb = groundHeight(b.x, b.y);
    const yc = groundHeight(c.x, c.y);
    const yd = groundHeight(d.x, d.y);
    positions.push(
      a.x, ya, a.y,
      d.x, yd, d.y,
      c.x, yc, c.y,

      a.x, ya, a.y,
      c.x, yc, c.y,
      b.x, yb, b.y,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Ray-cast point-in-polygon on an XZ ring (y of Vector2 is world Z). */
function pointInRing(
  x: number,
  z: number,
  ring: ReadonlyArray<THREE.Vector2>,
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    const straddles = a.y > z !== b.y > z;
    if (straddles && x < ((b.x - a.x) * (z - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Fill a lake ring as one triangulated polygon. Onion rims + a coarse grid
 * used to z-fight under the Water mirror and read as a broken surface.
 */
function lakeFillGeometry(edge: ReadonlyArray<THREE.Vector2>): THREE.BufferGeometry {
  // Dense edge → ShapeGeometry/earcut. Fall back to a rim + fine interior grid
  // only if earcut leaves nothing usable.
  const shape = shapeFrom(edge);
  const shaped = shapeGeometryXZ(shape, 3);
  if (shaped.getAttribute("position") && shaped.getAttribute("position")!.count >= 9) {
    return shaped;
  }

  const core = offsetShore(-(KERB_IN + 1.5));
  const rim = ribbonGeometry(edge, core);

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of core) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.y);
    maxZ = Math.max(maxZ, p.y);
  }

  const step = 0.45;
  const positions: number[] = [];
  const inside = (x: number, z: number) => pointInRing(x, z, core);

  for (let x = minX; x < maxX; x += step) {
    for (let z = minZ; z < maxZ; z += step) {
      const x1 = x + step;
      const z1 = z + step;
      if (inside((x + 2 * x1) / 3, (2 * z + z1) / 3)) {
        positions.push(x, 0, z, x1, 0, z1, x1, 0, z);
      }
      if (inside((2 * x + x1) / 3, (z + 2 * z1) / 3)) {
        positions.push(x, 0, z, x, 0, z1, x1, 0, z1);
      }
    }
  }

  const coreGeom = new THREE.BufferGeometry();
  coreGeom.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  coreGeom.computeVertexNormals();

  return mergeGeometries([rim, coreGeom], false) ?? rim;
}

/**
 * Three's Water mirror treats local +Z as the surface normal (PlaneGeometry +
 * rotation.x = −π/2). Our lake fill is already in XZ — remap to XY with
 * Y = −Z so that rotation lands on the real shoreline without flipping it.
 */
function waterMirrorGeometry(xzFill: THREE.BufferGeometry): THREE.BufferGeometry {
  const geo = xzFill.clone();
  const pos = geo.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setXYZ(i, x, -z, 0);
  }
  pos.needsUpdate = true;

  const index = geo.index;
  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i + 1);
      const b = index.getX(i + 2);
      index.setX(i + 1, b);
      index.setX(i + 2, a);
    }
    index.needsUpdate = true;
  } else {
    // Non-indexed grid fallback — swap every second and third vertex.
    const next = new Float32Array(pos.array.length);
    for (let i = 0; i < pos.count; i += 3) {
      const ax = pos.getX(i);
      const ay = pos.getY(i);
      const az = pos.getZ(i);
      const bx = pos.getX(i + 1);
      const by = pos.getY(i + 1);
      const bz = pos.getZ(i + 1);
      const cx = pos.getX(i + 2);
      const cy = pos.getY(i + 2);
      const cz = pos.getZ(i + 2);
      const o = i * 3;
      next[o] = ax;
      next[o + 1] = ay;
      next[o + 2] = az;
      next[o + 3] = cx;
      next[o + 4] = cy;
      next[o + 5] = cz;
      next[o + 6] = bx;
      next[o + 7] = by;
      next[o + 8] = bz;
    }
    geo.setAttribute("position", new THREE.Float32BufferAttribute(next, 3));
  }

  geo.computeVertexNormals();
  return geo;
}

/** A flat ring of ground between two rings of points, at one height. */
function ribbon(
  outer: ReadonlyArray<THREE.Vector2>,
  inner: ReadonlyArray<THREE.Vector2>,
  y: number,
  material: THREE.Material,
): THREE.Mesh {
  // Strip of quads, not a Shape with a hole — earcut on a thin teardrop ring
  // will happily throw triangles across the water and the paving.
  const mesh = new THREE.Mesh(ribbonGeometry(outer, inner), material);
  mesh.position.y = y;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * The tops of the kerbstones, laid one per shoreline segment so the joints
 * show. Each stone is weathered a shade differently from its neighbours.
 */
function buildCoping(
  outer: ReadonlyArray<THREE.Vector2>,
  inner: ReadonlyArray<THREE.Vector2>,
): THREE.Mesh {
  const positions: number[] = [];
  const colours: number[] = [];
  const tone = new THREE.Color();

  for (let i = 0; i < outer.length; i++) {
    const j = (i + 1) % outer.length;
    const a = outer[i]!;
    const b = outer[j]!;
    const c = inner[j]!;
    const d = inner[i]!;
    positions.push(
      a.x, KERB_Y, a.y,
      d.x, KERB_Y, d.y,
      c.x, KERB_Y, c.y,

      a.x, KERB_Y, a.y,
      c.x, KERB_Y, c.y,
      b.x, KERB_Y, b.y,
    );

    // Alternating with a bit of drift, so the run doesn't read as stripes.
    const shade = 0.9 + (i % 2) * 0.1 + Math.sin(i * 2.4) * 0.035;
    tone.setHex(0xcfc9b8).multiplyScalar(shade);
    for (let v = 0; v < 6; v++) colours.push(tone.r, tone.g, tone.b);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
  );
  mesh.receiveShadow = true;
  return mesh;
}

/** The kerbstones, the wall face under them and the green tide line. */
function buildLakeWall(scene: THREE.Scene): void {
  // The little face onto the paving is kept dark: that shadow line is what
  // makes the coping read as something you'd stub your boot on.
  const lip = new THREE.MeshStandardMaterial({ color: 0x7d7768, roughness: 1 });
  const face = new THREE.MeshStandardMaterial({ color: 0x9a9384, roughness: 1 });
  const damp = new THREE.MeshStandardMaterial({ color: 0x4a5442, roughness: 1 });

  const outer = offsetShore(KERB_OUT);
  const inner = offsetShore(-KERB_IN);

  scene.add(buildCoping(outer, inner));
  scene.add(skirt(outer, KERB_Y, outer, PATH_Y, lip));
  scene.add(skirt(inner, KERB_Y, inner, TIDE_Y, face));
  scene.add(skirt(inner, TIDE_Y, inner, BED_Y, damp));
}

/**
 * Shallow water round the rim, weeded and dark, so the edge doesn't come to a
 * flat stop against the wall.
 */
function buildMargin(scene: THREE.Scene): void {
  scene.add(
    ribbon(
      offsetShore(-KERB_IN),
      offsetShore(-1.2),
      WATER_Y + 0.006,
      new THREE.MeshStandardMaterial({
        color: 0x2f5a4e,
        roughness: 1,
        transparent: true,
        opacity: 0.4,
      }),
    ),
  );
}

/**
 * The park's grass, with the lake cut out of it. Without the hole the ground
 * would simply cap over the water now that it sits below path level.
 */
export function buildGround(scene: THREE.Scene, size: number): THREE.Mesh {
  const half = size / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-half, -half);
  shape.lineTo(half, -half);
  shape.lineTo(half, half);
  shape.lineTo(-half, half);
  shape.closePath();
  shape.holes.push(shapeFrom(SHORE));

  const ground = flatMesh(
    shape,
    new THREE.MeshStandardMaterial({ color: 0x4a7c4e, roughness: 1 }),
    0,
  );
  scene.add(ground);
  return ground;
}

/** Keeps the reflective surface in step with the sun. */
export interface LakeSurface {
  update(
    delta: number,
    sunDirection: THREE.Vector3,
    sunColor: THREE.Color,
    wind: THREE.Vector2,
  ): void;
}

/** Water surface, its retaining wall and the bed beneath. */
export function buildLake(scene: THREE.Scene): LakeSurface {
  buildLakeWall(scene);

  // Keep the reflective surface inside the wall so it never paints over the
  // paving — the collision shore stays at SHORE, a touch further out.
  const waterEdge = offsetShore(-KERB_IN);
  // ShapeGeometry/earcut leaves holes on this bean — fill with a rim + grid.
  const fill = lakeFillGeometry(waterEdge);

  const bed = new THREE.Mesh(
    fill.clone(),
    new THREE.MeshStandardMaterial({ color: 0x2f3d30, roughness: 1 }),
  );
  bed.position.y = BED_Y;
  bed.receiveShadow = true;
  scene.add(bed);

  // Solid body of the lake — always readable even if the mirror pass is thin.
  const body = new THREE.Mesh(
    fill.clone(),
    new THREE.MeshStandardMaterial({
      color: 0x243f38,
      roughness: 0.28,
      metalness: 0.08,
      transparent: true,
      opacity: 0.92,
      depthWrite: true,
    }),
  );
  body.position.y = WATER_Y - 0.015;
  body.receiveShadow = true;
  scene.add(body);

  // Water.js mirrors across local +Z — use XY geometry + −90° X so that axis
  // is world up. (Plain XZ fill leaves the mirror vertical and reflects the
  // far bank onto the near one.)
  const water = new Water(waterMirrorGeometry(fill), {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: waterNormalsTexture(),
    sunDirection: new THREE.Vector3(0.4, 0.8, 0.2).normalize(),
    sunColor: 0xffffff,
    // Darker, greener pond water — less swimming-pool teal.
    waterColor: 0x2a5348,
    distortionScale: 0.35,
    fog: true,
    alpha: 1,
  });
  // World-space ripple scale — a bit coarser reads cleaner on a large lake.
  const waterMat = water.material as THREE.ShaderMaterial;
  waterMat.uniforms["size"]!.value = 1.15;
  waterMat.transparent = false;
  waterMat.depthWrite = true;
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_Y;
  scene.add(water);

  buildMargin(scene);

  return {
    update(delta, sunDirection, sunColor, wind) {
      const uniforms = waterMat.uniforms;
      const mag = Math.hypot(wind.x, wind.y);
      // Still when the air is calm; ripples only pick up with a proper breeze.
      const breeze = THREE.MathUtils.smoothstep(mag, 0.6, 4.2);
      uniforms["time"]!.value += delta * (0.15 + breeze * 0.85);
      uniforms["distortionScale"]!.value = 0.22 + breeze * 1.2;
      uniforms["sunDirection"]!.value.copy(sunDirection).normalize();
      uniforms["sunColor"]!.value.copy(sunColor);
    },
  };
}

/**
 * The perimeter path: a closed ring following the shoreline, never crossing the
 * water. Extra routes match the map — east-lawn triangle (play park), esplanade
 * run, and the spurs out to the gates.
 */
/** Paving starts at the kerb — not under the water surface. */
export const PATH_INNER = KERB_OUT;
export const PATH_OUTER = 14;

/** Centre line of the perimeter path, which the strolling public follow. */
export let PATH_LOOP: ReadonlyArray<THREE.Vector2> = offsetShore(
  (PATH_INNER + PATH_OUTER) / 2,
);

/** A paved spur / path segment from A to B. */
export interface PathSpurSeg {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  length: number;
  yaw: number;
  mx: number;
  mz: number;
}

function segmentFrom(
  ax: number,
  az: number,
  bx: number,
  bz: number,
): PathSpurSeg {
  const dx = bx - ax;
  const dz = bz - az;
  const length = Math.max(2, Math.hypot(dx, dz));
  return {
    ax,
    az,
    bx,
    bz,
    length,
    yaw: Math.atan2(dz, dx),
    mx: (ax + bx) / 2,
    mz: (az + bz) / 2,
  };
}

function computePathSpurs(
  polylines: ReadonlyArray<ReadonlyArray<XZ>>,
): PathSpurSeg[] {
  return polylines.flatMap((line) => {
    const segs: PathSpurSeg[] = [];
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i]!;
      const b = line[i + 1]!;
      segs.push(segmentFrom(a[0], a[1], b[0], b[1]));
    }
    return segs;
  });
}

/**
 * Spurs and field paths from the level. Shared with fencing (gates), planting,
 * puddles and the mini map.
 */
export let PATH_SPURS: ReadonlyArray<PathSpurSeg> = computePathSpurs(
  DEFAULT_LEVEL.pathPolylines,
);

/** Author polylines — used to mesh continuous strips (not broken at bends). */
let PATH_POLYLINES: ReadonlyArray<ReadonlyArray<XZ>> = DEFAULT_LEVEL.pathPolylines;

/** Rebuild shore, path loop and spurs from level data (before the scene builds). */
export function applyLakeLevel(
  shoreOutline: ReadonlyArray<XZ>,
  pathPolylines: ReadonlyArray<ReadonlyArray<XZ>>,
): void {
  SHORE = computeShore(shoreOutline);
  SHORE_NORMALS = computeShoreNormals(SHORE);
  PATH_LOOP = offsetShore((PATH_INNER + PATH_OUTER) / 2);
  PATH_POLYLINES = pathPolylines;
  PATH_SPURS = computePathSpurs(pathPolylines);
}

/** True if (x,z) lies on a spur corridor (not on parade tarmac). */
function onSpurPaving(x: number, z: number, halfWidth: number): boolean {
  if (distanceToNearestRoad(x, z) < ROAD_WIDTH * 0.5) return false;
  for (const spur of PATH_SPURS) {
    const abx = spur.bx - spur.ax;
    const abz = spur.bz - spur.az;
    const len2 = abx * abx + abz * abz;
    if (len2 < 1e-6) continue;
    let t = ((x - spur.ax) * abx + (z - spur.az) * abz) / len2;
    t = THREE.MathUtils.clamp(t, 0, 1);
    const px = spur.ax + t * abx;
    const pz = spur.az + t * abz;
    if (Math.hypot(x - px, z - pz) < halfWidth) return true;
  }
  return false;
}

/** True on the ring path or a spur — anywhere the jet leaves a puddle. */
export function isOnPath(x: number, z: number): boolean {
  if (isInLake(x, z)) return false;
  const d = distanceToShore(x, z);
  if (d <= PATH_OUTER + 0.35) return true;
  return onSpurPaving(x, z, 2.2);
}

/** Spur rectangles for the mini map — same layout as `buildPaths`. */
/** Half-width of authored spur / path polylines (full strip = 4 m). */
export const PATH_STRIP_HALF = 2;
/** Full width of authored path polylines in metres. */
export const PATH_STRIP_WIDTH = PATH_STRIP_HALF * 2;

export interface PathSpur {
  x: number;
  z: number;
  length: number;
  width: number;
  /** Facing along the spur, away from the lake. */
  yaw: number;
}

export function pathSpurs(): PathSpur[] {
  return PATH_SPURS.map((spur) => ({
    x: spur.mx,
    z: spur.mz,
    length: spur.length,
    width: PATH_STRIP_WIDTH,
    yaw: spur.yaw,
  }));
}

/** Author path polylines in world XZ — for spawn / van placement. */
export function pathPolylines(): ReadonlyArray<ReadonlyArray<{ x: number; z: number }>> {
  return PATH_POLYLINES.map((line) =>
    line.map(([x, z]) => ({ x, z })),
  );
}

/**
 * Continuous paved strip along an open polyline with mitered joins — avoids
 * the triangular gaps you get from butting separate segment rectangles.
 */
function openPolylineStripGeometry(
  points: ReadonlyArray<THREE.Vector2>,
  halfWidth: number,
): THREE.BufferGeometry | null {
  if (points.length < 2) return null;
  const n = points.length;
  const left: THREE.Vector2[] = [];
  const right: THREE.Vector2[] = [];

  for (let i = 0; i < n; i++) {
    const curr = points[i]!;
    let n0: THREE.Vector2;
    let n1: THREE.Vector2;
    if (i === 0) {
      const dir = new THREE.Vector2().subVectors(points[1]!, curr).normalize();
      n0 = new THREE.Vector2(-dir.y, dir.x);
      n1 = n0;
    } else if (i === n - 1) {
      const dir = new THREE.Vector2()
        .subVectors(curr, points[n - 2]!)
        .normalize();
      n0 = new THREE.Vector2(-dir.y, dir.x);
      n1 = n0;
    } else {
      const d0 = new THREE.Vector2()
        .subVectors(curr, points[i - 1]!)
        .normalize();
      const d1 = new THREE.Vector2()
        .subVectors(points[i + 1]!, curr)
        .normalize();
      n0 = new THREE.Vector2(-d0.y, d0.x);
      n1 = new THREE.Vector2(-d1.y, d1.x);
    }

    let miter = n0.clone().add(n1);
    if (miter.lengthSq() < 1e-8) miter = n0.clone();
    else miter.normalize();
    // Keep strip width under the miter; clamp so hairpins don't explode.
    const cos = Math.max(0.4, Math.abs(miter.dot(n0)));
    miter.multiplyScalar(halfWidth / cos);

    left.push(curr.clone().add(miter));
    right.push(curr.clone().sub(miter));
  }

    const positions: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = left[i]!;
    const b = left[i + 1]!;
    const c = right[i + 1]!;
    const d = right[i]!;
    const ya = groundHeight(a.x, a.y);
    const yb = groundHeight(b.x, b.y);
    const yc = groundHeight(c.x, c.y);
    const yd = groundHeight(d.x, d.y);
    // Winding faces +Y so the strip is visible from above.
    positions.push(
      a.x, ya, a.y,
      b.x, yb, b.y,
      c.x, yc, c.y,

      a.x, ya, a.y,
      c.x, yc, c.y,
      d.x, yd, d.y,
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();
  return geometry;
}

export function buildPaths(scene: THREE.Scene): void {
  // Park tarmac — asphalt like the roads, but clearly lighter.
  const paving = new THREE.MeshStandardMaterial({
    color: 0xb4b4ba,
    roughness: 0.92,
  });

  scene.add(ribbon(offsetShore(PATH_OUTER), offsetShore(PATH_INNER), PATH_Y, paving));

  for (const piece of pathPolylinesSplitAtRoads(PATH_POLYLINES)) {
    if (piece.length < 2) continue;
    const pts = piece.map(([x, z]) => new THREE.Vector2(x, z));
    const geom = openPolylineStripGeometry(pts, PATH_STRIP_HALF);
    if (!geom) continue;
    const mesh = new THREE.Mesh(geom, paving);
    // Slightly above the ring so joins read cleanly over the grass.
    mesh.position.y = PATH_Y + 0.002;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

/**
 * Break authored path polylines wherever they cross a parade road so the
 * paving leaves a clear gap for the tarmac.
 */
function pathPolylinesSplitAtRoads(
  polylines: ReadonlyArray<ReadonlyArray<XZ>>,
): XZ[][] {
  const clearance = ROAD_WIDTH * 0.5 + 0.6;
  const out: XZ[][] = [];

  for (const line of polylines) {
    if (line.length < 2) continue;
    let current: XZ[] = [];

    const startPiece = (p: XZ) => {
      current = [p];
    };
    const addPoint = (p: XZ) => {
      const last = current[current.length - 1];
      if (
        last &&
        Math.hypot(last[0] - p[0], last[1] - p[1]) < 0.04
      ) {
        return;
      }
      current.push(p);
    };
    const closePiece = () => {
      if (current.length >= 2) out.push(current);
      current = [];
    };

    startPiece(line[0]!);

    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i]!;
      const b = line[i + 1]!;
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 1e-4) continue;
      const ux = dx / len;
      const uz = dz / len;
      const gaps = roadGapsAlong(a[0], a[1], b[0], b[1], clearance);
      const spans = freeSpansAlong(len, gaps, 1.2);

      if (spans.length === 0) {
        closePiece();
        startPiece(b);
        continue;
      }

      for (let s = 0; s < spans.length; s++) {
        const [s0, s1] = spans[s]!;
        const start: XZ = [a[0] + ux * s0, a[1] + uz * s0];
        const end: XZ = [a[0] + ux * s1, a[1] + uz * s1];

        if (current.length === 0) startPiece(start);
        else if (s0 > 0.35) {
          // Gap between previous span / vertex and this one.
          closePiece();
          startPiece(start);
        }

        addPoint(end);

        const reachesEnd = s1 >= len - 0.35;
        const moreSpans = s < spans.length - 1;
        if (moreSpans || !reachesEnd) {
          closePiece();
        }
      }

      if (current.length === 0) startPiece(b);
      else addPoint(b);
    }

    closePiece();
  }

  return out;
}

/** Position along the path loop. Fractional indices slide between points. */
export function loopPoint(index: number): THREE.Vector2 {
  const n = PATH_LOOP.length;
  const wrapped = ((index % n) + n) % n;
  const first = Math.floor(wrapped);
  const here = PATH_LOOP[first]!;
  const next = PATH_LOOP[(first + 1) % n]!;
  return here.clone().lerp(next, wrapped - first);
}
