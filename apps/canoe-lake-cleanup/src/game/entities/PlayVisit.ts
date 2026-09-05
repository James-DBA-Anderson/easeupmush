import * as THREE from "three";
import { getPlayPark, type PlayParkSite } from "../world/park";
import { Face } from "./Face";
import { Grumble } from "../effects/Grumble";

const COATS = [0x2f4f7f, 0xd8452f, 0x3f6b4a, 0xe0b83c, 0x5a4a7a, 0xd8c8a0];
const TROUSERS = [0x2b3038, 0x4a4a52, 0x3a5a6a, 0x6b5a44];
const SKIN = [0xf0c8a0, 0xd9a066, 0x8d5a3b, 0x5c3a26];

const YELLS = [
  "WATCH THIS!",
  "MY TURN!",
  "HIGHER!",
  "RACE YOU!",
  "I'M KING OF THE SLIDE!",
  "NO PUSHING!",
  "AGAIN!",
];

type Activity = "swing" | "slide" | "spring" | "run";
type Phase = "arriving" | "playing" | "leaving";

interface Kid {
  group: THREE.Group;
  legs: THREE.Group[];
  arms: THREE.Group[];
  face: Face;
  target: THREE.Vector3;
  exit: THREE.Vector3;
  phase: Phase;
  activity: Activity;
  timer: number;
  step: number;
  yellIn: number;
}

/**
 * A few kids walking in off the promenade to tear round the play park —
 * swings, slide, springy animal, chasing each other — then wandering off again.
 */
export class PlayVisit {
  private scene: THREE.Scene;
  private site: PlayParkSite;
  private kids: Kid[] = [];
  private packUp: number;
  private gone = false;
  private grumble: Grumble | null = null;
  private yawCos: number;
  private yawSin: number;

