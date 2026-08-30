import * as THREE from 'three';
import { WATER_Y, isInLake, nearestShore, outwardAt } from '../world/lake';

const HULLS = [0xd8452f, 0x2f6fd8, 0xe8e4dc, 0xe0b83c];
const COATS = [0x2f4f7f, 0x8b3a3a, 0x3f6b4a, 0x5a4a7a, 0xb06a2c];
const SKIN = [0xf0c8a0, 0xd9a066, 0x8d5a3b, 0x5c3a26];

/** How far out the boat is allowed to roam before it's called back in. */
const LEASH = 26;
const CRUISE = 3.4;

/** A kid on the bank running a radio boat about on the water. */
export class RcBoat {
  private scene: THREE.Scene;
  private kid: THREE.Group;
  private boat: THREE.Group;

  private arms: THREE.Mesh[] = [];
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

  constructor(scene: THREE.Scene, at: THREE.Vector2) {
    this.scene = scene;
    this.packUp = 70 + Math.random() * 90;

    // Stand on the paving right at the water's edge, looking out.
    const shore = nearestShore(at.x, at.y);
    const out = outwardAt(shore);
    this.stand = new THREE.Vector3(shore.x + out.x * 1.6, 0, shore.y + out.y * 1.6);

    this.kid = this.buildKid();
    this.kid.position.copy(this.stand);
    scene.add(this.kid);

    // Launch it a little way off the bank in front of them.
    this.position = new THREE.Vector3(shore.x - out.x * 6, WATER_Y + 0.06, shore.y - out.y * 6);
    this.heading = Math.atan2(-out.x, -out.y);
    this.boat = this.buildBoat();
    scene.add(this.boat);
    this.pickTarget();
  }

  private buildKid(): THREE.Group {
    const group = new THREE.Group();
    const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;
    const coat = new THREE.MeshStandardMaterial({ color: pick(COATS), roughness: 0.9 });
    const legMat = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: pick(SKIN), roughness: 0.8 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 0.2), coat);
    torso.position.y = 0.74;
    torso.castShadow = true;
    group.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), skin);
    head.position.y = 1.05;
    head.castShadow = true;
    group.add(head);

    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.34, 0.1), coat);
      arm.geometry.translate(0, -0.17, 0);
      arm.position.set(side * 0.2, 0.92, 0);
      // Held out in front, elbows in, the way they all stand.
      arm.rotation.x = -1.1;
      group.add(arm);
      this.arms.push(arm);

      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.54, 0.13), legMat);
      leg.geometry.translate(0, -0.27, 0);
      leg.position.set(side * 0.09, 0.54, 0);
      leg.castShadow = true;
      group.add(leg);
    }

    // The transmitter, with its two stubby aerial-and-stick arrangement.
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.16, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.7 }),
    );
    box.position.set(0, 0.86, 0.28);
    group.add(box);

    const aerial = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.5, 4),
      new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.7, roughness: 0.3 }),
    );
    aerial.position.set(0.08, 1.14, 0.28);
    aerial.rotation.z = -0.25;
    group.add(aerial);

    return group;
  }

  private buildBoat(): THREE.Group {
    const group = new THREE.Group();
    const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;
    const paint = new THREE.MeshStandardMaterial({ color: pick(HULLS), roughness: 0.4 });
    const trim = new THREE.MeshStandardMaterial({ color: 0xf2f2f0, roughness: 0.5 });

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

    return group;
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
    return this.packUp <= 0;
  }

  public update(delta: number): void {
    this.packUp -= delta;

    this.donutWait -= delta;
    if (this.donutWait <= 0 && this.donut <= 0) {
      this.donut = 2 + Math.random() * 2.5;
      this.donutWait = 8 + Math.random() * 16;
    }

    const to = new THREE.Vector2(this.target.x - this.position.x, this.target.y - this.position.z);
    let wanted = Math.atan2(to.x, to.y);

    if (this.donut > 0) {
      // Hard over on the stick, so it just carves circles for a few seconds.
      this.donut -= delta;
      wanted = this.heading + 1.4;
    } else if (to.length() < 2.5) {
      this.pickTarget();
    }

    // Turn towards where it's pointed, at a rate a little boat could manage.
    let turn = wanted - this.heading;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    this.heading += THREE.MathUtils.clamp(turn, -2.6 * delta, 2.6 * delta);

    // Slows in the turns, and backs right off if it's nosing at the bank.
    const tight = Math.min(1, Math.abs(turn));
    this.speed += (CRUISE * (1 - tight * 0.45) - this.speed) * Math.min(1, 2 * delta);

    const step = new THREE.Vector3(
      Math.sin(this.heading) * this.speed * delta,
      0,
      Math.cos(this.heading) * this.speed * delta,
    );
    const next = this.position.clone().add(step);
    if (isInLake(next.x, next.z)) {
      this.position.copy(next);
    } else {
      // Bounced off the wall, so spin it round and pick somewhere else.
      this.heading += Math.PI * (0.6 + Math.random() * 0.8);
      this.speed *= 0.3;
      this.pickTarget();
    }

    this.bob += delta * 7;
    this.boat.position.set(
      this.position.x,
      WATER_Y + 0.05 + Math.sin(this.bob) * 0.015,
      this.position.z,
    );
    this.boat.rotation.set(Math.sin(this.bob * 0.7) * 0.05, this.heading, -turn * 0.55);

    this.wakeTimer -= delta;
    if (this.wakeTimer <= 0) {
      this.wakeTimer = 0.22;
      this.wake();
    }

    this.watch(delta);
  }

  /** The kid tracks the boat, twiddling the sticks and leaning after it. */
  private watch(delta: number): void {
    const to = new THREE.Vector3().subVectors(this.position, this.stand);
    const facing = Math.atan2(to.x, to.z);

    let turn = facing - this.kid.rotation.y;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    this.kid.rotation.y += turn * Math.min(1, 4 * delta);

    const fidget = Math.sin(this.bob * 0.5) * 0.12;
    this.arms[0]!.rotation.z = fidget;
    this.arms[1]!.rotation.z = -fidget;
    this.kid.rotation.z = Math.sin(this.bob * 0.3) * 0.03;
  }

  private wake(): void {
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

  public dispose(): void {
    this.scene.remove(this.kid);
    this.scene.remove(this.boat);
  }
}
