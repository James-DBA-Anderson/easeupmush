import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { waterNormalsTexture } from './waterNormals';
import { DEFAULT_LEVEL } from '../../level/defaultLevel';
import type { XZ } from '../../level/types';

/**
 * Canoe Lake: bean / teardrop, SW tip by the Emmanuel Memorial, NE bulb toward
 * the pedalos. One world unit is one metre. +Z inland (St Helens Parade),
 * −Z sea. Shore + path spurs come from the level file / editor.
 */

function computeShore(outline: ReadonlyArray<XZ>): THREE.Vector2[] {
  const curve = new THREE.CatmullRomCurve3(
    outline.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true,
    'catmullrom',
    0.5,
  );
  return curve.getSpacedPoints(180).map((p) => new THREE.Vector2(p.x, p.z));
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
  return shore.map((point, i) => {
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

/** Shoreline pushed out (or in, for a negative distance) along the outward normal. */
export function offsetShore(distance: number): THREE.Vector2[] {
  return SHORE.map((p, i) => {
    const out = SHORE_NORMALS[i]!;
    return new THREE.Vector2(p.x + out.x * distance, p.y + out.y * distance);
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
const BED_Y = WATER_Y - 0.9;

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
    positions.push(
      a.x, 0, a.y,
      d.x, 0, d.y,
      c.x, 0, c.y,

      a.x, 0, a.y,
      c.x, 0, c.y,
      b.x, 0, b.y,
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
 * Fill a lake ring without ShapeGeometry/earcut — that leaves holes on the
 * concave bean. A rim of quads seals the edge; a grid fills the middle.
 */
function lakeFillGeometry(edge: ReadonlyArray<THREE.Vector2>): THREE.BufferGeometry {
  // A few metres in — wide enough that the rim covers earcut's usual failure
  // band, narrow enough the tip still has a core after the offset.
  const core = offsetShore(-(KERB_IN + 4));
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

  const step = 1.4;
  const positions: number[] = [];
  const inside = (x: number, z: number) => pointInRing(x, z, core);

  for (let x = minX; x < maxX; x += step) {
    for (let z = minZ; z < maxZ; z += step) {
      const x1 = x + step;
      const z1 = z + step;
      // Keep a triangle when its centroid is in the water — covers the core
      // without the holes earcut leaves near reflex corners. Winding faces +Y.
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
        color: 0x3f7a76,
        roughness: 1,
        transparent: true,
        opacity: 0.35,
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
  update(delta: number, sunDirection: THREE.Vector3, sunColor: THREE.Color): void;
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
    new THREE.MeshStandardMaterial({ color: 0x3d4a3c, roughness: 1 }),
  );
  bed.position.y = BED_Y;
  bed.receiveShadow = true;
  scene.add(bed);

  const water = new Water(fill, {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: waterNormalsTexture(),
    sunDirection: new THREE.Vector3(0.4, 0.8, 0.2).normalize(),
    sunColor: 0xffffff,
    waterColor: 0x4a8f9c,
    distortionScale: 2.8,
    fog: true,
    alpha: 0.95,
  });
  // The Water shader expects size as a uniform; smaller = finer lake ripples.
  (water.material as THREE.ShaderMaterial).uniforms["size"]!.value = 2.4;
  water.position.y = WATER_Y;
  scene.add(water);

  buildMargin(scene);

  return {
    update(delta, sunDirection, sunColor) {
      const uniforms = (water.material as THREE.ShaderMaterial).uniforms;
      uniforms["time"]!.value += delta;
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

/** Rebuild shore, path loop and spurs from level data (before the scene builds). */
export function applyLakeLevel(
  shoreOutline: ReadonlyArray<XZ>,
  pathPolylines: ReadonlyArray<ReadonlyArray<XZ>>,
): void {
  SHORE = computeShore(shoreOutline);
  SHORE_NORMALS = computeShoreNormals(SHORE);
  PATH_LOOP = offsetShore((PATH_INNER + PATH_OUTER) / 2);
  PATH_SPURS = computePathSpurs(pathPolylines);
}

/** True if (x,z) lies on a spur corridor. */
function onSpurPaving(x: number, z: number, halfWidth: number): boolean {
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
    width: 4,
    yaw: spur.yaw,
  }));
}

export function buildPaths(scene: THREE.Scene): void {
  const paving = new THREE.MeshStandardMaterial({ color: 0xa8a294, roughness: 0.95 });

  scene.add(ribbon(offsetShore(PATH_OUTER), offsetShore(PATH_INNER), PATH_Y, paving));

  for (const spur of PATH_SPURS) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4, spur.length), paving);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = -spur.yaw + Math.PI / 2;
    mesh.position.set(spur.mx, PATH_Y - 0.004, spur.mz);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
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
