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
  /** Parent part id. Position/rotation are local to that part, like canoe-lake groups. */
  parent?: string
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  color: string
  roughness: number
  metalness: number
}

export type ModelSpec = {
  name: string
  kind: string
  style: string
  density: 'chunky' | 'medium' | 'fine'
  parts: ModelPart[]
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
