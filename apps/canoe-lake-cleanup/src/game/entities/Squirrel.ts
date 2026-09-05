import * as THREE from "three";
import { isInLake } from "../world/lake";
import { treeSpots } from "../world/trees";
import type { Scrap } from "./Gull";
import { addEyes } from "./eyes";
import { MuckFlecks } from "../effects/MuckFlecks";

const FUR = 0x8b8d86;
const BELLY = 0xd8d5cc;
const EAR = 0x6f6f68;

/** Head to rump, without the tail: a grey squirrel is about a foot of animal. */
const SIZE = 0.4;

/** Flat out, and the pottering-about speed. */
const BOLT_SPEED = 7;
const FORAGE_SPEED = 1.6;
/** How near anybody can get before it's off up the nearest trunk. */
const SPOOKED = 4.5;
/** A bold one will let you get this close before it gives up its dinner. */
const BOLD_SPOOKED = 2.4;
/** How far from its tree it'll wander for something ordinary. */
const HOME_RANGE = 9;
/** How far it'll break cover for food worth having. */
const RAID_RANGE = 26;

type Mode = "forage" | "sit" | "bolt" | "up" | "raid" | "carry";

/**
 * A grey squirrel working the trees round the lake. Most of them are all
 * nerves — a bit of foraging on the grass, sat up on the haunches to eat,
 * then straight up a trunk the moment anyone comes near. The bold ones have
 * worked out that a chip paper left on a bench is nobody's in particular.
 */
export class Squirrel {
  private scene: THREE.Scene;
  private group: THREE.Group;
  private body: THREE.Group;
  private tail: THREE.Group;
  private head: THREE.Group;
  private paws: THREE.Mesh[] = [];

  /** The trunk it lives up, which is where it runs when startled. */
  private tree: THREE.Vector2;
  private mode: Mode = "forage";
  private heading = Math.random() * Math.PI * 2;
  private target = new THREE.Vector2();
  private hop = Math.random() * Math.PI * 2;
  private twitch = Math.random() * Math.PI * 2;
  private hold = 0;
  private climbed = 0;
  /** The bold ones raid; the rest never come near a person's lunch. */
  private readonly bold = Math.random() < 0.35;
  private scrap: Scrap | null = null;
  private carrying: THREE.Mesh | null = null;
  private hidden = false;
  private flecks!: MuckFlecks;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    const trees = treeSpots();
    this.tree =
      trees[Math.floor(Math.random() * trees.length)]?.clone() ??
      new THREE.Vector2();

    this.group = new THREE.Group();
    const built = this.build();
    this.body = built.body;
    this.tail = built.tail;
    this.head = built.head;
    this.flecks = new MuckFlecks(this.group, 14);

