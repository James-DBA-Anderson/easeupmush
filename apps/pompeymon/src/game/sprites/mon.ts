import Phaser from "phaser";
import type { SpeciesId } from "../species";

export const MON_BATTLE = 32;
export const MON_OW = 16;

export const MON_IDS: SpeciesId[] = [
  "scabfox",
  "chipgull",
  "moggit",
  "donerrat",
  "pidgeon",
  "squirral",
  "spikehedge",
  "starlimur",
  "busstopper",
  "kerbite",
  "honkace",
  "chalklur",
  "linelurker",
  "kitthief",
];

type Pal = Record<string, number>;

const OW_FRAMES = ["idle-down", "walk-down", "idle-side", "walk-side", "idle-up", "walk-up"] as const;
type OwFrame = (typeof OW_FRAMES)[number];

type MonArt = {
  pal: Pal;
  battle: string[];
  ow: Record<OwFrame, string[]>;
  /** Battle-res side-view wing flap (title / sky). */
  fly?: { up: string[]; down: string[] };
};

function padRow(row: string, w: number): string {
  if (row.length >= w) return row.slice(0, w);
  const left = Math.floor((w - row.length) / 2);
  return ".".repeat(left) + row + ".".repeat(w - row.length - left);
}

function blit(g: Phaser.GameObjects.Graphics, ox: number, oy: number, rows: string[], pal: Pal): void {
  const w = Math.max(...rows.map((row) => row.length), 1);
  rows.forEach((raw, y) => {
    const row = padRow(raw, w);
    for (let x = 0; x < row.length; x++) {
      const color = pal[row[x]];
      if (color === undefined) continue;
      g.fillStyle(color, 1);
      g.fillRect(ox + x, oy + y, 1, 1);
    }
  });
}

/** Urban fox — nicked ear, dark socks, cream chest. */
const SCABFOX: MonArt = {
  pal: {
    k: 0x1a1410,
    r: 0xd47838,
    R: 0xa85828,
    d: 0x3a2418,
    c: 0xf0d8b0,
    w: 0xfff8f0,
    e: 0x201810,
    n: 0x2a1c10,
    o: 0xc86828,
  },
  battle: [
    "......kkkk..kkkk......",
    ".....krRRk..kRrrk.....",
    "....krrrrkkkkrrrrk....",
    "...krrrrrrrrrrrrrrk...",
    "...krrwweeeewwrrrk....",
    "...krrrrrrrrrrrrrk....",
    "....krcrrrrrrcrrk.....",
    "....kkcrrrrrrcckk.....",
    "...krrrrkkkkrrrrk.....",
    "..krrRrrrrrrrrRrrk....",
    "..krrrrrrrrrrrrrrk....",
    "...kRrrrrrrrrrrRk.....",
    "....kddddddddddk......",
    "....kdkkkkkkkkdk......",
    "...kodk......kodk.....",
    "...kdk........kdk.....",
    "...kk..........kk.....",
  ],
  ow: {
    "idle-down": [
      "..kkkkkk..",
      ".krRrrRrk.",
      ".kreeerrk.",
      "kkcrrrcckk",
      "krrrrrrrrk",
      ".kddddddk.",
      ".kodk.dok.",
      "..kk...kk.",
    ],
    "walk-down": [
      "..kkkkkk..",
      ".krRrrRrk.",
      ".kreeerrk.",
      "kkcrrrcckk",
      "krrrrrrrrk",
      ".kddddddk.",
      "kodk...dok",
      "kk......kk",
    ],
    "idle-side": [
      "....kkkk..",
      "...krrRrk.",
      "..kreeerk.",
      ".kkrrrrck.",
      "krrrrRrrk.",
      ".kddddkk..",
      "..kodk.k..",
      "...kk.....",
    ],
    "walk-side": [
      "....kkkk..",
      "...krrRrk.",
      "..kreeerk.",
      ".kkrrrrck.",
      "krrrrRrrk.",
      ".kddddkk..",
      ".kodk..k..",
      ".kk.......",
    ],
    "idle-up": [
      "..kkkkkk..",
      ".krrrrrrk.",
      ".krrrrrrk.",
      "kkrrrrrrkk",
      "krrrrrrrrk",
      ".kddddddk.",
      ".kodk.dok.",
      "..kk...kk.",
    ],
    "walk-up": [
      "..kkkkkk..",
      ".krrrrrrk.",
      ".krrrrrrk.",
      "kkrrrrrrkk",
      "krrrrrrrrk",
      ".kddddddk.",
      "kodk...dok",
      "kk......kk",
    ],
  },
};

