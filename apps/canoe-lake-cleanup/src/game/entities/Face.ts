import * as THREE from "three";

const WHITE = 0xf4f1ea;
const IRIS = [0x2a3a4a, 0x3d5a3a, 0x5a3a28, 0x4a6a8a, 0x2b2b33] as const;
const LIP = 0xb06060;
const HAIR = [0x1a1512, 0x3a2a1a, 0x6b4a28, 0xc8a060, 0xd8d0c4, 0x2f1a0a] as const;

export type Mood =
  | "idle"
  | "pleased"
  | "disgusted"
  | "angry"
  | "shocked"
  | "shifty";

/**
 * A low-poly face that sits on the front of a head. Brows, eyes and mouth are
 * driven by a mood so you can read what someone's thinking from a few metres.
 */
export class Face {
  public readonly group = new THREE.Group();
  private leftBrow: THREE.Mesh;
  private rightBrow: THREE.Mesh;
  private leftLid!: THREE.Mesh;
  private rightLid!: THREE.Mesh;
  private leftPupil!: THREE.Mesh;
  private rightPupil!: THREE.Mesh;
  private mouth: THREE.Mesh;
  private mood: Mood = "idle";
  private blink = 0;
  private glance = 0;
  private glanceFor = 1 + Math.random() * 2;
  private look = 0;

