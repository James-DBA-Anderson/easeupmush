import * as THREE from 'three'
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg'

export type KnifeShape = 'plane' | 'box' | 'sphere' | 'cylinder' | 'cone' | 'capsule'

export type KnifeSize = {
  width: number
  height: number
  depth: number
  radius: number
  thickness: number
}

export const KNIFE_SHAPES: { id: KnifeShape; label: string }[] = [
  { id: 'plane', label: 'Plane' },
  { id: 'box', label: 'Cube' },
  { id: 'sphere', label: 'Sphere' },
  { id: 'cylinder', label: 'Cylinder' },
  { id: 'cone', label: 'Cone' },
  { id: 'capsule', label: 'Capsule' },
]

export const DEFAULT_KNIFE_SIZE: KnifeSize = {
  width: 1.8,
  height: 1.8,
  depth: 1.8,
  radius: 0.55,
  thickness: 0.06,
}

export function makeKnifeGeometry(shape: KnifeShape, size: KnifeSize): THREE.BufferGeometry {
  switch (shape) {
    case 'sphere':
      return new THREE.SphereGeometry(Math.max(0.04, size.radius), 28, 20)
    case 'cylinder':
      return new THREE.CylinderGeometry(Math.max(0.04, size.radius), Math.max(0.04, size.radius), Math.max(0.06, size.height), 28)
    case 'cone':
      return new THREE.ConeGeometry(Math.max(0.04, size.radius), Math.max(0.06, size.height), 28)
    case 'capsule':
      return new THREE.CapsuleGeometry(Math.max(0.04, size.radius), Math.max(0.06, size.height), 6, 16)
    case 'box':
      return new THREE.BoxGeometry(
        Math.max(0.06, size.width),
        Math.max(0.06, size.height),
        Math.max(0.06, size.depth),
      )
    default:
      return new THREE.BoxGeometry(
        Math.max(0.08, size.width),
        Math.max(0.012, size.thickness),
        Math.max(0.08, size.height),
      )
  }
}

const evaluator = new Evaluator()
evaluator.useGroups = false

export type CutLoopInfo = { count: number; closed: boolean }

export function planeFromPoints(points: THREE.Vector3[]): THREE.Plane | null {
  if (points.length < 3) return null
  const origin = new THREE.Vector3()
  for (const p of points) origin.add(p)
  origin.multiplyScalar(1 / points.length)
  const n = new THREE.Vector3()
  const ab = new THREE.Vector3()
  const ac = new THREE.Vector3()
  ab.subVectors(points[1], points[0])
  ac.subVectors(points[2], points[0])
  n.crossVectors(ab, ac)
  if (n.lengthSq() < 1e-10) {
    ab.subVectors(points[points.length - 1], points[0])
    n.crossVectors(ab, new THREE.Vector3(0, 1, 0))
    if (n.lengthSq() < 1e-10) n.crossVectors(ab, new THREE.Vector3(1, 0, 0))
  }
  if (n.lengthSq() < 1e-12) n.set(0, 1, 0)
  else n.normalize()
  if (points.length > 3) {
    let xx = 0
    let xy = 0
    let xz = 0
    let yy = 0
    let yz = 0
    let zz = 0
    const d = new THREE.Vector3()
    for (const p of points) {
      d.subVectors(p, origin)
      xx += d.x * d.x
      xy += d.x * d.y
      xz += d.x * d.z
      yy += d.y * d.y
      yz += d.y * d.z
      zz += d.z * d.z
    }
    const seed = n.clone()
    const trace = xx + yy + zz
    for (let i = 0; i < 24; i++) {
      const nx = (trace - xx) * n.x - xy * n.y - xz * n.z
      const ny = -xy * n.x + (trace - yy) * n.y - yz * n.z
      const nz = -xz * n.x - yz * n.y + (trace - zz) * n.z
      n.set(nx, ny, nz)
      if (n.lengthSq() < 1e-12) {
        n.copy(seed)
        break
      }
      n.normalize()
    }
  }
  return new THREE.Plane().setFromNormalAndCoplanarPoint(n, origin)
}

type ClipVert = { p: THREE.Vector3; n: THREE.Vector3; uv: THREE.Vector2 }

function lerpVert(a: ClipVert, b: ClipVert, t: number): ClipVert {
  return {
    p: a.p.clone().lerp(b.p, t),
    n: a.n.clone().lerp(b.n, t).normalize(),
    uv: a.uv.clone().lerp(b.uv, t),
  }
}

function pushUnique(out: ClipVert[], v: ClipVert): void {
  const last = out[out.length - 1]
  if (last && last.p.distanceToSquared(v.p) < 1e-16) return
  out.push(v)
}

function pushFan(tris: ClipVert[], poly: ClipVert[]): void {
  for (let i = 1; i + 1 < poly.length; i++) {
    tris.push(poly[0], poly[i], poly[i + 1])
  }
}

