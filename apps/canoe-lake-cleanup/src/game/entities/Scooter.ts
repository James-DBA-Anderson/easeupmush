import * as THREE from "three";
import { PATH_LOOP, loopPoint } from "../world/lake";
import { Grumble } from "../effects/Grumble";

const BODYWORK = [0xb03a2e, 0x2f5d8c, 0x7a3f8c, 0x3f7a4a, 0x8c6a2f];
const COATS = [0x6b5f7a, 0x7a6a58, 0x3f4a5a, 0x8a5a5a, 0x4a4a52];
const SKIN = [0xf0c8a0, 0xd9a066, 0x8d5a3b, 0x5c3a26];
const HAIR = [0xdedede, 0xc8c2b6, 0xb0aaa0];

const HORN_LINES = [
  "BEEP BEEP!",
  "MIND YOURSELF, LOVE",
  "COMING PAST",
  "EXCUSE ME!",
];
const SPLAT_LINES = [
  "UP MY WHEELS!",
  "OH, FOR HEAVEN'S SAKE",
  "LOOK AT THAT",
  "DISGUSTING!",
  "I'VE COPPED THAT ALL UP THE SIDE",
];
/** Stopped for a natter with somebody they know, which is most people. */
const CHAT_LINES = [
  "LOVELY DAY FOR IT",
  "HOW'S YOUR MOTHER?",
  "TERRIBLE, ALL THIS MESS",
  "I SAID TO HIM, I SAID",
  "THEY WANT SHOOTING, THEM SWANS",
  "I'M HANGING, MUSH",
  "SWEET AS NUT TODAY",
  "YOU CLUED UP ON THE SCORE?",
  "LET'S HAVE A BURN ON THAT THEN, MUSH",
  "JUST OFF FOR A SLASH",
  "FANCY SOME GRUB AFTER?",
];

/** They dawdle, and they stop dead for anything in front of them. */
const CRUISE_LOW = 1.4;
const CRUISE_HIGH = 2.4;
const CLEAR_AHEAD = 4;
const HORN_COOLDOWN = 6;
const TYRE_RANGE = 0.5;

/** Every so often they pull up and hold court for a bit. */
const CHAT_EVERY = 22;
const CHAT_FOR = 7;

/** An older resident doing a slow lap of the lake on a mobility scooter. */
export class Scooter {
  private scene: THREE.Scene;
  private group: THREE.Group;
  private index: number;
  private direction: 1 | -1;
  private cruise: number;
  private speed = 0;
  private sideOffset: number;

  private wheels: THREE.Mesh[] = [];
  private flag!: THREE.Mesh;
  private head!: THREE.Mesh;
  private heading = 0;
  private sway = Math.random() * Math.PI * 2;

  private hornCooldown = 0;
  private grumble: Grumble | null = null;
  private avoiding: THREE.Vector3 | null = null;
  private chatIn = CHAT_EVERY * Math.random();
  private chatting = 0;
  /** Path points left before they've had enough and head home. */
  private ticketLeft: number;

  constructor(scene: THREE.Scene, index: number) {
    this.scene = scene;
    this.index = index;
    this.direction = Math.random() < 0.5 ? 1 : -1;
    this.cruise = CRUISE_LOW + Math.random() * (CRUISE_HIGH - CRUISE_LOW);
    // They keep well away from the water's edge.
    this.sideOffset = 1.6 + Math.random() * 1.4;
    this.ticketLeft = PATH_LOOP.length * (0.6 + Math.random() * 0.9);

    this.group = this.build();
    scene.add(this.group);
    this.place();
  }

