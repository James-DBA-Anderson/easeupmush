import { PALETTES, parseColours, type AlterMode, type PromptOptions } from './prompts'
import type { ModelPart, ModelSpec, PartShape } from './spec'

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function part(
  id: string,
  label: string,
  shape: PartShape,
  position: [number, number, number],
  scale: [number, number, number],
  color: string,
  extras?: Partial<ModelPart>,
): ModelPart {
  return {
    id,
    label,
    shape,
    position,
    rotation: extras?.rotation ?? [0, 0, 0],
    scale,
    color,
    roughness: extras?.roughness ?? 0.72,
    metalness: extras?.metalness ?? 0.04,
  }
}

function snap(
  v: [number, number, number],
  grid: number,
): [number, number, number] {
  const s = (n: number) => Math.round(n / grid) * grid
  return [s(v[0]), s(v[1]), s(v[2])]
}

function voxelize(parts: ModelPart[]): ModelPart[] {
  return parts.map((p) => ({
    ...p,
    shape: 'box',
    position: snap(p.position, 0.12),
    scale: snap(p.scale, 0.12).map((n) => Math.max(n, 0.12)) as [
      number,
      number,
      number,
    ],
    rotation: [0, 0, 0],
  }))
}

export function paintFromPrompt(parts: ModelPart[], text: string): ModelPart[] {
  const named = parseColours(text)
  if (!named.length) return parts
  const primary = named[0]
  const secondary = named[1]
  const accent = named[2]
  return parts.map((p) => {
    const id = p.id.toLowerCase()
    if (accent && /nose|cherry|light|bow|hat|coat|top/.test(id)) return { ...p, color: accent }
    if (secondary && /ear|wheel|arm|muzzle|icing|foot/.test(id)) return { ...p, color: secondary }
    if (/body|head|cabin|base|shade|icing/.test(id)) return { ...p, color: primary }
    if (named.length === 1 && !/nose|wheel|light|bulb/.test(id)) return { ...p, color: primary }
    return p
  })
}

function dressFromDescription(parts: ModelPart[], description: string, accent: string): ModelPart[] {
  const t = description.toLowerCase()
  const extra: ModelPart[] = []
  const has = (id: string) => parts.some((p) => p.id === id) || extra.some((p) => p.id === id)
  const head = parts.find((p) => p.id === 'head')
  const body = parts.find((p) => p.id === 'body')
  if (/\bwaistcoat|\bvest|\bjacket/.test(t) && body && !has('coat')) {
    extra.push(
      part(
        'coat',
        'Waistcoat',
        'box',
        [body.position[0], body.position[1] + 0.04, body.position[2] + body.scale[2] * 0.22],
        [body.scale[0] * 0.92, body.scale[1] * 0.62, body.scale[2] * 0.42],
        accent,
      ),
    )
  }
  if (/\bhat|\bcap|\bcrown/.test(t) && head && !has('hat')) {
    extra.push(
      part(
        'hat',
        'Hat',
        'cylinder',
        [head.position[0], head.position[1] + head.scale[1] * 0.55, head.position[2]],
        [head.scale[0] * 0.72, 0.12, head.scale[2] * 0.72],
        accent,
      ),
    )
  }
  if (/\bbow\s*tie|\bbowtie/.test(t) && body && !has('bow')) {
    extra.push(
      part(
        'bow',
        'Bow tie',
        'torus',
        [0, body.position[1] + body.scale[1] * 0.38, body.position[2] + body.scale[2] * 0.48],
        [0.12, 0.08, 0.12],
        accent,
        { rotation: [Math.PI / 2, 0, 0] },
      ),
    )
  }
  return extra.length ? [...parts, ...extra] : parts
}

