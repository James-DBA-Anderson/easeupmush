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
    parent: extras?.parent,
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

export function looksLikeCat(text: string): boolean {
  return /\b(cats?|kitten|tabby|tomcat|mogg(?:y|ies)?|calico|siamese|moggy)\b/i.test(text)
}

export function looksLikeSpinnaker(text: string): boolean {
  return /\b(spinnaker|portsmouth\s+tower|gunwharf\s+tower)\b/i.test(text)
}

export function looksLikeTree(text: string): boolean {
  return /\b(trees?|oak|pine|broadleaf|fir|conifer|spruce)\b/i.test(text)
}

export function looksLikeShip(text: string): boolean {
  return /\b(ships?|ferry|ferries|hovercraft|cargo|tanker|warship|frigate|boat|hull)\b/i.test(text)
}

export function looksLikeHarbour(text: string): boolean {
  return /\b(buoy|beacon|bollard|seamark|harbour\s+mark|navigation\s+(?:mark|light)|light(?:house)?\s+post)\b/i.test(text)
}

export function looksLikePower(text: string): boolean {
  return /\b(solar\s+panel|photovoltaic|electricity\s+kiosk|distribution\s+transformer|substation\s+kiosk|grp\s+cabinet)\b/i.test(text)
}

export function looksLikeBarrier(text: string): boolean {
  return /\b(street\s+bollard|park\s+gate|cycle\s+barrier|lift\s+gate|kissing\s+gate)\b/i.test(text)
}

export function looksLikeFurniture(text: string): boolean {
  return /\b(park\s+bench|street\s+waste\s+bin|pillar\s+box|red\s+phone\s+kiosk|cycle\s+parking\s+rack|bus\s+stop\s+flag|traffic\s+signal|picnic\s+table|hanging\s+pub\s+sign|stone\s+war\s+memorial)\b/i.test(text)
}

export function looksLikeLandmark(text: string): boolean {
  return /\b(brick\s+observation\s+tower|factory\s+chimney\s+stack|oil\s+storage\s+tank|dockyard\s+portal\s+crane)\b/i.test(text)
}

function assembleHarbour(opts: PromptOptions): ModelSpec {
  const t = opts.description.toLowerCase()
  const kind = t.includes('bollard') || t.includes('mooring')
    ? 'bollard'
    : t.includes('beacon')
      ? 'beacon'
      : t.includes('light')
        ? 'light'
        : 'buoy'
  const body = t.includes('green') ? '#2f8a4a' : t.includes('red') ? '#c43b3b' : '#d6b23a'
  const pale = '#e8e4d8'
  const lamp = '#f4e27a'
  const parts: ModelPart[] =
    kind === 'bollard'
      ? [
          part('post', 'Post', 'cylinder', [0, 0.48, 0], [0.44, 0.95, 0.44], '#6a6560'),
          part('cap', 'Cap', 'cylinder', [0, 0.98, 0], [0.56, 0.16, 0.56], '#4a453c'),
        ]
      : kind === 'beacon'
        ? [
            part('pile', 'Pile', 'cylinder', [0, 2.2, 0], [0.32, 4.4, 0.32], pale),
            part('deck', 'Deck', 'box', [0, 4.45, 0], [0.7, 0.12, 0.7], '#c9c3b4'),
            part('topmark', 'Topmark', 'cone', [0, 4.85, 0], [0.64, 0.55, 0.64], body),
            part('lamp', 'Lamp', 'box', [0, 5.22, 0], [0.22, 0.22, 0.22], lamp),
          ]
        : kind === 'light'
          ? [
              part('tower', 'Tower', 'cylinder', [0, 2.8, 0], [0.56, 5.6, 0.56], pale),
              part('gallery', 'Gallery', 'box', [0, 5.65, 0], [1.05, 0.12, 1.05], '#c9c3b4'),
              part('lantern', 'Lantern', 'box', [0, 6.1, 0], [0.55, 0.7, 0.55], lamp),
            ]
          : [
              part('can', 'Can', 'cylinder', [0, 0.85, 0], [1.24, 1.35, 1.24], body),
              part('neck', 'Neck', 'cylinder', [0, 1.72, 0], [0.4, 0.7, 0.4], body),
              part('topmark', 'Topmark', 'cone', [0, 2.22, 0], [0.56, 0.42, 0.56], pale),
            ]
  return { name: kind, kind: 'prop', style: opts.style, density: opts.density, parts }
}

