import { BATTLE, MAX_LV, MAX_MOVES, STARTER_LV, moveLearnedAt, moveIdsForLevel, scaled, xpToNext } from "./battle";
import type { OutfitId } from "./sprites/kid";
import { OUTFITS } from "./sprites/kid";
import { SPECIES, ELEM_LABEL, COMMON_WILDS, HIDDEN_IDS, type ElemId, type SpeciesId, type WildId } from "./species";

export type FieldMon = {
  key: string;
  id: WildId;
  lv: number;
  x: number;
  y: number;
  box: { x: number; y: number; w: number; h: number };
};

export type ItemId =
  | "pogs"
  | "flyer"
  | "pompdex"
  | "kebab"
  | "chomp"
  | "hilsea"
  | "bmx"
  | "lock"
  | "plaster"
  | "stale"
  | "moth"
  | "mug"
  | "chain"
  | "radio"
  | "curry"
  | "doner"
  | "chips"
  | "fish"
  | "empty";
export type StarterId = "scabfox" | "chipgull" | "moggit" | "donerrat";

export type PartyMon = {
  id: SpeciesId;
  lv: number;
  xp: number;
  hp: number;
  /** Known move ids (max 6). */
  moves: string[];
  /** Takeaway food evolution. */
  elem?: ElemId;
  /** Nickname (e.g. PRICKLES). */
  nick?: string;
  /** Stolen — ignores Fight/Dodge and only braces. */
  stubborn?: boolean;
  /** Soft bond — listens sometimes; may jump in to defend mates. */
  cheeky?: boolean;
};

export type BagEntry = { kind: "item"; id: ItemId } | { kind: "mon"; mon: PartyMon };

export const ITEM: Record<ItemId, { label: string; line: string; heal?: boolean }> = {
  pogs: { label: "POGS", line: "Pogs. Slammer's in there." },
  flyer: {
    label: "CHOKE FLYER",
    line: "Professor Choke's. New trainers wanted.",
  },
  pompdex: { label: "POMPDEX", line: "Look near a wild to scan. Catch to finish the entry." },
  kebab: { label: "KEBAB BOX", line: "Choke's kebab boxes. Put one down when they're weak." },
  chomp: { label: "CHOMP BAR", line: "Choke's Chomp. Restores HP.", heal: true },
  hilsea: { label: "HILSEA BADGE", line: "Hilsea Badge. Mr Atkins. First gym." },
  bmx: { label: "BMX BIKE", line: "BMX. Ride it. BACK to get off. Look it to get on." },
  lock: { label: "D-LOCK", line: "D-lock. Parks locked. Hoodies still try." },
  plaster: { label: "OLD PLASTER", line: "Old plaster. Barely heals.", heal: true },
  stale: { label: "STALE CHOMP", line: "Out of date Chomp. Weaker.", heal: true },
  moth: { label: "MOTH JUMPER", line: "Charity jumper. Moth holes. Itchy." },
  mug: { label: "CRACKED MUG", line: "Cracked mug. Stains inside." },
  chain: { label: "FAKE CHAIN", line: "Pawn chain. Gold paint." },
  radio: { label: "DEAD RADIO", line: "Pawn radio. Doesn't. Tape's stuck." },
  curry: { label: "HOT CURRY", line: "Takeaway curry. FIRE or WIND." },
  doner: { label: "DONER KEBAB", line: "Doner. Makes them POISON." },
  chips: { label: "CHIP CONE", line: "Chips. Makes them EARTH." },
  fish: { label: "BATTERED FISH", line: "Battered fish. Makes them WATER." },
  empty: { label: "EMPTY TAKEAWAY", line: "Empty box or bag. Put one down when they're weak." },
};

