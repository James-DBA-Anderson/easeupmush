import Phaser from "phaser";
import { ensureLeadAlive, gymFoeMon, isBeaten, run, saveOverworld, trainerFoeMon, type ItemId } from "../run";
import type { SpeciesId } from "../species";
import { ensureNpcSheets, npcSheet, playNpc, type NpcLook } from "../sprites/npc";
import type { Facing } from "../walk";
import type { Line } from "../ui/MsgBox";
import { palAside } from "./pal";

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
  /** Mid-chat lines before a trainer fight (Look only — no LOS). */
  intro?: Line[];
  /** Interact uses this NPC's trainer / intro / beaten state. */
  pairLead?: string;
  trainer?: TrainerSpec;
};

export type FieldNpc = Omit<NpcSpec, "flip"> & {
  sprite: Phaser.GameObjects.Sprite;
  flip: number;
  dx: number;
  dy: number;
  until: number;
};

export function spawnFieldNpcs(scene: Phaser.Scene, specs: NpcSpec[]): FieldNpc[] {
  ensureNpcSheets(scene);
  return specs.map((spec, i) => {
    const sprite = scene.add.sprite(spec.x, spec.y, npcSheet(spec.look), "idle-down");
    sprite.setOrigin(0.5, 1);
    sprite.setDepth(spec.y);
    const flip = spec.flip ?? 1;
    sprite.setFlipX(flip < 0);
    playNpc(sprite, spec.look, spec.facing, false);
    return {
      ...spec,
      sprite,
      flip,
      dx: 0,
      dy: 0,
      until: scene.time.now + 280 + i * 160,
    };
  });
}

export function tickFieldNpcs(scene: Phaser.Scene, npcs: FieldNpc[]): void {
  const now = scene.time.now;
  const dt = scene.game.loop.delta / 1000;
  for (const n of npcs) {
    if (n.patrol) {
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
      n.sprite.setPosition(nx, ny);
    }
    n.sprite.setFlipX(n.flip < 0);
    n.sprite.setDepth(n.sprite.y);
    playNpc(n.sprite, n.look, n.facing, n.dx !== 0 || n.dy !== 0);
  }
}

export function npcNear(
  player: { x: number; y: number },
  npcs: FieldNpc[],
  dist = 16,
): FieldNpc | undefined {
  return npcs.find(
    (n) => Phaser.Math.Distance.Between(player.x, player.y, n.sprite.x, n.sprite.y - 8) < dist,
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

export function losTrainer(player: { x: number; y: number }, npcs: FieldNpc[]): FieldNpc | undefined {
  return npcs.find((n) => npcInLos(player, n));
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
  if (lead.trainer && isBeaten(lead.id)) return withPal(said(lead.trainer.after));
  if (lead.trainer && !run.starter) return withPal(said("Get a Pompeymon first mush."));
  if (lead.trainer?.need && !isBeaten(lead.trainer.need)) {
    if (run.palJoined && lead.trainer.palTalk) return withPal(said(lead.trainer.palTalk));
    return withPal(said(lead.talk));
  }
  if (lead.intro && lead.trainer && !isBeaten(lead.id)) return withPal(lead.intro);
  if (run.palJoined && lead.trainer?.palTalk && lead.trainer.prize) return withPal(said(lead.trainer.palTalk));
  return withPal(said(lead.talk));
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
  },
  {
    id: "hs-pub",
    name: "DAVE",
    look: "drunk",
    x: 148,
    y: 328,
    facing: "side",
    flip: -1,
    los: 36,
    patrol: { x: 142, y: 316, w: 16, h: 22 },
    talk: [
      "You're my best mate mush. You are.",
      "I aint never been to portsmuth before.",
    ],
    trainer: {
      title: "DRUNK DAVE",
      mon: "pidgeon",
      lv: 3,
      challenge: "One more. Then you mush.",
      win: "Ease up mush. Mine's a lager.",
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
    patrol: { x: 78, y: 230, w: 16, h: 50 },
    talk: [
      "You seen Steve mush? New bike. Cycles is down the street.",
      "Chemist drain. I wouldn't.",
    ],
  },
  {
    id: "hs-kay",
    name: "KAY",
    look: "lass",
    x: 84,
    y: 136,
    facing: "side",
    flip: 1,
    los: 44,
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
    x: 138,
    y: 124,
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
    x: 150,
    y: 124,
    facing: "side",
    flip: -1,
    pairLead: "hs-sharon",
    talk: "We're busy mush.",
  },
  {
    id: "hs-tom",
    name: "TOM",
    look: "hoodie",
    x: 150,
    y: 372,
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
    x: 52,
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
    x: 176,
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
    y: 158,
    facing: "side",
    flip: 1,
    los: 36,
    patrol: { x: 132, y: 148, w: 20, h: 22 },
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
    id: "is-bex",
    name: "BEX",
    look: "lass",
    x: 90,
    y: 396,
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
    y: 248,
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
    x: 88,
    y: 80,
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
