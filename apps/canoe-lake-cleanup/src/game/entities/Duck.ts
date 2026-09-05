import * as THREE from "three";
import { WATER_Y, distanceToShore, isInLake, waterSpot } from "../world/lake";
import { addEyes } from "./eyes";
import { MuckFlecks } from "../effects/MuckFlecks";

/** Mallards: a drake in his colours, or a hen in her browns. */
type Plumage = "drake" | "hen";

const BODY_BROWN = 0x8a7150;
const BODY_GREY = 0x9a9a94;
const HEAD_GREEN = 0x1f5c3a;
const BILL_YELLOW = 0xd9b23c;
const BILL_DARK = 0x5a4a2c;

/** Nothing like a swan for size: a duck is about half a metre nose to tail. */
const SIZE = 0.3;
const SWIM_Y = WATER_Y + 0.06;

/** How high they come in and go out, and how fast. */
const FLY_HEIGHT = 22;
const FLY_SPEED = 13;
const LAND_RUN = 9;

/** Paddling about, tail up in the shallows, asleep, or in on the crumbs. */
type Mode = "in" | "swim" | "dabble" | "doze" | "feast" | "out";

/** How far off a mallard will paddle for floating bread. */
const BREAD_RANGE = 55;
const PECK_RANGE = 1.4;
const PECK_GAP = 0.45;

/**
 * A mallard on the lake. They come in off the sea in twos and threes, put
 * down on the water, potter about upending for weed, and clear off again.
 */
export class Duck {
  private scene: THREE.Scene;
  private group: THREE.Group;
  private body: THREE.Mesh;
  private head: THREE.Group;
  private wings: THREE.Mesh[] = [];

  private mode: Mode;
  private heading = Math.random() * Math.PI * 2;
  private target: THREE.Vector2;
  private speed = 0.5 + Math.random() * 0.4;
  private paddle = Math.random() * Math.PI * 2;
  private flap = Math.random() * Math.PI * 2;
  private hold = 0;
  /** How long this dabble lasts, so the tip-in and tip-out can ease. */
  private dabbleFor = 1;
  private height = 0;
  private done = false;
  private peckTimer = 0;
  private peckReady = false;
  /** About one in four will barge other ducks at a bread pile. */
  private pushy = Math.random() < 0.28;
  private flecks: MuckFlecks;

  constructor(scene: THREE.Scene, arriving: boolean) {
    this.scene = scene;
    const plumage: Plumage = Math.random() < 0.55 ? "drake" : "hen";

    this.group = new THREE.Group();
    const built = this.build(plumage);
    this.body = built.body;
    this.head = built.head;
    this.flecks = new MuckFlecks(this.group, 18);

    const spot = waterSpot();
    this.target = spot.clone();

    if (arriving) {
      // Comes in off the Solent, losing height on the way across the park.
      this.mode = "in";
      this.height = FLY_HEIGHT;
      // Start 170m out on the bearing they'll come in along, so they're
      // pointed at the water from the moment they appear.
      this.group.position.set(
        spot.x - Math.sin(this.heading) * 170,
        FLY_HEIGHT,
        spot.y - Math.cos(this.heading) * 170,
      );
      this.group.rotation.y = this.heading;
    } else {
      this.mode = "swim";
      this.group.position.set(spot.x, SWIM_Y, spot.y);
    }

    scene.add(this.group);
  }

