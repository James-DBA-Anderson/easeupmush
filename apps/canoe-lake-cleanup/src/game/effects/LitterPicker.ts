import * as THREE from "three";

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
  private jaws: THREE.Mesh[] = [];
  private sack: THREE.Mesh;

  private jab = -1;
  private bitten = true;
  private bagged = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.group = new THREE.Group();

    const alloy = new THREE.MeshStandardMaterial({
      color: 0xb8c2ca,
      roughness: 0.35,
      metalness: 0.7,
    });
    const grip = new THREE.MeshStandardMaterial({
      color: 0xe04a2f,
      roughness: 0.9,
    });
    const plastic = new THREE.MeshStandardMaterial({
      color: 0x2a2a30,
      roughness: 0.8,
    });

    // The whole grabber swings as one, pivoting near the hand.
    this.arm = new THREE.Group();
    this.arm.position.set(0.26, -0.34, -0.55);

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.014, 0.9, 8),
      alloy,
    );
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = -0.45;
    this.arm.add(shaft);

    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.06, 0.16),
      grip,
    );
    handle.position.set(0, -0.01, 0.02);
    this.arm.add(handle);

    const trigger = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.09, 0.02),
      plastic,
    );
    trigger.position.set(0, -0.07, -0.04);
    trigger.rotation.x = 0.3;
    this.arm.add(trigger);

    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.026, 0.02, 0.06, 8),
      plastic,
    );
    collar.rotation.x = Math.PI / 2;
    collar.position.z = -0.86;
    this.arm.add(collar);

    // Two little jaws at the far end that close on the bite.
    for (const side of [-1, 1]) {
      const jaw = new THREE.Mesh(
        new THREE.BoxGeometry(0.015, 0.06, 0.1),
        plastic,
      );
      jaw.geometry.translate(0, 0, -0.05);
      jaw.position.set(side * 0.03, 0, -0.88);
      this.jaws.push(jaw);
      this.arm.add(jaw);
    }

    this.group.add(this.arm);

    // Council bin sack, creased enough to catch the light and read as plastic.
    this.sack = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.15, 1),
      new THREE.MeshStandardMaterial({
        color: 0x24242c,
        roughness: 0.55,
        flatShading: true,
      }),
    );
    this.sack.position.set(-0.46, -0.62, -1.05);
    this.sack.scale.set(0.7, 0.95, 0.7);
    this.group.add(this.sack);

    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.06, 0.1, 7),
      new THREE.MeshStandardMaterial({ color: 0x2c2c34, roughness: 0.6 }),
    );
    neck.position.set(-0.44, -0.48, -1.03);
    neck.rotation.z = 0.25;
    this.group.add(neck);

    const glove = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.06, 0.09),
      new THREE.MeshStandardMaterial({ color: 0x3f7a4a, roughness: 0.9 }),
    );
    glove.position.set(-0.43, -0.42, -1.02);
    this.group.add(glove);

    const sleeve = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.34, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xf0a23a, roughness: 0.9 }),
    );
    sleeve.position.set(-0.4, -0.6, -0.85);
    sleeve.rotation.set(-0.5, 0, 0.2);
    this.group.add(sleeve);

    this.group.rotation.set(0.04, -0.04, 0);
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
    this.group.rotation.set(0.04 - amount * 0.9, -0.04 + amount * 0.3, amount * 0.4);
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
    this.sack.scale.set(0.7 + fill * 0.4, 0.95 + fill * 0.35, 0.7 + fill * 0.4);
  }

  /** Runs the swing, returning true on the frame the jaws bite. */
  public update(delta: number): boolean {
    const sway = performance.now() / 1000;
    this.sack.position.y = -0.62 + Math.sin(sway * 1.7) * 0.008;

    if (this.jab < 0) {
      this.arm.position.z = -0.55;
      this.arm.rotation.x = 0;
      this.setJaws(0.5);
      return false;
    }

    this.jab += delta;
    const t = Math.min(1, this.jab / JAB_TIME);
    // Down and out, then back up, with the jaws shut at the bottom.
    const reach = Math.sin(t * Math.PI);
    this.arm.position.z = -0.55 - reach * 0.3;
    this.arm.rotation.x = -reach * 0.75;
    this.setJaws(t > BITE_AT / JAB_TIME && t < 0.8 ? 0.05 : 0.5);

    const bit = this.biting();
    if (t >= 1) this.jab = -1;
    return bit;
  }

  private setJaws(gap: number): void {
    this.jaws[0]!.position.x = -0.012 - gap * 0.06;
    this.jaws[1]!.position.x = 0.012 + gap * 0.06;
    this.jaws[0]!.rotation.y = -gap * 0.25;
    this.jaws[1]!.rotation.y = gap * 0.25;
  }
}