/** Herring gull — white, grey mantle, yellow bill, mean brow. */
const CHIPGULL: MonArt = {
  pal: {
    k: 0x1a1410,
    w: 0xf4f0e8,
    W: 0xd0ccc4,
    g: 0x8a9098,
    G: 0x6a7078,
    y: 0xf0c030,
    Y: 0xc89018,
    e: 0x201810,
    o: 0xd45c28,
    r: 0xc84838,
  },
  battle: [
    "........kkkkkk........",
    ".......kwWWWWwk.......",
    "......kwwwwwwwWk......",
    ".....kwwyeeeYywwk.....",
    ".....kwwwwwwwwwwk.....",
    "....kkwwgGGGGwwkk.....",
    "...kwWWgGGGGGgWWwk....",
    "..kwwWWGGGGGGWWwwk....",
    "..kwwwWWWWWWWWwwwk....",
    "...kwwwwwwwwwwwwk.....",
    "....kwwkkkkkkwwk......",
    "....koook..kook.......",
    ".....kYk....kYk.......",
    ".....kk......kk.......",
  ],
  ow: {
    "idle-down": [
      "...kkkk...",
      "..kwwwwk..",
      ".kweeewwk.",
      "kwwgGGwwwk",
      "kwwWWWwwwk",
      ".kwwwwwwk.",
      ".kookook..",
      "..kYk.Yk..",
    ],
    "walk-down": [
      "...kkkk...",
      "..kwwwwk..",
      ".kweeewwk.",
      "kwwgGGwwwk",
      "kwwWWWwwwk",
      ".kwwwwwwk.",
      "kook...ook",
      "kYk.....Yk",
    ],
    "idle-side": [
      "....kkkk..",
      "...kwwwWk.",
      "..kwyeewk.",
      ".kwwgGWwk.",
      "kwwwWWWwk.",
      ".kwwwwwk..",
      "..kook.k..",
      "...kYk....",
    ],
    "walk-side": [
      "....kkkk..",
      "...kwwwWk.",
      "..kwyeewk.",
      ".kwwgGWwk.",
      "kwwwWWWwk.",
      ".kwwwwwk..",
      ".kook..k..",
      ".kYk......",
    ],
    "idle-up": [
      "...kkkk...",
      "..kWWWwk..",
      ".kWWWWWWk.",
      "kWWGGGGWWk",
      "kWWWWWWWWk",
      ".kwwwwwwk.",
      ".kookook..",
      "..kYk.Yk..",
    ],
    "walk-up": [
      "...kkkk...",
      "..kWWWwk..",
      ".kWWWWWWk.",
      "kWWGGGGWWk",
      "kWWWWWWWWk",
      ".kwwwwwwk.",
      "kook...ook",
      "kYk.....Yk",
    ],
  },
  fly: {
    // Same face as battle art; tapered wings so flap reads cleanly
    up: [
      "..kk..................kk..",
      ".kwwk................kwwk.",
      "kwwwk....kkkkkk......kwwwk",
      "kwwwwk..kwWWWWwk....kwwwwk",
      ".kwwwwkwwwwwwwWwk..kwwwwk.",
      "..kwwwwwyeeeYywwwwwwwwk...",
      "...kwwwwwwwwwwwwwwwwk.....",
      "....kkwwgGGGGwwkk.........",
      "...kwWWgGGGGGgWWwk........",
      "..kwwWWGGGGGGWWwwk........",
      "..kwwwWWWWWWWWwwwk........",
      "...kwwwwwwwwwwwwk.........",
      "....kwwkkkkkkwwk..........",
      "....koook..kook...........",
      ".....kYk....kYk...........",
      ".....kk......kk...........",
    ],
    down: [
      "..........kkkkkk..........",
      ".........kwWWWWwk.........",
      "........kwwwwwwwWk........",
      ".......kwwyeeeYywwk.......",
      ".......kwwwwwwwwwwk.......",
      "..kkk.kkwwgGGGGwwkk.kkk...",
      ".kwwwwwwwgGGGGGwwwwwwwk...",
      "kWWWWWWWGGGGGGGWWWWWWWk...",
      ".kwwwwWWWWWWWWWWWwwwwk....",
      "..kwwwWWWWWWWWWWwwk.......",
      "...kwwwwwwwwwwwwk.........",
      "....kwwkkkkkkwwk..........",
      "....koook..kook...........",
      ".....kYk....kYk...........",
      ".....kk......kk...........",
    ],
  },
};

/** Alley cat — grey tabby, yellow eyes, torn ear. */
const MOGGIT: MonArt = {
  pal: {
    k: 0x1a1410,
    g: 0x8a8a90,
    G: 0x5a5a64,
    l: 0xc0c0c8,
    y: 0xf0c030,
    e: 0x201810,
    p: 0xf0b0a0,
    w: 0xfff8f0,
    o: 0x4a4a54,
  },
  battle: [
    ".....kk........kk.....",
    "....kgk........kGk....",
    "...kggkkkkkkkkggk.....",
    "...kglwyeeywlggk.....",
    "...kggggggggggggk.....",
    "....kglgggggglgk......",
    "...kkggggggggggkk.....",
    "..kggGgggggggGggk.....",
    "..kgggggggggggggk.....",
    "...kGgggggggggGk......",
    "....kggkkkkgggk.......",
    "...kogk....kogk.......",
    "...kgk......kgk.......",
    "...kk........kk.......",
  ],
  ow: {
    "idle-down": [
      ".kk....kk.",
      "kgk....kGk",
      "kglweewlgk",
      "kggggggggk",
      "kkggggggkk",
      ".kGggggGk.",
      ".kogk.gok.",
      "..kk...kk.",
    ],
    "walk-down": [
      ".kk....kk.",
      "kgk....kGk",
      "kglweewlgk",
      "kggggggggk",
      "kkggggggkk",
      ".kGggggGk.",
      "kogk...gok",
      "kk......kk",
    ],
    "idle-side": [
      "..kk...kk.",
      ".kggk.kGk.",
      "kglyeewgk.",
      "kgggggggk.",
      "kggGggggk.",
      ".kggggkk..",
      "..kogk.k..",
      "...kk.....",
    ],
    "walk-side": [
      "..kk...kk.",
      ".kggk.kGk.",
      "kglyeewgk.",
      "kgggggggk.",
      "kggGggggk.",
      ".kggggkk..",
      ".kogk..k..",
      ".kk.......",
    ],
    "idle-up": [
      ".kk....kk.",
      "kGk....kgk",
      "kggggggggk",
      "kggggggggk",
      "kkggggggkk",
      ".kGggggGk.",
      ".kogk.gok.",
      "..kk...kk.",
    ],
    "walk-up": [
      ".kk....kk.",
      "kGk....kgk",
      "kggggggggk",
      "kggggggggk",
      "kkggggggkk",
      ".kGggggGk.",
      "kogk...gok",
      "kk......kk",
    ],
  },
};

