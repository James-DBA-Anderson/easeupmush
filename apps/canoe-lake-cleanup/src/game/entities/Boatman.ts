import * as THREE from "three";
import { Grumble } from "../effects/Grumble";
import { stepWalk } from "../world/blocking";
import { isInLake, nearestShore, outwardAt } from "../world/lake";
import {
  boatmanStandSpot,
  hatchQueueSpot,
  pedaloWorldPos,
} from "../world/park";

const PAY_LINES = [
  "THAT'LL BE A TENNER",
  "TEN POUND HIRE",
  "CASH ONLY, MUSH",
  "SIGN HERE — AND WATCH THE STEP",
];
const HELP_LINES = [
  "WATCH YOUR STEP",
  "IN YOU GET",
  "HAND ON THE NECK",
  "STEADY NOW",
  "THAT'S IT — SIT TIGHT",
];
const IDLE_LINES = ["NEXT!", "SWAN BOATS THIS WAY", "HIRE HERE"];
const MAD_LINES = [
  "YOU'VE SUNK MY BLOODY SWAN!",
  "OI — THAT BOAT COSTS MONEY!",
  "COME HERE YOU MENACE!",
  "I'LL HAVE YOUR WAGES FOR THAT!",
  "LOOK WHAT YOU'VE DONE!",
];
const HUNT_LINES = [
  "GET BACK HERE!",
  "DON'T YOU RUN!",
  "I SAW THAT!",
  "PAY FOR THAT HULL!",
];

type Job = "idle" | "toBoat" | "helping" | "back" | "hunt";

/**
 * The bloke who works the hire hatch — takes the money and helps people into
 * the swan boats. Sink one and he'll come for you.
 */