function assemblePower(opts: PromptOptions): ModelSpec {
  const t = opts.description.toLowerCase()
  const kind = t.includes('transformer')
    ? 'transformer'
    : t.includes('kiosk') || t.includes('cabinet')
      ? 'kiosk'
      : 'solar'
  const parts: ModelPart[] =
    kind === 'transformer'
      ? [
          part('pad', 'Pad', 'box', [0, 0.08, 0], [1.85, 0.16, 1.22], '#b8b3a8'),
          part('tank', 'Tank', 'box', [0, 0.72, 0], [1.28, 1.12, 0.82], '#6d7178'),
          part('bush', 'Bushing', 'cylinder', [0, 1.48, 0], [0.16, 0.42, 0.16], '#e8e4d8'),
        ]
      : kind === 'kiosk'
        ? [
            part('body', 'Body', 'box', [0, 0.74, 0], [1.18, 1.48, 0.72], '#2f6b45'),
            part('cap', 'Cap', 'box', [0, 1.52, 0], [1.26, 0.08, 0.8], '#245538'),
            part('door', 'Door', 'box', [0, 0.72, 0.38], [0.52, 1.05, 0.06], '#1e1e1c'),
          ]
        : [
            part('frame', 'Frame', 'box', [0, 0.22, 0], [1.68, 0.07, 1.02], '#c5c0b4', {
              rotation: [-0.48, 0, 0],
            }),
            part('glass', 'Glass', 'box', [0, 0.26, 0], [1.56, 0.035, 0.9], '#24355a', {
              rotation: [-0.48, 0, 0],
            }),
          ]
  return { name: kind, kind: 'prop', style: opts.style, density: opts.density, parts }
}

function assembleBarrier(opts: PromptOptions): ModelSpec {
  const t = opts.description.toLowerCase()
  const kind = t.includes('cycle')
    ? 'cycle'
    : t.includes('lift')
      ? 'lift'
      : t.includes('gate')
        ? 'gate'
        : 'bollard'
  const parts: ModelPart[] =
    kind === 'cycle'
      ? [
          part('postl', 'Post', 'cylinder', [-0.42, 0.52, 0], [0.1, 1.05, 0.1], '#6a6e72'),
          part('postr', 'Post', 'cylinder', [0.42, 0.52, 0], [0.1, 1.05, 0.1], '#6a6e72'),
        ]
      : kind === 'lift'
        ? [
            part('post', 'Post', 'box', [0, 0.58, 0], [0.28, 1.15, 0.28], '#6a6e72'),
            part('arm', 'Arm', 'box', [1.22, 1.08, 0], [2.45, 0.1, 0.1], '#e8e4d8'),
          ]
        : kind === 'gate'
          ? [
              part('postl', 'Post', 'box', [-0.95, 0.61, 0], [0.1, 1.22, 0.1], '#6b5340'),
              part('postr', 'Post', 'box', [0.95, 0.61, 0], [0.1, 1.22, 0.1], '#6b5340'),
              part('rail', 'Rail', 'box', [0, 0.82, 0], [1.86, 0.07, 0.06], '#6b5340'),
            ]
          : [
              part('post', 'Post', 'cylinder', [0, 0.41, 0], [0.26, 0.82, 0.26], '#2a2a28'),
              part('band', 'Band', 'cylinder', [0, 0.62, 0], [0.24, 0.12, 0.24], '#e8e4d8'),
            ]
  return { name: kind, kind: 'prop', style: opts.style, density: opts.density, parts }
}

