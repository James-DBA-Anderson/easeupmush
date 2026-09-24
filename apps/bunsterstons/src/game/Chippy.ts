import * as THREE from "three";
import { Character } from "./Character";

/**
 * Chippy — fat stumpy sausage: head, white, yellow, black in equal quarters.
 * Climbs gates. Even-numbered levels.
 */
/** Extra width / squat — length is in the capsule itself. */
const BODY_SX = 1.18;
const BODY_SY = 0.92;
const BODY_SZ = 1;
const SAUSAGE_R = 0.4;
const SAUSAGE_CYL = 0.14;

export class Chippy extends Character {
  protected readonly radius = 0.48;
  protected readonly height = 0.72;

  private ears: THREE.Group[] = [];
  /** Legs order: front-left, front-right, back-left, back-right. */
  private legs: THREE.Group[] = [];
  private body!: THREE.Mesh;
  private head!: THREE.Group;
  private snoot!: THREE.Mesh;
  private mouth!: THREE.Mesh;

  protected get canClimb(): boolean {
    return true;
  }

  constructor() {
    super();
    this.finishSetup();
  }

  protected animate(
    _delta: number,
    moving: boolean,
    sprint: boolean,
    bored: boolean,
  ): void {
    const t = this.hopPhase;
    if (this.attackTimer > 0) {
      this.poseAttack(1 - this.attackTimer / 0.42);
      return;
    }
    if (this.climbing) {
      this.poseClimb(t, moving);
      return;
    }
    if (!this.onGround) {
      this.poseJump();
      return;
    }
    if (this.edgeAmount > 0.28) {
      this.poseBalance(this.balancePhase, this.edgeAmount);
      return;
    }
    if (moving) {
      this.poseRun(t, sprint ? 1.25 : 1);
      return;
    }
    if (bored) {
      this.poseBored(this.boredPhase);
      return;
    }
    this.poseIdle(t);
  }

  /** Headbutt — coils back then lunges the snout forward. */
  private poseAttack(progress: number): void {
    const wind = progress < 0.35 ? progress / 0.35 : 0;
    const strike =
      progress >= 0.35 && progress < 0.7
        ? (progress - 0.35) / 0.35
        : progress >= 0.7
          ? 1 - (progress - 0.7) / 0.3
          : 0;
    const coil = wind * (1 - strike);

    this.root.position.y = 0;
    this.root.position.z = -0.08 * coil + 0.18 * strike;
    this.root.rotation.x = 0;
    this.root.rotation.z = 0;
    this.body.rotation.x = 0.25 * coil - 0.55 * strike;
    this.body.rotation.z = 0;
    this.setBodyScale(1 + strike * 0.06, 1, 1 + coil * 0.05);

    this.head.rotation.x = 0.35 * coil - 0.75 * strike;
    this.head.rotation.y = 0;
    this.head.rotation.z = Math.sin(progress * Math.PI * 2) * 0.08;
    this.snoot.scale.setScalar(1 + strike * 0.15);
    this.mouth.scale.set(1, 1.15 + strike * 0.35, 1);
    this.wiggleEars(0.1 + strike * 0.35);

    this.legs[0]!.rotation.x = -0.4 - strike * 0.5;
    this.legs[1]!.rotation.x = -0.4 - strike * 0.5;
    this.legs[0]!.position.set(-0.22, -0.1, 0.22);
    this.legs[1]!.position.set(0.22, -0.1, 0.22);
    this.legs[2]!.rotation.x = 0.35 + coil * 0.4;
    this.legs[3]!.rotation.x = 0.35 + coil * 0.4;
    this.legs[2]!.position.set(-0.24, -0.14, -0.26);
    this.legs[3]!.position.set(0.24, -0.14, -0.26);
  }

  /** Scramble up the bars — body vertical, belly to the gate, head up. */
  private poseClimb(t: number, moving: boolean): void {
    const amp = moving ? 1 : 0.4;
    const reach = Math.sin(t) * 0.85 * amp;
    const bob = Math.abs(Math.sin(t * 0.5)) * 0.05 * amp;

    // Tip upright against the wall (local +Z → world up, belly into the bars).
    this.root.rotation.x = -Math.PI / 2 + 0.18;
    this.root.rotation.z = Math.sin(t * 0.5) * 0.1 * amp;
    this.root.position.y = bob;
    this.root.position.z = 0.28;

    this.body.rotation.x = Math.sin(t * 0.5) * 0.08 * amp;
    this.body.rotation.z = 0;
    this.setBodyScale();

    this.head.rotation.x = -0.22 + Math.sin(t * 1.4) * 0.12;
    this.head.rotation.y = Math.sin(t * 0.7) * 0.1;
    this.head.rotation.z = Math.sin(t) * 0.1;
    this.snoot.scale.setScalar(1);
    this.mouth.scale.set(1, 1.1, 1);
    this.wiggleEars(0.2 + Math.abs(reach) * 0.16);

    this.legs[0]!.rotation.x = -1.05 + reach;
    this.legs[0]!.position.set(-0.22, -0.02 + Math.max(0, reach) * 0.1, 0.24);
    this.legs[1]!.rotation.x = -1.05 - reach;
    this.legs[1]!.position.set(0.22, -0.02 + Math.max(0, -reach) * 0.1, 0.24);
    this.legs[2]!.rotation.x = 0.7 - reach * 0.5;
    this.legs[2]!.position.set(-0.24, -0.12, -0.24);
    this.legs[3]!.rotation.x = 0.7 + reach * 0.5;
    this.legs[3]!.position.set(0.24, -0.12, -0.24);
  }

