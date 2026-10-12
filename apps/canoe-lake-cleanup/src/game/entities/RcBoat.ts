import * as THREE from "three";
import { WATER_Y, isInLake, nearestShore, outwardAt } from "../world/lake";
import { groundHeight } from "../world/terrain";
import { parkAudio } from "../audio/ParkAudio";
import { Grumble } from "../effects/Grumble";
import { Face } from "./Face";
import { lines } from "../../dialogue";

const HULLS = [0xd8452f, 0x2f6fd8, 0xe8e4dc, 0xe0b83c];
const COATS = [0x2f4f7f, 0x8b3a3a, 0x3f6b4a, 0x5a4a7a, 0xb06a2c];
const SKIN = [0xf0c8a0, 0xd9a066, 0x8d5a3b, 0x5c3a26];

/** How far out the boat is allowed to roam before it's called back in. */
const LEASH = 26;
const CRUISE = 3.4;
/** Continuous jet time to put her under, roughly. */
const FILL_PER_HIT = 0.0024;
const HIT_RADIUS = 0.55;

/** A kid on the bank running a radio boat about on the water. */
export class RcBoat {
  private scene: THREE.Scene;
  private kid: THREE.Group;
  private boat: THREE.Group;
  private bilgeWater: THREE.Mesh;

  private torso!: THREE.Group;
  private legs: THREE.Group[] = [];
  private knees: THREE.Group[] = [];
  private arms: THREE.Group[] = [];
  private elbows: THREE.Group[] = [];
  private face!: Face;
  private head!: THREE.Group;
  private radio!: THREE.Group;
  private sticks: THREE.Group[] = [];
  private radioLed!: THREE.MeshStandardMaterial;
  /** 0 = walking with the set down, 1 = held up and driving. */
  private radioBlend = 0;
  private stand: THREE.Vector3;
  private position: THREE.Vector3;
  private heading: number;
  private speed = 0;

  private target = new THREE.Vector2();
  private wakeTimer = 0;
  private bob = Math.random() * Math.PI * 2;
  /** Set while showing off, which is most of the time. */
  private donut = 0;
  private donutWait = 6 + Math.random() * 12;
  private packUp: number;
  private arriving = true;
  private leaving = false;
  private gone = false;
  private step = Math.random() * Math.PI * 2;
  private exitFor = new THREE.Vector3();

  /** 0 dry, 1 about to go under — jet wash fills the hull. */
  private bilge = 0;
  private sunk = false;
  private sinkTimer = 0;
  private grumble: Grumble | null = null;
  private lastNark = 0;
  private narkedAt = 0;
  private complaintDue = false;
  private sunkClaimed = false;
  private hitReady = false;

  constructor(scene: THREE.Scene, at: THREE.Vector2) {
    this.scene = scene;
    this.packUp = 70 + Math.random() * 90;

    // Stand on the paving right at the water's edge, looking out.
    const shore = nearestShore(at.x, at.y);
    const out = outwardAt(shore);
    this.stand = new THREE.Vector3(
      shore.x + out.x * 1.6,
      0,
      shore.y + out.y * 1.6,
    );
    this.exitFor.set(shore.x + out.x * 20, 0, shore.y + out.y * 20);

    this.kid = this.buildKid();
    // Walk over from the path rather than appearing with the sticks already out.
    this.kid.position.set(
      this.stand.x + out.x * 12,
      0,
      this.stand.z + out.y * 12,
    );
    scene.add(this.kid);

    // Launch it a little way off the bank in front of them.
    this.position = new THREE.Vector3(
      shore.x - out.x * 6,
      WATER_Y + 0.06,
      shore.y - out.y * 6,
    );
    this.heading = Math.atan2(-out.x, -out.y);
    const built = this.buildBoat();
    this.boat = built.group;
    this.bilgeWater = built.water;
    this.boat.visible = false;
    scene.add(this.boat);
    this.pickTarget();
  }

