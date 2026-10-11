export type PartShape =
  | 'sphere'
  | 'box'
  | 'capsule'
  | 'cylinder'
  | 'cone'
  | 'torus'

export type ModelPart = {
  id: string
  label: string
  shape: PartShape
  /** Parent group or part id. Position/rotation are local to that node. */
  parent?: string
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  color: string
  roughness: number
  metalness: number
}

/** Empty pivot. Children move/rotate/scale with it; each child stays selectable. */
export type ModelGroup = {
  id: string
  label: string
  parent?: string
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
}

export type SceneNodeInfo = {
  id: string
  label: string
  kind: 'part' | 'group'
  parent?: string
}

export type ModelSpec = {
  name: string
  kind: string
  style: string
  density: 'chunky' | 'medium' | 'fine'
  parts: ModelPart[]
  groups?: ModelGroup[]
}

export const PART_SHAPES: PartShape[] = [
  'sphere',
  'box',
  'capsule',
  'cylinder',
  'cone',
  'torus',
]

export const PART_SHAPE_LABELS: Record<PartShape, string> = {
  sphere: 'Sphere',
  box: 'Cube',
  capsule: 'Capsule',
  cylinder: 'Cylinder',
  cone: 'Cone',
  torus: 'Torus',
}