  constructor(skin: THREE.MeshStandardMaterial, scale = 1) {
    const pick = <T>(list: readonly T[]): T =>
      list[Math.floor(Math.random() * list.length)]!;

    const skull = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 12, 10),
      skin,
    );
    skull.scale.set(0.95, 1.05, 0.9);
    skull.castShadow = true;
    this.group.add(skull);

    // A bit of hair or a bald pate — keeps faces from looking identical.
    const hairMat = new THREE.MeshStandardMaterial({
      color: pick(HAIR),
      roughness: 1,
    });
    if (Math.random() < 0.85) {
      const hair = new THREE.Mesh(
        new THREE.SphereGeometry(0.152, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
        hairMat,
      );
      hair.position.y = 0.02;
      hair.castShadow = true;
      this.group.add(hair);
    }

    const browMat = hairMat;
    this.leftBrow = new THREE.Mesh(
      new THREE.BoxGeometry(0.055, 0.012, 0.012),
      browMat,
    );
    this.rightBrow = this.leftBrow.clone();
    this.leftBrow.position.set(-0.045, 0.055, 0.12);
    this.rightBrow.position.set(0.045, 0.055, 0.12);
    this.group.add(this.leftBrow, this.rightBrow);

    const white = new THREE.MeshStandardMaterial({
      color: WHITE,
      roughness: 0.6,
    });
    const iris = new THREE.MeshStandardMaterial({
      color: pick(IRIS),
      roughness: 0.5,
    });
    const lidMat = skin;

    for (const side of [-1, 1] as const) {
      const eye = new THREE.Group();
      eye.position.set(side * 0.045, 0.02, 0.125);

      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), white);
      eye.add(ball);

      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.014, 7, 5), iris);
      pupil.position.z = 0.018;
      eye.add(pupil);

      const lid = new THREE.Mesh(
        new THREE.SphereGeometry(
          0.03,
          8,
          6,
          0,
          Math.PI * 2,
          0,
          Math.PI * 0.55,
        ),
        lidMat,
      );
      lid.rotation.x = Math.PI;
      lid.position.y = 0.01;
      lid.scale.y = 0.05;
      eye.add(lid);

      this.group.add(eye);
      if (side < 0) {
        this.leftPupil = pupil;
        this.leftLid = lid;
      } else {
        this.rightPupil = pupil;
        this.rightLid = lid;
      }
    }

    // A soft wedge of a nose.
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.022, 0.05, 5),
      skin,
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.0, 0.145);
    this.group.add(nose);

    this.mouth = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.016, 0.012),
      new THREE.MeshStandardMaterial({ color: LIP, roughness: 0.7 }),
    );
    this.mouth.position.set(0, -0.045, 0.13);
    this.group.add(this.mouth);

    this.group.scale.setScalar(scale);
  }

  public setMood(mood: Mood): void {
    this.mood = mood;
  }

  public update(delta: number): void {
    this.glance += delta;
    if (this.glance >= this.glanceFor) {
      this.glance = 0;
      this.glanceFor = 0.9 + Math.random() * 2.6;
      this.look = ([-1, 0, 0, 1] as const)[Math.floor(Math.random() * 4)]!;
      if (Math.random() < 0.4) this.blink = 0.12;
    }
    if (this.blink > 0) this.blink -= delta;

    // Pupils glance about a bit when they're not mid-strop.
    const glanceX =
      this.mood === "shocked" || this.mood === "angry" ? 0 : this.look * 0.008;
    this.leftPupil.position.x = glanceX;
    this.rightPupil.position.x = glanceX;

    const shut = this.blink > 0 ? 1 : 0;
    this.leftLid.scale.y = 0.05 + shut * 0.95;
    this.rightLid.scale.y = 0.05 + shut * 0.95;
    this.leftLid.position.y = shut > 0 ? 0 : 0.01;
    this.rightLid.position.y = shut > 0 ? 0 : 0.01;

    this.applyMood();
  }

  private applyMood(): void {
    const brow = this.mood;
    // Idle sits almost flat; everything else reads clearly from the path.
    if (brow === "idle") {
      this.leftBrow.rotation.z = 0.08;
      this.rightBrow.rotation.z = -0.08;
      this.leftBrow.position.y = 0.055;
      this.rightBrow.position.y = 0.055;
      this.mouth.scale.set(1, 1, 1);
      this.mouth.rotation.z = 0;
      this.mouth.position.y = -0.045;
    } else if (brow === "pleased") {
      this.leftBrow.rotation.z = -0.25;
      this.rightBrow.rotation.z = 0.25;
      this.leftBrow.position.y = 0.06;
      this.rightBrow.position.y = 0.06;
      this.mouth.scale.set(1.15, 1.4, 1);
      this.mouth.rotation.z = 0;
      this.mouth.position.y = -0.04;
    } else if (brow === "disgusted") {
      this.leftBrow.rotation.z = 0.45;
      this.rightBrow.rotation.z = -0.2;
      this.leftBrow.position.y = 0.05;
      this.rightBrow.position.y = 0.062;
      this.mouth.scale.set(0.85, 1.2, 1);
      this.mouth.rotation.z = 0.25;
      this.mouth.position.y = -0.05;
    } else if (brow === "angry") {
      this.leftBrow.rotation.z = 0.55;
      this.rightBrow.rotation.z = -0.55;
      this.leftBrow.position.y = 0.048;
      this.rightBrow.position.y = 0.048;
      this.mouth.scale.set(0.9, 1.6, 1);
      this.mouth.rotation.z = 0;
      this.mouth.position.y = -0.055;
    } else if (brow === "shocked") {
      this.leftBrow.rotation.z = -0.35;
      this.rightBrow.rotation.z = 0.35;
      this.leftBrow.position.y = 0.07;
      this.rightBrow.position.y = 0.07;
      this.mouth.scale.set(0.7, 2.4, 1);
      this.mouth.rotation.z = 0;
      this.mouth.position.y = -0.05;
    } else {
      // Shifty: one brow up, mouth pulled to the side.
      this.leftBrow.rotation.z = -0.35;
      this.rightBrow.rotation.z = 0.1;
      this.leftBrow.position.y = 0.065;
      this.rightBrow.position.y = 0.05;
      this.mouth.scale.set(0.9, 1, 1);
      this.mouth.rotation.z = -0.2;
      this.mouth.position.y = -0.048;
    }
  }
}
