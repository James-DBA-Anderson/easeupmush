import * as THREE from "three";
import {
  PATH_OUTER,
  WATER_Y,
  distanceToShore,
  isInLake,
  nearestShore,
  outwardAt,
  waterSpot,
} from "../world/lake";
import { addEyes } from "./eyes";
import { MuckFlecks } from "../effects/MuckFlecks";

type Mode =
  | "swim"
  | "haulOut"
  | "graze"
  | "return"
  | "charge"
  | "beg"
  | "feast"
  | "roost"
  | "fly";

/**
 * Coming in to land — the long descent, the flare, then skiing to a stop — or
 * leaving: the paddling run across the water and the climb out.
 */
type Flight = "approach" | "flare" | "ski" | "runUp" | "climb";

/** A grown bird and one of this year's cygnets, still half her size. */
export type SwanKind = "adult" | "cygnet";

/**
 * The model is built oversized and shrunk to life size: a mute swan is about
 * 1.3m beak to tail and comes up to an adult's waist.
 */
const ADULT_SIZE = 0.62;
const CYGNET_SIZE = 0.38;

/** A cygnet keeps this close to its mother, and she keeps them this close. */
const BROOD_GAP = 1.1;
/** Get inside this of one of her cygnets and she comes straight for you. */
const GUARD_RANGE = 5;
/** How long she keeps at you once her brood has been bothered. */
const GUARD_TIME = 14;

/** Speed they have to work up to across the water before they can get off it. */
const UNSTICK = 11;

/** Cruising speed on the way in, and the speed they hit the water at. */
const CRUISE = 15;
const TOUCHDOWN = 7;
/** How far out they set the wings and put the feet down. */
const FLARE_GATE = 20;

/** How long after a feed before they start eyeing up the public again. */
const FULL_FOR = 40;
const BEG_RANGE = 1.7;

/** Close enough to get a beak into the bread, and the rate they peck at it. */
const PECK_RANGE = 1.1;
const PECK_GAP = 0.55;

/** Soakings needed before a swan takes offence, and how long it holds a grudge. */
const PATIENCE = 3;
const CHARGE_TIME = 9;
const STRIKE_RANGE = 2;
const STRIKE_COOLDOWN = 1.6;

/** Scrambling up over the wall, and sliding back down into the water. */
const CLIMB_TIME = 0.9;
const SLIDE_TIME = 0.6;

export class Swan {
  private mesh: THREE.Group;
  private scene: THREE.Scene;
  private position: THREE.Vector3;
  private velocity = new THREE.Vector3();
  private target: THREE.Vector3;

  private mode: Mode = "swim";
  private modeLength = 8 + Math.random() * 14;
  // Stagger the flock so they don't all haul out at the same moment.
  private modeTimer = Math.random() * this.modeLength;

  private dropTimer = Math.random() * 40;
  private dropInterval = 85 + Math.random() * 55;
  private shouldDropNext = false;

  private body!: THREE.Mesh;
  private neck!: THREE.Mesh;
  private head!: THREE.Group;
  private wings: THREE.Mesh[] = [];
  private feathers: THREE.Mesh[] = [];
  private legs: THREE.Group[] = [];

  private stride = Math.random() * Math.PI * 2;
  private climb = 0;
  private slide = 0;
  private wasInWater = true;
  private dip = 0;
  private dipWait = 3 + Math.random() * 6;
  private wakeWait = Math.random();

  private soakings = 0;
  private chaseLeft = 0;
  private strikeCooldown = 0;
  private strikeReady = false;
  private quarry = new THREE.Vector3();

  /** Wings arched at a passer-by on the bank — the seaside warning shot. */
  private buskLeft = 0;
  private buskCool = 0;
  private buskFace = new THREE.Vector3();

  /**
   * About a third of them will pick a scrap over bread — wings up, a shove,
   * then back at the crumbs. Cooldown stops a pile turning into a riot.
   */
  private aggressive = Math.random() < 0.35;
  private scrapLeft = 0;
  private scrapCool = 0;
  private scrapFace = new THREE.Vector3();

  // Start part-fed so the flock doesn't mob the first bag of chips as one.
  private fedAgo = Math.random() * FULL_FOR;
  private feedReady = false;

  private peckTimer = 0;
  private peckReady = false;
  /** Droppings still owed after a gutful of bread. */
  private owed = 0;
  private owedTimer = 0;
  private forcedDrop = false;

  private flightTo = new THREE.Vector3();
  private flightPhase: Flight = "approach";
  private airspeed = 0;
  private flap = 0;
  private sprayGap = 0;
  private slapGap = 0;
  private slapFoot = 1;
  private gone = false;

  public readonly kind: SwanKind;
  private readonly size: number;
  /** Floating puts the waterline partway up the body, so it rides the surface. */
  private readonly swimY: number;
  /** Standing on its legs lifts the body clear of the ground. */
  private readonly landY: number;
  /** How low the body sits once they're down on the grass for the night. */
  private readonly roostY: number;

  /** A cygnet's mother, and a mother's brood. */
  private mother: Swan | null = null;
  private brood: Swan[] = [];
  private broodSlot = 0;
  private guarding = 0;
  /** Stops a dog stood over a bird frightening it every single frame. */
  private spooked = 0;
  private flecks!: MuckFlecks;

  constructor(
    position: THREE.Vector3,
    scene: THREE.Scene,
    kind: SwanKind = "adult",
  ) {
    this.scene = scene;
    this.kind = kind;
    this.size = kind === "cygnet" ? CYGNET_SIZE : ADULT_SIZE;
    this.swimY = WATER_Y - 0.41 * this.size;
    this.landY = 0.32 * this.size;
    this.roostY = 0.12 * this.size;

    this.position = position.clone();
    this.position.y = this.swimY;
    this.target = this.position.clone();

    this.mesh = this.createSwanMesh();
    this.flecks = new MuckFlecks(this.mesh, 36);
    this.mesh.position.copy(this.position);
    this.scene.add(this.mesh);
    this.pickTarget();
  }

