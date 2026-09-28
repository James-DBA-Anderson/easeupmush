export type Kind = 'character' | 'creature' | 'prop' | 'vehicle' | 'food'
export type ArtStyle = 'clay' | 'low-poly' | 'chibi' | 'plush' | 'voxel' | 'toy'
export type Pose = 'idle' | 'standing' | 'sitting' | 'action'
export type Palette = 'candy' | 'earth' | 'ocean' | 'neon' | 'mono'
export type Density = 'chunky' | 'medium' | 'fine'

export type PromptOptions = {
  description: string
  kind: Kind
  style: ArtStyle
  pose: Pose
  palette: Palette
  density: Density
}

export const KINDS: Record<Kind, { label: string; hint: string; prompt: string }> = {
  character: {
    label: 'Character',
    hint: 'Hero, NPC, mascot',
    prompt: 'single game character, full figure, readable silhouette',
  },
  creature: {
    label: 'Creature',
    hint: 'Critter or monster',
    prompt: 'single game creature, four legs or cute monster, full body',
  },
  prop: {
    label: 'Prop',
    hint: 'Crate, lamp, tool',
    prompt: 'single game prop, object only, no character',
  },
  vehicle: {
    label: 'Vehicle',
    hint: 'Kart, boat, bike',
    prompt: 'single small game vehicle, toy scale, side-readable',
  },
  food: {
    label: 'Food',
    hint: 'Cake, fruit, snack',
    prompt: 'single stylised food item for a game, object only',
  },
}

export const ART_STYLES: Record<ArtStyle, { label: string; hint: string; prompt: string }> = {
  clay: {
    label: 'Clay',
    hint: 'Soft rounded sculpt',
    prompt: 'clay sculpture, rounded forms, fingerprint-soft surfaces, studio clay render',
  },
  'low-poly': {
    label: 'Low poly',
    hint: 'Faceted game mesh',
    prompt: 'low-poly 3D game asset, faceted shading, clean topology, modest triangle count',
  },
  chibi: {
    label: 'Chibi',
    hint: 'Big head, short body',
    prompt: 'chibi 3D game character, oversized head, short limbs, cute proportions',
  },
  plush: {
    label: 'Plush',
    hint: 'Stuffed-toy look',
    prompt: 'plush stuffed toy 3D model, sewn seams, soft fabric, sitting toy',
  },
  voxel: {
    label: 'Voxel',
    hint: 'Chunky cubes',
    prompt: 'voxel 3D game model, cubic blocks, Minecraft-like, chunky pixels in 3D',
  },
  toy: {
    label: 'Toy',
    hint: 'Plastic collectible',
    prompt: 'vinyl toy 3D model, glossy plastic, collectible figure, clean paint',
  },
}

export const POSES: Record<Pose, { label: string; prompt: string }> = {
  idle: { label: 'Idle', prompt: 'neutral idle pose' },
  standing: { label: 'Stand', prompt: 'standing upright, grounded' },
  sitting: { label: 'Sit', prompt: 'sitting, compact pose' },
  action: { label: 'Action', prompt: 'dynamic action pose, one limb raised' },
}

export const PALETTES: Record<Palette, { label: string; prompt: string; colors: string[] }> = {
  candy: {
    label: 'Candy',
    prompt: 'candy colours, pink, mint, butter yellow',
    colors: ['#ff7ab6', '#7dffb3', '#ffe066', '#ff9f6b', '#fff4e8'],
  },
  earth: {
    label: 'Earth',
    prompt: 'earth pigments, clay brown, moss, cream',
    colors: ['#c47a4a', '#6b8f71', '#e8d5b7', '#5c4033', '#f4efe6'],
  },
  ocean: {
    label: 'Ocean',
    prompt: 'ocean palette, teal, foam white, deep navy',
    colors: ['#2aa9a1', '#7ad7ff', '#0b3d4a', '#e8fbff', '#f4a261'],
  },
  neon: {
    label: 'Neon',
    prompt: 'neon arcade colours, magenta, cyan, acid yellow',
    colors: ['#ff2bd6', '#2bfff2', '#f5ff3d', '#1a1030', '#ffffff'],
  },
  mono: {
    label: 'Mono',
    prompt: 'limited monochrome, charcoal and bone',
    colors: ['#2a2a28', '#6f6d68', '#d9d4c8', '#f3efe6', '#111110'],
  },
}

