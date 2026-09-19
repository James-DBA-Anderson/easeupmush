import * as THREE from "three";
import { distanceToShore, isInLake, PATH_OUTER } from "../world/lake";
import { insidePark } from "../world/fence";
import { stepWalk } from "../world/blocking";
import { gateOutside, nearestGate } from "../world/pathRoute";
import { Grumble } from "../effects/Grumble";

const COATS = [0x2a2a32, 0x3a3a44, 0x4a3a2a, 0x1e2a38, 0x5a2a2a, 0x2f4a3a];
const TROUSERS = [0x1a1a22, 0x2b3038, 0x3a3428];
const SKIN = [0xf0c8a0, 0xd9a066, 0x8d5a3b, 0x5c3a26];

const BANTER = [
  "ONE MORE, LADS",
  "PARK'S QUIET TONIGHT",
  "PASS US THAT CAN",
  "SWEET AS NUT",
  "WHO'S GOT THE TIZZY?",
  "AIN'T GOING NOWHERE",
  "LOVELY SPOT THIS",
];
const MOVED = [
  "ALRIGHT, WE'RE GOING",
  "KEEP YOUR HAIR ON",
  "WE'RE MOVING, MUSH",
  "NIGHT, THEN",
  "ALRIGHT OFFICER",
  "WE HEAR YA",
];

/** How near you have to get before they pack it in. */
const CHASE_OFF = 7.5;
/** How long they'll sit before the complaint comes in. */
const LOITER_MIN = 95;
const LOITER_MAX = 170;

type Phase = "arriving" | "loitering" | "leaving";

interface Guest {
  group: THREE.Group;
  legs: THREE.Object3D[];
  arms: THREE.Object3D[];
  stand: THREE.Vector3;
  step: number;
}

/**
 * A few late drinkers on the grass after dark. Walk over or hose them and
 * they clear off; leave them and the warden gets a complaint.
 */
export class Drunks {
  private scene: THREE.Scene;
  private root = new THREE.Group();
  private guests: Guest[] = [];
  private home = new THREE.Vector3();
  private exit = new THREE.Vector3();
  private phase: Phase = "arriving";
  private loiter = LOITER_MIN + Math.random() * (LOITER_MAX - LOITER_MIN);
  private chatIn = 5 + Math.random() * 8;
  private walkPhase = 0;
  private grumble: Grumble | null = null;
  private complaint = false;
  private credited = false;
  private gone = false;

  constructor(scene: THREE.Scene, spot: THREE.Vector2) {
    this.scene = scene;
    this.home.set(spot.x, 0, spot.y);

    const gate = nearestGate(spot.x, spot.y);
    const outside = gateOutside(gate, 10);
    this.exit.set(outside.x, 0, outside.y);

    const count = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const stand = new THREE.Vector3(
        Math.cos(angle) * (0.7 + Math.random() * 0.5),
        0,
        Math.sin(angle) * (0.7 + Math.random() * 0.5),
      );
      this.guests.push(this.buildGuest(stand));
    }

    // Walk in from outside the nearest gate.
    this.root.position.set(
      outside.x + (Math.random() - 0.5) * 2,
      0,
      outside.y + (Math.random() - 0.5) * 2,
    );