  private createSwanMesh(): THREE.Group {
    const group = new THREE.Group();
    group.scale.setScalar(this.size);

    // Cygnets are scruffy grey-brown with a dull beak and no knob to it yet.
    const young = this.kind === "cygnet";
    const white = new THREE.MeshStandardMaterial({
      color: young ? 0xa1957f : 0xffffff,
    });
    const orange = new THREE.MeshStandardMaterial({
      color: young ? 0x6f6257 : 0xff8800,
    });
    const slate = new THREE.MeshStandardMaterial({ color: 0x3a3a3a });

    const bodyGeometry = new THREE.SphereGeometry(0.6, 8, 8);
    bodyGeometry.scale(1, 0.8, 1.4);
    this.body = new THREE.Mesh(bodyGeometry, white);
    this.body.position.y = 0.5;
    this.body.castShadow = true;
    group.add(this.body);

    // Neck pivots at its base so it can crane and dip.
    const neckGeometry = new THREE.CylinderGeometry(0.15, 0.2, 1.2, 8);
    neckGeometry.translate(0, 0.6, 0);
    this.neck = new THREE.Mesh(neckGeometry, white);
    this.neck.position.set(0, 0.55, 0.35);
    this.neck.rotation.x = -0.3;
    this.neck.castShadow = true;
    group.add(this.neck);

    // Head rides on the end of the neck, so it follows every dip and turn.
    this.head = new THREE.Group();
    this.head.position.set(0, 1.2, 0);
    this.neck.add(this.head);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), white);
    skull.position.set(0, 0.05, 0.14);
    skull.castShadow = true;
    this.head.add(skull);

    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 8), orange);
    beak.position.set(0, 0.03, 0.45);
    beak.rotation.x = Math.PI / 2;
    beak.castShadow = true;
    this.head.add(beak);

    if (!young) {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), slate);
      knob.position.set(0, 0.14, 0.28);
      this.head.add(knob);
    }

    addEyes(this.head, {
      spread: young ? 0.12 : 0.14,
      y: young ? 0.06 : 0.08,
      z: young ? 0.24 : 0.28,
      size: young ? 0.04 : 0.048,
      iris: 0x1c1a16,
    });

    const wingGeometry = new THREE.SphereGeometry(0.4, 6, 6);
    wingGeometry.scale(0.8, 0.6, 1.2);
    const wingMaterial = new THREE.MeshStandardMaterial({ color: 0xf5f5f5 });
    for (const side of [-1, 1]) {
      // Pivot at the shoulder so the wing can lift away from the body.
      const wing = new THREE.Mesh(wingGeometry, wingMaterial);
      wing.geometry = wingGeometry.clone();
      wing.geometry.translate(side * 0.28, 0, 0);
      wing.position.set(side * 0.22, 0.6, 0);
      wing.castShadow = true;
      group.add(wing);
      this.wings.push(wing);

      // The full spread, folded away out of sight unless they're in the air.
      const spanGeometry = new THREE.SphereGeometry(1, 8, 5);
      spanGeometry.scale(0.78, 0.05, 0.44);
      spanGeometry.translate(side * 0.85, 0, -0.1);
      const span = new THREE.Mesh(spanGeometry, wingMaterial);
      span.visible = false;
      span.castShadow = true;
      wing.add(span);
      this.feathers.push(span);
    }

    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.17, 0.08, -0.04);

      const shank = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.34, 0.08),
        orange,
      );
      shank.position.y = -0.17;
      shank.castShadow = true;
      leg.add(shank);

      const foot = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.04, 0.28),
        orange,
      );
      foot.position.set(0, -0.36, 0.08);
      foot.castShadow = true;
      leg.add(foot);

      group.add(leg);
      this.legs.push(leg);
    }

    return group;
  }

  private get onLand(): boolean {
    // Roosting counts: a night's sleep on the grass leaves its mark by morning.
    return this.mode === "graze" || this.mode === "roost";
  }

  /** Actually stood on the bank, whatever mood it's in. */
  public isAshore(): boolean {
    return !isInLake(this.position.x, this.position.z);
  }

  /**
   * Wings up and looking for trouble — a full charge, the busking display,
   * or a scrap over bread.
   */
  public isWingsOut(): boolean {
    return this.mode === "charge" || this.buskLeft > 0 || this.scrapLeft > 0;
  }

  public isHungry(): boolean {
    return this.fedAgo >= FULL_FOR;
  }

  /** Someone nearby has food. Drop everything and go and stand next to them. */
  public tempt(at: THREE.Vector3): void {
    if (this.mode === "charge" || this.mode === "fly") return;
    this.quarry.copy(at);
    this.mode = "beg";
  }

  /** The food has gone, or walked off. Back to swan business. */
  public loseInterest(): void {
    if (this.mode !== "beg") return;
    this.mode = isInLake(this.position.x, this.position.z) ? "swim" : "graze";
    this.modeTimer = 0;
    this.modeLength = 10 + Math.random() * 12;
    this.pickTarget();
  }

  /** True once per handful, when it's close enough to be thrown something. */
  public wantsFeeding(): boolean {
    if (!this.feedReady) return false;
    this.feedReady = false;
    return true;
  }

  /** Ate. Full for a while, and it'll be wanting the toilet before long. */
  public feed(): void {
    this.fedAgo = 0;
    // What goes in must come out, and rather sooner than usual.
    this.dropTimer = Math.max(this.dropTimer, this.dropInterval - 8);
  }

  /**
   * Puts the bird high up and a long way out, lined up on a patch of open
   * water to come down on.
   */
  public flyIn(): void {
    const spot = waterSpot();
    this.flightTo.set(spot.x, this.swimY, spot.y);

    const bearing = Math.random() * Math.PI * 2;
    this.position.set(
      this.flightTo.x + Math.cos(bearing) * 170,
      26 + Math.random() * 8,
      this.flightTo.z + Math.sin(bearing) * 170,
    );
    this.target.copy(this.flightTo);
    this.mesh.position.copy(this.position);

    this.mode = "fly";
    this.flightPhase = "approach";
    this.airspeed = CRUISE;
    this.wasInWater = false;
    this.velocity.set(0, 0, 0);
  }

  public isFlying(): boolean {
    return this.mode === "fly";
  }

  /** Just pottering about on the water, so free to be sent off somewhere. */
  public isSettled(): boolean {
    return this.mode === "swim" && isInLake(this.position.x, this.position.z);
  }

  /** Off it goes: line up the longest bit of open water and start paddling. */
  public flyAway(): void {
    if (!this.isSettled()) return;
    this.mode = "fly";
    this.flightPhase = "runUp";
    this.airspeed = Math.max(0.5, this.velocity.length());
    this.mesh.rotation.y = this.longestRun();
    this.slapGap = 0;
    this.velocity.set(0, 0, 0);
  }

  /** Well up and away over the rooftops. */
  public hasLeft(): boolean {
    return this.gone;
  }

  /**
   * Swans need a long clear stretch to get airborne, so it picks whichever
   * heading gives it the most water ahead.
   */
  private longestRun(): number {
    let best = Math.random() * Math.PI * 2;
    let furthest = 0;
    for (let i = 0; i < 16; i++) {
      const heading = (i / 16) * Math.PI * 2;
      let run = 0;
      while (run < 70) {
        const x = this.position.x + Math.sin(heading) * (run + 3);
        const z = this.position.z + Math.cos(heading) * (run + 3);
        if (!isInLake(x, z)) break;
        run += 3;
      }
      if (run > furthest) {
        furthest = run;
        best = heading;
      }
    }
    return best;
  }

  /**
   * The take-off run: wings hammering, both feet slapping the surface and
   * leaving a ripple with every step, until it has the speed to unstick.
   */
  private runUp(delta: number): void {
    const heading = this.mesh.rotation.y;
    this.airspeed = Math.min(UNSTICK + 1, this.airspeed + 3.4 * delta);
    this.position.x += Math.sin(heading) * this.airspeed * delta;
    this.position.z += Math.cos(heading) * this.airspeed * delta;

    // The last of the run has them half out of the water already.
    const lift = Math.max(0, this.airspeed - UNSTICK * 0.6) * 0.12;
    this.position.y +=
      (this.swimY + lift - this.position.y) * Math.min(1, 6 * delta);
    this.mesh.position.copy(this.position);

    // A ripple off each foot in turn, coming quicker as it picks up speed.
    this.slapGap -= delta;
    if (this.slapGap <= 0) {
      this.slapGap = Math.max(0.12, 0.42 - this.airspeed * 0.025);
      this.slapFoot = -this.slapFoot;
      const side = this.slapFoot * 0.3;
      this.footprint(heading, side);
    }

    this.flightPose(delta);

    // Out of water to run on, or fast enough to leave it.
    const ahead = 4;
    const clear = isInLake(
      this.position.x + Math.sin(heading) * ahead,
      this.position.z + Math.cos(heading) * ahead,
    );
    if (this.airspeed >= UNSTICK || !clear) {
      this.flightPhase = "climb";
      this.wasInWater = false;
      this.splash();
    }
  }

  /** Climbing away over the trees, and out of the park for good. */
  private climbOut(delta: number): void {
    const heading = this.mesh.rotation.y;
    this.airspeed += (CRUISE - this.airspeed) * Math.min(1, 0.8 * delta);
    this.position.x += Math.sin(heading) * this.airspeed * delta;
    this.position.z += Math.cos(heading) * this.airspeed * delta;
    // A heavy bird, so it goes up slowly and levels off as it gains height.
    this.position.y += (3.4 - this.position.y * 0.06) * delta;
    this.mesh.position.copy(this.position);

    this.flightPose(delta);

    if (this.position.y > 24 || this.position.length() > 240) this.gone = true;
  }

  /** The kick of water thrown up by one foot on the take-off run. */
  private footprint(heading: number, side: number): void {
    const at = new THREE.Vector2(
      this.position.x + Math.cos(heading) * side,
      this.position.z - Math.sin(heading) * side,
    );
    this.ripple(0.42, 1.9, 0.8, at);
    this.skiSpray(heading, at);
  }

  /** The whole arrival: descend, flare, then ski to a halt on the water. */
  private fly(delta: number): void {
    if (this.flightPhase === "runUp") {
      this.runUp(delta);
      return;
    }

    if (this.flightPhase === "climb") {
      this.climbOut(delta);
      return;
    }

    const flat = new THREE.Vector3(
      this.flightTo.x - this.position.x,
      0,
      this.flightTo.z - this.position.z,
    );
    const gap = flat.length();
    if (gap > 0.05) this.mesh.rotation.y = Math.atan2(flat.x, flat.z);

    if (this.flightPhase === "ski") {
      this.skiToAStop(delta);
      return;
    }

    if (this.flightPhase === "approach" && gap < FLARE_GATE)
      this.flightPhase = "flare";

    // A shallow glide slope that runs out at the flare gate, then the last
    // few feet down onto the surface.
    const slope = this.swimY + 1.1 + Math.max(0, gap - FLARE_GATE) * 0.17;
    const wantY = this.flightPhase === "approach" ? slope : this.swimY + 0.45;
    const wantSpeed = this.flightPhase === "approach" ? CRUISE : TOUCHDOWN;

    this.airspeed += (wantSpeed - this.airspeed) * Math.min(1, 1.4 * delta);
    this.position.addScaledVector(flat.normalize(), this.airspeed * delta);
    this.position.y += (wantY - this.position.y) * Math.min(1, 1.8 * delta);

    if (
      this.flightPhase === "flare" &&
      (this.position.y < this.swimY + 0.55 || gap < 2)
    ) {
      this.touchDown();
    }

    this.mesh.position.copy(this.position);
    this.flightPose(delta);
  }

  /** Feet hit the water: two long plumes and a shove of spray. */
  private touchDown(): void {
    this.flightPhase = "ski";
    this.airspeed = Math.max(this.airspeed, TOUCHDOWN * 0.9);
    this.sprayGap = 0;
    this.wasInWater = true;
    this.splash();
  }

  private skiToAStop(delta: number): void {
    const heading = this.mesh.rotation.y;
    this.airspeed = Math.max(0, this.airspeed - 4.2 * delta);
    this.position.x += Math.sin(heading) * this.airspeed * delta;
    this.position.z += Math.cos(heading) * this.airspeed * delta;
    // Body sinks in as the speed washes off and the water takes the weight.
    this.position.y += (this.swimY - this.position.y) * Math.min(1, 3 * delta);
    this.mesh.position.copy(this.position);

    this.sprayGap -= delta;
    if (this.airspeed > 1.5 && this.sprayGap <= 0) {
      this.sprayGap = 0.07;
      this.skiSpray(heading);
      this.wake();
    }

    this.flightPose(delta);

    if (this.airspeed <= 0.5) {
      // Down safely. Fold everything away and join the flock.
      this.mode = "swim";
      this.mesh.rotation.x = 0;
      this.mesh.rotation.z = 0;
      for (const wing of this.wings) wing.rotation.set(0, 0, 0);
      for (const feather of this.feathers) feather.visible = false;
      for (const leg of this.legs) leg.rotation.x = 0;
      this.modeTimer = 0;
      this.modeLength = 10 + Math.random() * 12;
      this.pickTarget();
    }
  }

  /**
   * Wings out and beating on the way in, feet trailing behind, then thrust
   * out forward like skis for the landing.
   */
  private flightPose(delta: number): void {
    const skiing = this.flightPhase === "ski";
    const running = this.flightPhase === "runUp";
    const climbing = this.flightPhase === "climb";
    // Full span whenever they're working; the feet disappear under the surface
    // the moment the body is back in the water.
    for (const feather of this.feathers) feather.visible = true;
    for (const leg of this.legs) leg.visible = !skiing;

    // Slow and heavy on the glide, hammering when they're hauling themselves
    // off the water or braking onto it.
    this.flap +=
      delta * (this.flightPhase === "approach" ? 5.5 : running ? 12 : 8);
    const beat = Math.sin(this.flap);
    // A steady wingbeat on the glide out, and shoulders working over the top
    // of it everywhere else.
    const gliding = this.flightPhase === "approach" || climbing;

    const [leftWing, rightWing] = this.wings as [THREE.Mesh, THREE.Mesh];
    // Deepest, hardest beats of the lot getting off the water; on finals they
    // hold the wings up and cupped instead.
    const sweep = running
      ? 0.1 + beat * 1.2
      : gliding
        ? 0.15 + beat * 0.85
        : (skiing ? 0.5 : 0.9) + Math.abs(beat) * 0.45;
    leftWing.rotation.z = sweep;
    rightWing.rotation.z = -sweep;
    leftWing.rotation.x = gliding || running ? 0 : -0.3;
    rightWing.rotation.x = gliding || running ? 0 : -0.3;

    const [left, right] = this.legs as [THREE.Group, THREE.Group];
    if (running) {
      // Both feet slapping down the surface, out of step with each other.
      const paddle = Math.sin(this.flap * 0.9);
      left.rotation.x = paddle * 1.1;
      right.rotation.x = -paddle * 1.1;
    } else {
      // Tucked up under the tail, or dropped and reaching forward to plane.
      const reach = this.flightPhase === "approach" || climbing ? -1.5 : 1.1;
      left.rotation.x = reach;
      right.rotation.x = reach;
    }

    // Nose down on the glide, up for the flare and the climb out, levelling
    // off again as the ski runs out of speed.
    const pitch =
      this.flightPhase === "approach"
        ? 0.12
        : running
          ? -0.14
          : climbing
            ? -0.3
            : skiing
              ? -0.22 * Math.min(1, this.airspeed / TOUCHDOWN)
              : -0.4;
    this.mesh.rotation.x +=
      (pitch - this.mesh.rotation.x) * Math.min(1, 5 * delta);
    this.mesh.rotation.z = gliding ? Math.sin(this.flap * 0.3) * 0.06 : 0;

    this.body.rotation.x = 0;
    // Neck stretched right out in front in the air, coming back up as they
    // settle onto the water.
    const craned = gliding || running ? 1.3 : skiing ? 0.2 : 0.75;
    this.neck.rotation.x +=
      (craned - this.neck.rotation.x) * Math.min(1, 4 * delta);
    this.head.rotation.x = gliding || running ? -0.55 : -0.2;
    this.head.rotation.y = 0;
  }

  /** The water the feet kick up, skiing to a stop or paddling to get away. */
  private skiSpray(heading: number, at?: THREE.Vector2): void {
    const from = at ?? new THREE.Vector2(this.position.x, this.position.z);
    const material = new THREE.MeshBasicMaterial({
      color: 0xeaf6ff,
      transparent: true,
      opacity: 0.85,
    });
    const drops: THREE.Mesh[] = [];
    const speeds: THREE.Vector3[] = [];

    for (let i = 0; i < 8; i++) {
      const drop = new THREE.Mesh(
        new THREE.SphereGeometry(0.07 + Math.random() * 0.08, 5, 4),
        material,
      );
      const side = (i % 2 === 0 ? 1 : -1) * (0.25 + Math.random() * 0.3);
      drop.position.set(
        from.x + Math.cos(heading) * side,
        WATER_Y + 0.05,
        from.y - Math.sin(heading) * side,
      );
      // Thrown up and back over the shoulder, opposite the way it's sliding.
      speeds.push(
        new THREE.Vector3(
          -Math.sin(heading) * (2 + Math.random() * 3) +
            (Math.random() - 0.5) * 1.5,
          2.5 + Math.random() * 2.5,
          -Math.cos(heading) * (2 + Math.random() * 3) +
            (Math.random() - 0.5) * 1.5,
        ),
      );
      this.scene.add(drop);
      drops.push(drop);
    }

    const started = performance.now();
    let last = started;
    const fall = (): void => {
      const now = performance.now();
      const step = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - started) / 700;
      if (t >= 1) {
        for (const drop of drops) {
          this.scene.remove(drop);
          drop.geometry.dispose();
        }
        material.dispose();
        return;
      }
      for (let i = 0; i < drops.length; i++) {
        speeds[i]!.y -= 9 * step;
        drops[i]!.position.addScaledVector(speeds[i]!, step);
      }
      material.opacity = 0.85 * (1 - t);
      requestAnimationFrame(fall);
    };
    requestAnimationFrame(fall);
  }

  /**
   * Dusk. They come off the water and settle on the grass above the path for
   * the night, well back from the edge.
   */
  public settleForNight(): void {
    if (this.mode === "roost" || this.mode === "charge" || this.mode === "fly")
      return;
    this.mode = "roost";
    this.modeTimer = 0;
    this.modeLength = 9999;
    const spot = this.besideShore(PATH_OUTER + 4 + Math.random() * 9, 16);
    this.target = new THREE.Vector3(spot.x, this.landY, spot.y);
  }

  /** First light. Up, stretch, and back down to the water. */
  public wakeUp(): void {
    if (this.mode !== "roost") return;
    this.mode = "graze";
    this.modeTimer = 0;
    this.modeLength = 8 + Math.random() * 10;
    this.pickTarget();
  }

  public isRoosting(): boolean {
    return this.mode === "roost";
  }

  /** Bread on the path or floating. Worth crossing the park for, hungry or not. */
  public goForBread(at: THREE.Vector3): void {
    if (this.mode === "charge" || this.mode === "fly") return;
    if (this.scrapLeft > 0) return;
    // Keep the aim once they've locked on, or they never settle on a crumb.
    if (this.mode === "feast" && this.quarry.distanceTo(at) < 3.5) return;
    this.quarry.set(
      at.x + (Math.random() - 0.5) * 1.6,
      at.y,
      at.z + (Math.random() - 0.5) * 1.6,
    );
    this.mode = "feast";
  }

  public isFeasting(): boolean {
    return this.mode === "feast" || this.scrapLeft > 0;
  }

  /** True once per peck at the bread. */
  public wantsPeck(): boolean {
    if (!this.peckReady || this.scrapLeft > 0) return false;
    this.peckReady = false;
    return true;
  }

  /**
   * Square up to another bird at the pile. Returns false if this one isn't
   * in the mood — only some of them start it, and not while already scraping.
   */
  public tryScrap(rival: THREE.Vector3): boolean {
    if (this.kind === "cygnet") return false;
    if (this.mode !== "feast" || this.scrapLeft > 0 || this.scrapCool > 0)
      return false;
    if (!this.aggressive && Math.random() > 0.25) return false;
    this.scrapLeft = 1.5 + Math.random() * 1.4;
    this.scrapCool = 7 + Math.random() * 9;
    this.scrapFace.copy(rival);
    this.peckReady = false;
    return true;
  }

  /** Get shoved mid-feast — answer in kind if there's any fight in them. */
  public takeScrap(from: THREE.Vector3): void {
    if (this.kind === "cygnet" || this.mode === "charge" || this.mode === "fly")
      return;
    if (this.scrapLeft > 0) return;
    this.scrapLeft = 1.1 + Math.random() * 1.0;
    this.scrapCool = 5 + Math.random() * 6;
    this.scrapFace.copy(from);
    this.mode = "feast";
  }

  public isScrapping(): boolean {
    return this.scrapLeft > 0;
  }

  /**
   * The bread has run out. They loiter where it was on full stomachs, and over
   * the next minute or so they leave the thanks you'd expect.
   */
  public gorge(): void {
    this.fedAgo = 0;
    this.owed = 1 + Math.floor(Math.random() * 2);
    this.owedTimer = 12 + Math.random() * 18;

    this.mode = "graze";
    this.modeTimer = 0;
    this.modeLength = 25 + Math.random() * 20;
    this.target = this.position.clone();
  }

  /** Hit by the hose. A few of these and it comes for you — unless it's
   * already coming, in which case the jet knocks it back. */
  public soak(from?: THREE.Vector3): void {
    if (this.kind === "cygnet") {
      // A cygnet won't fight you. It doesn't have to: it has a mother.
      this.mother?.defend();
      return;
    }

    // Mid-charge or mid-busk: the stream has weight. Enough of it and they break.
    if (this.mode === "charge") {
      this.takeHose(from);
      return;
    }
    if (this.buskLeft > 0) {
      this.buskLeft = 0;
      this.shoveBack(from, 0.7);
      return;
    }

    this.soakings += 1;
    if (this.soakings >= PATIENCE) this.startCharge();
  }

  /** Filthy bounce spray — sticks to the plumage. */
  public splatter(point: THREE.Vector3): void {
    this.flecks.splat(point);
  }

  private hoseHits = 0;
  private hoseCool = 0;

  /** Jet in the face while charging — shove, delay the peck, maybe break off. */
  private takeHose(from?: THREE.Vector3): void {
    if (this.hoseCool > 0) return;
    this.hoseCool = 0.2;
    this.hoseHits += 1;
    this.chaseLeft -= 2.2;
    this.strikeCooldown = Math.max(this.strikeCooldown, 0.75);
    this.strikeReady = false;
    this.shoveBack(from, 0.85 + Math.min(0.6, this.hoseHits * 0.12));

    if (this.hoseHits >= 5 || this.chaseLeft <= 0) this.breakCharge(from);
  }

  private shoveBack(from: THREE.Vector3 | undefined, force: number): void {
    if (!from) return;
    const away = new THREE.Vector3()
      .subVectors(this.position, from)
      .setY(0);
    if (away.lengthSq() < 0.01) {
      away.set(-Math.sin(this.mesh.rotation.y), 0, -Math.cos(this.mesh.rotation.y));
    }
    away.normalize();
    this.position.addScaledVector(away, force);
    this.velocity.copy(away.multiplyScalar(force * 3.2));
    this.mesh.position.copy(this.position);
  }

  /** Had enough of the hose — back to the water, wings still up for a moment. */
  private breakCharge(from?: THREE.Vector3): void {
    this.hoseHits = 0;
    this.soakings = 0;
    this.chaseLeft = 0;
    this.strikeReady = false;
    this.guarding = 0;
    this.shoveBack(from, 1.4);

    const ashore = !isInLake(this.position.x, this.position.z);
    this.mode = ashore ? "return" : "swim";
    this.modeTimer = 0;
    this.modeLength = 10 + Math.random() * 10;
    this.pickTarget();
    if (ashore && from) {
      // Prefer open water away from whoever was hosing them.
      const away = new THREE.Vector3()
        .subVectors(this.position, from)
        .setY(0)
        .normalize()
        .multiplyScalar(14);
      this.target.add(away);
    }
  }

  /**
   * Something has come at them that isn't worth fighting — a dog off its lead,
   * usually. They break for open water, and a mother takes her brood with her.
   */
  public spook(from: THREE.Vector3): void {
    if (this.mode === "fly" || this.mode === "charge") return;
    // One fright per approach, or a dog stood over them would pin them there.
    if (this.spooked > 0) return;
    this.spooked = 2.5;
    this.mother?.spook(from);

    const ashore = !isInLake(this.position.x, this.position.z);
    this.mode = ashore ? "return" : "swim";
    this.modeTimer = 0;
    this.modeLength = 12 + Math.random() * 8;
    this.pickTarget();

    // Put some water between them and it rather than swimming past its nose.
    const away = new THREE.Vector3()
      .subVectors(this.position, from)
      .setY(0)
      .normalize()
      .multiplyScalar(10);
    if (!ashore) this.target.add(away);
  }

  /** A neighbour kicked off, so this one squares up too. */
  public rile(): void {
    if (this.kind === "cygnet") return;
    this.soakings = Math.max(this.soakings, PATIENCE - 1);
  }

  /** Takes on one of this year's brood, which then never leaves her side. */
  public adopt(chick: Swan): void {
    this.brood.push(chick);
    chick.mother = this;
    chick.broodSlot = this.brood.length;
    chick.modeLength = 9999;
  }

  public hasBrood(): boolean {
    return this.brood.length > 0;
  }

  /** Only grown birds with nothing to look after fly off on their own. */
  public canLeave(): boolean {
    return this.kind === "adult" && this.brood.length === 0;
  }

  /** Something has had a go at her young. She stops being reasonable. */
  public defend(): void {
    if (this.kind === "cygnet" || this.mode === "fly") return;
    this.guarding = GUARD_TIME;
    if (this.mode !== "charge") this.startCharge();
  }

  /**
   * A mother keeps half an eye on you the whole time. Come inside seven metres
   * of any of her brood and she's off the water and after you, and she keeps
   * coming back for as long as you hang about.
   */
  private mindTheBrood(delta: number, player?: THREE.Vector3): void {
    if (this.brood.length === 0) return;
    this.brood = this.brood.filter((chick) => !chick.hasLeft());

    if (this.guarding > 0) this.guarding -= delta;

    if (player && this.mode !== "fly") {
      const close = this.brood.some(
        (chick) => chick.getPosition().distanceTo(player) < GUARD_RANGE,
      );
      if (close) this.guarding = GUARD_TIME;
    }

    if (this.guarding > 0 && this.mode !== "charge" && this.mode !== "fly") {
      this.startCharge();
    }
  }

  /**
   * Cygnets do whatever their mother is doing, strung out in a line behind her.
   * When she goes for someone they hold back where they are.
   */
  private tagAlong(): void {
    const mum = this.mother;
    if (!mum) return;
    if (mum.hasLeft()) {
      this.mother = null;
      return;
    }

    if (mum.mode === "charge" || mum.mode === "fly") {
      // She's gone for someone. They stay put and let her get on with it.
      this.target.set(this.position.x, this.target.y, this.position.z);
      return;
    }
    this.mode = mum.mode;
    this.modeTimer = 0;

    // A slot in the queue astern of her, so they don't all pile onto one spot.
    const heading = mum.mesh.rotation.y;
    const back = BROOD_GAP * this.broodSlot;
    const side = ((this.broodSlot % 2) - 0.5) * 0.7;
    this.target.set(
      mum.position.x - Math.sin(heading) * back + Math.cos(heading) * side,
      this.target.y,
      mum.position.z - Math.cos(heading) * back - Math.sin(heading) * side,
    );
  }

  private startCharge(): void {
    // No picking fights on the way in.
    if (this.mode === "fly") return;
    this.soakings = 0;
    this.hoseHits = 0;
    this.mode = "charge";
    this.modeTimer = 0;
    this.modeLength = CHARGE_TIME;
    this.chaseLeft = CHARGE_TIME;
  }

  public isCharging(): boolean {
    return this.mode === "charge";
  }

  /**
   * Anyone wandered too close on the bank gets the wings. Not a charge yet —
   * just enough to put the wind up the ones who don't like swans.
   */
  public noticeCrowd(crowd: readonly THREE.Vector3[]): void {
    if (this.buskCool > 0 || this.buskLeft > 0) return;
    if (this.kind === "cygnet") return;
    // Grazing birds only — a beggar or a bird at the bread isn't threatening.
    if (this.mode !== "graze") return;
    if (!this.isAshore()) return;

    for (const at of crowd) {
      if (this.position.distanceTo(at) > 5.2) continue;
      this.buskLeft = 2.2 + Math.random() * 1.8;
      this.buskCool = 11 + Math.random() * 10;
      this.buskFace.copy(at);
      return;
    }
  }

  /** True once per landed peck, for the game to turn into a shove. */
  public wantsStrike(): boolean {
    if (!this.strikeReady) return false;
    this.strikeReady = false;
    return true;
  }

  private pickTarget(): void {
    if (this.mode === "swim") {
      const spot = waterSpot();
      this.target = new THREE.Vector3(spot.x, this.swimY, spot.y);
      return;
    }
    if (this.mode === "haulOut") {
      // Climb out at the nearest bank, not a random one across the lake.
      const spot = this.besideShore(1.8 + Math.random() * 2.6, 10);
      this.target = new THREE.Vector3(spot.x, this.landY, spot.y);
      return;
    }
    if (this.mode === "graze") {
      // Shuffle about a couple of metres, staying close to the water's edge.
      const spot = this.besideShore(1.5 + Math.random() * 4.5, 8);
      this.target = new THREE.Vector3(spot.x, this.landY, spot.y);
      return;
    }
    // Slip back in at the nearest edge; the swim leg picks somewhere to go after.
    const spot = this.besideShore(-(2 + Math.random() * 2), 8);
    this.target = new THREE.Vector3(spot.x, this.swimY, spot.y);
  }

  /**
   * A spot measured from the closest point of shoreline: positive `away` is up
   * onto the bank, negative is out into the water, and `spread` slides it along
   * the shore so the flock doesn't queue up on one square metre.
   */
  private besideShore(away: number, spread: number): THREE.Vector2 {
    const here = nearestShore(this.position.x, this.position.z);
    const out = outwardAt(here);
    const along = (Math.random() - 0.5) * spread;
    return new THREE.Vector2(
      here.x + out.x * away - out.y * along,
      here.y + out.y * away + out.x * along,
    );
  }

  private nextMode(): void {
    this.modeTimer = 0;
    if (this.mode === "swim") {
      this.mode = "haulOut";
      this.modeLength = 20;
    } else if (this.mode === "haulOut") {
      this.mode = "graze";
      this.modeLength = 18 + Math.random() * 24;
    } else if (this.mode === "graze") {
      this.mode = "return";
      this.modeLength = 20;
    } else {
      this.mode = "swim";
      this.modeLength = 10 + Math.random() * 16;
    }
    this.pickTarget();
  }

  public update(delta: number, player?: THREE.Vector3): void {
    this.flecks.update(delta);
    this.modeTimer += delta;
    // Asleep they tick over far slower, or a night's roosting would bury the
    // grass by morning.
    this.dropTimer += delta * (this.mode === "roost" ? 0.2 : 1);
    this.fedAgo += delta;
    if (this.strikeCooldown > 0) this.strikeCooldown -= delta;
    if (this.hoseCool > 0) this.hoseCool -= delta;
    if (this.spooked > 0) this.spooked -= delta;
    if (this.buskCool > 0) this.buskCool -= delta;
    if (this.scrapCool > 0) this.scrapCool -= delta;

    this.mindTheBrood(delta, player);
    this.tagAlong();

    if (this.mode === "fly") {
      this.fly(delta);
      return;
    }

    if (this.mode === "charge") {
      this.buskLeft = 0;
      this.scrapLeft = 0;
      this.runDown(delta, player);
      return;
    }

    // Hold the display: wings up, facing the offender, feet planted.
    if (this.buskLeft > 0) {
      this.buskLeft = Math.max(0, this.buskLeft - delta);
      this.holdBusk(delta);
      return;
    }

    // Brief scrap over the bread — wings up, a shove, then back pecking.
    if (this.scrapLeft > 0) {
      this.scrapLeft = Math.max(0, this.scrapLeft - delta);
      this.haveItOut(delta);
      return;
    }

    if (this.mode === "beg") {
      this.pester(delta);
      return;
    }

    this.settleUp(delta);

    if (this.mode === "feast") {
      this.tuckIn(delta);
      return;
    }

    if (this.mode === "roost") {
      this.turnIn(delta);
      return;
    }

    const flat = new THREE.Vector3(
      this.target.x - this.position.x,
      0,
      this.target.z - this.position.z,
    );
    const reached = flat.length() < 1.2;

    const ashore = !isInLake(this.position.x, this.position.z);
    // A cygnet has nothing to decide: its target is wherever its mother is.
    if (this.mother) {
      // Nothing to do.
    } else if (this.modeTimer >= this.modeLength) {
      // Give up on a crossing that's taken too long rather than teleporting.
      if (this.mode === "haulOut" && !ashore) {
        this.mode = "swim";
        this.modeTimer = 0;
        this.modeLength = 10 + Math.random() * 16;
        this.pickTarget();
      } else if (this.mode === "return" && ashore) {
        this.modeTimer = 0;
        this.pickTarget();
      } else {
        this.nextMode();
      }
    } else if (reached) {
      // A crossing only counts once they're on the other side of the waterline;
      // until then they keep walking at the same target rather than re-picking.
      if (this.mode === "haulOut") {
        if (ashore) this.nextMode();
      } else if (this.mode === "return") {
        if (!ashore) this.nextMode();
      } else {
        this.pickTarget();
      }
    }

    // They pause mid-scramble rather than gliding over the wall.
    const climbing = this.climb > 0 || this.slide > 0;
    let speed = climbing ? 0.25 : this.onLand ? 0.7 : 1.6;
    // A cygnet dawdles in its slot and puts a spurt on if it drops behind.
    if (this.mother) {
      speed *= THREE.MathUtils.clamp(flat.length() / BROOD_GAP, 0.15, 3);
    }
    this.velocity.lerp(flat.normalize().multiplyScalar(speed), 3 * delta);
    this.position.addScaledVector(this.velocity, delta);

    // Waddling swans keep to the bank; swimming ones keep to the water.
    const inWater = isInLake(this.position.x, this.position.z);
    if (this.mode === "swim" && !inWater) {
      const shore = nearestShore(this.position.x, this.position.z);
      const out = outwardAt(shore);
      this.position.x = shore.x - out.x * 2;
      this.position.z = shore.y - out.y * 2;
    }
    if (this.mode === "graze" && inWater) {
      const shore = nearestShore(this.position.x, this.position.z);
      const out = outwardAt(shore);
      this.position.x = shore.x + out.x * 1.2;
      this.position.z = shore.y + out.y * 1.2;
    }
    if (
      this.mode === "graze" &&
      distanceToShore(this.position.x, this.position.z) > 14
    ) {
      this.mode = "return";
      this.modeTimer = 0;
      this.pickTarget();
    }

    this.trackWaterline(delta, isInLake(this.position.x, this.position.z));
    this.settleHeight(delta);

    this.mesh.position.copy(this.position);
    if (this.velocity.length() > 0.1) {
      this.mesh.rotation.y = Math.atan2(this.velocity.x, this.velocity.z);
    }

    this.animate(delta);

    if (this.dropTimer >= this.dropInterval) {
      this.shouldDropNext = true;
      this.dropTimer = 0;
      this.dropInterval = 85 + Math.random() * 55;
    }
  }

  /** Walks up onto the grass, then sits down and sleeps until morning. */
  private turnIn(delta: number): void {
    const flat = new THREE.Vector3(
      this.target.x - this.position.x,
      0,
      this.target.z - this.position.z,
    );
    const gap = flat.length();
    const settled = gap < 0.8;

    if (!settled) {
      this.velocity.lerp(flat.normalize().multiplyScalar(1.7), 3 * delta);
      this.position.addScaledVector(this.velocity, delta);
      this.mesh.rotation.y = Math.atan2(flat.x, flat.z);
    } else {
      this.velocity.multiplyScalar(Math.max(0, 1 - 5 * delta));
    }

    this.trackWaterline(delta, isInLake(this.position.x, this.position.z));

    if (settled) {
      // Down onto the grass, the body dropping the last bit slowly.
      this.position.y +=
        (this.roostY - this.position.y) * Math.min(1, 1.5 * delta);
    } else {
      this.settleHeight(delta);
    }

    this.mesh.position.copy(this.position);
    this.roostPose(delta, settled);
  }

  /** Sat low with the head laid back over the shoulder, slowly breathing. */
  private roostPose(delta: number, settled: boolean): void {
    for (const leg of this.legs) leg.visible = !settled && !this.wasInWater;

    this.stride += delta * (settled ? 1.1 : 8);
    const breath = Math.sin(this.stride);

    if (!settled) {
      const [left, right] = this.legs as [THREE.Group, THREE.Group];
      left.rotation.x = breath * 0.5;
      right.rotation.x = -breath * 0.5;
    }

    const [leftWing, rightWing] = this.wings as [THREE.Mesh, THREE.Mesh];
    leftWing.rotation.z = settled ? -0.12 : 0.05;
    rightWing.rotation.z = settled ? 0.12 : -0.05;

    this.mesh.rotation.x = 0;
    this.mesh.rotation.z = 0;
    this.body.rotation.x = 0;

    if (settled) {
      // Neck folded right back so the beak rests in the feathers.
      this.neck.rotation.x = -2.5 + breath * 0.04;
      this.head.rotation.x = 1.5;
      this.head.rotation.y = 0.4;
      this.mesh.position.y += breath * 0.012;
    } else {
      this.neck.rotation.x = -0.3;
      this.head.rotation.x = 0;
      this.head.rotation.y = 0;
    }
  }

  /** Pays off what the bread owes, a dropping at a time, once on dry land. */
  private settleUp(delta: number): void {
    if (this.owed <= 0) return;
    this.owedTimer -= delta;
    if (this.owedTimer > 0) return;
    if (isInLake(this.position.x, this.position.z)) return;

    this.owed -= 1;
    this.owedTimer = 14 + Math.random() * 16;
    this.forcedDrop = true;
  }

  /** Head down in the bread, shuffling round the pile with the others. */
  private tuckIn(delta: number): void {
    const flat = new THREE.Vector3(
      this.quarry.x - this.position.x,
      0,
      this.quarry.z - this.position.z,
    );
    const gap = flat.length();

    if (gap <= PECK_RANGE) {
      this.velocity.multiplyScalar(Math.max(0, 1 - 6 * delta));
      this.peckTimer -= delta;
      if (this.peckTimer <= 0) {
        this.peckTimer = PECK_GAP;
        this.peckReady = true;
      }
    } else {
      // They fairly barrel over to bread. No dignity in it.
      this.velocity.lerp(
        flat.normalize().multiplyScalar(gap > 5 ? 3.8 : 2.2),
        4 * delta,
      );
    }

    this.position.addScaledVector(this.velocity, delta);
    this.trackWaterline(delta, isInLake(this.position.x, this.position.z));
    this.settleHeight(delta);

    this.mesh.position.copy(this.position);
    if (gap > 0.2) this.mesh.rotation.y = Math.atan2(flat.x, flat.z);
    this.feastPose(delta, gap);
  }

  /** Neck down to the crumbs — on the path, or dabbling at a floating pile. */
  private feastPose(delta: number, gap: number): void {
    for (const leg of this.legs) leg.visible = !this.wasInWater;

    const moving = gap > PECK_RANGE;
    this.stride += delta * (moving ? 11 : 7);
    const swing = Math.sin(this.stride);

    if (!this.wasInWater) {
      const [left, right] = this.legs as [THREE.Group, THREE.Group];
      const step = moving ? 0.6 : 0.08;
      left.rotation.x = swing * step;
      right.rotation.x = -swing * step;
    }

    const [leftWing, rightWing] = this.wings as [THREE.Mesh, THREE.Mesh];
    // Half-open wings to barge the others off the good bits.
    const jostle = moving ? 0.08 : 0.3 + Math.sin(this.stride * 0.5) * 0.15;
    leftWing.rotation.z = jostle;
    rightWing.rotation.z = -jostle;

    this.mesh.rotation.x = 0;
    this.mesh.rotation.z = moving ? swing * 0.05 : 0;

    if (this.wasInWater) {
      // On the water they tip into it rather than stabbing the paving.
      this.body.rotation.x = moving ? 0.15 : 0.4;
      if (moving) {
        this.neck.rotation.x = 0.55;
        this.head.rotation.x = -0.15;
      } else {
        const peck = (Math.sin(this.stride) + 1) / 2;
        this.neck.rotation.x = 0.95 + peck * 0.45;
        this.head.rotation.x = -0.25 - peck * 0.35;
      }
    } else {
      this.body.rotation.x = moving ? 0.1 : 0.24;
      if (moving) {
        this.neck.rotation.x = 0.5;
        this.head.rotation.x = -0.2;
      } else {
        // Pecking: the whole neck drops to the path and snaps back up.
        const peck = (Math.sin(this.stride) + 1) / 2;
        this.neck.rotation.x = 1.15 + peck * 0.5;
        this.head.rotation.x = -0.3 - peck * 0.5;
      }
    }
    this.head.rotation.y = 0;
  }

  /**
   * Trailing after someone with food, hoping. Like the charge it ignores the
   * waterline, so a hungry swan will climb out and follow you up the path.
   */
  private pester(delta: number): void {
    const flat = new THREE.Vector3(
      this.quarry.x - this.position.x,
      0,
      this.quarry.z - this.position.z,
    );
    const gap = flat.length();

    if (gap <= BEG_RANGE) {
      this.feedReady = true;
      this.velocity.multiplyScalar(Math.max(0, 1 - 5 * delta));
    } else {
      // Hustles if it's fallen behind, ambles if it's already alongside.
      const pace = gap > 6 ? 3.4 : 1.9;
      this.velocity.lerp(flat.normalize().multiplyScalar(pace), 3 * delta);
    }

    this.position.addScaledVector(this.velocity, delta);
    this.trackWaterline(delta, isInLake(this.position.x, this.position.z));
    this.settleHeight(delta);

    this.mesh.position.copy(this.position);
    if (gap > 0.2) this.mesh.rotation.y = Math.atan2(flat.x, flat.z);
    this.begPose(delta, gap);
  }

  /** Stood tall with the neck up, head tilting, waiting to be noticed. */
  private begPose(delta: number, gap: number): void {
    const afloat = this.wasInWater;
    for (const leg of this.legs) leg.visible = !afloat;

    const moving = gap > BEG_RANGE;
    this.stride += delta * (moving ? 9 : 2.5);
    const swing = Math.sin(this.stride);

    if (!afloat) {
      const [left, right] = this.legs as [THREE.Group, THREE.Group];
      const step = moving ? 0.55 : 0.05;
      left.rotation.x = swing * step;
      right.rotation.x = -swing * step;
      this.mesh.position.y += moving
        ? Math.abs(Math.cos(this.stride)) * 0.02
        : 0;
    }

    const [leftWing, rightWing] = this.wings as [THREE.Mesh, THREE.Mesh];
    leftWing.rotation.z = 0.05;
    rightWing.rotation.z = -0.05;

    this.mesh.rotation.x = 0;
    this.mesh.rotation.z = moving ? swing * 0.04 : 0;
    this.body.rotation.x = 0;
    // Neck straight up and craning, head cocked from side to side.
    this.neck.rotation.x = -0.55 + Math.sin(this.stride * 0.8) * 0.12;
    this.head.rotation.x = 0.45 + Math.sin(this.stride * 1.6) * 0.18;
    this.head.rotation.y = Math.sin(this.stride * 0.55) * 0.35;
  }

  /**
   * Bearing down on the player. Nothing holds it to the water or the bank now,
   * so it'll scramble out over the wall to get at you.
   */
  private runDown(delta: number, player?: THREE.Vector3): void {
    if (player) this.quarry.copy(player);
    this.chaseLeft -= delta;

    const flat = new THREE.Vector3(
      this.quarry.x - this.position.x,
      0,
      this.quarry.z - this.position.z,
    );
    const gap = flat.length();

    if (gap <= STRIKE_RANGE && this.strikeCooldown <= 0) {
      this.strikeReady = true;
      this.strikeCooldown = STRIKE_COOLDOWN;
    }

    // Given up, or the player has legged it far enough to be someone else's problem.
    if (this.chaseLeft <= 0 || gap > 45) {
      this.mode = isInLake(this.position.x, this.position.z) ? "swim" : "graze";
      this.modeTimer = 0;
      this.modeLength = 12 + Math.random() * 14;
      this.pickTarget();
      return;
    }

    // Pull up just short so it jostles rather than standing inside you.
    const wanted = gap > 1.4 ? 4.2 : 0.5;
    this.velocity.lerp(flat.normalize().multiplyScalar(wanted), 5 * delta);
    this.position.addScaledVector(this.velocity, delta);

    this.trackWaterline(delta, isInLake(this.position.x, this.position.z));
    this.settleHeight(delta);

    this.mesh.position.copy(this.position);
    if (gap > 0.2) this.mesh.rotation.y = Math.atan2(flat.x, flat.z);
    this.chargePose(delta);
  }

  /** Wings up, neck out low and flat — the full seaside menace. */
  private chargePose(delta: number): void {
    for (const leg of this.legs) leg.visible = !this.wasInWater;

    this.stride += delta * 14;
    const swing = Math.sin(this.stride);
    const [left, right] = this.legs as [THREE.Group, THREE.Group];
    left.rotation.x = swing * 0.8;
    right.rotation.x = -swing * 0.8;

    const [leftWing, rightWing] = this.wings as [THREE.Mesh, THREE.Mesh];
    const beat = 0.7 + Math.sin(this.stride * 0.7) * 0.35;
    leftWing.rotation.z = beat;
    rightWing.rotation.z = -beat;

    this.mesh.rotation.x = 0;
    this.mesh.rotation.z = swing * 0.06;
    this.mesh.position.y += Math.abs(Math.cos(this.stride)) * 0.03;
    this.body.rotation.x = 0.18;
    // Neck thrown forward and level with the ground, beak first.
    this.neck.rotation.x = 1.35 + Math.sin(this.stride * 2) * 0.12;
    this.head.rotation.x = -0.5;
    this.head.rotation.y = 0;
  }

  /** Wings up and lunging at a rival over the crumbs. */
  private haveItOut(delta: number): void {
    const flat = new THREE.Vector3(
      this.scrapFace.x - this.position.x,
      0,
      this.scrapFace.z - this.position.z,
    );
    const gap = flat.length();
    if (gap > 0.4) {
      this.velocity.lerp(
        flat.normalize().multiplyScalar(gap > 2.5 ? 3.2 : 1.6),
        5 * delta,
      );
    } else {
      // Barge them a half-metre back rather than sitting inside them.
      const shove = flat.lengthSq() > 0.01 ? flat.normalize() : new THREE.Vector3(1, 0, 0);
      this.velocity.lerp(shove.multiplyScalar(2.4), 8 * delta);
    }

    this.position.addScaledVector(this.velocity, delta);
    this.trackWaterline(delta, isInLake(this.position.x, this.position.z));
    this.settleHeight(delta);

    this.mesh.position.copy(this.position);
    if (gap > 0.15) this.mesh.rotation.y = Math.atan2(flat.x, flat.z);

    for (const leg of this.legs) leg.visible = !this.wasInWater;
    this.stride += delta * 14;
    const stamp = Math.sin(this.stride);
    if (!this.wasInWater) {
      const [left, right] = this.legs as [THREE.Group, THREE.Group];
      left.rotation.x = stamp * 0.55;
      right.rotation.x = -stamp * 0.55;
    }

    const [leftWing, rightWing] = this.wings as [THREE.Mesh, THREE.Mesh];
    const arch = 1.1 + Math.sin(this.stride * 2.2) * 0.18;
    leftWing.rotation.z = arch;
    rightWing.rotation.z = -arch;

    this.mesh.rotation.x = 0;
    this.mesh.rotation.z = stamp * 0.08;
    this.body.rotation.x = 0.1;
    this.neck.rotation.x = 0.85 + Math.sin(this.stride * 3) * 0.2;
    this.head.rotation.x = -0.35;
    this.head.rotation.y = Math.sin(this.stride * 2) * 0.25;
  }

  /**
   * Busking on the bank: wings arched high, neck coiled, staring the
   * passer-by down. They don't give chase unless something else sets them off.
   */
  private holdBusk(delta: number): void {
    this.velocity.multiplyScalar(Math.max(0, 1 - 6 * delta));
    this.position.addScaledVector(this.velocity, delta);
    this.trackWaterline(delta, isInLake(this.position.x, this.position.z));
    this.settleHeight(delta);

    this.mesh.position.copy(this.position);
    const dx = this.buskFace.x - this.position.x;
    const dz = this.buskFace.z - this.position.z;
    if (dx * dx + dz * dz > 0.05) this.mesh.rotation.y = Math.atan2(dx, dz);

    for (const leg of this.legs) leg.visible = !this.wasInWater;
    this.stride += delta * 5;
    const stamp = Math.sin(this.stride);
    const [left, right] = this.legs as [THREE.Group, THREE.Group];
    left.rotation.x = stamp * 0.12;
    right.rotation.x = -stamp * 0.12;

    const [leftWing, rightWing] = this.wings as [THREE.Mesh, THREE.Mesh];
    // Arched right up — the classic mute swan threat display.
    const arch = 1.05 + Math.sin(this.stride * 1.4) * 0.12;
    leftWing.rotation.z = arch;
    rightWing.rotation.z = -arch;

    this.mesh.rotation.x = 0;
    this.mesh.rotation.z = stamp * 0.03;
    this.body.rotation.x = -0.08;
    this.neck.rotation.x = 0.35 + Math.sin(this.stride * 2) * 0.08;
    this.head.rotation.x = -0.15;
    this.head.rotation.y = 0;
  }

  /** Fires the scramble or the slide when they cross the waterline. */
  private trackWaterline(delta: number, inWater: boolean): void {
    if (this.climb > 0) this.climb = Math.max(0, this.climb - delta);
    if (this.slide > 0) this.slide = Math.max(0, this.slide - delta);

    if (this.wasInWater !== inWater) {
      if (inWater) {
        this.slide = SLIDE_TIME;
        this.splash();
      } else {
        this.climb = CLIMB_TIME;
      }
      this.wasInWater = inWater;
    }
  }

  private settleHeight(delta: number): void {
    if (this.climb > 0) {
      // Heave up out of the water, with a shove at the top of the effort.
      const t = 1 - this.climb / CLIMB_TIME;
      const eased = t * t * (3 - 2 * t);
      this.position.y =
        this.swimY +
        (this.landY - this.swimY) * eased +
        Math.sin(Math.PI * t) * 0.12;
      return;
    }
    if (this.slide > 0) {
      const t = 1 - this.slide / SLIDE_TIME;
      this.position.y = this.landY + (this.swimY - this.landY) * (t * t);
      return;
    }
    const restY = this.wasInWater ? this.swimY : this.landY;
    this.position.y += (restY - this.position.y) * Math.min(1, 4 * delta);
  }

  private animate(delta: number): void {
    const pace = this.velocity.length();
    const [left, right] = this.legs as [THREE.Group, THREE.Group];
    const [leftWing, rightWing] = this.wings as [THREE.Mesh, THREE.Mesh];

    if (this.climb > 0 || this.slide > 0) {
      const effort =
        this.climb > 0
          ? 1 - this.climb / CLIMB_TIME
          : 1 - this.slide / SLIDE_TIME;
      const flap = Math.sin(effort * Math.PI * 3);

      for (const leg of this.legs) leg.visible = true;
      // Nose up while heaving out, nose down while sliding back in.
      this.mesh.rotation.x =
        this.climb > 0 ? -0.3 * (1 - effort) : 0.22 * effort;
      this.mesh.rotation.z = 0;
      leftWing.rotation.z = -0.5 * Math.abs(flap);
      rightWing.rotation.z = 0.5 * Math.abs(flap);
      left.rotation.x = Math.sin(effort * Math.PI * 4) * 0.7;
      right.rotation.x = -Math.sin(effort * Math.PI * 4) * 0.7;
      this.neck.rotation.x = -0.3 - 0.25 * Math.sin(effort * Math.PI);
      return;
    }

    this.mesh.rotation.x = 0;
    leftWing.rotation.z = 0;
    rightWing.rotation.z = 0;

    if (this.wasInWater) {
      this.swimPose(delta, pace);
    } else {
      this.walkPose(delta, pace);
    }
  }

  private swimPose(delta: number, pace: number): void {
    for (const leg of this.legs) leg.visible = false;

    const t = performance.now() / 1000;
    // Riding the ripples, plus a slow roll as the feet paddle out of sight.
    this.mesh.position.y += Math.sin(t * 1.9) * 0.045;
    this.mesh.rotation.z = Math.sin(t * 1.3) * 0.05;
    this.body.rotation.x = Math.sin(t * 1.9) * 0.04;

    this.dipWait -= delta;
    if (this.dipWait <= 0 && this.dip <= 0) {
      this.dip = 1.6;
      this.dipWait = 6 + Math.random() * 10;
    }
    if (this.dip > 0) {
      this.dip -= delta;
      // Head down for a feed, then back up.
      const reach = Math.sin((1 - this.dip / 1.6) * Math.PI);
      this.neck.rotation.x = -0.3 + reach * 1.7;
      this.head.rotation.x = reach * 0.6;
    } else {
      this.neck.rotation.x = -0.3 + Math.sin(t * 0.8) * 0.08;
      this.head.rotation.x = 0;
      this.head.rotation.y = Math.sin(t * 0.45) * 0.4;
    }

    this.wakeWait -= delta * Math.max(0.2, pace);
    if (this.wakeWait <= 0) {
      this.wakeWait = 0.9 + Math.random() * 0.6;
      this.wake();
    }
  }

  private walkPose(delta: number, pace: number): void {
    for (const leg of this.legs) leg.visible = true;

    this.stride += delta * (2 + pace * 5);
    const swing = Math.sin(this.stride);
    const [left, right] = this.legs as [THREE.Group, THREE.Group];
    left.rotation.x = swing * 0.6;
    right.rotation.x = -swing * 0.6;

    // Swans rock side to side over the planted foot — that's the waddle.
    this.mesh.rotation.z = swing * 0.13;
    this.mesh.position.y += Math.abs(Math.cos(this.stride)) * 0.035;
    this.body.rotation.x = 0.05;
    this.neck.rotation.x = -0.3 + Math.sin(this.stride * 2) * 0.06;
    this.head.rotation.y = Math.sin(this.stride * 0.5) * 0.3;
    this.head.rotation.x = 0;
  }

  /** A ring on the surface, left behind as they paddle. */
  private ripple(
    radius: number,
    life: number,
    opacity: number,
    at?: THREE.Vector2,
  ): void {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.6, radius, 14),
      new THREE.MeshBasicMaterial({
        color: 0xdff2ff,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(
      at?.x ?? this.position.x,
      WATER_Y + 0.02,
      at?.y ?? this.position.z,
    );
    this.scene.add(mesh);

    const started = performance.now();
    const grow = (): void => {
      const t = (performance.now() - started) / (life * 1000);
      if (t >= 1) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        return;
      }
      mesh.scale.setScalar(1 + t * 2.2);
      (mesh.material as THREE.MeshBasicMaterial).opacity = opacity * (1 - t);
      requestAnimationFrame(grow);
    };
    requestAnimationFrame(grow);
  }

  private wake(): void {
    this.ripple(0.45, 1.6, 0.28);
  }

  private splash(): void {
    this.ripple(0.34, 0.9, 0.7);
  }

  /** Swans only foul the ground once they're out of the lake. */
  public shouldDrop(): boolean {
    if (this.forcedDrop) {
      this.forcedDrop = false;
      return true;
    }
    if (!this.shouldDropNext) return false;
    this.shouldDropNext = false;
    if (!this.onLand) return false;
    return !isInLake(this.position.x, this.position.z);
  }

  /** Did a droplet at this point catch the bird? */
  public soakedBy(point: THREE.Vector3): boolean {
    const dx = point.x - this.position.x;
    const dz = point.z - this.position.z;
    if (dx * dx + dz * dz > 0.6 * 0.6) return false;
    return point.y > this.position.y - 0.15 && point.y < this.position.y + 1.2;
  }

  public getPosition(): THREE.Vector3 {
    return this.position.clone();
  }

  public getMesh(): THREE.Group {
    return this.mesh;
  }

  public dispose(): void {
    this.flecks.dispose();
    this.scene.remove(this.mesh);
  }
}