function geometryFromTris(tris: ClipVert[], hasUv: boolean): THREE.BufferGeometry | null {
  if (tris.length < 3) return null
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  for (const v of tris) {
    positions.push(v.p.x, v.p.y, v.p.z)
    normals.push(v.n.x, v.n.y, v.n.z)
    uvs.push(v.uv.x, v.uv.y)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  if (hasUv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.computeBoundingBox()
  geo.computeBoundingSphere()
  return geo
}

export function splitMeshByPlane(mesh: THREE.Mesh, worldPlane: THREE.Plane): THREE.BufferGeometry[] {
  mesh.updateMatrixWorld(true)
  const world = mesh.matrixWorld
  const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry
  const disposeCopy = geo !== mesh.geometry
  const pos = geo.getAttribute('position')
  if (!pos || pos.count < 3) {
    if (disposeCopy) geo.dispose()
    return []
  }
  if (!geo.getAttribute('normal')) geo.computeVertexNormals()
  const nor = geo.getAttribute('normal')
  const uv = geo.getAttribute('uv')
  const triCount = Math.floor(pos.count / 3)
  const worldP = new THREE.Vector3()
  const read = (i: number): ClipVert => ({
    p: new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)),
    n: nor ? new THREE.Vector3(nor.getX(i), nor.getY(i), nor.getZ(i)) : new THREE.Vector3(0, 1, 0),
    uv: uv ? new THREE.Vector2(uv.getX(i), uv.getY(i)) : new THREE.Vector2(),
  })
  const dist = (v: ClipVert) => worldPlane.distanceToPoint(worldP.copy(v.p).applyMatrix4(world))
  const plus: ClipVert[] = []
  const minus: ClipVert[] = []
  const eps = 1e-5
  let mixed = false
  for (let t = 0; t < triCount; t++) {
    const tri = [read(t * 3), read(t * 3 + 1), read(t * 3 + 2)]
    const d0 = dist(tri[0])
    const d1 = dist(tri[1])
    const d2 = dist(tri[2])
    const allPlus = d0 >= -eps && d1 >= -eps && d2 >= -eps
    const allMinus = d0 <= eps && d1 <= eps && d2 <= eps
    if (allPlus && allMinus) continue
    if (allPlus) {
      pushFan(plus, tri)
      continue
    }
    if (allMinus) {
      pushFan(minus, tri)
      continue
    }
    mixed = true
    const posPoly = clipPolyWorld(tri, worldPlane, world, true, eps)
    const negPoly = clipPolyWorld(tri, worldPlane, world, false, eps)
    if (posPoly.length >= 3) pushFan(plus, posPoly)
    if (negPoly.length >= 3) pushFan(minus, negPoly)
  }
  if (disposeCopy) geo.dispose()
  if (!mixed) return []
  const a = geometryFromTris(plus, Boolean(uv))
  const b = geometryFromTris(minus, Boolean(uv))
  return [a, b].filter((item): item is THREE.BufferGeometry => Boolean(item))
}

function clipPolyWorld(
  poly: ClipVert[],
  worldPlane: THREE.Plane,
  world: THREE.Matrix4,
  keepPositive: boolean,
  eps: number,
): ClipVert[] {
  if (poly.length < 2) return []
  const worldP = new THREE.Vector3()
  const dist = (v: ClipVert) => worldPlane.distanceToPoint(worldP.copy(v.p).applyMatrix4(world))
  const keep = (d: number) => (keepPositive ? d >= -eps : d <= eps)
  const out: ClipVert[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const da = dist(a)
    const db = dist(b)
    const aKeep = keep(da)
    const bKeep = keep(db)
    if (aKeep) {
      const copy = { p: a.p.clone(), n: a.n.clone(), uv: a.uv.clone() }
      if (Math.abs(da) <= eps) snapLocalToWorldPlane(copy, worldPlane, world)
      pushUnique(out, copy)
    }
    if (aKeep !== bKeep) {
      const t = Math.abs(da - db) < 1e-20 ? 0.5 : da / (da - db)
      const hit = lerpVert(a, b, t)
      snapLocalToWorldPlane(hit, worldPlane, world)
      pushUnique(out, hit)
    }
  }
  if (out.length > 2 && out[0].p.distanceToSquared(out[out.length - 1].p) < 1e-16) out.pop()
  return out
}

function snapLocalToWorldPlane(v: ClipVert, worldPlane: THREE.Plane, world: THREE.Matrix4): ClipVert {
  const wp = v.p.clone().applyMatrix4(world)
  const d = worldPlane.distanceToPoint(wp)
  wp.addScaledVector(worldPlane.normal, -d)
  const inv = new THREE.Matrix4().copy(world).invert()
  v.p.copy(wp).applyMatrix4(inv)
  return v
}