function finish(spec: ModelSpec, opts: PromptOptions): ModelSpec {
  const roughness =
    opts.style === 'toy' ? 0.28 : opts.style === 'clay' ? 0.88 : 0.65
  const metalness = opts.style === 'toy' ? 0.12 : 0.03
  const palette = PALETTES[opts.palette].colors
  let parts = dressFromDescription(spec.parts, opts.description, palette[2] ?? palette[0])
  parts = paintFromPrompt(parts, opts.description)
  parts = parts.map((p) => ({ ...p, roughness, metalness }))
  if (opts.style === 'plush') {
    parts = parts.map((p) =>
      p.shape === 'box' || p.shape === 'cylinder' ? { ...p, shape: 'sphere' } : p,
    )
  }
  if (opts.style === 'voxel') parts = voxelize(parts)
  return { ...spec, style: opts.style, kind: opts.kind, density: opts.density, parts }
}

export function assembleKit(opts: PromptOptions, seed = 1): ModelSpec {
  const rng = mulberry32(seed || 1)
  const colors = PALETTES[opts.palette].colors
  const primary = colors[0]
  const secondary = colors[1]
  const accent = colors[2]
  const dark = colors[3]
  const light = colors[4] ?? '#fff4e8'
  const chibi = opts.style === 'chibi' ? 1 : 0
  const sit = opts.pose === 'sitting' ? 1 : 0
  const action = opts.pose === 'action' ? 1 : 0

  if (opts.kind === 'food') {
    return finish(
      {
        name: opts.description,
        kind: opts.kind,
        style: opts.style,
        density: opts.density,
        parts: [
          part('body', 'Body', 'cylinder', [0, 0.35, 0], [0.9, 0.35, 0.9], primary),
          part('icing', 'Icing', 'cylinder', [0, 0.72, 0], [0.92, 0.12, 0.92], light),
          part('top', 'Top', 'sphere', [0, 0.92, 0], [0.55, 0.18, 0.55], secondary),
          part('cherry', 'Cherry', 'sphere', [0.1, 1.12, 0.05], [0.16, 0.16, 0.16], accent),
          ...(opts.density === 'fine'
            ? [
                part('slice', 'Slice', 'box', [0.55, 0.4, 0], [0.18, 0.5, 0.7], primary, {
                  rotation: [0, 0.4, 0],
                }),
              ]
            : []),
        ],
      },
      opts,
    )
  }

  if (opts.kind === 'vehicle') {
    return finish(
      {
        name: opts.description,
        kind: opts.kind,
        style: opts.style,
        density: opts.density,
        parts: [
          part('cabin', 'Cabin', 'box', [0, 0.55, 0], [0.7, 0.4, 1.1], primary),
          part('body', 'Body', 'box', [0, 0.28, 0], [0.9, 0.28, 1.5], secondary),
          part('wheel-fl', 'Wheel', 'cylinder', [-0.55, 0.18, 0.45], [0.18, 0.12, 0.18], dark, {
            rotation: [0, 0, Math.PI / 2],
          }),
          part('wheel-fr', 'Wheel', 'cylinder', [0.55, 0.18, 0.45], [0.18, 0.12, 0.18], dark, {
            rotation: [0, 0, Math.PI / 2],
          }),
          part('wheel-bl', 'Wheel', 'cylinder', [-0.55, 0.18, -0.5], [0.18, 0.12, 0.18], dark, {
            rotation: [0, 0, Math.PI / 2],
          }),
          part('wheel-br', 'Wheel', 'cylinder', [0.55, 0.18, -0.5], [0.18, 0.12, 0.18], dark, {
            rotation: [0, 0, Math.PI / 2],
          }),
          part('light-l', 'Lamp', 'sphere', [-0.28, 0.32, 0.78], [0.1, 0.1, 0.1], accent),
          part('light-r', 'Lamp', 'sphere', [0.28, 0.32, 0.78], [0.1, 0.1, 0.1], accent),
        ],
      },
      opts,
    )
  }

  if (opts.kind === 'prop') {
    return finish(
      {
        name: opts.description,
        kind: opts.kind,
        style: opts.style,
        density: opts.density,
        parts: [
          part('base', 'Base', 'cylinder', [0, 0.08, 0], [0.55, 0.08, 0.55], dark),
          part('stem', 'Stem', 'cylinder', [0, 0.55, 0], [0.08, 0.5, 0.08], secondary),
          part('shade', 'Shade', 'cone', [0, 1.05, 0], [0.55, 0.28, 0.55], primary),
          part('bulb', 'Bulb', 'sphere', [0, 0.88, 0], [0.14, 0.14, 0.14], light),
        ],
      },
      opts,
    )
  }

  const headY = sit ? 1.05 : 1.42
  const bodyY = sit ? 0.55 : 0.72
  const headSize = 0.38 + chibi * 0.18 + rng() * 0.04
  const earH = opts.kind === 'creature' ? 0.42 : 0.55
  const legSpread = 0.22
  const armY = bodyY + 0.28
  const armLift = action ? 0.7 : 0.05

  const parts: ModelPart[] = [
    part('body', 'Body', 'capsule', [0, bodyY, 0], [0.48, 0.55 + chibi * -0.08, 0.42], primary),
    part('head', 'Head', 'sphere', [0, headY + headSize * 0.35, 0.04], [headSize, headSize, headSize], primary),
    part(
      'ear-l',
      'Ear',
      'capsule',
      [-0.16, headY + headSize * 0.7 + earH * 0.25, -0.02],
      [0.1, earH, 0.08],
      secondary,
      { rotation: [0.15, 0, 0.35] },
    ),
    part(
      'ear-r',
      'Ear',
      'capsule',
      [0.16, headY + headSize * 0.7 + earH * 0.25, -0.02],
      [0.1, earH, 0.08],
      secondary,
      { rotation: [0.15, 0, -0.35] },
    ),
    part('muzzle', 'Muzzle', 'sphere', [0, headY + 0.02, headSize * 0.55], [0.22, 0.16, 0.2], light),
    part('nose', 'Nose', 'sphere', [0, headY + 0.04, headSize * 0.78], [0.06, 0.05, 0.06], dark),
    part(
      'arm-l',
      'Arm',
      'capsule',
      [-0.42, armY, 0.02],
      [0.12, 0.38, 0.12],
      primary,
      { rotation: [0.2, 0, 0.55 + armLift] },
    ),
    part(
      'arm-r',
      'Arm',
      'capsule',
      [0.42, armY, 0.02],
      [0.12, 0.38, 0.12],
      primary,
      { rotation: [0.15 + action, 0, -0.5] },
    ),
  ]

  if (sit) {
    parts.push(
      part('leg-l', 'Leg', 'capsule', [-legSpread, 0.28, 0.28], [0.16, 0.22, 0.32], primary, {
        rotation: [1.1, 0, 0],
      }),
      part('leg-r', 'Leg', 'capsule', [legSpread, 0.28, 0.28], [0.16, 0.22, 0.32], primary, {
        rotation: [1.1, 0, 0],
      }),
      part('foot-l', 'Foot', 'sphere', [-legSpread, 0.12, 0.48], [0.14, 0.08, 0.2], secondary),
      part('foot-r', 'Foot', 'sphere', [legSpread, 0.12, 0.48], [0.14, 0.08, 0.2], secondary),
    )
  } else {
    parts.push(
      part('leg-l', 'Leg', 'capsule', [-legSpread, 0.32, 0], [0.14, 0.38, 0.14], primary),
      part('leg-r', 'Leg', 'capsule', [legSpread, 0.32, 0], [0.14, 0.38, 0.14], primary),
      part('foot-l', 'Foot', 'sphere', [-legSpread, 0.08, 0.08], [0.14, 0.08, 0.2], secondary),
      part('foot-r', 'Foot', 'sphere', [legSpread, 0.08, 0.08], [0.14, 0.08, 0.2], secondary),
    )
  }

  if (opts.kind === 'creature' || opts.density !== 'chunky') {
    parts.push(
      part('tail', 'Tail', 'capsule', [0, 0.45, -0.42], [0.1, 0.12, 0.4], accent, {
        rotation: [0.8, 0, 0],
      }),
    )
  }

  if (opts.density === 'fine') {
    parts.push(
      part('bow', 'Bow', 'torus', [0, headY - 0.02, headSize * 0.2], [0.12, 0.08, 0.12], accent, {
        rotation: [Math.PI / 2, 0, 0],
      }),
    )
  }

  return finish(
    {
      name: opts.description,
      kind: opts.kind,
      style: opts.style,
      density: opts.density,
      parts,
    },
    opts,
  )
}

