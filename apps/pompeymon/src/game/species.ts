import type { StarterId } from "./run";

export type WildId =
  | "pidgeon"
  | "squirral"
  | "spikehedge"
  | "starlimur"
  | "busstopper"
  | "chipgull"
  | "donerrat";

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
};
