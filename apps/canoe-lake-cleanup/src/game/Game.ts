import * as THREE from "three";
import { Player, type Tool } from "./Player";
import { Swan, setSwanFeederRush } from "./entities/Swan";
import { Person, setFeederRush } from "./entities/Person";
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
import { Helicopter } from "./entities/Helicopter";
import { Graffiti } from "./entities/Graffiti";
import { Drunks, drunkSpots } from "./entities/Drunks";
import { RebelRaid } from "./entities/RebelRaid";
import { BoyRacers } from "./entities/BoyRacers";
import { StolenSwanboat } from "./entities/StolenSwanboat";
import { Scooter } from "./entities/Scooter";
import { TrafficCar } from "./entities/TrafficCar";
import { RcBoat } from "./entities/RcBoat";
import { Crabber } from "./entities/Crabber";
import { Boatman } from "./entities/Boatman";
import { Gardener } from "./entities/Gardener";
import { PedaloHire } from "./entities/PedaloHire";
import { BbqParty, lawnGatherSpots } from "./entities/BbqParty";
import { Picnic } from "./entities/Picnic";
import { Gazebo } from "./entities/Gazebo";
import { BenchSit, type BenchPastime } from "./entities/BenchSit";
import { PlayVisit, canVisitPlayPark } from "./entities/PlayVisit";
import { FootballKickabout } from "./entities/FootballKickabout";
import { Fox } from "./entities/Fox";
import { Puddles } from "./effects/Puddles";
import { GrassFire } from "./effects/GrassFire";
import {
  PATH_LOOP,
  PATH_INNER,
  PATH_OUTER,
  WATER_Y,
  buildGround,
  buildLake,
  buildPaths,
  distanceToShore,
  isInLake,
  loopPoint,
  nearestShore,
  offsetShore,
  clearOfLakeRim,
  pickNorthwestPathIndex,
  waterSpot,
  type LakeSurface,
} from "./world/lake";
import { setWalkCrowd } from "./world/blocking";
import { buildElevation, groundHeight } from "./world/terrain";
import { ShiftIntro } from "./systems/ShiftIntro";
import { HeavyHoseIntro } from "./systems/HeavyHoseIntro";
import {
  buildCleanerVan,
  getCleanerVanPose,
  nearHeavyHosePickup,
  setRearDoorsOpen,
  vanSpotWorld,
} from "./world/cleanerVan";
import { getMission, getMissionSpot, missionWindowOpen } from "./world/missions";
import { GooseFlock } from "./entities/GooseFlock";
import { parkAudio } from "./audio/ParkAudio";
import { readDebugBoot, type DebugFrom } from "../level/debugBoot";
import { placeBench, clearSitterBenches, sitterBenchSeats } from "./world/bench";
import { plantTrees, updateTrees, updateFlowerBeds, sprayFlowerBed, flowerBeds } from "./world/trees";
import { buildSurrounds, lightWindows } from "./world/buildings";
import { buildFairyLights, lightFairyBulbs, fairyLightSections } from "./world/fairyLights";
import { WireBird, roostPerchesNear, roostPerchesNorth } from "./entities/WireBird";
import { buildFencing, parkGates } from "./world/fence";
import {
  buildParkBuildings,
  bobPedalos,
  binStations,
  taggableWalls,
  atParkBuilding,
  sprayPedalo,
  isPedaloHired,
  hiredPedaloHull,
  freePedaloCount,
  hatchQueueSpot,
  setPedaloChop,
  consumePedaloWreck,
  getRoseGarden,
} from "./world/park";
import { DayCycle } from "./systems/DayCycle";
import { Weather } from "./systems/Weather";
import { Sun } from "./systems/Sun";
import { MiniMap } from "./ui/MiniMap";
import { Mugshot } from "./ui/Mugshot";
import { Messages } from "./ui/Messages";
import { ObjectiveArrow } from "./ui/ObjectiveArrow";
import { MissionBanner } from "./ui/MissionBanner";
import { Compass } from "./ui/Compass";
import { Callouts } from "./systems/Callouts";
import { MISSION_LABELS, missionClockHour, type MissionId } from "../level/missions";

const WASH_RADIUS = 1.28;
/**
 * Overnight tip: thick layered heaps spaced along the lake edge by the van —
 * the first wash job when you clock on.
 */
