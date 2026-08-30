import * as THREE from "three";
import {
  PATH_LOOP,
  WATER_Y,
  distanceToShore,
  isInLake,
  loopPoint,
  nearestShore,
  outwardAt,
} from "../world/lake";
import { Grumble } from "../effects/Grumble";
import { Dog } from "./Dog";
import type { Tread } from "./Footprint";

const COATS = [0x2f4f7f, 0x8b3a3a, 0x3f6b4a, 0x5a4a7a, 0x2b2b33, 0xb06a2c];
const TROUSERS = [0x2b3038, 0x4a4a52, 0x6b5a44];
const SKIN = [0xf0c8a0, 0xd9a066, 0x8d5a3b, 0x5c3a26];

const COMPLAINTS = [
  "OH, COME ON!",
  "MY SHOES!",
  "BLOODY SWANS!",
  "URGH!",
  "NOT AGAIN!",
  "LOOK AT THE STATE OF THAT",
  "THAT IS DISGUSTING",
  "WHO CLEANS UP ROUND HERE?",
];

const SOAKED = [
  "OI! WATCH IT!",
  "I AM SOAKED!",
  "DO YOU MIND?",
  "THAT WAS MY COAT!",
  "WHAT ARE YOU PLAYING AT?",
];

const DUNKED = [
  "GET ME OUT!",
  "MY PHONE!",
  "YOU ABSOLUTE...",
  "I'LL HAVE YOUR JOB",
  "IT'S FREEZING!",
];

/** How close a foot has to get, and how long the strop lasts. */
const TREAD_RANGE = 0.5;
const STROP_TIME = 3.4;

/** Close enough to the edge that a good soaking puts them in the water. */
const EDGE = 3.2;
/** Stood on the bottom: Canoe Lake is only about a metre deep. */
const BED_Y = WATER_Y - 0.85;
/** Topple, flounder about, then haul themselves back out. */
const FALL_TIME = 0.7;
const SWIM_TIME = 3.2;
const CLIMB_TIME = 1.8;
/** How long they walk round dripping afterwards. */
const DRYING = 45;

/** A fair few of the park's regulars are only here to walk the dog. */
const DOG_CHANCE = 0.35;
/** How often a soaking loosens their grip on the lead. */
const LEAD_SLIPS = 0.7;

const BARGED = [
  "MIND OUT!",
  "GET THAT DOG ON A LEAD!",
  "BLOODY THING!",
  "WHOSE IS THAT?",
];

/** A fair few of them can't be doing with finding a bin. */
const LITTERBUG_CHANCE = 0.3;
const LITTER_EVERY = 35;
const SHIFTY = [
  "NOBODY SAW THAT",
  "THE COUNCIL CAN GET IT",
  "THERE'S NEVER A BIN",
  "IT'S BIODEGRADABLE, THAT",
];

/** Roughly a third of the park is carrying something worth begging for. */
const FOOD_CHANCE = 0.35;
const HANDFULS = 4;
const FEED_PAUSE = 2.2;

const FEEDING_LINES = [
  "HERE YOU GO",
  "THERE YOU ARE",
  "GO ON THEN",
  "STEADY ON!",
];
const SCATTER_LINES = [
  "GO ON, SPRINKLE IT",
  "NOT ALL AT ONCE!",
  "LOOK AT THEM ALL",
  "MIND YOUR FINGERS",
];

/** How many prints one bootful of it is good for. */
const TRACKED_PRINTS = 6;

/** Half of those carrying food have a kid with them, and they scatter it. */
const KID_CHANCE = 0.5;
const SCATTER_PAUSE = 4.5;

/** A member of the public strolling the perimeter path. */
export class Person {
  private group: THREE.Group;
  private scene: THREE.Scene;
  private index: number;
  private direction: 1 | -1;
  private speed: number;
  private sideOffset: number;
  private stepPhase = Math.random() * Math.PI * 2;
  private legs: THREE.Mesh[] = [];
  private arms: THREE.Mesh[] = [];

