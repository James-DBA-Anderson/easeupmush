import * as THREE from "three";
import { WATER_Y, nearestShore, outwardAt } from "../world/lake";
import { stepWalk } from "../world/blocking";
import { Grumble } from "../effects/Grumble";
import { MuckFlecks } from "../effects/MuckFlecks";
import type { GrassFire } from "../effects/GrassFire";

const COATS = [0x2f4f7f, 0x8b3a3a, 0x3f6b4a, 0x5a4a7a, 0xb06a2c, 0xd8452f];
const SKIN = [0xf0c8a0, 0xd9a066, 0x8d5a3b, 0x5c3a26];
const BUCKETS = [0x3f8fd0, 0xd85a2f, 0xe8c33c, 0x4aa85a];

const HITS = [
  "GOT ONE!",
  "IT'S A BIG UN",
  "LOOK AT THAT!",
  "ANOTHER ONE",
  "SWEET AS NUT!",
];
const MISSES = [
  "NOTHING AGAIN",
  "HE LET GO",
  "AW, MAN",
  "I'VE COPPED THE NEEDLE WITH THIS",
];
const FIRE_LINES = [
  "GET SOME WATER ON IT!",
  "I'VE GOT THE BUCKET!",
  "CHUCK IT!",
  "PUT IT OUT!",
  "QUICK — THE BUCKET!",
];
const SOAKED = [
  "OI! WATCH IT!",
  "YOU'RE SOAKING ME!",
  "LEAVE OFF!",
  "THAT WAS MY JUMPER!",
  "STOP IT!",
  "MUM — HE'S SPRAYING ME!",
];
const FOULED = [
  "THAT'S POO!",
  "DISGUSTING!",
  "YOU'VE COVERED ME!",
  "I'M COVERED IN IT!",
  "GROSS!",
  "I'M TELLING!",
];

/** Chance there's something on the line when they pull it up. */
const CATCH_ODDS = 0.45;
const HAUL_TIME = 1.3;
const SHOW_TIME = 1.6;
/** How close before they'll fling the bucket. */
const CHUCK_RANGE = 4.5;
const DRYING = 8;

type Phase =
  | "arriving"
  | "waiting"
  | "hauling"
  | "showing"
  | "casting"
  | "leaving"
  | "toFire"
  | "chucking";

/** A kid crouched at the edge with a hand line and a bucket, crabbing. */
export class Crabber {
  private scene: THREE.Scene;
  private group = new THREE.Group();

  private torso!: THREE.Mesh;
  private head!: THREE.Mesh;
  private legs: THREE.Group[] = [];
  private arms: THREE.Group[] = [];
  private hand = new THREE.Object3D();
  private line: THREE.Line;
  private lineEnd = new THREE.Vector3();
  private crab: THREE.Group;
  private bucket: THREE.Group;
  private bucketHome = new THREE.Vector3(-0.46, 0, -0.1);
  private bucketCrabs: THREE.Mesh[] = [];

  private phase: Phase = "arriving";
  private timer = 4 + Math.random() * 8;
  private hooked = false;
  private caught = 0;
  private bob = Math.random() * Math.PI * 2;
  private grumble: Grumble | null = null;
  private packUp: number;
  private stand = new THREE.Vector3();
  private exitFor = new THREE.Vector3();
  private fireTarget = new THREE.Vector3();
  private chucksLeft = 0;
  private step = Math.random() * Math.PI * 2;
  private gone = false;
  private wet = 0;
  private fouled = 0;
  private sprayTalkCool = 0;
  private flecks: MuckFlecks;
  private splashes: {
    mesh: THREE.Mesh;
    life: number;
    vx: number;
    vy: number;
    vz: number;
  }[] = [];

  /** Depth the line hangs at, and how far out from the wall it goes in. */
  private restY = WATER_Y - 0.55;
  private castPoint = new THREE.Vector3();
  private faceWater = 0;

