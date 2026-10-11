export type {
  DialogueCatalog as GameCatalog,
  DialogueCharacter as Character,
  DialogueFigure as FigureKind,
  DialogueLine,
} from '@easeupmush/shared/dialogue'

export type Take = {
  id: string
  file: string
  createdAt: string
  durationMs: number
  mime: string
  bytes: number
  peakDb?: number
  rmsDb?: number
  gainDb?: number
}
