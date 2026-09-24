export type ArtStyle =
  | 'pixel-16'
  | 'pixel-32'
  | 'chibi'
  | 'hand-painted'
  | 'flat-vector'
  | 'comic-ink'

export type Facing = 'front' | 'three-quarter' | 'side' | 'back'
export type Pose = 'idle' | 'walk' | 'attack' | 'cast' | 'hurt' | 'victory'

export const ART_STYLES: Record<
  ArtStyle,
  { label: string; hint: string; prompt: string }
> = {
  'pixel-16': {
    label: 'Pixel 16-bit',
    hint: 'Classic SNES-era look',
    prompt:
      '16-bit pixel art game sprite, limited color palette, crisp pixels, no anti-aliasing, retro RPG style',
  },
  'pixel-32': {
    label: 'Pixel 32-bit',
    hint: 'Higher-res pixel art',
    prompt:
      '32-bit pixel art game sprite, detailed pixel shading, clean silhouette, indie game style',
  },
  chibi: {
    label: 'Chibi',
    hint: 'Big head, short body',
    prompt:
      'chibi game character sprite, oversized head, short proportions, cute stylized features, clean cel shading',
  },
  'hand-painted': {
    label: 'Hand-painted',
    hint: 'Painterly fantasy look',
    prompt:
      'hand-painted 2D game character sprite, soft brush textures, fantasy illustration style, readable silhouette',
  },
  'flat-vector': {
    label: 'Flat vector',
    hint: 'Clean modern shapes',
    prompt:
      'flat vector 2D game character sprite, bold shapes, minimal gradients, clean outlines, modern mobile game style',
  },
  'comic-ink': {
    label: 'Comic ink',
    hint: 'Bold inked lines',
    prompt:
      'comic book inked 2D game character sprite, strong black outlines, cel shaded colors, dynamic graphic style',
  },
}

export const FACINGS: Record<Facing, { label: string; prompt: string }> = {
  front: { label: 'Front', prompt: 'facing camera, front view' },
  'three-quarter': {
    label: '3/4',
    prompt: 'three-quarter view, slightly turned',
  },
  side: { label: 'Side', prompt: 'side profile view' },
  back: { label: 'Back', prompt: 'rear view, back facing camera' },
}

export const POSES: Record<Pose, { label: string; prompt: string }> = {
  idle: { label: 'Idle', prompt: 'neutral idle stance' },
  walk: { label: 'Walk', prompt: 'mid-walk pose, one foot forward' },
  attack: { label: 'Attack', prompt: 'attack pose, striking forward' },
  cast: { label: 'Cast', prompt: 'spellcasting pose, hands raised' },
  hurt: { label: 'Hurt', prompt: 'recoil hurt pose' },
  victory: { label: 'Victory', prompt: 'victory pose, triumphant' },
}

export const SIZE_PRESETS = [
  { label: '512²', width: 512, height: 512 },
  { label: '768²', width: 768, height: 768 },
  { label: '1024²', width: 1024, height: 1024 },
  { label: 'Portrait', width: 512, height: 768 },
] as const

const SPRITE_NEGATIVE =
  'photorealistic, photo, 3d render, blurry, low quality, watermark, text, logo, signature, multiple characters, twins, extra limbs, extra fingers, deformed face, mutated hands, cropped, cut off feet, busy background, scenery, landscape, room interior, floor shadow, jpeg artifacts'

export function buildSpritePrompt(input: {
  description: string
  style: ArtStyle
  facing: Facing
  pose: Pose
  transparentHint?: boolean
}): string {
  const description = input.description.trim()
  const style = ART_STYLES[input.style].prompt
  const facing = FACINGS[input.facing].prompt
  const pose = POSES[input.pose].prompt
  const bg = input.transparentHint
    ? 'plain solid chroma-key green background, even lighting, no cast shadows'
    : 'plain solid off-white background, no scenery, no floor'

  return [
    'single 2D game character, full body head to feet, centered, character concept art',
    style,
    description,
    `${facing}, ${pose}`,
    bg,
    'clear silhouette, one character only',
  ]
    .filter(Boolean)
    .join(', ')
}

export { SPRITE_NEGATIVE }
