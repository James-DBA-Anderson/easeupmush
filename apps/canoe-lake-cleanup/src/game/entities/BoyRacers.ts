import * as THREE from "three";
import {
  getRoadGraph,
  ROAD_WIDTH,
  surroundFootprints,
  type RoadGraph,
} from "../world/buildings";
import { groundHeight } from "../world/terrain";
import { isInLake, LAKE_BED_Y, nearestShore, WATER_Y } from "../world/lake";
import { Grumble } from "../effects/Grumble";
import { hitsAny } from "../world/collision";
import { parkBuildingFootprints } from "../world/park";
import { smashFencesAlong } from "../world/fence";
import { smashBenchesAlong } from "../world/bench";
import { knockFairyPoleAlong } from "../world/fairyLights";
import { smashBinsAlong } from "./Bin";

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

interface Lamp {
  mat: THREE.MeshBasicMaterial;
  color: THREE.Color;
  opacity: number;
}

interface RacerCar {
  id: number;
  group: THREE.Group;
  materials: THREE.Material[];
  lights: THREE.PointLight[];
  lightIntensities: number[];
  lamps: Lamp[];
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
  sideWindows: THREE.Mesh[];
  cabinLight: THREE.PointLight | null;
}

let nextRacerId = 50_000;

export type RacerPhase =
  | "racing"
  | "crashing"
  | "trapped"
  | "climbing"
  | "sinking"
  | "done";

