import * as THREE from 'three'
import type { ModelPart, ModelSpec } from './spec'

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
    case 'capsule':
      geo = new THREE.CapsuleGeometry(0.35, 0.7, h, w)
      break
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

export function buildGroupFromSpec(spec: ModelSpec): THREE.Group {
  const group = new THREE.Group()
  group.name = spec.name || 'model'
  for (const part of spec.parts) group.add(meshFromPart(part, spec.density))
  return group
}
