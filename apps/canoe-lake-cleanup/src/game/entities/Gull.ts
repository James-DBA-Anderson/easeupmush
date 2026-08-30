import * as THREE from "three";
import { Grumble } from "../effects/Grumble";
import { isInLake, WATER_Y } from "../world/lake";

const WHITE = 0xf4f2ea;
const GREY = 0xa8b0b8;
const DARK = 0x2f3338;
const BILL = 0xe0a832;

/** A herring gull is a big bird: near enough two feet of it. */
const SIZE = 0.55;

const CRUISE_HEIGHT = 26;
const CRUISE_SPEED = 11;
const STOOP_SPEED = 17;
/** How long they'll stand on the deck working at something. */
const FEED_TIME = 9;
/** How close you can get before they're up and away. */
const SPOOKED = 5;

const SHRIEKS = ["EEEE-AH!", "AH-AH-AH!", "KYOW!", "EEEE-AH-AH!"];

type Mode = "cruise" | "stoop" | "feed" | "up" | "gone";

/** Something on the ground worth a look. */
export interface Scrap {
  at: THREE.Vector3;
  /** Called when the gull actually gets a beakful. */
  take: () => void;
  /** Whether it's still there and still unattended. */
  going: () => boolean;
}

/**
 * A herring gull working the park: circling over the lake, watching for food
 * nobody's stood over, and dropping on it the moment it's left. Get near and
 * it's up and off, shrieking about it.
 */
export class Gull {
  private scene: THREE.Scene;
  private group: THREE.Group;
  private wings: THREE.Group[] = [];
  private legs: THREE.Mesh[] = [];

  private mode: Mode = "cruise";
  private heading = Math.random() * Math.PI * 2;
  private circleAt: THREE.Vector2;
  private circleAngle = Math.random() * Math.PI * 2;
  private circleRadius = 25 + Math.random() * 40;
  private height = CRUISE_HEIGHT;
  private flap = Math.random() * Math.PI * 2;
  private step = 0;
  private hold = 0;
  private patience = 4 + Math.random() * 6;
  private grumble: Grumble | null = null;
  private scrap: Scrap | null = null;
  /** Set when it's had a beakful, which is what makes the mess later. */
  private fed = 0;

  constructor(scene: THREE.Scene, over: THREE.Vector2) {
    this.scene = scene;
    this.circleAt = over.clone();

    this.group = new THREE.Group();
    this.build();
    this.group.position.set(over.x, CRUISE_HEIGHT, over.y);
    scene.add(this.group);
  }