  protected poseIdle(t: number): void {
    const breath = Math.sin(t) * 0.02;
    this.root.position.y = breath;
    this.root.position.z = 0;
    this.root.rotation.x = 0;
    this.root.rotation.z = 0;
    this.body.rotation.x = 0;
    this.body.rotation.z = Math.sin(t * 0.5) * 0.02;
    this.setBodyScale(1, 1 + breath * 0.08, 1);
    this.head.rotation.x = -0.1 + Math.sin(t * 0.6) * 0.04;
    this.head.rotation.y = 0;
    this.head.rotation.z = Math.sin(t * 0.45) * 0.03;
    this.snoot.scale.setScalar(1);
    this.mouth.scale.set(1, 0.85 + Math.sin(t * 1.5) * 0.1, 1);
    this.wiggleEars(Math.sin(t * 1.1) * 0.1);
    this.plantLegs(0, 0);
  }

  private poseBored(t: number): void {
    const breath = Math.sin(t * 1.6) * 0.015;
    this.root.position.y = breath;
    this.root.position.z = 0;
    this.root.rotation.x = 0;
    this.root.rotation.z = 0;
    this.body.rotation.x = 0.06;
    this.body.rotation.z = Math.sin(t * 0.4) * 0.05;
    this.setBodyScale(1, 1 + breath * 0.1, 1);

    this.head.rotation.y = Math.sin(t * 0.5) * 0.65;
    this.head.rotation.x = -0.05 + Math.sin(t * 1.8) * 0.18;
    this.head.rotation.z = Math.sin(t * 0.35) * 0.1;
    this.snoot.scale.setScalar(1);
    this.mouth.scale.set(1.1, 1.1 + Math.max(0, Math.sin(t * 3)) * 0.35, 1);
    this.wiggleEars(0.2 + Math.sin(t * 1.3) * 0.25);

    const tap = Math.max(0, Math.sin(t * 4.5));
    this.plantLegs(0, 0);
    this.legs[0]!.rotation.x = -tap * 0.7;
    this.legs[0]!.position.y = -0.18 + tap * 0.05;
    this.legs[1]!.rotation.x = Math.sin(t * 0.8) * 0.08;
  }

  private poseBalance(t: number, amount: number): void {
    const a = Math.min(1, amount);
    const wobble = Math.sin(t * 10) * 0.1 * a;
    const wobble2 = Math.sin(t * 7.5 + 0.8) * 0.08 * a;
    const leanX = this.edgeLocalX * 0.3 * a;
    const leanZ = this.edgeLocalZ * 0.25 * a;

    this.root.position.y = Math.abs(Math.sin(t * 9)) * 0.025 * a;
    this.root.position.z = 0;
    this.root.rotation.x = 0;
    this.root.rotation.z = 0;
    this.body.rotation.x = leanZ + wobble * 0.4;
    this.body.rotation.z = -leanX + wobble2;
    this.setBodyScale();

    this.head.rotation.x = -0.1 - leanZ * 0.5 + Math.sin(t * 6) * 0.1;
    this.head.rotation.y = Math.sin(t * 4) * 0.2 * a;
    this.head.rotation.z = leanX * 0.45 + wobble;
    this.snoot.scale.setScalar(1);
    this.mouth.scale.set(1, 1.2, 1);
    this.wiggleEars(0.25 + Math.abs(wobble) * 1.2);

    const pad = Math.sin(t * 11) * 0.35 * a;
    this.plantLegs(leanZ * 0.5 + pad, leanZ * 0.5 - pad);
    this.legs[0]!.position.x = -0.22 - leanX * 0.08;
    this.legs[1]!.position.x = 0.22 - leanX * 0.08;
    this.legs[2]!.position.x = -0.24 - leanX * 0.06;
    this.legs[3]!.position.x = 0.24 - leanX * 0.06;
  }

