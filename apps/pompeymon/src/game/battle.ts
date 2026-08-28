import { SPECIES, type ElemId, type SpeciesId } from "./species";
import {
  isDamaging,
  movePriority,
  movesForLevel,
  resolveMoves,
  type MoveDef,
} from "./moves";

export type { MoveDef } from "./moves";
export { MAX_MOVES, MOVES, movesForLevel, moveIdsForLevel, moveLearnedAt } from "./moves";

/** @deprecated Prefer MoveDef — kept for any leftover single-move refs. */
export type Move = MoveDef;

export type SpeciesBattle = {
  hp: number;
  atk: number;
  def: number;
  spd: number;
  /** Fight stamina pips (species base; not level-scaled). */
  sta: number;
  catch: number;
  exp: number;
};

export type Battler = {
  id: SpeciesId;
  name: string;
  lv: number;
  hp: number;
  max: number;
  atk: number;
  def: number;
  /** Base speed (scaled). */
  spd: number;
  /** Extra speed from SPEED moves this fight. */
  spdBoost: number;
  catch: number;
  /** Moves known this fight. */
  moves: MoveDef[];
  /** Move chosen for the current action. */
  move: MoveDef;
  sta: number;
  staMax: number;
  guard: boolean;
  dodging: boolean;
  poisoned: boolean;
  /** This action was started with no stamina — weak / basic-only. */
  weary: boolean;
  /** Full-sta charge defend — gold bar, buffs, megas. Lasts one turn after charging. */
  overcharged: boolean;
  /** Just entered SUPER this round — survive one settleToMenu before countdown. */
  superFresh: boolean;
  /** Charge defend chosen but not yet played out — buffs land when the move happens. */
  pendingSuper: boolean;
  elem?: ElemId;
};

export const MAX_LV = 50;
export const STARTER_LV = 5;
export const STA_FIGHT = 1;
export const STA_DEFEND = 2;
/** Natural stamina while digging in the bag (no guard — less than Defend). */
export const STA_REST = 1;
/** Extra stamina the attacker burns chasing a successful dodge. */
export const STA_CHASE = 1;
/** Damage multiplier when fighting with no stamina left. */
export const TIRED_DMG = 0.55;
/** SUPER state stat multipliers (1 turn after a charge defend at full sta). */
export const SUPER_ATK = 1.35;
export const SUPER_DEF = 1.35;
export const SUPER_SPD = 1.25;

export function isTired(b: Battler): boolean {
  return b.sta < STA_FIGHT;
}

/** Basic attacks + braces stay available when worn out; fancy moves need stamina. Mega needs SUPER. */
export function moveAllowed(b: Battler, move: MoveDef): boolean {
  if (move.kind === "mega") return b.overcharged && !isTired(b);
  if (!isTired(b)) return true;
  if (move.kind === "attack" || move.kind === "defend") return true;
  const hasBasic = b.moves.some((m) => m.kind === "attack" || m.kind === "defend");
  return !hasBasic && move.id === b.moves[0]?.id;
}

export function spendFight(b: Battler): boolean {
  b.weary = b.sta < STA_FIGHT;
  b.guard = false;
  if (!b.weary) b.sta -= STA_FIGHT;
  return true;
}

export function enterSuper(b: Battler): void {
  b.overcharged = true;
  b.superFresh = true;
}

export function clearSuper(b: Battler): void {
  b.overcharged = false;
  b.superFresh = false;
  b.pendingSuper = false;
}

/** Cash in a charge defend at the moment the move plays. Returns true if SUPER just started. */
export function resolveSuper(b: Battler): boolean {
  if (!b.pendingSuper) return false;
  b.pendingSuper = false;
  enterSuper(b);
  return true;
}

/** After a round: keep SUPER for one menu turn, then drop it. Returns true if it just ended. */
export function tickSuper(b: Battler): boolean {
  if (!b.overcharged) return false;
  if (b.superFresh) {
    b.superFresh = false;
    return false;
  }
  clearSuper(b);
  return true;
}

export type DefendResult = { gained: number; charged: boolean };

export function doDefend(b: Battler, move?: MoveDef): DefendResult {
  b.guard = true;
  b.dodging = false;
  if (move?.charge && b.sta >= b.staMax) {
    b.pendingSuper = true;
    return { gained: 0, charged: true };
  }
  const before = b.sta;
  b.sta = Math.min(b.staMax, b.sta + STA_DEFEND);
  return { gained: b.sta - before, charged: false };
}

