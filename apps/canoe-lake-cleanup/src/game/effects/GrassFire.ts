import * as THREE from "three";
import { distanceToShore, isInLake, isOnPath, PATH_OUTER } from "../world/lake";
import { insidePark } from "../world/fence";

const CELL = 1.9;
const MAX_PATCHES = 48;
const SPREAD_EVERY = 0.85;

interface FlameBit {
  mesh: THREE.Mesh;
  phase: number;
  lean: number;
}

interface Patch {
  x: number;
  z: number;
  /** 0–1 burn intensity; dies under the hose. */
  heat: number;
  /** Remaining grass — once spent the patch is ash and stays out. */
  fuel: number;
  ground: THREE.Mesh;
  glow: THREE.Mesh;
  flames: FlameBit[];
  age: number;
}

interface Ember {
  mesh: THREE.Mesh;
  life: number;
  rise: number;
  drift: number;
}

/**
 * Grass fire that kicks off beside a barbecue and creeps across the green.
 * Flames, scorched earth that won't catch again, hose and bucket water put it
 * out. Left alone it walks the lawn.
 */
export class GrassFire {
  private scene: THREE.Scene;
  private origin: THREE.Vector3;
  private patches: Patch[] = [];
  private embers: Ember[] = [];
  /** Grid cells that have burnt out — fire never comes back on them. */
  private burnt = new Set<string>();
  private ashes: THREE.Mesh[] = [];
  private spreadIn = SPREAD_EVERY;
  private emberAcc = 0;
  private cleared = false;
  private everLit = false;
  private gone = false;

  constructor(scene: THREE.Scene, at: THREE.Vector3) {
    this.scene = scene;
    this.origin = at.clone();
    this.ignite(at.x + 1.2, at.z + 0.4, 1);
    this.ignite(at.x - 0.6, at.z + 1.1, 0.85);
    this.ignite(at.x + 0.3, at.z - 1.3, 0.7);
  }

  public getPosition(): THREE.Vector3 {
    const hot = this.patches.filter((p) => p.heat > 0.1);
    if (hot.length === 0) return this.origin.clone();
    let x = 0;
    let z = 0;
    for (const patch of hot) {
      x += patch.x;
      z += patch.z;
    }
    return new THREE.Vector3(x / hot.length, 0, z / hot.length);
  }

  /** Hotspots for aim / job sensing / panic. */
  public patchPositions(): THREE.Vector3[] {
    return this.patches
      .filter((p) => p.heat > 0.08)
      .map((p) => new THREE.Vector3(p.x, 0.05, p.z));
  }

  public isBurning(): boolean {
    return this.patches.some((p) => p.heat > 0.05);
  }

  public isDone(): boolean {
    return this.gone;
  }

  /** True once when the last flame goes out, for the score. */
  public claimCleared(): boolean {
    if (!this.cleared || !this.everLit) return false;
    this.cleared = false;
    return true;
  }

  public burningCount(): number {
    return this.patches.filter((p) => p.heat > 0.15).length;
  }

