import * as THREE from "three";
import { PATH_Y } from "../world/lake";

export type DropKind = "swan" | "fox" | "gull";

const TEX = 128;
/** How close a new deposit must be to stack onto an existing pile. */
export const MERGE_RADIUS = 0.85;
/** Soft upper bound on separate piles (layers stack instead of multiplying). */
export const MAX_PILES = 42;

const SWAN = { r: 185, g: 200, b: 170 };
const GULL = { r: 236, g: 240, b: 228 };
const FOX = { r: 74, g: 58, b: 40 };
const TROD = { r: 170, g: 168, b: 140 };

interface Clump {
  mesh: THREE.Mesh;
  lx: number;
  lz: number;
  baseScale: THREE.Vector3;
}

/**
 * A pile of bird (or fox) mess on the paving. The washable part is a canvas
 * splat — the jet carves streaks through it like a power-washer — with a few
 * lumpy clumps sat on top. Fresh deposits on the same spot stack as layers.
 */
export class Dropping {
  private scene: THREE.Scene;
  private group: THREE.Group;
  private splat: THREE.Mesh;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private material: THREE.MeshBasicMaterial;
  /** Per-pixel dirt 0–255; kept in sync with the canvas alpha. */
  private mask: Uint8Array;
  private dirtSum = 0;
  private dirtFull = 1;
  private clumps: Clump[] = [];
  private kind: DropKind;
  private layers = 1;
  private trodden = false;
  /** World-space half-width of the splat plane. */
  private half = 0.55;
  private scrubs = 0;
  /** Once most of the dirt is gone, the remains rinse away over a second or two. */
  private rinsing = false;
  private rinse = 0;
  private credited = false;
  private rainAcc = 0;
  private rainDabs = 0;

