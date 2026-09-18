import * as THREE from "three";
import { PATH_Y } from "../world/lake";
import { groundHeight } from "../world/terrain";

export type DropKind = "swan" | "fox" | "gull";

const TEX = 128;
/** How close a new deposit must be to stack onto an existing pile. */
export const MERGE_RADIUS = 1.75;
/** Soft upper bound on separate piles (layers stack instead of multiplying). */
export const MAX_PILES = 28;
/** Layers before the pile rises into a walkable lump. */
const MOUND_FROM = 4;
const MAX_LAYERS = 22;

const SWAN = { r: 185, g: 200, b: 170 };
const GULL = { r: 236, g: 240, b: 228 };
const FOX = { r: 74, g: 58, b: 40 };
const TROD = { r: 170, g: 168, b: 140 };

interface Clump {
  mesh: THREE.Mesh;
  lx: number;
  lz: number;
  baseScale: THREE.Vector3;
  /** How much solid lump is left (1 = whole, ~0 = gone). */
  mass: number;
  /** 0 fresh → 1 softened; needs a few hits before it will come free. */
  soft: number;
  /** Knocked free — sliding along the paving under the jet. */
  loose: boolean;
  velX: number;
  velZ: number;
  /** Seconds left before a loose bit must fall apart on its own. */
  slipLife: number;
}

/** Below this, a bit is a crumb that may melt-fade; above it must split first. */
const CRUMB_MASS = 0.16;