  private strop = 0;
  private grumble: Grumble | null = null;
  /** A bag of something, and how many handfuls are left in it. */
  private bag: THREE.Mesh | null = null;
  private handfuls = 0;
  private feeding = 0;

  /** Families sprinkle the lot on the path instead of hand-feeding. */
  private kid: THREE.Group | null = null;
  private kidLegs: THREE.Mesh[] = [];
  private kidArms: THREE.Mesh[] = [];
  private scattering = 0;
  private scatterWait = 12 + Math.random() * 30;
  private scatterAt: THREE.Vector3 | null = null;
  /** Stands in for the crowd turning over: empty-handed people wander off and
   * fresh ones turn up with a new bag. */
  private restock = 0;
  /** The mess underfoot, so they don't react to it over and over. */
  private avoiding: THREE.Vector3 | null = null;

  /** Prints left on the shoe after treading in something, and where the
   * next one goes once it's claimed by the game. */
  private mucky = 0;
  private printAt: Tread | null = null;
  /** Which way the last footfall was going, for spotting the next one. */
  private lastFoot = 1;

  /** Clothes, kept so they can be darkened when someone gets soaked. */
  private cloth: { material: THREE.MeshStandardMaterial; dry: THREE.Color }[] =
    [];
  private wet = 0;
  /** Time left in the water, and the way in and back out again. */
  private dunk = 0;
  private wentIn = new THREE.Vector3();
  private cameOut = new THREE.Vector3();
  private splashAt: THREE.Vector3 | null = null;
  private splashed = true;

  /** Some of them are only out here to walk this. */
  private dog: Dog | null = null;

  /** Whether they drop their rubbish, and when the next piece goes down. */
  private litterbug = Math.random() < LITTERBUG_CHANCE;
  private litterWait = 10 + Math.random() * LITTER_EVERY;
  private litterAt: THREE.Vector3 | null = null;

  constructor(scene: THREE.Scene, index: number) {
    this.scene = scene;
    this.index = index;
    this.direction = Math.random() < 0.5 ? 1 : -1;
    this.speed = 1.1 + Math.random() * 0.9;
    // Anywhere across the paving, including right along the water's edge.
    this.sideOffset = (Math.random() - 0.5) * 9;

    this.group = this.build();
    this.scene.add(this.group);
    this.place();

    // The dog needs somewhere to heel, so it comes after they're stood up.
    if (!this.kid && Math.random() < DOG_CHANCE)
      this.dog = new Dog(scene, this);
  }

