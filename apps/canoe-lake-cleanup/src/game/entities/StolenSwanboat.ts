import * as THREE from "three";
import { Grumble } from "../effects/Grumble";
import { parkGates } from "../world/fence";
import { stepWalk } from "../world/blocking";
import {
  isInLake,
  nearestShore,
  outwardAt,
  PATH_LOOP,
  wadeFootY,
  waterSpot,
} from "../world/lake";
import { groundHeight } from "../world/terrain";
import {
  boathouseSpot,
  drivePedaloIndex,
  floodPedaloIndex,
  freePedaloCount,
  hatchQueueSpot,
  pedaloFloodAt,
  pedaloHeading,
  pedaloHitByIndex,
  pedaloIsSunk,
  pedaloPedalPhase,
  pedaloSeatPoseAt,
  pedaloSpeed,
  pedaloWorldPos,
  reservePedalo,
} from "../world/park";

const COATS = [0x1a1a22, 0xc8c8d0, 0x2a4a8a, 0xd4a018, 0x6b2030];
const TROUSERS = [0x1e2228, 0x3a3a42, 0x4a5a38];
const SKIN = [0xf0c8a0, 0xd9a066, 0x8d5a3b];

const TAUNTS = [
  "CAN'T CATCH US",
  "YOURS NOW MATE",
  "PEDAL FASTER",
  "COME ON THEN",
  "FREE RIDE LADS",
  "HAVE A CAN!",
];

const ABANDON_LINES = ["SHE'S GOING!", "OUT OUT OUT", "LEG IT"];

/** Hose flecks — needs a long, hard wash before she goes under. */
const FLOOD_SPRAY = 0.00085;
const FLOOD_HEAVY = 0.0017;

/** Full sprint on foot. */
const RUN = 5.2;

type Phase =
  | "arriving"
  | "boarding"
  | "fleeing"
  | "wading"
  | "running"
  | "done";

interface Lad {
  group: THREE.Group;
  legs: THREE.Group[];
  arms: THREE.Group[];
  step: number;
}

interface Can {
  mesh: THREE.Object3D;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

/**
 * Afternoon job: lads sprint in from the gate nearest the hire raft, nick a
 * swan, and pedal off. Hose them under; they tear to the bank then scarper
 * out the nearest exit. Odd can lobbed your way while they're aboard.
 */
export class StolenSwanboat {
  private scene: THREE.Scene;
  private lads: Lad[] = [];
  private phase: Phase = "arriving";
  private boatIndex = -1;
  private target = new THREE.Vector3();
  private exit = new THREE.Vector3();
  private shoreAim = new THREE.Vector3();
  /** Mooring / hatch — where they aim when nicking a boat. */
  private raft = new THREE.Vector3(95, 0, 40);
  private grumble: Grumble | null = null;
  private tauntIn = 4 + Math.random() * 4;
  private retargetIn = 0;
  private boardWait = 0;
  private waitSayIn = 0;
  private sunkClaimed = false;
  private stolenClaimed = false;
  private cleared = false;
  private canHit = false;
  private gone = false;
  private stolen = false;
  private cans: Can[] = [];
  private throwIn = 4 + Math.random() * 4;
  private pathIndex = 0;
  private pathDir: 1 | -1 = 1;
  private pathReady = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    const hatch = hatchQueueSpot();
    const house = boathouseSpot();
    if (hatch) this.raft.copy(hatch);
    else if (house) this.raft.set(house.x, 0, house.z);

    const entry = this.nearestGate(this.raft.x, this.raft.z);
    this.exit.set(entry.x, 0, entry.y);

    for (let i = 0; i < 2; i++) {
      const start = new THREE.Vector3(
        entry.x + (Math.random() - 0.5) * 4,
        0,
        entry.y + (Math.random() - 0.5) * 4,
      );
      // Keep them on dry ground at the gateway.
      if (isInLake(start.x, start.z)) {
        const shore = nearestShore(start.x, start.z);
        const out = outwardAt(shore);
        start.set(shore.x + out.x * 2.5, 0, shore.y + out.y * 2.5);
      }
      this.lads.push(this.buildLad(start));
    }

