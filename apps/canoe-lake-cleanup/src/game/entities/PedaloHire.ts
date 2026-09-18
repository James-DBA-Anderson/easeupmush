import * as THREE from "three";
import { Grumble } from "../effects/Grumble";
import { parkGates } from "../world/fence";
import { waterSpot, nearestShore, outwardAt } from "../world/lake";
import {
  drivePedaloIndex,
  freePedaloCount,
  hatchQueueSpot,
  pedaloHeading,
  pedaloPedalPhase,
  pedaloSeatPoseAt,
  pedaloSpeed,
  pedaloWorldPos,
  releasePedalo,
  reservePedalo,
  pedaloIsSunk,
} from "../world/park";
import type { Boatman } from "./Boatman";

const COATS = [0x2f4f7f, 0xd8452f, 0x3f6b4a, 0xe0b83c, 0x5a4a7a, 0xd8c8a0];
const TROUSERS = [0x2b3038, 0x4a4a52, 0x3a5a6a, 0x6b5a44];
const SKIN = [0xf0c8a0, 0xd9a066, 0x8d5a3b, 0x5c3a26];

const VISITOR_LINES = [
  "TWO PLEASE",
  "JUST THE ONE",
  "HOW MUCH FOR AN HOUR?",
  "WE'LL TAKE A SWAN",
];

type Phase =
  | "arriving"
  | "paying"
  | "toBoat"
  | "boarding"
  | "cruising"
  | "returning"
  | "landing"
  | "leaving";

interface Guest {
  group: THREE.Group;
  legs: THREE.Group[];
  arms: THREE.Group[];
  step: number;
}

/**
 * A visitor (or pair) who pays at the hatch, gets helped into a swan boat by
 * the boatman, pedals about, then brings it back.
 */
export class PedaloHire {
  private scene: THREE.Scene;
  private boatman: Boatman;
  private guests: Guest[] = [];
  private phase: Phase = "arriving";
  private timer = 0;
  private boatIndex = -1;
  private cruiseFor = 55 + Math.random() * 70;
  private target = new THREE.Vector3();
  private exit = new THREE.Vector3();
  private grumble: Grumble | null = null;
  private gone = false;
  private boarded = false;
  private boardWait = 0;

  constructor(scene: THREE.Scene, boatman: Boatman) {
    this.scene = scene;
    this.boatman = boatman;

    const hatch = hatchQueueSpot() ?? new THREE.Vector3(0, 0, 40);
    const gates = parkGates();
    const gate =
      gates.length > 0
        ? gates[Math.floor(Math.random() * gates.length)]!
        : new THREE.Vector2(hatch.x + 30, hatch.z + 40);
    this.exit.set(gate.x + (Math.random() - 0.5) * 8, 0, gate.y - 12);

    const party = Math.random() < 0.55 ? 2 : 1;
    for (let i = 0; i < party; i++) {
      const start = new THREE.Vector3(
        gate.x + (Math.random() - 0.5) * 6,
        0,
        gate.y + (Math.random() - 0.5) * 6,
      );
      this.guests.push(this.buildGuest(start));
    }
  }

  public isDone(): boolean {
    return this.gone;
  }

  public guestPositions(): THREE.Vector3[] {
    return this.guests
      .filter((g) => g.group.visible)
      .map((g) => g.group.position.clone());
  }

  public update(delta: number): void {
    this.grumble =
      this.grumble?.update(
        delta,
        this.guests[0]?.group.position ?? new THREE.Vector3(),
      ) === false
        ? null
        : this.grumble;

    if (this.timer > 0) this.timer -= delta;

    switch (this.phase) {
      case "arriving":
        this.arrive(delta);
        break;
      case "paying":
        this.pay(delta);
        break;
      case "toBoat":
        this.toBoat(delta);
        break;
      case "boarding":
        break;
      case "cruising":
        this.cruise(delta);
        break;
      case "returning":
        this.returnHire(delta);
        break;
      case "landing":
        this.land(delta);
        break;
      case "leaving":
        this.leave(delta);
        break;
    }
  }

  public dispose(): void {
    this.grumble?.dispose();
    if (this.boatIndex >= 0) releasePedalo(this.boatIndex);
    for (const g of this.guests) this.scene.remove(g.group);
  }

  private arrive(delta: number): void {
    const hatch = hatchQueueSpot();
    if (!hatch) {
      this.gone = true;
      return;
    }
    let allIn = true;
    this.guests.forEach((g, i) => {
      const spot = hatch
        .clone()
        .add(new THREE.Vector3((i - 0.5) * 0.9, 0, 0.4 * i));
      if (!this.walk(g, spot, delta, 2.5)) allIn = false;
    });
    if (allIn) {
      this.phase = "paying";
      this.timer = 3.2;
      this.boatman.takePayment();
      this.say(
        VISITOR_LINES[Math.floor(Math.random() * VISITOR_LINES.length)]!,
      );
    }
  }

