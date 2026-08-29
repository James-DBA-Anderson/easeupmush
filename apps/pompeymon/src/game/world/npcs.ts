import Phaser from "phaser";
import { ensureLeadAlive, gymFoeMon, isBeaten, run, saveOverworld, trainerFoeMon, type ItemId } from "../run";
import type { SpeciesId } from "../species";
import { ensureNpcSheets, npcSheet, playNpc, type NpcLook } from "../sprites/npc";
import type { Facing, Solid } from "../walk";
import type { Line } from "../ui/MsgBox";
import { palAside } from "./pal";
import { setNpcBlockers, type WanderBox } from "./wander";

export type TrainerMate = {
  name: string;
  look: NpcLook;
  mon: SpeciesId;
  lv: number;
  win: string;
};

export type TrainerSpec = {
  title: string;
  mon: SpeciesId;
  lv: number;
  challenge: string;
  win: string;
  after: string;
  /** Must beat this trainer id before this fight starts. */
  need?: string;
  /** Item given on win (gym badge). */
  prize?: ItemId;
  /** Gym leader lines when they KO your mon. */
  taunt?: string[];
  /** Gym leader line on whiteout. */
  wipe?: string;
  /** Extra mons for this trainer (gym leaders). Sent one after another. */
  party?: { mon: SpeciesId; lv: number }[];
  /** Second trainer in a tag fight — their mon comes out after yours beats the first. */
  mate?: TrainerMate;
  /** When Jess is with you — gym leader clocks their shared past (battle open). */
  palPast?: string[];
  /** Win line when Jess is there (instead of / after win). */
  palWin?: string;
  /** Overworld line when Jess is with you (before/around the fight). */
  palTalk?: string | string[];
};

export type RouteStep = {
  /** Where they're heading. */
  x: number;
  y: number;
  /** What they do once they get there. */
  act?: "wait" | "shop" | "catch";
  /** How long they stop for (ms). */
  hold?: number;
  /** Line they give if you talk to them mid-errand. */
  say?: string;
};

export type NpcSpec = {
  id: string;
  name: string;
  look: NpcLook;
  x: number;
  y: number;
  facing: Facing;
  flip?: number;
  los?: number;
  patrol?: { x: number; y: number; w: number; h: number };
  talk: string | string[];
  /** Extra chat cycled through when you talk to them again. */
  more?: (string | string[])[];
  /** Errand loop — walk the map, duck into shops, hunt the grass. Overrides `patrol`. */
  route?: RouteStep[];
  /** Mid-chat lines before a trainer fight (Look only — no LOS). */
  intro?: Line[];
  /** Interact uses this NPC's trainer / intro / beaten state. */
  pairLead?: string;
  trainer?: TrainerSpec;
};

export type FieldNpc = Omit<NpcSpec, "flip"> & {
  sprite: Phaser.GameObjects.Sprite;
  /** Feet-sized solid body — the player walks round it. */
  zone: Phaser.GameObjects.Zone;
  flip: number;
  dx: number;
  dy: number;
  until: number;
  /** Errand state: which step they're on, when they can move again, and whether they're indoors. */
  step: number;
  hold: number;
  inside: boolean;
  /** Which way they're sidestepping round an obstacle, and how long they've been stuck. */
  dodge: number;
  stuck: number;
  /** Set while they're busy — what they say if you interrupt. */
  saying?: string;
};

/** Feet footprint of an NPC (sprite y is the feet line). */
const BODY_W = 12;
const BODY_H = 10;
/** Wider pad wild mons steer round, so none end up hidden behind a person. */
const SHOO_PAD = 6;

/** Map walls for the current area — people can't walk through buildings either. */
let areaWalls: Solid[] = [];

export function setNpcWalls(solids: Solid[]): void {
  areaWalls = solids;
}

/** Feet-point test against the map walls. */
function intoWall(x: number, y: number): boolean {
  return areaWalls.some((s) => x > s.x - 5 && x < s.x + s.w + 5 && y > s.y && y < s.y + s.h + 3);
}

