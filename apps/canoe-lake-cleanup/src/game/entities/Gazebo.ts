import * as THREE from "three";
import { stepWalk } from "../world/blocking";
import { insidePark } from "../world/fence";
import {
  emptyRoute,
  gateOutside,
  nearestGate,
  routeAim,
  setRouteToward,
  type LoopRoute,
} from "../world/pathRoute";
import { Face } from "./Face";
import { Grumble } from "../effects/Grumble";
import { PATH_Y } from "../world/lake";
import { groundHeight } from "../world/terrain";

const COATS = [0x2f4f7f, 0x8b3a3a, 0x3f6b4a, 0x5a4a7a, 0x2b2b33, 0xb06a2c, 0xd8c8a0];
const TROUSERS = [0x2b3038, 0x4a4a52, 0x6b5a44, 0x3a5a6a];
const SKIN = [0xf0c8a0, 0xd9a066, 0x8d5a3b, 0x5c3a26];
const CANOPIES = [0xd8d2c4, 0xc45a4a, 0x3a6a8a, 0xe8c86a, 0x5a7a5a];

const CHAT = [
  "NICE BIT OF SHADE",
  "PASS US A DRINK",
  "BETTER THAN THE SUN",
  "WHO BROUGHT THE CHAIRS?",
  "THIS'LL DO",
  "KEEP THE WIND OFF",
  "CRACKING GAZEBO",
];

type Phase = "toGate" | "arriving" | "settled" | "toExit" | "leaving";

interface Guest {
  group: THREE.Group;
  legs: THREE.Group[];
  arms: THREE.Group[];
  face: Face;
  stand: THREE.Vector3;
  gate: THREE.Vector3;
  exit: THREE.Vector3;
  phase: Phase;
  route: LoopRoute;
  step: number;
  chatIn: number;
}

/**
 * A pop-up gazebo on the east lawn — folk walk in, put the canopy up, stand
 * about in the shade for a stretch, then take it down again.
 */
export class Gazebo {
  private scene: THREE.Scene;
  private root = new THREE.Group();
  private frame!: THREE.Group;
  private guests: Guest[] = [];
  private linger: number;
  private settled = false;
  private gone = false;
  private grumble: Grumble | null = null;
  private spot: THREE.Vector3;
  private yaw: number;

  constructor(scene: THREE.Scene, at: THREE.Vector2) {
    this.scene = scene;
    this.spot = new THREE.Vector3(at.x, 0, at.y);
    this.yaw = Math.random() * Math.PI * 2;
    this.linger = 200 + Math.random() * 240;

    this.root.position.copy(this.spot);
    this.root.rotation.y = this.yaw;
    this.buildFrame();
    this.frame.visible = false;
    this.root.add(this.frame);
    scene.add(this.root);

    const party = 2 + Math.floor(Math.random() * 3);
    const gatePt = nearestGate(this.spot.x, this.spot.z);
    const approach = gateOutside(gatePt, 9);
    const leaveAt = gateOutside(gatePt, 12);
    const gate = new THREE.Vector3(gatePt.x, 0, gatePt.y);
    for (let i = 0; i < party; i++) {
      const ang = this.yaw + (i / party) * Math.PI * 2 + Math.random() * 0.4;
      const rad = 0.7 + Math.random() * 0.55;
      const stand = new THREE.Vector3(
        this.spot.x + Math.cos(ang) * rad,
        0,
        this.spot.z + Math.sin(ang) * rad,
      );
      const start = new THREE.Vector3(
        approach.x + (Math.random() - 0.5) * 3,
        0,
        approach.y + (Math.random() - 0.5) * 3,
      );
      const exit = new THREE.Vector3(
        leaveAt.x + (Math.random() - 0.5) * 3,
        0,
        leaveAt.y + (Math.random() - 0.5) * 3,
      );
      this.guests.push(this.buildGuest(start, stand, gate, exit));
    }
  }

  public getPosition(): THREE.Vector3 {
    return this.spot.clone();
  }

  public guestPositions(): THREE.Vector3[] {
    return this.guests.map((g) => g.group.position.clone());
  }

  public isDone(): boolean {
    return this.gone;
  }