  constructor(scene: THREE.Scene, at: THREE.Vector2, alongShore = 0) {
    this.scene = scene;
    this.packUp = 150 + Math.random() * 180;

    const shore = nearestShore(at.x, at.y);
    const out = outwardAt(shore);
    // Slide along the bank so a pair of them can sit side by side.
    const along = new THREE.Vector2(-out.y, out.x).multiplyScalar(alongShore);

    // Kneel on the coping, facing the water — not out on the path or in the lake.
    const x = shore.x + out.x * 0.45 + along.x;
    const z = shore.y + out.y * 0.45 + along.y;
    this.stand.set(x, 0, z);
    this.faceWater = Math.atan2(-out.x, -out.y);
    // Start back on the paving and walk over — never just materialise at the wall.
    this.group.position.set(x + out.x * 14, 0, z + out.y * 14);
    this.exitFor.set(x + out.x * 22, 0, z + out.y * 22);
    this.group.rotation.y = Math.atan2(
      this.stand.x - this.group.position.x,
      this.stand.z - this.group.position.z,
    );

    this.bucket = new THREE.Group();
    this.build();
    this.flecks = new MuckFlecks(this.group, 18);
    this.standPose();
    scene.add(this.group);
    // Kit stays packed until they're knelt down.
    this.line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(),
      ]),
      new THREE.LineBasicMaterial({
        color: 0xf0f0e8,
        transparent: true,
        opacity: 0.75,
      }),
    );
    this.line.visible = false;
    scene.add(this.line);

    this.castPoint.set(shore.x - out.x * 1.2, this.restY, shore.y - out.y * 1.2);
    this.lineEnd.copy(this.castPoint);

    this.crab = this.buildCrab();
    this.crab.visible = false;
    scene.add(this.crab);
  }

  private build(): void {
    const pick = <T>(list: readonly T[]): T =>
      list[Math.floor(Math.random() * list.length)]!;
    const coat = new THREE.MeshStandardMaterial({
      color: pick(COATS),
      roughness: 0.9,
    });
    const legMat = new THREE.MeshStandardMaterial({
      color: 0x2b3038,
      roughness: 0.9,
    });
    const skin = new THREE.MeshStandardMaterial({
      color: pick(SKIN),
      roughness: 0.8,
    });

    this.torso = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.4, 0.2), coat);
    this.torso.castShadow = true;
    this.group.add(this.torso);

    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), skin);
    this.head.castShadow = true;
    this.group.add(this.head);

    for (const side of [-1, 1] as const) {
      const leg = new THREE.Group();
      const thigh = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.36, 0.13),
        legMat,
      );
      thigh.geometry.translate(0, -0.18, 0);
      thigh.castShadow = true;
      leg.add(thigh);
      const shin = new THREE.Mesh(
        new THREE.BoxGeometry(0.11, 0.34, 0.12),
        legMat,
      );
      shin.geometry.translate(0, -0.17, 0);
      shin.position.set(0, -0.34, 0);
      shin.castShadow = true;
      leg.add(shin);
      this.group.add(leg);
      this.legs.push(leg);

      const arm = new THREE.Group();
      const upper = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, side > 0 ? 0.36 : 0.3, 0.09),
        coat,
      );
      upper.geometry.translate(0, side > 0 ? -0.18 : -0.15, 0);
      arm.add(upper);
      this.group.add(arm);
      this.arms.push(arm);
    }

    // Line hangs from the working (right) hand.
    this.arms[1]!.add(this.hand);
    this.hand.position.set(0, -0.36, 0);

    // The bucket, sat on the paving beside them with an inch of lake in it.
    const pail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.13, 0.26, 10, 1, true),
      new THREE.MeshStandardMaterial({
        color: pick(BUCKETS),
        roughness: 0.6,
        side: THREE.DoubleSide,
      }),
    );
    pail.position.y = 0.13;
    pail.castShadow = true;
    this.bucket.add(pail);

    const water = new THREE.Mesh(
      new THREE.CircleGeometry(0.15, 12),
      new THREE.MeshStandardMaterial({ color: 0x2e5f63, roughness: 0.3 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.19;
    this.bucket.add(water);

    this.bucket.position.copy(this.bucketHome);
    this.group.add(this.bucket);

    // Their catch so far, shuffling about in the bottom.
    const shell = new THREE.MeshStandardMaterial({
      color: 0x8c4a2f,
      roughness: 0.8,
    });
    for (let i = 0; i < 5; i++) {
      const crab = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), shell);
      crab.scale.set(1.4, 0.6, 1);
      crab.position.set(
        (Math.random() - 0.5) * 0.16,
        0.2,
        (Math.random() - 0.5) * 0.16,
      );
      crab.visible = false;
      this.bucket.add(crab);
      this.bucketCrabs.push(crab);
    }
  }

  /** Upright for walking to the wall, away, or at a grass fire. */
  private standPose(): void {
    this.torso.position.set(0, 0.95, 0);
    this.torso.rotation.x = 0;
    this.head.position.set(0, 1.28, 0.02);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const leg = this.legs[i]!;
      leg.position.set(side * 0.09, 0.72, 0);
      leg.rotation.x = 0;
      const shin = leg.children[1] as THREE.Mesh;
      shin.position.set(0, -0.34, 0);
      shin.rotation.x = 0;
      const arm = this.arms[i]!;
      arm.position.set(side * 0.2, 1.1, 0);
      arm.rotation.x = 0.12;
    }
  }

  /** Crouched on the coping with the line out. */
  private kneelPose(): void {
    this.torso.position.set(0, 0.58, -0.04);
    this.torso.rotation.x = 0.3;
    this.head.position.set(0, 0.87, 0.06);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const leg = this.legs[i]!;
      leg.position.set(side * 0.09, 0.38, 0.02);
      leg.rotation.x = -1.35;
      const shin = leg.children[1] as THREE.Mesh;
      shin.position.set(0, -0.08, 0.28);
      shin.rotation.x = 1.15;
    }
    this.arms[0]!.position.set(-0.19, 0.74, 0.02);
    this.arms[0]!.rotation.x = 0.5;
    this.arms[1]!.position.set(0.19, 0.76, 0.04);
    this.arms[1]!.rotation.x = 1.0;
  }

  private buildCrab(): THREE.Group {
    const crab = new THREE.Group();
    const shell = new THREE.MeshStandardMaterial({
      color: 0x8c4a2f,
      roughness: 0.8,
    });

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.07, 7, 5), shell);
    body.scale.set(1.5, 0.6, 1.1);
    crab.add(body);

    for (const side of [-1, 1]) {
      const claw = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), shell);
      claw.scale.set(1.4, 0.7, 0.9);
      claw.position.set(side * 0.12, 0.01, 0.05);
      crab.add(claw);

      for (let i = 0; i < 3; i++) {
        const leg = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 0.012, 0.012),
          shell,
        );
        leg.position.set(side * 0.11, -0.01, -0.02 - i * 0.03);
        crab.add(leg);
      }
    }
    return crab;
  }

  public getPosition(): THREE.Vector3 {
    return this.group.position.clone();
  }

  /** Did a droplet catch them while crouched on the wall? */
  public soakedBy(point: THREE.Vector3): boolean {
    const here = this.group.position;
    const dx = point.x - here.x;
    const dz = point.z - here.z;
    if (dx * dx + dz * dz > 0.55 * 0.55) return false;
    return point.y > here.y - 0.1 && point.y < here.y + 1.35;
  }

  public isSoaked(): boolean {
    return this.wet > 0;
  }

  /** Filthy bounce spray sticks to jumpers and faces. */
  public splatter(point: THREE.Vector3): void {
    this.flecks.splat(point);
  }

  /** Clean lance washes the muck off. */
  public rinse(point: THREE.Vector3): boolean {
    const cleared = this.flecks.rinseNear(point, 0.55);
    if (cleared && this.flecks.isEmpty()) this.fouled = 0;
    return cleared;
  }

  /**
   * Caught by the hose. First soak is a complaint; keep spraying and they
   * shout again every couple of seconds.
   */
  public drench(): boolean {
    if (this.gone || this.phase === "leaving") return false;
    const first = this.wet <= 0;
    this.wet = DRYING;
    this.reactToSpray(SOAKED, first);
    // Drop the haul and sit up for a second.
    if (
      first &&
      (this.phase === "waiting" ||
        this.phase === "hauling" ||
        this.phase === "showing" ||
        this.phase === "casting")
    ) {
      this.crab.visible = false;
      this.phase = "waiting";
      this.timer = 1.2 + Math.random() * 0.8;
    }
    return first;
  }

  /**
   * Hit by filthy water bouncing off a pile. Worse — often enough to pack up
   * and clear off. Returns whether this is a fresh fouling (complaint).
   */
  public foul(): boolean {
    if (this.gone || this.phase === "leaving") return false;
    const first = this.fouled <= 0;
    this.wet = DRYING;
    this.fouled = Math.max(this.fouled, 14);
    this.reactToSpray(FOULED, first);
    if (first && Math.random() < 0.6) {
      this.standPose();
      this.line.visible = false;
      this.crab.visible = false;
      this.phase = "leaving";
    }
    return first;
  }

  private reactToSpray(lines: readonly string[], first: boolean): void {
    if (!first && this.sprayTalkCool > 0) return;
    this.shout(lines);
    this.sprayTalkCool = first ? 2.4 : 3.0;
  }

  /** Bucket's full enough and they've wandered off. */
  public isDone(): boolean {
    return this.gone;
  }

  /**
   * Fire on the green — drop the line, grab the bucket, and chuck lake water
   * at the flames until they're out or they've had enough.
   */
  public fightFire(fire: GrassFire, delta: number): void {
    if (this.gone) return;
    if (this.phase === "leaving" || this.phase === "arriving") return;

    const flame = fire.nearestFlame(this.group.position);
    if (!flame) {
      if (this.phase === "toFire" || this.phase === "chucking") {
        this.resumeCrabbing();
      }
      return;
    }

    const gap = this.group.position.distanceTo(flame);
    // Too far away to bother — keep crabbing.
    if (gap > 48 && this.phase !== "toFire" && this.phase !== "chucking") {
      return;
    }

    if (this.phase !== "toFire" && this.phase !== "chucking") {
      this.phase = "toFire";
      this.standPose();
      this.line.visible = false;
      this.crab.visible = false;
      this.chucksLeft = 3 + Math.floor(Math.random() * 3);
      this.liftBucket(true);
      this.shout(FIRE_LINES);
    }

    this.fireTarget.copy(flame);

    if (this.phase === "toFire") {
      if (this.amble(this.fireTarget, delta, 3.4) < CHUCK_RANGE) {
        this.phase = "chucking";
        this.timer = 0.35;
      }
      this.updateSplashes(delta);
      return;
    }

    // Chucking — swing the bucket and tip water at the fire.
    this.timer -= delta;
    this.group.rotation.y = Math.atan2(
      this.fireTarget.x - this.group.position.x,
      this.fireTarget.z - this.group.position.z,
    );
    const swing = Math.sin(Math.max(0, 0.35 - this.timer) * 14) * 0.8;
    this.bucket.rotation.x = -0.4 - swing;
    this.bucket.position.set(-0.15, 0.75 + swing * 0.15, 0.35);

    if (this.timer <= 0) {
      this.flingWater(fire);
      this.chucksLeft -= 1;
      if (this.chucksLeft <= 0 || !fire.isBurning()) {
        this.resumeCrabbing();
      } else {
        this.timer = 0.55 + Math.random() * 0.25;
        if (Math.random() < 0.45) this.shout(FIRE_LINES);
      }
    }
    this.updateSplashes(delta);
  }

  public update(delta: number): void {
    this.grumble =
      this.grumble?.update(delta, this.group.position) === false
        ? null
        : this.grumble;
    this.flecks.update(delta);
    if (this.wet > 0) this.wet = Math.max(0, this.wet - delta);
    if (this.fouled > 0) this.fouled = Math.max(0, this.fouled - delta);
    if (this.sprayTalkCool > 0) {
      this.sprayTalkCool = Math.max(0, this.sprayTalkCool - delta);
    }

    if (this.phase === "toFire" || this.phase === "chucking") {
      return;
    }

    if (this.phase === "arriving") {
      if (this.amble(this.stand, delta, 1.6) < 0.35) {
        this.phase = "waiting";
        this.group.position.copy(this.stand);
        this.group.position.y = 0;
        this.group.rotation.y = this.faceWater;
        this.kneelPose();
        this.line.visible = true;
        this.timer = 3 + Math.random() * 5;
      }
      return;
    }

    if (this.phase === "leaving") {
      this.line.visible = false;
      this.crab.visible = false;
      if (this.amble(this.exitFor, delta, 1.8) < 0.5) this.gone = true;
      return;
    }

    this.packUp -= delta;
    if (this.packUp <= 0) {
      this.standPose();
      this.phase = "leaving";
      return;
    }

    this.bob += delta * 2;
    this.timer -= delta;

    const hand = this.hand.getWorldPosition(new THREE.Vector3());

    if (this.phase === "waiting") {
      // Line hanging in the water, twitching just enough to keep them hopeful.
      this.lineEnd.copy(this.castPoint);
      this.lineEnd.y = this.restY + Math.sin(this.bob * 1.7) * 0.04;
      if (this.timer <= 0) this.startHaul();
    } else if (this.phase === "hauling") {
      const t = 1 - Math.max(0, this.timer) / HAUL_TIME;
      this.lineEnd.lerpVectors(
        this.castPoint,
        hand.clone().setY(hand.y - 0.28),
        t,
      );
      if (this.timer <= 0) this.reveal();
    } else if (this.phase === "showing") {
      this.lineEnd.copy(hand).setY(hand.y - 0.28);
      if (this.timer <= 0) this.stow();
    } else {
      const t = 1 - Math.max(0, this.timer) / 0.8;
      this.lineEnd.lerpVectors(
        hand.clone().setY(hand.y - 0.28),
        this.castPoint,
        t,
      );
      if (this.timer <= 0) {
        this.phase = "waiting";
        this.timer = 5 + Math.random() * 9;
      }
    }

    const points = this.line.geometry.attributes
      .position as THREE.BufferAttribute;
    points.setXYZ(0, hand.x, hand.y, hand.z);
    points.setXYZ(1, this.lineEnd.x, this.lineEnd.y, this.lineEnd.z);
    points.needsUpdate = true;

    if (this.crab.visible) {
      this.crab.position.copy(this.lineEnd);
      // Dangling and spinning slowly on the end of the line.
      this.crab.rotation.y += delta * 2.2;
      this.crab.rotation.z = Math.sin(this.bob * 3) * 0.25;
    }
  }

  private liftBucket(up: boolean): void {
    if (up) {
      this.bucket.position.set(-0.15, 0.7, 0.25);
      this.bucket.rotation.set(-0.5, 0, 0.2);
    } else {
      this.bucket.position.copy(this.bucketHome);
      this.bucket.rotation.set(0, 0, 0);
    }
  }

  private resumeCrabbing(): void {
    this.liftBucket(false);
    this.standPose();
    this.phase = "leaving";
    this.chucksLeft = 0;
  }

  private flingWater(fire: GrassFire): void {
    const from = this.bucket.getWorldPosition(new THREE.Vector3());
    from.y += 0.2;
    const to = this.fireTarget;
    fire.douse(to, 0.75);
    // A few droplets in an arc toward the flames.
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 5, 4),
        new THREE.MeshBasicMaterial({
          color: 0x8ec8e0,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
        }),
      );
      mesh.position.copy(from);
      this.scene.add(mesh);
      const t = 0.35 + Math.random() * 0.4;
      this.splashes.push({
        mesh,
        life: t,
        vx: (to.x - from.x) / t + (Math.random() - 0.5) * 1.5,
        vy: 2.5 + Math.random() * 2,
        vz: (to.z - from.z) / t + (Math.random() - 0.5) * 1.5,
      });
    }
  }

  private updateSplashes(delta: number): void {
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const drop = this.splashes[i]!;
      drop.life -= delta;
      drop.vy -= 14 * delta;
      drop.mesh.position.x += drop.vx * delta;
      drop.mesh.position.y += drop.vy * delta;
      drop.mesh.position.z += drop.vz * delta;
      const mat = drop.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, drop.life * 2);
      if (drop.life > 0 && drop.mesh.position.y > 0.05) continue;
      this.scene.remove(drop.mesh);
      drop.mesh.geometry.dispose();
      mat.dispose();
      this.splashes.splice(i, 1);
    }
  }

  /** Walk toward a spot with a proper kid stride. Returns the gap left. */
  private amble(to: THREE.Vector3, delta: number, speed: number): number {
    const here = this.group.position;
    const gap = Math.hypot(to.x - here.x, to.z - here.z);
    if (gap < 0.05) return 0;
    const step = Math.min(gap, speed * delta);
    const landed = stepWalk(
      here.x,
      here.z,
      ((to.x - here.x) / gap) * step,
      ((to.z - here.z) / gap) * step,
      0.35,
      { x: here.x, z: here.z },
    );
    here.x = landed.x;
    here.z = landed.z;
    this.group.rotation.y = Math.atan2(to.x - here.x, to.z - here.z);
    this.step += delta * speed * 5.2;
    const swing = Math.sin(this.step) * 0.7;
    this.legs[0]!.rotation.x = swing;
    this.legs[1]!.rotation.x = -swing;
    this.arms[0]!.rotation.x = -swing * 0.8;
    this.arms[1]!.rotation.x = swing * 0.8;
    this.group.position.y = Math.abs(Math.sin(this.step)) * 0.05;
    return Math.hypot(to.x - here.x, to.z - here.z);
  }

  private startHaul(): void {
    this.phase = "hauling";
    this.timer = HAUL_TIME;
    this.hooked = Math.random() < CATCH_ODDS;
  }

  private reveal(): void {
    this.phase = "showing";
    this.timer = SHOW_TIME;
    this.crab.visible = this.hooked;
    this.shout(this.hooked ? HITS : MISSES);
  }

  /** Catch goes in the bucket, and the line goes back in the water. */
  private stow(): void {
    if (this.hooked) {
      this.caught += 1;
      const inBucket =
        this.bucketCrabs[Math.min(this.caught, this.bucketCrabs.length) - 1];
      if (inBucket) inBucket.visible = true;
    }
    this.crab.visible = false;
    this.phase = "casting";
    this.timer = 0.8;
  }

  private shout(lines: readonly string[]): void {
    this.grumble?.dispose();
    this.grumble = new Grumble(
      this.scene,
      lines[Math.floor(Math.random() * lines.length)]!,
      this.group.position,
    );
  }

  public dispose(): void {
    this.grumble?.dispose();
    this.flecks.dispose();
    for (const drop of this.splashes) {
      this.scene.remove(drop.mesh);
      drop.mesh.geometry.dispose();
      (drop.mesh.material as THREE.Material).dispose();
    }
    this.splashes = [];
    this.scene.remove(this.group);
    this.scene.remove(this.line);
    this.scene.remove(this.crab);
    this.line.geometry.dispose();
    (this.line.material as THREE.Material).dispose();
  }
}
