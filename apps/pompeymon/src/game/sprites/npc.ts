import Phaser from "phaser";
import type { Facing } from "../walk";

export const NPC_FW = 32;
export const NPC_FH = 32;

export type NpcLook = "hoodie" | "coat" | "polo" | "lass" | "cap" | "drunk";

const BASE: Record<string, number> = {
  k: 0x1a1410,
  n: 0x2a1c10,
  s: 0xf0c8a0,
  S: 0xd4a078,
  w: 0xfff8f0,
  e: 0x201810,
  p: 0x2a4a88,
  P: 0x1a3068,
};

const PALS: Record<NpcLook, Record<string, number>> = {
  hoodie: {
    ...BASE,
    h: 0x4a3018,
    H: 0x6e4a28,
    j: 0x5a5a64,
    J: 0x3a3a44,
    l: 0x7a7a84,
    c: 0x3a3a48,
    t: 0x2c3048,
    T: 0x1c2034,
    o: 0xd45c28,
    O: 0x8a3018,
  },
  coat: {
    ...BASE,
    h: 0xa8a098,
    H: 0xc8c0b8,
    s: 0xe8b888,
    S: 0xc49068,
    j: 0x6a3048,
    J: 0x4a2034,
    l: 0x8a4860,
    c: 0x4a2030,
    t: 0x4a2034,
    T: 0x2a1424,
    o: 0x6a3820,
    O: 0x4a2414,
  },
  polo: {
    ...BASE,
    h: 0x3a2414,
    H: 0x5a3820,
    j: 0xf0f0e8,
    J: 0xd0d0c8,
    l: 0xffffff,
    c: 0x2a3a68,
    t: 0x2a3048,
    T: 0x1c2034,
    o: 0x4a4a54,
    O: 0x2a2a34,
  },
  lass: {
    ...BASE,
    h: 0x5a2818,
    H: 0x7a4028,
    j: 0xc85878,
    J: 0x983858,
    l: 0xe07898,
    c: 0x883048,
    t: 0x3a3a48,
    T: 0x242430,
    o: 0xd45c28,
    O: 0x8a3018,
  },
  cap: {
    ...BASE,
    h: 0x2a4a88,
    H: 0x3a6ab0,
    n: 0x1a3068,
    j: 0x2a8a48,
    J: 0x1a6834,
    l: 0x48b060,
    c: 0x1c5a30,
    t: 0x2c3048,
    T: 0x1c2034,
    o: 0xd45c28,
    O: 0x8a3018,
  },
  drunk: {
    ...BASE,
    s: 0xf09880,
    S: 0xd07058,
    h: 0x4a2814,
    H: 0x6a4024,
    j: 0xe0d8b8,
    J: 0xb8b090,
    l: 0xf0e8c8,
    c: 0x6a3040,
    t: 0x3a3048,
    T: 0x241828,
    o: 0x4a4a54,
    O: 0x2a2a34,
  },
};

const FRAMES = [
  "idle-down",
  "walk-down-1",
  "walk-down-2",
  "idle-side",
  "walk-side-1",
  "walk-side-2",
  "idle-up",
  "walk-up-1",
  "walk-up-2",
] as const;

type NpcFrame = (typeof FRAMES)[number];

const idleDown = [
  "....kkkkkk....",
  "...khHHHHHk...",
  "..knhhhhhhnk..",
  "..khhsssshhk..",
  ".khsssssssshk.",
  ".ksswesewsssk.",
  ".kssssssssssk.",
  "..ksSssssSsk..",
  "...kssssssk...",
  "...kcjjjjck...",
  "..kjlllllljk..",
  ".kjjjjjjjjjjk.",
  ".kjjjJjjJjJjk.",
  ".ksjjjjjjjjsk.",
  ".kjjjjjjjjjjk.",
  "..kJjjjjjjJk..",
  "...kttttttk...",
  "...ktTttTtk...",
  "...kttttttk...",
  "...koookook...",
  "....kOkkOk....",
];

const walkDown1 = [
  "....kkkkkk....",
  "...khHHHHHk...",
  "..knhhhhhhnk..",
  "..khhsssshhk..",
  ".khsssssssshk.",
  ".ksswesewsssk.",
  ".kssssssssssk.",
  "..ksSssssSsk..",
  "...kssssssk...",
  "...kcjjjjck...",
  "..kjlllllljk..",
  ".kjjjjjjjjjjk.",
  "ksjjjJjjJjJjk.",
  "k.kjjjjjjjjk.k",
  ".kjjjjjjjjjk..",
  "..kJjjjjjJk...",
  "...ktt..ttk...",
  "...ktT..Ttk...",
  "..koook.kook..",
  "...kO....Ok...",
];

