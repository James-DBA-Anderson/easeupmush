import * as THREE from "three";
import { Player, type Tool } from "./Player";
import { Swan } from "./entities/Swan";
import { Person } from "./entities/Person";
import { Dropping, type DropKind } from "./entities/Dropping";
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
import { Fox } from "./entities/Fox";
import {
  PATH_LOOP,
  PATH_OUTER,
  WATER_Y,
  buildGround,
  buildLake,
  buildPaths,
  isInLake,
  offsetShore,
  waterSpot,
} from "./world/lake";
import { buildBench } from "./world/bench";
import { plantTrees } from "./world/trees";
import { buildSurrounds, lightWindows } from "./world/buildings";
import { buildFencing } from "./world/fence";
import {
  buildParkBuildings,
  bobPedalos,
  binStations,
  taggableWalls,
} from "./world/park";
import { DayCycle } from "./systems/DayCycle";
import { Weather } from "./systems/Weather";
import { MiniMap } from "./ui/MiniMap";
import { Mugshot } from "./ui/Mugshot";
import { Messages } from "./ui/Messages";
import { Callouts } from "./systems/Callouts";

const WASH_RADIUS = 1.6;
/** How near the spike has to come down to get a bit of rubbish. */
const SPEAR_RADIUS = 1.3;

/** How far ahead a job counts as the one they're lining up for. */
const PICKER_SIGHT = 4.5;
const HOSE_SIGHT = 9;
/** Seconds you have to land the next one before the combo lapses. */
const COMBO_WINDOW = 4;
const COMBO_CAP = 5;

/** How far off a swan will spot someone with food, and a pile of bread. */
const BEG_DISTANCE = 24;
const BREAD_DISTANCE = 40;

