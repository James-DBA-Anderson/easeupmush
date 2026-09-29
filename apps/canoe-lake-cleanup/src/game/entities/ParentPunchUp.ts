import * as THREE from "three";
import { stepWalk, clearWalkSpot } from "../world/blocking";
import { getPlayPark } from "../world/park";
import { isInLake, nearestShore, outwardAt } from "../world/lake";
import { groundHeight } from "../world/terrain";
import { gateOutside, nearestGate } from "../world/pathRoute";
import { Face } from "./Face";
import { Grumble } from "../effects/Grumble";

const COATS = [0x2f4f7f, 0x8b3a3a, 0x3f6b4a, 0x5a4a7a, 0x2b2b33, 0xb06a2c, 0xd8c8a0];
const TROUSERS = [0x2b3038, 0x4a4a52, 0x6b5a44, 0x1a3a6a];
const SKIN = [0xf0c8a0, 0xd9a066, 0x8d5a3b, 0x5c3a26];

const ROWS = [
  "YOUR KID STARTED IT",
  "HE PUSHED MINE!",
  "COME ON THEN",
  "OUTSIDE, NOW",
  "I'LL HAVE YOU",
  "SAY THAT AGAIN",
  "DON'T YOU TOUCH HIM",
  "YOU WHAT MATE",
];
const HOSED = [
  "OI THAT'S COLD",
  "YOU'VE SOAKED ME",
  "RIGHT WE'RE GOING",
  "THIS ISN'T OVER",
  "LOOK AT MY BLOUSE",
  "YOU CAN'T DO THAT",
];
const BROKEN = [
  "ALL RIGHT, ALL RIGHT",
  "KIDS, WE'RE GOING",
  "THIS IS EMBARRASSING",
  "COME ON, LEAVE IT",
];

const COUNT = 4;
const RING = 1.35;
const SOAK_NEED = 0.85;
const FIGHT_COMPLAIN = 95;

type Phase = "arriving" | "rowing" | "fighting" | "leaving";
type ParentPhase = "arriving" | "fighting" | "stunned" | "leaving";

interface Parent {
  group: THREE.Group;
  legs: THREE.Group[];
  arms: THREE.Group[];
  face: Face;
  foe: number;
  slot: THREE.Vector3;
  exit: THREE.Vector3;
  phase: ParentPhase;
  step: number;
  swing: number;
  swung: boolean;
  soak: number;
  stun: number;
  shoutIn: number;
  arrived: boolean;
}

/**
 * Afternoon scrap: a handful of parents go at it on the grass by the play
 * park. Hose them till they pack it in; leave it and the warden phones.
 */
export class ParentPunchUp {
  private scene: THREE.Scene;
  private parents: Parent[] = [];
  private home = new THREE.Vector3();
  private phase: Phase = "arriving";
  private grumble: Grumble | null = null;
  private fightFor = 0;
  private rowIn = 1.2;
  private gatherIn = 28;
  private started = false;
  private startedClaim = false;
  private cleared = false;
  private complained = false;
  private complaintClaim = false;
  private hitFrom: THREE.Vector3 | null = null;
  private gone = false;
  private tmp = new THREE.Vector3();

  constructor(scene: THREE.Scene, pin: { x: number; z: number }) {
    this.scene = scene;
    const play = getPlayPark();
    if (play) {
      this.home.set(
        play.gate.x - play.gate.inwardX * 5.8,
        0,
        play.gate.z - play.gate.inwardZ * 5.8,
      );
    } else {
      this.home.set(pin.x, 0, pin.z);
    }
    const dry = clearWalkSpot(this.home.x, this.home.z, {
      radius: 0.5,
      reach: 8,
    });
    this.home.set(dry.x, 0, dry.z);
    if (isInLake(this.home.x, this.home.z)) {
      const shore = nearestShore(this.home.x, this.home.z);
      const out = outwardAt(shore);
      this.home.set(shore.x + out.x * 3.2, 0, shore.y + out.y * 3.2);
    }

    const gate = nearestGate(this.home.x, this.home.z);
    const approach = gateOutside(gate, 10);
    const leave = gateOutside(gate, 12);

    for (let i = 0; i < COUNT; i++) {
      const ang = (i / COUNT) * Math.PI * 2 + 0.2;
      const slot = new THREE.Vector3(
        this.home.x + Math.cos(ang) * RING,
        0,
        this.home.z + Math.sin(ang) * RING,
      );
      const start = new THREE.Vector3(
        approach.x + (Math.random() - 0.5) * 3.5,
        0,
        approach.y + (Math.random() - 0.5) * 3.5,
      );
      const exit = new THREE.Vector3(
        leave.x + (Math.random() - 0.5) * 3,
        0,
        leave.y + (Math.random() - 0.5) * 3,
      );
      this.parents.push(this.buildParent(start, slot, exit, i ^ 1));
    }
  }