/** Kebab-shop rat — greasy brown, pink bits, chilli stain. */
const DONERRAT: MonArt = {
  pal: {
    k: 0x1a1410,
    b: 0x7a5030,
    B: 0x5a3420,
    p: 0xe8a090,
    w: 0xfff8f0,
    e: 0x201810,
    r: 0xc84830,
    o: 0x3a2418,
    t: 0xc89068,
  },
  battle: [
    "................kk....",
    "......kkkkkk...kpk....",
    ".....kbBBBBbk.kBk.....",
    "....kbpweeewpbk.......",
    "....kbbbbbbbbbk.......",
    ".....kbtttttbbk.......",
    "....kkbbbrrbbkk.......",
    "...kbbbbbbbbbbbk......",
    "...kbBbbbbbbbBbk......",
    "....kkbbbbbbbkk.......",
    ".....kobk.kbok........",
    ".....kbk...kbk........",
    ".....kk.....kk........",
  ],
  ow: {
    "idle-down": [
      ".......kp.",
      "..kkkk.kB.",
      ".kbweewbk.",
      ".kbbbbbbk.",
      "kkbbrrbbkk",
      "kbbbbbbbbk",
      ".kobk.bok.",
      "..kk...kk.",
    ],
    "walk-down": [
      ".......kp.",
      "..kkkk.kB.",
      ".kbweewbk.",
      ".kbbbbbbk.",
      "kkbbrrbbkk",
      "kbbbbbbbbk",
      "kobk...bok",
      "kk......kk",
    ],
    "idle-side": [
      "........kp",
      "...kkkk.kB",
      "..kbweebk.",
      ".kkbbbbbk.",
      "kbbbbrrbk.",
      ".kbbbbkk..",
      "..kobk.k..",
      "...kk.....",
    ],
    "walk-side": [
      "........kp",
      "...kkkk.kB",
      "..kbweebk.",
      ".kkbbbbbk.",
      "kbbbbrrbk.",
      ".kbbbbkk..",
      ".kobk..k..",
      ".kk.......",
    ],
    "idle-up": [
      ".......kp.",
      "..kkkk.kB.",
      ".kbbbbbbk.",
      ".kbbbbbbk.",
      "kkbbbbbbkk",
      "kbbbbbbbbk",
      ".kobk.bok.",
      "..kk...kk.",
    ],
    "walk-up": [
      ".......kp.",
      "..kkkk.kB.",
      ".kbbbbbbk.",
      ".kbbbbbbk.",
      "kkbbbbbbkk",
      "kbbbbbbbbk",
      "kobk...bok",
      "kk......kk",
    ],
  },
};

/** Fat town pigeon — grey, green neck, orange feet. */
const PIDGEON: MonArt = {
  pal: {
    k: 0x1a1410,
    g: 0x8a8a92,
    G: 0x5a5a64,
    n: 0x3a7858,
    p: 0x6a4a78,
    w: 0xfff8f0,
    e: 0x201810,
    o: 0xd45c28,
    O: 0xa83818,
  },
  battle: [
    "........kkkkkk........",
    ".......kgGGGGgk.......",
    "......kggwwwwggk......",
    ".....kggweeeewggk.....",
    "....kgnnnnnnnpggk.....",
    "...kkggggggggggkk.....",
    "..kggGGGGGGGGGGggk....",
    "..kggggggggggggggk....",
    "...kGggggggggggGk.....",
    "....kggkkkkkkggk......",
    "....koook..kook.......",
    ".....kOk....kOk.......",
    ".....kk......kk.......",
  ],
  ow: {
    "idle-down": [
      "...kkkk...",
      "..kggggk..",
      ".kgweewgk.",
      "kgnnnpgggk",
      "kggGGGgggk",
      ".kggggggk.",
      ".kookook..",
      "..kOk.Ok..",
    ],
    "walk-down": [
      "...kkkk...",
      "..kggggk..",
      ".kgweewgk.",
      "kgnnnpgggk",
      "kggGGGgggk",
      ".kggggggk.",
      "kook...ook",
      "kOk.....Ok",
    ],
    "idle-side": [
      "....kkkk..",
      "...kgggGk.",
      "..kgweegk.",
      ".kgnnpGgk.",
      "kgggGGGgk.",
      ".kgggggk..",
      "..kook.k..",
      "...kOk....",
    ],
    "walk-side": [
      "....kkkk..",
      "...kgggGk.",
      "..kgweegk.",
      ".kgnnpGgk.",
      "kgggGGGgk.",
      ".kgggggk..",
      ".kook..k..",
      ".kOk......",
    ],
    "idle-up": [
      "...kkkk...",
      "..kGGGgk..",
      ".kGGGGGGk.",
      "kGGGGGGGGk",
      "kGGGGGGGGk",
      ".kggggggk.",
      ".kookook..",
      "..kOk.Ok..",
    ],
    "walk-up": [
      "...kkkk...",
      "..kGGGgk..",
      ".kGGGGGGk.",
      "kGGGGGGGGk",
      "kGGGGGGGGk",
      ".kggggggk.",
      "kook...ook",
      "kOk.....Ok",
    ],
  },
  fly: {
    up: [
      "..kk..................kk..",
      ".kggk................kggk.",
      "kgggk....kkkkkk......kgggk",
      "kggggk..kgGGGGgk....kggggk",
      ".kggggkggwwwwggk..kggggk..",
      "..kgggggweeeewgggggggk....",
      "...kgggnnnnnnnpggggk......",
      "....kkggggggggggkk........",
      "...kggGGGGGGGGGGggk.......",
      "..kgggGGGGGGGGGGggk.......",
      "..kgggggggggggggggk.......",
      "...kGggggggggggGk.........",
      "....kggkkkkkkggk..........",
      "....koook..kook...........",
      ".....kOk....kOk...........",
      ".....kk......kk...........",
    ],
    down: [
      "..........kkkkkk..........",
      ".........kgGGGGgk.........",
      "........kggwwwwggk........",
      ".......kggweeeewggk.......",
      "......kgnnnnnnnpggk.......",
      "..kkk.kggggggggggkk.kkk...",
      ".kgggggggGGGGGGGggggggk...",
      "kGGGGGGGGGGGGGGGGGGGGGk...",
      ".kggggGGGGGGGGGGGGgggk....",
      "..kgggGGGGGGGGGGGggk......",
      "...kgggggggggggggk........",
      "....kggkkkkkkggk..........",
      "....koook..kook...........",
      ".....kOk....kOk...........",
      ".....kk......kk...........",
    ],
  },
};