export function spawnFieldNpcs(scene: Phaser.Scene, specs: NpcSpec[], solids?: Solid[]): FieldNpc[] {
  ensureNpcSheets(scene);
  if (solids) setNpcWalls(solids);
  const npcs = specs.map((spec, i) => {
    const sprite = scene.add.sprite(spec.x, spec.y, npcSheet(spec.look), "idle-down");
    sprite.setOrigin(0.5, 1);
    sprite.setDepth(spec.y);
    const flip = spec.flip ?? 1;
    sprite.setFlipX(flip < 0);
    playNpc(sprite, spec.look, spec.facing, false);
    const zone = scene.add.zone(spec.x, spec.y - BODY_H / 2, BODY_W, BODY_H);
    scene.physics.add.existing(zone);
    const body = zone.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setImmovable(true);
    body.moves = false;
    return {
      ...spec,
      sprite,
      zone,
      flip,
      dx: 0,
      dy: 0,
      until: scene.time.now + 280 + i * 160,
      step: 0,
      hold: scene.time.now + 400 + i * 300,
      inside: false,
      dodge: 0,
      stuck: 0,
    };
  });
  setNpcBlockers(npcBoxes(npcs));
  return npcs;
}

/** Keep-off rects round each person — used by wild spawning and wandering. */
export function npcBoxes(npcs: FieldNpc[]): WanderBox[] {
  return npcs.filter((n) => !n.inside).map((n) => ({
    x: n.sprite.x - BODY_W / 2 - SHOO_PAD,
    y: n.sprite.y - BODY_H - SHOO_PAD,
    w: BODY_W + SHOO_PAD * 2,
    h: BODY_H + SHOO_PAD * 2,
  }));
}

/** The kid, so people walking their rounds go round you as well. */
let areaPlayer: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody | undefined;

/** Make the people solid for the player — call after `addWalls`. */
export function blockNpcs(
  scene: Phaser.Scene,
  player: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
  npcs: FieldNpc[],
): void {
  areaPlayer = player;
  for (const n of npcs) scene.physics.add.collider(player, n.zone);
}

export function tickFieldNpcs(scene: Phaser.Scene, npcs: FieldNpc[]): void {
  const now = scene.time.now;
  const dt = scene.game.loop.delta / 1000;
  let moved = false;
  for (const n of npcs) {
    if (n.route?.length) {
      moved = moved || runRoute(scene, n, npcs, now, dt);
    } else if (n.patrol) {
      moved = moved || n.dx !== 0 || n.dy !== 0;
      if (now > n.until) {
        n.until = now + 500 + Math.random() * 1200;
        const r = Math.random();
        if (r < 0.28) {
          n.dx = 0;
          n.dy = 0;
        } else if (r < 0.5) {
          n.dx = 22;
          n.dy = 0;
          n.facing = "side";
          n.flip = 1;
        } else if (r < 0.72) {
          n.dx = -22;
          n.dy = 0;
          n.facing = "side";
          n.flip = -1;
        } else if (r < 0.86) {
          n.dx = 0;
          n.dy = 22;
          n.facing = "down";
          n.flip = 1;
        } else {
          n.dx = 0;
          n.dy = -22;
          n.facing = "up";
          n.flip = 1;
        }
      }
      let nx = n.sprite.x + n.dx * dt;
      let ny = n.sprite.y + n.dy * dt;
      const minX = n.patrol.x + 6;
      const maxX = n.patrol.x + n.patrol.w - 6;
      const minY = n.patrol.y + 10;
      const maxY = n.patrol.y + n.patrol.h - 2;
      if (nx < minX || nx > maxX) {
        n.dx *= -1;
        if (n.facing === "side") n.flip *= -1;
        nx = Phaser.Math.Clamp(nx, minX, maxX);
      }
      if (ny < minY || ny > maxY) {
        n.dy *= -1;
        n.facing = n.dy > 0 ? "down" : n.dy < 0 ? "up" : n.facing;
        ny = Phaser.Math.Clamp(ny, minY, maxY);
      }
      if (blockedAt(n, nx, ny, npcs)) {
        n.dx *= -1;
        n.dy *= -1;
        if (n.facing === "side") n.flip *= -1;
        n.facing = n.dy > 0 ? "down" : n.dy < 0 ? "up" : n.facing;
        nx = n.sprite.x;
        ny = n.sprite.y;
      }
      n.sprite.setPosition(nx, ny);
    }
    if (n.inside) continue;
    n.sprite.setFlipX(n.flip < 0);
    n.sprite.setDepth(n.sprite.y);
    (n.zone.body as Phaser.Physics.Arcade.Body).reset(n.sprite.x, n.sprite.y - BODY_H / 2);
    playNpc(n.sprite, n.look, n.facing, n.dx !== 0 || n.dy !== 0);
  }
  if (moved) setNpcBlockers(npcBoxes(npcs));
}