function assembleFurniture(opts: PromptOptions): ModelSpec {
  const t = opts.description.toLowerCase()
  const kind = t.includes('pub')
    ? 'pub'
    : t.includes('memorial')
      ? 'memorial'
      : t.includes('bench')
        ? 'bench'
        : t.includes('bin')
          ? 'bin'
          : t.includes('pillar') || t.includes('postbox')
            ? 'postbox'
            : t.includes('phone')
              ? 'phone'
              : t.includes('rack')
                ? 'rack'
                : t.includes('bus')
                  ? 'bus'
                  : t.includes('signal')
                    ? 'signal'
                    : 'table'
  const parts: ModelPart[] =
    kind === 'pub'
      ? [
          part('pole', 'Pole', 'cylinder', [0, 1.58, 0], [0.1, 3.15, 0.1], '#2a2a28'),
          part('board', 'Board', 'box', [0.62, 2.72, 0], [0.62, 0.52, 0.06], '#1e3a2a'),
        ]
      : kind === 'memorial'
        ? [
            part('plinth', 'Plinth', 'box', [0, 0.36, 0], [1.05, 0.28, 1.05], '#c9c3b4'),
            part('obelisk', 'Obelisk', 'box', [0, 1.72, 0], [0.48, 2.45, 0.48], '#c9c3b4'),
          ]
        : kind === 'postbox'
          ? [part('body', 'Body', 'cylinder', [0, 0.68, 0], [0.56, 1.35, 0.56], '#c8102e')]
          : kind === 'phone'
            ? [part('box', 'Box', 'box', [0, 1.18, 0], [0.92, 2.35, 0.92], '#c8102e')]
            : kind === 'bus'
              ? [
                  part('pole', 'Pole', 'cylinder', [0, 1.58, 0], [0.1, 3.15, 0.1], '#6a6e72'),
                  part('flag', 'Flag', 'box', [0.38, 2.85, 0], [0.72, 0.48, 0.06], '#1e3a5f'),
                ]
              : [
                  part('seat', 'Seat', 'box', [0, 0.46, 0], [1.55, 0.08, 0.48], '#8a6a4a'),
                ]
  return { name: kind, kind: 'prop', style: opts.style, density: opts.density, parts }
}

function assembleLandmark(opts: PromptOptions): ModelSpec {
  const t = opts.description.toLowerCase()
  const kind = t.includes('chimney')
    ? 'chimney'
    : t.includes('tank')
      ? 'tank'
      : t.includes('crane')
        ? 'crane'
        : 'tower'
  const parts: ModelPart[] =
    kind === 'chimney'
      ? [part('stack', 'Stack', 'cylinder', [0, 15.2, 0], [3.2, 30.4, 3.2], '#8a6a52')]
      : kind === 'tank'
        ? [part('tank', 'Tank', 'cylinder', [0, 4.0, 0], [6.4, 7.4, 6.4], '#6d7178')]
        : kind === 'crane'
          ? [
              part('leg', 'Leg', 'box', [-3.4, 8.2, 0], [1.05, 16.4, 1.05], '#4a4e54'),
              part('jib', 'Jib', 'box', [0, 18.35, 4.2], [0.55, 0.55, 18.5], '#4a4e54'),
            ]
          : [
              part('shaft', 'Shaft', 'box', [0, 7.6, 0], [2.6, 15.2, 2.6], '#8a6a52'),
              part('cap', 'Cap', 'cone', [0, 17.95, 0], [1.9, 1.15, 1.9], '#6e5342'),
            ]
  return { name: kind, kind: 'prop', style: opts.style, density: opts.density, parts }
}

