import Phaser from "phaser";
import { rollWildLv } from "../battle";
import { ensureLeadAlive, run, saveOverworld, type FieldMon } from "../run";
import { ensureMonSheets, monOwAnim, monOwSheet } from "../sprites/mon";
import { HIDDEN_IDS, type WildId } from "../species";
import type { Facing } from "../walk";

export type WanderBox = { x: number; y: number; w: number; h: number };

export type WanderSpec = FieldMon;

export type Wanderer = WanderSpec & {
  sprite: Phaser.GameObjects.Sprite;
  facing: Facing;
  flip: number;
  dx: number;
  dy: number;
  until: number;
  keepOff: WanderBox[];
};

type AreaWilds = {
  slots: WanderBox[];
  pool: WildId[];
  count: number;
  lv: [number, number];
  /** Doors, gates, and map mouths — wilds may not spawn or wander here. */
  keepOff: WanderBox[];
  /** One rare hunt — always on the map, not in the common pool. */
  hidden?: { id: WildId; lv: [number, number]; slot: WanderBox };
};

const FLEE_RANGE = 42;
const FLEE_SPEED = 54;

const AREA_WILDS: Record<string, AreaWilds> = {
  island: {
    count: 4,
    lv: [3, 5],
    pool: ["starlimur", "busstopper", "donerrat", "spikehedge", "chipgull", "pidgeon", "squirral"],
    keepOff: [
      { x: 88, y: 0, w: 64, h: 56 },
      { x: 68, y: 220, w: 56, h: 56 },
    ],
    slots: [
      { x: 8, y: 352, w: 76, h: 40 },
      { x: 8, y: 462, w: 76, h: 40 },
      { x: 156, y: 462, w: 76, h: 40 },
      { x: 8, y: 566, w: 76, h: 48 },
      { x: 156, y: 566, w: 76, h: 48 },
      { x: 100, y: 300, w: 40, h: 32 },
      { x: 100, y: 348, w: 40, h: 36 },
      { x: 100, y: 510, w: 40, h: 40 },
    ],
    hidden: { id: "linelurker", lv: [6, 8], slot: { x: 8, y: 440, w: 48, h: 32 } },
  },
  school: {
    count: 3,
    lv: [4, 6],
    pool: ["squirral", "starlimur", "pidgeon", "spikehedge"],
    keepOff: [{ x: 188, y: 96, w: 52, h: 56 }],
    slots: [
      { x: 8, y: 96, w: 14, h: 72 },
      { x: 100, y: 196, w: 80, h: 40 },
      { x: 182, y: 160, w: 32, h: 28 },
      { x: 40, y: 108, w: 48, h: 56 },
      { x: 116, y: 108, w: 48, h: 56 },
    ],
    hidden: { id: "kitthief", lv: [7, 9], slot: { x: 28, y: 198, w: 40, h: 28 } },
  },
  highstreet: {
    count: 3,
    lv: [2, 3],
    pool: ["pidgeon", "donerrat", "chipgull"],
    keepOff: [
      { x: 0, y: 196, w: 100, h: 84 },
      { x: 56, y: 40, w: 56, h: 56 },
    ],
    slots: [
      { x: 96, y: 108, w: 40, h: 36 },
      { x: 96, y: 152, w: 44, h: 36 },
      { x: 96, y: 288, w: 44, h: 44 },
      { x: 96, y: 348, w: 44, h: 40 },
      { x: 96, y: 408, w: 44, h: 40 },
    ],
    hidden: { id: "kerbite", lv: [4, 5], slot: { x: 148, y: 360, w: 24, h: 28 } },
  },
  roundabout: {
    count: 2,
    lv: [2, 3],
    pool: ["pidgeon", "starlimur"],
    keepOff: [
      { x: 0, y: 56, w: 52, h: 48 },
      { x: 96, y: 0, w: 48, h: 44 },
      { x: 96, y: 116, w: 48, h: 44 },
      { x: 188, y: 56, w: 52, h: 48 },
    ],
    slots: [
      { x: 104, y: 64, w: 32, h: 30 },
      { x: 148, y: 68, w: 22, h: 22 },
      { x: 70, y: 68, w: 22, h: 22 },
      { x: 108, y: 90, w: 24, h: 20 },
    ],
    hidden: { id: "honkace", lv: [4, 5], slot: { x: 66, y: 88, w: 22, h: 18 } },
  },
  hill: {
    count: 0,
    lv: [4, 5],
    pool: ["spikehedge"],
    keepOff: [{ x: 100, y: 148, w: 40, h: 16 }],
    slots: [],
    hidden: { id: "chalklur", lv: [6, 8], slot: { x: 108, y: 64, w: 22, h: 24 } },
  },
};

