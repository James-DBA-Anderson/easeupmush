import * as THREE from "three";
import {
  BENCH_SEAT_H,
  type BenchSeat,
} from "../world/bench";
import {
  distanceToShore,
  isInLake,
  nearestShore,
  outwardAt,
} from "../world/lake";
import { stepWalk } from "../world/blocking";
import { Face } from "./Face";
import { Grumble } from "../effects/Grumble";

const COATS = [0x2f4f7f, 0x8b3a3a, 0x3f6b4a, 0x5a4a7a, 0x2b2b33, 0xb06a2c, 0xd8c8a0];
const ELDER_COATS = [0x6b5a4a, 0x3a4a5a, 0x5a4a58, 0x8a7a68, 0x2f3a48, 0x7a5a4a];
const TROUSERS = [0x2b3038, 0x4a4a52, 0x6b5a44, 0x3a5a6a];
const ELDER_TROUSERS = [0x3a3834, 0x4a4840, 0x5a5248];
const SKIN = [0xf0c8a0, 0xd9a066, 0x8d5a3b, 0x5c3a26];
const ELDER_SKIN = [0xe8c4a8, 0xd4b090, 0xc4a078];
const HAIR = [0xe8e4dc, 0xc8c4bc, 0xa8a49c, 0xd0c8b0];

/** Local hip height on the standing figure — sunk so the seat meets it. */
const HIP_Y = 0.92;
/** How far forward of the bench origin the sit point sits (on the slats). */
const SIT_FORWARD = 0.08;
/** Stand here to walk up, then hop onto the seat (clear of the back blocker). */
const APPROACH_FORWARD = 1.05;

const CHAT = [
  "NICE DAY FOR IT",
  "YOU SEEN THE SWANS?",
  "PASSING THROUGH?",
  "LOVELY SPOT THIS",
  "HEARD ABOUT THE FOX?",
  "KEEPS YOU YOUNG",
];

const ELDER_CHAT = [
  "LOVELY ROSES",
  "REMINDS ME OF MUM",
  "NICE TO SIT",
  "PROPER GARDEN THIS",
  "COME HERE EVERY WEEK",
  "SMELLS LOVELY",
  "QUIET OUT HERE",
];

const PHONE_CHAT = [
  "NO SIGNAL",
  "LOOK AT THIS",
  "JUST A SEC",
  "THEY'RE ONLINE",
];

const BOOK_CHAT = [
  "GOOD BIT THIS",
  "ONE MORE CHAPTER",
  "QUIET HERE",
];

const PHONE_WET = [
  "MY PHONE!",
  "YOU'VE SOAKED IT!",
  "IT'LL BE RUINED!",
  "GET OFF!",
  "THAT'S A NEW ONE!",
];

const BOOK_WET = [
  "MY BOOK!",
  "YOU'VE WRECKED IT!",
  "THE PAGES!",
  "OI! WATCH IT!",
  "THAT WAS LIBRARY!",
];

const CHAT_WET = [
  "OI!",
  "WATCH THE WASHER!",
  "WE'RE SITTING HERE!",
  "GET THAT AWAY!",
];

const FEED_CHAT = [
  "HERE YOU ARE LOVE",
  "COME ON THEN",
  "WHO'S A GREEDY ONE",
  "BIT OF BREAD",
  "THEY KNOW THE TIME",
  "DON'T FIGHT",
];

const FEED_WET = [
  "YOU'VE SOAKED THE BAG!",
  "THAT WAS FOR THE BIRDS!",
  "OI — THE BREAD!",
  "NOW LOOK AT IT!",
];

const HANDFULS = 5;
const FEED_ANIM = 1.8;

type Pastime = "chat" | "phone" | "book" | "feed";
type Phase = "arriving" | "sitting" | "leaving";

interface Guest {
  group: THREE.Group;
  legs: THREE.Group[];
  arms: THREE.Group[];
  face: Face;
  /** Spot on the path in front of the bench — where they walk to. */
  approach: THREE.Vector3;
  /** Final sit XZ on the slats. */
  seat: THREE.Vector3;
  faceYaw: number;
  exit: THREE.Vector3;
  phase: Phase;
  step: number;
  chatIn: number;
  pastime: Pastime;
  prop: THREE.Group | null;
  wet: number;
  /** Bread left in the bag when they're feeding. */
  handfuls: number;
  /** Toss animation countdown. */
  feeding: number;
  /** Seconds until the next handful goes in the pond. */
  tossIn: number;
}

