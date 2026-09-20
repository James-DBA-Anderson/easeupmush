import * as THREE from "three";
import {
  getRoadGraph,
  ROAD_WIDTH,
  type RoadGraph,
} from "../world/buildings";
import { groundHeight } from "../world/terrain";
import { isInLake, nearestShore, WATER_Y } from "../world/lake";

/** UK left lane offset. */
const LANE = ROAD_WIDTH * 0.22;
/** Esplanade race speed — proper boy-racer pace. */
const RACE_SPEED = 28;
/** Mid-park blasts before one of them bottles it (longer seafront run). */
const PASSES_BEFORE_CRASH = 4;
/**
 * South of this Z is the seafront. Used to stitch Eastney Esplanade plus the
 * western parade roads into one long up-and-down race line.
 */
const ESPLANADE_SOUTH_OF = -72;
/** Don't hop back inland off the seafront while stitching the race line. */
const ESPLANADE_MAX_Z = -48;

const BODY_PAINTS = [0x12141a, 0xc5c9ce, 0x6e101c, 0x0c3558] as const;
const GLOWS = [0xff2ec8, 0x22e0ff, 0xb8ff2a, 0xff6a1a] as const;
const ACCENTS = [0x2a2c32, 0x1a1c22, 0x241014, 0x0a2230] as const;

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
  lights: THREE.PointLight[];
  wheels: THREE.Object3D[];
  /** Index on the stitched esplanade race line. */
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
  /** West→east seafront polyline (Eastney Esplanade + linked south roads). */
  private line: { x: number; z: number }[] = [];
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
    this.line = graph ? stitchEsplanadeLine(graph) : [];
    if (this.line.length < 2) {
      this.phase = "done";
      this.gone = true;
      return;
    }

    const mid = nearestLineIndex(this.line, 20, -117);
    // Pack blasting both ways so they actually use the long seafront.
    this.cars.push(this.spawnCar(mid, -1, 0, 0));
    this.cars.push(this.spawnCar(Math.max(0, mid - 1), -1, 2.4, 1));
    this.cars.push(
      this.spawnCar(Math.min(this.line.length - 2, mid + 1), 1, 1.2, 2),
    );
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
      if (this.passes >= PASSES_BEFORE_CRASH && this.carOnLakeFront()) {
        this.beginCrash();
      }
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

  private spawnCar(
    index: number,
    dir: 1 | -1,
    gap: number,
    slot: number,
  ): RacerCar {
    const built = this.buildSkyline(slot);
    const car: RacerCar = {
      id: nextRacerId++,
      group: built.group,
      materials: [],
      lights: built.lights,
      wheels: built.wheels,
      index: THREE.MathUtils.clamp(index, 0, Math.max(0, this.line.length - 1)),
      dir,
      progress: Math.min(0.42, gap * 0.07),
      speed: RACE_SPEED + slot * 1.4 + Math.random() * 2.2,
      midSide: 0,
      fading: false,
      fade: 0,
      crashed: false,
    };
    car.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material;
      if (Array.isArray(mat)) {
        for (const m of mat) car.materials.push(m);
      } else if (mat) {
        car.materials.push(mat);
      }
    });
    this.placeOnLine(car, car.progress);
    car.midSide = Math.sign(car.group.position.x) || 1;
    this.scene.add(car.group);
    return car;
  }

  private updateRacing(delta: number): void {
    for (const car of this.cars) {
      if (car.fading || car.crashed) continue;
      this.advanceOnEsplanade(car, delta);
      this.spinWheels(car, delta);

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

  private spinWheels(car: RacerCar, delta: number): void {
    const spin = (car.speed * delta) / 0.34;
    for (const wheel of car.wheels) {
      wheel.rotation.z -= spin;
    }
  }

  private advanceOnEsplanade(car: RacerCar, delta: number): void {
    const pts = this.line;
    let next = car.index + car.dir;
    if (next < 0 || next >= pts.length) {
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
    this.placeOnLine(car, car.progress);
  }

  private placeOnLine(car: RacerCar, t: number): void {
    const pts = this.line;
    const next = THREE.MathUtils.clamp(car.index + car.dir, 0, pts.length - 1);
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

  /** Still on the seafront in front of the lake — safe to peel into the water. */
  private carOnLakeFront(): RacerCar | null {
    const live = this.cars.filter((c) => !c.fading && !c.crashed);
    for (const car of live) {
      const { x, z } = car.group.position;
      if (x > -90 && x < 95 && z < -88 && z > -165) return car;
    }
    return null;
  }

  private beginCrash(): void {
    const pick = this.carOnLakeFront();
    const live = this.cars.filter((c) => !c.fading);
    if (!pick && live.length === 0) {
      this.phase = "done";
      return;
    }
    this.crashCar = pick ?? live[Math.floor(Math.random() * live.length)]!;
    this.crashCar.crashed = true;
    this.phase = "crashing";

    for (const car of this.cars) {
      if (car === this.crashCar) continue;
      car.fading = true;
    }

    const at = this.crashCar.group.position;
    const aimX = THREE.MathUtils.clamp(at.x + (Math.random() - 0.5) * 12, -55, 60);
    let aimZ = -48;
    for (let z = -78; z < 30; z += 3) {
      if (isInLake(aimX, z)) {
        aimZ = z;
        break;
      }
    }
    const shore = nearestShore(aimX, aimZ);
    this.crashAim.set(
      THREE.MathUtils.lerp(aimX, shore.x, 0.35),
      0,
      aimZ,
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
      car.group.position.y =
        groundHeight(car.group.position.x, car.group.position.z) + 0.02;
      car.group.rotation.x = Math.min(0.35, car.group.rotation.x + delta * 0.4);
      car.group.rotation.z += Math.sin(performance.now() * 0.02) * delta * 0.4;
      this.spinWheels(car, delta);

      if (!this.wet && isInLake(car.group.position.x, car.group.position.z)) {
        this.wet = true;
        this.phase = "steaming";
        this.crashQueued = true;
        this.scored = true;
        this.steamFor = 9;
        this.crashVel.multiplyScalar(0.25);
        this.burstSteam(28);
        for (const light of car.lights) light.intensity = 0.4;
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
      for (const light of car.lights) {
        light.intensity *= Math.max(0, 1 - delta * 1.4);
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

  /**
   * Wide-body GT-R / Skyline: long nose, cab-back, boot wing, slammed ride
   * and neon underglow. Slot picks paint, glow, and light shape.
   */
  private buildSkyline(slot: number): {
    group: THREE.Group;
    wheels: THREE.Object3D[];
    lights: THREE.PointLight[];
  } {
    const group = new THREE.Group();
    const wheels: THREE.Object3D[] = [];
    const lights: THREE.PointLight[] = [];
    const paintCol = BODY_PAINTS[slot % BODY_PAINTS.length]!;
    const glowCol = GLOWS[slot % GLOWS.length]!;
    const accentCol = ACCENTS[slot % ACCENTS.length]!;

    const paint = new THREE.MeshStandardMaterial({
      color: paintCol,
      roughness: 0.28,
      metalness: 0.62,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x0a0a0c,
      roughness: 0.55,
      metalness: 0.25,
    });
    const carbon = new THREE.MeshStandardMaterial({
      color: accentCol,
      roughness: 0.42,
      metalness: 0.35,
    });
    const glass = new THREE.MeshStandardMaterial({
      color: 0x12181e,
      roughness: 0.12,
      metalness: 0.45,
      transparent: true,
      opacity: 0.62,
    });
    const tyre = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 1 });
    const hub = new THREE.MeshStandardMaterial({
      color: 0xd8dce0,
      roughness: 0.28,
      metalness: 0.82,
    });
    const caliper = new THREE.MeshStandardMaterial({
      color: 0xb01018,
      roughness: 0.45,
      metalness: 0.35,
    });
    const chrome = new THREE.MeshStandardMaterial({
      color: 0xc8ccd0,
      roughness: 0.22,
      metalness: 0.85,
    });
    const glow = new THREE.MeshBasicMaterial({
      color: glowCol,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const head = new THREE.MeshBasicMaterial({ color: 0xfff4dc });
    const tail = new THREE.MeshBasicMaterial({ color: 0xff1a1a });
    const indicator = new THREE.MeshBasicMaterial({ color: 0xff9a2a });
    const plate = new THREE.MeshStandardMaterial({
      color: 0xe8e4c8,
      roughness: 0.7,
    });

    const length = 4.72;
    const width = 1.92;
    const ride = 0.16;

    addBox(group, paint, length * 0.96, 0.28, width * 0.9, 0.06, ride + 0.32, 0, true);
    addBox(group, paint, length * 0.72, 0.16, width * 1.04, 0.02, ride + 0.38, 0, true);

    const nose = addBox(
      group,
      paint,
      length * 0.42,
      0.2,
      width * 0.86,
      length * 0.22,
      ride + 0.44,
      0,
      true,
    );
    nose.rotation.z = -0.08;

    const cabin = addBox(
      group,
      paint,
      length * 0.34,
      0.36,
      width * 0.82,
      -0.28,
      ride + 0.78,
      0,
      true,
    );
    cabin.rotation.z = 0.04;

    addBox(group, glass, 0.04, 0.3, width * 0.72, length * 0.08, ride + 0.82, 0);
    const screen = addBox(
      group,
      glass,
      0.62,
      0.04,
      width * 0.7,
      0.02,
      ride + 0.94,
      0,
    );
    screen.rotation.z = 0.52;
    addBox(group, glass, 0.42, 0.22, 0.04, -0.22, ride + 0.8, width * 0.4);
    addBox(group, glass, 0.42, 0.22, 0.04, -0.22, ride + 0.8, -width * 0.4);
    addBox(group, glass, 0.04, 0.24, width * 0.68, -0.92, ride + 0.82, 0);

    addBox(group, carbon, 0.7, 0.05, width * 0.55, length * 0.16, ride + 0.56, 0);
    addBox(group, dark, 0.22, 0.04, 0.28, length * 0.18, ride + 0.59, 0.22);
    addBox(group, dark, 0.22, 0.04, 0.28, length * 0.18, ride + 0.59, -0.22);

    addBox(group, paint, 0.95, 0.12, width * 0.84, -length * 0.28, ride + 0.52, 0, true);

    const skirtY = ride + 0.18;
    addBox(group, dark, length * 0.7, 0.08, 0.08, -0.05, skirtY, width * 0.48);
    addBox(group, dark, length * 0.7, 0.08, 0.08, -0.05, skirtY, -width * 0.48);

    addBox(group, dark, 0.42, 0.16, width * 1.04, length * 0.48, ride + 0.18, 0);
    addBox(group, dark, 0.28, 0.1, 0.62, length * 0.5, ride + 0.22, 0);
    addBox(group, dark, 0.16, 0.1, 0.22, length * 0.5, ride + 0.2, 0.42);
    addBox(group, dark, 0.16, 0.1, 0.22, length * 0.5, ride + 0.2, -0.42);
    addBox(group, dark, length * 0.18, 0.04, width * 1.06, length * 0.46, ride + 0.08, 0);

    addBox(group, dark, 0.34, 0.18, width * 1.02, -length * 0.48, ride + 0.18, 0);
    for (let i = -2; i <= 2; i++) {
      addBox(group, dark, 0.08, 0.1, 0.04, -length * 0.52, ride + 0.1, i * 0.16);
    }

    const wingZ = width * 0.42;
    addBox(group, carbon, 0.16, 0.05, width * 1.02, -length * 0.44, ride + 0.92, 0);
    addBox(group, carbon, 0.05, 0.12, 0.08, -length * 0.4, ride + 0.84, wingZ);
    addBox(group, carbon, 0.05, 0.12, 0.08, -length * 0.4, ride + 0.84, -wingZ);
    addBox(group, carbon, 0.04, 0.16, 0.22, -length * 0.5, ride + 0.88, wingZ);
    addBox(group, carbon, 0.04, 0.16, 0.22, -length * 0.5, ride + 0.88, -wingZ);
    addBox(group, dark, 0.06, 0.28, 0.05, -length * 0.42, ride + 0.7, wingZ * 0.72);
    addBox(group, dark, 0.06, 0.28, 0.05, -length * 0.42, ride + 0.7, -wingZ * 0.72);

    const mirrorArm = (side: number) => {
      addBox(group, dark, 0.08, 0.04, 0.18, 0.18, ride + 0.72, side * width * 0.48);
      addBox(group, dark, 0.12, 0.07, 0.18, 0.2, ride + 0.74, side * (width * 0.56));
    };
    mirrorArm(1);
    mirrorArm(-1);

    const roundLights = slot % 2 === 0;
    for (const side of [-1, 1] as const) {
      if (roundLights) {
        for (const inset of [0.12, 0.32]) {
          const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 10), head);
          lamp.rotation.z = Math.PI / 2;
          lamp.position.set(length * 0.5, ride + 0.36, side * (width * 0.22 + inset * 0.35));
          group.add(lamp);
        }
      } else {
        addBox(group, head, 0.06, 0.08, 0.36, length * 0.5, ride + 0.36, side * width * 0.28);
      }
      addBox(group, indicator, 0.05, 0.05, 0.08, length * 0.49, ride + 0.32, side * width * 0.48);
      addBox(group, tail, 0.05, 0.1, 0.38, -length * 0.5, ride + 0.38, side * width * 0.28);
      addBox(group, tail, 0.04, 0.04, 0.16, -length * 0.5, ride + 0.28, side * width * 0.22);
    }

    addBox(group, chrome, 0.14, 0.05, 0.36, -length * 0.51, ride + 0.16, 0.18);
    addBox(group, chrome, 0.14, 0.05, 0.36, -length * 0.51, ride + 0.16, -0.18);

    addBox(group, plate, 0.04, 0.12, 0.36, length * 0.51, ride + 0.24, 0);
    addBox(group, plate, 0.04, 0.12, 0.36, -length * 0.51, ride + 0.26, 0);

    addBox(group, glow, length * 0.9, 0.035, width * 0.92, 0, 0.05, 0);
    addBox(group, glow, length * 0.78, 0.03, 0.05, 0, 0.07, width * 0.5);
    addBox(group, glow, length * 0.78, 0.03, 0.05, 0, 0.07, -width * 0.5);
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(length * 1.12, width * 1.42),
      new THREE.MeshBasicMaterial({
        color: glowCol,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.025;
    halo.renderOrder = 1;
    group.add(halo);

    const glowLight = new THREE.PointLight(glowCol, 3.6, 13, 2);
    glowLight.position.set(0, 0.22, 0);
    group.add(glowLight);
    lights.push(glowLight);

    const wheelX = length * 0.33;
    const wheelZ = width * 0.54;
    for (const lx of [-wheelX, wheelX]) {
      for (const lz of [-wheelZ, wheelZ]) {
        const hubGroup = new THREE.Group();
        hubGroup.position.set(lx, 0.32, lz);
        const tyreMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.34, 0.34, 0.26, 12),
          tyre,
        );
        tyreMesh.rotation.x = Math.PI / 2;
        hubGroup.add(tyreMesh);
        const rim = new THREE.Mesh(
          new THREE.CylinderGeometry(0.2, 0.2, 0.28, 10),
          hub,
        );
        rim.rotation.x = Math.PI / 2;
        hubGroup.add(rim);
        for (let s = 0; s < 5; s++) {
          const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 0.035), hub);
          spoke.rotation.x = Math.PI / 2;
          spoke.rotation.z = (s / 5) * Math.PI;
          hubGroup.add(spoke);
        }
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 8), chrome);
        cap.rotation.x = Math.PI / 2;
        hubGroup.add(cap);
        const cal = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.18), caliper);
        cal.position.set(0, 0.02, lz > 0 ? 0.02 : -0.02);
        hubGroup.add(cal);
        group.add(hubGroup);
        wheels.push(hubGroup);
      }
    }

    addBox(group, dark, 0.08, 0.14, 0.36, -0.15, ride + 0.58, 0.18);
    addBox(group, dark, 0.08, 0.14, 0.36, -0.15, ride + 0.58, -0.18);

    return { group, wheels, lights };
  }
}