/** Catch breath on a bag turn — restores less than Defend and leaves you open. */
export function restSta(b: Battler): number {
  b.guard = false;
  b.dodging = false;
  const before = b.sta;
  b.sta = Math.min(b.staMax, b.sta + STA_REST);
  return b.sta - before;
}

/** GBA-simple stats at Lv5. Catch 0–255. exp is KO yield. sta is fight stamina pips. */
export const BATTLE: Record<SpeciesId, SpeciesBattle> = {
  scabfox: { hp: 22, atk: 14, def: 10, spd: 13, sta: 3, catch: 45, exp: 58 },
  chipgull: { hp: 20, atk: 13, def: 9, spd: 16, sta: 4, catch: 90, exp: 52 },
  moggit: { hp: 21, atk: 15, def: 10, spd: 14, sta: 3, catch: 45, exp: 56 },
  donerrat: { hp: 18, atk: 12, def: 8, spd: 15, sta: 4, catch: 150, exp: 48 },
  pidgeon: { hp: 24, atk: 11, def: 12, spd: 10, sta: 2, catch: 190, exp: 50 },
  squirral: { hp: 18, atk: 13, def: 9, spd: 17, sta: 4, catch: 160, exp: 48 },
  spikehedge: { hp: 22, atk: 12, def: 16, spd: 8, sta: 2, catch: 140, exp: 58 },
  starlimur: { hp: 19, atk: 12, def: 9, spd: 16, sta: 4, catch: 170, exp: 50 },
  busstopper: { hp: 28, atk: 15, def: 12, spd: 9, sta: 3, catch: 70, exp: 80 },
  kerbite: { hp: 20, atk: 16, def: 11, spd: 16, sta: 4, catch: 35, exp: 90 },
  honkace: { hp: 26, atk: 15, def: 12, spd: 12, sta: 3, catch: 30, exp: 95 },
  chalklur: { hp: 24, atk: 14, def: 16, spd: 10, sta: 3, catch: 32, exp: 92 },
  linelurker: { hp: 26, atk: 15, def: 18, spd: 8, sta: 2, catch: 28, exp: 100 },
  kitthief: { hp: 22, atk: 17, def: 11, spd: 17, sta: 4, catch: 33, exp: 96 },
};

/** Base stats are Lv5. */
export function scaled(base: number, lv: number): number {
  return Math.max(1, Math.floor((base * lv) / 5));
}

export function xpToNext(lv: number): number {
  if (lv >= MAX_LV) return 0;
  return lv * lv * 5;
}

export function xpForKo(foeLv: number, yieldXp: number, trainer: boolean): number {
  const n = Math.floor((yieldXp * foeLv) / 5);
  return Math.max(1, trainer ? Math.floor(n * 1.5) : n);
}