/** Grey squirrel — huge tail, park menace. */
const SQUIRRAL: MonArt = {
  pal: {
    k: 0x1a1410,
    b: 0x9a6a48,
    B: 0x6a4830,
    t: 0xc49060,
    w: 0xfff8f0,
    e: 0x201810,
    o: 0x4a3020,
  },
  battle: [
    "..............kkkk....",
    ".............kBBBk....",
    "......kkkk...kbBbk....",
    ".....kbtttbkkbbbk.....",
    ".....kbweeewbbbk......",
    ".....kbbbbbbbbk.......",
    "....kkbtttttbkk.......",
    "....kbbbbbbbbbk.......",
    "...kbbkbbbbkbbk.......",
    "....kkbbbbbbkk........",
    ".....kobk.kbok........",
    ".....kbk...kbk........",
    ".....kk.....kk........",
  ],
  ow: {
    "idle-down": [
      "......kkkk",
      "..kkkk.kBb",
      ".kbweewbk.",
      ".kbbbbbbk.",
      "kkbttttbkk",
      "kbbbbbbbbk",
      ".kobk.bok.",
      "..kk...kk.",
    ],
    "walk-down": [
      "......kkkk",
      "..kkkk.kBb",
      ".kbweewbk.",
      ".kbbbbbbk.",
      "kkbttttbkk",
      "kbbbbbbbbk",
      "kobk...bok",
      "kk......kk",
    ],
    "idle-side": [
      ".......kkk",
      "...kkkk.kB",
      "..kbweebk.",
      ".kkbbbbbk.",
      "kbbbtttbk.",
      ".kbbbbkk..",
      "..kobk.k..",
      "...kk.....",
    ],
    "walk-side": [
      ".......kkk",
      "...kkkk.kB",
      "..kbweebk.",
      ".kkbbbbbk.",
      "kbbbtttbk.",
      ".kbbbbkk..",
      ".kobk..k..",
      ".kk.......",
    ],
    "idle-up": [
      "......kkkk",
      "..kkkk.kBb",
      ".kbbbbbbk.",
      ".kbbbbbbk.",
      "kkbbbbbbkk",
      "kbbbbbbbbk",
      ".kobk.bok.",
      "..kk...kk.",
    ],
    "walk-up": [
      "......kkkk",
      "..kkkk.kBb",
      ".kbbbbbbk.",
      ".kbbbbbbk.",
      "kkbbbbbbkk",
      "kbbbbbbbbk",
      "kobk...bok",
      "kk......kk",
    ],
  },
};

/** Hedgehog — spike ball, cream face. */
const SPIKEHEDGE: MonArt = {
  pal: {
    k: 0x1a1410,
    s: 0x5a4834,
    S: 0x3a3020,
    t: 0xe0c8a0,
    w: 0xfff8f0,
    e: 0x201810,
    n: 0x2a2018,
    o: 0x6a5434,
  },
  battle: [
    ".....k.k.k.k.k.k......",
    "....kSkSkSkSkSkSk.....",
    "...kSSSSSSSSSSSSk.....",
    "..kSSttttttttttSSk....",
    "..kStweeeewttttSSk....",
    "..kStttttttttttSSk....",
    "...kSSSSSSSSSSSSk.....",
    "....kSSSSSSSSSSk......",
    ".....kSSSSSSSSk.......",
    ".....kotk.ktok........",
    "......kk...kk.........",
  ],
  ow: {
    "idle-down": [
      ".k.k.k.k.k",
      "kSkSkSkSkS",
      "kSSttttSSk",
      "kStweettSk",
      "kSttttttSk",
      "kSSSSSSSSk",
      ".kSSSSSSk.",
      "..kot.tok.",
    ],
    "walk-down": [
      ".k.k.k.k.k",
      "kSkSkSkSkS",
      "kSSttttSSk",
      "kStweettSk",
      "kSttttttSk",
      "kSSSSSSSSk",
      ".kSSSSSSk.",
      ".kot...tok",
    ],
    "idle-side": [
      "..k.k.k.k.",
      ".kSkSkSkSk",
      "kSSttttSSk",
      "kStweetSSk",
      "kStttttSSk",
      ".kSSSSSSk.",
      "..kSSSSk..",
      "...kotk...",
    ],
    "walk-side": [
      "..k.k.k.k.",
      ".kSkSkSkSk",
      "kSSttttSSk",
      "kStweetSSk",
      "kStttttSSk",
      ".kSSSSSSk.",
      "..kSSSSk..",
      "..kotk....",
    ],
    "idle-up": [
      ".k.k.k.k.k",
      "kSkSkSkSkS",
      "kSSSSSSSSk",
      "kSSSSSSSSk",
      "kSSSSSSSSk",
      "kSSSSSSSSk",
      ".kSSSSSSk.",
      "..kot.tok.",
    ],
    "walk-up": [
      ".k.k.k.k.k",
      "kSkSkSkSkS",
      "kSSSSSSSSk",
      "kSSSSSSSSk",
      "kSSSSSSSSk",
      "kSSSSSSSSk",
      ".kSSSSSSk.",
      ".kot...tok",
    ],
  },
};