export class Boatman {
  private scene: THREE.Scene;
  private group = new THREE.Group();
  private legs: THREE.Group[] = [];
  private arms: THREE.Group[] = [];
  private stand = new THREE.Vector3();
  private job: Job = "idle";
  private timer = 0;
  private step = Math.random() * Math.PI * 2;
  private grumble: Grumble | null = null;
  private chatIn = 18 + Math.random() * 25;
  private helpBoat = -1;
  private helpDone: (() => void) | null = null;
  private helpStuck = 0;
  private huntLeft = 0;
  private swingReady = false;
  private swingCool = 0;
  private swingsLanded = 0;
  private shoutIn = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    const home =
      boatmanStandSpot() ?? hatchQueueSpot() ?? new THREE.Vector3(0, 0, 40);
    this.stand.copy(home);
    this.group.position.copy(home);
    this.build();
    scene.add(this.group);
  }

  public getPosition(): THREE.Vector3 {
    return this.group.position.clone();
  }

  /** Take payment at the hatch — a short chat while they dig for change. */
  public takePayment(): void {
    if (this.job !== "idle") return;
    this.faceToward(hatchQueueSpot() ?? this.stand);
    this.say(PAY_LINES[Math.floor(Math.random() * PAY_LINES.length)]!);
    this.timer = 2.2 + Math.random() * 1.2;
  }

  /**
   * Walk them to a reserved pedalo and help them aboard. Fires `onDone` once
   * they're in.
   */
  public helpAboard(boatIndex: number, onDone: () => void): void {
    if (this.job === "hunt") return;
    // Drop a stuck help job so the queue doesn't jam.
    if (this.job === "toBoat" || this.job === "helping" || this.job === "back") {
      this.finishHelp();
    }
    this.helpBoat = boatIndex;
    this.helpDone = onDone;
    this.job = "toBoat";
    this.timer = 0;
    this.helpStuck = 0;
  }

  /**
   * Cleaner put a hire swan on the bottom — drop everything and come after them.
   */
  public huntPlayer(): void {
    this.helpDone = null;
    this.helpBoat = -1;
    this.job = "hunt";
    this.huntLeft = 26 + Math.random() * 8;
    this.swingsLanded = 0;
    this.swingReady = false;
    this.swingCool = 0.4;
    this.shoutIn = 0;
    this.say(MAD_LINES[Math.floor(Math.random() * MAD_LINES.length)]!);
  }

  public isBusy(): boolean {
    return this.job !== "idle" || this.timer > 0;
  }

  public isHunting(): boolean {
    return this.job === "hunt";
  }

  /** True once when a hunting boatman lands a dig. */
  public wantsSwing(): boolean {
    if (!this.swingReady) return false;
    this.swingReady = false;
    this.swingCool = 2.8;
    this.swingsLanded += 1;
    this.say(HUNT_LINES[Math.floor(Math.random() * HUNT_LINES.length)]!);
    if (this.swingsLanded >= 2) {
      this.huntLeft = Math.min(this.huntLeft, 1.5);
    }
    return true;
  }

  public update(delta: number, player?: THREE.Vector3): void {
    this.grumble =
      this.grumble?.update(delta, this.group.position) === false
        ? null
        : this.grumble;

    if (this.timer > 0) this.timer -= delta;
    if (this.swingCool > 0) this.swingCool -= delta;

    if (this.job === "hunt") {
      this.chase(delta, player);
      return;
    }

    if (this.job === "idle") {
      this.loiter(delta);
      return;
    }

    if (this.job === "toBoat") {
      const boat = pedaloWorldPos(this.helpBoat);
      if (!boat) {
        this.finishHelp();
        return;
      }
      // Meet them on dry bank by the hull — never aim into the water.
      const shore = nearestShore(boat.x, boat.z);
      const out = outwardAt(shore);
      const bank = new THREE.Vector3(
        shore.x + out.x * 1.55,
        0,
        shore.y + out.y * 1.55,
      );
      this.helpStuck += delta;
      if (this.walkToward(bank, delta, 3.2) || this.helpStuck > 5) {
        this.group.position.x = bank.x;
        this.group.position.z = bank.z;
        this.job = "helping";
        this.timer = 1.8;
        this.helpStuck = 0;
        this.say(HELP_LINES[Math.floor(Math.random() * HELP_LINES.length)]!);
        this.helpPose(true);
      }
      return;
    }

    if (this.job === "helping") {
      this.helpPose(true);
      if (this.timer <= 0) {
        this.finishHelp();
        this.job = "back";
        this.helpStuck = 0;
      }
      return;
    }

    if (this.job === "back") {
      this.helpPose(false);
      this.helpStuck += delta;
      if (this.walkToward(this.stand, delta, 2.6) || this.helpStuck > 8) {
        this.group.position.x = this.stand.x;
        this.group.position.z = this.stand.z;
        this.job = "idle";
        this.helpStuck = 0;
        this.group.rotation.y = this.faceHatch();
      }
    }
  }

  public dispose(): void {
    this.grumble?.dispose();
    this.scene.remove(this.group);
  }

  private chase(delta: number, player?: THREE.Vector3): void {
    this.huntLeft -= delta;
    this.helpPose(false);
    if (!player || this.huntLeft <= 0) {
      this.job = "back";
      this.swingReady = false;
      return;
    }

    this.shoutIn -= delta;
    if (this.shoutIn <= 0 && !this.grumble) {
      this.say(HUNT_LINES[Math.floor(Math.random() * HUNT_LINES.length)]!);
      this.shoutIn = 3.5 + Math.random() * 3;
    }

    // Stay on the bank — if they're still in the drink, run to the nearest lip.
    const target = this.huntTarget(player);
    const here = this.group.position;
    const gap = Math.hypot(target.x - here.x, target.z - here.z);
    const toPlayer = Math.hypot(player.x - here.x, player.z - here.z);
    this.faceToward(player);

    if (gap > 1.55) {
      this.walkToward(target, delta, 4.6);
      this.arms[0]!.rotation.x = -1.05;
      this.arms[1]!.rotation.x = -1.25;
      this.arms[0]!.rotation.z = 0.4;
      this.arms[1]!.rotation.z = -0.55;
      return;
    }

    // In range on dry land — wind up and swing.
    if (isInLake(player.x, player.z) && toPlayer > 2.2) {
      this.legs[0]!.rotation.x = 0;
      this.legs[1]!.rotation.x = 0;
      this.arms[0]!.rotation.x = -1.2;
      this.arms[1]!.rotation.x = -1.4;
      return;
    }

    this.legs[0]!.rotation.x = 0.2;
    this.legs[1]!.rotation.x = -0.35;
    this.arms[1]!.rotation.x = -2.1;
    this.arms[1]!.rotation.z = -0.95;
    this.arms[0]!.rotation.x = -0.7;
    this.arms[0]!.rotation.z = 0.35;
    this.group.rotation.x = -0.06;
    if (!this.swingReady && this.swingCool <= 0) {
      this.swingReady = true;
    }
  }

  /** Chase them on land; if they're swimming, meet them at the shore. */
  private huntTarget(player: THREE.Vector3): THREE.Vector3 {
    if (!isInLake(player.x, player.z)) return player;
    const shore = nearestShore(player.x, player.z);
    const out = outwardAt(shore);
    return new THREE.Vector3(
      shore.x + out.x * 1.4,
      0,
      shore.y + out.y * 1.4,
    );
  }

  private finishHelp(): void {
    const done = this.helpDone;
    this.helpDone = null;
    this.helpBoat = -1;
    done?.();
  }

  private loiter(delta: number): void {
    this.helpPose(false);
    this.chatIn -= delta;
    if (this.chatIn <= 0 && !this.grumble) {
      this.say(IDLE_LINES[Math.floor(Math.random() * IDLE_LINES.length)]!);
      this.chatIn = 22 + Math.random() * 35;
    }
    this.step += delta * 2.2;
    this.group.rotation.z = Math.sin(this.step) * 0.04;
    this.group.rotation.y = this.faceHatch() + Math.sin(this.step * 0.3) * 0.08;
  }

  private faceHatch(): number {
    const hatch = hatchQueueSpot();
    if (!hatch) return 0;
    return Math.atan2(
      hatch.x - this.group.position.x,
      hatch.z - this.group.position.z,
    );
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
    if (gap < 0.55) {
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
    // If blocking pinches movement, still creep toward the bank.
    const moved =
      Math.hypot(landed.x - here.x, landed.z - here.z) > step * 0.15;
    if (moved) {
      here.x = landed.x;
      here.z = landed.z;
    } else {
      here.x += (dx / gap) * step * 0.55;
      here.z += (dz / gap) * step * 0.55;
    }
    this.group.rotation.y = Math.atan2(dx, dz);
    this.step += delta * 10;
    const swing = Math.sin(this.step) * 0.55;
    this.legs[0]!.rotation.x = swing;
    this.legs[1]!.rotation.x = -swing;
    this.arms[0]!.rotation.x = -swing * 0.5;
    this.arms[1]!.rotation.x = swing * 0.5;
    return Math.hypot(at.x - here.x, at.z - here.z) < 0.55;
  }

  private helpPose(on: boolean): void {
    if (on) {
      this.arms[0]!.rotation.x = -1.1;
      this.arms[1]!.rotation.x = -0.9;
      this.arms[0]!.rotation.z = 0.35;
      this.arms[1]!.rotation.z = -0.2;
      this.legs[0]!.rotation.x = 0.15;
      this.legs[1]!.rotation.x = -0.1;
    } else {
      this.arms[0]!.rotation.x = 0;
      this.arms[1]!.rotation.x = 0;
      this.arms[0]!.rotation.z = 0.08;
      this.arms[1]!.rotation.z = -0.08;
      this.group.rotation.x = 0;
    }
  }

  private say(text: string): void {
    this.grumble?.dispose();
    this.grumble = new Grumble(
      this.scene,
      text,
      this.group.position.clone().add(new THREE.Vector3(0, 2.15, 0)),
    );
  }

  private build(): void {
    const skin = new THREE.MeshStandardMaterial({
      color: 0xd9a066,
      roughness: 0.9,
    });
    const jumper = new THREE.MeshStandardMaterial({
      color: 0x2f5d7a,
      roughness: 0.85,
    });
    const trousers = new THREE.MeshStandardMaterial({
      color: 0x3a3a42,
      roughness: 0.9,
    });
    const cap = new THREE.MeshStandardMaterial({
      color: 0xc94f3d,
      roughness: 0.8,
    });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.32), jumper);
    torso.position.y = 1.15;
    torso.castShadow = true;
    this.group.add(torso);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.32), skin);
    head.position.y = 1.72;
    this.group.add(head);

    const hat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.22, 0.14, 8),
      cap,
    );
    hat.position.y = 1.95;
    this.group.add(hat);
    const brim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.04, 8),
      cap,
    );
    brim.position.y = 1.88;
    this.group.add(brim);

    for (const side of [-1, 1]) {
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
  }
}
