import * as THREE from "three";
import {
  getRoadGraph,
  ROAD_WIDTH,
  type RoadGraph,
} from "../world/buildings";
import { groundHeight } from "../world/terrain";
import { isInLake, WATER_Y } from "../world/lake";

/** UK left lane offset. */
const LANE = ROAD_WIDTH * 0.22;
/** Esplanade race speed — proper boy-racer pace. */
const RACE_SPEED = 26;
/** How many mid-esplanade blasts before one of them bottles it. */
const PASSES_BEFORE_CRASH = 4;
/** South stretch of road[0] in the authored level (Eastney Esplanade). */
const ESPLANADE_FROM = 8;
const ESPLANADE_TO = 16;

const BODY_PAINTS = [0x1a1c22, 0xc8ccd2, 0x6b1020, 0x0e3a5c] as const;
const GLOWS = [0xff2ec8, 0x22e0ff, 0xb8ff2a, 0xff6a1a] as const;

interface SteamPuff {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  rise: number;
  driftX: number;
  driftZ: number;
}

interface RacerCar {
  id: number;
  group: THREE.Group;
  materials: THREE.Material[];
  index: number;
  dir: 1 | -1;
  progress: number;
  speed: number;
  /** Last signed side of the mid-esplanade X for pass counting. */
  midSide: number;
  fading: boolean;
  fade: number;
  crashed: boolean;
}

let nextRacerId = 50_000;

export type RacerPhase = "racing" | "crashing" | "steaming" | "done";

/**
 * Night job: Skylines with underglow thrashing the esplanade, then one of them
 * loses it and ends up in the lake under a cloud of steam.
 */
export class BoyRacers {
  private scene: THREE.Scene;
  private graph: RoadGraph;
  private cars: RacerCar[] = [];
  private steam: SteamPuff[] = [];
  private phase: RacerPhase = "racing";
  private passes = 0;
  private lastPassAt = -10;
  private crashCar: RacerCar | null = null;
  private crashVel = new THREE.Vector3();
  private crashAim = new THREE.Vector3();
  private wet = false;
  private steamAcc = 0;
  private steamFor = 0;
  private sink = 0;
  private scored = false;
  private roarQueued = false;
  private crashQueued = false;
  private gone = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    const graph = getRoadGraph();
    if (!graph || !graph.roads[0] || graph.roads[0]!.length <= ESPLANADE_TO) {
      this.phase = "done";
      this.gone = true;
      this.graph = graph ?? { roads: [], linksAt: () => [] };
      return;
    }
    this.graph = graph;

