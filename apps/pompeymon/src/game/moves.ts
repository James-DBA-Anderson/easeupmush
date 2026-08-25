import type { ElemId, SpeciesId } from "./species";

export const MAX_MOVES = 6;

/** How a move behaves in a turn. */
export type MoveKind = "attack" | "quick" | "defend" | "drain" | "poison" | "speed";

export type MoveDef = {
  id: string;
  name: string;
  kind: MoveKind;
  /** Damage power. 0 for pure status. */
  pow: number;
  acc?: number;
  /** % chance to poison on a damaging hit. */
  poison?: number;
  /** Stamina pips stolen on hit (drain). */
  drain?: number;
  /** Flat speed added for the rest of the fight (speed). */
  boost?: number;
  /** Takeaway evolution type. */
  elem?: ElemId;
};

export const MOVES: Record<string, MoveDef> = {
  // Shared / early
  nibble: { id: "nibble", name: "NIBBLE", kind: "attack", pow: 14 },
  scratch: { id: "scratch", name: "SCRATCH", kind: "attack", pow: 18 },
  peck: { id: "peck", name: "PECK", kind: "attack", pow: 16, acc: 85 },
  wing: { id: "wing", name: "WING", kind: "attack", pow: 14 },
  nut: { id: "nut", name: "NUT", kind: "attack", pow: 15 },
  roll: { id: "roll", name: "ROLL", kind: "attack", pow: 16 },
  bark: { id: "bark", name: "BARK", kind: "attack", pow: 18 },
  scrape: { id: "scrape", name: "SCRAPE", kind: "attack", pow: 15 },

  // Signature / poison
  bin_tip: { id: "bin_tip", name: "BIN TIP", kind: "poison", pow: 18, poison: 30 },
  gutter: { id: "gutter", name: "GUTTER", kind: "poison", pow: 16, poison: 40 },
  reek: { id: "reek", name: "REEK", kind: "poison", pow: 12, poison: 50, acc: 85 },

  // Quick
  dart: { id: "dart", name: "DART", kind: "quick", pow: 15, acc: 85 },
  dart_in: { id: "dart_in", name: "DART IN", kind: "quick", pow: 14 },
  dash: { id: "dash", name: "DASH", kind: "quick", pow: 16 },
  zip_peck: { id: "zip_peck", name: "ZIP PECK", kind: "quick", pow: 14, acc: 90 },
  lunge: { id: "lunge", name: "LUNGE", kind: "quick", pow: 17 },

  // Defend
  curl: { id: "curl", name: "CURL", kind: "defend", pow: 0 },
  brace: { id: "brace", name: "BRACE", kind: "defend", pow: 0 },
  fluff: { id: "fluff", name: "FLUFF", kind: "defend", pow: 0 },
  hunker: { id: "hunker", name: "HUNKER", kind: "defend", pow: 0 },

  // Drain stamina
  snatch: { id: "snatch", name: "SNATCH", kind: "drain", pow: 12, drain: 1 },
  nick: { id: "nick", name: "NICK", kind: "drain", pow: 10, drain: 1 },
  mug: { id: "mug", name: "MUG", kind: "drain", pow: 14, drain: 1 },

  // Speed up
  zip: { id: "zip", name: "ZIP", kind: "speed", pow: 0, boost: 4 },
  wind: { id: "wind", name: "WIND UP", kind: "speed", pow: 0, boost: 5 },
  scamper: { id: "scamper", name: "SCAMPER", kind: "speed", pow: 0, boost: 4 },

  chilli: { id: "chilli", name: "CHILLI", kind: "attack", pow: 20, elem: "fire" },
  puff: { id: "puff", name: "PUFF", kind: "quick", pow: 16, elem: "wind" },
  grease: { id: "grease", name: "GREASE", kind: "poison", pow: 16, poison: 35, elem: "poison" },
  grit: { id: "grit", name: "GRIT", kind: "attack", pow: 18, elem: "earth" },
  batter: { id: "batter", name: "BATTER", kind: "attack", pow: 18, elem: "water" },
};

type Learn = { lv: number; move: string };

