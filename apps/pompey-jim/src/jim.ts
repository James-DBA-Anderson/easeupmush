import type { JimMood } from "./chat";

export const SRC_W = 80;
export const SRC_H = 96;

const C = {
  night: "#071018",
  night2: "#0c1c28",
  sodium: "#e09028",
  sodiumD: "#8a4a10",
  brick: "#3a221c",
  brickLn: "#261410",
  mortar: "#5a3830",
  skin: "#e8a878",
  skinLt: "#f4c49a",
  skinSh: "#c47a50",
  skinDk: "#9a5a38",
  flush: "#d07058",
  hair: "#1a120e",
  hairLt: "#3a2a20",
  stub: "#6a4a3a",
  lip: "#b04840",
  lipDk: "#7a3028",
  teeth: "#f0e4d0",
  mouth: "#3a1814",
  eyeW: "#f6eee4",
  iris: "#4a3428",
  pupil: "#100c0a",
  shine: "#f8f4ec",
  brow: "#241810",
  outline: "#0a0806",
  pompey: "#001489",
  pompeyLt: "#1c3ab0",
  pompeyDk: "#000c4a",
  white: "#f2f4f8",
  whiteD: "#c4c8dc",
  jacket: "#101c58",
  jacketLt: "#243878",
  jacketDk: "#0a1238",
  tee: "#e6e8f0",
  gold: "#d4a020",
  goldD: "#8a6810",
};

export type JimAnim = {
  mood: JimMood;
  talking: boolean;
  thinking: boolean;
  reading: boolean;
};

export function createJim(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = SRC_W;
  c.height = SRC_H;
  return c;
}

export function drawJim(src: HTMLCanvasElement, t: number, anim: JimAnim): void {
  const g = src.getContext("2d");
  if (!g) return;
  g.imageSmoothingEnabled = false;
  const bob = anim.talking && !anim.reading ? Math.round(Math.sin(t * 10) * 1) : Math.round(Math.sin(t * 1.4) * 0.49);
  const blink = blinkAt(t);
  const look = anim.reading
    ? 2
    : anim.thinking
      ? -2
      : anim.mood === "copped"
        ? 1
        : Math.sin(t * 0.35) > 0.92
          ? 1
          : 0;
  const mouth = anim.reading ? 0 : mouthShape(t, anim);
  const scarf = Math.round(Math.sin(t * 2.1) * 1);

  g.fillStyle = C.night;
  g.fillRect(0, 0, SRC_W, SRC_H);
  drawBg(g, t);
  g.save();
  g.translate(0, bob);
  drawTorso(g, scarf);
  drawHead(g, blink, look, mouth, anim.reading ? "read" : anim.mood, anim.reading);
  if (anim.reading) drawPhone(g, t);
  g.restore();
  drawVignette(g);
}

function blinkAt(t: number): number {
  const cycle = t % 3.6;
  if (cycle > 3.42 && cycle < 3.5) return 1;
  if (cycle > 3.5 && cycle < 3.56) return 0.4;
  return 0;
}

function mouthShape(t: number, anim: JimAnim): number {
  if (anim.thinking) return 0;
  if (anim.mood === "copped" && !anim.talking) return -1;
  if (!anim.talking) return Math.sin(t * 0.8) > 0.7 ? 0.4 : 0;
  return 0.55 + 0.45 * Math.abs(Math.sin(t * 14));
}

function drawBg(g: CanvasRenderingContext2D, t: number): void {
  g.fillStyle = C.night2;
  g.fillRect(0, 0, SRC_W, 54);
  const flicker = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 7.3));
  g.fillStyle = C.sodiumD;
  g.globalAlpha = 0.35 * flicker;
  g.fillRect(48, 0, 32, 28);
  g.fillStyle = C.sodium;
  g.globalAlpha = 0.22 * flicker;
  ellipse(g, 70, 6, 18, 10);
  g.globalAlpha = 1;
  g.fillStyle = C.brick;
  g.fillRect(0, 50, SRC_W, 46);
  g.fillStyle = C.brickLn;
  for (let y = 52; y < SRC_H; y += 6) {
    g.fillRect(0, y, SRC_W, 1);
    const off = (y / 6) % 2 === 0 ? 0 : 6;
    for (let x = off; x < SRC_W; x += 12) g.fillRect(x, y, 1, 6);
  }
  g.fillStyle = C.mortar;
  g.globalAlpha = 0.25;
  g.fillRect(0, 50, SRC_W, 1);
  g.globalAlpha = 1;
}