    // Path round the lake to the raft — never a straight cut through the water.
    this.setPathToward(this.raft.x, this.raft.z);
  }

  public isAlive(): boolean {
    return !this.gone && this.phase !== "done";
  }

  public isActive(): boolean {
    return this.stolen && this.isAlive();
  }

  public isDone(): boolean {
    return this.gone || this.phase === "done";
  }

  public claimStolen(): boolean {
    if (!this.stolenClaimed) return false;
    this.stolenClaimed = false;
    return true;
  }

  public claimSunk(): boolean {
    if (!this.sunkClaimed) return false;
    this.sunkClaimed = false;
    return true;
  }

  public claimCleared(): boolean {
    if (!this.cleared) return false;
    this.cleared = false;
    return true;
  }

  public claimCanHit(): boolean {
    if (!this.canHit) return false;
    this.canHit = false;
    return true;
  }

  public getPositions(): THREE.Vector3[] {
    return this.lads
      .filter((l) => l.group.visible)
      .map((l) => l.group.position.clone());
  }

  public aimSpot(): { x: number; z: number } | null {
    if (!this.stolen || this.phase === "done") return null;
    if (this.boatIndex >= 0 && !pedaloIsSunk(this.boatIndex)) {
      const boat = pedaloWorldPos(this.boatIndex);
      if (boat) return { x: boat.x, z: boat.z };
    }
    const lead = this.lads[0];
    if (!lead || !lead.group.visible) return null;
    return { x: lead.group.position.x, z: lead.group.position.z };
  }

  public takeSpray(point: THREE.Vector3, heavy: boolean): boolean {
    if (this.boatIndex < 0) return false;
    if (this.phase !== "fleeing" && this.phase !== "boarding") return false;
    if (pedaloIsSunk(this.boatIndex)) return false;
    if (!pedaloHitByIndex(this.boatIndex, point)) return false;
    floodPedaloIndex(this.boatIndex, heavy ? FLOOD_HEAVY : FLOOD_SPRAY);
    return true;
  }

  public update(delta: number, player: THREE.Vector3): void {
    const lead = this.lads[0]?.group.position ?? new THREE.Vector3();
    this.grumble =
      this.grumble?.update(delta, lead) === false ? null : this.grumble;

    this.updateCans(delta, player);

    switch (this.phase) {
      case "arriving":
        this.arrive(delta);
        break;
      case "boarding":
        this.board(delta);
        break;
      case "fleeing":
        this.flee(delta, player);
        break;
      case "wading":
        this.wade(delta);
        break;
      case "running":
        this.runOff(delta);
        break;
      default:
        break;
    }
  }

