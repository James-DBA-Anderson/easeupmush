import * as THREE from "three";

/** What gets sprayed on the back of the toilet block round here. */
export const TAGS = [
  "your mum",
  "PFC",
  "657",
  "ease up mush",
  "Hilsea Lot",
  "Phone your mum",
  "Pompey",
] as const;
export type Tag = (typeof TAGS)[number];
const INKS = [
  "#e0332f",
  "#2f6fd8",
  "#1f1f26",
  "#f0e6c8",
  "#3f9f5f",
  "#f2b430",
  "#d94ec2",
  "#f27a1a",
  "#7ec8e8",
  "#f7f4ec",
];

/**
 * Bubble throw-up is the usual; long phrases go up as a one-line handstyle,
 * wide walls sometimes get a blockbuster.
 */
type TagStyle = "throwup" | "handstyle" | "blockbuster";

const CHROME = "#c9ccd2";
const HAND_INKS = ["#141418", "#1f3fa8", "#c0201c", "#f4f1e6", "#2a7a3a", "#d94ec2"];

interface Glyph {
  ch: string;
  x: number;
  jy: number;
  rot: number;
  w: number;
}

const TEX_W = 512;
const TEX_H = 256;
/** Keep the plane this far inside the wall edges so it never hangs off. */
const WALL_PAD = 0.18;
/** Once this fraction of paint is left, the rest rinses away. */
const RINSE_AT = 0.16;

/** A wall a tag can end up on. */
export interface Wall {
  x: number;
  z: number;
  y: number;
  yaw: number;
  width: number;
  height: number;
  /** Which building it's on, for jobs that hit particular places. */
  site?: "boathouse" | "cafe" | "toilets";
}

/** A tag sprayed on a wall — the lance carves fading streaks through the paint. */
export class Graffiti {
  private scene: THREE.Scene;
  private mesh: THREE.Mesh;
  private material: THREE.MeshStandardMaterial;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  /** Per-pixel paint 0–255; kept in sync with canvas alpha. */
  private mask: Uint8Array;
  private paintSum = 0;
  private paintFull = 1;
  private wide: number;
  private high: number;
  /** Half-extents of the slab of air in front of it that counts as a hit. */
  private reach: THREE.Vector3;
  private rinsing = false;
  private rinse = 0;
  private credited = false;
  private localHit = new THREE.Vector3();
  private localFrom = new THREE.Vector3();
  private localDir = new THREE.Vector3();
  private invQuat = new THREE.Quaternion();