  public isActive(): boolean {
    return !this.gone && this.phase !== "leaving";
  }

  public isDone(): boolean {
    return this.gone;
  }

  public claimStarted(): boolean {
    if (!this.startedClaim) return false;
    this.startedClaim = false;
    return true;
  }

  public claimCleared(): boolean {
    if (!this.cleared) return false;
    this.cleared = false;
    return true;
  }

  public claimComplaint(): boolean {
    if (!this.complaintClaim) return false;
    this.complaintClaim = false;
    return true;
  }

  public claimHit(): THREE.Vector3 | null {
    const at = this.hitFrom;
    this.hitFrom = null;
    return at;
  }

  public aimSpot(): { x: number; z: number } {
    return { x: this.home.x, z: this.home.z };
  }

  public getPositions(): THREE.Vector3[] {
    return this.parents
      .filter((p) => p.group.visible)
      .map((p) => p.group.position.clone());
  }

  public takeSpray(point: THREE.Vector3, heavy: boolean): boolean {
    if (this.gone || this.phase === "leaving") return false;
    let hit = false;
    const reach = heavy ? 1.55 : 0.95;
    for (const parent of this.parents) {
      if (!parent.group.visible) continue;
      if (parent.phase === "leaving") continue;
      const here = parent.group.position;
      const dx = point.x - here.x;
      const dy = point.y - (here.y + 1.2);
      const dz = point.z - here.z;
      if (dx * dx + dy * dy * 0.45 + dz * dz > reach * reach) continue;
      hit = true;
      parent.soak = Math.min(1, parent.soak + (heavy ? 0.55 : 0.28));
      parent.face.setMood("shocked");
      this.say(parent, HOSED);
      if (parent.soak >= SOAK_NEED && parent.phase !== "stunned") {
        parent.phase = "stunned";
        parent.stun = 0.85;
        parent.swing = 0;
      }
    }
    if (hit) this.tryBreakUp();
    return hit;
  }

  public update(delta: number, player: THREE.Vector3): void {
    this.grumble =
      this.grumble?.update(delta, this.tmp.set(this.home.x, 1.9, this.home.z)) ===
      false
        ? null
        : this.grumble;

    let anyHere = false;
    for (const parent of this.parents) {
      parent.face.update(delta);
      if (!parent.group.visible) continue;
      anyHere = true;
      this.tickParent(parent, delta, player);
    }

    if (this.phase === "arriving") {
      this.gatherIn -= delta;
      if (this.parents.every((p) => p.arrived) || this.gatherIn <= 0) {
        for (const parent of this.parents) parent.arrived = true;
        this.phase = "rowing";
        this.rowIn = 1.4 + Math.random() * 1.2;
      }
    } else if (this.phase === "rowing") {
      this.rowIn -= delta;
      this.banter(delta);
      if (this.rowIn <= 0) this.beginFight();
    } else if (this.phase === "fighting") {
      this.fightFor += delta;
      this.banter(delta);
      this.maybeSwingAtPlayer(player);
      if (!this.complained && this.fightFor > FIGHT_COMPLAIN) {
        this.complained = true;
        this.complaintClaim = true;
      }
      if (this.fightFor > 155) this.breakUp(false);
    }

    if (!anyHere && this.phase === "leaving") {
      if (!this.cleared && this.started) this.cleared = true;
      this.gone = true;
    }
  }

  public dispose(): void {
    this.grumble?.dispose();
    for (const parent of this.parents) this.scene.remove(parent.group);
    this.parents = [];
  }

  private beginFight(): void {
    this.phase = "fighting";
    if (!this.started) {
      this.started = true;
      this.startedClaim = true;
    }
    for (const parent of this.parents) {
      if (parent.phase === "leaving" || parent.phase === "stunned") continue;
      parent.phase = "fighting";
      parent.face.setMood("angry");
    }
  }

  private tryBreakUp(): void {
    const soaked = this.parents.filter((p) => p.soak >= SOAK_NEED).length;
    if (soaked < 2) return;
    this.breakUp();
  }