  constructor(position: THREE.Vector3, scene: THREE.Scene, kind: DropKind = "swan") {
    this.scene = scene;
    this.kind = kind;
    this.mask = new Uint8Array(TEX * TEX);

    this.canvas = document.createElement("canvas");
    this.canvas.width = TEX;
    this.canvas.height = TEX;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true })!;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    this.splat = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.splat.rotation.x = -Math.PI / 2;
    this.splat.position.y = 0.004;

    this.group = new THREE.Group();
    this.group.position.set(position.x, PATH_Y, position.z);
    this.group.add(this.splat);

    this.paintSplat(true);
    this.spawnClumps(kind === "fox" ? 2 : kind === "gull" ? 2 : 4);
    this.resizeSplat();

    scene.add(this.group);
  }

  public getPosition(): THREE.Vector3 {
    return this.group.position;
  }

  /** Root object — position is world XZ of the pile. */
  public getMesh(): THREE.Object3D {
    return this.group;
  }

  public getRadius(): number {
    return this.half;
  }

  public getLayers(): number {
    return this.layers;
  }

  public covers(point: THREE.Vector3): boolean {
    const dx = point.x - this.group.position.x;
    const dz = point.z - this.group.position.z;
    // Hit must land on the pad — no generous splash halo.
    const r = this.half * 0.98;
    return dx * dx + dz * dz <= r * r;
  }

  /** Another deposit on this pile — thicker pad, more lumps. */
  public addLayer(kind: DropKind = this.kind): void {
    this.layers = Math.min(14, this.layers + 1);
    if (kind === "fox") this.kind = "fox";
    else if (this.kind === "gull" && kind === "swan") this.kind = "swan";

    this.half = Math.min(2.05, 0.55 + this.layers * 0.11);
    this.paintSplat(false);
    this.spawnClumps(kind === "fox" ? 1 : 2 + Math.floor(Math.random() * 2));
    this.resizeSplat();
    this.refreshClumpVisibility();
  }

  /** Someone has stood in it — pad spreads and goes muddy. */
  public tread(): void {
    if (this.trodden) return;
    this.trodden = true;
    this.half = Math.min(1.35, this.half * 1.35);
    this.paintSplat(true);
    for (const clump of this.clumps) {
      clump.baseScale.y *= 0.35;
      clump.mesh.scale.copy(clump.baseScale);
      clump.mesh.position.y *= 0.4;
      const mat = clump.mesh.material as THREE.MeshStandardMaterial;
      mat.color.setRGB(TROD.r / 255, TROD.g / 255, TROD.b / 255);
    }
    this.resizeSplat();
  }

  public isTrodden(): boolean {
    return this.trodden;
  }

  /**
   * Carve a power-wash streak through the splat at the hit point, following
   * the horizontal spray direction.
   */
  public scrub(point: THREE.Vector3, direction: THREE.Vector3): void {
    if (this.rinsing) return;

    const lx = point.x - this.group.position.x;
    const lz = point.z - this.group.position.z;
    if (lx * lx + lz * lz > this.half * this.half) return;

    let dx = direction.x;
    let dz = direction.z;
    let len = Math.hypot(dx, dz);
    if (len < 0.05) {
      dx = 0;
      dz = 1;
      len = 1;
    } else {
      dx /= len;
      dz /= len;
    }

    const u = (lx / this.half) * 0.5 + 0.5;
    const v = (lz / this.half) * 0.5 + 0.5;
    const cx = u * TEX;
    const cy = v * TEX;

    // Wide lance streak — reads as a proper wash path through the mess.
    const along = 18 + Math.random() * 8;
    const across = 5.2 + Math.random() * 2.4;
    const angle = Math.atan2(dz, dx);

    this.ctx.save();
    this.ctx.translate(cx, cy);
    this.ctx.rotate(angle);
    this.ctx.globalCompositeOperation = "destination-out";

    const grad = this.ctx.createRadialGradient(0, 0, 0, 0, 0, along);
    grad.addColorStop(0, "rgba(0,0,0,1)");
    grad.addColorStop(0.35, "rgba(0,0,0,0.85)");
    grad.addColorStop(0.75, "rgba(0,0,0,0.45)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.ellipse(0, 0, along, across, 0, 0, Math.PI * 2);
    this.ctx.fill();

    // Soft edges either side so the channel looks washed, not stamped.
    this.ctx.fillStyle = "rgba(0,0,0,0.55)";
    this.ctx.beginPath();
    this.ctx.ellipse(
      along * 0.08,
      0,
      along * 0.7,
      across * 0.7,
      0,
      0,
      Math.PI * 2,
    );
    this.ctx.fill();
    this.ctx.restore();

    // Punch the same streak out of the CPU mask (rotated ellipse).
    this.eraseMask(cx, cy, along, across, angle);

    this.texture.needsUpdate = true;
    this.scrubs++;
    if (this.scrubs % 2 === 0) this.refreshClumpVisibility();

    // Most of the pad is clear — let the rest soak away rather than popping off.
    if (this.dirtSum <= this.dirtFull * 0.14) this.beginRinse(true);
  }

  /**
   * Soft rain over the paving — random drips slowly wear the mess away.
   * Clearing by weather alone doesn't score.
   */
  public weather(delta: number, rain: number): void {
    if (this.rinsing || rain < 0.08) return;

    // Thick dumps take longer; drizzle is a slow soak, a downpour works faster.
    const rate = rain / (0.85 + this.layers * 0.4);
    this.rainAcc += delta * rate;

    let dirty = false;
    while (this.rainAcc >= 0.14) {
      this.rainAcc -= 0.14;
      this.rainDab();
      dirty = true;
      this.rainDabs++;
      if (this.rainDabs % 4 === 0) this.refreshClumpVisibility();
    }

    if (dirty) this.texture.needsUpdate = true;
    if (this.dirtSum <= this.dirtFull * 0.14) this.beginRinse(false);
  }

  /** A soft raindrop hit somewhere on the pad. */
  private rainDab(): void {
    const cx = TEX * (0.18 + Math.random() * 0.64);
    const cy = TEX * (0.18 + Math.random() * 0.64);
    const r = 2.2 + Math.random() * 3.8;
    const angle = Math.random() * Math.PI * 2;

    this.ctx.save();
    this.ctx.translate(cx, cy);
    this.ctx.globalCompositeOperation = "destination-out";
    const grad = this.ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    grad.addColorStop(0, "rgba(0,0,0,0.55)");
    grad.addColorStop(0.65, "rgba(0,0,0,0.22)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.ellipse(0, 0, r * 1.15, r * 0.85, angle, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();

    this.eraseMask(cx, cy, r * 1.15, r * 0.85, angle);
  }

  /** Score once when the wash job is effectively done and the fade starts. */
  public claimCredit(): boolean {
    if (!this.rinsing || this.credited) return false;
    this.credited = true;
    return true;
  }

  public isRinsing(): boolean {
    return this.rinsing;
  }

  /**
   * Soft fade of whatever is left. Returns true once it can be removed.
   */
  public update(delta: number): boolean {
    if (!this.rinsing) return false;
    this.rinse = Math.min(1, this.rinse + delta / 1.6);

    const opacity = 1 - this.rinse;
    this.material.opacity = opacity;
    this.group.scale.setScalar(1 - this.rinse * 0.2);

    for (const clump of this.clumps) {
      if (!clump.mesh.visible) continue;
      const mat = clump.mesh.material as THREE.MeshStandardMaterial;
      mat.transparent = true;
      mat.opacity = opacity;
      clump.mesh.scale
        .copy(clump.baseScale)
        .multiplyScalar(Math.max(0.05, opacity));
    }

    return this.rinse >= 1;
  }

  private beginRinse(award: boolean): void {
    if (this.rinsing) return;
    this.rinsing = true;
    this.rinse = 0;
    // Rain-cleared mess doesn't count toward the player's score.
    if (!award) this.credited = true;
    this.material.transparent = true;
    this.refreshClumpVisibility();
  }

  public dispose(): void {
    this.scene.remove(this.group);
    this.splat.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
    for (const clump of this.clumps) {
      clump.mesh.geometry.dispose();
      (clump.mesh.material as THREE.Material).dispose();
    }
    this.clumps = [];
  }

  private resizeSplat(): void {
    this.splat.scale.set(this.half * 2, this.half * 2, 1);
  }

  private colour(): { r: number; g: number; b: number } {
    if (this.trodden) return TROD;
    if (this.kind === "fox") return FOX;
    if (this.kind === "gull") return GULL;
    return SWAN;
  }

  /** Draw (or redraw) the irregular pad. `fresh` clears first. */
  private paintSplat(fresh: boolean): void {
    const ctx = this.ctx;
    if (fresh) {
      ctx.clearRect(0, 0, TEX, TEX);
      this.mask.fill(0);
    }

    const col = this.colour();
    const blobs = 7 + this.layers * 3;
    const strength = Math.min(0.95, 0.45 + this.layers * 0.12);

    for (let i = 0; i < blobs; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.pow(Math.random(), 0.55) * TEX * 0.38;
      const x = TEX * 0.5 + Math.cos(ang) * rad;
      const y = TEX * 0.5 + Math.sin(ang) * rad;
      const rx = TEX * (0.08 + Math.random() * 0.16);
      const ry = TEX * (0.06 + Math.random() * 0.14);
      const rot = Math.random() * Math.PI;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(rx, ry));
      const a = strength * (0.55 + Math.random() * 0.45);
      g.addColorStop(0, `rgba(${col.r},${col.g},${col.b},${a})`);
      g.addColorStop(
        0.65,
        `rgba(${clamp(col.r - 20)},${clamp(col.g - 15)},${clamp(col.b - 20)},${a * 0.7})`,
      );
      g.addColorStop(1, `rgba(${col.r},${col.g},${col.b},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      this.stampMaskBlob(x, y, rx, ry, rot, a);
    }

    ctx.globalCompositeOperation = "source-atop";
    for (let i = 0; i < 40 + this.layers * 12; i++) {
      const x = TEX * 0.15 + Math.random() * TEX * 0.7;
      const y = TEX * 0.15 + Math.random() * TEX * 0.7;
      const s = 1 + Math.random() * 3;
      const shade = Math.random() > 0.5 ? 30 : -25;
      ctx.fillStyle = `rgba(${clamp(col.r + shade)},${clamp(col.g + shade)},${clamp(col.b + shade * 0.5)},${0.25 + Math.random() * 0.35})`;
      ctx.beginPath();
      ctx.arc(x, y, s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";

    this.texture.needsUpdate = true;
    this.recountDirt();
    if (fresh) this.dirtFull = Math.max(1, this.dirtSum);
    else this.dirtFull = Math.max(this.dirtFull, this.dirtSum);
  }

  private stampMaskBlob(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    rot: number,
    alpha: number,
  ): void {
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const pad = Math.ceil(Math.max(rx, ry));
    const add = Math.floor(alpha * 220);
    const x0 = Math.max(0, Math.floor(cx - pad));
    const x1 = Math.min(TEX - 1, Math.ceil(cx + pad));
    const y0 = Math.max(0, Math.floor(cy - pad));
    const y1 = Math.min(TEX - 1, Math.ceil(cy + pad));

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const lx = dx * cos + dy * sin;
        const ly = -dx * sin + dy * cos;
        const e = (lx * lx) / (rx * rx) + (ly * ly) / (ry * ry);
        if (e > 1) continue;
        const fall = 1 - e;
        const i = y * TEX + x;
        const next = Math.min(255, this.mask[i]! + Math.floor(add * fall));
        this.mask[i] = next;
      }
    }
  }

  private eraseMask(
    cx: number,
    cy: number,
    along: number,
    across: number,
    angle: number,
  ): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const pad = Math.ceil(along + across);
    const x0 = Math.max(0, Math.floor(cx - pad));
    const x1 = Math.min(TEX - 1, Math.ceil(cx + pad));
    const y0 = Math.max(0, Math.floor(cy - pad));
    const y1 = Math.min(TEX - 1, Math.ceil(cy + pad));

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const lx = dx * cos + dy * sin;
        const ly = -dx * sin + dy * cos;
        const e = (lx * lx) / (along * along) + (ly * ly) / (across * across);
        if (e > 1) continue;
        const cut = Math.floor((1 - e) * 255);
        const i = y * TEX + x;
        const prev = this.mask[i]!;
        if (prev === 0) continue;
        const next = Math.max(0, prev - cut);
        this.dirtSum -= prev - next;
        this.mask[i] = next;
      }
    }
  }

  private recountDirt(): void {
    let sum = 0;
    for (let i = 0; i < this.mask.length; i++) sum += this.mask[i]!;
    this.dirtSum = sum;
    if (this.dirtFull < 1) this.dirtFull = Math.max(1, sum);
  }

  private spawnClumps(count: number): void {
    const col = this.colour();
    for (let i = 0; i < count; i++) {
      const mesh = this.buildClumpMesh(col);
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.random() * this.half * 0.55;
      const lx = Math.cos(ang) * rad;
      const lz = Math.sin(ang) * rad;
      const height = 0.04 + Math.random() * 0.05 + this.layers * 0.012;
      mesh.position.set(lx, height * 0.45, lz);
      mesh.rotation.set(
        (Math.random() - 0.5) * 0.6,
        Math.random() * Math.PI,
        (Math.random() - 0.5) * 0.6,
      );
      const s = 0.7 + Math.random() * 0.55;
      mesh.scale.multiplyScalar(s);
      this.group.add(mesh);
      this.clumps.push({
        mesh,
        lx,
        lz,
        baseScale: mesh.scale.clone(),
      });
    }
  }

  /** Irregular lumpy blob — not a tidy cylinder. */
  private buildClumpMesh(col: {
    r: number;
    g: number;
    b: number;
  }): THREE.Mesh {
    const geo = new THREE.IcosahedronGeometry(0.09, 1);
    const pos = geo.attributes.position!;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const n =
        0.75 +
        0.35 * Math.sin(x * 18 + z * 11) +
        0.2 * Math.sin(y * 14 + x * 9);
      pos.setXYZ(i, x * n * 1.15, y * n * 0.55, z * n * 1.05);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(col.r / 255, col.g / 255, col.b / 255),
      roughness: 0.92,
      flatShading: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private refreshClumpVisibility(): void {
    for (const clump of this.clumps) {
      const u = Math.floor(((clump.lx / this.half) * 0.5 + 0.5) * TEX);
      const v = Math.floor(((clump.lz / this.half) * 0.5 + 0.5) * TEX);
      let alpha = 0;
      let samples = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const x = THREE.MathUtils.clamp(u + dx, 0, TEX - 1);
          const y = THREE.MathUtils.clamp(v + dy, 0, TEX - 1);
          alpha += this.mask[y * TEX + x]!;
          samples++;
        }
      }
      const avg = alpha / samples;
      const show = avg > 28;
      clump.mesh.visible = show;
      if (show) {
        const fade = THREE.MathUtils.clamp(avg / 140, 0.25, 1);
        clump.mesh.scale.copy(clump.baseScale).multiplyScalar(fade);
      }
    }
  }
}

function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}
