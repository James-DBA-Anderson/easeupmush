import * as THREE from "three";
import { stepWalk, clearWalkSpot } from "../world/blocking";
import { groundHeight } from "../world/terrain";
import { gateOutside, nearestGate } from "../world/pathRoute";
import type { GymStation } from "../world/park";
import { Face } from "./Face";
import { Grumble } from "../effects/Grumble";

const VESTS = [0x1c1c22, 0xc45a4a, 0x2f4f7f, 0xd4a018, 0x3f6b4a, 0xf2f0ea];
const SHORTS = [0x1a1a22, 0x2b3038, 0x6b2030, 0x1a3a6a];
const SKIN = [0xf0c8a0, 0xd9a066, 0x8d5a3b, 0x5c3a26];

const LOVES = [
  "YEAH THAT'S IT",
  "KEEP THAT COMING",
  "LOVELY AND COLD",
  "FREE SHOWER MATE",
  "DON'T STOP",
  "THAT'S THE PUMP",
  "BEAUTY",
  "RIGHT ON THE LATS",
];

const GRUNT = ["ONE MORE", "COME ON", "LIGHT WEIGHT", "EASY", "PUSH"];

const HIP = 0.82;

type Phase = "arriving" | "working" | "leaving";

interface Lifter {
  group: THREE.Group;
  legs: THREE.Group[];
  arms: THREE.Group[];
  face: Face;
  station: GymStation;
  /** Dry ground just in front of the station. */
  approach: THREE.Vector3;
  exit: THREE.Vector3;
  phase: Phase;
  step: number;
  phaseT: number;
  glow: number;
  shoutIn: number;
  gruntIn: number;
  stuck: number;
}

/**
 * Daytime bodybuilders on the outdoor gym. They walk in, work the stations,
 * and treat the lance as a free cool-down.
 */
export class GymCrew {
  private scene: THREE.Scene;
  private lifters: Lifter[] = [];
  private linger = 100 + Math.random() * 70;
  private working = false;
  private gone = false;
  private grumble: Grumble | null = null;

  constructor(scene: THREE.Scene, stations: readonly GymStation[]) {
    this.scene = scene;
    const pick = stations.slice();
    for (let i = pick.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const a = pick[i]!;
      pick[i] = pick[j]!;
      pick[j] = a;
    }
    const use = pick.slice(0, Math.min(3, pick.length));
    for (const station of use) {
      const approach = standOff(station, -1.85);
      const gate = nearestGate(station.x, station.z);
      const outside = gateOutside(gate, 10);
      const leaveAt = gateOutside(gate, 12);
      const start = new THREE.Vector3(
        outside.x + (Math.random() - 0.5) * 3,
        0,
        outside.y + (Math.random() - 0.5) * 3,
      );
      const exit = new THREE.Vector3(
        leaveAt.x + (Math.random() - 0.5) * 3,
        0,
        leaveAt.y + (Math.random() - 0.5) * 3,
      );
      this.lifters.push(this.build(start, station, approach, exit));
    }
  }

  public getPositions(): THREE.Vector3[] {
    return this.lifters
      .filter((l) => l.group.visible)
      .map((l) => l.group.position.clone());
  }

  public isDone(): boolean {
    return this.gone;
  }

  /** A jet hit a lifter. They lap it up and stay on the kit. */
  public takeSpray(point: THREE.Vector3, heavy: boolean): boolean {
    const reach = heavy ? 1.7 : 1.05;
    for (const lifter of this.lifters) {
      if (!lifter.group.visible || lifter.phase === "leaving") continue;
      const here = lifter.group.position;
      const chestY = here.y + (lifter.phase === "working" ? liftChest(lifter) : 1.25);
      const dx = point.x - here.x;
      const dy = point.y - chestY;
      const dz = point.z - here.z;
      if (dx * dx + dy * dy * 0.5 + dz * dz > reach * reach) continue;
      lifter.glow = 1.4;
      lifter.face.setMood("pleased");
      if (lifter.shoutIn <= 0) {
        lifter.shoutIn = 1.6;
        this.say(lifter, LOVES);
      }
      return true;
    }
    return false;
  }

  public update(delta: number, raining: boolean): void {
    this.grumble =
      this.grumble?.update(
        delta,
        this.lifters[0]?.group.position.clone().setY(2.2) ?? new THREE.Vector3(),
      ) === false
        ? null
        : this.grumble;

    let anyWorking = false;
    let anyVisible = false;
    for (const lifter of this.lifters) {
      lifter.face.update(delta);
      lifter.glow = Math.max(0, lifter.glow - delta);
      lifter.shoutIn = Math.max(0, lifter.shoutIn - delta);
      if (!lifter.group.visible) continue;
      anyVisible = true;
      this.tick(lifter, delta);
      if (lifter.phase === "working") anyWorking = true;
    }

    if (!this.working && anyWorking && this.lifters.every((l) => l.phase !== "arriving")) {
      this.working = true;
    }
    if (this.working) {
      this.linger -= delta;
      if (this.linger <= 0 || raining) this.sendHome();
    }
    if (this.working && !anyVisible) {
      this.dispose();
      this.gone = true;
    }
  }