function drawTorso(g: CanvasRenderingContext2D, scarf: number): void {
  g.fillStyle = C.jacketDk;
  g.fillRect(6, 68, 68, 28);
  g.fillStyle = C.jacket;
  g.fillRect(10, 66, 60, 30);
  g.fillStyle = C.jacketLt;
  g.fillRect(14, 68, 8, 28);
  g.fillRect(22, 70, 3, 20);
  g.fillStyle = C.tee;
  g.fillRect(34, 78, 12, 18);
  g.fillStyle = C.pompeyDk;
  g.fillRect(32, 62, 16, 10);
  // scarf wrap
  stripeScarf(g, 18 + scarf, 60, 44, 10);
  stripeScarf(g, 8 + scarf, 70, 18, 26);
  stripeScarf(g, 54 + scarf, 68, 16, 28);
  g.fillStyle = C.gold;
  g.fillRect(36, 74, 8, 8);
  g.fillStyle = C.goldD;
  g.fillRect(36, 74, 8, 1);
  g.fillRect(36, 81, 8, 1);
  g.fillStyle = C.white;
  g.fillRect(38, 76, 4, 4);
  g.fillStyle = C.pompey;
  g.fillRect(39, 77, 2, 2);
}

function stripeScarf(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  for (let i = 0; i < h; i++) {
    g.fillStyle = (i + x) % 6 < 3 ? C.pompey : C.white;
    if ((i + x) % 6 === 0) g.fillStyle = C.pompeyDk;
    if ((i + x) % 6 === 3) g.fillStyle = C.whiteD;
    g.fillRect(x, y + i, w, 1);
  }
  g.fillStyle = C.outline;
  g.fillRect(x, y, w, 1);
  g.fillRect(x, y, 1, h);
  g.fillRect(x + w - 1, y, 1, h);
}

function drawHead(
  g: CanvasRenderingContext2D,
  blink: number,
  look: number,
  mouth: number,
  mood: JimMood,
  reading = false,
): void {
  const cx = 40;
  const cy = 38;
  // neck
  g.fillStyle = C.skinSh;
  g.fillRect(cx - 8, 58, 16, 12);
  g.fillStyle = C.skin;
  g.fillRect(cx - 7, 58, 14, 9);
  // ears
  g.fillStyle = C.skinSh;
  ellipse(g, cx - 18, 42, 4, 6);
  ellipse(g, cx + 18, 42, 4, 6);
  g.fillStyle = C.skin;
  ellipse(g, cx - 18, 42, 3, 5);
  ellipse(g, cx + 18, 42, 3, 5);
  g.fillStyle = C.gold;
  g.fillRect(cx + 19, 46, 3, 3);
  g.fillStyle = C.goldD;
  g.fillRect(cx + 20, 47, 1, 1);
  // skull — a bit squarer for a 40s geezer
  g.fillStyle = C.outline;
  ellipse(g, cx, cy + 3, 19, 23);
  g.fillRect(cx - 16, cy + 4, 32, 18);
  g.fillStyle = C.skinSh;
  ellipse(g, cx, cy + 3, 17, 21);
  g.fillRect(cx - 14, cy + 6, 28, 16);
  g.fillStyle = C.skin;
  ellipse(g, cx, cy + 1, 16, 20);
  g.fillRect(cx - 13, cy + 4, 26, 16);
  g.fillStyle = C.skinLt;
  ellipse(g, cx - 3, cy - 2, 7, 6);
  g.fillStyle = C.flush;
  g.globalAlpha = 0.32;
  ellipse(g, cx - 11, cy + 9, 4, 3);
  ellipse(g, cx + 11, cy + 9, 4, 3);
  g.globalAlpha = 1;
  // cropped hair, receding a bit
  g.fillStyle = C.hair;
  ellipse(g, cx, cy - 12, 16, 8);
  g.fillRect(cx - 16, cy - 14, 32, 8);
  g.fillRect(cx - 18, cy - 6, 4, 12);
  g.fillRect(cx + 14, cy - 6, 4, 12);
  g.fillStyle = C.hairLt;
  g.fillRect(cx - 6, cy - 16, 8, 2);
  // temples
  g.fillStyle = C.skin;
  g.fillRect(cx - 16, cy - 9, 6, 5);
  g.fillRect(cx + 10, cy - 9, 6, 5);
  // stubble
  g.fillStyle = C.stub;
  g.globalAlpha = 0.55;
  for (let y = cy + 10; y < cy + 22; y += 2) {
    for (let x = cx - 14; x < cx + 14; x += 2) {
      if ((x + y) % 4 === 0) g.fillRect(x, y, 1, 1);
    }
  }
  g.globalAlpha = 1;
  drawEyes(g, cx, cy, blink, look, mood, reading);
  // nose
  g.fillStyle = C.skinSh;
  g.fillRect(cx - 1, cy + 2, 4, 8);
  g.fillStyle = C.skinDk;
  g.fillRect(cx + 2, cy + 6, 2, 4);
  g.fillStyle = C.skinLt;
  g.fillRect(cx - 1, cy + 2, 2, 5);
  g.fillRect(cx - 2, cy + 9, 5, 2);
  drawMouth(g, cx, cy + 16, mouth, mood);
  // brows
  g.fillStyle = C.brow;
  const browY = mood === "copped" ? cy - 9 : reading ? cy - 10 : cy - 11;
  const tilt = mood === "copped" ? 1 : reading ? 1 : 0;
  g.fillRect(cx - 12, browY + tilt, 9, 2);
  g.fillRect(cx + 3, browY, 9, 2);
  if (mood === "copped") g.fillRect(cx - 4, browY + 2, 3, 1);
}

