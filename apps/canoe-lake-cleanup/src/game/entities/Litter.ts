import * as THREE from "three";

export type LitterKind =
  | "can"
  | "bottle"
  | "crisps"
  | "paper"
  | "cup"
  | "chips";

const KINDS: readonly LitterKind[] = [
  "can",
  "bottle",
  "crisps",
  "paper",
  "cup",
  "chips",
];

/** Light rubbish shifts about in the wind; a bottle stays put. */
const BLOWS: Record<LitterKind, number> = {
  can: 0.1,
  bottle: 0,
  crisps: 1,
  paper: 0.8,
  cup: 0.4,
  chips: 0.5,
};

/** How long it takes to whip a piece onto the spike and into the sack. */
const LIFT_TIME = 0.45;

/** A dropped bit of rubbish, sat where somebody couldn't be bothered. */
export class Litter {
  private scene: THREE.Scene;
  private group: THREE.Group;
  private kind: LitterKind;
  private drift = Math.random() * Math.PI * 2;

  /** Set once speared: where it's flying to, and how far through it is. */
  private lifting = 0;
  private from = new THREE.Vector3();
  private to: THREE.Vector3 | null = null;

  constructor(scene: THREE.Scene, at: THREE.Vector3, kind?: LitterKind) {
    this.scene = scene;
    this.kind = kind ?? KINDS[Math.floor(Math.random() * KINDS.length)]!;

    this.group = this.build();
    this.group.position.set(at.x, 0, at.z);
    this.group.rotation.y = Math.random() * Math.PI * 2;
    scene.add(this.group);
  }

  private build(): THREE.Group {
    const group = new THREE.Group();
    const matt = (color: number): THREE.MeshStandardMaterial =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.85 });

    switch (this.kind) {
      case "can": {
        // Lager can on its side, dented at one end.
        const can = new THREE.Mesh(
          new THREE.CylinderGeometry(0.033, 0.033, 0.12, 10),
          new THREE.MeshStandardMaterial({
            color: 0xc9d2d8,
            roughness: 0.35,
            metalness: 0.7,
          }),
        );
        can.rotation.z = Math.PI / 2;
        can.position.y = 0.033;
        group.add(can);

        const label = new THREE.Mesh(
          new THREE.CylinderGeometry(0.035, 0.035, 0.05, 10),
          matt(0x2f6fd8),
        );
        label.rotation.z = Math.PI / 2;
        label.position.y = 0.033;
        group.add(label);
        break;
      }
      case "bottle": {
        const bottle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, 0.22, 10),
          new THREE.MeshStandardMaterial({
            color: 0x7fae7a,
            roughness: 0.2,
            transparent: true,
            opacity: 0.75,
          }),
        );
        bottle.rotation.z = Math.PI / 2;
        bottle.position.y = 0.04;
        group.add(bottle);

        const neck = new THREE.Mesh(
          new THREE.CylinderGeometry(0.018, 0.028, 0.09, 8),
          matt(0x6f9e6a),
        );
        neck.rotation.z = Math.PI / 2;
        neck.position.set(0.15, 0.04, 0);
        group.add(neck);
        break;
      }
      case "crisps": {
        // Screwed-up packet, still bright enough to spot from a way off.
        const packet = new THREE.Mesh(
          new THREE.BoxGeometry(0.16, 0.05, 0.11),
          matt(Math.random() < 0.5 ? 0xd8452f : 0x2f8f4f),
        );
        packet.position.y = 0.025;
        packet.rotation.set(0.2, 0, 0.3);
        group.add(packet);
        break;
      }
      case "paper": {
        const sheet = new THREE.Mesh(
          new THREE.BoxGeometry(0.26, 0.015, 0.2),
          matt(0xe6e2d6),
        );
        sheet.position.y = 0.01;
        sheet.rotation.x = 0.05;
        group.add(sheet);

        const fold = new THREE.Mesh(
          new THREE.BoxGeometry(0.2, 0.015, 0.14),
          matt(0xd8d3c4),
        );
        fold.position.set(0.03, 0.024, -0.02);
        fold.rotation.y = 0.4;
        group.add(fold);
        break;
      }
      case "cup": {
        const cup = new THREE.Mesh(
          new THREE.CylinderGeometry(0.045, 0.033, 0.12, 10),
          matt(0xf2ede2),
        );
        cup.rotation.z = Math.PI / 2 + 0.2;
        cup.position.y = 0.042;
        group.add(cup);

        const lid = new THREE.Mesh(
          new THREE.CylinderGeometry(0.048, 0.048, 0.02, 10),
          matt(0x3a3a40),
        );
        lid.rotation.z = Math.PI / 2 + 0.2;
        lid.position.set(-0.07, 0.05, 0.02);
        group.add(lid);
        break;
      }
      case "chips": {
        // The classic: greasy chip paper with the last few still in it.
        const paper = new THREE.Mesh(
          new THREE.BoxGeometry(0.24, 0.04, 0.18),
          matt(0xe8dfc8),
        );
        paper.position.y = 0.02;
        group.add(paper);

        for (let i = 0; i < 3; i++) {
          const chip = new THREE.Mesh(
            new THREE.BoxGeometry(0.02, 0.02, 0.08),
            matt(0xd9b45a),
          );
          chip.position.set(
            (Math.random() - 0.5) * 0.14,
            0.05,
            (Math.random() - 0.5) * 0.1,
          );
          chip.rotation.y = Math.random() * Math.PI;
          group.add(chip);
        }
        break;
      }
    }

    for (const part of group.children) part.castShadow = true;
    return group;
  }

  public getPosition(): THREE.Vector3 {
    return this.group.position.clone();
  }

  /** Whether there's anything in it a gull would come down for. */
  public isFood(): boolean {
    return this.kind === "chips" || this.kind === "crisps" || this.kind === "cup";
  }

  public isGone(): boolean {
    return this.to !== null && this.lifting >= LIFT_TIME;
  }

  /** Speared and on its way into the sack. */
  public isTaken(): boolean {
    return this.to !== null;
  }

  /** Onto the spike and away, arcing up towards wherever the sack is. */
  public spear(to: THREE.Vector3): void {
    if (this.to) return;
    this.to = to.clone();
    this.from.copy(this.group.position);
    this.lifting = 0;
  }

  public update(delta: number, breeze: number): void {
    if (this.to) {
      this.lifting += delta;
      const t = Math.min(1, this.lifting / LIFT_TIME);
      this.group.position.lerpVectors(this.from, this.to, t);
      // A bit of a hop on the way up, so it doesn't slide along the floor.
      this.group.position.y += Math.sin(t * Math.PI) * 0.5;
      this.group.rotation.x += delta * 9;
      this.group.scale.setScalar(1 - t * 0.7);
      return;
    }

    const blows = BLOWS[this.kind] * breeze;
    if (blows <= 0) return;
    this.drift += delta * (1.5 + blows * 2);
    this.group.rotation.z = Math.sin(this.drift) * 0.1 * blows;
    this.group.position.y = Math.abs(Math.sin(this.drift * 1.3)) * 0.02 * blows;
  }

  public dispose(): void {
    this.scene.remove(this.group);
    for (const part of this.group.children) {
      const mesh = part as THREE.Mesh;
      mesh.geometry?.dispose();
    }
  }
}
