import * as THREE from 'three';

/**
 * Canoe Lake traced from the real thing: a long Victorian boating lake running
 * roughly WSW-ENE parallel to the seafront, about 230m by 105m. Rounded at the
 * western end, squarer at the east where the boat jetty sits.
 *
 * One world unit is one metre. X is the long axis, Z is across the lake.
 */
const OUTLINE: ReadonlyArray<readonly [number, number]> = [
  [-114, -6],
  [-111, -24],
  [-100, -38],
  [-82, -46],
  [-56, -50],
  [-24, -52],
  [10, -52],
  [44, -50],
  [72, -47],
  [94, -43],
  [108, -38],
  [113, -28],
  [114, -12],
  [113, 6],
  [110, 24],
  [102, 36],
  [86, 43],
  [60, 48],
  [26, 51],
  [-10, 52],
  [-46, 51],
  [-76, 47],
  [-97, 39],
  [-109, 26],
  [-114, 10],
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

/** The island near the eastern end, where the swans nest out of reach. */
export const ISLAND = { x: 46, z: 2, radius: 9 } as const;

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
  // Flip any that came out facing the water.
  return normal.dot(point) < 0 ? normal.negate() : normal;
});

/** Unit vector pointing away from the water at a given shoreline point. */
export function outwardAt(shorePoint: THREE.Vector2): THREE.Vector2 {
  return shorePoint.clone().normalize();
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
    const x = -110 + Math.random() * 220;
    const z = -48 + Math.random() * 98;
    if (isInLake(x, z) && distanceToShore(x, z) > 4) return new THREE.Vector2(x, z);
  }
  return new THREE.Vector2(-40, 0);
}

function shapeFrom(points: ReadonlyArray<THREE.Vector2>): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i]!.x, points[i]!.y);
  shape.closePath();
  return shape;
}

function flatMesh(shape: THREE.Shape, material: THREE.Material, y: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape, 12), material);
  mesh.rotation.x = -Math.PI / 2;
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
  const shape = shapeFrom(outer);
  shape.holes.push(shapeFrom([...inner].reverse()));
  return flatMesh(shape, material, y);
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
      offsetShore(-1.6),
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

/** Water surface, its retaining wall, the bed beneath and the island. */
export function buildLake(scene: THREE.Scene): void {
  buildLakeWall(scene);

  scene.add(
    flatMesh(
      shapeFrom(SHORE),
      new THREE.MeshStandardMaterial({ color: 0x3d4a3c, roughness: 1 }),
      BED_Y,
    ),
  );

  const water = new THREE.Mesh(
    new THREE.ShapeGeometry(shapeFrom(SHORE), 12),
    new THREE.MeshStandardMaterial({
      color: 0x4f97a2,
      roughness: 0.35,
      metalness: 0.1,
      // A touch of self-lit colour so the water still reads blue at dusk.
      emissive: 0x123b44,
      transparent: true,
      opacity: 0.9,
    }),
  );
  water.rotation.x = -Math.PI / 2;
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
}

/**
 * The perimeter path: a closed ring following the shoreline, never crossing the
 * water. Spurs run outwards from it to the park edges.
 */
/** The paving starts at the waterline itself — no grass verge in between. */
export const PATH_INNER = 0;
export const PATH_OUTER = 12;

/** Centre line of the perimeter path, which the strolling public follow. */
export const PATH_LOOP: ReadonlyArray<THREE.Vector2> = offsetShore((PATH_INNER + PATH_OUTER) / 2);

export function buildPaths(scene: THREE.Scene): void {
  const paving = new THREE.MeshStandardMaterial({ color: 0xa8a294, roughness: 0.95 });

  const ring = shapeFrom(offsetShore(PATH_OUTER));
  ring.holes.push(shapeFrom(offsetShore(PATH_INNER)));
  scene.add(flatMesh(ring, paving, PATH_Y));

  // Spurs head away from the lake, so none of them can cut across the water.
  const spurs: ReadonlyArray<readonly [number, number]> = [
    [0, -1],
    [0, 1],
    [-1, -0.35],
    [1, 0.35],
  ];
  for (const [dx, dz] of spurs) {
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
    const mid = start.clone().multiplyScalar((from + 175) / 2);
    const spur = new THREE.Mesh(new THREE.PlaneGeometry(4, 175 - from), paving);
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