const ROUTE_SPEED = 26;
/** Give up on a leg after this long shuffling about with nowhere to go. */
const STUCK_MS = 1800;

/** Walk an errand loop — one leg at a time, then whatever they came to do. Returns true if they shifted. */
function runRoute(scene: Phaser.Scene, n: FieldNpc, npcs: FieldNpc[], now: number, dt: number): boolean {
  const route = n.route!;
  const step = route[n.step % route.length]!;
  if (now < n.hold) {
    n.dx = 0;
    n.dy = 0;
    return false;
  }
  if (n.inside) {
    showNpc(n, true);
    n.saying = undefined;
    n.step += 1;
    return true;
  }
  n.saying = undefined;
  const dx = step.x - n.sprite.x;
  const dy = step.y - n.sprite.y;
  if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
    n.dx = 0;
    n.dy = 0;
    n.stuck = 0;
    arriveAt(scene, n, step, now);
    return false;
  }

  const reach = ROUTE_SPEED * dt;
  const goX = Math.abs(dx) > 1 ? Math.sign(dx) : 0;
  const goY = Math.abs(dy) > 1 ? Math.sign(dy) : 0;
  // Straight at it first (one axis at a time keeps them on the pavement), then
  // sidestep round whatever's in the way, keeping the same side once committed.
  const tries: [number, number, boolean][] = [];
  if (goX) tries.push([goX, 0, false]);
  if (goY) tries.push([0, goY, false]);
  const side = n.dodge || 1;
  if (goX) tries.push([0, side, true], [0, -side, true]);
  else if (goY) tries.push([side, 0, true], [-side, 0, true]);

  for (const [ax, ay, detour] of tries) {
    const rawX = n.sprite.x + ax * reach;
    const rawY = n.sprite.y + ay * reach;
    const nx = ax ? (detour ? rawX : clampStep(n.sprite.x, rawX, step.x)) : n.sprite.x;
    const ny = ay ? (detour ? rawY : clampStep(n.sprite.y, rawY, step.y)) : n.sprite.y;
    if (blockedAt(n, nx, ny, npcs)) continue;
    n.dx = ax * ROUTE_SPEED;
    n.dy = ay * ROUTE_SPEED;
    n.dodge = detour ? (ax || ay) : 0;
    if (ax) {
      n.facing = "side";
      n.flip = ax > 0 ? 1 : -1;
    } else {
      n.facing = ay > 0 ? "down" : "up";
      n.flip = 1;
    }
    if (!detour) n.stuck = 0;
    else {
      // Two people sidestepping the same way would shuffle along together forever.
      n.stuck += dt * 1000;
      if (n.stuck > 900) {
        n.dodge = -n.dodge;
        n.stuck = 0;
      }
    }
    n.sprite.setPosition(nx, ny);
    return true;
  }

  // Boxed in — stand there a moment, then write the leg off.
  n.dx = 0;
  n.dy = 0;
  n.dodge = 0;
  n.stuck += dt * 1000;
  if (n.stuck > STUCK_MS) {
    n.stuck = 0;
    n.step += 1;
    n.hold = now + 300;
  }
  return false;
}

/** Buildings, the kid, and other people. */
function blockedAt(self: FieldNpc, x: number, y: number, npcs: FieldNpc[]): boolean {
  if (intoWall(x, y)) return true;
  const feet = areaPlayer?.body.center;
  if (feet && Math.abs(feet.x - x) < BODY_W && Math.abs(feet.y + 3 - y) < BODY_H) return true;
  return npcs.some((o) => {
    if (o === self || o.inside) return false;
    return Math.abs(o.sprite.x - x) < BODY_W && Math.abs(o.sprite.y - y) < BODY_H;
  });
}

/** Don't overshoot the waypoint on a long frame. */
function clampStep(from: number, to: number, target: number): number {
  return from < target ? Math.min(to, target) : Math.max(to, target);
}

function arriveAt(scene: Phaser.Scene, n: FieldNpc, step: RouteStep, now: number): void {
  n.saying = step.say;
  if (step.act === "shop") {
    showNpc(n, false);
    n.hold = now + (step.hold ?? 3200);
    return;
  }
  if (step.act === "catch") {
    n.facing = "down";
    scene.tweens.add({
      targets: n.sprite,
      y: n.sprite.y - 4,
      duration: 160,
      yoyo: true,
      repeat: 2,
      ease: "Quad.easeOut",
    });
    n.hold = now + (step.hold ?? 2200);
    n.step += 1;
    return;
  }
  n.hold = now + (step.hold ?? 1400);
  n.step += 1;
}