/** Two at once is plenty — they're meant to be an occasional nuisance. */
const MAX_CYCLISTS = 2;
const MAX_SCOOTERS = 2;
const MAX_BOATS = 2;
const MAX_CRABBERS = 6;

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
  private droppings: Dropping[] = [];
  private footprints: Footprint[] = [];
  private litter: Litter[] = [];
  private bread: Bread[] = [];
  private cyclists: Cyclist[] = [];
  private nextCyclist = 8 + Math.random() * 20;
  private scooters: Scooter[] = [];
  private nextScooter = 12 + Math.random() * 30;
  private boats: RcBoat[] = [];
  private nextBoat = 15 + Math.random() * 30;
  private crabbers: Crabber[] = [];
  private nextCrabber = 10 + Math.random() * 25;
  private nextArrival = 25 + Math.random() * 50;
  private nextDeparture = 40 + Math.random() * 60;
  private fox: Fox | null = null;
  private nextFox = 30 + Math.random() * 90;
  private ducks: Duck[] = [];
  private nextDuck = 20 + Math.random() * 40;
  private gulls: Gull[] = [];
  private nextGull = 30 + Math.random() * 60;
  private squirrels: Squirrel[] = [];
  private planes: Plane[] = [];
  private nextPlane = 20 + Math.random() * 60;
  private nextSpitfire = 200 + Math.random() * 500;
  private bins: Bin[] = [];
  private graffiti: Graffiti[] = [];
  private nextTag = 60 + Math.random() * 120;
  private branchKids: BranchKid[] = [];
  private nextBranchKid = 45 + Math.random() * 120;

  private clock: THREE.Clock;
  /** Seconds of play, for anything that just needs a steady wave in it. */
  private elapsed = 0;
  private cleanliness: number = 100;
  private score: number = 0;

  private dayCycle: DayCycle;
  private weather: Weather;
  private miniMap: MiniMap;
  private mugshot: Mugshot;
  private messages: Messages;
  private callouts: Callouts;

  private ambientLight!: THREE.AmbientLight;
  private sunLight!: THREE.DirectionalLight;

  private cleaned = 0;
  private comboRun = 0;
  private comboLeft = 0;
  private hurtLeft = 0;
  private complaints = 0;

  private health = HEALTH_MAX;
  private sincePecked = HEAL_DELAY;
  private dead = false;
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
  private toolElement: HTMLElement;
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
    this.camera.position.set(0, 1.7, 62);
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
    this.toolElement = document.getElementById("tool-name")!;
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

    this.messages = new Messages(document.getElementById("messages")!);
    this.callouts = new Callouts(this.messages);

    this.setupScene();
    this.setupLights();
    this.spawnSwans();
    this.spawnPeople();
    // A raft of mallards is already out there when the shift starts.
    for (let i = 0; i < DUCKS_TO_START; i++) {
      this.ducks.push(new Duck(this.scene, false));
    }
    this.gulls.push(new Gull(this.scene, new THREE.Vector2(0, 0)));
    for (let i = 0; i < SQUIRRELS; i++) {
      this.squirrels.push(new Squirrel(this.scene));
    }
    this.applyTimeAndWeather(0);

    for (const spot of binStations()) {
      this.bins.push(new Bin(this.scene, spot.x, spot.z));
    }
    this.callouts.raise("shift", this.dayCycle.clockFace());

    window.addEventListener("resize", () => this.onWindowResize());
  }

  private setupScene(): void {
    buildGround(this.scene, 400);
    buildLake(this.scene);
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
    this.sunLight.shadow.camera.left = -160;
    this.sunLight.shadow.camera.right = 160;
    this.sunLight.shadow.camera.top = 160;
    this.sunLight.shadow.camera.bottom = -160;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.scene.add(this.sunLight);
  }

  private applyTimeAndWeather(delta: number): void {
    this.dayCycle.update(delta);
    const sky = this.dayCycle.skyState();
    this.weather.update(delta, sky);

    const gloom = this.weather.gloom;
    this.ambientLight.intensity = sky.ambient * (1 - gloom * 0.4);
    // Only a hint of the sky's colour, or dawn turns the grass brown.
    this.ambientLight.color.copy(sky.sky).lerp(new THREE.Color(0xffffff), 0.78);
    this.sunLight.intensity = sky.sun * (1 - gloom);
    this.sunLight.color.copy(sky.sunColor);
    this.sunLight.position.copy(sky.sunPosition);
    // Soft shadows look wrong under cloud; fade them out with the sun.
    this.sunLight.castShadow = this.sunLight.intensity > 0.2;
    // Lights come on across the seafront as the daylight goes.
    lightWindows(THREE.MathUtils.clamp(1 - sky.sun / 0.45, 0, 1));
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
    const count = 14;
    for (let i = 0; i < count; i++) {
      this.people.push(new Person(this.scene, Math.random() * 180));
    }
  }

  public addDropping(position: THREE.Vector3, kind: DropKind = "swan"): void {
    this.droppings.push(new Dropping(position, this.scene, kind));
  }

  /**
   * A droplet in flight. If it caught a swan, that one takes offence and its
   * neighbours square up with it — mute swans are not a forgiving bird.
   */
  public sprayHitsBody(point: THREE.Vector3): boolean {
    // Water hitting a tagged wall lifts the paint rather than carrying on.
    for (const tag of this.graffiti) {
      if (!tag.hitBy(point)) continue;
      tag.scrub();
      return true;
    }

    // Kids caught in the spray drop off the branch and clear off sharpish.
    for (const lot of this.branchKids) {
      if (lot.getPosition().distanceTo(point) > 2.5) continue;
      lot.scarper();
      return true;
    }

    // Ducks and gulls just go up; neither will stand and argue about it.
    for (const gull of this.gulls) {
      if (gull.getPosition().distanceTo(point) > 2) continue;
      gull.flush();
      return true;
    }
    for (const duck of this.ducks) {
      if (duck.getPosition().distanceTo(point) > 1.5) continue;
      duck.flush();
      return true;
    }
    for (const squirrel of this.squirrels) {
      if (squirrel.getPosition().distanceTo(point) > 1.2) continue;
      squirrel.flush();
      return true;
    }

    for (const swan of this.swans) {
      if (!swan.soakedBy(point)) continue;

      swan.soak();
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
      if (!person.soakedBy(point)) continue;
      const dry = !person.isSoaked();
      person.drench();
      // One complaint per soaking, not one per droplet.
      if (dry) this.complain();
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
  public washAt(point: THREE.Vector3): void {
    for (let i = this.droppings.length - 1; i >= 0; i--) {
      const dropping = this.droppings[i]!;
      const mesh = dropping.getMesh();
      const dx = mesh.position.x - point.x;
      const dz = mesh.position.z - point.z;
      if (dx * dx + dz * dz > WASH_RADIUS * WASH_RADIUS) continue;

      dropping.clean();
      if (dropping.isCleaned()) {
        this.scene.remove(mesh);
        this.droppings.splice(i, 1);
        this.creditClean();
      }
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
      this.nextGull = 35 + Math.random() * 80;
      this.gulls.push(
        new Gull(this.scene, new THREE.Vector2((Math.random() - 0.5) * 120, 0)),
      );
    }

    let mobbing = false;

    for (const gull of this.gulls) {
      gull.update(delta, this.camera.position, scraps);
      if (gull.isAground()) mobbing = true;
      // A third of beakfuls come back out within the minute, near enough.
      if (gull.claimFeed() && Math.random() < 0.35) {
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
      scraps.push({
        at,
        take: () => pile.peck(),
        going: () => !pile.isGone() && !attended(at),
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
   * The bins filling up over the day, quicker where the park is busy. A full
   * one gets reported once and can be swapped out with the picker.
   */
  private updateBins(delta: number): void {
    for (const bin of this.bins) {
      const at = bin.getPosition();
      let busy = 0;
      for (const person of this.people) {
        if (person.getPosition().distanceTo(at) < 12) busy += 0.4;
      }
      bin.update(delta, busy);
      if (bin.claimReport()) {
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
      if (!this.graffiti[i]!.isClean()) continue;
      this.graffiti[i]!.dispose();
      this.graffiti.splice(i, 1);
      this.creditClean();
    }

    this.nextTag -= delta;
    if (this.nextTag > 0 || this.graffiti.length >= 4) return;
    this.nextTag = 150 + Math.random() * 260;

    const options = taggableWalls();
    const wall = options[Math.floor(Math.random() * options.length)];
    if (!wall) return;
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
      const lot = new BranchKid(this.scene);
      this.branchKids.push(lot);
      this.nextBranchKid = 120 + Math.random() * 200;
      const tree = lot.getTree();
      this.callouts.raise("branches", this.dayCycle.clockFace(), {
        x: tree.x,
        z: tree.y,
      });
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

    if (this.droppings.length >= 8) {
      const worst = this.droppings[0]!.getMesh().position;
      this.callouts.raise("poo", clock, { x: worst.x, z: worst.z });
    }

    if (this.litter.length >= 5) {
      const spot = this.litter[0]!.getPosition();
      this.callouts.raise("litter", clock, { x: spot.x, z: spot.z });
    }

    if (
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
    this.toolElement.textContent =
      tool === "hose"
        ? "PRESSURE WASHER"
        : tool === "picker"
          ? "LITTER PICKER"
          : "NOTHING IN HAND";
    this.instructionsElement.innerHTML =
      tool === "picker"
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
      this.droppings.some((dropping) =>
        looking(dropping.getMesh().position, HOSE_SIGHT, 0.9),
      ) ||
      this.graffiti.some((tag) => looking(tag.getPosition(), HOSE_SIGHT, 0.9)) ||
      this.footprints.some((print) =>
        looking(print.getPosition(), HOSE_SIGHT * 0.6, 0.92),
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
      // Every so often it's a pair of lads on an e-bike instead of a cyclist.
      const lads = Math.random() < 0.35;
      this.cyclists.push(
        new Cyclist(
          this.scene,
          Math.random() * PATH_LOOP.length,
          lads ? "ebike" : "cyclist",
        ),
      );
      this.nextCyclist = 25 + Math.random() * 55;
      if (lads) this.callouts.raise("ebike", this.dayCycle.clockFace());
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

      if (rider.isGone()) {
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
      this.scooters.push(
        new Scooter(this.scene, Math.random() * PATH_LOOP.length),
      );
      this.nextScooter = 40 + Math.random() * 80;
    }

    for (let i = this.scooters.length - 1; i >= 0; i--) {
      const scooter = this.scooters[i]!;
      const splatted = scooter.update(delta, inTheWay, mess);
      if (splatted >= 0) this.logComplaint(this.droppings[splatted]!);

      if (scooter.isGone()) {
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
        this.fox = new Fox(this.scene);
        this.nextFox = 120 + Math.random() * 240;
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
      this.boats.push(new RcBoat(this.scene, waterSpot()));
      this.nextBoat = 60 + Math.random() * 110;
    }

    for (let i = this.boats.length - 1; i >= 0; i--) {
      const boat = this.boats[i]!;
      boat.update(delta);
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
      const spot = waterSpot();
      const party = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < party && this.crabbers.length < MAX_CRABBERS; i++) {
        this.crabbers.push(
          new Crabber(this.scene, spot, (i - (party - 1) / 2) * 1.1),
        );
      }
      this.nextCrabber = 70 + Math.random() * 120;
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
  }

  /**
   * Hungry swans latch on to whoever is carrying food and trail after them
   * until they get a handful. A well-fed swan ignores the lot of them.
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
    const maxDroppings = 50;
    // Rubbish counts against the park the same as anything the swans leave,
    // and a trail of prints counts for a fraction of one.
    const trodden = this.footprints.reduce(
      (total, print) => total + print.weight() * 0.3,
      0,
    );
    const filth = this.droppings.length + this.litter.length + trodden;
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
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);

    const delta = Math.min(this.clock.getDelta(), 0.05);

    if (this.dead) {
      this.goDown(delta);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.player.update(delta);
    this.mendUp(delta);

    this.temptSwans();

    for (const swan of this.swans) {
      swan.update(delta, this.camera.position);
      if (swan.shouldDrop()) this.addDropping(swan.getPosition().clone());
      if (swan.wantsStrike()) this.takeStrike(swan.getPosition());
    }

    if (this.hurtLeft > 0) {
      this.hurtLeft = Math.max(0, this.hurtLeft - delta);
      if (this.hurtLeft === 0) this.hurtFlash.classList.remove("on");
    }
    const mess = this.droppings.map((dropping) => dropping.getMesh().position);
    for (const person of this.people) {
      const stepped = person.update(delta, mess);
      if (stepped >= 0) this.logComplaint(this.droppings[stepped]!);

      const scattered = person.claimScatter();
      if (scattered) this.bread.push(new Bread(this.scene, scattered));

      const dropped = person.claimLitter();
      if (dropped) this.litter.push(new Litter(this.scene, dropped));

      const print = person.claimPrint();
      if (print) this.footprints.push(new Footprint(this.scene, print));

      const splash = person.claimSplash();
      if (splash) this.bigSplash(splash);

      const dog = person.getDog();
      if (dog) {
        dog.update(delta, { swans: this.swans, people: this.people });
        for (let n = dog.claimTrouble(); n > 0; n--) this.complain();
      }
    }

    this.elapsed += delta;
    bobPedalos(this.elapsed);
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
      people: this.people.map((person) => person.getPosition()),
      cyclists: this.cyclists.map((rider) => rider.getPosition()),
      scooters: this.scooters.map((scooter) => scooter.getPosition()),
      boats: this.boats.map((boat) => boat.getPosition()),
      fox: this.fox?.getPosition() ?? null,
      droppings: this.droppings.map((dropping) => dropping.getMesh().position),
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
    });

    this.renderer.render(this.scene, this.camera);
  };

  public start(): void {
    this.animate();
  }
}