export function rollWildLv(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function effectiveSpd(b: Battler): number {
  const n = b.spd + b.spdBoost;
  return b.overcharged ? Math.max(1, Math.floor(n * SUPER_SPD)) : n;
}

export function effectiveAtk(b: Battler): number {
  return b.overcharged ? Math.max(1, Math.floor(b.atk * SUPER_ATK)) : b.atk;
}

export function effectiveDef(b: Battler): number {
  return b.overcharged ? Math.max(1, Math.floor(b.def * SUPER_DEF)) : b.def;
}

export function makeBattler(id: SpeciesId, lv: number, hp?: number, moveIds?: string[], elem?: ElemId, nick?: string): Battler {
  const spec = BATTLE[id];
  const max = scaled(spec.hp, lv);
  const now = hp == null ? max : Math.max(0, Math.min(hp, max));
  const staMax = Math.max(1, spec.sta);
  const moves = moveIds?.length ? resolveMoves(moveIds) : movesForLevel(id, lv);
  const fallback = movesForLevel(id, lv);
  const known = moves.length ? moves : fallback;
  const move = known[0] ?? fallback[0];
  return {
    id,
    name: nick?.trim() || SPECIES[id].name,
    lv: Math.max(1, Math.min(MAX_LV, lv)),
    hp: now,
    max,
    atk: scaled(spec.atk, lv),
    def: scaled(spec.def, lv),
    spd: scaled(spec.spd, lv),
    spdBoost: 0,
    catch: spec.catch,
    moves: known,
    move,
    sta: staMax,
    staMax,
    guard: false,
    dodging: false,
    poisoned: false,
    weary: false,
    overcharged: false,
    superFresh: false,
    pendingSuper: false,
    elem,
  };
}

export function doDodge(b: Battler): void {
  b.dodging = true;
  b.guard = false;
}

/** Attacker burns extra stamina chasing a dodge. Returns how many pips spent. */
export function spendChase(b: Battler): number {
  const n = Math.min(b.sta, STA_CHASE);
  b.sta -= n;
  return n;
}

/** Steal stamina from foe into self. Bracing protects it. Returns pips taken. */
export function drainSta(atk: Battler, def: Battler, n: number): number {
  if (def.guard) return 0;
  const took = Math.min(def.sta, Math.max(0, n));
  def.sta -= took;
  atk.sta = Math.min(atk.staMax, atk.sta + took);
  return took;
}

function spdRoll(me: Battler, foe: Battler, base: number, per: number, min: number, max: number): boolean {
  const n = base + (effectiveSpd(me) - effectiveSpd(foe)) * per;
  return Math.random() < Math.min(max, Math.max(min, n));
}

/** Skip your attack; chance to avoid the incoming hit. Faster helps. */
export function rollDodge(me: Battler, foe: Battler): boolean {
  return spdRoll(me, foe, 0.48, 0.035, 0.22, 0.78);
}

/** After a dodge, chance to hit back. Faster helps. */
export function rollCounter(me: Battler, foe: Battler): boolean {
  return spdRoll(me, foe, 0.4, 0.03, 0.18, 0.68);
}

export function rollHit(atk: Battler, def: Battler, move = atk.move): boolean {
  if (!isDamaging(move)) return true;
  const acc = (move.acc ?? 90) / 100;
  const dodge = (effectiveSpd(def) - effectiveSpd(atk)) * 0.008;
  const chance = Math.min(0.96, Math.max(0.72, acc - dodge));
  return Math.random() < chance;
}

export function rollDamage(atk: Battler, def: Battler, move = atk.move): number {
  if (!isDamaging(move)) return 0;
  const raw = Math.floor((effectiveAtk(atk) * move.pow) / Math.max(effectiveDef(def), 1) / 5) + 3;
  let dmg = Math.max(1, raw + Math.floor(Math.random() * 3));
  if (atk.elem && move.elem === atk.elem) dmg = Math.max(1, Math.floor(dmg * 1.25));
  if (def.guard) dmg = Math.max(1, Math.floor(dmg / 2));
  if (atk.weary) dmg = Math.max(1, Math.floor(dmg * TIRED_DMG));
  return dmg;
}

export function applyHit(foe: Battler, dmg: number): number {
  const dealt = Math.min(foe.hp, dmg);
  foe.hp -= dealt;
  return dealt;
}

/** On hit: chance to poison from the move. Returns true if newly poisoned. */
export function tryPoison(atk: Battler, def: Battler, move = atk.move): boolean {
  const chance = move.poison;
  if (!chance || def.poisoned || def.hp <= 0) return false;
  if (Math.random() * 100 >= chance) return false;
  def.poisoned = true;
  return true;
}

/** Residual poison damage (~1/8 max HP). */
export function tickPoison(b: Battler): number {
  if (!b.poisoned || b.hp <= 0) return 0;
  return applyHit(b, Math.max(1, Math.floor(b.max / 8)));
}

export function canRun(me: Battler, foe: Battler): boolean {
  const chance = 0.45 + (effectiveSpd(me) - effectiveSpd(foe)) * 0.04;
  return Math.random() < Math.min(0.9, Math.max(0.2, chance));
}

/** Weaker foe is easier. Full HP is hard. */
export function tryCatch(foe: Battler): boolean {
  const wound = 1 + (1 - foe.hp / foe.max) * 2.2;
  const chance = Math.min(0.92, (foe.catch / 255) * wound);
  return Math.random() < chance;
}

/** Who acts first this turn. Quick moves beat normal; then speed. */
export function firstActor(
  me: Battler,
  foe: Battler,
  meFight: boolean,
  foeFight: boolean,
): "me" | "foe" {
  if (meFight && foeFight) {
    const mp = movePriority(me.move);
    const fp = movePriority(foe.move);
    if (mp !== fp) return mp > fp ? "me" : "foe";
  }
  return effectiveSpd(me) >= effectiveSpd(foe) ? "me" : "foe";
}

export function pickFoeMove(foe: Battler): MoveDef {
  const pool = foe.moves.length ? foe.moves : movesForLevel(foe.id, foe.lv);
  const allowed = pool.filter((m) => moveAllowed(foe, m));
  const megas = allowed.filter((m) => m.kind === "mega");
  if (megas.length && Math.random() < 0.65) {
    return megas[Math.floor(Math.random() * megas.length)]!;
  }
  const use = allowed.length ? allowed : pool.filter((m) => m.kind === "attack");
  const pick = use.length ? use : pool;
  return pick[Math.floor(Math.random() * pick.length)] ?? pick[0];
}