  private poseRun(t: number, amp: number): void {
    const swing = Math.sin(t) * 0.55 * amp;
    const bob = Math.abs(Math.sin(t)) * 0.05 * amp;
    const lean = this.turnLean;
    this.root.position.y = bob;
    this.root.position.z = 0;
    this.root.rotation.x = 0;
    this.root.rotation.z = -lean * 0.12;
    this.body.rotation.x = -0.04 * amp;
    this.body.rotation.z = Math.sin(t) * 0.06 - lean * 0.3;
    this.setBodyScale();
    this.head.rotation.x = -0.15 + Math.sin(t * 2) * 0.08;
    this.head.rotation.y = lean * 0.5;
    this.head.rotation.z = Math.sin(t) * 0.08 + lean * 0.15;
    this.snoot.scale.setScalar(1);
    this.mouth.scale.set(1, 0.9, 1);
    this.wiggleEars(0.12 + Math.sin(t * 1.5) * 0.18 * amp + Math.abs(lean) * 0.12);
    this.plantLegs(swing, -swing);
  }

  private poseJump(): void {
    const rising = this.vel.y > 0.4;
    const lean = this.turnLean;
    this.root.position.y = 0;
    this.root.position.z = 0;
    this.root.rotation.x = 0;
    this.root.rotation.z = -lean * 0.1;
    this.body.rotation.x = rising ? -0.25 : 0.15;
    this.body.rotation.z = -lean * 0.22;
    this.setBodyScale();
    this.head.rotation.x = rising ? -0.35 : 0.05;
    this.head.rotation.y = lean * 0.4;
    this.head.rotation.z = lean * 0.12;
    this.snoot.scale.setScalar(1);
    this.mouth.scale.set(1, rising ? 1.2 : 0.8, 1);
    this.wiggleEars(rising ? 0.05 : 0.25);
    for (const leg of this.legs) {
      leg.rotation.x = rising ? 0.55 : -0.35;
      leg.position.y = -0.12;
    }
  }

  private plantLegs(a: number, b: number): void {
    const restY = -0.16;
    const restX = [-0.24, 0.24, -0.26, 0.26];
    const phases = [a, b, b, a];
    for (let i = 0; i < 4; i++) {
      const leg = this.legs[i]!;
      const swing = phases[i]!;
      leg.rotation.x = swing;
      leg.position.x = restX[i]!;
      leg.position.y = restY + Math.max(0, -swing) * 0.06;
    }
  }

  private wiggleEars(amount: number): void {
    for (let i = 0; i < this.ears.length; i++) {
      const ear = this.ears[i]!;
      const side = i === 0 ? -1 : 1;
      ear.rotation.z = side * (0.15 + amount * 0.25);
      ear.rotation.x = -0.2 + amount * 0.08;
    }
  }