function drawEyes(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  blink: number,
  look: number,
  mood: JimMood,
  reading = false,
): void {
  const ey = cy - 4 + (reading ? 2 : 0);
  const lid = Math.round(6 * blink);
  const drawOne = (ex: number) => {
    g.fillStyle = C.outline;
    ellipse(g, ex, ey, 5, 4);
    g.fillStyle = C.eyeW;
    ellipse(g, ex, ey, 4, 3);
    g.fillStyle = C.iris;
    ellipse(g, ex + look, ey + (mood === "copped" ? 1 : 0), 2, 2);
    g.fillStyle = C.pupil;
    g.fillRect(ex + look, ey, 2, 2);
    g.fillStyle = C.shine;
    g.fillRect(ex - 1 + look, ey - 1, 1, 1);
    if (lid > 0) {
      g.fillStyle = C.skin;
      g.fillRect(ex - 4, ey - 3, 9, lid + 2);
      g.fillStyle = C.brow;
      g.fillRect(ex - 4, ey - 3 + lid, 9, 1);
    }
  };
  drawOne(cx - 8);
  drawOne(cx + 8);
}

function drawPhone(g: CanvasRenderingContext2D, t: number): void {
  const x = 52;
  const y = 30 + Math.round(Math.sin(t * 6) * 0.49);
  // arm
  g.fillStyle = C.skinSh;
  g.fillRect(48, 58, 5, 12);
  g.fillStyle = C.skin;
  g.fillRect(49, 50, 4, 14);
  g.fillRect(50, 44, 5, 8);
  // phone body
  g.fillStyle = C.outline;
  g.fillRect(x - 1, y - 1, 16, 26);
  g.fillStyle = "#1a1a22";
  g.fillRect(x, y, 14, 24);
  const glow = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 9));
  g.fillStyle = C.pompeyLt;
  g.globalAlpha = 0.35 + 0.25 * glow;
  g.fillRect(x + 1, y + 2, 12, 18);
  g.globalAlpha = 1;
  g.fillStyle = C.white;
  g.fillRect(x + 2, y + 4, 10, 3);
  g.fillStyle = C.pompey;
  g.fillRect(x + 2, y + 8, 10, 8);
  g.fillStyle = C.sodium;
  g.fillRect(x + 5, y + 21, 4, 1);
}

function drawMouth(g: CanvasRenderingContext2D, cx: number, cy: number, open: number, mood: JimMood): void {
  const w = 10;
  if (open <= 0) {
    g.fillStyle = C.lipDk;
    g.fillRect(cx - 5, cy, w, 1);
    if (mood === "copped") {
      g.fillRect(cx - 4, cy + 1, 3, 1);
      g.fillRect(cx + 1, cy + 1, 3, 1);
    }
    return;
  }
  const h = Math.max(1, Math.round(open * 6));
  g.fillStyle = C.lip;
  g.fillRect(cx - 6, cy - 1, w + 2, 1);
  g.fillStyle = C.mouth;
  g.fillRect(cx - 5, cy, w, h);
  if (h > 2) {
    g.fillStyle = C.teeth;
    g.fillRect(cx - 4, cy, w - 2, 2);
  }
  g.fillStyle = C.lipDk;
  g.fillRect(cx - 5, cy + h, w, 2);
}

function drawVignette(g: CanvasRenderingContext2D): void {
  g.fillStyle = "#000000";
  g.globalAlpha = 0.28;
  g.fillRect(0, 0, SRC_W, 3);
  g.fillRect(0, SRC_H - 3, SRC_W, 3);
  g.fillRect(0, 0, 3, SRC_H);
  g.fillRect(SRC_W - 3, 0, 3, SRC_H);
  g.globalAlpha = 1;
}

function ellipse(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number): void {
  for (let y = -ry; y <= ry; y++) {
    for (let x = -rx; x <= rx; x++) {
      if (x * x * ry * ry + y * y * rx * rx <= rx * rx * ry * ry) {
        g.fillRect(cx + x, cy + y, 1, 1);
      }
    }
  }
}
