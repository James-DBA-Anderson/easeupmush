import { BATTLE, MAX_LV, STARTER_LV, scaled, xpToNext } from "./battle";
import type { OutfitId } from "./sprites/kid";
import { SPECIES, type SpeciesId } from "./species";

export type ItemId = "pogs" | "flyer" | "pompdex" | "kebab" | "chomp";
export type StarterId = "scabfox" | "chipgull" | "moggit" | "donerrat";

export type PartyMon = {
  id: SpeciesId;
  lv: number;
  xp: number;
  hp: number;
};

export type BagEntry = { kind: "item"; id: ItemId } | { kind: "mon"; mon: PartyMon };

export const ITEM: Record<ItemId, { label: string; line: string; heal?: boolean }> = {
  pogs: { label: "POGS", line: "Pogs. Slammer's in there." },
  flyer: {
    label: "FLYER",
    line: "Professor Choke's. New trainers wanted.",
  },
  pompdex: { label: "POMPDEX", line: "Head to Pompey. Catch Pompeymon." },
  kebab: { label: "KEBAB", line: "Choke's kebab boxes. Put one down when they're weak." },
  chomp: { label: "CHOMP", line: "Choke's Chomp. Restores HP.", heal: true },
};

/** In-memory run. No server. Continue codes later. */
export const run = {
  outfit: "pj" as OutfitId,
  dressed: false,
  hasBag: false,
  items: [] as ItemId[],
  steveGone: false,
  flyerOnRoad: false,
  starter: null as StarterId | null,
  refusedStarters: false,
  seen: [] as SpeciesId[],
  owned: [] as SpeciesId[],
  party: [] as PartyMon[],
  islandPos: null as { x: number; y: number } | null,
  overworld: null as { scene: string; x: number; y: number } | null,
  beaten: [] as string[],
  grassCalm: 0,
  kebabBoxes: 0,
  kebabCatch: false,
  whiteout: false,
  chompKept: false,
};

export function consumeWhiteout(): boolean {
  if (!run.whiteout) return false;
  run.whiteout = false;
  run.overworld = null;
  healParty();
  return true;
}

export function makePartyMon(id: SpeciesId, lv: number): PartyMon {
  const n = Math.max(1, Math.min(MAX_LV, lv));
  return { id, lv: n, xp: 0, hp: scaled(BATTLE[id].hp, n) };
}

export function partnerMon(): PartyMon | undefined {
  return run.party.find((p) => p.id === run.starter) ?? run.party[0];
}

export function healParty(): void {
  for (const p of run.party) p.hp = scaled(BATTLE[p.id].hp, p.lv);
}

export function applyXp(mon: PartyMon, gained: number): string[] {
  const lines: string[] = [];
  if (mon.lv >= MAX_LV || gained <= 0) return lines;
  mon.xp += gained;
  while (mon.lv < MAX_LV) {
    const need = xpToNext(mon.lv);
    if (mon.xp < need) break;
    mon.xp -= need;
    mon.lv += 1;
    mon.hp = scaled(BATTLE[mon.id].hp, mon.lv);
    lines.push(`${SPECIES[mon.id].name} grew to Lv${mon.lv}!`);
  }
  if (mon.lv >= MAX_LV) mon.xp = 0;
  return lines;
}

export function saveOverworld(scene: string, pos: { x: number; y: number }): void {
  run.overworld = { scene, x: pos.x, y: pos.y };
  if (scene === "island") run.islandPos = { x: pos.x, y: pos.y };
}

export function resumePos(scene: string, fallback: { x: number; y: number }): { x: number; y: number } {
  if (run.overworld?.scene === scene) {
    const pos = { x: run.overworld.x, y: run.overworld.y };
    run.overworld = null;
    if (scene === "island") run.islandPos = null;
    return pos;
  }
  return fallback;
}

export function beatTrainer(id: string): void {
  if (!run.beaten.includes(id)) run.beaten.push(id);
}

export function isBeaten(id: string): boolean {
  return run.beaten.includes(id);
}