  private build(): THREE.Group {
    const group = new THREE.Group();
    const pick = <T>(list: readonly T[]): T =>
      list[Math.floor(Math.random() * list.length)]!;
    const shell = new THREE.MeshStandardMaterial({
      color: pick(BODYWORK),
      roughness: 0.6,
      metalness: 0.2,
    });
    const coat = new THREE.MeshStandardMaterial({
      color: pick(COATS),
      roughness: 0.9,
    });
    const skin = new THREE.MeshStandardMaterial({
      color: pick(SKIN),
      roughness: 0.8,
    });
    const hair = new THREE.MeshStandardMaterial({
      color: pick(HAIR),
      roughness: 1,
    });
    const metal = new THREE.MeshStandardMaterial({
      color: 0x9aa0a6,
      roughness: 0.4,
      metalness: 0.7,
    });
    const rubber = new THREE.MeshStandardMaterial({
      color: 0x1a1a1c,
      roughness: 1,
    });

    // Four small solid wheels under a moulded deck.
    for (const z of [0.42, -0.4]) {
      for (const x of [-0.29, 0.29]) {
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.16, 0.1, 10),
          rubber,
        );
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.16, z);
        wheel.castShadow = true;
        group.add(wheel);
        this.wheels.push(wheel);
      }
    }

    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 1.02), shell);
    deck.position.set(0, 0.24, 0);
    deck.castShadow = true;
    group.add(deck);

    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.3), shell);
    nose.position.set(0, 0.38, 0.42);
    group.add(nose);

    // Tiller column and handlebars.
    const column = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.6, 0.07), metal);
    column.position.set(0, 0.72, 0.42);
    column.rotation.x = -0.2;
    group.add(column);

    const bars = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 0.06), metal);
    bars.position.set(0, 1.0, 0.34);
    group.add(bars);

    const basket = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.22), metal);
    basket.position.set(0, 1.14, 0.42);
    group.add(basket);

    // Seat with a proper high back, which is most of the appeal.
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.4), coat);
    seat.position.set(0, 0.62, -0.22);
    group.add(seat);

    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.5, 0.1), coat);
    seatBack.position.set(0, 0.92, -0.4);
    seatBack.castShadow = true;
    group.add(seatBack);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.46, 0.26), coat);
    torso.position.set(0, 0.92, -0.2);
    torso.rotation.x = -0.08;
    torso.castShadow = true;
    group.add(torso);

    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), skin);
    this.head.position.set(0, 1.26, -0.16);
    this.head.castShadow = true;
    group.add(this.head);

    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, 1.5),
      hair,
    );
    cap.position.set(0, 0.02, 0);
    this.head.add(cap);

    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.11), coat);
      arm.geometry.translate(0, -0.21, 0);
      arm.position.set(side * 0.2, 1.06, -0.14);
      // Reaching forward to the tiller.
      arm.rotation.x = 1.15;
      group.add(arm);

      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.44, 0.14), coat);
      leg.geometry.translate(0, -0.22, 0);
      leg.position.set(side * 0.13, 0.66, -0.04);
      leg.rotation.x = 1.35;
      group.add(leg);
    }

    // The little orange safety flag on a whippy pole.
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.1, 0.02), metal);
    pole.position.set(0.22, 0.85, -0.44);
    group.add(pole);

    this.flag = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.16, 0.01),
      new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 1 }),
    );
    this.flag.position.set(0.34, 1.34, -0.44);
    group.add(this.flag);

    return group;
  }

  private place(): void {
    const here = loopPoint(this.index);
    const ahead = loopPoint(this.index + this.direction);
    const forward = new THREE.Vector2().subVectors(ahead, here).normalize();
    const side = new THREE.Vector2(-forward.y, forward.x).multiplyScalar(
      this.sideOffset,
    );
    this.group.position.set(here.x + side.x, 0, here.y + side.y);
    this.heading = Math.atan2(forward.x, forward.y);
    this.group.rotation.y = this.heading;
  }

  public getPosition(): THREE.Vector3 {
    return this.group.position.clone();
  }

  /** Done their lap and off home for their tea. */
  public isGone(): boolean {
    return this.ticketLeft <= 0;
  }

  /**
   * Trundles on, stopping dead for anything in front. Returns the index of a
   * mess they've driven through, or -1.
   */
  public update(
    delta: number,
    ahead: readonly THREE.Vector3[],
    mess: readonly THREE.Vector3[],
  ): number {
    this.grumble =
      this.grumble?.update(delta, this.group.position) === false
        ? null
        : this.grumble;
    if (this.hornCooldown > 0) this.hornCooldown -= delta;

    const blocked = this.somethingInTheWay(ahead);
    if (blocked && this.hornCooldown <= 0) this.sound(HORN_LINES);

    // Every so often they pull over for a chat, whether you like it or not.
    if (this.chatting > 0) {
      this.chatting -= delta;
    } else {
      this.chatIn -= delta;
      if (this.chatIn <= 0) {
        this.chatting = CHAT_FOR;
        this.chatIn = CHAT_EVERY + Math.random() * 25;
        this.sound(CHAT_LINES);
      }
    }

    const wanted = blocked || this.chatting > 0 ? 0 : this.cruise;
    // A scooter takes its time getting going and stops on a sixpence.
    this.speed += (wanted - this.speed) * Math.min(1, 1.6 * delta);

    const spacing = PATH_LOOP[0]!.distanceTo(PATH_LOOP[1]!) || 1;
    const steps = (this.speed * delta) / spacing;
    this.index += this.direction * steps;
    this.ticketLeft -= steps;

    this.place();
    this.trundle(delta);

    return this.checkTyres(mess);
  }

  /** Anything in a wide cone out front. They stop for all of it. */
  private somethingInTheWay(ahead: readonly THREE.Vector3[]): boolean {
    const here = this.group.position;
    const forward = new THREE.Vector3(
      Math.sin(this.heading),
      0,
      Math.cos(this.heading),
    );

    for (const other of ahead) {
      const to = new THREE.Vector3(other.x - here.x, 0, other.z - here.z);
      const range = to.length();
      if (range > CLEAR_AHEAD || range < 0.01) continue;
      if (to.divideScalar(range).dot(forward) > 0.72) return true;
    }
    return false;
  }

  private sound(lines: readonly string[]): void {
    this.hornCooldown = HORN_COOLDOWN;
    this.grumble?.dispose();
    this.grumble = new Grumble(
      this.scene,
      lines[Math.floor(Math.random() * lines.length)]!,
      this.group.position,
    );
  }

  private checkTyres(mess: readonly THREE.Vector3[]): number {
    const here = this.group.position;
    if (this.avoiding && here.distanceToSquared(this.avoiding) > 9) {
      this.avoiding = null;
    }

    for (let i = 0; i < mess.length; i++) {
      const spot = mess[i]!;
      if (this.avoiding && spot.distanceToSquared(this.avoiding) < 0.01) {
        continue;
      }

      const dx = here.x - spot.x;
      const dz = here.z - spot.z;
      if (dx * dx + dz * dz > TYRE_RANGE * TYRE_RANGE) continue;

      this.avoiding = spot.clone();
      this.sound(SPLAT_LINES);
      return i;
    }
    return -1;
  }

  /** Wheels turning, flag whipping about, and a head that looks round. */
  private trundle(delta: number): void {
    for (const wheel of this.wheels) wheel.rotation.x -= delta * this.speed * 6;

    this.sway += delta * (1.4 + this.speed);
    this.flag.rotation.y = Math.sin(this.sway * 3) * 0.5;
    this.flag.position.y = 1.34 + Math.sin(this.sway * 4) * 0.01;
    this.head.rotation.y = Math.sin(this.sway * 0.5) * 0.5;
    // Stopped for a chat, they lean out of the seat to make their point.
    this.group.rotation.z = this.chatting > 0 ? Math.sin(this.sway * 2) * 0.03 : 0;
  }

  public dispose(): void {
    this.grumble?.dispose();
    this.scene.remove(this.group);
  }
}
