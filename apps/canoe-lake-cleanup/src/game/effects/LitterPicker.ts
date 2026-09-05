import * as THREE from "three";
import { buildHand, buildSleeve } from "./Hands";

/** How long the jab takes, and how far through it the jaws bite. */
const JAB_TIME = 0.5;
const BITE_AT = 0.18;

/** The sack fills up as the shift goes on, up to a point. */
const SACK_FULL = 25;

/**
 * The litter picker: a council-issue alloy grabber in one hand and a bin sack
 * in the other, sat in front of the camera in place of the pressure washer.
 */
export class LitterPicker {
  private group: THREE.Group;
  private arm: THREE.Group;
  private jaws: THREE.Group[] = [];
  private sack: THREE.Mesh;
  private sackHand: THREE.Group;

  private jab = -1;
  private bitten = true;
  private bagged = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.group = new THREE.Group();

    const matt = (color: number): THREE.MeshStandardMaterial =>
      new THREE.MeshStandardMaterial({
        color,
        roughness: 1,
        metalness: 0,
        flatShading: true,
      });
    const alloy = matt(0xb8c2ca);
    const grip = matt(0xc43a28);
    const plastic = matt(0x222228);
    const rubber = matt(0x1a1a1e);

    // The whole grabber swings as one, pivoting near the hand.
    this.arm = new THREE.Group();
    this.arm.position.set(0.28, -0.3, -0.5);