  public update(delta: number): void {
    this.grumble =
      this.grumble?.update(delta, this.spot) === false ? null : this.grumble;

    let anyHere = false;
    let anySettled = false;

    for (const guest of this.guests) {
      guest.face.update(delta);

      if (guest.phase === "toGate") {
        const gap = this.amble(guest, guest.gate, delta, 1.4);
        const here = guest.group.position;
        if (gap < 1.1 || insidePark(here.x, here.z)) {
          guest.phase = "arriving";
          setRouteToward(
            guest.route,
            here.x,
            here.z,
            guest.stand.x,
            guest.stand.z,
          );
        }
        anyHere = true;
        continue;
      }

      if (guest.phase === "arriving") {
        if (this.walkRouted(guest, guest.stand, delta, 1.4, 12) < 0.35) {
          guest.phase = "settled";
          guest.route.ready = false;
          guest.group.position.copy(guest.stand);
          guest.group.position.y = PATH_Y + groundHeight(guest.stand.x, guest.stand.z);
          this.idlePose(guest);
          this.faceIn(guest);
          this.frame.visible = true;
          this.settled = true;
        }
        anyHere = true;
        continue;
      }

      if (guest.phase === "toExit") {
        if (this.walkRouted(guest, guest.gate, delta, 1.5, 10) < 1.2) {
          guest.phase = "leaving";
          guest.route.ready = false;
        }
        anyHere = true;
        continue;
      }

      if (guest.phase === "leaving") {
        if (this.amble(guest, guest.exit, delta, 1.5) < 0.5) {
          guest.group.visible = false;
        } else {
          anyHere = true;
        }
        continue;
      }

      anyHere = true;
      anySettled = true;
      this.faceIn(guest);
      this.chatPose(guest, delta);
      guest.chatIn -= delta;
      if (guest.chatIn <= 0) {
        guest.chatIn = 9 + Math.random() * 16;
        if (Math.random() < 0.5) this.say(guest, CHAT);
      }
    }

    if (this.settled && anySettled) {
      this.linger -= delta;
      if (this.linger <= 0) this.startLeaving();
    }

    if (
      !anyHere &&
      this.guests.every(
        (g) =>
          g.phase === "leaving" ||
          g.phase === "toExit" ||
          !g.group.visible,
      )
    ) {
      this.gone = true;
    }
  }

  public dispose(): void {
    this.grumble?.dispose();
    for (const guest of this.guests) this.scene.remove(guest.group);
    this.scene.remove(this.root);
  }

  private startLeaving(): void {
    this.settled = false;
    this.frame.visible = false;
    for (const guest of this.guests) {
      if (guest.phase === "toExit" || guest.phase === "leaving") continue;
      guest.phase = "toExit";
      const here = guest.group.position;
      setRouteToward(guest.route, here.x, here.z, guest.gate.x, guest.gate.z);
    }
  }