function assembleShip(opts: PromptOptions): ModelSpec {
  const t = opts.description.toLowerCase()
  const hull = t.includes('hover')
    ? 'hovercraft'
    : t.includes('cargo') || t.includes('tanker')
      ? 'cargo'
      : t.includes('war') || t.includes('frigate')
        ? 'warship'
        : t.includes('boat')
          ? 'boat'
          : 'ferry'
  const body = hull === 'warship' ? '#3b2a1a' : hull === 'cargo' ? '#6d7178' : '#f4f1ea'
  const stripe = hull === 'warship' ? '#c9a45c' : '#e4572e'
  const parts: ModelPart[] = [
    part('hull', 'Hull', 'box', [0, 0.9, 0], [1.4, 0.9, 4.2], body),
    part('super', 'Superstructure', 'box', [0, 1.7, -0.4], [1.1, 0.7, 2.2], '#f7f4ee'),
    part('stripe', 'Stripe', 'box', [0, 1.35, 0.6], [1.42, 0.16, 2.4], stripe),
    part('bridge', 'Bridge', 'box', [0, 2.2, 1.1], [0.9, 0.45, 0.8], '#d7e7f2'),
  ]
  return { name: hull, kind: 'vehicle', style: opts.style, density: opts.density, parts }
}

function assembleTree(opts: PromptOptions): ModelSpec {
  const pine = /\b(pine|fir|conifer|spruce|needle)\b/i.test(opts.description)
  const trunk = '#6b4a2a'
  const leaf = pine ? '#2f5c32' : '#3f7a3a'
  const bark = { roughness: 0.92, metalness: 0.02 }
  const foliage = { roughness: 0.88, metalness: 0.0 }
  const parts: ModelPart[] = pine
    ? [
        part('trunk', 'Trunk', 'cylinder', [0, 1.6, 0], [0.36, 3.2, 0.36], trunk, bark),
        part('bough-low', 'Lower bough', 'cone', [0, 3.6, 0], [4.2, 2.6, 4.2], leaf, foliage),
        part('bough-mid', 'Mid bough', 'cone', [0, 5.2, 0], [3.1, 2.2, 3.1], leaf, foliage),
        part('bough-top', 'Crown', 'cone', [0, 6.6, 0], [2.1, 1.9, 2.1], leaf, foliage),
      ]
    : [
        part('trunk', 'Trunk', 'cylinder', [0, 1.3, 0], [0.44, 2.6, 0.44], trunk, bark),
        part('canopy', 'Canopy', 'sphere', [0, 4.15, 0], [4.3, 4.0, 4.3], leaf, foliage),
        part('canopy-e', 'East crown', 'sphere', [0.55, 5.05, 0.2], [2.9, 2.6, 2.9], leaf, foliage),
        part('canopy-w', 'West crown', 'sphere', [-0.45, 4.85, -0.35], [2.5, 2.4, 2.5], leaf, foliage),
      ]
  return {
    name: pine ? 'pine tree' : 'broadleaf tree',
    kind: 'prop',
    style: opts.style,
    density: opts.density,
    parts,
  }
}

