import * as THREE from 'three';
import { PATH_LOOP, loopPoint } from '../world/lake';
import { isBlocked } from '../world/blocking';
import { Grumble } from '../effects/Grumble';
import { TumbleBody } from '../effects/TumbleBody';
import { TYRE_SEGMENT, type Tread } from './Footprint';

const JERSEYS = [0xd8452f, 0x2f6fd8, 0x1f1f26, 0xe0b83c, 0x3f9f5f];
const SKIN = [0xf0c8a0, 0xd9a066, 0x8d5a3b, 0x5c3a26];

const BELL_LINES = [
  "DING DING!",
  "MIND YOUR BACKS",
  "COMING THROUGH",
  "ON YOUR RIGHT",
];
const SPLAT_LINES = [
  "UP MY BACK!",
  "ALL OVER MY TYRES",
  "OH, LOVELY",
  "ARGH!",
  "I'VE COPPED THAT",
];
const EJECT_LINES = [
  "ARGH!",
  "I'M OFF!",
  "WHOA!",
  "MY BIKE!",
  "YOU WHAT?!",
  "OI — MY FACE!",
];

/** The lads on the e-bikes don't ring, and they don't slow down either. */
const LOUT_LINES = [
  "OUT THE WAY!",
  "WOOOO!",
  "GET IN!",
  "SAFE, BRUV",
  "MOVE!",
  "SCUMMER!",
  "I'LL LAY YOU OUT, MUSH",
];
const TRACKSUITS = [0x1f1f26, 0x22303f, 0x2d2438, 0x1c2b1c];

/** How close something ahead has to be before they slow and ring. */
const CLEAR_AHEAD = 5;
const BELL_COOLDOWN = 4;
/** Tyre width, near enough, for running through a mess. */
const TYRE_RANGE = 0.4;
/** How far a tyre keeps printing what it picked up before it runs clean. */
const SMEAR_LENGTH = 9;

export type RiderKind = 'cyclist' | 'ebike';

type Phase = 'riding' | 'crashed';

/** A rider cutting through the park along the lakeside path. */
export class Cyclist {
  public readonly kind: RiderKind;
  private scene: THREE.Scene;
  private group: THREE.Group;
  private rider!: THREE.Group;
  private index: number;
  private direction: 1 | -1;
  private cruise: number;
  private speed: number;
  private sideOffset: number;

  private wheels: THREE.Object3D[] = [];
  private legs: THREE.Mesh[] = [];
  private crank = 0;
  private lean = 0;
  private heading = 0;

  private bellCooldown = 0;
  private grumble: Grumble | null = null;
  private avoiding: THREE.Vector3 | null = null;
  /** Path points left before they've ridden through and gone. */
  private ticketLeft: number;

  /** Metres of line the back tyre still has in it, and the next piece of it
   * for the game to lay down. */
  private smear = 0;
  private laidAt: THREE.Vector3 | null = null;
  private trackAt: Tread | null = null;

  private phase: Phase = 'riding';
  private tumble: TumbleBody | null = null;
  /** Riderless bike still rolling before it tips. */
  private coastLeft = 0;
  private tipped = false;
  private tipSign = 1;
  private tipAmount = 0;
  private linger = 0;
  private riderOffered = false;
  private pendingPed: { at: THREE.Vector3; lout: boolean } | null = null;

  constructor(scene: THREE.Scene, index: number, kind: RiderKind = 'cyclist') {
    this.scene = scene;
    this.kind = kind;
    this.index = index;
    this.direction = Math.random() < 0.5 ? 1 : -1;
    // The e-bikes are quicker, and they're derestricted, whatever they say.
    this.cruise = kind === 'ebike' ? 9 + Math.random() * 3 : 5.5 + Math.random() * 2.5;
    this.speed = this.cruise;
    // Riders keep to the outside, away from the water and the swans. The lads
    // go wherever they like, including straight through the middle.
    this.sideOffset =
      kind === 'ebike' ? (Math.random() - 0.5) * 6 : 1.2 + Math.random() * 1.2;
    this.ticketLeft = PATH_LOOP.length * (0.55 + Math.random() * 0.7);

    this.group = this.build();
    scene.add(this.group);
    this.place();
  }

