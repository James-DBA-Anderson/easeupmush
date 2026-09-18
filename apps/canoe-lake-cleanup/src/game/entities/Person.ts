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
  northwestScore,
  pickNorthwestPathIndex,
} from "../world/lake";
import { parkGates } from "../world/fence";
import { binStations, cafeQueueSpot } from "../world/park";
import { stepWalk, clearWalkSpot } from "../world/blocking";
import { groundHeight } from "../world/terrain";
import { Grumble } from "../effects/Grumble";
import { MuckFlecks } from "../effects/MuckFlecks";
import { Dog } from "./Dog";
import { Face, type Mood } from "./Face";
import type { Tread } from "./Footprint";

type Errand = "arriving" | "strolling" | "binning" | "icecream" | "leaving";

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

const FACE_MUCK = [
  "IT'S ON MY FACE!",
  "GET IT OFF ME!",
  "URGH — MY FACE!",
  "I CAN TASTE IT!",
  "LOOK AT MY FACE!",
  "WIPE IT OFF — WIPE IT OFF!",
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

const GOTCHA = [
  "THAT'LL TEACH YOU!",
  "AND STAY DOWN!",
  "HOW'D YOU LIKE THAT?!",
  "RIGHT — SORTED!",
  "DON'T YOU COME NEAR ME AGAIN!",
  "HA!",
];

const CHASE_BORED = [
  "NOT WORTH IT",
  "FORGET IT",
  "I'VE HAD ENOUGH",
  "BLOODY WASTE OF TIME",
  "COME ON — WE'RE GOING",
];

const DUTY_LINES = [
  "WHERE'S THE DOG?!",
  "COME HERE — NOW!",
  "MY KID!",
  "LEAVE IT — HEEL!",
  "OI, STOP RUNNING OFF!",
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

const BIKE_CRASH = [
  "I'LL HAVE YOU FOR THAT!",
  "MY BIKE — COME HERE!",
  "YOU KNOCKED ME OFF!",
  "RIGHT, YOU'RE HAVING IT!",
  "I'LL LAY YOU OUT, MUSH!",
  "LOOK WHAT YOU'VE DONE!",
];

const HANDBAG_LINES = [
  "TAKE THAT!",
  "HOW DARE YOU!",
  "I'LL GIVE YOU WHAT FOR!",
  "YOU RUDE LITTLE SOD!",
  "THAT'S MY BEST COAT!",
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
/** Extra seconds rubbing muck off their face after a deep wade. */
const FACE_WIPE_EXTRA = 2.6;

/** Close enough to the edge that a good soaking puts them in the water. */
const EDGE = 3.6;
/** Stood on the bottom: Canoe Lake is only about a metre deep. */
const BED_Y = WATER_Y - 0.85;
/** Topple, flounder about, then haul themselves back out. */
const FALL_TIME = 0.7;
const SWIM_TIME = 2.8;
const CLIMB_TIME = 2.9;
/** How long they walk round dripping afterwards. */
const DRYING = 45;

const CLIMBED_OUT = [
  "I'M SOAKING!",
  "LOOK AT THE STATE OF ME!",
  "THAT WAS FREEZING!",
  "I'LL HAVE YOUR JOB!",
  "RUINED — THE LOT OF IT!",
  "NEVER AGAIN!",
  "I'M DRIPPING!",
];

/** A fair few of the park's regulars are only here to walk the dog. */
const DOG_CHANCE = 0.35;
/** How often a soaking loosens their grip on the lead. */
const LEAD_SLIPS = 0.95;

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

const FIRE_PANIC = [
  "FIRE!",
  "THE GRASS IS ALIGHT!",
  "GET BACK!",
  "SOMEONE CALL THE BRIGADE!",
  "RUN!",
  "IT'S SPREADING!",
  "LEAVE IT — GET CLEAR!",
  "BLOODY BARBECUES!",
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
/**
 * Furthest out across the paving a stroller may walk. Benches sit on the outer
 * lip (~PATH_OUTER − 1); walking that band gets them stuck against the seats.
 */
const STROLL_OUTER = PATH_OUTER - 3.5;
const SHIFTY = [
  "NOBODY SAW THAT",
  "THE COUNCIL CAN GET IT",
  "THERE'S NEVER A BIN",
  "IT'S BIODEGRADABLE, THAT",
  "JUST OFF FOR A SLASH ANYWAY",
];

/** Most bird food turns up on the NW bank; rare elsewhere. */
const FOOD_CHANCE = 0.48;
const HANDFULS = 3;
/** During the radio feeder rush a bag lasts a couple of minutes of feeding. */
const HANDFULS_RUSH = 55;
const FEED_PAUSE = 2.2;
/** Kid tipped / rolling — local Y so the body clears the paving. */
const KID_DOWN_Y = 0.48;

/** Depot radio: feeders on the NW stretch — bag odds go up for a while. */
let feederRush = false;

export function setFeederRush(on: boolean): void {
  feederRush = on;
}

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

const ICE_BUY = [
  "TWO NINETY PLEASE",
  "99 WITH A FLAKE",
  "ONE FOR HIM AS WELL",
  "VANILLA — NO, BOTH",
  "ANY SPRINKLES?",
];
const ICE_DROPPED = [
  "YOU'VE DROPPED IT!",
  "THAT WAS TWO QUID!",
  "LOOK AT THE STATE OF IT!",
  "HE JUST BOUGHT THAT!",
  "YOU'VE RUINED HIS ICE CREAM!",
  "THAT'S COMING OUT YOUR WAGES!",
];
const ICE_OWN = ["MY ICE CREAM!", "OI — THAT WAS MINE!", "LOOK AT IT!"];

const HELI_LINES = [
  "LOOK — A HELICOPTER!",
  "LOOK UP!",
  "IT'S GOING TO THE ISLAND!",
  "WAVE!",
  "CHOPPER!",
];

/** How many prints one bootful of it is good for. */
const TRACKED_PRINTS = 6;

/** Half of those carrying food have a kid with them, and they scatter it. */
const KID_CHANCE = 0.5;
const SCATTER_PAUSE = 4.5;

/** The odd walker brought a brolly — put up when it tips it down. */
const UMBRELLA_CHANCE = 0.22;
const UMBRELLA_COLOURS = [0x2c3e6b, 0x6b2c2c, 0x2c5a3a, 0x3a3a42, 0x5a3a1a, 0x6b4a2a];

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
    Math.random() < 0.28 ? "handy" : Math.random() < 0.5 ? "narky" : "meek";
  /** Closing in for a dig after being fouled. */
  private lungeLeft = 0;
  private lungeAt = new THREE.Vector3();
  private readonly lungeFor = 4.6;
  private swingReady = false;
  private swingCool = 0;
  /** Mid-punch / handbag-swipe animation (seconds left). */
  private swingAnim = 0;
  private swingHit = false;
  /** How long they've been stuck mid-lunge before packing it in. */
  private lungeStuck = 0;
  /** Hose hits taken while lunging — enough and they back off. */
  private hoseHits = 0;
  private hoseCool = 0;
  /**
   * Lasting temper after they're properly riled. Stays angry until they land
   * a dig, get bored, get hosed off, or have to round up dog / kid.
   */
  private madLeft = 0;
  /** Brief pleased face after they've had their dig. */
  private pleasedHold = 0;
  /** Holds off the next shout so every droplet doesn't get its own line. */
  private sprayTalkCool = 0;
  /** Older resident with a handbag — swings it when she loses it. */
  private handbag: THREE.Group | null = null;
  /** Brought a brolly — only some of them bother. */
  private umbrella: THREE.Group | null = null;
  private umbrellaCanopy: THREE.Object3D | null = null;
  /** 0 = left arm, 1 = right. */
  private umbrellaArm = 0;
  /** 0 furled at the side, 1 open over the head. */
  private umbrellaOpen = 0;
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
  /** Seconds left on their side after a hose tip. */
  private kidDown = 0;
  /** Hose hits taken while already down — enough and they start rolling. */
  private kidSprayHits = 0;
  private kidHoseCool = 0;
  private kidRolling = false;
  private readonly kidVel = new THREE.Vector3();
  private kidSpin = 0;
  private readonly kidHome = new THREE.Vector3(-0.48, 0, -0.1);
  /** Getting up after a bike dump before they come for you. */
  private getUpLeft = 0;
  private getUpTip = 1;
  private pendingLunge: THREE.Vector3 | null = null;
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
  /** How much muck is still on their face — wiped during the strop. */
  private faceFilth = 0;
  private readonly soilTmp = new THREE.Vector3();
  /** How long this strop runs (longer when they've got it on their face). */
  private stropFor = STROP_TIME;

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
  private climbSplashEarly = false;
  private climbSplashLate = false;
  /** Water still running off them after a dunk. */
  private drips: {
    mesh: THREE.Mesh;
    life: number;
    vx: number;
    vy: number;
    vz: number;
  }[] = [];
  private dripCool = 0;

  /** Some of them are only out here to walk this. */
  private dog: Dog | null = null;

  /** Whether they drop their rubbish, and when the next piece goes down. */
  private litterbug = Math.random() < LITTERBUG_CHANCE;
  private litterWait = 10 + Math.random() * LITTER_EVERY;
  private litterAt: THREE.Vector3 | null = null;
  /** Where they just put something in a bin, for the game to fill it. */
  private depositAt: THREE.Vector3 | null = null;
  private binFor: THREE.Vector2 | null = null;

  /** Ice cream run — peel off to a café hatch, then stroll with a cone. */
  private iceCreamWait = 25 + Math.random() * 55;
  private iceBuyLeft = 0;
  private cafeFor: THREE.Vector2 | null = null;
  private adultCone: THREE.Object3D | null = null;
  private kidCone: THREE.Object3D | null = null;
  private coneDropAt: THREE.Vector3 | null = null;

  /** Some of them want nothing to do with a swan on the bank. */
  private swanShy = Math.random() < SWAN_SHY_CHANCE;
  private scareLeft = 0;
  private scareAway = new THREE.Vector3(1, 0, 0);
  /** Stopped to watch birds scrap over the bread. */
  private gawpLeft = 0;
  private gawpAt = new THREE.Vector3();
  private gawpCool = 0;
  /** Kid arm-wave while mum/dad gawps at a chopper. */
  private heliWave = false;
  private heliWavedId = -1;
  private heliWavePhase = 0;

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
    // Feeders and the public they draw cluster on the NW stretch.
    this.index =
      Math.random() < 0.7 ? pickNorthwestPathIndex() : index;
    this.direction = Math.random() < 0.5 ? 1 : -1;
    this.speed = 1.1 + Math.random() * 0.9;
    // Plenty along the kerb (where a soak puts them in); the rest fill the
    // mid-path — not the outer lip where the benches are.
    this.fromShore =
      Math.random() < 0.42
        ? 0.35 + Math.random() * 2.8
        : 1.5 + Math.random() * (STROLL_OUTER - 1.5);

    this.group = this.build();
    this.flecks = new MuckFlecks(this.group);
    this.scene.add(this.group);

    if (arriving) this.startArrival(gate);
    else this.place();

    // The dog needs somewhere to heel, so it comes after they're stood up.
    if (!this.kid && Math.random() < DOG_CHANCE)
      this.dog = new Dog(scene, this);
  }

  /**
   * Stand in where a cyclist / e-bike lad just got hosed off. They haul
   * themselves up, then come for the cleaner — after that they're just another
   * stroller on the path.
   */
  public bootFromCrash(
    at: THREE.Vector3,
    attacker: THREE.Vector3,
    lout = false,
  ): void {
    // Crash victims don't keep the random kid / dog roll from construction.
    if (this.kid) {
      this.kid.removeFromParent();
      this.kid = null;
      this.kidFace = null;
      this.kidLegs = [];
      this.kidArms = [];
      this.kidCone = null;
    }
    if (this.dog) {
      this.dog.dispose();
      this.dog = null;
    }
    this.handfuls = 0;
    if (this.bag) {
      this.bag.removeFromParent();
      this.bag = null;
    }

    // Snap onto the nearest stretch of path so they can stroll after the scrap.
    const here = new THREE.Vector2(at.x, at.z);
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
    this.errand = "strolling";
    this.fromShore = Math.max(0.6, distanceToShore(at.x, at.z));
    this.group.position.set(at.x, 0.12, at.z);
    this.faceToward(attacker.x, attacker.z);

    this.temper = lout ? "handy" : Math.random() < 0.6 ? "handy" : "narky";
    this.wet = DRYING;
    this.strop = 0;
    this.getUpTip = Math.random() < 0.5 ? 1 : -1;
    this.getUpLeft = 0.9 + Math.random() * 0.35;
    this.group.rotation.z = this.getUpTip * (Math.PI / 2);
    this.pendingLunge = attacker.clone();
    this.enrage(attacker, 1.6);
    this.showMood("angry");
    this.say(BIKE_CRASH);
  }

  /** Lined up outside a gate, walking in toward the nearest bit of path. */
  private startArrival(preferred?: THREE.Vector2): void {
    this.errand = "arriving";
    const gates = parkGates();
    // Prefer openings that land you on the NW feeding stretch.
    let gate = preferred;
    if (!gate) {
      let best = gates[0]!;
      let bestScore = -1;
      for (const g of gates) {
        const score = northwestScore(g.x, g.y) + Math.random() * 0.15;
        if (score > bestScore) {
          bestScore = score;
          best = g;
        }
      }
      gate = Math.random() < 0.75 ? best : gates[Math.floor(Math.random() * gates.length)]!;
    }
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
    // Join on a clear footfall near the loop — not inside a bench / bin / trunk.
    const join = loopPoint(best);
    const ahead = loopPoint(best + 1);
    const along = new THREE.Vector2().subVectors(ahead, join).normalize();
    const shore = nearestShore(join.x, join.y);
    const inland = outwardAt(shore);
    const clear = clearWalkSpot(join.x, join.y, {
      radius: 0.45,
      inland: { x: inland.x, z: inland.y },
      along: { x: along.x, z: along.y },
      reach: 5,
    });
    this.joinAt.set(clear.x, clear.z);
    this.faceToward(this.joinAt.x, this.joinAt.y);
  }

  /** Time's up — peel off the loop toward the nearest way out. */
  public headHome(): void {
    if (
      this.errand === "leaving" ||
      this.errand === "binning" ||
      this.errand === "icecream"
    ) {
      return;
    }
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
    for (const drop of this.drips) {
      this.scene.remove(drop.mesh);
      drop.mesh.geometry.dispose();
      (drop.mesh.material as THREE.Material).dispose();
    }
    this.drips = [];
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
    const dx = ((to.x - here.x) / gap) * step;
    const dz = ((to.y - here.z) / gap) * step;
    const self = { x: here.x, z: here.z };
    let landed = stepWalk(here.x, here.z, dx, dz, 0.4, self);
    // Straight line across the water? Skirt the shore instead of wading.
    if (
      Math.hypot(landed.x - here.x, landed.z - here.z) < 0.001 &&
      step > 0
    ) {
      const out = outwardAt(nearestShore(here.x, here.z));
      const tx = -out.y;
      const tz = out.x;
      const prefer = dx * tx + dz * tz >= 0 ? 1 : -1;
      landed = stepWalk(
        here.x,
        here.z,
        tx * prefer * step,
        tz * prefer * step,
        0.4,
        self,
      );
      if (Math.hypot(landed.x - here.x, landed.z - here.z) < 0.001) {
        landed = stepWalk(
          here.x,
          here.z,
          out.x * step,
          out.y * step,
          0.4,
          self,
        );
      }
    }
    here.x = landed.x;
    here.z = landed.z;
    this.faceToward(to.x, to.y);
    this.stepPhase += delta * this.speed * 4.5;
    this.stride(this.stepPhase, 1);
    this.showMood("idle");
    // If a wall stopped them short, treat the remaining gap as whatever's left.
    return Math.hypot(to.x - here.x, to.y - here.z);
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
    this.group.position.y =
      groundHeight(this.group.position.x, this.group.position.z) + bob;

    if (this.kid) {
      if (this.kidDown > 0) {
        // Stay flat — no trotting while they're on the deck.
        this.kidLegs[0]!.rotation.x = 0.9;
        this.kidLegs[1]!.rotation.x = 0.9;
        this.kidArms[0]!.rotation.x = -0.4;
        this.kidArms[1]!.rotation.x = -0.4;
      } else {
        const trot = Math.sin(phase * 1.9 * rate) * 0.65;
        this.kidLegs[0]!.rotation.x = trot;
        this.kidLegs[1]!.rotation.x = -trot;
        this.kidArms[0]!.rotation.x = -trot * 0.7;
        this.kidArms[1]!.rotation.x = trot * 0.7;
        this.kid.position.y = Math.abs(Math.sin(phase * 1.9)) * 0.05;
      }
    }
    this.poseUmbrella();
  }

  private showMood(mood: Mood): void {
    // Once they're properly angry, keep the face locked until they cool off.
    if (this.madLeft > 0) {
      if (mood !== "angry" && !(this.dunk > 0 && mood === "shocked")) {
        mood = "angry";
      }
    } else if (this.pleasedHold > 0 && (mood === "idle" || mood === "disgusted")) {
      mood = "pleased";
    }
    this.face.setMood(mood);
    this.kidFace?.setMood(mood === "shifty" ? "pleased" : mood);
  }

  /** Riled properly — face stays angry and they keep coming until sorted. */
  private enrage(from: THREE.Vector3 | undefined, heat = 1): void {
    const boost = 7 + heat * 6 + Math.random() * 4;
    this.madLeft = Math.max(this.madLeft, boost);
    this.pleasedHold = 0;
    this.strop = 0;
    this.scareLeft = 0;
    if (from) this.lungeAt.copy(from);
    this.showMood("angry");
    if (
      from &&
      this.dunk <= 0 &&
      this.lungeLeft <= 0 &&
      this.swingCool <= 0
    ) {
      const here = this.group.position;
      const gap = Math.hypot(here.x - from.x, here.z - from.z);
      if (gap < 11) this.beginLunge(from, false);
    }
  }

  private coolOff(reason: "satisfied" | "bored" | "tired" | "duty"): void {
    this.madLeft = 0;
    this.lungeLeft = 0;
    this.swingAnim = 0;
    this.swingReady = false;
    this.hoseHits = 0;
    this.torso.rotation.set(0, 0, 0);
    this.group.rotation.x = 0;

    if (reason === "satisfied") {
      this.say(GOTCHA);
      this.pleasedHold = 2.8;
      this.showMood("pleased");
      this.swingCool = Math.max(this.swingCool, 2.5);
      return;
    }
    if (reason === "tired") {
      this.say(BACK_OFF);
      this.swingCool = Math.max(this.swingCool, 3.5);
      this.strop = STROP_TIME * 0.6;
      this.stropFor = this.strop;
      this.showMood("shocked");
      return;
    }
    if (reason === "duty") {
      this.say(DUTY_LINES);
      this.swingCool = Math.max(this.swingCool, 1.5);
      if (this.kid) this.resetKidPose();
      this.showMood("shocked");
      return;
    }
    // Bored of the chase.
    this.say(CHASE_BORED);
    this.swingCool = Math.max(this.swingCool, 2);
    this.showMood("disgusted");
    this.strop = STROP_TIME * 0.45;
    this.stropFor = this.strop;
  }

  /** Dog's done a runner, or the kid's been left on the ground / behind. */
  private dutyCalls(player: THREE.Vector3 | null): boolean {
    if (this.dog?.isLoose()) {
      const dog = this.dog.getPosition();
      const dogGap = this.group.position.distanceTo(dog);
      if (dogGap > 7.5) return true;
      if (
        player &&
        dogGap > 4.5 &&
        this.group.position.distanceTo(player) > 6.5
      ) {
        return true;
      }
    }
    if (this.kid) {
      const kw = new THREE.Vector3();
      this.kid.getWorldPosition(kw);
      const kidGap = this.group.position.distanceTo(kw);
      if (this.kidDown > 0 && kidGap > 1.1) return true;
      if (kidGap > 3.8) return true;
    }
    return false;
  }

  /** Keep the chase alive between swings until they cool off. */
  private tickMad(delta: number, player: THREE.Vector3 | null): void {
    if (this.pleasedHold > 0) {
      this.pleasedHold = Math.max(0, this.pleasedHold - delta);
    }
    if (this.madLeft <= 0) return;

    if (this.dutyCalls(player)) {
      this.coolOff("duty");
      return;
    }

    this.madLeft -= delta;
    if (this.madLeft <= 0) {
      this.coolOff("bored");
      return;
    }

    this.showMood("angry");
    if (
      !player ||
      this.dunk > 0 ||
      this.lungeLeft > 0 ||
      this.swingCool > 0 ||
      this.getUpLeft > 0
    ) {
      return;
    }

    const gap = this.group.position.distanceTo(player);
    if (gap < 11) this.beginLunge(player, false);
    else this.madLeft -= delta * 0.65; // lose interest if you scarper
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

    if (Math.random() < this.foodOdds()) {
      this.giveBag();
      if (Math.random() < KID_CHANCE) this.addKid(group);
    } else if (Math.random() < 0.2) {
      // Grey-haired auntie with a handbag — swings it when she loses it.
      this.giveHandbag();
    }

    if (Math.random() < UMBRELLA_CHANCE) this.giveUmbrella(group);

    return group;
  }

  /** Furled by the hip until the rain starts, then up over the head. */
  private giveUmbrella(person: THREE.Group): void {
    // Left hand unless a handbag's already there; food stays in the right.
    this.umbrellaArm = this.handbag ? 1 : 0;
    if (this.umbrellaArm === 1 && this.bag) this.umbrellaArm = 0;

    const colour =
      UMBRELLA_COLOURS[Math.floor(Math.random() * UMBRELLA_COLOURS.length)]!;
    const brolly = new THREE.Group();
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.015, 1.05, 6),
      new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.85 }),
    );
    shaft.position.y = 0.52;
    shaft.castShadow = true;
    brolly.add(shaft);

    const canopy = new THREE.Mesh(
      new THREE.ConeGeometry(0.58, 0.32, 12, 1, true),
      new THREE.MeshStandardMaterial({
        color: colour,
        roughness: 0.8,
        side: THREE.DoubleSide,
      }),
    );
    // Tip at the top of the stick; fabric flares down.
    canopy.position.y = 1.02;
    canopy.castShadow = true;
    brolly.add(canopy);

    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 6, 4),
      new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.7 }),
    );
    tip.position.y = 1.1;
    brolly.add(tip);

    person.add(brolly);
    this.umbrella = brolly;
    this.umbrellaCanopy = canopy;
    this.poseUmbrella();
  }

  /** Lerp open/shut from the weather, then seat the mesh and raise an arm. */
  private tickUmbrella(delta: number, raining: boolean): void {
    if (!this.umbrella) return;
    // In the drink or mid-scrap they don't fuss with the brolly.
    const want =
      raining && this.dunk <= 0 && this.lungeLeft <= 0 && this.strop <= 0
        ? 1
        : 0;
    this.umbrellaOpen = THREE.MathUtils.damp(
      this.umbrellaOpen,
      want,
      4.5,
      delta,
    );
    this.poseUmbrella();
  }

  private poseUmbrella(): void {
    if (!this.umbrella || !this.umbrellaCanopy) return;
    const t = this.umbrellaOpen;
    const side = this.umbrellaArm === 0 ? -1 : 1;
    // Furled by the hip → open above the head.
    this.umbrella.position.set(
      THREE.MathUtils.lerp(side * 0.32, side * 0.12, t),
      THREE.MathUtils.lerp(0.95, 2.05, t),
      THREE.MathUtils.lerp(0.08, 0.02, t),
    );
    this.umbrella.rotation.set(
      THREE.MathUtils.lerp(0.35, 0.05, t),
      0,
      THREE.MathUtils.lerp(side * 0.25, side * 0.08, t),
    );
    // Collapsed fabric hugs the stick; open fills out over the head.
    const flare = 0.08 + t * 0.92;
    this.umbrellaCanopy.scale.set(flare, 0.35 + t * 0.65, flare);
    this.umbrellaCanopy.visible = t > 0.04;

    if (t < 0.05) return;
    const arm = this.arms[this.umbrellaArm]!;
    arm.rotation.x = THREE.MathUtils.lerp(arm.rotation.x, -2.55, t);
    arm.rotation.z = THREE.MathUtils.lerp(
      arm.rotation.z,
      side * -0.35,
      t,
    );
  }

  /** Patent handbag on the left arm — for a proper seaside swipe. */
  private giveHandbag(): void {
    const bag = new THREE.Group();
    const leather = new THREE.MeshStandardMaterial({
      color: Math.random() < 0.5 ? 0x2a1a18 : 0x6a3038,
      roughness: 0.75,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.1), leather);
    body.castShadow = true;
    bag.add(body);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.1), leather);
    flap.position.y = 0.1;
    bag.add(flap);
    const clasp = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.03, 0.02),
      new THREE.MeshStandardMaterial({
        color: 0xc9a227,
        roughness: 0.4,
        metalness: 0.6,
      }),
    );
    clasp.position.set(0, 0.08, 0.06);
    bag.add(clasp);
    const handle = new THREE.Mesh(
      new THREE.TorusGeometry(0.07, 0.012, 6, 10, Math.PI),
      leather,
    );
    handle.rotation.x = Math.PI / 2;
    handle.position.y = 0.14;
    bag.add(handle);
    // Left forearm — hangs by the side while walking.
    bag.position.set(-0.02, -0.28, 0.08);
    bag.rotation.set(0.15, 0.1, 0.2);
    this.arms[0]!.children[1]!.add(bag);
    this.handbag = bag;
  }

  /** Bags of bread are common on the NW stretch, scarce round the rest. */
  private foodOdds(): number {
    const at = loopPoint(this.index);
    const nw = northwestScore(at.x, at.y);
    const rush = feederRush ? 2.4 : 1;
    return FOOD_CHANCE * (0.2 + nw * nw * 2.2) * rush;
  }

  private giveBag(): void {
    this.handfuls = feederRush ? HANDFULS_RUSH : HANDFULS;
    this.bag = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.26, 0.14),
      new THREE.MeshStandardMaterial({ color: 0xd8c9a4, roughness: 1 }),
    );
    // Carried in the right hand, at the bottom of the forearm.
    this.bag.position.set(0.02, -0.32, 0.06);
    this.bag.castShadow = true;
    this.arms[1]!.children[1]!.add(this.bag);
    // Stay on the stretch while the bag lasts — don't clock out mid-feed.
    if (feederRush) {
      this.visitLeft = Math.max(this.visitLeft, 160);
    }
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

  /** Washer hits a feeder — bag gone, off home. */
  private ditchFeederBag(): void {
    if (!feederRush || this.handfuls <= 0) return;
    this.handfuls = 0;
    if (this.bag) {
      this.bag.removeFromParent();
      this.bag = null;
    }
    this.scattering = 0;
    this.feeding = 0;
    this.headHome();
  }

  /**
   * Radio feeder rush: top up / hand out a long bag so they linger on the
   * stretch until sprayed or the food's gone (~couple of minutes).
   */
  public stockForFeederRush(): void {
    if (!feederRush) return;
    if (this.handfuls > 0) {
      this.handfuls = HANDFULS_RUSH;
      this.visitLeft = Math.max(this.visitLeft, 160);
      return;
    }
    this.giveBag();
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

  /** Peel off toward the nearest café for a 99. */
  private startIceCream(): void {
    if (this.adultCone || this.kidCone) return;
    if (this.errand !== "strolling") return;
    const spot = cafeQueueSpot(this.group.position);
    if (!spot) return;
    this.errand = "icecream";
    this.cafeFor = new THREE.Vector2(spot.x, spot.z);
    this.iceBuyLeft = 0;
  }

  /** Paid up — cones in hand, back onto the circuit. */
  private finishIceCream(): void {
    this.cafeFor = null;
    this.iceBuyLeft = 0;
    this.errand = "strolling";

    if (this.kid) {
      this.kidCone = this.makeCone();
      // Right hand, dangling out in front where everyone can see it.
      this.kidArms[1]!.add(this.kidCone);
      this.kidCone.position.set(0.02, -0.26, 0.08);
      this.kidCone.rotation.x = 0.35;
      // Mum or dad often gets one too.
      if (Math.random() < 0.55) this.giveAdultCone();
    } else {
      this.giveAdultCone();
    }
    this.say(ICE_BUY);
    this.showMood("pleased");

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

  private giveAdultCone(): void {
    if (this.adultCone) return;
    this.adultCone = this.makeCone();
    // Same hand as the bread bag when they've got one — sits in front of it.
    const hand = this.arms[1]!.children[1]!;
    hand.add(this.adultCone);
    this.adultCone.position.set(0.04, -0.28, 0.1);
    this.adultCone.rotation.x = 0.4;
  }

  private makeCone(): THREE.Group {
    const cone = new THREE.Group();
    const wafer = new THREE.Mesh(
      new THREE.ConeGeometry(0.045, 0.14, 6),
      new THREE.MeshStandardMaterial({ color: 0xc9a06a, roughness: 0.9 }),
    );
    wafer.position.y = 0.07;
    cone.add(wafer);

    const flavours = [0xf2e6d8, 0xe8a0b0, 0xc88a4a, 0xf0d060];
    const scoop = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 8, 6),
      new THREE.MeshStandardMaterial({
        color: flavours[Math.floor(Math.random() * flavours.length)]!,
        roughness: 0.85,
      }),
    );
    scoop.position.y = 0.16;
    cone.add(scoop);

    if (Math.random() < 0.55) {
      const flake = new THREE.Mesh(
        new THREE.BoxGeometry(0.025, 0.09, 0.02),
        new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.7 }),
      );
      flake.position.set(0.01, 0.22, 0);
      flake.rotation.z = 0.25;
      cone.add(flake);
    }
    return cone;
  }

  /**
   * Cone hits the deck. If you caused it (spray) and they've got a kid,
   * parents can properly lose it.
   */
  private spillCone(attacker?: THREE.Vector3): void {
    const hadKidCone = !!this.kidCone;
    if (this.kidCone) {
      this.kidCone.removeFromParent();
      this.kidCone = null;
    } else if (this.adultCone) {
      this.adultCone.removeFromParent();
      this.adultCone = null;
    } else {
      return;
    }

    // Adult keeps theirs unless the jet got that too.
    if (attacker && this.adultCone && Math.random() < 0.4) {
      this.adultCone.removeFromParent();
      this.adultCone = null;
    }

    const here = this.group.position;
    this.coneDropAt = new THREE.Vector3(
      here.x + (Math.random() - 0.5) * 0.5,
      0,
      here.z + (Math.random() - 0.5) * 0.5,
    );

    if (hadKidCone) {
      this.say(ICE_DROPPED);
    } else {
      this.say(ICE_OWN);
    }

    if (!attacker || this.dunk > 0 || this.lungeLeft > 0) {
      if (this.lungeLeft <= 0) {
        this.strop = Math.max(this.strop, STROP_TIME * 1.2);
        this.stropFor = Math.max(this.stropFor, this.strop);
      }
      this.showMood("angry");
      return;
    }
    // Ruining a kid's 99 is a proper fight-starter — even meek sorts can snap.
    if (this.tryLunge(attacker, hadKidCone ? 1.6 : 0.85)) {
      this.enrage(attacker, hadKidCone ? 1.8 : 1);
      return;
    }
    this.enrage(attacker, hadKidCone ? 1.4 : 0.8);
  }

  /** Dropped cone for the game to spawn as litter. */
  public claimConeDrop(): THREE.Vector3 | null {
    const spot = this.coneDropAt;
    this.coneDropAt = null;
    return spot;
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
    this.kid.position.copy(this.kidHome);

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
    if (dx * dx + dz * dz <= 0.55 * 0.55) {
      if (point.y > here.y - 0.1 && point.y < here.y + 1.85) return true;
    }
    // Kid trails a step behind — count a hit on them too.
    if (this.kid) {
      const kw = new THREE.Vector3();
      this.kid.getWorldPosition(kw);
      const kx = point.x - kw.x;
      const kz = point.z - kw.z;
      if (kx * kx + kz * kz <= 0.38 * 0.38) {
        if (point.y > kw.y - 0.1 && point.y < kw.y + 1.15) return true;
      }
    }
    return false;
  }

  /** Filthy bounce spray sticks to coats and faces. */
  public splatter(point: THREE.Vector3): void {
    this.flecks.splat(point);
  }

  /** Clean lance on the muck — flecks rinse off; fouling clears when it's gone. */
  public rinse(point: THREE.Vector3): boolean {
    const cleared = this.flecks.rinseNear(point, 0.6);
    if (cleared && this.flecks.isEmpty()) this.fouled = 0;
    return cleared;
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
    this.stropFor = this.strop;
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
      this.madLeft > 0 ||
      this.lungeLeft > 0 ||
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
   * Grass fire on the green — drop everything and clear out inland, shouting.
   */
  public panicFromFire(at: THREE.Vector3): void {
    if (
      this.dunk > 0 ||
      this.errand === "arriving" ||
      this.errand === "leaving"
    )
      return;

    const here = this.group.position;
    const gap = here.distanceTo(at);
    if (gap > 22) return;
    // Already scarpering hard enough.
    if (this.scareLeft > 2.5) return;

    this.feeding = 0;
    this.scattering = 0;
    this.strop = 0;
    this.gawpLeft = 0;

    this.scareLeft = 4.5 + Math.random() * 2.5;
    this.scareAway.subVectors(here, at).setY(0);
    if (this.scareAway.lengthSq() < 0.01) {
      this.scareAway.set(
        Math.sin(this.group.rotation.y + Math.PI),
        0,
        Math.cos(this.group.rotation.y + Math.PI),
      );
    }
    this.scareAway.normalize();

    // Prefer away from the lake if the fire's between them and the water.
    const shore = nearestShore(here.x, here.z);
    const out = outwardAt(shore);
    this.scareAway.addScaledVector(new THREE.Vector3(out.x, 0, out.y), 0.7);
    this.scareAway.normalize();

    if (Math.random() < 0.7) this.say(FIRE_PANIC);
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
      this.madLeft > 0 ||
      this.lungeLeft > 0 ||
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
    this.heliWave = false;
    this.say(BIRD_FIGHT);
    this.showMood(Math.random() < 0.45 ? "shocked" : "pleased");
  }

  /**
   * Chopper on the Island run — kids stop and wave; adults look up with them.
   */
  public noticeHelicopter(id: number, at: THREE.Vector3): void {
    if (!this.kid || this.kidDown > 0) return;
    if (this.heliWavedId === id) return;
    if (
      this.dunk > 0 ||
      this.scareLeft > 0 ||
      this.strop > 0 ||
      this.madLeft > 0 ||
      this.lungeLeft > 0 ||
      this.scattering > 0 ||
      this.feeding > 0 ||
      this.gawpLeft > 0
    )
      return;
    if (this.errand === "arriving" || this.errand === "leaving") return;

    const here = this.group.position;
    const gap = Math.hypot(at.x - here.x, at.z - here.z);
    if (gap > 110) return;

    this.heliWavedId = id;
    // Not every family looks up — about half do.
    if (Math.random() > 0.55) return;

    this.gawpLeft = 5.5 + Math.random() * 2.5;
    this.gawpCool = 10;
    this.gawpAt.copy(at);
    this.heliWave = true;
    this.heliWavePhase = Math.random() * Math.PI * 2;
    if (Math.random() < 0.7) this.say(HELI_LINES);
    this.showMood("pleased");
    this.kidFace?.setMood("pleased");
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
    if (this.dog && !this.dog.isLoose() && Math.random() < LEAD_SLIPS) {
      this.dog.slipTheLead();
    }

    // Ice cream and a jet don't mix — kids drop theirs straight away.
    if (this.kidCone && Math.random() < (first ? 0.82 : 0.45)) {
      this.spillCone(from);
    } else if (this.adultCone && Math.random() < (first ? 0.4 : 0.18)) {
      this.spillCone(from);
    }

    // Hose the feeders off the NW stretch — bag ditched, they're done.
    if (first) this.ditchFeederBag();

    // Little ones tip over on the jet; they only roll if you keep blasting.
    if (this.kid) this.tipKid(from);

    const here = this.group.position;
    if (distanceToShore(here.x, here.z) < EDGE && !isInLake(here.x, here.z)) {
      this.topple();
      return;
    }

    // Already squared up over the cone — don't stack another strop on top.
    if (this.lungeLeft > 0) return;

    if (from) {
      const heat = first ? 1 : 0.45;
      if (this.tryLunge(from, heat)) {
        this.enrage(from, heat);
        return;
      }
      // Already steaming, or narky enough to stay mad without swinging yet.
      if (this.madLeft > 0 || this.temper !== "meek") {
        this.enrage(from, heat * 0.7);
        this.reactToSpray(SOAKED, first);
        return;
      }
    }

    this.strop = Math.max(this.strop, STROP_TIME);
    this.stropFor = Math.max(this.stropFor, this.strop);
    this.reactToSpray(SOAKED, first);
  }

  /**
   * Hit by filthy water bouncing off a pile. Worse than a clean soak — and
   * the handy ones may come for you if you're close enough. Keep the dirty
   * jet on them and narky sorts can still lose it.
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

    if (this.dog && !this.dog.isLoose() && Math.random() < LEAD_SLIPS) {
      this.dog.slipTheLead();
    }

    if (first) this.ditchFeederBag();

    // Filthy jet + ice cream is a red rag — drop it and come for you.
    if (this.kidCone && Math.random() < (first ? 0.9 : 0.55)) {
      this.spillCone(attacker);
    } else if (this.adultCone && Math.random() < (first ? 0.55 : 0.25)) {
      this.spillCone(attacker);
    }

    if (this.kid) this.tipKid(attacker);

    const here = this.group.position;
    if (distanceToShore(here.x, here.z) < EDGE && !isInLake(here.x, here.z)) {
      this.topple();
      return this.lungeLeft > 0;
    }

    this.strop = 0;
    this.reactToSpray(FOULED, first);
    if (this.lungeLeft > 0) return true;

    if (this.tryLunge(attacker, first ? 1.35 : 0.55)) {
      this.enrage(attacker, first ? 1.5 : 0.8);
      return true;
    }

    // Filthy spray always leaves them steaming, even if they don't charge yet.
    this.enrage(attacker, first ? 1.2 : 0.6);
    return this.madLeft > 0;
  }

  /**
   * Come for the cleaner if they're in range and this person's in the mood.
   * `heat` scales the odds — filthy spray and ruined ice cream run hotter.
   */
  private tryLunge(attacker: THREE.Vector3, heat = 1): boolean {
    if (this.dunk > 0 || this.lungeLeft > 0 || this.swingCool > 0) return false;
    const here = this.group.position;
    const gap = Math.hypot(here.x - attacker.x, here.z - attacker.z);
    if (gap > 8.5) return false;

    const base =
      this.temper === "handy" ? 0.72 : this.temper === "narky" ? 0.38 : 0.1;
    if (Math.random() >= Math.min(0.95, base * heat)) return false;

    this.beginLunge(attacker);
    return true;
  }

  /** Always squares up. `shout` false when re-engaging mid-temper. */
  private beginLunge(attacker: THREE.Vector3, shout = true): void {
    this.lungeLeft = this.lungeFor;
    this.lungeAt.copy(attacker);
    this.swingReady = false;
    this.swingAnim = 0;
    this.swingHit = false;
    this.hoseHits = 0;
    this.lungeStuck = 0;
    this.strop = 0;
    this.madLeft = Math.max(this.madLeft, this.lungeFor + 5 + Math.random() * 3);
    this.pleasedHold = 0;
    if (shout) this.say(this.handbag ? HANDBAG_LINES : SQUARE_UP);
    this.showMood("angry");
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
      this.coolOff("tired");
    }
  }

  /** True once when a lunging public lands a dig on you. */
  public wantsSwing(): boolean {
    if (!this.swingReady) return false;
    this.swingReady = false;
    this.coolOff("satisfied");
    if (this.handbag) this.handbag.rotation.set(0.15, 0.1, 0.2);
    return true;
  }

  /**
   * Hose tips the kid onto their side. One blast = down and staying put;
   * keep the jet on them and they bowl along like a cygnet.
   */
  private tipKid(from?: THREE.Vector3): void {
    if (!this.kid || this.dunk > 0) return;

    if (this.kidDown > 0) {
      if (this.kidHoseCool > 0) return;
      this.kidHoseCool = 0.16;
      this.kidSprayHits += 1;
      this.kidDown = Math.max(this.kidDown, 1.6);
      this.shoveKid(from, this.kidRolling ? 2.8 : 1.1);
      if (this.kidSprayHits >= 2) this.kidRolling = true;
      return;
    }

    this.kidDown = 2.2;
    this.kidSprayHits = 0;
    this.kidRolling = false;
    this.kidVel.set(0, 0, 0);
    this.kidSpin = 0;
    this.kidHoseCool = 0.2;
    this.kid.rotation.set(0, 0, Math.PI / 2);
    this.kid.position.y = KID_DOWN_Y;
    this.kidFace?.setMood("shocked");
    if (this.kidCone) this.spillCone(from);
    this.shoveKid(from, 0.35);
  }

  /** Push the kid in parent-local xz away from the lance. */
  private shoveKid(from: THREE.Vector3 | undefined, force: number): void {
    if (!this.kid || !from || force <= 0) return;
    const world = new THREE.Vector3();
    this.kid.getWorldPosition(world);
    const away = new THREE.Vector3().subVectors(world, from).setY(0);
    if (away.lengthSq() < 0.01) {
      away.set(-Math.sin(this.group.rotation.y), 0, -Math.cos(this.group.rotation.y));
    }
    away.normalize();
    // World push → parent local (yaw only).
    const yaw = this.group.rotation.y;
    const lx = away.x * Math.cos(yaw) + away.z * Math.sin(yaw);
    const lz = -away.x * Math.sin(yaw) + away.z * Math.cos(yaw);
    this.kidVel.x += lx * force;
    this.kidVel.z += lz * force;
    const max = this.kidRolling ? 5.5 : 1.6;
    if (this.kidVel.length() > max) this.kidVel.setLength(max);
  }

  private tickKidDown(delta: number): void {
    if (!this.kid || this.kidDown <= 0) return;
    if (this.kidHoseCool > 0) this.kidHoseCool = Math.max(0, this.kidHoseCool - delta);
    this.kidDown -= delta;

    if (this.kidRolling) {
      this.kidVel.multiplyScalar(Math.max(0, 1 - 1.4 * delta));
      this.kid.position.x += this.kidVel.x * delta;
      this.kid.position.z += this.kidVel.z * delta;
      const speed = this.kidVel.length();
      if (speed > 0.2) {
        this.kidSpin += speed * 3.2 * delta;
        this.kid.rotation.x = this.kidSpin;
      }
      this.kid.rotation.z = Math.PI / 2;
      this.kid.position.y = KID_DOWN_Y;
      // Cap how far they skid from mum.
      const homeGap = Math.hypot(
        this.kid.position.x - this.kidHome.x,
        this.kid.position.z - this.kidHome.z,
      );
      if (homeGap > 2.4) {
        this.kidVel.multiplyScalar(0.35);
      }
    } else {
      this.kid.rotation.set(0, 0, Math.PI / 2);
      this.kid.position.y = KID_DOWN_Y;
      this.kidVel.multiplyScalar(Math.max(0, 1 - 3 * delta));
      this.kid.position.x += this.kidVel.x * delta;
      this.kid.position.z += this.kidVel.z * delta;
    }

    if (this.kidDown > 0) return;

    // Back on their feet beside mum.
    this.kidRolling = false;
    this.kidSprayHits = 0;
    this.kidVel.set(0, 0, 0);
    this.kidSpin = 0;
    this.kid.rotation.set(0, 0, 0);
    this.kid.position.copy(this.kidHome);
    this.kidFace?.setMood("idle");
  }

  private resetKidPose(): void {
    if (!this.kid) return;
    this.kidDown = 0;
    this.kidRolling = false;
    this.kidSprayHits = 0;
    this.kidHoseCool = 0;
    this.kidVel.set(0, 0, 0);
    this.kidSpin = 0;
    this.kid.rotation.set(0, 0, 0);
    this.kid.position.copy(this.kidHome);
  }

  /** Heavy hose — knocked flat or into the lake. */
  public knockDown(from?: THREE.Vector3): void {
    if (this.dunk > 0) return;
    this.wet = DRYING;
    if (this.dog && !this.dog.isLoose()) this.dog.slipTheLead();
    this.strop = STROP_TIME * 1.4;
    this.stropFor = this.strop;
    if (from) {
      const here = this.group.position;
      if (
        distanceToShore(here.x, here.z) < EDGE + 1.2 &&
        !isInLake(here.x, here.z)
      ) {
        this.topple();
        return;
      }
      this.barge(from);
    }
    this.say(BARGED);
    this.showMood("shocked");
  }

  /** Over the edge, arms going, into two feet of cold green water. */
  private topple(): void {
    // Lead's gone the moment they tip — dog stays on the bank.
    this.dog?.releaseOnOwnerDunk();

    this.dunk = FALL_TIME + SWIM_TIME + CLIMB_TIME;
    this.scattering = 0;
    this.feeding = 0;
    this.strop = 0;
    // Cone goes in with them.
    if (this.kidCone || this.adultCone) this.spillCone();
    this.resetKidPose();

    const here = this.group.position;
    const shore = nearestShore(here.x, here.z);
    const out = outwardAt(shore);
    this.wentIn.set(shore.x - out.x * 1.6, BED_Y, shore.y - out.y * 1.6);
    this.cameOut.set(shore.x + out.x * 1.4, 0, shore.y + out.y * 1.4);
    this.splashed = false;
    this.climbSplashEarly = false;
    this.climbSplashLate = false;
    // Soaked the moment they go in — clothes darken while they thrash.
    this.wet = DRYING;
    this.say(DUNKED);
    this.showMood("shocked");
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

    if (age < FALL_TIME) {
      // Pitching forward off the edge, arms windmilling.
      this.showMood("shocked");
      const t = age / FALL_TIME;
      this.group.position.lerp(this.wentIn, Math.min(1, 6 * delta));
      this.group.rotation.x = t * 0.9;
      leftArm!.rotation.x = -2.4 * t;
      rightArm!.rotation.x = -2.1 * t;
      leftArm!.rotation.z = 0.7 * t;
      rightArm!.rotation.z = -0.7 * t;
      left!.rotation.x = 0.5 * t;
      right!.rotation.x = -0.3 * t;
      this.torso.rotation.set(0, 0, 0);
      this.head.rotation.set(0.2 * t, 0, 0);
      return;
    }

    if (age < FALL_TIME + SWIM_TIME) {
      if (!this.splashed) {
        this.splashed = true;
        this.splashAt = this.wentIn.clone().setY(WATER_Y);
      }
      // Chest-deep and floundering — furious about it already.
      this.showMood("angry");
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
      this.torso.rotation.z = thrash * 0.08;
      this.head.rotation.set(0.15, thrash * 0.2, 0);
      if (Math.random() < delta * 4) this.shedDrip(0.6);
      return;
    }

    this.climbOut(delta, (age - FALL_TIME - SWIM_TIME) / CLIMB_TIME);

    if (this.dunk <= 0) {
      // Out, dripping, and with plenty to say about it.
      this.group.position.copy(this.cameOut);
      this.group.rotation.set(0, this.group.rotation.y, 0);
      this.torso.rotation.set(0, 0, 0);
      this.head.rotation.set(0, 0, 0);
      leftArm!.rotation.set(0, 0, 0.08);
      rightArm!.rotation.set(0, 0, -0.08);
      left!.rotation.x = 0;
      right!.rotation.x = 0;
      this.rejoinPath();
      this.wet = DRYING;
      this.strop = 0;
      this.say(CLIMBED_OUT);
      this.sprayTalkCool = 2.6;
      // Still steaming from the dunk — come for whoever shoved them in if close.
      this.enrage(undefined, 1.3);
      this.showMood("angry");
      for (let i = 0; i < 8; i++) this.shedDrip(1.4);
    }
  }

  /**
   * Scramble up the bank: reach, heave, crawl on, then stand up soaking and
   * steaming. Position is driven by climb progress so it doesn't stall mid-wall.
   */
  private climbOut(delta: number, t: number): void {
    const [leftArm, rightArm] = this.arms;
    const [left, right] = this.legs;
    this.showMood("angry");
    this.faceToward(this.cameOut.x, this.cameOut.z);

    const u = THREE.MathUtils.clamp(t, 0, 1);
    const along = u * u * (3 - 2 * u);
    this.group.position.x = THREE.MathUtils.lerp(
      this.wentIn.x,
      this.cameOut.x,
      along,
    );
    this.group.position.z = THREE.MathUtils.lerp(
      this.wentIn.z,
      this.cameOut.z,
      along,
    );

    if (!this.climbSplashEarly && u > 0.18) {
      this.climbSplashEarly = true;
      this.splashAt = this.group.position.clone().setY(WATER_Y);
      for (let i = 0; i < 5; i++) this.shedDrip(1.1);
    }
    if (!this.climbSplashLate && u > 0.58) {
      this.climbSplashLate = true;
      this.splashAt = this.group.position.clone().setY(WATER_Y * 0.4);
      for (let i = 0; i < 6; i++) this.shedDrip(1.2);
    }

    this.dripCool -= delta;
    if (this.dripCool <= 0) {
      this.shedDrip(0.9);
      this.dripCool = 0.07 + Math.random() * 0.06;
    }

    if (u < 0.28) {
      // Reach for the coping — still chest-deep, arms hauled up the wall.
      const p = u / 0.28;
      this.group.position.y = THREE.MathUtils.lerp(BED_Y, BED_Y + 0.22, p);
      this.group.rotation.x = 0.55 + p * 0.35;
      this.group.rotation.z = Math.sin(p * Math.PI) * 0.06;
      leftArm!.rotation.x = -2.5 + p * 0.3;
      rightArm!.rotation.x = -2.35 + p * 0.2;
      leftArm!.rotation.z = 0.35;
      rightArm!.rotation.z = -0.45;
      left!.rotation.x = 0.9;
      right!.rotation.x = 0.4 + Math.sin(p * Math.PI) * 0.5;
      this.torso.rotation.x = 0.25;
      this.head.rotation.x = -0.35 - p * 0.25;
      return;
    }

    if (u < 0.55) {
      // Heave — belly over the kerb, one knee clawing up.
      const p = (u - 0.28) / 0.27;
      const heave = Math.sin(p * Math.PI);
      this.group.position.y = THREE.MathUtils.lerp(BED_Y + 0.22, 0.28, p);
      this.group.rotation.x = 0.9 - p * 0.25;
      this.group.rotation.z = Math.sin(p * 7) * 0.08;
      leftArm!.rotation.x = -1.8 + heave * 0.5;
      rightArm!.rotation.x = -2.1 - heave * 0.35;
      leftArm!.rotation.z = 0.55;
      rightArm!.rotation.z = -0.25;
      left!.rotation.x = 1.35 - p * 0.4;
      right!.rotation.x = -0.2 + heave * 0.9;
      this.torso.rotation.x = 0.45;
      this.head.rotation.x = -0.55;
      this.head.rotation.y = Math.sin(p * 5) * 0.15;
      return;
    }

    if (u < 0.78) {
      // On all fours on the paving, dripping, crawling clear of the edge.
      const p = (u - 0.55) / 0.23;
      const crawl = Math.sin(p * Math.PI * 3);
      this.group.position.y = THREE.MathUtils.lerp(0.28, 0.18, p);
      this.group.rotation.x = 0.65 - p * 0.2;
      this.group.rotation.z = crawl * 0.1;
      leftArm!.rotation.x = -1.1 + crawl * 0.55;
      rightArm!.rotation.x = -1.1 - crawl * 0.55;
      leftArm!.rotation.z = 0.4;
      rightArm!.rotation.z = -0.4;
      left!.rotation.x = 1.1 - crawl * 0.45;
      right!.rotation.x = 1.1 + crawl * 0.45;
      this.torso.rotation.x = 0.55;
      this.head.rotation.x = -0.4;
      this.head.rotation.y = 0;
      return;
    }

    // Push up to standing — shake the water off, still raging.
    const p = (u - 0.78) / 0.22;
    const shake = Math.sin(p * Math.PI * 8) * (1 - p);
    this.group.position.y = THREE.MathUtils.lerp(0.18, 0, p);
    this.group.rotation.x = 0.45 * (1 - p) + shake * 0.08;
    this.group.rotation.z = shake * 0.18;
    leftArm!.rotation.x = -0.4 - p * 0.3 + shake * 0.5;
    rightArm!.rotation.x = -0.4 - p * 0.3 - shake * 0.5;
    leftArm!.rotation.z = 0.55 * (1 - p) + 0.08;
    rightArm!.rotation.z = -0.55 * (1 - p) - 0.08;
    left!.rotation.x = (1 - p) * 0.6;
    right!.rotation.x = (1 - p) * 0.35;
    this.torso.rotation.x = 0.35 * (1 - p);
    this.head.rotation.x = -0.15 * (1 - p) + shake * 0.12;
    this.head.rotation.y = shake * 0.2;
  }

  /** A bead of lake water running off coat / hair. */
  private shedDrip(force = 1): void {
    if (this.drips.length > 36) return;
    const here = this.group.position;
    const yaw = this.group.rotation.y;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.025 + Math.random() * 0.02, 5, 4),
      new THREE.MeshBasicMaterial({
        color: 0x8ec8e0,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      }),
    );
    const side = (Math.random() - 0.5) * 0.35;
    const forward = (Math.random() - 0.5) * 0.2;
    mesh.position.set(
      here.x + Math.sin(yaw) * forward + Math.cos(yaw) * side,
      here.y + 0.55 + Math.random() * 0.75,
      here.z + Math.cos(yaw) * forward - Math.sin(yaw) * side,
    );
    this.scene.add(mesh);
    this.drips.push({
      mesh,
      life: 0.35 + Math.random() * 0.45,
      vx: (Math.random() - 0.5) * 0.8 * force,
      vy: -0.4 - Math.random() * 1.2 * force,
      vz: (Math.random() - 0.5) * 0.8 * force,
    });
  }

  private updateDrips(delta: number): void {
    if (this.dripCool > 0) this.dripCool = Math.max(0, this.dripCool - delta);
    for (let i = this.drips.length - 1; i >= 0; i--) {
      const drop = this.drips[i]!;
      drop.life -= delta;
      drop.vy -= 16 * delta;
      drop.mesh.position.x += drop.vx * delta;
      drop.mesh.position.y += drop.vy * delta;
      drop.mesh.position.z += drop.vz * delta;
      const mat = drop.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, drop.life * 2.2);
      if (drop.life > 0 && drop.mesh.position.y > 0.04) continue;
      this.scene.remove(drop.mesh);
      drop.mesh.geometry.dispose();
      mat.dispose();
      this.drips.splice(i, 1);
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
      STROLL_OUTER,
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
    // Fresh out of the lake: near-black coats; fade as they drip dry.
    const soak =
      this.wet > 0 ? THREE.MathUtils.clamp(this.wet / 10, 0, 1) * 0.72 : 0;
    if (this.wet > 0) this.wet -= delta;
    const muck = THREE.MathUtils.clamp(this.fouled / 12, 0, 1) * 0.45;
    const stain = new THREE.Color(0x5a4a32);
    for (const { material, dry } of this.cloth) {
      material.color.copy(dry).multiplyScalar(1 - soak);
      if (muck > 0) material.color.lerp(stain, muck);
    }
    // Keep shedding while they're properly wet.
    if (this.dunk <= 0 && this.wet > 14 && this.dripCool <= 0) {
      this.shedDrip(0.55);
      this.dripCool = 0.18 + Math.random() * 0.22;
    }
  }

  private place(delta?: number): void {
    const here = loopPoint(this.index);
    const ahead = loopPoint(this.index + this.direction);
    const forward = new THREE.Vector2().subVectors(ahead, here).normalize();
    // Left of the walk direction — probe which way is the water.
    const left = new THREE.Vector2(-forward.y, forward.x);
    const dLeft = distanceToShore(here.x + left.x * 3, here.y + left.y * 3);
    const dRight = distanceToShore(here.x - left.x * 3, here.y - left.y * 3);
    const lakeward = dLeft < dRight ? left : left.clone().negate();

    // Keep a dry band from the waterline (kids used to sit almost on it),
    // and stay clear of the outer bench lip.
    const bank = THREE.MathUtils.clamp(
      Math.max(this.fromShore, this.kid ? 0.9 : 1.2),
      0.35,
      STROLL_OUTER,
    );
    const loopDist = Math.max(0.2, distanceToShore(here.x, here.y));
    const shift = loopDist - bank;
    let targetX = here.x + lakeward.x * shift;
    let targetZ = here.y + lakeward.y * shift;
    if (isInLake(targetX, targetZ)) {
      const shore = nearestShore(here.x, here.y);
      const out = outwardAt(shore);
      targetX = shore.x + out.x * bank;
      targetZ = shore.y + out.y * bank;
    }

    // Prefer a clear band off benches / bins / trunks / buildings.
    const inland = lakeward.clone().negate();
    const clear = clearWalkSpot(targetX, targetZ, {
      radius: 0.45,
      inland: { x: inland.x, z: inland.y },
      along: { x: forward.x, z: forward.y },
      reach: 5.5,
    });
    targetX = clear.x;
    targetZ = clear.z;

    const pos = this.group.position;
    if (delta === undefined || delta <= 0) {
      pos.set(targetX, 0, targetZ);
    } else {
      const gap = Math.hypot(targetX - pos.x, targetZ - pos.z);
      if (gap > 8) {
        // Teleport if they've been dunked / scared far off the circuit.
        pos.set(targetX, 0, targetZ);
      } else if (gap > 0.02) {
        const step = Math.min(gap, this.speed * delta * 1.45);
        const self = { x: pos.x, z: pos.z };
        const landed = stepWalk(
          pos.x,
          pos.z,
          ((targetX - pos.x) / gap) * step,
          ((targetZ - pos.z) / gap) * step,
          0.4,
          self,
        );
        pos.x = landed.x;
        pos.z = landed.z;
        pos.y = 0;
      }
    }
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
    raining = false,
  ): number {
    this.grumble =
      this.grumble?.update(delta, this.group.position) === false
        ? null
        : this.grumble;
    this.dry(delta);
    this.flecks.update(delta);
    this.updateDrips(delta);
    if (this.hoseCool > 0) this.hoseCool = Math.max(0, this.hoseCool - delta);
    if (this.sprayTalkCool > 0)
      this.sprayTalkCool = Math.max(0, this.sprayTalkCool - delta);
    this.face.update(delta);
    this.kidFace?.update(delta);
    this.tickKidDown(delta);
    if (this.gawpCool > 0) this.gawpCool -= delta;
    this.tickUmbrella(delta, raining);
    this.tickMad(delta, player);

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

    if (this.getUpLeft > 0) {
      this.getUpLeft -= delta;
      const t = Math.max(0, this.getUpLeft / 1.1);
      this.group.rotation.z = this.getUpTip * (Math.PI / 2) * t;
      this.group.position.y = 0.12 * t;
      this.showMood("angry");
      if (this.getUpLeft <= 0) {
        this.group.rotation.z = 0;
        this.group.position.y = 0;
        if (this.pendingLunge) {
          this.beginLunge(this.pendingLunge);
          this.pendingLunge = null;
        }
      }
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
      if (this.heliWave && this.kid && this.kidDown <= 0) {
        this.poseKidWave(delta);
      }
      if (this.gawpLeft <= 0) {
        this.heliWave = false;
        this.head.rotation.x = 0;
        this.showMood(this.madLeft > 0 ? "angry" : "idle");
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

    if (this.errand === "icecream") {
      if (this.iceBuyLeft > 0) {
        this.iceBuyLeft -= delta;
        if (this.cafeFor) this.faceToward(this.cafeFor.x, this.cafeFor.y);
        this.standAndWatch();
        this.showMood("pleased");
        if (this.iceBuyLeft <= 0) this.finishIceCream();
        return -1;
      }
      if (!this.cafeFor || this.walkToward(this.cafeFor, delta) < 0.55) {
        this.iceBuyLeft = 2.2 + Math.random() * 2.4;
        this.say(ICE_BUY);
      }
      return -1;
    }

    if (this.restock > 0) {
      this.restock -= delta;
      if (this.restock <= 0) {
        // Fresh bags mostly appear once they're back on the NW corner.
        if (Math.random() < this.foodOdds() * 1.6) {
          this.giveBag();
          this.scatterWait = 15 + Math.random() * 35;
        } else {
          this.restock = 25 + Math.random() * 40;
        }
      }
    }

    if (this.litterbug) {
      this.litterWait -= delta;
      if (this.litterWait <= 0) this.dropLitter();
    }

    if (this.kid && this.handfuls > 0) {
      this.scatterWait -= delta;
      if (this.scatterWait <= 0) {
        if (feederRush) {
          // One sprinkle at a time — don't tip the whole bag in ten seconds.
          this.tossRushHandful();
          this.scatterWait = 9 + Math.random() * 14;
        } else {
          this.startScatter();
        }
      }
    }

    // Kids with a cone are accident-prone even without the hose.
    if (this.kidCone && Math.random() < delta * 0.012) {
      this.spillCone();
    }

    // Now and then peel off for a 99 — more often with a kid in tow.
    this.iceCreamWait -= delta;
    if (this.iceCreamWait <= 0) {
      this.iceCreamWait = 55 + Math.random() * 90;
      if (!this.adultCone && !this.kidCone) {
        const fancy = this.kid ? 0.58 : 0.2;
        if (Math.random() < fancy) this.startIceCream();
      }
    }

    // Loop points are evenly spaced, so a fixed step length converts neatly.
    const spacing = PATH_LOOP[0]!.distanceTo(PATH_LOOP[1]!) || 1;
    this.index += (this.direction * this.speed * delta) / spacing;
    this.place(delta);

    this.visitLeft -= delta;
    // Bag still full on the feeder stretch — linger until it's empty or sprayed.
    if (feederRush && this.handfuls > 0) {
      this.visitLeft = Math.max(this.visitLeft, 45);
    }
    if (this.visitLeft <= 0) this.headHome();

    this.stepPhase += delta * this.speed * 4.5;
    const swing = Math.sin(this.stepPhase) * 0.55;
    this.stride(this.stepPhase, 1);
    this.trackItOut(swing);
    this.showMood(this.madLeft > 0 ? "angry" : "idle");

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
    this.stropFor = STROP_TIME;
    this.strop = this.stropFor;
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
   * Stain whatever part of them hit the pile. Flat pads foul the shoes;
   * a raised lump paints higher — and a deep wade can put it on their face,
   * which they'll try to wipe off during the strop.
   */
  public soilFromMess(height: number): void {
    const here = this.group.position;
    // Shoes / ankles always take a hit.
    this.soilAt(here.x - 0.1, 0.05, here.z, 3);
    this.soilAt(here.x + 0.1, 0.05, here.z, 3);
    this.soilAt(here.x, 0.08, here.z + 0.05, 2);

    if (height > 0.1) {
      // Shins / lower trousers.
      this.soilAt(here.x - 0.08, 0.28, here.z, 3);
      this.soilAt(here.x + 0.08, 0.32, here.z, 2);
    }
    if (height > 0.28) {
      // Thighs / coat hem.
      this.soilAt(here.x, 0.55 + Math.min(0.35, height * 0.4), here.z, 4);
      this.fouled = Math.max(this.fouled, 6 + height * 8);
    }
    if (height > 0.55) {
      // Hands if they flail / coat sleeves brush the heap.
      this.soilAt(here.x - 0.22, 0.7, here.z, 2);
      this.soilAt(here.x + 0.22, 0.75, here.z, 2);
    }

    // Face: tall heaps, or anything a kid walks into at chest height.
    const faceHit =
      height > 0.85 || (this.kid !== null && height > 0.42 && Math.random() < 0.55);
    if (faceHit || (height > 0.65 && Math.random() < 0.35)) {
      this.head.updateWorldMatrix(true, true);
      this.head.getWorldPosition(this.soilTmp);
      this.flecks.splat(this.soilTmp, 5 + Math.floor(Math.random() * 3));
      this.face.soil(0.45 + Math.random() * 0.4);
      this.faceFilth = Math.max(this.faceFilth, 0.7 + Math.random() * 0.35);
      this.stropFor = STROP_TIME + FACE_WIPE_EXTRA;
      this.strop = this.stropFor;
      this.grumble?.dispose();
      this.grumble = new Grumble(
        this.scene,
        FACE_MUCK[Math.floor(Math.random() * FACE_MUCK.length)]!,
        this.group.position,
      );
    }

    // Kid is shorter — same pile reaches them higher.
    if (this.kid && this.kidFace && height > 0.18) {
      this.kid.updateWorldMatrix(true, true);
      this.kid.getWorldPosition(this.soilTmp);
      this.soilTmp.y += 0.35;
      this.flecks.splat(this.soilTmp, 3);
      if (height > 0.35) {
        this.soilTmp.y += 0.35;
        this.flecks.splat(this.soilTmp, 4);
        this.kidFace.soil(0.5 + Math.random() * 0.4);
        this.faceFilth = Math.max(this.faceFilth, 0.85);
        this.stropFor = STROP_TIME + FACE_WIPE_EXTRA;
        this.strop = this.stropFor;
      }
    }
  }

  private soilAt(x: number, y: number, z: number, count: number): void {
    this.soilTmp.set(x, y, z);
    this.flecks.splat(this.soilTmp, count);
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

  /** One handful into the water during the rush — bag stays until emptied. */
  private tossRushHandful(): void {
    if (this.handfuls <= 0) return;
    this.handfuls -= 1;
    this.scattering = SCATTER_PAUSE * 0.55;
    this.scatterAt = this.tossIntoPond();
    this.grumble?.dispose();
    this.grumble = new Grumble(
      this.scene,
      SCATTER_LINES[Math.floor(Math.random() * SCATTER_LINES.length)]!,
      this.group.position,
    );
    if (this.handfuls <= 0) this.emptyHanded();
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
    // Chin up at the chopper.
    this.head.rotation.x = this.heliWave ? -0.45 : 0;
    this.poseUmbrella();
  }

  /** One arm high, waggling at the Island-bound chopper. */
  private poseKidWave(delta: number): void {
    if (!this.kid || this.kidArms.length < 2) return;
    this.heliWavePhase += delta * 10;
    const wag = Math.sin(this.heliWavePhase);
    this.kid.rotation.set(0, 0, 0);
    this.kid.position.y = 0;
    this.kidLegs[0]!.rotation.x = 0.05;
    this.kidLegs[1]!.rotation.x = -0.05;
    // Left arm still; right arm overhead waving.
    this.kidArms[0]!.rotation.set(-0.2, 0, 0.15);
    this.kidArms[1]!.rotation.set(-2.4 + wag * 0.35, 0, -0.35);
    this.kidFace?.setMood("pleased");
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

    if (!this.kid || this.kidDown > 0) return;
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
    const spent = this.lungeFor - this.lungeLeft;
    const bagging = this.handbag !== null;

    if (gap > 1.45) {
      this.swingAnim = 0;
      this.swingHit = false;
      const step = Math.min(gap, 5.2 * delta);
      const dx = (to.x / gap) * step;
      const dz = (to.z / gap) * step;
      // Sidestep walls/benches — don't abort the dig on the first bump.
      const landed = stepWalk(here.x, here.z, dx, dz, 0.35, {
        x: here.x,
        z: here.z,
      });
      const moved = Math.hypot(landed.x - here.x, landed.z - here.z);
      if (moved < 0.01) {
        this.lungeStuck += delta;
        if (this.lungeStuck > 0.7) {
          this.lungeLeft = 0;
          // Still mad — they'll come again once they're clear, unless duty calls.
          this.swingCool = Math.max(this.swingCool, 0.6);
          return;
        }
      } else {
        this.lungeStuck = 0;
        if (
          !isInLake(landed.x, landed.z) &&
          distanceToShore(landed.x, landed.z) >= 0.45
        ) {
          here.set(landed.x, 0, landed.z);
        }
      }
      const phase = spent * 10;
      left!.rotation.x = Math.sin(phase) * 0.7;
      right!.rotation.x = -Math.sin(phase) * 0.7;
      if (bagging) {
        // Handbag cocked back over the shoulder while she closes in.
        leftArm!.rotation.x = -2.1;
        leftArm!.rotation.z = 0.85;
        rightArm!.rotation.x = -0.6;
        rightArm!.rotation.z = -0.25;
        this.handbag!.rotation.set(-0.4, 0.2, 0.5);
      } else {
        leftArm!.rotation.x = -1.15;
        rightArm!.rotation.x = -1.45;
        leftArm!.rotation.z = 0.4;
        rightArm!.rotation.z = -0.55;
      }
      this.torso.rotation.z = bagging ? 0.12 : 0.08;
      this.group.position.y = Math.abs(Math.sin(phase)) * 0.06;
      return;
    }

    this.lungeStuck = 0;
    // In range — throw the punch / handbag swipe.
    if (this.swingAnim <= 0) {
      this.swingAnim = bagging ? 0.7 : 0.55;
      this.swingHit = false;
    }
    this.swingAnim = Math.max(0, this.swingAnim - delta);
    const dur = bagging ? 0.7 : 0.55;
    const t = 1 - this.swingAnim / dur;

    if (bagging) this.poseHandbagSwing(t, leftArm!, rightArm!, left!, right!);
    else this.posePunch(t, leftArm!, rightArm!, left!, right!);

    if (!this.swingHit && t >= 0.42) {
      this.swingHit = true;
      this.swingReady = true;
      if (bagging) this.say(HANDBAG_LINES);
    }
    if (this.lungeLeft <= 0 && this.madLeft <= 0) {
      this.strop = STROP_TIME;
      this.stropFor = this.strop;
    }
  }

  /** Wind → jab → follow-through. */
  private posePunch(
    t: number,
    leftArm: THREE.Object3D,
    rightArm: THREE.Object3D,
    left: THREE.Object3D,
    right: THREE.Object3D,
  ): void {
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
    // Right fist loads back, then drives through.
    rightArm.rotation.x = -0.5 - wind * 1.6 + snap * 2.6;
    rightArm.rotation.z = -0.15 - wind * 0.85 + snap * 0.5;
    leftArm.rotation.x = -0.95 - wind * 0.2;
    leftArm.rotation.z = 0.45;
    left.rotation.x = 0.25;
    right.rotation.x = -0.4;
    this.torso.rotation.y = -wind * 0.35 + snap * 0.55;
    this.torso.rotation.z = wind * 0.12 - snap * 0.08;
    this.group.rotation.x = -0.06 - snap * 0.1;
    this.group.position.y = snap * 0.08;
  }

  /** Over-the-shoulder handbag swipe — auntie special. */
  private poseHandbagSwing(
    t: number,
    leftArm: THREE.Object3D,
    rightArm: THREE.Object3D,
    left: THREE.Object3D,
    right: THREE.Object3D,
  ): void {
    let lift: number;
    let smash: number;
    if (t < 0.32) {
      lift = t / 0.32;
      smash = 0;
    } else if (t < 0.5) {
      lift = 1;
      smash = (t - 0.32) / 0.18;
    } else {
      lift = 1 - (t - 0.5) / 0.5;
      smash = 1 - (t - 0.5) / 0.5 * 0.7;
    }
    // Bag goes up and back, then sweeps down across the face.
    leftArm.rotation.x = -2.35 * lift + smash * 3.1;
    leftArm.rotation.z = 0.95 * lift - smash * 1.4;
    leftArm.rotation.y = smash * 0.55;
    rightArm.rotation.x = -0.5;
    rightArm.rotation.z = -0.3;
    left.rotation.x = 0.15;
    right.rotation.x = -0.35;
    this.torso.rotation.y = -lift * 0.4 + smash * 0.7;
    this.torso.rotation.z = lift * 0.2 - smash * 0.15;
    this.group.rotation.x = -0.05 - smash * 0.12;
    this.group.position.y = Math.abs(Math.sin(smash * Math.PI)) * 0.1;
    if (this.handbag) {
      this.handbag.rotation.set(
        -0.5 + smash * 1.2,
        0.15 + smash * 0.4,
        0.35 + lift * 0.6 - smash * 0.8,
      );
    }
  }

  /** Hops back, then scrapes the shoe — and wipes their face if it's on them. */
  private throwStrop(): void {
    const age = this.stropFor - this.strop;
    const [left, right] = this.legs;
    const [leftArm, rightArm] = this.arms;
    const faceJob = this.faceFilth > 0.05 || this.face.isFilthy();
    this.showMood(this.madLeft > 0 ? "angry" : "disgusted");

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

    // Face wipe phase after they've scraped a bit — rubbing at the cheeks.
    const wipeFrom = faceJob ? 1.85 : this.stropFor + 1;
    if (age >= wipeFrom) {
      const wipe = Math.sin(age * 14);
      leftArm!.rotation.x = -1.85 + wipe * 0.4;
      rightArm!.rotation.x = -1.7 - wipe * 0.35;
      leftArm!.rotation.z = 0.85 + wipe * 0.15;
      rightArm!.rotation.z = -0.9 - wipe * 0.12;
      left!.rotation.x = 0.1;
      right!.rotation.x = -0.15;
      this.head.rotation.x = -0.12 + wipe * 0.1;
      this.head.rotation.y = wipe * 0.28;
      this.torso.rotation.y = wipe * 0.08;
      this.group.rotation.x = 0.06;
      this.group.position.y = 0.02;

      // Rubbing clears flecks and face smears over the wipe.
      this.head.getWorldPosition(this.soilTmp);
      if (Math.random() < 0.55) this.flecks.rinseNear(this.soilTmp, 0.4);
      this.face.wipe(0.045 + Math.random() * 0.04);
      this.kidFace?.wipe(0.05);
      this.faceFilth = Math.max(0, this.faceFilth - 0.055);
      if (this.faceFilth < 0.08 && !this.face.isFilthy()) {
        this.head.rotation.x = 0;
        this.head.rotation.y = 0;
      }
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
    this.head.rotation.x = 0;
    this.head.rotation.y = 0;

    // Scrape knocks some of it off the shoes onto the path.
    if (Math.random() < 0.25) {
      const here = this.group.position;
      this.flecks.rinseNear(
        this.soilTmp.set(here.x, 0.1, here.z),
        0.45,
      );
    }
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

    const landed = stepWalk(
      here.x,
      here.z,
      nx - here.x,
      nz - here.z,
      0.4,
      { x: here.x, z: here.z },
    );
    here.x = landed.x;
    here.z = landed.z;
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