  private pay(_delta: number): void {
    if (this.timer > 0) return;
    if (this.boatman.isBusy() || freePedaloCount() < 1) {
      this.timer = 0.8;
      return;
    }
    const hatch = hatchQueueSpot();
    if (!hatch) {
      this.gone = true;
      return;
    }
    this.boatIndex = reservePedalo(hatch.x, hatch.z);
    if (this.boatIndex < 0) {
      this.phase = "leaving";
      return;
    }
    this.phase = "toBoat";
    this.boarded = false;
    this.boardWait = 0;
    this.boatman.helpAboard(this.boatIndex, () => {
      this.boarded = true;
    });
  }

  private toBoat(delta: number): void {
    const boat = pedaloWorldPos(this.boatIndex);
    if (!boat) {
      this.phase = "leaving";
      return;
    }
    const shore = nearestShore(boat.x, boat.z);
    const out = outwardAt(shore);
    const bank = new THREE.Vector3(
      shore.x + out.x * 1.55,
      0,
      shore.y + out.y * 1.55,
    );

    this.boardWait += delta;
    let allIn = true;
    this.guests.forEach((g, i) => {
      const spot = bank
        .clone()
        .add(new THREE.Vector3((i - 0.5) * 0.7, 0, 0));
      if (!this.walk(g, spot, delta, 2.6)) allIn = false;
    });

    // Guests or boatman jammed — snap aboard and cast off.
    if (this.boardWait > 8) {
      this.boarded = true;
      allIn = true;
      this.guests.forEach((g, i) => {
        g.group.position.set(bank.x + (i - 0.5) * 0.7, 0, bank.z);
      });
    }

    if (allIn && this.boarded) {
      this.seatGuests();
      this.phase = "cruising";
      this.cruiseFor = 55 + Math.random() * 70;
      this.pickCruiseTarget();
    }
  }

  private cruise(delta: number): void {
    if (this.abortIfSunk()) return;
    this.cruiseFor -= delta;
    this.seatGuests();
    this.steerToward(this.target, delta);

    const boat = pedaloWorldPos(this.boatIndex);
    if (boat && boat.distanceTo(this.target) < 4) this.pickCruiseTarget();

    if (this.cruiseFor <= 0) {
      this.phase = "returning";
      const hatch = hatchQueueSpot();
      if (hatch) {
        const shore = nearestShore(hatch.x, hatch.z);
        const out = outwardAt(shore);
        this.target.set(
          shore.x - out.x * 3.2,
          0,
          shore.y - out.y * 3.2,
        );
      }
    }
  }

  private returnHire(delta: number): void {
    if (this.abortIfSunk()) return;
    this.seatGuests();
    this.steerToward(this.target, delta);
    const boat = pedaloWorldPos(this.boatIndex);
    if (boat && boat.distanceTo(this.target) < 3.5) {
      this.phase = "landing";
      this.timer = 2.4;
      this.unseatGuests();
    }
  }

  /** Hire swan went under — guests scramble for the bank. */
  private abortIfSunk(): boolean {
    if (this.boatIndex < 0 || !pedaloIsSunk(this.boatIndex)) return false;
    this.unseatGuests();
    this.boatIndex = -1;
    this.boarded = false;
    this.phase = "leaving";
    return true;
  }

  private land(_delta: number): void {
    if (this.timer > 0) return;
    releasePedalo(this.boatIndex);
    this.boatIndex = -1;
    this.phase = "leaving";
  }

  private leave(delta: number): void {
    let allOut = true;
    for (const g of this.guests) {
      if (!this.walk(g, this.exit, delta, 2.6)) allOut = false;
    }
    if (allOut) this.gone = true;
  }

  private steerToward(at: THREE.Vector3, delta: number): void {
    const boat = pedaloWorldPos(this.boatIndex);
    if (!boat) return;
    const want = Math.atan2(-(at.x - boat.x), -(at.z - boat.z));
    const heading = pedaloHeading(this.boatIndex);
    let turn = want - heading;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    const steer = THREE.MathUtils.clamp(turn * 1.8, -1, 1);
    drivePedaloIndex(this.boatIndex, delta, 0.85, steer);
  }

  private pickCruiseTarget(): void {
    const spot = waterSpot();
    this.target.set(spot.x, 0, spot.y);
  }

