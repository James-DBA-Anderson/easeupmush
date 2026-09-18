import * as THREE from "three";
import { getPlayPark, type PlayParkSite } from "../world/park";
import { BENCH_SEAT_H } from "../world/bench";
import { stepWalk } from "../world/blocking";
import { Face } from "./Face";
import { Grumble } from "../effects/Grumble";

const COATS = [0x2f4f7f, 0xd8452f, 0x3f6b4a, 0xe0b83c, 0x5a4a7a, 0xd8c8a0];
const ADULT_COATS = [0x2f4f7f, 0x8b3a3a, 0x3f6b4a, 0x5a4a7a, 0x2b2b33, 0xb06a2c];
const TROUSERS = [0x2b3038, 0x4a4a52, 0x3a5a6a, 0x6b5a44];
const SKIN = [0xf0c8a0, 0xd9a066, 0x8d5a3b, 0x5c3a26];

/** Adult hip pivot — sunk so parents sit on the bench, not above it. */
const PARENT_HIP_Y = 0.78;
const SIT_FORWARD = 0.08;
const APPROACH_FORWARD = 1.0;

const YELLS = [
  "WATCH THIS!",
  "MY TURN!",
  "HIGHER!",
  "RACE YOU!",
  "I'M KING OF THE SLIDE!",
  "NO PUSHING!",
  "AGAIN!",
];

const KID_WET = [
  "I'M SOAKED!",
  "MUM!",
  "DAD!",
  "IT'S COLD!",
  "STOP IT!",
  "MY JUMPER!",
];

const PARENT_MAD = [
  "OI — THAT'S MY KID!",
  "LEAVE THEM ALONE!",
  "WHAT DO YOU THINK YOU'RE DOING?!",
  "I'LL HAVE YOUR JOB!",
  "COME HERE YOU!",
  "DON'T YOU DARE!",
];

type Activity = "swing" | "slide" | "spring" | "run";
type Phase = "arriving" | "playing" | "leaving";
type ParentPhase = "arriving" | "waiting" | "chasing" | "leaving";
type ParentDuty = "gate" | "bench";

interface Body {
  group: THREE.Group;
  legs: THREE.Group[];
  arms: THREE.Group[];
  face: Face;
  step: number;
}

interface Kid extends Body {
  target: THREE.Vector3;
  exit: THREE.Vector3;
  phase: Phase;
  activity: Activity;
  timer: number;
  yellIn: number;
  /** Seconds of soggy stun after a hose blast. */
  soakStun: number;
  /** Waving at a helicopter overhead. */
  heliWave: number;
  heliWavePhase: number;
  heliWavedId: number;
}

interface Parent extends Body {
  target: THREE.Vector3;
  /** On-seat XZ when duty is bench; same as target for gate waiters. */
  seat: THREE.Vector3;
  exit: THREE.Vector3;
  phase: ParentPhase;
  duty: ParentDuty;
  /** Root Y while perched — sinks hips onto the slats. */
  sitY: number;
  faceYaw: number;
  chaseLeft: number;
  swingAnim: number;
  swingHit: boolean;
}

/**
 * A few kids walking in off the promenade to tear round the play park —
 * swings, slide, springy animal, chasing each other — then wandering off again.
 * Mum or dad comes with them and waits just inside the gate, or parks on a
 * bench along the fence.
 */
export class PlayVisit {
  private scene: THREE.Scene;
  private site: PlayParkSite;
  private kids: Kid[] = [];
  private parents: Parent[] = [];
  private packUp: number;
  private gone = false;
  private grumble: Grumble | null = null;
  private complained = false;
  private swingReady = false;
  private swingFrom = new THREE.Vector3();
  private chaseAt = new THREE.Vector3();
  private sprayTalkCool = 0;