    this.group.position.set(this.tree.x, 4.5, this.tree.y);
    // Live in the crown and come down — never just standing under a tree.
    this.mode = "up";
    this.climbed = 4.5 + Math.random() * 4;
    this.hidden = true;
    this.group.visible = false;
    this.pickSpot();
    scene.add(this.group);
  }

  private build(): {
    body: THREE.Group;
    tail: THREE.Group;
    head: THREE.Group;
  } {
    const fur = new THREE.MeshStandardMaterial({
      color: FUR,
      roughness: 1,
      flatShading: true,
    });
    const belly = new THREE.MeshStandardMaterial({ color: BELLY, roughness: 1 });

    // Everything but the feet sits in `body`, so it can rear up in one piece.
    const body = new THREE.Group();
    this.group.add(body);

    const back = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), fur);
    back.scale.set(0.28, 0.3, 0.6);
    back.position.y = 0.36;
    back.castShadow = true;
    body.add(back);

    const front = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), belly);
    front.scale.set(1, 0.9, 0.8);
    front.position.set(0, 0.32, -0.3);
    body.add(front);

    const head = new THREE.Group();
    head.position.set(0, 0.44, -0.52);
    body.add(head);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), fur);
    skull.scale.set(0.9, 0.9, 1.05);
    skull.castShadow = true;
    head.add(skull);

    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.14), fur);
    snout.position.set(0, -0.04, -0.2);
    head.add(snout);

    for (const side of [-1, 1]) {
      // Ears: little tufted tabs stood straight up, always listening.
      const ear = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.14, 0.04),
        new THREE.MeshStandardMaterial({ color: EAR, roughness: 1 }),
      );
      ear.position.set(side * 0.12, 0.2, 0.02);
      head.add(ear);

      // Front paws, held up under the chin when it's eating.
      const paw = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.07), fur);
      paw.geometry.translate(0, -0.08, 0);
      paw.position.set(side * 0.13, 0.32, -0.36);
      body.add(paw);
      this.paws.push(paw);

      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.2), fur);
      foot.geometry.translate(0, -0.07, 0);
      foot.position.set(side * 0.16, 0.22, 0.18);
      this.group.add(foot);
    }

    addEyes(head, {
      spread: 0.14,
      y: 0.03,
      z: -0.12,
      size: 0.04,
      face: -1,
      iris: 0x1a1812,
    });

    // The tail: three segments curving up and over the back, and twice the
    // width of the animal, because that's the half of it you actually see.
    const tail = new THREE.Group();
    tail.position.set(0, 0.3, 0.5);
    // Straight up out of the rump first, then curving forward over the back.
    tail.rotation.x = -0.35;
    body.add(tail);

    let parent: THREE.Object3D = tail;
    for (let i = 0; i < 4; i++) {
      const joint = new THREE.Group();
      joint.position.y = i === 0 ? 0.12 : 0.34;
      joint.rotation.x = i === 0 ? -0.25 : -0.42;

      const plume = new THREE.Mesh(
        new THREE.SphereGeometry(0.26 - i * 0.025, 7, 5),
        fur,
      );
      plume.scale.set(0.55, 1.25, 0.95);
      plume.position.y = 0.18;
      plume.castShadow = true;
      joint.add(plume);

      parent.add(joint);
      parent = joint;
    }

    this.group.scale.setScalar(SIZE);
    return { body, tail, head };
  }

  public getPosition(): THREE.Vector3 {
    return this.group.position.clone();
  }

  /** Up a trunk and out of sight, so nothing else needs to bother with it. */
  public isHidden(): boolean {
    return this.hidden;
  }

  /** Startled: straight up the nearest tree, dinner or no dinner. */
  public flush(): void {
    if (this.mode === "bolt" || this.mode === "up") return;
    this.mode = "bolt";
    this.dropWhatItHas();
  }

  public splatter(point: THREE.Vector3): void {
    this.flecks.splat(point);
  }

  private dropWhatItHas(): void {
    if (!this.carrying) return;
    this.carrying.removeFromParent();
    this.carrying = null;
  }

  /** Somewhere on the grass near its own tree to sniff about. */
  private pickSpot(): void {
    for (let tries = 0; tries < 8; tries++) {
      const angle = Math.random() * Math.PI * 2;
      const out = 1.5 + Math.random() * HOME_RANGE;
      const x = this.tree.x + Math.cos(angle) * out;
      const z = this.tree.y + Math.sin(angle) * out;
      if (isInLake(x, z)) continue;
      this.target.set(x, z);
      return;
    }
    this.target.set(this.tree.x, this.tree.y);
  }

  public update(
    delta: number,
    player: THREE.Vector3,
    scraps: readonly Scrap[],
  ): void {
    this.flecks.update(delta);
    this.twitch += delta;

    const near = this.group.position.distanceTo(player);
    const nerve = this.mode === "raid" || this.mode === "carry" ? BOLD_SPOOKED : SPOOKED;
    if (near < nerve && this.mode !== "bolt" && this.mode !== "up") this.flush();

    switch (this.mode) {
      case "bolt":
        this.runForIt(delta);
        break;
      case "up":
        this.upTheTrunk(delta);
        break;
      case "sit":
        this.sitUp(delta);
        break;
      case "raid":
        this.goForIt(delta);
        break;
      case "carry":
        this.makeOff(delta);
        break;
      default:
        this.potter(delta, scraps);
    }

    this.flickTail();
  }

  /** Short bursts across the grass with a pause between each one. */
  private potter(delta: number, scraps: readonly Scrap[]): void {
    const gap = this.moveTowards(this.target, FORAGE_SPEED, delta);
    this.bound(delta, 9, 0.06);
    this.stand(0);

    if (gap < 0.3) {
      this.mode = "sit";
      this.hold = 1.5 + Math.random() * 3;
      return;
    }

    // A bold one keeps half an eye out for something left lying about.
    if (!this.bold || Math.random() > delta * 0.4) return;
    const seen = this.pickScrap(scraps);
    if (!seen) return;
    this.scrap = seen;
    this.mode = "raid";
  }

  /** Sat up on the haunches with the paws under the chin, having a look round. */
  private sitUp(delta: number): void {
    this.hold -= delta;
    this.stand(1);
    // Head jerking about between mouthfuls, which is most of what they do.
    this.head.rotation.y = Math.sin(this.twitch * 5) * 0.5;
    this.head.rotation.x = Math.sin(this.twitch * 9) * 0.12;
    for (const paw of this.paws) paw.rotation.x = -1.1 + Math.sin(this.twitch * 12) * 0.2;

    if (this.hold > 0) return;
    this.head.rotation.set(0, 0, 0);
    for (const paw of this.paws) paw.rotation.x = 0;
    this.mode = "forage";
    this.pickSpot();
  }

  /** The nearest thing worth stealing, if it's not too far from cover. */
  private pickScrap(scraps: readonly Scrap[]): Scrap | null {
    let best: Scrap | null = null;
    let closest = RAID_RANGE;
    for (const scrap of scraps) {
      if (!scrap.going() || isInLake(scrap.at.x, scrap.at.z)) continue;
      const gap = this.group.position.distanceTo(scrap.at);
      if (gap > closest) continue;
      closest = gap;
      best = scrap;
    }
    return best;
  }

  /** Straight over to it, low and quick, in a series of bounds. */
  private goForIt(delta: number): void {
    const scrap = this.scrap;
    if (!scrap || !scrap.going()) {
      this.scrap = null;
      this.mode = "forage";
      this.pickSpot();
      return;
    }

    const to = new THREE.Vector2(scrap.at.x, scrap.at.z);
    const gap = this.moveTowards(to, BOLT_SPEED * 0.6, delta);
    this.bound(delta, 14, 0.12);
    this.stand(0);

    if (gap > 0.35) return;
    scrap.take();
    this.takeAway();
    this.scrap = null;
    this.mode = "carry";
  }

  /** A crust in the mouth, held out in front where you can see it. */
  private takeAway(): void {
    if (this.carrying) return;
    const prize = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.14, 0.18),
      new THREE.MeshStandardMaterial({ color: 0xe8d7a8, roughness: 1 }),
    );
    prize.position.set(0, -0.06, -0.28);
    this.head.add(prize);
    this.carrying = prize;
  }

  /** Off home with it, and up the tree to eat it out of everyone's reach. */
  private makeOff(delta: number): void {
    const gap = this.moveTowards(this.tree, BOLT_SPEED * 0.8, delta);
    this.bound(delta, 16, 0.16);
    if (gap < 0.6) this.mode = "up";
  }

  /** Flat out for the trunk, tail streaming out behind. */
  private runForIt(delta: number): void {
    const gap = this.moveTowards(this.tree, BOLT_SPEED, delta);
    this.bound(delta, 20, 0.2);
    this.tail.rotation.x = 0.5;
    if (gap < 0.5) {
      this.mode = "up";
      this.climbed = 0;
    }
  }

  /** Up the bark in a spiral and out of sight in the crown for a bit. */
  private upTheTrunk(delta: number): void {
    this.climbed += delta * 4;
    this.group.position.set(
      this.tree.x + Math.cos(this.climbed * 1.6) * 0.35,
      Math.min(4.5, this.climbed),
      this.tree.y + Math.sin(this.climbed * 1.6) * 0.35,
    );
    this.group.rotation.set(-1.2, this.climbed * 1.6 + Math.PI / 2, 0);
    this.bound(delta, 22, 0.05);

    if (this.climbed < 4.5) return;
    // Sat up there long enough for whatever spooked it to move on.
    this.hidden = true;
    this.group.visible = false;
    if (this.climbed < 4.5 + 6 + Math.random()) return;
    this.hidden = false;
    this.group.visible = true;
    this.dropWhatItHas();
    this.climbed = 0;
    this.group.position.set(this.tree.x, 0, this.tree.y);
    this.group.rotation.set(0, this.heading + Math.PI, 0);
    this.mode = "forage";
    this.pickSpot();
  }

  /** Hops along the ground towards a spot, returning how far is left. */
  private moveTowards(to: THREE.Vector2, speed: number, delta: number): number {
    const here = this.group.position;
    const away = new THREE.Vector2(to.x - here.x, to.y - here.z);
    const gap = away.length();
    if (gap < 0.001) return gap;
    away.normalize();

    const want = Math.atan2(away.x, away.y);
    let turn = want - this.heading;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    this.heading += turn * Math.min(1, 12 * delta);

    const step = Math.min(gap, speed * delta);
    here.x += Math.sin(this.heading) * step;
    here.z += Math.cos(this.heading) * step;
    // Model faces −Z; movement is along the heading, so turn them round.
    this.group.rotation.set(0, this.heading + Math.PI, 0);
    return gap;
  }

  /** The bounding gait: arched back, all four feet off the deck at once. */
  private bound(delta: number, rate: number, height: number): void {
    this.hop += delta * rate;
    const spring = Math.abs(Math.sin(this.hop));
    this.group.position.y = this.mode === "up" ? this.group.position.y : spring * height;
    this.body.rotation.x = -spring * 0.35;
  }

  /** Reared up on the back legs, `up` being how far through it is. */
  private stand(up: number): void {
    this.body.rotation.x = up * 0.9;
    this.body.position.y = up * 0.1;
  }

  /** That constant nervous flick, faster the harder it's working. */
  private flickTail(): void {
    const busy = this.mode === "sit" ? 7 : 3;
    this.tail.rotation.z = Math.sin(this.twitch * busy) * 0.22;
    if (this.mode !== "bolt") {
      this.tail.rotation.x = Math.sin(this.twitch * busy * 0.6) * 0.12;
    }
  }

  public dispose(): void {
    this.flecks.dispose();
    this.scene.remove(this.group);
  }
}