/** Duck into a shop / come back out. */
function showNpc(n: FieldNpc, on: boolean): void {
  n.inside = !on;
  n.sprite.setVisible(on);
  (n.zone.body as Phaser.Physics.Arcade.Body).enable = on;
}

export function npcNear(
  player: { x: number; y: number },
  npcs: FieldNpc[],
  dist = 16,
  keepOff?: WanderBox[],
): FieldNpc | undefined {
  if (keepOff?.some((z) => player.x >= z.x && player.x <= z.x + z.w && player.y >= z.y && player.y <= z.y + z.h)) {
    return undefined;
  }
  return npcs.find(
    (n) => !n.inside && Phaser.Math.Distance.Between(player.x, player.y, n.sprite.x, n.sprite.y - 8) < dist,
  );
}

export function npcInLos(player: { x: number; y: number }, npc: FieldNpc): boolean {
  if (!npc.trainer || npc.intro || isBeaten(npc.id)) return false;
  if (npc.trainer.need && !isBeaten(npc.trainer.need)) return false;
  const range = npc.los ?? 52;
  const x = npc.sprite.x;
  const y = npc.sprite.y;
  if (npc.facing === "down") {
    return Math.abs(player.x - x) < 11 && player.y > y + 4 && player.y < y + range;
  }
  if (npc.facing === "up") {
    return Math.abs(player.x - x) < 11 && player.y < y - 4 && player.y > y - range;
  }
  const dir = npc.flip < 0 ? -1 : 1;
  const dx = player.x - x;
  return Math.abs(player.y - y) < 12 && dx * dir > 0 && Math.abs(dx) < range;
}

export function losTrainer(
  player: { x: number; y: number },
  npcs: FieldNpc[],
  keepOff?: WanderBox[],
): FieldNpc | undefined {
  if (keepOff?.some((z) => player.x >= z.x && player.x <= z.x + z.w && player.y >= z.y && player.y <= z.y + z.h)) {
    return undefined;
  }
  return npcs.find((n) => !n.inside && npcInLos(player, n));
}

/** Resolve pair mate → lead so both share one fight / beaten flag. */
export function trainerLead(npc: FieldNpc, npcs: FieldNpc[]): FieldNpc {
  if (!npc.pairLead) return npc;
  return npcs.find((n) => n.id === npc.pairLead) ?? npc;
}

export function npcTalk(npc: FieldNpc, npcs?: FieldNpc[]): Line | Line[] {
  const lead = npcs ? trainerLead(npc, npcs) : npc;
  const said = (text: string | string[]): Line | Line[] =>
    Array.isArray(text)
      ? text.map((line) => ({ who: lead.name, text: line }))
      : { who: lead.name, text };
  const withPal = (out: Line | Line[]): Line | Line[] => {
    const extra = palAside(lead.id);
    if (!extra) return out;
    return [...(Array.isArray(out) ? out : [out]), extra];
  };
  if (lead.saying) return withPal(said(lead.saying));
  if (lead.trainer && isBeaten(lead.id)) return withPal(said(lead.trainer.after));
  if (lead.trainer && !run.starter) {
    return withPal(
      said(
        run.labVisited
          ? "Get a Pompeymon first mush."
          : [
              "Get a Pompeymon first mush.",
              "Choke's research centre — north end of High Street. Cream. Navy board.",
            ],
      ),
    );
  }
  if (lead.trainer?.need && !isBeaten(lead.trainer.need)) {
    if (run.palJoined && lead.trainer.palTalk) return withPal(said(lead.trainer.palTalk));
    return withPal(said(lead.talk));
  }
  if (lead.intro && lead.trainer && !isBeaten(lead.id)) return withPal(lead.intro);
  if (run.palJoined && lead.trainer?.palTalk && lead.trainer.prize) return withPal(said(lead.trainer.palTalk));
  const turn = chatTurn(lead.id);
  if (!run.labVisited) {
    const tip = labTip(lead.id);
    if (tip && turn === 0) return withPal(said(tip));
  }
  const spare = lead.more ?? [];
  const pick = (run.labVisited ? turn : Math.max(0, turn - 1)) % (spare.length + 1);
  return withPal(said(pick === 0 ? lead.talk : spare[pick - 1]!));
}

const chats = new Map<string, number>();