export const DENSITIES: Record<Density, { label: string; prompt: string }> = {
  chunky: { label: 'Chunky', prompt: 'very few large forms, chunky silhouette' },
  medium: { label: 'Medium', prompt: 'clear primary forms, some secondary detail' },
  fine: { label: 'Fine', prompt: 'more parts and trim, still game-readable' },
}

export const MODEL_NEGATIVE =
  'photoreal human, extra limbs, multiple objects, watermark, text, logo, scene, landscape, camera, realistic skin pores'

export const EXAMPLES = [
  'ginger tabby cat',
  'pink lop-eared bunny in a little waistcoat',
  'fat sausage dog with a yellow belly',
  'lollipop platform with a bite taken out',
  'tiny milk-float ice cream van',
  'slice of carrot cake with cream cheese icing',
]

export function buildModelPrompt(opts: PromptOptions): string {
  const kind = KINDS[opts.kind]
  const style = ART_STYLES[opts.style]
  const pose = POSES[opts.pose]
  const palette = PALETTES[opts.palette]
  const density = DENSITIES[opts.density]
  const subject = opts.description.trim() || 'stylised game mascot'
  return [
    `3D game-ready asset of ${subject}.`,
    kind.prompt,
    style.prompt,
    pose.prompt,
    palette.prompt,
    density.prompt,
    'centred on a ground plane, no background, no stand, hero object only.',
  ].join(' ')
}

export function buildRevisePrompt(opts: PromptOptions): string {
  return [
    'Revise the existing 3D model in place.',
    'Match this target brief:',
    buildModelPrompt(opts),
    'Keep current part ids and the recognisable silhouette unless the brief requires a change.',
  ].join(' ')
}

export type AlterMode = 'recolour' | 'restyle' | 'pose' | 'add' | 'remove' | 'reshape'

export const ALTER_MODES: Record<
  AlterMode,
  { label: string; hint: string; placeholder: string; prompt: string }
> = {
  recolour: {
    label: 'Recolour',
    hint: 'Paint',
    placeholder: 'e.g. mint ears, mustard waistcoat…',
    prompt: 'recolour only, keep shapes and pose',
  },
  restyle: {
    label: 'Restyle',
    hint: 'Look',
    placeholder: 'e.g. more like a vinyl toy…',
    prompt: 'change surface style and material, keep identity',
  },
  pose: {
    label: 'Pose',
    hint: 'Stance',
    placeholder: 'e.g. wave the right arm…',
    prompt: 'change pose and limb angles, keep colours and style',
  },
  add: {
    label: 'Add',
    hint: 'New part',
    placeholder: 'e.g. a tiny bow tie…',
    prompt: 'add a part, do not replace existing parts',
  },
  remove: {
    label: 'Remove',
    hint: 'Drop part',
    placeholder: 'e.g. take off the tail…',
    prompt: 'remove the targeted part only',
  },
  reshape: {
    label: 'Reshape',
    hint: 'Form',
    placeholder: 'e.g. pear shaped, taller, rounder…',
    prompt: 'reshape scale and form, keep colours unless asked',
  },
}

