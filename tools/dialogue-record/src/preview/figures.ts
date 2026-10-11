import * as THREE from 'three'
import { Face } from '@canoe-lake/entities/Face'
import { buildBoatman, buildGardener } from '@canoe-lake/entities/StaffModel'
import { buildWarden } from '@canoe-lake/entities/WardenModel'
import type { FigureKind } from '../lib/types'

function matt(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 1,
    metalness: 0,
    flatShading: true,
  })
}

function box(
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/** Park public — same silhouette language as the lake walkers. */
function buildPublic(kid = false): THREE.Group {
  const group = new THREE.Group()
  const scale = kid ? 0.72 : 1
  const skin = matt(kid ? 0xf0c8a0 : 0xd9a066)
  const coat = matt(kid ? 0xd8452f : 0x2f4f7f)
  const trousers = matt(0x2b3038)
  const boot = matt(0x1c1a18)

  group.add(box(0.32, 0.18, 0.2, trousers, 0, 0.92 * scale, 0))
  const torso = new THREE.Group()
  torso.position.y = 1.0 * scale
  group.add(torso)
  torso.add(box(0.38, 0.52 * scale, 0.22, coat, 0, 0.26 * scale, 0))

  for (const side of [-1, 1] as const) {
    const arm = new THREE.Group()
    arm.position.set(0.24 * side, 0.42 * scale, 0)
    torso.add(arm)
    arm.add(box(0.1, 0.42 * scale, 0.1, coat, 0, -0.18 * scale, 0))
    arm.add(box(0.09, 0.08, 0.09, skin, 0, -0.42 * scale, 0))

    const leg = new THREE.Group()
    leg.position.set(0.1 * side, 0.91 * scale, 0)
    group.add(leg)
    leg.add(box(0.13, 0.5 * scale, 0.14, trousers, 0, -0.25 * scale, 0))
    leg.add(box(0.13, 0.08, 0.22, boot, 0, -0.54 * scale, 0.04))
  }

  const face = new Face(skin, scale, false)
  face.group.position.set(0, 0.62 * scale, 0.04)
  torso.add(face.group)
  return group
}

export function buildFigure(kind: FigureKind): THREE.Group {
  if (kind === 'warden') return buildWarden().group
  if (kind === 'boatman') return buildBoatman().group
  if (kind === 'gardener') return buildGardener().group
  return buildPublic(kind === 'kid')
}
