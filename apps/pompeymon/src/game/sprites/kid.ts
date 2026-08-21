import Phaser from "phaser";

export const KID_FW = 32;
export const KID_FH = 32;

export type OutfitId = "pj" | "jumper" | "trackies" | "kit";

export const OUTFITS: OutfitId[] = ["pj", "jumper", "trackies", "kit"];

/** GBA overworld palettes. */
const BASE: Record<string, number> = {
  k: 0x1a1410,
  h: 0x4a3018,
  H: 0x6e4a28,
  n: 0x2a1c10,
  s: 0xf0c8a0,
  S: 0xd4a078,
  w: 0xfff8f0,
  e: 0x201810,
  p: 0xf8f8f4,
  P: 0xd0d0c8,
  i: 0xf09098,
};

const PALS: Record<OutfitId, Record<string, number>> = {
  jumper: {
    ...BASE,
    j: 0x3a78c8,
    J: 0x245890,
    l: 0x68a0e0,
    c: 0x2a4a78,
    t: 0x2c3048,
    T: 0x1c2034,
    o: 0xd45c28,
    O: 0x8a3018,
  },
  pj: {
    ...BASE,
    j: 0xf0c8a0,
    J: 0xd4a078,
    l: 0xf0c8a0,
    c: 0xd4a078,
    t: 0xf8f8f4,
    T: 0xd0d0c8,
    o: 0xf0c8a0,
    O: 0xd4a078,
  },
  trackies: {
    ...BASE,
    j: 0x3a3a48,
    J: 0x242430,
    l: 0x5a5a68,
    c: 0x2a2a38,
    t: 0x6a6a74,
    T: 0x4a4a54,
    o: 0xd45c28,
    O: 0x8a3018,
  },
  /** Pompey kit — baby blue tee, white shorts. */
  kit: {
    ...BASE,
    j: 0x7ec8e8,
    J: 0x58a8c8,
    l: 0xa0d8f0,
    c: 0x4890b0,
    t: 0xf8f8f4,
    T: 0xd0d0c8,
    o: 0xd45c28,
    O: 0x8a3018,
  },
};

export function kidSheet(outfit: OutfitId): string {
  return `kid-${outfit}`;
}

const FRAMES = [
  "sleep",
  "sit",
  "stretch-1",
  "stretch-2",
  "idle-down",
  "walk-down-1",
  "walk-down-2",
  "idle-side",
  "walk-side-1",
  "walk-side-2",
  "idle-up",
  "walk-up-1",
  "walk-up-2",
  "reach-side",
  "reach-down",
] as const;

export type KidFrame = (typeof FRAMES)[number];

function yFrontsFacing(name: KidFrame): "front" | "side" | "back" {
  if (name.includes("up")) return "back";
  if (name.includes("side")) return "side";
  return "front";
}

function stampNipples(rows: string[], original: string[], facing: "front" | "side" | "back"): string[] {
  if (facing === "back") return rows;
  let pec = -1;
  let pecCount = 0;
  original.forEach((row, y) => {
    const n = (row.match(/l/g) ?? []).length;
    if (n > pecCount) {
      pecCount = n;
      pec = y;
    }
  });
  if (pec < 0 || pecCount < 2) return rows;
  let y = pec + 1;
  if (pec + 2 < rows.length && /s/.test(rows[pec + 2] ?? "")) y = pec + 2;
  const chars = [...rows[y]];
  const skin: number[] = [];
  chars.forEach((ch, x) => {
    if (ch === "s" || ch === "S") skin.push(x);
  });
  if (skin.length < 4) return rows;
  if (facing === "front") {
    chars[skin[Math.floor(skin.length * 0.38)]] = "i";
    chars[skin[Math.floor(skin.length * 0.62)]] = "i";
  } else {
    chars[skin[Math.floor(skin.length * 0.35)]] = "i";
  }
  const next = [...rows];
  next[y] = chars.join("");
  return next;
}