function addBox(
  parent: THREE.Object3D,
  material: THREE.Material,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  cast = false,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  parent.add(mesh);
  return mesh;
}

function nearestLineIndex(
  line: ReadonlyArray<{ x: number; z: number }>,
  x: number,
  z: number,
): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < line.length; i++) {
    const p = line[i]!;
    const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Walk the parade graph from the westernmost seafront vertex, staying on
 * south roads, so the racers use Eastney Esplanade and the linked western
 * parade instead of a short mid-park bounce.
 */
function stitchEsplanadeLine(
  graph: RoadGraph,
): { x: number; z: number }[] {
  const fallback = fallbackEsplanade(graph);
  type Node = { road: number; index: number; x: number; z: number };
  const nodes: Node[] = [];
  graph.roads.forEach((pts, road) => {
    pts.forEach((p, index) => {
      if (p.z < ESPLANADE_SOUTH_OF) nodes.push({ road, index, x: p.x, z: p.z });
    });
  });
  if (nodes.length < 2) return fallback;

  const used = new Set<string>();
  const key = (road: number, index: number) => `${road}:${index}`;
  let current = nodes.reduce((a, b) => (a.x < b.x ? a : b));
  const line: { x: number; z: number }[] = [{ x: current.x, z: current.z }];
  used.add(key(current.road, current.index));

  for (let guard = 0; guard < 120; guard++) {
    const pts = graph.roads[current.road]!;
    const candidates: { node: Node; east: number }[] = [];

    for (const ni of [current.index - 1, current.index + 1]) {
      if (ni < 0 || ni >= pts.length) continue;
      if (used.has(key(current.road, ni))) continue;
      const p = pts[ni]!;
      if (p.z > ESPLANADE_MAX_Z) continue;
      candidates.push({
        node: { road: current.road, index: ni, x: p.x, z: p.z },
        east: p.x - current.x,
      });
    }

    for (const link of graph.linksAt(current.road, current.index)) {
      if (used.has(key(link.road, link.index))) continue;
      const p = graph.roads[link.road]?.[link.index];
      if (!p || p.z > ESPLANADE_MAX_Z) continue;
      candidates.push({
        node: { road: link.road, index: link.index, x: p.x, z: p.z },
        east: p.x - current.x,
      });
    }

    if (candidates.length === 0) break;
    const eastward = candidates.filter((c) => c.east > 1.2);
    eastward.sort((a, b) => b.east - a.east);
    candidates.sort((a, b) => b.east - a.east);
    const pick = (eastward[0] ?? candidates[0])!;
    const dist = Math.hypot(pick.node.x - current.x, pick.node.z - current.z);
    current = pick.node;
    used.add(key(current.road, current.index));
    if (dist > 2.2) line.push({ x: current.x, z: current.z });
  }

  return line.length >= 2 ? line : fallback;
}

/** Road 0's southern run — old 8–16 stretch — if the graph has no seafront. */
function fallbackEsplanade(
  graph: RoadGraph,
): { x: number; z: number }[] {
  const pts = graph.roads[0];
  if (!pts || pts.length < 2) return [];
  const south = pts
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.z < ESPLANADE_SOUTH_OF);
  if (south.length >= 2) {
    const from = south[0]!.i;
    const to = south[south.length - 1]!.i;
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    return pts.slice(lo, hi + 1).map((p) => ({ x: p.x, z: p.z }));
  }
  const lo = Math.min(8, pts.length - 1);
  const hi = Math.min(16, pts.length - 1);
  return pts.slice(lo, hi + 1).map((p) => ({ x: p.x, z: p.z }));
}
