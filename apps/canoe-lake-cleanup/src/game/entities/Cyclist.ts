import * as THREE from 'three';
import { PATH_LOOP, loopPoint } from '../world/lake';
import { Grumble } from '../effects/Grumble';
import { TYRE_SEGMENT, type Tread } from './Footprint';

const JERSEYS = [0xd8452f, 0x2f6fd8, 0x1f1f26, 0xe0b83c, 0x3f9f5f];
const SKIN = [0xf0c8a0, 0xd9a066, 0x8d5a3b, 0x5c3a26];

const BELL_LINES = ['DING DING!', 'MIND YOUR BACKS', 'COMING THROUGH', 'ON YOUR RIGHT'];
const SPLAT_LINES = ['UP MY BACK!', 'ALL OVER MY TYRES', 'OH, LOVELY', 'ARGH!'];

/** The lads on the e-bikes don't ring, and they don't slow down either. */
const LOUT_LINES = ['OUT THE WAY!', 'WOOOO!', 'GET IN!', 'SAFE, BRUV', 'MOVE!'];
const TRACKSUITS = [0x1f1f26, 0x22303f, 0x2d2438, 0x1c2b1c];

/** How close something ahead has to be before they slow and ring. */
const CLEAR_AHEAD = 5;
const BELL_COOLDOWN = 4;
/** Tyre width, near enough, for running through a mess. */
const TYRE_RANGE = 0.4;
/** How far a tyre keeps printing what it picked up before it runs clean. */
const SMEAR_LENGTH = 9;

export type RiderKind = 'cyclist' | 'ebike';

/** A rider cutting through the park along the lakeside path. */
export class Cyclist {
  public readonly kind: RiderKind;
  private scene: THREE.Scene;
  private group: THREE.Group;
  private index: number;
  private direction: 1 | -1;
  private cruise: number;
  private speed: number;
  private sideOffset: number;

  private wheels: THREE.Mesh[] = [];
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
    const metal = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.5, metalness: 0.6 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 1 });

    // Wheels stand in the plane of travel, one fore and one aft. Fat tyres on
    // the e-bikes, which is half the reason you can hear them coming.
    const tyre = lout ? 0.1 : 0.045;
    for (const z of [0.58, -0.58]) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.33, tyre, 6, 18), rubber);
      wheel.rotation.y = Math.PI / 2;
      wheel.position.set(0, 0.33, z);
      wheel.castShadow = true;
      group.add(wheel);
      this.wheels.push(wheel);
    }

    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.1), metal);
    frame.position.set(0, 0.62, 0);
    frame.rotation.x = -0.12;
    group.add(frame);

    const seatTube = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.05), metal);
    seatTube.position.set(0, 0.6, -0.34);
    group.add(seatTube);

    const bars = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.05), metal);
    bars.position.set(0, 0.95, 0.42);
    group.add(bars);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.5, 0.28), jersey);
    // Hunched over the bars rather than sat bolt upright.
    torso.position.set(0, 1.06, -0.06);
    torso.rotation.x = 0.5;
    torso.castShadow = true;
    group.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), skin);
    head.position.set(0, 1.32, 0.2);
    head.castShadow = true;
    group.add(head);

    // A helmet on the cyclist; a hood up on the lad, and no helmet in sight.
    const hat = new THREE.Mesh(
      new THREE.SphereGeometry(lout ? 0.19 : 0.16, 10, 6, 0, Math.PI * 2, 0, 1.4),
      jersey,
    );
    hat.position.set(0, lout ? 1.32 : 1.34, lout ? 0.16 : 0.2);
    group.add(hat);

    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.44, 0.1), jersey);
      arm.geometry.translate(0, -0.22, 0);
      arm.position.set(side * 0.17, 1.16, 0.1);
      arm.rotation.x = 0.85;
      group.add(arm);

      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.5, 0.13), metal);
      leg.geometry.translate(0, -0.25, 0);
      leg.position.set(side * 0.11, 0.82, -0.1);
      leg.castShadow = true;
      group.add(leg);
      this.legs.push(leg);
    }

    if (lout) {
      // Battery slung in the frame, and a phone playing something out loud.
      const battery = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.5), metal);
      battery.position.set(0, 0.6, 0.05);
      group.add(battery);

      const phone = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.16, 0.02),
        new THREE.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x2b6f96 }),
      );
      phone.position.set(0.2, 1.0, 0.44);
      group.add(phone);
    }

    return group;
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
    return this.ticketLeft <= 0;
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
      // Feet planted on the pedals, throttle doing the work.
      this.legs[0]!.rotation.x = 0.7;
      this.legs[1]!.rotation.x = 0.4;
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
    this.scene.remove(this.group);
  }
}