  protected build(): void {
    const black = new THREE.MeshStandardMaterial({
      color: 0x1a1214,
      roughness: 0.95,
    });
    const red = new THREE.MeshStandardMaterial({
      color: 0xe82020,
      roughness: 0.55,
    });
    const white = new THREE.MeshStandardMaterial({
      color: 0xfff8ef,
      roughness: 0.55,
    });
    const ink = new THREE.MeshStandardMaterial({
      color: 0x0a0608,
      roughness: 0.6,
    });

    // Fat stumpy sausage along Z: black rump → yellow → white chest.
    const bodyLen = SAUSAGE_CYL + SAUSAGE_R * 2;
    const bodyGeo = new THREE.CapsuleGeometry(SAUSAGE_R, SAUSAGE_CYL, 10, 24);
    bodyGeo.rotateX(-Math.PI / 2);
    this.paintSausage(bodyGeo);
    this.body = new THREE.Mesh(
      bodyGeo,
      new THREE.MeshStandardMaterial({
        roughness: 0.72,
        vertexColors: true,
      }),
    );
    this.setBodyScale();
    this.body.position.set(0, 0.08, 0);
    this.body.castShadow = true;
    this.root.add(this.body);

    this.head = new THREE.Group();
    // Front quarter of the whole length (head / white / yellow / black).
    this.head.position.set(0, 0.14, bodyLen * 0.5 + 0.06);
    this.root.add(this.head);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 14), black);
    skull.scale.set(1.12, 1.02, 1.05);
    skull.castShadow = true;
    this.head.add(skull);

    const stripe = new THREE.Mesh(this.faceBlazeGeometry(), white);
    stripe.castShadow = true;
    this.head.add(stripe);

    this.snoot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), white);
    this.snoot.scale.set(0.95, 0.75, 1.1);
    this.snoot.position.set(0, -0.05, 0.26);
    this.head.add(this.snoot);

    this.mouth = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.04), red);
    this.mouth.position.set(0, -0.12, 0.3);
    this.head.add(this.mouth);

    for (const side of [-1, 1] as const) {
      const ear = new THREE.Group();
      ear.position.set(side * 0.16, 0.26, -0.02);
      this.head.add(ear);
      this.ears.push(ear);

      const earOuter = new THREE.Mesh(
        new THREE.ConeGeometry(0.08, 0.2, 5),
        black,
      );
      earOuter.castShadow = true;
      ear.add(earOuter);
      const earInner = new THREE.Mesh(
        new THREE.ConeGeometry(0.045, 0.12, 5),
        red,
      );
      earInner.position.y = 0.02;
      ear.add(earInner);

      const eye = new THREE.Mesh(new THREE.CircleGeometry(0.085, 12), white);
      eye.position.set(side * 0.11, 0.04, 0.28);
      this.head.add(eye);
      const pupilA = new THREE.Mesh(
        new THREE.BoxGeometry(0.065, 0.016, 0.02),
        ink,
      );
      pupilA.position.set(side * 0.11, 0.04, 0.29);
      pupilA.rotation.z = Math.PI / 4;
      this.head.add(pupilA);
      const pupilB = new THREE.Mesh(
        new THREE.BoxGeometry(0.065, 0.016, 0.02),
        ink,
      );
      pupilB.position.set(side * 0.11, 0.04, 0.29);
      pupilB.rotation.z = -Math.PI / 4;
      this.head.add(pupilB);
    }

    const legSpecs: Array<{ x: number; z: number }> = [
      { x: -0.24, z: 0.22 },
      { x: 0.24, z: 0.22 },
      { x: -0.26, z: -0.26 },
      { x: 0.26, z: -0.26 },
    ];
    for (const spec of legSpecs) {
      const leg = new THREE.Group();
      leg.position.set(spec.x, -0.16, spec.z);
      this.root.add(leg);
      this.legs.push(leg);

      const thigh = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.05, 0.06, 3, 6),
        black,
      );
      thigh.position.y = -0.05;
      thigh.castShadow = true;
      leg.add(thigh);

      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), white);
      paw.scale.set(1.1, 0.55, 1.2);
      paw.position.y = -0.14;
      paw.castShadow = true;
      leg.add(paw);
    }

    this.wiggleEars(0);
    this.plantLegs(0, 0);
  }

  /**
   * White blaze: wide at the muzzle, tapering to a point on the crown.
   */
  private faceBlazeGeometry(): THREE.BufferGeometry {
    const left = new THREE.Vector3(-0.13, -0.11, 0.28);
    const right = new THREE.Vector3(0.13, -0.11, 0.28);
    const crown = new THREE.Vector3(0, 0.31, -0.02);
    const n = new THREE.Vector3()
      .crossVectors(right.clone().sub(left), crown.clone().sub(left))
      .normalize();
    if (n.dot(left) < 0) n.negate();
    const outer = 0.02;
    const inner = -0.006;
    const top = [left, right, crown].map((p) =>
      p.clone().addScaledVector(n, outer),
    );
    const bot = [left, right, crown].map((p) =>
      p.clone().addScaledVector(n, inner),
    );
    const verts: number[] = [];
    for (const p of [...top, ...bot]) verts.push(p.x, p.y, p.z);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex([
      0, 1, 2, 5, 4, 3, 0, 3, 4, 0, 4, 1, 1, 4, 5, 1, 5, 2, 2, 5, 3, 2, 3, 0,
    ]);
    geo.computeVertexNormals();
    return geo;
  }

  private setBodyScale(mx = 1, my = 1, mz = 1): void {
    this.body.scale.set(BODY_SX * mx, BODY_SY * my, BODY_SZ * mz);
  }

  /**
   * Equal thirds of the sausage: black rump, yellow middle, white chest.
   * (Head is the remaining quarter of the whole character.)
   */
  private paintSausage(geo: THREE.BufferGeometry): void {
    const pos = geo.attributes.position;
    let zMin = Infinity;
    let zMax = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      if (z < zMin) zMin = z;
      if (z > zMax) zMax = z;
    }
    const span = zMax - zMin || 1;
    const colors = new Float32Array(pos.count * 3);
    const black = new THREE.Color(0x1a1214);
    const yellow = new THREE.Color(0xffc933);
    const white = new THREE.Color(0xfff8ef);
    const c = new THREE.Color();
    const edge = 0.035;
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getZ(i) - zMin) / span;
      if (t < 1 / 3 - edge) c.copy(black);
      else if (t < 1 / 3 + edge) {
        c.lerpColors(black, yellow, this.smoothstep((t - (1 / 3 - edge)) / (edge * 2)));
      } else if (t < 2 / 3 - edge) c.copy(yellow);
      else if (t < 2 / 3 + edge) {
        c.lerpColors(yellow, white, this.smoothstep((t - (2 / 3 - edge)) / (edge * 2)));
      } else c.copy(white);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  }

  private smoothstep(x: number): number {
    const t = THREE.MathUtils.clamp(x, 0, 1);
    return t * t * (3 - 2 * t);
  }
}