/** Starling — oil-slick black, white specks, yellow bill. */
const STARLIMUR: MonArt = {
  pal: {
    k: 0x1a1410,
    n: 0x2a2438,
    N: 0x1a1828,
    p: 0x5a4878,
    s: 0xc8c8d0,
    y: 0xf0c030,
    w: 0xfff8f0,
    e: 0x201810,
    o: 0x3a3028,
  },
  battle: [
    "........kkkkkk........",
    ".......knNNNNnk.......",
    "......knnwwwwNnk......",
    ".....knnweeeewNnk.....",
    ".....knppspsppsnk.....",
    "....kknNNNNNNNNkk.....",
    "...knNNsNNsNNNNnk.....",
    "..knnNNNNNNNNNNnk.....",
    "..knnNNNNNNNNNNnk.....",
    "...knNNNNNNNNNnk......",
    "....kyykk.kkyyk.......",
    ".....kook.kook........",
    "......kk...kk.........",
  ],
  ow: {
    "idle-down": [
      "...kkkk...",
      "..knnNnk..",
      ".knweewwnk",
      "knppspsnnk",
      "knnNNNNnnk",
      ".knnNNnnk.",
      ".kyyk.yyk.",
      "..kk...kk.",
    ],
    "walk-down": [
      "...kkkk...",
      "..knnNnk..",
      ".knweewwnk",
      "knppspsnnk",
      "knnNNNNnnk",
      ".knnNNnnk.",
      "kyyk...yyk",
      "kk......kk",
    ],
    "idle-side": [
      "....kkkk..",
      "...knnNnk.",
      "..knweewk.",
      ".knpspsnk.",
      "knnNNNNnk.",
      ".knnNNnk..",
      "..kyyk.k..",
      "...kk.....",
    ],
    "walk-side": [
      "....kkkk..",
      "...knnNnk.",
      "..knweewk.",
      ".knpspsnk.",
      "knnNNNNnk.",
      ".knnNNnk..",
      ".kyyk..k..",
      ".kk.......",
    ],
    "idle-up": [
      "...kkkk...",
      "..kNNNnk..",
      ".kNNNNNNk.",
      "kNNNsNsNNk",
      "kNNNNNNNNk",
      ".knnNNnnk.",
      ".kyyk.yyk.",
      "..kk...kk.",
    ],
    "walk-up": [
      "...kkkk...",
      "..kNNNnk..",
      ".kNNNNNNk.",
      "kNNNsNsNNk",
      "kNNNNNNNNk",
      ".knnNNnnk.",
      "kyyk...yyk",
      "kk......kk",
    ],
  },
};

/** Lurcher at the shelter — tan, droopy, long. */
const BUSSTOPPER: MonArt = {
  pal: {
    k: 0x1a1410,
    b: 0xc49a68,
    B: 0x8a6a40,
    t: 0xe0c090,
    w: 0xfff8f0,
    e: 0x201810,
    n: 0x3a2a18,
    o: 0x5a4030,
  },
  battle: [
    "......kkkkkkkkkk......",
    ".....kbBBBBBBBBbk.....",
    ".....kbweeeeeewbk.....",
    ".....kbbbbbbbbbbk.....",
    "....kkbttttttttbkk....",
    "...kbbbbbbbbbbbbbk....",
    "...kbBbbbbbbbbbBbk....",
    "....kkbbbbbbbbbbkk....",
    ".....kbbbbbbbbbbk.....",
    ".....kobk....kbok.....",
    ".....kbk......kbk.....",
    ".....kk........kk.....",
  ],
  ow: {
    "idle-down": [
      "..kkkkkk..",
      ".kbBBBBbk.",
      ".kbweeewk.",
      "kkbttttbkk",
      "kbbbbbbbbk",
      ".kBbbbbBk.",
      ".kobk.bok.",
      "..kk...kk.",
    ],
    "walk-down": [
      "..kkkkkk..",
      ".kbBBBBbk.",
      ".kbweeewk.",
      "kkbttttbkk",
      "kbbbbbbbbk",
      ".kBbbbbBk.",
      "kobk...bok",
      "kk......kk",
    ],
    "idle-side": [
      "....kkkkkk",
      "...kbBBBbk",
      "..kbweeewk",
      ".kkbbbbbbk",
      "kbbbtttbk.",
      ".kbbbbkk..",
      "..kobk.k..",
      "...kk.....",
    ],
    "walk-side": [
      "....kkkkkk",
      "...kbBBBbk",
      "..kbweeewk",
      ".kkbbbbbbk",
      "kbbbtttbk.",
      ".kbbbbkk..",
      ".kobk..k..",
      ".kk.......",
    ],
    "idle-up": [
      "..kkkkkk..",
      ".kBBBBBBk.",
      ".kbbbbbbk.",
      "kkbbbbbbkk",
      "kbbbbbbbbk",
      ".kBbbbbBk.",
      ".kobk.bok.",
      "..kk...kk.",
    ],
    "walk-up": [
      "..kkkkkk..",
      ".kBBBBBBk.",
      ".kbbbbbbk.",
      "kkbbbbbbkk",
      "kbbbbbbbbk",
      ".kBbbbbBk.",
      "kobk...bok",
      "kk......kk",
    ],
  },
};

