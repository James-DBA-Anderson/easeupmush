import * as THREE from "three";
import { parkGates } from "../world/fence";
import { stepWalk } from "../world/blocking";
import { groundHeight } from "../world/terrain";
import { Face } from "./Face";

const KID_COATS = [
  0xc45a4a, 0x3a6a9a, 0x3f7a4a, 0xd4a03a, 0x6a4a8a, 0x2b2b33, 0xd8c8a0, 0xe07040,
];
const JUMPERS = [0xc45a4a, 0x2f4f7f, 0x3f6b4a, 0xb06a2c, 0x5a4a7a, 0xd8c8a0];
const TROUSERS = [0x2b3038, 0x4a4a52, 0x1a3a6a, 0x6b5a44];
const SKIN = [0xf0c8a0, 0xd9a066, 0x8d5a3b, 0x5c3a26];

const HALF_LEN = 9.5;
const HALF_WIDE = 5.5;

type Phase = "arriving" | "playing" | "leaving";

interface Kid {
  group: THREE.Group;
  legs: THREE.Group[];
  arms: THREE.Group[];
  face: Face;
  home: THREE.Vector3;
  exit: THREE.Vector3;
  phase: Phase;
  step: number;
  /** Side of the pitch they favour (−1 / +1 along the length). */
  side: number;
  chaseIn: number;
  kickLeft: number;
}

/**
 * Kids having a kickabout on the big east green — jumpers for goalposts,
 * lunchtime through the afternoon while it's dry.
 */
export class FootballKickabout {
  private scene: THREE.Scene;
  private root = new THREE.Group();
  private kids: Kid[] = [];
  private ball!: THREE.Mesh;
  private ballVel = new THREE.Vector3();
  private ballTarget = new THREE.Vector3();
  private pitchYaw: number;
  private spot: THREE.Vector3;
  private linger: number;
  private age = 0;
  private gone = false;
  private playing = false;
  private tmp = new THREE.Vector3();
  private along = new THREE.Vector3();
  private across = new THREE.Vector3();

