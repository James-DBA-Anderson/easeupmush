import * as THREE from "three";
import { Grumble } from "../effects/Grumble";
import { isInLake } from "../world/lake";

const BODY = 0x4a4a44;
const NECK = 0x2a2a28;
const BILL = 0xe8a030;
const WHITE = 0xf0ece4;

const FLOCK_SIZE = 13;
const CRUISE = 16;
const CRUISE_H = 32;
const FALL_GRAV = 22;

const HONK = ["HONK!", "HONK-HONK!", "RA-RA-RA!", "COMING IN!", "OUT THE WAY!"];

type Mode = "fly" | "fall" | "gone";

/**
 * One Canada goose in a radar-tracked V — heavy hose knocks them out of the sky.
 */
class Goose {
  private scene: THREE.Scene;
  private group = new THREE.Group();
  private wings: THREE.Mesh[] = [];
  private mode: Mode = "fly";
  private slot: number;
  private flap = Math.random() * Math.PI * 2;
  private fallVy = 0;
  private grumble: Grumble | null = null;

  /** Offset from formation centre while flying. */
  private formation = new THREE.Vector3();

  constructor(scene: THREE.Scene, slot: number, at: THREE.Vector3, formation: THREE.Vector3) {
    this.scene = scene;
    this.slot = slot;
    this.formation.copy(formation);
    this.group.position.copy(at);
    this.build();
    scene.add(this.group);
  }

  public getPosition(): THREE.Vector3 {
    return this.group.position.clone();
  }

  public isFlying(): boolean {
    return this.mode === "fly";
  }

  public isGone(): boolean {
    return this.mode === "gone";
  }

  /** Heavy jet caught this bird — drop out of formation. */
  public blast(from: THREE.Vector3): void {
    if (this.mode !== "fly") return;
    this.mode = "fall";
    this.fallVy = -2 - Math.random() * 2;
    const away = new THREE.Vector3()
      .subVectors(this.group.position, from)
      .setY(0);
    if (away.lengthSq() < 0.01) away.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    away.normalize().multiplyScalar(6 + Math.random() * 4);
    this.group.position.add(away);
    this.grumble?.dispose();
    this.grumble = new Grumble(
      this.scene,
      HONK[Math.floor(Math.random() * HONK.length)]!,
      this.group.position,
    );
  }

  public follow(centre: THREE.Vector3, heading: number, delta: number): void {
    this.grumble =
      this.grumble?.update(delta, this.group.position) === false
        ? null
        : this.grumble;

    if (this.mode === "gone") return;

    if (this.mode === "fall") {
      this.fallVy -= FALL_GRAV * delta;
      this.group.position.y += this.fallVy * delta;
      this.group.rotation.x += delta * 8;
      this.group.rotation.z += delta * 5;
      this.flap += delta * 18;
      const beat = Math.sin(this.flap) * 0.8;
      this.wings[0]!.rotation.z = beat;
      this.wings[1]!.rotation.z = -beat;
      if (this.group.position.y < (isInLake(this.group.position.x, this.group.position.z) ? -0.15 : 0.35)) {
        this.mode = "gone";
        this.group.visible = false;
      }
      return;
    }

    const aim = centre.clone().add(this.formation);
    const here = this.group.position;
    const to = new THREE.Vector3().subVectors(aim, here);
    const gap = to.length();
    if (gap > 0.05) {
      to.normalize().multiplyScalar(CRUISE * delta);
      here.add(to);
    }
    here.y = CRUISE_H + Math.sin(this.flap * 0.4 + this.slot) * 0.8;
    this.group.rotation.set(0.08, heading, Math.sin(this.flap * 0.25) * 0.12);

    this.flap += delta * 9;
    const beat = Math.sin(this.flap) * 0.55;
    this.wings[0]!.rotation.z = beat;
    this.wings[1]!.rotation.z = -beat;
  }

  public dispose(): void {
    this.grumble?.dispose();
    this.scene.remove(this.group);
  }