/** Drain millipede — low, many legs, not a rat. */
const KERBITE: MonArt = {
  pal: {
    k: 0x1a1410,
    g: 0x5a6c48,
    G: 0x3a4a30,
    y: 0xe0d040,
    e: 0x201810,
    r: 0x6a5040,
    o: 0x3a3028,
  },
  battle: [
    "....kkkkkkkkkkkkkk....",
    "...kggGGggGGggGGggk...",
    "..kgyeeegGggGGggGGgk..",
    "..kggggggggggggggggk..",
    "...kGggGggGggGggGgk...",
    "...krkrkrkrkrkrkrkr...",
    "....kk.kk.kk.kk.kk....",
  ],
  ow: {
    "idle-down": [
      ".kkkkkkkk.",
      "kgyeegGGgk",
      "kggggggggk",
      "kGggGggGgk",
      "krkrkrkrkr",
      ".k.k.k.k..",
      "..........",
      "..........",
    ],
    "walk-down": [
      ".kkkkkkkk.",
      "kgyeegGGgk",
      "kggggggggk",
      "kGggGggGgk",
      ".krkrkrkr.",
      "k.k.k.k.k.",
      "..........",
      "..........",
    ],
    "idle-side": [
      "kkkkkkkk..",
      "kyeegGGgk.",
      "kgggggggk.",
      "kGggGggk..",
      "krkrkrk...",
      ".k.k.kk...",
      "..........",
      "..........",
    ],
    "walk-side": [
      "kkkkkkkk..",
      "kyeegGGgk.",
      "kgggggggk.",
      "kGggGggk..",
      ".krkrkrk..",
      "k.k.k.k...",
      "..........",
      "..........",
    ],
    "idle-up": [
      ".kkkkkkkk.",
      "kGGggGGggk",
      "kggggggggk",
      "kGggGggGgk",
      "krkrkrkrkr",
      ".k.k.k.k..",
      "..........",
      "..........",
    ],
    "walk-up": [
      ".kkkkkkkk.",
      "kGGggGGggk",
      "kggggggggk",
      "kGggGggGgk",
      ".krkrkrkr.",
      "k.k.k.k.k.",
      "..........",
      "..........",
    ],
  },
};

/** Canada goose — long neck, black head, not a gull. */
const HONKACE: MonArt = {
  pal: {
    k: 0x1a1410,
    n: 0x1c1c22,
    N: 0x2a2a32,
    w: 0xf4f0e8,
    b: 0xa87850,
    B: 0x8a6840,
    y: 0xf07820,
    Y: 0xc85810,
    e: 0x201810,
    o: 0xd45c28,
  },
  battle: [
    "..........kkkk........",
    ".........kwwwk........",
    ".........knNnk........",
    ".........knyyk........",
    "..........knnkk.......",
    "..........kwwk........",
    ".........kbwwbk.......",
    "......kkkbbbbbbkkk....",
    "....kbbBBBBBBBBBBbk...",
    "....kbbbbbbbbbbbbbk...",
    ".....kbbkkkkkkbbk.....",
    ".....kook....kook.....",
    "......kYk....kYk......",
  ],
  ow: {
    "idle-down": [
      "...kwwk...",
      "...knNnk..",
      "...knyk...",
      "...kwwk...",
      ".kkbbbbkk.",
      "kbbbbbbbbk",
      ".kookook..",
      "..kYk.Yk..",
    ],
    "walk-down": [
      "...kwwk...",
      "...knNnk..",
      "...knyk...",
      "...kwwk...",
      ".kkbbbbkk.",
      "kbbbbbbbbk",
      "kook...ook",
      "kYk.....Yk",
    ],
    "idle-side": [
      ".kwwk.....",
      "knNnyk....",
      ".kwwk.....",
      "..kbbkk...",
      ".kbbbbbk..",
      "kbbbbbbk..",
      ".kook.k...",
      "..kYk.....",
    ],
    "walk-side": [
      ".kwwk.....",
      "knNnyk....",
      ".kwwk.....",
      "..kbbkk...",
      ".kbbbbbk..",
      "kbbbbbbk..",
      "kook..k...",
      "kYk.......",
    ],
    "idle-up": [
      "...knnNk..",
      "...knNnk..",
      "...kwwk...",
      "...kbbk...",
      ".kkbbbbkk.",
      "kbbbbbbbbk",
      ".kookook..",
      "..kYk.Yk..",
    ],
    "walk-up": [
      "...knnNk..",
      "...knNnk..",
      "...kwwk...",
      "...kbbk...",
      ".kkbbbbkk.",
      "kbbbbbbbbk",
      "kook...ook",
      "kYk.....Yk",
    ],
  },
  fly: {
    up: [
      "kk....................kk",
      "kwwk................kwwk",
      "kwwwk.....kkkk.....kwwwk",
      ".kwwwk...kwwwk....kwwwk.",
      "..kwwwk.knNnk....kwwwk..",
      "...kwwwknyyk...kwwwk....",
      "....kwwkwwk..kwwwk......",
      ".....kkbbbbbbkkk........",
      "....kbbBBBBBBBBbk.......",
      "....kbbbbbbbbbbbk.......",
      ".....kook..kook.........",
      "......kYk..kYk..........",
    ],
    down: [
      "..........kkkk..........",
      ".........kwwwk..........",
      ".........knNnk..........",
      ".........knyyk..........",
      "kkkk....kwwk.....kkkk...",
      "kwwwwkkbbbbbbkkkwwwwk...",
      ".kwwwbbbbBBBBBBbbbwwk...",
      "..kwwbbbbbbbbbbbbwwk....",
      "...kwwkkkkkkkkwwk.......",
      "....kook....kook........",
      ".....kYk....kYk.........",
    ],
  },
};