export type RunState = {
  outfit: OutfitId;
  dressed: boolean;
  hasBag: boolean;
  items: ItemId[];
  steveGone: boolean;
  flyerOnRoad: boolean;
  starter: StarterId | null;
  refusedStarters: boolean;
  seen: SpeciesId[];
  owned: SpeciesId[];
  party: PartyMon[];
  lead: number;
  islandPos: { x: number; y: number } | null;
  overworld: { scene: string; x: number; y: number } | null;
  field: { scene: string; mons: FieldMon[] } | null;
  wildKey: string | null;
  wildGone: boolean;
  beaten: string[];
  grassCalm: number;
  kebabBoxes: number;
  kebabCatch: boolean;
  /** Empty takeaway boxes/bags from feeding — catch like kebab boxes. */
  empties: number;
  whiteout: boolean;
  chompKept: boolean;
  hillNanGone: boolean;
  debugSession: boolean;
  cash: number;
  /** Paid Mum rent once (£50 when you came home flush). */
  mumRentPaid: boolean;
  /** Jess joined after the bridge fight. */
  palJoined: boolean;
  palWon: boolean;
  palGreeted: boolean;
  mounted: boolean;
  parked: null | { scene: string; x: number; y: number; locked: boolean; wheel: boolean };
  /** Locked bike was chored — Ray gets an earful. */
  lockChored: boolean;
  plasters: number;
  stale: number;
  curry: number;
  doner: number;
  chips: number;
  fish: number;
};

function freshRun(): RunState {
  return {
    outfit: "pj",
    dressed: false,
    hasBag: false,
    items: [],
    steveGone: false,
    flyerOnRoad: false,
    starter: null,
    refusedStarters: false,
    seen: [],
    owned: [],
    party: [],
    lead: 0,
    islandPos: null,
    overworld: null,
    field: null,
    wildKey: null,
    wildGone: false,
    beaten: [],
    grassCalm: 0,
    kebabBoxes: 0,
    kebabCatch: false,
    empties: 0,
    whiteout: false,
    chompKept: false,
    hillNanGone: false,
    debugSession: false,
    cash: 0,
    mumRentPaid: false,
    palJoined: false,
    palWon: false,
    palGreeted: false,
    mounted: false,
    parked: null,
    lockChored: false,
    plasters: 0,
    stale: 0,
    curry: 0,
    doner: 0,
    chips: 0,
    fish: 0,
  };
}

/** In-memory run. Browser save in localStorage. Continue codes later. */
export const run: RunState = freshRun();

const SAVE_KEY = "pm-run-v1";
const SAVE_SCENES = new Set([
  "bedroom",
  "landing",
  "bathroom",
  "hall",
  "kitchen",
  "frontroom",
  "avenue",
  "roundabout",
  "hill",
  "bridge",
  "highstreet",
  "lab",
  "bikeshop",
  "junkshop",
  "takeaway",
  "island",
  "school",
  "schoolin",
]);

const ITEM_IDS = new Set(Object.keys(ITEM) as ItemId[]);
const SPECIES_IDS = new Set(Object.keys(SPECIES) as SpeciesId[]);
const STARTERS = new Set<StarterId>(["scabfox", "chipgull", "moggit", "donerrat"]);
const ELEMS = new Set<ElemId>(["fire", "wind", "poison", "earth", "water"]);

/** Last overworld tile — kept after resumePos clears run.overworld. */
let lastPlace: { scene: string; x: number; y: number } | null = null;

function markPlace(scene: string, pos: { x: number; y: number }): void {
  lastPlace = { scene, x: pos.x, y: pos.y };
}

export function persistRun(): void {
  if (run.debugSession) return;
  const scene = lastPlace?.scene ?? run.overworld?.scene;
  if (!scene || !SAVE_SCENES.has(scene)) return;
  const x = lastPlace?.x ?? run.overworld?.x ?? 120;
  const y = lastPlace?.y ?? run.overworld?.y ?? 80;
  const blob = {
    v: 1,
    scene,
    x,
    y,
    run: {
      ...run,
      debugSession: false,
      field: null,
      wildKey: null,
      wildGone: false,
      kebabCatch: false,
      overworld: { scene, x, y },
    },
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(blob));
  } catch {
    /* private mode / quota */
  }
}

export function hasSave(): boolean {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const blob = JSON.parse(raw) as { v?: number; scene?: string };
    return blob.v === 1 && typeof blob.scene === "string" && SAVE_SCENES.has(blob.scene);
  } catch {
    return false;
  }
}

export function clearSave(): void {
  lastPlace = null;
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* private mode */
  }
}