    // Handle body with moulded grip.
    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.055, 0.14),
      grip,
    );
    handle.position.set(0, 0, 0.02);
    handle.castShadow = true;
    this.arm.add(handle);

    for (const z of [-0.02, 0.02, 0.06]) {
      const bump = new THREE.Mesh(
        new THREE.BoxGeometry(0.048, 0.012, 0.02),
        rubber,
      );
      bump.position.set(0, -0.028, z);
      this.arm.add(bump);
    }

    const trigger = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.07, 0.018),
      plastic,
    );
    trigger.position.set(0, -0.055, -0.02);
    trigger.rotation.x = 0.25;
    this.arm.add(trigger);

    // Telescoping alloy shaft — few facets, matte.
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.013, 0.95, 5),
      alloy,
    );
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = -0.5;
    shaft.castShadow = true;
    this.arm.add(shaft);

    const join = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.04), plastic);
    join.position.z = -0.2;
    this.arm.add(join);

    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.05), plastic);
    collar.position.z = -0.95;
    this.arm.add(collar);

    // Two claw jaws at the tip — simple boxes, rubber pads.
    for (const side of [-1, 1] as const) {
      const jaw = new THREE.Group();
      jaw.position.set(side * 0.012, 0, -0.98);

      const claw = new THREE.Mesh(
        new THREE.BoxGeometry(0.014, 0.02, 0.1),
        plastic,
      );
      claw.geometry.translate(0, 0, -0.05);
      claw.position.set(side * 0.01, 0, 0);
      jaw.add(claw);

      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(0.016, 0.014, 0.032),
        rubber,
      );
      pad.position.set(side * 0.008, -0.008, -0.06);
      jaw.add(pad);

      this.jaws.push(jaw);
      this.arm.add(jaw);
    }

    // Right hand on the grabber + sleeve.
    const right = buildHand(1, "picker");
    right.position.set(0.01, -0.02, 0.06);
    right.rotation.set(-0.35, 0.1, 0.4);
    this.arm.add(right);

    const rightSleeve = buildSleeve(1);
    rightSleeve.position.set(0.05, -0.1, 0.22);
    this.arm.add(rightSleeve);

    this.group.add(this.arm);

    // Left side: sack held in a gloved fist.
    this.sackHand = new THREE.Group();
    this.sackHand.position.set(-0.42, -0.45, -0.95);

    const left = buildHand(-1, "sack");
    left.rotation.set(-0.6, -0.4, -0.5);
    this.sackHand.add(left);

    const leftSleeve = buildSleeve(-1);
    leftSleeve.position.set(-0.02, -0.12, 0.2);
    leftSleeve.rotation.set(0.1, 0, -0.15);
    this.sackHand.add(leftSleeve);

    // Council bin sack — lumpy black plastic with a tied neck.
    this.sack = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.16, 0),
      matt(0x1e1e24),
    );
    this.sack.position.set(-0.02, -0.22, -0.04);
    this.sack.scale.set(0.75, 1.05, 0.72);
    this.sack.castShadow = true;
    this.sackHand.add(this.sack);

    const neck = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.1, 0.05),
      matt(0x2a2a32),
    );
    neck.position.set(-0.01, -0.08, -0.02);
    neck.rotation.z = 0.2;
    this.sackHand.add(neck);

    // Twisted tie at the top of the neck.
    const tie = new THREE.Mesh(
      new THREE.BoxGeometry(0.055, 0.014, 0.014),
      matt(0xf0e060),
    );
    tie.position.set(-0.01, -0.03, -0.02);
    this.sackHand.add(tie);

    this.group.add(this.sackHand);

    this.group.rotation.set(0.03, -0.03, 0);
    camera.add(this.group);
  }

  public setStowed(stowed: boolean): void {
    this.group.visible = !stowed;
    if (stowed) this.jab = -1;
  }

  /**
   * Part way through being put away: 0 is in both hands, 1 is dropped to the
   * side with the sack down by the boots.
   */
  public setHolster(amount: number): void {
    this.group.visible = amount < 0.99;
    if (amount > 0.01) this.jab = -1;
    this.group.position.y = -amount * 0.95;
    this.group.rotation.set(
      0.03 - amount * 0.9,
      -0.03 + amount * 0.3,
      amount * 0.4,
    );
  }

  public isSwinging(): boolean {
    return this.jab >= 0;
  }

  /** Start a jab, unless one is already going. */
  public strike(): void {
    if (this.jab >= 0 || !this.group.visible) return;
    this.jab = 0;
    this.bitten = false;
  }

  /** True on the single frame the jaws close, which is when it counts. */
  private biting(): boolean {
    if (this.bitten || this.jab < BITE_AT) return false;
    this.bitten = true;
    return true;
  }

  /** Where the jaws are in the world, for the rubbish to fly off towards. */
  public sackPoint(): THREE.Vector3 {
    return this.sack.getWorldPosition(new THREE.Vector3());
  }

  /** Another one in the bag: it sags a bit heavier each time. */
  public stow(): void {
    this.bagged = Math.min(SACK_FULL, this.bagged + 1);
    const fill = this.bagged / SACK_FULL;
    this.sack.scale.set(
      0.75 + fill * 0.4,
      1.05 + fill * 0.35,
      0.72 + fill * 0.4,
    );
  }

  /** Runs the swing, returning true on the frame the jaws bite. */
  public update(delta: number): boolean {
    const sway = performance.now() / 1000;
    this.sackHand.position.y = -0.45 + Math.sin(sway * 1.7) * 0.008;
    this.sack.rotation.z = Math.sin(sway * 1.3) * 0.04;

    if (this.jab < 0) {
      this.arm.position.z = -0.5;
      this.arm.rotation.x = 0;
      this.setJaws(0.55);
      return false;
    }

    this.jab += delta;
    const t = Math.min(1, this.jab / JAB_TIME);
    // Down and out, then back up, with the jaws shut at the bottom.
    const reach = Math.sin(t * Math.PI);
    this.arm.position.z = -0.5 - reach * 0.32;
    this.arm.rotation.x = -reach * 0.8;
    this.setJaws(t > BITE_AT / JAB_TIME && t < 0.8 ? 0.04 : 0.55);

    const bit = this.biting();
    if (t >= 1) this.jab = -1;
    return bit;
  }

  private setJaws(gap: number): void {
    const [left, right] = this.jaws;
    left!.rotation.y = -gap * 0.9;
    right!.rotation.y = gap * 0.9;
    left!.position.x = -0.012 - gap * 0.02;
    right!.position.x = 0.012 + gap * 0.02;
  }
}
