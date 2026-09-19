import * as THREE from "three";
import { Grumble } from "../effects/Grumble";
import { isInLake, WATER_Y, nearestShore, outwardAt } from "../world/lake";

const BODY = 0x4a4a44;
const NECK = 0x2a2a28;
const BILL = 0xe8a030;
const WHITE = 0xf0ece4;

const FLOCK_SIZE = 12;
/** Cruise height on the inbound approach. */
const CRUISE_H = 28;
const CRUISE = 14;
/** Hits from the heavy hose before one bird clears off. */
const HITS_TO_SCARE = 6;
/** Once this many of the flock are gone, the rest pack it in. */
const ROUT_FRAC = 0.8;
const SIZE = 1.55;

const HONK = ["HONK!", "HONK-HONK!", "RA-RA-RA!", "COMING IN!", "OUT THE WAY!"];
const SCARE = ["HONK!", "I'M OFF!", "RAAA!", "THAT'S ENOUGH!"];

type Mode = "fly" | "land" | "swim" | "flee" | "gone";

/**
 * One Canada goose — big bird, inbound from the north, lands on the lake and
 * fouls it until the heavy hose sees them off.
 */
class Goose {
  private scene: THREE.Scene;
  private group = new THREE.Group();
  private wings: THREE.Group[] = [];
  private mode: Mode = "fly";
  private slot: number;
  private flap = Math.random() * Math.PI * 2;
  private grumble: Grumble | null = null;
  private formation = new THREE.Vector3();
  private hits = 0;
  private hitCool = 0;
  private pooIn = 2 + Math.random() * 4;
  private pendingDrop: THREE.Vector3 | null = null;
  private swimTarget = new THREE.Vector3();
  private fleeAim = new THREE.Vector3();
  private landSpot = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    slot: number,
    at: THREE.Vector3,
    formation: THREE.Vector3,
    land: THREE.Vector3,
  ) {
    this.scene = scene;
    this.slot = slot;
    this.formation.copy(formation);
    this.landSpot.copy(land);
    this.group.position.copy(at);
    this.build();
    scene.add(this.group);
  }

  public getPosition(): THREE.Vector3 {
    return this.group.position.clone();
  }

  public isActive(): boolean {
    return this.mode !== "gone" && this.mode !== "flee";
  }

  public isGone(): boolean {
    return this.mode === "gone";
  }

  public isAirborne(): boolean {
    return this.mode === "fly" || this.mode === "land" || this.mode === "flee";
  }

  /** Heavy jet — a few solid hits and they climb away. */
  public blast(from: THREE.Vector3): boolean {
    if (this.mode === "gone" || this.mode === "flee") return false;
    if (this.hitCool > 0) return false;
    this.hitCool = 0.35;
    this.hits += 1;

    const away = new THREE.Vector3()
      .subVectors(this.group.position, from)
      .setY(0);
    if (away.lengthSq() < 0.01) {
      away.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    }
    away.normalize();
    this.group.position.addScaledVector(away, 1.2 + Math.random());
    if (this.mode === "swim") {
      this.group.position.y = WATER_Y + 0.2;
    }

    this.say(HONK[Math.floor(Math.random() * HONK.length)]!);

    if (this.hits >= HITS_TO_SCARE) {
      this.beginFlee();
      return true;
    }
    return false;
  }

  /** Force the whole remnant flock off once most are gone. */
  public rout(): void {
    if (this.mode === "gone" || this.mode === "flee") return;
    this.beginFlee();
  }

  public claimDrop(): THREE.Vector3 | null {
    const spot = this.pendingDrop;
    this.pendingDrop = null;
    return spot;
  }

  public follow(centre: THREE.Vector3, heading: number, delta: number): void {
    this.grumble =
      this.grumble?.update(delta, this.group.position) === false
        ? null
        : this.grumble;
    if (this.hitCool > 0) this.hitCool -= delta;
    if (this.mode === "gone") return;

    if (this.mode === "flee") {
      this.flyAway(delta);
      return;
    }

    if (this.mode === "swim") {
      this.paddle(delta);
      return;
    }

    if (this.mode === "land") {
      this.settle(delta);
      return;
    }

    // Formation cruise toward the lake.
    const aim = centre.clone().add(this.formation);
    const here = this.group.position;
    const to = new THREE.Vector3().subVectors(aim, here);
    const gap = to.length();
    if (gap > 0.05) {
      to.normalize().multiplyScalar(CRUISE * delta);
      here.add(to);
    }
    here.y = CRUISE_H + Math.sin(this.flap * 0.4 + this.slot) * 0.9;
    this.group.rotation.set(0.08, heading, Math.sin(this.flap * 0.25) * 0.12);
    this.beat(delta, 9, 0.55);

    // Peel off to land once the lead is over the water.
    if (isInLake(centre.x, centre.z) || centre.distanceTo(this.landSpot) < 22) {
      this.mode = "land";
    }
  }

  private settle(delta: number): void {
    const here = this.group.position;
    const to = new THREE.Vector3().subVectors(this.landSpot, here);
    const gap = to.length();
    const speed = 11;
    if (gap > 0.4) {
      to.normalize().multiplyScalar(Math.min(gap, speed * delta));
      here.add(to);
    }
    here.y = Math.max(WATER_Y + 0.18, here.y - delta * 9);
    this.group.rotation.set(
      0.35,
      Math.atan2(this.landSpot.x - here.x, this.landSpot.z - here.z),
      0,
    );
    this.beat(delta, 14, 0.7);
    if (gap < 1.2 && here.y <= WATER_Y + 0.25) {
      here.y = WATER_Y + 0.18;
      this.mode = "swim";
      this.pickSwim();
      this.say(HONK[Math.floor(Math.random() * HONK.length)]!);
    }
  }

  private paddle(delta: number): void {
    const here = this.group.position;
    here.y = WATER_Y + 0.16 + Math.sin(this.flap * 0.5) * 0.03;
    const to = new THREE.Vector3().subVectors(this.swimTarget, here).setY(0);
    const gap = to.length();
    if (gap < 1.5) this.pickSwim();
    else {
      to.normalize().multiplyScalar(2.2 * delta);
      here.add(to);
      this.group.rotation.set(0.05, Math.atan2(to.x, to.z), 0);
    }
    this.fold();
    this.flap += delta * 3;

    this.pooIn -= delta;
    if (this.pooIn <= 0 && !this.pendingDrop) {
      this.pooIn = 1.6 + Math.random() * 2.8;
      // Fat Canada goose mess — often on the bank lip, sometimes in the drink.
      const shore = nearestShore(here.x, here.z);
      const out = outwardAt(shore);
      const onBank = Math.random() < 0.7;
      this.pendingDrop = onBank
        ? new THREE.Vector3(
            shore.x + out.x * (0.6 + Math.random() * 2.2),
            0,
            shore.y + out.y * (0.6 + Math.random() * 2.2),
          )
        : new THREE.Vector3(here.x, WATER_Y, here.z);
    }
  }

  private pickSwim(): void {
    const ang = Math.random() * Math.PI * 2;
    const r = 4 + Math.random() * 14;
    this.swimTarget.set(
      this.landSpot.x + Math.cos(ang) * r,
      WATER_Y,
      this.landSpot.z + Math.sin(ang) * r,
    );
    if (!isInLake(this.swimTarget.x, this.swimTarget.z)) {
      const shore = nearestShore(this.swimTarget.x, this.swimTarget.z);
      this.swimTarget.set(shore.x, WATER_Y, shore.y);
    }
  }

  private beginFlee(): void {
    this.mode = "flee";
    this.say(SCARE[Math.floor(Math.random() * SCARE.length)]!);
    // Climb north / out to sea.
    const here = this.group.position;
    this.fleeAim.set(
      here.x + (Math.random() - 0.5) * 40,
      CRUISE_H + 18,
      here.z + 120 + Math.random() * 80,
    );
  }

  private flyAway(delta: number): void {
    const here = this.group.position;
    const to = new THREE.Vector3().subVectors(this.fleeAim, here);
    const gap = to.length();
    if (gap < 2 || here.z > this.fleeAim.z - 5) {
      this.mode = "gone";
      this.group.visible = false;
      return;
    }
    to.normalize().multiplyScalar(18 * delta);
    here.add(to);
    this.group.rotation.set(
      -0.2,
      Math.atan2(to.x, to.z),
      Math.sin(this.flap) * 0.15,
    );
    this.beat(delta, 16, 0.75);
  }

  private beat(delta: number, rate: number, amp: number): void {
    this.flap += delta * rate;
    const beat = Math.sin(this.flap) * amp;
    // Wings stick out sideways; flap is a bank about the body axis.
    this.wings[0]!.rotation.z = 0.35 + beat;
    this.wings[1]!.rotation.z = -0.35 - beat;
    this.wings[0]!.rotation.y = 0;
    this.wings[1]!.rotation.y = 0;
    this.wings[0]!.scale.set(1, 1, 1);
    this.wings[1]!.scale.set(1, 1, 1);
  }

  private fold(): void {
    for (let i = 0; i < this.wings.length; i++) {
      const wing = this.wings[i]!;
      wing.scale.set(0.35, 1, 1);
      wing.rotation.z = i === 0 ? 0.12 : -0.12;
      wing.rotation.y = i === 0 ? -1.05 : 1.05;
    }
  }

  private say(text: string): void {
    this.grumble?.dispose();
    this.grumble = new Grumble(this.scene, text, this.group.position);
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
    });

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 7), bodyMat);
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

    const bill = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.05, 0.22),
      billMat,
    );
    bill.position.set(0, 0.32, 1.22);
    this.group.add(bill);

    for (const side of [-1, 1] as const) {
      const wing = new THREE.Group();
      wing.position.set(side * 0.38, 0.1, 0.05);

      const inner = new THREE.Mesh(
        new THREE.BoxGeometry(0.95, 0.06, 0.55),
        whiteMat,
      );
      inner.position.set(side * 0.48, 0, 0);
      inner.castShadow = true;
      wing.add(inner);

      const outer = new THREE.Mesh(
        new THREE.BoxGeometry(0.85, 0.05, 0.42),
        bodyMat,
      );
      outer.position.set(side * 1.35, 0, -0.04);
      wing.add(outer);

      const tip = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.05, 0.32),
        neckMat,
      );
      tip.position.set(side * 1.9, 0, -0.08);
      wing.add(tip);

      this.group.add(wing);
      this.wings.push(wing);
    }

    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.35, 0.22),
      whiteMat,
    );
    tail.position.set(0, 0.05, -0.72);
    tail.rotation.x = 0.25;
    this.group.add(tail);

    this.group.scale.setScalar(SIZE);
  }
}