const PANIC_LINES = ["HELP!", "THE DOORS!", "GET ME OUT!", "I CAN'T SWIM!"];

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
  private flickT = 0;
  private driver: THREE.Group | null = null;
  private driverArms: THREE.Object3D[] = [];
  private brokenWindow: THREE.Mesh | null = null;
  private doorTried = false;
  private windowCharge = 0;
  private lastWindowHit = -1;
  private climb = 0;
  private bangT = 0;
  private nextShout = 1.2;
  private nextThud = 0.4;
  private doorQueued = false;
  private needDoorQueued = false;
  private windowQueued = false;
  private rescuedQueued = false;
  private thudQueued = false;
  private doorTold = false;
  private windowHintTold = false;
  private doorGrumbleAt = 0;

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

  /** One-shot: player yanked a door and it stayed shut. */
  public claimDoorJam(): boolean {
    if (!this.doorQueued) return false;
    this.doorQueued = false;
    return true;
  }

  /** One-shot: window spray before anyone's tried the doors. */
  public claimNeedDoor(): boolean {
    if (!this.needDoorQueued) return false;
    this.needDoorQueued = false;
    return true;
  }

  /** One-shot: a side window gave way. */
  public claimWindow(): boolean {
    if (!this.windowQueued) return false;
    this.windowQueued = false;
    return true;
  }

  /** One-shot: he's out and the wreck can go under. Score lands here. */
  public claimRescued(): boolean {
    if (!this.rescuedQueued) return false;
    this.rescuedQueued = false;
    return true;
  }

  /** Window bangs while he's still inside. */
  public claimThud(): boolean {
    if (!this.thudQueued) return false;
    this.thudQueued = false;
    return true;
  }

  /** HUD line while the wreck is waiting on the player. */
  public prompt(): string | null {
    if (this.phase === "trapped" && !this.doorTried) {
      return "E or spray: Pull the door";
    }
    if (this.phase === "trapped") return "Spray the side window";
    if (this.phase === "climbing") return "He's climbing out";
    return null;
  }

  /**
   * Pull a door. Only counts when the player is stood beside the wreck.
   * Returns true when the pull happened (so E doesn't also board a pedalo).
   */
  public tryDoor(at: THREE.Vector3): boolean {
    if (this.phase !== "trapped" || !this.crashCar) return false;
    if (!this.nearDoor(at)) return false;
    this.jamDoor();
    return true;
  }

  /**
   * Lance on the wreck. Doors jam. A side window breaks only after a door
   * has been tried, and only after a short wash (not one stray droplet).
   */
  public takeSpray(point: THREE.Vector3): boolean {
    if (this.phase !== "trapped" || !this.crashCar) return false;
    const pane = this.windowUnder(point);
    if (pane) {
      if (!this.doorTried) {
        if (!this.windowHintTold) {
          this.windowHintTold = true;
          this.needDoorQueued = true;
        }
        return true;
      }
      const now = performance.now();
      if (now - this.lastWindowHit > 45) {
        this.lastWindowHit = now;
        this.windowCharge = Math.min(1, this.windowCharge + 0.2);
      }
      if (this.windowCharge >= 1) this.breakWindow(pane);
      return true;
    }
    if (this.nearDoorPoint(point)) {
      this.jamDoor();
      return true;
    }
    return false;
  }

  private jamDoor(): void {
    this.doorTried = true;
    if (!this.doorTold) {
      this.doorTold = true;
      this.doorQueued = true;
    }
    const now = performance.now();
    if (!this.crashCar || now - this.doorGrumbleAt < 900) return;
    this.doorGrumbleAt = now;
    const spot = this.crashCar.group.position.clone();
    spot.y += 1.7;
    new Grumble(this.scene, "IT WON'T OPEN!", spot);
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
    } else if (
      this.phase === "crashing" ||
      this.phase === "trapped" ||
      this.phase === "climbing" ||
      this.phase === "sinking"
    ) {
      this.updateCrash(delta);
    }

    this.pulseCabinLights();
    this.updateFades(delta);
    this.updateSteam(delta);
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
      lightIntensities: built.lights.map((l) => l.intensity),
      lamps: built.lamps,
      wheels: built.wheels,
      sideWindows: built.sideWindows,
      cabinLight: built.cabinLight,
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
    this.pickClearAim(at);
    const aimDx = this.crashAim.x - at.x;
    const aimDz = this.crashAim.z - at.z;
    const aimLen = Math.hypot(aimDx, aimDz) || 1;
    this.crashVel.set((aimDx / aimLen) * 32, 0, (aimDz / aimLen) * 32);
    this.crashCar.group.rotation.y = Math.atan2(-aimDz / aimLen, aimDx / aimLen);
    this.seatDriver(this.crashCar);
  }

  /** Shift the splash point sideways until the run doesn't cross a building. */
  private pickClearAim(at: THREE.Vector3): void {
    const baseX = this.crashAim.x;
    const attempts: { x: number; z: number }[] = [
      { x: baseX, z: this.crashAim.z },
    ];
    for (const dx of [12, -12, 22, -22, 34, -34, 48, -48]) {
      const x = THREE.MathUtils.clamp(baseX + dx, -70, 80);
      let z = this.crashAim.z;
      for (let probe = -90; probe < 40; probe += 3) {
        if (isInLake(x, probe)) {
          z = probe;
          break;
        }
      }
      attempts.push({ x, z });
    }
    for (const aim of attempts) {
      if (this.aimClear(at.x, at.z, aim.x, aim.z)) {
        this.crashAim.set(aim.x, 0, aim.z);
        return;
      }
    }
  }

  private aimClear(ax: number, az: number, bx: number, bz: number): boolean {
    const dist = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(dist / 1.4));
    const yaw = Math.atan2(-(bz - az), bx - ax);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (this.poseBlocked(ax + (bx - ax) * t, az + (bz - az) * t, yaw)) {
        return false;
      }
    }
    return true;
  }

  /** Nose, tail and shoulders of the Skyline against park and terrace walls. */
  private poseBlocked(x: number, z: number, yaw: number): boolean {
    const fx = Math.cos(yaw);
    const fz = -Math.sin(yaw);
    const sx = -fz;
    const sz = fx;
    const spots: ReadonlyArray<readonly [number, number]> = [
      [0, 0],
      [2.2, 0],
      [-2.05, 0],
      [1.5, 0.9],
      [1.5, -0.9],
      [0, 0.95],
      [0, -0.95],
    ];
    for (const [along, side] of spots) {
      const px = x + fx * along + sx * side;
      const pz = z + fz * along + sz * side;
      if (
        hitsAny(px, pz, parkBuildingFootprints(), 0.05) ||
        hitsAny(px, pz, surroundFootprints(), 0.05)
      ) {
        return true;
      }
    }
    return false;
  }

  private breakThrough(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    vx: number,
    vz: number,
  ): void {
    smashFencesAlong(x0, z0, x1, z1, vx, vz);
    smashBenchesAlong(x0, z0, x1, z1, vx, vz);
    smashBinsAlong(x0, z0, x1, z1, vx, vz);
    knockFairyPoleAlong(x0, z0, x1, z1, vx, vz);
  }

  private updateCrash(delta: number): void {
    const car = this.crashCar;
    if (!car) return;

    if (this.phase === "crashing") {
      const x0 = car.group.position.x;
      const z0 = car.group.position.z;
      const yaw = car.group.rotation.y;
      let x1 = x0 + this.crashVel.x * delta;
      let z1 = z0 + this.crashVel.z * delta;
      if (this.poseBlocked(x1, z1, yaw) && !this.poseBlocked(x0, z0, yaw)) {
        const xFree = !this.poseBlocked(x1, z0, yaw);
        const zFree = !this.poseBlocked(x0, z1, yaw);
        if (xFree && !zFree) {
          z1 = z0;
          this.crashVel.z = 0;
        } else if (zFree && !xFree) {
          x1 = x0;
          this.crashVel.x = 0;
        } else if (xFree && zFree) {
          if (Math.abs(this.crashVel.x) >= Math.abs(this.crashVel.z)) {
            z1 = z0;
            this.crashVel.z = 0;
          } else {
            x1 = x0;
            this.crashVel.x = 0;
          }
        } else {
          x1 = x0;
          z1 = z0;
          this.crashVel.set(0, 0, 0);
        }
      }
      car.group.position.x = x1;
      car.group.position.z = z1;
      const fwdX = Math.cos(yaw);
      const fwdZ = -Math.sin(yaw);
      this.breakThrough(x0, z0, x1, z1, this.crashVel.x, this.crashVel.z);
      this.breakThrough(
        x0 + fwdX * 2.1,
        z0 + fwdZ * 2.1,
        x1 + fwdX * 2.1,
        z1 + fwdZ * 2.1,
        this.crashVel.x,
        this.crashVel.z,
      );
      car.group.position.y =
        groundHeight(car.group.position.x, car.group.position.z) + 0.02;
      car.group.rotation.x = Math.min(0.35, car.group.rotation.x + delta * 0.4);
      car.group.rotation.z += Math.sin(performance.now() * 0.02) * delta * 0.4;
      this.spinWheels(car, delta);

      if (!this.wet && isInLake(car.group.position.x, car.group.position.z)) {
        this.wet = true;
        this.phase = "trapped";
        this.crashQueued = true;
        this.steamFor = 6;
        this.crashVel.multiplyScalar(0.18);
        this.burstSteam(28);
      }
    }

    if (this.wet && this.phase !== "sinking") this.flickerLamps(car, delta);

    if (this.phase === "trapped") {
      this.holdAfloat(car, delta);
      this.panicInside(car, delta);
      this.leakSteam(delta);
    }

    if (this.phase === "climbing") {
      this.holdAfloat(car, delta);
      this.climbOut(car, delta);
    }

    if (this.phase === "sinking") {
      this.sink = Math.min(1, this.sink + delta * 0.16);
      const floatY = WATER_Y + 0.12;
      car.group.position.y = THREE.MathUtils.lerp(
        floatY,
        LAKE_BED_Y + 0.04,
        this.sink * this.sink,
      );
      car.group.rotation.z *= 1 - delta * 0.6;
      car.group.rotation.x = THREE.MathUtils.lerp(car.group.rotation.x, 0.08, delta * 0.8);
      if (car.cabinLight) {
        car.cabinLight.intensity *= Math.max(0, 1 - delta * 1.4);
      }
      if (this.sink >= 1 && this.steam.length === 0) this.phase = "done";
    }
  }

  /** Nose stays in the lake and the roof stays above the surface. */
  private holdAfloat(car: RacerCar, delta: number): void {
    const bob = Math.sin(performance.now() * 0.003) * 0.035;
    car.group.position.y = WATER_Y + 0.12 + bob;
    car.group.position.x += this.crashVel.x * delta * 0.15;
    car.group.position.z += this.crashVel.z * delta * 0.15;
    this.crashVel.multiplyScalar(Math.max(0, 1 - delta * 0.8));
    car.group.rotation.z = Math.sin(performance.now() * 0.002) * 0.04;
    car.group.rotation.x = 0.12;
  }

  private leakSteam(delta: number): void {
    if (this.steamFor <= 0) return;
    this.steamFor -= delta;
    this.steamAcc += delta;
    while (this.steamAcc >= 0.12 && this.steamFor > 0) {
      this.steamAcc -= 0.12;
      this.burstSteam(2);
    }
  }

  private panicInside(car: RacerCar, delta: number): void {
    this.bangT += delta;
    const punch = Math.max(0, Math.sin(this.bangT * 11));
    const side = Math.sin(this.bangT * 2.4) > 0 ? 1 : -1;
    for (let i = 0; i < this.driverArms.length; i++) {
      const arm = this.driverArms[i]!;
      const own = i === 0 ? -1 : 1;
      const hitting = own === side ? punch : punch * 0.15;
      arm.rotation.x = -1.1 + hitting * 0.95;
    }
    if (this.driver) {
      this.driver.position.y = 0.48 + punch * 0.04;
      this.driver.rotation.y = side * punch * 0.25;
    }

    this.nextThud -= delta;
    if (this.nextThud <= 0) {
      this.nextThud = 0.55 + Math.random() * 0.35;
      this.thudQueued = true;
      car.group.position.x += side * 0.02;
    }

    this.nextShout -= delta;
    if (this.nextShout <= 0) {
      this.nextShout = 2.4 + Math.random() * 1.4;
      const line = PANIC_LINES[Math.floor(Math.random() * PANIC_LINES.length)]!;
      const spot = car.group.position.clone();
      spot.y += 1.85;
      new Grumble(this.scene, line, spot);
    }
  }

  private climbOut(car: RacerCar, delta: number): void {
    if (!this.driver) return;
    this.climb += delta;
    const t = Math.min(1, this.climb / 1.5);
    const side = this.brokenSide();
    this.driver.position.z = side * THREE.MathUtils.lerp(0.05, 1.15, t);
    this.driver.position.y = THREE.MathUtils.lerp(0.5, 1.05, t);
    this.driver.position.x = THREE.MathUtils.lerp(-0.15, -0.05, t);
    this.driver.rotation.z = side * t * 0.9;
    this.driver.rotation.x = -t * 0.6;
    for (const arm of this.driverArms) arm.rotation.x = -0.4;
    if (t < 1) return;
    car.group.remove(this.driver);
    this.driver = null;
    this.rescuedQueued = true;
    this.phase = "sinking";
    this.steamFor = 2.5;
    this.burstSteam(16);
  }

  private brokenSide(): 1 | -1 {
    if (!this.brokenWindow) return 1;
    return this.brokenWindow.position.z >= 0 ? 1 : -1;
  }

  private nearDoor(at: THREE.Vector3): boolean {
    const car = this.crashCar;
    if (!car) return false;
    const local = car.group.worldToLocal(at.clone());
    if (local.y < -0.4 || local.y > 2.6) return false;
    return (
      Math.hypot(local.x + 0.15, local.z - 1.05) < 1.45 ||
      Math.hypot(local.x + 0.15, local.z + 1.05) < 1.45
    );
  }

  /** Spray point sitting on a door skin rather than the glass. */
  private nearDoorPoint(point: THREE.Vector3): boolean {
    const car = this.crashCar;
    if (!car) return false;
    const local = car.group.worldToLocal(point.clone());
    const lowOnTheDoor = local.y > 0.28 && local.y < 0.62;
    const onTheSkin = Math.abs(local.z) > 0.72 && Math.abs(local.z) < 1.25;
    const alongCabin = local.x < 0.4 && local.x > -0.9;
    return lowOnTheDoor && onTheSkin && alongCabin;
  }

  private windowUnder(point: THREE.Vector3): THREE.Mesh | null {
    const car = this.crashCar;
    if (!car) return null;
    const local = car.group.worldToLocal(point.clone());
    let best: THREE.Mesh | null = null;
    let bestD = 0.55;
    for (const pane of car.sideWindows) {
      if (pane === this.brokenWindow) continue;
      const d = Math.hypot(local.x - pane.position.x, local.y - pane.position.y, local.z - pane.position.z);
      if (d < bestD) {
        bestD = d;
        best = pane;
      }
    }
    return best;
  }

  private breakWindow(pane: THREE.Mesh): void {
    if (this.phase !== "trapped") return;
    this.brokenWindow = pane;
    pane.visible = false;
    this.smashShards(pane);
    this.phase = "climbing";
    this.windowQueued = true;
    if (this.driver) this.driver.rotation.y = 0;
  }

  private smashShards(pane: THREE.Mesh): void {
    const car = this.crashCar;
    if (!car) return;
    const origin = new THREE.Vector3();
    pane.getWorldPosition(origin);
    const side = Math.sign(pane.position.z) || 1;
    for (let i = 0; i < 7; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x9fd8ff,
        transparent: true,
        opacity: 0.65,
        roughness: 0.05,
        metalness: 0.2,
      });
      const shard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.012), mat);
      shard.position.copy(origin);
      shard.position.x += (Math.random() - 0.5) * 0.2;
      shard.position.y += (Math.random() - 0.5) * 0.15;
      this.scene.add(shard);
      const life = 0.7 + Math.random() * 0.5;
      const puff: SteamPuff = {
        mesh: shard,
        life,
        maxLife: life,
        rise: -1.6 - Math.random(),
        driftX: (Math.random() - 0.5) * 0.8,
        driftZ: side * (0.6 + Math.random() * 0.8),
      };
      this.steam.push(puff);
    }
  }

  private seatDriver(car: RacerCar): void {
    const glow = car.cabinLight?.color.getHex() ?? 0xff2ec8;
    const body = new THREE.MeshStandardMaterial({ color: 0x1a1c22, roughness: 0.7 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc48a62, roughness: 0.65 });
    const hair = new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.8 });
    const hi = new THREE.MeshStandardMaterial({
      color: glow,
      emissive: glow,
      emissiveIntensity: 0.55,
      roughness: 0.4,
    });
    const man = new THREE.Group();
    man.position.set(-0.15, 0.48, 0.05);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.36, 0.2), body);
    torso.position.y = 0.28;
    man.add(torso);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.08), hi);
    stripe.position.set(0, 0.36, 0.08);
    man.add(stripe);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.15), skin);
    head.position.y = 0.56;
    man.add(head);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.08, 0.17), hair);
    cap.position.y = 0.66;
    man.add(cap);

    this.driverArms = [];
    for (const side of [-1, 1] as const) {
      const arm = new THREE.Group();
      arm.position.set(side * 0.16, 0.42, 0);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.07), body);
      upper.position.set(side * 0.02, -0.08, 0);
      arm.add(upper);
      const fist = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), skin);
      fist.position.set(side * 0.04, -0.2, side * 0.08);
      arm.add(fist);
      man.add(arm);
      this.driverArms.push(arm);
    }

    car.group.add(man);
    this.driver = man;
  }

  /** Interior neon breathes while the pack is still running. */
  private pulseCabinLights(): void {
    const t = performance.now() * 0.006;
    for (const car of this.cars) {
      if (!car.cabinLight || car.crashed) continue;
      car.cabinLight.intensity = 3.4 + Math.sin(t + car.id) * 1.5;
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

  /** Shorting electrics once the wreck is in the lake. */
  private flickerLamps(car: RacerCar, delta: number): void {
    this.flickT += delta;
    const buzz = Math.sin(this.flickT * 37.4) * Math.sin(this.flickT * 11.7);
    const drop = buzz > 0.42 ? 0.04 + Math.random() * 0.14 : 0.45 + Math.random() * 0.55;
    const m = THREE.MathUtils.clamp(drop, 0.03, 1);
    for (const lamp of car.lamps) {
      lamp.mat.color.copy(lamp.color).multiplyScalar(m);
      lamp.mat.opacity = lamp.opacity * (0.25 + m * 0.75);
    }
    for (let i = 0; i < car.lights.length; i++) {
      car.lights[i]!.intensity = car.lightIntensities[i]! * m;
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
   * Wide-body GT-R / Skyline. Every box overlaps its neighbours — cabin sits
   * on the hull, wing posts span boot to blade, lights sit in the bumpers.
   */
  private buildSkyline(slot: number): {
    group: THREE.Group;
    wheels: THREE.Object3D[];
    lights: THREE.PointLight[];
    lamps: Lamp[];
    sideWindows: THREE.Mesh[];
    cabinLight: THREE.PointLight;
  } {
    const group = new THREE.Group();
    const wheels: THREE.Object3D[] = [];
    const lights: THREE.PointLight[] = [];
    const lamps: Lamp[] = [];
    const sideWindows: THREE.Mesh[] = [];
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
      color: 0x16303a,
      roughness: 0.08,
      metalness: 0.2,
      transparent: true,
      opacity: 0.32,
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
    const plate = new THREE.MeshStandardMaterial({
      color: 0xe8e4c8,
      roughness: 0.7,
    });

    const length = 4.6;
    const width = 1.88;
    // Hull centre / height chosen so cabin, boot and bumpers all bite into it.
    const hullY = 0.4;
    const hullH = 0.36;

    addBox(group, paint, length * 0.94, hullH, width * 0.86, 0.04, hullY, 0, true);
    addBox(group, paint, length * 0.7, 0.2, width * 1.02, 0, hullY + 0.02, 0, true);

    // Bonnet — sits on the hull, overlapping the cabin scuttle.
    addBox(group, paint, length * 0.4, 0.12, width * 0.84, length * 0.18, hullY + 0.2, 0, true);
    addBox(group, carbon, 0.62, 0.05, width * 0.5, length * 0.16, hullY + 0.26, 0);
    addBox(group, dark, 0.2, 0.04, 0.26, length * 0.18, hullY + 0.29, 0.18);
    addBox(group, dark, 0.2, 0.04, 0.26, length * 0.18, hullY + 0.29, -0.18);

    // Cabin is a beltline plus pillars so the glass is actually a window.
    const cabinY = 0.72;
    addBox(group, paint, length * 0.42, 0.16, width * 0.8, -0.3, 0.56, 0, true);
    addBox(group, paint, length * 0.36, 0.08, width * 0.74, -0.36, cabinY + 0.32, 0, true);
    for (const px of [-0.88, 0.18]) {
      for (const pz of [width * 0.36, -width * 0.36]) {
        addBox(group, paint, 0.08, 0.46, 0.08, px, 0.82, pz, true);
      }
    }
    addBox(group, dark, 0.34, 0.1, 0.32, -0.22, 0.5, 0.12);
    addBox(group, glass, 0.06, 0.28, width * 0.68, -0.08, cabinY + 0.04, 0);
    sideWindows.push(
      addBox(group, glass, 0.36, 0.22, 0.05, -0.28, cabinY + 0.02, width * 0.38),
    );
    sideWindows.push(
      addBox(group, glass, 0.36, 0.22, 0.05, -0.28, cabinY + 0.02, -width * 0.38),
    );
    addBox(group, glass, 0.06, 0.24, width * 0.64, -0.94, cabinY + 0.02, 0);

    // Cabin neon — dash, roof lining and door cards, lit from inside the glass.
    addLampBox(group, lamps, 0.85, 0.03, 0.72, -0.05, cabinY - 0.1, 0, glowCol, 0.95);
    addLampBox(group, lamps, 1.05, 0.025, 0.85, -0.32, cabinY + 0.2, 0, glowCol, 0.85);
    addLampBox(group, lamps, 0.7, 0.08, 0.02, -0.28, cabinY + 0.02, width * 0.32, glowCol, 0.9);
    addLampBox(group, lamps, 0.7, 0.08, 0.02, -0.28, cabinY + 0.02, -width * 0.32, glowCol, 0.9);
    const cabinLight = new THREE.PointLight(glowCol, 3.4, 3.2, 2);
    cabinLight.position.set(-0.2, cabinY, 0);
    group.add(cabinLight);
    lights.push(cabinLight);

    // Boot deck — bites the cabin rear and the hull.
    const bootX = -1.2;
    const bootY = hullY + 0.14;
    addBox(group, paint, 1.2, 0.16, width * 0.82, bootX, bootY, 0, true);

    addBox(group, dark, length * 0.68, 0.1, 0.09, -0.04, hullY - 0.12, width * 0.46);
    addBox(group, dark, length * 0.68, 0.1, 0.09, -0.04, hullY - 0.12, -width * 0.46);

    const bumperY = hullY - 0.08;
    addBox(group, dark, 0.32, 0.24, width * 0.98, length * 0.46, bumperY, 0);
    addBox(group, dark, 0.22, 0.1, 0.7, length * 0.5, bumperY + 0.02, 0);
    addBox(group, dark, 0.18, 0.08, width * 1.0, length * 0.44, bumperY - 0.1, 0);
    addBox(group, dark, 0.3, 0.22, width * 0.96, -length * 0.46, bumperY, 0);
    for (let i = -2; i <= 2; i++) {
      addBox(group, dark, 0.1, 0.1, 0.05, -length * 0.5, bumperY - 0.06, i * 0.15);
    }

    // Wing: posts span boot top to blade so nothing hangs in space.
    const wingX = bootX - 0.28;
    const wingY = bootY + 0.28;
    const postH = 0.32;
    const postY = bootY + postH * 0.5;
    const postZ = width * 0.3;
    addBox(group, carbon, 0.18, 0.06, width * 0.92, wingX, wingY, 0);
    addBox(group, carbon, 0.05, 0.14, 0.2, wingX - 0.06, wingY + 0.04, postZ);
    addBox(group, carbon, 0.05, 0.14, 0.2, wingX - 0.06, wingY + 0.04, -postZ);
    addBox(group, dark, 0.07, postH, 0.07, wingX + 0.04, postY, postZ);
    addBox(group, dark, 0.07, postH, 0.07, wingX + 0.04, postY, -postZ);

    const mirrorZ = width * 0.42;
    addBox(group, dark, 0.1, 0.06, 0.16, 0.12, cabinY, mirrorZ);
    addBox(group, dark, 0.12, 0.08, 0.16, 0.16, cabinY + 0.02, mirrorZ + 0.1);
    addBox(group, dark, 0.1, 0.06, 0.16, 0.12, cabinY, -mirrorZ);
    addBox(group, dark, 0.12, 0.08, 0.16, 0.16, cabinY + 0.02, -mirrorZ - 0.1);

    const roundLights = slot % 2 === 0;
    for (const side of [-1, 1] as const) {
      if (roundLights) {
        for (const inset of [0.1, 0.26]) {
          const lamp = addLamp(
            group,
            lamps,
            new THREE.CylinderGeometry(0.07, 0.07, 0.07, 10),
            0xfff4dc,
            1,
          );
          lamp.rotation.z = Math.PI / 2;
          lamp.position.set(length * 0.47, bumperY + 0.06, side * (width * 0.2 + inset));
        }
      } else {
        addLampBox(group, lamps, 0.07, 0.08, 0.34, length * 0.47, bumperY + 0.06, side * width * 0.26, 0xfff4dc, 1);
      }
      addLampBox(group, lamps, 0.05, 0.05, 0.08, length * 0.46, bumperY + 0.02, side * width * 0.46, 0xff9a2a, 1);
      addLampBox(group, lamps, 0.06, 0.1, 0.36, -length * 0.47, bumperY + 0.06, side * width * 0.26, 0xff1a1a, 1);
      addLampBox(group, lamps, 0.05, 0.04, 0.16, -length * 0.47, bumperY - 0.02, side * width * 0.2, 0xff1a1a, 1);
    }

    addBox(group, chrome, 0.16, 0.06, 0.34, -length * 0.5, bumperY - 0.04, 0.16);
    addBox(group, chrome, 0.16, 0.06, 0.34, -length * 0.5, bumperY - 0.04, -0.16);
    addBox(group, plate, 0.04, 0.12, 0.34, length * 0.5, bumperY, 0);
    addBox(group, plate, 0.04, 0.12, 0.34, -length * 0.5, bumperY + 0.02, 0);

    // Belly / sill glow — on the hull, not a separate floating pad.
    addLampBox(group, lamps, length * 0.86, 0.04, width * 0.8, 0, hullY - 0.16, 0, glowCol, 0.9);
    addLampBox(group, lamps, length * 0.72, 0.04, 0.05, 0, hullY - 0.14, width * 0.48, glowCol, 0.85);
    addLampBox(group, lamps, length * 0.72, 0.04, 0.05, 0, hullY - 0.14, -width * 0.48, glowCol, 0.85);

    const glowLight = new THREE.PointLight(glowCol, 3.6, 13, 2);
    glowLight.position.set(0, hullY - 0.05, 0);
    group.add(glowLight);
    lights.push(glowLight);

    const wheelX = length * 0.32;
    const wheelZ = width * 0.52;
    for (const lx of [-wheelX, wheelX]) {
      for (const lz of [-wheelZ, wheelZ]) {
        const hubGroup = new THREE.Group();
        hubGroup.position.set(lx, 0.32, lz);
        const tyreMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.33, 0.33, 0.26, 12),
          tyre,
        );
        tyreMesh.rotation.x = Math.PI / 2;
        hubGroup.add(tyreMesh);
        const rim = new THREE.Mesh(
          new THREE.CylinderGeometry(0.19, 0.19, 0.28, 10),
          hub,
        );
        rim.rotation.x = Math.PI / 2;
        hubGroup.add(rim);
        for (let s = 0; s < 5; s++) {
          const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.26, 0.035), hub);
          spoke.rotation.x = Math.PI / 2;
          spoke.rotation.z = (s / 5) * Math.PI;
          hubGroup.add(spoke);
        }
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 8), chrome);
        cap.rotation.x = Math.PI / 2;
        hubGroup.add(cap);
        const cal = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.16), caliper);
        cal.position.set(0, 0.02, lz > 0 ? 0.02 : -0.02);
        hubGroup.add(cal);
        group.add(hubGroup);
        wheels.push(hubGroup);
      }
    }

    return { group, wheels, lights, lamps, sideWindows, cabinLight };
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

function addLamp(
  parent: THREE.Object3D,
  lamps: Lamp[],
  geometry: THREE.BufferGeometry,
  color: number,
  opacity: number,
): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: opacity >= 0.85,
  });
  lamps.push({ mat, color: new THREE.Color(color), opacity });
  const mesh = new THREE.Mesh(geometry, mat);
  parent.add(mesh);
  return mesh;
}

function addLampBox(
  parent: THREE.Object3D,
  lamps: Lamp[],
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  color: number,
  opacity: number,
): THREE.Mesh {
  const mesh = addLamp(parent, lamps, new THREE.BoxGeometry(w, h, d), color, opacity);
  mesh.position.set(x, y, z);
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
