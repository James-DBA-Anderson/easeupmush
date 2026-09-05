import * as THREE from "three";
import {
  PATH_LOOP,
  PATH_OUTER,
  WATER_Y,
  distanceToShore,
  isInLake,
  loopPoint,
  nearestShore,
  outwardAt,
} from "../world/lake";
import { parkGates } from "../world/fence";
import { binStations } from "../world/park";
import { Grumble } from "../effects/Grumble";
import { MuckFlecks } from "../effects/MuckFlecks";
import { Dog } from "./Dog";
import { Face, type Mood } from "./Face";
import type { Tread } from "./Footprint";

type Errand = "arriving" | "strolling" | "binning" | "leaving";

/** How they take getting sprayed — most moan, a few throw a punch. */
type Temper = "meek" | "narky" | "handy";

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
  "I'VE COPPED THE NEEDLE WITH THIS",
  "SWEET AS NUT, THAT ISN'T",
];

const SOAKED = [
  "OI! WATCH IT!",
  "I AM SOAKED!",
  "DO YOU MIND?",
  "THAT WAS MY COAT!",
  "WHAT ARE YOU PLAYING AT?",
  "I'VE COPPED THAT FULL IN THE FACE",
  "I'LL LAY YOU OUT, MUSH",
];

const BACK_OFF = [
  "ALRIGHT! ALRIGHT!",
  "I'M GOING!",
  "WATCH IT WITH THAT!",
  "YOU WIN!",
  "PUT IT DOWN!",
  "BLOODY HELL!",
];

const FOULED = [
  "THAT'S GOT POO ON IT!",
  "YOU FILTHY SOD!",
  "LOOK AT MY BLOODY COAT!",
  "THAT'S DISGUSTING!",
  "YOU'VE COVERED ME!",
  "I'VE COPPED THE NEEDLE WITH YOU",
  "WASH THAT OFF ME!",
];

const SQUARE_UP = [
  "COME HERE THEN!",
  "I'LL LAY YOU OUT, MUSH!",
  "RIGHT, YOU'RE HAVING IT!",
  "WANT SOME, DO YOU?",
  "I'LL HAVE YOUR JOB AND YOUR TEETH!",
];

const DUNKED = [
  "GET ME OUT!",
  "MY PHONE!",
  "YOU ABSOLUTE...",
  "I'LL HAVE YOUR JOB",
  "IT'S FREEZING!",
  "I NEEDED A SLASH, NOT A SWIM",
  "I'LL LAY HIM OUT, MUSH",
];

/** How close a foot has to get, and how long the strop lasts. */
const TREAD_RANGE = 0.5;
const STROP_TIME = 3.4;

/** Close enough to the edge that a good soaking puts them in the water. */
const EDGE = 3.6;
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
  "I'VE COPPED THE NEEDLE WITH THAT DOG",
  "I'LL LAY IT OUT, MUSH",
];

/** A fair few of them can't be doing with finding a bin. */
const LITTERBUG_CHANCE = 0.22;
const LITTER_EVERY = 75;

/** About two in five would rather not share the path with a mute swan. */
const SWAN_SHY_CHANCE = 0.4;
const SCARED = [
  "KEEP IT AWAY FROM ME",
  "THAT THING'S THE SIZE OF A DOG",
  "LOOK AT THE WINGS ON IT",
  "I'M NOT GOING NEAR THAT",
  "IT'S COMING RIGHT AT US",
  "BLOODY HELL!",
  "MUM SAID THEY BITE",
  "I'LL LAY IT OUT IF IT COMES NEAR",
];

/** Watching two birds have a go at each other over the bread. */
const BIRD_FIGHT = [
  "LOOK AT THEM GO!",
  "THEY'RE HAVING A RIGHT GO",
  "OI OI, SWAN FIGHT",
  "THAT ONE'S PROPER NASTY",
  "LEAVE IT, THEY'RE MENTAL",
  "DON'T GET BETWEEN THEM",
  "HA! LOOK AT THAT",
  "THEY'LL HAVE SOMEONE'S FINGER OFF",
];
/** How long a stroll lasts before they head for a gate. */
const VISIT_MIN = 90;
const VISIT_MAX = 220;
const SHIFTY = [
  "NOBODY SAW THAT",
  "THE COUNCIL CAN GET IT",
  "THERE'S NEVER A BIN",
  "IT'S BIODEGRADABLE, THAT",
  "JUST OFF FOR A SLASH ANYWAY",
];

/** Roughly a third of the park is carrying something worth begging for. */
const FOOD_CHANCE = 0.35;
const HANDFULS = 3;
const FEED_PAUSE = 2.2;