export function takeBag(): void {
  run.hasBag = true;
  if (!run.items.includes("pogs")) run.items.push("pogs");
  document.documentElement.classList.toggle("has-bag", true);
}

export function takeFlyer(): void {
  run.flyerOnRoad = false;
  if (!run.items.includes("flyer")) run.items.push("flyer");
}

export function hasFlyer(): boolean {
  return run.items.includes("flyer");
}

export function takeChomp(): void {
  if (!run.items.includes("chomp")) run.items.push("chomp");
}

export function hasChomp(): boolean {
  return run.items.includes("chomp");
}

export function foundItem(id: ItemId): string {
  return `You found a ${ITEM[id].label}!`;
}

export function takePompdex(): void {
  if (!run.items.includes("pompdex")) run.items.push("pompdex");
}

export function takeKebabBoxes(n = 5): void {
  run.kebabBoxes += n;
  if (!run.items.includes("kebab")) run.items.push("kebab");
}

export function useKebabBox(): boolean {
  if (run.kebabBoxes <= 0) return false;
  run.kebabBoxes -= 1;
  return true;
}

export function battleBagEntries(): BagEntry[] {
  return run.items.filter((id) => ITEM[id].heal).map((id) => ({ kind: "item" as const, id }));
}

/** Heal amount for a Chomp-style item. Half of max, at least 8. */
export function healAmount(max: number): number {
  return Math.max(8, Math.floor(max / 2));
}

export function takeItem(id: ItemId): boolean {
  const i = run.items.indexOf(id);
  if (i < 0) return false;
  run.items.splice(i, 1);
  return true;
}

/** Use a heal item on current HP. Returns restored HP, or 0 if full / not a heal item. */
export function useHealItem(id: ItemId, hp: number, max: number): number {
  if (!ITEM[id].heal) return 0;
  if (hp >= max) return 0;
  if (!takeItem(id)) return 0;
  return Math.min(max - hp, healAmount(max));
}

export function seeSpecies(id: SpeciesId): void {
  if (!run.seen.includes(id)) run.seen.push(id);
}

export function catchSpecies(id: SpeciesId, lv = STARTER_LV): boolean {
  seeSpecies(id);
  if (run.owned.includes(id)) return false;
  run.owned.push(id);
  run.party.push(makePartyMon(id, lv));
  return true;
}

export function takeStarter(id: StarterId): void {
  run.starter = id;
  catchSpecies(id, STARTER_LV);
  takePompdex();
  takeKebabBoxes(5);
}

export function itemLine(id: ItemId): string {
  if (id === "pompdex") return `Pompdex. Seen ${run.seen.length}. Caught ${run.owned.length}.`;
  if (id === "kebab") return `Kebab boxes. ${run.kebabBoxes} left. Weak ones crawl in.`;
  return ITEM[id].line;
}

export function bagEntries(): BagEntry[] {
  return [
    ...run.items.map((id) => ({ kind: "item" as const, id })),
    ...run.party.map((mon) => ({ kind: "mon" as const, mon })),
  ];
}

export function bagLine(entry: BagEntry): string {
  if (entry.kind === "item") return itemLine(entry.id);
  const spec = SPECIES[entry.mon.id];
  const need = xpToNext(entry.mon.lv);
  const xp = entry.mon.lv >= MAX_LV ? "MAX." : `${entry.mon.xp}/${need} XP.`;
  const partner = run.starter === entry.mon.id ? " Your partner." : "";
  return `${spec.name}. ${spec.kind} Lv${entry.mon.lv}. ${xp}${partner}`;
}

export function bagLabel(entry: BagEntry): string {
  if (entry.kind === "item") {
    if (entry.id === "kebab") return `KEBAB x${run.kebabBoxes}`;
    return ITEM[entry.id].label;
  }
  const star = run.starter === entry.mon.id ? "*" : "";
  return `${SPECIES[entry.mon.id].name}${star} Lv${entry.mon.lv}`;
}

export function syncBagChrome(): void {
  document.documentElement.classList.toggle("has-bag", run.hasBag);
}