function inBox(x: number, y: number, b: WanderBox): boolean {
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}

function overlaps(a: WanderBox, b: WanderBox): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function blocked(x: number, y: number, zones: WanderBox[]): boolean {
  return zones.some((z) => inBox(x, y, z));
}

function shufflePick<T>(list: T[], n: number): T[] {
  const idx = list.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, Math.min(n, list.length)).map((i) => list[i]);
}

function placeIn(box: WanderBox): { x: number; y: number } {
  return { x: box.x + box.w / 2, y: box.y + Math.floor(box.h * 0.7) };
}

function rollField(scene: string, cfg: AreaWilds): FieldMon[] {
  const hide = cfg.hidden;
  const slots = cfg.slots.filter(
    (box) => !cfg.keepOff.some((z) => overlaps(box, z)) && !(hide && overlaps(box, hide.slot)),
  );
  const mons = shufflePick(slots, cfg.count).map((box, i) => {
    const id = cfg.pool[Math.floor(Math.random() * cfg.pool.length)];
    const pos = placeIn(box);
    return {
      key: `${scene}-${i}`,
      id,
      lv: rollWildLv(cfg.lv[0], cfg.lv[1]),
      x: pos.x,
      y: pos.y,
      box,
    };
  });
  if (hide && !cfg.keepOff.some((z) => overlaps(hide.slot, z))) {
    const pos = placeIn(hide.slot);
    mons.push({
      key: `${scene}-hidden`,
      id: hide.id,
      lv: rollWildLv(hide.lv[0], hide.lv[1]),
      x: pos.x,
      y: pos.y,
      box: hide.slot,
    });
  }
  return mons;
}

function fieldMons(scene: string, returning: boolean): FieldMon[] {
  const cfg = AREA_WILDS[scene];
  if (!cfg) return [];
  if (returning && run.field?.scene === scene) {
    let mons = run.field.mons;
    if (run.wildGone && run.wildKey) mons = mons.filter((m) => m.key !== run.wildKey);
    run.field = { scene, mons };
    run.wildKey = null;
    run.wildGone = false;
    return mons;
  }
  const mons = rollField(scene, cfg);
  run.field = { scene, mons };
  run.wildKey = null;
  run.wildGone = false;
  return mons;
}

export function spawnAreaWilds(scene: Phaser.Scene, area: string, returning: boolean): Wanderer[] {
  const cfg = AREA_WILDS[area];
  return spawnWanderers(scene, fieldMons(area, returning), cfg?.keepOff ?? []);
}

export function snapshotField(wanderers: Wanderer[]): void {
  if (!run.field) return;
  run.field.mons = wanderers.map((w) => ({
    key: w.key,
    id: w.id,
    lv: w.lv,
    x: w.sprite.x,
    y: w.sprite.y,
    box: w.box,
  }));
}

export function beginWildFight(
  area: string,
  pos: { x: number; y: number },
  wanderers: Wanderer[],
  map?: Wanderer,
): void {
  snapshotField(wanderers);
  run.wildKey = map?.key ?? null;
  run.wildGone = false;
  saveOverworld(area, pos);
}

export function leaveField(area: string): void {
  if (run.field?.scene === area) run.field = null;
  run.wildKey = null;
  run.wildGone = false;
}

export function markWildBeat(): void {
  if (run.wildKey) run.wildGone = true;
}

export function clearField(): void {
  run.field = null;
  run.wildKey = null;
  run.wildGone = false;
}

export function spawnWanderers(scene: Phaser.Scene, specs: WanderSpec[], keepOff: WanderBox[] = []): Wanderer[] {
  ensureMonSheets(scene);
  return specs.map((spec, i) => {
    let x = spec.x;
    let y = spec.y;
    if (blocked(x, y, keepOff)) {
      x = spec.box.x + spec.box.w / 2;
      y = spec.box.y + Math.floor(spec.box.h * 0.7);
    }
    const sprite = scene.add.sprite(x, y, monOwSheet(spec.id), "idle-down");
    sprite.setOrigin(0.5, 1);
    sprite.setDepth(y);
    sprite.anims.play(monOwAnim(spec.id, "idle-down"));
    return {
      ...spec,
      sprite,
      facing: "down" as Facing,
      flip: 1,
      dx: 0,
      dy: 0,
      until: scene.time.now + 200 + i * 180,
      keepOff,
    };
  });
}

function shyOf(w: Wanderer): boolean {
  if (HIDDEN_IDS.has(w.id)) return false;
  const lead = ensureLeadAlive();
  if (!lead || lead.hp <= 0) return false;
  return lead.lv > (w.lv ?? 3);
}

