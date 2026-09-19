import * as THREE from "three";
import { Character } from "./Character";

/**
 * Chippy — round guinea pig: white / yellow / black body, white head stripe.
 * Climbs gates. Even-numbered levels.
 */
export class Chippy extends Character {
  protected readonly radius = 0.42;
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
    this.body.scale.set(1 + strike * 0.06, 1, 1 + coil * 0.05);

    this.head.rotation.x = 0.35 * coil - 0.75 * strike;
    this.head.rotation.y = 0;
    this.head.rotation.z = Math.sin(progress * Math.PI * 2) * 0.08;
    this.snoot.scale.setScalar(1 + strike * 0.15);
    this.mouth.scale.set(1, 1.15 + strike * 0.35, 1);
    this.wiggleEars(0.1 + strike * 0.35);

    this.legs[0]!.rotation.x = -0.4 - strike * 0.5;
    this.legs[1]!.rotation.x = -0.4 - strike * 0.5;
    this.legs[0]!.position.set(-0.2, -0.1, 0.3);
    this.legs[1]!.position.set(0.2, -0.1, 0.3);
    this.legs[2]!.rotation.x = 0.35 + coil * 0.4;
    this.legs[3]!.rotation.x = 0.35 + coil * 0.4;
    this.legs[2]!.position.set(-0.22, -0.14, -0.26);
    this.legs[3]!.position.set(0.22, -0.14, -0.26);
  }

  /** Scramble up the bars — body vertical, belly to the gate, head up. */
  private poseClimb(t: number, moving: boolean): void {
    const amp = moving ? 1 : 0.35;
    const reach = Math.sin(t) * 0.7 * amp;
    const bob = Math.abs(Math.sin(t * 0.5)) * 0.04 * amp;

    // Tip upright against the wall (local +Z → world up, belly into the bars).
    this.root.rotation.x = -Math.PI / 2 + 0.08;
    this.root.rotation.z = Math.sin(t * 0.5) * 0.06 * amp;
    this.root.position.y = bob;
    // Nudge into the face so paws meet the bars.
    this.root.position.z = 0.22;

    this.body.rotation.x = Math.sin(t * 0.5) * 0.06 * amp;
    this.body.rotation.z = 0;
    this.body.scale.set(1, 1, 1);

    this.head.rotation.x = -0.15 + Math.sin(t * 1.2) * 0.1;
    this.head.rotation.y = Math.sin(t * 0.7) * 0.12;
    this.head.rotation.z = Math.sin(t) * 0.08;
    this.snoot.scale.setScalar(1);
    this.mouth.scale.set(1, 1.05, 1);
    this.wiggleEars(0.15 + Math.abs(reach) * 0.12);

    // Front paws reach up the bars; back paws push.
    this.legs[0]!.rotation.x = -0.9 + reach;
    this.legs[0]!.position.set(-0.2, -0.02 + Math.max(0, reach) * 0.08, 0.32);
    this.legs[1]!.rotation.x = -0.9 - reach;
    this.legs[1]!.position.set(0.2, -0.02 + Math.max(0, -reach) * 0.08, 0.32);
    this.legs[2]!.rotation.x = 0.55 - reach * 0.45;
    this.legs[2]!.position.set(-0.22, -0.14, -0.22);
    this.legs[3]!.rotation.x = 0.55 + reach * 0.45;
    this.legs[3]!.position.set(0.22, -0.14, -0.22);
  }

  protected poseIdle(t: number): void {
    const breath = Math.sin(t) * 0.02;
    this.root.position.y = breath;
    this.root.position.z = 0;
    this.root.rotation.x = 0;
    this.root.rotation.z = 0;
    this.body.rotation.x = 0;
    this.body.rotation.z = Math.sin(t * 0.5) * 0.02;
    this.body.scale.set(1, 1 + breath * 0.08, 1);
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
    this.body.scale.set(1, 1 + breath * 0.1, 1);

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
    this.body.scale.set(1, 1, 1);

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
    this.body.scale.set(1, 1, 1);
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
    this.body.scale.set(1, 1, 1);
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
    const restX = [-0.22, 0.22, -0.24, 0.24];
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
    const yellow = new THREE.MeshStandardMaterial({
      color: 0xffc933,
      roughness: 0.7,
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

    // Rounder loaf: white chest → yellow middle → black rump.
    this.body = new THREE.Mesh(new THREE.SphereGeometry(0.36, 18, 14), yellow);
    this.body.scale.set(1.05, 0.82, 1.15);
    this.body.position.set(0, 0.06, 0);
    this.body.castShadow = true;
    this.root.add(this.body);

    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), white);
    chest.scale.set(1.0, 0.85, 0.95);
    chest.position.set(0, 0.05, 0.32);
    chest.castShadow = true;
    this.root.add(chest);

    const rump = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), black);
    rump.scale.set(1.05, 0.8, 0.95);
    rump.position.set(0, 0.05, -0.34);
    rump.castShadow = true;
    this.root.add(rump);

    this.head = new THREE.Group();
    this.head.position.set(0, 0.2, 0.52);
    this.root.add(this.head);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), black);
    skull.scale.set(1.05, 0.95, 1.1);
    skull.castShadow = true;
    this.head.add(skull);

    // White stripe across the top of the head.
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.08, 0.42),
      white,
    );
    stripe.position.set(0, 0.22, 0.02);
    stripe.rotation.x = -0.15;
    this.head.add(stripe);

    this.snoot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), black);
    this.snoot.scale.set(0.95, 0.75, 1.1);
    this.snoot.position.set(0, -0.05, 0.26);
    this.head.add(this.snoot);

    this.mouth = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.04), red);
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
      { x: -0.22, z: 0.28 },
      { x: 0.22, z: 0.28 },
      { x: -0.24, z: -0.28 },
      { x: 0.24, z: -0.28 },
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
}