  private breakUp(credit = true): void {
    if (this.phase === "leaving") return;
    this.phase = "leaving";
    if (credit) this.cleared = true;
    for (const parent of this.parents) {
      if (!parent.group.visible) continue;
      parent.phase = "leaving";
      parent.face.setMood("disgusted");
    }
    const lead = this.parents[0];
    if (lead) this.say(lead, BROKEN);
  }

  private tickParent(parent: Parent, delta: number, player: THREE.Vector3): void {
    const here = parent.group.position;
    here.y = groundHeight(here.x, here.z);

    if (parent.phase === "stunned") {
      parent.stun -= delta;
      parent.group.rotation.z = Math.sin(parent.stun * 18) * 0.12;
      parent.arms[0]!.rotation.x = -0.4;
      parent.arms[1]!.rotation.x = -0.2;
      if (parent.stun <= 0) {
        parent.group.rotation.z = 0;
        parent.phase = "leaving";
        this.tryBreakUp();
      }
      return;
    }

    if (parent.phase === "leaving") {
      parent.group.rotation.z = 0;
      if (this.amble(parent, parent.exit, delta, 2.6) < 0.55) {
        parent.group.visible = false;
      }
      return;
    }

    // Standing on the ring, waiting for the last parent — idle bristling.
    if (this.phase === "arriving" || this.phase === "rowing") {
      if (this.amble(parent, parent.slot, delta, 2.2) < 0.28) {
        parent.arrived = true;
        this.faceToward(parent, this.home);
        parent.step += delta * 2.2;
        parent.group.rotation.z = Math.sin(parent.step) * 0.04;
        parent.arms[0]!.rotation.x = -0.35;
        parent.arms[1]!.rotation.x = -0.55;
        parent.face.setMood("angry");
      }
      return;
    }

    const foe = this.parents[parent.foe];
    if (!foe || !foe.group.visible || foe.phase === "leaving") {
      parent.phase = "leaving";
      return;
    }

    const to = foe.group.position;
    const gap = Math.hypot(to.x - here.x, to.z - here.z);
    this.faceToward(parent, to);
    parent.face.setMood("angry");

    if (gap > 1.15) {
      parent.swing = 0;
      this.amble(parent, to, delta, 2.4);
      parent.arms[0]!.rotation.x = -0.7;
      parent.arms[1]!.rotation.x = -1.15;
      return;
    }

    if (parent.swing <= 0) parent.swing = 0.52 + Math.random() * 0.12;
    parent.swing = Math.max(0, parent.swing - delta);
    const dur = 0.55;
    const t = 1 - parent.swing / dur;
    this.posePunch(parent, t);
    if (!parent.swung && t >= 0.42) {
      parent.swung = true;
      this.nudge(foe, here);
      if (gap < 1.7 && player.distanceTo(here) < 1.55) {
        this.hitFrom = here.clone();
      }
    }
    if (parent.swing <= 0) parent.swung = false;
  }

  private maybeSwingAtPlayer(player: THREE.Vector3): void {
    if (this.hitFrom) return;
    for (const parent of this.parents) {
      if (parent.phase !== "fighting") continue;
      const here = parent.group.position;
      if (here.distanceTo(player) > 1.45) continue;
      if (parent.swing > 0.2) continue;
      parent.swing = 0.5;
      parent.swung = false;
      this.hitFrom = here.clone();
      this.say(parent, ["COME HERE YOU", "I'LL HAVE YOU", "OUT THE WAY"]);
      return;
    }
  }

  private posePunch(parent: Parent, t: number): void {
    let wind: number;
    let snap: number;
    if (t < 0.35) {
      wind = t / 0.35;
      snap = 0;
    } else if (t < 0.55) {
      wind = 1;
      snap = (t - 0.35) / 0.2;
    } else {
      wind = 1 - (t - 0.55) / 0.45;
      snap = 1 - (t - 0.55) / 0.45;
    }
    parent.arms[1]!.rotation.x = -0.5 - wind * 1.6 + snap * 2.6;
    parent.arms[1]!.rotation.z = -0.15 - wind * 0.85 + snap * 0.5;
    parent.arms[0]!.rotation.x = -0.95;
    parent.arms[0]!.rotation.z = 0.45;
    parent.legs[0]!.rotation.x = 0.25;
    parent.legs[1]!.rotation.x = -0.4;
    parent.group.rotation.z = wind * 0.1 - snap * 0.06;
    parent.group.position.y = groundHeight(parent.group.position.x, parent.group.position.z) + snap * 0.07;
  }