function toYFronts(rows: string[], facing: "front" | "side" | "back"): string[] {
  const stripped = rows.map((row) => row.replace(/[jJl]/g, "s").replace(/c/g, "S"));
  const hips: number[] = [];
  stripped.forEach((row, y) => {
    if (/[tT]/.test(row)) hips.push(y);
  });
  const pants = stripped.map((row, y) => {
    const i = hips.indexOf(y);
    if (i === 0) return row.replace(/t/g, "p").replace(/T/g, "P");
    if (i === 1) {
      const chars = [...row.replace(/t/g, "p").replace(/T/g, "P")];
      const white: number[] = [];
      chars.forEach((ch, x) => {
        if (ch === "p" || ch === "P") white.push(x);
      });
      if (white.length >= 3) {
        const mid = white[Math.floor((white.length - 1) / 2)];
        chars[mid] = "s";
      }
      return chars.join("");
    }
    return row.replace(/[tToO]/g, "s");
  });
  return stampNipples(pants, rows, facing);
}

const sleepYFronts = [
  "............................",
  "...kkkkkkk.................",
  "..khHHHHHhk................",
  ".knhhhhhhhnkkkkkkkkkkk.....",
  ".khhssssssssssssssssssk...",
  "khsswesessssssssppppssk...",
  "khsssssississssspP.pssk...",
  ".kssSsssssksssssssssssk...",
  "..kssssssk.ksssssssssk....",
  "...kkkkkk...kkkkkkkkkk.....",
];

function blit(
  g: Phaser.GameObjects.Graphics,
  ox: number,
  oy: number,
  rows: string[],
  pal: Record<string, number>,
): void {
  const width = Math.max(...rows.map((row) => row.length));
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    const pad = Math.floor((width - row.length) / 2);
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === "." || ch === " ") continue;
      const color = pal[ch];
      if (color === undefined) continue;
      g.fillStyle(color, 1);
      g.fillRect(ox + pad + x, oy + y, 1, 1);
    }
  }
}

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

const sleep = [
  "............................",
  "...kkkkkkk.................",
  "..khHHHHHhk................",
  ".knhhhhhhhnkkkkkkkkkkk.....",
  ".khhsssssssjlllllllllljk...",
  "khsswesesssjjjjjjjjjjjjk...",
  "khsssssssssjjjJJJJjjjjjk...",
  ".kssSssssskjjjjjjjjjjjsk...",
  "..kssssssk.kjjjjjjjjjJk....",
  "...kkkkkk...kkkkkkkkkk.....",
];

const sit = [
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
  ".ksjjJjjJjsk.",
  ".kjjjjjjjjjk..",
  "..ktttttttk...",
  "..ktTtttTtk...",
  ".kooookoook...",
  "..kOkk.kOk....",
];

const stretch1 = [
  "....kkkkkk....",
  "...khHHHHHk...",
  "..knhhhhhhnk..",
  "..khhsssshhk..",
  ".khsssssssshk.",
  ".ksswesewsssk.",
  ".kssssssssssk.",
  "..ksSssssSsk..",
  "...kssssssk...",
  "kk.kcjjjjck.kk",
  "sskjlllllljks.",
  ".kjjjjjjjjjjk.",
  ".kjjjJjjJjJjk.",
  ".kjjjjjjjjjjk.",
  "..kJjjjjjjJk..",
  "...kttttttk...",
  "...ktTttTtk...",
  "...kooookook..",
  "....kOkkOk....",
];

const stretch2 = [
  ".s..........s.",
  "ksk.kkkkkk.ksk",
  ".k.khHHHHHk.k.",
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
  ".kjjjjjjjjjjk.",
  "..kJjjjjjjJk..",
  "...kttttttk...",
  "...ktTttTtk...",
  "...kooookook..",
  "....kOkkOk....",
];

const reachSide = [
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
  ".kjjjjjjjssk.",
  ".kjjjjjjk.ssk",
  "..kJjjjJk..sk",
  "...kttttk...k",
  "...ktTttk....",
  "...kooook....",
  "....kOOk.....",
];

