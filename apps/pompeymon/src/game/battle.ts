import type { SpeciesId } from "./species";
import { SPECIES } from "./species";

export type Move = { name: string; pow: number; acc?: number };

export type SpeciesBattle = {
  hp: number;
  atk: number;
  def: number;
  spd: number;
  catch: number;
  exp: number;
  move: Move;
};

export type Battler = {
  id: SpeciesId;
  name: string;
  lv: number;
  hp: number;
  max: number;
  atk: number;
  def: number;
  spd: number;
  catch: number;
  move: Move;
  sta: number;
  staMax: number;
  guard: boolean;
  dodging: boolean;
};

export const MAX_LV = 50;
export const STARTER_LV = 5;
export const STA_MAX = 3;
export const STA_FIGHT = 1;
export const STA_DEFEND = 2;

/** GBA-simple stats at Lv5. Catch 0–255. exp is KO yield. */
export const BATTLE: Record<SpeciesId, SpeciesBattle> = {
  scabfox: { hp: 22, atk: 14, def: 10, spd: 13, catch: 45, exp: 58, move: { name: "NIP", pow: 18 } },
  chipgull: { hp: 20, atk: 13, def: 9, spd: 16, catch: 90, exp: 52, move: { name: "PECK", pow: 16, acc: 85 } },
  moggit: { hp: 21, atk: 15, def: 10, spd: 14, catch: 45, exp: 56, move: { name: "SCRATCH", pow: 18 } },
  donerrat: { hp: 18, atk: 12, def: 8, spd: 15, catch: 150, exp: 48, move: { name: "NIBBLE", pow: 14 } },
  pidgeon: { hp: 24, atk: 11, def: 12, spd: 10, catch: 190, exp: 50, move: { name: "WING", pow: 14 } },
  squirral: { hp: 18, atk: 13, def: 9, spd: 17, catch: 160, exp: 48, move: { name: "NUT", pow: 15 } },
  spikehedge: { hp: 22, atk: 12, def: 16, spd: 8, catch: 140, exp: 58, move: { name: "ROLL", pow: 16 } },
  starlimur: { hp: 19, atk: 12, def: 9, spd: 16, catch: 170, exp: 50, move: { name: "DART", pow: 15, acc: 85 } },
  busstopper: { hp: 28, atk: 15, def: 12, spd: 9, catch: 70, exp: 80, move: { name: "BARK", pow: 18 } },
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

export function makeBattler(id: SpeciesId, lv: number, hp?: number): Battler {
  const spec = BATTLE[id];
  const max = scaled(spec.hp, lv);
  const now = hp == null ? max : Math.max(0, Math.min(hp, max));
  return {
    id,
    name: SPECIES[id].name,
    lv: Math.max(1, Math.min(MAX_LV, lv)),
    hp: now,
    max,
    atk: scaled(spec.atk, lv),
    def: scaled(spec.def, lv),
    spd: scaled(spec.spd, lv),
    catch: spec.catch,
    move: spec.move,
    sta: STA_MAX,
    staMax: STA_MAX,
    guard: false,
    dodging: false,
  };
}

export function spendFight(b: Battler): boolean {
  if (b.sta < STA_FIGHT) return false;
  b.sta -= STA_FIGHT;
  b.guard = false;
  return true;
}

export function doDefend(b: Battler): number {
  b.guard = true;
  b.dodging = false;
  const before = b.sta;
  b.sta = Math.min(b.staMax, b.sta + STA_DEFEND);
  return b.sta - before;
}

export function doDodge(b: Battler): void {
  b.dodging = true;
  b.guard = false;
}

function spdRoll(me: Battler, foe: Battler, base: number, per: number, min: number, max: number): boolean {
  const n = base + (me.spd - foe.spd) * per;
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

export function rollHit(atk: Battler, def: Battler): boolean {
  const acc = (atk.move.acc ?? 90) / 100;
  const dodge = (def.spd - atk.spd) * 0.008;
  const chance = Math.min(0.96, Math.max(0.72, acc - dodge));
  return Math.random() < chance;
}

export function rollDamage(atk: Battler, def: Battler): number {
  const raw = Math.floor((atk.atk * atk.move.pow) / Math.max(def.def, 1) / 5) + 3;
  let dmg = Math.max(1, raw + Math.floor(Math.random() * 3));
  if (def.guard) dmg = Math.max(1, Math.floor(dmg / 2));
  return dmg;
}

export function applyHit(foe: Battler, dmg: number): number {
  const dealt = Math.min(foe.hp, dmg);
  foe.hp -= dealt;
  return dealt;
}

export function canRun(me: Battler, foe: Battler): boolean {
  const chance = 0.45 + (me.spd - foe.spd) * 0.04;
  return Math.random() < Math.min(0.9, Math.max(0.2, chance));
}

/** Weaker foe is easier. Full HP is hard. */
export function tryCatch(foe: Battler): boolean {
  const wound = 1 + (1 - foe.hp / foe.max) * 2.2;
  const chance = Math.min(0.92, (foe.catch / 255) * wound);
  return Math.random() < chance;
}
