import * as THREE from "three";
import { Grumble } from "../effects/Grumble";
import { stepWalk } from "../world/blocking";
import { groundHeight } from "../world/terrain";
import {
  flowerBeds,
  restoreFlowerPetal,
  trampleFlowerBed,
  type FlowerBed,
} from "../world/trees";
import type { Person } from "./Person";
import type { Dog } from "./Dog";

const TEND_LINES = [
  "THAT'LL DO YOU",
  "NICE AND TIDY",
  "DRINK UP, LOVELIES",
  "COME ON THEN",
  "BACK IN YOU GO",
];
const WATER_LINES = [
  "THAT'S THE STUFF!",
  "GOOD LAD — KEEP IT COMING",
  "THEY NEEDED THAT",
  "PROPER JOB, THAT",
  "CHEERS FOR THE WATER",
];
const TRAMPLE_LINES = [
  "OI! OFF MY BEDS!",
  "GET OUT OF THEM FLOWERS!",
  "YOU'RE TREADING THEM FLAT!",
  "I'LL HAVE YOU FOR THAT!",
  "MIND THE BLOOMS!",
];
const BLAST_LINES = [
  "YOU'RE BLASTING THE HEADS OFF!",
  "TOO CLOSE WITH THAT WASHER!",
  "LOOK WHAT YOU'VE DONE!",
  "COME HERE YOU VANDAL!",
  "THOSE ARE COUNCIL FLOWERS!",
];
const HUNT_LINES = [
  "GET BACK HERE!",
  "I SAW THAT!",
  "DON'T YOU RUN!",
  "I'LL HAVE YOUR WAGES!",
];

type Job = "idle" | "toBed" | "tend" | "hunt";

type HuntTarget =
  | { kind: "player" }
  | { kind: "person"; person: Person }
  | { kind: "dog"; dog: Dog };

/**
 * Council gardener on the ornamental beds. Waters and replants, loses it if
 * anyone (dog included) walks through the blooms, and if you hose them from
 * point-blank — though a distant misting gets a thumbs-up.
 */
export class Gardener {
  private scene: THREE.Scene;
  private group = new THREE.Group();
  private legs: THREE.Group[] = [];
  private arms: THREE.Group[] = [];
  private rake: THREE.Group;