export function makeLoopKnife(points: THREE.Vector3[], through: number): THREE.Mesh {
  if (points.length < 3) throw new Error('Need at least three nodes to close a cut')
  const origin = new THREE.Vector3()
  for (const p of points) origin.add(p)
  origin.multiplyScalar(1 / points.length)

  const normal = new THREE.Vector3()
  const ab = new THREE.Vector3()
  const ac = new THREE.Vector3()
  for (let i = 0; i < points.length; i++) {
    ab.subVectors(points[i], origin)
    ac.subVectors(points[(i + 1) % points.length], origin)
    normal.add(ab.cross(ac))
  }
  if (normal.lengthSq() < 1e-10) normal.set(0, 1, 0)
  else normal.normalize()

  const u = new THREE.Vector3()
  if (Math.abs(normal.dot(new THREE.Vector3(0, 1, 0))) < 0.92) {
    u.crossVectors(normal, new THREE.Vector3(0, 1, 0)).normalize()
  } else {
    u.crossVectors(normal, new THREE.Vector3(1, 0, 0)).normalize()
  }
  const v = new THREE.Vector3().crossVectors(normal, u).normalize()

  const shape = new THREE.Shape()
  points.forEach((p, i) => {
    const x = p.clone().sub(origin).dot(u)
    const y = p.clone().sub(origin).dot(v)
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  })
  shape.closePath()

  const depth = Math.max(0.4, through)
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 })
  geo.translate(0, 0, -depth / 2)
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
  mesh.position.copy(origin)
  mesh.updateMatrixWorld(true)
  return mesh
}

export function subtractWorld(target: THREE.Mesh, knife: THREE.Mesh): THREE.BufferGeometry | null {
  target.updateMatrixWorld(true)
  knife.updateMatrixWorld(true)
  const a = brushFrom(target)
  const b = brushFrom(knife)
  try {
    const result = evaluator.evaluate(a, b, SUBTRACTION)
    const geo = result.geometry
    if (!geo?.getAttribute('position') || geo.getAttribute('position').count < 3) return null
    return geo
  } finally {
    a.geometry.dispose()
    b.geometry.dispose()
  }
}

export function worldToLocalGeometry(
  geometry: THREE.BufferGeometry,
  parent: THREE.Object3D,
): THREE.BufferGeometry {
  parent.updateMatrixWorld(true)
  const next = geometry.clone()
  next.applyMatrix4(new THREE.Matrix4().copy(parent.matrixWorld).invert())
  next.computeVertexNormals()
  next.computeBoundingBox()
  next.computeBoundingSphere()
  return next
}

export function splitIslands(geometry: THREE.BufferGeometry): THREE.BufferGeometry[] {
  const pos = geometry.getAttribute('position')
  if (!pos || pos.count < 3) return []
  const triCount = Math.floor(pos.count / 3)
  if (triCount < 1) return []

  const vertId: number[] = new Array(pos.count)
  const keyToId = new Map<string, number>()
  let nextId = 0
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(5)},${pos.getY(i).toFixed(5)},${pos.getZ(i).toFixed(5)}`
    let id = keyToId.get(key)
    if (id === undefined) {
      id = nextId++
      keyToId.set(key, id)
    }
    vertId[i] = id
  }

  const parent = Array.from({ length: nextId }, (_, i) => i)
  const find = (a: number): number => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]]
      a = parent[a]
    }
    return a
  }
  const unite = (a: number, b: number) => {
    a = find(a)
    b = find(b)
    if (a !== b) parent[b] = a
  }
  for (let t = 0; t < triCount; t++) {
    const i = t * 3
    unite(vertId[i], vertId[i + 1])
    unite(vertId[i + 1], vertId[i + 2])
  }

  const groups = new Map<number, number[]>()
  for (let t = 0; t < triCount; t++) {
    const root = find(vertId[t * 3])
    const list = groups.get(root)
    if (list) list.push(t)
    else groups.set(root, [t])
  }
  if (groups.size <= 1) return [geometry]

  const uv = geometry.getAttribute('uv')
  const nor = geometry.getAttribute('normal')
  const islands: THREE.BufferGeometry[] = []
  for (const tris of groups.values()) {
    if (!tris.length) continue
    const positions: number[] = []
    const normals: number[] = []
    const uvs: number[] = []
    for (const t of tris) {
      for (let k = 0; k < 3; k++) {
        const i = t * 3 + k
        positions.push(pos.getX(i), pos.getY(i), pos.getZ(i))
        if (nor) normals.push(nor.getX(i), nor.getY(i), nor.getZ(i))
        if (uv) uvs.push(uv.getX(i), uv.getY(i))
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    if (nor) geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    else geo.computeVertexNormals()
    if (uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geo.computeBoundingBox()
    geo.computeBoundingSphere()
    islands.push(geo)
  }
  return islands.length ? islands : [geometry]
}

function brushFrom(mesh: THREE.Mesh): Brush {
  const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
  geo.applyMatrix4(mesh.matrixWorld)
  const brush = new Brush(geo)
  brush.position.set(0, 0, 0)
  brush.rotation.set(0, 0, 0)
  brush.scale.set(1, 1, 1)
  brush.updateMatrixWorld(true)
  return brush
}