  private build(): THREE.Group {
    const group = new THREE.Group();
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

    for (const material of [coat, legMat]) {
      this.cloth.push({ material, dry: material.color.clone() });
    }

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.62, 0.26), coat);
    torso.position.y = 1.14;
    torso.castShadow = true;
    group.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), skin);
    head.position.y = 1.6;
    head.castShadow = true;
    group.add(head);

    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.56, 0.14), coat);
      arm.geometry.translate(0, -0.28, 0);
      arm.position.set(side * 0.29, 1.42, 0);
      arm.castShadow = true;
      group.add(arm);
      this.arms.push(arm);

      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.8, 0.18),
        legMat,
      );
      leg.geometry.translate(0, -0.4, 0);
      leg.position.set(side * 0.12, 0.84, 0);
      leg.castShadow = true;
      group.add(leg);
      this.legs.push(leg);
    }

    if (Math.random() < FOOD_CHANCE) {
      this.giveBag();
      if (Math.random() < KID_CHANCE) this.addKid(group);
    }

    return group;
  }

  private giveBag(): void {
    this.handfuls = HANDFULS;
    this.bag = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.26, 0.14),
      new THREE.MeshStandardMaterial({ color: 0xd8c9a4, roughness: 1 }),
    );
    // Carried in the right hand, at the bottom of the arm.
    this.bag.position.set(0, -0.62, 0.06);
    this.bag.castShadow = true;
    this.arms[1]!.add(this.bag);
  }

  private emptyHanded(): void {
    this.restock = 70 + Math.random() * 80;
    if (this.bag) {
      this.bag.removeFromParent();
      this.bag = null;
    }
    // The empty bag has to go somewhere, and for some of them that's here.
    if (this.litterbug) this.dropLitter();
  }

  /** A small one holding on beside them, walking with shorter, quicker steps. */
  private addKid(parent: THREE.Group): void {
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

    this.kid = new THREE.Group();
    this.kid.position.set(-0.5, 0, -0.12);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.38, 0.18), coat);
    torso.position.y = 0.7;
    torso.castShadow = true;
    this.kid.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), skin);
    head.position.y = 1.0;
    head.castShadow = true;
    this.kid.add(head);

    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 0.09), coat);
      arm.geometry.translate(0, -0.16, 0);
      arm.position.set(side * 0.19, 0.88, 0);
      this.kid.add(arm);
      this.kidArms.push(arm);

      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.11, 0.5, 0.12),
        legMat,
      );
      leg.geometry.translate(0, -0.25, 0);
      leg.position.set(side * 0.08, 0.5, 0);
      this.kid.add(leg);
      this.kidLegs.push(leg);
    }

    parent.add(this.kid);
  }

  public hasFood(): boolean {
    return this.handfuls > 0;
  }

  /**
   * Throws a handful to a begging swan. They stop to do it, and once the bag
   * is empty it goes away and the swans lose interest.
   */
  public feedSwan(): void {
    if (this.handfuls <= 0) return;
    this.handfuls -= 1;
    this.feeding = FEED_PAUSE;

    this.grumble?.dispose();
    this.grumble = new Grumble(
      this.scene,
      FEEDING_LINES[Math.floor(Math.random() * FEEDING_LINES.length)]!,
      this.group.position,
    );

    if (this.handfuls === 0) this.emptyHanded();
  }

  /** Did a droplet catch them? */
  public soakedBy(point: THREE.Vector3): boolean {
    const here = this.group.position;
    const dx = point.x - here.x;
    const dz = point.z - here.z;
    if (dx * dx + dz * dz > 0.55 * 0.55) return false;
    return point.y > here.y - 0.1 && point.y < here.y + 1.85;
  }

  public isInTheDrink(): boolean {
    return this.dunk > 0;
  }

  public getDog(): Dog | null {
    return this.dog;
  }

  public getHeading(): number {
    return this.group.rotation.y;
  }

  /**
   * Shouldered out of the way by something running past. Same as a soaking
   * without the water: they kick off, and at the edge they go straight in.
   * Returns true if it's worth a complaint.
   */
  public barge(from: THREE.Vector3): boolean {
    if (this.dunk > 0 || this.strop > 0) return false;

    // They only go in if the shove sends them that way.
    const here = this.group.position;
    const push = new THREE.Vector3()
      .subVectors(here, from)
      .setY(0)
      .normalize()
      .multiplyScalar(1.8);
    const shoved = { x: here.x + push.x, z: here.z + push.z };
    if (
      !isInLake(here.x, here.z) &&
      distanceToShore(shoved.x, shoved.z) < 0.7
    ) {
      this.topple();
      return true;
    }

    this.strop = STROP_TIME;
    this.say(BARGED);
    return true;
  }

  /** Already wet, so they don't file a fresh complaint for every droplet. */
  public isSoaked(): boolean {
    return this.wet > 0;
  }

  /**
   * Caught by the hose, or by someone else's splash. They kick off about it,
   * and if they're stood at the water's edge when it happens they go in.
   */
  public drench(): void {
    if (this.dunk > 0) return;
    this.wet = DRYING;

    // Hands go up, and more often than not the lead goes with them.
    if (Math.random() < LEAD_SLIPS) this.dog?.slipTheLead();

    const here = this.group.position;
    if (distanceToShore(here.x, here.z) < EDGE && !isInLake(here.x, here.z)) {
      this.topple();
      return;
    }

    this.strop = STROP_TIME;
    this.say(SOAKED);
  }

  /** Over the edge, arms going, into two feet of cold green water. */
  private topple(): void {
    this.dunk = FALL_TIME + SWIM_TIME + CLIMB_TIME;
    this.scattering = 0;
    this.feeding = 0;
    this.strop = 0;

    const here = this.group.position;
    const shore = nearestShore(here.x, here.z);
    const out = outwardAt(shore);
    this.wentIn.set(shore.x - out.x * 1.6, BED_Y, shore.y - out.y * 1.6);
    this.cameOut.set(shore.x + out.x * 1.4, 0, shore.y + out.y * 1.4);
    this.splashed = false;
    this.say(DUNKED);
  }

  /** Where somebody just went in, once, for the game to make a splash of. */
  public claimSplash(): THREE.Vector3 | null {
    const at = this.splashAt;
    this.splashAt = null;
    return at;
  }

  /** Going in, thrashing about, and hauling themselves back out. */
  private flounder(delta: number): void {
    this.dunk -= delta;
    const age = FALL_TIME + SWIM_TIME + CLIMB_TIME - this.dunk;
    const [leftArm, rightArm] = this.arms as [THREE.Mesh, THREE.Mesh];
    const [left, right] = this.legs as [THREE.Mesh, THREE.Mesh];

    if (age < FALL_TIME) {
      // Pitching forward off the edge, arms windmilling.
      const t = age / FALL_TIME;
      this.group.position.lerp(this.wentIn, Math.min(1, 6 * delta));
      this.group.rotation.x = t * 0.9;
      leftArm.rotation.x = -2.4 * t;
      rightArm.rotation.x = -2.1 * t;
      leftArm.rotation.z = 0.7 * t;
      rightArm.rotation.z = -0.7 * t;
      left.rotation.x = 0.5 * t;
      right.rotation.x = -0.3 * t;
      return;
    }

    if (age < FALL_TIME + SWIM_TIME) {
      if (!this.splashed) {
        this.splashed = true;
        this.splashAt = this.wentIn.clone().setY(WATER_Y);
      }
      // Chest-deep and floundering, going nowhere fast.
      const thrash = Math.sin(age * 11);
      this.group.position.y = BED_Y + Math.sin(age * 5) * 0.06;
      this.group.rotation.x = 0.4 + Math.sin(age * 3) * 0.12;
      this.group.rotation.z = thrash * 0.14;
      leftArm.rotation.x = -1.5 + thrash * 1.2;
      rightArm.rotation.x = -1.5 - thrash * 1.2;
      leftArm.rotation.z = 0.5;
      rightArm.rotation.z = -0.5;
      left.rotation.x = -thrash * 0.5;
      right.rotation.x = thrash * 0.5;
      return;
    }

    // Up the wall and out, back onto the paving on all fours to start with.
    const t = (age - FALL_TIME - SWIM_TIME) / CLIMB_TIME;
    this.group.position.lerp(this.cameOut, Math.min(1, 3.5 * delta));
    this.group.position.y = THREE.MathUtils.lerp(
      BED_Y,
      0,
      Math.min(1, t * 1.4),
    );
    this.group.rotation.x = 0.9 * (1 - t);
    this.group.rotation.z = 0;
    const heave = Math.sin(t * Math.PI * 2);
    leftArm.rotation.x = -1.2 + heave * 0.6;
    rightArm.rotation.x = -1.2 - heave * 0.6;
    left.rotation.x = heave * 0.7;
    right.rotation.x = -heave * 0.7;

    if (this.dunk <= 0) {
      // Out, dripping, and with plenty to say about it.
      this.group.position.copy(this.cameOut);
      this.group.rotation.set(0, this.group.rotation.y, 0);
      this.rejoinPath();
      this.strop = STROP_TIME;
      this.say(SOAKED);
    }
  }

  /**
   * Picks up the walk from wherever they climbed out, so they carry on from
   * the bank instead of snapping back to where they were stood.
   */
  private rejoinPath(): void {
    const here = new THREE.Vector2(
      this.group.position.x,
      this.group.position.z,
    );
    let best = 0;
    let closest = Infinity;
    for (let i = 0; i < PATH_LOOP.length; i++) {
      const gap = PATH_LOOP[i]!.distanceToSquared(here);
      if (gap < closest) {
        closest = gap;
        best = i;
      }
    }
    this.index = best;

    const at = loopPoint(best);
    const ahead = loopPoint(best + this.direction);
    const forward = new THREE.Vector2().subVectors(ahead, at).normalize();
    const side = new THREE.Vector2(-forward.y, forward.x);
    this.sideOffset = here.sub(at).dot(side);
  }

  private say(lines: readonly string[]): void {
    this.grumble?.dispose();
    this.grumble = new Grumble(
      this.scene,
      lines[Math.floor(Math.random() * lines.length)]!,
      this.group.position,
    );
  }

  /** Soaked clothes go dark, and dry out slowly as they walk it off. */
  private dry(delta: number): void {
    if (this.wet <= 0) return;
    this.wet -= delta;
    const soak = THREE.MathUtils.clamp(this.wet / 8, 0, 1) * 0.55;
    for (const { material, dry } of this.cloth) {
      material.color.copy(dry).multiplyScalar(1 - soak);
    }
  }

  private place(): void {
    const here = loopPoint(this.index);
    const ahead = loopPoint(this.index + this.direction);
    const forward = new THREE.Vector2().subVectors(ahead, here).normalize();
    const side = new THREE.Vector2(-forward.y, forward.x).multiplyScalar(
      this.sideOffset,
    );
    this.group.position.set(here.x + side.x, 0, here.y + side.y);
    this.group.rotation.y = Math.atan2(forward.x, forward.y);
  }

  /**
   * Walks them on, unless they've just trodden in something. Returns the index
   * of the mess they stepped in this frame, or -1.
   */
  public update(delta: number, mess: readonly THREE.Vector3[] = []): number {
    this.grumble =
      this.grumble?.update(delta, this.group.position) === false
        ? null
        : this.grumble;
    this.dry(delta);

    if (this.dunk > 0) {
      this.flounder(delta);
      return -1;
    }

    if (this.strop > 0) {
      this.strop -= delta;
      this.throwStrop();
      return -1;
    }

    if (this.scattering > 0) {
      this.scattering -= delta;
      this.sprinkle();
      return -1;
    }

    if (this.feeding > 0) {
      this.feeding -= delta;
      this.scatterFeed();
      return -1;
    }

    if (this.restock > 0) {
      this.restock -= delta;
      if (this.restock <= 0) {
        this.giveBag();
        this.scatterWait = 15 + Math.random() * 35;
      }
    }

    if (this.litterbug) {
      this.litterWait -= delta;
      if (this.litterWait <= 0) this.dropLitter();
    }

    if (this.kid && this.handfuls > 0) {
      this.scatterWait -= delta;
      if (this.scatterWait <= 0) this.startScatter();
    }

    // Loop points are evenly spaced, so a fixed step length converts neatly.
    const spacing = PATH_LOOP[0]!.distanceTo(PATH_LOOP[1]!) || 1;
    this.index += (this.direction * this.speed * delta) / spacing;
    this.place();

    this.stepPhase += delta * this.speed * 4.5;
    const swing = Math.sin(this.stepPhase) * 0.5;
    this.legs[0]!.rotation.x = swing;
    this.legs[1]!.rotation.x = -swing;
    this.arms[0]!.rotation.x = -swing * 0.7;
    this.arms[1]!.rotation.x = swing * 0.7;
    this.arms[0]!.rotation.z = 0;
    this.arms[1]!.rotation.z = 0;
    this.group.rotation.x = 0;
    this.group.position.y = Math.abs(Math.sin(this.stepPhase)) * 0.03;
    this.trackItOut(swing);

    if (this.kid) {
      // Shorter legs, so twice the steps to keep up.
      const trot = Math.sin(this.stepPhase * 1.9) * 0.6;
      this.kidLegs[0]!.rotation.x = trot;
      this.kidLegs[1]!.rotation.x = -trot;
      this.kidArms[0]!.rotation.x = -trot * 0.6;
      this.kidArms[1]!.rotation.x = trot * 0.6;
      this.kid.position.y = Math.abs(Math.sin(this.stepPhase * 1.9)) * 0.04;
    }

    return this.checkUnderfoot(mess);
  }

  /**
   * Leaves what's on the shoe on the ground, one print per footfall, each
   * fainter than the last. `swing` is the leg swing, which changes sign at
   * the moment a foot goes down.
   */
  private trackItOut(swing: number): void {
    const foot = swing >= 0 ? 1 : -1;
    if (foot === this.lastFoot) return;
    this.lastFoot = foot;
    if (this.mucky <= 0 || this.printAt) return;

    this.mucky -= 1;
    const here = this.group.position;
    const yaw = this.group.rotation.y;
    // Left and right feet land either side of the line they're walking.
    const across = foot * 0.14;
    this.printAt = {
      at: new THREE.Vector3(
        here.x + Math.cos(yaw) * across,
        0,
        here.z - Math.sin(yaw) * across,
      ),
      yaw,
      strength: 0.35 + (this.mucky / TRACKED_PRINTS) * 0.65,
    };
  }

  /** The print they've just left, for the game to put on the floor. */
  public claimPrint(): Tread | null {
    const print = this.printAt;
    this.printAt = null;
    return print;
  }

  private checkUnderfoot(mess: readonly THREE.Vector3[]): number {
    const here = this.group.position;
    if (this.avoiding) {
      const dx = here.x - this.avoiding.x;
      const dz = here.z - this.avoiding.z;
      // Only start looking again once they've walked clear of the last one.
      if (dx * dx + dz * dz > 4) this.avoiding = null;
    }

    for (let i = 0; i < mess.length; i++) {
      const spot = mess[i]!;
      if (this.avoiding && spot.distanceToSquared(this.avoiding) < 0.01)
        continue;

      const dx = here.x - spot.x;
      const dz = here.z - spot.z;
      if (dx * dx + dz * dz > TREAD_RANGE * TREAD_RANGE) continue;

      this.treadIn(spot);
      return i;
    }
    return -1;
  }

  private treadIn(spot: THREE.Vector3): void {
    this.strop = STROP_TIME;
    this.avoiding = spot.clone();
    // It comes off the sole over the next few steps, wherever they go next.
    this.mucky = TRACKED_PRINTS;
    this.grumble?.dispose();
    this.grumble = new Grumble(
      this.scene,
      COMPLAINTS[Math.floor(Math.random() * COMPLAINTS.length)]!,
      this.group.position,
    );
  }

  /**
   * Stops and empties the whole bag onto the path for the kid to watch. The
   * spot is claimed by the game on the next frame to spawn the bread.
   */
  private startScatter(): void {
    this.scattering = SCATTER_PAUSE;
    this.handfuls = 0;
    this.scatterAt = this.group.position.clone().setY(0);
    this.emptyHanded();

    this.grumble?.dispose();
    this.grumble = new Grumble(
      this.scene,
      SCATTER_LINES[Math.floor(Math.random() * SCATTER_LINES.length)]!,
      this.group.position,
    );
  }

  /**
   * Drops whatever they've finished with, right where they're stood, with a
   * quick look round first if they've got any shame about it at all.
   */
  private dropLitter(): void {
    const here = this.group.position;
    this.litterAt = new THREE.Vector3(
      here.x + (Math.random() - 0.5) * 0.7,
      0,
      here.z + (Math.random() - 0.5) * 0.7,
    );
    this.litterWait = LITTER_EVERY * (0.7 + Math.random());
    if (Math.random() < 0.4) this.say(SHIFTY);
  }

  /** Where somebody just dropped something, once, for the game to spawn it. */
  public claimLitter(): THREE.Vector3 | null {
    const spot = this.litterAt;
    this.litterAt = null;
    return spot;
  }

  /** Where a family just tipped out their bread, once, for the game to use. */
  public claimScatter(): THREE.Vector3 | null {
    const spot = this.scatterAt;
    this.scatterAt = null;
    return spot;
  }

  /** Parent and child both flinging bread about at the water's edge. */
  private sprinkle(): void {
    const age = SCATTER_PAUSE - this.scattering;
    const toss = Math.sin(age * 6);
    const [leftArm, rightArm] = this.arms as [THREE.Mesh, THREE.Mesh];
    rightArm.rotation.x = -0.7 - toss * 0.7;
    rightArm.rotation.z = -0.3;
    leftArm.rotation.x = -0.2;
    leftArm.rotation.z = 0.1;
    this.legs[0]!.rotation.x = 0;
    this.legs[1]!.rotation.x = 0;
    this.group.rotation.x = 0;
    this.group.position.y = 0;

    if (!this.kid) return;
    // The kid throws it in fistfuls, and bounces about doing it.
    const kidToss = Math.sin(age * 8.5);
    this.kidArms[0]!.rotation.x = -1.1 - kidToss * 0.8;
    this.kidArms[1]!.rotation.x = -1.1 + kidToss * 0.8;
    this.kidLegs[0]!.rotation.x = 0;
    this.kidLegs[1]!.rotation.x = 0;
    this.kid.position.y = Math.abs(Math.sin(age * 5)) * 0.07;
  }

  /** Stood still, lobbing handfuls out underarm. */
  private scatterFeed(): void {
    const toss = Math.sin((FEED_PAUSE - this.feeding) * 7);
    const [leftArm, rightArm] = this.arms as [THREE.Mesh, THREE.Mesh];
    rightArm.rotation.x = -0.9 - toss * 0.6;
    rightArm.rotation.z = -0.25;
    leftArm.rotation.x = 0.1;
    leftArm.rotation.z = 0;
    this.legs[0]!.rotation.x = 0;
    this.legs[1]!.rotation.x = 0;
    this.group.rotation.x = 0;
    this.group.position.y = 0;
  }

  /** Hops back, then stands there scraping the offending shoe on the ground. */
  private throwStrop(): void {
    const age = STROP_TIME - this.strop;
    const [left, right] = this.legs as [THREE.Mesh, THREE.Mesh];
    const [leftArm, rightArm] = this.arms as [THREE.Mesh, THREE.Mesh];

    if (age < 0.55) {
      // The recoil: both arms fly up and they rock back on their heels.
      const jolt = Math.sin((age / 0.55) * Math.PI);
      leftArm.rotation.x = -2.2 * jolt;
      rightArm.rotation.x = -2.2 * jolt;
      leftArm.rotation.z = 0.5 * jolt;
      rightArm.rotation.z = -0.5 * jolt;
      this.group.rotation.x = 0.16 * jolt;
      this.group.position.y = jolt * 0.12;
      right.rotation.x = -1.1 * jolt;
      return;
    }

    // Scraping: dirty foot swings back and forth, the rest of them hopping.
    const scrape = Math.sin(age * 9);
    right.rotation.x = -0.5 + scrape * 0.55;
    left.rotation.x = 0.05;
    leftArm.rotation.x = -0.6 + scrape * 0.2;
    rightArm.rotation.x = -0.35 - scrape * 0.25;
    leftArm.rotation.z = 0.28;
    rightArm.rotation.z = -0.28;
    this.group.rotation.x = 0.08;
    this.group.position.y = Math.abs(Math.sin(age * 4.5)) * 0.05;
  }

  public getPosition(): THREE.Vector3 {
    return this.group.position.clone();
  }
}