    scene.add(this.root);
  }

  private buildGuest(stand: THREE.Vector3): Guest {
    const pick = <T>(list: readonly T[]): T =>
      list[Math.floor(Math.random() * list.length)]!;
    const coat = new THREE.MeshStandardMaterial({
      color: pick(COATS),
      roughness: 0.92,
    });
    const trousers = new THREE.MeshStandardMaterial({
      color: pick(TROUSERS),
      roughness: 0.95,
    });
    const skin = new THREE.MeshStandardMaterial({
      color: pick(SKIN),
      roughness: 0.85,
    });

    const group = new THREE.Group();
    group.position.copy(stand);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.55, 0.24), coat);
    torso.position.y = 1.05;
    torso.castShadow = true;
    group.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), skin);
    head.position.y = 1.45;
    head.castShadow = true;
    group.add(head);

    const legs: THREE.Object3D[] = [];
    const arms: THREE.Object3D[] = [];
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.48, 0.1), coat);
      arm.geometry.translate(0, -0.2, 0);
      arm.position.set(side * 0.24, 1.2, 0);
      group.add(arm);
      arms.push(arm);

      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.13, 0.58, 0.14),
        trousers,
      );
      leg.geometry.translate(0, -0.29, 0);
      leg.position.set(side * 0.1, 0.72, 0);
      group.add(leg);
      legs.push(leg);
    }

    const can = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.12, 8),
      new THREE.MeshStandardMaterial({
        color: 0xc4a020,
        roughness: 0.45,
        metalness: 0.4,
      }),
    );
    can.position.set(0.08, -0.42, 0.02);
    arms[1]!.add(can);
    arms[1]!.rotation.x = -0.9;

    this.root.add(group);
    return { group, legs, arms, stand, step: Math.random() * Math.PI * 2 };
  }

  public getPosition(): THREE.Vector3 {
    return this.root.position.clone();
  }

  public guestPositions(): THREE.Vector3[] {
    return this.guests.map((g) =>
      g.group.getWorldPosition(new THREE.Vector3()),
    );
  }

  public isGone(): boolean {
    return this.gone;
  }

  /** True once when they leave after you moved them on. */
  public claimCredit(): boolean {
    if (!this.credited) return false;
    this.credited = false;
    return true;
  }

  /** True once when they sat too long and someone called it in. */
  public claimComplaint(): boolean {
    if (!this.complaint) return false;
    this.complaint = false;
    return true;
  }

  /** Walked over or hosed — pack it in. */
  public scarper(byPlayer = true): void {
    if (this.phase === "leaving") return;
    this.phase = "leaving";
    if (byPlayer) this.credited = true;
    this.say(MOVED);
    for (const guest of this.guests) {
      guest.arms[0]!.rotation.x = 0;
      guest.arms[1]!.rotation.x = -0.55;
    }
  }

  private say(lines: readonly string[]): void {
    this.grumble?.dispose();
    this.grumble = new Grumble(
      this.scene,
      lines[Math.floor(Math.random() * lines.length)]!,
      this.root.position.clone().setY(1.8),
    );
  }

  public update(delta: number, player: THREE.Vector3): void {
    this.grumble =
      this.grumble?.update(delta, this.root.position.clone().setY(1.8)) === false
        ? null
        : this.grumble;

    if (this.phase === "arriving") {
      if (this.amble(this.home, delta, 1.7) < 0.35) {
        this.phase = "loitering";
        this.root.position.copy(this.home);
        for (const guest of this.guests) {
          guest.group.position.copy(guest.stand);
          guest.legs[0]!.rotation.x = 0.15;
          guest.legs[1]!.rotation.x = -0.1;
        }
      }
      return;
    }

    if (this.phase === "leaving") {
      this.runOff(delta);
      return;
    }

    if (this.root.position.distanceTo(player) < CHASE_OFF) {
      this.scarper(true);
      return;
    }

    this.loiter -= delta;
    this.chatIn -= delta;
    if (this.chatIn <= 0) {
      this.chatIn = 8 + Math.random() * 12;
      this.say(BANTER);
    }

    for (const guest of this.guests) {
      guest.step += delta * 1.4;
      guest.group.rotation.y = Math.sin(guest.step * 0.5) * 0.08;
      guest.group.position.y = Math.sin(guest.step) * 0.01;
    }

    if (this.loiter <= 0) {
      this.complaint = true;
      this.scarper(false);
    }
  }

  private amble(to: THREE.Vector3, delta: number, speed: number): number {
    const here = this.root.position;
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
    this.root.rotation.y = Math.atan2(to.x - here.x, to.z - here.z);
    this.walkPhase += delta * 10;
    const trot = Math.sin(this.walkPhase);
    for (const guest of this.guests) {
      guest.legs[0]!.rotation.x = trot * 0.85;
      guest.legs[1]!.rotation.x = -trot * 0.85;
      guest.arms[0]!.rotation.x = -trot * 0.4;
    }
    return Math.hypot(to.x - here.x, to.z - here.z);
  }

  private runOff(delta: number): void {
    const here = this.root.position;
    const to = this.exit;
    const gap = Math.hypot(to.x - here.x, to.z - here.z);
    if (gap < 1.5) {
      this.gone = true;
      return;
    }
    const step = Math.min(gap, 5.5 * delta);
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
    this.root.rotation.y = Math.atan2(to.x - here.x, to.z - here.z);
    this.walkPhase += delta * 14;
    const trot = Math.sin(this.walkPhase);
    for (const guest of this.guests) {
      guest.legs[0]!.rotation.x = trot * 1.1;
      guest.legs[1]!.rotation.x = -trot * 1.1;
    }
    // Off the map far enough.
    if (Math.hypot(here.x, here.z) > 210) this.gone = true;
  }

  public dispose(): void {
    this.grumble?.dispose();
    this.scene.remove(this.root);
  }
}

/** Grass just off the path — good places to sit with a tin. */
export function drunkSpots(): THREE.Vector2[] {
  const spots: THREE.Vector2[] = [];
  for (let a = 0; a < Math.PI * 2; a += 0.35) {
    const r = PATH_OUTER + 8 + ((a * 17) % 6);
    const x = Math.cos(a) * r * 1.15;
    const z = Math.sin(a) * r;
    if (isInLake(x, z)) continue;
    if (!insidePark(x, z)) continue;
    const d = distanceToShore(x, z);
    if (d < PATH_OUTER + 3 || d > PATH_OUTER + 24) continue;
    spots.push(new THREE.Vector2(x, z));
  }
  for (const [x, z] of [
    [-40, 55],
    [30, 70],
    [90, 40],
    [-70, 20],
    [50, -70],
    [-20, -85],
  ] as const) {
    if (!insidePark(x, z) || isInLake(x, z)) continue;
    spots.push(new THREE.Vector2(x, z));
  }
  return spots;
}