const FEEDING_LINES = [
  "HERE YOU GO",
  "THERE YOU ARE",
  "GO ON THEN",
  "STEADY ON!",
  "HAVE SOME GRUB",
  "SWEET AS NUT, LOOK AT HIM",
];
const SCATTER_LINES = [
  "GO ON, SPRINKLE IT",
  "NOT ALL AT ONCE!",
  "LOOK AT THEM ALL",
  "MIND YOUR FINGERS",
  "CHUCK THE GRUB IN",
  "SWEET AS NUT, THAT",
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
  /**
   * Metres out from the waterline across the paving. Kept as a shore distance
   * (not a left/right offset) so reversing walk direction doesn't flip them
   * onto the landward side of the path.
   */
  private fromShore: number;
  private stepPhase = Math.random() * Math.PI * 2;
  private legs: THREE.Object3D[] = [];
  private arms: THREE.Object3D[] = [];
  private torso!: THREE.Group;
  private head!: THREE.Group;
  private face!: Face;
  private kidFace: Face | null = null;

  private strop = 0;
  private grumble: Grumble | null = null;
  /** meek moan, narky shout, handy might swing. */
  private temper: Temper =
    Math.random() < 0.12 ? "handy" : Math.random() < 0.4 ? "narky" : "meek";
  /** Closing in for a dig after being fouled. */
  private lungeLeft = 0;
  private lungeAt = new THREE.Vector3();
  private swingReady = false;
  private swingCool = 0;
  /** Hose hits taken while lunging — enough and they back off. */
  private hoseHits = 0;
  private hoseCool = 0;
  /** Holds off the next shout so every droplet doesn't get its own line. */
  private sprayTalkCool = 0;
  /** Brown stain from dirty bounce spray. */
  private fouled = 0;
  private flecks: MuckFlecks;
  /** A bag of something, and how many handfuls are left in it. */
  private bag: THREE.Mesh | null = null;
  private handfuls = 0;
  private feeding = 0;

  /** Families sprinkle the lot on the path instead of hand-feeding. */
  private kid: THREE.Group | null = null;
  private kidLegs: THREE.Object3D[] = [];
  private kidArms: THREE.Object3D[] = [];
  private scattering = 0;
  private scatterWait = 25 + Math.random() * 45;
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
  /** Where they just put something in a bin, for the game to fill it. */
  private depositAt: THREE.Vector3 | null = null;
  private binFor: THREE.Vector2 | null = null;

  /** Some of them want nothing to do with a swan on the bank. */
  private swanShy = Math.random() < SWAN_SHY_CHANCE;
  private scareLeft = 0;
  private scareAway = new THREE.Vector3(1, 0, 0);
  /** Stopped to watch birds scrap over the bread. */
  private gawpLeft = 0;
  private gawpAt = new THREE.Vector3();
  private gawpCool = 0;

  /** Coming in through a gate, pottering round, or heading home. */
  private errand: Errand = "strolling";
  private visitLeft = VISIT_MIN + Math.random() * (VISIT_MAX - VISIT_MIN);
  private gateFor: THREE.Vector2 | null = null;
  private joinAt = new THREE.Vector2();
  private gone = false;

  /**
   * @param arriving — walk in from a gate rather than starting mid-stroll.
   *   Mid-stroll is fine at six o'clock: the park was already open.
   * @param gate — which opening to come through, when the game has already
   *   checked the player isn't looking at it.
   */
  constructor(
    scene: THREE.Scene,
    index: number,
    arriving = false,
    gate?: THREE.Vector2,
  ) {
    this.scene = scene;
    this.index = index;
    this.direction = Math.random() < 0.5 ? 1 : -1;
    this.speed = 1.1 + Math.random() * 0.9;
    // Plenty along the kerb (where a soak puts them in), the rest fill the path.
    this.fromShore =
      Math.random() < 0.42
        ? 0.35 + Math.random() * 2.8
        : 1.5 + Math.random() * (PATH_OUTER - 2);

    this.group = this.build();
    this.flecks = new MuckFlecks(this.group);
    this.scene.add(this.group);

    if (arriving) this.startArrival(gate);
    else this.place();

    // The dog needs somewhere to heel, so it comes after they're stood up.
    if (!this.kid && Math.random() < DOG_CHANCE)
      this.dog = new Dog(scene, this);
  }

  /** Lined up outside a gate, walking in toward the nearest bit of path. */
  private startArrival(preferred?: THREE.Vector2): void {
    this.errand = "arriving";
    const gates = parkGates();
    const gate =
      preferred ?? gates[Math.floor(Math.random() * gates.length)]!;
    // A few metres outside the park, so they walk through the opening.
    const out = gate.clone().normalize().multiplyScalar(8);
    this.group.position.set(gate.x + out.x, 0, gate.y + out.y);

    // Join the loop at whichever point is closest to that gate.
    let best = 0;
    let closest = Infinity;
    for (let i = 0; i < PATH_LOOP.length; i++) {
      const gap = PATH_LOOP[i]!.distanceToSquared(gate);
      if (gap < closest) {
        closest = gap;
        best = i;
      }
    }
    this.index = best;
    this.joinAt.copy(loopPoint(best));
    this.faceToward(this.joinAt.x, this.joinAt.y);
  }

  /** Time's up — peel off the loop toward the nearest way out. */
  public headHome(): void {
    if (this.errand === "leaving" || this.errand === "binning") return;
    this.errand = "leaving";
    const here = new THREE.Vector2(this.group.position.x, this.group.position.z);
    const gates = parkGates();
    let best = gates[0]!;
    let closest = Infinity;
    for (const gate of gates) {
      const gap = gate.distanceToSquared(here);
      if (gap < closest) {
        closest = gap;
        best = gate;
      }
    }
    // A little past the gate, so they clear the park before vanishing.
    const out = best.clone().normalize().multiplyScalar(14);
    this.gateFor = new THREE.Vector2(best.x + out.x, best.y + out.y);
  }

  public isGone(): boolean {
    return this.gone;
  }

  public isStrolling(): boolean {
    return this.errand === "strolling";
  }

  public dispose(): void {
    this.grumble?.dispose();
    this.dog?.dispose();
    this.flecks.dispose();
    this.scene.remove(this.group);
  }

  private faceToward(x: number, z: number): void {
    this.group.rotation.y = Math.atan2(
      x - this.group.position.x,
      z - this.group.position.z,
    );
  }

  /** Walk toward a point on the flat, swinging the arms. Returns the gap left. */
  private walkToward(to: THREE.Vector2, delta: number): number {
    const here = this.group.position;
    const gap = Math.hypot(to.x - here.x, to.y - here.z);
    if (gap < 0.05) return 0;
    const step = Math.min(gap, this.speed * delta);
    here.x += ((to.x - here.x) / gap) * step;
    here.z += ((to.y - here.z) / gap) * step;
    this.faceToward(to.x, to.y);
    this.stepPhase += delta * this.speed * 4.5;
    this.stride(this.stepPhase, 1);
    this.showMood("idle");
    return gap - step;
  }

  /**
   * The walk cycle: hips rock, torso sways opposite the legs, head nods a
   * touch, and the arms counter the legs. `rate` is 1 for an adult, higher
   * for a kid keeping up on shorter legs.
   */
  private stride(phase: number, rate: number): void {
    const swing = Math.sin(phase) * 0.55;
    const bob = Math.abs(Math.sin(phase)) * 0.04;
    this.legs[0]!.rotation.x = swing;
    this.legs[1]!.rotation.x = -swing;
    this.arms[0]!.rotation.x = -swing * 0.75;
    this.arms[1]!.rotation.x = swing * 0.75;
    this.arms[0]!.rotation.z = 0.08;
    this.arms[1]!.rotation.z = -0.08;
    this.torso.rotation.z = -swing * 0.08;
    this.torso.rotation.x = Math.abs(swing) * 0.04;
    this.head.rotation.x = Math.sin(phase * 2) * 0.04;
    this.head.rotation.z = swing * 0.05;
    this.group.rotation.x = 0;
    this.group.position.y = bob;

    if (this.kid) {
      const trot = Math.sin(phase * 1.9 * rate) * 0.65;
      this.kidLegs[0]!.rotation.x = trot;
      this.kidLegs[1]!.rotation.x = -trot;
      this.kidArms[0]!.rotation.x = -trot * 0.7;
      this.kidArms[1]!.rotation.x = trot * 0.7;
      this.kid.position.y = Math.abs(Math.sin(phase * 1.9)) * 0.05;
    }
  }

  private showMood(mood: Mood): void {
    this.face.setMood(mood);
    this.kidFace?.setMood(mood === "shifty" ? "pleased" : mood);
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
    const shoeMat = new THREE.MeshStandardMaterial({
      color: 0x2a2420,
      roughness: 1,
    });

    for (const material of [coat, legMat]) {
      this.cloth.push({ material, dry: material.color.clone() });
    }

    // Hips sit under the coat so the legs hinge from somewhere sensible.
    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.22), legMat);
    hips.position.y = 0.92;
    hips.castShadow = true;
    group.add(hips);

    this.torso = new THREE.Group();
    this.torso.position.y = 1.0;
    group.add(this.torso);

    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.24), coat);
    chest.position.y = 0.28;
    chest.castShadow = true;
    this.torso.add(chest);

    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8),
      skin,
    );
    neck.position.y = 0.6;
    this.torso.add(neck);

    this.head = new THREE.Group();
    this.head.position.y = 0.72;
    this.torso.add(this.head);
    this.face = new Face(skin);
    this.head.add(this.face.group);

    for (const side of [-1, 1] as const) {
      const arm = new THREE.Group();
      arm.position.set(side * 0.27, 0.48, 0);
      this.torso.add(arm);

      const upper = new THREE.Mesh(
        new THREE.BoxGeometry(0.11, 0.32, 0.12),
        coat,
      );
      upper.geometry.translate(0, -0.16, 0);
      upper.castShadow = true;
      arm.add(upper);

      const forearm = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.28, 0.1),
        coat,
      );
      forearm.geometry.translate(0, -0.14, 0);
      forearm.position.y = -0.32;
      forearm.castShadow = true;
      arm.add(forearm);

      const hand = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 8, 6),
        skin,
      );
      hand.position.y = -0.3;
      forearm.add(hand);

      this.arms.push(arm);

      const leg = new THREE.Group();
      leg.position.set(side * 0.11, 0.92, 0);
      group.add(leg);

      const thigh = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.4, 0.16),
        legMat,
      );
      thigh.geometry.translate(0, -0.2, 0);
      thigh.castShadow = true;
      leg.add(thigh);

      const shin = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.38, 0.14),
        legMat,
      );
      shin.geometry.translate(0, -0.19, 0);
      shin.position.y = -0.4;
      shin.castShadow = true;
      leg.add(shin);

      const shoe = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.07, 0.22),
        shoeMat,
      );
      shoe.position.set(0, -0.4, 0.04);
      shin.add(shoe);

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
    // Carried in the right hand, at the bottom of the forearm.
    this.bag.position.set(0.02, -0.32, 0.06);
    this.bag.castShadow = true;
    this.arms[1]!.children[1]!.add(this.bag);
  }

  private emptyHanded(): void {
    this.restock = 70 + Math.random() * 80;
    // Most of them find a bin. The rest leave it where they stand.
    if (this.litterbug) {
      if (this.bag) {
        this.bag.removeFromParent();
        this.bag = null;
      }
      this.dropLitter();
      return;
    }
    this.startBinning();
  }

  /** Peel off the path toward the nearest council bin with the empty bag. */
  private startBinning(): void {
    if (this.errand === "leaving" || this.errand === "arriving") {
      // Already on the way out — bag vanishes with them rather than littering.
      if (this.bag) {
        this.bag.removeFromParent();
        this.bag = null;
      }
      return;
    }
    const here = new THREE.Vector2(this.group.position.x, this.group.position.z);
    const stations = binStations();
    let best = stations[0];
    let closest = Infinity;
    for (const spot of stations) {
      const gap = here.distanceToSquared(new THREE.Vector2(spot.x, spot.z));
      if (gap < closest) {
        closest = gap;
        best = spot;
      }
    }
    if (!best) {
      if (this.bag) {
        this.bag.removeFromParent();
        this.bag = null;
      }
      return;
    }
    this.errand = "binning";
    this.binFor = new THREE.Vector2(best.x, best.z);
  }

  /** Bag in the bin, then back onto the circuit from the nearest paving. */
  private finishBinning(): void {
    if (this.bag) {
      this.bag.removeFromParent();
      this.bag = null;
    }
    this.depositAt = this.group.position.clone().setY(0);
    this.binFor = null;
    this.errand = "strolling";

    const here = new THREE.Vector2(this.group.position.x, this.group.position.z);
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
    this.place();
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
    const shoeMat = new THREE.MeshStandardMaterial({
      color: 0x2a2420,
      roughness: 1,
    });

    this.kid = new THREE.Group();
    this.kid.position.set(-0.48, 0, -0.1);

    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.34, 0.16), coat);
    chest.position.y = 0.72;
    chest.castShadow = true;
    this.kid.add(chest);

    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.045, 0.07, 7),
      skin,
    );
    neck.position.y = 0.92;
    this.kid.add(neck);

    const head = new THREE.Group();
    head.position.y = 1.02;
    this.kid.add(head);
    this.kidFace = new Face(skin, 0.82);
    head.add(this.kidFace.group);

    for (const side of [-1, 1] as const) {
      const arm = new THREE.Group();
      arm.position.set(side * 0.18, 0.86, 0);
      const upper = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.28, 0.08),
        coat,
      );
      upper.geometry.translate(0, -0.14, 0);
      arm.add(upper);
      this.kid.add(arm);
      this.kidArms.push(arm);

      const leg = new THREE.Group();
      leg.position.set(side * 0.07, 0.55, 0);
      const thigh = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.28, 0.1),
        legMat,
      );
      thigh.geometry.translate(0, -0.14, 0);
      leg.add(thigh);
      const shoe = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.05, 0.14),
        shoeMat,
      );
      shoe.position.set(0, -0.3, 0.03);
      leg.add(shoe);
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

  /** Filthy bounce spray sticks to coats and faces. */
  public splatter(point: THREE.Vector3): void {
    this.flecks.splat(point);
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
    if (this.dunk > 0 || this.strop > 0 || this.scareLeft > 0) return false;

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

  /**
   * A swan has made itself known. Shy ones back off from anything on the bank;
   * everyone scarpers when the wings go up.
   */
  public spook(from: THREE.Vector3, wingsOut: boolean): void {
    if (
      this.dunk > 0 ||
      this.errand === "arriving" ||
      this.errand === "leaving"
    )
      return;
    if (this.scareLeft > 1.2) return;
    if (!this.swanShy && !wingsOut) return;

    const here = this.group.position;
    const gap = here.distanceTo(from);
    const reach = wingsOut ? (this.swanShy ? 10 : 5.5) : 4.5;
    if (gap > reach) return;

    // Drop the bread — nobody finishes a feed while that happens.
    this.feeding = 0;
    this.scattering = 0;
    this.strop = 0;

    this.scareLeft = wingsOut
      ? this.swanShy
        ? 3.8
        : 2.2
      : 2.0;
    this.scareAway.subVectors(here, from).setY(0);
    if (this.scareAway.lengthSq() < 0.01) {
      this.scareAway.set(
        Math.sin(this.group.rotation.y),
        0,
        Math.cos(this.group.rotation.y),
      );
    }
    this.scareAway.normalize();

    // Prefer inland if the swan is between them and the water.
    const shore = nearestShore(here.x, here.z);
    const out = outwardAt(shore);
    this.scareAway.addScaledVector(
      new THREE.Vector3(out.x, 0, out.y),
      0.55,
    );
    this.scareAway.normalize();

    if (wingsOut || Math.random() < 0.6) this.say(SCARED);
    this.showMood("shocked");
  }

  /**
   * Two birds having a go at each other on the water. About half the people
   * within earshot stop and comment; the rest keep walking.
   */
  public watchFight(at: THREE.Vector3): void {
    if (
      this.dunk > 0 ||
      this.scareLeft > 0 ||
      this.strop > 0 ||
      this.scattering > 0 ||
      this.feeding > 0 ||
      this.gawpLeft > 0 ||
      this.gawpCool > 0
    )
      return;
    if (this.errand === "arriving" || this.errand === "leaving") return;

    const gap = this.group.position.distanceTo(at);
    if (gap > 14 || gap < 1.5) return;
    if (Math.random() > 0.55) {
      // Not everyone cares — but they've still "noticed" so they don't all pile on.
      this.gawpCool = 4 + Math.random() * 4;
      return;
    }

    this.gawpLeft = 2.2 + Math.random() * 1.8;
    this.gawpCool = 8 + Math.random() * 6;
    this.gawpAt.copy(at);
    this.say(BIRD_FIGHT);
    this.showMood(Math.random() < 0.45 ? "shocked" : "pleased");
  }

  /** Already wet, so they don't file a fresh complaint for every droplet. */
  public isSoaked(): boolean {
    return this.wet > 0;
  }

  /**
   * Caught by the hose, or by someone else's splash. They kick off about it,
   * and if they're stood at the water's edge when it happens they go in.
   * Mid-lunge, the jet shoves them back. One shout to start with — more only
   * if you keep the lance on them.
   */
  public drench(from?: THREE.Vector3): void {
    if (this.dunk > 0) return;
    if (this.lungeLeft > 0) {
      this.hoseOff(from);
      return;
    }
    const first = this.wet <= 0;
    this.wet = DRYING;

    // Hands go up, and more often than not the lead goes with them.
    if (first && Math.random() < LEAD_SLIPS) this.dog?.slipTheLead();

    const here = this.group.position;
    if (distanceToShore(here.x, here.z) < EDGE && !isInLake(here.x, here.z)) {
      this.topple();
      return;
    }

    this.strop = Math.max(this.strop, STROP_TIME);
    this.reactToSpray(SOAKED, first);
  }

  /**
   * Hit by filthy water bouncing off a pile. Worse than a clean soak — and
   * the handy ones may come for you if you're close enough.
   * Returns whether they've started a dig.
   */
  public foul(attacker: THREE.Vector3): boolean {
    if (this.dunk > 0) return false;
    if (this.lungeLeft > 0) {
      this.hoseOff(attacker);
      return false;
    }

    const first = this.fouled <= 0;
    this.wet = DRYING;
    this.fouled = Math.max(this.fouled, 18);

    if (first && Math.random() < LEAD_SLIPS) this.dog?.slipTheLead();

    const here = this.group.position;
    if (distanceToShore(here.x, here.z) < EDGE && !isInLake(here.x, here.z)) {
      this.topple();
      return false;
    }

    this.strop = 0;
    this.reactToSpray(FOULED, first);

    if (!first) {
      this.strop = STROP_TIME * (this.temper === "meek" ? 1 : 1.35);
      return false;
    }

    const gap = here.distanceTo(attacker);
    const chance =
      this.temper === "handy" ? 0.5 : this.temper === "narky" ? 0.14 : 0.03;
    if (gap < 5 && this.swingCool <= 0 && Math.random() < chance) {
      this.lungeLeft = 2.4;
      this.lungeAt.copy(attacker);
      this.swingReady = false;
      this.hoseHits = 0;
      this.say(SQUARE_UP);
      this.showMood("angry");
      return true;
    }

    this.strop = STROP_TIME * (this.temper === "meek" ? 1 : 1.35);
    return false;
  }

  /**
   * First hit gets a line straight away; keep spraying and they shout again
   * every couple of seconds, not on every droplet.
   */
  private reactToSpray(lines: readonly string[], first: boolean): void {
    if (!first && this.sprayTalkCool > 0) return;
    this.say(lines);
    this.sprayTalkCool = first ? 2.6 : 3.2;
  }

  /** Jet in the face while coming for you — stagger, shove, then back off. */
  private hoseOff(from?: THREE.Vector3): void {
    if (this.hoseCool > 0) return;
    this.hoseCool = 0.22;
    this.wet = DRYING;
    this.hoseHits += 1;
    this.lungeLeft -= 0.5;
    this.swingReady = false;

    if (from) {
      const here = this.group.position;
      const away = new THREE.Vector3()
        .subVectors(here, from)
        .setY(0);
      if (away.lengthSq() > 0.01) {
        away.normalize();
        const nx = here.x + away.x * 0.45;
        const nz = here.z + away.z * 0.45;
        if (!isInLake(nx, nz)) {
          here.x = nx;
          here.z = nz;
        } else if (distanceToShore(here.x, here.z) < EDGE) {
          this.lungeLeft = 0;
          this.hoseHits = 0;
          this.topple();
          return;
        }
      }
    }

    if (this.hoseHits >= 4 || this.lungeLeft <= 0) {
      this.lungeLeft = 0;
      this.hoseHits = 0;
      this.swingCool = 3.5;
      this.strop = STROP_TIME;
      this.say(BACK_OFF);
      this.showMood("shocked");
    }
  }

  /** True once when a lunging public lands a dig on you. */
  public wantsSwing(): boolean {
    if (!this.swingReady) return false;
    this.swingReady = false;
    this.swingCool = 4;
    this.lungeLeft = 0;
    this.strop = STROP_TIME;
    return true;
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
    const [leftArm, rightArm] = this.arms;
    const [left, right] = this.legs;
    this.showMood("shocked");

    if (age < FALL_TIME) {
      // Pitching forward off the edge, arms windmilling.
      const t = age / FALL_TIME;
      this.group.position.lerp(this.wentIn, Math.min(1, 6 * delta));
      this.group.rotation.x = t * 0.9;
      leftArm!.rotation.x = -2.4 * t;
      rightArm!.rotation.x = -2.1 * t;
      leftArm!.rotation.z = 0.7 * t;
      rightArm!.rotation.z = -0.7 * t;
      left!.rotation.x = 0.5 * t;
      right!.rotation.x = -0.3 * t;
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
      leftArm!.rotation.x = -1.5 + thrash * 1.2;
      rightArm!.rotation.x = -1.5 - thrash * 1.2;
      leftArm!.rotation.z = 0.5;
      rightArm!.rotation.z = -0.5;
      left!.rotation.x = -thrash * 0.5;
      right!.rotation.x = thrash * 0.5;
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
    leftArm!.rotation.x = -1.2 + heave * 0.6;
    rightArm!.rotation.x = -1.2 - heave * 0.6;
    left!.rotation.x = heave * 0.7;
    right!.rotation.x = -heave * 0.7;

    if (this.dunk <= 0) {
      // Out, dripping, and with plenty to say about it.
      this.group.position.copy(this.cameOut);
      this.group.rotation.set(0, this.group.rotation.y, 0);
      this.rejoinPath();
      this.strop = STROP_TIME;
      this.say(SOAKED);
      this.sprayTalkCool = 2.6;
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
    this.fromShore = THREE.MathUtils.clamp(
      distanceToShore(here.x, here.y),
      0.35,
      PATH_OUTER - 0.4,
    );
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
    if (this.fouled > 0) this.fouled = Math.max(0, this.fouled - delta);
    if (this.swingCool > 0) this.swingCool = Math.max(0, this.swingCool - delta);
    if (this.wet <= 0 && this.fouled <= 0) return;
    const soak =
      this.wet > 0 ? THREE.MathUtils.clamp(this.wet / 8, 0, 1) * 0.55 : 0;
    if (this.wet > 0) this.wet -= delta;
    const muck = THREE.MathUtils.clamp(this.fouled / 12, 0, 1) * 0.45;
    const stain = new THREE.Color(0x5a4a32);
    for (const { material, dry } of this.cloth) {
      material.color.copy(dry).multiplyScalar(1 - soak);
      if (muck > 0) material.color.lerp(stain, muck);
    }
  }

  private place(): void {
    const here = loopPoint(this.index);
    const ahead = loopPoint(this.index + this.direction);
    const forward = new THREE.Vector2().subVectors(ahead, here).normalize();
    // Left of the walk direction — probe which way is the water.
    const left = new THREE.Vector2(-forward.y, forward.x);
    const dLeft = distanceToShore(here.x + left.x * 3, here.y + left.y * 3);
    const dRight = distanceToShore(here.x - left.x * 3, here.y - left.y * 3);
    const lakeward = dLeft < dRight ? left : left.clone().negate();

    const loopDist = Math.max(0.2, distanceToShore(here.x, here.y));
    const shift = loopDist - this.fromShore;
    this.group.position.set(
      here.x + lakeward.x * shift,
      0,
      here.y + lakeward.y * shift,
    );
    this.group.rotation.y = Math.atan2(forward.x, forward.y);
  }

  /**
   * Walks them on, unless they've just trodden in something. Returns the index
   * of the mess they stepped in this frame, or -1.
   */
  public update(
    delta: number,
    mess: readonly THREE.Vector3[] = [],
    player: THREE.Vector3 | null = null,
  ): number {
    this.grumble =
      this.grumble?.update(delta, this.group.position) === false
        ? null
        : this.grumble;
    this.dry(delta);
    this.flecks.update(delta);
    if (this.hoseCool > 0) this.hoseCool = Math.max(0, this.hoseCool - delta);
    if (this.sprayTalkCool > 0)
      this.sprayTalkCool = Math.max(0, this.sprayTalkCool - delta);
    this.face.update(delta);
    this.kidFace?.update(delta);
    if (this.gawpCool > 0) this.gawpCool -= delta;

    if (this.errand === "arriving") {
      if (this.walkToward(this.joinAt, delta) < 0.4) {
        this.errand = "strolling";
        this.place();
      }
      return -1;
    }

    if (this.errand === "leaving") {
      if (!this.gateFor || this.walkToward(this.gateFor, delta) < 0.5) {
        this.gone = true;
      }
      return -1;
    }

    if (this.dunk > 0) {
      this.flounder(delta);
      return -1;
    }

    if (this.lungeLeft > 0) {
      if (player) this.lungeAt.copy(player);
      this.squareUp(delta);
      return -1;
    }

    if (this.scareLeft > 0) {
      this.fleeScare(delta);
      return -1;
    }

    if (this.gawpLeft > 0) {
      this.gawpLeft -= delta;
      this.faceToward(this.gawpAt.x, this.gawpAt.z);
      this.standAndWatch();
      if (this.gawpLeft <= 0) {
        this.showMood(this.wet > 0 ? "angry" : "idle");
      }
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

    if (this.errand === "binning") {
      if (!this.binFor || this.walkToward(this.binFor, delta) < 0.55) {
        this.finishBinning();
      }
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

    this.visitLeft -= delta;
    if (this.visitLeft <= 0) this.headHome();

    this.stepPhase += delta * this.speed * 4.5;
    const swing = Math.sin(this.stepPhase) * 0.55;
    this.stride(this.stepPhase, 1);
    this.trackItOut(swing);
    this.showMood(this.wet > 0 ? "angry" : "idle");

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
   * Stops and tips the bag into the pond for the kid to watch. The spot is
   * claimed by the game on the next frame to spawn the bread on the water.
   */
  private startScatter(): void {
    this.scattering = SCATTER_PAUSE;
    this.handfuls = 0;
    this.scatterAt = this.tossIntoPond();
    this.emptyHanded();

    this.grumble?.dispose();
    this.grumble = new Grumble(
      this.scene,
      SCATTER_LINES[Math.floor(Math.random() * SCATTER_LINES.length)]!,
      this.group.position,
    );
  }

  /** A few metres past the shore, where the swans and ducks can get at it. */
  private tossIntoPond(): THREE.Vector3 {
    const here = this.group.position;
    const shore = nearestShore(here.x, here.z);
    const out = outwardAt(shore);
    // Into the lake from where they're stood — past the edge, not at their feet.
    const reach = distanceToShore(here.x, here.z) + 2.2 + Math.random() * 3.5;
    const spot = new THREE.Vector3(
      here.x - out.x * reach,
      0,
      here.z - out.y * reach,
    );
    if (!isInLake(spot.x, spot.z)) {
      // Path's a long way out — drop it just inside the waterline instead.
      spot.set(shore.x - out.x * 2.8, 0, shore.y - out.y * 2.8);
    }
    return spot;
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
    if (Math.random() < 0.4) {
      this.say(SHIFTY);
      this.showMood("shifty");
    }
  }

  /** Where somebody just dropped something, once, for the game to spawn it. */
  public claimLitter(): THREE.Vector3 | null {
    const spot = this.litterAt;
    this.litterAt = null;
    return spot;
  }

  /** Where somebody just used a bin, once, for the game to fill it. */
  public claimDeposit(): THREE.Vector3 | null {
    const spot = this.depositAt;
    this.depositAt = null;
    return spot;
  }

  /** Where a family just tipped out their bread, once, for the game to use. */
  public claimScatter(): THREE.Vector3 | null {
    const spot = this.scatterAt;
    this.scatterAt = null;
    return spot;
  }

  /** Parent and child both flinging bread into the water. */
  /** Stood still facing the scrap, arms down. */
  private standAndWatch(): void {
    for (const arm of this.arms) {
      arm.rotation.x = 0;
      arm.rotation.z = 0;
    }
    for (const leg of this.legs) leg.rotation.x = 0;
    this.group.rotation.x = 0;
    this.group.position.y = 0;
  }

  private sprinkle(): void {
    const age = SCATTER_PAUSE - this.scattering;
    const toss = Math.sin(age * 6);
    const [leftArm, rightArm] = this.arms;
    rightArm!.rotation.x = -0.7 - toss * 0.7;
    rightArm!.rotation.z = -0.3;
    leftArm!.rotation.x = -0.2;
    leftArm!.rotation.z = 0.1;
    this.legs[0]!.rotation.x = 0;
    this.legs[1]!.rotation.x = 0;
    this.group.rotation.x = 0;
    this.group.position.y = 0;
    this.showMood("pleased");

    // Face the pond while they chuck it in.
    if (this.scatterAt) {
      this.faceToward(this.scatterAt.x, this.scatterAt.z);
    } else {
      const shore = nearestShore(this.group.position.x, this.group.position.z);
      const out = outwardAt(shore);
      this.faceToward(
        this.group.position.x - out.x,
        this.group.position.z - out.y,
      );
    }

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
    const [leftArm, rightArm] = this.arms;
    rightArm!.rotation.x = -0.9 - toss * 0.6;
    rightArm!.rotation.z = -0.25;
    leftArm!.rotation.x = 0.1;
    leftArm!.rotation.z = 0;
    this.legs[0]!.rotation.x = 0;
    this.legs[1]!.rotation.x = 0;
    this.group.rotation.x = 0;
    this.group.position.y = 0;
    this.showMood("pleased");
  }

  /** Closing the gap for a dig after being covered in muck. */
  private squareUp(delta: number): void {
    this.lungeLeft -= delta;
    this.showMood("angry");
    this.faceToward(this.lungeAt.x, this.lungeAt.z);

    const here = this.group.position;
    const to = new THREE.Vector3()
      .subVectors(this.lungeAt, here)
      .setY(0);
    const gap = to.length();
    const [leftArm, rightArm] = this.arms;
    const [left, right] = this.legs;

    if (gap > 1.55) {
      to.multiplyScalar((3.8 * delta) / gap);
      let nx = here.x + to.x;
      let nz = here.z + to.z;
      if (isInLake(nx, nz) || distanceToShore(nx, nz) < 0.6) {
        this.lungeLeft = 0;
        this.strop = STROP_TIME;
        return;
      }
      here.set(nx, 0, nz);
      const phase = (2.4 - this.lungeLeft) * 10;
      left!.rotation.x = Math.sin(phase) * 0.7;
      right!.rotation.x = -Math.sin(phase) * 0.7;
      leftArm!.rotation.x = -1.1;
      rightArm!.rotation.x = -1.4;
      leftArm!.rotation.z = 0.35;
      rightArm!.rotation.z = -0.55;
      this.group.position.y = Math.abs(Math.sin(phase)) * 0.06;
      return;
    }

    // In range — wind up and swing.
    const wind = Math.min(1, (2.4 - this.lungeLeft) * 2);
    rightArm!.rotation.x = -0.4 - wind * 1.8;
    rightArm!.rotation.z = -0.2 - wind * 0.9;
    leftArm!.rotation.x = -0.8;
    leftArm!.rotation.z = 0.4;
    left!.rotation.x = 0.2;
    right!.rotation.x = -0.35;
    this.group.rotation.x = -0.08;
    if (!this.swingReady && wind > 0.55) this.swingReady = true;
    if (this.lungeLeft <= 0) this.strop = STROP_TIME;
  }

  /** Hops back, then stands there scraping the offending shoe on the ground. */
  private throwStrop(): void {
    const age = STROP_TIME - this.strop;
    const [left, right] = this.legs;
    const [leftArm, rightArm] = this.arms;
    this.showMood(this.wet > 0 ? "angry" : "disgusted");

    if (age < 0.55) {
      // The recoil: both arms fly up and they rock back on their heels.
      const jolt = Math.sin((age / 0.55) * Math.PI);
      leftArm!.rotation.x = -2.2 * jolt;
      rightArm!.rotation.x = -2.2 * jolt;
      leftArm!.rotation.z = 0.5 * jolt;
      rightArm!.rotation.z = -0.5 * jolt;
      this.group.rotation.x = 0.16 * jolt;
      this.group.position.y = jolt * 0.12;
      right!.rotation.x = -1.1 * jolt;
      return;
    }

    // Scraping: dirty foot swings back and forth, the rest of them hopping.
    const scrape = Math.sin(age * 9);
    right!.rotation.x = -0.5 + scrape * 0.55;
    left!.rotation.x = 0.05;
    leftArm!.rotation.x = -0.6 + scrape * 0.2;
    rightArm!.rotation.x = -0.35 - scrape * 0.25;
    leftArm!.rotation.z = 0.28;
    rightArm!.rotation.z = -0.28;
    this.group.rotation.x = 0.08;
    this.group.position.y = Math.abs(Math.sin(age * 4.5)) * 0.05;
  }

  /** Away from the bird, quicker than a stroll, and not into the lake. */
  private fleeScare(delta: number): void {
    this.scareLeft -= delta;
    const pace = 3.4;
    const here = this.group.position;
    let nx = here.x + this.scareAway.x * pace * delta;
    let nz = here.z + this.scareAway.z * pace * delta;

    // Keep them on the bank — nobody's diving in to get away from a swan.
    if (isInLake(nx, nz) || distanceToShore(nx, nz) < 0.8) {
      const shore = nearestShore(here.x, here.z);
      const out = outwardAt(shore);
      this.scareAway.set(out.x, 0, out.y).normalize();
      nx = here.x + this.scareAway.x * pace * delta;
      nz = here.z + this.scareAway.z * pace * delta;
    }

    here.x = nx;
    here.z = nz;
    this.faceToward(here.x + this.scareAway.x, here.z + this.scareAway.z);
    this.stepPhase += delta * pace * 5.5;
    this.stride(this.stepPhase, 1.15);
    this.showMood("shocked");

    if (this.scareLeft > 0) return;

    // Back onto the circuit from wherever they ended up.
    const at = new THREE.Vector2(here.x, here.z);
    let best = 0;
    let closest = Infinity;
    for (let i = 0; i < PATH_LOOP.length; i++) {
      const gap = PATH_LOOP[i]!.distanceToSquared(at);
      if (gap < closest) {
        closest = gap;
        best = i;
      }
    }
    this.index = best;
    if (this.errand === "strolling") this.place();
  }

  public getPosition(): THREE.Vector3 {
    return this.group.position.clone();
  }
}