    // Two Skylines, staggered, racing the same stretch.
    this.cars.push(this.spawnCar(ESPLANADE_FROM, 1, 0));
    this.cars.push(this.spawnCar(ESPLANADE_FROM + 1, 1, 1.8));
  }

  public getPhase(): RacerPhase {
    return this.phase;
  }

  public isActive(): boolean {
    return !this.gone && this.phase !== "done";
  }

  public isDone(): boolean {
    return this.gone || this.phase === "done";
  }

  /** True once when the wreck hits the water — for the score. */
  public claimCrash(): boolean {
    if (!this.scored) return false;
    this.scored = false;
    return true;
  }

  /** One-shot: a pack just blasted past mid-esplanade. */
  public claimRoar(): boolean {
    if (!this.roarQueued) return false;
    this.roarQueued = false;
    return true;
  }

  /** One-shot: car entered the lake. */
  public claimWaterHit(): boolean {
    if (!this.crashQueued) return false;
    this.crashQueued = false;
    return true;
  }

  public getPositions(): THREE.Vector3[] {
    return this.cars
      .filter((c) => !c.fading || c.crashed)
      .map((c) => c.group.position.clone());
  }

  /** Arrow / pin — lead racer, then the wreck. */
  public aimSpot(): { x: number; z: number } | null {
    if (this.phase === "done") return null;
    if (this.crashCar) {
      const at = this.crashCar.group.position;
      return { x: at.x, z: at.z };
    }
    const live = this.cars.filter((c) => !c.fading);
    if (live.length === 0) return null;
    const at = live[0]!.group.position;
    return { x: at.x, z: at.z };
  }

  /** Loud traffic cues for ParkAudio. */
  public trafficCues(): {
    id: number;
    x: number;
    y: number;
    z: number;
    speed: number;
    music: boolean;
    roar: boolean;
  }[] {
    return this.cars
      .filter((c) => !c.fading && !c.crashed)
      .map((c) => {
        const at = c.group.position;
        return {
          id: c.id,
          x: at.x,
          y: at.y,
          z: at.z,
          speed: c.speed,
          music: false,
          roar: true,
        };
      });
  }

  public update(delta: number): void {
    if (this.gone) return;

    if (this.phase === "racing") {
      this.updateRacing(delta);
      if (this.passes >= PASSES_BEFORE_CRASH) this.beginCrash();
    } else if (this.phase === "crashing" || this.phase === "steaming") {
      this.updateCrash(delta);
    }

    this.updateFades(delta);
    this.updateSteam(delta);

    if (this.phase === "steaming" && this.steamFor <= 0 && this.steam.length === 0) {
      this.phase = "done";
    }
  }

  public dispose(): void {
    for (const car of this.cars) {
      // Wreck stays in the lake for the rest of the shift.
      if (car.crashed) continue;
      this.scene.remove(car.group);
      for (const mat of car.materials) mat.dispose();
    }
    this.cars = this.cars.filter((c) => c.crashed);
    for (const puff of this.steam) {
      this.scene.remove(puff.mesh);
      puff.mesh.geometry.dispose();
      (puff.mesh.material as THREE.Material).dispose();
    }
    this.steam = [];
    this.gone = true;
  }

  private spawnCar(index: number, dir: 1 | -1, gap: number): RacerCar {
    const car: RacerCar = {
      id: nextRacerId++,
      group: this.buildSkyline(this.cars.length),
      materials: [],
      index,
      dir,
      progress: Math.min(0.35, gap * 0.08),
      speed: RACE_SPEED + Math.random() * 3,
      midSide: 0,
      fading: false,
      fade: 0,
      crashed: false,
    };
    // Collect materials from the group for fade.
    car.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as THREE.Material;
      if (mat) car.materials.push(mat);
    });
    this.placeOnRoad(car, car.progress);
    car.midSide = Math.sign(car.group.position.x) || 1;
    this.scene.add(car.group);
    return car;
  }

  private updateRacing(delta: number): void {
    for (const car of this.cars) {
      if (car.fading || car.crashed) continue;
      this.advanceOnEsplanade(car, delta);

      const side = Math.sign(car.group.position.x) || car.midSide;
      if (side !== 0 && side !== car.midSide) {
        car.midSide = side;
        const now = performance.now() / 1000;
        // Whole pack crossing together counts as one pass, not one per car.
        if (now - this.lastPassAt > 1.8) {
          this.lastPassAt = now;
          this.passes += 1;
          this.roarQueued = true;
        }
      }
    }
  }

  private advanceOnEsplanade(car: RacerCar, delta: number): void {
    const pts = this.graph.roads[0]!;
    let next = car.index + car.dir;
    if (next < ESPLANADE_FROM || next > ESPLANADE_TO) {
      car.dir = car.dir === 1 ? -1 : 1;
      next = car.index + car.dir;
      car.progress = 0;
    }
    const a = pts[car.index]!;
    const b = pts[next]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    car.progress += (car.speed * delta) / len;
    if (car.progress >= 1) {
      car.progress = 0;
      car.index = next;
      return;
    }
    this.placeOnRoad(car, car.progress);
  }

  private placeOnRoad(car: RacerCar, t: number): void {
    const pts = this.graph.roads[0]!;
    const next = THREE.MathUtils.clamp(
      car.index + car.dir,
      ESPLANADE_FROM,
      ESPLANADE_TO,
    );
    const a = pts[car.index]!;
    const b = pts[next] ?? a;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    const fx = b.x - a.x;
    const fz = b.z - a.z;
    const len = Math.hypot(fx, fz) || 1;
    const ux = fx / len;
    const uz = fz / len;
    const lx = -uz;
    const lz = ux;
    const px = x + lx * LANE;
    const pz = z + lz * LANE;
    car.group.position.set(px, groundHeight(px, pz) + 0.02, pz);
    car.group.rotation.y = Math.atan2(-uz, ux);
    car.group.rotation.z = 0;
    car.group.rotation.x = 0;
  }

  private beginCrash(): void {
    const live = this.cars.filter((c) => !c.fading);
    if (live.length === 0) {
      this.phase = "done";
      return;
    }
    this.crashCar = live[Math.floor(Math.random() * live.length)]!;
    this.crashCar.crashed = true;
    this.phase = "crashing";

    // Others peel off and fade.
    for (const car of this.cars) {
      if (car === this.crashCar) continue;
      car.fading = true;
    }

    const at = this.crashCar.group.position;
    // Drive north into the lake from the esplanade.
    this.crashAim.set(
      THREE.MathUtils.clamp(at.x + (Math.random() - 0.5) * 18, -50, 55),
      0,
      -62 + Math.random() * 10,
    );
    const dx = this.crashAim.x - at.x;
    const dz = this.crashAim.z - at.z;
    const len = Math.hypot(dx, dz) || 1;
    this.crashVel.set((dx / len) * 32, 0, (dz / len) * 32);
    this.crashCar.group.rotation.y = Math.atan2(-dz / len, dx / len);
  }

  private updateCrash(delta: number): void {
    const car = this.crashCar;
    if (!car) return;

    if (this.phase === "crashing") {
      car.group.position.x += this.crashVel.x * delta;
      car.group.position.z += this.crashVel.z * delta;
      car.group.position.y = groundHeight(
        car.group.position.x,
        car.group.position.z,
      ) + 0.02;
      // Nose-down wobble as it leaves the road.
      car.group.rotation.x = Math.min(0.35, car.group.rotation.x + delta * 0.4);
      car.group.rotation.z += Math.sin(performance.now() * 0.02) * delta * 0.4;

      if (!this.wet && isInLake(car.group.position.x, car.group.position.z)) {
        this.wet = true;
        this.phase = "steaming";
        this.crashQueued = true;
        this.scored = true;
        this.steamFor = 9;
        this.crashVel.multiplyScalar(0.25);
        this.burstSteam(28);
      }
    }

    if (this.phase === "steaming") {
      this.steamFor -= delta;
      this.steamAcc += delta;
      while (this.steamAcc >= 0.04 && this.steamFor > 0) {
        this.steamAcc -= 0.04;
        this.burstSteam(3);
      }

      this.sink = Math.min(1, this.sink + delta * 0.18);
      car.group.position.y = THREE.MathUtils.lerp(
        WATER_Y + 0.35,
        WATER_Y - 0.55,
        this.sink * this.sink,
      );
      car.group.rotation.z = this.sink * 0.55;
      car.group.rotation.x = 0.15 + this.sink * 0.5;
      car.group.position.x += this.crashVel.x * delta * (1 - this.sink);
      car.group.position.z += this.crashVel.z * delta * (1 - this.sink);

      if (this.steamFor <= 0 && this.steam.length === 0) {
        this.phase = "done";
      }
    }
  }

  private updateFades(delta: number): void {
    for (const car of this.cars) {
      if (!car.fading || car.crashed) continue;
      car.fade += delta / 1.6;
      const a = Math.max(0, 1 - car.fade);
      for (const mat of car.materials) {
        if ("opacity" in mat) {
          (mat as THREE.MeshStandardMaterial).opacity = a;
          (mat as THREE.MeshStandardMaterial).transparent = true;
          (mat as THREE.MeshStandardMaterial).depthWrite = a > 0.2;
        }
      }
      if (car.fade >= 1) {
        this.scene.remove(car.group);
      }
    }
  }

  private burstSteam(count: number): void {
    const car = this.crashCar;
    if (!car) return;
    const at = car.group.position;
    for (let i = 0; i < count; i++) {
      if (this.steam.length > 160) break;
      const mat = new THREE.MeshBasicMaterial({
        color: 0xe8eef2,
        transparent: true,
        opacity: 0.55 + Math.random() * 0.25,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.35 + Math.random() * 0.55, 7, 6),
        mat,
      );
      mesh.position.set(
        at.x + (Math.random() - 0.5) * 2.4,
        Math.max(WATER_Y + 0.2, at.y) + Math.random() * 0.6,
        at.z + (Math.random() - 0.5) * 2.4,
      );
      mesh.scale.set(1, 1.4, 1);
      this.scene.add(mesh);
      const life = 2.2 + Math.random() * 2.4;
      this.steam.push({
        mesh,
        life,
        maxLife: life,
        rise: 2.2 + Math.random() * 2.2,
        driftX: (Math.random() - 0.5) * 1.2,
        driftZ: (Math.random() - 0.5) * 1.2,
      });
    }
  }

  private updateSteam(delta: number): void {
    for (let i = this.steam.length - 1; i >= 0; i--) {
      const puff = this.steam[i]!;
      puff.life -= delta;
      puff.mesh.position.y += puff.rise * delta;
      puff.mesh.position.x += puff.driftX * delta;
      puff.mesh.position.z += puff.driftZ * delta;
      puff.rise *= 1 - delta * 0.08;
      const spent = 1 - Math.max(0, puff.life) / puff.maxLife;
      puff.mesh.scale.setScalar(1 + spent * 1.8);
      const mat = puff.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, (1 - spent) * 0.55);
      if (puff.life > 0) continue;
      this.scene.remove(puff.mesh);
      puff.mesh.geometry.dispose();
      mat.dispose();
      this.steam.splice(i, 1);
    }
  }

  /** Long, low GT-R / Skyline silhouette with neon underglow. */
  private buildSkyline(slot: number): THREE.Group {
    const group = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({
      color: BODY_PAINTS[slot % BODY_PAINTS.length]!,
      roughness: 0.32,
      metalness: 0.45,
    });
    const glass = new THREE.MeshStandardMaterial({
      color: 0x1a2228,
      roughness: 0.25,
      metalness: 0.35,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x0c0c0e,
      roughness: 0.7,
    });
    const tyre = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 1 });
    const hub = new THREE.MeshStandardMaterial({
      color: 0xd0d4d8,
      roughness: 0.35,
      metalness: 0.7,
    });
    const glowCol = GLOWS[slot % GLOWS.length]!;
    const glow = new THREE.MeshBasicMaterial({
      color: glowCol,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });

    const length = 4.6;
    const width = 1.85;
    const ride = 0.22;

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(length, 0.42, width),
      paint,
    );
    body.position.y = ride + 0.28;
    body.castShadow = true;
    group.add(body);

    // Long nose / short cabin — Skyline-ish proportions.
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(length * 0.36, 0.38, width * 0.88),
      paint,
    );
    cabin.position.set(-0.35, ride + 0.72, 0);
    cabin.castShadow = true;
    group.add(cabin);

    const windscreen = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.3, width * 0.78),
      glass,
    );
    windscreen.position.set(length * 0.05, ride + 0.75, 0);
    group.add(windscreen);

    const boot = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.12, width * 0.86),
      paint,
    );
    boot.position.set(-length * 0.32, ride + 0.52, 0);
    group.add(boot);

    // Boot spoiler.
    const spoiler = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.08, width * 0.92),
      dark,
    );
    spoiler.position.set(-length * 0.42, ride + 0.78, 0);
    group.add(spoiler);
    const spoilerPostL = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.22, 0.06),
      dark,
    );
    spoilerPostL.position.set(-length * 0.4, ride + 0.62, width * 0.32);
    group.add(spoilerPostL);
    const spoilerPostR = spoilerPostL.clone();
    spoilerPostR.position.z = -width * 0.32;
    group.add(spoilerPostR);

    const bumperF = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.2, width * 1.02),
      dark,
    );
    bumperF.position.set(length * 0.48, ride + 0.2, 0);
    group.add(bumperF);

    const bumperR = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.2, width * 1.02),
      dark,
    );
    bumperR.position.set(-length * 0.48, ride + 0.2, 0);
    group.add(bumperR);

    // Underglow strips.
    const under = new THREE.Mesh(
      new THREE.BoxGeometry(length * 0.92, 0.04, width * 0.95),
      glow,
    );
    under.position.y = 0.06;
    under.renderOrder = 2;
    group.add(under);

    const glowHalo = new THREE.Mesh(
      new THREE.PlaneGeometry(length * 1.05, width * 1.35),
      new THREE.MeshBasicMaterial({
        color: glowCol,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      }),
    );
    glowHalo.rotation.x = -Math.PI / 2;
    glowHalo.position.y = 0.03;
    glowHalo.renderOrder = 1;
    group.add(glowHalo);

    // Headlights / tails.
    const head = new THREE.MeshBasicMaterial({ color: 0xfff2c8 });
    const tail = new THREE.MeshBasicMaterial({ color: 0xff2020 });
    for (const side of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.22), head);
      h.position.set(length * 0.5, ride + 0.32, side * width * 0.32);
      group.add(h);
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.28), tail);
      t.position.set(-length * 0.5, ride + 0.32, side * width * 0.32);
      group.add(t);
    }

    const wheelX = length * 0.32;
    const wheelZ = width * 0.52;
    for (const lx of [-wheelX, wheelX]) {
      for (const lz of [-wheelZ, wheelZ]) {
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10),
          tyre,
        );
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(lx, 0.36, lz);
        group.add(wheel);
        const cap = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.16, 0.3, 8),
          hub,
        );
        cap.rotation.x = Math.PI / 2;
        cap.position.set(lx, 0.36, lz);
        group.add(cap);
      }
    }

    return group;
  }
}
