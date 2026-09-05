import * as THREE from "three";
import { Player, type Tool } from "./Player";
import { Swan } from "./entities/Swan";
import { Person } from "./entities/Person";
import { Dropping, MAX_PILES, MERGE_RADIUS, type DropKind } from "./entities/Dropping";
import { Litter } from "./entities/Litter";
import { Bread } from "./entities/Bread";
import { Cyclist } from "./entities/Cyclist";
import { Bin } from "./entities/Bin";
import { Duck } from "./entities/Duck";
import { Gull, type Scrap } from "./entities/Gull";
import { Squirrel } from "./entities/Squirrel";
import { Footprint } from "./entities/Footprint";
import { Plane } from "./entities/Plane";
import { Graffiti } from "./entities/Graffiti";
import { BranchKid } from "./entities/BranchKid";
import { Scooter } from "./entities/Scooter";
import { RcBoat } from "./entities/RcBoat";
import { Crabber } from "./entities/Crabber";
import { BbqParty, BBQ_SPOTS } from "./entities/BbqParty";
import { PlayVisit, canVisitPlayPark } from "./entities/PlayVisit";
import { Fox } from "./entities/Fox";
import { Puddles } from "./effects/Puddles";
import {
  PATH_LOOP,
  PATH_OUTER,
  WATER_Y,
  buildGround,
  buildLake,
  buildPaths,
  isInLake,
  loopPoint,
  nearestShore,
  offsetShore,
  waterSpot,
  type LakeSurface,
} from "./world/lake";
import { buildBench } from "./world/bench";
import { plantTrees, treeSpots, updateTrees } from "./world/trees";
import { buildSurrounds, lightWindows } from "./world/buildings";
import { buildFencing, parkGates } from "./world/fence";
import {
  buildParkBuildings,
  bobPedalos,
  binStations,
  taggableWalls,
  atParkBuilding,
} from "./world/park";
import { DayCycle } from "./systems/DayCycle";
import { Weather } from "./systems/Weather";
import { Sun } from "./systems/Sun";
import { MiniMap } from "./ui/MiniMap";
import { Mugshot } from "./ui/Mugshot";
import { Messages } from "./ui/Messages";
import { ObjectiveArrow } from "./ui/ObjectiveArrow";
import { Callouts } from "./systems/Callouts";

const WASH_RADIUS = 0.85;
/** Overnight dumps — pick two or three spots and stack hard on each. */
const OVERNIGHT_LUMPS_MIN = 2;
const OVERNIGHT_LUMPS_MAX = 3;
/** How near the spike has to come down to get a bit of rubbish. */
const SPEAR_RADIUS = 1.3;

/** How far ahead a job counts as the one they're lining up for. */
const PICKER_SIGHT = 4.5;
const HOSE_SIGHT = 11;
/** Seconds you have to land the next one before the combo lapses. */
const COMBO_WINDOW = 4;
const COMBO_CAP = 5;

/** How far off a swan will spot someone with food, and a pile of bread. */
const BEG_DISTANCE = 24;
const BREAD_DISTANCE = 55;
/** Chance per second that two birds at a pile start a scrap. */
const SCRAP_RATE = 0.22;

/** Two at once is plenty — they're meant to be an occasional nuisance. */
/**
 * Nothing turns up or clears off within this far of the player while they can
 * see the spot. Past it there's haze and trees in the way.
 */
const OFF_STAGE = 160;
/** How long to hang on before trying again when the player's in the way. */
const WAIT_AND_SEE = 3;

const MAX_CYCLISTS = 2;
const MAX_SCOOTERS = 2;
const MAX_BOATS = 2;
const MAX_CRABBERS = 6;
const MAX_BBQS = 2;
const MAX_PLAY_VISITS = 3;
/**
 * Peak path traffic on a sunny afternoon. The actual number at any hour is
 * read off the day — early mornings and nights are nearly empty.
 */
const PEOPLE_PEAK = 16;

/** Room on the water for a few more birds than the resident flock, and a
 * floor so the lake never empties out. */
const FLOCK_LIMIT = 22;
const FLOCK_FLOOR = 12;

/** Families of cygnets on the water, each behind a mother worth avoiding. */
const BROODS = 2;

/** Mallards on the water, and gulls working the park from above. */
const DUCKS_TO_START = 9;
const DUCK_LIMIT = 18;
const GULL_LIMIT = 6;
/** Greys in the holm oaks. They live here, so the number doesn't change. */
const SQUIRRELS = 7;
/** How near someone has to be for their food to count as attended. */
const FOOD_GUARDED = 6;

/**
 * What a swan can do to you. Six or seven good pecks is the end of the shift,
 * but keep out of their way for a bit and you shake it off.
 */
const HEALTH_MAX = 100;
const PECK_DAMAGE = 15;
const HEAL_DELAY = 7;
const HEAL_RATE = 4;

/** The hours when the park belongs to the swans and the foxes. */
const NIGHT_FROM = 21.5;
const NIGHT_UNTIL = 5.5;

export class Game {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private player: Player;
  private swans: Swan[] = [];
  private people: Person[] = [];
  private nextPerson = 4 + Math.random() * 10;
  private nextEviction = 0;
  private droppings: Dropping[] = [];
  private footprints: Footprint[] = [];
  private litter: Litter[] = [];
  private puddles: Puddles;
  private bread: Bread[] = [];
  private cyclists: Cyclist[] = [];
  private nextCyclist = 45 + Math.random() * 40;
  private scooters: Scooter[] = [];
  private nextScooter = 50 + Math.random() * 50;
  private boats: RcBoat[] = [];
  private nextBoat = 70 + Math.random() * 50;
  private crabbers: Crabber[] = [];
  private nextCrabber = 55 + Math.random() * 50;
  private bbqs: BbqParty[] = [];
  private nextBbq = 90 + Math.random() * 80;
  private playVisits: PlayVisit[] = [];
  private nextPlayVisit = 35 + Math.random() * 40;
  private nextArrival = 40 + Math.random() * 60;
  private nextDeparture = 50 + Math.random() * 70;
  private fox: Fox | null = null;
  private nextFox = 40 + Math.random() * 90;
  private ducks: Duck[] = [];
  private nextDuck = 35 + Math.random() * 50;
  private gulls: Gull[] = [];
  private nextGull = 50 + Math.random() * 70;
  private squirrels: Squirrel[] = [];
  private planes: Plane[] = [];
  private nextPlane = 40 + Math.random() * 80;
  private nextSpitfire = 280 + Math.random() * 500;
  private bins: Bin[] = [];
  private graffiti: Graffiti[] = [];
  private nextTag = 120 + Math.random() * 180;
  private branchKids: BranchKid[] = [];
  private nextBranchKid = 100 + Math.random() * 160;

  /** The player's view, worked out afresh each frame. */
  private view = new THREE.Frustum();
  private viewMatrix = new THREE.Matrix4();

  private clock: THREE.Clock;
  /** Seconds of play, for anything that just needs a steady wave in it. */
  private elapsed = 0;
  private cleanliness: number = 100;
  private score: number = 0;

  private dayCycle: DayCycle;
  private weather: Weather;
  private sun!: Sun;
  private lake!: LakeSurface;
  private miniMap: MiniMap;
  private mugshot: Mugshot;
  private objectiveArrow: ObjectiveArrow;
  private messages: Messages;
  private callouts: Callouts;

  private ambientLight!: THREE.AmbientLight;
  private sunLight!: THREE.DirectionalLight;

  private cleaned = 0;
  private comboRun = 0;
  private comboLeft = 0;
  private hurtLeft = 0;
  /** Bounce spray in the face — drips off over a few seconds. */
  private faceWetLeft = 0;
  private faceDirty = false;
  private complaints = 0;

  private health = HEALTH_MAX;
  private sincePecked = HEAL_DELAY;
  private dead = false;
  /** Mobile portrait — world must not tick or draw. */
  private frozen = false;
  /** How far through the collapse, once they've had the last one. */
  private collapse = 0;