  private build(plumage: Plumage): { body: THREE.Mesh; head: THREE.Group } {
    const drake = plumage === "drake";
    const bodyMat = new THREE.MeshStandardMaterial({
      color: drake ? BODY_GREY : BODY_BROWN,
      roughness: 1,
      flatShading: true,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: drake ? 0x4a3a28 : 0x6f5a3e,
      roughness: 1,
      flatShading: true,
    });

    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 9, 7), bodyMat);
    body.scale.set(0.72, 0.62, 1.15);
    body.castShadow = true;
    this.group.add(body);

    // Built nose-first along +Z, the way the swans are, so a heading can go
    // straight onto the group's yaw.
    // Tail, cocked up at the back, with the drake's little curl on it.
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 6), darkMat);
    tail.rotation.x = 1.9;
    tail.position.set(0, 0.2, -1.15);
    this.group.add(tail);

    const head = new THREE.Group();
    head.position.set(0, 0.5, 0.75);
    this.group.add(head);

    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.24, 0.42, 7),
      drake
        ? new THREE.MeshStandardMaterial({ color: HEAD_GREEN, roughness: 0.8 })
        : bodyMat,
    );
    neck.position.y = -0.16;
    head.add(neck);

    const skull = new THREE.Mesh(
      new THREE.SphereGeometry(0.29, 9, 7),
      drake
        ? new THREE.MeshStandardMaterial({ color: HEAD_GREEN, roughness: 0.6 })
        : bodyMat,
    );
    skull.position.y = 0.12;
    skull.castShadow = true;
    head.add(skull);

    if (drake) {
      // The white ring round the neck, which is the giveaway at a distance.
      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.25, 0.07, 8),
        new THREE.MeshStandardMaterial({ color: 0xf0efe6, roughness: 0.9 }),
      );
      collar.position.y = -0.3;
      head.add(collar);
    }

    const bill = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.09, 0.34),
      new THREE.MeshStandardMaterial({
        color: drake ? BILL_YELLOW : BILL_DARK,
        roughness: 0.7,
      }),
    );
    bill.position.set(0, 0.06, 0.28);
    head.add(bill);

    addEyes(head, {
      spread: 0.2,
      y: 0.18,
      z: 0.2,
      size: 0.055,
      iris: 0x1a1814,
    });

    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.SphereGeometry(1, 7, 5), darkMat);
      wing.scale.set(0.16, 0.34, 0.85);
      wing.position.set(side * 0.62, 0.18, -0.05);
      wing.castShadow = true;
      this.group.add(wing);
      this.wings.push(wing);

      // The blue speculum patch on the trailing edge.
      const patch = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.16, 0.4),
        new THREE.MeshStandardMaterial({ color: 0x2f4f9c, roughness: 0.6 }),
      );
      patch.position.set(side * 0.66, 0.12, -0.45);
      this.group.add(patch);
    }

    this.group.scale.setScalar(SIZE);
    return { body, head };
  }

  public getPosition(): THREE.Vector3 {
    return this.group.position.clone();
  }

  public isGone(): boolean {
    return this.done;
  }

  public isOnWater(): boolean {
    return (
      this.mode === "swim" ||
      this.mode === "dabble" ||
      this.mode === "doze" ||
      this.mode === "feast"
    );
  }

  public isFeasting(): boolean {
    return this.mode === "feast";
  }

  /** True once per peck at floating crumbs. */
  public wantsPeck(): boolean {
    if (!this.peckReady) return false;
    this.peckReady = false;
    return true;
  }

  /** Bread on the water — drop whatever and paddle straight for it. */
  public goForBread(at: THREE.Vector3): void {
    if (this.mode === "in" || this.mode === "out") return;
    const gap = Math.hypot(
      at.x - this.group.position.x,
      at.z - this.group.position.z,
    );
    if (gap > BREAD_RANGE) return;
    // Already locked onto this pile — don't keep re-rolling the aim.
    if (
      this.mode === "feast" &&
      Math.hypot(this.target.x - at.x, this.target.y - at.z) < 3.5
    ) {
      return;
    }
    this.rightItself();
    this.mode = "feast";
    this.target.set(
      at.x + (Math.random() - 0.5) * 1.8,
      at.z + (Math.random() - 0.5) * 1.8,
    );
    this.speed = 1.4 + Math.random() * 0.6;
  }

  /** Leave the pile alone — bread's gone or a scrap put them off. */
  public loseBread(): void {
    if (this.mode !== "feast") return;
    this.rightItself();
    this.mode = "swim";
    this.speed = 0.5 + Math.random() * 0.4;
    this.target = waterSpot();
    this.peckReady = false;
  }

  /** Spooked by a swan scrap nearby — paddle off a few metres. */
  public shyFrom(at: THREE.Vector3): void {
    if (!this.isOnWater()) return;
    this.rightItself();
    this.mode = "swim";
    this.speed = 1.8;
    const away = new THREE.Vector2(
      this.group.position.x - at.x,
      this.group.position.z - at.z,
    );
    if (away.lengthSq() < 0.01) away.set(1, 0);
    away.normalize();
    this.target.set(
      this.group.position.x + away.x * 10,
      this.group.position.z + away.y * 10,
    );
    if (!isInLake(this.target.x, this.target.y)) this.target = waterSpot();
  }

  /** Something's put them up: off the water and away. */
  public flush(): void {
    if (this.mode === "in" || this.mode === "out") return;
    this.mode = "out";
    this.hold = 0;
  }

  public splatter(point: THREE.Vector3): void {
    this.flecks.splat(point);
  }

  public update(delta: number, player: THREE.Vector3): void {
    this.flecks.update(delta);
    switch (this.mode) {
      case "in":
        this.comeIn(delta);
        break;
      case "out":
        this.clearOff(delta);
        break;
      case "dabble":
        this.upend(delta);
        break;
      case "doze":
        this.rest(delta);
        break;
      case "feast":
        this.tuckIn(delta);
        break;
      default:
        this.potter(delta);
    }

    // Ducks are nervy: get close and they paddle off rather than square up.
    if (this.isOnWater() && this.group.position.distanceTo(player) < 6) {
      this.rightItself();
      this.mode = "swim";
      const away = new THREE.Vector2(
        this.group.position.x - player.x,
        this.group.position.z - player.z,
      ).normalize();
      this.target.set(
        this.group.position.x + away.x * 14,
        this.group.position.z + away.y * 14,
      );
      if (!isInLake(this.target.x, this.target.y)) this.target = waterSpot();
    }
  }

  /** Wings going, dropping down the sky, then a long skid onto the water. */
  private comeIn(delta: number): void {
    const here = this.group.position;
    const to = new THREE.Vector2(this.target.x - here.x, this.target.y - here.z);
    const gap = to.length();
    to.normalize();

    // Lose height in proportion to how much of the run-in is left.
    this.height = Math.max(0, (gap / LAND_RUN) * 1.4);
    const drop = gap < LAND_RUN ? FLY_SPEED * 0.45 : FLY_SPEED;
    here.x += to.x * drop * delta;
    here.z += to.y * drop * delta;
    here.y = SWIM_Y + this.height;
    this.heading = Math.atan2(to.x, to.y);

    this.beat(delta, gap < LAND_RUN ? 26 : 17, 1.1);
    // Feet out and body tipped back for the landing.
    this.group.rotation.set(gap < LAND_RUN ? -0.3 : -0.05, this.heading, 0);

    if (gap < 0.8) {
      this.mode = "swim";
      here.y = SWIM_Y;
      this.group.rotation.x = 0;
      this.target = waterSpot();
    }
  }

  /** Pattering across the surface to get up, then away over the trees. */
  private clearOff(delta: number): void {
    const here = this.group.position;
    this.height += delta * 4.5;
    here.y = SWIM_Y + this.height;
    here.x += Math.sin(this.heading) * FLY_SPEED * delta;
    here.z += Math.cos(this.heading) * FLY_SPEED * delta;
    // Nose up while they're climbing away.
    this.group.rotation.set(-0.12, this.heading, 0);
    this.beat(delta, 24, 1.2);

    if (this.height > FLY_HEIGHT) this.done = true;
  }

  /** Paddling to wherever they fancy, bobbing as they go. */
  private potter(delta: number): void {
    const here = this.group.position;
    const to = new THREE.Vector2(this.target.x - here.x, this.target.y - here.z);
    const gap = to.length();

    if (gap < 1) {
      // Somewhere new, or a bit of dabbling, or a doze in the sun.
      const roll = Math.random();
      if (roll < 0.48) {
        this.mode = "dabble";
        this.dabbleFor = 2.8 + Math.random() * 3.5;
        this.hold = this.dabbleFor;
      } else if (roll < 0.6) {
        this.mode = "doze";
        this.hold = 6 + Math.random() * 10;
      } else {
        this.target = waterSpot();
      }
      return;
    }

    to.normalize();
    // Keep off the wall; a duck steers round rather than bumping into it.
    if (distanceToShore(here.x, here.z) < 1.5) this.target = waterSpot();

    const turn = Math.atan2(to.x, to.y);
    this.heading += this.shortestTurn(turn) * Math.min(1, 3 * delta);
    here.x += Math.sin(this.heading) * this.speed * delta;
    here.z += Math.cos(this.heading) * this.speed * delta;

    this.paddle += delta * 7;
    here.y = SWIM_Y + Math.sin(this.paddle) * 0.012;
    this.group.rotation.set(0, this.heading, Math.sin(this.paddle * 0.5) * 0.05);
    this.settleWings();
  }

  /** Head down in the crumbs, paddling round the pile with the others. */
  private tuckIn(delta: number): void {
    const here = this.group.position;
    const to = new THREE.Vector2(this.target.x - here.x, this.target.y - here.z);
    const gap = to.length();

    if (gap > PECK_RANGE) {
      to.normalize();
      const turn = Math.atan2(to.x, to.y);
      this.heading += this.shortestTurn(turn) * Math.min(1, 4 * delta);
      // Pushy ones paddle a bit faster and cut across the others.
      const pace = this.pushy ? this.speed * 1.25 : this.speed;
      here.x += Math.sin(this.heading) * pace * delta;
      here.z += Math.cos(this.heading) * pace * delta;
      this.paddle += delta * 10;
      here.y = SWIM_Y + Math.sin(this.paddle) * 0.015;
      this.group.rotation.set(0.12, this.heading, Math.sin(this.paddle) * 0.06);
      this.head.rotation.set(0.2, 0, 0);
    } else {
      this.paddle += delta * 8;
      here.y = SWIM_Y + Math.sin(this.paddle) * 0.01;
      // Dabble-peck at the surface rather than tipping right under.
      const peck = (Math.sin(this.paddle * 1.4) + 1) / 2;
      this.group.rotation.set(0.35 + peck * 0.35, this.heading, 0);
      this.head.rotation.set(0.4 + peck * 0.5, 0, 0);
      this.peckTimer -= delta;
      if (this.peckTimer <= 0) {
        this.peckTimer = PECK_GAP;
        this.peckReady = true;
        // Shuffle the aim so they work round the pile.
        if (Math.random() < 0.35) {
          this.target.x += (Math.random() - 0.5) * 0.8;
          this.target.y += (Math.random() - 0.5) * 0.8;
        }
      }
    }
    this.settleWings();
  }

  /**
   * The classic mallard feed: tip forward until the head and half the body
   * are under, tail in the air, then bob about in the weed before righting.
   */
  private upend(delta: number): void {
    this.hold -= delta;
    const span = Math.max(0.01, this.dabbleFor);
    const age = 1 - this.hold / span;

    // Ease in, hold underwater, ease out.
    let tip = 1;
    if (age < 0.2) tip = age / 0.2;
    else if (age > 0.78) tip = Math.max(0, (1 - age) / 0.22);
    tip = tip * tip * (3 - 2 * tip);

    // Nearly vertical — front half gone, rear sticking up.
    const peck = Math.sin(this.hold * 5.5) * 0.1;
    const pitch = tip * (1.25 + peck);
    this.group.rotation.set(pitch, this.heading, tip * Math.sin(this.hold * 2) * 0.06);
    // Sink with the tip so the waterline cuts across the middle of the body.
    this.group.position.y = SWIM_Y - tip * 0.12;
    // Neck reaches further into the weed than the body alone would.
    this.head.rotation.set(tip * 0.55, 0, 0);
    this.settleWings();

    if (this.hold <= 0) {
      this.rightItself();
      this.mode = "swim";
      this.target = waterSpot();
    }
  }

  /** Back upright after a dabble or a fright. */
  private rightItself(): void {
    this.group.rotation.x = 0;
    this.group.rotation.z = 0;
    this.group.position.y = SWIM_Y;
    this.head.rotation.set(0, 0, 0);
  }

  /** Sat still with the bill tucked back over the shoulder. */
  private rest(delta: number): void {
    this.hold -= delta;
    this.paddle += delta * 1.2;
    this.group.position.y = SWIM_Y + Math.sin(this.paddle) * 0.01;
    this.head.rotation.set(0.5, 2.4, 0);
    this.settleWings();
    if (this.hold <= 0) {
      this.head.rotation.set(0, 0, 0);
      this.mode = "swim";
      this.target = waterSpot();
    }
  }

  private settleWings(): void {
    for (let i = 0; i < this.wings.length; i++) {
      this.wings[i]!.rotation.z = 0;
      this.wings[i]!.rotation.x = 0;
    }
    this.body.rotation.z = 0;
  }

  private beat(delta: number, rate: number, depth: number): void {
    this.flap += delta * rate;
    const stroke = Math.sin(this.flap) * depth;
    this.wings[0]!.rotation.z = stroke;
    this.wings[1]!.rotation.z = -stroke;
  }

  private shortestTurn(to: number): number {
    let turn = to - this.heading;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    return turn;
  }

  public dispose(): void {
    this.flecks.dispose();
    this.scene.remove(this.group);
  }
}