  constructor(scene: THREE.Scene, at: THREE.Vector2) {
    this.scene = scene;
    this.spot = new THREE.Vector3(at.x, 0, at.y);
    this.pitchYaw = Math.random() * Math.PI * 2;
    this.linger = 140 + Math.random() * 180;
    this.along.set(Math.sin(this.pitchYaw), 0, Math.cos(this.pitchYaw));
    this.across.set(this.along.z, 0, -this.along.x);

    this.root.position.copy(this.spot);
    this.root.position.y = groundHeight(at.x, at.y);
    scene.add(this.root);

    this.layJumpers();
    this.ball = this.makeBall();
    this.root.add(this.ball);

    const n = 4 + Math.floor(Math.random() * 3);
    const gate = this.pickGate();
    for (let i = 0; i < n; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const slot = (Math.floor(i / 2) + 0.5) / Math.ceil(n / 2) - 0.5;
      const home = this.worldAt(
        side * (HALF_LEN * 0.35 + Math.random() * 2.5),
        slot * HALF_WIDE * 1.4 + (Math.random() - 0.5) * 1.5,
      );
      const start = gate
        .clone()
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 8,
            0,
            (Math.random() - 0.5) * 8,
          ),
        );
      const exit = gate
        .clone()
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 12,
            0,
            (Math.random() - 0.5) * 12,
          ),
        );
      this.kids.push(this.buildKid(start, home, exit, side));
    }

    this.ball.position.copy(this.localAt(0, 0));
    this.ball.position.y = 0.12;
    this.ballTarget.copy(this.ball.position);
  }

  public getPosition(): THREE.Vector3 {
    return this.spot.clone();
  }

  public guestPositions(): THREE.Vector3[] {
    return this.kids.map((k) => k.group.position.clone());
  }

  public isDone(): boolean {
    return this.gone;
  }

  public update(delta: number): void {
    if (this.gone) return;
    this.age += delta;

    let anyHere = false;
    let allPlaying = true;

    for (const kid of this.kids) {
      kid.face.update(delta);
      if (kid.phase === "arriving") {
        allPlaying = false;
        if (this.amble(kid, kid.home, delta, 2.1) < 0.35) {
          kid.phase = "playing";
          kid.group.position.copy(kid.home);
          kid.chaseIn = 0.2 + Math.random() * 0.8;
        }
      } else if (kid.phase === "playing") {
        anyHere = true;
        this.playKid(kid, delta);
      } else {
        allPlaying = false;
        if (this.amble(kid, kid.exit, delta, 2.0) < 0.5) {
          this.scene.remove(kid.group);
        } else {
          anyHere = true;
        }
      }
    }

    this.kids = this.kids.filter((k) => k.phase !== "leaving" || k.group.parent);

    if (!this.playing && allPlaying && this.kids.length > 0) {
      this.playing = true;
    }

    if (this.playing) {
      this.linger -= delta;
      this.tickBall(delta);
      if (this.linger <= 0) this.sendHome();
    }

    if (this.playing && this.kids.length === 0) {
      this.dispose();
      this.gone = true;
      return;
    }

    // Still arriving — nothing else.
    if (!this.playing && !anyHere && this.age > 2) {
      // Everyone somehow vanished.
      this.dispose();
      this.gone = true;
    }
  }

  public dispose(): void {
    for (const kid of this.kids) this.scene.remove(kid.group);
    this.kids = [];
    if (this.root.parent) this.scene.remove(this.root);
    this.gone = true;
  }

  private sendHome(): void {
    for (const kid of this.kids) {
      if (kid.phase === "leaving") continue;
      kid.phase = "leaving";
      kid.kickLeft = 0;
      for (const leg of kid.legs) leg.rotation.x = 0;
      for (const arm of kid.arms) arm.rotation.x = 0;
    }
    this.playing = false;
    // Leave the jumpers and ball for a beat, then clear with the last kid.
  }

  private playKid(kid: Kid, delta: number): void {
    kid.chaseIn -= delta;
    kid.kickLeft = Math.max(0, kid.kickLeft - delta);

    const ballWorld = this.tmp
      .copy(this.ball.position)
      .applyMatrix4(this.root.matrixWorld);
    ballWorld.y = 0;

    if (kid.chaseIn <= 0) {
      // Pick a loose spot toward the ball on their half.
      const toBall = ballWorld.clone().sub(kid.group.position);
      toBall.y = 0;
      if (toBall.lengthSq() < 0.01) toBall.copy(this.across);
      toBall.normalize();
      const scatter = this.across
        .clone()
        .multiplyScalar((Math.random() - 0.5) * 3.5);
      kid.home
        .copy(ballWorld)
        .addScaledVector(toBall, -1.2 - Math.random() * 1.4)
        .add(scatter);
      // Keep roughly on the pitch.
      this.clampToPitch(kid.home);
      kid.chaseIn = 1.4 + Math.random() * 2.2;
    }

    const gap = this.amble(kid, kid.home, delta, 2.6);
    if (gap < 1.1 && kid.kickLeft <= 0) {
      const toward = ballWorld.clone().sub(kid.group.position);
      toward.y = 0;
      if (toward.lengthSq() > 0.2) {
        kid.group.rotation.y = Math.atan2(toward.x, toward.z);
      }
      // Boot it toward the far goal or a teammate.
      const aimGoal = Math.random() < 0.45;
      if (aimGoal) {
        const goal = this.worldAt(-kid.side * HALF_LEN, (Math.random() - 0.5) * 2.2);
        this.kickBall(ballWorld, goal, 7 + Math.random() * 4);
      } else {
        const other = this.kids[Math.floor(Math.random() * this.kids.length)]!;
        this.kickBall(ballWorld, other.group.position, 5 + Math.random() * 3);
      }
      kid.kickLeft = 0.35;
      kid.legs[1]!.rotation.x = -1.1;
    }

    if (kid.kickLeft > 0) {
      kid.legs[1]!.rotation.x = -1.1 * (kid.kickLeft / 0.35);
    }
  }

  private kickBall(from: THREE.Vector3, to: THREE.Vector3, speed: number): void {
    const localFrom = this.root.worldToLocal(from.clone());
    const localTo = this.root.worldToLocal(to.clone());
    localFrom.y = 0.12;
    localTo.y = 0.12;
    this.ball.position.copy(localFrom);
    this.ballVel.subVectors(localTo, localFrom).setY(0);
    if (this.ballVel.lengthSq() < 0.01) {
      this.ballVel.set(kidSign() * speed, 0, 0);
    } else {
      this.ballVel.normalize().multiplyScalar(speed);
    }
    this.ballVel.y = 2.2 + Math.random() * 1.4;
    this.ballTarget.copy(localTo);
  }

  private tickBall(delta: number): void {
    this.ballVel.y -= 14 * delta;
    this.ball.position.addScaledVector(this.ballVel, delta);
    if (this.ball.position.y < 0.12) {
      this.ball.position.y = 0.12;
      this.ballVel.y *= -0.35;
      this.ballVel.x *= 0.92;
      this.ballVel.z *= 0.92;
      if (Math.abs(this.ballVel.y) < 0.4) this.ballVel.y = 0;
    }
    // Soft bounds — bounce back onto the green.
    if (Math.abs(this.ball.position.x) > HALF_LEN + 1.5) {
      this.ballVel.x *= -0.6;
      this.ball.position.x = Math.sign(this.ball.position.x) * (HALF_LEN + 1.5);
    }
    if (Math.abs(this.ball.position.z) > HALF_WIDE + 2) {
      this.ballVel.z *= -0.6;
      this.ball.position.z = Math.sign(this.ball.position.z) * (HALF_WIDE + 2);
    }
    // Spin for a bit of life.
    this.ball.rotation.x += this.ballVel.z * delta * 0.4;
    this.ball.rotation.z -= this.ballVel.x * delta * 0.4;
  }

  private clampToPitch(p: THREE.Vector3): void {
    const local = this.root.worldToLocal(p.clone());
    local.x = THREE.MathUtils.clamp(local.x, -HALF_LEN + 0.8, HALF_LEN - 0.8);
    local.z = THREE.MathUtils.clamp(local.z, -HALF_WIDE + 0.5, HALF_WIDE - 0.5);
    local.y = 0;
    p.copy(this.root.localToWorld(local));
    p.y = 0;
  }

  private amble(
    kid: Kid,
    to: THREE.Vector3,
    delta: number,
    speed: number,
  ): number {
    const here = kid.group.position;
    const dx = to.x - here.x;
    const dz = to.z - here.z;
    const gap = Math.hypot(dx, dz);
    if (gap < 0.05) return gap;
    const step = Math.min(gap, speed * delta);
    const moved = stepWalk(here.x, here.z, (dx / gap) * step, (dz / gap) * step, 0.35);
    here.x = moved.x;
    here.z = moved.z;
    here.y = groundHeight(here.x, here.z);
    kid.group.rotation.y = Math.atan2(dx, dz);
    kid.step += delta * speed * 5.2;
    const swing = Math.sin(kid.step) * 0.55;
    if (kid.kickLeft <= 0) {
      kid.legs[0]!.rotation.x = swing;
      kid.legs[1]!.rotation.x = -swing;
    }
    kid.arms[0]!.rotation.x = -swing * 0.7;
    kid.arms[1]!.rotation.x = swing * 0.7;
    return Math.hypot(to.x - here.x, to.z - here.z);
  }

  private worldAt(along: number, across: number): THREE.Vector3 {
    return new THREE.Vector3(
      this.spot.x + this.along.x * along + this.across.x * across,
      0,
      this.spot.z + this.along.z * along + this.across.z * across,
    );
  }

  private localAt(along: number, across: number): THREE.Vector3 {
    // Root is at spot facing identity; we rotate root to pitchYaw so local X = along.
    return new THREE.Vector3(along, 0.12, across);
  }

  private layJumpers(): void {
    // Align root so local +X runs the pitch length.
    this.root.rotation.y = this.pitchYaw;

    for (const end of [-1, 1] as const) {
      for (const post of [-1, 1] as const) {
        const jumper = this.makeJumper();
        jumper.position.set(end * HALF_LEN, 0.04, post * 1.55);
        jumper.rotation.y = (Math.random() - 0.5) * 0.8;
        this.root.add(jumper);
      }
    }
  }

  /** A folded school jumper on the grass — classic goalpost. */
  private makeJumper(): THREE.Group {
    const color = JUMPERS[Math.floor(Math.random() * JUMPERS.length)]!;
    const wool = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.95,
    });
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.36), wool);
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    // Sleeves flopped out.
    for (const side of [-1, 1] as const) {
      const sleeve = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.05, 0.14),
        wool,
      );
      sleeve.position.set(side * 0.28, 0.01, 0.02);
      sleeve.rotation.y = side * 0.35;
      g.add(sleeve);
    }
    // Collar hint.
    const collar = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.04, 0.1),
      new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.9 }),
    );
    collar.position.set(0, 0.04, -0.12);
    g.add(collar);
    return g;
  }

  private makeBall(): THREE.Mesh {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xe8e8e8,
      roughness: 0.7,
    });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), mat);
    ball.castShadow = true;
    // Dark panels — cheap football look.
    const panel = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.85,
    });
    for (let i = 0; i < 4; i++) {
      const patch = new THREE.Mesh(new THREE.SphereGeometry(0.121, 6, 4), panel);
      patch.scale.set(0.35, 0.55, 0.35);
      patch.rotation.y = (i / 4) * Math.PI * 2;
      patch.rotation.z = 0.4;
      ball.add(patch);
    }
    return ball;
  }

  private buildKid(
    start: THREE.Vector3,
    home: THREE.Vector3,
    exit: THREE.Vector3,
    side: number,
  ): Kid {
    const pick = <T>(list: readonly T[]): T =>
      list[Math.floor(Math.random() * list.length)]!;
    const coat = new THREE.MeshStandardMaterial({
      color: pick(KID_COATS),
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
    group.position.y = groundHeight(start.x, start.z);
    group.rotation.y = Math.atan2(home.x - start.x, home.z - start.z);
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
    for (const s of [-1, 1] as const) {
      const leg = new THREE.Group();
      leg.position.set(s * 0.09, 0.72, 0);
      const thigh = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.36, 0.12),
        legMat,
      );
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
      arm.position.set(s * 0.2, 1.1, 0);
      const upper = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.32, 0.08),
        coat,
      );
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
      home: home.clone(),
      exit: exit.clone(),
      phase: "arriving",
      step: Math.random() * Math.PI * 2,
      side,
      chaseIn: 0,
      kickLeft: 0,
    };
  }

  private pickGate(): THREE.Vector3 {
    const gates = parkGates();
    if (gates.length === 0) {
      return this.spot.clone().add(new THREE.Vector3(20, 0, 20));
    }
    let best = gates[0]!;
    let bestD = Infinity;
    for (const g of gates) {
      const d = g.distanceToSquared(new THREE.Vector2(this.spot.x, this.spot.z));
      if (d < bestD) {
        bestD = d;
        best = g;
      }
    }
    return new THREE.Vector3(best.x, 0, best.y);
  }
}

function kidSign(): number {
  return Math.random() < 0.5 ? -1 : 1;
}