  public dispose(): void {
    this.grumble?.dispose();
    this.grumble = null;
    for (const lifter of this.lifters) this.scene.remove(lifter.group);
    this.lifters = [];
    this.gone = true;
  }

  private sendHome(): void {
    this.working = false;
    this.linger = 0;
    for (const lifter of this.lifters) {
      if (lifter.phase === "leaving") continue;
      this.standUp(lifter);
      lifter.group.position.x = lifter.approach.x;
      lifter.group.position.z = lifter.approach.z;
      lifter.group.position.y = groundHeight(lifter.approach.x, lifter.approach.z);
      lifter.phase = "leaving";
    }
  }

  private tick(lifter: Lifter, delta: number): void {
    if (lifter.phase === "arriving") {
      const left = this.amble(lifter, lifter.approach, delta, 2.3);
      lifter.stuck = left < 0.08 ? lifter.stuck + delta : 0;
      if (left < 0.4 || lifter.stuck > 6) {
        lifter.phase = "working";
        lifter.phaseT = Math.random() * Math.PI * 2;
        this.faceStation(lifter);
      }
      return;
    }

    if (lifter.phase === "leaving") {
      if (this.amble(lifter, lifter.exit, delta, 2.1) < 0.55) {
        lifter.group.visible = false;
      }
      return;
    }

    lifter.phaseT += delta * (lifter.glow > 0 ? 7.2 : 4.4);
    lifter.gruntIn -= delta;
    if (lifter.glow <= 0) lifter.face.setMood("idle");
    else lifter.face.setMood("pleased");
    if (lifter.gruntIn <= 0 && lifter.glow <= 0 && Math.random() < 0.45) {
      lifter.gruntIn = 5 + Math.random() * 7;
      this.say(lifter, GRUNT);
    }
    this.pose(lifter);
  }

  private pose(lifter: Lifter): void {
    const st = lifter.station;
    const gy = groundHeight(st.x, st.z);
    const pump = Math.sin(lifter.phaseT);
    const up = Math.abs(pump);
    const anchor = onStation(st, 0, 0);
    lifter.group.position.x = anchor.x;
    lifter.group.position.z = anchor.z;
    lifter.group.rotation.x = 0;
    lifter.group.rotation.z = lifter.glow > 0 ? Math.sin(lifter.phaseT * 2) * 0.06 : 0;
    this.faceStation(lifter);

    for (const arm of lifter.arms) {
      arm.rotation.z = 0;
      arm.rotation.x = 0;
    }
    for (const leg of lifter.legs) leg.rotation.x = 0;

    if (st.kind === "pullup") {
      lifter.group.position.y = gy + 0.38 + up * 0.32;
      for (const arm of lifter.arms) arm.rotation.x = -2.65;
      lifter.legs[0]!.rotation.x = 0.35 + up * 0.25;
      lifter.legs[1]!.rotation.x = 0.2 + up * 0.2;
      return;
    }

    if (st.kind === "bars") {
      const dip = 1 - up;
      lifter.group.position.y = gy + 0.22 + up * 0.22;
      for (const [i, arm] of lifter.arms.entries()) {
        const side = i === 0 ? -1 : 1;
        arm.rotation.x = -1.05 - dip * 0.45;
        arm.rotation.z = side * (0.35 + dip * 0.2);
      }
      lifter.legs[0]!.rotation.x = 0.45;
      lifter.legs[1]!.rotation.x = 0.35;
      return;
    }

    if (st.kind === "bench") {
      const seat = onStation(st, 0, 0.12);
      lifter.group.position.x = seat.x;
      lifter.group.position.z = seat.z;
      lifter.group.position.y = gy + 0.55 - HIP;
      lifter.legs[0]!.rotation.x = -1.2;
      lifter.legs[1]!.rotation.x = -1.15;
      const press = -0.4 - up * 1.35;
      for (const arm of lifter.arms) arm.rotation.x = press;
      return;
    }

    if (st.kind === "bike") {
      const seat = onStation(st, 0, -0.08);
      lifter.group.position.x = seat.x;
      lifter.group.position.z = seat.z;
      lifter.group.position.y = gy + 0.95 - HIP;
      lifter.legs[0]!.rotation.x = pump * 0.7;
      lifter.legs[1]!.rotation.x = -pump * 0.7;
      for (const arm of lifter.arms) arm.rotation.x = -0.85;
      return;
    }

    // Air walker — stand on the plates and swing opposite limbs.
    const plates = onStation(st, 0, 0.2);
    lifter.group.position.x = plates.x;
    lifter.group.position.z = plates.z;
    lifter.group.position.y = gy + 0.1;
    lifter.legs[0]!.rotation.x = pump * 0.65;
    lifter.legs[1]!.rotation.x = -pump * 0.65;
    lifter.arms[0]!.rotation.x = -pump * 0.8;
    lifter.arms[1]!.rotation.x = pump * 0.8;
  }

  private faceStation(lifter: Lifter): void {
    lifter.group.rotation.y = lifter.station.yaw;
  }

