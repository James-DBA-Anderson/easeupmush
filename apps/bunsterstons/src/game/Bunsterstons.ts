import * as THREE from "three";
import { Character } from "./Character";

/**
 * Bunsterstons — sketch-style pink bunny, pear body, flat floppy ears.
 * Playable on odd-numbered levels.
 */
export class Bunsterstons extends Character {
  protected readonly radius = 0.42;
  protected readonly height = 1.15;

  private ears: THREE.Group[] = [];
  private arms: THREE.Group[] = [];
  private feet: THREE.Mesh[] = [];
  private body!: THREE.Mesh;
  private head!: THREE.Group;
  /** Slight forward droop — ears hang, they don't stand up. */
  private readonly earRestX = 0.55;

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
    if (!this.onGround) {
      this.poseJump(_delta);
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

  protected poseIdle(t: number): void {
    const breath = Math.sin(t) * 0.03;
    this.root.position.y = breath;
    this.body.scale.set(0.92, 1.15 + breath * 0.4, 0.85);
    this.body.rotation.x = 0;
    this.body.rotation.z = 0;
    this.head.rotation.x = Math.sin(t * 0.7) * 0.04;
    this.head.rotation.y = 0;
    this.head.rotation.z = Math.sin(t * 0.5) * 0.03;

    this.swingEars(Math.sin(t * 0.9) * 0.08, Math.sin(t * 0.9 + 1) * 0.1);
    this.arms[0]!.rotation.x = Math.sin(t * 0.8) * 0.08;
    this.arms[1]!.rotation.x = Math.sin(t * 0.8 + 1) * 0.08;
    this.arms[0]!.rotation.z = -0.4;
    this.arms[1]!.rotation.z = 0.4;
    this.feet[0]!.rotation.x = 0;
    this.feet[1]!.rotation.x = 0;
    this.feet[0]!.position.y = -0.48;
    this.feet[1]!.position.y = -0.48;
  }

  /** Look around, foot-tap, droopy ears — waiting for the player. */
  private poseBored(t: number): void {
    const breath = Math.sin(t * 1.4) * 0.025;
    this.root.position.y = breath;
    this.body.scale.set(0.94, 1.1 + breath * 0.3, 0.88);
    this.body.rotation.x = 0.08;
    this.body.rotation.z = Math.sin(t * 0.35) * 0.04;

    // Slow head look L/R with the occasional nod.
    this.head.rotation.y = Math.sin(t * 0.55) * 0.55;
    this.head.rotation.x = 0.12 + Math.sin(t * 0.9) * 0.1;
    this.head.rotation.z = Math.sin(t * 0.4) * 0.08;

    this.swingEars(0.28 + Math.sin(t * 0.7) * 0.1, Math.sin(t * 0.6) * 0.2);

    // One arm scratches near the ear; other hangs limp.
    const scratch = Math.max(0, Math.sin(t * 2.2));
    this.arms[0]!.rotation.x = -0.2 - scratch * 1.1;
    this.arms[0]!.rotation.z = -0.15 - scratch * 0.5;
    this.arms[1]!.rotation.x = 0.35 + Math.sin(t * 0.8) * 0.1;
    this.arms[1]!.rotation.z = 0.55;

    // Impatient foot tap.
    const tap = Math.max(0, Math.sin(t * 5));
    this.feet[0]!.rotation.x = 0;
    this.feet[1]!.rotation.x = -tap * 0.55;
    this.feet[0]!.position.y = -0.48;
    this.feet[1]!.position.y = -0.48 + tap * 0.07;
  }

  /** Windmill arms and teeter — trying not to tip off the rim. */
  private poseBalance(t: number, amount: number): void {
    const a = Math.min(1, amount);
    const wobble = Math.sin(t * 9) * 0.12 * a;
    const wobble2 = Math.sin(t * 7.3 + 1.2) * 0.1 * a;
    const leanX = this.edgeLocalX * 0.35 * a;
    const leanZ = this.edgeLocalZ * 0.28 * a;

    this.root.position.y = Math.abs(Math.sin(t * 8)) * 0.03 * a;
    this.body.scale.set(0.9, 1.18, 0.82);
    this.body.rotation.x = leanZ + wobble * 0.5;
    this.body.rotation.z = -leanX + wobble2;

    this.head.rotation.x = -leanZ * 0.6 + Math.sin(t * 5) * 0.08;
    this.head.rotation.y = Math.sin(t * 3.5) * 0.15 * a;
    this.head.rotation.z = leanX * 0.5 + wobble;

    this.swingEars(0.15 + Math.abs(wobble) * 0.8, wobble2 * 2);

    // Arms out for balance, flailing opposite the lean.
    this.arms[0]!.rotation.x = -0.4 + Math.sin(t * 10) * 0.7 * a;
    this.arms[1]!.rotation.x = -0.4 + Math.sin(t * 10 + 2) * 0.7 * a;
    this.arms[0]!.rotation.z = -0.95 - leanX * 0.4 + wobble;
    this.arms[1]!.rotation.z = 0.95 - leanX * 0.4 - wobble;

    this.feet[0]!.rotation.x = leanZ * 0.4 + wobble2;
    this.feet[1]!.rotation.x = leanZ * 0.4 - wobble2;
    this.feet[0]!.position.y = -0.48;
    this.feet[1]!.position.y = -0.48;
  }

  private poseRun(t: number, amp: number): void {
    const swing = Math.sin(t) * 0.55 * amp;
    const bob = Math.abs(Math.sin(t)) * 0.09 * amp;
    this.root.position.y = bob;
    this.body.rotation.x = -0.08 * amp;
    this.body.rotation.z = Math.sin(t) * 0.06;
    this.head.rotation.x = -0.1 + Math.sin(t * 2) * 0.05;
    this.head.rotation.y = 0;
    this.head.rotation.z = Math.sin(t) * 0.08;

    this.swingEars(
      0.12 + Math.sin(t + 0.4) * 0.22 * amp,
      Math.sin(t * 1.1) * 0.28 * amp,
    );

    this.arms[0]!.rotation.x = -swing * 1.1;
    this.arms[1]!.rotation.x = swing * 1.1;
    this.arms[0]!.rotation.z = -0.38;
    this.arms[1]!.rotation.z = 0.38;

    this.feet[0]!.rotation.x = swing * 0.9;
    this.feet[1]!.rotation.x = -swing * 0.9;
    this.feet[0]!.position.y = -0.48 + Math.max(0, swing) * 0.08;
    this.feet[1]!.position.y = -0.48 + Math.max(0, -swing) * 0.08;
  }

  private poseJump(_delta: number): void {
    const rising = this.vel.y > 0.4;
    this.root.position.y = 0;
    this.body.rotation.x = rising ? -0.2 : 0.15;
    this.body.rotation.z = 0;
    this.head.rotation.x = rising ? -0.15 : 0.2;
    this.head.rotation.y = 0;
    this.head.rotation.z = 0;

    this.swingEars(rising ? 0.05 : 0.35, rising ? 0.12 : -0.08);

    this.arms[0]!.rotation.x = rising ? -0.9 : 0.5;
    this.arms[1]!.rotation.x = rising ? -0.9 : 0.5;
    this.arms[0]!.rotation.z = rising ? -0.7 : -0.35;
    this.arms[1]!.rotation.z = rising ? 0.7 : 0.35;

    this.feet[0]!.rotation.x = rising ? -0.5 : 0.35;
    this.feet[1]!.rotation.x = rising ? -0.5 : 0.35;
    this.feet[0]!.position.y = -0.48;
    this.feet[1]!.position.y = -0.48;
  }

  private swingEars(flap: number, sway: number): void {
    for (let i = 0; i < this.ears.length; i++) {
      const ear = this.ears[i]!;
      const side = i === 0 ? -1 : 1;
      ear.rotation.x = this.earRestX + flap;
      ear.rotation.z = side * (0.35 + sway * 0.4);
      ear.rotation.y = side * (0.15 + sway * 0.25);
    }
  }

  protected build(): void {
    const pink = new THREE.MeshStandardMaterial({
      color: 0xff6bb5,
      roughness: 0.55,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x2a1a2e,
      roughness: 0.7,
    });
    const belly = new THREE.MeshStandardMaterial({
      color: 0xffc0de,
      roughness: 0.65,
    });

    this.body = new THREE.Mesh(new THREE.SphereGeometry(0.48, 18, 14), pink);
    this.body.scale.set(0.92, 1.15, 0.85);
    this.body.position.y = 0.05;
    this.body.castShadow = true;
    this.root.add(this.body);

    const tum = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), belly);
    tum.position.set(0, -0.02, 0.41);
    tum.scale.set(1, 1.15, 1);
    this.root.add(tum);