/** Chalk lizard — ridge of dust, long tail. */
const CHALKLUR: MonArt = {
  pal: {
    k: 0x1a1410,
    w: 0xf0e8d4,
    W: 0xd0c8b4,
    c: 0xe8e4d8,
    e: 0x201810,
    o: 0xb8b09c,
  },
  battle: [
    ".................kk...",
    "................kwwk..",
    "....kkkk.......kwwwk..",
    "...kweewk.....kwwwwk..",
    "...kwwwwk....kwwwwwk..",
    "....kcccckkkkwwwwwk...",
    ".....kwwwwwwwwwwwk....",
    "......kWWWWWWWWwk.....",
    "......kowk..kowk......",
    ".......kk....kk.......",
  ],
  ow: {
    "idle-down": [
      "..kweewk..",
      "..kwwwwk..",
      ".kcccccck.",
      "kwwwwwwwwk",
      ".kWWWWWWk.",
      "..kowwok..",
      "...kkkk...",
      "..........",
    ],
    "walk-down": [
      "..kweewk..",
      "..kwwwwk..",
      ".kcccccck.",
      "kwwwwwwwwk",
      ".kWWWWWWk.",
      ".kow..wok.",
      ".kk....kk.",
      "..........",
    ],
    "idle-side": [
      "kweewk..kk",
      "kwwwwk.kww",
      "kcccckwwww",
      ".kwwwwwwwk",
      "..kWWWWwk.",
      "...kowk...",
      "....kk....",
      "..........",
    ],
    "walk-side": [
      "kweewk..kk",
      "kwwwwk.kww",
      "kcccckwwww",
      ".kwwwwwwwk",
      "..kWWWWwk.",
      "..kowk....",
      "..kk......",
      "..........",
    ],
    "idle-up": [
      "..kwwwwk..",
      "..kwwwwk..",
      ".kcccccck.",
      "kwwwwwwwwk",
      ".kWWWWWWk.",
      "..kowwok..",
      "...kkkk...",
      "..........",
    ],
    "walk-up": [
      "..kwwwwk..",
      "..kwwwwk..",
      ".kcccccck.",
      "kwwwwwwwwk",
      ".kWWWWWWk.",
      ".kow..wok.",
      ".kk....kk.",
      "..........",
    ],
  },
};

/** Ditch eel — mud S-curve, no legs. */
const LINELURKER: MonArt = {
  pal: {
    k: 0x1a1410,
    g: 0x3a4a38,
    G: 0x243028,
    y: 0xd8c040,
    e: 0x201810,
    n: 0x1a2018,
  },
  battle: [
    "kk....................",
    "kgykk.................",
    "kgeegk................",
    ".kggGGkk..............",
    "..kggGGGkk............",
    "...kggGGGGGkkkk.......",
    "....kggGGGGGGGGgk.....",
    ".....kkkkkkkkkkkk.....",
  ],
  ow: {
    "idle-down": [
      "kgyk......",
      "kgeegk....",
      ".kggGGk...",
      "..kggGGk..",
      "...kggGGkk",
      "....kggGGk",
      ".....kkkk.",
      "..........",
    ],
    "walk-down": [
      ".kgyk.....",
      "kgeegk....",
      "kggGGk....",
      ".kggGGk...",
      "..kggGGkk.",
      "...kggGGk.",
      "....kkkk..",
      "..........",
    ],
    "idle-side": [
      "kgyk......",
      "kgeegkk...",
      ".kggGGGkk.",
      "..kggGGGGk",
      "...kkkkkk.",
      "..........",
      "..........",
      "..........",
    ],
    "walk-side": [
      ".kgyk.....",
      "kgeegkk...",
      "kggGGGkk..",
      ".kggGGGGk.",
      "..kkkkkk..",
      "..........",
      "..........",
      "..........",
    ],
    "idle-up": [
      "kggk......",
      "kggGGk....",
      ".kggGGk...",
      "..kggGGk..",
      "...kggGGkk",
      "....kggGGk",
      ".....kkkk.",
      "..........",
    ],
    "walk-up": [
      ".kggk.....",
      "kggGGk....",
      "kggGGk....",
      ".kggGGk...",
      "..kggGGkk.",
      "...kggGGk.",
      "....kkkk..",
      "..........",
    ],
  },
};

/** Magpie — long tail, nicked PE sock. */
const KITTHIEF: MonArt = {
  pal: {
    k: 0x1a1410,
    n: 0x1c1c24,
    N: 0x2a2a38,
    w: 0xf4f0e8,
    b: 0x5090c8,
    y: 0xf0c030,
    e: 0x201810,
    o: 0x3a3430,
  },
  battle: [
    "kk..............kkkk..",
    "knnkk..........knnNk..",
    "knweewk.......knnNnk..",
    "knyybkk......knnNnk...",
    ".knnwwwkkkkknnNNnk....",
    "..knnNNNNNNNNNNnk.....",
    "...knnkkkkkkknn.......",
    "....kook..kook........",
    ".....kk....kk.........",
  ],
  ow: {
    "idle-down": [
      "..knnNk...",
      ".knweewnk.",
      "knyybwwwk.",
      "knnNNNNnk.",
      ".knnNNnk..",
      "..kookok..",
      "...kkkk...",
      "..........",
    ],
    "walk-down": [
      "..knnNk...",
      ".knweewnk.",
      "knyybwwwk.",
      "knnNNNNnk.",
      ".knnNNnk..",
      ".kook.ok..",
      ".kk....kk.",
      "..........",
    ],
    "idle-side": [
      "knweeybk..",
      "knnwwwk...",
      "knnNNNkkkk",
      ".knnNNnnnk",
      "..knnkk...",
      "...kok....",
      "....kk....",
      "..........",
    ],
    "walk-side": [
      "knweeybk..",
      "knnwwwk...",
      "knnNNNkkkk",
      ".knnNNnnnk",
      "..knnkk...",
      "..kok.....",
      "..kk......",
      "..........",
    ],
    "idle-up": [
      "..knnNk...",
      ".knnNNnnk.",
      "knnNNNNNk.",
      "knnNNNNnk.",
      ".knnNNnk..",
      "..kookok..",
      "...kkkk...",
      "..........",
    ],
    "walk-up": [
      "..knnNk...",
      ".knnNNnnk.",
      "knnNNNNNk.",
      "knnNNNNnk.",
      ".knnNNnk..",
      ".kook.ok..",
      ".kk....kk.",
      "..........",
    ],
  },
};