const walkDown2 = [
  "....kkkkkk....",
  "...khHHHHHk...",
  "..knhhhhhhnk..",
  "..khhsssshhk..",
  ".khsssssssshk.",
  ".ksswesewsssk.",
  ".kssssssssssk.",
  "..ksSssssSsk..",
  "...kssssssk...",
  "...kcjjjjck...",
  "..kjlllllljk..",
  ".kjjjjjjjjjjk.",
  ".kjjjJjjJjJjsk",
  "k.kjjjjjjjjk.k",
  "..kjjjjjjjjk..",
  "...kJjjjjJk...",
  "...ktt..ttk...",
  "...ktT..Ttk...",
  "..kook.koook..",
  "...kO....Ok...",
];

const idleSide = [
  "....kkkkkk....",
  "...khHHHHHk...",
  "..knhhhhhhnk..",
  "..khhhssshhk..",
  ".khhhssssshk.",
  ".khhsswesk..",
  ".khhssssssk..",
  "..khssSssk...",
  "...ksssssk...",
  "...kcjjjjk...",
  "..kjlllljk...",
  ".kjjjjjjjjk..",
  ".kjjjJjjJjk..",
  ".kjjjjjjjsk..",
  ".kjjjjjjjjk..",
  "..kJjjjjJk...",
  "...kttttk....",
  "...ktTttk....",
  "...kttttk....",
  "...kooook....",
  "....kOOk.....",
];

const walkSide1 = [
  "....kkkkkk....",
  "...khHHHHHk...",
  "..knhhhhhhnk..",
  "..khhhssshhk..",
  ".khhhssssshk.",
  ".khhsswesk..",
  ".khhssssssk..",
  "..khssSssk...",
  "...ksssssk...",
  "...kcjjjjk...",
  "..kjlllljk...",
  ".kjjjjjjjjk..",
  "ksjjjJjjJjk..",
  "k.kjjjjjjk...",
  ".kjjjjjjjk...",
  "..kJjjjJk....",
  "...ktt.ttk...",
  "..koook.ttk..",
  "...kO..kook..",
  "........Ok...",
];

const walkSide2 = [
  "....kkkkkk....",
  "...khHHHHHk...",
  "..knhhhhhhnk..",
  "..khhhssshhk..",
  ".khhhssssshk.",
  ".khhsswesk..",
  ".khhssssssk..",
  "..khssSssk...",
  "...ksssssk...",
  "...kcjjjjk...",
  "..kjlllljk...",
  ".kjjjjjjjjk..",
  ".kjjjJjjJjk.k",
  "..kjjjjjjk.sk",
  "..kjjjjjjk...",
  "...kJjjJk....",
  "...ktt.ttk...",
  "..ktt.koook..",
  "..kook..kO...",
  "...Ok........",
];

const idleUp = [
  "....kkkkkk....",
  "...khHHHHHk...",
  "..knhhhhhhnk..",
  ".knhhhhhhhhnk.",
  ".knhhhhhhhhhnk",
  ".knhhhhhhhhhnk",
  ".knhhhhhhhhhnk",
  "..knhhhhhhnk..",
  "...knhhhnk....",
  "...kcjjjjck...",
  "..kjlllllljk..",
  ".kjjjjjjjjjjk.",
  ".kjjjJjjJjJjk.",
  ".ksjjjjjjjjsk.",
  ".kjjjjjjjjjjk.",
  "..kJjjjjjjJk..",
  "...kttttttk...",
  "...ktTttTtk...",
  "...kttttttk...",
  "...koookook...",
  "....kOkkOk....",
];

const walkUp1 = [
  "....kkkkkk....",
  "...khHHHHHk...",
  "..knhhhhhhnk..",
  ".knhhhhhhhhnk.",
  ".knhhhhhhhhhnk",
  ".knhhhhhhhhhnk",
  ".knhhhhhhhhhnk",
  "..knhhhhhhnk..",
  "...knhhhnk....",
  "...kcjjjjck...",
  "..kjlllllljk..",
  ".kjjjjjjjjjjk.",
  "ksjjjJjjJjJjk.",
  "k.kjjjjjjjjk.k",
  ".kjjjjjjjjjk..",
  "..kJjjjjjJk...",
  "...ktt..ttk...",
  "...ktT..Ttk...",
  "..koook.kook..",
  "...kO....Ok...",
];