export function resetNewGame(): void {
  Object.assign(run, freshRun());
  lastPlace = null;
  syncBagChrome();
}

export function continueScene(): string {
  if (run.whiteout) return "lab";
  const scene = run.overworld?.scene ?? lastPlace?.scene ?? "bedroom";
  return SAVE_SCENES.has(scene) ? scene : "bedroom";
}

export function loadRun(): boolean {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const blob = JSON.parse(raw) as {
      v?: number;
      scene?: string;
      x?: number;
      y?: number;
      run?: Partial<RunState>;
    };
    if (blob.v !== 1 || !blob.scene || !SAVE_SCENES.has(blob.scene) || !blob.run) return false;
    const src = blob.run;
    const next = freshRun();
    if (OUTFITS.includes(src.outfit as OutfitId)) next.outfit = src.outfit as OutfitId;
    next.dressed = !!src.dressed;
    next.hasBag = !!src.hasBag;
    next.steveGone = !!src.steveGone;
    next.flyerOnRoad = !!src.flyerOnRoad;
    next.refusedStarters = !!src.refusedStarters;
    next.chompKept = !!src.chompKept;
    next.hillNanGone = !!src.hillNanGone;
    next.lockChored = !!src.lockChored;
    next.mumRentPaid = !!src.mumRentPaid;
    next.palJoined = !!src.palJoined;
    next.palWon = !!src.palWon;
    next.palGreeted = !!src.palGreeted;
    next.whiteout = !!src.whiteout;
    next.mounted = !!src.mounted;
    if (src.starter && STARTERS.has(src.starter)) next.starter = src.starter;
    if (Array.isArray(src.items)) next.items = src.items.filter((id): id is ItemId => ITEM_IDS.has(id));
    if (Array.isArray(src.seen)) next.seen = src.seen.filter((id): id is SpeciesId => SPECIES_IDS.has(id));
    if (Array.isArray(src.owned)) next.owned = src.owned.filter((id): id is SpeciesId => SPECIES_IDS.has(id));
    if (Array.isArray(src.beaten)) next.beaten = src.beaten.filter((id) => typeof id === "string");
    if (Array.isArray(src.party)) {
      next.party = src.party
        .filter((p) => p && SPECIES_IDS.has(p.id))
        .map((p) => ({
          id: p.id,
          lv: Math.max(1, Math.min(MAX_LV, Number(p.lv) || 1)),
          xp: Math.max(0, Number(p.xp) || 0),
          hp: Math.max(0, Number(p.hp) || 0),
          moves: Array.isArray(p.moves) ? p.moves.filter((m) => typeof m === "string").slice(0, MAX_MOVES) : [],
          elem: p.elem && ELEMS.has(p.elem) ? p.elem : undefined,
          nick: typeof p.nick === "string" && p.nick ? p.nick : undefined,
          stubborn: !!p.stubborn || undefined,
          cheeky: !!p.cheeky || undefined,
        }));
    }
    next.lead = next.party.length ? Math.max(0, Math.min(next.party.length - 1, Number(src.lead) || 0)) : 0;
    next.kebabBoxes = Math.max(0, Number(src.kebabBoxes) || 0);
    next.empties = Math.max(0, Number(src.empties) || 0);
    next.grassCalm = Math.max(0, Number(src.grassCalm) || 0);
    next.cash = Math.max(0, Number(src.cash) || 0);
    next.plasters = Math.max(0, Number(src.plasters) || 0);
    next.stale = Math.max(0, Number(src.stale) || 0);
    next.curry = Math.max(0, Number(src.curry) || 0);
    next.doner = Math.max(0, Number(src.doner) || 0);
    next.chips = Math.max(0, Number(src.chips) || 0);
    next.fish = Math.max(0, Number(src.fish) || 0);
    if (src.parked && typeof src.parked.scene === "string") {
      next.parked = {
        scene: src.parked.scene,
        x: Number(src.parked.x) || 0,
        y: Number(src.parked.y) || 0,
        locked: !!src.parked.locked,
        wheel: !!src.parked.wheel,
      };
    }
    const x = Number(blob.x);
    const y = Number(blob.y);
    const place = {
      scene: blob.scene,
      x: Number.isFinite(x) ? x : 120,
      y: Number.isFinite(y) ? y : 80,
    };
    next.overworld = place;
    if (blob.scene === "island") next.islandPos = { x: place.x, y: place.y };
    Object.assign(run, next);
    lastPlace = place;
    syncBagChrome();
    return true;
  } catch {
    return false;
  }
}