/**
 * Canada geese inbound from the north. Land on the lake, foul the banks, and
 * clear off once the heavy hose has had enough of them — or when most of the
 * flock has already gone.
 */
export class GooseFlock {
  private geese: Goose[] = [];
  private centre = new THREE.Vector3(0, CRUISE_H, 0);
  private aim = new THREE.Vector3(0, 0, 0);
  private cleared = false;
  private routed = false;

  constructor(scene: THREE.Scene, aim?: { x: number; z: number }) {
    const landX = aim?.x ?? 0;
    const landZ = aim?.z ?? -8;
    this.aim.set(landX, 0, landZ);

    // Come in from the north (+Z), high, in a V pointed at the lake.
    this.centre.set(landX + (Math.random() - 0.5) * 18, CRUISE_H, landZ + 175);
    const approach = Math.atan2(
      this.aim.x - this.centre.x,
      this.aim.z - this.centre.z,
    );

    for (let i = 0; i < FLOCK_SIZE; i++) {
      const rank = Math.ceil(i / 2);
      const side = i === 0 ? 0 : i % 2 === 1 ? -1 : 1;
      const spread = rank * 4.2;
      const back = rank * 5.0;
      const form = new THREE.Vector3(
        Math.sin(approach) * back + Math.cos(approach) * side * spread,
        0,
        Math.cos(approach) * back - Math.sin(approach) * side * spread,
      );
      const spawn = this.centre.clone().add(form);
      spawn.y = CRUISE_H + rank * 0.45;
      const land = new THREE.Vector3(
        landX + (Math.random() - 0.5) * 16,
        WATER_Y,
        landZ + (Math.random() - 0.5) * 16,
      );
      this.geese.push(new Goose(scene, i, spawn, form, land));
    }
  }