  private build(): void {
    const white = new THREE.MeshStandardMaterial({
      color: WHITE,
      roughness: 0.85,
      flatShading: true,
    });
    const grey = new THREE.MeshStandardMaterial({
      color: GREY,
      roughness: 0.9,
      flatShading: true,
    });
    const dark = new THREE.MeshStandardMaterial({ color: DARK, roughness: 1 });

    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 9, 7), white);
    body.scale.set(0.5, 0.5, 1);
    body.castShadow = true;
    this.group.add(body);

    // Built nose-first along +Z, the way everything else that flies or swims
    // is, so a heading can go straight onto the group's yaw.
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.5), white);
    tail.position.set(0, 0.05, -1.1);
    this.group.add(tail);

    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.28, 0.4, 7),
      white,
    );
    neck.position.set(0, 0.42, 0.6);
    this.group.add(neck);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 9, 7), white);
    head.position.set(0, 0.66, 0.72);
    this.group.add(head);

    // That heavy hooked bill with the red spot on it.
    const bill = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.12, 0.4),
      new THREE.MeshStandardMaterial({ color: BILL, roughness: 0.6 }),
    );
    bill.position.set(0, 0.62, 1);
    this.group.add(bill);

    const spot = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.06, 0.06),
      new THREE.MeshStandardMaterial({ color: 0xd8352a, roughness: 0.7 }),
    );
    spot.position.set(0, 0.57, 1.15);
    this.group.add(spot);

    // Long wings, hinged at the shoulder, grey on top with black tips.
    for (const side of [-1, 1]) {
      const wing = new THREE.Group();
      wing.position.set(side * 0.35, 0.28, 0.1);

      const inner = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.07, 0.62), grey);
      inner.position.set(side * 0.55, 0, 0);
      inner.castShadow = true;
      wing.add(inner);

      const outer = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.44), grey);
      outer.position.set(side * 1.6, 0, -0.1);
      wing.add(outer);

      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 0.4), dark);
      tip.position.set(side * 2.3, 0, -0.14);
      wing.add(tip);

      this.group.add(wing);
      this.wings.push(wing);
    }

    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.5, 0.09),
        new THREE.MeshStandardMaterial({ color: 0xe8b0a0, roughness: 0.9 }),
      );
      leg.geometry.translate(0, -0.25, 0);
      leg.position.set(side * 0.2, -0.35, -0.1);
      leg.visible = false;
      this.group.add(leg);
      this.legs.push(leg);
    }

    this.group.scale.setScalar(SIZE);
  }

  public getPosition(): THREE.Vector3 {
    return this.group.position.clone();
  }

  public isGone(): boolean {
    return this.mode === "gone";
  }

  public isAground(): boolean {
    return this.mode === "feed";
  }

  /** True once per beakful, so the game knows what's coming later. */
  public claimFeed(): boolean {
    if (this.fed <= 0) return false;
    this.fed -= 1;
    return true;
  }

  /** Up and off, with the usual racket. */
  public flush(): void {
    if (this.mode !== "feed" && this.mode !== "stoop") return;
    this.mode = "up";
    this.shriek();
  }

  private shriek(): void {
    this.grumble?.dispose();
    this.grumble = new Grumble(
      this.scene,
      SHRIEKS[Math.floor(Math.random() * SHRIEKS.length)]!,
      this.group.position,
    );
  }

  /**
   * Runs the bird. `scraps` is everything going on the ground; the gull
   * picks the nearest one nobody is stood over.
   */
  public update(
    delta: number,
    player: THREE.Vector3,
    scraps: readonly Scrap[],
  ): void {
    this.grumble =
      this.grumble?.update(delta, this.group.position) === false
        ? null
        : this.grumble;

    if (this.mode !== "gone" && this.group.position.distanceTo(player) < SPOOKED) {
      this.flush();
    }

    switch (this.mode) {
      case "cruise":
        this.circle(delta, scraps);
        break;
      case "stoop":
        this.dropIn(delta);
        break;
      case "feed":
        this.workAtIt(delta);
        break;
      case "up":
        this.climbAway(delta);
        break;
    }
  }

  /** Wheeling over the lake on stiff wings, keeping an eye on the paving. */
  private circle(delta: number, scraps: readonly Scrap[]): void {
    this.circleAngle += (delta * CRUISE_SPEED) / this.circleRadius;
    const here = this.group.position;
    here.set(
      this.circleAt.x + Math.cos(this.circleAngle) * this.circleRadius,
      this.height,
      this.circleAt.y + Math.sin(this.circleAngle) * this.circleRadius * 0.7,
    );
    // Point along the tangent of the squashed circle rather than at some fixed
    // offset, or it wheels round the lake flying sideways.
    const was = this.heading;
    this.heading = Math.atan2(
      -Math.sin(this.circleAngle),
      Math.cos(this.circleAngle) * 0.7,
    );
    // Banked into the turn, whichever way that happens to be.
    const turn = Math.atan2(
      Math.sin(this.heading - was),
      Math.cos(this.heading - was),
    );
    this.group.rotation.set(0, this.heading, turn >= 0 ? -0.35 : 0.35);

    // Mostly gliding, with the odd lazy beat to hold height.
    this.flap += delta * 3;
    const glide = Math.max(0, Math.sin(this.flap)) * 0.35;
    this.wings[0]!.rotation.z = glide;
    this.wings[1]!.rotation.z = -glide;
    this.spreadWings(1);

    this.patience -= delta;
    if (this.patience > 0) return;
    this.patience = 2 + Math.random() * 3;

    const seen = this.pickScrap(scraps);
    if (!seen) return;
    this.scrap = seen;
    this.mode = "stoop";
    this.shriek();
  }

  /** The nearest bit of food that nobody's guarding. */
  private pickScrap(scraps: readonly Scrap[]): Scrap | null {
    const here = this.group.position;
    let best: Scrap | null = null;
    let closest = 90;
    for (const scrap of scraps) {
      if (!scrap.going()) continue;
      // Never off the water: they want it on the paving or the grass.
      if (isInLake(scrap.at.x, scrap.at.z)) continue;
      const gap = Math.hypot(scrap.at.x - here.x, scrap.at.z - here.z);
      if (gap > closest) continue;
      closest = gap;
      best = scrap;
    }
    return best;
  }

  /** Down in one long slant, wings half closed, feet coming forward. */
  private dropIn(delta: number): void {
    const scrap = this.scrap;
    if (!scrap || !scrap.going()) {
      this.mode = "up";
      return;
    }

    const here = this.group.position;
    const to = new THREE.Vector3(scrap.at.x - here.x, 0, scrap.at.z - here.z);
    const gap = to.length();
    to.normalize();

    here.addScaledVector(to, STOOP_SPEED * delta);
    this.height = Math.max(0.42, this.height - delta * 14);
    here.y = this.height;
    this.heading = Math.atan2(to.x, to.z);
    this.group.rotation.set(0.25, this.heading, 0);

    this.flap += delta * 12;
    const beat = Math.sin(this.flap) * 0.55;
    this.wings[0]!.rotation.z = beat;
    this.wings[1]!.rotation.z = -beat;
    this.spreadWings(0.6);

    if (gap < 0.6 && this.height <= 0.45) {
      here.set(scrap.at.x, 0.42, scrap.at.z);
      this.mode = "feed";
      this.hold = FEED_TIME;
      for (const leg of this.legs) leg.visible = true;
    }
  }

  /** Stood on the path getting through it, head down, hopping about. */
  private workAtIt(delta: number): void {
    this.hold -= delta;
    this.step += delta * 6;

    this.group.rotation.set(Math.abs(Math.sin(this.step)) * 0.5, this.heading, 0);
    this.group.position.y = 0.42 + Math.abs(Math.sin(this.step * 0.5)) * 0.04;
    this.fold();

    // A beakful every second or so until it's gone or they're disturbed.
    if (Math.floor(this.hold * 2) !== Math.floor((this.hold + delta) * 2)) {
      this.scrap?.take();
      this.fed += 1;
    }

    if (this.hold <= 0 || !this.scrap?.going()) this.mode = "up";
  }

  /** Straight up off the deck and back round to circling height. */
  private climbAway(delta: number): void {
    for (const leg of this.legs) leg.visible = false;
    this.height += delta * 9;
    const here = this.group.position;
    here.y = this.height;
    here.x += Math.sin(this.heading) * 7 * delta;
    here.z += Math.cos(this.heading) * 7 * delta;
    this.group.rotation.set(-0.2, this.heading, 0);

    this.flap += delta * 16;
    const beat = Math.sin(this.flap) * 1;
    this.wings[0]!.rotation.z = beat;
    this.wings[1]!.rotation.z = -beat;
    this.spreadWings(1);

    if (this.height < CRUISE_HEIGHT) return;
    // Back on the circuit, over wherever it's ended up.
    this.height = CRUISE_HEIGHT;
    this.circleAt.set(here.x, here.z);
    this.circleRadius = 25 + Math.random() * 40;
    this.scrap = null;
    this.mode = "cruise";
  }

  /** Wings out for gliding, or drawn in for a dive. */
  private spreadWings(out: number): void {
    for (const wing of this.wings) {
      wing.scale.x = 0.35 + out * 0.65;
      wing.rotation.y = 0;
    }
  }

  /** Wings closed and swept back along the body, the way they stand. */
  private fold(): void {
    for (let i = 0; i < this.wings.length; i++) {
      const wing = this.wings[i]!;
      wing.scale.x = 0.3;
      wing.rotation.z = i === 0 ? 0.1 : -0.1;
      wing.rotation.y = i === 0 ? -1.2 : 1.2;
    }
  }

  /** Where a mess would land if this bird let one go. */
  public dropSpot(): THREE.Vector3 {
    const here = this.group.position;
    const y = isInLake(here.x, here.z) ? WATER_Y : 0;
    return new THREE.Vector3(here.x, y, here.z);
  }

  public dispose(): void {
    this.grumble?.dispose();
    this.scene.remove(this.group);
  }
}