/** How many times we've chatted this one — drives their next line. */
function chatTurn(id: string): number {
  const n = chats.get(id) ?? 0;
  chats.set(id, n + 1);
  return n;
}

/** Point players at Choke's before they've stepped inside. */
function labTip(id: string): string | string[] | undefined {
  switch (id) {
    case "hs-nan":
      return [
        "Looking for Choke's? Research centre's up the north end.",
        "Cream building. Navy board. Can't miss it mush.",
      ];
    case "hs-steve-mate":
      return [
        "Steve's somewhere. Research centre's up by the top of High Street.",
        "Choke's place. Cream. Navy. New trainers wanted — flyer said.",
      ];
    case "hs-kay":
      return "Chippy's here. Research centre's further up — north, west side.";
    case "rb-giveway":
      return [
        "Give way. They never do.",
        "Want Choke's research centre? High Street east, then north. Cream building.",
      ];
    case "rb-lee":
      return "High Street that way. Research centre's up the north end mush.";
    case "hs-pub":
      return "Research centre? Top of the street. Past the chippy. I'm busy mush.";
    default:
      return undefined;
  }
}

export function startTrainerFight(
  scene: Phaser.Scene,
  npc: FieldNpc,
  returnScene: string,
  pos: { x: number; y: number },
  npcs?: FieldNpc[],
): boolean {
  const lead = npcs ? trainerLead(npc, npcs) : npc;
  if (!lead.trainer) return false;
  if (isBeaten(lead.id)) return false;
  if (lead.trainer.need && !isBeaten(lead.trainer.need)) return false;
  if (!run.starter) return false;
  if ((ensureLeadAlive()?.hp ?? 0) <= 0) return false;
  saveOverworld(returnScene, pos);
  const mate = lead.trainer.mate;
  const pick = lead.trainer.prize ? gymFoeMon : trainerFoeMon;
  const taken: SpeciesId[] = [];
  const mon = pick(lead.trainer.mon);
  taken.push(mon);
  const party = (lead.trainer.party ?? []).map((p) => {
    const id = pick(p.mon, taken);
    taken.push(id);
    return { mon: id, lv: p.lv };
  });
  scene.scene.start("encounter", {
    trainer: {
      id: lead.id,
      title: lead.trainer.title,
      mon,
      lv: lead.trainer.lv,
      challenge: lead.trainer.challenge,
      win: lead.trainer.win,
      look: lead.look,
      who: lead.name,
      prize: lead.trainer.prize,
      taunt: lead.trainer.taunt,
      wipe: lead.trainer.wipe,
      palPast: lead.trainer.palPast,
      palWin: lead.trainer.palWin,
      party: party.length ? party : undefined,
      mate: mate
        ? {
            who: mate.name,
            look: mate.look,
            mon: pick(mate.mon, taken),
            lv: mate.lv,
            win: mate.win,
          }
        : undefined,
    },
  });
  return true;
}

/** True if Look should show intro chat then start the fight. */
export function needsTrainerIntro(npc: FieldNpc, npcs: FieldNpc[]): boolean {
  const lead = trainerLead(npc, npcs);
  return !!(lead.trainer && lead.intro && !isBeaten(lead.id) && run.starter && (ensureLeadAlive()?.hp ?? 0) > 0);
}