  private cleanlinessElement: HTMLElement;
  private cleanlinessBar: HTMLElement;
  private scoreElement: HTMLElement;
  private cleanedElement: HTMLElement;
  private comboElement: HTMLElement;
  private comboValueElement: HTMLElement;
  private comboFill: HTMLElement;
  private hurtFlash: HTMLElement;
  private complaintsElement: HTMLElement;
  private healthFill: HTMLElement;
  private gameOverPanel: HTMLElement;
  private gameOverDetail: HTMLElement;
  private instructionsElement: HTMLElement;

  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fc4d8);
    this.scene.fog = new THREE.Fog(0x9fc4d8, 220, 520);

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    // North path, mid-paving, looking over the water — clear of the kerb after
    // the grounds grew to the real park size.
    this.camera.position.set(0, 1.7, 72);
    this.camera.lookAt(0, 1.7, 0);
    this.scene.add(this.camera);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const container = document.getElementById("game-container");
    if (container) {
      container.appendChild(this.renderer.domElement);
    }

    this.clock = new THREE.Clock();
    this.player = new Player(
      this.camera,
      this.renderer.domElement,
      this,
      this.scene,
    );

    this.cleanlinessElement = document.getElementById("cleanliness-value")!;
    this.cleanlinessBar = document.getElementById("cleanliness-fill")!;
    this.scoreElement = document.getElementById("score-value")!;
    this.cleanedElement = document.getElementById("cleaned-value")!;
    this.comboElement = document.getElementById("combo")!;
    this.comboValueElement = document.getElementById("combo-value")!;
    this.comboFill = document.getElementById("combo-fill")!;
    this.hurtFlash = document.getElementById("hurt-flash")!;
    this.complaintsElement = document.getElementById("complaints")!;
    this.healthFill = document.getElementById("health-fill")!;
    this.gameOverPanel = document.getElementById("game-over")!;
    this.gameOverDetail = document.getElementById("game-over-detail")!;
    this.instructionsElement = document.getElementById("instructions")!;
    this.showTool("hose");
    document
      .getElementById("restart")!
      .addEventListener("click", () => window.location.reload());

    this.dayCycle = new DayCycle(document.getElementById("clock")!);
    this.weather = new Weather(
      this.scene,
      this.camera,
      document.getElementById("weather")!,
    );
    this.miniMap = new MiniMap(
      document.getElementById("minimap") as HTMLCanvasElement,
    );
    this.mugshot = new Mugshot(
      document.getElementById("mugshot") as HTMLCanvasElement,
    );
    this.objectiveArrow = new ObjectiveArrow(
      document.getElementById("objective-arrow")!,
    );

    this.messages = new Messages(document.getElementById("messages")!);
    this.callouts = new Callouts(this.messages);

    this.setupScene();
    this.setupLights();
    this.puddles = new Puddles(this.scene);
    this.spawnSwans();
    this.spawnPeople();
    // Swans have been at it all night — paving is a state before you clock on.
    this.seedOvernightMess();
    // A raft of mallards is already out there when the shift starts.
    for (let i = 0; i < DUCKS_TO_START; i++) {
      this.ducks.push(new Duck(this.scene, false));
    }
    this.gulls.push(new Gull(this.scene, new THREE.Vector2(0, 0), true));
    for (let i = 0; i < SQUIRRELS; i++) {
      this.squirrels.push(new Squirrel(this.scene));
    }
    this.applyTimeAndWeather(0);

    for (const spot of binStations()) {
      this.bins.push(new Bin(this.scene, spot.x, spot.z));
    }
    this.callouts.raise("shift", this.dayCycle.clockFace());

    this.onWindowResize();
    window.addEventListener("resize", () => this.onWindowResize());
    window.visualViewport?.addEventListener("resize", () => this.onWindowResize());
  }

  private setupScene(): void {
    buildGround(this.scene, 560);
    this.lake = buildLake(this.scene);
    buildPaths(this.scene);
    plantTrees(this.scene);
    buildSurrounds(this.scene);
    buildFencing(this.scene);
    buildParkBuildings(this.scene);
    this.buildLandmarks();
  }

  private buildLandmarks(): void {
    const stone = new THREE.MeshStandardMaterial({ color: 0x7a7568 });

    // Lumps Fort wall runs along the eastern edge of the park.
    for (const [x, z, w, d] of [
      [168, 0, 3, 120],
      [140, 62, 60, 3],
      [140, -62, 60, 3],
    ] as const) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 3.5, d), stone);
      wall.position.set(x, 1.75, z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.scene.add(wall);
    }

    // Benches sit along the outer edge of the path, backs out, facing the water.
    const ring = offsetShore(PATH_OUTER - 1);
    for (let i = 0; i < ring.length; i += 12) {
      const spot = ring[i]!;
      const before = ring[(i - 1 + ring.length) % ring.length]!;
      const after = ring[(i + 1) % ring.length]!;

      // Square the bench to the path edge itself rather than to the lake centre,
      // so it sits flush however the shoreline is curving at that point.
      const along = new THREE.Vector2().subVectors(after, before).normalize();
      const facing = new THREE.Vector2(-along.y, along.x);
      if (facing.dot(spot) > 0) facing.negate();

      const bench = buildBench();
      bench.position.set(spot.x, 0, spot.y);
      bench.rotation.y = Math.atan2(facing.x, facing.y);
      this.scene.add(bench);
    }
  }

  private setupLights(): void {
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
    this.sunLight.position.set(60, 90, 40);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.camera.left = -220;
    this.sunLight.shadow.camera.right = 220;
    this.sunLight.shadow.camera.top = 220;
    this.sunLight.shadow.camera.bottom = -220;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.scene.add(this.sunLight);

    this.sun = new Sun(this.scene, this.sunLight);
  }

  private applyTimeAndWeather(delta: number): void {
    this.dayCycle.update(delta);
    const sky = this.dayCycle.skyState();
    this.weather.update(delta, sky);
    updateTrees(this.elapsed, this.weather.getWind());

    const gloom = this.weather.gloom;
    this.ambientLight.intensity = sky.ambient * (1 - gloom * 0.4);
    // Only a hint of the sky's colour, or dawn turns the grass brown.
    this.ambientLight.color.copy(sky.sky).lerp(new THREE.Color(0xffffff), 0.78);
    this.sunLight.intensity = sky.sun * (1 - gloom);
    this.sunLight.color.copy(sky.sunColor);
    this.sunLight.position.copy(sky.sunPosition);
    // Soft shadows look wrong under cloud; fade them out with the sun.
    this.sunLight.castShadow = this.sunLight.intensity > 0.2;
    this.sun.update(sky, gloom);
    this.lake.update(delta, sky.sunPosition, sky.sunColor);
    // Lights come on across the seafront as the daylight goes.
    lightWindows(THREE.MathUtils.clamp(1 - sky.sun / 0.45, 0, 1));
  }

  private refreshView(): void {
    this.camera.updateMatrixWorld();
    this.viewMatrix.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse,
    );
    this.view.setFromProjectionMatrix(this.viewMatrix);
  }

  /**
   * Whether the player would catch something turning up, or clearing off, at
   * this spot. Anything beyond a hundred metres or so is a speck among the
   * trees with the haze over it, so that doesn't count.
   */
  private inShot(x: number, z: number, y = 1.2): boolean {
    const at = new THREE.Vector3(x, y, z);
    if (at.distanceTo(this.camera.position) > OFF_STAGE) return false;
    return this.view.intersectsSphere(new THREE.Sphere(at, 1.5));
  }

  /**
   * Keeps picking spots until it finds one the player isn't looking at. Null
   * means they've got the whole park in view and whatever it is should wait.
   */
  private outOfShot(
    pick: () => THREE.Vector2,
    y = 1.2,
    tries = 12,
  ): THREE.Vector2 | null {
    for (let attempt = 0; attempt < tries; attempt++) {
      const spot = pick();
      if (!this.inShot(spot.x, spot.y, y)) return spot;
    }
    return null;
  }

  /**
   * A spot on the water whose bit of bank is out of sight, for the sorts who
   * turn up at the wall — the crabbing parties and the lad with the boat.
   */
  private outOfShotAtBank(): THREE.Vector2 | null {
    for (let attempt = 0; attempt < 12; attempt++) {
      const spot = waterSpot();
      const bank = nearestShore(spot.x, spot.y);
      if (!this.inShot(bank.x, bank.y)) return spot;
    }
    return null;
  }

  /**
   * Whether whoever's finished up can be taken off the board. They carry on
   * doing whatever they're doing until nobody's watching them.
   */
  private canSlipAway(at: THREE.Vector3): boolean {
    return !this.inShot(at.x, at.z, at.y + 1);
  }

  /** Somewhere on the perimeter path that's out of sight, for anyone
   * walking or riding in. */
  private outOfShotOnPath(): number | null {
    for (let attempt = 0; attempt < 14; attempt++) {
      const index = Math.random() * PATH_LOOP.length;
      const at = loopPoint(index);
      if (!this.inShot(at.x, at.y)) return index;
    }
    return null;
  }

  /** Birds come and go: the odd one drops in, the odd one clears off. */
  private updateFlock(delta: number): void {
    for (let i = this.swans.length - 1; i >= 0; i--) {
      if (!this.swans[i]!.hasLeft()) continue;
      this.swans[i]!.dispose();
      this.swans.splice(i, 1);
    }

    if (this.swans.length < FLOCK_LIMIT) {
      this.nextArrival -= delta;
      if (this.nextArrival <= 0) {
        this.nextArrival = 45 + Math.random() * 75;
        const swan = new Swan(new THREE.Vector3(0, 0, 0), this.scene);
        swan.flyIn();
        this.swans.push(swan);
      }
    }

    if (this.swans.length <= FLOCK_FLOOR) return;
    this.nextDeparture -= delta;
    if (this.nextDeparture > 0) return;

    this.nextDeparture = 50 + Math.random() * 90;
    // No mother abandons her brood, and no cygnet can fly yet.
    const leaving = this.swans.filter(
      (swan) => swan.isSettled() && swan.canLeave(),
    );
    leaving[Math.floor(Math.random() * leaving.length)]?.flyAway();
  }

  private spawnSwans(): void {
    for (let i = 0; i < 16; i++) {
      const spot = waterSpot();
      this.swans.push(
        new Swan(new THREE.Vector3(spot.x, 0, spot.y), this.scene),
      );
    }

    // A couple of this year's families, out on the water behind their mothers.
    for (let i = 0; i < BROODS; i++) {
      const mother = this.swans[i]!;
      const at = mother.getPosition();
      const chicks = 2 + Math.floor(Math.random() * 4);
      for (let c = 0; c < chicks; c++) {
        const cygnet = new Swan(
          new THREE.Vector3(
            at.x + (Math.random() - 0.5) * 3,
            0,
            at.z + (Math.random() - 0.5) * 3,
          ),
          this.scene,
          "cygnet",
        );
        mother.adopt(cygnet);
        this.swans.push(cygnet);
      }
    }
  }

  private spawnPeople(): void {
    // Only as many as the hour calls for — at six it's the early dog walkers.
    const already = this.crowdWanted().target;
    for (let i = 0; i < already; i++) {
      this.people.push(new Person(this.scene, Math.random() * 180));
    }
  }

  /**
   * How busy the path ought to be at this hour, and how long between arrivals
   * when it's under. Built around a Southsea lakeside day: thin at dawn, a
   * mid-morning build, lunch and the after-school peak, then emptying out
   * through the evening until there's nobody left for the foxes.
   */
  private crowdWanted(): { target: number; gap: number } {
    const hour = this.dayCycle.hour;
    const beats: ReadonlyArray<readonly [number, number]> = [
      [0, 0],
      [5, 0],
      [6, 3],
      [7.5, 6],
      [9, 8],
      [11, 10],
      [13, 14],
      [15, 12],
      [17, PEOPLE_PEAK],
      [19, 11],
      [20.5, 5],
      [21.5, 2],
      [22.5, 0],
      [24, 0],
    ];

    let before = beats[0]!;
    let after = beats[beats.length - 1]!;
    for (let i = 0; i < beats.length - 1; i++) {
      if (hour >= beats[i]![0] && hour <= beats[i + 1]![0]) {
        before = beats[i]!;
        after = beats[i + 1]!;
        break;
      }
    }
    const span = after[0] - before[0] || 1;
    const t = (hour - before[0]) / span;
    const target = Math.round(before[1] + (after[1] - before[1]) * t);

    // Quieter hours mean longer waits between the few who do turn up.
    const gap =
      target <= 0
        ? 999
        : target >= 12
          ? 6 + Math.random() * 10
          : target >= 6
            ? 12 + Math.random() * 18
            : 22 + Math.random() * 30;

    return { target, gap };
  }

  /**
   * Keep the path busy without anyone materialising on it. Fresh faces walk
   * in through a gate when numbers are down on the hour; when it's over-full
   * (closing time, a lull after lunch) a few peel off for the gates early.
   */
  private updatePeople(delta: number, mess: readonly THREE.Vector3[]): void {
    const { target, gap } = this.crowdWanted();

    // Too many for the hour: peel a few off for the gates, a couple at a time,
    // so closing time looks like people drifting home rather than a stampede.
    this.nextEviction -= delta;
    const strolling = this.people.filter((person) => person.isStrolling());
    if (this.nextEviction <= 0 && strolling.length > target) {
      const send = Math.min(2, strolling.length - target);
      for (let i = 0; i < send; i++) {
        const pick = Math.floor(Math.random() * strolling.length);
        strolling.splice(pick, 1)[0]?.headHome();
      }
      this.nextEviction = 5 + Math.random() * 8;
    }

    this.nextPerson -= delta;
    if (this.nextPerson <= 0 && this.people.length < target) {
      const from = this.outOfShot(() => {
        const gates = parkGates();
        return gates[Math.floor(Math.random() * gates.length)]!.clone();
      });
      if (from === null) {
        this.nextPerson = WAIT_AND_SEE;
      } else {
        this.people.push(
          new Person(this.scene, Math.random() * 180, true, from),
        );
        this.nextPerson = gap;
      }
    } else if (this.nextPerson <= 0) {
      // Up to strength for the hour — check again shortly.
      this.nextPerson = Math.min(gap, 8 + Math.random() * 8);
    }

    for (let i = this.people.length - 1; i >= 0; i--) {
      const person = this.people[i]!;
      for (const swan of this.swans) {
        if (!swan.isAshore() && !swan.isCharging()) continue;
        person.spook(swan.getPosition(), swan.isWingsOut());
      }
      const stepped = person.update(delta, mess, this.camera.position);
      if (stepped >= 0) this.logComplaint(this.droppings[stepped]!);

      const scattered = person.claimScatter();
      if (scattered) this.bread.push(new Bread(this.scene, scattered));

      const dropped = person.claimLitter();
      if (dropped && this.litter.length < 14) {
        this.litter.push(new Litter(this.scene, dropped));
      }

      const binned = person.claimDeposit();
      if (binned) {
        let nearest: Bin | null = null;
        let closest = Infinity;
        for (const bin of this.bins) {
          const gap = bin.getPosition().distanceToSquared(binned);
          if (gap < closest) {
            closest = gap;
            nearest = bin;
          }
        }
        nearest?.deposit();
      }

      const print = person.claimPrint();
      if (print) this.footprints.push(new Footprint(this.scene, print));

      const splash = person.claimSplash();
      if (splash) this.bigSplash(splash);

      const dog = person.getDog();
      if (dog) {
        dog.update(delta, { swans: this.swans, people: this.people });
        for (let n = dog.claimTrouble(); n > 0; n--) this.complain();
      }

      if (person.isGone()) {
        person.dispose();
        this.people.splice(i, 1);
      }
    }
  }

  public addDropping(position: THREE.Vector3, kind: DropKind = "swan"): void {
    // Stack onto an existing pile rather than peppering the same square.
    let nearest: Dropping | null = null;
    let best = MERGE_RADIUS * MERGE_RADIUS;
    for (const pile of this.droppings) {
      const at = pile.getPosition();
      const dx = at.x - position.x;
      const dz = at.z - position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < best) {
        best = d2;
        nearest = pile;
      }
    }
    if (nearest) {
      nearest.addLayer(kind);
      return;
    }

    if (this.droppings.length >= MAX_PILES) return;
    this.droppings.push(new Dropping(position, this.scene, kind));
  }

  /**
   * First-thing mess: swans have been busy overnight and left two or three
   * proper dumps on the paving — a clear opening power-wash job.
   */
  private seedOvernightMess(): void {
    const lumps =
      OVERNIGHT_LUMPS_MIN +
      Math.floor(
        Math.random() * (OVERNIGHT_LUMPS_MAX - OVERNIGHT_LUMPS_MIN + 1),
      );
    const start = Math.random() * PATH_LOOP.length;

    for (let i = 0; i < lumps; i++) {
      const along =
        start + (i / lumps) * PATH_LOOP.length + (Math.random() - 0.5) * 6;
      const base = loopPoint(along);
      const out = 2.5 + Math.random() * 4.5;
      const shore = nearestShore(base.x, base.y);
      const away = new THREE.Vector2(base.x - shore.x, base.y - shore.y);
      if (away.lengthSq() < 0.01) away.set(base.x, base.y);
      away.normalize();

      const x = shore.x + away.x * out;
      const z = shore.y + away.y * out;
      if (isInLake(x, z)) continue;

      const kind: DropKind = Math.random() < 0.1 ? "gull" : "swan";
      const centre = new THREE.Vector3(x, 0, z);
      // One fat pile: many deposits stacked on the same spot.
      const deposits = 9 + Math.floor(Math.random() * 5);
      for (let n = 0; n < deposits; n++) {
        this.addDropping(
          centre
            .clone()
            .add(
              new THREE.Vector3(
                (Math.random() - 0.5) * 0.45,
                0,
                (Math.random() - 0.5) * 0.45,
              ),
            ),
          kind,
        );
      }
    }
  }

  /**
   * A droplet in flight. If it caught a swan, that one takes offence and its
   * neighbours square up with it — mute swans are not a forgiving bird.
   */
  public sprayHitsBody(
    point: THREE.Vector3,
    dirty = false,
    direction: THREE.Vector3 = new THREE.Vector3(0, 0, 1),
  ): boolean {
    // Water hitting a tagged wall carves fading streaks through the paint.
    for (const tag of this.graffiti) {
      if (!tag.hitBy(point)) continue;
      tag.scrub(point, direction);
      if (tag.claimCredit()) this.creditClean();
      return true;
    }

    // Kids caught in the spray drop off the branch and clear off sharpish.
    for (const lot of this.branchKids) {
      if (lot.getPosition().distanceTo(point) > 2.5) continue;
      lot.scarper();
      return true;
    }

    // Water on a hot grill throws steam and ruins someone's tea.
    for (const party of this.bbqs) {
      if (!party.hitBy(point)) continue;
      if (party.douse(point, this.camera.position)) this.complain();
      return true;
    }

    // Radio boats take on water until they go under.
    for (const boat of this.boats) {
      if (boat.takeWater(point)) return true;
    }

    // Ducks and gulls just go up; neither will stand and argue about it.
    for (const gull of this.gulls) {
      if (gull.getPosition().distanceTo(point) > 2) continue;
      if (dirty) gull.splatter(point);
      gull.flush();
      return true;
    }
    for (const duck of this.ducks) {
      if (duck.getPosition().distanceTo(point) > 1.5) continue;
      if (dirty) duck.splatter(point);
      duck.flush();
      return true;
    }
    for (const squirrel of this.squirrels) {
      if (squirrel.getPosition().distanceTo(point) > 1.2) continue;
      if (dirty) squirrel.splatter(point);
      squirrel.flush();
      return true;
    }

    for (const swan of this.swans) {
      if (!swan.soakedBy(point)) continue;
      if (dirty) swan.splatter(point);

      swan.soak(this.camera.position);
      if (swan.isCharging()) {
        const at = swan.getPosition();
        for (const other of this.swans) {
          if (other !== swan && other.getPosition().distanceTo(at) < 16)
            other.rile();
        }
      }
      return true;
    }

    for (const person of this.people) {
      const dog = person.getDog();
      if (dog?.hitBy(point)) {
        if (dirty) dog.splatter(point);
        return true;
      }

      if (!person.soakedBy(point)) continue;
      const dry = !person.isSoaked();
      if (dirty) {
        person.splatter(point);
        const swung = person.foul(this.camera.position);
        if (dry || swung) this.complain();
      } else {
        person.drench(this.camera.position);
        // One complaint per soaking, not one per droplet.
        if (dry) this.complain();
      }
      return true;
    }

    return false;
  }

  /**
   * Somebody has gone in. A wall of water goes up, and everything close by —
   * public and swans alike — gets the benefit of it.
   */
  private bigSplash(at: THREE.Vector3): void {
    this.splashRings(at);

    for (const person of this.people) {
      const spot = person.getPosition();
      if (person.isInTheDrink() || spot.distanceTo(at) > 7) continue;
      const dry = !person.isSoaked();
      person.drench();
      if (dry) this.complain();
    }

    for (const swan of this.swans) {
      if (swan.getPosition().distanceTo(at) > 8) continue;
      swan.soak();
      swan.rile();
    }
  }

  /** Rings on the water and a shower of droplets thrown up out of it. */
  private splashRings(at: THREE.Vector3): void {
    for (const [radius, life] of [
      [1.4, 1.6],
      [2.6, 2.2],
    ] as const) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(radius * 0.55, radius, 18),
        new THREE.MeshBasicMaterial({
          color: 0xdff2ff,
          transparent: true,
          opacity: 0.7,
          side: THREE.DoubleSide,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(at.x, WATER_Y + 0.03, at.z);
      this.scene.add(ring);

      const started = performance.now();
      const grow = (): void => {
        const t = (performance.now() - started) / (life * 1000);
        if (t >= 1) {
          this.scene.remove(ring);
          ring.geometry.dispose();
          (ring.material as THREE.Material).dispose();
          return;
        }
        ring.scale.setScalar(1 + t * 3.4);
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - t);
        requestAnimationFrame(grow);
      };
      requestAnimationFrame(grow);
    }

    const material = new THREE.MeshBasicMaterial({
      color: 0xeaf6ff,
      transparent: true,
      opacity: 0.9,
    });
    const drops: THREE.Mesh[] = [];
    const speeds: THREE.Vector3[] = [];
    for (let i = 0; i < 26; i++) {
      const drop = new THREE.Mesh(
        new THREE.SphereGeometry(0.1 + Math.random() * 0.14, 5, 4),
        material,
      );
      drop.position.set(at.x, WATER_Y + 0.1, at.z);
      this.scene.add(drop);
      drops.push(drop);

      const angle = Math.random() * Math.PI * 2;
      const out = 1 + Math.random() * 4;
      speeds.push(
        new THREE.Vector3(
          Math.cos(angle) * out,
          4 + Math.random() * 4,
          Math.sin(angle) * out,
        ),
      );
    }

    const started = performance.now();
    let last = started;
    const fall = (): void => {
      const now = performance.now();
      const step = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - started) / 1100;
      if (t >= 1) {
        for (const drop of drops) {
          this.scene.remove(drop);
          drop.geometry.dispose();
        }
        material.dispose();
        return;
      }
      for (let i = 0; i < drops.length; i++) {
        speeds[i]!.y -= 9.5 * step;
        drops[i]!.position.addScaledVector(speeds[i]!, step);
      }
      material.opacity = 0.9 * (1 - t);
      requestAnimationFrame(fall);
    };
    requestAnimationFrame(fall);
  }

  /** A swan got to you: shoved back, combo gone, a fright, and a wound. */
  private takeStrike(from: THREE.Vector3): void {
    if (this.dead) return;
    this.player.shove(from);
    this.hurtLeft = 0.9;
    this.comboRun = 0;
    this.comboLeft = 0;
    this.score = Math.max(0, this.score - 15);
    this.hurtFlash.classList.add("on");

    this.health = Math.max(0, this.health - PECK_DAMAGE);
    this.sincePecked = 0;
    if (this.health === 0) this.die();

    this.updateHUD();
  }

  /** Bounce spray caught him in the face — wet, or filthy if it came off a pile. */
  public splashFace(dirty: boolean): void {
    this.faceWetLeft = Math.max(this.faceWetLeft, dirty ? 5.5 : 3.2);
    if (dirty) this.faceDirty = true;
  }

  /** Nothing for a while and they get their breath back. */
  private mendUp(delta: number): void {
    this.sincePecked += delta;
    if (this.health >= HEALTH_MAX || this.sincePecked < HEAL_DELAY) return;
    this.health = Math.min(HEALTH_MAX, this.health + HEAL_RATE * delta);
    this.updateHUD();
  }

  /** That's the shift over. Down they go, and the park carries on without them. */
  private die(): void {
    this.dead = true;
    this.collapse = 0;
    document.exitPointerLock?.();
    this.gameOverDetail.innerHTML = [
      `A mute swan has seen you off at ${this.dayCycle.clockFace()}.`,
      `Score <strong>${this.score}</strong> &middot; ${this.cleaned} cleaned &middot; ${this.complaints} complaints`,
      `Park left at ${Math.round(this.cleanliness)}% clean.`,
    ].join("<br>");
  }

  /** Sinking to the paving with the world tipping over sideways. */
  private goDown(delta: number): void {
    this.collapse = Math.min(1, this.collapse + delta * 0.8);
    const t = this.collapse;
    this.camera.position.y = THREE.MathUtils.lerp(1.7, 0.45, t * t);
    this.camera.rotation.z = t * 0.9;
    if (t >= 1) this.gameOverPanel.classList.add("on");
  }

  /** Water landed here — scrub anything close enough to the splash. */
  public washAt(
    point: THREE.Vector3,
    direction: THREE.Vector3 = new THREE.Vector3(0, 0, 1),
  ): boolean {
    let hitMess = false;
    for (let i = this.droppings.length - 1; i >= 0; i--) {
      const dropping = this.droppings[i]!;
      if (!dropping.covers(point)) continue;

      dropping.scrub(point, direction);
      if (dropping.claimCredit()) this.creditClean();
      hitMess = true;
    }

    // Shoe prints are only a smear, so they lift under the same spray without
    // being a job in their own right.
    for (let i = this.footprints.length - 1; i >= 0; i--) {
      const print = this.footprints[i]!;
      const at = print.getPosition();
      const dx = at.x - point.x;
      const dz = at.z - point.z;
      if (dx * dx + dz * dz > WASH_RADIUS * WASH_RADIUS) continue;

      print.wash();
      if (!print.isGone()) continue;
      print.dispose();
      this.footprints.splice(i, 1);
    }

    // Splash next to a radio boat still ships water over the gunwales.
    for (const boat of this.boats) boat.takeWater(point);

    // Ground spray that catches a barbecue still hisses and winds them up.
    for (const party of this.bbqs) {
      const at = party.getPosition();
      const dx = at.x - point.x;
      const dz = at.z - point.z;
      if (dx * dx + dz * dz > 1.1 * 1.1) continue;
      if (party.douse(point.clone().setY(0.55), this.camera.position)) {
        this.complain();
      }
    }

    // Standing water on the paving — grass just soaks it up.
    this.puddles.splash(point);
    return hitMess;
  }

  /**
   * The spike has come down here. Takes the nearest bit of rubbish in reach
   * and sends it into the sack, and says whether it caught anything.
   */
  public spearLitter(at: THREE.Vector3): boolean {
    let closest: Litter | null = null;
    let best = SPEAR_RADIUS;

    for (const piece of this.litter) {
      if (piece.isTaken()) continue;
      const gap = piece.getPosition().setY(0).distanceTo(at);
      if (gap > best) continue;
      best = gap;
      closest = piece;
    }

    if (closest) {
      closest.spear(this.player.sackPoint());
      this.creditClean();
      return true;
    }

    // Nothing loose in reach, so see whether they're stood at a full bin.
    for (const bin of this.bins) {
      if (!bin.isFull() || bin.getPosition().distanceTo(at) > 2.4) continue;
      bin.empty();
      this.creditClean();
      return true;
    }

    return false;
  }

  /**
   * The odd airliner going over on the Gatwick run, and now and then
   * something lower off the Solent. They're only ever scenery, but the sky
   * is empty without them.
   */
  private updatePlanes(delta: number): void {
    // Under a flat grey lid there's nothing to see, so don't bother sending one.
    const murk = this.weather.gloom;

    this.nextPlane -= delta;
    if (this.nextPlane <= 0) {
      this.nextPlane = 70 + Math.random() * 150;
      if (murk < 0.4 && this.planes.length < 2) {
        this.planes.push(new Plane(this.scene, murk));
      }
    }

    // The Spitfire is a rarer thing, and only on a decent afternoon.
    this.nextSpitfire -= delta;
    if (this.nextSpitfire <= 0) {
      this.nextSpitfire = 420 + Math.random() * 600;
      const hour = this.dayCycle.hour;
      if (murk < 0.3 && hour > 10 && hour < 20) {
        this.planes.push(new Plane(this.scene, murk, "spitfire"));
        this.callouts.raise("spitfire", this.dayCycle.clockFace());
      }
    }

    for (let i = this.planes.length - 1; i >= 0; i--) {
      const plane = this.planes[i]!;
      plane.update(delta, murk);
      if (!plane.isGone()) continue;
      plane.dispose();
      this.planes.splice(i, 1);
    }
  }

  /** Prints wear off the paving on their own, given long enough. */
  private updateFootprints(delta: number): void {
    for (let i = this.footprints.length - 1; i >= 0; i--) {
      const print = this.footprints[i]!;
      print.update(delta);
      if (!print.isGone()) continue;
      print.dispose();
      this.footprints.splice(i, 1);
    }
  }

  /** Rinse away piles that are mostly washed clear; rain wears at the rest. */
  private updateDroppings(delta: number): void {
    const rain = this.weather.rainStrength();
    for (let i = this.droppings.length - 1; i >= 0; i--) {
      const pile = this.droppings[i]!;
      pile.weather(delta, rain);
      if (!pile.update(delta)) continue;
      pile.dispose();
      this.droppings.splice(i, 1);
    }
  }

  /**
   * The mallards. There's always a few on the water, and every so often a
   * couple more come in off the sea and put down, or a couple clear off.
   */
  private updateDucks(delta: number): void {
    this.nextDuck -= delta;
    if (this.nextDuck <= 0) {
      this.nextDuck = 40 + Math.random() * 70;
      if (this.ducks.length < DUCK_LIMIT) {
        // They come in as a pair or a three, not one at a time.
        const skein = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < skein && this.ducks.length < DUCK_LIMIT; i++) {
          this.ducks.push(new Duck(this.scene, true));
        }
      } else {
        const settled = this.ducks.filter((duck) => duck.isOnWater());
        settled[Math.floor(Math.random() * settled.length)]?.flush();
      }
    }

    for (let i = this.ducks.length - 1; i >= 0; i--) {
      const duck = this.ducks[i]!;
      duck.update(delta, this.camera.position);
      if (!duck.isGone()) continue;
      duck.dispose();
      this.ducks.splice(i, 1);
    }
  }

  /**
   * The gulls. They wheel about over the lake watching the paving, and the
   * moment food is left unattended they're down on it. What goes in comes
   * out again, usually over the path.
   */
  private updateGulls(delta: number, scraps: readonly Scrap[]): void {
    this.nextGull -= delta;
    if (this.nextGull <= 0 && this.gulls.length < GULL_LIMIT) {
      // They glide in from out over the Solent, so they don't pop onto the circle.
      this.gulls.push(
        new Gull(
          this.scene,
          new THREE.Vector2((Math.random() - 0.5) * 120, 0),
        ),
      );
      this.nextGull = 35 + Math.random() * 80;
    }

    let mobbing = false;

    for (const gull of this.gulls) {
      gull.update(delta, this.camera.position, scraps);
      if (gull.isAground()) mobbing = true;
      // A third of beakfuls come back out within the minute, near enough.
      if (gull.claimFeed() && Math.random() < 0.2) {
        const spot = gull.dropSpot();
        if (!isInLake(spot.x, spot.z)) this.addDropping(spot, "gull");
      }
    }

    if (mobbing) {
      this.callouts.raise("gulls", this.dayCycle.clockFace());
    }
  }

  /**
   * The greys. They keep to their own trees for the most part; the bold ones
   * will cross the park for a chip paper nobody's watching and take it up a
   * trunk to eat, which saves you a job you'd rather have had yourself.
   */
  private updateSquirrels(delta: number, scraps: readonly Scrap[]): void {
    for (const squirrel of this.squirrels) {
      squirrel.update(delta, this.camera.position, scraps);
    }
  }

  /** Everything edible lying about, and whether anyone's stood over it. */
  private foodOnTheGround(): Scrap[] {
    const scraps: Scrap[] = [];
    const attended = (at: THREE.Vector3): boolean =>
      this.people.some(
        (person) => person.getPosition().distanceTo(at) < FOOD_GUARDED,
      ) || this.camera.position.distanceTo(at) < FOOD_GUARDED;

    for (const pile of this.bread) {
      const at = pile.getPosition().clone();
      const afloat = pile.isAfloat();
      scraps.push({
        at,
        take: () => pile.peck(),
        // Floating crumbs are fair game — the family on the bank isn't guarding them.
        going: () => !pile.isGone() && (afloat || !attended(at)),
      });
    }

    for (const piece of this.litter) {
      if (!piece.isFood()) continue;
      const at = piece.getPosition().setY(0);
      scraps.push({
        at,
        // A gull doesn't pick at a chip paper; it carries the whole lot off.
        take: () => piece.spear(at.clone().setY(6)),
        going: () => !piece.isTaken() && !attended(at),
      });
    }

    return scraps;
  }

  /**
   * Bins only fill when somebody puts rubbish in. A full one gets reported
   * once and can be swapped out with the picker.
   */
  private updateBins(_delta: number): void {
    for (const bin of this.bins) {
      if (bin.claimReport()) {
        const at = bin.getPosition();
        this.callouts.raise("bin", this.dayCycle.clockFace(), {
          x: at.x,
          z: at.z,
        });
      }
    }
  }

  /** The odd tag going up on a blank wall overnight and on quiet afternoons. */
  private updateGraffiti(delta: number): void {
    for (let i = this.graffiti.length - 1; i >= 0; i--) {
      const tag = this.graffiti[i]!;
      if (!tag.update(delta) && !tag.isClean()) continue;
      tag.dispose();
      this.graffiti.splice(i, 1);
    }

    this.nextTag -= delta;
    if (this.nextTag > 0 || this.graffiti.length >= 4) return;

    // Nobody tags a wall with the warden stood watching it.
    const options = taggableWalls().filter(
      (wall) => !this.inShot(wall.x, wall.z, wall.y),
    );
    const wall = options[Math.floor(Math.random() * options.length)];
    if (!wall) {
      this.nextTag = WAIT_AND_SEE;
      return;
    }
    this.nextTag = 220 + Math.random() * 320;
    const tag = new Graffiti(this.scene, wall);
    this.graffiti.push(tag);
    const at = tag.getPosition();
    this.callouts.raise("graffiti", this.dayCycle.clockFace(), {
      x: at.x,
      z: at.z,
    });
  }

  /** Kids hanging off the low limbs, and the tree officer's opinion of it. */
  private updateBranchKids(delta: number): void {
    this.nextBranchKid -= delta;
    if (this.nextBranchKid <= 0 && this.branchKids.length < 2) {
      // On a tree round the other side of the park, out of your eyeline.
      const trees = treeSpots();
      const spot = this.outOfShot(
        () => trees[Math.floor(Math.random() * trees.length)] ?? new THREE.Vector2(),
        2,
      );
      if (!spot) {
        this.nextBranchKid = WAIT_AND_SEE;
      } else {
        const lot = new BranchKid(this.scene, spot);
        this.branchKids.push(lot);
        this.nextBranchKid = 180 + Math.random() * 240;
        const tree = lot.getTree();
        this.callouts.raise("branches", this.dayCycle.clockFace(), {
          x: tree.x,
          z: tree.y,
        });
      }
    }

    for (let i = this.branchKids.length - 1; i >= 0; i--) {
      const lot = this.branchKids[i]!;
      lot.update(delta, this.camera.position);
      // A branch off the tree is a complaint against the park, and yours.
      if (lot.claimDamage()) this.complain();
      if (lot.isGone()) {
        lot.dispose();
        this.branchKids.splice(i, 1);
      }
    }
  }

  /**
   * The general state of the place. Mess and rubbish only get phoned in once
   * they've built up, and if it's all spotless the depot says so.
   */
  private watchTheState(): void {
    const clock = this.dayCycle.clockFace();

    if (this.droppings.length >= 2) {
      const worst = this.droppings[0]!.getPosition();
      this.callouts.raise("poo", clock, { x: worst.x, z: worst.z });
    }

    if (this.litter.length >= 7) {
      const spot = this.litter[0]!.getPosition();
      this.callouts.raise("litter", clock, { x: spot.x, z: spot.z });
    }

    if (
      this.elapsed > 90 &&
      this.cleaned > 0 &&
      this.cleanliness > 96 &&
      this.droppings.length + this.litter.length <= 2
    ) {
      this.callouts.raise("praise", clock);
    }
  }

  /** A swan that's picked on a member of the public rather than on you. */
  private watchForAttacks(): void {
    for (const swan of this.swans) {
      if (!swan.isCharging()) continue;
      const at = swan.getPosition();
      for (const person of this.people) {
        if (person.getPosition().distanceTo(at) > 3.5) continue;
        this.callouts.raise("swan", this.dayCycle.clockFace(), {
          x: at.x,
          z: at.z,
        });
        return;
      }
    }
  }

  /** Rubbish shifting about in the wind, and anything on its way to the sack. */
  private updateLitter(delta: number): void {
    const breeze = 0.4 + this.weather.gloom * 1.4;
    for (let i = this.litter.length - 1; i >= 0; i--) {
      const piece = this.litter[i]!;
      piece.update(delta, breeze);
      if (!piece.isGone()) continue;
      piece.dispose();
      this.litter.splice(i, 1);
    }
  }

  /** Keeps the on-screen prompt in step with what they're holding. */
  public showTool(tool: Tool | null): void {
    const mobile = document.body.classList.contains("touch-ui");
    this.instructionsElement.innerHTML = mobile
      ? "Left stick: Move | Look stick: Look | Spray (above look): Aim & fire"
      : tool === "picker"
        ? "WASD: Move | Shift: Run | Click: Spear litter | Q: Pressure washer | ESC: Unlock mouse"
        : "WASD: Move | Shift: Run | Click: Spray | Q: Litter picker | ESC: Unlock mouse";
  }

  /**
   * What the tool belt should be reaching for, going off whatever they're
   * looking at. Rubbish and full bins want the spike; mess, prints and tags
   * want the lance. Nothing in view means nothing needs to be in their hands.
   */
  public jobInSight(
    from: THREE.Vector3,
    forward: THREE.Vector3,
    holding: Tool | null = null,
  ): Tool | null {
    // Is it in front of them, and near enough to be their next job?
    const looking = (at: THREE.Vector3, reach: number, cone: number): boolean => {
      const to = new THREE.Vector3(at.x - from.x, 0, at.z - from.z);
      const gap = to.length();
      if (gap > reach) return false;
      if (gap < 1.2) return true;
      return to.divideScalar(gap).dot(forward) > cone;
    };

    const spike =
      this.litter.some(
        (piece) => !piece.isTaken() && looking(piece.getPosition(), PICKER_SIGHT, 0.8),
      ) ||
      this.bins.some(
        (bin) => bin.isFull() && looking(bin.getPosition(), PICKER_SIGHT, 0.8),
      );

    const lance =
      this.droppings.some(
        (dropping) =>
          !dropping.isRinsing() &&
          looking(dropping.getPosition(), HOSE_SIGHT, 0.94),
      ) ||
      this.graffiti.some((tag) => looking(tag.getPosition(), HOSE_SIGHT, 0.92)) ||
      this.footprints.some((print) =>
        looking(print.getPosition(), HOSE_SIGHT * 0.55, 0.95),
      );

    // Whatever's already in their hands wins, so they don't stand there
    // swapping back and forth over a bin next to a mess.
    if (holding === "picker" && spike) return "picker";
    if (holding === "hose" && lance) return "hose";
    if (spike) return "picker";
    return lance ? "hose" : null;
  }

  /**
   * The odd rider cutting through. They brake and ring for anyone in the way,
   * and if they ride through a mess it gets flattened and they're none too
   * pleased about it.
   */
  private updateCyclists(delta: number, mess: readonly THREE.Vector3[]): void {
    this.nextCyclist -= delta;
    if (this.nextCyclist <= 0 && this.cyclists.length < MAX_CYCLISTS) {
      // They ride in from a stretch of path you're not watching.
      const from = this.outOfShotOnPath();
      if (from === null) {
        this.nextCyclist = WAIT_AND_SEE;
      } else {
        // Every so often it's a pair of lads on an e-bike instead of a cyclist.
        const lads = Math.random() < 0.35;
        this.cyclists.push(
          new Cyclist(this.scene, from, lads ? "ebike" : "cyclist"),
        );
        this.nextCyclist = 45 + Math.random() * 70;
        if (lads) this.callouts.raise("ebike", this.dayCycle.clockFace());
      }
    }

    const inTheWay = [
      ...this.people.map((person) => person.getPosition()),
      ...this.swans.map((swan) => swan.getPosition()),
      this.camera.position,
    ];

    for (let i = this.cyclists.length - 1; i >= 0; i--) {
      const rider = this.cyclists[i]!;
      const splatted = rider.update(delta, inTheWay, mess);
      if (splatted >= 0) this.logComplaint(this.droppings[splatted]!);

      const line = rider.claimTrack();
      if (line) this.footprints.push(new Footprint(this.scene, line));

      if (rider.isGone() && this.canSlipAway(rider.getPosition())) {
        rider.dispose();
        this.cyclists.splice(i, 1);
      }
    }

    this.updateScooters(delta, mess, inTheWay);
  }

  /**
   * The odd mobility scooter doing a slow lap. They stop for everything and
   * everyone, and they are not shy about what they think of the state of the
   * place.
   */
  private updateScooters(
    delta: number,
    mess: readonly THREE.Vector3[],
    inTheWay: readonly THREE.Vector3[],
  ): void {
    this.nextScooter -= delta;
    if (this.nextScooter <= 0 && this.scooters.length < MAX_SCOOTERS) {
      const from = this.outOfShotOnPath();
      if (from === null) {
        this.nextScooter = WAIT_AND_SEE;
      } else {
        this.scooters.push(new Scooter(this.scene, from));
        this.nextScooter = 40 + Math.random() * 80;
      }
    }

    for (let i = this.scooters.length - 1; i >= 0; i--) {
      const scooter = this.scooters[i]!;
      const splatted = scooter.update(delta, inTheWay, mess);
      if (splatted >= 0) this.logComplaint(this.droppings[splatted]!);

      if (scooter.isGone() && this.canSlipAway(scooter.getPosition())) {
        scooter.dispose();
        this.scooters.splice(i, 1);
      }
    }
  }

  private isDark(): boolean {
    const hour = this.dayCycle.hour;
    return hour >= NIGHT_FROM || hour < NIGHT_UNTIL;
  }

  /**
   * After dark the swans come off the water and settle on the grass for the
   * night, and every so often a fox works its way round the park.
   */
  private updateNight(delta: number): void {
    const dark = this.isDark();

    for (const swan of this.swans) {
      if (dark) swan.settleForNight();
      else swan.wakeUp();
    }

    // Only worth turning up if it has the small hours to itself.
    const foxHours = this.dayCycle.hour >= 22 || this.dayCycle.hour < 4;
    if (foxHours && !this.fox) {
      this.nextFox -= delta;
      if (this.nextFox <= 0) {
        const from = this.outOfShot(() => {
          const angle = Math.random() * Math.PI * 2;
          return new THREE.Vector2(
            Math.cos(angle) * 190,
            Math.sin(angle) * 120,
          );
        }, 0.5);
        if (!from) {
          this.nextFox = WAIT_AND_SEE;
        } else {
          this.fox = new Fox(this.scene, from);
          this.nextFox = 120 + Math.random() * 240;
        }
      }
    }

    if (!this.fox) return;

    this.fox.update(delta, this.camera.position);
    if (this.fox.wantsToGo()) {
      this.addDropping(this.fox.getPosition(), "fox");
    }
    // Gone off the map, or caught out by the dawn.
    if (this.fox.isGone() || !dark) {
      this.fox.dispose();
      this.fox = null;
    }
  }

  /** Now and then a kid turns up on the bank with a radio boat. */
  private updateBoats(delta: number): void {
    this.nextBoat -= delta;
    if (this.nextBoat <= 0 && this.boats.length < MAX_BOATS) {
      const spot = this.outOfShotAtBank();
      if (!spot) {
        this.nextBoat = WAIT_AND_SEE;
      } else {
        this.boats.push(new RcBoat(this.scene, spot));
        this.nextBoat = 90 + Math.random() * 140;
      }
    }

    for (let i = this.boats.length - 1; i >= 0; i--) {
      const boat = this.boats[i]!;
      boat.update(delta);
      if (boat.claimComplaint()) this.complain();
      if (boat.isDone()) {
        boat.dispose();
        this.boats.splice(i, 1);
      }
    }
  }

  /**
   * Crabbing parties settle in at the edge, usually two or three kids in a row
   * along the same stretch of wall, and stay for a good few minutes.
   */
  private updateCrabbers(delta: number): void {
    this.nextCrabber -= delta;
    if (this.nextCrabber <= 0 && this.crabbers.length < MAX_CRABBERS) {
      // They settle in on a stretch of wall behind you, not in front of you.
      // It's where they'll kneel on the bank that matters, not the water.
      const spot = this.outOfShotAtBank();
      if (!spot) {
        this.nextCrabber = WAIT_AND_SEE;
      } else {
        const party = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < party && this.crabbers.length < MAX_CRABBERS; i++) {
          this.crabbers.push(
            new Crabber(this.scene, spot, (i - (party - 1) / 2) * 1.1),
          );
        }
        this.nextCrabber = 110 + Math.random() * 160;
      }
    }

    for (let i = this.crabbers.length - 1; i >= 0; i--) {
      const crabber = this.crabbers[i]!;
      crabber.update(delta);
      if (crabber.isDone()) {
        crabber.dispose();
        this.crabbers.splice(i, 1);
      }
    }
  }

  /**
   * Disposable barbecues on the green south of the park — lunch through the
   * early evening, a couple at most, walking in off the promenade.
   */
  private updateBbqs(delta: number): void {
    const hour = this.dayCycle.hour;
    const bbqHours = hour >= 11 && hour < 20;

    this.nextBbq -= delta;
    if (this.nextBbq <= 0 && bbqHours && this.bbqs.length < MAX_BBQS) {
      const spot = this.freeBbqSpot();
      if (!spot) {
        this.nextBbq = WAIT_AND_SEE;
      } else {
        this.bbqs.push(new BbqParty(this.scene, spot));
        this.nextBbq = 140 + Math.random() * 200;
      }
    } else if (this.nextBbq <= 0) {
      this.nextBbq = bbqHours ? 40 + Math.random() * 40 : 90 + Math.random() * 60;
    }

    for (let i = this.bbqs.length - 1; i >= 0; i--) {
      const party = this.bbqs[i]!;
      party.update(delta);
      if (party.isDone()) {
        party.dispose();
        this.bbqs.splice(i, 1);
      }
    }
  }

  /** A free patch of the south green, out of shot and clear of other parties. */
  private freeBbqSpot(): THREE.Vector2 | null {
    const options = BBQ_SPOTS.filter((spot) => {
      if (this.inShot(spot.x, spot.y, 0)) return false;
      if (atParkBuilding(spot.x, spot.y)) return false;
      for (const party of this.bbqs) {
        const at = party.getPosition();
        const dx = at.x - spot.x;
        const dz = at.z - spot.y;
        if (dx * dx + dz * dz < 20 * 20) return false;
      }
      return true;
    });
    if (options.length === 0) return null;
    return options[Math.floor(Math.random() * options.length)]!.clone();
  }

  /**
   * Kids walking into the play park through the day — swings, slide, spring
   * animal, tearing about — then off again when they've had enough.
   */
  private updatePlayVisits(delta: number): void {
    const hour = this.dayCycle.hour;
    const playHours = hour >= 8 && hour < 19.5;

    this.nextPlayVisit -= delta;
    if (
      this.nextPlayVisit <= 0 &&
      playHours &&
      this.playVisits.length < MAX_PLAY_VISITS
    ) {
      const site = canVisitPlayPark();
      if (!site || this.inShot(site.x, site.z, 0.5)) {
        this.nextPlayVisit = WAIT_AND_SEE;
      } else {
        this.playVisits.push(new PlayVisit(this.scene, site));
        this.nextPlayVisit = 45 + Math.random() * 70;
      }
    } else if (this.nextPlayVisit <= 0) {
      this.nextPlayVisit = playHours
        ? 20 + Math.random() * 25
        : 80 + Math.random() * 60;
    }

    for (let i = this.playVisits.length - 1; i >= 0; i--) {
      const visit = this.playVisits[i]!;
      visit.update(delta);
      if (visit.isDone()) {
        visit.dispose();
        this.playVisits.splice(i, 1);
      }
    }
  }

  private nearestBread(to: THREE.Vector3): Bread | null {
    let closest: Bread | null = null;
    let best = BREAD_DISTANCE;
    for (const pile of this.bread) {
      const gap = pile.getPosition().distanceTo(to);
      if (gap < best) {
        best = gap;
        closest = pile;
      }
    }
    return closest;
  }

  /** Bread's gone. Everyone still at the pile is left to digest it. */
  private clearBread(pile: Bread): void {
    pile.dispose();
    this.bread = this.bread.filter((other) => other !== pile);

    for (const swan of this.swans) {
      if (
        swan.isFeasting() &&
        swan.getPosition().distanceTo(pile.getPosition()) < BREAD_DISTANCE
      ) {
        swan.gorge();
      }
    }
    for (const duck of this.ducks) {
      if (duck.isFeasting()) duck.loseBread();
    }
  }

  /**
   * Hungry swans latch on to whoever is carrying food and trail after them
   * until they get a handful. A well-fed swan ignores the lot of them.
   * Bread already on the ground (especially floating) pulls the whole flock
   * — swans, ducks, and any gull overhead — and the pushier birds may scrap.
   */
  private temptSwans(): void {
    const carriers = this.people.filter((person) => person.hasFood());

    for (const swan of this.swans) {
      // Nothing is worth getting up for once they're bedded down for the night.
      if (swan.isCharging() || swan.isRoosting()) continue;

      // Bread already on the ground beats trailing someone who might share.
      const pile = this.nearestBread(swan.getPosition());
      if (pile) {
        swan.goForBread(pile.getPosition());
        if (swan.wantsPeck()) {
          pile.peck();
          if (pile.isGone()) this.clearBread(pile);
        }
        continue;
      }

      if (swan.isFeasting()) {
        // Whatever it was eating has gone, so it stands about digesting.
        swan.gorge();
        continue;
      }

      let closest: Person | null = null;
      let best = BEG_DISTANCE;
      if (swan.isHungry()) {
        const at = swan.getPosition();
        for (const person of carriers) {
          const gap = person.getPosition().distanceTo(at);
          if (gap < best) {
            best = gap;
            closest = person;
          }
        }
      }

      if (!closest) {
        swan.loseInterest();
        continue;
      }

      swan.tempt(closest.getPosition());
      if (swan.wantsFeeding()) {
        closest.feedSwan();
        swan.feed();
        swan.loseInterest();
      }
    }

    // Mallards paddle in from across the lake when there's floating bread.
    for (const duck of this.ducks) {
      if (!duck.isOnWater() && !duck.isFeasting()) continue;
      const pile = this.nearestAfloatBread(duck.getPosition());
      if (!pile) {
        if (duck.isFeasting()) duck.loseBread();
        continue;
      }
      duck.goForBread(pile.getPosition());
      if (duck.wantsPeck()) {
        pile.peck();
        if (pile.isGone()) this.clearBread(pile);
      }
    }
  }

  private nearestAfloatBread(to: THREE.Vector3): Bread | null {
    let closest: Bread | null = null;
    let best = BREAD_DISTANCE;
    for (const pile of this.bread) {
      if (!pile.isAfloat()) continue;
      const gap = pile.getPosition().distanceTo(to);
      if (gap < best) {
        best = gap;
        closest = pile;
      }
    }
    return closest;
  }

  /**
   * Aggressive birds at a crowded pile square up for a couple of seconds.
   * Ducks clear off; people on the bank stop and gawp.
   */
  private birdScraps(delta: number): void {
    for (const pile of this.bread) {
      const at = pile.getPosition();
      const diners = this.swans.filter(
        (swan) =>
          swan.isFeasting() &&
          !swan.isScrapping() &&
          swan.getPosition().distanceTo(at) < 4.5,
      );
      if (diners.length < 2) continue;
      if (Math.random() > SCRAP_RATE * delta) continue;

      const a = diners[Math.floor(Math.random() * diners.length)]!;
      let b = diners[0]!;
      for (const other of diners) {
        if (other === a) continue;
        b = other;
        break;
      }
      if (b === a) continue;

      const aPos = a.getPosition();
      const bPos = b.getPosition();
      if (!a.tryScrap(bPos)) continue;
      b.takeScrap(aPos);

      const mid = aPos.clone().add(bPos).multiplyScalar(0.5);
      for (const duck of this.ducks) {
        if (duck.getPosition().distanceTo(mid) < 8) duck.shyFrom(mid);
      }
      for (const person of this.people) person.watchFight(mid);
      break;
    }
  }

  /**
   * A member of the public has trodden in one you missed. That's a complaint
   * on your record, and a trodden mess is spread about and worth nothing.
   */
  private logComplaint(dropping: Dropping): void {
    dropping.tread();
    this.complain();
  }

  /** Somebody has had enough of you: costs points and kills the combo. */
  private complain(): void {
    this.complaints += 1;
    this.comboRun = 0;
    this.comboLeft = 0;
    this.score = Math.max(0, this.score - 25);
    this.updateHUD();
  }

  /** Scores a finished dropping and keeps the combo run alive. */
  private creditClean(): void {
    this.cleaned += 1;
    this.comboRun = this.comboLeft > 0 ? this.comboRun + 1 : 1;
    this.comboLeft = COMBO_WINDOW;
    this.score += 10 * this.multiplier();
    this.updateHUD();
  }

  private multiplier(): number {
    return Math.min(COMBO_CAP, this.comboRun);
  }

  private tickCombo(delta: number): void {
    if (this.comboLeft <= 0) return;
    this.comboLeft = Math.max(0, this.comboLeft - delta);
    if (this.comboLeft === 0) this.comboRun = 0;
    this.updateHUD();
  }

  private updateCleanliness(delta: number): void {
    const maxDroppings = 80;
    // Rubbish counts against the park the same as anything the swans leave,
    // and a trail of prints counts for a fraction of one.
    const trodden = this.footprints.reduce(
      (total, print) => total + print.weight() * 0.3,
      0,
    );
    const filth =
      this.droppings.reduce(
        (total, pile) => (pile.isRinsing() ? total : total + pile.getLayers()),
        0,
      ) +
      this.litter.length +
      trodden;
    const targetCleanliness = Math.max(0, 100 - (filth / maxDroppings) * 100);

    const changeRate = 20 * delta;
    if (this.cleanliness > targetCleanliness) {
      this.cleanliness = Math.max(
        targetCleanliness,
        this.cleanliness - changeRate,
      );
    } else {
      this.cleanliness = Math.min(
        targetCleanliness,
        this.cleanliness + changeRate,
      );
    }

    this.updateHUD();
  }

  private updateHUD(): void {
    this.cleanlinessElement.textContent = Math.round(
      this.cleanliness,
    ).toString();
    this.cleanlinessBar.style.width = `${this.cleanliness}%`;

    this.cleanlinessBar.classList.remove("warning", "danger");
    if (this.cleanliness < 30) {
      this.cleanlinessBar.classList.add("danger");
    } else if (this.cleanliness < 60) {
      this.cleanlinessBar.classList.add("warning");
    }

    this.scoreElement.textContent = this.score.toLocaleString("en-GB");
    this.cleanedElement.textContent = this.cleaned.toString();
    this.complaintsElement.textContent = this.complaints.toString();
    this.complaintsElement.parentElement!.classList.toggle(
      "bad",
      this.complaints > 0,
    );

    this.healthFill.style.width = `${(this.health / HEALTH_MAX) * 100}%`;
    this.healthFill.classList.toggle("low", this.health <= 30);

    const running = this.comboLeft > 0 && this.multiplier() > 1;
    this.comboElement.classList.toggle("active", running);
    if (running) {
      this.comboValueElement.textContent = `x${this.multiplier()}`;
      this.comboFill.style.width = `${(this.comboLeft / COMBO_WINDOW) * 100}%`;
    }
  }

  private onWindowResize(): void {
    const width = window.visualViewport?.width ?? window.innerWidth;
    const height = window.visualViewport?.height ?? window.innerHeight;
    this.camera.aspect = width / Math.max(1, height);
    // Short landscape phones feel zoomed at the desktop FOV — open it out a bit.
    const mobile = document.body.classList.contains("touch-ui");
    this.camera.fov = mobile ? 88 : 75;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);

    if (this.frozen) {
      this.clock.getDelta();
      return;
    }

    const delta = Math.min(this.clock.getDelta(), 0.05);

    if (this.dead) {
      this.goDown(delta);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.player.update(delta);
    // Worked out once, up front: everything that spawns this frame checks it.
    this.refreshView();
    this.mendUp(delta);

    this.temptSwans();
    this.birdScraps(delta);

    const crowd = this.people.map((person) => person.getPosition());
    for (const swan of this.swans) {
      swan.noticeCrowd(crowd);
      swan.update(delta, this.camera.position);
      if (swan.shouldDrop()) this.addDropping(swan.getPosition().clone());
      if (swan.wantsStrike()) this.takeStrike(swan.getPosition());
    }

    for (const person of this.people) {
      if (person.wantsSwing()) this.takeStrike(person.getPosition());
    }

    if (this.hurtLeft > 0) {
      this.hurtLeft = Math.max(0, this.hurtLeft - delta);
      if (this.hurtLeft === 0) this.hurtFlash.classList.remove("on");
    }
    if (this.faceWetLeft > 0) {
      this.faceWetLeft = Math.max(0, this.faceWetLeft - delta);
      if (this.faceWetLeft === 0) this.faceDirty = false;
    }
    const mess = this.droppings
      .filter((dropping) => !dropping.isRinsing())
      .map((dropping) => dropping.getPosition());
    this.updatePeople(delta, mess);

    this.elapsed += delta;
    bobPedalos(this.elapsed);
    this.updateDroppings(delta);
    this.puddles.update(delta, this.dayCycle.skyState().sunPosition);
    this.updateLitter(delta);
    this.updateFootprints(delta);
    this.updatePlanes(delta);
    this.updateDucks(delta);
    // One list of what's going, shared by everything that fancies a bit of it.
    const scraps = this.foodOnTheGround();
    this.updateGulls(delta, scraps);
    this.updateSquirrels(delta, scraps);
    this.updateBins(delta);
    this.updateGraffiti(delta);
    this.updateBranchKids(delta);
    this.watchForAttacks();
    this.watchTheState();
    this.callouts.update(delta);
    this.messages.update(delta);
    this.updateCyclists(delta, mess);
    this.updateBoats(delta);
    this.updateCrabbers(delta);
    this.updateBbqs(delta);
    this.updatePlayVisits(delta);
    this.updateFlock(delta);
    this.updateNight(delta);

    this.updateCleanliness(delta);
    this.tickCombo(delta);
    this.applyTimeAndWeather(delta);

    this.miniMap.update(delta, {
      player: this.camera.position,
      heading: this.player.getHeading(),
      swans: this.swans
        .filter((swan) => swan.kind === "adult")
        .map((swan) => swan.getPosition()),
      cygnets: this.swans
        .filter((swan) => swan.kind === "cygnet")
        .map((swan) => swan.getPosition()),
      people: [
        ...this.people.map((person) => person.getPosition()),
        ...this.bbqs.flatMap((party) => party.guestPositions()),
        ...this.playVisits.flatMap((visit) => visit.guestPositions()),
      ],
      cyclists: this.cyclists.map((rider) => rider.getPosition()),
      scooters: this.scooters.map((scooter) => scooter.getPosition()),
      boats: this.boats.map((boat) => boat.getPosition()),
      fox: this.fox?.getPosition() ?? null,
      droppings: this.droppings
        .filter((dropping) => !dropping.isRinsing())
        .map((dropping) => dropping.getPosition()),
      litter: this.litter.map((piece) => piece.getPosition()),
      birds: [
        ...this.ducks.map((duck) => duck.getPosition()),
        ...this.gulls.map((gull) => gull.getPosition()),
      ],
      squirrels: this.squirrels
        .filter((squirrel) => !squirrel.isHidden())
        .map((squirrel) => squirrel.getPosition()),
    });
    this.mugshot.update(delta, {
      cleanliness: this.cleanliness,
      spraying: this.player.isHosing(),
      raining: this.weather.isWet(),
      hurt: this.hurtLeft > 0,
      health: this.health / HEALTH_MAX,
      swanLook: this.swanInEyeline(),
      faceWet: this.faceWetLeft > 0,
      faceDirty: this.faceDirty && this.faceWetLeft > 0,
    });
    this.objectiveArrow.update(
      this.camera,
      this.camera.position,
      this.player.getHeading(),
      this.objectiveSpots(),
      delta,
    );

    this.renderer.render(this.scene, this.camera);
  };

  /** Everything still dirty that the arrow might point at. */
  private objectiveSpots(): { x: number; z: number }[] {
    const spots: { x: number; z: number }[] = [];
    for (const dropping of this.droppings) {
      if (dropping.isRinsing()) continue;
      const at = dropping.getPosition();
      spots.push({ x: at.x, z: at.z });
    }
    for (const piece of this.litter) {
      if (piece.isTaken()) continue;
      const at = piece.getPosition();
      spots.push({ x: at.x, z: at.z });
    }
    for (const tag of this.graffiti) {
      if (tag.isClean()) continue;
      const at = tag.getPosition();
      spots.push({ x: at.x, z: at.z });
    }
    for (const print of this.footprints) {
      if (print.isGone()) continue;
      const at = print.getPosition();
      spots.push({ x: at.x, z: at.z });
    }
    for (const bin of this.bins) {
      if (!bin.isFull()) continue;
      const at = bin.getPosition();
      spots.push({ x: at.x, z: at.z });
    }
    return spots;
  }

  /**
   * How far a swan sits off to the side of the view, or null if none are
   * close enough to bother watching.
   */
  private swanInEyeline(): number | null {
    const at = this.camera.position;
    const yaw = this.player.getHeading();
    let nearest: THREE.Vector3 | null = null;
    let closest = 14;
    for (const swan of this.swans) {
      if (swan.hasLeft()) continue;
      const spot = swan.getPosition();
      const gap = Math.hypot(spot.x - at.x, spot.z - at.z);
      if (gap >= closest) continue;
      closest = gap;
      nearest = spot;
    }
    if (!nearest) return null;

    const dx = nearest.x - at.x;
    const dz = nearest.z - at.z;
    // Camera local +X after a Yaw spin — positive is the player's right.
    const right = dx * Math.cos(yaw) + dz * -Math.sin(yaw);
    return THREE.MathUtils.clamp(right / 5.5, -1, 1);
  }

  public start(): void {
    this.animate();
  }

  /**
   * Park the simulation (mobile portrait). No updates, no render — the rotate
   * prompt covers the screen instead.
   */
  public setFrozen(on: boolean): void {
    if (this.frozen === on) return;
    this.frozen = on;
    document.body.classList.toggle("world-frozen", on);
    if (!on) {
      this.clock.getDelta();
      this.onWindowResize();
    }
  }

  public isFrozen(): boolean {
    return this.frozen;
  }
}
