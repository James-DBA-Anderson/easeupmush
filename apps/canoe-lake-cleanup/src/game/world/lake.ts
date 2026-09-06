import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { waterNormalsTexture } from './waterNormals';

/**
 * Canoe Lake traced from the real plan: a teardrop boating lake with its long
 * axis running south-west to north-east. The pointed tip sits toward the Ocean
 * Hotel junction; the rounded bulb (where the pedalos moor) faces the north-
 * east. The south-east flank is the straighter run, nearly parallel to Eastney
 * Esplanade and the beach beyond.
 *
 * One world unit is one metre. +Z is inland (St Helens Parade), −Z is the sea.
 */
const OUTLINE: ReadonlyArray<readonly [number, number]> = [
  // Tip (SW), then the straighter SE flank toward the esplanade…
  [-93, -75],
  [-75, -86],
  [-50, -90],
  [-23, -84],
  [8, -67],
  [41, -44],
  [70, -16],
  [93, 11],
  [102, 39],
  // …NE bulb where the boats sit, then the bowed NW side back to the tip.
  [98, 66],
  [83, 88],
  [59, 100],
  [33, 96],
  [2, 78],
  [-28, 52],
  [-56, 23],
  [-77, -7],
  [-92, -36],
  [-96, -59],
];

/** Smoothed shoreline, sampled once and shared by the mesh and the maths. */
export const SHORE: ReadonlyArray<THREE.Vector2> = (() => {
  const curve = new THREE.CatmullRomCurve3(
    OUTLINE.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true,
    'catmullrom',
    0.5,
  );
  return curve.getSpacedPoints(180).map((p) => new THREE.Vector2(p.x, p.z));
})();

/** The island in the southern half of the water, where the swans nest out of reach. */
export const ISLAND = { x: 8, z: -28, radius: 9 } as const;