function scaleBy(
  scale: [number, number, number],
  mx: number,
  my: number,
  mz: number,
): [number, number, number] {
  return [
    Math.max(0.08, scale[0] * mx),
    Math.max(0.08, scale[1] * my),
    Math.max(0.08, scale[2] * mz),
  ]
}

function reshapeAmount(density: PromptOptions['density']): number {
  if (density === 'chunky') return 1.22
  if (density === 'fine') return 0.88
  return 1
}

function reshapeOne(part: ModelPart, request: string, amp: number): ModelPart {
  const t = request.toLowerCase()
  let next: ModelPart = { ...part }
  let matched = false
  const pear = /\bpear|\bteardrop|\bgourd|\bhip/.test(t)

  if (/\bround|\bball|\bsphere|\bchubby|\bplump/.test(t) && !pear) {
    matched = true
    next = {
      ...next,
      shape: 'sphere',
      scale: scaleBy(part.scale, 1.28 * amp, 1.12 * amp, 1.28 * amp),
    }
  } else if (/\bboxy|\bsquare|\bcube/.test(t)) {
    matched = true
    next = { ...next, shape: 'box' }
  } else if (/\bpointy|\bcone|\btriangle/.test(t)) {
    matched = true
    next = { ...next, shape: 'cone' }
  } else if (/\bsausage|\btube|\bcylinder/.test(t)) {
    matched = true
    next = {
      ...next,
      shape: 'capsule',
      scale: scaleBy(part.scale, 0.82, 1.35 * amp, 0.82),
    }
  }

  if (/\btaller|\blonger|\bstretch/.test(t)) {
    matched = true
    next = { ...next, scale: scaleBy(next.scale, 1, 1.4 * amp, 1) }
  }
  if (/\bshorter|\bsquat|\bstubby/.test(t)) {
    matched = true
    next = { ...next, scale: scaleBy(next.scale, 1, 0.68, 1) }
  }
  if (/\bwider|\bfatter|\bthicker|\bhuge|\bbigger|\blarger/.test(t) && !pear) {
    matched = true
    next = { ...next, scale: scaleBy(next.scale, 1.38 * amp, 1.08, 1.38 * amp) }
  }
  if (/\bnarrower|\bthinner|\bskinnier|\btiny|\bsmaller/.test(t)) {
    matched = true
    next = { ...next, scale: scaleBy(next.scale, 0.7, 0.88, 0.7) }
  }
  if (/\bflat/.test(t)) {
    matched = true
    next = { ...next, scale: scaleBy(next.scale, 1.25, 0.52, 1.25) }
  }

  if (!matched) {
    next = { ...next, scale: scaleBy(part.scale, 1.22 * amp, 1, 1.22 * amp) }
  }
  return next
}

