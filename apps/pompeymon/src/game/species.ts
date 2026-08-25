import type { StarterId } from "./run";

export type ElemId = "fire" | "wind" | "poison" | "earth" | "water";

export const ELEM_LABEL: Record<ElemId, string> = {
  fire: "FIRE",
  wind: "WIND",
  poison: "POISON",
  earth: "EARTH",
  water: "WATER",
};

export const ELEM_TINT: Record<ElemId, number> = {
  fire: 0xff7040,
  wind: 0xb8e8ff,
  poison: 0xc070e0,
  earth: 0xd4a050,
  water: 0x5090e8,
};

export type WildId =
  | "pidgeon"
  | "squirral"
  | "spikehedge"
  | "starlimur"
  | "busstopper"
  | "chipgull"
  | "donerrat"
  | "kerbite"
  | "honkace"
  | "chalklur"
  | "linelurker"
  | "kitthief";

/** One hidden hunt per wild region — not in the common street pool. */
export const HIDDEN_MON: Record<string, WildId> = {
  highstreet: "kerbite",
  roundabout: "honkace",
  hill: "chalklur",
  island: "linelurker",
  school: "kitthief",
};

export const HIDDEN_IDS = new Set<WildId>(Object.values(HIDDEN_MON));

/** Street / early-route wilds. Regular trainers mostly use these. */
export const COMMON_WILDS: WildId[] = [
  "pidgeon",
  "squirral",
  "spikehedge",
  "starlimur",
  "busstopper",
  "chipgull",
  "donerrat",
];

export type SpeciesId = StarterId | WildId;

export const SPECIES: Record<SpeciesId, { name: string; kind: string }> = {
  scabfox: { name: "SCABFOX", kind: "Rec fox." },
  chipgull: { name: "CHIPGULL", kind: "Chip thief." },
  moggit: { name: "MOGGIT", kind: "Precinct cat." },
  donerrat: { name: "DONERRAT", kind: "Kebab-shop rat." },
  pidgeon: { name: "PIDGEON", kind: "Fat town bird." },
  squirral: { name: "SQUIRRAL", kind: "Park lunatic." },
  spikehedge: { name: "SPIKEHEDGE", kind: "Rolls into a ball." },
  starlimur: { name: "STARLIMUR", kind: "Estate starling." },
  busstopper: { name: "BUSSTOPPER", kind: "Lives at the shelter." },
  kerbite: { name: "KERBITE", kind: "Gutter bite." },
  honkace: { name: "HONKACE", kind: "Wrong bird." },
  chalklur: { name: "CHALKLUR", kind: "Pale as the hill." },
  linelurker: { name: "LINELURKER", kind: "Keeps to the ditch." },
  kitthief: { name: "KITTHIEF", kind: "Nicks kit." },
};