  private build(): THREE.Group {
    const group = new THREE.Group();
    const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;
    const lout = this.kind === 'ebike';
    const jersey = new THREE.MeshStandardMaterial({
      color: pick(lout ? TRACKSUITS : JERSEYS),
      roughness: 0.8,
    });
    const skin = new THREE.MeshStandardMaterial({ color: pick(SKIN), roughness: 0.8 });
    const shorts = new THREE.MeshStandardMaterial({
      color: lout ? 0x1a1a1e : 0x1e242c,
      roughness: 0.9,
    });
    const metal = new THREE.MeshStandardMaterial({
      color: lout ? pick([0x1a1a1e, 0x22262c, 0x2a2418]) : pick([0xc43a3a, 0x2a4a8a, 0x1f6b4a, 0x2a2a30, 0xd4a018]),
      roughness: 0.45,
      metalness: 0.35,
    });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 1 });
    const spoke = new THREE.MeshStandardMaterial({
      color: 0xc8cdd2,
      roughness: 0.35,
      metalness: 0.7,
    });

    if (lout) this.buildEscooter(group, metal, rubber, spoke);
    else this.buildBicycle(group, metal, rubber, spoke);

    this.rider = new THREE.Group();
    if (lout) this.buildStandingRider(jersey, skin, shorts);
    else this.buildSeatedRider(jersey, skin, shorts);
    group.add(this.rider);
    return group;
  }

  /** Diamond frame, fork, saddle and a chainring you can actually pedal. */
  private buildBicycle(
    group: THREE.Group,
    metal: THREE.Material,
    rubber: THREE.Material,
    spoke: THREE.Material,
  ): void {
    const radius = 0.34;
    const rear = v(0, radius, -0.52);
    const front = v(0, radius, 0.58);
    const bracket = v(0, radius + 0.02, -0.02);
    const seat = v(0, 0.96, -0.22);
    const head = v(0, 0.9, 0.38);

    this.wheels.push(addSpokedWheel(group, rear, radius, 0.032, rubber, spoke));
    this.wheels.push(addSpokedWheel(group, front, radius, 0.032, rubber, spoke));

    spar(group, bracket, seat, 0.035, metal);
    spar(group, seat, head, 0.032, metal);
    spar(group, bracket, head, 0.038, metal);
    spar(group, bracket, rear, 0.028, metal);
    spar(group, seat, rear, 0.026, metal);
    spar(group, head, front.clone().setY(radius + 0.04), 0.03, metal);

    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.26), rubber);
    saddle.position.copy(seat).add(v(0, 0.05, -0.02));
    group.add(saddle);

    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.03), metal);
    stem.position.copy(head).add(v(0, 0.08, 0.02));
    group.add(stem);
    const bars = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.03), metal);
    bars.position.copy(head).add(v(0, 0.16, 0.04));
    group.add(bars);
    for (const side of [-1, 1] as const) {
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.035, 0.035), rubber);
      grip.position.copy(bars.position).add(v(side * 0.22, 0, 0));
      group.add(grip);
    }

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 14), spoke);
    ring.rotation.y = Math.PI / 2;
    ring.position.copy(bracket);
    group.add(ring);
    for (const side of [-1, 1] as const) {
      const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 0.12), metal);
      pedal.position.set(side * 0.12, bracket.y - 0.02, bracket.z);
      group.add(pedal);
    }

    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.05, 0.07),
      new THREE.MeshStandardMaterial({ color: 0xffe7a0, emissive: 0x554410, roughness: 0.4 }),
    );
    lamp.position.set(0, radius + 0.08, 0.66);
    group.add(lamp);
  }

  /** Standing hire scooter — deck, stem, small wheels, battery in the floor. */
  private buildEscooter(
    group: THREE.Group,
    shell: THREE.Material,
    rubber: THREE.Material,
    spoke: THREE.Material,
  ): void {
    const rearR = 0.13;
    const frontR = 0.14;
    const rear = v(0, rearR, -0.42);
    const front = v(0, frontR, 0.5);

    this.wheels.push(addSpokedWheel(group, rear, rearR, 0.028, rubber, spoke));
    this.wheels.push(addSpokedWheel(group, front, frontR, 0.026, rubber, spoke));

    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.045, 0.78), shell);
    deck.position.set(0, 0.16, 0.02);
    deck.castShadow = true;
    group.add(deck);

    const battery = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.36), rubber);
    battery.position.set(0, 0.1, -0.02);
    group.add(battery);

    const rearGuard = new THREE.Mesh(
      new THREE.TorusGeometry(rearR + 0.03, 0.012, 5, 10, Math.PI),
      shell,
    );
    rearGuard.rotation.y = Math.PI / 2;
    rearGuard.rotation.z = Math.PI;
    rearGuard.position.copy(rear);
    group.add(rearGuard);

    const stemBase = v(0, 0.2, 0.34);
    const stemTop = v(0, 1.08, 0.46);
    spar(group, stemBase, stemTop, 0.04, shell);
    spar(group, v(0, 0.2, 0.28), front.clone().setY(frontR + 0.02), 0.028, shell);

    const bars = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.028, 0.028), spoke);
    bars.position.copy(stemTop).add(v(0, 0.02, 0));
    group.add(bars);
    for (const side of [-1, 1] as const) {
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.1, 6), rubber);
      grip.rotation.z = Math.PI / 2;
      grip.position.set(side * 0.2, bars.position.y, bars.position.z);
      group.add(grip);
    }

    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.04, 0.04),
      new THREE.MeshStandardMaterial({
        color: 0xd8ffe8,
        emissive: 0x1a6a40,
        roughness: 0.3,
      }),
    );
    lamp.position.set(0, 0.28, 0.52);
    group.add(lamp);

    const phone = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.12, 0.015),
      new THREE.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x2b6f96 }),
    );
    phone.position.set(0.12, 1.02, 0.48);
    phone.rotation.y = -0.4;
    group.add(phone);
  }

  private buildSeatedRider(
    jersey: THREE.Material,
    skin: THREE.Material,
    shorts: THREE.Material,
  ): void {
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.5, 0.26), jersey);
    torso.position.set(0, 1.08, -0.04);
    torso.rotation.x = 0.55;
    torso.castShadow = true;
    this.rider.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), skin);
    head.position.set(0, 1.34, 0.2);
    head.castShadow = true;
    this.rider.add(head);

    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, 1.35),
      jersey,
    );
    helmet.position.set(0, 1.36, 0.18);
    this.rider.add(helmet);

    this.addLimbs(jersey, shorts, {
      armY: 1.18,
      armZ: 0.08,
      armX: 0.9,
      legY: 0.84,
      legZ: -0.08,
    });
  }

  private buildStandingRider(
    jersey: THREE.Material,
    skin: THREE.Material,
    shorts: THREE.Material,
  ): void {
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.52, 0.24), jersey);
    torso.position.set(0, 1.22, 0.02);
    torso.rotation.x = 0.12;
    torso.castShadow = true;
    this.rider.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), skin);
    head.position.set(0, 1.56, 0.06);
    head.castShadow = true;
    this.rider.add(head);

    const hood = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 10, 6, 0, Math.PI * 2, 0, 1.45),
      jersey,
    );
    hood.position.set(0, 1.56, 0.02);
    this.rider.add(hood);

    this.addLimbs(jersey, shorts, {
      armY: 1.32,
      armZ: 0.08,
      armX: 0.7,
      legY: 0.72,
      legZ: 0.02,
    });
  }

  private addLimbs(
    jersey: THREE.Material,
    shorts: THREE.Material,
    at: { armY: number; armZ: number; armX: number; legY: number; legZ: number },
  ): void {
    for (const side of [-1, 1] as const) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.08), jersey);
      arm.geometry.translate(0, -0.2, 0);
      arm.position.set(side * 0.2, at.armY, at.armZ);
      arm.rotation.x = at.armX;
      this.rider.add(arm);

      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.48, 0.11), shorts);
      leg.geometry.translate(0, -0.24, 0);
      leg.position.set(side * 0.08, at.legY, at.legZ);
      leg.castShadow = true;
      this.rider.add(leg);
      this.legs.push(leg);
    }
  }

  private place(): void {
    const here = loopPoint(this.index);
    const ahead = loopPoint(this.index + this.direction);
    const forward = new THREE.Vector2().subVectors(ahead, here).normalize();
    const side = new THREE.Vector2(-forward.y, forward.x).multiplyScalar(this.sideOffset);
    this.group.position.set(here.x + side.x, 0, here.y + side.y);
    this.heading = Math.atan2(forward.x, forward.y);
  }

  public getPosition(): THREE.Vector3 {
    return this.group.position.clone();
  }

  /** Ridden their route and due to be taken off the map. */
  public isGone(): boolean {
    if (this.phase === 'crashed') {
      // Keep the wreck until the rider's been handed off and the bike's tipped.
      return this.riderOffered && this.tipped && this.linger <= 0;
    }
    return this.ticketLeft <= 0;
  }

  /** Hose dump in progress — tidy the empty bike away once linger ends. */
  public hasCrashed(): boolean {
    return this.phase === 'crashed';
  }

  /**
   * Once they've finished tumbling, hand the Game a spot to spawn an angry
   * pedestrian who gets up and comes for you.
   */
  public claimAngryPedestrian(): { at: THREE.Vector3; lout: boolean } | null {
    const next = this.pendingPed;
    this.pendingPed = null;
    return next;
  }

  /** Did a droplet catch the rider or the bike? */
  public soakedBy(point: THREE.Vector3): boolean {
    if (this.phase !== 'riding') return false;
    const here = this.group.position;
    const dx = point.x - here.x;
    const dz = point.z - here.z;
    if (dx * dx + dz * dz > 0.85 * 0.85) return false;
    return point.y > here.y - 0.05 && point.y < here.y + 1.6;
  }

  /**
   * Hose knocks them clean off. The bike carries on riderless until it tips.
   * Returns true the first time they come off.
   */
  public drench(from?: THREE.Vector3): boolean {
    if (this.phase !== 'riding') return false;
    this.eject(from);
    return true;
  }

  private eject(from?: THREE.Vector3): void {
    this.phase = 'crashed';
    this.coastLeft = 1.6 + Math.random() * 2.2;
    this.tipSign = Math.random() < 0.5 ? 1 : -1;
    this.tipped = false;
    this.tipAmount = 0;
    // Linger is for the empty bike / scooter wreck, not the rider.
    this.linger = 7 + Math.random() * 3;
    this.riderOffered = false;
    this.pendingPed = null;

    const forward = new THREE.Vector3(
      Math.sin(this.heading),
      0,
      Math.cos(this.heading),
    );
    const world = new THREE.Vector3();
    this.rider.getWorldPosition(world);
    const yaw = this.heading;
    this.group.remove(this.rider);
    this.scene.add(this.rider);
    this.rider.position.copy(world);
    this.rider.rotation.set(0.5, yaw, this.lean);

    const away = new THREE.Vector3();
    if (from) away.subVectors(world, from).setY(0);
    if (away.lengthSq() < 0.01) away.copy(forward).negate();

    this.tumble = new TumbleBody(this.rider, 0.58);
    this.tumble.kick(forward, away, this.speed);
    this.ring(EJECT_LINES);
  }

  /**
   * Rides on, slowing for anything in the way. Returns the index of a mess
   * they rode straight through, or -1.
   */
  public update(
    delta: number,
    ahead: readonly THREE.Vector3[],
    mess: readonly THREE.Vector3[],
  ): number {
    this.grumble = this.grumble?.update(delta, this.group.position) === false ? null : this.grumble;
    if (this.bellCooldown > 0) this.bellCooldown -= delta;

    if (this.phase === 'crashed') {
      this.updateCrash(delta);
      return -1;
    }

    const lout = this.kind === 'ebike';
    const blocked = this.somethingInTheWay(ahead);
    // The lads don't brake for anybody. They just shout and keep going.
    const wanted = blocked && !lout ? 1.4 : this.cruise;
    this.speed += (wanted - this.speed) * Math.min(1, 2.5 * delta);
    if (blocked && this.bellCooldown <= 0) this.ring(lout ? LOUT_LINES : BELL_LINES);

    const spacing = PATH_LOOP[0]!.distanceTo(PATH_LOOP[1]!) || 1;
    const steps = (this.speed * delta) / spacing;
    this.index += this.direction * steps;
    this.ticketLeft -= steps;

    const was = this.heading;
    this.place();
    this.pedal(delta, was);
    this.layLine();

    return this.checkTyres(mess);
  }

  private updateCrash(delta: number): void {
    this.tumble?.update(delta);

    // Once they're lying still, swap the ragdoll for a proper pedestrian.
    if (!this.riderOffered && this.tumble?.isSettled(1.0)) {
      this.riderOffered = true;
      const at = this.rider.position.clone();
      at.y = 0;
      this.pendingPed = { at, lout: this.kind === 'ebike' };
      this.scene.remove(this.rider);
      this.tumble = null;
    }

    // Burn wreck linger once the bike is down; rider is already a pedestrian.
    if (this.tipped) this.linger -= delta;

    if (this.tipped) {
      this.tipAmount = Math.min(Math.PI / 2, this.tipAmount + delta * 2.8);
      this.group.rotation.set(0, this.heading, this.tipSign * this.tipAmount);
      this.group.position.y = Math.sin(this.tipAmount) * 0.22;
      for (const wheel of this.wheels) wheel.rotation.x -= delta * 2;
      return;
    }

    // Riderless bike keeps rolling, then tips when it hits something or coasts out.
    this.coastLeft -= delta;
    this.speed = Math.max(0, this.speed * Math.max(0, 1 - 0.55 * delta));
    const spacing = PATH_LOOP[0]!.distanceTo(PATH_LOOP[1]!) || 1;
    const steps = (this.speed * delta) / spacing;
    this.index += this.direction * steps;
    this.place();
    this.group.rotation.set(0, this.heading, this.lean * 0.4);
    for (const wheel of this.wheels) wheel.rotation.x -= delta * this.speed * 3;

    const nose = new THREE.Vector3(
      this.group.position.x + Math.sin(this.heading) * 1.1,
      0,
      this.group.position.z + Math.cos(this.heading) * 1.1,
    );
    if (this.coastLeft <= 0 || this.speed < 0.8 || isBlocked(nose.x, nose.z, 0.45)) {
      this.tipped = true;
      this.speed = 0;
    }
  }

  /** Anything within a narrow cone out front, which is worth braking for. */
  private somethingInTheWay(ahead: readonly THREE.Vector3[]): boolean {
    const here = this.group.position;
    const forward = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));

    for (const other of ahead) {
      const to = new THREE.Vector3(other.x - here.x, 0, other.z - here.z);
      const range = to.length();
      if (range > CLEAR_AHEAD || range < 0.01) continue;
      if (to.divideScalar(range).dot(forward) > 0.8) return true;
    }
    return false;
  }

  private ring(lines: readonly string[]): void {
    this.bellCooldown = BELL_COOLDOWN;
    this.grumble?.dispose();
    this.grumble = new Grumble(
      this.scene,
      lines[Math.floor(Math.random() * lines.length)]!,
      this.group.position,
    );
  }

  private checkTyres(mess: readonly THREE.Vector3[]): number {
    const here = this.group.position;
    if (this.avoiding && here.distanceToSquared(this.avoiding) > 9) this.avoiding = null;

    for (let i = 0; i < mess.length; i++) {
      const spot = mess[i]!;
      if (this.avoiding && spot.distanceToSquared(this.avoiding) < 0.01) continue;

      const dx = here.x - spot.x;
      const dz = here.z - spot.z;
      if (dx * dx + dz * dz > TYRE_RANGE * TYRE_RANGE) continue;

      this.avoiding = spot.clone();
      this.ring(SPLAT_LINES);
      // Straight through it, and now the back tyre prints it up the path.
      this.smear = SMEAR_LENGTH;
      this.laidAt = here.clone();
      return i;
    }
    return -1;
  }

  /**
   * Prints the next length of tyre line once they've ridden far enough since
   * the last one, fading out as the wheel runs itself clean.
   */
  private layLine(): void {
    if (this.smear <= 0 || !this.laidAt || this.trackAt) return;

    const here = this.group.position;
    const rolled = here.distanceTo(this.laidAt);
    if (rolled < TYRE_SEGMENT) return;

    this.smear -= rolled;
    this.laidAt = here.clone();
    // Laid behind the back wheel rather than under the rider.
    this.trackAt = {
      at: new THREE.Vector3(
        here.x - Math.sin(this.heading) * 0.5,
        0,
        here.z - Math.cos(this.heading) * 0.5,
      ),
      yaw: this.heading,
      strength: Math.max(0, Math.min(1, this.smear / SMEAR_LENGTH)) * 0.85 + 0.1,
      shape: 'tyre',
    };
  }

  /** The length of line just laid, for the game to put on the floor. */
  public claimTrack(): Tread | null {
    const track = this.trackAt;
    this.trackAt = null;
    return track;
  }

  private pedal(delta: number, wasHeading: number): void {
    this.crank += delta * this.speed * 3.4;
    const swing = Math.sin(this.crank);
    if (this.kind === 'ebike') {
      // Standing on the deck — throttle, not pedals.
      this.legs[0]!.rotation.x = 0.08;
      this.legs[1]!.rotation.x = 0.14;
    } else {
      this.legs[0]!.rotation.x = 0.55 + swing * 0.7;
      this.legs[1]!.rotation.x = 0.55 - swing * 0.7;
    }

    for (const wheel of this.wheels) wheel.rotation.x -= delta * this.speed * 3;

    // Lean into the bend, worked out from how sharply the heading is turning.
    let turn = this.heading - wasHeading;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    const target = THREE.MathUtils.clamp((turn / Math.max(delta, 0.001)) * 1.5, -0.4, 0.4);
    this.lean += (target - this.lean) * Math.min(1, 3 * delta);

    this.group.rotation.set(0, this.heading, this.lean);
  }

  public dispose(): void {
    this.grumble?.dispose();
    if (this.rider.parent === this.scene) this.scene.remove(this.rider);
    this.pendingPed = null;
    this.scene.remove(this.group);
  }
}