  public getCentre(): THREE.Vector3 {
    return this.centre.clone();
  }

  public radarBlips(): THREE.Vector3[] {
    return this.geese.filter((g) => !g.isGone()).map((g) => g.getPosition());
  }

  public activeCount(): number {
    return this.geese.filter((g) => g.isActive()).length;
  }

  public isCleared(): boolean {
    return this.cleared;
  }

  /** @deprecated Landing is no longer a fail — kept so callers compile. */
  public isOverrun(): boolean {
    return false;
  }

  public update(delta: number): void {
    const here = this.centre;
    const to = new THREE.Vector3().subVectors(this.aim, here).setY(0);
    const gap = to.length();
    const heading = Math.atan2(to.x, to.z);
    if (gap > 4) {
      to.normalize().multiplyScalar(CRUISE * delta);
      here.add(to);
    }
    here.y = CRUISE_H;

    for (const goose of this.geese) {
      goose.follow(here, heading, delta);
    }

    const gone = this.geese.filter((g) => g.isGone() || !g.isActive()).length;
    if (!this.routed && gone / FLOCK_SIZE >= ROUT_FRAC) {
      this.routed = true;
      for (const goose of this.geese) goose.rout();
    }

    if (!this.cleared && this.geese.every((g) => g.isGone())) {
      this.cleared = true;
    }
  }

  /** Pending goose mess this frame. */
  public claimDrops(): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    for (const goose of this.geese) {
      const drop = goose.claimDrop();
      if (drop) out.push(drop);
    }
    return out;
  }

  /** Heavy jet — air or water. Wide catch; a few hits per bird. */
  public heavyHit(point: THREE.Vector3, from: THREE.Vector3): boolean {
    let hit = false;
    for (const goose of this.geese) {
      if (!goose.isActive()) continue;
      const at = goose.getPosition();
      const r = goose.isAirborne() ? 7.5 : 5.5;
      const dx = at.x - point.x;
      const dy = at.y - point.y;
      const dz = at.z - point.z;
      if (dx * dx + dy * dy * 0.45 + dz * dz > r * r) continue;
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