/**
 * One or two folk on a lakeside bench — chatting, on their phone, with a
 * book, or chucking bread to the birds. Phones and paper hate the washer.
 */
export class BenchSit {
  private scene: THREE.Scene;
  private guests: Guest[] = [];
  private linger: number;
  private gone = false;
  private grumble: Grumble | null = null;
  private seat: BenchSeat;
  private complained = false;
  private fleeing = false;
  private tossAt: THREE.Vector3 | null = null;

  constructor(scene: THREE.Scene, seat: BenchSeat, pastime: Pastime) {
    this.scene = scene;
    this.seat = seat;
    this.linger =
      seat.crowd === "elder"
        ? 120 + Math.random() * 180
        : 70 + Math.random() * 140;

    const faceX = Math.sin(seat.yaw);
    const faceZ = Math.cos(seat.yaw);
    const alongX = Math.cos(seat.yaw);
    const alongZ = -Math.sin(seat.yaw);

    const party = pastime === "chat" ? 2 : 1;
    const approachRoot = new THREE.Vector3(
      seat.x + faceX * APPROACH_FORWARD + (Math.random() - 0.5) * 1.2,
      0,
      seat.z + faceZ * APPROACH_FORWARD + (Math.random() - 0.5) * 1.2,
    );

    for (let i = 0; i < party; i++) {
      const slot = party === 1 ? (Math.random() - 0.5) * 0.3 : i === 0 ? -0.42 : 0.42;
      const sit = new THREE.Vector3(
        seat.x + faceX * SIT_FORWARD + alongX * slot,
        0,
        seat.z + faceZ * SIT_FORWARD + alongZ * slot,
      );
      const approach = approachRoot
        .clone()
        .add(new THREE.Vector3(alongX * slot * 0.35, 0, alongZ * slot * 0.35));
      const start = approach
        .clone()
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 2.5,
            0,
            (Math.random() - 0.5) * 2.5,
          ),
        );
      const exit = approach
        .clone()
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 8,
            0,
            (Math.random() - 0.5) * 8,
          ),
        );
      this.guests.push(
        this.buildGuest(
          start,
          approach,
          sit,
          seat.yaw,
          exit,
          pastime,
          seat.crowd === "elder",
        ),
      );
    }
  }

  public getPosition(): THREE.Vector3 {
    return new THREE.Vector3(this.seat.x, 0, this.seat.z);
  }

  public getSeat(): BenchSeat {
    return this.seat;
  }

  public guestPositions(): THREE.Vector3[] {
    return this.guests.map((g) => g.group.position.clone());
  }

  public isDone(): boolean {
    return this.gone;
  }

  /** Still got bread for the birds. */
  public hasFood(): boolean {
    return this.guests.some(
      (g) =>
        g.pastime === "feed" &&
        g.handfuls > 0 &&
        g.phase === "sitting" &&
        g.group.visible,
    );
  }

  /** Where a begging swan should aim — the feeder on the slats. */
  public getFeederPosition(): THREE.Vector3 {
    for (const g of this.guests) {
      if (g.pastime === "feed" && g.handfuls > 0 && g.phase === "sitting") {
        return g.group.position.clone();
      }
    }
    return this.getPosition();
  }

  /**
   * Swan got close enough — chuck them a handful from the bench.
   * Returns true if a scrap went out.
   */
  public feedSwan(): boolean {
    const feeder = this.guests.find(
      (g) =>
        g.pastime === "feed" &&
        g.handfuls > 0 &&
        g.phase === "sitting" &&
        g.group.visible,
    );
    if (!feeder) return false;
    feeder.handfuls -= 1;
    feeder.feeding = FEED_ANIM;
    this.say(feeder, FEED_CHAT);
    feeder.face.setMood("pleased");
    if (feeder.handfuls <= 0) this.hideProp(feeder);
    return true;
  }

  /** Bread just lobbed into the pond, once, for the game to spawn. */
  public claimToss(): THREE.Vector3 | null {
    const spot = this.tossAt;
    this.tossAt = null;
    return spot;
  }

  /** Washer landed on someone on the bench. */
  public soakedBy(point: THREE.Vector3): boolean {
    for (const guest of this.guests) {
      if (!guest.group.visible || guest.phase === "leaving") continue;
      const dx = point.x - guest.group.position.x;
      const dz = point.z - guest.group.position.z;
      if (dx * dx + dz * dz < 0.55 * 0.55 && point.y < 1.9) return true;
    }
    return false;
  }

  /**
   * Clean or dirty spray — phone and book folk lose it and clear off.
   * Returns true once for a complaint.
   */
  public drench(_from?: THREE.Vector3): boolean {
    let hitPrecious = false;
    for (const guest of this.guests) {
      if (!guest.group.visible) continue;
      guest.wet = Math.min(1, guest.wet + 0.35);
      if (guest.pastime === "phone" || guest.pastime === "book") {
        hitPrecious = true;
        this.say(
          guest,
          guest.pastime === "phone" ? PHONE_WET : BOOK_WET,
        );
        guest.face.setMood("shocked");
        this.hideProp(guest);
      } else if (guest.pastime === "feed") {
        this.say(guest, FEED_WET);
        guest.face.setMood("angry");
        guest.handfuls = 0;
        this.hideProp(guest);
      } else {
        this.say(guest, CHAT_WET);
        guest.face.setMood("angry");
      }
    }
    if (hitPrecious || !this.fleeing) {
      this.fleeing = true;
      this.linger = Math.min(this.linger, 0.4);
      this.startLeaving(true);
    }
    if (this.complained) return false;
    this.complained = true;
    return true;
  }

  public update(delta: number): void {
    this.grumble =
      this.grumble?.update(delta, this.getPosition()) === false
        ? null
        : this.grumble;

    let anyHere = false;
    let anySitting = false;

    for (const guest of this.guests) {
      guest.face.update(delta);
      if (guest.wet > 0) guest.wet = Math.max(0, guest.wet - delta * 0.05);

      if (guest.phase === "arriving") {
        if (this.amble(guest, guest.approach, delta, 1.35) < 0.35) {
          guest.phase = "sitting";
          guest.group.position.x = guest.seat.x;
          guest.group.position.z = guest.seat.z;
          guest.group.rotation.y = guest.faceYaw;
          this.sitPose(guest, 0);
          if (guest.prop) guest.prop.visible = true;
        }
        anyHere = true;
        continue;
      }

      if (guest.phase === "leaving") {
        if (this.amble(guest, guest.exit, delta, this.fleeing ? 2.2 : 1.45) < 0.5) {
          guest.group.visible = false;
        } else {
          anyHere = true;
        }
        continue;
      }

      anyHere = true;
      anySitting = true;
      this.sitPose(guest, delta);

      if (guest.pastime === "feed" && (guest.handfuls > 0 || guest.feeding > 0)) {
        this.tickFeed(guest, delta);
      }

      guest.chatIn -= delta;
      if (guest.chatIn <= 0) {
        guest.chatIn = 8 + Math.random() * 14;
        if (Math.random() < 0.45) {
          const lines =
            guest.pastime === "phone"
              ? PHONE_CHAT
              : guest.pastime === "book"
                ? BOOK_CHAT
                : guest.pastime === "feed"
                  ? FEED_CHAT
                  : this.seat.crowd === "elder"
                    ? ELDER_CHAT
                    : CHAT;
          this.say(guest, lines);
        }
      }
    }

    if (anySitting) {
      this.linger -= delta;
      if (this.linger <= 0) this.startLeaving(false);
    }

    if (
      !anyHere &&
      this.guests.every((g) => g.phase === "leaving" || !g.group.visible)
    ) {
      this.gone = true;
    }
  }

  public dispose(): void {
    this.grumble?.dispose();
    for (const guest of this.guests) this.scene.remove(guest.group);
  }

  private startLeaving(rush: boolean): void {
    for (const guest of this.guests) {
      if (guest.phase === "leaving") continue;
      guest.phase = "leaving";
      this.hideProp(guest);
      guest.group.position.y = 0;
      guest.group.rotation.x = 0;
      guest.legs[0]!.rotation.set(0, 0, 0);
      guest.legs[1]!.rotation.set(0, 0, 0);
      guest.arms[0]!.rotation.set(0, 0, 0);
      guest.arms[1]!.rotation.set(0, 0, 0);
      if (rush) guest.face.setMood("angry");
    }
  }

  private hideProp(guest: Guest): void {
    if (guest.prop) guest.prop.visible = false;
  }

  private buildGuest(
    start: THREE.Vector3,
    approach: THREE.Vector3,
    seat: THREE.Vector3,
    faceYaw: number,
    exit: THREE.Vector3,
    pastime: Pastime,
    elder = false,
  ): Guest {
    const pick = <T>(list: readonly T[]): T =>
      list[Math.floor(Math.random() * list.length)]!;
    const coat = new THREE.MeshStandardMaterial({
      color: pick(elder ? ELDER_COATS : COATS),
      roughness: 0.9,
    });
    const legMat = new THREE.MeshStandardMaterial({
      color: pick(elder ? ELDER_TROUSERS : TROUSERS),
      roughness: 0.9,
    });
    const skin = new THREE.MeshStandardMaterial({
      color: pick(elder ? ELDER_SKIN : SKIN),
      roughness: 0.8,
    });

    const group = new THREE.Group();
    group.position.copy(start);
    group.rotation.y = Math.atan2(approach.x - start.x, approach.z - start.z);
    // Older folk a touch shorter / rounder.
    if (elder) group.scale.set(1.02, 0.94, 1.02);
    this.scene.add(group);

    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.22), legMat);
    hips.position.y = HIP_Y;
    hips.castShadow = true;
    group.add(hips);

    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(elder ? 0.46 : 0.42, elder ? 0.52 : 0.55, 0.26),
      coat,
    );
    torso.position.y = 1.28;
    torso.castShadow = true;
    group.add(torso);

    const head = new THREE.Group();
    head.position.y = 1.68;
    group.add(head);
    const face = new Face(skin);
    head.add(face.group);

    if (elder) {
      const hair = new THREE.Mesh(
        new THREE.SphereGeometry(0.17, 8, 6),
        new THREE.MeshStandardMaterial({
          color: pick(HAIR),
          roughness: 0.95,
        }),
      );
      hair.position.set(0, 0.12, -0.02);
      hair.scale.set(1.05, 0.7, 1.1);
      head.add(hair);
    }

    const legs: THREE.Group[] = [];
    const arms: THREE.Group[] = [];
    for (const side of [-1, 1] as const) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.11, HIP_Y, 0);
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.46, 0.14), legMat);
      thigh.geometry.translate(0, -0.23, 0);
      thigh.castShadow = true;
      leg.add(thigh);
      const shoe = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.06, 0.2),
        new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 1 }),
      );
      shoe.position.set(0, -0.48, 0.03);
      leg.add(shoe);
      group.add(leg);
      legs.push(leg);

      const arm = new THREE.Group();
      arm.position.set(side * 0.26, 1.48, 0);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.1), coat);
      upper.geometry.translate(0, -0.21, 0);
      upper.castShadow = true;
      arm.add(upper);
      group.add(arm);
      arms.push(arm);
    }

    let prop: THREE.Group | null = null;
    if (pastime === "phone") {
      prop = this.makePhone();
      arms[1]!.add(prop);
    } else if (pastime === "book") {
      prop = this.makeBook();
      // Held in both hands — parent on torso, posed in sit.
      torso.add(prop);
    } else if (pastime === "feed") {
      prop = this.makeBag();
      arms[1]!.add(prop);
    }

    return {
      group,
      legs,
      arms,
      face,
      approach,
      seat,
      faceYaw,
      exit,
      phase: "arriving",
      step: Math.random() * Math.PI * 2,
      chatIn: 4 + Math.random() * 8,
      pastime,
      prop,
      wet: 0,
      handfuls: pastime === "feed" ? HANDFULS : 0,
      feeding: 0,
      tossIn: pastime === "feed" ? 3 + Math.random() * 5 : 0,
    };
  }

  private makePhone(): THREE.Group {
    const prop = new THREE.Group();
    prop.visible = false;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.14, 0.012),
      new THREE.MeshStandardMaterial({
        color: 0x1a1c20,
        roughness: 0.4,
        metalness: 0.3,
      }),
    );
    prop.add(body);
    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(0.065, 0.11, 0.004),
      new THREE.MeshStandardMaterial({
        color: 0x6ec8ff,
        emissive: 0x246080,
        emissiveIntensity: 0.4,
        roughness: 0.3,
      }),
    );
    screen.position.z = 0.008;
    prop.add(screen);
    prop.position.set(0.02, -0.38, 0.06);
    prop.rotation.set(-0.4, 0.2, 0.15);
    return prop;
  }

  private makeBook(): THREE.Group {
    const prop = new THREE.Group();
    prop.visible = false;
    const cover = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.02, 0.28),
      new THREE.MeshStandardMaterial({ color: 0x6a3038, roughness: 0.9 }),
    );
    prop.add(cover);
    const page = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.015, 0.26),
      new THREE.MeshStandardMaterial({ color: 0xf0e8d8, roughness: 1 }),
    );
    page.position.y = 0.012;
    prop.add(page);
    prop.position.set(0.05, 0.05, 0.22);
    prop.rotation.set(0.9, 0.1, 0.05);
    return prop;
  }

  private makeBag(): THREE.Group {
    const prop = new THREE.Group();
    prop.visible = false;
    const bag = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.2, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xc8b890, roughness: 0.95 }),
    );
    prop.add(bag);
    const loaf = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.06, 0.05),
      new THREE.MeshStandardMaterial({ color: 0xe8d7a8, roughness: 1 }),
    );
    loaf.position.y = 0.08;
    prop.add(loaf);
    prop.position.set(0.02, -0.36, 0.05);
    prop.rotation.set(0.25, 0.1, 0.2);
    return prop;
  }

  /**
   * From the bench: lob a handful into the lake now and then, and keep a
   * soft toss pose while feeding a swan by hand.
   */
  private tickFeed(guest: Guest, delta: number): void {
    if (guest.feeding > 0) {
      guest.feeding = Math.max(0, guest.feeding - delta);
      return;
    }
    if (guest.handfuls <= 0) return;
    guest.tossIn -= delta;
    if (guest.tossIn > 0 || this.tossAt) return;
    guest.tossIn = 7 + Math.random() * 10;
    guest.handfuls -= 1;
    guest.feeding = FEED_ANIM;
    this.tossAt = this.tossIntoPond(guest);
    this.say(guest, FEED_CHAT);
    guest.face.setMood("pleased");
    if (guest.handfuls <= 0) this.hideProp(guest);
  }

  private tossIntoPond(guest: Guest): THREE.Vector3 {
    const here = guest.group.position;
    const shore = nearestShore(here.x, here.z);
    const out = outwardAt(shore);
    const reach = distanceToShore(here.x, here.z) + 2.4 + Math.random() * 3.2;
    const spot = new THREE.Vector3(
      here.x - out.x * reach,
      0,
      here.z - out.y * reach,
    );
    if (!isInLake(spot.x, spot.z)) {
      spot.set(shore.x - out.x * 2.8, 0, shore.y - out.y * 2.8);
    }
    return spot;
  }

  private amble(
    guest: Guest,
    to: THREE.Vector3,
    delta: number,
    speed: number,
  ): number {
    const here = guest.group.position;
    const gap = Math.hypot(to.x - here.x, to.z - here.z);
    if (gap < 0.05) return 0;
    const step = Math.min(gap, speed * delta);
    const landed = stepWalk(
      here.x,
      here.z,
      ((to.x - here.x) / gap) * step,
      ((to.z - here.z) / gap) * step,
      0.4,
      { x: here.x, z: here.z },
    );
    here.x = landed.x;
    here.z = landed.z;
    guest.group.rotation.y = Math.atan2(to.x - here.x, to.z - here.z);
    guest.step += delta * speed * 4.5;
    const swing = Math.sin(guest.step) * 0.55;
    guest.legs[0]!.rotation.x = swing;
    guest.legs[1]!.rotation.x = -swing;
    guest.arms[0]!.rotation.x = -swing * 0.7;
    guest.arms[1]!.rotation.x = swing * 0.7;
    guest.group.position.y = Math.abs(Math.sin(guest.step)) * 0.04;
    if (guest.wet < 0.2) guest.face.setMood("idle");
    return gap - step;
  }

  private sitPose(guest: Guest, delta = 0.016): void {
    // Sink the standing figure so the hips rest on the seat slats.
    guest.group.position.y = BENCH_SEAT_H - HIP_Y + 0.02;
    guest.group.position.x = guest.seat.x;
    guest.group.position.z = guest.seat.z;
    guest.group.rotation.y = guest.faceYaw;
    // Slight lean into the backrest.
    guest.group.rotation.x = -0.08;
    // Negative X swings the thighs forward off the seat (same as picnic sit).
    // Positive would fold them back through the ironwork.
    guest.legs[0]!.rotation.x = -1.25;
    guest.legs[1]!.rotation.x = -1.2;
    guest.legs[0]!.rotation.z = 0.08;
    guest.legs[1]!.rotation.z = -0.08;
    guest.step += delta;

    if (guest.pastime === "phone") {
      guest.arms[0]!.rotation.x = -0.35;
      guest.arms[1]!.rotation.x = -1.15 + Math.sin(guest.step * 0.9) * 0.04;
      guest.arms[0]!.rotation.z = 0.2;
      guest.arms[1]!.rotation.z = -0.35;
      guest.face.setMood(
        Math.sin(guest.step * 0.5) > 0.75 ? "shifty" : "idle",
      );
      return;
    }

    if (guest.pastime === "book") {
      guest.arms[0]!.rotation.x = -0.95;
      guest.arms[1]!.rotation.x = -0.9;
      guest.arms[0]!.rotation.z = 0.35;
      guest.arms[1]!.rotation.z = -0.25;
      guest.face.setMood("pleased");
      return;
    }

    if (guest.pastime === "feed") {
      // Face the water — that's where the birds are.
      const shore = nearestShore(guest.seat.x, guest.seat.z);
      const out = outwardAt(shore);
      const want = Math.atan2(-out.x, -out.y);
      let off = want - guest.faceYaw;
      while (off > Math.PI) off -= Math.PI * 2;
      while (off < -Math.PI) off += Math.PI * 2;
      guest.group.rotation.y =
        guest.faceYaw + THREE.MathUtils.clamp(off, -0.85, 0.85);

      if (guest.feeding > 0) {
        const t = 1 - guest.feeding / FEED_ANIM;
        const toss = Math.sin(t * Math.PI);
        guest.arms[1]!.rotation.x = -0.5 - toss * 1.1;
        guest.arms[1]!.rotation.z = -0.2;
        guest.arms[0]!.rotation.x = -0.35;
        guest.arms[0]!.rotation.z = 0.15;
        guest.face.setMood("pleased");
      } else if (guest.handfuls > 0) {
        guest.arms[1]!.rotation.x = -0.75 + Math.sin(guest.step * 0.6) * 0.06;
        guest.arms[0]!.rotation.x = -0.4;
        guest.arms[1]!.rotation.z = -0.25;
        guest.arms[0]!.rotation.z = 0.2;
        guest.face.setMood("pleased");
      } else {
        guest.arms[0]!.rotation.x = -0.4;
        guest.arms[1]!.rotation.x = -0.35;
        guest.arms[0]!.rotation.z = 0.15;
        guest.arms[1]!.rotation.z = -0.15;
        guest.face.setMood("idle");
      }
      return;
    }

    // Chat — glance toward the other, soft hand talk.
    const other = this.guests.find((g) => g !== guest);
    if (other) {
      let want = Math.atan2(
        other.group.position.x - guest.group.position.x,
        other.group.position.z - guest.group.position.z,
      );
      let off = want - guest.faceYaw;
      while (off > Math.PI) off -= Math.PI * 2;
      while (off < -Math.PI) off += Math.PI * 2;
      guest.group.rotation.y =
        guest.faceYaw + THREE.MathUtils.clamp(off, -0.55, 0.55);
    }
    guest.arms[0]!.rotation.x = -0.45 + Math.sin(guest.step * 0.7) * 0.12;
    guest.arms[1]!.rotation.x = -0.35 + Math.sin(guest.step * 0.55 + 1) * 0.1;
    guest.arms[0]!.rotation.z = 0.2;
    guest.arms[1]!.rotation.z = -0.15;
    guest.face.setMood("pleased");
  }

  private say(guest: Guest, lines: readonly string[]): void {
    this.grumble?.dispose();
    const line = lines[Math.floor(Math.random() * lines.length)]!;
    const at = guest.group.position.clone();
    at.y = 2.05;
    this.grumble = new Grumble(this.scene, line, at);
  }
}

export type BenchPastime = Pastime;