function faceAway(w: Wanderer, dx: number, dy: number): void {
  if (Math.abs(dx) >= Math.abs(dy)) {
    w.facing = "side";
    w.flip = dx < 0 ? -1 : 1;
  } else if (dy < 0) {
    w.facing = "up";
    w.flip = 1;
  } else {
    w.facing = "down";
    w.flip = 1;
  }
}

export function tickWanderers(
  scene: Phaser.Scene,
  wanderers: Wanderer[],
  player?: { x: number; y: number },
): void {
  const now = scene.time.now;
  const dt = scene.game.loop.delta / 1000;
  for (const w of wanderers) {
    let fleeing = false;
    if (player && shyOf(w)) {
      const dist = Phaser.Math.Distance.Between(player.x, player.y, w.sprite.x, w.sprite.y);
      if (dist > 0.5 && dist < FLEE_RANGE) {
        fleeing = true;
        const ux = (w.sprite.x - player.x) / dist;
        const uy = (w.sprite.y - player.y) / dist;
        w.dx = ux * FLEE_SPEED;
        w.dy = uy * FLEE_SPEED;
        faceAway(w, ux, uy);
        w.until = now + 180;
      }
    }
    if (!fleeing && now > w.until) {
      w.until = now + 420 + Math.random() * 1400;
      const r = Math.random();
      if (r < 0.3) {
        w.dx = 0;
        w.dy = 0;
      } else if (r < 0.52) {
        w.dx = 16;
        w.dy = 0;
        w.facing = "side";
        w.flip = 1;
      } else if (r < 0.74) {
        w.dx = -16;
        w.dy = 0;
        w.facing = "side";
        w.flip = -1;
      } else if (r < 0.87) {
        w.dx = 0;
        w.dy = 16;
        w.facing = "down";
        w.flip = 1;
      } else {
        w.dx = 0;
        w.dy = -16;
        w.facing = "up";
        w.flip = 1;
      }
    }
    let nx = w.sprite.x + w.dx * dt;
    let ny = w.sprite.y + w.dy * dt;
    const minX = w.box.x + 6;
    const maxX = w.box.x + w.box.w - 6;
    const minY = w.box.y + 10;
    const maxY = w.box.y + w.box.h - 2;
    if (nx < minX || nx > maxX) {
      w.dx *= -1;
      if (w.facing === "side") w.flip *= -1;
      nx = Phaser.Math.Clamp(nx, minX, maxX);
    }
    if (ny < minY || ny > maxY) {
      w.dy *= -1;
      w.facing = w.dy > 0 ? "down" : w.dy < 0 ? "up" : w.facing;
      ny = Phaser.Math.Clamp(ny, minY, maxY);
    }
    if (blocked(nx, ny, w.keepOff)) {
      w.dx *= -1;
      w.dy *= -1;
      if (w.facing === "side") w.flip *= -1;
      nx = w.sprite.x;
      ny = w.sprite.y;
    }
    w.sprite.setPosition(nx, ny);
    w.sprite.setFlipX(w.flip < 0);
    w.sprite.setDepth(ny);
    const moving = w.dx !== 0 || w.dy !== 0;
    const anim = moving
      ? w.facing === "up"
        ? monOwAnim(w.id, "walk-up-loop")
        : w.facing === "side"
          ? monOwAnim(w.id, "walk-side-loop")
          : monOwAnim(w.id, "walk-down-loop")
      : w.facing === "up"
        ? monOwAnim(w.id, "idle-up")
        : w.facing === "side"
          ? monOwAnim(w.id, "idle-side")
          : monOwAnim(w.id, "idle-down");
    if (w.sprite.anims.currentAnim?.key !== anim) w.sprite.play(anim, true);
  }
}

export function wanderNear(
  player: { x: number; y: number },
  wanderers: Wanderer[],
  dist = 14,
): Wanderer | undefined {
  if (run.mounted) return undefined;
  const keepOff = wanderers[0]?.keepOff;
  if (keepOff && blocked(player.x, player.y, keepOff)) return undefined;
  let best: Wanderer | undefined;
  let bestD = dist;
  for (const w of wanderers) {
    const d = Phaser.Math.Distance.Between(player.x, player.y, w.sprite.x, w.sprite.y);
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  return best;
}

/** Visible map mon standing in this grass patch — fight that, not a random roll. */
export function wanderInGrass(
  player: { x: number; y: number },
  wanderers: Wanderer[],
  grass: WanderBox,
): Wanderer | undefined {
  if (run.mounted) return undefined;
  let best: Wanderer | undefined;
  let bestD = Infinity;
  for (const w of wanderers) {
    if (!inBox(w.sprite.x, w.sprite.y, grass)) continue;
    const d = Phaser.Math.Distance.Between(player.x, player.y, w.sprite.x, w.sprite.y);
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  return best;
}
