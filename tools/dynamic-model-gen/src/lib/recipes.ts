import type { ModelPart, PartShape } from './spec'

const SHAPES: PartShape[] = ['sphere', 'box', 'capsule', 'cylinder', 'cone', 'torus']

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

function vec3(v: unknown, fallback: [number, number, number]): [number, number, number] {
  if (!Array.isArray(v) || v.length < 2) return fallback
  return [num(v[0], fallback[0]), num(v[1], fallback[1]), num(v[2], fallback[2])]
}

function hex(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback
  if (/^#?[0-9a-fA-F]{6}$/.test(raw)) return raw.startsWith('#') ? raw : `#${raw}`
  return fallback
}

/** Canoe-lake style helpers the local model can name instead of placing every blob. */
export function expandRecipes(parts: ModelPart[], raw: unknown): ModelPart[] {
  if (!Array.isArray(raw) || !raw.length) return parts
  const next = [...parts]
  const has = (id: string) => next.some((part) => part.id === id)
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const kind = String(rec.kind ?? rec.type ?? '').toLowerCase()
    if (kind === 'eyes') {
      const parent = String(rec.parent ?? 'head')
      if (!next.some((part) => part.id === parent)) continue
      const spread = Math.abs(num(rec.spread, 0.16))
      const y = num(rec.y, 0.08)
      const z = num(rec.z, 0.18)
      const size = Math.max(0.03, num(rec.size, 0.055))
      const color = hex(rec.color, '#1a1814')
      for (const side of [-1, 1] as const) {
        const id = side < 0 ? 'eye-l' : 'eye-r'
        if (has(id)) continue
        next.push({
          id,
          label: 'Eye',
          shape: 'sphere',
          parent,
          position: [side * spread, y, z],
          rotation: [0, 0, 0],
          scale: [size, size, size],
          color,
          roughness: 0.35,
          metalness: 0.04,
        })
      }
      continue
    }
    if (kind === 'pair') {
      const id = String(rec.id ?? 'limb').replace(/[^a-z0-9-]/gi, '').slice(0, 24) || 'limb'
      const parent = rec.parent != null ? String(rec.parent) : undefined
      const shapeName = String(rec.shape ?? 'capsule').toLowerCase()
      const shape = SHAPES.includes(shapeName as PartShape) ? (shapeName as PartShape) : 'capsule'
      const pos = vec3(rec.position, [0.4, 0.2, 0])
      const rot = vec3(rec.rotation, [0, 0, 0.4])
      const scale = vec3(rec.scale, [0.12, 0.36, 0.12])
      const color = hex(rec.color, '#c47a4a')
      const gap = Math.abs(num(rec.gap, pos[0] || 0.4))
      for (const side of [-1, 1] as const) {
        const pid = `${id}-${side < 0 ? 'l' : 'r'}`
        if (has(pid)) continue
        next.push({
          id: pid,
          label: String(rec.label ?? id),
          shape,
          parent: parent && next.some((part) => part.id === parent) ? parent : undefined,
          position: [side * gap, pos[1], pos[2]],
          rotation: [rot[0], rot[1], side * Math.abs(rot[2])],
          scale,
          color,
          roughness: 0.72,
          metalness: 0.04,
        })
      }
    }
  }
  return next.slice(0, 24)
}

export function dropBadParents(parts: ModelPart[]): ModelPart[] {
  const ids = new Set(parts.map((part) => part.id))
  return parts.map((part) => {
    const parent = part.parent
    if (!parent || parent === part.id || !ids.has(parent)) {
      const { parent: _drop, ...rest } = part
      return rest
    }
    return part
  })
}

export function breakParentCycles(parts: ModelPart[]): ModelPart[] {
  const byId = new Map(parts.map((part) => [part.id, part]))
  return parts.map((part) => {
    const seen = new Set<string>()
    let cur = part.parent
    while (cur) {
      if (seen.has(cur) || cur === part.id) {
        const { parent: _drop, ...rest } = part
        return rest
      }
      seen.add(cur)
      cur = byId.get(cur)?.parent
    }
    return part
  })
}

export function worldOffset(parts: ModelPart[], part: ModelPart): [number, number, number] {
  const byId = new Map(parts.map((item) => [item.id, item]))
  let x = part.position[0]
  let y = part.position[1]
  let z = part.position[2]
  let cur = part.parent
  let hops = 0
  while (cur && hops < 12) {
    hops += 1
    const parent = byId.get(cur)
    if (!parent) break
    x += parent.position[0]
    y += parent.position[1]
    z += parent.position[2]
    cur = parent.parent
  }
  return [x, y, z]
}
