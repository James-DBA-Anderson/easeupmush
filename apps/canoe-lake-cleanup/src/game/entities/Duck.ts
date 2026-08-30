import * as THREE from "three";
import { WATER_Y, distanceToShore, isInLake, waterSpot } from "../world/lake";

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

/** Paddling about, tail up in the shallows, or asleep with the bill tucked. */
type Mode = "in" | "swim" | "dabble" | "doze" | "out";

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
  private height = 0;
  private done = false;

  constructor(scene: THREE.Scene, arriving: boolean) {
    this.scene = scene;
    const plumage: Plumage = Math.random() < 0.55 ? "drake" : "hen";

    this.group = new THREE.Group();
    const built = this.build(plumage);
    this.body = built.body;
    this.head = built.head;

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
    return this.mode === "swim" || this.mode === "dabble" || this.mode === "doze";
  }

  /** Something's put them up: off the water and away. */
  public flush(): void {
    if (this.mode === "in" || this.mode === "out") return;
    this.mode = "out";
    this.hold = 0;
  }

  public update(delta: number, player: THREE.Vector3): void {
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
      default:
        this.potter(delta);
    }

    // Ducks are nervy: get close and they paddle off rather than square up.
    if (this.isOnWater() && this.group.position.distanceTo(player) < 6) {
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
      if (roll < 0.4) {
        this.mode = "dabble";
        this.hold = 2.5 + Math.random() * 3;
      } else if (roll < 0.55) {
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

  /** Tail up, head under, arse in the air, which is most of what they do. */
  private upend(delta: number): void {
    this.hold -= delta;
    const swing = Math.sin(this.hold * 3);
    this.group.rotation.x = 0.9 + swing * 0.25;
    this.group.position.y = SWIM_Y - 0.03;
    this.settleWings();
    if (this.hold <= 0) {
      this.group.rotation.x = 0;
      this.mode = "swim";
      this.target = waterSpot();
    }
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
    this.scene.remove(this.group);
  }
}
