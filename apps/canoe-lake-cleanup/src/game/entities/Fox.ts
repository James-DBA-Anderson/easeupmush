import * as THREE from 'three';
import { PATH_OUTER, distanceToShore, isInLake } from '../world/lake';
import { addEyes } from './eyes';

const TROT = 3.2;
const BOLT = 8;
/** Distance at which it notices you, and at which it gives up on the park. */
const WARY = 16;
const SPOOKED = 7;

type Mood = 'trot' | 'sniff' | 'squat' | 'bolt';

/** A fox working its way round the park at night. */
export class Fox {
  private scene: THREE.Scene;
  private group = new THREE.Group();
  private body!: THREE.Mesh;
  private head!: THREE.Group;
  private tail!: THREE.Mesh;
  private legs: THREE.Mesh[] = [];

  private position: THREE.Vector3;
  private target = new THREE.Vector3();
  private heading = 0;
  private speed = 0;
  private gait = 0;

  private mood: Mood = 'trot';
  private moodTimer = 0;
  private stops = 2 + Math.floor(Math.random() * 3);
  private dropReady = false;
  private leaving = false;

  constructor(scene: THREE.Scene, from?: THREE.Vector2) {
    this.scene = scene;

    // Slips in from the dark at the edge of the park.
    if (from) {
      this.position = new THREE.Vector3(from.x, 0, from.y);
    } else {
      const angle = Math.random() * Math.PI * 2;
      this.position = new THREE.Vector3(
        Math.cos(angle) * 190,
        0,
        Math.sin(angle) * 120,
      );
    }
    this.build();
    this.group.position.copy(this.position);
    scene.add(this.group);
    this.pickTarget();
  }

