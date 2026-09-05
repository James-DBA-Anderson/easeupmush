import * as THREE from 'three';
import { WATER_Y, nearestShore, outwardAt } from '../world/lake';
import { Grumble } from '../effects/Grumble';

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

/** Chance there's something on the line when they pull it up. */
const CATCH_ODDS = 0.45;
const HAUL_TIME = 1.3;
const SHOW_TIME = 1.6;

type Phase = "arriving" | "waiting" | "hauling" | "showing" | "casting" | "leaving";

/** A kid crouched at the edge with a hand line and a bucket, crabbing. */
export class Crabber {
  private scene: THREE.Scene;
  private group = new THREE.Group();

  private hand = new THREE.Object3D();
  private line: THREE.Line;
  private lineEnd = new THREE.Vector3();
  private crab: THREE.Group;
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
  private step = Math.random() * Math.PI * 2;
  private gone = false;

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

    const x = shore.x + out.x * 0.9 + along.x;
    const z = shore.y + out.y * 0.9 + along.y;
    this.stand.set(x, 0, z);
    this.faceWater = Math.atan2(-out.x, -out.y);
    // Start back on the paving and walk over — never just materialise at the wall.
    this.group.position.set(x + out.x * 14, 0, z + out.y * 14);
    this.exitFor.set(x + out.x * 22, 0, z + out.y * 22);
    this.group.rotation.y = Math.atan2(
      this.stand.x - this.group.position.x,
      this.stand.z - this.group.position.z,
    );

    this.build();
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

    this.castPoint.set(x - out.x * 1.5, this.restY, z - out.y * 1.5);
    this.lineEnd.copy(this.castPoint);

    this.crab = this.buildCrab();
    this.crab.visible = false;
    scene.add(this.crab);
  }

  private build(): void {
    const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;
    const coat = new THREE.MeshStandardMaterial({ color: pick(COATS), roughness: 0.9 });
    const legMat = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: pick(SKIN), roughness: 0.8 });

    // Crouched down over the water: torso low, knees up, leaning forward.
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.4, 0.2), coat);
    torso.position.set(0, 0.58, -0.04);
    torso.rotation.x = 0.3;
    torso.castShadow = true;
    this.group.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), skin);
    head.position.set(0, 0.87, 0.06);
    head.castShadow = true;
    this.group.add(head);

    for (const side of [-1, 1]) {
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.32, 0.13), legMat);
      thigh.geometry.translate(0, -0.16, 0);
      thigh.position.set(side * 0.09, 0.38, 0.02);
      thigh.rotation.x = -1.35;
      this.group.add(thigh);

      const shin = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.34, 0.12), legMat);
      shin.geometry.translate(0, -0.17, 0);
      shin.position.set(side * 0.09, 0.36, 0.3);
      this.group.add(shin);
    }

    // Trailing arm, then the working arm which the line hangs from.
    const idle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.09), coat);
    idle.geometry.translate(0, -0.15, 0);
    idle.position.set(-0.19, 0.74, 0.02);
    idle.rotation.x = 0.5;
    this.group.add(idle);

    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.36, 0.09), coat);
    arm.geometry.translate(0, -0.18, 0);
    arm.position.set(0.19, 0.76, 0.04);
    arm.rotation.x = 1.0;
    this.group.add(arm);

    this.hand.position.set(0.19, 0.56, 0.36);
    this.group.add(this.hand);

    // The bucket, sat on the paving beside them with an inch of lake in it.
    const bucket = new THREE.Group();
    const pail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.13, 0.26, 10, 1, true),
      new THREE.MeshStandardMaterial({ color: pick(BUCKETS), roughness: 0.6, side: THREE.DoubleSide }),
    );
    pail.position.y = 0.13;
    pail.castShadow = true;
    bucket.add(pail);

    const water = new THREE.Mesh(
      new THREE.CircleGeometry(0.15, 12),
      new THREE.MeshStandardMaterial({ color: 0x2e5f63, roughness: 0.3 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.19;
    bucket.add(water);

    bucket.position.set(-0.46, 0, -0.1);
    this.group.add(bucket);

    // Their catch so far, shuffling about in the bottom.
    const shell = new THREE.MeshStandardMaterial({ color: 0x8c4a2f, roughness: 0.8 });
    for (let i = 0; i < 5; i++) {
      const crab = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), shell);
      crab.scale.set(1.4, 0.6, 1);
      crab.position.set((Math.random() - 0.5) * 0.16, 0.2, (Math.random() - 0.5) * 0.16);
      crab.visible = false;
      bucket.add(crab);
      this.bucketCrabs.push(crab);
    }
  }

  private buildCrab(): THREE.Group {
    const crab = new THREE.Group();
    const shell = new THREE.MeshStandardMaterial({ color: 0x8c4a2f, roughness: 0.8 });

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.07, 7, 5), shell);
    body.scale.set(1.5, 0.6, 1.1);
    crab.add(body);

    for (const side of [-1, 1]) {
      const claw = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), shell);
      claw.scale.set(1.4, 0.7, 0.9);
      claw.position.set(side * 0.12, 0.01, 0.05);
      crab.add(claw);

      for (let i = 0; i < 3; i++) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.012), shell);
        leg.position.set(side * 0.11, -0.01, -0.02 - i * 0.03);
        crab.add(leg);
      }
    }
    return crab;
  }

  public getPosition(): THREE.Vector3 {
    return this.group.position.clone();
  }

  /** Bucket's full enough and they've wandered off. */
  public isDone(): boolean {
    return this.gone;
  }

  public update(delta: number): void {
    this.grumble =
      this.grumble?.update(delta, this.group.position) === false
        ? null
        : this.grumble;

    if (this.phase === "arriving") {
      if (this.amble(this.stand, delta, 1.6) < 0.35) {
        this.phase = "waiting";
        this.group.position.copy(this.stand);
        this.group.position.y = 0;
        this.group.rotation.y = this.faceWater;
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

    const points = this.line.geometry.attributes.position as THREE.BufferAttribute;
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

  /** Walk toward a spot with a bit of a shuffle. Returns the gap left. */
  private amble(to: THREE.Vector3, delta: number, speed: number): number {
    const here = this.group.position;
    const gap = Math.hypot(to.x - here.x, to.z - here.z);
    if (gap < 0.05) return 0;
    const step = Math.min(gap, speed * delta);
    here.x += ((to.x - here.x) / gap) * step;
    here.z += ((to.z - here.z) / gap) * step;
    this.group.rotation.y = Math.atan2(to.x - here.x, to.z - here.z);
    this.step += delta * 10;
    this.group.position.y = Math.abs(Math.sin(this.step)) * 0.04;
    return gap - step;
  }

  private startHaul(): void {
    this.phase = 'hauling';
    this.timer = HAUL_TIME;
    this.hooked = Math.random() < CATCH_ODDS;
  }

  private reveal(): void {
    this.phase = 'showing';
    this.timer = SHOW_TIME;
    this.crab.visible = this.hooked;
    this.shout(this.hooked ? HITS : MISSES);
  }

  /** Catch goes in the bucket, and the line goes back in the water. */
  private stow(): void {
    if (this.hooked) {
      this.caught += 1;
      const inBucket = this.bucketCrabs[Math.min(this.caught, this.bucketCrabs.length) - 1];
      if (inBucket) inBucket.visible = true;
    }
    this.crab.visible = false;
    this.phase = 'casting';
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
    this.scene.remove(this.group);
    this.scene.remove(this.line);
    this.scene.remove(this.crab);
    this.line.geometry.dispose();
    (this.line.material as THREE.Material).dispose();
  }
}
