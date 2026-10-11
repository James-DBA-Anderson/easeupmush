import {
  linesOf,
  pickOf,
  senderOf,
} from '@easeupmush/shared/dialogue'
import { catalog } from './catalog'

export { catalog }
export type {
  DialogueCatalog,
  DialogueCharacter,
  DialogueFigure,
  DialogueLine,
} from '@easeupmush/shared/dialogue'

/** All texts in a set — use with `say(lines(...))` that already picks. */
export function lines(characterId: string, set: string): readonly string[] {
  return linesOf(catalog, characterId, set)
}

/** One random line from a set. Singleton sets always return that line. */
export function line(characterId: string, set: string): string {
  return pickOf(catalog, characterId, set)
}

export function sender(characterId: string): string {
  return senderOf(catalog, characterId)
}

export function radio(
  characterId: string,
  set: string,
): { from: string; text: string } {
  return { from: sender(characterId), text: line(characterId, set) }
}