  private nudge(foe: Parent, from: THREE.Vector3): void {
    const here = foe.group.position;
    const dx = here.x - from.x;
    const dz = here.z - from.z;
    const len = Math.hypot(dx, dz) || 1;
    const landed = stepWalk(here.x, here.z, (dx / len) * 0.28, (dz / len) * 0.28, 0.35, {
      x: here.x,
      z: here.z,
    });
    here.x = landed.x;
    here.z = landed.z;
    foe.face.setMood("shocked");
  }

  private amble(
    parent: Parent,
    to: THREE.Vector3,
    delta: number,
    speed: number,
  ): number {
    const here = parent.group.position;
    const gap = Math.hypot(to.x - here.x, to.z - here.z);
    if (gap < 0.05) return 0;
    const step = Math.min(gap, speed * delta);
    const landed = stepWalk(
      here.x,
      here.z,
      ((to.x - here.x) / gap) * step,
      ((to.z - here.z) / gap) * step,
      0.35,
      { x: here.x, z: here.z },
    );
    here.x = landed.x;
    here.z = landed.z;
    this.faceToward(parent, to);
    parent.step += delta * speed * 4.4;
    const swing = Math.sin(parent.step) * 0.55;
    parent.legs[0]!.rotation.x = swing;
    parent.legs[1]!.rotation.x = -swing;
    parent.arms[0]!.rotation.x = -swing * 0.7;
    parent.arms[1]!.rotation.x = swing * 0.7;
    parent.arms[0]!.rotation.z = 0;
    parent.arms[1]!.rotation.z = 0;
    return Math.hypot(to.x - here.x, to.z - here.z);
  }

  private faceToward(parent: Parent, to: THREE.Vector3): void {
    parent.group.rotation.y = Math.atan2(
      to.x - parent.group.position.x,
      to.z - parent.group.position.z,
    );
  }

  private banter(delta: number): void {
    for (const parent of this.parents) {
      if (parent.phase === "leaving" || !parent.group.visible) continue;
      parent.shoutIn -= delta;
      if (parent.shoutIn > 0) continue;
      parent.shoutIn = 2.4 + Math.random() * 3.6;
      if (Math.random() < 0.55) this.say(parent, ROWS);
    }
  }

  private say(parent: Parent, lines: readonly string[]): void {
    this.grumble?.dispose();
    const at = parent.group.position.clone();
    at.y += 1.85;
    this.grumble = new Grumble(
      this.scene,
      lines[Math.floor(Math.random() * lines.length)]!,
      at,
    );
  }

  private buildParent(
    start: THREE.Vector3,
    slot: THREE.Vector3,
    exit: THREE.Vector3,
    foe: number,
  ): Parent {
    const pick = <T>(list: readonly T[]): T =>
      list[Math.floor(Math.random() * list.length)]!;
    const coat = new THREE.MeshStandardMaterial({
      color: pick(COATS),
      roughness: 0.9,
    });
    const trousers = new THREE.MeshStandardMaterial({
      color: pick(TROUSERS),
      roughness: 0.92,
    });
    const skin = new THREE.MeshStandardMaterial({
      color: pick(SKIN),
      roughness: 0.82,
    });

    const group = new THREE.Group();
    group.position.copy(start);
    group.rotation.y = Math.atan2(slot.x - start.x, slot.z - start.z);
    this.scene.add(group);

    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.55, 0.28), coat);
    chest.position.y = 1.15;
    chest.castShadow = true;
    group.add(chest);

    const head = new THREE.Group();
    head.position.y = 1.58;
    group.add(head);
    const face = new Face(skin, 1);
    face.setMood("angry");
    head.add(face.group);

    const legs: THREE.Group[] = [];
    const arms: THREE.Group[] = [];
    for (const side of [-1, 1] as const) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.12, 0.78, 0);
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.72, 0.16), trousers);
      thigh.geometry.translate(0, -0.36, 0);
      thigh.castShadow = true;
      leg.add(thigh);
      group.add(leg);
      legs.push(leg);

      const arm = new THREE.Group();
      arm.position.set(side * 0.28, 1.35, 0);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.52, 0.12), coat);
      upper.geometry.translate(0, -0.26, 0);
      arm.add(upper);
      group.add(arm);
      arms.push(arm);
    }

    return {
      group,
      legs,
      arms,
      face,
      foe,
      slot,
      exit,
      phase: "arriving",
      step: Math.random() * Math.PI * 2,
      swing: 0,
      swung: false,
      soak: 0,
      stun: 0,
      shoutIn: 0.6 + Math.random() * 1.8,
      arrived: false,
    };
  }
}
