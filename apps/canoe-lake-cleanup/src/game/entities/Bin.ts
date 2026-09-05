import * as THREE from "three";

/** Full enough to be worth a phone call, and full enough to spill. */
const REPORT_AT = 0.8;
/** One finished bag / coffee cup — a handful of visits fills a bin. */
const DEPOSIT = 0.14;

const STEEL = new THREE.MeshStandardMaterial({
  color: 0x8f969c,
  roughness: 0.4,
  metalness: 0.6,
});
const PAINT = new THREE.MeshStandardMaterial({
  color: 0x2f5d4a,
  roughness: 0.8,
});
const LID = new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 1 });
const RUBBISH = new THREE.MeshStandardMaterial({
  color: 0xcfc6ae,
  roughness: 1,
});

/**
 * A council bin on its post. Starts empty; fills when people actually put
 * something in, and overflows in a heap on the lid until it's emptied with
 * the litter picker.
 */
export class Bin {
  private group: THREE.Group;
  private heap: THREE.Group;
  private fill = 0;
  private reported = false;

  constructor(scene: THREE.Scene, x: number, z: number) {
    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);

    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 1, 6),
      STEEL,
    );
    post.position.y = 0.5;
    this.group.add(post);

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.26, 0.8, 10),
      PAINT,
    );
    body.position.y = 1.05;
    body.castShadow = true;
    this.group.add(body);

    const lid = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.36, 0.1, 10),
      LID,
    );
    lid.position.y = 1.5;
    this.group.add(lid);

    // What's spilling out of the top once nobody's emptied it for a while.
    this.heap = new THREE.Group();
    this.heap.position.y = 1.5;
    for (let i = 0; i < 7; i++) {
      const lump = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.1 + Math.random() * 0.16,
          0.08 + Math.random() * 0.12,
          0.1 + Math.random() * 0.16,
        ),
        RUBBISH,
      );
      const angle = Math.random() * Math.PI * 2;
      const out = Math.random() * 0.26;
      lump.position.set(
        Math.cos(angle) * out,
        0.06 + Math.random() * 0.18,
        Math.sin(angle) * out,
      );
      lump.rotation.set(Math.random(), Math.random(), Math.random());
      lump.castShadow = true;
      this.heap.add(lump);
    }
    this.heap.visible = false;
    this.group.add(this.heap);

    scene.add(this.group);
  }

  public getPosition(): THREE.Vector3 {
    return this.group.position.clone();
  }

  public isFull(): boolean {
    return this.fill >= REPORT_AT;
  }

  /** True once, the moment it's worth someone ringing in about. */
  public claimReport(): boolean {
    if (!this.isFull() || this.reported) return false;
    this.reported = true;
    return true;
  }

  /** Lifted out and swapped for a fresh sack. */
  public empty(): void {
    this.fill = 0;
    this.reported = false;
    this.heap.visible = false;
  }

  /** Someone put their rubbish in — the only way a bin fills. */
  public deposit(amount = DEPOSIT): void {
    this.fill = Math.min(1, this.fill + amount);
    this.heap.visible = this.isFull();
    if (this.isFull()) {
      this.heap.scale.setScalar(
        0.6 + ((this.fill - REPORT_AT) / (1 - REPORT_AT)) * 0.6,
      );
    }
  }
}