function assembleSpinnaker(opts: PromptOptions): ModelSpec {
  const white = '#f2f0ea'
  const lattice = '#e4e0d8'
  const glass = '#6f8ea0'
  const concrete = { roughness: 0.82, metalness: 0.05 }
  const glassMat = { roughness: 0.22, metalness: 0.35 }

  const bezier = (
    t: number,
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
  ): [number, number, number] => {
    const u = 1 - t
    return [
      u * u * a[0] + 2 * u * t * b[0] + t * t * c[0],
      u * u * a[1] + 2 * u * t * b[1] + t * t * c[1],
      u * u * a[2] + 2 * u * t * b[2] + t * t * c[2],
    ]
  }

  const samples = (n: number, a: [number, number, number], b: [number, number, number], c: [number, number, number]) =>
    Array.from({ length: n }, (_, i) => bezier(i / (n - 1), a, b, c))

  const beam = (
    id: string,
    label: string,
    a: [number, number, number],
    b: [number, number, number],
    thick: number,
    depth: number,
    color: string,
    shape: 'box' | 'capsule' = 'box',
  ): ModelPart => {
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const dz = b[2] - a[2]
    const len = Math.hypot(dx, dy, dz) || 0.04
    // CapsuleGeometry is squashed in Y by 0.5 in meshFromPart.
    const yScale = shape === 'capsule' ? len * 2 : len
    return part(
      id,
      label,
      shape,
      [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5],
      [thick, yScale, depth],
      color,
      { ...concrete, rotation: [-Math.atan2(dz, dy), 0, Math.atan2(dx, dy)] },
    )
  }

  const chain = (
    id: string,
    label: string,
    pts: [number, number, number][],
    thick: (t: number) => number,
    depth: number,
    color: string,
    shape: 'box' | 'capsule' = 'box',
  ) => {
    const out: ModelPart[] = []
    for (let i = 0; i < pts.length - 1; i++) {
      const t = i / (pts.length - 2)
      out.push(beam(`${id}-${i}`, label, pts[i], pts[i + 1], thick(t), depth, color, shape))
    }
    return out
  }

  // Outer C — the sail lip from the Free3D silhouette.
  const sail = samples(24, [-0.16, 0.07, 0.02], [-0.42, 1.05, 0], [-0.03, 1.9, 0])
  // Crossing inner leg (the other white ribbon).
  const inner = samples(14, [0.16, 0.07, -0.02], [-0.02, 0.95, 0.01], [-0.05, 1.72, 0])
  // Back keel / mast with the upright truss.
  const keel = samples(12, [0.13, 0.07, 0.01], [0.11, 1.05, 0], [0.02, 1.88, 0])

  const parts: ModelPart[] = [
    part('plaza', 'Plaza', 'cylinder', [0, 0.035, 0], [0.42, 0.07, 0.42], '#cfcbc3', concrete),
    ...chain('sail', 'Sail', sail, (t) => 0.09 - t * 0.035, 0.09, white, 'capsule'),
    ...chain('inner', 'Inner leg', inner, (t) => 0.075 - t * 0.03, 0.075, white, 'capsule'),
    ...chain('keel', 'Keel', keel, (t) => 0.055 - t * 0.02, 0.055, white, 'capsule'),
  ]

  const rungCount = 9
  for (let i = 0; i < rungCount; i++) {
    const t = 0.12 + (i / (rungCount - 1)) * 0.62
    const a = bezier(t, sail[0], [-0.42, 1.05, 0], sail[sail.length - 1])
    const b = bezier(Math.min(1, t * 0.92 + 0.08), inner[0], [-0.02, 0.95, 0.01], inner[inner.length - 1])
    parts.push(beam(`rung-${i}`, 'Sail rib', a, b, 0.018, 0.045, lattice))
    if (i < rungCount - 1) {
      const t2 = 0.12 + ((i + 1) / (rungCount - 1)) * 0.62
      const b2 = bezier(
        Math.min(1, t2 * 0.92 + 0.08),
        inner[0],
        [-0.02, 0.95, 0.01],
        inner[inner.length - 1],
      )
      parts.push(beam(`diag-${i}`, 'Sail brace', a, b2, 0.014, 0.03, lattice))
    }
  }

  for (let i = 0; i < 8; i++) {
    const t = 0.18 + (i / 7) * 0.7
    const k = bezier(t, keel[0], [0.11, 1.05, 0], keel[keel.length - 1])
    const span = 0.09 * (1 - t * 0.55)
    parts.push(
      part(
        `keel-rung-${i}`,
        'Keel rung',
        'box',
        [k[0] + 0.02, k[1], k[2]],
        [span, 0.016, 0.016],
        lattice,
        concrete,
      ),
    )
  }

  parts.push(
    part('pod', 'Viewing deck', 'sphere', [-0.07, 1.58, 0], [0.16, 0.13, 0.16], white, concrete),
    part('pod-glass', 'Glazing', 'cylinder', [-0.07, 1.58, 0], [0.17, 0.05, 0.17], glass, glassMat),
    part('spire', 'Spire', 'cone', [-0.01, 2.02, 0], [0.045, 0.28, 0.045], white, {
      ...concrete,
      rotation: [0, 0, 0.18],
    }),
    part('needle', 'Needle', 'cylinder', [0.01, 2.18, 0], [0.012, 0.12, 0.012], white, {
      ...concrete,
      rotation: [0, 0, 0.12],
    }),
  )

  return {
    name: 'Spinnaker Tower',
    kind: 'prop',
    style: opts.style,
    density: opts.density === 'chunky' ? 'medium' : opts.density,
    parts,
  }
}

