import * as THREE from "three";
import type { Person } from "./Person";
import type { Swan } from "./Swan";
import { Grumble } from "../effects/Grumble";
import { isInLake, nearestShore, outwardAt } from "../world/lake";
import { addEyes } from "./eyes";
import { MuckFlecks } from "../effects/MuckFlecks";

/**
 * A temperament, which decides what happens when the lead hits the floor: a
 * steady one just mills about, a lively one is off after the birds, and a
 * fierce one will go through anybody standing between it and them.
 */
type Temper = "steady" | "lively" | "fierce";

interface Breed {
  name: string;
  coat: number;
  /** Roughly shoulder height, in metres. */
  size: number;
  temper: Temper;
  speed: number;
}

const BREEDS: readonly Breed[] = [
  { name: "STAFFIE", coat: 0x8a7462, size: 0.45, temper: "fierce", speed: 6.5 },
  {
    name: "JACK RUSSELL",
    coat: 0xe6dfd0,
    size: 0.3,
    temper: "fierce",
    speed: 5.5,
  },
  { name: "LURCHER", coat: 0x9a9086, size: 0.62, temper: "lively", speed: 7.5 },
  { name: "LABRADOR", coat: 0xd8c07c, size: 0.55, temper: "lively", speed: 6 },
  { name: "SPANIEL", coat: 0x8a5a34, size: 0.4, temper: "lively", speed: 5.5 },
  { name: "PUG", coat: 0xc7b294, size: 0.26, temper: "steady", speed: 3.2 },
  { name: "OLD LAB", coat: 0x6f6357, size: 0.52, temper: "steady", speed: 3.6 },
];

const NAMES = [
  "BUSTER",
  "MURPHY",
  "NELSON",
  "TILLY",
  "BRUNO",
  "POPPY",
  "RONNIE",
  "BELLA",
];

const RECALLS = [
  "COME HERE!",
  "LEAVE IT!",
  "HEEL!",
  "GET BACK HERE!",
  "DROP IT!",
];

/** How long a loose dog gets before it runs out of steam and is caught. */
const RUN_TIME = 9;
/** Close enough to put a swan up, and to shoulder somebody out of the way. */
const SPOOK_RANGE = 2.2;
const BARGE_RANGE = 1.2;
/** Chase aim stops short of the bird so they don't run straight through it. */
const STANDOFF = 1.7;
/** Hard floor — if they somehow overlap, shove them back out. */
const CLEAR = 1.45;
/** It won't cross the whole park for a bird; it goes for whatever is near. */
const HUNT_RANGE = 34;

type Mode = "heel" | "loose" | "hunt" | "coming";

/** The world a loose dog gets to make a mess of. */
export interface DogWorld {
  swans: readonly Swan[];
  people: readonly Person[];
}

/** A dog on a lead, and — if you soak its owner — off one. */
export class Dog {
  private scene: THREE.Scene;
  private owner: Person;
  private breed: Breed;
  private name: string;

  private group = new THREE.Group();
  private legs: THREE.Mesh[] = [];
  private tail!: THREE.Mesh;
  private head!: THREE.Group;
  private lead: THREE.Line;
  private leadPoints: THREE.BufferAttribute;

  private mode: Mode = "heel";
  private looseFor = 0;
  private heading = 0;
  private stride = Math.random() * Math.PI * 2;
  private target = new THREE.Vector3();
  private quarry: Swan | null = null;
  private grumble: Grumble | null = null;
  /** Barges to answer for, collected by the game. */
  private trouble = 0;
  /** The side of the owner it walks on, and where the lead is held. */
  private side: number;
  private flecks: MuckFlecks;