/** Level-ordered learnsets. First 1–2 at low lv are starters; later levels unlock more. Cap 6. */
export const LEARNSETS: Record<SpeciesId, Learn[]> = {
  scabfox: [
    { lv: 1, move: "scrape" },
    { lv: 1, move: "bin_tip" },
    { lv: 7, move: "brace" },
    { lv: 10, move: "dash" },
    { lv: 14, move: "nick" },
    { lv: 18, move: "gutter" },
    { lv: 24, move: "scamper" },
  ],
  chipgull: [
    { lv: 1, move: "peck" },
    { lv: 1, move: "snatch" },
    { lv: 6, move: "zip_peck" },
    { lv: 9, move: "fluff" },
    { lv: 13, move: "reek" },
    { lv: 17, move: "wind" },
    { lv: 22, move: "mug" },
  ],
  moggit: [
    { lv: 1, move: "scratch" },
    { lv: 1, move: "dash" },
    { lv: 8, move: "brace" },
    { lv: 11, move: "nick" },
    { lv: 15, move: "scamper" },
    { lv: 19, move: "lunge" },
    { lv: 25, move: "gutter" },
  ],
  donerrat: [
    { lv: 1, move: "nibble" },
    { lv: 1, move: "dart_in" },
    { lv: 7, move: "snatch" },
    { lv: 10, move: "reek" },
    { lv: 14, move: "zip" },
    { lv: 18, move: "hunker" },
    { lv: 23, move: "mug" },
  ],
  pidgeon: [
    { lv: 1, move: "wing" },
    { lv: 6, move: "fluff" },
    { lv: 9, move: "zip_peck" },
    { lv: 12, move: "wind" },
    { lv: 16, move: "nick" },
    { lv: 21, move: "lunge" },
  ],
  squirral: [
    { lv: 1, move: "nut" },
    { lv: 5, move: "zip" },
    { lv: 8, move: "dash" },
    { lv: 12, move: "brace" },
    { lv: 16, move: "snatch" },
    { lv: 20, move: "scamper" },
  ],
  spikehedge: [
    { lv: 1, move: "roll" },
    { lv: 1, move: "curl" },
    { lv: 8, move: "hunker" },
    { lv: 11, move: "lunge" },
    { lv: 15, move: "brace" },
    { lv: 19, move: "mug" },
  ],
  starlimur: [
    { lv: 1, move: "dart" },
    { lv: 6, move: "peck" },
    { lv: 9, move: "zip" },
    { lv: 13, move: "snatch" },
    { lv: 17, move: "fluff" },
    { lv: 22, move: "wind" },
  ],
  busstopper: [
    { lv: 1, move: "bark" },
    { lv: 7, move: "hunker" },
    { lv: 10, move: "scratch" },
    { lv: 14, move: "lunge" },
    { lv: 18, move: "nick" },
    { lv: 24, move: "brace" },
  ],
  kerbite: [
    { lv: 1, move: "nibble" },
    { lv: 1, move: "gutter" },
    { lv: 8, move: "dart_in" },
    { lv: 12, move: "reek" },
    { lv: 16, move: "zip" },
    { lv: 22, move: "mug" },
  ],
  honkace: [
    { lv: 1, move: "wing" },
    { lv: 1, move: "bark" },
    { lv: 8, move: "lunge" },
    { lv: 12, move: "hunker" },
    { lv: 16, move: "wind" },
    { lv: 22, move: "mug" },
  ],
  chalklur: [
    { lv: 1, move: "roll" },
    { lv: 1, move: "curl" },
    { lv: 8, move: "scratch" },
    { lv: 12, move: "hunker" },
    { lv: 16, move: "brace" },
    { lv: 22, move: "lunge" },
  ],
  linelurker: [
    { lv: 1, move: "roll" },
    { lv: 1, move: "hunker" },
    { lv: 9, move: "scratch" },
    { lv: 13, move: "brace" },
    { lv: 17, move: "mug" },
    { lv: 23, move: "lunge" },
  ],
  kitthief: [
    { lv: 1, move: "scratch" },
    { lv: 1, move: "snatch" },
    { lv: 8, move: "dash" },
    { lv: 12, move: "nick" },
    { lv: 16, move: "scamper" },
    { lv: 22, move: "mug" },
  ],
};

export function moveById(id: string): MoveDef | undefined {
  return MOVES[id];
}

/** Moves known at this level, oldest first, capped at MAX_MOVES (keeps newest if over). */
export function movesForLevel(id: SpeciesId, lv: number): MoveDef[] {
  const known: MoveDef[] = [];
  for (const row of LEARNSETS[id]) {
    if (row.lv > lv) continue;
    const m = MOVES[row.move];
    if (!m) continue;
    if (known.some((k) => k.id === m.id)) continue;
    known.push(m);
  }
  if (known.length <= MAX_MOVES) return known;
  return known.slice(known.length - MAX_MOVES);
}

export function moveIdsForLevel(id: SpeciesId, lv: number): string[] {
  return movesForLevel(id, lv).map((m) => m.id);
}

/** New move unlocked exactly at this level, if any. */
export function moveLearnedAt(id: SpeciesId, lv: number): MoveDef | undefined {
  const row = LEARNSETS[id].find((e) => e.lv === lv);
  return row ? MOVES[row.move] : undefined;
}

export function resolveMoves(ids: string[]): MoveDef[] {
  const out: MoveDef[] = [];
  for (const id of ids) {
    const m = MOVES[id];
    if (m && !out.some((k) => k.id === m.id)) out.push(m);
  }
  return out.slice(0, MAX_MOVES);
}

/** Priority for turn order. Quick strikes go first. */
export function movePriority(m: MoveDef): number {
  return m.kind === "quick" ? 1 : 0;
}

export function isDamaging(m: MoveDef): boolean {
  return m.pow > 0 && m.kind !== "defend" && m.kind !== "speed";
}