function assembleCat(opts: PromptOptions): ModelSpec {
  const palette = PALETTES[opts.palette].colors
  const named = parseColours(opts.description)
  const fur = named[0] ?? (opts.palette === 'candy' ? '#d4893a' : palette[0] ?? '#d4893a')
  const cream = named[1] ?? '#f3d7b0'
  const pink = '#e39a96'
  const iris = opts.palette === 'ocean' ? '#3d8f9a' : '#4a9a4e'
  const sit = opts.pose === 'sitting'
  const chibi = opts.style === 'chibi' ? 1 : 0
  const headSize = (sit ? 0.38 : 0.34) + chibi * 0.08
  const bodyY = sit ? 0.42 : 0.5
  const pawH = 0.1
  const pawR = pawH * 0.5
  const frontLen = sit ? 0.3 : 0.4
  const hindLen = sit ? 0.24 : 0.4
  const frontTilt = sit ? 0.08 : 0.04
  const hindTilt = sit ? 0.32 : 0.05
  const hipLocalY = (len: number, tilt: number) => pawR + len * Math.cos(tilt) - bodyY
  const parts: ModelPart[] = [
    part('body', 'Body', 'sphere', [0, bodyY, 0], sit ? [0.44, 0.36, 0.44] : [0.34, 0.3, 0.56], fur),
    part('chest', 'Chest', 'sphere', [0, sit ? 0.08 : 0.04, sit ? 0.12 : 0.18], [0.32, 0.26, 0.28], fur, {
      parent: 'body',
    }),
    part('belly', 'Belly', 'sphere', [0, -0.04, sit ? 0.04 : 0.02], [0.28, 0.2, 0.3], cream, { parent: 'body' }),
    part('neck', 'Neck', 'sphere', [0, sit ? 0.18 : 0.14, sit ? 0.1 : 0.22], [0.22, 0.18, 0.2], fur, {
      parent: 'body',
    }),
    part(
      'head',
      'Head',
      'sphere',
      [0, sit ? 0.28 : 0.2, sit ? 0.12 : 0.3],
      [headSize, headSize * 0.96, headSize * 0.92],
      fur,
      { parent: 'body' },
    ),
    part('cheek-l', 'Cheek', 'sphere', [-0.1, -0.04, 0.08], [0.13, 0.11, 0.12], fur, { parent: 'head' }),
    part('cheek-r', 'Cheek', 'sphere', [0.1, -0.04, 0.08], [0.13, 0.11, 0.12], fur, { parent: 'head' }),
    part('muzzle', 'Muzzle', 'sphere', [0, -0.05, 0.14], [0.15, 0.12, 0.16], cream, { parent: 'head' }),
    part('nose', 'Nose', 'sphere', [0, 0.03, 0.08], [0.05, 0.04, 0.05], pink, { parent: 'muzzle' }),
    part('chin', 'Chin', 'sphere', [0, -0.05, 0.04], [0.1, 0.06, 0.09], cream, { parent: 'muzzle' }),
    part('ear-l', 'Ear', 'cone', [-0.1, headSize * 0.38, -0.02], [0.13, 0.24, 0.09], fur, {
      parent: 'head',
      rotation: [0.08, 0, 0.22],
    }),
    part('ear-r', 'Ear', 'cone', [0.1, headSize * 0.38, -0.02], [0.13, 0.24, 0.09], fur, {
      parent: 'head',
      rotation: [0.08, 0, -0.22],
    }),
    part('ear-in-l', 'Inner ear', 'cone', [0, -0.01, 0.02], [0.06, 0.12, 0.03], pink, { parent: 'ear-l' }),
    part('ear-in-r', 'Inner ear', 'cone', [0, -0.01, 0.02], [0.06, 0.12, 0.03], pink, { parent: 'ear-r' }),
    part('eye-l', 'Eye', 'sphere', [-0.08, 0.03, 0.13], [0.07, 0.08, 0.05], '#f4f0e6', { parent: 'head' }),
    part('eye-r', 'Eye', 'sphere', [0.08, 0.03, 0.13], [0.07, 0.08, 0.05], '#f4f0e6', { parent: 'head' }),
    part('iris-l', 'Iris', 'sphere', [0, 0, 0.022], [0.04, 0.05, 0.022], iris, { parent: 'eye-l' }),
    part('iris-r', 'Iris', 'sphere', [0, 0, 0.022], [0.04, 0.05, 0.022], iris, { parent: 'eye-r' }),
    part('pupil-l', 'Pupil', 'sphere', [0, 0, 0.014], [0.016, 0.032, 0.01], '#1a1814', { parent: 'iris-l' }),
    part('pupil-r', 'Pupil', 'sphere', [0, 0, 0.014], [0.016, 0.032, 0.01], '#1a1814', { parent: 'iris-r' }),
    part(
      'tail',
      'Tail',
      'capsule',
      [0, 0.05, sit ? -0.14 : -0.24],
      [0.1, sit ? 0.34 : 0.4, 0.1],
      fur,
      { parent: 'body', rotation: sit ? [0.95, 0.18, 0.28] : [0.9, 0.1, 0.16] },
    ),
    part('tail-tip', 'Tail tip', 'sphere', [0, sit ? 0.17 : 0.2, 0], [0.1, 0.1, 0.1], cream, { parent: 'tail' }),
  ]

  const hindRot: [number, number, number] = [hindTilt, 0, 0]
  for (const [id, x, z, rot, len] of [
    ['leg-fl', -0.14, sit ? 0.12 : 0.18, [frontTilt, 0, 0.05] as [number, number, number], frontLen],
    ['leg-fr', 0.14, sit ? 0.12 : 0.18, [frontTilt, 0, -0.05] as [number, number, number], frontLen],
    ['leg-bl', -0.14, sit ? -0.1 : -0.16, hindRot, hindLen],
    ['leg-br', 0.14, sit ? -0.1 : -0.16, hindRot, hindLen],
  ] as const) {
    const tilt = rot[0]
    const hipId = `${id}-hip`
    parts.push(
      part(hipId, 'Hip', 'sphere', [x, hipLocalY(len, tilt), z], [0.16, 0.16, 0.16], fur, {
        parent: 'body',
        rotation: rot,
      }),
      part(id, 'Leg', 'capsule', [0, -len * 0.5, 0], [0.13, len, 0.13], fur, { parent: hipId }),
      part(`${id}-paw`, 'Paw', 'sphere', [0, -len * 0.5, 0.02], [0.15, pawH, 0.17], cream, { parent: id }),
    )
  }

  return finish(
    {
      name: opts.description || 'Cat',
      kind: 'creature',
      style: opts.style,
      density: opts.density,
      parts,
    },
    opts,
  )
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

  if (looksLikeCat(opts.description)) return assembleCat(opts)
  if (looksLikeSpinnaker(opts.description)) return assembleSpinnaker(opts)
  if (looksLikeTree(opts.description)) return assembleTree(opts)
  if (looksLikeBarrier(opts.description)) return assembleBarrier(opts)
  if (looksLikeFurniture(opts.description)) return assembleFurniture(opts)
  if (looksLikeLandmark(opts.description)) return assembleLandmark(opts)
  if (looksLikeHarbour(opts.description)) return assembleHarbour(opts)
  if (looksLikePower(opts.description)) return assemblePower(opts)
  if (looksLikeShip(opts.description)) return assembleShip(opts)

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