function v(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, y, z);
}

/** Thin bar from A to B, along local Z. */
function spar(
  parent: THREE.Object3D,
  a: THREE.Vector3,
  b: THREE.Vector3,
  thick: number,
  material: THREE.Material,
): void {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  if (len < 1e-4) return;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(thick, thick, len), material);
  bar.position.copy(a).add(b).multiplyScalar(0.5);
  bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
  bar.castShadow = true;
  parent.add(bar);
}

/** Tyre plus a few spokes. The group spins on X so the wheel rolls along +Z. */
function addSpokedWheel(
  parent: THREE.Object3D,
  at: THREE.Vector3,
  radius: number,
  tyre: number,
  rubber: THREE.Material,
  spoke: THREE.Material,
): THREE.Group {
  const hub = new THREE.Group();
  hub.position.copy(at);

  const tyreMesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tyre, 8, 18), rubber);
  tyreMesh.rotation.y = Math.PI / 2;
  tyreMesh.castShadow = true;
  hub.add(tyreMesh);

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.16, radius * 0.16, tyre * 1.4, 8), spoke);
  cap.rotation.z = Math.PI / 2;
  hub.add(cap);

  for (let i = 0; i < 6; i++) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(tyre * 0.45, radius * 1.7, tyre * 0.35), spoke);
    arm.rotation.x = (i / 6) * Math.PI;
    hub.add(arm);
  }

  parent.add(hub);
  return hub;
}