const walkUp2 = [
  "....kkkkkk....",
  "...khHHHHHk...",
  "..knhhhhhhnk..",
  ".knhhhhhhhhnk.",
  ".knhhhhhhhhhnk",
  ".knhhhhhhhhhnk",
  ".knhhhhhhhhhnk",
  "..knhhhhhhnk..",
  "...knhhhnk....",
  "...kcjjjjck...",
  "..kjlllllljk..",
  ".kjjjjjjjjjjk.",
  ".kjjjJjjJjJjsk",
  "k.kjjjjjjjjk.k",
  "..kjjjjjjjjk..",
  "...kJjjjjJk...",
  "...ktt..ttk...",
  "...ktT..Ttk...",
  "..kook.koook..",
  "...kO....Ok...",
];

const ART: Record<NpcFrame, string[]> = {
  "idle-down": idleDown,
  "walk-down-1": walkDown1,
  "walk-down-2": walkDown2,
  "idle-side": idleSide,
  "walk-side-1": walkSide1,
  "walk-side-2": walkSide2,
  "idle-up": idleUp,
  "walk-up-1": walkUp1,
  "walk-up-2": walkUp2,
};

function blit(
  g: Phaser.GameObjects.Graphics,
  ox: number,
  oy: number,
  rows: string[],
  pal: Record<string, number>,
): void {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = pal[row[x]];
      if (color === undefined) continue;
      g.fillStyle(color, 1);
      g.fillRect(ox + x, oy + y, 1, 1);
    }
  });
}

export function npcSheet(look: NpcLook): string {
  return `npc-${look}`;
}

export function npcAnim(look: NpcLook, kind: "idle-down" | "idle-side" | "idle-up" | "walk-down" | "walk-side" | "walk-up"): string {
  return `npc-${look}-${kind}`;
}

function drawLook(scene: Phaser.Scene, look: NpcLook): void {
  const key = npcSheet(look);
  if (scene.textures.exists(key)) return;
  const pal = PALS[look];
  const g = scene.add.graphics().setVisible(false);
  FRAMES.forEach((name, i) => {
    blit(g, i * NPC_FW + 8, 6, ART[name], pal);
  });
  g.generateTexture(key, FRAMES.length * NPC_FW, NPC_FH);
  g.destroy();
  const tex = scene.textures.get(key);
  FRAMES.forEach((name, i) => {
    tex.add(name, 0, i * NPC_FW, 0, NPC_FW, NPC_FH);
  });
  const mk = (kind: Parameters<typeof npcAnim>[1], frames: NpcFrame[], rate: number): void => {
    const anim = npcAnim(look, kind);
    if (scene.anims.exists(anim)) return;
    scene.anims.create({
      key: anim,
      frames: frames.map((frame) => ({ key, frame })),
      frameRate: rate,
      repeat: -1,
    });
  };
  mk("idle-down", ["idle-down"], 1);
  mk("idle-side", ["idle-side"], 1);
  mk("idle-up", ["idle-up"], 1);
  mk("walk-down", ["walk-down-1", "idle-down", "walk-down-2", "idle-down"], 8);
  mk("walk-side", ["walk-side-1", "idle-side", "walk-side-2", "idle-side"], 8);
  mk("walk-up", ["walk-up-1", "idle-up", "walk-up-2", "idle-up"], 8);
}

export function ensureNpcSheets(scene: Phaser.Scene): void {
  (Object.keys(PALS) as NpcLook[]).forEach((look) => drawLook(scene, look));
}

export function playNpc(sprite: Phaser.GameObjects.Sprite, look: NpcLook, facing: Facing, moving: boolean): void {
  const kind = moving
    ? facing === "up"
      ? "walk-up"
      : facing === "side"
        ? "walk-side"
        : "walk-down"
    : facing === "up"
      ? "idle-up"
      : facing === "side"
        ? "idle-side"
        : "idle-down";
  const key = npcAnim(look, kind);
  if (sprite.anims.currentAnim?.key !== key) sprite.play(key, true);
}