  private seatGuests(): void {
    const phase = pedaloPedalPhase(this.boatIndex);
    const moving = Math.abs(pedaloSpeed(this.boatIndex)) > 0.15;
    this.guests.forEach((g, i) => {
      const side = this.guests.length === 1 ? 0 : i === 0 ? -1 : 1;
      const seat = pedaloSeatPoseAt(this.boatIndex, side);
      if (!seat) return;
      g.group.position.set(seat.x, seat.y - 0.95, seat.z);
      g.group.rotation.y = seat.yaw;
      if (moving) {
        // Opposite legs on the crank — proper pedalling.
        const kick = Math.sin(phase) * 0.7;
        g.legs[0]!.rotation.x = 0.95 + kick;
        g.legs[1]!.rotation.x = 0.95 - kick;
        g.arms[0]!.rotation.x = -0.45 + Math.sin(phase * 0.5) * 0.08;
        g.arms[1]!.rotation.x = -0.45 - Math.sin(phase * 0.5) * 0.08;
      } else {
        g.legs[0]!.rotation.x = 1.15;
        g.legs[1]!.rotation.x = 1.15;
        g.arms[0]!.rotation.x = -0.35;
        g.arms[1]!.rotation.x = -0.35;
      }
    });
  }

  private unseatGuests(): void {
    const boat = pedaloWorldPos(this.boatIndex);
    const hatch = hatchQueueSpot();
    this.guests.forEach((g, i) => {
      g.legs[0]!.rotation.x = 0;
      g.legs[1]!.rotation.x = 0;
      if (!boat) return;
      const away = hatch
        ? new THREE.Vector3().subVectors(hatch, boat).setY(0).normalize()
        : new THREE.Vector3(0, 0, 1);
      g.group.position.set(
        boat.x + away.x * (1.5 + i * 0.5),
        0,
        boat.z + away.z * (1.5 + i * 0.5),
      );
    });
  }

  private walk(
    guest: Guest,
    at: THREE.Vector3,
    delta: number,
    pace: number,
  ): boolean {
    const here = guest.group.position;
    const dx = at.x - here.x;
    const dz = at.z - here.z;
    const gap = Math.hypot(dx, dz);
    if (gap < 0.4) {
      guest.legs[0]!.rotation.x = 0;
      guest.legs[1]!.rotation.x = 0;
      return true;
    }
    const step = Math.min(gap, pace * delta);
    here.x += (dx / gap) * step;
    here.z += (dz / gap) * step;
    guest.group.rotation.y = Math.atan2(dx, dz);
    guest.step += delta * 10;
    const swing = Math.sin(guest.step) * 0.55;
    guest.legs[0]!.rotation.x = swing;
    guest.legs[1]!.rotation.x = -swing;
    guest.arms[0]!.rotation.x = -swing * 0.45;
    guest.arms[1]!.rotation.x = swing * 0.45;
    return false;
  }

  private say(text: string): void {
    const lead = this.guests[0];
    if (!lead) return;
    this.grumble?.dispose();
    this.grumble = new Grumble(
      this.scene,
      text,
      lead.group.position.clone().add(new THREE.Vector3(0, 2.05, 0)),
    );
  }

  private buildGuest(at: THREE.Vector3): Guest {
    const group = new THREE.Group();
    group.position.copy(at);
    const skin = new THREE.MeshStandardMaterial({
      color: SKIN[Math.floor(Math.random() * SKIN.length)]!,
      roughness: 0.9,
    });
    const coat = new THREE.MeshStandardMaterial({
      color: COATS[Math.floor(Math.random() * COATS.length)]!,
      roughness: 0.85,
    });
    const trousers = new THREE.MeshStandardMaterial({
      color: TROUSERS[Math.floor(Math.random() * TROUSERS.length)]!,
      roughness: 0.9,
    });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.68, 0.3), coat);
    torso.position.y = 1.12;
    torso.castShadow = true;
    group.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.3), skin);
    head.position.y = 1.68;
    group.add(head);

    const legs: THREE.Group[] = [];
    const arms: THREE.Group[] = [];
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.13, 0.76, 0);
      const thigh = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.76, 0.17),
        trousers,
      );
      thigh.position.y = -0.38;
      leg.add(thigh);
      group.add(leg);
      legs.push(leg);

      const arm = new THREE.Group();
      arm.position.set(side * 0.3, 1.35, 0);
      const sleeve = new THREE.Mesh(
        new THREE.BoxGeometry(0.13, 0.58, 0.13),
        coat,
      );
      sleeve.position.y = -0.26;
      arm.add(sleeve);
      group.add(arm);
      arms.push(arm);
    }

    this.scene.add(group);
    return { group, legs, arms, step: Math.random() * Math.PI * 2 };
  }
}