function withPearBelly(spec: ModelSpec, hostId: string): ModelSpec {
  const host = spec.parts.find((part) => part.id === hostId)
  if (!host) return spec
  const upper: ModelPart = {
    ...host,
    shape: host.shape === 'box' ? 'capsule' : host.shape === 'cone' ? 'capsule' : host.shape,
    scale: scaleBy(host.scale, 0.58, 0.72, 0.58),
    position: [
      host.position[0],
      host.position[1] + host.scale[1] * 0.28,
      host.position[2],
    ],
  }
  const bellyId = spec.parts.some((part) => part.id === 'belly') ? 'belly' : `${host.id}-belly`
  const belly: ModelPart = {
    id: bellyId,
    label: 'Belly',
    shape: 'sphere',
    position: [
      host.position[0],
      host.position[1] - host.scale[1] * 0.28,
      host.position[2],
    ],
    rotation: [0, 0, 0],
    scale: scaleBy(host.scale, 1.15, 0.7, 1.1),
    color: host.color,
    roughness: host.roughness,
    metalness: host.metalness,
  }
  const without = spec.parts.filter((part) => part.id !== host.id && part.id !== bellyId)
  return { ...spec, parts: [...without, upper, belly] }
}

export function reviseKit(
  current: ModelSpec,
  opts: PromptOptions,
  seed = 1,
  alter?: { mode: AlterMode; partId: string | null },
): ModelSpec {
  const mode = alter?.mode ?? 'reshape'
  const partId = alter?.partId ?? null
  const palette = PALETTES[opts.palette].colors
  const target = assembleKit(
    { ...opts, description: current.name || opts.description },
    seed,
  )

  if (mode === 'recolour') {
    const named = parseColours(opts.description)
    const paint = named[0] ?? palette[0]
    if (partId) {
      return {
        ...current,
        parts: current.parts.map((part) =>
          part.id === partId ? { ...part, color: paint } : part,
        ),
      }
    }
    if (named.length === 1) {
      return {
        ...current,
        parts: current.parts.map((part) => ({ ...part, color: paint })),
      }
    }
    const seen: string[] = []
    for (const part of current.parts) {
      const key = part.color.toLowerCase()
      if (!seen.includes(key)) seen.push(key)
    }
    const pool = named.length ? named : palette
    const remap = new Map(seen.map((color, i) => [color, pool[i % pool.length]]))
    return {
      ...current,
      parts: current.parts.map((part) => ({
        ...part,
        color: remap.get(part.color.toLowerCase()) ?? part.color,
      })),
    }
  }

  if (mode === 'remove') {
    if (!partId) return current
    const parts = current.parts.filter((part) => part.id !== partId)
    return { ...current, parts: parts.length ? parts : current.parts }
  }

  if (mode === 'add') {
    const missing = target.parts.filter((part) => !current.parts.some((p) => p.id === part.id))
    if (missing.length) return { ...current, parts: [...current.parts, ...missing] }
    const host = current.parts.find((part) => part.id === partId) ?? current.parts[0]
    if (!host) return current
    const extra: ModelPart = {
      id: `extra-${Math.abs(seed) || 1}`,
      label: opts.description.trim() || 'Extra',
      shape: 'sphere',
      position: [host.position[0], host.position[1] + host.scale[1] * 0.6, host.position[2]],
      rotation: [0, 0, 0],
      scale: [0.14, 0.14, 0.14],
      color: parseColours(opts.description)[0] ?? palette[2] ?? palette[0],
      roughness: host.roughness,
      metalness: host.metalness,
    }
    if (current.parts.some((part) => part.id === extra.id)) return current
    return { ...current, parts: [...current.parts, extra] }
  }

  if (mode === 'pose') {
    const posed = new Set(['arm-l', 'arm-r', 'leg-l', 'leg-r', 'foot-l', 'foot-r', 'tail', 'body', 'head'])
    const byId = new Map(target.parts.map((part) => [part.id, part]))
    return {
      ...current,
      parts: current.parts.map((part) => {
        if (partId && part.id !== partId) return part
        if (!posed.has(part.id) && part.id !== partId) return part
        const fresh = byId.get(part.id)
        if (!fresh) return part
        return { ...part, rotation: fresh.rotation, position: fresh.position }
      }),
    }
  }

  if (mode === 'restyle') {
    const styled = finish({ ...current, parts: current.parts }, opts)
    if (!partId) return styled
    const next = styled.parts.find((part) => part.id === partId)
    return {
      ...current,
      parts: current.parts.map((part) => (part.id === partId && next ? next : part)),
    }
  }

  const amp = reshapeAmount(opts.density)
  const request = opts.description.trim()
  const pear = /\bpear|\bteardrop|\bgourd|\bhip/.test(request.toLowerCase())
  const hostId =
    partId ??
    current.parts.find((part) => part.id === 'body')?.id ??
    current.parts[0]?.id ??
    null
  if (pear && hostId && (!partId || partId === hostId || partId === 'body')) {
    return withPearBelly(current, hostId)
  }
  const parts = current.parts.map((part) => {
    if (partId && part.id !== partId) return part
    return reshapeOne(part, request, amp)
  })
  return { ...current, parts }
}
