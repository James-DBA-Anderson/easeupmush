import * as THREE from 'three'
import type { ModelGroup, ModelPart, ModelSpec } from './spec'

function segs(density: ModelSpec['density']): { w: number; h: number } {
  if (density === 'chunky') return { w: 6, h: 4 }
  if (density === 'fine') return { w: 16, h: 10 }
  return { w: 10, h: 7 }
}

function geometryFor(part: ModelPart, density: ModelSpec['density']): THREE.BufferGeometry {
  const { w, h } = segs(density)
  let geo: THREE.BufferGeometry
  switch (part.shape) {
    case 'box':
      geo = new THREE.BoxGeometry(1, 1, 1)
      break
    case 'cylinder':
      geo = new THREE.CylinderGeometry(0.5, 0.5, 1, Math.max(w, 8), 1)
      break
    case 'cone':
      geo = new THREE.ConeGeometry(0.5, 1, Math.max(w, 8), 1)
      break
    case 'torus':
      geo = new THREE.TorusGeometry(0.35, 0.16, h, w)
      break
    case 'capsule': {
      geo = new THREE.CapsuleGeometry(0.5, 1, h, w)
      geo.scale(1, 0.5, 1)
      break
    }
    default:
      geo = new THREE.SphereGeometry(0.5, w, h)
  }
  return geo
}

export function meshFromPart(part: ModelPart, density: ModelSpec['density'] = 'medium'): THREE.Mesh {
  const geo = geometryFor(part, density)
  const mat = new THREE.MeshStandardMaterial({
    color: part.color,
    roughness: part.roughness,
    metalness: part.metalness,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.name = part.label || part.id
  mesh.userData.partId = part.id
  mesh.userData.shape = part.shape
  mesh.position.set(...part.position)
  mesh.rotation.set(...part.rotation)
  mesh.scale.set(...part.scale)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/** Pivot that holds a part’s TRS so parent scale does not squash children. */
export function partHandle(object: THREE.Object3D): THREE.Object3D {
  const parent = object.parent
  if (parent?.userData.partPivot && parent.userData.partId === object.userData.partId) {
    return parent
  }
  return object
}

export function makeGroupPivot(entry: ModelGroup): THREE.Group {
  const pivot = new THREE.Group()
  pivot.name = entry.label || entry.id
  pivot.userData.partId = entry.id
  pivot.userData.isGroup = true
  pivot.position.set(...entry.position)
  pivot.rotation.set(...entry.rotation)
  pivot.scale.set(...entry.scale)
  return pivot
}

export function buildGroupFromSpec(spec: ModelSpec): THREE.Group {
  const group = new THREE.Group()
  group.name = spec.name || 'model'
  const pivots = new Map<string, THREE.Group>()
  for (const entry of spec.groups ?? []) {
    pivots.set(entry.id, makeGroupPivot(entry))
  }
  for (const part of spec.parts) {
    const mesh = meshFromPart(part, spec.density)
    const pivot = new THREE.Group()
    pivot.name = part.label || part.id
    pivot.userData.partId = part.id
    pivot.userData.partPivot = true
    pivot.position.copy(mesh.position)
    pivot.rotation.copy(mesh.rotation)
    mesh.position.set(0, 0, 0)
    mesh.rotation.set(0, 0, 0)
    pivot.add(mesh)
    pivots.set(part.id, pivot)
  }
  const attach = (id: string, parentId?: string) => {
    const pivot = pivots.get(id)
    if (!pivot) return
    const parent = parentId ? pivots.get(parentId) : undefined
    if (parent && parent !== pivot) parent.add(pivot)
    else group.add(pivot)
  }
  for (const entry of spec.groups ?? []) attach(entry.id, entry.parent)
  for (const part of spec.parts) attach(part.id, part.parent)
  return group
}
