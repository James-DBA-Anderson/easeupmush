import * as THREE from "three";

/** What gets sprayed on the back of the toilet block round here. */
const TAGS = [
  "POMPEY",
  "PFC",
  "6.57",
  "OI OI",
  "SOUTHSEA",
  "PLAY UP POMPEY",
  "BAZ",
  "SKINT",
];
const INKS = ["#e0332f", "#2f6fd8", "#1f1f26", "#3f9f5f", "#8b3ad8"];

const TEX_W = 256;
const TEX_H = 128;
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
  private material: THREE.MeshBasicMaterial;
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

    this.wide = Math.min(2.6, wall.width * 0.6);
    this.high = Math.min(1.4, wall.height * 0.55);

    this.mask = new Uint8Array(TEX_W * TEX_H);
    this.canvas = document.createElement("canvas");
    this.canvas.width = TEX_W;
    this.canvas.height = TEX_H;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true })!;
    this.paintTag();

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(this.wide, this.high),
      this.material,
    );

    // Sat just proud of the brickwork, off-centre like the real thing.
    const out = new THREE.Vector3(Math.sin(wall.yaw), 0, Math.cos(wall.yaw));
    const along = new THREE.Vector3(out.z, 0, -out.x);
    const shift = (Math.random() - 0.5) * Math.max(0, wall.width - this.wide);
    this.mesh.position
      .set(wall.x, wall.y, wall.z)
      .addScaledVector(out, 0.06)
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
    const along = 14 + Math.random() * 10;
    const across = 2.8 + Math.random() * 1.6;

    this.ctx.save();
    this.ctx.translate(cx, cy);
    this.ctx.rotate(angle);
    this.ctx.globalCompositeOperation = "destination-out";

    // Partial alpha so each pass only thins the ink — streaks of faded paint.
    const grad = this.ctx.createRadialGradient(0, 0, 0, 0, 0, along);
    grad.addColorStop(0, "rgba(0,0,0,0.42)");
    grad.addColorStop(0.4, "rgba(0,0,0,0.28)");
    grad.addColorStop(0.75, "rgba(0,0,0,0.12)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.ellipse(0, 0, along, across, 0, 0, Math.PI * 2);
    this.ctx.fill();

    // Softer secondary pass so the channel looks worn, not stamped.
    this.ctx.fillStyle = "rgba(0,0,0,0.16)";
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

    this.eraseMask(cx, cy, along, across, angle, 0.38);
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
    const size = word.length > 8 ? 34 : 58;

    ctx.save();
    ctx.translate(TEX_W / 2, TEX_H * 0.55);
    ctx.rotate((Math.random() - 0.5) * 0.2);
    ctx.font = `bold ${size}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.lineWidth = 7;
    ctx.strokeStyle = ink;
    ctx.strokeText(word, 0, 0);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillText(word, 0, 0);

    ctx.beginPath();
    ctx.moveTo(-90, 34);
    ctx.bezierCurveTo(-30, 46, 30, 22, 92, 38);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 5;
    ctx.stroke();
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