  private buildKid(): THREE.Group {
    const group = new THREE.Group();
    const pick = <T>(list: readonly T[]): T =>
      list[Math.floor(Math.random() * list.length)]!;
    const coat = new THREE.MeshStandardMaterial({
      color: pick(COATS),
      roughness: 0.9,
    });
    const legMat = new THREE.MeshStandardMaterial({
      color: pick([0x2b3038, 0x3a3a44, 0x4a3a28]),
      roughness: 0.9,
    });
    const skin = new THREE.MeshStandardMaterial({
      color: pick(SKIN),
      roughness: 0.8,
    });
    const shoeMat = new THREE.MeshStandardMaterial({
      color: pick([0x2a2420, 0xc45a2a, 0xe8e4dc, 0x1a3a6a]),
      roughness: 0.85,
    });
    const part = (
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      x = 0,
      y = 0,
      z = 0,
    ): THREE.Mesh => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      return mesh;
    };

    // Hip is the pivot so a lean doesn't bury the shoes in the paving.
    this.torso = new THREE.Group();
    this.torso.position.y = 0.72;
    group.add(this.torso);

    this.torso.add(part(new THREE.BoxGeometry(0.36, 0.22, 0.24), coat, 0, 0.12, 0));
    this.torso.add(part(new THREE.BoxGeometry(0.4, 0.22, 0.26), coat, 0, 0.32, 0));
    this.torso.add(part(new THREE.BoxGeometry(0.38, 0.06, 0.25), coat, 0, 0.02, 0));
    this.torso.add(part(new THREE.BoxGeometry(0.18, 0.12, 0.05), coat, 0, 0.1, 0.14));
    this.torso.add(
      part(new THREE.BoxGeometry(0.012, 0.38, 0.004), legMat, 0, 0.24, 0.132),
    );
    this.torso.add(part(new THREE.BoxGeometry(0.26, 0.07, 0.2), coat, 0, 0.46, 0.02));
    this.torso.add(part(new THREE.CylinderGeometry(0.04, 0.045, 0.07, 7), skin, 0, 0.5, 0));

    this.head = new THREE.Group();
    this.head.position.y = 0.56;
    this.torso.add(this.head);
    this.face = new Face(skin, 0.9, true);
    this.head.add(this.face.group);

    const hood = new THREE.Mesh(
      new THREE.SphereGeometry(0.155, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.58),
      coat,
    );
    hood.position.set(0, 0.04, -0.07);
    hood.rotation.x = 0.42;
    hood.scale.set(1.18, 0.78, 1.02);
    hood.castShadow = true;
    this.head.add(hood);
    for (const side of [-1, 1] as const) {
      const cord = part(
        new THREE.CylinderGeometry(0.006, 0.006, 0.16, 5),
        coat,
        side * 0.045,
        -0.14,
        0.1,
      );
      cord.castShadow = false;
      this.head.add(cord);
      this.head.add(
        part(new THREE.SphereGeometry(0.012, 6, 4), coat, side * 0.045, -0.22, 0.1),
      );
    }