export const NAMED_COLOURS: Record<string, string> = {
  'hot pink': '#ff4fa3',
  'light blue': '#7ad7ff',
  'sky blue': '#7ad7ff',
  'navy': '#0b3d4a',
  crimson: '#c41e3a',
  scarlet: '#ff2400',
  red: '#e23d28',
  pink: '#ff7ab6',
  magenta: '#ff2bd6',
  purple: '#7b3cff',
  violet: '#7b3cff',
  lilac: '#c9a7ff',
  blue: '#3d7dff',
  cyan: '#2bfff2',
  teal: '#2aa9a1',
  aqua: '#2aa9a1',
  mint: '#7dffb3',
  green: '#3d9e4a',
  moss: '#6b8f71',
  olive: '#6b8f3d',
  yellow: '#ffe066',
  gold: '#e6b422',
  mustard: '#c9a227',
  orange: '#ff9f6b',
  peach: '#ffc4a8',
  brown: '#c47a4a',
  clay: '#c47a4a',
  tan: '#d4a574',
  cream: '#f4efe6',
  ivory: '#f4efe6',
  white: '#f8f4ea',
  grey: '#6f6d68',
  gray: '#6f6d68',
  charcoal: '#2a2a28',
  black: '#111110',
  silver: '#c5c8ce',
}

function expandHex(value: string): string | null {
  const raw = value.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(raw)) return raw
  const short = raw.match(/^#([0-9a-f]{3})$/)
  if (!short) return null
  const [r, g, b] = short[1]
  return `#${r}${r}${g}${g}${b}${b}`
}

export function parseColours(text: string): string[] {
  const source = text.toLowerCase()
  const found: string[] = []
  const push = (hex: string) => {
    if (!found.includes(hex)) found.push(hex)
  }
  for (const match of source.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/g)) {
    const hex = expandHex(`#${match[1]}`)
    if (hex) push(hex)
  }
  const names = Object.keys(NAMED_COLOURS).sort((a, b) => b.length - a.length)
  for (const name of names) {
    const pattern = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')
    if (new RegExp(`(^|[^a-z])${pattern}([^a-z]|$)`, 'i').test(source)) {
      push(NAMED_COLOURS[name])
    }
  }
  return found
}

export function buildAlterPrompt(args: {
  change: string
  mode: AlterMode
  partId: string | null
  partLabel: string | null
  style: ArtStyle
  pose: Pose
  palette: Palette
}): string {
  const mode = ALTER_MODES[args.mode]
  const scope = args.partId
    ? `only the part "${args.partLabel ?? args.partId}" (id ${args.partId})`
    : 'the whole model'
  const extras: string[] = [mode.prompt]
  if (args.mode === 'recolour') {
    const named = parseColours(args.change)
    extras.push(
      named.length
        ? `use ${named.join(', ')}, ignore the palette chips`
        : PALETTES[args.palette].prompt,
    )
  }
  if (args.mode === 'restyle') extras.push(ART_STYLES[args.style].prompt)
  if (args.mode === 'reshape') {
    const change = args.change.toLowerCase()
    extras.push(
      /\bpear|\bteardrop|\bgourd/.test(change)
        ? 'wide at the base, narrower at the top, pear silhouette'
        : 'change this part’s scale and primitive to match the request',
    )
  }
  if (args.mode === 'pose') extras.push(POSES[args.pose].prompt)
  const request = args.change.trim() || 'Apply the selected options.'
  return [
    `Alter the existing 3D model in place.`,
    `Scope: ${scope}.`,
    `Action: ${mode.label}.`,
    extras.join('. ') + '.',
    `Request: ${request}`,
    'Keep every other part as it is unless the request needs it changed.',
  ].join(' ')
}

export function isKind(value: string): value is Kind {
  return Object.hasOwn(KINDS, value)
}

export function isArtStyle(value: string): value is ArtStyle {
  return Object.hasOwn(ART_STYLES, value)
}

export function isPose(value: string): value is Pose {
  return Object.hasOwn(POSES, value)
}

export function isPalette(value: string): value is Palette {
  return Object.hasOwn(PALETTES, value)
}

export function isDensity(value: string): value is Density {
  return Object.hasOwn(DENSITIES, value)
}