  constructor(scene: THREE.Scene, owner: Person) {
    this.scene = scene;
    this.owner = owner;
    this.breed = BREEDS[Math.floor(Math.random() * BREEDS.length)]!;
    this.name = NAMES[Math.floor(Math.random() * NAMES.length)]!;
    this.side = Math.random() < 0.5 ? -1 : 1;

    this.build();
    this.flecks = new MuckFlecks(this.group, 16);
    scene.add(this.group);

    const geometry = new THREE.BufferGeometry();
    this.leadPoints = new THREE.BufferAttribute(new Float32Array(6), 3);
    geometry.setAttribute("position", this.leadPoints);
    this.lead = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color: 0x2f2a25 }),
    );
    scene.add(this.lead);

    this.group.position.copy(owner.getPosition());
  }

  private build(): void {
    const scale = this.breed.size;
    const coat = new THREE.MeshStandardMaterial({
      color: this.breed.coat,
      roughness: 0.9,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x2a2521,
      roughness: 0.9,
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.78), coat);
    body.position.y = 0.62;
    body.castShadow = true;
    this.group.add(body);

    this.head = new THREE.Group();
    this.head.position.set(0, 0.82, 0.42);
    this.group.add(this.head);

    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.3), coat);
    skull.castShadow = true;
    this.head.add(skull);

    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.2), coat);
    snout.position.set(0, -0.05, 0.22);
    this.head.add(snout);

    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.05), dark);
    nose.position.set(0, -0.04, 0.34);
    this.head.add(nose);

    for (const ear of [-1, 1]) {
      const flap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.1), coat);
      flap.position.set(ear * 0.14, 0.14, -0.02);
      flap.rotation.z = ear * 0.3;
      this.head.add(flap);
    }

    addEyes(this.head, {
      spread: 0.09,
      y: 0.05,
      z: 0.12,
      size: 0.035,
      iris: 0x3a2a18,
    });

    // A collar, which is all that's left holding it once the lead goes.
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.16, 0.03, 4, 10),
      dark,
    );
    collar.position.set(0, 0.78, 0.24);
    collar.rotation.x = Math.PI / 2;
    this.group.add(collar);

    for (const sideways of [-1, 1]) {
      for (const along of [-1, 1]) {
        const leg = new THREE.Mesh(
          new THREE.BoxGeometry(0.1, 0.46, 0.11),
          coat,
        );
        leg.geometry.translate(0, -0.23, 0);
        leg.position.set(sideways * 0.12, 0.52, along * 0.28);
        leg.castShadow = true;
        this.group.add(leg);
        this.legs.push(leg);
      }
    }

    this.tail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, 0.07), coat);
    this.tail.geometry.translate(0, 0.15, 0);
    this.tail.position.set(0, 0.72, -0.4);
    this.tail.rotation.x = 0.7;
    this.group.add(this.tail);

    this.group.scale.setScalar(scale / 0.55);
  }

  public isLoose(): boolean {
    return this.mode !== "heel";
  }

  public getPosition(): THREE.Vector3 {
    return this.group.position.clone();
  }

  /** Did a droplet catch the dog? */
  public hitBy(point: THREE.Vector3): boolean {
    const here = this.group.position;
    const dx = point.x - here.x;
    const dz = point.z - here.z;
    if (dx * dx + dz * dz > 0.45 * 0.45) return false;
    return point.y > here.y - 0.05 && point.y < here.y + 0.9;
  }

  public splatter(point: THREE.Vector3): void {
    this.flecks.splat(point);
  }

  /** Barges the game hasn't logged yet. */
  public claimTrouble(): number {
    const count = this.trouble;
    this.trouble = 0;
    return count;
  }

  /**
   * Its owner has just taken a faceful of water. Whatever else happens, the
   * lead is on the floor — and what the dog does next is down to the breed.
   */
  public slipTheLead(): void {
    if (this.mode !== "heel") return;
    this.looseFor = RUN_TIME + Math.random() * 5;
    this.mode = this.breed.temper === "steady" ? "loose" : "hunt";
    this.quarry = null;
    this.shout(`${this.name}!`);
  }

  public update(delta: number, world: DogWorld): void {
    this.flecks.update(delta);
    this.grumble =
      this.grumble?.update(delta, this.group.position) === false
        ? null
        : this.grumble;

    if (this.mode === "heel") {
      this.walkToHeel(delta);
    } else {
      this.runAbout(delta, world);
    }

    this.drawLead();
  }

  /** Trotting along at the owner's side, matching their pace. */
  private walkToHeel(delta: number): void {
    const owner = this.owner.getPosition();
    const face = this.owner.getHeading();
    const spot = new THREE.Vector3(
      owner.x + Math.cos(face) * this.side * 0.55 + Math.sin(face) * 0.3,
      0,
      owner.z - Math.sin(face) * this.side * 0.55 + Math.cos(face) * 0.3,
    );

    const step = spot.distanceTo(this.group.position);
    this.group.position.lerp(spot, Math.min(1, 7 * delta));
    this.heading = face;
    this.group.rotation.y = face;
    this.pace(delta, step > 0.05 ? 1 : 0);
  }

  /**
   * Off the lead. A lively one puts every swan it can find back in the water,
   * a fierce one goes through anybody in the way to get to them, and all of
   * them get collared eventually.
   */
  private runAbout(delta: number, world: DogWorld): void {
    this.looseFor -= delta;
    if (this.looseFor <= 0 && this.mode !== "coming") {
      this.mode = "coming";
      this.shout(RECALLS[Math.floor(Math.random() * RECALLS.length)]!);
    }

    if (this.mode === "coming") {
      this.target.copy(this.owner.getPosition());
      if (this.group.position.distanceTo(this.target) < 1) {
        this.mode = "heel";
        return;
      }
    } else if (this.mode === "hunt") {
      this.pickQuarry(world);
    } else if (this.group.position.distanceTo(this.target) < 1.2) {
      // A steady dog just potters about within a few metres of its owner.
      this.target.copy(this.wanderSpot(1, 4));
    }

    const to = new THREE.Vector3()
      .subVectors(this.target, this.group.position)
      .setY(0);
    const gap = to.length();
    if (gap > 0.05) {
      const speed =
        this.mode === "coming" ? this.breed.speed * 0.6 : this.breed.speed;
      this.group.position.addScaledVector(
        to.normalize(),
        Math.min(gap, speed * delta),
      );
      this.heading = Math.atan2(to.x, to.z);
      this.group.rotation.y = this.heading;
    }
    this.pace(delta, gap > 0.05 ? 1.6 : 0.2);
    this.keepDry();
    this.unstickFromSwans(world);
    this.causeTrouble(world);
  }

  /**
   * It'll bark itself hoarse at the edge, but it stops at the water. Anything
   * that swims off is safe, which is rather the point of swimming off.
   */
  private keepDry(): void {
    const here = this.group.position;
    if (!isInLake(here.x, here.z)) return;
    const shore = nearestShore(here.x, here.z);
    const out = outwardAt(shore);
    here.x = shore.x + out.x * 0.5;
    here.z = shore.y + out.y * 0.5;
  }

  /** If a chase overshoots, push clear of the bird instead of sitting inside it. */
  private unstickFromSwans(world: DogWorld): void {
    const here = this.group.position;
    for (const swan of world.swans) {
      const at = swan.getPosition();
      const push = new THREE.Vector3(here.x - at.x, 0, here.z - at.z);
      const gap = push.length();
      if (gap >= CLEAR) continue;
      if (gap < 0.08) {
        const shore = nearestShore(at.x, at.z);
        const out = outwardAt(shore);
        push.set(out.x, 0, out.y);
      } else {
        push.normalize();
      }
      here.x = at.x + push.x * CLEAR;
      here.z = at.z + push.z * CLEAR;
    }
    this.keepDry();
  }

  /** The nearest bird worth chasing, kept until it's back on the water. */
  private pickQuarry(world: DogWorld): void {
    const here = this.group.position;
    if (this.quarry && this.worthChasing(this.quarry, here)) {
      this.target.copy(this.aimAtSwan(this.quarry, here));
      return;
    }

    let best: Swan | null = null;
    let closest = HUNT_RANGE;
    for (const swan of world.swans) {
      const gap = here.distanceTo(swan.getPosition());
      if (gap < closest && this.worthChasing(swan, here)) {
        closest = gap;
        best = swan;
      }
    }

    this.quarry = best;
    if (best) {
      this.target.copy(this.aimAtSwan(best, here));
    } else if (this.group.position.distanceTo(this.target) < 1.2) {
      // Nothing to chase for the moment, so it casts about instead.
      this.target.copy(this.wanderSpot(3, 7));
    }
  }

  /**
   * A point short of the bird — close enough to put it up, not inside the
   * mesh. From dead on top, peel toward the bank.
   */
  private aimAtSwan(swan: Swan, here: THREE.Vector3): THREE.Vector3 {
    const at = swan.getPosition();
    const away = new THREE.Vector3(here.x - at.x, 0, here.z - at.z);
    if (away.lengthSq() < 0.04) {
      const shore = nearestShore(at.x, at.z);
      const out = outwardAt(shore);
      away.set(out.x, 0, out.y);
    }
    away.normalize();
    return new THREE.Vector3(
      at.x + away.x * STANDOFF,
      0,
      at.z + away.z * STANDOFF,
    );
  }

  /**
   * A bird on the bank, or one just off it. Once they're properly out on the
   * water it loses interest rather than standing at the edge barking all day.
   */
  private worthChasing(swan: Swan, here: THREE.Vector3): boolean {
    const at = swan.getPosition();
    if (here.distanceTo(at) > HUNT_RANGE) return false;
    return !isInLake(at.x, at.z);
  }

  /** Somewhere in the general area of its owner to go and have a look at. */
  private wanderSpot(near: number, far: number): THREE.Vector3 {
    const owner = this.owner.getPosition();
    const angle = Math.random() * Math.PI * 2;
    const out = near + Math.random() * (far - near);
    return new THREE.Vector3(
      owner.x + Math.cos(angle) * out,
      0,
      owner.z + Math.sin(angle) * out,
    );
  }

  /** Swans go up, and anyone in the way gets shouldered aside. */
  private causeTrouble(world: DogWorld): void {
    const here = this.group.position;

    for (const swan of world.swans) {
      if (here.distanceTo(swan.getPosition()) > SPOOK_RANGE) continue;
      swan.spook(here);
      if (swan === this.quarry) {
        this.quarry = null;
        // Peel off along the bank so the next stride isn't back through it.
        this.target.copy(this.aimAtSwan(swan, here));
        const peel = this.target.clone().sub(here).setY(0);
        if (peel.lengthSq() > 0.01) {
          peel.normalize();
          // Sidestep as well so they don't sit nose-to-beak barking forever.
          this.target.x += -peel.z * 2.2;
          this.target.z += peel.x * 2.2;
        }
      }
    }

    // Only the ones that don't look where they're going flatten people.
    if (this.breed.temper !== "fierce") return;
    for (const person of world.people) {
      if (person === this.owner || person.isInTheDrink()) continue;
      if (here.distanceTo(person.getPosition()) > BARGE_RANGE) continue;
      if (person.barge(here)) this.trouble += 1;
    }
  }

  /** Legs and tail, quicker the harder it's going. */
  private pace(delta: number, effort: number): void {
    this.stride += delta * (4 + effort * 7);
    const swing = Math.sin(this.stride) * (0.3 + effort * 0.5);
    this.legs[0]!.rotation.x = swing;
    this.legs[1]!.rotation.x = -swing;
    this.legs[2]!.rotation.x = -swing;
    this.legs[3]!.rotation.x = swing;

    const wag = Math.sin(this.stride * 2.4);
    this.tail.rotation.z = wag * (0.25 + effort * 0.3);
    this.tail.rotation.x = 0.7 - effort * 0.5;
    this.head.rotation.x = -effort * 0.15;
    this.group.position.y = Math.abs(Math.sin(this.stride)) * 0.02 * effort;
  }

  /** Taut to the owner's hand on the lead, trailing on the floor off it. */
  private drawLead(): void {
    const collar = this.group.position;
    const held = this.owner.getPosition();
    const from = this.isLoose()
      ? new THREE.Vector3(
          collar.x - Math.sin(this.heading) * this.breed.size * 2.4,
          0.03,
          collar.z - Math.cos(this.heading) * this.breed.size * 2.4,
        )
      : new THREE.Vector3(held.x, 0.95, held.z);

    const array = this.leadPoints.array as Float32Array;
    array[0] = from.x;
    array[1] = from.y;
    array[2] = from.z;
    array[3] = collar.x;
    array[4] = collar.y + this.breed.size * 1.4;
    array[5] = collar.z;
    this.leadPoints.needsUpdate = true;
    this.lead.geometry.computeBoundingSphere();
  }

  private shout(line: string): void {
    this.grumble?.dispose();
    this.grumble = new Grumble(this.scene, line, this.owner.getPosition());
  }

  public dispose(): void {
    this.flecks.dispose();
    this.scene.remove(this.group);
    this.scene.remove(this.lead);
    this.lead.geometry.dispose();
  }
}