const OVERNIGHT_HEAPS_MIN = 6;
const OVERNIGHT_HEAPS_MAX = 9;
/** Deposits stacked into each overnight heap. */
const OVERNIGHT_LAYERS_MIN = 4;
const OVERNIGHT_LAYERS_MAX = 8;
/** Fraction of the shoreline arc (centred on the start) used for the tip. */
const OVERNIGHT_ARC_FRAC = 0.38;
/** Second wave kicks in once this fraction of overnight piles is washed. */
const OPENING_CLEAR_FRAC = 0.8;
/** How long the NW feeder rush runs after the opening tip is cleared. */
const FEEDER_RUSH_FOR = 150;
/** Pigeons bunched on the two fairy-light spans nearest the feeders. */
const PIGEON_FLOCK = 18;
/** Pedalo bird kills before a revenge V-formation flies in. */
const BIRD_KILL_REVENGE = 4;
const REVENGE_FLOCK = 7;
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
const MAX_TRAFFIC = 9;
const MAX_BOATS = 2;
const MAX_CRABBERS = 6;
const MAX_PEDALO_HIRES = 2;
const MAX_BBQS = 2;
const MAX_PICNICS = 3;
const MAX_GAZEBOS = 2;
const MAX_BENCH_SITS = 8;
const MAX_PLAY_VISITS = 3;
const MAX_FOOTBALL = 1;
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
  private traffic: TrafficCar[] = [];
  private nextTraffic = 3 + Math.random() * 6;
  private boats: RcBoat[] = [];
  private nextBoat = 70 + Math.random() * 50;
  private crabbers: Crabber[] = [];
  private nextCrabber = 55 + Math.random() * 50;
  private boatman: Boatman | null = null;
  private gardener: Gardener | null = null;
  private pedaloHires: PedaloHire[] = [];
  private nextPedaloHire = 25 + Math.random() * 35;
  private bbqs: BbqParty[] = [];
  private nextBbq = 18 + Math.random() * 28;
  private picnics: Picnic[] = [];
  private nextPicnic = 10 + Math.random() * 22;
  private gazebos: Gazebo[] = [];
  private nextGazebo = 110 + Math.random() * 100;
  private benchSits: BenchSit[] = [];
  private nextBenchSit = 8 + Math.random() * 14;
  /** Late-shift grass fire from a disposable BBQ — one per day at most. */
  private grassFire: GrassFire | null = null;
  private fireMissionDone = false;
  private fireComplaint = false;
  private playVisits: PlayVisit[] = [];
  private nextPlayVisit = 35 + Math.random() * 40;
  private football: FootballKickabout[] = [];
  private nextFootball = 18 + Math.random() * 28;
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
  /** First look-up after a bit of morning; later gaps are longer once one's been. */
  private nextSpitfire = 120 + Math.random() * 180;
  private helicopters: Helicopter[] = [];
  private nextHelicopter = 90 + Math.random() * 140;
  private bins: Bin[] = [];
  private graffiti: Graffiti[] = [];
  private nextTag = 120 + Math.random() * 180;
  private drunks: Drunks[] = [];
  private nextDrunks = 70 + Math.random() * 90;

  /** Final shift job — Gosport lot coming over the esplanade at 01:00. */
  private rebelRaid: RebelRaid | null = null;
  private rebelMissionStarted = false;
  private rebelMissionWon = false;
  /** Previous frame hour for mission-window edge detection (−1 = unset). */
  private rebelHourWas = -1;

  /** 10pm — Skylines thrashing the esplanade, then one in the lake. */
  private boyRacers: BoyRacers | null = null;
  private racerMissionStarted = false;
  private racerMissionDone = false;
  private racerHourWas = -1;
  private rebelBriefing: { wait: number; from: string; text: string }[] = [];

  /** Afternoon — lads nick a swan pedalo; chase and sink by hose. */
  private stolenSwanboat: StolenSwanboat | null = null;
  private swanboatMissionStarted = false;
  private swanboatMissionDone = false;
  private swanboatHourWas = -1;

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
  private missionArrow: ObjectiveArrow;
  private missionBanner: MissionBanner;
  private compass: Compass;
  private messages: Messages;
  private callouts: Callouts;
  private shiftIntro: ShiftIntro | null = null;
  private heavyHoseIntro: HeavyHoseIntro | null = null;

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
  /** Debounce the hiss when the lance is on the grass fire. */
  private fireSteamCool = 0;

  /** Opening piles seeded at clock-on; clearing them unlocks the second event. */
  private overnightPiles = new Set<Dropping>();
  /** Alternates left/right boot when the player walks through a mess lump. */
  private playerFoot = 1;
  private overnightTotal = 0;
  private overnightCleared = 0;
  private secondEventDone = false;
  /** NW feeders radio mission — birds lay the next mess, nothing teleports in. */
  private feederRushLeft = 0;
  private feederTip: { x: number; z: number } | null = null;
  private wireBirds: WireBird[] = [];
  private birdKills = 0;
  private revengeDone = false;
  private picnicRaidActive = false;
  private picnicRaidDone = false;
  private picnicRaidTip: { x: number; z: number } | null = null;
  private picnicRaidLeft = 0;
  /** Seconds with no divers — mission clears after a short hold. */
  private picnicRaidClear = 0;
  /** Mission 4 — radar geese inbound; heavy hose from the van. */
  private gooseMissionPending = 0;
  private gooseMissionStarted = false;
  private gooseMissionDone = false;
  private gooseHeavyArmed = false;
  private gooseFlock: GooseFlock | null = null;
  private rearDoorOpen = 0;

  /** Mission 7 — pigeons perching on wires at the north end. */
  private pigeonMissionStarted = false;
  private pigeonMissionDone = false;
  private pigeonMissionBirds: WireBird[] = [];
  private pigeonHourWas = -1;

  private health = HEALTH_MAX;
  private sincePecked = HEAL_DELAY;
  private dead = false;
  /** Mobile portrait — world must not tick or draw. */
  private frozen = false;
  /** Player pause — sim stopped, last frame still drawn under the overlay. */
  private paused = false;
  /**
   * Shift hasn't started until the van intro hands off to first person.
   */
  private onDuty = false;

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
  private pressurePanel: HTMLElement;
  private pressureFill: HTMLElement;
  private pressurePct: HTMLElement;
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
      2500,
    );
    // Temporary — seated in the van once the scene is built.
    this.camera.position.set(0, 1.7, 40);
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
    // Level / editor map are N-up with east on the right. A Three.js camera
    // looking down −Z puts +X on the viewer's right, which mirrors east/west
    // when you face north. Flip only the WebGL view so FP matches the map;
    // simulation coords stay unflipped (minimap, collisions, editor).
    this.renderer.domElement.style.transform = "scaleX(-1)";

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
    this.pressurePanel = document.getElementById("pressure-panel")!;
    this.pressureFill = document.getElementById("pressure-fill")!;
    this.pressurePct = document.getElementById("pressure-pct")!;
    this.gameOverPanel = document.getElementById("game-over")!;
    this.gameOverDetail = document.getElementById("game-over-detail")!;
    this.instructionsElement = document.getElementById("instructions")!;
    this.showTool(null);
    document
      .getElementById("restart")!
      .addEventListener("click", () => window.location.reload());
    document
      .getElementById("pause-btn")!
      .addEventListener("click", (event) => {
        event.stopPropagation();
        this.setPaused(true);
      });
    document
      .getElementById("resume")!
      .addEventListener("click", (event) => {
        event.stopPropagation();
        this.setPaused(false);
      });

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
      "mess",
    );
    this.missionArrow = new ObjectiveArrow(
      document.getElementById("mission-arrow")!,
      "mission",
    );
    this.missionBanner = new MissionBanner(
      document.getElementById("mission-banner")!,
    );
    this.compass = new Compass(document.getElementById("compass")!);

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
    // Shift text waits until the intro reaches the path.
    this.callouts.lockTrouble();
    const debug = readDebugBoot();
    if (debug) {
      this.shiftIntro = null;
      this.applyDebugBoot(debug.from);
      this.wireIntroAudio();
      document.body.classList.add("debug-boot");
    } else {
      this.shiftIntro = new ShiftIntro(this.scene, this.camera);
      if (this.shiftIntro.start()) {
        this.player.beginIntro();
        this.showTool(null);
        this.wireIntroAudio();
      } else {
        this.shiftIntro = null;
        this.forceClockOn();
        this.wireIntroAudio();
      }
    }

    this.onWindowResize();
    window.addEventListener("resize", () => this.onWindowResize());
    window.visualViewport?.addEventListener("resize", () => this.onWindowResize());
  }

  private setupScene(): void {
    buildGround(this.scene, 560);
    buildElevation(this.scene);
    this.lake = buildLake(this.scene);
    buildPaths(this.scene);
    buildSurrounds(this.scene);
    buildFairyLights(this.scene);
    buildFencing(this.scene);
    buildParkBuildings(this.scene);
    buildCleanerVan(this.scene);
    // After buildings so south-wind lean can see footprints as shelter.
    plantTrees(this.scene);
    this.boatman = new Boatman(this.scene);
    this.gardener = flowerBeds().length > 0 ? new Gardener(this.scene) : null;
    this.buildLandmarks();
  }

  private buildLandmarks(): void {
    // Benches sit along the outer edge of the path, backs out, facing the water.
    clearSitterBenches();
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

      const yaw = Math.atan2(facing.x, facing.y);
      placeBench(this.scene, spot.x, spot.y, yaw, { sitters: true });
    }

    this.placeRoseGardenBenches();
  }

  /** Iron benches round the rose hedge, facing the beds — for the older lot. */
  private placeRoseGardenBenches(): void {
    const rose = getRoseGarden();
    if (!rose) return;
    const cos = Math.cos(rose.yaw);
    const sin = Math.sin(rose.yaw);
    const ox = rose.halfW + 2.1;
    const oz = rose.halfD + 2.1;
    const slots: { lx: number; lz: number; fx: number; fz: number }[] = [
      { lx: -14, lz: oz, fx: 0, fz: -1 },
      { lx: -5, lz: oz, fx: 0, fz: -1 },
      { lx: 5, lz: oz, fx: 0, fz: -1 },
      { lx: 14, lz: oz, fx: 0, fz: -1 },
      { lx: -14, lz: -oz, fx: 0, fz: 1 },
      { lx: -5, lz: -oz, fx: 0, fz: 1 },
      { lx: 5, lz: -oz, fx: 0, fz: 1 },
      { lx: 14, lz: -oz, fx: 0, fz: 1 },
      { lx: ox, lz: -10, fx: -1, fz: 0 },
      { lx: ox, lz: 0, fx: -1, fz: 0 },
      { lx: ox, lz: 10, fx: -1, fz: 0 },
      { lx: -ox, lz: -10, fx: 1, fz: 0 },
      { lx: -ox, lz: 0, fx: 1, fz: 0 },
      { lx: -ox, lz: 10, fx: 1, fz: 0 },
    ];
    for (const slot of slots) {
      const x = rose.x + slot.lx * cos + slot.lz * sin;
      const z = rose.z - slot.lx * sin + slot.lz * cos;
      const fx = slot.fx * cos + slot.fz * sin;
      const fz = -slot.fx * sin + slot.fz * cos;
      const yaw = Math.atan2(fx, fz);
      placeBench(this.scene, x, z, yaw, { sitters: true, crowd: "elder" });
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
    this.weather.setRainAllowed(this.rainUnlocked());
    this.weather.update(delta, sky);
    updateTrees(this.elapsed, this.weather.getWind());
    updateFlowerBeds(delta);

    const gloom = this.weather.gloom;
    this.ambientLight.intensity = sky.ambient * (1 - gloom * 0.4);
    // Only a hint of the sky's colour, or dawn turns the grass brown.
    this.ambientLight.color.copy(sky.sky).lerp(new THREE.Color(0xffffff), 0.78);
    this.sunLight.intensity = sky.sun * (1 - gloom);
    this.sunLight.color.copy(sky.sunColor);
    this.sunLight.position.copy(sky.sunPosition);
    // Soft shadows look wrong under cloud; fade them out with the sun.
    this.sunLight.castShadow = this.sunLight.intensity > 0.2;
    this.sun.update(sky, gloom, this.camera, delta);
    this.lake.update(delta, sky.sunPosition, sky.sunColor, this.weather.getWind());
    // Lights come on across the seafront as the daylight goes.
    lightWindows(THREE.MathUtils.clamp(1 - sky.sun / 0.45, 0, 1));
    lightFairyBulbs(THREE.MathUtils.clamp(1 - sky.sun / 0.45, 0, 1));
  }

  /**
   * Keep the shift dry through picnic + grass fire so hose jobs read clearly.
   * Once both are cleared (or their windows have closed), weather may rain.
   */
  private rainUnlocked(): boolean {
    const hour = this.dayCycle.hour;
    const picnicOk =
      (this.picnicRaidDone && !this.picnicRaidActive) ||
      this.missionWindowEnded("picnic", hour);
    const fireOk =
      this.fireMissionDone ||
      (!this.grassFire && this.missionWindowEnded("fire", hour));
    return picnicOk && fireOk;
  }

  /** True once the mission start window has fully closed for this shift hour. */
  private missionWindowEnded(id: MissionId, hour: number): boolean {
    if (missionWindowOpen(id, hour)) return false;
    const m = getMission(id);
    const start = missionClockHour(m.start);
    const end = missionClockHour(m.end);
    if (start < end) return hour >= end;
    // Wrapped window (e.g. overnight): ended while in the closed gap.
    return hour >= end && hour < start;
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
  private updatePeople(delta: number, piles: readonly Dropping[]): void {
    const { target, gap } = this.crowdWanted();
    const mess = piles.map((pile) => pile.getPosition());

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
      const stepped = person.update(
        delta,
        mess,
        this.camera.position,
        this.weather.isWet(),
      );
      if (stepped >= 0) {
        const pile = piles[stepped]!;
        person.soilFromMess(pile.moundHeight());
        this.logComplaint(
          pile,
          person.getPosition(),
          person.getHeading(),
        );
      }

      const scattered = person.claimScatter();
      if (scattered) this.bread.push(new Bread(this.scene, scattered));

      const dropped = person.claimLitter();
      if (dropped && this.litter.length < 14) {
        this.litter.push(new Litter(this.scene, dropped));
      }

      const cone = person.claimConeDrop();
      if (cone && this.litter.length < 14) {
        this.litter.push(new Litter(this.scene, cone, "cone"));
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
      if (splash) {
        this.bigSplash(splash);
        this.callouts.raise("dunk", this.dayCycle.clockFace(), {
          x: splash.x,
          z: splash.z,
        });
      }

      const dog = person.getDog();
      if (dog) {
        dog.update(delta, {
          swans: this.swans,
          people: this.people,
          player: this.camera.position,
        });
        for (let n = dog.claimTrouble(); n > 0; n--) this.complain();
        const bite = dog.claimBite();
        if (bite) this.takeStrike(bite);
      }

      if (person.isGone()) {
        person.dispose();
        this.people.splice(i, 1);
      }
    }
  }

  public addDropping(position: THREE.Vector3, kind: DropKind = "swan"): Dropping | null {
    // Keep piles off the coping — under the kerb they vanish into the rim.
    const safe = clearOfLakeRim(position.x, position.z);
    const at = position.clone().set(safe.x, position.y, safe.y);

    // Stack onto an existing pile rather than peppering the same square.
    let nearest: Dropping | null = null;
    let best = MERGE_RADIUS * MERGE_RADIUS;
    for (const pile of this.droppings) {
      const here = pile.getPosition();
      const dx = here.x - at.x;
      const dz = here.z - at.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < best) {
        best = d2;
        nearest = pile;
      }
    }
    if (nearest) {
      nearest.addLayer(kind);
      return nearest;
    }

    if (this.droppings.length >= MAX_PILES) return null;
    const pile = new Dropping(at, this.scene, kind);
    this.droppings.push(pile);
    return pile;
  }

  /**
   * First-thing mess: thick layered heaps spaced along the lake rim near the
   * van / clock-on — ring the nearby edge, not a NW carpet.
   */
  private seedOvernightMess(): void {
    const rim = offsetShore((PATH_INNER + PATH_OUTER) / 2);
    if (rim.length === 0) {
      this.overnightTotal = 0;
      return;
    }

    const heaps =
      OVERNIGHT_HEAPS_MIN +
      Math.floor(
        Math.random() * (OVERNIGHT_HEAPS_MAX - OVERNIGHT_HEAPS_MIN + 1),
      );

    const start = this.openingStartXZ();
    let closest = 0;
    let best = Infinity;
    for (let i = 0; i < rim.length; i++) {
      const p = rim[i]!;
      const d = (p.x - start.x) ** 2 + (p.y - start.z) ** 2;
      if (d >= best) continue;
      best = d;
      closest = i;
    }

    // Even spacing along an arc of the shoreline centred on the start.
    const arc = Math.max(
      heaps * 3,
      Math.floor(rim.length * OVERNIGHT_ARC_FRAC),
    );

    for (let i = 0; i < heaps; i++) {
      const t = (i + 0.5) / heaps;
      const along = Math.floor((t - 0.5) * arc);
      const idx = (closest + along + rim.length * 4) % rim.length;
      const centre = rim[idx]!;
      // Nudge onto the paving and jitter along the rim so heaps don't line up.
      const jitter = (Math.random() - 0.5) * 1.4;
      const neighbour = rim[(idx + 1) % rim.length]!;
      const tx = neighbour.x - centre.x;
      const tz = neighbour.y - centre.y;
      const len = Math.hypot(tx, tz) || 1;
      let x = centre.x + (tx / len) * jitter;
      let z = centre.y + (tz / len) * jitter;
      const safe = clearOfLakeRim(x, z, 1.5);
      x = safe.x;
      z = safe.y;
      if (isInLake(x, z)) continue;

      const layers =
        OVERNIGHT_LAYERS_MIN +
        Math.floor(
          Math.random() * (OVERNIGHT_LAYERS_MAX - OVERNIGHT_LAYERS_MIN + 1),
        );
      const kind: DropKind = Math.random() < 0.1 ? "gull" : "swan";
      const pile = this.seedHeap(x, z, layers, kind);
      if (pile) {
        pile.reshape(0.3, 1.3);
        this.overnightPiles.add(pile);
      }
    }

    this.overnightTotal = this.overnightPiles.size;
  }

  /** Van / path drop-off — where the shift starts. */
  private openingStartXZ(): { x: number; z: number } {
    const pose = getCleanerVanPose();
    if (pose) return { x: pose.pathX, z: pose.pathZ };
    const van = vanSpotWorld();
    if (van) return van;
    if (PATH_LOOP.length > 0) {
      const p = PATH_LOOP[0]!;
      return { x: p.x, z: p.y };
    }
    return { x: 0, z: 0 };
  }

  /**
   * Lay several deposits on nearly the same spot so they merge into one thick
   * pile rather than a scatter of thin pads.
   */
  private seedHeap(
    x: number,
    z: number,
    layers: number,
    kind: DropKind = "swan",
  ): Dropping | null {
    let pile: Dropping | null = null;
    for (let i = 0; i < layers; i++) {
      const jitter = 0.04 + Math.random() * 0.32;
      const angle = Math.random() * Math.PI * 2;
      const drop = this.addDropping(
        new THREE.Vector3(
          x + Math.cos(angle) * jitter,
          0,
          z + Math.sin(angle) * jitter,
        ),
        kind,
      );
      if (drop) pile = drop;
    }
    return pile;
  }

  /** Rough centre of the opening tip — for the first direction arrow. */
  private overnightTip(): { x: number; z: number } | undefined {
    if (this.overnightPiles.size === 0) return undefined;
    let x = 0;
    let z = 0;
    for (const pile of this.overnightPiles) {
      const at = pile.getPosition();
      x += at.x;
      z += at.z;
    }
    const n = this.overnightPiles.size;
    return { x: x / n, z: z / n };
  }

  /** Counts an overnight pile washed clear; at 80% the second event starts. */
  private noteOvernightCleared(pile: Dropping): void {
    if (!this.overnightPiles.delete(pile)) return;
    this.overnightCleared += 1;
    if (this.secondEventDone || this.overnightTotal === 0) return;
    if (this.overnightCleared / this.overnightTotal < OPENING_CLEAR_FRAC) {
      return;
    }
    this.startSecondEvent();
  }

  /**
   * Opening tip is mostly done — unlock the rest of the shift and radio the
   * NW feeder rush. Mess from here on is laid by birds (path feeders + fairy
   * light gulls / pigeons), not spawned in.
   */
  private startSecondEvent(): void {
    if (this.secondEventDone) return;
    this.secondEventDone = true;
    this.callouts.unlockTrouble();

    const tip =
      PATH_LOOP.length > 0
        ? PATH_LOOP[pickNorthwestPathIndex()]!
        : new THREE.Vector2(-40, 40);
    const marked = { x: tip.x, z: tip.y };
    this.feederTip = marked;

    this.feederRushLeft = FEEDER_RUSH_FOR;
    setFeederRush(true);
    setSwanFeederRush(true);
    this.spawnWireBirds();

    // People already on the stretch get long bags so the pigeons have targets.
    for (const person of this.people) {
      if (person.isGone()) continue;
      const at = person.getPosition();
      if (Math.hypot(at.x - marked.x, at.z - marked.z) > 55) continue;
      person.stockForFeederRush();
    }

    // Pull circling gulls over the feeding stretch and top the flock up.
    for (const gull of this.gulls) {
      if (Math.random() < 0.75) gull.watchOver(tip.x, tip.y);
    }
    while (this.gulls.length < Math.min(GULL_LIMIT, 5)) {
      this.gulls.push(new Gull(this.scene, new THREE.Vector2(tip.x, tip.y)));
    }

    this.callouts.raise("jobs", this.dayCycle.clockFace(), marked);
  }

  private spawnWireBirds(): void {
    const tip = this.feederTip ?? { x: -40, z: 40 };
    const roost = roostPerchesNear(tip, PIGEON_FLOCK, fairyLightSections());
    if (roost.length === 0) return;
    for (let i = 0; i < roost.length; i++) {
      this.wireBirds.push(new WireBird(this.scene, roost[i]!, i));
    }
  }

  private updateFeederRush(delta: number): void {
    if (this.feederRushLeft <= 0 && this.wireBirds.length === 0) return;

    if (this.feederRushLeft > 0) {
      this.feederRushLeft -= delta;
      if (this.feederRushLeft <= 0) {
        setFeederRush(false);
        setSwanFeederRush(false);
        for (const bird of this.wireBirds) bird.flush();
        if (!this.picnicRaidDone) this.startPicnicRaid();
      } else {
        if (this.feederTip && Math.random() < delta * 0.12) {
          for (const gull of this.gulls) {
            if (Math.random() < 0.35) {
              gull.watchOver(this.feederTip.x, this.feederTip.z);
            }
          }
        }
        this.dispatchPigeonSwoops();
      }
    }

    for (let i = this.wireBirds.length - 1; i >= 0; i--) {
      const bird = this.wireBirds[i]!;
      bird.update(delta);
      const drop = bird.claimDrop();
      if (drop && !isInLake(drop.x, drop.z)) {
        this.addDropping(drop, "gull");
      }
      if (bird.isGone()) {
        bird.dispose();
        this.wireBirds.splice(i, 1);
      }
    }
  }

  /** Perched pigeons dive on nearby bread / bag-feeders, then home to the wire. */
  private dispatchPigeonSwoops(): void {
    const hungry = this.wireBirds.filter((b) => b.wantsFood());
    if (hungry.length === 0) return;

    const foods: THREE.Vector3[] = [];
    for (const pile of this.bread) {
      foods.push(pile.getPosition());
    }
    for (const person of this.people) {
      if (person.hasFood()) foods.push(person.getPosition());
    }
    for (const lot of this.benchSits) {
      if (lot.hasFood()) foods.push(lot.getFeederPosition());
    }
    if (foods.length === 0 && this.feederTip) {
      // No scrap out yet — still dive the feeding stretch so the flock works.
      foods.push(
        new THREE.Vector3(
          this.feederTip.x + (Math.random() - 0.5) * 6,
          0,
          this.feederTip.z + (Math.random() - 0.5) * 6,
        ),
      );
    }
    if (foods.length === 0) return;

    for (const bird of hungry) {
      if (Math.random() > 0.35) continue;
      const home = bird.homePerch();
      let best = foods[0]!;
      let bestD = Infinity;
      for (const food of foods) {
        const d =
          (food.x - home.x) * (food.x - home.x) +
          (food.z - home.z) * (food.z - home.z);
        if (d < bestD) {
          bestD = d;
          best = food;
        }
      }
      // Stay local to the feeder stretch / roost.
      if (bestD > 55 * 55) continue;
      bird.swoopTo(best);
    }
  }

  /**
   * Mission 3 — herring gulls diving a picnic on the east green. Hose them
   * out of the sky before they strip the blanket.
   */
  private startPicnicRaid(): void {
    if (this.picnicRaidDone || this.picnicRaidActive) return;
    if (!missionWindowOpen("picnic", this.dayCycle.hour)) return;
    this.picnicRaidActive = true;
    this.picnicRaidDone = true;
    this.picnicRaidLeft = 160;
    this.picnicRaidClear = 0;

    const prefer = getMissionSpot("picnic");
    const preferAt = new THREE.Vector3(prefer.x, 0, prefer.z);
    let picnic = this.picnics
      .filter((p) => p.isRaidable())
      .sort(
        (a, b) =>
          a.getPosition().distanceTo(preferAt) -
          b.getPosition().distanceTo(preferAt),
      )[0];
    if (!picnic) {
      const spot = this.freeLawnGatherSpotNear(prefer.x, prefer.z, 16);
      if (spot) {
        picnic = new Picnic(this.scene, spot);
        this.picnics.push(picnic);
      }
    }
    const at =
      picnic?.getPosition() ?? new THREE.Vector3(prefer.x, 0, prefer.z);
    this.picnicRaidTip = { x: at.x, z: at.z };

    while (this.gulls.length < Math.min(GULL_LIMIT + 4, 10)) {
      this.gulls.push(new Gull(this.scene, new THREE.Vector2(at.x, at.z)));
    }
    for (const gull of this.gulls) {
      gull.watchOver(at.x, at.z);
      if (Math.random() < 0.75) {
        gull.raidPicnic(at, () => picnic?.noticeRaid());
      }
    }

    this.callouts.raise("picnic", this.dayCycle.clockFace(), this.picnicRaidTip);
    this.announceMission("picnic");
  }

  private updatePicnicRaid(delta: number): void {
    // Feeder may finish outside the picnic window — start once the clock opens.
    if (
      !this.picnicRaidDone &&
      !this.picnicRaidActive &&
      this.secondEventDone &&
      this.feederRushLeft <= 0 &&
      missionWindowOpen("picnic", this.dayCycle.hour)
    ) {
      this.startPicnicRaid();
    }
    if (!this.picnicRaidActive) return;
    this.picnicRaidLeft -= delta;

    const tip = this.picnicRaidTip;
    // Prefer a raidable blanket; fall back to nearest picnic on the tip.
    let picnic = this.picnics.find((p) => p.isRaidable());
    if (!picnic && tip) {
      picnic = this.picnics
        .filter((p) => !p.isDone())
        .sort(
          (a, b) =>
            a.getPosition().distanceTo(new THREE.Vector3(tip.x, 0, tip.z)) -
            b.getPosition().distanceTo(new THREE.Vector3(tip.x, 0, tip.z)),
        )[0];
    }
    if (tip && picnic) {
      const at = picnic.getPosition();
      this.picnicRaidTip = { x: at.x, z: at.z };
      for (const gull of this.gulls) {
        if (gull.isGone()) continue;
        if (Math.random() < delta * 0.45) {
          gull.raidPicnic(at, () => picnic!.noticeRaid());
        }
        // Bomb the blanket while circling / stooping — classic picnic ruin.
        this.maybePicnicGullDrop(gull, at, delta);
      }
    }

    // Cleared once divers stay clear for a beat (or the tip times out) —
    // don't end the frame you hose one bird while others are still circling.
    const diving = this.gulls.filter(
      (g) => !g.isGone() && (g.isAground() || g.isRaiding()),
    ).length;
    if (diving === 0) this.picnicRaidClear += delta;
    else this.picnicRaidClear = 0;

    if (
      this.picnicRaidLeft <= 0 ||
      (this.picnicRaidClear > 2.5 && this.picnicRaidLeft < 140)
    ) {
      this.picnicRaidActive = false;
      this.picnicRaidTip = null;
      this.picnicRaidClear = 0;
      if (!this.gooseMissionStarted && !this.gooseMissionDone) {
        this.gooseMissionPending = 12;
      }
    }
  }

  /** Herring gulls empty over the picnic while they work it. */
  private maybePicnicGullDrop(
    gull: Gull,
    picnicAt: THREE.Vector3,
    delta: number,
  ): void {
    const gp = gull.getPosition();
    const gap = Math.hypot(gp.x - picnicAt.x, gp.z - picnicAt.z);
    if (gap > 28) return;

    let rate = 0;
    if (gull.isAground()) rate = 1.1;
    else if (gull.isRaiding()) rate = 0.55;
    else if (gap < 16) rate = 0.18;
    if (rate <= 0 || Math.random() >= delta * rate) return;

    // Land under / toward the blanket so the mess piles on the picnic.
    const pull = gull.isAground() ? 0.15 : 0.55;
    const spot = new THREE.Vector3(
      THREE.MathUtils.lerp(gp.x, picnicAt.x, pull) + (Math.random() - 0.5) * 4.5,
      0,
      THREE.MathUtils.lerp(gp.z, picnicAt.z, pull) + (Math.random() - 0.5) * 4.5,
    );
    this.addDropping(spot, "gull");
  }

  /** Mission 4 — geese on radar; van heavy hose before they reach the lake. */
  private startGooseMission(): void {
    if (this.gooseMissionStarted || this.gooseMissionDone) return;
    if (!missionWindowOpen("geese", this.dayCycle.hour)) return;
    this.gooseMissionStarted = true;
    // Flock waits until the hose is collected and you're back on the path.
    const van = vanSpotWorld();
    this.callouts.raise("geese", this.dayCycle.clockFace(), van ?? undefined);
    this.messages.send(
      "999 CONTROL",
      "Radar contact — flock of Canada geese inbound. Heavy hose is in the van load bay. Get to the van.",
      this.dayCycle.clockFace(),
      20,
    );
    this.announceMission("geese");
    this.showTool(null);
  }

  private updateGooseMission(delta: number): void {
    if (this.gooseMissionPending > 0 && !this.gooseMissionStarted) {
      this.gooseMissionPending -= delta;
    }
    if (
      !this.gooseMissionStarted &&
      !this.gooseMissionDone &&
      this.picnicRaidDone &&
      !this.picnicRaidActive &&
      this.gooseMissionPending <= 0 &&
      missionWindowOpen("geese", this.dayCycle.hour)
    ) {
      this.startGooseMission();
    }

    if (this.heavyHoseIntro?.isActive()) {
      this.heavyHoseIntro.update(delta);
      if (!this.heavyHoseIntro.isActive()) this.finishHeavyHoseIntro();
      return;
    }

    // On the path by the van (shift start spot) → cinematic grab.
    if (
      this.gooseMissionStarted &&
      !this.gooseHeavyArmed &&
      !this.gooseMissionDone &&
      !this.heavyHoseIntro
    ) {
      const here = this.camera.position;
      if (nearHeavyHosePickup(here.x, here.z)) {
        this.beginHeavyHoseIntro();
        return;
      }
    }

    if (!this.gooseFlock) {
      if (this.gooseMissionStarted && !this.gooseMissionDone) {
        this.rearDoorOpen = THREE.MathUtils.damp(this.rearDoorOpen, 0, 6, delta);
        setRearDoorsOpen(this.rearDoorOpen);
      }
      return;
    }

    this.gooseFlock.update(delta);

    for (const drop of this.gooseFlock.claimDrops()) {
      this.addDropping(drop, "swan");
    }

    // Keep barn doors ajar while the heavy hose is in play.
    const doorTarget = this.gooseHeavyArmed ? 0.35 : 0;
    this.rearDoorOpen = THREE.MathUtils.damp(
      this.rearDoorOpen,
      doorTarget,
      5,
      delta,
    );
    setRearDoorsOpen(this.rearDoorOpen);

    if (this.gooseFlock.isCleared() && !this.gooseMissionDone) {
      this.gooseMissionDone = true;
      this.cleaned += 1;
      this.score += 120 * this.multiplier();
      this.updateHUD();
      this.messages.send(
        "999 CONTROL",
        "Geese cleared off — radar quiet. Nice work with the heavy hose.",
        this.dayCycle.clockFace(),
        16,
      );
      this.callouts.raise("praise", this.dayCycle.clockFace());
      this.gooseFlock.dispose();
      this.gooseFlock = null;
    }
  }

  /** Mission 7 — pigeons perching on wires at the north end. */
  private updatePigeonMission(delta: number): void {
    const hour = this.dayCycle.hour;

    if (
      !this.pigeonMissionStarted &&
      !this.pigeonMissionDone &&
      this.onDuty &&
      this.pigeonHourWas >= 0 &&
      missionWindowOpen("pigeons", hour)
    ) {
      this.startPigeonMission();
    }

    this.pigeonHourWas = hour;

    if (this.pigeonMissionBirds.length === 0) return;

    for (let i = this.pigeonMissionBirds.length - 1; i >= 0; i--) {
      const bird = this.pigeonMissionBirds[i]!;
      bird.update(delta);
      const drop = bird.claimDrop();
      if (drop && !isInLake(drop.x, drop.z)) {
        this.addDropping(drop, "gull");
      }
      if (bird.isGone()) {
        bird.dispose();
        this.pigeonMissionBirds.splice(i, 1);
      }
    }

    if (
      this.pigeonMissionStarted &&
      !this.pigeonMissionDone &&
      this.pigeonMissionBirds.length === 0
    ) {
      this.pigeonMissionDone = true;
      this.cleaned += 1;
      this.score += 60 * this.multiplier();
      this.updateHUD();
      this.messages.send(
        "DEPOT",
        "Wire birds cleared off the lights. Nice hosing.",
        this.dayCycle.clockFace(),
        12,
      );
    }
  }

  private startPigeonMission(): void {
    if (this.pigeonMissionStarted || this.pigeonMissionDone) return;
    if (!missionWindowOpen("pigeons", this.dayCycle.hour)) return;
    
    this.pigeonMissionStarted = true;

    const spot = getMissionSpot("pigeons");
    const roost = roostPerchesNorth(PIGEON_FLOCK, fairyLightSections());
    if (roost.length === 0) return;

    for (let i = 0; i < roost.length; i++) {
      this.pigeonMissionBirds.push(new WireBird(this.scene, roost[i]!, i));
    }

    this.announceMission("pigeons");
    this.callouts.raise("jobs", this.dayCycle.clockFace(), { x: spot.x, z: spot.z });
    this.missionArrow.point({ x: spot.x, y: 0, z: spot.z });
    this.messages.send(
      "DEPOT",
      "Caller says there's pigeons all over the north-end fairy lights. Get up there with the hose.",
      this.dayCycle.clockFace(),
      18,
    );
  }

  /** Walk-up at the van rear — third-person take the heavy hose. */
  private beginHeavyHoseIntro(): void {
    if (this.heavyHoseIntro || this.gooseHeavyArmed || this.gooseMissionDone) {
      return;
    }
    const intro = new HeavyHoseIntro(this.scene, this.camera);
    const here = this.camera.position;
    if (!intro.start(here.x, here.z)) return;
    this.heavyHoseIntro = intro;
    this.player.beginIntro();
    this.showTool(null);
  }

  private finishHeavyHoseIntro(): void {
    const eye = this.heavyHoseIntro?.eyeHandoff() ?? null;
    this.heavyHoseIntro = null;
    if (eye) this.player.takeOverFromIntro(eye.x, eye.y, eye.z, eye.yaw);
    else this.player.endIntro();

    this.gooseHeavyArmed = true;
    this.rearDoorOpen = 0;
    setRearDoorsOpen(0);
    this.player.equipHeavyHose();
    this.showTool("heavyHose");
    this.gooseFlock = new GooseFlock(this.scene, getMissionSpot("geese"));
    this.messages.send(
      "DEPOT",
      "Heavy hose online — watch the pressure gauge. Knock the geese out of the sky, or off the water. Clear most of them and the rest will go.",
      this.dayCycle.clockFace(),
      14,
    );
  }

  /**
   * E at the van during mission 4 — starts the hose pickup scene if you're
   * on the path by the van (proximity also auto-triggers).
   */
  public tryGrabHeavyHose(at: THREE.Vector3): boolean {
    if (
      !this.gooseMissionStarted ||
      this.gooseHeavyArmed ||
      this.gooseMissionDone ||
      this.heavyHoseIntro
    ) {
      return false;
    }
    if (!nearHeavyHosePickup(at.x, at.z)) return false;
    this.beginHeavyHoseIntro();
    return true;
  }

  public onHeavyHoseEmpty(): void {
    this.messages.send(
      "DEPOT",
      "Heavy hose tank empty. You're back on the lance.",
      this.dayCycle.clockFace(),
      10,
    );
    this.showTool("hose");
  }

  /** Pedalo into birds — permanent takeout; too many and a V flies in mad. */
  private updatePedaloBirdHits(): void {
    if (!this.player.isOnPedalo()) return;
    const hull = hiredPedaloHull();
    if (!hull) return;
    const hitR = 1.85;

    for (const swan of this.swans) {
      if (swan.isFlying() || swan.hasLeft()) continue;
      if (swan.getPosition().distanceTo(hull) > hitR) continue;
      swan.strikeDead();
      this.noteBirdKill();
    }

    for (const duck of this.ducks) {
      if (duck.isGone() || !duck.isOnWater()) continue;
      if (duck.getPosition().distanceTo(hull) > hitR * 0.85) continue;
      duck.flush();
      this.noteBirdKill();
    }
  }

  private noteBirdKill(): void {
    this.birdKills += 1;
    if (this.revengeDone || this.birdKills < BIRD_KILL_REVENGE) return;
    this.revengeDone = true;
    this.spawnRevengeFlock();
  }

  private spawnRevengeFlock(): void {
    const aim = this.camera.position.clone();
    aim.y = 0;
    for (let i = 0; i < REVENGE_FLOCK; i++) {
      const swan = new Swan(aim.clone(), this.scene, "adult");
      swan.flyRevenge(aim, i, REVENGE_FLOCK);
      this.swans.push(swan);
    }
    this.callouts.raise("swan", this.dayCycle.clockFace(), {
      x: aim.x,
      z: aim.z,
    });
  }

  /** Dusk — mallards and gulls clear off; play-park kids go home. */
  private updateEveningClearout(delta: number): void {
    const hour = this.dayCycle.hour;
    const duskBirds = hour >= 20 || hour < NIGHT_UNTIL;
    const kidsHome = hour >= 18.5 || hour < 7.5;

    if (duskBirds) {
      for (const duck of this.ducks) {
        if (duck.isOnWater() && Math.random() < delta * 0.14) duck.flush();
      }
      for (const gull of this.gulls) {
        if (!gull.isGone() && Math.random() < delta * 0.12) gull.leavePark();
      }
    }

    if (kidsHome) {
      for (const visit of this.playVisits) visit.sendHome();
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
    const heavy = this.player.isHeavyHoseActive();
    const bodyR = heavy ? 4.5 : 1;

    if (heavy && this.gooseFlock?.heavyHit(point, this.camera.position)) {
      return true;
    }

    // Water hitting a tagged wall carves fading streaks through the paint.
    for (const tag of this.graffiti) {
      if (!tag.hitBy(point)) continue;
      tag.scrub(point, direction);
      if (tag.claimCredit()) this.creditClean();
      return true;
    }

    // Ornamental beds — distant mist is welcome; point-blank strips petals.
    {
      const bedHit = sprayFlowerBed(point, this.camera.position);
      if (bedHit === "watered") {
        this.gardener?.noticeWatered();
        return true;
      }
      if (bedHit === "damaged") {
        this.gardener?.noticeBlasted();
        return true;
      }
    }

    // Gulls (incl. picnic stoops) — before ground crowds so the lance connects.
    for (const gull of this.gulls) {
      if (gull.isGone()) continue;
      if (!gull.hitBy(point, heavy)) continue;
      if (dirty) gull.splatter(point);
      else gull.rinse(point);
      if (this.picnicRaidActive) gull.hoseOff();
      else gull.flush();
      return true;
    }

    // Pigeons — heavy reel reaches further and knocks whole clusters.
    for (const bird of this.wireBirds) {
      if (bird.isGone()) continue;
      const here = bird.getPosition();
      const catchR = heavy ? 4.2 : 1.6;
      const dx = point.x - here.x;
      const dy = point.y - here.y;
      const dz = point.z - here.z;
      const hit = heavy
        ? dx * dx + dy * dy * 0.45 + dz * dz < catchR * catchR
        : bird.soakedBy(point);
      if (!hit) continue;
      const at = bird.getPosition();
      bird.scare();
      for (const other of this.wireBirds) {
        if (other === bird || other.isGone()) continue;
        if (other.getPosition().distanceTo(at) < (heavy ? 6.5 : 3.8)) {
          other.scare();
        }
      }
      return true;
    }

    // Hire swan pedalos — stolen chase floods the hull; otherwise flecks / rinse.
    if (this.stolenSwanboat?.takeSpray(point, heavy)) return true;
    if (sprayPedalo(point, dirty)) return true;

    // Late drinkers — a blast of the washer and they're off.
    for (const lot of this.drunks) {
      if (lot.getPosition().distanceTo(point) > 3.2) continue;
      lot.scarper(true);
      return true;
    }

    // Bench sitters — phones and books hate getting wet.
    for (const lot of this.benchSits) {
      if (!lot.soakedBy(point)) continue;
      if (lot.drench(this.camera.position)) this.complain();
      return true;
    }

    // Play-park kids — hose them and mum/dad come steaming over.
    for (const visit of this.playVisits) {
      if (!visit.soakedBy(point)) continue;
      if (visit.drench(this.camera.position)) this.complain();
      return true;
    }

    // Gosport rebels — only the lance turns them.
    if (this.rebelRaid?.takeWater(point)) return true;

    // Crabbing kids on the wall — they shout; filthy spray often clears them off.
    for (const crabber of this.crabbers) {
      if (!crabber.soakedBy(point)) continue;
      const dry = !crabber.isSoaked();
      if (dirty) {
        crabber.splatter(point);
        if (crabber.foul() || dry) this.complain();
      } else {
        crabber.rinse(point);
        if (crabber.drench()) this.complain();
      }
      return true;
    }

    // Mobility scooters — stop, shout, and file a complaint.
    for (const scooter of this.scooters) {
      if (!scooter.soakedBy(point)) continue;
      const dry = !scooter.isSoaked();
      if (heavy) {
        scooter.knockOff(this.camera.position);
        if (dry) this.complain();
        return true;
      }
      if (dirty) {
        scooter.splatter(point);
        if (scooter.foul() || dry) this.complain();
      } else {
        scooter.rinse(point);
        if (scooter.drench()) this.complain();
      }
      return true;
    }

    // Cyclists / e-bikes — hose knocks them off; the bike carries on.
    for (const rider of this.cyclists) {
      if (!rider.soakedBy(point)) continue;
      if (rider.drench(this.camera.position)) this.complain();
      return true;
    }

    // Water on a hot grill throws steam and ruins someone's tea.
    for (const party of this.bbqs) {
      if (!party.hitBy(point)) continue;
      if (party.douse(point, this.camera.position)) this.complain();
      return true;
    }

    // Picnic blanket — sarnies and cutlery go flying.
    for (const picnic of this.picnics) {
      if (!picnic.hitBy(point)) continue;
      if (picnic.blast(point, this.camera.position)) this.complain();
      return true;
    }

    // Grass fire from a runaway barbecue — lance it before it walks.
    if (this.grassFire?.douse(point)) {
      this.hissFireSteam();
      return true;
    }

    // Radio boats take on water until they go under.
    for (const boat of this.boats) {
      if (boat.takeWater(point)) return true;
    }

    for (const duck of this.ducks) {
      if (duck.getPosition().distanceTo(point) > (heavy ? 3.2 : 1.5)) continue;
      if (dirty) duck.splatter(point);
      else duck.rinse(point);
      duck.flush();
      return true;
    }
    for (const squirrel of this.squirrels) {
      if (squirrel.getPosition().distanceTo(point) > 1.2) continue;
      if (dirty) squirrel.splatter(point);
      else squirrel.rinse(point);
      squirrel.flush();
      return true;
    }

    for (const swan of this.swans) {
      const hitR = heavy ? 3.8 : 2.2;
      if (swan.getPosition().distanceTo(point) > hitR) continue;
      if (dirty) swan.splatter(point);
      else swan.rinse(point);

      if (heavy) {
        swan.heavyBlast(this.camera.position);
      } else {
        swan.soak(this.camera.position);
        if (swan.isCharging()) {
          const at = swan.getPosition();
          for (const other of this.swans) {
            if (other !== swan && other.getPosition().distanceTo(at) < 16)
              other.rile();
          }
        }
      }
      return true;
    }

    for (const person of this.people) {
      const dog = person.getDog();
      if (dog?.hitBy(point)) {
        if (dirty) dog.splatter(point);
        else dog.rinse(point);
        // A solid jet knocks them over — breaks an attack mid-charge.
        dog.hoseKnock(this.camera.position);
        return true;
      }

      const soaked = heavy
        ? point.distanceTo(person.getPosition()) < bodyR &&
          point.y > person.getPosition().y - 0.2 &&
          point.y < person.getPosition().y + 2.2
        : person.soakedBy(point);
      if (!soaked) continue;
      const dry = !person.isSoaked();
      if (heavy) {
        person.knockDown(this.camera.position);
        if (dry) this.complain();
        return true;
      }
      if (dirty) {
        person.splatter(point);
        const swung = person.foul(this.camera.position);
        if (dry || swung) this.complain();
      } else {
        person.rinse(point);
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
    parkAudio.waterSplash(1.15);

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
    document.exitPointerLock?.();
    const title = this.gameOverPanel.querySelector("h1");
    if (title) {
      title.textContent = this.rebelMissionStarted
        ? "PARK FALLEN"
        : "PECKED TO DEATH";
    }
    this.gameOverDetail.innerHTML = this.rebelMissionStarted
      ? [
          `The Gosport lot took Canoe Lake at ${this.dayCycle.clockFace()}.`,
          `Score <strong>${this.score}</strong> &middot; ${this.cleaned} cleaned &middot; ${this.complaints} complaints`,
          `Anarchy on the esplanade. Southsea will not forget.`,
        ].join("<br>")
      : [
          `A mute swan has seen you off at ${this.dayCycle.clockFace()}.`,
          `Score <strong>${this.score}</strong> &middot; ${this.cleaned} cleaned &middot; ${this.complaints} complaints`,
          `Park left at ${Math.round(this.cleanliness)}% clean.`,
        ].join("<br>");
    this.gameOverPanel.classList.add("on");
  }

  /** Held the lake — shift ends in glory rather than feathers. */
  private triumph(): void {
    this.dead = true;
    this.rebelMissionWon = true;
    document.exitPointerLock?.();
    const title = this.gameOverPanel.querySelector("h1");
    if (title) title.textContent = "LAKE HELD";
    this.gameOverDetail.innerHTML = [
      `You held Canoe Lake against the Gosport separatists at ${this.dayCycle.clockFace()}.`,
      `Score <strong>${this.score}</strong> &middot; ${this.cleaned} cleaned &middot; ${this.complaints} complaints`,
      `Armed response rolling in. The park stays Pompey tonight.`,
    ].join("<br>");
    this.gameOverPanel.classList.add("on");
  }

  /** Water landed here — scrub anything close enough to the splash.
   * Returns 0 if clean; otherwise a bounce scale (≥1 flat mess, higher on lumps). */
  public washAt(
    point: THREE.Vector3,
    direction: THREE.Vector3 = new THREE.Vector3(0, 0, 1),
  ): number {
    let bounce = 0;
    for (let i = this.droppings.length - 1; i >= 0; i--) {
      const dropping = this.droppings[i]!;
      if (!dropping.covers(point)) continue;

      dropping.scrub(point, direction);
      if (dropping.claimCredit()) {
        this.creditClean();
        this.noteOvernightCleared(dropping);
      }
      bounce = Math.max(bounce, dropping.bounceScale(point));
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

    // Same for a picnic on the grass — lunch goes airborne.
    for (const picnic of this.picnics) {
      const at = picnic.getPosition();
      const dx = at.x - point.x;
      const dz = at.z - point.z;
      if (dx * dx + dz * dz > 1.8 * 1.8) continue;
      if (picnic.blast(point.clone().setY(0.2), this.camera.position)) {
        this.complain();
      }
    }

    if (this.grassFire?.douse(point)) {
      this.hissFireSteam();
      bounce = Math.max(bounce, 1);
    }

    // Standing water on the paving — skip while scrubbing a pile so the
    // wash trail stays readable.
    if (bounce <= 0) this.puddles.splash(point);
    return bounce;
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
      const hour = this.dayCycle.hour;
      const clearEnough = murk < 0.34;
      const daytime = hour > 10 && hour < 20;
      if (clearEnough && daytime) {
        this.planes.push(new Plane(this.scene, murk, "spitfire"));
        this.callouts.raise("spitfire", this.dayCycle.clockFace());
        // One's been — leave it a good while before the next pass.
        this.nextSpitfire = 360 + Math.random() * 480;
      } else {
        // Weather or time wasn't right — try again soon, don't burn the long wait.
        this.nextSpitfire = 40 + Math.random() * 70;
      }
    }

    for (let i = this.planes.length - 1; i >= 0; i--) {
      const plane = this.planes[i]!;
      plane.update(delta, murk);
      if (!plane.isGone()) continue;
      plane.dispose();
      this.planes.splice(i, 1);
    }

    this.nextHelicopter -= delta;
    if (this.nextHelicopter <= 0) {
      const hour = this.dayCycle.hour;
      const clearEnough = murk < 0.45;
      const daytime = hour > 8 && hour < 20;
      if (clearEnough && daytime && this.helicopters.length < 1) {
        this.helicopters.push(new Helicopter(this.scene));
        this.nextHelicopter = 180 + Math.random() * 280;
      } else {
        this.nextHelicopter = 35 + Math.random() * 50;
      }
    }

    for (let i = this.helicopters.length - 1; i >= 0; i--) {
      const heli = this.helicopters[i]!;
      heli.update(delta);
      if (heli.isInFlight()) {
        const at = heli.getPosition();
        for (const person of this.people) person.noticeHelicopter(heli.id, at);
        for (const visit of this.playVisits) visit.noticeHelicopter(heli.id, at);
      }
      if (!heli.isGone()) continue;
      heli.dispose();
      this.helicopters.splice(i, 1);
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
      const done = pile.update(delta);
      if (pile.claimCredit()) {
        this.creditClean();
        this.noteOvernightCleared(pile);
      }
      if (!done) continue;
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
   * moment food is left unattended they're down on it. Bold ones also dive
   * picnic blankets on the east green. What goes in comes out again, usually
   * over the path.
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

    // Pull a couple of birds toward any raidable picnic on the big green.
    const picnic = this.picnics.find((p) => p.isRaidable());
    if (picnic) {
      const at = picnic.getPosition();
      for (const gull of this.gulls) {
        if (Math.random() < 0.35) gull.watchOver(at.x, at.z);
      }
    }

    let mobbing = false;

    for (const gull of this.gulls) {
      gull.update(delta, this.camera.position, scraps);
      if (gull.isAground()) mobbing = true;
      // A third of beakfuls come back out within the minute, near enough —
      // picnic raids almost always leave a calling card.
      const dropChance = this.picnicRaidActive
        ? 0.92
        : this.feederRushLeft > 0
          ? 0.55
          : 0.2;
      if (gull.claimFeed() && Math.random() < dropChance) {
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

    // Picnic plates on the east green — gulls raid even with people sat round.
    for (const party of this.picnics) {
      if (!party.isRaidable()) continue;
      const at = party.foodSpot();
      if (!at) continue;
      scraps.push({
        at,
        raid: true,
        take: () => party.stealBite(),
        going: () => party.isRaidable(),
        onLand: () => party.noticeRaid(),
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

  /** After dark — drinkers on the grass. Move them on before someone complains. */
  private updateDrunks(delta: number): void {
    const dark = this.isDark();

    this.nextDrunks -= delta;
    if (dark && this.nextDrunks <= 0 && this.drunks.length < 1) {
      const candidates = drunkSpots();
      const spot = this.outOfShot(() => {
        if (candidates.length === 0) return new THREE.Vector2(40, 50);
        return candidates[Math.floor(Math.random() * candidates.length)]!.clone();
      }, 2);
      if (!spot) {
        this.nextDrunks = WAIT_AND_SEE;
      } else {
        const lot = new Drunks(this.scene, spot);
        this.drunks.push(lot);
        this.nextDrunks = 200 + Math.random() * 280;
        this.callouts.raise("drunks", this.dayCycle.clockFace(), {
          x: spot.x,
          z: spot.y,
        });
      }
    }

    for (let i = this.drunks.length - 1; i >= 0; i--) {
      const lot = this.drunks[i]!;
      // Dawn — send them packing with no credit.
      if (!dark) lot.scarper(false);
      lot.update(delta, this.camera.position);
      if (lot.claimComplaint()) this.complain();
      if (lot.claimCredit()) this.creditClean();
      if (lot.isGone()) {
        lot.dispose();
        this.drunks.splice(i, 1);
      }
    }

    if (!dark && this.drunks.length === 0) {
      this.nextDrunks = Math.max(this.nextDrunks, 40);
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

  public showTool(tool: Tool | null): void {
    const mobile = document.body.classList.contains("touch-ui");
    if (this.shiftIntro?.isAwaitingGesture()) {
      this.instructionsElement.innerHTML = mobile
        ? "Tap to clock on"
        : "Click to clock on";
      return;
    }
    if (this.isIntroPlaying()) {
      this.instructionsElement.innerHTML = this.heavyHoseIntro?.isActive()
        ? "Collecting the heavy hose…"
        : "Clocking on…";
      return;
    }
    if (!this.onDuty) {
      this.instructionsElement.innerHTML = mobile
        ? "Left stick: Move | Look stick: Look"
        : "WASD: Move | Mouse: Look | ESC: Unlock mouse";
      return;
    }
    if (isPedaloHired()) {
      this.instructionsElement.innerHTML = mobile
        ? "Left stick: Pedal & steer | Look stick: Look | Spray: Aim & fire | Hold spray centred: Climb out"
        : "WASD: Pedal & steer | Mouse: Look | Click: Spray | E: Climb out";
      return;
    }
    if (tool === "heavyHose") {
      const pct = Math.round(this.player.heavyTankFraction() * 100);
      this.instructionsElement.innerHTML = mobile
        ? `Heavy hose — ${pct}% tank | Spray to fire | Knock down the geese`
        : `HEAVY HOSE — ${pct}% tank left | Click: Spray | WASD: Move | ESC: Unlock mouse`;
      return;
    }
    if (
      this.gooseMissionStarted &&
      !this.gooseHeavyArmed &&
      !this.gooseMissionDone
    ) {
      this.instructionsElement.innerHTML = mobile
        ? "Geese inbound! Follow the red arrow to the van for the heavy hose"
        : "Geese on radar — follow the red arrow to the van for the heavy hose";
      return;
    }
    if (
      this.stolenSwanboat?.isActive() &&
      !isPedaloHired()
    ) {
      this.instructionsElement.innerHTML = mobile
        ? "Stolen swanboat — board a hire swan (tap spray near one) and chase; spray their hull till she sinks"
        : "Stolen swanboat — E near a hire swan to board, chase them, spray their hull till she sinks";
      return;
    }
    this.instructionsElement.innerHTML = mobile
      ? "Left stick: Move | Look stick: Look | Spray (above look): Aim & fire | Near swan boat: tap spray to board"
      : tool === "picker"
        ? "WASD: Move | Shift: Run | Click: Spear litter | Q: Pressure washer | E: Swan boat | ESC: Unlock mouse"
        : "WASD: Move | Shift: Run | Click: Spray | Q: Litter picker | E: Swan boat | ESC: Unlock mouse";
  }

  public isIntroPlaying(): boolean {
    return (
      this.shiftIntro?.isActive() === true ||
      this.heavyHoseIntro?.isActive() === true
    );
  }

  /** Waiting for the first click / tap before the van arrival rolls. */
  public isAwaitingIntroGesture(): boolean {
    return this.shiftIntro?.isAwaitingGesture() === true;
  }

  /**
   * First pointer / key — browsers block Web Audio until a gesture, so the
   * van arrival waits here and park ambience starts with the get-out.
   */
  public noteIntroGesture(): void {
    void parkAudio.unlock().then(() => {
      this.shiftIntro?.beginArrival();
      this.showTool(null);
    });
  }

  private wireIntroAudio(): void {
    if (parkAudio.isUnlocked()) {
      this.shiftIntro?.beginArrival();
      return;
    }
    const onGesture = () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      this.noteIntroGesture();
    };
    window.addEventListener("pointerdown", onGesture);
    window.addEventListener("keydown", onGesture);
  }

  /** Still in the van intro or not yet clocked on — tools and jobs wait. */
  public hasClockedOn(): boolean {
    return this.onDuty;
  }

  /** @deprecated Intro handles getting out — kept for old keybinds. */
  public exitVan(): void {
    /* cinematic owns the exit */
  }

  /**
   * First step onto the footpath — unused while the intro walks them there.
   */
  public tryClockOn(): void {
    /* intro calls finishIntro → clockOn */
  }

  /** No van in the level — skip the arrival and start mid-shift. */
  public forceClockOn(): void {
    if (this.onDuty) return;
    const start = offsetShore(PATH_OUTER - 2).reduce((best, point) =>
      point.y > best.y ? point : best,
    );
    this.camera.position.set(
      start.x,
      1.7 + groundHeight(start.x, start.y),
      start.y,
    );
    this.camera.lookAt(0, 1.7, 0);
    this.clockOn();
  }

  /**
   * Editor Debug — no van intro, no Maps underlay (that's walk mode only).
   * Drop onto the path handoff, optionally jump straight into a mission.
   */
  private applyDebugBoot(from: DebugFrom): void {
    const van = getCleanerVanPose();
    if (van) {
      this.player.takeOverFromIntro(
        van.pathX,
        1.7 + groundHeight(van.pathX, van.pathZ),
        van.pathZ,
        van.pathYaw,
      );
    } else {
      const start = offsetShore(PATH_OUTER - 2).reduce((best, point) =>
        point.y > best.y ? point : best,
      );
      this.player.takeOverFromIntro(
        start.x,
        1.7 + groundHeight(start.x, start.y),
        start.y,
        Math.atan2(-start.x, -start.y),
      );
    }

    if (from === "start") {
      this.dayCycle.setHour(6);
      this.clockOn();
      this.applyTimeAndWeather(0);
      this.messages.send(
        "DEPOT",
        "Debug boot — intro skipped. Opening tip as normal.",
        this.dayCycle.clockFace(),
        8,
      );
      return;
    }

    // Mission jumps skip the overnight / feeder chain.
    this.secondEventDone = true;
    for (const pile of this.overnightPiles) {
      const i = this.droppings.indexOf(pile);
      if (i >= 0) {
        pile.dispose();
        this.droppings.splice(i, 1);
      }
    }
    this.overnightPiles.clear();
    this.overnightTotal = 0;
    this.overnightCleared = 0;
    this.feederRushLeft = 0;
    this.callouts.unlockTrouble();

    if (from === "picnic") {
      this.dayCycle.setHour(10.5);
      this.clockOn({ quiet: true });
      this.startPicnicRaid();
    } else if (from === "geese") {
      this.dayCycle.setHour(11.5);
      this.picnicRaidDone = true;
      this.clockOn({ quiet: true });
      this.startGooseMission();
    } else if (from === "swanboat") {
      this.dayCycle.setHour(12.75);
      this.picnicRaidDone = true;
      this.gooseMissionDone = true;
      this.clockOn({ quiet: true });
      this.beginSwanboatMission();
    } else if (from === "fire") {
      this.dayCycle.setHour(16);
      this.picnicRaidDone = true;
      this.gooseMissionDone = true;
      this.swanboatMissionDone = true;
      this.clockOn({ quiet: true });
      const spot = getMissionSpot("fire");
      const at = new THREE.Vector3(spot.x, 0, spot.z);
      this.grassFire = new GrassFire(this.scene, at);
      this.callouts.raise("fire", this.dayCycle.clockFace(), spot);
      this.announceMission("fire");
    } else if (from === "racers") {
      this.dayCycle.setHour(22.2);
      this.picnicRaidDone = true;
      this.gooseMissionDone = true;
      this.swanboatMissionDone = true;
      this.fireMissionDone = true;
      this.racerHourWas = 22;
      this.clockOn({ quiet: true });
      this.beginRacerMission();
      // Stand on the south lawn looking at the esplanade — the van is the
      // wrong side of the park for this job.
      const tip = getMissionSpot("racers");
      const standX = THREE.MathUtils.clamp(tip.x, -90, 90);
      const standZ = Math.min(-96, tip.z + 18);
      this.player.takeOverFromIntro(
        standX,
        1.7 + groundHeight(standX, standZ),
        standZ,
        Math.PI,
      );
    } else if (from === "rebels") {
      this.dayCycle.setHour(1.1);
      this.picnicRaidDone = true;
      this.gooseMissionDone = true;
      this.swanboatMissionDone = true;
      this.fireMissionDone = true;
      this.racerMissionDone = true;
      this.rebelHourWas = 1;
      this.clockOn({ quiet: true });
      this.beginRebelMission();
    } else if (from === "pigeons") {
      this.dayCycle.setHour(12);
      this.picnicRaidDone = true;
      this.gooseMissionDone = true;
      this.swanboatMissionDone = true;
      this.pigeonHourWas = 11;
      this.clockOn({ quiet: true });
      this.startPigeonMission();
    }

    this.applyTimeAndWeather(0);
    this.messages.send(
      "DEPOT",
      `Debug boot — ${from} (intro skipped).`,
      this.dayCycle.clockFace(),
      8,
    );
  }

  private finishIntro(): void {
    const eye = this.shiftIntro?.eyeHandoff() ?? null;
    this.shiftIntro = null;
    if (eye) this.player.takeOverFromIntro(eye.x, eye.y, eye.z, eye.yaw);
    else this.player.endIntro();
    this.clockOn();
  }

  private clockOn(opts?: { quiet?: boolean }): void {
    this.onDuty = true;
    if (!opts?.quiet) {
      this.callouts.raise("shift", this.dayCycle.clockFace(), this.overnightTip());
      this.callouts.lockTrouble();
    } else {
      this.callouts.unlockTrouble();
    }
    this.showTool("hose");
    this.player.pickStartingTool();
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
      ) ||
      (this.grassFire?.isBurning() === true &&
        this.grassFire
          .patchPositions()
          .some((at) => looking(at, HOSE_SIGHT * 1.2, 0.88)));

    // Whatever's already in their hands wins, so they don't stand there
    // swapping back and forth over a bin next to a mess.
    if (holding === "heavyHose") return "heavyHose";
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
        if (lads) {
          const at = loopPoint(from);
          this.callouts.raise("ebike", this.dayCycle.clockFace(), {
            x: at.x,
            z: at.y,
          });
        }
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

      const angry = rider.claimAngryPedestrian();
      if (angry) {
        const person = new Person(this.scene, 0);
        person.bootFromCrash(angry.at, this.camera.position, angry.lout);
        this.people.push(person);
      }

      if (
        rider.isGone() &&
        (rider.hasCrashed() || this.canSlipAway(rider.getPosition()))
      ) {
        rider.dispose();
        this.cyclists.splice(i, 1);
      }
    }

    this.updateScooters(delta, mess, inTheWay);
  }

  /**
   * Parade traffic on the authored roads — some run past, some turn at
   * junctions onto linked roads, and dead ends just fade them out.
   */
  private updateTraffic(delta: number): void {
    const hour = this.dayCycle.hour;
    // Quiet overnight; busier through the day.
    const busy =
      hour >= 7 && hour < 22
        ? hour >= 8 && hour < 18
          ? 1
          : 0.55
        : 0.15;

    this.nextTraffic -= delta;
    if (this.nextTraffic <= 0 && this.traffic.length < MAX_TRAFFIC) {
      const car = TrafficCar.spawn(this.scene);
      if (car) this.traffic.push(car);
      this.nextTraffic = (2 + Math.random() * 6) / Math.max(0.2, busy);
    } else if (this.nextTraffic <= 0) {
      this.nextTraffic = 1.5 + Math.random() * 3;
    }

    for (let i = this.traffic.length - 1; i >= 0; i--) {
      const car = this.traffic[i]!;
      car.update(delta);
      if (car.isGone()) {
        car.dispose();
        this.traffic.splice(i, 1);
      }
    }
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
      const splatted = scooter.update(
        delta,
        inTheWay,
        mess,
        this.camera.position,
      );
      if (splatted >= 0) this.logComplaint(this.droppings[splatted]!);
      if (scooter.wantsCrash()) this.takeStrike(scooter.getPosition());

      const line = scooter.claimTrack();
      if (line) this.footprints.push(new Footprint(this.scene, line));

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

    const chase =
      this.player.isWading() || this.player.isOnPedalo()
        ? this.camera.position
        : null;

    for (let i = this.boats.length - 1; i >= 0; i--) {
      const boat = this.boats[i]!;
      boat.update(delta, chase);
      if (boat.claimComplaint()) this.complain();
      if (chase && boat.claimHit()) {
        this.takeStrike(boat.getPosition());
      }
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
   * Disposable barbecues on the east lawn — mid-morning through the early
   * evening, a couple at most.
   */
  private updateBbqs(delta: number): void {
    const hour = this.dayCycle.hour;
    const bbqHours = hour >= 9 && hour < 20;

    this.nextBbq -= delta;
    if (this.nextBbq <= 0 && bbqHours && this.bbqs.length < MAX_BBQS) {
      const spot = this.freeLawnGatherSpot(22);
      if (!spot) {
        this.nextBbq = WAIT_AND_SEE;
      } else {
        this.bbqs.push(new BbqParty(this.scene, spot));
        this.nextBbq = 70 + Math.random() * 110;
      }
    } else if (this.nextBbq <= 0) {
      this.nextBbq = bbqHours ? 20 + Math.random() * 30 : 90 + Math.random() * 60;
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

  /**
   * Blanket picnics on the east lawn in fair weather — mid-morning through
   * late afternoon.
   */
  private updatePicnics(delta: number): void {
    const hour = this.dayCycle.hour;
    const picnicHours = hour >= 8.5 && hour < 18.5;
    const dry = this.weather.rainStrength() < 0.12;

    this.nextPicnic -= delta;
    if (
      this.nextPicnic <= 0 &&
      picnicHours &&
      dry &&
      this.picnics.length < MAX_PICNICS
    ) {
      const spot = this.freeLawnGatherSpot(16);
      if (!spot) {
        this.nextPicnic = WAIT_AND_SEE;
      } else {
        this.picnics.push(new Picnic(this.scene, spot));
        this.nextPicnic = 40 + Math.random() * 70;
      }
    } else if (this.nextPicnic <= 0) {
      this.nextPicnic = picnicHours
        ? 18 + Math.random() * 28
        : 80 + Math.random() * 60;
    }

    for (let i = this.picnics.length - 1; i >= 0; i--) {
      const party = this.picnics[i]!;
      party.update(delta);
      if (party.isDone()) {
        party.dispose();
        this.picnics.splice(i, 1);
      }
    }
  }

  /**
   * Pop-up gazebos on the east lawn — shade for the day, a couple at most.
   */
  private updateGazebos(delta: number): void {
    const hour = this.dayCycle.hour;
    const gazeboHours = hour >= 10 && hour < 19;
    const dry = this.weather.rainStrength() < 0.25;

    this.nextGazebo -= delta;
    if (
      this.nextGazebo <= 0 &&
      gazeboHours &&
      dry &&
      this.gazebos.length < MAX_GAZEBOS
    ) {
      const spot = this.freeLawnGatherSpot(24);
      if (!spot) {
        this.nextGazebo = WAIT_AND_SEE;
      } else {
        this.gazebos.push(new Gazebo(this.scene, spot));
        this.nextGazebo = 160 + Math.random() * 220;
      }
    } else if (this.nextGazebo <= 0) {
      this.nextGazebo = gazeboHours
        ? 50 + Math.random() * 50
        : 100 + Math.random() * 80;
    }

    for (let i = this.gazebos.length - 1; i >= 0; i--) {
      const party = this.gazebos[i]!;
      party.update(delta);
      if (party.isDone()) {
        party.dispose();
        this.gazebos.splice(i, 1);
      }
    }
  }

  /**
   * Lakeside benches — chat, phone, book, or chucking bread to the birds.
   * Feeders favour seats near the water. Daytime mainly.
   */
  private updateBenchSits(delta: number): void {
    const hour = this.dayCycle.hour;
    const sitHours = hour >= 8.5 && hour < 20.5;

    this.nextBenchSit -= delta;
    if (
      this.nextBenchSit <= 0 &&
      sitHours &&
      this.benchSits.length < MAX_BENCH_SITS
    ) {
      const seat = this.freeBenchSeat();
      if (!seat) {
        this.nextBenchSit = WAIT_AND_SEE;
      } else {
        this.benchSits.push(
          new BenchSit(this.scene, seat, this.pickBenchPastime(seat)),
        );
        this.nextBenchSit = 18 + Math.random() * 40;
      }
    } else if (this.nextBenchSit <= 0) {
      this.nextBenchSit = sitHours
        ? 12 + Math.random() * 20
        : 50 + Math.random() * 40;
    }

    for (let i = this.benchSits.length - 1; i >= 0; i--) {
      const lot = this.benchSits[i]!;
      lot.update(delta);
      const tossed = lot.claimToss();
      if (tossed) this.bread.push(new Bread(this.scene, tossed));
      if (lot.isDone()) {
        lot.dispose();
        this.benchSits.splice(i, 1);
      }
    }
  }

  private pickBenchPastime(seat: {
    x: number;
    z: number;
    crowd?: "elder";
  }): BenchPastime {
    if (seat.crowd === "elder") {
      return Math.random() < 0.55 ? "chat" : "book";
    }
    const nearWater = distanceToShore(seat.x, seat.z) < 12;
    const roll = Math.random();
    if (nearWater) {
      return roll < 0.42
        ? "feed"
        : roll < 0.64
          ? "chat"
          : roll < 0.84
            ? "phone"
            : "book";
    }
    return roll < 0.38 ? "chat" : roll < 0.72 ? "phone" : "book";
  }

  private freeBenchSeat() {
    const taken = this.benchSits.map((lot) => lot.getSeat());
    const options = sitterBenchSeats().filter((seat) => {
      // Rose benches can fill in view — you want to see the older lot sat there.
      if (seat.crowd !== "elder" && this.inShot(seat.x, seat.z, 0)) return false;
      for (const used of taken) {
        const dx = used.x - seat.x;
        const dz = used.z - seat.z;
        if (dx * dx + dz * dz < 2.5 * 2.5) return false;
      }
      return true;
    });
    if (options.length === 0) return null;

    // Fill rose-garden seats first so the older lot show up.
    const rose = options.filter((seat) => seat.crowd === "elder");
    if (rose.length > 0 && Math.random() < 0.72) {
      return rose[Math.floor(Math.random() * rose.length)]!;
    }

    // Prefer lakeside seats so bird-feeding shows up where swans can notice.
    const lakeside = options.filter(
      (seat) => distanceToShore(seat.x, seat.z) < 10,
    );
    const pool = lakeside.length > 0 && Math.random() < 0.7 ? lakeside : options;
    return pool[Math.floor(Math.random() * pool.length)]!;
  }

  /**
   * Later in the shift a disposable can set the grass off. One fire a day —
   * hose it before it walks the green.
   */
  private updateGrassFire(delta: number): void {
    const hour = this.dayCycle.hour;

    if (
      !this.fireMissionDone &&
      !this.grassFire &&
      missionWindowOpen("fire", hour)
    ) {
      const prefer = getMissionSpot("fire");
      const cooking = this.bbqs
        .filter((party) => party.isCooking())
        .sort((a, b) => {
          const ap = a.getPosition();
          const bp = b.getPosition();
          const ad =
            (ap.x - prefer.x) * (ap.x - prefer.x) +
            (ap.z - prefer.z) * (ap.z - prefer.z);
          const bd =
            (bp.x - prefer.x) * (bp.x - prefer.x) +
            (bp.z - prefer.z) * (bp.z - prefer.z);
          return ad - bd;
        });
      if (cooking.length > 0 && Math.random() < delta * 0.012) {
        const party = cooking[0]!;
        const at = party.getPosition();
        this.grassFire = new GrassFire(this.scene, at);
        party.scarper();
        this.callouts.raise("fire", this.dayCycle.clockFace(), {
          x: at.x,
          z: at.z,
        });
        this.announceMission("fire");
      } else if (cooking.length === 0 && Math.random() < delta * 0.004) {
        // Authored fire pin — still light even if no BBQ is on.
        const at = new THREE.Vector3(prefer.x, 0, prefer.z);
        this.grassFire = new GrassFire(this.scene, at);
        this.callouts.raise("fire", this.dayCycle.clockFace(), prefer);
        this.announceMission("fire");
      }
    }

    if (!this.grassFire) return;
    this.grassFire.update(delta);

    const blaze = this.grassFire.getPosition();
    for (const person of this.people) {
      person.panicFromFire(blaze);
    }
    for (const crabber of this.crabbers) {
      crabber.fightFire(this.grassFire, delta);
    }

    // Litter on the green goes up with the grass.
    for (let i = this.litter.length - 1; i >= 0; i--) {
      const piece = this.litter[i]!;
      if (piece.isTaken()) continue;
      const at = piece.getPosition();
      const flame = this.grassFire.nearestFlame(at);
      if (!flame || flame.distanceTo(at) > 1.8) continue;
      piece.dispose();
      this.litter.splice(i, 1);
    }

    // Let it get away from you and that's a complaint on the record.
    if (!this.fireComplaint && this.grassFire.burningCount() >= 18) {
      this.fireComplaint = true;
      this.complain();
    }

    if (this.grassFire.claimCleared()) {
      this.fireMissionDone = true;
      this.cleaned += 1;
      this.comboRun = this.comboLeft > 0 ? this.comboRun + 1 : 1;
      this.comboLeft = COMBO_WINDOW;
      this.score += 40 * this.multiplier();
      this.updateHUD();
      this.callouts.raise("praise", this.dayCycle.clockFace());
    }

    if (this.grassFire.isDone()) {
      this.grassFire.dispose();
      this.grassFire = null;
      this.fireMissionDone = true;
    }
  }

  /**
   * Early afternoon: lads nick a swan pedalo. Hire one, chase, hose the hull
   * until she sinks — they abandon, wade out, and run off.
   */
  private updateSwanboatMission(delta: number): void {
    const hour = this.dayCycle.hour;
    const open = missionWindowOpen("swanboat", hour);
    const wasOpen =
      this.swanboatHourWas < 0
        ? false
        : missionWindowOpen("swanboat", this.swanboatHourWas);
    if (
      !this.swanboatMissionStarted &&
      !this.swanboatMissionDone &&
      open &&
      !wasOpen
    ) {
      this.beginSwanboatMission();
    }
    this.swanboatHourWas = hour;

    if (!this.stolenSwanboat) return;
    const player = this.camera.position;
    this.stolenSwanboat.update(delta, player);

    if (this.stolenSwanboat.claimStolen()) {
      const tip = this.stolenSwanboat.aimSpot() ?? getMissionSpot("swanboat");
      this.callouts.raise("swanboat", this.dayCycle.clockFace(), tip);
      this.messages.send(
        "BOAT HIRE",
        "Lads have nicked a swan! Get in one and chase them — fill their hull till she sinks. Mind the odd can.",
        this.dayCycle.clockFace(),
        14,
      );
      this.announceMission("swanboat");
    }

    if (this.stolenSwanboat.claimCanHit()) {
      const from = this.stolenSwanboat.aimSpot();
      this.takeStrike(
        from
          ? new THREE.Vector3(from.x, 1.2, from.z)
          : this.camera.position.clone(),
      );
    }

    if (this.stolenSwanboat.claimSunk()) {
      parkAudio.waterSplash(1.2, 0);
      this.messages.send(
        "BOAT HIRE",
        "She's going under — they'll wade out then scarper round the path. Keep after them.",
        this.dayCycle.clockFace(),
        12,
      );
    }

    if (this.stolenSwanboat.claimCleared()) {
      this.cleaned += 1;
      this.comboRun = this.comboLeft > 0 ? this.comboRun + 1 : 1;
      this.comboLeft = COMBO_WINDOW;
      this.score += 90 * this.multiplier();
      this.updateHUD();
      this.messages.send(
        "BOAT HIRE",
        "Lads scarpered. Swan'll be hauled out and dried. Nice work.",
        this.dayCycle.clockFace(),
        14,
      );
      this.callouts.raise("praise", this.dayCycle.clockFace());
    }

    if (this.stolenSwanboat.isDone()) {
      this.stolenSwanboat.dispose();
      this.stolenSwanboat = null;
      this.swanboatMissionDone = true;
    }
  }

  private beginSwanboatMission(): void {
    this.swanboatMissionStarted = true;
    this.stolenSwanboat = new StolenSwanboat(this.scene);
    if (this.stolenSwanboat.isDone()) {
      this.stolenSwanboat.dispose();
      this.stolenSwanboat = null;
      this.swanboatMissionDone = true;
    }
    // Banner / radio wait until they actually nick the boat (claimStolen).
  }

  /**
   * Ten o'clock: boy racers thrash the esplanade a few times, then one of them
   * loses it and ends up steaming in the lake.
   */
  private updateRacerMission(delta: number): void {
    const hour = this.dayCycle.hour;
    const open = missionWindowOpen("racers", hour);
    const wasOpen =
      this.racerHourWas < 0
        ? false
        : missionWindowOpen("racers", this.racerHourWas);
    if (!this.racerMissionStarted && !this.racerMissionDone && open && !wasOpen) {
      this.beginRacerMission();
    }
    this.racerHourWas = hour;

    if (!this.boyRacers) return;
    this.boyRacers.update(delta);

    if (this.boyRacers.claimRoar()) {
      parkAudio.engineRoar(1);
    }
    if (this.boyRacers.claimWaterHit()) {
      const at = this.boyRacers.aimSpot();
      const here = this.camera.position;
      const pan = at
        ? Math.max(-1, Math.min(1, (at.x - here.x) / 40))
        : 0;
      parkAudio.boatCrash(1);
      parkAudio.waterSplash(1.35, pan);
      parkAudio.steamHiss(1.1);
      this.messages.send(
        "PCSO GRANT",
        "One of them's gone in the lake. Steam coming off it like a kettle. Leave it — recovery's coming.",
        this.dayCycle.clockFace(),
        14,
      );
    }
    if (this.boyRacers.claimCrash()) {
      this.cleaned += 1;
      this.comboRun = this.comboLeft > 0 ? this.comboRun + 1 : 1;
      this.comboLeft = COMBO_WINDOW;
      this.score += 70 * this.multiplier();
      this.updateHUD();
    }

    if (this.boyRacers.isDone()) {
      this.boyRacers.dispose();
      this.boyRacers = null;
      this.racerMissionDone = true;
    }
  }

  private beginRacerMission(): void {
    this.racerMissionStarted = true;
    this.boyRacers = new BoyRacers(this.scene);
    if (this.boyRacers.isDone()) {
      this.boyRacers.dispose();
      this.boyRacers = null;
      this.racerMissionDone = true;
      return;
    }
    const tip = getMissionSpot("racers");
    this.callouts.raise("racers", this.dayCycle.clockFace(), tip);
    this.messages.send(
      "PCSO GRANT",
      "Skylines on the esplanade — underglow, full chat. They're hammering it up and down the seafront. Stay off the road.",
      this.dayCycle.clockFace(),
      12,
    );
    this.announceMission("racers");
  }

  /**
   * One o'clock: Gosport separatists storm the beach. Phone lights up, then
   * they come over the esplanade — hose them back or the park falls.
   */
  private updateRebelMission(delta: number): void {
    const hour = this.dayCycle.hour;

    const rebelsOpen = missionWindowOpen("rebels", hour);
    const rebelsWereOpen =
      this.rebelHourWas < 0
        ? false
        : missionWindowOpen("rebels", this.rebelHourWas);
    if (!this.rebelMissionStarted && rebelsOpen && !rebelsWereOpen) {
      this.beginRebelMission();
    }
    this.rebelHourWas = hour;

    // Staggered major-incident traffic after the first blast.
    if (this.rebelBriefing.length > 0) {
      for (const note of this.rebelBriefing) note.wait -= delta;
      while (this.rebelBriefing.length > 0 && this.rebelBriefing[0]!.wait <= 0) {
        const note = this.rebelBriefing.shift()!;
        this.messages.send(
          note.from,
          note.text,
          this.dayCycle.clockFace(),
          18,
        );
      }
    }

    if (!this.rebelRaid) return;
    this.rebelRaid.update(delta, this.camera.position);

    const swing = this.rebelRaid.claimSwing();
    if (swing) this.takeStrike(swing);

    if (this.rebelRaid.isCleared() && !this.rebelMissionWon) {
      this.cleaned += 1;
      this.comboRun = this.comboLeft > 0 ? this.comboRun + 1 : 1;
      this.comboLeft = COMBO_WINDOW;
      this.score += 200 * this.multiplier();
      this.updateHUD();
      this.messages.send(
        "999 CONTROL",
        "Rebels breaking for the beach. Canoe Lake secure. Armed response inbound — stand down, cleaner.",
        this.dayCycle.clockFace(),
        16,
      );
      this.callouts.raise("praise", this.dayCycle.clockFace());
      this.triumph();
    }

    if (this.rebelRaid.isGone()) {
      this.rebelRaid.dispose();
      this.rebelRaid = null;
    }
  }

  private beginRebelMission(): void {
    this.rebelMissionStarted = true;
    this.rebelBriefing = [
      {
        wait: 0,
        from: "999 CONTROL",
        text: "MAJOR INCIDENT. Gosport separatist rebels are storming Southsea Beach.",
      },
      {
        wait: 3.2,
        from: "999 CONTROL",
        text: "Intent: open an insurgency around Canoe Lake. Police and armed forces are mobilising — ETA unknown.",
      },
      {
        wait: 7.0,
        from: "ARMED RESPONSE",
        text: "All units held south of the pier. Cleaner on scene is the only asset inside the park. Hold the lake.",
      },
      {
        wait: 11.5,
        from: "DEPOT",
        text: "That's you, mush. Defend Canoe Lake at all costs. Hose anything that comes over the esplanade.",
      },
    ];
    this.rebelRaid = new RebelRaid(this.scene, 14, getMissionSpot("rebels"));
    this.announceMission("rebels");
  }

  /** Banner + throbbing red arrow / mini-map pins when a scripted job starts. */
  private announceMission(id: MissionId): void {
    this.missionBanner.show(MISSION_LABELS[id]);
    this.missionArrow.pulse(9);
    this.miniMap.pulseMissions(9);
  }

  /**
   * Positions of everyone on foot this frame — path walkers steer around
   * walls, benches, the player, and each other.
   */
  private refreshWalkCrowd(): void {
    const pts: { x: number; z: number }[] = [
      { x: this.camera.position.x, z: this.camera.position.z },
    ];
    const add = (at: THREE.Vector3) => {
      pts.push({ x: at.x, z: at.z });
    };
    for (const person of this.people) add(person.getPosition());
    if (this.boatman) add(this.boatman.getPosition());
    if (this.gardener) add(this.gardener.getPosition());
    for (const crabber of this.crabbers) add(crabber.getPosition());
    for (const party of this.bbqs) {
      for (const at of party.guestPositions()) add(at);
    }
    for (const party of this.picnics) {
      for (const p of party.crowdBlockers()) pts.push(p);
    }
    for (const party of this.gazebos) {
      for (const at of party.guestPositions()) add(at);
    }
    for (const lot of this.benchSits) {
      for (const at of lot.guestPositions()) add(at);
    }
    for (const visit of this.playVisits) {
      for (const at of visit.guestPositions()) add(at);
    }
    for (const match of this.football) {
      for (const at of match.guestPositions()) add(at);
    }
    for (const lot of this.drunks) {
      for (const at of lot.guestPositions()) add(at);
    }
    setWalkCrowd(pts);
  }

  private freeLawnGatherSpot(spacing: number): THREE.Vector2 | null {
    return this.freeLawnGatherSpotNear(null, null, spacing);
  }

  /** Prefer lawn near an authored mission pin when one is given. */
  private freeLawnGatherSpotNear(
    nearX: number | null,
    nearZ: number | null,
    spacing: number,
    opts?: { allowInShot?: boolean },
  ): THREE.Vector2 | null {
    const occupied: THREE.Vector3[] = [
      ...this.bbqs.map((party) => party.getPosition()),
      ...this.picnics.map((party) => party.getPosition()),
      ...this.gazebos.map((party) => party.getPosition()),
      ...this.football.map((match) => match.getPosition()),
    ];
    const options = lawnGatherSpots().filter((spot) => {
      if (!opts?.allowInShot && this.inShot(spot.x, spot.y, 0)) return false;
      if (atParkBuilding(spot.x, spot.y)) return false;
      for (const at of occupied) {
        const dx = at.x - spot.x;
        const dz = at.z - spot.y;
        if (dx * dx + dz * dz < spacing * spacing) return false;
      }
      return true;
    });
    if (options.length === 0) return null;

    if (nearX != null && nearZ != null) {
      let best = options[0]!;
      let bestD = Infinity;
      for (const spot of options) {
        const dx = spot.x - nearX;
        const dz = spot.y - nearZ;
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = spot;
        }
      }
      return best.clone();
    }

    // Prefer the middle of the east green (south of the play park), not the
    // sea-wall fringe or the far fence line.
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const spot of options) {
      minX = Math.min(minX, spot.x);
      maxX = Math.max(maxX, spot.x);
      minZ = Math.min(minZ, spot.y);
      maxZ = Math.max(maxZ, spot.y);
    }
    const midX = (minX + maxX) * 0.5;
    const midZ = minZ + (maxZ - minZ) * 0.45;
    const spanX = Math.max(1, maxX - minX);
    const spanZ = Math.max(1, maxZ - minZ);
    let total = 0;
    const weights = options.map((spot) => {
      const nx = (spot.x - midX) / (spanX * 0.45);
      const nz = (spot.y - midZ) / (spanZ * 0.4);
      const w = Math.exp(-(nx * nx + nz * nz) * 0.7) + 0.12;
      total += w;
      return w;
    });
    let roll = Math.random() * total;
    for (let i = 0; i < options.length; i++) {
      roll -= weights[i]!;
      if (roll <= 0) return options[i]!.clone();
    }
    return options[options.length - 1]!.clone();
  }

  /**
   * Kids on the big east green with jumpers for goalposts — daytime, dry
   * weather, one match at a time.
   */
  private updateFootball(delta: number): void {
    const hour = this.dayCycle.hour;
    const footyHours = hour >= 10 && hour < 17.5;
    const dry = this.weather.rainStrength() < 0.1;

    this.nextFootball -= delta;
    if (
      this.nextFootball <= 0 &&
      footyHours &&
      dry &&
      this.football.length < MAX_FOOTBALL
    ) {
      // Pitch is ~19×11 m — clear blankets/BBQs by that, not a huge no-go zone.
      // Prefer the picnic green; kids walk in from the gate so in-shot is fine.
      const prefer = getMissionSpot("picnic");
      const spot =
        this.freeLawnGatherSpotNear(prefer.x, prefer.z, 18, {
          allowInShot: true,
        }) ??
        this.freeLawnGatherSpotNear(null, null, 16, { allowInShot: true });
      if (!spot) {
        this.nextFootball = 10 + Math.random() * 14;
      } else {
        this.football.push(new FootballKickabout(this.scene, spot));
        this.nextFootball = 90 + Math.random() * 130;
      }
    } else if (this.nextFootball <= 0) {
      this.nextFootball = footyHours
        ? 20 + Math.random() * 30
        : 100 + Math.random() * 80;
    }

    for (let i = this.football.length - 1; i >= 0; i--) {
      const match = this.football[i]!;
      match.update(delta);
      if (match.isDone()) {
        match.dispose();
        this.football.splice(i, 1);
      }
    }
  }

  /**
   * Visitors pay at the hire hatch, the boatman helps them into a swan, they
   * pedal about, then bring it back.
   */
  private updatePedaloHires(delta: number): void {
    this.boatman?.update(delta, this.camera.position);
    if (this.boatman?.wantsSwing()) {
      this.takeStrike(this.boatman.getPosition());
    }

    this.gardener?.update(delta, this.camera.position, this.people);
    if (this.gardener?.wantsSwing()) {
      this.takeStrike(this.gardener.getPosition());
    }

    if (consumePedaloWreck()) {
      this.boatman?.huntPlayer();
      this.complaints += 1;
      this.score = Math.max(0, this.score - 40);
      this.updateHUD();
      this.messages.send(
        "BOAT HIRE",
        "You've put a swan pedalo on the bottom. The hire bloke is coming for you.",
        this.dayCycle.clockFace(),
        16,
      );
    }

    const hour = this.dayCycle.hour;
    const hireHours = hour >= 9 && hour < 18.5;

    this.nextPedaloHire -= delta;
    if (
      this.nextPedaloHire <= 0 &&
      hireHours &&
      this.pedaloHires.length < MAX_PEDALO_HIRES &&
      this.boatman &&
      !this.boatman.isBusy() &&
      freePedaloCount() > 1
    ) {
      const hatch = hatchQueueSpot();
      if (!hatch || this.inShot(hatch.x, hatch.z, 0.4)) {
        this.nextPedaloHire = WAIT_AND_SEE;
      } else {
        this.pedaloHires.push(new PedaloHire(this.scene, this.boatman));
        this.nextPedaloHire = 40 + Math.random() * 70;
      }
    } else if (this.nextPedaloHire <= 0) {
      this.nextPedaloHire = hireHours
        ? 18 + Math.random() * 25
        : 90 + Math.random() * 80;
    }

    for (let i = this.pedaloHires.length - 1; i >= 0; i--) {
      const hire = this.pedaloHires[i]!;
      hire.update(delta);
      if (hire.isDone()) {
        hire.dispose();
        this.pedaloHires.splice(i, 1);
      }
    }
  }

  /**
   * Kids walking into the play park through the day — swings, slide, spring
   * animal, tearing about — with a parent waiting inside the gate or on a
   * bench, then off again when they've had enough.
   */
  private updatePlayVisits(delta: number): void {
    const hour = this.dayCycle.hour;
    const playHours = hour >= 8 && hour < 18.5;

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
      visit.update(delta, this.camera.position);
      if (visit.wantsSwing()) this.takeStrike(visit.getSwingFrom());
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
    const benchFeeders = this.benchSits.filter((lot) => lot.hasFood());

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
      let closestBench: BenchSit | null = null;
      let best = BEG_DISTANCE;
      if (swan.isHungry()) {
        const at = swan.getPosition();
        for (const person of carriers) {
          const gap = person.getPosition().distanceTo(at);
          if (gap < best) {
            best = gap;
            closest = person;
            closestBench = null;
          }
        }
        for (const lot of benchFeeders) {
          const gap = lot.getFeederPosition().distanceTo(at);
          if (gap < best) {
            best = gap;
            closestBench = lot;
            closest = null;
          }
        }
      }

      if (!closest && !closestBench) {
        swan.loseInterest();
        continue;
      }

      const bait = closest
        ? closest.getPosition()
        : closestBench!.getFeederPosition();
      swan.tempt(bait);
      if (swan.wantsFeeding()) {
        if (closest) closest.feedSwan();
        else closestBench!.feedSwan();
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
   * Thick lumps take a footprint bite instead of pancakeing flat.
   */
  private logComplaint(
    dropping: Dropping,
    at?: THREE.Vector3,
    yaw = 0,
  ): void {
    dropping.tread(at, yaw);
    this.complain();
  }

  /**
   * Climb stacked mess lumps and bite deep footprints through them when
   * walking.
   */
  private updatePlayerOnMess(delta: number): void {
    if (this.player.isWading() || this.player.isOnPedalo()) {
      this.player.setGroundLift(0);
      return;
    }
    const px = this.camera.position.x;
    const pz = this.camera.position.z;
    let lift = 0;
    let under: Dropping | null = null;

    for (const pile of this.droppings) {
      if (pile.isRinsing()) continue;
      pile.tickStep(delta);
      if (!pile.coversFoot(px, pz)) continue;
      const h = pile.moundHeight();
      if (h <= lift) continue;
      lift = h;
      under = pile;
    }

    this.player.setGroundLift(lift);

    if (!under || !under.isMound()) return;
    if (this.player.moveSpeed() < 1.2) return;
    if (!under.canStepPrint()) return;

    under.markStepped();
    const yaw = this.player.getHeading();
    const across = 0.11 * this.playerFoot;
    this.playerFoot = -this.playerFoot;
    under.biteFootprint(
      px + Math.cos(yaw) * across,
      pz - Math.sin(yaw) * across,
      yaw,
      true,
    );
  }

  /** Entry wallop or walking wake from the cleaner in the lake. */
  private applyPlayerWadeSplash(): void {
    const splash = this.player.claimWadeSplash();
    if (!splash) return;
    if (splash.big) this.bigSplash(splash.at);
    else this.wadeWake(splash.at);
  }

  /** Small rings under the boots while trudging through. */
  private wadeWake(at: THREE.Vector3): void {
    parkAudio.waterPlop(0.35);
    for (const [radius, life] of [
      [0.45, 0.7],
      [0.85, 1.0],
    ] as const) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(radius * 0.45, radius, 14),
        new THREE.MeshBasicMaterial({
          color: 0xdff2ff,
          transparent: true,
          opacity: 0.45,
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
        ring.scale.setScalar(1 + t * 1.4);
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - t);
        requestAnimationFrame(grow);
      };
      requestAnimationFrame(grow);
    }
  }

  /** Somebody has had enough of you: costs points and kills the combo. */
  private complain(): void {
    this.complaints += 1;
    this.comboRun = 0;
    this.comboLeft = 0;
    this.score = Math.max(0, this.score - 25);
    this.updateHUD();
  }

  /** Soft steam hiss while the hose is on hot grass — not every fleck. */
  private hissFireSteam(): void {
    if (this.fireSteamCool > 0) return;
    this.fireSteamCool = 0.22;
    parkAudio.steamHiss(0.75);
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
    this.refreshPressureGauge();

    const running = this.comboLeft > 0 && this.multiplier() > 1;
    this.comboElement.classList.toggle("active", running);
    if (running) {
      this.comboValueElement.textContent = `x${this.multiplier()}`;
      this.comboFill.style.width = `${(this.comboLeft / COMBO_WINDOW) * 100}%`;
    }
  }

  private refreshPressureGauge(): void {
    const heavyOn = this.player.isHeavyHoseActive();
    this.pressurePanel.classList.toggle("on", heavyOn);
    if (!heavyOn) {
      this.pressurePanel.setAttribute("aria-hidden", "true");
      return;
    }
    const frac = this.player.heavyTankFraction();
    const pct = Math.round(frac * 100);
    this.pressureFill.style.height = `${pct}%`;
    this.pressurePct.textContent = `${pct}%`;
    this.pressurePanel.classList.toggle("low", frac < 0.28);
    this.pressurePanel.setAttribute("aria-hidden", "false");
  }

  private updateParkAudio(delta: number): void {
    const here = this.camera.position;
    let gullsNear = 0;
    for (const gull of this.gulls) {
      if (gull.getPosition().distanceTo(here) < 55) gullsNear += 1;
    }
    let ducksNear = 0;
    for (const duck of this.ducks) {
      if (duck.getPosition().distanceTo(here) < 40) ducksNear += 1;
    }
    const swanAngry = this.swans.some(
      (swan) => swan.isCharging() || swan.isWingsOut(),
    );
    const flyovers = [
      ...this.planes
        .filter((p) => p.isInFlight())
        .map((p) => {
          const at = p.getPosition();
          return { id: p.id, kind: p.kind, x: at.x, y: at.y, z: at.z };
        }),
      ...this.helicopters
        .filter((h) => h.isInFlight())
        .map((h) => {
          const at = h.getPosition();
          return {
            id: h.id + 10_000,
            kind: "heli" as const,
            x: at.x,
            y: at.y,
            z: at.z,
          };
        }),
    ];
    const pedalling = this.player.getPedalEffort();
    const traffic = [
      ...this.traffic
        .filter((car) => car.isDriving())
        .map((car) => {
          const at = car.getPosition();
          return {
            id: car.id,
            x: at.x,
            y: at.y,
            z: at.z,
            speed: car.getSpeed(),
            music: car.playingMusic,
          };
        }),
      ...(this.boyRacers?.trafficCues() ?? []),
    ];
    parkAudio.update(delta, {
      hosing: this.player.isHosing(),
      heavyHose: this.player.isHeavyHoseActive(),
      swanAngry,
      gullsNear,
      ducksNear,
      pedalling,
      flyovers,
      traffic,
      listener: { x: here.x, y: here.y, z: here.z },
      paused: false,
    });
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

    if (this.paused) {
      this.clock.getDelta();
      parkAudio.update(0, {
        hosing: false,
        swanAngry: false,
        gullsNear: 0,
        ducksNear: 0,
        paused: true,
      });
      this.renderer.render(this.scene, this.camera);
      return;
    }

    const delta = Math.min(this.clock.getDelta(), 0.05);

    if (this.dead) {
      parkAudio.update(delta, {
        hosing: false,
        swanAngry: false,
        gullsNear: 0,
        ducksNear: 0,
        paused: false,
      });
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.player.update(delta);
    if (this.shiftIntro?.isActive()) {
      this.shiftIntro.update(delta);
      if (!this.shiftIntro.isActive()) this.finishIntro();
    }
    this.updateParkAudio(delta);
    this.updatePlayerOnMess(delta);
    this.applyPlayerWadeSplash();
    // Worked out once, up front: everything that spawns this frame checks it.
    this.refreshView();
    this.mendUp(delta);

    this.temptSwans();
    this.birdScraps(delta);

    const crowd = this.people.map((person) => person.getPosition());
    crowd.push(this.camera.position);
    for (const swan of this.swans) {
      swan.noticeCrowd(crowd);
      swan.update(delta, this.camera.position, this.swans);
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
    if (this.fireSteamCool > 0) {
      this.fireSteamCool = Math.max(0, this.fireSteamCool - delta);
    }
    const activeMess = this.droppings.filter(
      (dropping) => !dropping.isRinsing(),
    );
    const mess = activeMess.map((dropping) => dropping.getPosition());
    this.refreshWalkCrowd();
    this.updatePeople(delta, activeMess);

    this.elapsed += delta;
    const wind = this.weather.getWind();
    const chop =
      Math.min(1, wind.length() / 14) * 0.45 +
      this.weather.rainStrength() * 0.4 +
      this.weather.gloom * 0.35;
    setPedaloChop(chop);
    bobPedalos(this.elapsed, delta);
    this.updateDroppings(delta);
    this.updateFeederRush(delta);
    this.updatePicnicRaid(delta);
    this.updateGooseMission(delta);
    this.updatePigeonMission(delta);
    this.updatePedaloBirdHits();
    this.updateEveningClearout(delta);
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
    this.refreshWalkCrowd();
    this.updateDrunks(delta);
    this.watchForAttacks();
    this.watchTheState();
    this.callouts.update(delta);
    this.messages.update(delta);
    this.missionBanner.update(delta);
    this.updateCyclists(delta, mess);
    this.updateTraffic(delta);
    this.updateBoats(delta);
    this.updateCrabbers(delta);
    this.updatePedaloHires(delta);
    this.refreshWalkCrowd();
    this.updateBbqs(delta);
    this.updatePicnics(delta);
    this.updateGazebos(delta);
    this.updateBenchSits(delta);
    this.updateFootball(delta);
    this.updateGrassFire(delta);
    this.updateSwanboatMission(delta);
    this.updateRacerMission(delta);
    this.updateRebelMission(delta);
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
        ...(this.boatman ? [this.boatman.getPosition()] : []),
        ...(this.gardener ? [this.gardener.getPosition()] : []),
        ...this.pedaloHires.flatMap((hire) => hire.guestPositions()),
        ...this.bbqs.flatMap((party) => party.guestPositions()),
        ...this.picnics.flatMap((party) => party.guestPositions()),
        ...this.gazebos.flatMap((party) => party.guestPositions()),
        ...this.benchSits.flatMap((lot) => lot.guestPositions()),
        ...this.playVisits.flatMap((visit) => visit.guestPositions()),
        ...this.football.flatMap((match) => match.guestPositions()),
        ...this.drunks.flatMap((lot) => lot.guestPositions()),
      ],
      cyclists: [
        ...this.cyclists.map((rider) => rider.getPosition()),
        ...(this.rebelRaid?.getPositions() ?? []),
      ],
      scooters: this.scooters.map((scooter) => scooter.getPosition()),
      traffic: this.traffic.map((car) => car.getPosition()),
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
      radar:
        this.gooseFlock && !this.gooseMissionDone
          ? this.gooseFlock.radarBlips()
          : undefined,
      missions: this.eventMissionSpots(),
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
    const heading = this.player.getHeading();
    this.compass.update(heading);
    this.objectiveArrow.update(
      this.camera,
      this.camera.position,
      heading,
      this.objectiveSpots(),
      delta,
    );
    this.missionArrow.update(
      this.camera,
      this.camera.position,
      heading,
      this.eventMissionSpots(),
      delta,
    );

    this.refreshPressureGauge();
    this.renderer.render(this.scene, this.camera);
  };

  /**
   * Red arrow — scripted missions only: picnic dive, geese, grass fire, rebels.
   * Ambient urgencies (drunks, dunks) use the yellow mess arrow.
   */
  private eventMissionSpots(): { x: number; z: number }[] {
    if (!this.onDuty) return [];
    const spots: { x: number; z: number }[] = [];

    if (this.picnicRaidActive && this.picnicRaidTip) {
      spots.push(this.picnicRaidTip);
    }

    if (
      this.gooseMissionStarted &&
      !this.gooseMissionDone &&
      !this.gooseHeavyArmed
    ) {
      const van = vanSpotWorld();
      if (van) spots.push(van);
    } else if (this.gooseFlock && !this.gooseMissionDone) {
      const c = this.gooseFlock.getCentre();
      spots.push({ x: c.x, z: c.z });
    }

    if (this.grassFire?.isBurning()) {
      const at = this.grassFire.getPosition();
      spots.push({ x: at.x, z: at.z });
    }

    if (this.stolenSwanboat?.isActive()) {
      const aim = this.stolenSwanboat.aimSpot();
      if (aim) spots.push(aim);
    }

    if (this.rebelRaid?.isActive()) {
      for (const at of this.rebelRaid.getPositions()) {
        spots.push({ x: at.x, z: at.z });
      }
    }

    if (this.boyRacers?.isActive()) {
      const aim = this.boyRacers.aimSpot();
      if (aim) spots.push(aim);
    }

    if (this.pigeonMissionStarted && !this.pigeonMissionDone) {
      const spot = getMissionSpot("pigeons");
      spots.push({ x: spot.x, z: spot.z });
    }

    return spots;
  }

  /**
   * Yellow arrow — dirt, and other jobs that aren't a radio mission
   * (drunks, someone in the drink).
   */
  private objectiveSpots(): { x: number; z: number }[] {
    if (!this.onDuty) return [];
    const spots: { x: number; z: number }[] = [];

    // Opening tip first — don't send them chasing litter until that wave's done.
    if (!this.secondEventDone && this.overnightPiles.size > 0) {
      for (const dropping of this.overnightPiles) {
        const at = dropping.arrowSpot();
        if (at) spots.push(at);
      }
      if (spots.length > 0) return spots;
      // Piles look clear but aren't credited yet — fall through to other jobs.
    }

    // Feeder rush: only tip the empty NW stretch when there's no mess there yet.
    if (this.feederRushLeft > 0 && this.feederTip) {
      const tip = this.feederTip;
      const covered = this.droppings.some((d) => {
        if (!d.hasVisibleMess()) return false;
        const at = d.getPosition();
        return Math.hypot(at.x - tip.x, at.z - tip.z) < 14;
      });
      if (!covered) spots.push(tip);
    }

    for (const lot of this.drunks) {
      if (lot.isGone()) continue;
      const at = lot.getPosition();
      spots.push({ x: at.x, z: at.z });
    }
    for (const person of this.people) {
      if (!person.isInTheDrink()) continue;
      const at = person.getPosition();
      spots.push({ x: at.x, z: at.z });
    }

    for (const dropping of this.droppings) {
      const at = dropping.arrowSpot();
      if (at) spots.push(at);
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
      if (!print.isWorthArrow()) continue;
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

  /** Stop the shift mid-flow — overlay up, mouse free, nothing ticks. */
  public setPaused(on: boolean): void {
    if (this.dead) return;
    if (this.paused === on) return;
    this.paused = on;
    document.body.classList.toggle("paused", on);
    document.getElementById("pause-menu")!.classList.toggle("on", on);
    if (on) {
      this.player.halt();
    } else {
      this.clock.getDelta();
    }
  }

  public togglePause(): void {
    this.setPaused(!this.paused);
  }

  public isPaused(): boolean {
    return this.paused;
  }
}
