/** Preview figure Linebench (and games) can hang a character on. */
export type DialogueFigure =
  | 'warden'
  | 'boatman'
  | 'gardener'
  | 'public'
  | 'kid'
  | 'bill'

export type DialogueLine = {
  id: string
  set: string
  text: string
}

export type DialogueCharacter = {
  id: string
  name: string
  /** In-game radio / message sender, e.g. "DEPOT". */
  sender?: string
  role: string
  figure: DialogueFigure
  lines: DialogueLine[]
}

export type DialogueCatalog = {
  id: string
  name: string
  characters: DialogueCharacter[]
}

export function slugify(text: string): string {
  const s = text
    .toLowerCase()
    .replace(/\{where\}/g, 'where')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
  return s || 'line'
}

export function pack(set: string, texts: string[]): DialogueLine[] {
  const used = new Set<string>()
  return texts.map((text) => {
    const base = `${slugify(set)}-${slugify(text)}`.slice(0, 80)
    let id = base
    let n = 2
    while (used.has(id)) {
      id = `${base.slice(0, 76)}-${n++}`
    }
    used.add(id)
    return { id, set, text }
  })
}

export function characterOf(
  catalog: DialogueCatalog,
  characterId: string,
): DialogueCharacter {
  const found = catalog.characters.find((c) => c.id === characterId)
  if (!found) throw new Error(`Unknown dialogue character "${characterId}"`)
  return found
}

export function linesOf(
  catalog: DialogueCatalog,
  characterId: string,
  set: string,
): readonly string[] {
  const texts = characterOf(catalog, characterId)
    .lines.filter((l) => l.set === set)
    .map((l) => l.text)
  if (texts.length === 0) {
    throw new Error(`No dialogue lines for ${characterId}/${set}`)
  }
  return texts
}

export function pickOf(
  catalog: DialogueCatalog,
  characterId: string,
  set: string,
): string {
  const texts = linesOf(catalog, characterId, set)
  return texts[Math.floor(Math.random() * texts.length)]!
}

export function senderOf(
  catalog: DialogueCatalog,
  characterId: string,
): string {
  const c = characterOf(catalog, characterId)
  return c.sender ?? c.name.toUpperCase()
}

/** One recorded take Linebench has marked to play in-game. */
export type LiveVoiceClip = {
  characterId: string
  lineId: string
  set: string
  text: string
  file: string
  takeId: string
  /** Extra gain Linebench set so takes sit at the same in-game level. */
  gainDb?: number
}

export type LiveVoiceManifest = {
  updatedAt: string
  clips: LiveVoiceClip[]
}