    this.head = new THREE.Group();
    this.head.position.y = 0.72;
    this.root.add(this.head);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12), pink);
    skull.castShadow = true;
    this.head.add(skull);

    for (const side of [-1, 1] as const) {
      const ear = new THREE.Group();
      ear.position.set(side * 0.18, 0.26, -0.04);
      this.head.add(ear);
      this.ears.push(ear);

      const earMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 14, 12),
        pink,
      );
      earMesh.scale.set(0.48, 1.45, 0.2);
      earMesh.position.y = -0.42;
      earMesh.castShadow = true;
      ear.add(earMesh);

      const inner = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 10, 8),
        belly,
      );
      inner.scale.set(0.42, 1.3, 0.14);
      inner.position.set(0, -0.4, 0.035);
      ear.add(inner);

      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), dark);
      eye.position.set(side * 0.12, 0.02, 0.3);
      this.head.add(eye);

      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), pink);
      foot.scale.set(1, 0.55, 1.25);
      foot.position.set(side * 0.18, -0.48, 0.05);
      foot.castShadow = true;
      this.root.add(foot);
      this.feet.push(foot);

      const arm = new THREE.Group();
      arm.position.set(side * 0.4, 0.3, 0.06);
      this.root.add(arm);
      this.arms.push(arm);

      const shoulder = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 10, 8),
        pink,
      );
      shoulder.position.set(side * 0.01, 0.01, 0);
      shoulder.castShadow = true;
      arm.add(shoulder);

      const armMesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.07, 0.28, 4, 8),
        pink,
      );
      armMesh.position.set(0, -0.2, 0);
      armMesh.castShadow = true;
      arm.add(armMesh);
      arm.rotation.z = side * 0.4;
    }

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), dark);
    nose.position.set(0, -0.06, 0.34);
    this.head.add(nose);

    this.swingEars(0, 0);
  }
}