export function consumeWhiteout(): boolean {
  if (!run.whiteout) return false;
  run.whiteout = false;
  run.overworld = null;
  run.field = null;
  run.wildKey = null;
  run.wildGone = false;
  healParty();
  return true;
}

export function makePartyMon(id: SpeciesId, lv: number): PartyMon {
  const n = Math.max(1, Math.min(MAX_LV, lv));
  return { id, lv: n, xp: 0, hp: scaled(BATTLE[id].hp, n), moves: moveIdsForLevel(id, n) };
}

export function partnerMon(): PartyMon | undefined {
  return run.party[run.lead] ?? run.party[0];
}

/** If the lead fainted, move to the next healthy party member. */
export function ensureLeadAlive(): PartyMon | undefined {
  const cur = run.party[run.lead];
  if (cur && cur.hp > 0) return cur;
  const i = run.party.findIndex((p) => p.hp > 0);
  if (i >= 0) {
    run.lead = i;
    return run.party[i];
  }
  return cur ?? run.party[0];
}

export function partyAlive(): boolean {
  return run.party.some((p) => p.hp > 0);
}

export function setLead(mon: PartyMon): boolean {
  const i = run.party.indexOf(mon);
  if (i < 0 || mon.hp <= 0) return false;
  run.lead = i;
  return true;
}

export function healParty(): void {
  for (const p of run.party) p.hp = scaled(BATTLE[p.id].hp, p.lv);
}

export function partyNeedsHeal(): boolean {
  return run.party.some((p) => p.hp < scaled(BATTLE[p.id].hp, p.lv));
}

export function applyXp(mon: PartyMon, gained: number): string[] {
  const lines: string[] = [];
  if (mon.lv >= MAX_LV || gained <= 0) return lines;
  if (!mon.moves?.length) mon.moves = moveIdsForLevel(mon.id, mon.lv);
  mon.xp += gained;
  while (mon.lv < MAX_LV) {
    const need = xpToNext(mon.lv);
    if (mon.xp < need) break;
    mon.xp -= need;
    mon.lv += 1;
    const max = scaled(BATTLE[mon.id].hp, mon.lv);
    const heal = Math.floor(max * 0.2);
    mon.hp = Math.min(max, Math.max(0, mon.hp) + heal);
    lines.push(`${SPECIES[mon.id].name} grew to Lv${mon.lv}!`);
    if (mon.stubborn) {
      mon.stubborn = false;
      mon.cheeky = true;
      const who = mon.nick ?? SPECIES[mon.id].name;
      lines.push(`${who} might listen… sometimes.`);
    }
    const learned = moveLearnedAt(mon.id, mon.lv);
    if (learned) {
      if (mon.moves.includes(learned.id)) {
        /* already knows it */
      } else if (mon.moves.length < MAX_MOVES) {
        mon.moves.push(learned.id);
        lines.push(`${SPECIES[mon.id].name} learned ${learned.name}!`);
      } else {
        lines.push(`${SPECIES[mon.id].name} wants ${learned.name}. Moves full.`);
      }
    }
  }
  if (mon.lv >= MAX_LV) mon.xp = 0;
  return lines;
}

export function saveOverworld(scene: string, pos: { x: number; y: number }): void {
  run.overworld = { scene, x: pos.x, y: pos.y };
  markPlace(scene, pos);
  if (scene === "island") run.islandPos = { x: pos.x, y: pos.y };
  persistRun();
}

export function returningTo(scene: string): boolean {
  return run.overworld?.scene === scene;
}