export const HIGH_STREET_NPCS: NpcSpec[] = [
  {
    id: "hs-nan",
    name: "NAN",
    look: "coat",
    x: 84,
    y: 318,
    facing: "down",
    talk: "Charity's up the street. Pawn's by the pub.",
    more: [
      "Don't squinny at me mush. I only said.",
      ["Gulls had me chips last Tuesday.", "Bold as you like."],
      "My Ron kept a Pompeymon. Bit the postman.",
      "Bus don't come no more. Nor does Ron.",
    ],
  },
  {
    id: "hs-pub",
    name: "DAVE",
    look: "drunk",
    x: 148,
    y: 300,
    facing: "side",
    flip: -1,
    los: 36,
    patrol: { x: 142, y: 288, w: 16, h: 22 },
    talk: [
      "You're my best mate mush. You are.",
      "I aint never been to portsmuth before.",
    ],
    trainer: {
      title: "DRUNK DAVE",
      mon: "pidgeon",
      lv: 3,
      challenge: "One more. Then you mush.",
      win: "Ease up mush. Oh well. Shant on.",
      wipe: "Shant on! Cheers mush, get 'em in.",
      after: "Pub's shut anyway.",
    },
  },
  {
    id: "hs-steve-mate",
    name: "KEV",
    look: "hoodie",
    x: 84,
    y: 250,
    facing: "down",
    talk: [
      "You seen Steve mush? New bike. Cycles is down the street.",
      "Chemist drain. I wouldn't.",
    ],
    route: [
      { x: 84, y: 250, hold: 2400, say: "Waiting on Steve. He's always late." },
      { x: 104, y: 250 },
      { x: 104, y: 414 },
      { x: 90, y: 420, act: "shop", hold: 5200 },
      { x: 104, y: 420 },
      { x: 104, y: 300, hold: 1600, say: "Ninety quid for a lock. Ninety." },
      { x: 84, y: 250, hold: 2000 },
    ],
  },
  {
    id: "hs-kay",
    name: "KAY",
    look: "lass",
    x: 84,
    y: 176,
    facing: "side",
    flip: 1,
    los: 40,
    talk: "Chips first. Then you mush. Chippy's open. Feed 'em.",
    trainer: {
      title: "LASS KAY",
      mon: "chipgull",
      lv: 3,
      challenge: "I was here first. Don't squinny.",
      win: "Fine. Have the chips.",
      after: "Chippy's open. Feed your Pompeymon.",
    },
  },
  {
    id: "hs-sharon",
    name: "SHARON",
    look: "blond",
    x: 148,
    y: 220,
    facing: "side",
    flip: 1,
    talk: "We're busy mush.",
    intro: [
      {
        who: "SHARON",
        text: "And I said put a brush on it and you can do my teeth at the same time!",
      },
      { who: "TRACY", text: "Oh, didn't see you there..." },
    ],
    trainer: {
      title: "SHARON & TRACY",
      mon: "chipgull",
      lv: 3,
      challenge: "Eavesdropping. We'll batter you.",
      win: "That's bang out of order.",
      after: "Mind your own mush.",
      mate: {
        name: "TRACY",
        look: "coat",
        mon: "moggit",
        lv: 3,
        win: "Ease up mush.",
      },
    },
  },
  {
    id: "hs-tracy",
    name: "TRACY",
    look: "coat",
    x: 160,
    y: 220,
    facing: "side",
    flip: -1,
    pairLead: "hs-sharon",
    talk: "We're busy mush.",
  },
  {
    id: "hs-jan",
    name: "JAN",
    look: "blond",
    x: 148,
    y: 330,
    facing: "up",
    talk: "Chips, then the charity. Same every Friday mush.",
    more: ["Bag for life. Six of 'em at home.", "Pawn's got my Ron's watch. Long story."],
    route: [
      { x: 148, y: 330, hold: 2000 },
      { x: 148, y: 190 },
      { x: 148, y: 178, act: "shop", hold: 4600 },
      { x: 148, y: 200 },
      { x: 120, y: 200 },
      { x: 90, y: 140 },
      { x: 90, y: 132, act: "shop", hold: 5000 },
      { x: 90, y: 160, hold: 1800, say: "Large chips. Don't tell my Ron." },
      { x: 120, y: 260 },
      { x: 148, y: 330, hold: 2400 },
    ],
  },
  {
    id: "hs-tom",
    name: "TOM",
    look: "hoodie",
    x: 150,
    y: 260,
    facing: "side",
    flip: -1,
    los: 40,
    talk: [
      "Rat's from the chemist bin mush.",
      "Who's that mush fink he is?",
    ],
    trainer: {
      title: "LAD TOM",
      mon: "donerrat",
      lv: 3,
      challenge: "Don't nick my bin you dinlo.",
      win: "Take it then. That's bang out of order.",
      after: "Chemist's still shut.",
    },
  },
];

export const ROUNDABOUT_NPCS: NpcSpec[] = [
  {
    id: "rb-giveway",
    name: "BLOKE",
    look: "polo",
    x: 70,
    y: 92,
    facing: "side",
    flip: 1,
    talk: [
      "Give way. They never do.",
      "That's bang out of order mush.",
      "Verge is loud after dark.",
    ],
  },
  {
    id: "rb-lee",
    name: "LEE",
    look: "cap",
    x: 160,
    y: 82,
    facing: "side",
    flip: 1,
    los: 32,
    talk: "High Street's that way mush. Mine first.",
    trainer: {
      title: "YOUNGSTER LEE",
      mon: "pidgeon",
      lv: 3,
      challenge: "Roundabout rules mush.",
      win: "Gave way. First time.",
      after: "Watch the gulls.",
    },
  },
];

