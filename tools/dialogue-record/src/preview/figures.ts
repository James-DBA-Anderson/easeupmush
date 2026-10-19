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

/** Backflip Bill — blond, grey tee, blue jeans. */
function buildBill(): THREE.Group {
  const group = new THREE.Group()
  const skin = matt(0xf0c8a0)
  const hair = matt(0xf2d15a)
  const tee = matt(0x8a939c)
  const jeans = matt(0x3a5a9a)
  const shoe = matt(0xe8eef2)

  group.add(box(0.3, 0.16, 0.18, jeans, 0, 0.92, 0))
  const torso = new THREE.Group()
  torso.position.y = 1.0
  group.add(torso)
  torso.add(box(0.36, 0.5, 0.2, tee, 0, 0.26, 0))

  for (const side of [-1, 1] as const) {
    const arm = new THREE.Group()
    arm.position.set(0.22 * side, 0.4, 0)
    torso.add(arm)
    arm.add(box(0.09, 0.4, 0.09, tee, 0, -0.16, 0))
    arm.add(box(0.08, 0.08, 0.08, skin, 0, -0.4, 0))

    const leg = new THREE.Group()
    leg.position.set(0.09 * side, 0.91, 0)
    group.add(leg)
    leg.add(box(0.12, 0.48, 0.13, jeans, 0, -0.24, 0))
    leg.add(box(0.12, 0.07, 0.2, shoe, 0, -0.52, 0.04))
  }

  const head = new THREE.Group()
  head.position.set(0, 0.62, 0.03)
  torso.add(head)
  head.add(box(0.22, 0.24, 0.22, skin, 0, 0.08, 0))
  head.add(box(0.24, 0.12, 0.24, hair, -0.02, 0.2, -0.02))
  const face = new Face(skin, 1, true)
  face.group.position.set(0, 0.02, 0.04)
  head.add(face.group)
  return group
}

export function buildFigure(kind: FigureKind): THREE.Group {
  if (kind === 'warden') return buildWarden().group
  if (kind === 'boatman') return buildBoatman().group
  if (kind === 'gardener') return buildGardener().group
  if (kind === 'bill') return buildBill()
  return buildPublic(kind === 'kid')
}