const ART: Record<SpeciesId, MonArt> = {
  scabfox: SCABFOX,
  chipgull: CHIPGULL,
  moggit: MOGGIT,
  donerrat: DONERRAT,
  pidgeon: PIDGEON,
  squirral: SQUIRRAL,
  spikehedge: SPIKEHEDGE,
  starlimur: STARLIMUR,
  busstopper: BUSSTOPPER,
  kerbite: KERBITE,
  honkace: HONKACE,
  chalklur: CHALKLUR,
  linelurker: LINELURKER,
  kitthief: KITTHIEF,
};

export function monBattleKey(id: SpeciesId): string {
  return `mon-battle-${id}-v2`;
}

export function monOwSheet(id: SpeciesId): string {
  return `mon-ow-${id}-v3`;
}

export function monFlySheet(id: SpeciesId): string {
  return `mon-fly-${id}-v6`;
}

export function monOwAnim(
  id: SpeciesId,
  kind: OwFrame | "walk-down-loop" | "walk-side-loop" | "walk-up-loop",
): string {
  return `mon-${id}-${kind}`;
}

export function monFlyAnim(id: SpeciesId): string {
  return `mon-${id}-fly-loop`;
}

function drawBattle(scene: Phaser.Scene, id: SpeciesId): void {
  const key = monBattleKey(id);
  if (scene.textures.exists(key)) return;
  const art = ART[id];
  const g = scene.add.graphics().setVisible(false);
  const rows = art.battle;
  const ox = Math.floor((MON_BATTLE - (rows[0]?.length ?? 0)) / 2);
  const oy = Math.floor((MON_BATTLE - rows.length) / 2);
  blit(g, ox, oy, rows, art.pal);
  g.generateTexture(key, MON_BATTLE, MON_BATTLE);
  g.destroy();
}

function drawFly(scene: Phaser.Scene, id: SpeciesId): void {
  const art = ART[id];
  if (!art.fly) return;
  const key = monFlySheet(id);
  if (scene.textures.exists(key)) return;
  const frames = [
    { name: "fly-up", rows: art.fly.up },
    { name: "fly-down", rows: art.fly.down },
  ] as const;
  const g = scene.add.graphics().setVisible(false);
  frames.forEach(({ rows }, i) => {
    const w = Math.max(...rows.map((row) => row.length), 1);
    const h = rows.length;
    const ox = i * MON_BATTLE + Math.floor((MON_BATTLE - w) / 2);
    const oy = Math.floor((MON_BATTLE - h) / 2);
    blit(g, ox, oy, rows, art.pal);
  });
  g.generateTexture(key, frames.length * MON_BATTLE, MON_BATTLE);
  g.destroy();
  const tex = scene.textures.get(key);
  frames.forEach(({ name }, i) => {
    tex.add(name, 0, i * MON_BATTLE, 0, MON_BATTLE, MON_BATTLE);
  });
  const anim = monFlyAnim(id);
  if (scene.anims.exists(anim)) scene.anims.remove(anim);
  scene.anims.create({
    key: anim,
    frames: frames.map(({ name }) => ({ key, frame: name })),
    frameRate: 8,
    repeat: -1,
  });
}

function drawOw(scene: Phaser.Scene, id: SpeciesId): void {
  const key = monOwSheet(id);
  if (scene.textures.exists(key)) return;
  const art = ART[id];
  const g = scene.add.graphics().setVisible(false);
  OW_FRAMES.forEach((name, i) => {
    const rows = art.ow[name];
    const w = Math.max(...rows.map((row) => row.length), 1);
    const ox = i * MON_OW + Math.floor((MON_OW - w) / 2);
    const oy = Math.floor((MON_OW - rows.length) / 2);
    blit(g, ox, oy, rows, art.pal);
  });
  g.generateTexture(key, OW_FRAMES.length * MON_OW, MON_OW);
  g.destroy();
  const tex = scene.textures.get(key);
  OW_FRAMES.forEach((name, i) => {
    tex.add(name, 0, i * MON_OW, 0, MON_OW, MON_OW);
  });
  const mk = (anim: string, frames: OwFrame[], rate: number): void => {
    if (scene.anims.exists(anim)) scene.anims.remove(anim);
    scene.anims.create({
      key: anim,
      frames: frames.map((frame) => ({ key, frame })),
      frameRate: rate,
      repeat: -1,
    });
  };
  mk(monOwAnim(id, "idle-down"), ["idle-down"], 1);
  mk(monOwAnim(id, "idle-side"), ["idle-side"], 1);
  mk(monOwAnim(id, "idle-up"), ["idle-up"], 1);
  mk(monOwAnim(id, "walk-down-loop"), ["idle-down", "walk-down"], 6);
  mk(monOwAnim(id, "walk-side-loop"), ["idle-side", "walk-side"], 6);
  mk(monOwAnim(id, "walk-up-loop"), ["idle-up", "walk-up"], 6);
}

export function ensureMonSheets(scene: Phaser.Scene): void {
  for (const id of MON_IDS) {
    drawBattle(scene, id);
    drawOw(scene, id);
    drawFly(scene, id);
  }
}