export const HILL_NPCS: NpcSpec[] = [
  {
    id: "hill-view",
    name: "NAN",
    look: "coat",
    x: 120,
    y: 88,
    facing: "up",
    talk: "You can see the island from here mush.",
    more: [
      "Clear day you get the spinnaker. Not today.",
      ["Walked up here every morning for forty year.", "Knees know it."],
      "Wind's off the harbour. Do your coat up.",
    ],
  },
];

export const BRIDGE_NPCS: NpcSpec[] = [
  {
    id: "br-dean",
    name: "DEAN",
    look: "cap",
    x: 120,
    y: 72,
    facing: "down",
    los: 40,
    talk: [
      "Over the island. That's Pompey mush.",
      "These Pompeymon? Don't care about 'em. They're tools.",
    ],
    trainer: {
      title: "YOUNGSTER DEAN",
      mon: "pidgeon",
      lv: 6,
      challenge: "Don't care about mine. Don't care about yours. Battle.",
      win: "Whatever. Keep walking.",
      after: "Pompey. I aint going over. Don't care.",
    },
  },
];

export const ISLAND_NPCS: NpcSpec[] = [
  {
    id: "is-mick",
    name: "MICK",
    look: "drunk",
    x: 140,
    y: 128,
    facing: "side",
    flip: 1,
    los: 36,
    patrol: { x: 132, y: 118, w: 20, h: 22 },
    talk: [
      "Green Posts. I'm barred. Allegedly.",
      "I'd bang him out if he said that to me.",
      "School gym's cushty. Atkins. Hilsea Badge.",
      "Pawn's down the road. Charity's further.",
    ],
    trainer: {
      title: "DRUNK MICK",
      mon: "donerrat",
      lv: 6,
      challenge: "I could take Pompey mush.",
      win: "Ease up mush. Last orders.",
      after: "Posts are shut. For me.",
    },
  },
  {
    id: "is-bus",
    name: "LAD",
    look: "hoodie",
    x: 70,
    y: 338,
    facing: "down",
    talk: [
      "Bus is late. Again.",
      "I'm not squinnying. It is late mush.",
      "Nuffin ever comes when it should.",
      "School gym. Atkins. Hilsea Badge.",
      "Hilsea Cycles. Get a lock mush.",
    ],
  },
  {
    id: "is-ryan",
    name: "RYAN",
    look: "cap",
    x: 110,
    y: 340,
    facing: "down",
    talk: "Grass by the lines is heaving mush. Boxes ready.",
    more: ["Had one this morning. It got out the box.", "Don't tell the bus lad. He'll want one."],
    route: [
      { x: 110, y: 340, hold: 1600 },
      { x: 110, y: 372 },
      { x: 60, y: 372, act: "catch", hold: 2600, say: "Sshh. It's right there mush." },
      { x: 110, y: 372 },
      { x: 110, y: 482 },
      { x: 58, y: 482, act: "catch", hold: 2800, say: "Nearly had it. Nearly." },
      { x: 110, y: 482 },
      { x: 110, y: 340, hold: 2200 },
    ],
  },
  {
    id: "is-bex",
    name: "BEX",
    look: "lass",
    x: 90,
    y: 420,
    facing: "side",
    flip: 1,
    los: 48,
    talk: "Don't tread on the Lines mush.",
    trainer: {
      title: "LASS BEX",
      mon: "spikehedge",
      lv: 7,
      challenge: "Mine rolls. Yours won't.",
      win: "It unrolled. Typical.",
      after: "South is North End. Not yet. Gym's the school.",
    },
  },
  {
    id: "is-gaz",
    name: "GAZ",
    look: "cap",
    x: 150,
    y: 290,
    facing: "side",
    flip: -1,
    los: 48,
    talk: [
      "Boys' school. Atkins does the gym mush.",
      "Hilsea Badge. That's the one.",
    ],
    trainer: {
      title: "YOUNGSTER GAZ",
      mon: "squirral",
      lv: 6,
      challenge: "This bit's mine. I will batter you.",
      win: "The squirrels are worse mush.",
      after: "Gym's in the school. Stevie J then Atkins.",
    },
  },
];