  /** Nearest alight patch to a point, or null if nothing's going. */
  public nearestFlame(from: THREE.Vector3): THREE.Vector3 | null {
    let best: Patch | null = null;
    let bestDist = Infinity;
    for (const patch of this.patches) {
      if (patch.heat < 0.12) continue;
      const d = (patch.x - from.x) ** 2 + (patch.z - from.z) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = patch;
      }
    }
    return best ? new THREE.Vector3(best.x, 0.2, best.z) : null;
  }

  /** Hose or bucket water. Returns true if it hit something hot. */
  public douse(point: THREE.Vector3, strength = 0.55): boolean {
    let hit = false;
    for (const patch of this.patches) {
      const dx = patch.x - point.x;
      const dz = patch.z - point.z;
      if (dx * dx + dz * dz > 2.1 * 2.1) continue;
      patch.heat = Math.max(0, patch.heat - strength);
      hit = true;
      this.steamAt(point.x, point.z);
    }
    return hit;
  }

  public update(delta: number): void {
    if (this.gone) return;

    this.spreadIn -= delta;
    if (this.spreadIn <= 0 && this.patches.length < MAX_PATCHES) {
      this.spreadIn = SPREAD_EVERY * (0.7 + Math.random() * 0.6);
      this.trySpread();
    }

    this.emberAcc += delta;
    if (this.emberAcc > 0.1 && this.isBurning()) {
      this.emberAcc = 0;
      this.spitEmber();
    }

    for (let i = this.patches.length - 1; i >= 0; i--) {
      const patch = this.patches[i]!;
      patch.age += delta;

      if (patch.heat > 0.08) {
        // Fuel goes while it's alight — once spent, it's ash.
        patch.fuel = Math.max(0, patch.fuel - delta * (0.07 + patch.heat * 0.12));
        if (patch.fuel <= 0.02) {
          patch.heat = Math.max(0, patch.heat - delta * 1.8);
        }
      } else if (patch.heat < 0.35) {
        patch.heat = Math.max(0, patch.heat - delta * 0.05);
      }

      this.animatePatch(patch, delta);

      if (patch.heat <= 0.02) {
        this.finishPatch(patch, patch.fuel <= 0.08 || patch.age > 4);
        this.patches.splice(i, 1);
      }
    }

    this.updateEmbers(delta);

    if (this.everLit && this.patches.length === 0 && this.embers.length === 0) {
      this.cleared = true;
      this.gone = true;
    }
  }

  public dispose(): void {
    for (const patch of [...this.patches]) this.finishPatch(patch, false);
    this.patches = [];
    for (const ember of this.embers) {
      this.scene.remove(ember.mesh);
      ember.mesh.geometry.dispose();
      (ember.mesh.material as THREE.Material).dispose();
    }
    this.embers = [];
    for (const ash of this.ashes) {
      this.scene.remove(ash);
      ash.geometry.dispose();
      (ash.material as THREE.Material).dispose();
    }
    this.ashes = [];
    this.gone = true;
  }

  private animatePatch(patch: Patch, delta: number): void {
    const pulse = 0.85 + Math.sin(patch.age * 11 + patch.x) * 0.15;
    const groundSize = 0.85 + patch.heat * 0.5;
    patch.ground.scale.set(groundSize, 1, groundSize);
    patch.glow.scale.set(groundSize * 1.6, 1, groundSize * 1.6);
    patch.glow.visible = patch.heat > 0.1;
    (patch.glow.material as THREE.MeshBasicMaterial).opacity =
      0.12 + patch.heat * 0.4;

    for (const flame of patch.flames) {
      flame.phase += delta * (6 + patch.heat * 8);
      const flicker = 0.7 + Math.sin(flame.phase) * 0.25 + Math.sin(flame.phase * 2.3) * 0.1;
      const h = (0.55 + patch.heat * 1.4) * flicker * pulse;
      flame.mesh.scale.set(0.55 + patch.heat * 0.5, h, 0.55 + patch.heat * 0.5);
      flame.mesh.position.y = h * 0.45;
      flame.mesh.rotation.z = Math.sin(flame.phase * 0.7) * flame.lean;
      flame.mesh.rotation.x = Math.cos(flame.phase * 0.5) * flame.lean * 0.4;
      flame.mesh.visible = patch.heat > 0.08;
      const mat = flame.mesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.8 + patch.heat * 1.8 + Math.sin(flame.phase) * 0.3;
    }
  }

  private finishPatch(patch: Patch, leaveAsh: boolean): void {
    for (const flame of patch.flames) {
      this.scene.remove(flame.mesh);
      flame.mesh.geometry.dispose();
      (flame.mesh.material as THREE.Material).dispose();
    }
    patch.flames = [];
    this.scene.remove(patch.glow);
    patch.glow.geometry.dispose();
    (patch.glow.material as THREE.Material).dispose();

    if (leaveAsh) {
      this.burnt.add(this.cellKey(patch.x, patch.z));
      const mat = patch.ground.material as THREE.MeshStandardMaterial;
      mat.color.setHex(0x1a1612);
      mat.emissiveIntensity = 0;
      mat.opacity = 0.92;
      patch.ground.scale.set(1.05, 1, 1.05);
      this.ashes.push(patch.ground);
    } else {
      this.scene.remove(patch.ground);
      patch.ground.geometry.dispose();
      (patch.ground.material as THREE.Material).dispose();
    }
  }

  private trySpread(): void {
    const hot = this.patches.filter((p) => p.heat > 0.45 && p.fuel > 0.15);
    if (hot.length === 0) return;
    const from = hot[Math.floor(Math.random() * hot.length)]!;
    const dirs = [
      [CELL, 0],
      [-CELL, 0],
      [0, CELL],
      [0, -CELL],
      [CELL * 0.7, CELL * 0.7],
      [-CELL * 0.7, CELL * 0.7],
      [CELL * 0.7, -CELL * 0.7],
      [-CELL * 0.7, -CELL * 0.7],
    ];
    const [dx, dz] = dirs[Math.floor(Math.random() * dirs.length)]!;
    this.ignite(from.x + dx!, from.z + dz!, 0.55 + Math.random() * 0.35);
  }

  private ignite(x: number, z: number, heat: number): boolean {
    if (!this.canBurn(x, z)) return false;
    if (this.burnt.has(this.cellKey(x, z))) return false;
    if (this.patches.some((p) => Math.hypot(p.x - x, p.z - z) < CELL * 0.75)) {
      return false;
    }

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(0.95, 8),
      new THREE.MeshStandardMaterial({
        color: 0x3a2214,
        emissive: 0x4a1808,
        emissiveIntensity: 0.4,
        roughness: 1,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(x, 0.025, z);
    ground.renderOrder = 1;
    this.scene.add(ground);

    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(1.4, 8),
      new THREE.MeshBasicMaterial({
        color: 0xff7018,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(x, 0.03, z);
    glow.renderOrder = 2;
    this.scene.add(glow);

    const flames: FlameBit[] = [];
    const count = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const tall = 0.7 + Math.random() * 0.55;
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.28 + Math.random() * 0.12, tall, 5),
        new THREE.MeshStandardMaterial({
          color: i === 0 ? 0xff4a10 : 0xffc030,
          emissive: i === 0 ? 0xff3a00 : 0xffa010,
          emissiveIntensity: 1.6,
          roughness: 1,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
        }),
      );
      flame.position.set(
        x + (Math.random() - 0.5) * 0.45,
        tall * 0.45,
        z + (Math.random() - 0.5) * 0.45,
      );
      flame.renderOrder = 3;
      this.scene.add(flame);
      flames.push({
        mesh: flame,
        phase: Math.random() * Math.PI * 2,
        lean: 0.12 + Math.random() * 0.18,
      });
    }

    this.patches.push({
      x,
      z,
      heat,
      fuel: 0.85 + Math.random() * 0.2,
      ground,
      glow,
      flames,
      age: Math.random(),
    });
    this.everLit = true;
    return true;
  }

  private cellKey(x: number, z: number): string {
    return `${Math.round(x / CELL)},${Math.round(z / CELL)}`;
  }

  private canBurn(x: number, z: number): boolean {
    if (!insidePark(x, z)) return false;
    if (isInLake(x, z)) return false;
    if (isOnPath(x, z)) return false;
    if (distanceToShore(x, z) < PATH_OUTER + 1) return false;
    return true;
  }

  private spitEmber(): void {
    const hot = this.patches.filter((p) => p.heat > 0.3);
    if (hot.length === 0) return;
    const from = hot[Math.floor(Math.random() * hot.length)]!;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.04 + Math.random() * 0.04, 5, 4),
      new THREE.MeshBasicMaterial({ color: 0xffb040 }),
    );
    mesh.position.set(
      from.x + (Math.random() - 0.5) * 0.8,
      0.35 + Math.random() * 0.4,
      from.z + (Math.random() - 0.5) * 0.8,
    );
    this.scene.add(mesh);
    this.embers.push({
      mesh,
      life: 0.6 + Math.random() * 0.7,
      rise: 1.6 + Math.random() * 1.8,
      drift: (Math.random() - 0.5) * 0.9,
    });
  }

  private steamAt(x: number, z: number): void {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 6, 5),
      new THREE.MeshBasicMaterial({
        color: 0xd8e4ea,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    mesh.position.set(x, 0.3, z);
    this.scene.add(mesh);
    this.embers.push({
      mesh,
      life: 0.55,
      rise: 2.0,
      drift: (Math.random() - 0.5) * 0.4,
    });
  }

  private updateEmbers(delta: number): void {
    for (let i = this.embers.length - 1; i >= 0; i--) {
      const ember = this.embers[i]!;
      ember.life -= delta;
      ember.mesh.position.y += ember.rise * delta;
      ember.mesh.position.x += ember.drift * delta;
      const mat = ember.mesh.material as THREE.MeshBasicMaterial;
      if (mat.opacity !== undefined) {
        mat.opacity = Math.max(0, mat.opacity - delta * 0.9);
      }
      ember.mesh.scale.multiplyScalar(1 + delta * 0.8);
      if (ember.life > 0) continue;
      this.scene.remove(ember.mesh);
      ember.mesh.geometry.dispose();
      mat.dispose();
      this.embers.splice(i, 1);
    }
  }
}