  private standUp(lifter: Lifter): void {
    lifter.group.rotation.x = 0;
    lifter.group.rotation.z = 0;
    for (const leg of lifter.legs) leg.rotation.x = 0;
    for (const arm of lifter.arms) {
      arm.rotation.x = 0;
      arm.rotation.z = 0;
    }
  }

  private amble(lifter: Lifter, to: THREE.Vector3, delta: number, speed: number): number {
    const here = lifter.group.position;
    const gap = Math.hypot(to.x - here.x, to.z - here.z);
    if (gap < 0.05) return 0;
    const step = Math.min(gap, speed * delta);
    const landed = stepWalk(
      here.x,
      here.z,
      ((to.x - here.x) / gap) * step,
      ((to.z - here.z) / gap) * step,
      0.4,
      { x: here.x, z: here.z },
    );
    here.x = landed.x;
    here.z = landed.z;
    here.y = groundHeight(here.x, here.z);
    lifter.group.rotation.y = Math.atan2(to.x - here.x, to.z - here.z);
    lifter.step += delta * speed * 4.2;
    const swing = Math.sin(lifter.step) * 0.55;
    lifter.legs[0]!.rotation.x = swing;
    lifter.legs[1]!.rotation.x = -swing;
    lifter.arms[0]!.rotation.x = -swing * 0.65;
    lifter.arms[1]!.rotation.x = swing * 0.65;
    lifter.arms[0]!.rotation.z = 0;
    lifter.arms[1]!.rotation.z = 0;
    return Math.hypot(to.x - here.x, to.z - here.z);
  }

  private say(lifter: Lifter, lines: readonly string[]): void {
    this.grumble?.dispose();
    const at = lifter.group.position.clone();
    at.y += 1.9;
    this.grumble = new Grumble(
      this.scene,
      lines[Math.floor(Math.random() * lines.length)]!,
      at,
    );
  }

  private build(
    start: THREE.Vector3,
    station: GymStation,
    approach: THREE.Vector3,
    exit: THREE.Vector3,
  ): Lifter {
    const pick = <T>(list: readonly T[]): T =>
      list[Math.floor(Math.random() * list.length)]!;
    const vest = new THREE.MeshStandardMaterial({ color: pick(VESTS), roughness: 0.85 });
    const shorts = new THREE.MeshStandardMaterial({
      color: pick(SHORTS),
      roughness: 0.9,
    });
    const skin = new THREE.MeshStandardMaterial({ color: pick(SKIN), roughness: 0.75 });

    const group = new THREE.Group();
    group.position.copy(start);
    group.position.y = groundHeight(start.x, start.z);
    this.scene.add(group);

    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.62, 0.32), vest);
    chest.position.y = 1.18;
    chest.castShadow = true;
    group.add(chest);

    const head = new THREE.Group();
    head.position.y = 1.62;
    group.add(head);
    const face = new Face(skin, 0.95);
    head.add(face.group);

    const band = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.05, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xc45a4a, roughness: 0.7 }),
    );
    band.position.y = 0.12;
    head.add(band);

    const legs: THREE.Group[] = [];
    const arms: THREE.Group[] = [];
    for (const side of [-1, 1] as const) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.14, HIP, 0);
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.74, 0.18), shorts);
      thigh.geometry.translate(0, -0.37, 0);
      thigh.castShadow = true;
      leg.add(thigh);
      group.add(leg);
      legs.push(leg);

      const arm = new THREE.Group();
      arm.position.set(side * 0.38, 1.4, 0);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.56, 0.16), skin);
      upper.geometry.translate(0, -0.28, 0);
      upper.castShadow = true;
      arm.add(upper);
      group.add(arm);
      arms.push(arm);
    }

    return {
      group,
      legs,
      arms,
      face,
      station,
      approach,
      exit,
      phase: "arriving",
      step: Math.random() * Math.PI * 2,
      phaseT: 0,
      glow: 0,
      shoutIn: 0,
      gruntIn: 2 + Math.random() * 4,
      stuck: 0,
    };
  }
}

/** World XZ of a point in the station's frame. Local +Z is the kit's facing. */
function onStation(st: GymStation, lx: number, lz: number): { x: number; z: number } {
  const cos = Math.cos(st.yaw);
  const sin = Math.sin(st.yaw);
  return {
    x: st.x + lx * cos + lz * sin,
    z: st.z - lx * sin + lz * cos,
  };
}

function standOff(st: GymStation, lz: number): THREE.Vector3 {
  const at = onStation(st, 0, lz);
  const along = onStation(st, 1, 0);
  const fx = along.x - st.x;
  const fz = along.z - st.z;
  const free = clearWalkSpot(at.x, at.z, {
    radius: 0.45,
    reach: 3.5,
    along: { x: fx, z: fz },
    inland: { x: -fz, z: fx },
  });
  return new THREE.Vector3(free.x, 0, free.z);
}

/** Chest height while posed, for the jet test. */
function liftChest(lifter: Lifter): number {
  if (lifter.station.kind === "pullup") return 1.55;
  if (lifter.station.kind === "bars") return 1.35;
  if (lifter.station.kind === "bench") return 1.05;
  if (lifter.station.kind === "bike") return 1.15;
  return 1.25;
}