  constructor(scene: THREE.Scene, wall: Wall, word?: Tag) {
    this.scene = scene;

    // Fit entirely on the wall — never overhang the brickwork.
    const maxW = Math.max(0.55, wall.width - WALL_PAD * 2);
    const maxH = Math.max(0.4, wall.height - WALL_PAD * 2);
    this.wide = Math.min(maxW, Math.max(1.1, wall.width * 0.72));
    this.high = Math.min(maxH, Math.max(0.55, this.wide * 0.42));
    if (this.wide > maxW) this.wide = maxW;
    if (this.high > maxH) this.high = maxH;

    this.mask = new Uint8Array(TEX_W * TEX_H);
    this.canvas = document.createElement("canvas");
    this.canvas.width = TEX_W;
    this.canvas.height = TEX_H;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true })!;
    this.paintTag(word);

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.anisotropy = 4;
    this.material = new THREE.MeshStandardMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      roughness: 0.95,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(this.wide, this.high),
      this.material,
    );

    // Proud of the brick, shifted along the wall but clamped so edges stay on.
    const out = new THREE.Vector3(Math.sin(wall.yaw), 0, Math.cos(wall.yaw));
    const along = new THREE.Vector3(out.z, 0, -out.x);
    const maxShift = Math.max(0, (wall.width - this.wide) * 0.5 - WALL_PAD * 0.25);
    const shift = (Math.random() - 0.5) * 2 * maxShift;
    const maxLift = Math.max(0, (wall.height - this.high) * 0.5 - WALL_PAD * 0.25);
    const lift = (Math.random() - 0.5) * 2 * maxLift * 0.6;
    this.mesh.position
      .set(wall.x, wall.y + lift, wall.z)
      .addScaledVector(out, 0.07)
      .addScaledVector(along, shift);
    this.mesh.rotation.y = wall.yaw;
    scene.add(this.mesh);

    // Depth spans the building's 0.45m collision pad plus a full droplet step.
    this.reach = new THREE.Vector3(
      this.wide / 2 + 0.35,
      this.high / 2 + 0.35,
      0.95,
    );
  }

  public getPosition(): THREE.Vector3 {
    return this.mesh.position.clone();
  }

  /**
   * Did a droplet land on the painted face? `from` is the lance — tags on the
   * far side of a cafe don't count if you're hosing through the brickwork.
   */
  public hitBy(
    point: THREE.Vector3,
    from?: THREE.Vector3,
    direction?: THREE.Vector3,
  ): boolean {
    this.mesh.worldToLocal(this.localHit.copy(point));
    // Local +Z is out from the brick. Allow a hair into the wall, nothing from
    // the room behind it.
    if (this.localHit.z < -0.05 || this.localHit.z > this.reach.z) return false;
    if (direction) this.projectOntoPaint(direction);
    if (
      Math.abs(this.localHit.x) >= this.reach.x ||
      Math.abs(this.localHit.y) >= this.reach.y
    ) {
      return false;
    }
    if (from) {
      this.mesh.worldToLocal(this.localFrom.copy(from));
      if (this.localFrom.z < 0.25) return false;
    }
    return true;
  }

  /**
   * Droplets die on the building's padded footprint a little short of the
   * brick. Slide the local hit along its flight onto the paint so glancing
   * shots wash where the stream visibly lands, not a metre or two before it.
   */
  private projectOntoPaint(direction: THREE.Vector3): void {
    if (this.localHit.z <= 0) return;
    this.mesh.getWorldQuaternion(this.invQuat).invert();
    this.localDir.copy(direction).applyQuaternion(this.invQuat);
    if (this.localDir.z > -1e-3) return;
    const t = this.localHit.z / -this.localDir.z;
    const slide = t * Math.hypot(this.localDir.x, this.localDir.y);
    if (slide > 4) return;
    this.localHit.addScaledVector(this.localDir, t);
    this.localHit.z = 0;
  }

  /**
   * Carve a pressure-wash streak through the paint at the hit. Soft erase —
   * the lettering fades under the jet rather than punching clean holes.
   */
  public scrub(point: THREE.Vector3, direction: THREE.Vector3): void {
    if (this.rinsing) return;
    if (!this.hitBy(point, undefined, direction)) return;

    // Local plane coords: X along the wall, Y up. Canvas Y runs the other way.
    const u = this.localHit.x / this.wide + 0.5;
    const v = 0.5 - this.localHit.y / this.high;
    if (u < -0.05 || u > 1.05 || v < -0.05 || v > 1.05) return;

    const cx = u * TEX_W;
    const cy = v * TEX_H;

    this.mesh.getWorldQuaternion(this.invQuat).invert();
    this.localDir.copy(direction).applyQuaternion(this.invQuat);
    let dx = this.localDir.x;
    let dy = -this.localDir.y;
    let len = Math.hypot(dx, dy);
    if (len < 0.08) {
      dx = 1;
      dy = 0;
      len = 1;
    } else {
      dx /= len;
      dy /= len;
    }
    const angle = Math.atan2(dy, dx);

    // Long thin lance path — lifts paint gradually along the stream.
    const along = 18 + Math.random() * 12;
    const across = 3.6 + Math.random() * 1.8;

    this.ctx.save();
    this.ctx.translate(cx, cy);
    this.ctx.rotate(angle);
    this.ctx.globalCompositeOperation = "destination-out";

    // Partial alpha so each pass only thins the ink — streaks of faded paint.
    const grad = this.ctx.createRadialGradient(0, 0, 0, 0, 0, along);
    grad.addColorStop(0, "rgba(0,0,0,0.58)");
    grad.addColorStop(0.4, "rgba(0,0,0,0.4)");
    grad.addColorStop(0.75, "rgba(0,0,0,0.18)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.ellipse(0, 0, along, across, 0, 0, Math.PI * 2);
    this.ctx.fill();

    // Softer secondary pass so the channel looks worn, not stamped.
    this.ctx.fillStyle = "rgba(0,0,0,0.24)";
    this.ctx.beginPath();
    this.ctx.ellipse(
      along * 0.1,
      0,
      along * 0.75,
      across * 0.65,
      0,
      0,
      Math.PI * 2,
    );
    this.ctx.fill();
    this.ctx.restore();

    this.eraseMask(cx, cy, along, across, angle, 0.52);
    this.texture.needsUpdate = true;

    if (this.paintSum <= this.paintFull * RINSE_AT) this.beginRinse();
  }

  /** Score once when the wash job is effectively done. */
  public claimCredit(): boolean {
    if (!this.rinsing || this.credited) return false;
    this.credited = true;
    return true;
  }

  /** Soft fade of whatever ink is left. True once the panel can come down. */
  public update(delta: number): boolean {
    if (!this.rinsing) return false;
    this.rinse = Math.min(1, this.rinse + delta / 1.8);
    this.material.opacity = 1 - this.rinse;
    return this.rinse >= 1;
  }

  public isClean(): boolean {
    return this.rinsing && this.rinse >= 1;
  }

  public dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.texture.dispose();
    this.material.dispose();
  }

  private beginRinse(): void {
    if (this.rinsing) return;
    this.rinsing = true;
    this.rinse = 0;
  }

  private paintTag(chosen?: Tag): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, TEX_W, TEX_H);
    this.mask.fill(0);

    const word = chosen ?? TAGS[Math.floor(Math.random() * TAGS.length)]!;
    const style = pickStyle(word, this.wide);
    if (style === "handstyle") this.paintHandstyle(word);
    else this.paintPiece(word.toUpperCase(), style);

    // Seed the mask from what we drew so scrubbing can track coverage.
    const data = ctx.getImageData(0, 0, TEX_W, TEX_H).data;
    let sum = 0;
    for (let i = 0; i < this.mask.length; i++) {
      const a = data[i * 4 + 3]!;
      this.mask[i] = a;
      sum += a;
    }
    this.paintSum = sum;
    this.paintFull = Math.max(1, sum);
  }

  /**
   * Throw-up / blockbuster: letters laid out with a gap wide enough that fills
   * never overlap, then drawn in passes — 3D, outline, fill, shine — so a
   * neighbour's outline can only ever sit under a fill, not across it.
   */
  private paintPiece(word: string, style: "throwup" | "blockbuster"): void {
    const ctx = this.ctx;
    const throwup = style === "throwup";
    const chrome = throwup && Math.random() < 0.4;
    const ink = chrome ? CHROME : INKS[Math.floor(Math.random() * INKS.length)]!;
    const rim = chrome ? "#0d0d10" : contrastRim(ink);
    const dark = luma(ink) > 0.5 ? "#1a1612" : "#0a0a0e";

    // Bubble swell, outline and 3D depth as fractions of the font size.
    const swellR = throwup ? 0.1 : 0;
    const rimR = throwup ? 0.07 : 0.06;
    const depthR = throwup ? 0.05 : 0.12;
    const font = (s: number) => `900 ${s}px "Arial Black", Impact, sans-serif`;

    const maxW = TEX_W - 60;
    const maxH = TEX_H - 90;
    const layout = (s: number) => {
      ctx.font = font(s);
      const swell = s * swellR;
      const outline = s * rimR;
      const gap = throwup ? 2 * swell + outline : 2 * outline + s * 0.03;
      const glyphs: Glyph[] = [];
      let x = 0;
      let last = 0;
      for (const ch of word) {
        if (ch === " ") {
          x += s * 0.32;
          continue;
        }
        const w = ctx.measureText(ch).width;
        glyphs.push({ ch, x: x + w / 2, jy: 0, rot: 0, w });
        x += w + gap;
        last = x - gap;
      }
      return { glyphs, width: Math.max(1, last) };
    };

    let size = throwup ? 120 : 110;
    let lay = layout(size);
    const halo = () => 2 * size * (swellR + rimR) + size * depthR;
    while (
      size > 30 &&
      (lay.width + halo() > maxW || size * 0.72 + halo() > maxH)
    ) {
      size -= 4;
      lay = layout(size);
    }

    const swell = size * swellR;
    const outline = size * rimR;
    const depth = size * depthR;
    const capH = size * 0.72;
    for (const g of lay.glyphs) {
      g.x -= lay.width / 2;
      g.jy = throwup ? (Math.random() - 0.5) * size * 0.05 : 0;
      g.rot = (Math.random() - 0.5) * (throwup ? 0.07 : 0.02);
    }

    const centres: { x: number; w: number }[] = [];
    ctx.save();
    // Game canvas is CSS-flipped on X; paint mirrored so tags read forwards.
    ctx.translate(TEX_W, 0);
    ctx.scale(-1, 1);
    ctx.translate(TEX_W / 2, TEX_H * 0.42);
    ctx.rotate((Math.random() - 0.5) * (throwup ? 0.1 : 0.05));
    ctx.font = font(size);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.lineJoin = throwup ? "round" : "miter";
    ctx.lineCap = "round";
    ctx.miterLimit = 3;

    const each = (fn: (g: Glyph, base: number) => void) => {
      for (const g of lay.glyphs) {
        ctx.save();
        ctx.translate(g.x, 0);
        ctx.rotate(g.rot);
        fn(g, capH / 2 + g.jy);
        ctx.restore();
      }
    };
    const body = 2 * (swell + outline);

    each((g, base) => {
      ctx.fillStyle = dark;
      ctx.strokeStyle = dark;
      ctx.lineWidth = body;
      for (let k = depth; k > 0; k -= 1.5) {
        ctx.strokeText(g.ch, k, base + k);
        ctx.fillText(g.ch, k, base + k);
      }
    });

    ctx.shadowColor = withAlpha(rim, 0.5);
    ctx.shadowBlur = size * 0.12;
    each((g, base) => {
      ctx.strokeStyle = rim;
      ctx.fillStyle = rim;
      ctx.lineWidth = body;
      ctx.strokeText(g.ch, 0, base);
      ctx.fillText(g.ch, 0, base);
    });
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    each((g, base) => {
      ctx.fillStyle = ink;
      if (swell > 0) {
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2 * swell;
        ctx.strokeText(g.ch, 0, base);
      }
      ctx.fillText(g.ch, 0, base);
      const at = ctx.getTransform().transformPoint(new DOMPoint(0, 0));
      centres.push({ x: at.x, w: g.w });
    });

    each((g, base) => {
      if (throwup) {
        ctx.strokeStyle = withAlpha("#ffffff", chrome ? 0.4 : 0.28);
        ctx.lineWidth = size * 0.022;
        ctx.strokeText(g.ch, 0, base);
        ctx.fillStyle = withAlpha("#ffffff", 0.85);
        ctx.beginPath();
        ctx.ellipse(
          -g.w * 0.22,
          base - capH + size * 0.05,
          size * 0.035,
          size * 0.022,
          -0.5,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      } else {
        ctx.strokeStyle = withAlpha("#ffffff", 0.22);
        ctx.lineWidth = size * 0.018;
        ctx.strokeText(g.ch, -size * 0.012, base - size * 0.012);
      }
    });
    ctx.restore();

    if (Math.random() < 0.85) {
      const drips = 2 + (Math.random() < 0.4 ? 1 : 0);
      this.dripFrom(centres, drips, ink, size * 0.08, depth + outline + 2);
    }
  }

  /** One joined-up line — written in a single stroke so letters can't stack. */
  private paintHandstyle(word: string): void {
    const ctx = this.ctx;
    const ink = HAND_INKS[Math.floor(Math.random() * HAND_INKS.length)]!;
    const font = (s: number) =>
      `italic 700 ${s}px "Segoe Script", "Brush Script MT", "URW Chancery L", "Comic Sans MS", cursive`;

    const maxW = TEX_W - 60;
    const maxH = TEX_H - 80;
    let size = 100;
    ctx.font = font(size);
    while (
      size > 26 &&
      (ctx.measureText(word).width > maxW || size * 1.25 > maxH)
    ) {
      size -= 4;
      ctx.font = font(size);
    }
    const textW = ctx.measureText(word).width;

    ctx.save();
    ctx.translate(TEX_W, 0);
    ctx.scale(-1, 1);
    ctx.translate(TEX_W / 2, TEX_H * 0.45);
    ctx.rotate(-0.1 + Math.random() * 0.12);
    ctx.font = font(size);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    ctx.shadowColor = withAlpha(ink, 0.45);
    ctx.shadowBlur = size * 0.08;
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineWidth = size * 0.05;
    ctx.strokeText(word, 0, 0);
    ctx.fillText(word, 0, 0);

    if (Math.random() < 0.55) {
      ctx.lineWidth = size * 0.045;
      ctx.beginPath();
      ctx.moveTo(-textW * 0.48, size * 0.44);
      ctx.quadraticCurveTo(0, size * 0.64, textW * 0.56, size * 0.3);
      ctx.stroke();
    }
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    const m = ctx.getTransform();
    const a = m.transformPoint(new DOMPoint(-textW * 0.4, 0));
    const b = m.transformPoint(new DOMPoint(textW * 0.4, 0));
    ctx.restore();

    if (Math.random() < 0.65) {
      const x = a.x + (b.x - a.x) * Math.random();
      this.dripFrom([{ x, w: 0 }], 1, ink, size * 0.05, 2);
    }
  }

  /**
   * Gravity runs off the lowest paint in a column: thick where they leave the
   * letter, tapering, with a bead at the end. Drawn unmirrored — they fall
   * straight down whatever the piece's tilt.
   */
  private dripFrom(
    spots: readonly { x: number; w: number }[],
    count: number,
    ink: string,
    thick: number,
    inset: number,
  ): void {
    if (spots.length === 0 || count <= 0) return;
    const data = this.ctx.getImageData(0, 0, TEX_W, TEX_H).data;
    const pool = [...spots].sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(count, pool.length); i++) {
      const spot = pool[i]!;
      const x = Math.round(spot.x + (Math.random() - 0.5) * spot.w * 0.5);
      const bottom = lowestPaint(data, x);
      if (bottom < 0) continue;
      const w = thick * (0.8 + Math.random() * 0.5);
      this.paintDrip(x, bottom - inset, ink, w, 14 + Math.random() * 34);
    }
  }

  private paintDrip(
    x: number,
    y0: number,
    ink: string,
    w: number,
    len: number,
  ): void {
    const ctx = this.ctx;
    const tipY = Math.min(TEX_H - w * 1.4 - 2, y0 + len);
    if (tipY < y0 + w) return;
    const run = tipY - y0;
    const neck = w * 0.35;
    ctx.save();
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y0);
    ctx.bezierCurveTo(
      x - w / 2,
      y0 + run * 0.35,
      x - neck / 2,
      tipY - run * 0.3,
      x - neck / 2,
      tipY,
    );
    ctx.lineTo(x + neck / 2, tipY);
    ctx.bezierCurveTo(
      x + neck / 2,
      tipY - run * 0.3,
      x + w / 2,
      y0 + run * 0.35,
      x + w / 2,
      y0,
    );
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x, tipY + w * 0.35, w * 0.42, w * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = withAlpha("#ffffff", 0.25);
    ctx.lineWidth = Math.max(1, w * 0.12);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - w * 0.14, y0 + 2);
    ctx.lineTo(x - neck * 0.15, tipY);
    ctx.stroke();
    ctx.restore();
  }

  private eraseMask(
    cx: number,
    cy: number,
    along: number,
    across: number,
    angle: number,
    strength: number,
  ): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const pad = Math.ceil(along + across);
    const x0 = Math.max(0, Math.floor(cx - pad));
    const x1 = Math.min(TEX_W - 1, Math.ceil(cx + pad));
    const y0 = Math.max(0, Math.floor(cy - pad));
    const y1 = Math.min(TEX_H - 1, Math.ceil(cy + pad));

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const lx = dx * cos + dy * sin;
        const ly = -dx * sin + dy * cos;
        const e = (lx * lx) / (along * along) + (ly * ly) / (across * across);
        if (e > 1) continue;
        const cut = Math.floor((1 - e) * 255 * strength);
        const i = y * TEX_W + x;
        const prev = this.mask[i]!;
        if (prev === 0) continue;
        const next = Math.max(0, prev - cut);
        this.paintSum -= prev - next;
        this.mask[i] = next;
      }
    }
  }
}

function pickStyle(word: string, wide: number): TagStyle {
  if (word.length > 8 && Math.random() < 0.8) return "handstyle";
  if (wide >= 2.4 && Math.random() < 0.45) return "blockbuster";
  return "throwup";
}

/** Lowest solid pixel in a canvas column, or -1 if there's no paint there. */
function lowestPaint(data: Uint8ClampedArray, x: number): number {
  const xi = Math.max(0, Math.min(TEX_W - 1, x));
  for (let y = TEX_H - 1; y >= 0; y--) {
    if (data[(y * TEX_W + xi) * 4 + 3]! > 200) return y;
  }
  return -1;
}

function withAlpha(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

function luma(hex: string): number {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Outline that stays visible against both the fill and typical brick. */
function contrastRim(ink: string): string {
  return luma(ink) > 0.48 ? "#0a0a0c" : "#f4eee0";
}