  private build(): void {
    const bodyMat = new THREE.MeshStandardMaterial({
      color: BODY,
      roughness: 0.95,
      flatShading: true,
    });
    const whiteMat = new THREE.MeshStandardMaterial({
      color: WHITE,
      roughness: 0.9,
      flatShading: true,
    });
    const neckMat = new THREE.MeshStandardMaterial({
      color: NECK,
      roughness: 0.9,
      flatShading: true,
    });
    const billMat = new THREE.MeshStandardMaterial({
      color: BILL,
      roughness: 0.7,
      flatShading: true,
    });

    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 8, 7),
      bodyMat,
    );
    body.scale.set(0.85, 0.7, 1.35);
    body.castShadow = true;
    this.group.add(body);

    const breast = new THREE.Mesh(
      new THREE.SphereGeometry(0.38, 7, 6),
      whiteMat,
    );
    breast.position.set(0, -0.05, 0.35);
    this.group.add(breast);

    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.2, 0.55, 6),
      neckMat,
    );
    neck.rotation.x = 0.35;
    neck.position.set(0, 0.15, 0.72);
    this.group.add(neck);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 7, 6), neckMat);
    head.position.set(0, 0.35, 1.05);
    this.group.add(head);

    const bill = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.22), billMat);
    bill.position.set(0, 0.32, 1.22);
    this.group.add(bill);

    for (const side of [-1, 1] as const) {
      const wing = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.04, 0.95),
        whiteMat,
      );
      wing.position.set(side * 0.42, 0.08, 0.05);
      wing.castShadow = true;
      this.group.add(wing);
      this.wings.push(wing);
    }

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.22), whiteMat);
    tail.position.set(0, 0.05, -0.72);
    tail.rotation.x = 0.25;
    this.group.add(tail);
  }
}

/**
 * Incoming V of Canada geese — picked up on radar, aimed at the lake.
 * The heavy hose from the van is meant to break them up before they land.
 */
export class GooseFlock {
  private geese: Goose[] = [];
  private centre = new THREE.Vector3(-95, CRUISE_H, 88);
  private aim = new THREE.Vector3(0, 0, -8);
  private cleared = false;
  private overrun = false;

  constructor(scene: THREE.Scene, aim?: { x: number; z: number }) {
    if (aim) this.aim.set(aim.x, 0, aim.z);
    const approach = Math.atan2(
      this.aim.x - this.centre.x,
      this.aim.z - this.centre.z,
    );

    for (let i = 0; i < FLOCK_SIZE; i++) {
      const rank = Math.ceil(i / 2);
      const side = i === 0 ? 0 : i % 2 === 1 ? -1 : 1;
      const spread = rank * 3.8;
      const back = rank * 4.5;
      const form = new THREE.Vector3(
        Math.sin(approach) * back + Math.cos(approach) * side * spread,
        0,
        Math.cos(approach) * back - Math.sin(approach) * side * spread,
      );
      const spawn = this.centre.clone().add(form);
      spawn.y = CRUISE_H + rank * 0.4;
      this.geese.push(new Goose(scene, i, spawn, form));
    }
  }

  public getCentre(): THREE.Vector3 {
    return this.centre.clone();
  }

  /** Blips for the mini-map radar sweep. */
  public radarBlips(): THREE.Vector3[] {
    return this.geese
      .filter((g) => g.isFlying())
      .map((g) => g.getPosition());
  }

  public flyingCount(): number {
    return this.geese.filter((g) => g.isFlying()).length;
  }

  public isBeaten(): boolean {
    return this.flyingCount() === 0;
  }

  public isOverrun(): boolean {
    return this.overrun;
  }

  public isCleared(): boolean {
    return this.cleared;
  }

  public update(delta: number): void {
    const here = this.centre;
    const to = new THREE.Vector3().subVectors(this.aim, here).setY(0);
    const gap = to.length();
    const heading = Math.atan2(to.x, to.z);
    if (gap > 2) {
      to.normalize().multiplyScalar(CRUISE * delta);
      here.add(to);
    }
    here.y = CRUISE_H;

    for (const goose of this.geese) {
      goose.follow(here, heading, delta);
    }

    if (!this.overrun && gap < 18 && this.flyingCount() >= 4) {
      this.overrun = true;
    }

    if (!this.cleared && this.isBeaten()) {
      this.cleared = true;
    }
  }

  /** Heavy jet in flight — wide catch radius. */
  public heavyHit(point: THREE.Vector3, from: THREE.Vector3): boolean {
    let hit = false;
    for (const goose of this.geese) {
      if (!goose.isFlying()) continue;
      if (goose.getPosition().distanceTo(point) > 4.2) continue;
      goose.blast(from);
      hit = true;
    }
    return hit;
  }

  public dispose(): void {
    for (const goose of this.geese) goose.dispose();
    this.geese = [];
  }
}