  private build(): void {
    const fur = new THREE.MeshStandardMaterial({ color: 0xa8552a, roughness: 1 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2e2622, roughness: 1 });
    const pale = new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 1 });

    const body = new THREE.SphereGeometry(0.2, 8, 6);
    body.scale(1, 0.95, 2.3);
    this.body = new THREE.Mesh(body, fur);
    this.body.position.y = 0.36;
    this.body.castShadow = true;
    this.group.add(this.body);

    this.head = new THREE.Group();
    this.head.position.set(0, 0.42, 0.42);
    this.group.add(this.head);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), fur);
    skull.castShadow = true;
    this.head.add(skull);

    const muzzle = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 6), fur);
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(0, -0.02, 0.16);
    this.head.add(muzzle);

    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 4), dark);
    snout.position.set(0, -0.02, 0.27);
    this.head.add(snout);

    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.14, 4), fur);
      ear.position.set(side * 0.07, 0.13, -0.01);
      this.head.add(ear);
    }

    addEyes(this.head, {
      spread: 0.075,
      y: 0.03,
      z: 0.08,
      size: 0.028,
      iris: 0xc47a1a,
      pupil: 0.5,
    });

    // Brush, carried low and level behind it.
    const tail = new THREE.CylinderGeometry(0.04, 0.11, 0.5, 6);
    tail.translate(0, -0.25, 0);
    this.tail = new THREE.Mesh(tail, fur);
    this.tail.position.set(0, 0.38, -0.42);
    this.tail.rotation.x = -1.9;
    this.tail.castShadow = true;
    this.group.add(this.tail);

    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), pale);
    tip.position.set(0, -0.48, 0);
    this.tail.add(tip);

    for (const side of [-1, 1]) {
      for (const z of [0.28, -0.26]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.32, 0.08), dark);
        leg.geometry.translate(0, -0.16, 0);
        leg.position.set(side * 0.12, 0.34, z);
        leg.castShadow = true;
        this.group.add(leg);
        this.legs.push(leg);
      }
    }
  }

  private pickTarget(): void {
    // Works the grass outside the path, never the water.
    for (let tries = 0; tries < 30; tries++) {
      const angle = Math.random() * Math.PI * 2;
      const reach = 90 + Math.random() * 90;
      const x = Math.cos(angle) * reach;
      const z = Math.sin(angle) * reach * 0.7;
      if (isInLake(x, z)) continue;
      if (distanceToShore(x, z) < PATH_OUTER + 3) continue;
      this.target.set(x, 0, z);
      return;
    }
    this.target.set(190, 0, 120);
  }

  /** Heads for the dark and doesn't come back. */
  private leave(): void {
    this.leaving = true;
    const away = new THREE.Vector3(this.position.x, 0, this.position.z).normalize();
    this.target.copy(away.multiplyScalar(300));
  }

  public getPosition(): THREE.Vector3 {
    return this.position.clone();
  }

  public isGone(): boolean {
    return this.leaving && this.position.length() > 215;
  }

  /** True once per deposit, for the game to turn into something to clean up. */
  public wantsToGo(): boolean {
    if (!this.dropReady) return false;
    this.dropReady = false;
    return true;
  }

  public update(delta: number, player: THREE.Vector3): void {
    const watched = this.position.distanceTo(player);

    // Foxes don't hang about once they've been spotted.
    if (watched < SPOOKED && !this.leaving) {
      this.leave();
      this.mood = 'bolt';
      this.moodTimer = 4;
    } else if (watched < WARY && this.mood !== 'bolt' && !this.leaving) {
      this.mood = 'bolt';
      this.moodTimer = 2.5;
      this.pickTarget();
    }

    this.moodTimer -= delta;

    if (this.mood === 'sniff' || this.mood === 'squat') {
      this.speed *= Math.max(0, 1 - 6 * delta);
      if (this.mood === 'squat' && this.moodTimer <= 0.9 && !this.dropReady && this.stops >= 0) {
        this.dropReady = true;
        this.stops -= 1;
      }
      if (this.moodTimer <= 0) this.moveOn();
      this.pose(delta);
      return;
    }

    const flat = new THREE.Vector3(
      this.target.x - this.position.x,
      0,
      this.target.z - this.position.z,
    );
    const gap = flat.length();

    if (gap < 2) {
      if (this.leaving) {
        // Keep going out into the dark until it's off the map.
        this.target.multiplyScalar(1.4);
      } else if (this.stops > 0) {
        this.mood = Math.random() < 0.55 ? 'squat' : 'sniff';
        this.moodTimer = this.mood === 'squat' ? 3.4 : 2.2;
      } else {
        this.leave();
      }
    }

    const pace = this.mood === 'bolt' ? BOLT : TROT;
    this.speed += (pace - this.speed) * Math.min(1, 3 * delta);
    if (this.mood === 'bolt' && this.moodTimer <= 0 && !this.leaving) this.mood = 'trot';

    if (gap > 0.1) {
      const wanted = Math.atan2(flat.x, flat.z);
      let turn = wanted - this.heading;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      this.heading += THREE.MathUtils.clamp(turn, -3.5 * delta, 3.5 * delta);
    }

    const step = new THREE.Vector3(
      Math.sin(this.heading) * this.speed * delta,
      0,
      Math.cos(this.heading) * this.speed * delta,
    );
    const next = this.position.clone().add(step);
    if (isInLake(next.x, next.z)) {
      // Won't swim, so it turns away from the water.
      this.heading += Math.PI * 0.7;
      this.pickTarget();
    } else {
      this.position.copy(next);
    }

    this.group.position.copy(this.position);
    this.group.rotation.y = this.heading;
    this.pose(delta);
  }

  private moveOn(): void {
    this.mood = 'trot';
    if (this.stops > 0) this.pickTarget();
    else this.leave();
  }

  private pose(delta: number): void {
    const still = this.mood === 'sniff' || this.mood === 'squat';
    this.gait += delta * (still ? 2 : this.speed * 4);
    const swing = Math.sin(this.gait);

    const reach = still ? 0.05 : 0.7;
    this.legs[0]!.rotation.x = swing * reach;
    this.legs[1]!.rotation.x = -swing * reach;
    this.legs[2]!.rotation.x = -swing * reach;
    this.legs[3]!.rotation.x = swing * reach;

    if (this.mood === 'squat') {
      // Hunched down, back arched, getting on with it.
      this.body.position.y = 0.26;
      this.head.position.y = 0.34;
      this.head.rotation.x = 0.2;
      this.tail.rotation.x = -2.6;
      return;
    }

    this.body.position.y = 0.36 + Math.abs(swing) * (still ? 0 : 0.015);
    this.head.position.y = still ? 0.3 : 0.42;
    // Nose to the ground when sniffing, head up and level when trotting.
    this.head.rotation.x = still ? 0.9 : Math.sin(this.gait * 0.5) * 0.06;
    this.tail.rotation.x = -1.9 + Math.sin(this.gait * 0.5) * 0.12;
    this.tail.rotation.z = Math.sin(this.gait * 0.7) * 0.18;
  }

  public dispose(): void {
    this.scene.remove(this.group);
  }
}
