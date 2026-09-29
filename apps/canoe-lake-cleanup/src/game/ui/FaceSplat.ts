const MAX_BLOBS = 48;
const DPR_CAP = 1.5;

type Kind = "bead" | "smear" | "drip";

interface Blob {
  x: number;
  y: number;
  rx: number;
  ry: number;
  rot: number;
  life: number;
  maxLife: number;
  vy: number;
  dirty: boolean;
  kind: Kind;
}

/**
 * First-person visor spatters when bounce spray comes back at the camera.
 * Water beads and brown smears sit in screen space, drip, and fade off.
 */
export class FaceSplat {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private blobs: Blob[] = [];
  private film = 0;
  private dirtyFilm = 0;
  private w = 1;
  private h = 1;
  private needsClear = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Face splat canvas failed");
    this.ctx = ctx;
    this.fit();
    window.addEventListener("resize", () => this.fit());
  }

  /** A bounce drop just caught the visor. */
  public hit(dirty: boolean): void {
    this.film = Math.min(1, this.film + (dirty ? 0.28 : 0.16));
    if (dirty) this.dirtyFilm = Math.min(1, this.dirtyFilm + 0.38);

    const beads = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < beads; i++) this.spawn("bead", dirty);
    if (Math.random() < (dirty ? 0.55 : 0.28)) this.spawn("smear", dirty);
    if (Math.random() < 0.32) this.spawn("drip", dirty);
  }

  public update(delta: number): void {
    this.film = Math.max(0, this.film - delta * 0.38);
    this.dirtyFilm = Math.max(0, this.dirtyFilm - delta * 0.22);

    for (let i = this.blobs.length - 1; i >= 0; i--) {
      const blob = this.blobs[i]!;
      blob.life -= delta;
      blob.y += blob.vy * delta;
      if (blob.kind === "drip") blob.ry += blob.vy * 0.35 * delta;
      if (blob.life <= 0 || blob.y > 1.18) this.blobs.splice(i, 1);
    }

    if (this.blobs.length === 0 && this.film <= 0.01 && this.dirtyFilm <= 0.01) {
      if (this.needsClear) {
        this.ctx.clearRect(0, 0, this.w, this.h);
        this.needsClear = false;
      }
      return;
    }

    this.paint();
  }

  private spawn(kind: Kind, dirty: boolean): void {
    if (this.blobs.length >= MAX_BLOBS) this.blobs.shift();

    const min = Math.min(this.w, this.h) || 1;
    let rx: number;
    let ry: number;
    let vy: number;
    let life: number;
    if (kind === "smear") {
      rx = (18 + Math.random() * 42) / min;
      ry = rx * (0.28 + Math.random() * 0.35);
      vy = 0.02 + Math.random() * 0.04;
      life = 2.4 + Math.random() * 2.2;
    } else if (kind === "drip") {
      rx = (3 + Math.random() * 5) / min;
      ry = rx * (2.2 + Math.random() * 3.4);
      vy = 0.12 + Math.random() * 0.18;
      life = 1.4 + Math.random() * 1.1;
    } else {
      rx = (7 + Math.random() * 22) / min;
      ry = rx * (0.65 + Math.random() * 0.55);
      vy = 0.035 + Math.random() * 0.08;
      life = 1.6 + Math.random() * 2.1;
    }

    this.blobs.push({
      x: 0.06 + Math.random() * 0.88,
      y: 0.08 + Math.random() * 0.72,
      rx,
      ry,
      rot: (Math.random() - 0.5) * 0.9,
      life,
      maxLife: life,
      vy,
      dirty,
      kind,
    });
  }

  private paint(): void {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    this.needsClear = true;

    const film = this.film;
    if (film > 0.01) {
      const cx = w * 0.5;
      const cy = h * 0.42;
      const inner = Math.min(w, h) * 0.18;
      const outer = Math.max(w, h) * 0.72;
      const mist = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
      const dirtyMix = this.dirtyFilm;
      const r = Math.round(170 + dirtyMix * 40);
      const g = Math.round(205 - dirtyMix * 70);
      const b = Math.round(220 - dirtyMix * 130);
      mist.addColorStop(0, `rgba(${r},${g},${b},0)`);
      mist.addColorStop(0.55, `rgba(${r},${g},${b},${0.04 * film})`);
      mist.addColorStop(1, `rgba(${r},${g},${b},${0.22 * film})`);
      ctx.fillStyle = mist;
      ctx.fillRect(0, 0, w, h);
    }

    for (const blob of this.blobs) this.drawBlob(blob);
  }

  private drawBlob(blob: Blob): void {
    const { ctx, w, h } = this;
    const fade = Math.min(1, blob.life / Math.max(0.35, blob.maxLife * 0.45));
    const x = blob.x * w;
    const y = blob.y * h;
    const rx = blob.rx * Math.min(w, h);
    const ry = blob.ry * Math.min(w, h);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(blob.rot);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);

    const hx = -rx * 0.28;
    const hy = -ry * 0.32;
    const grad = ctx.createRadialGradient(hx, hy, rx * 0.08, 0, 0, rx);
    if (blob.dirty) {
      grad.addColorStop(0, `rgba(130, 100, 62, ${0.62 * fade})`);
      grad.addColorStop(0.4, `rgba(82, 58, 32, ${0.48 * fade})`);
      grad.addColorStop(0.82, `rgba(48, 34, 20, ${0.22 * fade})`);
      grad.addColorStop(1, "rgba(40, 28, 16, 0)");
    } else {
      grad.addColorStop(0, `rgba(235, 248, 255, ${0.58 * fade})`);
      grad.addColorStop(0.32, `rgba(170, 210, 230, ${0.34 * fade})`);
      grad.addColorStop(0.72, `rgba(120, 175, 205, ${0.2 * fade})`);
      grad.addColorStop(1, "rgba(160, 200, 220, 0)");
    }
    ctx.fillStyle = grad;
    ctx.fill();

    if (blob.kind !== "drip") {
      ctx.beginPath();
      ctx.ellipse(-rx * 0.28, -ry * 0.34, rx * 0.28, ry * 0.18, -0.4, 0, Math.PI * 2);
      ctx.fillStyle = blob.dirty
        ? `rgba(210, 185, 140, ${0.22 * fade})`
        : `rgba(255, 255, 255, ${0.38 * fade})`;
      ctx.fill();
    }

    ctx.restore();
  }

  private fit(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.w = this.canvas.width;
    this.h = this.canvas.height;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
