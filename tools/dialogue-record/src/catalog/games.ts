import { catalog as canoeLake } from '@easeupmush/canoe-lake-cleanup/dialogue'
import { catalog as backflipBill } from '@easeupmush/backflip-bill/dialogue'
import { catalog as simpompey } from '@easeupmush/simpompey/dialogue'
import type { DialogueCatalog } from '@easeupmush/shared/dialogue'

/** Games that ship a `src/dialogue` catalog Linebench can import. */
export const GAMES: DialogueCatalog[] = [canoeLake, backflipBill, simpompey]
