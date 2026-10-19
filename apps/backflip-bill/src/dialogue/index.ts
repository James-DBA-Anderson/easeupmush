import { linesOf } from "@easeupmush/shared/dialogue";
import { catalog } from "./catalog";

export { catalog };
export type {
  DialogueCatalog,
  DialogueCharacter,
  DialogueFigure,
  DialogueLine,
} from "@easeupmush/shared/dialogue";

/** All texts in a set — Linebench records these; the game picks from them. */
export function lines(characterId: string, set: string): readonly string[] {
  return linesOf(catalog, characterId, set);
}
