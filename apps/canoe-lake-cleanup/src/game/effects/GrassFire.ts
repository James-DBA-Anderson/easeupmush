import * as THREE from "three";
import { distanceToShore, isInLake, isOnPath, PATH_OUTER } from "../world/lake";
import { insidePark } from "../world/fence";
import { liveTrees, type LiveTree } from "../world/trees";

const CELL = 1.55;
const MAX_PATCHES = 90;
/** Seconds between spread attempts — lower = walks the green faster. */
const SPREAD_EVERY = 0.48;
/** How close a flame must sit to cook a trunk. */
const TREE_NEAR = 2.6;
/** Continuous exposure before the canopy goes up. */
const TREE_COOK = 15;
/** Ash disc radius — big enough to overlap neighbours with no grass showing through. */
const ASH_RADIUS = 1.28;

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

interface SmokePuff {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  rise: number;
  driftX: number;
  driftZ: number;
  /** Starting opacity — held through the climb, then faded up high. */
  peak: number;
  /** Soft-cull: fade out while still rising — never pop off opaque. */
  dying: boolean;
}

/** White rush when the hose hits hot grass. */
interface SteamPuff {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  rise: number;
  vx: number;
  vz: number;
}

interface TreeBlaze {
  tree: LiveTree;
  /** Seconds of hot patches sitting around the trunk. */
  cooked: number;
  ablaze: boolean;
  life: number;
  flames: FlameBit[];
  charred: boolean;
}

/**
 * Grass fire that kicks off beside a barbecue and creeps across the green.
 * Flames, scorched earth that won't catch again, hose and bucket water put it
 * out. Left alone it walks the lawn — and will take a tree if it sits under
 * one long enough.
 */
export class GrassFire {
  private scene: THREE.Scene;
  private origin: THREE.Vector3;
  private patches: Patch[] = [];
  private embers: Ember[] = [];
  private smoke: SmokePuff[] = [];
  private steam: SteamPuff[] = [];
  private trees: TreeBlaze[] = [];
  /** Grid cells that have burnt out — fire never comes back on them. */
  private burnt = new Set<string>();
  private ashes: THREE.Mesh[] = [];
  private spreadIn = SPREAD_EVERY;
  private emberAcc = 0;
  private smokeAcc = 0;
  private cleared = false;
  private everLit = false;
  private gone = false;

  constructor(scene: THREE.Scene, at: THREE.Vector3) {
    this.scene = scene;
    this.origin = at.clone();
    this.ignite(at.x + 1.2, at.z + 0.4, 1);
    this.ignite(at.x - 0.6, at.z + 1.1, 0.85);
    this.ignite(at.x + 0.3, at.z - 1.3, 0.7);
    this.ignite(at.x + 1.8, at.z - 0.5, 0.65);

    for (const tree of liveTrees()) {
      this.trees.push({
        tree,
        cooked: 0,
        ablaze: false,
        life: 0,
        flames: [],
        charred: false,
      });
    }
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
    const spots = this.patches
      .filter((p) => p.heat > 0.08)
      .map((p) => new THREE.Vector3(p.x, 0.05, p.z));
    for (const blaze of this.trees) {
      if (!blaze.ablaze) continue;
      spots.push(new THREE.Vector3(blaze.tree.x, 2.5, blaze.tree.z));
    }
    return spots;
  }

  public isBurning(): boolean {
    return (
      this.patches.some((p) => p.heat > 0.05) ||
      this.trees.some((t) => t.ablaze)
    );
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
    return (
      this.patches.filter((p) => p.heat > 0.15).length +
      this.trees.filter((t) => t.ablaze).length * 4
    );
  }

