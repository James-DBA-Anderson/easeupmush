import * as THREE from "three";
import { parkGates } from "../world/fence";
import { stepWalk } from "../world/blocking";
import { groundHeight } from "../world/terrain";
import { Face } from "./Face";
import { Grumble } from "../effects/Grumble";
import { PATH_Y } from "../world/lake";

const COATS = [0x2f4f7f, 0x8b3a3a, 0x3f6b4a, 0x5a4a7a, 0x2b2b33, 0xb06a2c, 0xd8c8a0];
const TROUSERS = [0x2b3038, 0x4a4a52, 0x6b5a44, 0x3a5a6a];
const SKIN = [0xf0c8a0, 0xd9a066, 0x8d5a3b, 0x5c3a26];
const BLANKETS = [0xc45a4a, 0x3a6a8a, 0xd4b45a, 0x5a7a4a, 0x8a5a7a];

/** Standing hip height on the figure — must match the mesh. */
const HIP_Y = 0.92;
/** World hip height when sat on the blanket (rug is nearly ground). */
const SIT_HIP_Y = 0.34;
/** Half-up shoo — still low, not standing. */
const SHOO_HIP_Y = 0.55;

const CHAT = [
  "LOVELY DAY",
  "PASS THE CRISPS",
  "MORE TEA?",
  "DON'T MIND IF I DO",
  "CRACKING PICNIC",
  "WATCH THE ANTS",
  "SAVE ME A SARNIE",
];

const GULL_RAID = [
  "OI! GET OFF!",
  "THAT'S OUR LUNCH!",
  "BLOODY SEAGULL!",
  "SHOOD!",
  "NOT THE SARNIES!",
  "GERROUT OF IT!",
];

const GULL_STOLE = [
  "IT'S HAD THE LOT!",
  "RUDE!",
  "THAT WAS MY CHEESE!",
  "LITTLE THIEF!",
  "COME BACK WITH THAT!",
];

const HOSED = [
  "MY SARNIES!",
  "YOU'VE SOAKED THE LOT!",
  "THE CUTLERY!",
  "OI — THAT WAS LUNCH!",
  "LOOK AT THE STATE OF IT!",
  "YOU'VE RUINED THE PICNIC!",
];

type Phase = "arriving" | "settled" | "leaving";

interface Guest {
  group: THREE.Group;
  legs: THREE.Group[];
  arms: THREE.Group[];
  face: Face;
  seat: THREE.Vector3;
  exit: THREE.Vector3;
  phase: Phase;
  step: number;
  chatIn: number;
}

/** Sandwich / fork / knife blasted off the blanket. */
interface FlyingBit {
  mesh: THREE.Object3D;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
}

/**
 * A blanket picnic on the east lawn — a couple of people walk in, sit round
 * the hamper for a while, then pack up and wander off.
 */
export class Picnic {
  private scene: THREE.Scene;
  private root = new THREE.Group();
  private kit!: THREE.Group;
  /** Plate + sarnie pairs for gull raids (even indices = plate). */
  private plates: THREE.Object3D[] = [];
  /** Sarnies and cutlery still on the rug — hose sends these flying. */
  private loose: THREE.Object3D[] = [];
  private flying: FlyingBit[] = [];
  private guests: Guest[] = [];
  private linger: number;
  private settled = false;
  private gone = false;
  private grumble: Grumble | null = null;
  private spot: THREE.Vector3;
  /** Guests flapping at a gull on the blanket. */
  private raidLeft = 0;
  private complained = false;
  private shoutCool = 0;