  private job: Job = "idle";
  private bed: FlowerBed | null = null;
  private bedIdx = 0;
  private timer = 0;
  private step = Math.random() * Math.PI * 2;
  private grumble: Grumble | null = null;
  private chatIn = 10 + Math.random() * 18;
  private hunt: HuntTarget | null = null;
  private huntLeft = 0;
  private swingReady = false;
  private swingCool = 0;
  private swingsLanded = 0;
  private shoutIn = 0;
  private praiseCool = 0;
  private tendRestoreIn = 0;
  /** Soften repeat anger so every footfall isn't a fresh chase. */
  private angerCool = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.rake = this.buildRake();
    this.build();
    const beds = flowerBeds();
    if (beds.length > 0) {
      this.bed = beds[0]!;
      this.standBy(this.bed);
    } else {
      this.group.position.set(0, 0, 70);
    }
    scene.add(this.group);
  }

  public getPosition(): THREE.Vector3 {
    return this.group.position.clone();
  }

  public isHunting(): boolean {
    return this.job === "hunt";
  }

  /** True once when a hunting swing connects. */
  public wantsSwing(): boolean {
    if (!this.swingReady) return false;
    this.swingReady = false;
    this.swingCool = 2.4;
    this.swingsLanded += 1;
    this.say(HUNT_LINES[Math.floor(Math.random() * HUNT_LINES.length)]!);
    if (this.swingsLanded >= 3) {
      this.huntLeft = Math.min(this.huntLeft, 1.2);
    }
    return true;
  }

  /** Distant watering — he likes that. */
  public noticeWatered(): void {
    if (this.praiseCool > 0 || this.job === "hunt") return;
    this.praiseCool = 8;
    this.say(WATER_LINES[Math.floor(Math.random() * WATER_LINES.length)]!);
  }

  /** Close-range washer stripped petals — come for the cleaner. */
  public noticeBlasted(): void {
    this.startHunt({ kind: "player" }, BLAST_LINES);
  }

  public update(
    delta: number,
    player: THREE.Vector3,
    people: readonly Person[],
  ): void {
    this.grumble =
      this.grumble?.update(delta, this.group.position) === false
        ? null
        : this.grumble;
    if (this.timer > 0) this.timer -= delta;
    if (this.swingCool > 0) this.swingCool -= delta;
    if (this.praiseCool > 0) this.praiseCool -= delta;
    if (this.angerCool > 0) this.angerCool -= delta;
    if (this.shoutIn > 0) this.shoutIn -= delta;

    this.group.position.y = groundHeight(
      this.group.position.x,
      this.group.position.z,
    );

    if (flowerBeds().length === 0) {
      this.idlePose(delta);
      return;
    }

    this.watchBeds(player, people);

    if (this.job === "hunt") {
      this.chase(delta, player);
      return;
    }

    if (this.job === "idle") {
      if (this.timer > 0) {
        this.idlePose(delta);
        return;
      }
      this.pickNextBed();
      return;
    }

    if (this.job === "toBed") {
      if (!this.bed) {
        this.job = "idle";
        return;
      }
      const edge = this.tendSpot(this.bed);
      if (this.walkToward(edge, delta, 2.4)) {
        this.job = "tend";
        this.timer = 5.5 + Math.random() * 4;
        this.tendRestoreIn = 1.2;
        this.faceBed(this.bed);
        this.say(TEND_LINES[Math.floor(Math.random() * TEND_LINES.length)]!);
      }
      return;
    }

    if (this.job === "tend") {
      this.tendPose(delta);
      this.tendRestoreIn -= delta;
      if (this.tendRestoreIn <= 0 && this.bed) {
        if (restoreFlowerPetal(this.bed)) {
          this.tendRestoreIn = 1.4 + Math.random() * 0.8;
        } else {
          this.tendRestoreIn = 2.5;
        }
      }
      if (this.timer <= 0) {
        this.job = "idle";
        this.timer = 1.5 + Math.random() * 2.5;
        this.chatIn = 8 + Math.random() * 14;
      }
    }
  }

  public dispose(): void {
    this.grumble?.dispose();
    this.scene.remove(this.group);
  }

  private watchBeds(player: THREE.Vector3, people: readonly Person[]): void {
    if (this.angerCool > 0) return;

    if (this.feetInBed(player.x, player.z)) {
      trampleFlowerBed(player.x, player.z);
      this.startHunt({ kind: "player" }, TRAMPLE_LINES);
      return;
    }

    for (const person of people) {
      const at = person.getPosition();
      if (this.feetInBed(at.x, at.z)) {
        trampleFlowerBed(at.x, at.z);
        this.startHunt({ kind: "person", person }, TRAMPLE_LINES);
        return;
      }
      const dog = person.getDog();
      if (!dog) continue;
      const paw = dog.getPosition();
      if (this.feetInBed(paw.x, paw.z)) {
        trampleFlowerBed(paw.x, paw.z);
        this.startHunt({ kind: "dog", dog }, TRAMPLE_LINES);
        return;
      }
    }
  }

  private feetInBed(x: number, z: number): boolean {
    for (const bed of flowerBeds()) {
      const dx = x - bed.x;
      const dz = z - bed.z;
      const cos = Math.cos(-bed.yaw);
      const sin = Math.sin(-bed.yaw);
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      if (Math.abs(lx) < bed.halfWide - 0.15 && Math.abs(lz) < bed.halfDeep - 0.15) {
        return true;
      }
    }
    return false;
  }

  private startHunt(target: HuntTarget, lines: readonly string[]): void {
    this.angerCool = 2.5;
    this.hunt = target;
    this.job = "hunt";
    this.huntLeft = 18 + Math.random() * 8;
    this.swingsLanded = 0;
    this.swingReady = false;
    this.swingCool = 0.35;
    this.shoutIn = 0;
    this.say(lines[Math.floor(Math.random() * lines.length)]!);
  }

  private chase(delta: number, player: THREE.Vector3): void {
    this.huntLeft -= delta;
    const aim = this.huntAim(player);
    if (!aim || this.huntLeft <= 0) {
      this.job = "idle";
      this.hunt = null;
      this.swingReady = false;
      this.timer = 1;
      return;
    }

    if (this.shoutIn <= 0 && !this.grumble) {
      this.say(HUNT_LINES[Math.floor(Math.random() * HUNT_LINES.length)]!);
      this.shoutIn = 3.2 + Math.random() * 2.8;
    }

    const here = this.group.position;
    const gap = Math.hypot(aim.x - here.x, aim.z - here.z);
    this.faceToward(aim);

    if (gap > 1.45) {
      this.walkToward(aim, delta, 4.8);
      this.rake.visible = true;
      this.arms[0]!.rotation.x = -1.1;
      this.arms[1]!.rotation.x = -1.35;
      this.arms[0]!.rotation.z = 0.35;
      this.arms[1]!.rotation.z = -0.55;
      return;
    }

    // In range — dig with the rake.
    this.legs[0]!.rotation.x = 0.25;
    this.legs[1]!.rotation.x = -0.4;
    this.arms[1]!.rotation.x = -2.15;
    this.arms[1]!.rotation.z = -1.0;
    this.arms[0]!.rotation.x = -0.65;
    this.arms[0]!.rotation.z = 0.3;
    this.group.rotation.x = -0.08;
    this.rake.visible = true;

    if (!this.swingReady && this.swingCool <= 0) {
      if (this.hunt?.kind === "player") {
        this.swingReady = true;
      } else {
        this.landHit(aim);
        this.swingCool = 2.4;
        this.swingsLanded += 1;
        this.say(HUNT_LINES[Math.floor(Math.random() * HUNT_LINES.length)]!);
        if (this.swingsLanded >= 3) {
          this.huntLeft = Math.min(this.huntLeft, 1.2);
        }
      }
    }
  }

  private landHit(aim: THREE.Vector3): void {
    if (!this.hunt) return;
    if (this.hunt.kind === "person") {
      this.hunt.person.spook(this.group.position, true);
    } else if (this.hunt.kind === "dog") {
      this.hunt.dog.hoseKnock(this.group.position);
    }
    void aim;
  }

  private huntAim(player: THREE.Vector3): THREE.Vector3 | null {
    if (!this.hunt) return null;
    if (this.hunt.kind === "player") return player;
    if (this.hunt.kind === "person") return this.hunt.person.getPosition();
    return this.hunt.dog.getPosition();
  }

  private pickNextBed(): void {
    const beds = flowerBeds();
    if (beds.length === 0) return;
    this.bedIdx = (this.bedIdx + 1) % beds.length;
    this.bed = beds[this.bedIdx]!;
    this.job = "toBed";
  }

  private tendSpot(bed: FlowerBed): THREE.Vector3 {
    // Stand just off the long edge so he isn't trampling while he works.
    const outward = new THREE.Vector2(
      Math.sin(bed.yaw),
      Math.cos(bed.yaw),
    );
    return new THREE.Vector3(
      bed.x + outward.x * (bed.halfDeep + 0.85),
      0,
      bed.z + outward.y * (bed.halfDeep + 0.85),
    );
  }

  private standBy(bed: FlowerBed): void {
    const spot = this.tendSpot(bed);
    this.group.position.set(spot.x, groundHeight(spot.x, spot.z), spot.z);
    this.faceBed(bed);
  }

  private faceBed(bed: FlowerBed): void {
    this.faceToward(new THREE.Vector3(bed.x, 0, bed.z));
  }

  private faceToward(at: THREE.Vector3): void {
    this.group.rotation.y = Math.atan2(
      at.x - this.group.position.x,
      at.z - this.group.position.z,
    );
  }

  private walkToward(at: THREE.Vector3, delta: number, pace: number): boolean {
    const here = this.group.position;
    const dx = at.x - here.x;
    const dz = at.z - here.z;
    const gap = Math.hypot(dx, dz);
    if (gap < 0.5) {
      this.legs[0]!.rotation.x = 0;
      this.legs[1]!.rotation.x = 0;
      return true;
    }
    const step = Math.min(gap, pace * delta);
    const landed = stepWalk(
      here.x,
      here.z,
      (dx / gap) * step,
      (dz / gap) * step,
      0.35,
      { x: here.x, z: here.z },
    );
    here.x = landed.x;
    here.z = landed.z;
    this.group.rotation.y = Math.atan2(dx, dz);
    this.step += delta * 10;
    const swing = Math.sin(this.step) * 0.55;
    this.legs[0]!.rotation.x = swing;
    this.legs[1]!.rotation.x = -swing;
    this.arms[0]!.rotation.x = -swing * 0.45;
    this.arms[1]!.rotation.x = swing * 0.45;
    this.rake.visible = true;
    return Math.hypot(at.x - here.x, at.z - here.z) < 0.5;
  }

  private idlePose(delta: number): void {
    this.chatIn -= delta;
    if (this.chatIn <= 0 && !this.grumble && this.job !== "hunt") {
      this.say(TEND_LINES[Math.floor(Math.random() * TEND_LINES.length)]!);
      this.chatIn = 20 + Math.random() * 30;
    }
    this.step += delta * 2;
    this.group.rotation.z = Math.sin(this.step) * 0.03;
    this.arms[0]!.rotation.x = 0;
    this.arms[1]!.rotation.x = -0.35;
    this.legs[0]!.rotation.x = 0;
    this.legs[1]!.rotation.x = 0;
    this.rake.visible = true;
  }

  private tendPose(delta: number): void {
    this.step += delta * 5;
    const dig = Math.sin(this.step) * 0.35;
    this.arms[0]!.rotation.x = -0.9 + dig;
    this.arms[1]!.rotation.x = -1.2 - dig * 0.4;
    this.arms[0]!.rotation.z = 0.2;
    this.arms[1]!.rotation.z = -0.35;
    this.legs[0]!.rotation.x = 0.35;
    this.legs[1]!.rotation.x = -0.55;
    this.group.rotation.x = 0.12;
    this.rake.visible = true;
  }

  private say(text: string): void {
    this.grumble?.dispose();
    this.grumble = new Grumble(
      this.scene,
      text,
      this.group.position.clone().add(new THREE.Vector3(0, 2.15, 0)),
    );
  }

  private buildRake(): THREE.Group {
    const rake = new THREE.Group();
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.025, 1.35, 5),
      new THREE.MeshStandardMaterial({ color: 0x6b4a28, roughness: 0.9 }),
    );
    shaft.position.y = -0.55;
    rake.add(shaft);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.04, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x6a7078, roughness: 0.55, metalness: 0.4 }),
    );
    head.position.y = -1.2;
    rake.add(head);
    for (let i = -2; i <= 2; i++) {
      const tine = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.16, 0.03),
        new THREE.MeshStandardMaterial({ color: 0x555a62, roughness: 0.5, metalness: 0.5 }),
      );
      tine.position.set(i * 0.08, -1.3, 0.02);
      rake.add(tine);
    }
    return rake;
  }

  private build(): void {
    const skin = new THREE.MeshStandardMaterial({
      color: 0xd9a066,
      roughness: 0.9,
    });
    const jumper = new THREE.MeshStandardMaterial({
      color: 0x3d6b3a,
      roughness: 0.85,
    });
    const trousers = new THREE.MeshStandardMaterial({
      color: 0x4a3a28,
      roughness: 0.9,
    });
    const hat = new THREE.MeshStandardMaterial({
      color: 0xb8a060,
      roughness: 0.95,
    });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.32), jumper);
    torso.position.y = 1.15;
    torso.castShadow = true;
    this.group.add(torso);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.32), skin);
    head.position.y = 1.72;
    this.group.add(head);

    const brim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.04, 10),
      hat,
    );
    brim.position.y = 1.88;
    this.group.add(brim);
    const crown = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.2, 0.16, 8),
      hat,
    );
    crown.position.y = 1.98;
    this.group.add(crown);

    for (const side of [-1, 1] as const) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.14, 0.78, 0);
      const thigh = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.78, 0.18),
        trousers,
      );
      thigh.position.y = -0.39;
      leg.add(thigh);
      this.group.add(leg);
      this.legs.push(leg);

      const arm = new THREE.Group();
      arm.position.set(side * 0.32, 1.4, 0);
      const sleeve = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.62, 0.14),
        jumper,
      );
      sleeve.position.y = -0.28;
      arm.add(sleeve);
      this.group.add(arm);
      this.arms.push(arm);
    }

    this.rake.position.set(0.12, -0.15, 0.05);
    this.rake.rotation.z = 0.15;
    this.arms[1]!.add(this.rake);
  }
}