  /** Nearest alight patch to a point, or null if nothing's going. */
  public nearestFlame(from: THREE.Vector3): THREE.Vector3 | null {
    let best: THREE.Vector3 | null = null;
    let bestDist = Infinity;
    for (const patch of this.patches) {
      if (patch.heat < 0.12) continue;
      const d = (patch.x - from.x) ** 2 + (patch.z - from.z) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = new THREE.Vector3(patch.x, 0.2, patch.z);
      }
    }
    for (const blaze of this.trees) {
      if (!blaze.ablaze) continue;
      const d = (blaze.tree.x - from.x) ** 2 + (blaze.tree.z - from.z) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = new THREE.Vector3(blaze.tree.x, 3.5, blaze.tree.z);
      }
    }
    return best;
  }

  /** Hose or bucket water. Returns true if it hit something hot. */
  public douse(point: THREE.Vector3, strength = 0.55): boolean {
    let hit = false;
    let hotHits = 0;
    // Each fleck only knocks a little — needs a proper soak to kill a patch.
    const bite = strength * 0.085;
    for (const patch of this.patches) {
      const dx = patch.x - point.x;
      const dz = patch.z - point.z;
      if (dx * dx + dz * dz > 2.1 * 2.1) continue;
      if (patch.heat < 0.05) continue;
      patch.heat = Math.max(0, patch.heat - bite);
      this.paintPatchGround(patch);
      hit = true;
      hotHits++;
    }
    for (const blaze of this.trees) {
      if (!blaze.ablaze) continue;
      const dx = blaze.tree.x - point.x;
      const dz = blaze.tree.z - point.z;
      if (dx * dx + dz * dz > 4.5 * 4.5) continue;
      blaze.life = Math.max(0, blaze.life - strength * 0.5);
      hit = true;
      hotHits += 2;
      if (blaze.life <= 0.4) this.snuffTree(blaze);
    }
    if (hit) this.steamBurst(point.x, point.z, hotHits);
    return hit;
  }

  public update(delta: number): void {
    if (this.gone) return;

    this.spreadIn -= delta;
    if (this.spreadIn <= 0 && this.patches.length < MAX_PATCHES) {
      this.spreadIn = SPREAD_EVERY * (0.55 + Math.random() * 0.55);
      this.trySpread();
      // Second lick when it's already a serious blaze.
      if (this.burningCount() > 8 && Math.random() < 0.55) this.trySpread();
    }

    this.emberAcc += delta;
    if (this.emberAcc > 0.07 && this.isBurning()) {
      this.emberAcc = 0;
      this.spitEmber();
      if (Math.random() < 0.45) this.spitEmber();
    }

    this.emitSmoke(delta);

    for (let i = this.patches.length - 1; i >= 0; i--) {
      const patch = this.patches[i]!;
      patch.age += delta;

      if (patch.heat > 0.08) {
        // Fuel goes while it's alight — slower so the fire lasts longer.
        patch.fuel = Math.max(
          0,
          patch.fuel - delta * (0.038 + patch.heat * 0.07),
        );
        if (patch.fuel <= 0.02) {
          patch.heat = Math.max(0, patch.heat - delta * 1.4);
        }
      } else if (patch.heat < 0.35) {
        patch.heat = Math.max(0, patch.heat - delta * 0.04);
      }

      this.animatePatch(patch, delta);

      if (patch.heat <= 0.02) {
        // Always leave a scorch — hose or burn-out, the mark stays.
        this.finishPatch(patch, true);
        this.patches.splice(i, 1);
      }
    }

    this.updateTrees(delta);
    this.updateEmbers(delta);
    this.updateSmoke(delta);
    this.updateSteam(delta);

    if (
      this.everLit &&
      this.patches.length === 0 &&
      !this.trees.some((t) => t.ablaze) &&
      this.embers.length === 0 &&
      this.smoke.length === 0 &&
      this.steam.length === 0
    ) {
      this.cleared = true;
      this.gone = true;
    }
  }

  public dispose(): void {
    // Kill active flames, but leave scorched grass and charred trees in the scene
    // for the rest of the shift.
    for (const patch of [...this.patches]) this.finishPatch(patch, true);
    this.patches = [];
    for (const blaze of this.trees) {
      this.clearTreeFlames(blaze);
      if (blaze.ablaze || blaze.charred || blaze.cooked > 2) {
        this.charTreeMesh(blaze.tree.group, true);
        blaze.charred = true;
        blaze.ablaze = false;
      }
    }
    this.trees = [];
    for (const ember of this.embers) {
      this.scene.remove(ember.mesh);
      ember.mesh.geometry.dispose();
      (ember.mesh.material as THREE.Material).dispose();
    }
    this.embers = [];
    for (const puff of this.smoke) {
      this.scene.remove(puff.mesh);
      puff.mesh.geometry.dispose();
      (puff.mesh.material as THREE.Material).dispose();
    }
    this.smoke = [];
    for (const puff of this.steam) {
      this.scene.remove(puff.mesh);
      puff.mesh.geometry.dispose();
      (puff.mesh.material as THREE.Material).dispose();
    }
    this.steam = [];
    // Ashes stay parented to the scene — do not remove or dispose them.
    this.ashes = [];
    this.gone = true;
  }

  private updateTrees(delta: number): void {
    for (const blaze of this.trees) {
      if (blaze.ablaze) {
        blaze.life -= delta;
        this.animateTreeBlaze(blaze, delta);
        // Crown throws heavier smoke while it's up.
        if (Math.random() < delta * 28) this.treeSmoke(blaze);
        if (blaze.life <= 0) this.snuffTree(blaze);
        continue;
      }

      let near = false;
      for (const patch of this.patches) {
        if (patch.heat < 0.2) continue;
        const d = Math.hypot(patch.x - blaze.tree.x, patch.z - blaze.tree.z);
        if (d > TREE_NEAR) continue;
        near = true;
        break;
      }

      if (near) {
        blaze.cooked += delta;
        if (blaze.cooked >= TREE_COOK) this.igniteTree(blaze);
      } else {
        // Fire moved off — cool the trunk back down.
        blaze.cooked = Math.max(0, blaze.cooked - delta * 0.65);
      }
    }
  }

  private igniteTree(blaze: TreeBlaze): void {
    if (blaze.ablaze || blaze.charred) return;
    blaze.ablaze = true;
    blaze.life = 22 + Math.random() * 10;
    this.everLit = true;
    this.charTreeMesh(blaze.tree.group, false);

    const gx = blaze.tree.x;
    const gz = blaze.tree.z;
    const count = 8 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      const tall = 1.4 + Math.random() * 2.4;
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.35 + Math.random() * 0.35, tall, 5),
        new THREE.MeshStandardMaterial({
          color: i % 2 === 0 ? 0xff3a08 : 0xffb028,
          emissive: i % 2 === 0 ? 0xff2200 : 0xff8808,
          emissiveIntensity: 2.2,
          roughness: 1,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
        }),
      );
      const ang = Math.random() * Math.PI * 2;
      const rad = 0.4 + Math.random() * 1.8;
      flame.position.set(
        gx + Math.cos(ang) * rad,
        3.2 + Math.random() * 5.5,
        gz + Math.sin(ang) * rad,
      );
      flame.renderOrder = 4;
      this.scene.add(flame);
      blaze.flames.push({
        mesh: flame,
        phase: Math.random() * Math.PI * 2,
        lean: 0.1 + Math.random() * 0.22,
      });
    }

    // Kick a thick smoke plume as it goes up.
    for (let i = 0; i < 16; i++) this.treeSmoke(blaze);
  }

  private animateTreeBlaze(blaze: TreeBlaze, delta: number): void {
    const fade = Math.min(1, blaze.life / 8);
    for (const flame of blaze.flames) {
      flame.phase += delta * (5 + Math.random() * 4);
      const flicker =
        0.65 +
        Math.sin(flame.phase) * 0.28 +
        Math.sin(flame.phase * 2.1) * 0.12;
      const h = (1.2 + flicker * 1.6) * fade;
      flame.mesh.scale.set(0.7 + fade * 0.4, h, 0.7 + fade * 0.4);
      flame.mesh.rotation.z = Math.sin(flame.phase * 0.6) * flame.lean;
      flame.mesh.rotation.x = Math.cos(flame.phase * 0.45) * flame.lean * 0.5;
      const mat = flame.mesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 1.2 + fade * 1.6 + Math.sin(flame.phase) * 0.4;
      mat.opacity = 0.35 + fade * 0.55;
    }
  }

  private snuffTree(blaze: TreeBlaze): void {
    blaze.ablaze = false;
    blaze.life = 0;
    blaze.charred = true;
    this.clearTreeFlames(blaze);
    this.charTreeMesh(blaze.tree.group, true);
  }

  private clearTreeFlames(blaze: TreeBlaze): void {
    for (const flame of blaze.flames) {
      this.scene.remove(flame.mesh);
      flame.mesh.geometry.dispose();
      (flame.mesh.material as THREE.Material).dispose();
    }
    blaze.flames = [];
  }

  /** Clone shared leaf/bark materials and blacken them for the rest of the run. */
  private charTreeMesh(group: THREE.Group, cold = false): void {
    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const src = mesh.material as THREE.MeshStandardMaterial;
      if (!src || !src.isMeshStandardMaterial) return;
      if (!src.userData.fireChar) {
        const mat = src.clone();
        mat.userData.fireChar = true;
        mesh.material = mat;
      }
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.color.setHex(cold ? 0x14110e : 0x1a1410);
      mat.emissive.setHex(cold ? 0x000000 : 0x2a1008);
      mat.emissiveIntensity = cold ? 0 : 0.35;
      mat.roughness = 1;
      mat.needsUpdate = true;
    });
  }

  /**
   * Steady emission from the flames — never banks up and dumps, and never
   * stalls at the particle cap (oldest high puffs make room).
   */
  private emitSmoke(delta: number): void {
    if (!this.isBurning()) {
      this.smokeAcc = 0;
      return;
    }
    const hot = this.patches.filter((p) => p.heat > 0.1).length;
    const crowns = this.trees.filter((t) => t.ablaze).length;
    // ~puffs per second — scales with blaze size.
    const rate = 22 + hot * 1.4 + crowns * 10;
    this.smokeAcc += delta * rate;
    // Cap the backlog so a hitch can't release a big burst later.
    this.smokeAcc = Math.min(this.smokeAcc, 3);
    while (this.smokeAcc >= 1) {
      this.smokeAcc -= 1;
      this.billowSmoke();
    }
  }

  /** Soft room-making — high puffs fade out; never delete opaque smoke. */
  private makeSmokeRoom(): void {
    // Drop only what's already nearly invisible.
    while (this.smoke.length >= 420) {
      let faintest = -1;
      let least = 1;
      for (let i = 0; i < this.smoke.length; i++) {
        const op = (this.smoke[i]!.mesh.material as THREE.MeshBasicMaterial)
          .opacity;
        if (op >= least) continue;
        least = op;
        faintest = i;
      }
      if (faintest < 0 || least > 0.07) break;
      this.dropSmokeAt(faintest);
    }

    // Still crowded — start a soft fade on the highest solid puff.
    if (this.smoke.length < 340) return;
    let highest = -1;
    let top = -Infinity;
    for (let i = 0; i < this.smoke.length; i++) {
      const puff = this.smoke[i]!;
      if (puff.dying) continue;
      const y = puff.mesh.position.y;
      if (y <= top) continue;
      top = y;
      highest = i;
    }
    if (highest < 0) return;
    const puff = this.smoke[highest]!;
    puff.dying = true;
    // Still climbs while fading — about a second of soft dissolve.
    puff.life = Math.min(puff.life, 1.15);
  }

  private dropSmokeAt(index: number): void {
    const puff = this.smoke[index];
    if (!puff) return;
    this.scene.remove(puff.mesh);
    puff.mesh.geometry.dispose();
    (puff.mesh.material as THREE.Material).dispose();
    this.smoke.splice(index, 1);
  }

  private treeSmoke(blaze: TreeBlaze): void {
    this.makeSmokeRoom();
    const heat = Math.min(1, blaze.life / 12);
    const peak = 0.38 + heat * 0.28;
    const greys = [0x1c1a18, 0x2a2824, 0x36332e, 0x444039] as const;
    const mat = new THREE.MeshBasicMaterial({
      color: greys[Math.floor(Math.random() * greys.length)]!,
      transparent: true,
      opacity: peak,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.42 + heat * 0.45, 7, 6),
      mat,
    );
    mesh.scale.set(1, 1.55, 1);
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.random() * 0.9;
    mesh.position.set(
      blaze.tree.x + Math.cos(ang) * rad,
      4.2 + Math.random() * 1.2,
      blaze.tree.z + Math.sin(ang) * rad,
    );
    this.scene.add(mesh);
    const life = 16 + Math.random() * 7 + heat * 3;
    this.smoke.push({
      mesh,
      life,
      maxLife: life,
      rise: 2.6 + Math.random() * 1.6,
      driftX: (Math.random() - 0.5) * 0.7,
      driftZ: (Math.random() - 0.5) * 0.7,
      peak,
      dying: false,
    });
  }

  private animatePatch(patch: Patch, delta: number): void {
    const pulse = 0.85 + Math.sin(patch.age * 11 + patch.x) * 0.15;
    // Keep the burnt disc wide so neighbouring scorches always meet.
    const groundSize = 1.05 + patch.heat * 0.35;
    patch.ground.scale.set(groundSize, 1, groundSize);
    patch.glow.scale.set(groundSize * 1.45, 1, groundSize * 1.45);
    patch.glow.visible = patch.heat > 0.06;
    (patch.glow.material as THREE.MeshBasicMaterial).opacity =
      0.06 + patch.heat * 0.42;
    this.paintPatchGround(patch);

    for (const flame of patch.flames) {
      flame.phase += delta * (5 + patch.heat * 7);
      const flicker =
        0.7 +
        Math.sin(flame.phase) * 0.25 +
        Math.sin(flame.phase * 2.3) * 0.1;
      // Flames shrink as the hose knocks the heat back.
      const h = (0.2 + patch.heat * 1.55) * flicker * pulse;
      const w = 0.35 + patch.heat * 0.65;
      flame.mesh.scale.set(w, h, w);
      flame.mesh.position.y = h * 0.45;
      flame.mesh.rotation.z = Math.sin(flame.phase * 0.7) * flame.lean;
      flame.mesh.rotation.x = Math.cos(flame.phase * 0.5) * flame.lean * 0.4;
      flame.mesh.visible = patch.heat > 0.05;
      const mat = flame.mesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity =
        0.35 + patch.heat * 2.0 + Math.sin(flame.phase) * 0.25;
      mat.opacity = 0.25 + patch.heat * 0.7;
    }
  }

  /** Ground goes from glowing coal to black ash as heat falls. */
  private paintPatchGround(patch: Patch): void {
    const mat = patch.ground.material as THREE.MeshStandardMaterial;
    const t = 1 - THREE.MathUtils.clamp(patch.heat, 0, 1);
    mat.color.setRGB(
      THREE.MathUtils.lerp(0.28, 0.1, t),
      THREE.MathUtils.lerp(0.14, 0.086, t),
      THREE.MathUtils.lerp(0.08, 0.07, t),
    );
    mat.emissive.setHex(patch.heat > 0.15 ? 0x4a1808 : 0x000000);
    mat.emissiveIntensity = patch.heat * 0.55;
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
      mat.emissive.setHex(0x000000);
      mat.emissiveIntensity = 0;
      mat.opacity = 0.97;
      mat.transparent = true;
      // Overlap neighbours so no green shows between scorches.
      patch.ground.scale.set(1.45, 1, 1.45);
      patch.ground.position.y = 0.02;
      this.ashes.push(patch.ground);
    } else {
      this.scene.remove(patch.ground);
      patch.ground.geometry.dispose();
      (patch.ground.material as THREE.Material).dispose();
    }
  }

  private trySpread(): void {
    const hot = this.patches.filter((p) => p.heat > 0.4 && p.fuel > 0.12);
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
    this.ignite(from.x + dx!, from.z + dz!, 0.6 + Math.random() * 0.35);
  }

  private ignite(x: number, z: number, heat: number): boolean {
    if (!this.canBurn(x, z)) return false;
    if (this.burnt.has(this.cellKey(x, z))) return false;
    if (this.patches.some((p) => Math.hypot(p.x - x, p.z - z) < CELL * 0.85)) {
      return false;
    }

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(ASH_RADIUS, 10),
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
      new THREE.CircleGeometry(ASH_RADIUS * 1.35, 10),
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
    const count = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const tall = 0.65 + Math.random() * 0.7;
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.22 + Math.random() * 0.16, tall, 5),
        new THREE.MeshStandardMaterial({
          color: i % 3 === 0 ? 0xff4a10 : 0xffc030,
          emissive: i % 3 === 0 ? 0xff3a00 : 0xffa010,
          emissiveIntensity: 1.6,
          roughness: 1,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
        }),
      );
      flame.position.set(
        x + (Math.random() - 0.5) * 0.7,
        tall * 0.45,
        z + (Math.random() - 0.5) * 0.7,
      );
      flame.renderOrder = 3;
      this.scene.add(flame);
      flames.push({
        mesh: flame,
        phase: Math.random() * Math.PI * 2,
        lean: 0.12 + Math.random() * 0.2,
      });
    }

    this.patches.push({
      x,
      z,
      heat,
      fuel: 1.55 + Math.random() * 0.45,
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
    const crowns = this.trees.filter((t) => t.ablaze);
    if (hot.length === 0 && crowns.length === 0) return;

    let x: number;
    let z: number;
    let y = 0.35;
    if (crowns.length > 0 && (hot.length === 0 || Math.random() < 0.4)) {
      const blaze = crowns[Math.floor(Math.random() * crowns.length)]!;
      x = blaze.tree.x + (Math.random() - 0.5) * 2;
      z = blaze.tree.z + (Math.random() - 0.5) * 2;
      y = 4 + Math.random() * 3;
    } else {
      const from = hot[Math.floor(Math.random() * hot.length)]!;
      x = from.x + (Math.random() - 0.5) * 0.8;
      z = from.z + (Math.random() - 0.5) * 0.8;
      y = 0.35 + Math.random() * 0.4;
    }

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.04 + Math.random() * 0.04, 5, 4),
      new THREE.MeshBasicMaterial({ color: 0xffb040 }),
    );
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.embers.push({
      mesh,
      life: 0.6 + Math.random() * 0.7,
      rise: 1.6 + Math.random() * 1.8,
      drift: (Math.random() - 0.5) * 0.9,
    });
  }

  /** Fresh smoke always leaves the fire low — keeps the stream unbroken. */
  private billowSmoke(): void {
    const hot = this.patches.filter((p) => p.heat > 0.1);
    if (hot.length === 0) return;
    this.makeSmokeRoom();
    const from = hot[Math.floor(Math.random() * hot.length)]!;
    const heat = from.heat;
    const peak = 0.3 + heat * 0.28;
    const greys = [0x2a2824, 0x36332e, 0x45423c, 0x524f48, 0x1e1c1a] as const;
    const mat = new THREE.MeshBasicMaterial({
      color: greys[Math.floor(Math.random() * greys.length)]!,
      transparent: true,
      opacity: peak,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.36 + heat * 0.26, 7, 6),
      mat,
    );
    mesh.scale.set(1.05, 1.65, 1.05);
    // Always born at the flames — never mid-column (that caused empty gaps).
    mesh.position.set(
      from.x + (Math.random() - 0.5) * 0.75,
      0.35 + Math.random() * 0.5,
      from.z + (Math.random() - 0.5) * 0.75,
    );
    this.scene.add(mesh);
    const life = 15 + Math.random() * 7 + heat * 3;
    this.smoke.push({
      mesh,
      life,
      maxLife: life,
      rise: 2.4 + Math.random() * 1.6 + heat * 0.45,
      driftX: (Math.random() - 0.5) * 0.55,
      driftZ: (Math.random() - 0.5) * 0.55,
      peak,
      dying: false,
    });
  }

  /** Fat white kick when water hits hot patches — denser the more you soak. */
  private steamBurst(x: number, z: number, heatHits: number): void {
    const count = Math.min(18, 8 + heatHits * 2 + Math.floor(Math.random() * 4));
    const greys = [0xf2f6f8, 0xe4eef2, 0xd0dde4, 0xc4d2da] as const;
    for (let i = 0; i < count; i++) {
      if (this.steam.length > 120) break;
      const mat = new THREE.MeshBasicMaterial({
        color: greys[Math.floor(Math.random() * greys.length)]!,
        transparent: true,
        opacity: 0.5 + Math.random() * 0.25,
        depthWrite: false,
      });
      const size = 0.22 + Math.random() * 0.28;
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 7, 6), mat);
      const ang = Math.random() * Math.PI * 2;
      const kick = 0.8 + Math.random() * 1.8;
      mesh.position.set(
        x + Math.cos(ang) * Math.random() * 0.45,
        0.25 + Math.random() * 0.35,
        z + Math.sin(ang) * Math.random() * 0.45,
      );
      mesh.scale.set(1, 1.15 + Math.random() * 0.35, 1);
      this.scene.add(mesh);
      const life = 0.7 + Math.random() * 0.85;
      this.steam.push({
        mesh,
        life,
        maxLife: life,
        rise: 2.4 + Math.random() * 2.8,
        vx: Math.cos(ang) * kick,
        vz: Math.sin(ang) * kick,
      });
    }
  }

  private updateSteam(delta: number): void {
    for (let i = this.steam.length - 1; i >= 0; i--) {
      const puff = this.steam[i]!;
      puff.life -= delta;
      puff.mesh.position.y += puff.rise * delta;
      puff.mesh.position.x += puff.vx * delta;
      puff.mesh.position.z += puff.vz * delta;
      // Billows out fast, then hangs.
      puff.rise *= 1 - delta * 0.55;
      puff.vx *= 1 - delta * 1.1;
      puff.vz *= 1 - delta * 1.1;
      const spent = 1 - Math.max(0, puff.life) / puff.maxLife;
      const grow = 1 + spent * 2.4;
      puff.mesh.scale.set(grow * 1.15, grow * 1.45, grow * 1.15);
      const mat = puff.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, (1 - spent) * (1 - spent) * 0.65);
      if (puff.life > 0 && mat.opacity > 0.02) continue;
      this.scene.remove(puff.mesh);
      puff.mesh.geometry.dispose();
      mat.dispose();
      this.steam.splice(i, 1);
    }
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

  private updateSmoke(delta: number): void {
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const puff = this.smoke[i]!;
      puff.life -= delta;
      puff.mesh.position.y += puff.rise * delta;
      puff.mesh.position.x += puff.driftX * delta;
      puff.mesh.position.z += puff.driftZ * delta;
      // Keep climbing into the sky — barely ease off.
      puff.rise *= 1 - delta * 0.006;
      const y = puff.mesh.position.y;
      const spent = 1 - Math.max(0, puff.life) / puff.maxLife;
      const grow = 1 + Math.min(1.2, spent) * 1.1;
      puff.mesh.scale.set(grow * 1.05, grow * 1.7, grow * 1.05);
      const mat = puff.mesh.material as THREE.MeshBasicMaterial;

      // If life runs out before it's high enough, soften away instead of popping.
      if (puff.life <= 0 && !puff.dying && y < 24) {
        puff.dying = true;
        puff.life = 1.2;
      }

      // Solid until high up; dissolve gradually ~22m → 42m.
      let fade = 1;
      if (y > 22) fade = Math.max(0, 1 - (y - 22) / 20);
      if (puff.dying) {
        fade *= Math.max(0, puff.life / 1.2);
      }

      mat.opacity = Math.max(0, fade * puff.peak);

      if (mat.opacity > 0.03 && (puff.life > 0 || y < 30)) continue;
      this.scene.remove(puff.mesh);
      puff.mesh.geometry.dispose();
      mat.dispose();
      this.smoke.splice(i, 1);
    }
  }
}
