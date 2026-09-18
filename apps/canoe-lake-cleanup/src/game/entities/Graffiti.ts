import * as THREE from "three";

/** What gets sprayed on the back of the toilet block round here. */
const TAGS = ["your mum", "PFC", "657", "ease up mush"] as const;
const INKS = ["#e0332f", "#2f6fd8", "#1f1f26", "#f0e6c8", "#3f9f5f"];

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
  private localDir = new THREE.Vector3();
  private invQuat = new THREE.Quaternion();

  constructor(scene: THREE.Scene, wall: Wall) {
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
    this.paintTag();

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

    this.reach = new THREE.Vector3(
      this.wide / 2 + 0.35,
      this.high / 2 + 0.35,
      0.7,
    );
  }

  public getPosition(): THREE.Vector3 {
    return this.mesh.position.clone();
  }

  /** Did a droplet land on the tag? */
  public hitBy(point: THREE.Vector3): boolean {
    this.mesh.worldToLocal(this.localHit.copy(point));
    return (
      Math.abs(this.localHit.x) < this.reach.x &&
      Math.abs(this.localHit.y) < this.reach.y &&
      Math.abs(this.localHit.z) < this.reach.z
    );
  }

  /**
   * Carve a pressure-wash streak through the paint at the hit. Soft erase —
   * the lettering fades under the jet rather than punching clean holes.
   */
  public scrub(point: THREE.Vector3, direction: THREE.Vector3): void {
    if (this.rinsing) return;
    if (!this.hitBy(point)) return;

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

  private paintTag(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, TEX_W, TEX_H);
    this.mask.fill(0);

    const ink = INKS[Math.floor(Math.random() * INKS.length)]!;
    const word = TAGS[Math.floor(Math.random() * TAGS.length)]!;
    const short = word.length <= 4;

    // Game canvas is CSS-flipped on X; paint mirrored so tags read forwards.
    ctx.save();
    ctx.translate(TEX_W, 0);
    ctx.scale(-1, 1);

    // Soft spray haze behind the letters.
    const haze = ctx.createRadialGradient(
      TEX_W * 0.5,
      TEX_H * 0.5,
      10,
      TEX_W * 0.5,
      TEX_H * 0.5,
      TEX_W * 0.42,
    );
    haze.addColorStop(0, withAlpha(ink, 0.14));
    haze.addColorStop(1, withAlpha(ink, 0));
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, TEX_W, TEX_H);

    const marginX = 28;
    const marginY = 22;
    const maxTextW = TEX_W - marginX * 2;
    const maxTextH = TEX_H - marginY * 2;

    // Fat throw-up / bubble style — never sans-serif clean type.
    let size = short ? 118 : word.length > 10 ? 58 : 72;
    ctx.font = `900 ${size}px "Arial Black", Impact, Haettenschweiler, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    while (size > 28 && ctx.measureText(word).width > maxTextW) {
      size -= 4;
      ctx.font = `900 ${size}px "Arial Black", Impact, Haettenschweiler, sans-serif`;
    }
    // Cap height so tall glyphs stay inside the canvas.
    const approxH = size * 1.15;
    if (approxH > maxTextH) {
      size = Math.floor(maxTextH / 1.15);
      ctx.font = `900 ${size}px "Arial Black", Impact, Haettenschweiler, sans-serif`;
    }

    const textW = ctx.measureText(word).width;
    const tilt = (Math.random() - 0.5) * 0.12;
    const cx = TEX_W / 2;
    const cy = TEX_H * (0.5 + (Math.random() - 0.5) * 0.06);

    ctx.translate(cx, cy);
    ctx.rotate(tilt);

    // Draw letter-by-letter with a slight hand-painted stagger.
    let x = -textW / 2;
    for (let i = 0; i < word.length; i++) {
      const ch = word[i]!;
      const w = ctx.measureText(ch).width;
      const jigX = (Math.random() - 0.5) * (short ? 2.5 : 1.8);
      const jigY = (Math.random() - 0.5) * (short ? 4 : 3);
      const rot = (Math.random() - 0.5) * 0.08;

      ctx.save();
      ctx.translate(x + w / 2 + jigX, jigY);
      ctx.rotate(rot);

      // Outer outline (marker / can edge).
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.miterLimit = 2;
      ctx.lineWidth = short ? size * 0.28 : size * 0.22;
      ctx.strokeStyle = "#0a0a0c";
      ctx.strokeText(ch, -w / 2, 0);

      // Colour fill.
      ctx.lineWidth = short ? size * 0.16 : size * 0.12;
      ctx.strokeStyle = ink;
      ctx.strokeText(ch, -w / 2, 0);
      ctx.fillStyle = ink;
      ctx.fillText(ch, -w / 2, 0);

      // Soft highlight on the upper edge.
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.fillText(ch, -w / 2 - size * 0.02, -size * 0.04);

      // Paint drips from a couple of letters.
      if (ch !== " " && Math.random() < (short ? 0.55 : 0.35)) {
        this.paintDrip(ctx, 0, size * 0.38, ink, size * (0.08 + Math.random() * 0.12));
      }

      ctx.restore();
      x += w * (short ? 1.02 : 0.98);
    }

    // Occasional underline slash / arrow under short tags.
    if (short && Math.random() < 0.7) {
      ctx.beginPath();
      ctx.moveTo(-textW * 0.45, size * 0.55);
      ctx.quadraticCurveTo(0, size * 0.72, textW * 0.48, size * 0.5);
      ctx.strokeStyle = ink;
      ctx.lineWidth = size * 0.08;
      ctx.lineCap = "round";
      ctx.stroke();
    }

    ctx.restore();

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

  private paintDrip(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    ink: string,
    thick: number,
  ): void {
    const len = 10 + Math.random() * 22;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + (Math.random() - 0.5) * 6,
      y + len * 0.55,
      x + (Math.random() - 0.5) * 4,
      y + len,
    );
    ctx.strokeStyle = ink;
    ctx.lineWidth = thick;
    ctx.lineCap = "round";
    ctx.stroke();
    // Blob at the tip.
    ctx.beginPath();
    ctx.arc(x + (Math.random() - 0.5) * 3, y + len + 2, thick * 0.85, 0, Math.PI * 2);
    ctx.fillStyle = ink;
    ctx.fill();
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

function withAlpha(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}
