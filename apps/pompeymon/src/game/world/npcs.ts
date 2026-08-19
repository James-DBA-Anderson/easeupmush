import Phaser from "phaser";
import { isBeaten, partnerMon, run, saveOverworld } from "../run";
import type { SpeciesId } from "../species";
import { ensureNpcSheets, npcSheet, playNpc, type NpcLook } from "../sprites/npc";
import type { Facing } from "../walk";
import type { Line } from "../ui/MsgBox";

export type TrainerSpec = {
  title: string;
  mon: SpeciesId;
  lv: number;
  challenge: string;
  win: string;
  after: string;
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
  if (!npc.trainer || isBeaten(npc.id)) return false;
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

export function npcTalk(npc: FieldNpc): Line | Line[] {
  const said = (text: string | string[]): Line | Line[] =>
    Array.isArray(text) ? text.map((line) => ({ who: npc.name, text: line })) : { who: npc.name, text };
  if (npc.trainer && isBeaten(npc.id)) return said(npc.trainer.after);
  if (npc.trainer && !run.starter) return said("Get a Pompeymon first.");
  return said(npc.talk);
}

export function startTrainerFight(
  scene: Phaser.Scene,
  npc: FieldNpc,
  returnScene: string,
  pos: { x: number; y: number },
): boolean {
  if (!npc.trainer) return false;
  if (isBeaten(npc.id)) return false;
  if (!run.starter) return false;
  if ((partnerMon()?.hp ?? 0) <= 0) return false;
  saveOverworld(returnScene, pos);
  scene.scene.start("encounter", {
    trainer: {
      id: npc.id,
      title: npc.trainer.title,
      mon: npc.trainer.mon,
      lv: npc.trainer.lv,
      challenge: npc.trainer.challenge,
      win: npc.trainer.win,
      who: npc.name,
    },
  });
  return true;
}

export const HIGH_STREET_NPCS: NpcSpec[] = [
  {
    id: "hs-nan",
    name: "NAN",
    look: "coat",
    x: 84,
    y: 318,
    facing: "down",
    talk: "Iceland's always cold.",
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
    talk: "You're my best mate. You are.",
    trainer: {
      title: "DRUNK DAVE",
      mon: "pidgeon",
      lv: 5,
      challenge: "One more. Then you.",
      win: "Mine's a lager.",
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
    talk: "You seen Steve? New bike.",
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
    talk: "Chips first. Then you.",
    trainer: {
      title: "LASS KAY",
      mon: "chipgull",
      lv: 5,
      challenge: "I was here first.",
      win: "Fine. Have the chips.",
      after: "Chippy's still shut.",
    },
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
    talk: "Rat's from the chemist bin.",
    trainer: {
      title: "LAD TOM",
      mon: "donerrat",
      lv: 5,
      challenge: "Don't nick my bin.",
      win: "Take it then.",
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
    talk: "Give way. They never do.",
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
    talk: "High Street's that way. Mine first.",
    trainer: {
      title: "YOUNGSTER LEE",
      mon: "pidgeon",
      lv: 4,
      challenge: "Roundabout rules.",
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
    talk: "You can see the island from here.",
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
    talk: "Over the island. That's where it counts.",
    trainer: {
      title: "YOUNGSTER DEAN",
      mon: "pidgeon",
      lv: 6,
      challenge: "Let's see what Choke gave you.",
      win: "Alright. You're going.",
      after: "Go on then. Pompey.",
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
    talk: "Green Posts. I'm barred. Allegedly.",
    trainer: {
      title: "DRUNK MICK",
      mon: "donerrat",
      lv: 6,
      challenge: "I could take Pompey.",
      win: "Last orders. Apparently.",
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
    talk: "Bus is late. Again.",
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
    talk: "Don't tread on the Lines.",
    trainer: {
      title: "LASS BEX",
      mon: "spikehedge",
      lv: 7,
      challenge: "Mine rolls. Yours won't.",
      win: "It unrolled. Typical.",
      after: "South is North End. Not yet.",
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
    talk: "Boys school. Field's in there.",
    trainer: {
      title: "YOUNGSTER GAZ",
      mon: "squirral",
      lv: 6,
      challenge: "This bit's mine.",
      win: "The squirrels are worse.",
      after: "Watch the grass.",
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
    talk: "Cross country. Field's that way.",
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
    talk: "After school. Don't tell Sir.",
    trainer: {
      title: "LAD RYAN",
      mon: "squirral",
      lv: 6,
      challenge: "I train on the field.",
      win: "Kit's wet anyway.",
      after: "Go on. Northern Road.",
    },
  },
];