  public dispose(): void {
    this.grumble?.dispose();
    this.grumble = null;
    for (const can of this.cans) this.dropCan(can);
    this.cans = [];
    for (const lad of this.lads) {
      this.scene.remove(lad.group);
      lad.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }
      });
    }
    this.lads = [];
    this.gone = true;
    this.phase = "done";
  }

  private nearestGate(x: number, z: number): THREE.Vector2 {
    const gates = parkGates();
    if (gates.length === 0) return new THREE.Vector2(x + 20, z + 20);
    let best = gates[0]!;
    let bestD = Infinity;
    for (const g of gates) {
      const d = (g.x - x) ** 2 + (g.y - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = g;
      }
    }
    return best.clone();
  }

  /** Short way round the lakeside path toward a world goal. */
  private setPathToward(goalX: number, goalZ: number): void {
    const lead = this.lads[0]?.group.position;
    if (!lead || PATH_LOOP.length < 4) {
      this.pathReady = false;
      return;
    }
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < PATH_LOOP.length; i++) {
      const p = PATH_LOOP[i]!;
      const d = (p.x - lead.x) ** 2 + (p.y - lead.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    this.pathIndex = best;

    let goalI = 0;
    let goalD = Infinity;
    for (let i = 0; i < PATH_LOOP.length; i++) {
      const p = PATH_LOOP[i]!;
      const d = (p.x - goalX) ** 2 + (p.y - goalZ) ** 2;
      if (d < goalD) {
        goalD = d;
        goalI = i;
      }
    }
    const n = PATH_LOOP.length;
    const cw = (goalI - best + n) % n;
    const ccw = (best - goalI + n) % n;
    this.pathDir = cw <= ccw ? 1 : -1;
    this.pathReady = true;
  }

  /**
   * Sprint along PATH_LOOP toward `goal`. Returns true once close enough to
   * peel off the path and make the last dash.
   */
  private runPathThenGoal(
    goal: THREE.Vector3,
    delta: number,
    peelAt = 12,
  ): boolean {
    const lead = this.lads[0]!.group.position;
    const toGoal = Math.hypot(goal.x - lead.x, goal.z - lead.z);
    if (!this.pathReady || toGoal < peelAt) {
      this.pathReady = false;
      let allIn = true;
      this.lads.forEach((lad, i) => {
        const aim = goal
          .clone()
          .add(new THREE.Vector3((i - 0.5) * 0.65, 0, 0));
        if (!this.walkLand(lad, aim, delta, RUN)) allIn = false;
      });
      return allIn && toGoal < 1.4;
    }

    const n = PATH_LOOP.length;
    const node = PATH_LOOP[this.pathIndex]!;
    if (Math.hypot(node.x - lead.x, node.y - lead.z) < 2.4) {
      this.pathIndex = (this.pathIndex + this.pathDir + n) % n;
    }
    const next = PATH_LOOP[this.pathIndex]!;
    const aim = new THREE.Vector3(next.x, 0, next.y);
    for (const lad of this.lads) this.walkLand(lad, aim, delta, RUN);
    return false;
  }

  private arrive(delta: number): void {
    // Run the lakeside path toward the raft first, then grab a swan.
    if (this.boatIndex < 0) {
      const nearRaft = this.runPathThenGoal(this.raft, delta, 16);
      if (!nearRaft) return;

      if (freePedaloCount() < 1) {
        this.waitSayIn -= delta;
        if (this.waitSayIn <= 0) {
          this.say("WHERE'S A SWAN");
          this.waitSayIn = 5;
        }
        return;
      }
      this.boatIndex = reservePedalo(this.raft.x, this.raft.z);
      if (this.boatIndex < 0) return;
      this.phase = "boarding";
      this.boardWait = 0;
      this.pathReady = false;
      this.say("NICK THAT ONE");
    }
  }

  private board(delta: number): void {
    if (this.boatIndex < 0) {
      this.phase = "arriving";
      return;
    }
    if (pedaloIsSunk(this.boatIndex)) {
      this.beginAbandon();
      return;
    }

    const boat = pedaloWorldPos(this.boatIndex);
    if (!boat) {
      this.phase = "arriving";
      this.boatIndex = -1;
      return;
    }
    const shore = nearestShore(boat.x, boat.z);
    const out = outwardAt(shore);
    const bank = new THREE.Vector3(
      shore.x + out.x * 1.4,
      0,
      shore.y + out.y * 1.4,
    );

    this.boardWait += delta;
    let allIn = true;
    this.lads.forEach((lad, i) => {
      const spot = bank.clone().add(new THREE.Vector3((i - 0.5) * 0.65, 0, 0));
      if (!this.walkLand(lad, spot, delta, RUN)) allIn = false;
    });

    if (this.boardWait > 8 || allIn) {
      this.seatLads();
      this.phase = "fleeing";
      this.markStolen();
      this.pickFleeTarget(boat, boat);
      this.say("GO GO GO");
    }
  }

  private markStolen(): void {
    if (this.stolen) return;
    this.stolen = true;
    this.stolenClaimed = true;
  }

  private flee(delta: number, player: THREE.Vector3): void {
    if (this.boatIndex < 0) return;
    if (pedaloIsSunk(this.boatIndex)) {
      this.beginAbandon();
      return;
    }

    this.seatLads();
    this.retargetIn -= delta;
    this.tauntIn -= delta;
    this.throwIn -= delta;
    if (this.tauntIn <= 0) {
      this.say(TAUNTS[Math.floor(Math.random() * TAUNTS.length)]!);
      this.tauntIn = 5 + Math.random() * 7;
    }

    const boat = pedaloWorldPos(this.boatIndex);
    if (!boat) return;

    if (this.throwIn <= 0) {
      this.lobCan(player, boat);
      this.throwIn = 5.5 + Math.random() * 7;
    }

    if (this.retargetIn <= 0 || boat.distanceTo(this.target) < 4) {
      this.pickFleeTarget(boat, player);
      this.retargetIn = 2.5 + Math.random() * 3.5;
    }

    const wet = pedaloFloodAt(this.boatIndex);
    const throttle = 0.92 + (1 - wet) * 0.08;
    this.steerToward(this.target, delta, throttle);

    if (wet >= 1) this.beginAbandon();
  }

  private beginAbandon(): void {
    if (
      this.phase === "wading" ||
      this.phase === "running" ||
      this.phase === "done"
    ) {
      return;
    }
    this.sunkClaimed = true;
    const boat = this.boatIndex >= 0 ? pedaloWorldPos(this.boatIndex) : null;
    this.unseatIntoWater(boat);
    this.boatIndex = -1;

    const from = boat ?? this.lads[0]!.group.position;
    const shore = nearestShore(from.x, from.z);
    const out = outwardAt(shore);
    this.shoreAim.set(
      shore.x + out.x * 2.4,
      0,
      shore.y + out.y * 2.4,
    );
    // Nearest way out from where they hit the bank.
    const gate = this.nearestGate(this.shoreAim.x, this.shoreAim.z);
    this.exit.set(gate.x, 0, gate.y);
    this.phase = "wading";
    this.pathReady = false;
    this.say(ABANDON_LINES[Math.floor(Math.random() * ABANDON_LINES.length)]!);
  }

  private wade(delta: number): void {
    let allOut = true;
    this.lads.forEach((lad, i) => {
      const aim = this.shoreAim
        .clone()
        .add(new THREE.Vector3((i - 0.5) * 0.7, 0, (i - 0.5) * 0.35));
      if (!this.walkRaw(lad, aim, delta, RUN)) allOut = false;
    });
    if (!allOut) return;
    this.setPathToward(this.exit.x, this.exit.z);
    this.phase = "running";
  }

  private runOff(delta: number): void {
    if (this.runPathThenGoal(this.exit, delta, 14)) {
      this.cleared = true;
      this.phase = "done";
      this.gone = true;
      for (const lad of this.lads) lad.group.visible = false;
    }
  }

  private pickFleeTarget(boat: THREE.Vector3, player: THREE.Vector3): void {
    let best: THREE.Vector3 | null = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 8; i++) {
      const spot = waterSpot();
      const at = new THREE.Vector3(spot.x, 0, spot.y);
      const fromPlayer = at.distanceTo(player);
      const fromBoat = at.distanceTo(boat);
      const score = fromPlayer * 1.4 - fromBoat * 0.35 + Math.random() * 4;
      if (score > bestScore) {
        bestScore = score;
        best = at;
      }
    }
    if (best) this.target.copy(best);
    else {
      const spot = waterSpot();
      this.target.set(spot.x, 0, spot.y);
    }
  }

  private steerToward(
    at: THREE.Vector3,
    delta: number,
    throttle: number,
  ): void {
    const boat = pedaloWorldPos(this.boatIndex);
    if (!boat) return;
    const want = Math.atan2(-(at.x - boat.x), -(at.z - boat.z));
    const heading = pedaloHeading(this.boatIndex);
    let turn = want - heading;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    const steer = THREE.MathUtils.clamp(turn * 2.1, -1, 1);
    drivePedaloIndex(this.boatIndex, delta, throttle, steer);
  }

  private lobCan(player: THREE.Vector3, from: THREE.Vector3): void {
    const dx = player.x - from.x;
    const dz = player.z - from.z;
    const gap = Math.hypot(dx, dz);
    if (gap < 4 || gap > 42) return;

    const can = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.16, 10),
      new THREE.MeshStandardMaterial({
        color: 0xc0c4c8,
        metalness: 0.7,
        roughness: 0.35,
      }),
    );
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(0.056, 0.056, 0.035, 10),
      new THREE.MeshStandardMaterial({
        color: 0xb02028,
        metalness: 0.4,
        roughness: 0.5,
      }),
    );
    ring.position.y = 0.02;
    can.add(body);
    can.add(ring);
    const thrower = this.lads[Math.floor(Math.random() * this.lads.length)]!;
    const ox = thrower.group.position.x;
    const oy = thrower.group.position.y + 1.45;
    const oz = thrower.group.position.z;
    can.position.set(ox, oy, oz);
    this.scene.add(can);

    const flight = Math.max(0.55, gap / 16);
    const vx = dx / flight;
    const vz = dz / flight;
    const eyeY = player.y > 0.5 ? player.y : 1.6;
    const vy = (eyeY - oy) / flight + 4.5 * flight;

    this.cans.push({ mesh: can, vx, vy, vz, life: flight + 0.9 });
    this.say("HAVE A CAN!");
  }

  private updateCans(delta: number, player: THREE.Vector3): void {
    for (let i = this.cans.length - 1; i >= 0; i--) {
      const can = this.cans[i]!;
      can.life -= delta;
      can.vy -= 14 * delta;
      can.mesh.position.x += can.vx * delta;
      can.mesh.position.y += can.vy * delta;
      can.mesh.position.z += can.vz * delta;
      can.mesh.rotation.x += delta * 10;
      can.mesh.rotation.z += delta * 12;

      const dx = can.mesh.position.x - player.x;
      const dy = can.mesh.position.y - player.y;
      const dz = can.mesh.position.z - player.z;
      if (dx * dx + dz * dz < 0.65 * 0.65 && Math.abs(dy) < 1.2) {
        this.canHit = true;
        this.dropCan(can);
        this.cans.splice(i, 1);
        continue;
      }

      const ground = isInLake(can.mesh.position.x, can.mesh.position.z)
        ? wadeFootY(can.mesh.position.x, can.mesh.position.z) + 0.05
        : groundHeight(can.mesh.position.x, can.mesh.position.z);
      if (can.life <= 0 || can.mesh.position.y < ground) {
        this.dropCan(can);
        this.cans.splice(i, 1);
      }
    }
  }

  private dropCan(can: Can): void {
    this.scene.remove(can.mesh);
    can.mesh.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    });
  }

  private seatLads(): void {
    const phase = pedaloPedalPhase(this.boatIndex);
    const moving = Math.abs(pedaloSpeed(this.boatIndex)) > 0.15;
    this.lads.forEach((lad, i) => {
      const side = i === 0 ? -1 : 1;
      const seat = pedaloSeatPoseAt(this.boatIndex, side);
      if (!seat) return;
      lad.group.position.set(seat.x, seat.y - 0.95, seat.z);
      lad.group.rotation.y = seat.yaw;
      if (moving) {
        const kick = Math.sin(phase) * 0.7;
        lad.legs[0]!.rotation.x = 0.95 + kick * (i === 0 ? 1 : -1);
        lad.legs[1]!.rotation.x = 0.95 - kick * (i === 0 ? 1 : -1);
        lad.arms[0]!.rotation.x = -0.45 + Math.sin(phase * 0.5) * 0.08;
        lad.arms[1]!.rotation.x = -0.45 - Math.sin(phase * 0.5) * 0.08;
      } else {
        lad.legs[0]!.rotation.x = 1.15;
        lad.legs[1]!.rotation.x = 1.15;
        lad.arms[0]!.rotation.x = -0.35;
        lad.arms[1]!.rotation.x = -0.35;
      }
    });
  }

  private unseatIntoWater(boat: THREE.Vector3 | null): void {
    this.lads.forEach((lad, i) => {
      lad.legs[0]!.rotation.x = 0;
      lad.legs[1]!.rotation.x = 0;
      if (!boat) return;
      const ang = (i - 0.5) * 0.9;
      const x = boat.x + Math.sin(ang) * 1.2;
      const z = boat.z + Math.cos(ang) * 1.2;
      lad.group.position.set(x, wadeFootY(x, z), z);
    });
  }

  private poseFeet(lad: Lad): void {
    const p = lad.group.position;
    p.y = isInLake(p.x, p.z) ? wadeFootY(p.x, p.z) : groundHeight(p.x, p.z);
  }

  /** Dry-land sprint — slides round blockers, refuses the lake. */
  private walkLand(
    lad: Lad,
    at: THREE.Vector3,
    delta: number,
    pace: number,
  ): boolean {
    const here = lad.group.position;
    const dx = at.x - here.x;
    const dz = at.z - here.z;
    const gap = Math.hypot(dx, dz);
    if (gap < 0.5) {
      lad.legs[0]!.rotation.x = 0;
      lad.legs[1]!.rotation.x = 0;
      this.poseFeet(lad);
      return true;
    }
    const step = Math.min(gap, pace * delta);
    const landed = stepWalk(
      here.x,
      here.z,
      (dx / gap) * step,
      (dz / gap) * step,
      0.4,
      { x: here.x, z: here.z },
    );
    here.x = landed.x;
    here.z = landed.z;
    this.poseFeet(lad);
    lad.group.rotation.y = Math.atan2(dx, dz);
    lad.step += delta * 12;
    const swing = Math.sin(lad.step) * 0.65;
    lad.legs[0]!.rotation.x = swing;
    lad.legs[1]!.rotation.x = -swing;
    lad.arms[0]!.rotation.x = -swing * 0.5;
    lad.arms[1]!.rotation.x = swing * 0.5;
    return false;
  }

  /** Sprint through water (abandon only). */
  private walkRaw(
    lad: Lad,
    at: THREE.Vector3,
    delta: number,
    pace: number,
  ): boolean {
    const here = lad.group.position;
    const dx = at.x - here.x;
    const dz = at.z - here.z;
    const gap = Math.hypot(dx, dz);
    if (gap < 0.45) {
      lad.legs[0]!.rotation.x = 0;
      lad.legs[1]!.rotation.x = 0;
      this.poseFeet(lad);
      return true;
    }
    const step = Math.min(gap, pace * delta);
    here.x += (dx / gap) * step;
    here.z += (dz / gap) * step;
    this.poseFeet(lad);
    lad.group.rotation.y = Math.atan2(dx, dz);
    lad.step += delta * 12;
    const swing = Math.sin(lad.step) * 0.65;
    lad.legs[0]!.rotation.x = swing;
    lad.legs[1]!.rotation.x = -swing;
    lad.arms[0]!.rotation.x = -swing * 0.5;
    lad.arms[1]!.rotation.x = swing * 0.5;
    return false;
  }

  private say(text: string): void {
    const lead = this.lads[0];
    if (!lead) return;
    this.grumble?.dispose();
    this.grumble = new Grumble(
      this.scene,
      text,
      lead.group.position.clone().add(new THREE.Vector3(0, 2.05, 0)),
    );
  }

  private buildLad(at: THREE.Vector3): Lad {
    const group = new THREE.Group();
    group.position.copy(at);
    group.position.y = groundHeight(at.x, at.z);
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