export const SCHOOL_NPCS: NpcSpec[] = [
  {
    id: "sch-pe",
    name: "SIR",
    look: "polo",
    x: 120,
    y: 100,
    facing: "down",
    talk: [
      "Gym's inside. Mr Atkins. Hilsea Badge.",
      "Shed latch is off again.",
    ],
  },
  {
    id: "sch-ryan",
    name: "RYAN",
    look: "cap",
    x: 72,
    y: 150,
    facing: "side",
    flip: 1,
    los: 40,
    talk: "After school mush. Don't tell Sir.",
    trainer: {
      title: "LAD RYAN",
      mon: "squirral",
      lv: 6,
      challenge: "I will batter you mush.",
      win: "Ease up mush. Kit's wet anyway.",
      after: "Go on. Main doors. Stevie J's in there.",
    },
  },
];

export const SCHOOL_IN_NPCS: NpcSpec[] = [
  {
    id: "si-janitor",
    name: "JANITOR",
    look: "coat",
    x: 48,
    y: 196,
    facing: "side",
    flip: 1,
    talk: "Wet floor. Don't you dare mush.",
  },
  {
    id: "si-miss",
    name: "MISS",
    look: "lass",
    x: 176,
    y: 200,
    facing: "side",
    flip: -1,
    talk: "No running. Gym is north.",
  },
  {
    id: "si-dot",
    name: "DOT",
    look: "coat",
    x: 48,
    y: 276,
    facing: "down",
    talk: "Fish today. Don't squinny.",
  },
  {
    id: "si-val",
    name: "VAL",
    look: "lass",
    x: 70,
    y: 276,
    facing: "side",
    flip: -1,
    los: 32,
    talk: "Dinner first. Then Atkins.",
    trainer: {
      title: "DINNER VAL",
      mon: "chipgull",
      lv: 7,
      challenge: "Chips are mine geez.",
      win: "Fine. Have the fish.",
      after: "Gym's north. Stevie J's in the way.",
    },
  },
  {
    id: "si-dan",
    name: "DAN",
    look: "hoodie",
    x: 100,
    y: 248,
    facing: "down",
    los: 40,
    talk: "Corridor's mine mush.",
    trainer: {
      title: "LAD DAN",
      mon: "pidgeon",
      lv: 7,
      challenge: "You're not getting past.",
      win: "Alright. Go on then.",
      after: "Stevie J next. He's the one.",
    },
  },
  {
    id: "si-kev",
    name: "KEV",
    look: "cap",
    x: 140,
    y: 200,
    facing: "down",
    los: 40,
    talk: "Stevie J's up there geez.",
    trainer: {
      title: "LAD KEV",
      mon: "squirral",
      lv: 8,
      challenge: "I will batter you mush.",
      win: "Ease up mush.",
      after: "Stevie J's the strongest pupil init.",
    },
  },
  {
    id: "si-stevie",
    name: "STEVIE J",
    look: "hoodie",
    x: 120,
    y: 136,
    facing: "down",
    los: 48,
    talk: "I'm the strongest pupil geez.",
    trainer: {
      title: "LAD STEVIE J",
      mon: "spikehedge",
      lv: 9,
      challenge: "Atkins is after me. Get through me first.",
      win: "Cushty. Go on then.",
      after: "Atkins is in the gym. Don't skip PE.",
    },
  },
  {
    id: "si-atkins",
    name: "ATKINS",
    look: "polo",
    x: 120,
    y: 52,
    facing: "down",
    los: 44,
    talk: "Stevie J first. Then PE.",
    trainer: {
      title: "LEADER ATKINS",
      mon: "squirral",
      lv: 10,
      need: "si-stevie",
      prize: "hilsea",
      challenge: "Kit on. Hilsea Badge if you last.",
      win: "Don't skip PE.",
      after: "Badge is yours. Cross country next week.",
      palTalk: [
        "Jess. Still owes me three laps.",
        "Stevie J first. Then PE. She knows.",
      ],
      palPast: [
        "Jess. Back for another go.",
        "Rain. Laps. She sat on the wall and swore she'd bring someone better.",
      ],
      palWin: "Tell Jess PE's still wet. You weren't.",
      taunt: [
        "That's PE. Don't squinny.",
        "Kit's wet. You're wetter.",
        "Is that it? Sit out.",
        "Laps. You need laps mush.",
        "Cross country would flatten you.",
        "Don't cop. You fainted.",
      ],
      wipe: "Lab. Choke can mop you up.",
      party: [
        { mon: "starlimur", lv: 10 },
        { mon: "busstopper", lv: 10 },
      ],
    },
  },
];