const reachDown = [
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
  ".ksjjjjjjjjssk",
  ".kjjjjjjjk.ssk",
  "..kJjjjjJk..sk",
  "...ktttttk...k",
  "...ktTttTk....",
  "...koookook...",
  "....kOkkOk....",
];

const ART: Record<KidFrame, string[]> = {
  sleep,
  sit,
  "stretch-1": stretch1,
  "stretch-2": stretch2,
  "idle-down": idleDown,
  "walk-down-1": walkDown1,
  "walk-down-2": walkDown2,
  "idle-side": idleSide,
  "walk-side-1": walkSide1,
  "walk-side-2": walkSide2,
  "idle-up": idleUp,
  "walk-up-1": walkUp1,
  "walk-up-2": walkUp2,
  "reach-side": reachSide,
  "reach-down": reachDown,
};

const ANIM_SUFFIXES = [
  "sleep",
  "sit",
  "stretch",
  "idle-down",
  "idle-side",
  "idle-up",
  "walk-down",
  "walk-side",
  "walk-up",
  "reach-side",
  "reach-down",
] as const;

export function kidAnim(outfit: OutfitId, kind: (typeof ANIM_SUFFIXES)[number]): string {
  return `${outfit}-${kind}`;
}

function drawSheet(scene: Phaser.Scene, outfit: OutfitId): void {
  const key = kidSheet(outfit);
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const pal = PALS[outfit];
  const g = scene.add.graphics().setVisible(false);
  FRAMES.forEach((name, i) => {
    const rows =
      outfit === "pj"
        ? name === "sleep"
          ? sleepYFronts
          : toYFronts(ART[name], yFrontsFacing(name))
        : ART[name];
    const xOff = name === "sleep" ? 2 : 8;
    const yOff = name === "sleep" ? 10 : name.startsWith("stretch") ? 4 : 6;
    blit(g, i * KID_FW + xOff, yOff, rows, pal);
  });
  g.generateTexture(key, FRAMES.length * KID_FW, KID_FH);
  g.destroy();
  const tex = scene.textures.get(key);
  FRAMES.forEach((name, i) => {
    tex.add(name, 0, i * KID_FW, 0, KID_FW, KID_FH);
  });
}

function drawAnims(scene: Phaser.Scene, outfit: OutfitId): void {
  for (const suffix of ANIM_SUFFIXES) {
    const key = kidAnim(outfit, suffix);
    if (scene.anims.exists(key)) scene.anims.remove(key);
  }
  const sheet = kidSheet(outfit);
  const mk = (
    suffix: (typeof ANIM_SUFFIXES)[number],
    frames: KidFrame[],
    frameRate: number,
    repeat: number,
  ): void => {
    scene.anims.create({
      key: kidAnim(outfit, suffix),
      frames: frames.map((frame) => ({ key: sheet, frame })),
      frameRate,
      repeat,
    });
  };
  mk("sleep", ["sleep"], 1, -1);
  mk("sit", ["sit"], 1, 0);
  mk("stretch", ["stretch-1", "stretch-2", "stretch-2", "stretch-1"], 4, 0);
  mk("idle-down", ["idle-down"], 1, -1);
  mk("idle-side", ["idle-side"], 1, -1);
  mk("idle-up", ["idle-up"], 1, -1);
  mk("walk-down", ["walk-down-1", "idle-down", "walk-down-2", "idle-down"], 8, -1);
  mk("walk-side", ["walk-side-1", "idle-side", "walk-side-2", "idle-side"], 8, -1);
  mk("walk-up", ["walk-up-1", "idle-up", "walk-up-2", "idle-up"], 8, -1);
  mk("reach-side", ["reach-side"], 1, 0);
  mk("reach-down", ["reach-down"], 1, 0);
}

export function createKidSheets(scene: Phaser.Scene): void {
  for (const outfit of OUTFITS) {
    drawSheet(scene, outfit);
    drawAnims(scene, outfit);
  }
}

export function ensureKidSheets(scene: Phaser.Scene): void {
  if (OUTFITS.every((outfit) => scene.textures.exists(kidSheet(outfit)))) return;
  createKidSheets(scene);
}
