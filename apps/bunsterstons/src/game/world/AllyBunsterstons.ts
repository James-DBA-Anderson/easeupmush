import * as THREE from "three";

/**
 * Ally Bunsterstons — pink bunny NPC who teams up on the boat.
 * Visual-only (not player-controlled).
 */
export class AllyBunsterstons {
  readonly group = new THREE.Group();
  private hop = 0;
  private punchCooldown = 0;
  private arms: THREE.Group[] = [];

  constructor(x: number, y: number, z: number) {
    this.group.position.set(x, y, z);
    this.build();
  }

  public get position(): THREE.Vector3 {
    return this.group.position;
  }

  public reset(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
    this.punchCooldown = 0;
    this.group.visible = true;
  }

  /** Chase Ken and return true when a punch lands. */
  public update(
    delta: number,
    target: THREE.Vector3,
    deckTop: number,
    bounds?: { minX: number; maxX: number; minZ: number; maxZ: number },
  ): boolean {
    this.hop += delta * 10;
    this.punchCooldown = Math.max(0, this.punchCooldown - delta);

    const dx = target.x - this.group.position.x;
    const dz = target.z - this.group.position.z;
    const dist = Math.hypot(dx, dz) || 1;
    const speed = 5.8;
    if (dist > 0.85) {
      this.group.position.x += (dx / dist) * speed * delta;
      this.group.position.z += (dz / dist) * speed * delta;
    }
    const b = bounds ?? { minX: 7, maxX: 17, minZ: -3.5, maxZ: 3.5 };
    this.group.position.x = THREE.MathUtils.clamp(
      this.group.position.x,
      b.minX,
      b.maxX,
    );
    this.group.position.z = THREE.MathUtils.clamp(
      this.group.position.z,
      b.minZ,
      b.maxZ,
    );
    this.group.position.y = deckTop + 0.55 + Math.abs(Math.sin(this.hop)) * 0.08;
    this.group.rotation.y = Math.atan2(dx, dz);

    const swing = Math.sin(this.hop) * 0.8;
    if (this.arms[0]) this.arms[0].rotation.x = -swing;
    if (this.arms[1]) this.arms[1].rotation.x = swing;

    if (dist < 1.6 && this.punchCooldown <= 0) {
      this.punchCooldown = 0.45;
      return true;
    }
    return false;
  }

  private build(): void {
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

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 12), pink);
    body.scale.set(0.92, 1.15, 0.85);
    body.castShadow = true;
    this.group.add(body);

    const tum = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), belly);
    tum.position.set(0, 0, 0.34);
    this.group.add(tum);

    const head = new THREE.Group();
    head.position.y = 0.55;
    this.group.add(head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), pink);
    skull.castShadow = true;
    head.add(skull);

    for (const side of [-1, 1] as const) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), pink);
      ear.scale.set(0.45, 1.35, 0.2);
      ear.position.set(side * 0.14, 0.15, -0.05);
      ear.rotation.x = 0.55;
      ear.rotation.z = side * 0.35;
      head.add(ear);

      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), dark);
      eye.position.set(side * 0.1, 0.02, 0.24);
      head.add(eye);

      const arm = new THREE.Group();
      arm.position.set(side * 0.34, 0.15, 0);
      this.group.add(arm);
      this.arms.push(arm);
      const armMesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.06, 0.22, 3, 6),
        pink,
      );
      armMesh.position.y = -0.16;
      arm.add(armMesh);
      arm.rotation.z = side * 0.4;

      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), pink);
      foot.scale.set(1, 0.55, 1.2);
      foot.position.set(side * 0.14, -0.4, 0.04);
      this.group.add(foot);
    }

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), dark);
    nose.position.set(0, -0.04, 0.27);
    head.add(nose);
  }
}