  constructor(scene: THREE.Scene, site: PlayParkSite) {
    this.scene = scene;
    this.site = site;
    this.packUp = 160 + Math.random() * 200;
    this.yawCos = Math.cos(site.yaw);
    this.yawSin = Math.sin(site.yaw);

    const south =
      Math.random() < 0.5
        ? new THREE.Vector3(-50 + (Math.random() - 0.5) * 12, 0, -108)
        : new THREE.Vector3(50 + (Math.random() - 0.5) * 12, 0, -108);

    const party = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < party; i++) {
      const activity = this.pickActivity(i);
      const stand = this.worldSpot(this.spotFor(activity, i));
      const start = south
        .clone()
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 8,
            0,
            -3 - Math.random() * 8,
          ),
        );
      const exit = south
        .clone()
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 14,
            0,
            -6 - Math.random() * 10,
          ),
        );
      this.kids.push(this.buildKid(start, stand, exit, activity));
    }
  }

  public guestPositions(): THREE.Vector3[] {
    return this.kids
      .filter((k) => k.group.visible)
      .map((k) => k.group.position.clone());
  }

  public isDone(): boolean {
    return this.gone;
  }

  public update(delta: number): void {
    this.grumble =
      this.grumble?.update(delta, this.kids[0]?.group.position ?? new THREE.Vector3()) ===
      false
        ? null
        : this.grumble;

    let anyHere = false;
    let anyPlaying = false;

    for (const kid of this.kids) {
      kid.face.update(delta);

      if (kid.phase === "arriving") {
        if (this.amble(kid, kid.target, delta, 1.9) < 0.3) {
          kid.phase = "playing";
          kid.group.position.copy(kid.target);
          kid.timer = 6 + Math.random() * 10;
        }
        anyHere = true;
        continue;
      }

      if (kid.phase === "leaving") {
        if (this.amble(kid, kid.exit, delta, 2.1) < 0.5) {
          kid.group.visible = false;
        } else {
          anyHere = true;
        }
        continue;
      }

      anyHere = true;
      anyPlaying = true;
      kid.timer -= delta;
      this.playPose(kid, delta);

      kid.yellIn -= delta;
      if (kid.yellIn <= 0) {
        kid.yellIn = 6 + Math.random() * 12;
        if (Math.random() < 0.45) this.yell(kid);
      }

      if (kid.timer > 0) continue;
      // Swap kit every so often so they don't freeze on one bit of gear.
      kid.activity = this.pickActivity(Math.floor(Math.random() * 4));
      kid.target = this.worldSpot(this.spotFor(kid.activity, 0));
      kid.timer = 7 + Math.random() * 12;
      kid.phase = "arriving";
    }

    if (anyPlaying) {
      this.packUp -= delta;
      if (this.packUp <= 0) {
        for (const kid of this.kids) {
          if (kid.phase !== "leaving") kid.phase = "leaving";
        }
      }
    }

    if (!anyHere) this.gone = true;
  }

  public dispose(): void {
    this.grumble?.dispose();
    for (const kid of this.kids) this.scene.remove(kid.group);
  }

  private pickActivity(i: number): Activity {
    const options: Activity[] = ["swing", "slide", "spring", "run"];
    return options[i % options.length]!;
  }

  private spotFor(activity: Activity, i: number): { x: number; z: number } {
    if (activity === "swing") {
      const seats = this.site.swings;
      return seats[i % seats.length]!;
    }
    if (activity === "slide") return this.site.slide;
    if (activity === "spring") return this.site.spring;
    return this.site.run[i % this.site.run.length]!;
  }

  /** Local play-park coords into world XZ. */
  private worldSpot(local: { x: number; z: number }): THREE.Vector3 {
    const x = this.site.x + local.x * this.yawCos + local.z * this.yawSin;
    const z = this.site.z - local.x * this.yawSin + local.z * this.yawCos;
    return new THREE.Vector3(x, 0, z);
  }

  private buildKid(
    start: THREE.Vector3,
    stand: THREE.Vector3,
    exit: THREE.Vector3,
    activity: Activity,
  ): Kid {
    const pick = <T>(list: readonly T[]): T =>
      list[Math.floor(Math.random() * list.length)]!;
    const coat = new THREE.MeshStandardMaterial({
      color: pick(COATS),
      roughness: 0.9,
    });
    const legMat = new THREE.MeshStandardMaterial({
      color: pick(TROUSERS),
      roughness: 0.9,
    });
    const skin = new THREE.MeshStandardMaterial({
      color: pick(SKIN),
      roughness: 0.8,
    });

    const group = new THREE.Group();
    group.position.copy(start);
    group.scale.setScalar(0.72);
    group.rotation.y = Math.atan2(stand.x - start.x, stand.z - start.z);
    this.scene.add(group);

    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.2), coat);
    chest.position.y = 0.95;
    chest.castShadow = true;
    group.add(chest);

    const head = new THREE.Group();
    head.position.y = 1.28;
    group.add(head);
    const face = new Face(skin, 0.85);
    head.add(face.group);

    const legs: THREE.Group[] = [];
    const arms: THREE.Group[] = [];
    for (const side of [-1, 1] as const) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.09, 0.72, 0);
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.36, 0.12), legMat);
      thigh.geometry.translate(0, -0.18, 0);
      thigh.castShadow = true;
      leg.add(thigh);
      const shoe = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.05, 0.16),
        new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 1 }),
      );
      shoe.position.set(0, -0.38, 0.02);
      leg.add(shoe);
      group.add(leg);
      legs.push(leg);

      const arm = new THREE.Group();
      arm.position.set(side * 0.2, 1.1, 0);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 0.08), coat);
      upper.geometry.translate(0, -0.16, 0);
      arm.add(upper);
      group.add(arm);
      arms.push(arm);
    }

    return {
      group,
      legs,
      arms,
      face,
      target: stand,
      exit,
      phase: "arriving",
      activity,
      timer: 0,
      step: Math.random() * Math.PI * 2,
      yellIn: 3 + Math.random() * 6,
    };
  }

  private amble(
    kid: Kid,
    to: THREE.Vector3,
    delta: number,
    speed: number,
  ): number {
    const here = kid.group.position;
    const gap = Math.hypot(to.x - here.x, to.z - here.z);
    if (gap < 0.05) return 0;
    const step = Math.min(gap, speed * delta);
    here.x += ((to.x - here.x) / gap) * step;
    here.z += ((to.z - here.z) / gap) * step;
    kid.group.rotation.x = 0;
    kid.group.rotation.z = 0;
    kid.group.rotation.y = Math.atan2(to.x - here.x, to.z - here.z);
    kid.step += delta * speed * 5.2;
    const swing = Math.sin(kid.step) * 0.7;
    kid.legs[0]!.rotation.x = swing;
    kid.legs[1]!.rotation.x = -swing;
    kid.arms[0]!.rotation.x = -swing * 0.8;
    kid.arms[1]!.rotation.x = swing * 0.8;
    kid.group.position.y = Math.abs(Math.sin(kid.step)) * 0.05;
    kid.face.setMood("pleased");
    return gap - step;
  }

  private playPose(kid: Kid, delta: number): void {
    kid.step += delta * (kid.activity === "run" ? 3.2 : 2.2);
    kid.face.setMood("pleased");
    kid.group.position.y = 0;

    if (kid.activity === "swing") {
      const arc = Math.sin(kid.step) * 0.55;
      kid.group.rotation.x = arc * 0.35;
      kid.arms[0]!.rotation.x = -1.4;
      kid.arms[1]!.rotation.x = -1.4;
      kid.legs[0]!.rotation.x = 0.4 + arc * 0.3;
      kid.legs[1]!.rotation.x = 0.4 - arc * 0.3;
      return;
    }

    if (kid.activity === "slide") {
      kid.group.rotation.x = 0.25;
      kid.arms[0]!.rotation.x = -0.4;
      kid.arms[1]!.rotation.x = -0.4;
      kid.legs[0]!.rotation.x = 0.6;
      kid.legs[1]!.rotation.x = 0.35;
      kid.group.position.y = 0.15 + Math.abs(Math.sin(kid.step)) * 0.08;
      return;
    }

    if (kid.activity === "spring") {
      const bounce = Math.abs(Math.sin(kid.step * 1.6));
      kid.group.position.y = bounce * 0.22;
      kid.group.rotation.z = Math.sin(kid.step) * 0.12;
      kid.arms[0]!.rotation.x = -0.8;
      kid.arms[1]!.rotation.x = -0.8;
      kid.legs[0]!.rotation.x = 0.5;
      kid.legs[1]!.rotation.x = 0.5;
      return;
    }

    // Tear about on the rubber.
    const swing = Math.sin(kid.step) * 0.85;
    kid.legs[0]!.rotation.x = swing;
    kid.legs[1]!.rotation.x = -swing;
    kid.arms[0]!.rotation.x = -swing;
    kid.arms[1]!.rotation.x = swing;
    kid.group.position.y = Math.abs(Math.sin(kid.step)) * 0.06;
    kid.group.rotation.y += delta * 1.4;
  }

  private yell(kid: Kid): void {
    this.grumble?.dispose();
    this.grumble = new Grumble(
      this.scene,
      YELLS[Math.floor(Math.random() * YELLS.length)]!,
      kid.group.position,
    );
  }
}

/** Spawn helper — only when the play park exists. */
export function canVisitPlayPark(): PlayParkSite | null {
  return getPlayPark();
}