export function resumePos(scene: string, fallback: { x: number; y: number }, atDoor = false): { x: number; y: number } {
  if (atDoor) {
    if (run.overworld?.scene === scene) {
      run.overworld = null;
      persistRun();
    }
    markPlace(scene, fallback);
    return fallback;
  }
  if (run.overworld?.scene === scene) {
    const pos = { x: run.overworld.x, y: run.overworld.y };
    markPlace(scene, pos);
    run.overworld = null;
    if (scene === "island") run.islandPos = null;
    persistRun();
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
  run.cash += 20;
  document.documentElement.classList.toggle("has-bag", true);
}

export function takeCash(n: number): void {
  run.cash += n;
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
  return `You found ${ITEM[id].label}!`;
}

export function takePrize(id: ItemId): boolean {
  if (run.items.includes(id)) return false;
  run.items.push(id);
  return true;
}

export function takePompdex(): void {
  if (!run.items.includes("pompdex")) run.items.push("pompdex");
}

export function takeKebabBoxes(n = 5): void {
  run.kebabBoxes += n;
  if (!run.items.includes("kebab")) run.items.push("kebab");
}

export function takeEmpty(n = 1): void {
  run.empties += Math.max(1, n);
  if (!run.items.includes("empty")) run.items.push("empty");
}

/** Prefer Choke's boxes, then empty takeaway. */
export function useCatchBox(): "kebab" | "empty" | null {
  if (run.kebabBoxes > 0) {
    run.kebabBoxes -= 1;
    return "kebab";
  }
  if (run.empties > 0) {
    run.empties -= 1;
    if (run.empties <= 0) takeItem("empty");
    return "empty";
  }
  return null;
}

/** @deprecated Prefer useCatchBox — kept for Steve auto-catch. */
export function useKebabBox(): boolean {
  return useCatchBox() !== null;
}

export function battleBagEntries(): BagEntry[] {
  return [...battleBagMons(), ...battleBagPockets()];
}

export function battleBagMons(): BagEntry[] {
  return run.party.map((mon) => ({ kind: "mon" as const, mon }));
}

export function battleBagPockets(): BagEntry[] {
  return run.items
    .filter(
      (id) =>
        ITEM[id].heal ||
        (id === "kebab" && run.kebabBoxes > 0) ||
        (id === "empty" && run.empties > 0),
    )
    .map((id) => ({ kind: "item" as const, id }));
}

export function takeStack(id: "plaster" | "stale" | "curry" | "doner" | "chips" | "fish", n = 1): void {
  const add = Math.max(1, n);
  if (id === "plaster") run.plasters += add;
  else if (id === "stale") run.stale += add;
  else if (id === "curry") run.curry += add;
  else if (id === "doner") run.doner += add;
  else if (id === "chips") run.chips += add;
  else run.fish += add;
  if (!run.items.includes(id)) run.items.push(id);
}

export function isFood(id: ItemId): boolean {
  return id === "curry" || id === "doner" || id === "chips" || id === "fish";
}

const ELEM_MOVE: Record<ElemId, string> = {
  fire: "chilli",
  wind: "puff",
  poison: "grease",
  earth: "grit",
  water: "batter",
};

function spendFood(id: "curry" | "doner" | "chips" | "fish"): boolean {
  if (id === "curry") {
    if (run.curry <= 0) return false;
    run.curry -= 1;
    if (run.curry <= 0) takeItem("curry");
    return true;
  }
  if (id === "doner") {
    if (run.doner <= 0) return false;
    run.doner -= 1;
    if (run.doner <= 0) takeItem("doner");
    return true;
  }
  if (id === "chips") {
    if (run.chips <= 0) return false;
    run.chips -= 1;
    if (run.chips <= 0) takeItem("chips");
    return true;
  }
  if (run.fish <= 0) return false;
  run.fish -= 1;
  if (run.fish <= 0) takeItem("fish");
  return true;
}

export function eatFood(id: ItemId, mon: PartyMon, curryPick?: "fire" | "wind"): string {
  if (!isFood(id)) return "That's not food.";
  let elem: ElemId;
  if (id === "curry") elem = curryPick === "wind" ? "wind" : "fire";
  else if (id === "doner") elem = "poison";
  else if (id === "chips") elem = "earth";
  else elem = "water";
  if (!spendFood(id === "curry" || id === "doner" || id === "chips" || id === "fish" ? id : "chips")) return "None left.";
  mon.elem = elem;
  const mv = ELEM_MOVE[elem];
  if (!mon.moves.includes(mv)) {
    if (mon.moves.length < MAX_MOVES) mon.moves.push(mv);
    else mon.moves[mon.moves.length - 1] = mv;
  }
  const vessel = id === "chips" || id === "fish" ? "bag" : "box";
  takeEmpty(1);
  return `${SPECIES[mon.id].name} ate it. Now ${ELEM_LABEL[elem]}. Empty ${vessel} left.`;
}

/** Heal amount. Charity/pawn stuff is weaker than a proper Chomp. */
export function healAmount(max: number, id?: ItemId): number {
  if (id === "plaster") return Math.max(3, Math.floor(max / 8));
  if (id === "stale") return Math.max(5, Math.floor(max / 4));
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
  if (id === "plaster") {
    if (run.plasters <= 0) return 0;
    run.plasters -= 1;
    if (run.plasters <= 0) takeItem("plaster");
    return Math.min(max - hp, healAmount(max, id));
  }
  if (id === "stale") {
    if (run.stale <= 0) return 0;
    run.stale -= 1;
    if (run.stale <= 0) takeItem("stale");
    return Math.min(max - hp, healAmount(max, id));
  }
  if (!takeItem(id)) return 0;
  return Math.min(max - hp, healAmount(max, id));
}

export function seeSpecies(id: SpeciesId): void {
  if (!run.seen.includes(id)) run.seen.push(id);
}

function isAvoided(id: SpeciesId, avoid?: SpeciesId | readonly SpeciesId[]): boolean {
  if (avoid == null) return false;
  return Array.isArray(avoid) ? avoid.includes(id) : id === avoid;
}

function pickOne<T>(list: T[]): T | undefined {
  if (!list.length) return undefined;
  return list[Math.floor(Math.random() * list.length)];
}

function openMons(avoid?: SpeciesId | readonly SpeciesId[]): SpeciesId[] {
  return (Object.keys(SPECIES) as SpeciesId[]).filter(
    (id) => !HIDDEN_IDS.has(id as WildId) && !isAvoided(id, avoid),
  );
}

/** Gym leaders fill the Pompdex: listed mon if unseen, else another unseen species. */
export function gymFoeMon(prefer: SpeciesId, avoid?: SpeciesId | readonly SpeciesId[]): SpeciesId {
  if (!run.seen.includes(prefer) && !isAvoided(prefer, avoid)) return prefer;
  const unseen = openMons(avoid).filter((id) => !run.seen.includes(id));
  return pickOne(unseen) ?? pickOne(openMons(avoid)) ?? prefer;
}

/** Street trainers keep their listed / common mon. Sometimes an unseen common. */
export function trainerFoeMon(prefer: SpeciesId, avoid?: SpeciesId | readonly SpeciesId[]): SpeciesId {
  const listed = !isAvoided(prefer, avoid) ? prefer : undefined;
  const unseenCommon = COMMON_WILDS.filter((id) => !run.seen.includes(id) && !isAvoided(id, avoid));
  if (listed && !run.seen.includes(listed)) return listed;
  if (unseenCommon.length && Math.random() < 0.22) return pickOne(unseenCommon)!;
  if (listed) return listed;
  return pickOne(COMMON_WILDS.filter((id) => !isAvoided(id, avoid))) ?? prefer;
}

export const MAX_PARTY = 6;

export const STOLEN_NICK = "PRICKLES";

export function monLabel(mon: PartyMon): string {
  return mon.nick ?? SPECIES[mon.id].name;
}

/** Steve's abandoned Spikehedge, if still in the party. */
export function findStolenMon(): PartyMon | undefined {
  return run.party.find(
    (p) => p.nick === STOLEN_NICK || (p.id === "spikehedge" && (p.stubborn || p.cheeky)),
  );
}

/** After Dean flees — soft bond. */
export function bondStolenMon(): void {
  const mon = findStolenMon();
  if (!mon) return;
  mon.stubborn = false;
  mon.cheeky = true;
  if (!mon.nick) mon.nick = STOLEN_NICK;
  persistRun();
}

export function catchSpecies(
  id: SpeciesId,
  lv = STARTER_LV,
  opts?: { stubborn?: boolean; nick?: string; cheeky?: boolean },
): boolean {
  seeSpecies(id);
  if (run.party.length >= MAX_PARTY) return false;
  if (!run.owned.includes(id)) run.owned.push(id);
  const mon = makePartyMon(id, lv);
  if (opts?.stubborn) mon.stubborn = true;
  if (opts?.nick) mon.nick = opts.nick;
  if (opts?.cheeky) mon.cheeky = true;
  run.party.push(mon);
  return true;
}

export function takeStarter(id: StarterId): void {
  run.starter = id;
  catchSpecies(id, STARTER_LV);
  run.lead = 0;
  takePompdex();
  takeKebabBoxes(5);
}

export function itemLine(id: ItemId): string {
  if (id === "pompdex")
    return run.seen.length
      ? `Pompdex. Seen ${run.seen.length}. Caught ${run.owned.length}. Opens last scan.`
      : "Pompdex empty. Look near a wild Pompeymon to scan.";
  if (id === "kebab") return `Kebab boxes. ${run.kebabBoxes} left. Weak ones crawl in.`;
  if (id === "empty") return `Empty takeaway. ${run.empties} left. Weak ones crawl in.`;
  if (id === "plaster") return `Plasters. ${run.plasters} left. Barely heals.`;
  if (id === "stale") return `Stale Chomps. ${run.stale} left. Weaker.`;
  if (id === "curry") return `Curry. ${run.curry} left. FIRE or WIND.`;
  if (id === "doner") return `Kebab. ${run.doner} left. POISON.`;
  if (id === "chips") return `Chips. ${run.chips} left. EARTH.`;
  if (id === "fish") return `Fish. ${run.fish} left. WATER.`;
  return ITEM[id].line;
}

export function bagEntries(): BagEntry[] {
  return [...bagMons(), ...bagPockets()];
}

export function bagMons(): BagEntry[] {
  return run.party.map((mon) => ({ kind: "mon" as const, mon }));
}

export function bagPockets(): BagEntry[] {
  return run.items
    .filter((id) => id !== "bmx" && !(id === "empty" && run.empties <= 0))
    .map((id) => ({ kind: "item" as const, id }));
}

export function bagLine(entry: BagEntry): string {
  if (entry.kind === "item") return itemLine(entry.id);
  const spec = SPECIES[entry.mon.id];
  const who = monLabel(entry.mon);
  const need = xpToNext(entry.mon.lv);
  const xp = entry.mon.lv >= MAX_LV ? "MAX." : `${entry.mon.xp}/${need} XP.`;
  const lead = run.party[run.lead] === entry.mon ? " Goes out first." : "";
  const elem = entry.mon.elem ? ` ${ELEM_LABEL[entry.mon.elem]}.` : "";
  const mood = entry.mon.stubborn ? " Won't listen." : entry.mon.cheeky ? " Moody." : "";
  return `${who}. ${spec.kind} Lv${entry.mon.lv}. ${xp}${elem}${mood}${lead}`;
}

export function bagLabel(entry: BagEntry): string {
  if (entry.kind === "item") {
    const name = ITEM[entry.id].label;
    if (entry.id === "kebab") return `${name} x${run.kebabBoxes}`;
    if (entry.id === "empty") return `${name} x${run.empties}`;
    if (entry.id === "plaster") return `${name} x${run.plasters}`;
    if (entry.id === "stale") return `${name} x${run.stale}`;
    if (entry.id === "curry") return `${name} x${run.curry}`;
    if (entry.id === "doner") return `${name} x${run.doner}`;
    if (entry.id === "chips") return `${name} x${run.chips}`;
    if (entry.id === "fish") return `${name} x${run.fish}`;
    return name;
  }
  const star = run.party[run.lead] === entry.mon ? "*" : "";
  const out = entry.mon.hp <= 0 ? " --" : "";
  const el = entry.mon.elem ? ` ${ELEM_LABEL[entry.mon.elem][0]}` : "";
  return `${monLabel(entry.mon)}${star} Lv${entry.mon.lv}${el}${out}`;
}

export function syncBagChrome(): void {
  document.documentElement.classList.toggle("has-bag", run.hasBag);
}