export function isInLake(x: number, z: number): boolean {
  if (Math.hypot(x - ISLAND.x, z - ISLAND.z) < ISLAND.radius) return false;
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
const SHORE_NORMALS: ReadonlyArray<THREE.Vector2> = SHORE.map((point, i) => {
  const n = SHORE.length;
  const before = SHORE[(i - 1 + n) % n]!;
  const after = SHORE[(i + 1) % n]!;
  const along = new THREE.Vector2().subVectors(after, before);
  const normal = new THREE.Vector2(along.y, -along.x).normalize();
  // Probe a step along the normal — if that land is still water, flip it.
  const probe = point.clone().addScaledVector(normal, 1.5);
  if (isInLake(probe.x, probe.y)) normal.negate();
  return normal;
});

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

/** A random spot out on open water, kept clear of the bank and the island. */
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

/** A flat ring of ground between two rings of points, at one height. */
function ribbon(
  outer: ReadonlyArray<THREE.Vector2>,
  inner: ReadonlyArray<THREE.Vector2>,
  y: number,
  material: THREE.Material,
): THREE.Mesh {
  // Strip of quads, not a Shape with a hole — earcut on a thin teardrop ring
  // will happily throw triangles across the water and the paving.
  const positions: number[] = [];
  for (let i = 0; i < outer.length; i++) {
    const j = (i + 1) % outer.length;
    const a = outer[i]!;
    const b = outer[j]!;
    const c = inner[j]!;
    const d = inner[i]!;
    positions.push(
      a.x, y, a.y,
      d.x, y, d.y,
      c.x, y, c.y,

      a.x, y, a.y,
      c.x, y, c.y,
      b.x, y, b.y,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
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

/** Water surface, its retaining wall, the bed beneath and the island. */
export function buildLake(scene: THREE.Scene): LakeSurface {
  buildLakeWall(scene);

  // Keep the reflective surface inside the wall so it never paints over the
  // paving — the collision shore stays at SHORE, a touch further out.
  const waterEdge = offsetShore(-KERB_IN);

  scene.add(
    flatMesh(
      shapeFrom(waterEdge),
      new THREE.MeshStandardMaterial({ color: 0x3d4a3c, roughness: 1 }),
      BED_Y,
    ),
  );

  const water = new Water(shapeGeometryXZ(shapeFrom(waterEdge), 16), {
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

  const islandTop = WATER_Y + 0.5;
  const island = new THREE.Mesh(
    new THREE.CylinderGeometry(ISLAND.radius, ISLAND.radius + 1.2, islandTop - BED_Y, 24),
    new THREE.MeshStandardMaterial({ color: 0x4e7a44, roughness: 1 }),
  );
  island.position.set(ISLAND.x, (islandTop + BED_Y) / 2, ISLAND.z);
  island.castShadow = true;
  island.receiveShadow = true;
  scene.add(island);

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
 * water. Spurs run outwards from it to the park edges.
 */
/** Paving starts at the kerb — not under the water surface. */
export const PATH_INNER = KERB_OUT;
export const PATH_OUTER = 14;

/** Centre line of the perimeter path, which the strolling public follow. */
export const PATH_LOOP: ReadonlyArray<THREE.Vector2> = offsetShore((PATH_INNER + PATH_OUTER) / 2);

/**
 * Spurs running out from the lake to the park edges / gates. Shared with the
 * fencing so the gate openings line up with the paving. Directions follow the
 * real exits: esplanade south, St Helens west, parade north, east green and
 * the diagonal across to the car park / splash.
 */
export const PATH_SPURS: ReadonlyArray<readonly [number, number]> = [
  [0.1, -1],
  [-1, 0.05],
  [-0.15, 1],
  [1, 0.35],
  [0.85, -0.5],
  [-0.7, -0.7],
  [0.45, 0.9],
];

/** True on the ring path or a spur — anywhere the jet leaves a puddle. */
export function isOnPath(x: number, z: number): boolean {
  if (isInLake(x, z)) return false;
  const d = distanceToShore(x, z);
  if (d <= PATH_OUTER + 0.35) return true;

  // Spur corridors continue out past the ring.
  const pos = new THREE.Vector2(x, z);
  for (const [dx, dz] of PATH_SPURS) {
    const dir = new THREE.Vector2(dx, dz).normalize();
    const along = pos.dot(dir);
    if (along < PATH_OUTER - 2) continue;
    const sideways = Math.abs(pos.x * -dir.y + pos.y * dir.x);
    if (sideways < 2.2) return true;
  }
  return false;
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
  const out: PathSpur[] = [];
  for (const [dx, dz] of PATH_SPURS) {
    const dir = new THREE.Vector2(dx, dz).normalize();
    let from = 0;
    for (let d = 0; d < 200; d += 1) {
      const p = dir.clone().multiplyScalar(d);
      if (!isInLake(p.x, p.y) && distanceToShore(p.x, p.y) > PATH_OUTER - 1) {
        from = d;
        break;
      }
    }
    // Stop short of the iron railings rather than paving over the roads.
    const length = Math.max(12, 100 - from);
    const mid = dir.clone().multiplyScalar(from + length / 2);
    out.push({
      x: mid.x,
      z: mid.y,
      length,
      width: 4,
      yaw: Math.atan2(dir.y, dir.x),
    });
  }
  return out;
}

export function buildPaths(scene: THREE.Scene): void {
  const paving = new THREE.MeshStandardMaterial({ color: 0xa8a294, roughness: 0.95 });

  scene.add(ribbon(offsetShore(PATH_OUTER), offsetShore(PATH_INNER), PATH_Y, paving));

  // Spurs head away from the lake, so none of them can cut across the water.
  for (const [dx, dz] of PATH_SPURS) {
    const dir = new THREE.Vector2(dx, dz).normalize();
    const start = new THREE.Vector2(dir.x, dir.y).multiplyScalar(1);
    // Walk outwards from the lake centre until clear of the ring, then run on.
    let from = 0;
    for (let d = 0; d < 200; d += 1) {
      const p = start.clone().multiplyScalar(d);
      if (!isInLake(p.x, p.y) && distanceToShore(p.x, p.y) > PATH_OUTER - 1) {
        from = d;
        break;
      }
    }
    const length = Math.max(12, 100 - from);
    const mid = start.clone().multiplyScalar(from + length / 2);
    const spur = new THREE.Mesh(new THREE.PlaneGeometry(4, length), paving);
    spur.rotation.x = -Math.PI / 2;
    spur.rotation.z = -Math.atan2(dir.y, dir.x) + Math.PI / 2;
    spur.position.set(mid.x, PATH_Y - 0.004, mid.y);
    spur.receiveShadow = true;
    scene.add(spur);
  }
}

/** Position along the perimeter loop, wrapping at the ends. */
/** Position along the path loop. Fractional indices slide between points. */
export function loopPoint(index: number): THREE.Vector2 {
  const n = PATH_LOOP.length;
  const wrapped = ((index % n) + n) % n;
  const first = Math.floor(wrapped);
  const here = PATH_LOOP[first]!;
  const next = PATH_LOOP[(first + 1) % n]!;
  return here.clone().lerp(next, wrapped - first);
}