  constructor(scene: THREE.Scene, at: THREE.Vector2) {
    this.scene = scene;
    const gy = PATH_Y + groundHeight(at.x, at.y);
    this.spot = new THREE.Vector3(at.x, gy, at.y);
    this.linger = 160 + Math.random() * 200;

    this.root.position.copy(this.spot);
    this.root.rotation.y = Math.random() * Math.PI * 2;
    this.buildKit();
    // Blanket's down — they walk over and settle round it.
    this.kit.visible = true;
    this.root.add(this.kit);
    scene.add(this.root);

    const party = 2 + Math.floor(Math.random() * 3);
    const approach = this.pickApproach();
    const exit = this.pickGate();
    for (let i = 0; i < party; i++) {
      const ang = (i / party) * Math.PI * 2 + Math.random() * 0.35;
      const rad = 1.15 + Math.random() * 0.35;
      const seat = new THREE.Vector3(
        this.spot.x + Math.cos(ang) * rad,
        0,
        this.spot.z + Math.sin(ang) * rad,
      );
      const start = approach
        .clone()
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 5,
            0,
            (Math.random() - 0.5) * 5,
          ),
        );
      const leave = exit
        .clone()
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 10,
            0,
            (Math.random() - 0.5) * 10,
          ),
        );
      this.guests.push(this.buildGuest(start, seat, leave));
    }
  }

  public getPosition(): THREE.Vector3 {
    return this.spot.clone();
  }

  public guestPositions(): THREE.Vector3[] {
    return this.guests
      .filter((g) => g.group.visible)
      .map((g) => g.group.position.clone());
  }

  /**
   * Blanket + sitters — dense enough that path walkers go around the picnic
   * instead of cutting between people on the rug.
   */
  public crowdBlockers(): { x: number; z: number }[] {
    if (this.gone) return [];
    const pts: { x: number; z: number }[] = [
      { x: this.spot.x, z: this.spot.z },
    ];
    for (const r of [1.15, 2.05] as const) {
      const n = r < 1.5 ? 6 : 8;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.2;
        pts.push({
          x: this.spot.x + Math.cos(a) * r,
          z: this.spot.z + Math.sin(a) * r,
        });
      }
    }
    for (const g of this.guests) {
      if (!g.group.visible) continue;
      pts.push({ x: g.group.position.x, z: g.group.position.z });
    }
    return pts;
  }

  /** True while the blanket's out and there's still something to steal. */
  public isRaidable(): boolean {
    return this.settled && this.plates.some((p) => p.visible);
  }

  /** World spot of the next plate a gull can snatch. */
  public foodSpot(): THREE.Vector3 | null {
    for (let i = 0; i < this.plates.length; i += 2) {
      const plate = this.plates[i]!;
      if (!plate.visible) continue;
      const at = new THREE.Vector3();
      plate.getWorldPosition(at);
      at.y = 0;
      return at;
    }
    return null;
  }

  /** Gull just landed on the blanket — guests shout and flap. */
  public noticeRaid(): void {
    this.raidLeft = Math.max(this.raidLeft, 2.8);
    this.kit.visible = true;
    this.settled = true;
    const guest =
      this.guests.find((g) => g.phase === "settled") ??
      this.guests.find((g) => g.phase === "arriving");
    if (guest) this.say(guest, GULL_RAID);
  }

  /** Beakful taken — hide a plate and swear about it. */
  public stealBite(): void {
    for (let i = 0; i < this.plates.length; i += 2) {
      const plate = this.plates[i]!;
      const sarnie = this.plates[i + 1];
      if (!plate.visible && !sarnie?.visible) continue;
      plate.visible = false;
      if (sarnie) {
        sarnie.visible = false;
        const idx = this.loose.indexOf(sarnie);
        if (idx >= 0) this.loose.splice(idx, 1);
      }
      this.raidLeft = Math.max(this.raidLeft, 3.2);
      const guest = this.guests.find((g) => g.phase === "settled");
      if (guest) this.say(guest, GULL_STOLE);
      return;
    }
  }

  /** Droplet over the blanket / hamper. */
  public hitBy(point: THREE.Vector3): boolean {
    if (this.gone || !this.kit.visible) return false;
    const dx = point.x - this.spot.x;
    const dz = point.z - this.spot.z;
    if (dx * dx + dz * dz > 1.7 * 1.7) return false;
    return point.y > -0.05 && point.y < 1.15;
  }

  /**
   * Lance on the picnic — sandwiches and cutlery go flying. Returns true
   * once for a complaint.
   */
  public blast(point: THREE.Vector3, from: THREE.Vector3): boolean {
    if (!this.hitBy(point)) return false;

    const away = new THREE.Vector3()
      .subVectors(point, from)
      .setY(0);
    if (away.lengthSq() < 0.01) {
      away.set(point.x - this.spot.x, 0, point.z - this.spot.z);
    }
    if (away.lengthSq() < 0.01) away.set(1, 0, 0);
    away.normalize();

    let flung = 0;
    for (let i = this.loose.length - 1; i >= 0; i--) {
      const mesh = this.loose[i]!;
      if (!mesh.visible) {
        this.loose.splice(i, 1);
        continue;
      }
      const world = new THREE.Vector3();
      mesh.getWorldPosition(world);
      const gap = Math.hypot(world.x - point.x, world.z - point.z);
      if (gap > 1.35 && flung > 0) continue;

      this.kit.remove(mesh);
      this.scene.add(mesh);
      mesh.position.copy(world);
      const kick = 4.5 + Math.random() * 5.5;
      const up = 3.2 + Math.random() * 3.8;
      const side = (Math.random() - 0.5) * 3.2;
      const vel = away
        .clone()
        .multiplyScalar(kick)
        .add(new THREE.Vector3(-away.z * side, up, away.x * side));
      this.flying.push({
        mesh,
        vel,
        spin: new THREE.Vector3(
          (Math.random() - 0.5) * 14,
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 16,
        ),
        life: 4 + Math.random() * 3,
      });
      this.loose.splice(i, 1);
      flung += 1;
    }

    if (flung > 0 || this.loose.length === 0) {
      this.raidLeft = Math.max(this.raidLeft, 2.4);
      if (this.shoutCool <= 0) {
        this.shoutCool = 1.2;
        const guest =
          this.guests.find((g) => g.phase === "settled") ?? this.guests[0];
        if (guest) {
          this.say(guest, HOSED);
          guest.face.setMood("angry");
        }
      }
    }

    if (flung === 0 || this.complained) return false;
    this.complained = true;
    return true;
  }

  public isDone(): boolean {
    return this.gone;
  }

  public update(delta: number): void {
    this.grumble =
      this.grumble?.update(delta, this.spot) === false ? null : this.grumble;
    if (this.raidLeft > 0) this.raidLeft = Math.max(0, this.raidLeft - delta);
    if (this.shoutCool > 0) this.shoutCool = Math.max(0, this.shoutCool - delta);
    this.updateFlying(delta);

    let anyHere = false;
    let anySettled = false;

    for (const guest of this.guests) {
      guest.face.update(delta);

      if (guest.phase === "arriving") {
        if (this.amble(guest, guest.seat, delta, 1.4) < 0.3) {
          guest.phase = "settled";
          guest.group.position.x = guest.seat.x;
          guest.group.position.z = guest.seat.z;
          this.sitPose(guest);
          this.kit.visible = true;
          this.settled = true;
        }
        anyHere = true;
        continue;
      }

      if (guest.phase === "leaving") {
        if (this.amble(guest, guest.exit, delta, 1.5) < 0.5) {
          guest.group.visible = false;
        } else {
          anyHere = true;
        }
        continue;
      }

      anyHere = true;
      anySettled = true;
      this.faceCentre(guest);
      if (this.raidLeft > 0) {
        this.shooPose(guest);
      } else {
        this.sitPose(guest);
        guest.chatIn -= delta;
        if (guest.chatIn <= 0) {
          guest.chatIn = 10 + Math.random() * 18;
          if (Math.random() < 0.5) this.say(guest, CHAT);
        }
      }
    }

    if (this.settled && anySettled) {
      this.linger -= delta;
      if (this.linger <= 0) this.startLeaving();
    }

    if (
      !anyHere &&
      this.guests.every((g) => g.phase === "leaving" || !g.group.visible)
    ) {
      this.gone = true;
    }
  }

  public dispose(): void {
    this.grumble?.dispose();
    for (const bit of this.flying) this.scene.remove(bit.mesh);
    this.flying = [];
    for (const guest of this.guests) this.scene.remove(guest.group);
    this.scene.remove(this.root);
  }

  private updateFlying(delta: number): void {
    const floor = this.spot.y + 0.04;
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const bit = this.flying[i]!;
      bit.life -= delta;
      bit.vel.y -= 16 * delta;
      bit.mesh.position.addScaledVector(bit.vel, delta);
      bit.mesh.rotation.x += bit.spin.x * delta;
      bit.mesh.rotation.y += bit.spin.y * delta;
      bit.mesh.rotation.z += bit.spin.z * delta;
      if (bit.mesh.position.y <= floor) {
        bit.mesh.position.y = floor;
        if (bit.vel.y < 0) bit.vel.y *= -0.28;
        bit.vel.x *= Math.max(0, 1 - 3.5 * delta);
        bit.vel.z *= Math.max(0, 1 - 3.5 * delta);
        bit.spin.multiplyScalar(Math.max(0, 1 - 2.8 * delta));
      }
      if (bit.life > 0) continue;
      this.scene.remove(bit.mesh);
      this.flying.splice(i, 1);
    }
  }

  private startLeaving(): void {
    this.settled = false;
    this.kit.visible = false;
    for (const guest of this.guests) {
      if (guest.phase === "leaving") continue;
      guest.phase = "leaving";
      this.standPose(guest);
    }
  }

  private pickApproach(): THREE.Vector3 {
    const dist = 14 + Math.random() * 12;
    const yaw = Math.PI * 0.92 + (Math.random() - 0.5) * 0.7;
    return new THREE.Vector3(
      this.spot.x + Math.sin(yaw) * dist,
      0,
      this.spot.z + Math.cos(yaw) * dist,
    );
  }

  private pickGate(): THREE.Vector3 {
    const gates = parkGates();
    if (gates.length === 0) {
      return new THREE.Vector3(this.spot.x + 20, 0, this.spot.z - 30);
    }
    let best = gates[0]!;
    let bestScore = Infinity;
    for (const g of gates) {
      const score =
        Math.hypot(g.x - this.spot.x, g.y - this.spot.z) +
        (g.y > this.spot.z ? 18 : 0) +
        (g.x < this.spot.x ? 8 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = g;
      }
    }
    return new THREE.Vector3(best.x, 0, best.y);
  }

  private buildKit(): void {
    this.kit = new THREE.Group();
    const pick = <T>(list: readonly T[]): T =>
      list[Math.floor(Math.random() * list.length)]!;

    const blanket = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.02, 2.2),
      new THREE.MeshStandardMaterial({ color: pick(BLANKETS), roughness: 1 }),
    );
    blanket.position.y = 0.015;
    blanket.receiveShadow = true;
    this.kit.add(blanket);

    // Checked stripe so it reads as a picnic rug, not a slab.
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 0.01, 0.18),
      new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 1 }),
    );
    stripe.position.y = 0.03;
    this.kit.add(stripe);

    const willow = new THREE.MeshStandardMaterial({
      color: 0x8a6a3a,
      roughness: 0.9,
    });
    const basket = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.28, 0.4), willow);
    basket.position.set(0.15, 0.16, -0.15);
    basket.castShadow = true;
    this.kit.add(basket);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.06, 0.42), willow);
    lid.position.set(0.15, 0.34, -0.15);
    lid.rotation.x = -0.35;
    this.kit.add(lid);

    const food = new THREE.MeshStandardMaterial({
      color: 0xe8d8b0,
      roughness: 0.95,
    });
    const steel = new THREE.MeshStandardMaterial({
      color: 0xc8ced4,
      roughness: 0.35,
      metalness: 0.65,
    });
    this.plates = [];
    this.loose = [];
    for (const [x, z] of [
      [-0.55, 0.35],
      [-0.2, 0.55],
      [0.45, 0.4],
    ] as const) {
      const plate = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.14, 0.03, 10),
        food,
      );
      plate.position.set(x, 0.04, z);
      this.kit.add(plate);
      this.plates.push(plate);
      // A wedge of something worth stealing — and worth blasting skywards.
      const sarnie = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.04, 0.08),
        new THREE.MeshStandardMaterial({ color: 0xd4b878, roughness: 0.9 }),
      );
      sarnie.position.set(x, 0.08, z);
      this.kit.add(sarnie);
      this.plates.push(sarnie);
      this.loose.push(sarnie);

      // Fork + knife beside the plate.
      const fork = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.01, 0.16),
        steel,
      );
      fork.position.set(x + 0.2, 0.035, z + 0.02);
      fork.rotation.y = 0.15;
      this.kit.add(fork);
      this.loose.push(fork);

      const knife = new THREE.Mesh(
        new THREE.BoxGeometry(0.018, 0.008, 0.15),
        steel,
      );
      knife.position.set(x + 0.24, 0.032, z - 0.06);
      knife.rotation.y = -0.2;
      this.kit.add(knife);
      this.loose.push(knife);
    }
  }

  private buildGuest(
    start: THREE.Vector3,
    seat: THREE.Vector3,
    exit: THREE.Vector3,
  ): Guest {
    const pick = <T>(list: readonly T[]): T =>
      list[Math.floor(Math.random() * list.length)]!;
    const coat = new THREE.MeshStandardMaterial({
      color: pick(COATS),
      roughness: 0.9,
    });
    const legMat = new THREE.MeshStandardMaterial({
      color: pick(TROUSERS),
      roughness: 0.9,
    });
    const skin = new THREE.MeshStandardMaterial({
      color: pick(SKIN),
      roughness: 0.8,
    });

    const group = new THREE.Group();
    group.position.copy(start);
    group.rotation.y = Math.atan2(seat.x - start.x, seat.z - start.z);
    this.scene.add(group);

    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.22), legMat);
    hips.position.y = 0.92;
    hips.castShadow = true;
    group.add(hips);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.24), coat);
    torso.position.y = 1.28;
    torso.castShadow = true;
    group.add(torso);

    const head = new THREE.Group();
    head.position.y = 1.68;
    group.add(head);
    const face = new Face(skin);
    head.add(face.group);

    const legs: THREE.Group[] = [];
    const arms: THREE.Group[] = [];
    for (const side of [-1, 1] as const) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.11, 0.92, 0);
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.14), legMat);
      thigh.geometry.translate(0, -0.2, 0);
      thigh.castShadow = true;
      leg.add(thigh);
      const shin = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.38, 0.13), legMat);
      shin.geometry.translate(0, -0.19, 0);
      shin.position.y = -0.4;
      shin.castShadow = true;
      leg.add(shin);
      const shoe = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.06, 0.2),
        new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 1 }),
      );
      shoe.position.set(0, -0.4, 0.03);
      shin.add(shoe);
      group.add(leg);
      legs.push(leg);

      const arm = new THREE.Group();
      arm.position.set(side * 0.26, 1.48, 0);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.1), coat);
      upper.geometry.translate(0, -0.21, 0);
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
      seat,
      exit,
      phase: "arriving",
      step: Math.random() * Math.PI * 2,
      chatIn: 5 + Math.random() * 10,
    };
  }

  private amble(
    guest: Guest,
    to: THREE.Vector3,
    delta: number,
    speed: number,
  ): number {
    const here = guest.group.position;
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
    guest.group.rotation.y = Math.atan2(to.x - here.x, to.z - here.z);
    guest.step += delta * speed * 4.5;
    const swing = Math.sin(guest.step) * 0.55;
    guest.legs[0]!.rotation.x = swing;
    guest.legs[1]!.rotation.x = -swing;
    guest.arms[0]!.rotation.x = -swing * 0.7;
    guest.arms[1]!.rotation.x = swing * 0.7;
    guest.group.position.y =
      this.footY(here.x, here.z) + Math.abs(Math.sin(guest.step)) * 0.04;
    guest.face.setMood("idle");
    return gap - step;
  }

  private faceCentre(guest: Guest): void {
    guest.group.rotation.y = Math.atan2(
      this.spot.x - guest.group.position.x,
      this.spot.z - guest.group.position.z,
    );
  }

  private sitPose(guest: Guest): void {
    // Sink the standing figure so the hips meet the blanket (not float above it).
    guest.group.position.y =
      this.footY(guest.group.position.x, guest.group.position.z) +
      (SIT_HIP_Y - HIP_Y);
    guest.legs[0]!.rotation.x = -1.15;
    guest.legs[1]!.rotation.x = -1.05;
    guest.arms[0]!.rotation.x = -0.55;
    guest.arms[1]!.rotation.x = -0.4;
    guest.arms[0]!.rotation.z = 0.15;
    guest.arms[1]!.rotation.z = -0.1;
    guest.face.setMood("pleased");
  }

  /** Half up, arms waving — shooing a gull off the crisps. */
  private shooPose(guest: Guest): void {
    guest.group.position.y =
      this.footY(guest.group.position.x, guest.group.position.z) +
      (SHOO_HIP_Y - HIP_Y);
    guest.legs[0]!.rotation.x = -0.55;
    guest.legs[1]!.rotation.x = -0.45;
    const wave = Math.sin(performance.now() * 0.012) * 0.9;
    guest.arms[0]!.rotation.x = -1.4 + wave;
    guest.arms[1]!.rotation.x = -1.2 - wave * 0.6;
    guest.arms[0]!.rotation.z = 0.35;
    guest.arms[1]!.rotation.z = -0.25;
    guest.face.setMood("angry");
  }

  private standPose(guest: Guest): void {
    this.plantFeet(guest);
    guest.legs[0]!.rotation.x = 0;
    guest.legs[1]!.rotation.x = 0;
    guest.arms[0]!.rotation.x = 0;
    guest.arms[1]!.rotation.x = 0;
    guest.arms[0]!.rotation.z = 0;
    guest.arms[1]!.rotation.z = 0;
  }

  private plantFeet(guest: Guest): void {
    guest.group.position.y = this.footY(
      guest.group.position.x,
      guest.group.position.z,
    );
  }

  private footY(x: number, z: number): number {
    return PATH_Y + groundHeight(x, z);
  }

  private say(guest: Guest, lines: readonly string[]): void {
    this.grumble?.dispose();
    const line = lines[Math.floor(Math.random() * lines.length)]!;
    const at = guest.group.position.clone();
    at.y = 2.1;
    this.grumble = new Grumble(this.scene, line, at);
  }
}