  constructor(scene: THREE.Scene, site: PlayParkSite) {
    this.scene = scene;
    this.site = site;
    this.packUp = 160 + Math.random() * 200;

    const gate = site.gate;
    const approach = new THREE.Vector3(
      gate.x - gate.inwardX * 16,
      0,
      gate.z - gate.inwardZ * 16,
    );
    const exitBase = new THREE.Vector3(
      gate.x - gate.inwardX * 18,
      0,
      gate.z - gate.inwardZ * 18,
    );

    const party = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < party; i++) {
      const activity = this.pickActivity(i);
      const stand = this.worldSpot(this.spotFor(activity, i));
      const start = approach
        .clone()
        .add(
          new THREE.Vector3(
            gate.alongX * (i - (party - 1) / 2) * 1.1 +
              (Math.random() - 0.5) * 1.4,
            0,
            gate.alongZ * (i - (party - 1) / 2) * 1.1 +
              (Math.random() - 0.5) * 1.4,
          ),
        );
      const exit = exitBase
        .clone()
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 4,
            0,
            (Math.random() - 0.5) * 4,
          ),
        );
      this.kids.push(this.buildKid(start, stand, exit, activity));
    }

    const carerCount = party >= 3 && Math.random() < 0.45 ? 2 : 1;
    const benchPool = [...site.benches];
    for (let i = 0; i < carerCount; i++) {
      const start = approach
        .clone()
        .add(
          new THREE.Vector3(
            gate.alongX * ((i + 0.5) * 1.4 - 0.7) + (Math.random() - 0.5),
            0,
            gate.alongZ * ((i + 0.5) * 1.4 - 0.7) + (Math.random() - 0.5),
          ),
        );
      const exit = exitBase
        .clone()
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 3,
            0,
            (Math.random() - 0.5) * 3,
          ),
        );

      // Prefer a free bench; otherwise hang by the gate inside the rails.
      let duty: ParentDuty = "gate";
      let wait = new THREE.Vector3(
        gate.x + gate.alongX * (i - (carerCount - 1) / 2) * 1.35,
        0,
        gate.z + gate.alongZ * (i - (carerCount - 1) / 2) * 1.35,
      );
      let seat = wait.clone();
      let sitY = 0;
      let faceYaw = gate.yaw;

      const takeBench =
        benchPool.length > 0 && (i === 0 ? Math.random() < 0.62 : Math.random() < 0.5);
      if (takeBench) {
        const pick = Math.floor(Math.random() * benchPool.length);
        const bench = benchPool.splice(pick, 1)[0]!;
        duty = "bench";
        const alongX = Math.cos(bench.yaw);
        const alongZ = -Math.sin(bench.yaw);
        const faceX = Math.sin(bench.yaw);
        const faceZ = Math.cos(bench.yaw);
        const slot = (Math.random() - 0.5) * 0.7;
        // Walk up in front of the bench, then snap onto the slats.
        wait = new THREE.Vector3(
          bench.x + faceX * APPROACH_FORWARD + alongX * slot,
          0,
          bench.z + faceZ * APPROACH_FORWARD + alongZ * slot,
        );
        seat = new THREE.Vector3(
          bench.x + faceX * SIT_FORWARD + alongX * slot,
          0,
          bench.z + faceZ * SIT_FORWARD + alongZ * slot,
        );
        sitY = BENCH_SEAT_H - PARENT_HIP_Y + 0.02;
        faceYaw = bench.yaw;
      }

      this.parents.push(
        this.buildParent(start, wait, seat, exit, duty, sitY, faceYaw),
      );
    }
  }

  public guestPositions(): THREE.Vector3[] {
    return [
      ...this.kids.filter((k) => k.group.visible).map((k) => k.group.position.clone()),
      ...this.parents
        .filter((p) => p.group.visible)
        .map((p) => p.group.position.clone()),
    ];
  }

  public isDone(): boolean {
    return this.gone;
  }

  /** Evening — pack up and clear off home. */
  public sendHome(): void {
    this.packUp = Math.min(this.packUp, 0.2);
    for (const kid of this.kids) {
      if (kid.phase !== "leaving" && kid.group.visible) kid.phase = "leaving";
    }
    for (const parent of this.parents) {
      if (parent.phase !== "leaving" && parent.group.visible) {
        parent.phase = "leaving";
      }
    }
  }

  /** Did a droplet catch a kid on the kit, or a parent waiting? */
  public soakedBy(point: THREE.Vector3): boolean {
    for (const kid of this.kids) {
      if (!kid.group.visible || kid.phase === "leaving") continue;
      if (this.hitsBody(kid.group.position, point, 0.65, 1.6)) {
        this.lastHit = point.clone();
        return true;
      }
    }
    for (const parent of this.parents) {
      if (!parent.group.visible || parent.phase === "leaving") continue;
      const tall =
        parent.phase === "waiting" && parent.duty === "bench" ? 1.4 : 1.9;
      if (this.hitsBody(parent.group.position, point, 0.6, tall)) {
        this.lastHit = point.clone();
        return true;
      }
    }
    return false;
  }

  private hitsBody(
    at: THREE.Vector3,
    point: THREE.Vector3,
    radius: number,
    height: number,
  ): boolean {
    const dx = point.x - at.x;
    const dz = point.z - at.z;
    if (dx * dx + dz * dz > radius * radius) return false;
    return point.y > at.y - 0.2 && point.y < at.y + height;
  }

  /**
   * Hose on a play-park kid (or their mum/dad). Kids get soaked and shout;
   * parents come off the bench steaming and have a dig.
   * Returns true once for a complaint.
   */
  public drench(from?: THREE.Vector3): boolean {
    const blast = this.lastHit ?? from;
    if (!blast) return false;

    let hitKid = false;
    let hitParent = false;
    let nearestKid: Kid | null = null;
    let nearestGap = Infinity;

    for (const kid of this.kids) {
      if (!kid.group.visible || kid.phase === "leaving") continue;
      if (!this.hitsBody(kid.group.position, blast, 0.8, 1.75)) continue;
      hitKid = true;
      const gap = kid.group.position.distanceToSquared(blast);
      if (gap < nearestGap) {
        nearestGap = gap;
        nearestKid = kid;
      }
    }
    for (const parent of this.parents) {
      if (!parent.group.visible || parent.phase === "leaving") continue;
      if (!this.hitsBody(parent.group.position, blast, 0.75, 2)) continue;
      hitParent = true;
    }

    if (nearestKid) {
      nearestKid.soakStun = Math.max(nearestKid.soakStun, 1.5);
      nearestKid.face.setMood("shocked");
      nearestKid.group.rotation.x = 0.15;
      nearestKid.group.rotation.z = (Math.random() < 0.5 ? 1 : -1) * 0.4;
      nearestKid.arms[0]!.rotation.x = -1.6;
      nearestKid.arms[1]!.rotation.x = -1.6;
      if (this.sprayTalkCool <= 0) {
        this.say(nearestKid.group.position, KID_WET);
        this.sprayTalkCool = 1.8;
      }
    }

    if (hitKid || hitParent) {
      if (from) this.chaseAt.copy(from);
      else this.chaseAt.copy(blast);
      this.rileParents();
    }

    this.lastHit = null;
    if (!hitKid && !hitParent) return false;
    if (this.complained) return false;
    this.complained = true;
    return true;
  }

  private lastHit: THREE.Vector3 | null = null;

  private rileParents(): void {
    let any = false;
    for (const parent of this.parents) {
      if (!parent.group.visible || parent.phase === "leaving") continue;
      if (parent.phase === "chasing") {
        parent.chaseLeft = Math.max(parent.chaseLeft, 5.5);
        parent.face.setMood("angry");
        any = true;
        continue;
      }
      parent.phase = "chasing";
      parent.sitY = 0;
      parent.group.position.y = 0;
      parent.group.rotation.x = 0;
      parent.legs[0]!.rotation.set(0, 0, 0);
      parent.legs[1]!.rotation.set(0, 0, 0);
      parent.chaseLeft = 7 + Math.random() * 3;
      parent.swingAnim = 0;
      parent.swingHit = false;
      parent.face.setMood("angry");
      any = true;
    }
    if (any) {
      const mum = this.parents.find((p) => p.group.visible);
      if (mum && this.sprayTalkCool <= 0.5) {
        this.say(mum.group.position, PARENT_MAD);
        this.sprayTalkCool = 2.4;
      }
    }
  }

  /** True once when a raging parent lands a dig. */
  public wantsSwing(): boolean {
    if (!this.swingReady) return false;
    this.swingReady = false;
    return true;
  }

  /**
   * Chopper overhead — some of the kids drop the kit and wave up at it.
   */
  public noticeHelicopter(id: number, at: THREE.Vector3): void {
    for (const kid of this.kids) {
      if (!kid.group.visible || kid.phase === "leaving") continue;
      if (kid.soakStun > 0 || kid.heliWave > 0) continue;
      if (kid.heliWavedId === id) continue;
      const gap = Math.hypot(
        at.x - kid.group.position.x,
        at.z - kid.group.position.z,
      );
      if (gap > 130) continue;
      kid.heliWavedId = id;
      if (Math.random() > 0.65) continue;
      kid.heliWave = 5 + Math.random() * 2.5;
      kid.heliWavePhase = Math.random() * Math.PI * 2;
      kid.face.setMood("pleased");
      kid.group.rotation.y = Math.atan2(
        at.x - kid.group.position.x,
        at.z - kid.group.position.z,
      );
      if (Math.random() < 0.4) this.yell(kid);
    }
  }

  private poseHeliWave(kid: Kid, delta: number): void {
    kid.heliWavePhase += delta * 10;
    const wag = Math.sin(kid.heliWavePhase);
    kid.group.position.y = 0;
    kid.group.rotation.x = 0;
    kid.group.rotation.z = 0;
    kid.legs[0]!.rotation.x = 0.05;
    kid.legs[1]!.rotation.x = -0.05;
    kid.arms[0]!.rotation.set(-0.2, 0, 0.15);
    kid.arms[1]!.rotation.set(-2.45 + wag * 0.4, 0, -0.3);
    kid.face.setMood("pleased");
  }

  public getSwingFrom(): THREE.Vector3 {
    return this.swingFrom.clone();
  }

  private say(at: THREE.Vector3, lines: readonly string[]): void {
    this.grumble?.dispose();
    this.grumble = new Grumble(
      this.scene,
      lines[Math.floor(Math.random() * lines.length)]!,
      at,
    );
  }

  public update(delta: number, player?: THREE.Vector3): void {
    const anchor =
      this.kids[0]?.group.position ??
      this.parents[0]?.group.position ??
      new THREE.Vector3();
    this.grumble =
      this.grumble?.update(delta, anchor) === false ? null : this.grumble;
    if (this.sprayTalkCool > 0) this.sprayTalkCool -= delta;
    if (player) this.chaseAt.copy(player);

    let anyHere = false;
    let anyPlaying = false;
    const parentsRaging = this.parents.some((p) => p.phase === "chasing");

    for (const kid of this.kids) {
      kid.face.update(delta);

      if (kid.soakStun > 0) {
        kid.soakStun -= delta;
        anyHere = true;
        kid.face.setMood("shocked");
        const shiver = Math.sin(performance.now() / 50) * 0.08;
        kid.group.rotation.z = shiver + Math.sign(kid.group.rotation.z || 1) * 0.25;
        kid.arms[0]!.rotation.x = -1.5;
        kid.arms[1]!.rotation.x = -1.5;
        if (kid.soakStun <= 0) {
          kid.group.rotation.z = 0;
          kid.group.rotation.x = 0;
        }
        continue;
      }

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

      if (kid.heliWave > 0) {
        kid.heliWave -= delta;
        this.poseHeliWave(kid, delta);
        continue;
      }

      kid.timer -= delta;
      this.playPose(kid, delta);

      kid.yellIn -= delta;
      if (kid.yellIn <= 0) {
        kid.yellIn = 6 + Math.random() * 12;
        if (Math.random() < 0.45) this.yell(kid);
      }

      if (kid.timer > 0) continue;
      kid.activity = this.pickActivity(Math.floor(Math.random() * 4));
      kid.target = this.worldSpot(this.spotFor(kid.activity, 0));
      kid.timer = 7 + Math.random() * 12;
      kid.phase = "arriving";
    }

    for (const parent of this.parents) {
      parent.face.update(delta);

      if (parent.phase === "arriving") {
        if (this.amble(parent, parent.target, delta, 1.55) < 0.35) {
          parent.phase = "waiting";
          parent.group.position.x = parent.seat.x;
          parent.group.position.z = parent.seat.z;
          parent.group.position.y = parent.sitY;
          this.settleParent(parent);
        }
        anyHere = true;
        continue;
      }

      if (parent.phase === "chasing") {
        anyHere = true;
        this.chasePlayer(parent, delta);
        continue;
      }

      if (parent.phase === "leaving") {
        parent.sitY = 0;
        parent.group.rotation.x = 0;
        if (this.amble(parent, parent.exit, delta, 1.65) < 0.5) {
          parent.group.visible = false;
        } else {
          anyHere = true;
        }
        continue;
      }

      anyHere = true;
      this.waitPose(parent, delta);
    }

    // Hose scrap — pack the kids up once parents have had their dig / cooled off.
    if (parentsRaging && !this.parents.some((p) => p.phase === "chasing")) {
      for (const kid of this.kids) {
        if (kid.phase !== "leaving" && kid.group.visible) kid.phase = "leaving";
      }
    }

    if (anyPlaying && !parentsRaging) {
      this.packUp -= delta;
      if (this.packUp <= 0) {
        for (const kid of this.kids) {
          if (kid.phase !== "leaving") kid.phase = "leaving";
        }
        for (const parent of this.parents) {
          if (parent.phase !== "leaving") parent.phase = "leaving";
        }
      }
    }

    if (!anyHere) this.gone = true;
  }

  /** Off the bench / gate, flat out at the cleaner. */
  private chasePlayer(parent: Parent, delta: number): void {
    parent.chaseLeft -= delta;
    parent.face.setMood("angry");
    const here = parent.group.position;
    const to = this.chaseAt;
    const gap = Math.hypot(to.x - here.x, to.z - here.z);

    if (parent.chaseLeft <= 0) {
      parent.phase = "leaving";
      parent.swingAnim = 0;
      for (const kid of this.kids) {
        if (kid.phase !== "leaving" && kid.group.visible) kid.phase = "leaving";
      }
      return;
    }

    if (gap > 1.5) {
      parent.swingAnim = 0;
      parent.swingHit = false;
      this.amble(parent, to, delta, 4.8);
      parent.face.setMood("angry");
      parent.arms[0]!.rotation.x = -1.2;
      parent.arms[1]!.rotation.x = -1.5;
      return;
    }

    // In range — throw a punch.
    if (parent.swingAnim <= 0) {
      parent.swingAnim = 0.55;
      parent.swingHit = false;
    }
    parent.swingAnim = Math.max(0, parent.swingAnim - delta);
    const t = 1 - parent.swingAnim / 0.55;
    parent.group.rotation.y = Math.atan2(to.x - here.x, to.z - here.z);
    parent.group.position.y = 0;
    const wind = Math.sin(Math.min(1, t / 0.35) * Math.PI);
    const snap = t > 0.35 ? Math.sin(((t - 0.35) / 0.65) * Math.PI) : 0;
    parent.arms[1]!.rotation.x = -1.2 - wind * 0.5 - snap * 1.1;
    parent.arms[0]!.rotation.x = -0.6;
    parent.arms[1]!.rotation.z = -0.4 - snap * 0.3;
    if (!parent.swingHit && t >= 0.42) {
      parent.swingHit = true;
      this.swingReady = true;
      this.swingFrom.copy(here);
      this.say(here, PARENT_MAD);
      parent.chaseLeft = Math.min(parent.chaseLeft, 1.8);
    }
  }

  public dispose(): void {
    this.grumble?.dispose();
    for (const kid of this.kids) this.scene.remove(kid.group);
    for (const parent of this.parents) this.scene.remove(parent.group);
  }

  private pickActivity(i: number): Activity {
    const options: Activity[] = ["run"];
    if (this.site.swings.length > 0) options.push("swing");
    if (this.site.slide) options.push("slide");
    if (this.site.spring) options.push("spring");
    return options[i % options.length]!;
  }

  private spotFor(activity: Activity, i: number): { x: number; z: number } {
    if (activity === "swing" && this.site.swings.length > 0) {
      return this.site.swings[i % this.site.swings.length]!;
    }
    if (activity === "slide" && this.site.slide) return this.site.slide;
    if (activity === "spring" && this.site.spring) return this.site.spring;
    return this.site.run[i % this.site.run.length]!;
  }

  /** Activity spots are already world XZ. */
  private worldSpot(at: { x: number; z: number }): THREE.Vector3 {
    return new THREE.Vector3(at.x, 0, at.z);
  }

  private buildKid(
    start: THREE.Vector3,
    stand: THREE.Vector3,
    exit: THREE.Vector3,
    activity: Activity,
  ): Kid {
    const body = this.buildBody(start, stand, 0.72, COATS, true);
    return {
      ...body,
      target: stand,
      exit,
      phase: "arriving",
      activity,
      timer: 0,
      yellIn: 3 + Math.random() * 6,
      soakStun: 0,
      heliWave: 0,
      heliWavePhase: Math.random() * Math.PI * 2,
      heliWavedId: -1,
    };
  }

  private buildParent(
    start: THREE.Vector3,
    wait: THREE.Vector3,
    seat: THREE.Vector3,
    exit: THREE.Vector3,
    duty: ParentDuty,
    sitY: number,
    faceYaw: number,
  ): Parent {
    const body = this.buildBody(start, wait, 1, ADULT_COATS, false);
    return {
      ...body,
      target: wait,
      seat,
      exit,
      phase: "arriving",
      duty,
      sitY,
      faceYaw,
      chaseLeft: 0,
      swingAnim: 0,
      swingHit: false,
    };
  }

  private buildBody(
    start: THREE.Vector3,
    face: THREE.Vector3,
    scale: number,
    coats: number[],
    child: boolean,
  ): Body {
    const pick = <T>(list: readonly T[]): T =>
      list[Math.floor(Math.random() * list.length)]!;
    const coat = new THREE.MeshStandardMaterial({
      color: pick(coats),
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
    group.scale.setScalar(scale);
    group.rotation.y = Math.atan2(face.x - start.x, face.z - start.z);
    this.scene.add(group);

    const chestH = child ? 0.4 : 0.55;
    const chestY = child ? 0.95 : 1.15;
    const chest = new THREE.Mesh(
      new THREE.BoxGeometry(child ? 0.34 : 0.44, chestH, child ? 0.2 : 0.28),
      coat,
    );
    chest.position.y = chestY;
    chest.castShadow = true;
    group.add(chest);

    const head = new THREE.Group();
    head.position.y = child ? 1.28 : 1.58;
    group.add(head);
    const faceMesh = new Face(skin, child ? 0.85 : 1);
    head.add(faceMesh.group);

    const legs: THREE.Group[] = [];
    const arms: THREE.Group[] = [];
    for (const side of [-1, 1] as const) {
      const leg = new THREE.Group();
      leg.position.set(side * (child ? 0.09 : 0.12), child ? 0.72 : 0.78, 0);
      const thigh = new THREE.Mesh(
        new THREE.BoxGeometry(
          child ? 0.1 : 0.14,
          child ? 0.36 : 0.72,
          child ? 0.12 : 0.16,
        ),
        legMat,
      );
      thigh.geometry.translate(0, child ? -0.18 : -0.36, 0);
      thigh.castShadow = true;
      leg.add(thigh);
      const shoe = new THREE.Mesh(
        new THREE.BoxGeometry(child ? 0.1 : 0.14, 0.05, child ? 0.16 : 0.22),
        new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 1 }),
      );
      shoe.position.set(0, child ? -0.38 : -0.74, 0.02);
      leg.add(shoe);
      group.add(leg);
      legs.push(leg);

      const arm = new THREE.Group();
      arm.position.set(side * (child ? 0.2 : 0.28), child ? 1.1 : 1.35, 0);
      const upper = new THREE.Mesh(
        new THREE.BoxGeometry(
          child ? 0.08 : 0.12,
          child ? 0.32 : 0.52,
          child ? 0.08 : 0.12,
        ),
        coat,
      );
      upper.geometry.translate(0, child ? -0.16 : -0.26, 0);
      arm.add(upper);
      group.add(arm);
      arms.push(arm);
    }

    return {
      group,
      legs,
      arms,
      face: faceMesh,
      step: Math.random() * Math.PI * 2,
    };
  }

  private amble(
    body: Body,
    to: THREE.Vector3,
    delta: number,
    speed: number,
  ): number {
    const here = body.group.position;
    const gap = Math.hypot(to.x - here.x, to.z - here.z);
    if (gap < 0.05) return 0;
    const step = Math.min(gap, speed * delta);
    const dx = ((to.x - here.x) / gap) * step;
    const dz = ((to.z - here.z) / gap) * step;
    const landed = stepWalk(here.x, here.z, dx, dz, 0.35, {
      x: here.x,
      z: here.z,
    });
    here.x = landed.x;
    here.z = landed.z;
    body.group.rotation.x = 0;
    body.group.rotation.z = 0;
    body.group.rotation.y = Math.atan2(to.x - here.x, to.z - here.z);
    body.step += delta * speed * 5.2;
    const swing = Math.sin(body.step) * 0.7;
    body.legs[0]!.rotation.x = swing;
    body.legs[1]!.rotation.x = -swing;
    body.arms[0]!.rotation.x = -swing * 0.8;
    body.arms[1]!.rotation.x = swing * 0.8;
    body.group.position.y = Math.abs(Math.sin(body.step)) * 0.05;
    body.face.setMood("pleased");
    return Math.hypot(to.x - here.x, to.z - here.z);
  }

  private settleParent(parent: Parent): void {
    parent.group.position.x = parent.seat.x;
    parent.group.position.z = parent.seat.z;
    parent.group.position.y = parent.sitY;
    parent.group.rotation.set(
      parent.duty === "bench" ? -0.08 : 0,
      parent.faceYaw,
      0,
    );
    this.waitPose(parent, 0);
  }

  /** Stand by the gate fiddling with a phone, or perch on a bench. */
  private waitPose(parent: Parent, delta: number): void {
    parent.step += delta;
    parent.face.setMood(
      Math.sin(parent.step * 0.4) > 0.7 ? "shifty" : "idle",
    );

    const homeYaw = parent.faceYaw;

    let lookX = this.site.x;
    let lookZ = this.site.z;
    let best = Infinity;
    for (const kid of this.kids) {
      if (!kid.group.visible || kid.phase === "leaving") continue;
      const gap = kid.group.position.distanceTo(parent.group.position);
      if (gap < best) {
        best = gap;
        lookX = kid.group.position.x;
        lookZ = kid.group.position.z;
      }
    }

    let want = Math.atan2(
      lookX - parent.group.position.x,
      lookZ - parent.group.position.z,
    );
    if (parent.duty === "bench") {
      let off = want - homeYaw;
      while (off > Math.PI) off -= Math.PI * 2;
      while (off < -Math.PI) off += Math.PI * 2;
      want = homeYaw + THREE.MathUtils.clamp(off, -0.55, 0.55);
    }

    let turn = want - parent.group.rotation.y;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    parent.group.rotation.y += turn * Math.min(1, 2.2 * delta);

    if (parent.duty === "bench") {
      parent.group.position.x = parent.seat.x;
      parent.group.position.z = parent.seat.z;
      parent.group.position.y = parent.sitY;
      parent.group.rotation.x = -0.08;
      // Negative X = thighs forward off the seat (positive goes through the back).
      parent.legs[0]!.rotation.x = -1.25;
      parent.legs[1]!.rotation.x = -1.2;
      parent.legs[0]!.rotation.z = 0.08;
      parent.legs[1]!.rotation.z = -0.08;
      parent.arms[0]!.rotation.x = -0.55 + Math.sin(parent.step * 0.7) * 0.05;
      parent.arms[1]!.rotation.x = -0.35;
      parent.arms[0]!.rotation.z = 0.25;
      parent.arms[1]!.rotation.z = -0.15;
      return;
    }

    parent.group.position.y = 0;
    parent.group.rotation.x = 0;
    parent.legs[0]!.rotation.set(0.05, 0, 0.04);
    parent.legs[1]!.rotation.set(-0.04, 0, -0.04);
    parent.arms[0]!.rotation.x = -1.05;
    parent.arms[1]!.rotation.x = -0.85 + Math.sin(parent.step * 1.1) * 0.08;
    parent.arms[0]!.rotation.z = 0.45;
    parent.arms[1]!.rotation.z = -0.2;
    parent.group.rotation.z = Math.sin(parent.step * 0.35) * 0.02;
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