  private buildFrame(): void {
    this.frame = new THREE.Group();
    const pick = <T>(list: readonly T[]): T =>
      list[Math.floor(Math.random() * list.length)]!;

    const metal = new THREE.MeshStandardMaterial({
      color: 0x8a9098,
      roughness: 0.45,
      metalness: 0.55,
    });
    const cloth = new THREE.MeshStandardMaterial({
      color: pick(CANOPIES),
      roughness: 0.95,
      side: THREE.DoubleSide,
    });

    const half = 1.45;
    const height = 2.15;
    const corners: [number, number][] = [
      [-half, -half],
      [half, -half],
      [half, half],
      [-half, half],
    ];

    for (const [x, z] of corners) {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.04, height, 6),
        metal,
      );
      pole.position.set(x, height / 2, z);
      pole.castShadow = true;
      this.frame.add(pole);
    }

    // Flat top with a slight peak so it reads as a gazebo roof.
    const roof = new THREE.Mesh(new THREE.BoxGeometry(half * 2.15, 0.04, half * 2.15), cloth);
    roof.position.y = height;
    roof.castShadow = true;
    roof.receiveShadow = true;
    this.frame.add(roof);

    const peak = new THREE.Mesh(
      new THREE.ConeGeometry(half * 0.55, 0.35, 4),
      cloth,
    );
    peak.position.y = height + 0.2;
    peak.rotation.y = Math.PI / 4;
    peak.castShadow = true;
    this.frame.add(peak);

    // One open side wall of fabric for a bit of wind cover.
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(half * 2.05, height * 0.72),
      cloth,
    );
    wall.position.set(0, height * 0.42, -half);
    wall.castShadow = true;
    this.frame.add(wall);

    // Folding table + a couple of chairs under the canopy.
    const wood = new THREE.MeshStandardMaterial({
      color: 0x6a5438,
      roughness: 0.9,
    });
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 0.55), wood);
    top.position.set(0.15, 0.72, 0.1);
    top.castShadow = true;
    this.frame.add(top);
    for (const x of [-0.45, 0.45] as const) {
      for (const z of [-0.2, 0.2] as const) {
        const leg = new THREE.Mesh(
          new THREE.CylinderGeometry(0.025, 0.025, 0.7, 5),
          metal,
        );
        leg.position.set(0.15 + x, 0.35, 0.1 + z);
        this.frame.add(leg);
      }
    }

    for (const [x, z, yaw] of [
      [-0.85, 0.35, 0.6],
      [0.95, -0.2, -1.1],
    ] as const) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.04, 0.38), wood);
      seat.position.set(x, 0.42, z);
      seat.rotation.y = yaw;
      seat.castShadow = true;
      this.frame.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.4, 0.04), wood);
      back.position.set(x, 0.62, z);
      back.rotation.y = yaw;
      back.translateZ(-0.17);
      this.frame.add(back);
    }
  }

  private buildGuest(
    start: THREE.Vector3,
    stand: THREE.Vector3,
    gate: THREE.Vector3,
    exit: THREE.Vector3,
  ): Guest {
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
    group.position.y = PATH_Y + groundHeight(start.x, start.z);
    group.rotation.y = Math.atan2(gate.x - start.x, gate.z - start.z);
    this.scene.add(group);

    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.22), legMat);
    hips.position.y = 0.92;
    hips.castShadow = true;
    group.add(hips);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.24), coat);
    torso.position.y = 1.28;
    torso.castShadow = true;
    group.add(torso);

    const head = new THREE.Group();
    head.position.y = 1.68;
    group.add(head);
    const face = new Face(skin);
    head.add(face.group);

    const legs: THREE.Group[] = [];
    const arms: THREE.Group[] = [];
    for (const side of [-1, 1] as const) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.11, 0.92, 0);
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

    return {
      group,
      legs,
      arms,
      face,
      stand,
      gate,
      exit,
      phase: "toGate",
      route: emptyRoute(),
      step: Math.random() * Math.PI * 2,
      chatIn: 4 + Math.random() * 10,
    };
  }

  private walkRouted(
    guest: Guest,
    to: THREE.Vector3,
    delta: number,
    speed: number,
    peelAt: number,
  ): number {
    const here = guest.group.position;
    const aim = routeAim(
      guest.route,
      here.x,
      here.z,
      to.x,
      to.z,
      peelAt,
    );
    if (aim) {
      this.amble(guest, new THREE.Vector3(aim.x, 0, aim.y), delta, speed);
      return Math.hypot(to.x - here.x, to.z - here.z);
    }
    return this.amble(guest, to, delta, speed);
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
    guest.group.position.y =
      PATH_Y +
      groundHeight(here.x, here.z) +
      Math.abs(Math.sin(guest.step)) * 0.04;
    guest.face.setMood("idle");
    return Math.hypot(to.x - here.x, to.z - here.z);
  }

  private faceIn(guest: Guest): void {
    guest.group.rotation.y = Math.atan2(
      this.spot.x - guest.group.position.x,
      this.spot.z - guest.group.position.z,
    );
  }

  private idlePose(guest: Guest): void {
    guest.legs[0]!.rotation.x = 0.05;
    guest.legs[1]!.rotation.x = -0.05;
    guest.arms[0]!.rotation.x = 0.12;
    guest.arms[1]!.rotation.x = 0.12;
    guest.arms[0]!.rotation.z = 0;
    guest.arms[1]!.rotation.z = 0;
    guest.face.setMood("pleased");
  }

  private chatPose(guest: Guest, delta: number): void {
    guest.step += delta;
    guest.legs[0]!.rotation.x = 0.06;
    guest.legs[1]!.rotation.x = -0.05;
    guest.arms[0]!.rotation.x = 0.1 + Math.sin(guest.step * 1.4) * 0.12;
    guest.arms[1]!.rotation.x = 0.15 + Math.sin(guest.step * 1.1 + 1) * 0.1;
    guest.face.setMood("pleased");
  }

  private say(guest: Guest, lines: readonly string[]): void {
    this.grumble?.dispose();
    const line = lines[Math.floor(Math.random() * lines.length)]!;
    const at = guest.group.position.clone();
    at.y = 2.1;
    this.grumble = new Grumble(this.scene, line, at);
  }
}