/**
 * A pile of bird (or fox) mess on the paving. The washable part is a canvas
 * splat — the jet carves streaks through it like a power-washer — with a few
 * lumpy clumps sat on top. Fresh deposits on the same spot stack as layers,
 * and a thick enough stack rises into a lump you can walk over and bite
 * footprints through.
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
  /** Raised mound mesh once layers are thick enough to walk over. */
  private mound: THREE.Mesh | null = null;
  /** Hose wear on the raised heap — melts it down as you work it. */
  private moundWear = 0;
  private kind: DropKind;
  private layers = 1;
  private trodden = false;
  /** World-space half-width of the splat plane. */
  private half = 0.55;
  /** Overnight tip heaps can be squashed / spread without changing layer count. */
  private heightScale = 1;
  private widthScale = 1;
  private scrubs = 0;
  /** Once most of the dirt is gone, the remains rinse away over a second or two. */
  private rinsing = false;
  private rinse = 0;
  private credited = false;
  private rainAcc = 0;
  private rainDabs = 0;
  /** Gap between player footprints so steps don't stamp every frame. */
  private stepCool = 0;

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
    this.group.position.set(
      position.x,
      PATH_Y + groundHeight(position.x, position.z),
      position.z,
    );
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

  /**
   * How high the walkable surface sits above path level. Thin pads are a smear;
   * stacked piles rise into a lump.
   */
  public moundHeight(): number {
    if (this.rinsing) return 0;
    const left = this.dirtSum / Math.max(1, this.dirtFull);
    if (left < 0.12) return 0;
    const base =
      this.layers < MOUND_FROM
        ? 0.01 + this.layers * 0.006
        : 0.1 + (this.layers - MOUND_FROM) * 0.06;
    return base * left * this.heightScale * (1 - this.moundWear * 0.85);
  }

  /**
   * Squash / spread a seeded heap — overnight tip piles sit lower and wider
   * without dropping the wash job count.
   */
  public reshape(heightScale: number, widthScale: number): void {
    this.heightScale = heightScale;
    this.widthScale = widthScale;
    this.half = Math.min(2.8, (0.55 + this.layers * 0.1) * this.widthScale);
    this.resizeSplat();
    this.refreshClumpVisibility();
    this.rebuildMound();
  }

  /** Thick enough to climb over and stamp deep prints into. */
  public isMound(): boolean {
    return (
      this.layers >= MOUND_FROM &&
      !this.rinsing &&
      this.moundWear < 0.72 &&
      this.dirtSum > this.dirtFull * 0.15
    );
  }

  public coversFoot(x: number, z: number): boolean {
    const dx = x - this.group.position.x;
    const dz = z - this.group.position.z;
    const r = this.half * (this.isMound() ? 0.92 : 0.7);
    return dx * dx + dz * dz <= r * r;
  }

  public covers(point: THREE.Vector3): boolean {
    const dx = point.x - this.group.position.x;
    const dz = point.z - this.group.position.z;
    // Hit must land on the pad — no generous splash halo.
    const r = this.half * 0.98;
    if (dx * dx + dz * dz <= r * r) return true;

    // Loose lumps that have slid off the pad are still fair game.
    for (const clump of this.clumps) {
      if (!clump.loose || !clump.mesh.visible) continue;
      const reach = this.clumpReach(clump) + 0.12;
      const ox = dx - clump.lx;
      const oz = dz - clump.lz;
      if (ox * ox + oz * oz <= reach * reach) return true;
    }
    return false;
  }

  /**
   * How hard the lance kicks back off this pile. Flat pads are ~1; raised
   * heaps and solid clumps throw a lot more dirty spray.
   */
  public bounceScale(point: THREE.Vector3): number {
    let scale = 1;
    const h = this.moundHeight();
    if (h > 0.035) scale += Math.min(1.15, h * 2.4);

    const lx = point.x - this.group.position.x;
    const lz = point.z - this.group.position.z;
    let lump = 0;
    for (const clump of this.clumps) {
      if (!clump.mesh.visible || clump.mass < 0.08) continue;
      const reach = this.clumpReach(clump) + 0.22;
      const gap = Math.hypot(lx - clump.lx, lz - clump.lz);
      if (gap > reach) continue;
      const tall = Math.max(clump.baseScale.y, 0.35) * Math.max(0.2, clump.mass);
      lump = Math.max(
        lump,
        0.45 + clump.mass * 0.7 + tall * 0.55 + (clump.loose ? 0.25 : 0),
      );
    }
    return Math.min(2.9, scale + lump);
  }

  /** Another deposit on this pile — thicker pad, more lumps. */
  public addLayer(kind: DropKind = this.kind): void {
    this.layers = Math.min(MAX_LAYERS, this.layers + 1);
    if (kind === "fox") this.kind = "fox";
    else if (this.kind === "gull" && kind === "swan") this.kind = "swan";

    this.half = Math.min(2.8, (0.55 + this.layers * 0.1) * this.widthScale);
    this.paintSplat(false);
    this.spawnClumps(kind === "fox" ? 1 : 2 + Math.floor(Math.random() * 2));
    this.resizeSplat();
    this.refreshClumpVisibility();
    this.rebuildMound();
  }

  /**
   * Someone has stood in it. Thin pads smear once; thick lumps take a deep
   * footprint bite instead of vanishing into a pancake.
   */
  public tread(at?: THREE.Vector3, yaw = 0): void {
    if (this.isMound()) {
      const p = at ?? this.group.position;
      this.biteFootprint(p.x, p.z, yaw, true);
      return;
    }
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

  /**
   * Stamp a shoe into the pad. Deep bites (thick lumps / hard steps) carve
   * further and crush the mound underfoot.
   */
  public biteFootprint(
    worldX: number,
    worldZ: number,
    yaw: number,
    deep = false,
  ): boolean {
    if (this.rinsing) return false;
    const lx = worldX - this.group.position.x;
    const lz = worldZ - this.group.position.z;
    if (lx * lx + lz * lz > this.half * this.half) return false;

    const u = (lx / this.half) * 0.5 + 0.5;
    const v = (lz / this.half) * 0.5 + 0.5;
    const cx = u * TEX;
    const cy = v * TEX;
    const cut = deep ? 0.95 : 0.72;

    // Sole + heel in the direction of travel.
    this.stampShoe(cx, cy, yaw, cut, deep ? 1.25 : 1);

    // Crush clumps under the boot.
    for (const clump of this.clumps) {
      const dx = clump.lx - lx;
      const dz = clump.lz - lz;
      if (dx * dx + dz * dz > 0.12 * 0.12) continue;
      clump.baseScale.y *= deep ? 0.35 : 0.55;
      clump.mesh.position.y *= deep ? 0.4 : 0.65;
      clump.mesh.scale.copy(clump.baseScale);
      const mat = clump.mesh.material as THREE.MeshStandardMaterial;
      mat.color.lerp(new THREE.Color(TROD.r / 255, TROD.g / 255, TROD.b / 255), 0.55);
    }

    this.texture.needsUpdate = true;
    this.refreshClumpVisibility();
    this.rebuildMound();
    this.resizeSplat();
    this.tryBeginRinse(0.2, false);
    return true;
  }

  /** Player step spacing while wading through a lump. */
  public tickStep(delta: number): void {
    if (this.stepCool > 0) this.stepCool = Math.max(0, this.stepCool - delta);
  }

  public canStepPrint(): boolean {
    return this.stepCool <= 0;
  }

  public markStepped(): void {
    this.stepCool = 0.32;
  }

  private stampShoe(
    cx: number,
    cy: number,
    yaw: number,
    strength: number,
    size: number,
  ): void {
    const soleAlong = 11 * size;
    const soleAcross = 6.5 * size;
    const heelAlong = 5.5 * size;
    const heelAcross = 6.2 * size;
    // Canvas V grows with +Z of the pad; yaw 0 faces −Z in world, so flip.
    const angle = -yaw;
    const stamps = [
      { ox: 0, oy: -4 * size, rx: soleAlong, ry: soleAcross },
      { ox: 0, oy: 7 * size, rx: heelAlong, ry: heelAcross },
    ];

    this.ctx.save();
    this.ctx.translate(cx, cy);
    this.ctx.rotate(angle);
    this.ctx.globalCompositeOperation = "destination-out";
    for (const s of stamps) {
      const grad = this.ctx.createRadialGradient(s.ox, s.oy, 0, s.ox, s.oy, s.rx);
      grad.addColorStop(0, `rgba(0,0,0,${strength})`);
      grad.addColorStop(0.55, `rgba(0,0,0,${strength * 0.72})`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      this.ctx.fillStyle = grad;
      this.ctx.beginPath();
      this.ctx.ellipse(s.ox, s.oy, s.rx, s.ry, 0, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.restore();

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (const s of stamps) {
      const wx = cx + s.ox * cos - s.oy * sin;
      const wy = cy + s.ox * sin + s.oy * cos;
      this.eraseMask(wx, wy, s.rx, s.ry, angle, strength);
    }
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
    const onPad = lx * lx + lz * lz <= this.half * this.half;
    if (!onPad && !this.nearLoose(lx, lz)) return;

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

    // Outside the pad we're only chasing a slid lump — melt it, no canvas carve.
    if (!onPad) {
      this.hoseLumps(lx, lz, dx, dz);
      return;
    }

    const u = (lx / this.half) * 0.5 + 0.5;
    const v = (lz / this.half) * 0.5 + 0.5;
    const cx = u * TEX;
    const cy = v * TEX;

    // Wide lance streak — reads as a proper wash path through the mess.
    const along = 32 + Math.random() * 12;
    const across = 9.2 + Math.random() * 3.6;
    const angle = Math.atan2(dz, dx);

    this.ctx.save();
    this.ctx.translate(cx, cy);
    this.ctx.rotate(angle);
    this.ctx.globalCompositeOperation = "destination-out";

    const grad = this.ctx.createRadialGradient(0, 0, 0, 0, 0, along);
    grad.addColorStop(0, "rgba(0,0,0,1)");
    grad.addColorStop(0.3, "rgba(0,0,0,0.92)");
    grad.addColorStop(0.7, "rgba(0,0,0,0.55)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.ellipse(0, 0, along, across, 0, 0, Math.PI * 2);
    this.ctx.fill();

    // Soft edges either side so the channel looks washed, not stamped.
    this.ctx.fillStyle = "rgba(0,0,0,0.62)";
    this.ctx.beginPath();
    this.ctx.ellipse(
      along * 0.08,
      0,
      along * 0.75,
      across * 0.75,
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
    this.hoseLumps(lx, lz, dx, dz);
    if (this.scrubs % 2 === 0) this.refreshClumpVisibility();

    // Most of the pad is clear — let the rest soak away rather than popping off.
    // Don't rinse while solid lumps are still waiting to be broken down.
    this.tryBeginRinse(0.28, true);
  }

  private nearLoose(lx: number, lz: number): boolean {
    for (const clump of this.clumps) {
      if (!clump.loose || !clump.mesh.visible) continue;
      const reach = this.clumpReach(clump) + 0.14;
      const ox = lx - clump.lx;
      const oz = lz - clump.lz;
      if (ox * ox + oz * oz <= reach * reach) return true;
    }
    return false;
  }

  /**
   * Melt / undercut the 3D lumps under the jet. Hits soften and sag them
   * first; they slop into smaller seated bits, and only then can a base shot
   * send a softened chunk skidding.
   */
  private hoseLumps(lx: number, lz: number, dx: number, dz: number): void {
    if (this.mound && this.layers >= MOUND_FROM && !this.rinsing) {
      this.moundWear = Math.min(
        0.95,
        this.moundWear + 0.012 + Math.random() * 0.01,
      );
      const rim = this.half * 0.5;
      const dist = Math.hypot(lx, lz);
      // Outer skirt — peel a soft chunk that stays put, then can be worked.
      if (
        dist > rim * 0.45 &&
        dist < rim * 1.2 &&
        this.moundWear > 0.2 &&
        Math.random() < 0.14
      ) {
        this.peelChunk(lx, lz, dx, dz, 0.4 + Math.random() * 0.25);
      }
      this.rebuildMound();
      this.resizeSplat();
    }

    const hit = new THREE.Vector2(lx, lz);
    for (let i = this.clumps.length - 1; i >= 0; i--) {
      const clump = this.clumps[i]!;
      if (!clump.mesh.visible || clump.mass <= 0.035) continue;

      const reach = this.clumpReach(clump);
      const gap = hit.distanceTo(new THREE.Vector2(clump.lx, clump.lz));
      if (gap > reach + 0.16) continue;

      // Already sliding — finish breaking it into smaller bits.
      if (clump.loose) {
        this.meltClump(clump, 0.1 + Math.random() * 0.08, dx, dz, true);
        continue;
      }

      // Soften / sag / split in place.
      this.meltClump(clump, 0.055 + Math.random() * 0.045, dx, dz, false);

      // Only a well-softened lump comes free from a base undercut.
      const onBase = gap > reach * 0.5;
      if (
        onBase &&
        clump.soft > 0.45 &&
        clump.mass > 0.28 &&
        Math.random() < 0.22
      ) {
        this.dislodgeClump(clump, dx, dz);
      }
    }

    this.pruneClumps();
  }

  private clumpReach(clump: Clump): number {
    return Math.max(0.05, Math.max(clump.baseScale.x, clump.baseScale.z) * 0.1);
  }

  private dislodgeClump(clump: Clump, dx: number, dz: number): void {
    clump.loose = true;
    clump.slipLife = 1.1 + Math.random() * 0.9;
    const kick = 0.7 + Math.random() * 0.9;
    const side = (Math.random() - 0.5) * 0.55;
    clump.velX = dx * kick - dz * side;
    clump.velZ = dz * kick + dx * side;
    clump.mesh.position.y = 0.03 + Math.random() * 0.015;
    clump.mesh.rotation.x += (Math.random() - 0.5) * 0.45;
    clump.mesh.rotation.z += (Math.random() - 0.5) * 0.45;
  }

  private meltClump(
    clump: Clump,
    amount: number,
    dx: number,
    dz: number,
    hard: boolean,
  ): void {
    // Proper lumps never melt to nothing — they break into smaller bits first.
    if (clump.mass > CRUMB_MASS && clump.mass - amount <= CRUMB_MASS) {
      this.breakIntoCrumbs(clump, dx, dz, hard);
      return;
    }

    clump.soft = Math.min(1, clump.soft + amount * (hard ? 1.6 : 1.1));

    if (clump.mass <= CRUMB_MASS) {
      // Crumb: shrink and fade under the lance.
      clump.mass = Math.max(0, clump.mass - amount * 0.85);
      const keep = Math.max(0.08, clump.mass / CRUMB_MASS);
      clump.baseScale.y *= Math.max(0.3, 1 - amount * 1.1);
      clump.baseScale.x *= 1 + amount * 0.3;
      clump.baseScale.z *= 1 + amount * 0.3;
      clump.mesh.scale.copy(clump.baseScale).multiplyScalar(keep);
      clump.mesh.position.y = Math.max(0.015, clump.mesh.position.y * 0.92);
      const mat = clump.mesh.material as THREE.MeshStandardMaterial;
      mat.transparent = true;
      mat.opacity = Math.max(0.05, keep);
      mat.depthWrite = keep > 0.35;
      return;
    }

    clump.mass = Math.max(CRUMB_MASS + 0.02, clump.mass - amount);
    const keep = Math.max(0.22, Math.min(1, clump.mass));
    const shrink = Math.max(0.82, 1 - amount * (hard ? 0.45 : 0.28));
    clump.baseScale.multiplyScalar(shrink);
    clump.baseScale.y *= Math.max(0.5, 1 - amount * 0.7);
    clump.baseScale.x *= 1 + amount * 0.2;
    clump.baseScale.z *= 1 + amount * 0.2;
    clump.mesh.scale.copy(clump.baseScale).multiplyScalar(keep);
    clump.mesh.position.y = Math.max(
      0.02,
      clump.mesh.position.y * (1 - amount * 0.45),
    );
    clump.mesh.rotation.x += (Math.random() - 0.5) * amount * 1.1;
    clump.mesh.rotation.z += (Math.random() - 0.5) * amount * 1.1;

    clump.lx += dx * amount * (hard ? 0.12 : 0.04);
    clump.lz += dz * amount * (hard ? 0.12 : 0.04);
    clump.mesh.position.x = clump.lx;
    clump.mesh.position.z = clump.lz;

    // Softened lumps slop into smaller seated bits.
    if (
      clump.mass > CRUMB_MASS * 1.6 &&
      clump.soft > 0.18 &&
      Math.random() < (hard ? 0.45 : 0.28)
    ) {
      this.splitClump(clump, dx, dz, hard);
    }
  }

  /** Force a lump into several crumbs — nothing big just vanishes. */
  private breakIntoCrumbs(
    clump: Clump,
    dx: number,
    dz: number,
    hard: boolean,
  ): void {
    const bits = 2 + Math.floor(Math.random() * 2);
    for (let b = 0; b < bits - 1 && clump.mass > CRUMB_MASS * 1.1; b++) {
      if (this.clumps.length >= 30) this.dropTiniestCrumb();
      if (this.clumps.length >= 30) break;
      const take = Math.min(
        clump.mass * (0.3 + Math.random() * 0.2),
        clump.mass - CRUMB_MASS * 0.85,
      );
      if (take < CRUMB_MASS * 0.55) break;
      this.splitClump(clump, dx, dz, hard);
    }
    clump.mass = Math.min(clump.mass, CRUMB_MASS * (0.85 + Math.random() * 0.3));
    clump.soft = 1;
    clump.baseScale.multiplyScalar(0.55 + Math.random() * 0.2);
    clump.mesh.scale
      .copy(clump.baseScale)
      .multiplyScalar(Math.max(0.2, clump.mass / CRUMB_MASS));
    clump.mesh.position.y = Math.max(0.02, clump.mesh.position.y * 0.7);
  }

  private splitClump(
    clump: Clump,
    dx: number,
    dz: number,
    hard = false,
  ): void {
    if (this.clumps.length >= 30) {
      this.dropTiniestCrumb();
      if (this.clumps.length >= 30) return;
    }
    const childMass = Math.min(
      clump.mass * (0.3 + Math.random() * 0.16),
      Math.max(CRUMB_MASS * 0.7, clump.mass - CRUMB_MASS * 0.9),
    );
    if (childMass < CRUMB_MASS * 0.5) return;
    clump.mass -= childMass;
    clump.baseScale.multiplyScalar(0.84);
    clump.mesh.scale
      .copy(clump.baseScale)
      .multiplyScalar(Math.max(0.2, clump.mass));

    const side = Math.random() > 0.5 ? 1 : -1;
    const ox = -dz * side * (0.05 + Math.random() * 0.09) + dx * 0.03;
    const oz = dx * side * (0.05 + Math.random() * 0.09) + dz * 0.03;
    const child = this.makeClump(
      clump.lx + ox,
      clump.lz + oz,
      childMass,
      clump.baseScale.clone().multiplyScalar(0.65 + Math.random() * 0.2),
    );
    child.soft = Math.min(1, clump.soft * 0.75 + 0.15);
    if (clump.loose && (hard || Math.random() < 0.4)) {
      child.loose = true;
      child.slipLife = 0.8 + Math.random() * 0.7;
      child.velX = dx * (0.3 + Math.random() * 0.35) + ox * 2;
      child.velZ = dz * (0.3 + Math.random() * 0.35) + oz * 2;
      child.mesh.position.y = 0.028;
    } else {
      child.mesh.position.y = Math.max(0.022, clump.mesh.position.y * 0.85);
    }
  }

  private dropTiniestCrumb(): void {
    let worst = -1;
    let least = Infinity;
    for (let i = 0; i < this.clumps.length; i++) {
      const c = this.clumps[i]!;
      if (c.mass > CRUMB_MASS) continue;
      if (c.mass >= least) continue;
      least = c.mass;
      worst = i;
    }
    if (worst < 0) return;
    const clump = this.clumps[worst]!;
    this.group.remove(clump.mesh);
    clump.mesh.geometry.dispose();
    (clump.mesh.material as THREE.Material).dispose();
    this.clumps.splice(worst, 1);
  }

  /** Soft chunk peeled from the raised heap — sits and waits to be worked. */
  private peelChunk(
    lx: number,
    lz: number,
    dx: number,
    dz: number,
    mass: number,
  ): void {
    if (this.clumps.length >= 30) this.dropTiniestCrumb();
    if (this.clumps.length >= 30) return;
    const s = 0.5 + mass * 0.45;
    const clump = this.makeClump(
      lx + dx * 0.08,
      lz + dz * 0.08,
      Math.max(CRUMB_MASS * 1.4, mass),
      new THREE.Vector3(s, s * 0.65, s),
    );
    clump.soft = 0.25 + Math.random() * 0.2;
    clump.mesh.position.y = 0.04 + mass * 0.05;
  }

  private makeClump(
    lx: number,
    lz: number,
    mass: number,
    scale: THREE.Vector3,
  ): Clump {
    const mesh = this.buildClumpMesh(this.colour());
    mesh.position.set(lx, 0.04 + mass * 0.06, lz);
    mesh.rotation.set(
      (Math.random() - 0.5) * 0.8,
      Math.random() * Math.PI,
      (Math.random() - 0.5) * 0.8,
    );
    mesh.scale.copy(scale);
    this.group.add(mesh);
    const clump: Clump = {
      mesh,
      lx,
      lz,
      baseScale: scale.clone(),
      mass,
      soft: 0,
      loose: false,
      velX: 0,
      velZ: 0,
      slipLife: 0,
    };
    this.clumps.push(clump);
    return clump;
  }

  private pruneClumps(): void {
    for (let i = this.clumps.length - 1; i >= 0; i--) {
      const clump = this.clumps[i]!;
      // Only fully melted crumbs may disappear.
      if (clump.mass > 0.035) continue;
      this.group.remove(clump.mesh);
      clump.mesh.geometry.dispose();
      (clump.mesh.material as THREE.Material).dispose();
      this.clumps.splice(i, 1);
    }
  }

  /** Slide / dissolve lumps that have been knocked free of the heap. */
  private updateLoose(delta: number): void {
    let smeared = false;
    for (let i = this.clumps.length - 1; i >= 0; i--) {
      const clump = this.clumps[i]!;
      if (!clump.loose) continue;

      clump.slipLife -= delta;

      if (clump.mass > CRUMB_MASS) {
        // Still a lump — break down, don't evaporate.
        clump.soft = Math.min(1, clump.soft + delta * 0.35);
        if (clump.slipLife < 0.2 || clump.soft > 0.55) {
          this.breakIntoCrumbs(
            clump,
            clump.velX || 0.2,
            clump.velZ || 0,
            true,
          );
        } else {
          clump.baseScale.y *= Math.max(0.4, 1 - delta * 0.5);
          clump.baseScale.x *= 1 + delta * 0.25;
          clump.baseScale.z *= 1 + delta * 0.25;
          clump.mesh.scale
            .copy(clump.baseScale)
            .multiplyScalar(Math.max(0.25, clump.mass));
        }
      } else {
        // Crumb: slow melt-fade.
        const decay = clump.slipLife < 0 ? 0.35 : 0.12;
        clump.mass = Math.max(0, clump.mass - delta * decay);
        clump.baseScale.y *= Math.max(0.25, 1 - delta * 0.7);
        clump.baseScale.x *= 1 + delta * 0.3;
        clump.baseScale.z *= 1 + delta * 0.3;
        const keep = Math.max(0.08, clump.mass / CRUMB_MASS);
        clump.mesh.scale.copy(clump.baseScale).multiplyScalar(keep);
        const mat = clump.mesh.material as THREE.MeshStandardMaterial;
        mat.transparent = true;
        mat.opacity = Math.max(0.05, keep);
        mat.depthWrite = keep > 0.35;
      }

      const speed = Math.hypot(clump.velX, clump.velZ);
      if (speed > 0.02) {
        const prevX = clump.lx;
        const prevZ = clump.lz;
        clump.lx += clump.velX * delta;
        clump.lz += clump.velZ * delta;
        clump.mesh.position.x = clump.lx;
        clump.mesh.position.z = clump.lz;
        clump.mesh.position.y = 0.025 + Math.min(0.04, speed * 0.02);
        clump.mesh.rotation.x += clump.velZ * delta * 1.6;
        clump.mesh.rotation.z -= clump.velX * delta * 1.6;
        if (Math.hypot(clump.lx, clump.lz) <= this.half * 0.95) {
          this.smearTrail(prevX, prevZ, clump.lx, clump.lz, clump.mass);
          smeared = true;
        }

        const drag = Math.max(0, 1 - 2.6 * delta);
        clump.velX *= drag;
        clump.velZ *= drag;
      } else {
        clump.mesh.position.y = 0.02;
      }
    }

    if (smeared) {
      this.recountDirt();
      this.texture.needsUpdate = true;
    }
    this.pruneClumps();
  }

  /** Thin smear left as a loose lump skids across the paving. */
  private smearTrail(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    mass: number,
  ): void {
    const col = this.colour();
    const steps = 2 + Math.floor(mass * 3);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const lx = x0 + (x1 - x0) * t;
      const lz = z0 + (z1 - z0) * t;
      const u = (lx / this.half) * 0.5 + 0.5;
      const v = (lz / this.half) * 0.5 + 0.5;
      if (u < 0.02 || u > 0.98 || v < 0.02 || v > 0.98) continue;
      const cx = u * TEX;
      const cy = v * TEX;
      const r = 2.2 + mass * 4.5;
      const a = 0.22 + mass * 0.35;

      this.ctx.save();
      this.ctx.globalCompositeOperation = "source-over";
      const g = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(${col.r},${col.g},${col.b},${a})`);
      g.addColorStop(1, `rgba(${col.r},${col.g},${col.b},0)`);
      this.ctx.fillStyle = g;
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, r, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();

      this.stampMaskBlob(cx, cy, r, r * 0.85, 0, a * 0.7);
    }
    this.dirtFull = Math.max(this.dirtFull, this.dirtSum);
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
    this.tryBeginRinse(0.2, false);
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

  /** Still worth sending the yellow arrow to — not a washed-out pad. */
  public hasVisibleMess(): boolean {
    if (this.rinsing) return false;
    if (this.clumpMassLeft() > 0.08) return true;
    return this.dirtSum > this.dirtFull * 0.14;
  }

  /**
   * Where the arrow should land. Once the pad is mostly clear, chase the
   * remaining lumps instead of the empty centre.
   */
  public arrowSpot(): { x: number; z: number } | null {
    if (!this.hasVisibleMess()) return null;
    const left = this.dirtSum / Math.max(1, this.dirtFull);
    const lump = this.heaviestClump();
    if (lump && (left < 0.4 || lump.mass > 0.2)) {
      return {
        x: this.group.position.x + lump.lx,
        z: this.group.position.z + lump.lz,
      };
    }
    return { x: this.group.position.x, z: this.group.position.z };
  }

  private clumpMassLeft(): number {
    let sum = 0;
    for (const clump of this.clumps) {
      if (!clump.mesh.visible || clump.mass < 0.05) continue;
      sum += clump.mass;
    }
    return sum;
  }

  private heaviestClump(): Clump | null {
    let best: Clump | null = null;
    for (const clump of this.clumps) {
      if (!clump.mesh.visible || clump.mass < 0.06) continue;
      if (!best || clump.mass > best.mass) best = clump;
    }
    return best;
  }

  /**
   * Soft fade of whatever is left. Returns true once it can be removed.
   */
  public update(delta: number): boolean {
    this.updateLoose(delta);
    if (!this.rinsing) {
      // Crumbs finished melting off a washed pad — soak away the empty mark.
      // Only score if the player worked it; rain-cleared pads stay uncredited.
      this.tryBeginRinse(0.28, this.scrubs > 0);
      return false;
    }
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
        .multiplyScalar(Math.max(0.05, opacity * clump.mass));
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
    if (this.mound) this.mound.visible = false;
    this.refreshClumpVisibility();
  }

  /** Fade out once the pad is thin and no solid lumps are left to work. */
  private tryBeginRinse(frac: number, award: boolean): void {
    if (this.dirtSum > this.dirtFull * frac) return;
    if (this.clumpMassLeft() >= 0.12) return;
    this.beginRinse(award);
  }

  public dispose(): void {
    this.scene.remove(this.group);
    this.splat.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
    if (this.mound) {
      this.mound.geometry.dispose();
      (this.mound.material as THREE.Material).dispose();
      this.mound = null;
    }
    for (const clump of this.clumps) {
      clump.mesh.geometry.dispose();
      (clump.mesh.material as THREE.Material).dispose();
    }
    this.clumps = [];
  }

  private resizeSplat(): void {
    this.splat.scale.set(this.half * 2, this.half * 2, 1);
    this.splat.position.y = 0.004 + this.moundHeight() * 0.15;
  }

  /** Grow / refresh the walkable lump once layers are stacked thick enough. */
  private rebuildMound(): void {
    if (this.layers < MOUND_FROM) {
      if (this.mound) {
        this.group.remove(this.mound);
        this.mound.geometry.dispose();
        (this.mound.material as THREE.Material).dispose();
        this.mound = null;
      }
      return;
    }

    const col = this.colour();
    const h = this.moundHeight();
    const radius = this.half * 0.55;

    if (!this.mound) {
      const geo = new THREE.SphereGeometry(1, 10, 8);
      const pos = geo.attributes.position!;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        // Squash into a dung heap — taller in the middle, lumpy rim.
        const n =
          0.85 +
          0.2 * Math.sin(x * 7 + z * 5) +
          0.12 * Math.sin(y * 9 + x * 4);
        const lift = Math.max(0, y);
        pos.setXYZ(i, x * n * 1.05, lift * n * 1.35, z * n * 1.05);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
      this.mound = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(col.r / 255, col.g / 255, col.b / 255),
          roughness: 0.95,
          flatShading: true,
        }),
      );
      this.mound.castShadow = true;
      this.mound.receiveShadow = true;
      this.group.add(this.mound);
    }

    const mat = this.mound.material as THREE.MeshStandardMaterial;
    mat.color.setRGB(col.r / 255, col.g / 255, col.b / 255);
    this.mound.scale.set(radius, Math.max(0.06, h), radius);
    this.mound.position.set(0, h * 0.45, 0);
    this.mound.visible = !this.rinsing && h > 0.04;
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
    strength = 1,
  ): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const pad = Math.ceil(along + across);
    const x0 = Math.max(0, Math.floor(cx - pad));
    const x1 = Math.min(TEX - 1, Math.ceil(cx + pad));
    const y0 = Math.max(0, Math.floor(cy - pad));
    const y1 = Math.min(TEX - 1, Math.ceil(cy + pad));
    const power = THREE.MathUtils.clamp(strength, 0.15, 1);

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const lx = dx * cos + dy * sin;
        const ly = -dx * sin + dy * cos;
        const e = (lx * lx) / (along * along) + (ly * ly) / (across * across);
        if (e > 1) continue;
        const cut = Math.floor((1 - e) * 255 * power);
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
      const height = 0.04 + Math.random() * 0.05 + this.layers * 0.018;
      mesh.position.set(lx, height * 0.45 + this.moundHeight() * 0.35, lz);
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
        mass: 0.75 + Math.random() * 0.35 + this.layers * 0.02,
        soft: 0,
        loose: false,
        velX: 0,
        velZ: 0,
        slipLife: 0,
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
      // Lumps stay until broken down and melted — washing the pad under them
      // softens them so they start slopping apart, it doesn't pop them off.
      if (clump.mass <= 0.04) {
        clump.mesh.visible = false;
        continue;
      }
      clump.mesh.visible = true;

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
      if (!clump.loose && avg < 28) {
        clump.soft = Math.max(clump.soft, 0.4);
      }

      const fade = clump.loose
        ? Math.max(0.15, clump.mass)
        : THREE.MathUtils.clamp(
            (avg > 20 ? avg / 140 : 0.55) * Math.max(0.25, clump.mass),
            0.2,
            1,
          );
      clump.mesh.scale.copy(clump.baseScale).multiplyScalar(fade);
    }
  }
}

function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}