    for (const side of [-1, 1] as const) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.09, 0.72, 0);
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.14), legMat);
      thigh.geometry.translate(0, -0.11, 0);
      thigh.castShadow = true;
      leg.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -0.21;
      leg.add(knee);
      const shin = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.2, 0.13), legMat);
      shin.geometry.translate(0, -0.1, 0);
      shin.castShadow = true;
      knee.add(shin);
      const shoe = new THREE.Group();
      shoe.position.y = -0.21;
      knee.add(shoe);
      shoe.add(part(new THREE.BoxGeometry(0.12, 0.07, 0.16), shoeMat, 0, -0.02, 0.02));
      shoe.add(part(new THREE.BoxGeometry(0.12, 0.05, 0.08), shoeMat, 0, -0.03, 0.11));
      group.add(leg);
      this.legs.push(leg);
      this.knees.push(knee);

      const arm = new THREE.Group();
      arm.position.set(side * 0.23, 0.4, 0);
      this.torso.add(arm);
      arm.add(part(new THREE.SphereGeometry(0.055, 7, 6), coat, 0, 0, 0));
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.11), coat);
      upper.geometry.translate(0, -0.09, 0);
      upper.castShadow = true;
      arm.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.18;
      elbow.rotation.x = -0.2;
      arm.add(elbow);
      const fore = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.1), coat);
      fore.geometry.translate(0, -0.08, 0);
      fore.castShadow = true;
      elbow.add(fore);
      elbow.add(part(new THREE.BoxGeometry(0.1, 0.035, 0.11), coat, 0, -0.15, 0));
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.04, 7, 5), skin);
      hand.position.y = -0.2;
      elbow.add(hand);
      this.arms.push(arm);
      this.elbows.push(elbow);
    }

    this.radio = this.buildRadio();
    this.radio.position.set(0.16, -0.2, 0.08);
    this.radio.rotation.set(0.55, 0.35, 0.2);
    this.torso.add(this.radio);
    return group;
  }

  /** Two-stick transmitter the kid holds out in front. */
  private buildRadio(): THREE.Group {
    const radio = new THREE.Group();
    const bodyCol = [0xe24a2f, 0x2a7fd4, 0xe8b030, 0x3a3a42][
      Math.floor(Math.random() * 4)
    ]!;
    const shell = new THREE.MeshStandardMaterial({
      color: bodyCol,
      roughness: 0.45,
    });
    const plastic = new THREE.MeshStandardMaterial({
      color: 0x1e1e22,
      roughness: 0.55,
    });
    const steel = new THREE.MeshStandardMaterial({
      color: 0x9aa0a6,
      metalness: 0.7,
      roughness: 0.3,
    });
    const brick = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.17), shell);
    brick.castShadow = true;
    radio.add(brick);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.07, 0.11), plastic);
    grip.position.y = -0.09;
    radio.add(grip);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.002), plastic);
    plate.position.set(0, 0.02, 0.086);
    radio.add(plate);

    for (const side of [-1, 1] as const) {
      const well = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.022, 8),
        plastic,
      );
      well.position.set(side * 0.075, 0.09, 0.02);
      radio.add(well);
      const stick = new THREE.Group();
      stick.position.set(side * 0.075, 0.095, 0.02);
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.01, 0.01, 0.075, 6),
        steel,
      );
      shaft.position.y = 0.038;
      stick.add(shaft);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), plastic);
      knob.position.y = 0.078;
      stick.add(knob);
      radio.add(stick);
      this.sticks.push(stick);
    }

    const aerial = new THREE.Mesh(
      new THREE.CylinderGeometry(0.007, 0.007, 0.46, 5),
      steel,
    );
    aerial.position.set(0.11, 0.3, -0.03);
    aerial.rotation.z = -0.32;
    radio.add(aerial);
    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.014, 6, 4),
      new THREE.MeshStandardMaterial({ color: 0xee3333, roughness: 0.4 }),
    );
    tip.position.set(0.18, 0.52, -0.03);
    radio.add(tip);

    this.radioLed = new THREE.MeshStandardMaterial({
      color: 0x3ecf6a,
      emissive: 0x1a8a3a,
      emissiveIntensity: 0.35,
    });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.013, 6, 4), this.radioLed);
    led.position.set(-0.11, 0.1, 0.07);
    radio.add(led);
    return radio;
  }

  private buildBoat(): { group: THREE.Group; water: THREE.Mesh } {
    const group = new THREE.Group();
    const pick = <T>(list: readonly T[]): T =>
      list[Math.floor(Math.random() * list.length)]!;
    const paint = new THREE.MeshStandardMaterial({
      color: pick(HULLS),
      roughness: 0.4,
    });
    const trim = new THREE.MeshStandardMaterial({
      color: 0xf2f2f0,
      roughness: 0.5,
    });

    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.78), paint);
    hull.position.y = 0.03;
    hull.castShadow = true;
    group.add(hull);

    // A wedge of a prow so it looks like it's planing along.
    const prow = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 4), paint);
    prow.rotation.x = Math.PI / 2;
    prow.rotation.y = Math.PI / 4;
    prow.position.set(0, 0.04, 0.52);
    group.add(prow);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.13, 0.26), trim);
    cabin.position.set(0, 0.15, -0.06);
    cabin.castShadow = true;
    group.add(cabin);

    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, 0.3, 4),
      new THREE.MeshStandardMaterial({ color: 0x9aa0a6 }),
    );
    mast.position.set(0, 0.34, -0.12);
    group.add(mast);

    // Water pooling in the hull — rises as the jet fills her.
    const water = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.06, 0.55),
      new THREE.MeshStandardMaterial({
        color: 0x5a9ec0,
        transparent: true,
        opacity: 0.72,
        roughness: 0.15,
        depthWrite: false,
      }),
    );
    water.position.set(0, -0.02, 0.02);
    water.visible = false;
    group.add(water);

    return { group, water };
  }

  private pickTarget(): void {
    // Somewhere out in front of the kid, but still on open water.
    for (let tries = 0; tries < 20; tries++) {
      const angle = Math.random() * Math.PI * 2;
      const reach = 8 + Math.random() * (LEASH - 8);
      const x = this.stand.x + Math.cos(angle) * reach;
      const z = this.stand.z + Math.sin(angle) * reach;
      if (!isInLake(x, z)) continue;
      this.target.set(x, z);
      return;
    }
    // Nothing clear found, so bring it back towards the bank.
    const shore = nearestShore(this.position.x, this.position.z);
    const out = outwardAt(shore);
    this.target.set(shore.x - out.x * 8, shore.y - out.y * 8);
  }

  public getPosition(): THREE.Vector3 {
    return this.position.clone();
  }

  /** Their tea's ready and they've packed the boat away. */
  public isDone(): boolean {
    return this.gone;
  }

  /** One complaint owed when the boat goes under. */
  public claimComplaint(): boolean {
    if (!this.complaintDue) return false;
    this.complaintDue = false;
    return true;
  }

  /** True once when the hull goes under. */
  public claimSunk(): boolean {
    if (!this.sunkClaimed) return false;
    this.sunkClaimed = false;
    return true;
  }

  /**
   * Jet water into the hull. Returns true if the droplet was taken so it
   * doesn't keep going into the lake.
   */
  public takeWater(point: THREE.Vector3): boolean {
    if (this.arriving || this.leaving || this.gone || !this.boat.visible)
      return false;

    const dx = point.x - this.position.x;
    const dz = point.z - this.position.z;
    if (dx * dx + dz * dz > HIT_RADIUS * HIT_RADIUS) return false;
    if (point.y > WATER_Y + 0.7 || point.y < WATER_Y - 0.25) return false;

    if (this.sunk) return true;

    const before = this.bilge;
    this.bilge = Math.min(1, this.bilge + FILL_PER_HIT);

    // First proper soaking — kid notices.
    if (before < 0.28 && this.bilge >= 0.28) this.nark(false);
    else if (before < 0.65 && this.bilge >= 0.65) this.nark(false);
    else if (this.bilge - this.narkedAt > 0.22 && this.bilge < 1) {
      this.nark(false);
    }

    if (this.bilge >= 1 && !this.sunk) this.founder();
    return true;
  }

  private nark(sunk: boolean): void {
    const now = performance.now();
    if (!sunk && now - this.lastNark < 1600) return;
    this.lastNark = now;
    this.narkedAt = this.bilge;
    const shouts = sunk ? lines('kid', 'rc-sunk') : lines('kid', 'rc-narked');
    this.grumble?.dispose();
    this.grumble = new Grumble(
      this.scene,
      shouts[Math.floor(Math.random() * shouts.length)]!,
      this.kid.position,
      "kid",
    );
  }

  /** She's going under — kid's day is ruined. */
  private founder(): void {
    this.sunk = true;
    this.sinkTimer = 0;
    this.speed = 0;
    this.donut = 0;
    this.complaintDue = true;
    this.sunkClaimed = true;
    this.nark(true);
    this.packUp = Math.min(this.packUp, 2.5);
  }

  public update(delta: number, chase: THREE.Vector3 | null = null): void {
    this.grumble =
      this.grumble?.update(delta, this.kid.position) === false
        ? null
        : this.grumble;
    this.face.update(delta);

    if (this.arriving) {
      this.bob += delta * 5;
      const gap = Math.hypot(
        this.stand.x - this.kid.position.x,
        this.stand.z - this.kid.position.z,
      );
      this.radioBlend = THREE.MathUtils.damp(
        this.radioBlend,
        gap < 3.5 ? 1 : 0,
        6,
        delta,
      );
      if (this.amble(this.stand, delta, 1.7) < 0.3) {
        this.arriving = false;
        this.kid.position.copy(this.stand);
        this.boat.visible = true;
        this.poseHold();
      }
      return;
    }

    if (this.leaving) {
      this.bob += delta * 5;
      this.boat.visible = false;
      this.radioBlend = THREE.MathUtils.damp(this.radioBlend, 0, 6, delta);
      if (this.amble(this.exitFor, delta, 1.8) < 0.5) this.gone = true;
      return;
    }

    if (this.sunk) {
      this.sinkTimer += delta;
      this.bob += delta * 8;
      this.poseBoat(0);
      if (this.sinkTimer > 0.35 && Math.random() < delta * 6) this.bubble();
      if (this.sinkTimer > 2.8) {
        this.boat.visible = false;
        this.leaving = true;
      }
      this.watch(delta);
      return;
    }

    this.packUp -= delta;
    if (this.packUp <= 0) {
      this.leaving = true;
      return;
    }

    // When the cleaner's in the drink, ram them — otherwise potter about.
    if (chase && isInLake(chase.x, chase.z)) {
      this.target.set(chase.x, chase.z);
      this.donut = 0;
    } else {
      this.donutWait -= delta;
      if (this.donutWait <= 0 && this.donut <= 0) {
        this.donut = 2 + Math.random() * 2.5;
        this.donutWait = 8 + Math.random() * 16;
      }
    }

    const to = new THREE.Vector2(
      this.target.x - this.position.x,
      this.target.y - this.position.z,
    );
    let wanted = Math.atan2(to.x, to.y);

    if (this.donut > 0 && !(chase && isInLake(chase.x, chase.z))) {
      this.donut -= delta;
      wanted = this.heading + 1.4;
    } else if (to.length() < 2.5 && !(chase && isInLake(chase.x, chase.z))) {
      this.pickTarget();
    }

    let turn = wanted - this.heading;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    const turnRate = chase && isInLake(chase.x, chase.z) ? 3.4 : 2.6;
    this.heading += THREE.MathUtils.clamp(
      turn,
      -turnRate * delta,
      turnRate * delta,
    );

    const tight = Math.min(1, Math.abs(turn));
    const laden = 1 - this.bilge * 0.72;
    const wantSpeed =
      chase && isInLake(chase.x, chase.z)
        ? CRUISE * 1.15 * laden
        : CRUISE * (1 - tight * 0.45) * laden;
    this.speed += (wantSpeed - this.speed) * Math.min(1, 2 * delta);

    const step = new THREE.Vector3(
      Math.sin(this.heading) * this.speed * delta,
      0,
      Math.cos(this.heading) * this.speed * delta,
    );
    const next = this.position.clone().add(step);
    if (isInLake(next.x, next.z)) {
      this.position.copy(next);
    } else {
      this.heading += Math.PI * (0.6 + Math.random() * 0.8);
      this.speed *= 0.3;
      if (!(chase && isInLake(chase.x, chase.z))) this.pickTarget();
    }

    // Ram the cleaner if close enough.
    if (chase && isInLake(chase.x, chase.z) && !this.sunk) {
      const gap = Math.hypot(chase.x - this.position.x, chase.z - this.position.z);
      if (gap < 1.35 && this.speed > 0.8) {
        this.hitReady = true;
        this.heading += (Math.random() - 0.5) * 0.8;
        this.speed *= 0.55;
      }
    }

    this.bob += delta * (7 - this.bilge * 3);
    this.poseBoat(turn);

    this.wakeTimer -= delta;
    if (this.wakeTimer <= 0 && this.bilge < 0.85) {
      this.wakeTimer = 0.22 + this.bilge * 0.2;
      this.wake();
    }

    this.watch(delta);
  }

  /** Boat just clipped the cleaner — once. */
  public claimHit(): boolean {
    if (!this.hitReady) return false;
    this.hitReady = false;
    return true;
  }

  private poseBoat(turn: number): void {
    const freeboard = this.sunk
      ? 0.05 - Math.min(1, this.sinkTimer / 2.2) * 0.45
      : 0.05 - this.bilge * 0.16;
    const bobAmp = this.sunk ? 0.004 : 0.015 * (1 - this.bilge * 0.7);
    this.boat.position.set(
      this.position.x,
      WATER_Y + freeboard + Math.sin(this.bob) * bobAmp,
      this.position.z,
    );

    const list =
      (this.sunk ? 0.55 + this.sinkTimer * 0.25 : this.bilge * 0.45) *
      Math.sin(this.bob * 0.55 + 1.2);
    const pitch = this.sunk ? 0.35 + this.sinkTimer * 0.2 : this.bilge * 0.12;
    this.boat.rotation.set(
      Math.sin(this.bob * 0.7) * 0.05 + pitch,
      this.heading,
      -turn * 0.55 + list,
    );

    // Water in the bilge rises with the fill.
    const show = this.bilge > 0.04 && !this.sunk;
    this.bilgeWater.visible = show || (this.sunk && this.sinkTimer < 1.5);
    if (this.bilgeWater.visible) {
      const level = this.sunk ? 1 : this.bilge;
      this.bilgeWater.position.y = -0.03 + level * 0.09;
      this.bilgeWater.scale.set(1, 0.25 + level * 0.9, 1);
      (this.bilgeWater.material as THREE.MeshStandardMaterial).opacity =
        0.55 + level * 0.3;
    }
  }

  /** The kid tracks the boat, twiddling the sticks and leaning after it. */
  private watch(delta: number): void {
    this.radioBlend = THREE.MathUtils.damp(this.radioBlend, 1, 5, delta);
    const to = new THREE.Vector3().subVectors(this.position, this.stand);
    const facing = Math.atan2(to.x, to.z);

    let turn = facing - this.kid.rotation.y;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    this.kid.rotation.y += turn * Math.min(1, 4 * delta);

    const steer = THREE.MathUtils.clamp(turn * 2.2, -1, 1);
    const throttle = THREE.MathUtils.clamp(this.speed / CRUISE, 0, 1);
    const lookDown = THREE.MathUtils.clamp(1 - to.length() / 14, 0, 1);
    this.poseHold(steer, throttle, lookDown);
  }

  /** Arms up, set in both hands, sticks matching how the boat's running. */
  private poseHold(steer = 0, throttle = 0, lookDown = 0.2): void {
    const panic = this.sunk || this.bilge > 0.55;
    const t = this.radioBlend;
    const gy = groundHeight(this.kid.position.x, this.kid.position.z);
    this.pulseLed(panic ? 14 : 3.4);

    if (panic) {
      this.face.setMood(this.sunk ? "shocked" : "angry");
      const flap = Math.sin(this.bob * 2.6) * 0.45;
      const stamp = Math.sin(this.bob * 3.1);
      this.arms[0]!.rotation.set(-0.55 - Math.abs(flap) * 0.5, 0.1, 0.55 + flap);
      this.arms[1]!.rotation.set(-0.7 + flap * 0.25, -0.1, -0.6 - flap * 0.4);
      this.elbows[0]!.rotation.x = -0.35 + flap * 0.4;
      this.elbows[1]!.rotation.x = -0.45 - flap * 0.3;
      this.legs[0]!.rotation.set(stamp * 0.4, 0, 0.06);
      this.legs[1]!.rotation.set(-stamp * 0.32, 0, -0.06);
      this.knees[0]!.rotation.x = Math.max(0, stamp) * 0.85;
      this.knees[1]!.rotation.x = Math.max(0, -stamp) * 0.85;
      this.head.rotation.set(-0.22 + Math.abs(flap) * 0.15, flap * 0.35, flap * 0.12);
      this.torso.rotation.set(0.14, flap * 0.08, Math.sin(this.bob * 1.9) * 0.12);
      this.kid.rotation.x = 0;
      this.kid.rotation.z = 0;
      this.kid.position.y = gy + Math.abs(stamp) * 0.07;
      this.radio.position.set(0.05 * flap, 0.18 + Math.abs(flap) * 0.1, 0.28);
      this.radio.rotation.set(0.2 + flap * 0.5, flap * 0.7, flap * 0.4);
      this.sticks[0]!.rotation.set(
        Math.sin(this.bob * 7.2) * 0.55,
        0,
        Math.cos(this.bob * 5.4) * 0.45,
      );
      this.sticks[1]!.rotation.set(
        Math.cos(this.bob * 6.1) * 0.5,
        0,
        Math.sin(this.bob * 8) * 0.55,
      );
      return;
    }

    this.face.setMood(this.donut > 0 ? "pleased" : "idle");
    const fidget = Math.sin(this.bob * 0.55) * 0.06;
    const shift = Math.sin(this.bob * 0.28);
    this.arms[0]!.rotation.set(
      THREE.MathUtils.lerp(0.1, -0.95, t) + fidget,
      THREE.MathUtils.lerp(0.02, 0.18, t),
      THREE.MathUtils.lerp(0.12, 0.42, t),
    );
    this.arms[1]!.rotation.set(
      THREE.MathUtils.lerp(0.28, -1.0, t) - fidget * 0.35,
      THREE.MathUtils.lerp(-0.04, -0.18, t),
      THREE.MathUtils.lerp(-0.18, -0.42, t),
    );
    this.elbows[0]!.rotation.x = THREE.MathUtils.lerp(-0.22, -1.15, t);
    this.elbows[1]!.rotation.x = THREE.MathUtils.lerp(-0.55, -1.12, t);
    this.legs[0]!.rotation.set(0.05 + fidget * 0.25, 0, 0.04 + shift * 0.03);
    this.legs[1]!.rotation.set(-0.02 - fidget * 0.18, 0, -0.05 - shift * 0.03);
    this.knees[0]!.rotation.x = 0.08;
    this.knees[1]!.rotation.x = 0.12;
    this.head.rotation.set(-0.08 - lookDown * 0.18, steer * 0.22, 0);
    this.torso.rotation.set(
      0.06 + throttle * 0.05 + lookDown * 0.08,
      0,
      -steer * 0.1 + shift * 0.025,
    );
    this.kid.rotation.x = 0;
    this.kid.rotation.z = 0;
    this.kid.position.y = gy;

    this.radio.position.set(
      THREE.MathUtils.lerp(0.16, 0, t),
      THREE.MathUtils.lerp(-0.2, 0.14, t),
      THREE.MathUtils.lerp(0.08, 0.28, t),
    );
    this.radio.rotation.set(
      THREE.MathUtils.lerp(0.55, 0.12, t),
      THREE.MathUtils.lerp(0.4, 0, t),
      THREE.MathUtils.lerp(0.15, 0, t),
    );
    this.sticks[0]!.rotation.set(throttle * 0.55 + fidget * 0.35, 0, fidget * 0.2);
    this.sticks[1]!.rotation.set(fidget * 0.15, 0, -steer * 0.6);
  }

  private pulseLed(rate: number): void {
    const on = this.radioBlend > 0.15 && !this.leaving;
    this.radioLed.emissiveIntensity = on
      ? 0.35 + 0.7 * (0.5 + 0.5 * Math.sin(this.bob * rate))
      : 0.12;
  }

  private wake(): void {
    parkAudio.boatWash(0.25 + Math.min(0.5, this.speed * 0.12));
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.12, 0.22, 12),
      new THREE.MeshBasicMaterial({
        color: 0xdff2ff,
        transparent: true,
        opacity: 0.32,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(this.position.x, WATER_Y + 0.02, this.position.z);
    this.scene.add(ring);

    const started = performance.now();
    const grow = (): void => {
      const t = (performance.now() - started) / 1400;
      if (t >= 1) {
        this.scene.remove(ring);
        ring.geometry.dispose();
        (ring.material as THREE.Material).dispose();
        return;
      }
      ring.scale.setScalar(1 + t * 3);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.32 * (1 - t);
      requestAnimationFrame(grow);
    };
    requestAnimationFrame(grow);
  }

  private bubble(): void {
    const blob = new THREE.Mesh(
      new THREE.SphereGeometry(0.03 + Math.random() * 0.04, 5, 4),
      new THREE.MeshBasicMaterial({
        color: 0xdff2ff,
        transparent: true,
        opacity: 0.55,
      }),
    );
    blob.position.set(
      this.position.x + (Math.random() - 0.5) * 0.3,
      WATER_Y + 0.02,
      this.position.z + (Math.random() - 0.5) * 0.3,
    );
    this.scene.add(blob);
    const started = performance.now();
    const rise = (): void => {
      const t = (performance.now() - started) / 700;
      if (t >= 1) {
        this.scene.remove(blob);
        blob.geometry.dispose();
        (blob.material as THREE.Material).dispose();
        return;
      }
      blob.position.y = WATER_Y + 0.02 + t * 0.35;
      (blob.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - t);
      requestAnimationFrame(rise);
    };
    requestAnimationFrame(rise);
  }

  /** Walk the kid toward a spot. Returns the gap left. */
  private amble(to: THREE.Vector3, delta: number, speed: number): number {
    const here = this.kid.position;
    const gap = Math.hypot(to.x - here.x, to.z - here.z);
    if (gap < 0.05) {
      this.legs[0]!.rotation.set(0, 0, 0);
      this.legs[1]!.rotation.set(0, 0, 0);
      this.knees[0]!.rotation.x = 0.05;
      this.knees[1]!.rotation.x = 0.05;
      return 0;
    }
    const step = Math.min(gap, speed * delta);
    here.x += ((to.x - here.x) / gap) * step;
    here.z += ((to.z - here.z) / gap) * step;
    this.kid.rotation.set(0, Math.atan2(to.x - here.x, to.z - here.z), 0);
    this.torso.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
    this.step += delta * speed * 5.4;
    const swing = Math.sin(this.step) * 0.7;
    this.legs[0]!.rotation.set(swing, 0, 0);
    this.legs[1]!.rotation.set(-swing, 0, 0);
    this.knees[0]!.rotation.x = Math.max(0.05, -swing) * 0.9;
    this.knees[1]!.rotation.x = Math.max(0.05, swing) * 0.9;
    const t = this.radioBlend;
    this.arms[0]!.rotation.set(
      -swing * 0.8 * (1 - t) - 0.95 * t,
      0.16 * t,
      0.12 + 0.28 * t,
    );
    this.arms[1]!.rotation.set(
      0.22 * (1 - t) + swing * 0.15 * (1 - t) - 1.0 * t,
      -0.16 * t,
      -0.18 - 0.22 * t,
    );
    this.elbows[0]!.rotation.x = THREE.MathUtils.lerp(-0.22, -1.15, t);
    this.elbows[1]!.rotation.x = THREE.MathUtils.lerp(-0.5, -1.12, t);
    here.y = groundHeight(here.x, here.z) + Math.abs(Math.sin(this.step)) * 0.05;
    this.face.setMood(this.sunk ? "angry" : "pleased");
    this.pulseLed(2.2);
    this.radio.position.set(
      THREE.MathUtils.lerp(0.16, 0, t),
      THREE.MathUtils.lerp(-0.2, 0.14, t),
      THREE.MathUtils.lerp(0.08, 0.28, t),
    );
    this.radio.rotation.set(
      THREE.MathUtils.lerp(0.55, 0.12, t),
      THREE.MathUtils.lerp(0.35, 0, t),
      THREE.MathUtils.lerp(0.2, 0, t),
    );
    return gap - step;
  }

  public dispose(): void {
    this.grumble?.dispose();
    this.grumble = null;
    this.scene.remove(this.kid);
    this.scene.remove(this.boat);
  }
}
