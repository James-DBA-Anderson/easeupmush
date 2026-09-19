import * as THREE from "three";
import { gameAudio } from "../audio";

/** Ken — big hamster boss. Knock him off the boat into lava. */
export class Ken {
  readonly group = new THREE.Group();
  private vel = new THREE.Vector3();
  private hop = 0;
  private hurtTimer = 0;
  private body!: THREE.Mesh;
  private readonly home: THREE.Vector3;
  private _alive = true;
  private onDeck = true;

  /** Boat deck half-extents (world). */
  deckMinX = 6.5;
  deckMaxX = 17.5;
  deckMinZ = -3.8;
  deckMaxZ = 3.8;

  constructor(x: number, y: number, z: number) {
    this.home = new THREE.Vector3(x, y, z);
    this.group.position.copy(this.home);
    this.build();
  }

  public get alive(): boolean {
    return this._alive;
  }

  public get position(): THREE.Vector3 {
    return this.group.position;
  }

  public reset(): void {
    this._alive = true;
    this.onDeck = true;
    this.group.position.copy(this.home);
    this.vel.set(0, 0, 0);
    this.hurtTimer = 0;
    this.group.visible = true;
    (this.body.material as THREE.MeshStandardMaterial).color.setHex(0xd4a574);
  }

  /**
   * Shove Ken away from `from`.
   * If `towardEdge`, slight bias toward the nearest deck rim.
   * Ken is heavy — hits inch him toward the lava rather than launching him.
   */
  public knock(
    from: THREE.Vector3,
    power = 7,
    towardEdge = false,
  ): boolean {
    if (!this._alive || this.hurtTimer > 0) return false;
    let dx = this.group.position.x - from.x;
    let dz = this.group.position.z - from.z;
    let d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;

    if (towardEdge) {
      const toMinX = this.group.position.x - this.deckMinX;
      const toMaxX = this.deckMaxX - this.group.position.x;
      const toMinZ = this.group.position.z - this.deckMinZ;
      const toMaxZ = this.deckMaxZ - this.group.position.z;
      const nearest = Math.min(toMinX, toMaxX, toMinZ, toMaxZ);
      let ex = 0;
      let ez = 0;
      if (nearest === toMinX) ex = -1;
      else if (nearest === toMaxX) ex = 1;
      else if (nearest === toMinZ) ez = -1;
      else ez = 1;
      // Mostly shove away from attacker; light pull toward rim.
      dx = dx * 0.7 + ex * 0.3;
      dz = dz * 0.7 + ez * 0.3;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
    }

    this.vel.x = dx * power;
    this.vel.z = dz * power;
    this.vel.y = 2.8;
    this.group.position.x += dx * 0.28;
    this.group.position.z += dz * 0.28;
    this.onDeck = false;
    this.hurtTimer = 0.55;
    (this.body.material as THREE.MeshStandardMaterial).color.setHex(0xff6644);
    gameAudio.knock();
    return true;
  }

  public update(
    delta: number,
    elapsed: number,
    target: THREE.Vector3,
    deckTop: number,
  ): void {
    if (!this._alive) return;
    this.hop += delta * 6;
    this.hurtTimer = Math.max(0, this.hurtTimer - delta);
    if (this.hurtTimer <= 0 && this.onDeck) {
      (this.body.material as THREE.MeshStandardMaterial).color.setHex(0xd4a574);
    }

    if (this.onDeck) {
      // Waddle toward the player.
      const dx = target.x - this.group.position.x;
      const dz = target.z - this.group.position.z;
      const dist = Math.hypot(dx, dz) || 1;
      const speed = 2.8;
      this.vel.x = THREE.MathUtils.damp(this.vel.x, (dx / dist) * speed, 6, delta);
      this.vel.z = THREE.MathUtils.damp(this.vel.z, (dz / dist) * speed, 6, delta);
      this.group.position.x += this.vel.x * delta;
      this.group.position.z += this.vel.z * delta;
      // Keep Ken inland while waddling — only solid knocks get him near the rim.
      this.group.position.x = THREE.MathUtils.clamp(
        this.group.position.x,
        this.deckMinX + 1.1,
        this.deckMaxX - 1.1,
      );
      this.group.position.z = THREE.MathUtils.clamp(
        this.group.position.z,
        this.deckMinZ + 1.1,
        this.deckMaxZ - 1.1,
      );
      this.group.position.y =
        deckTop + 0.55 + Math.abs(Math.sin(this.hop)) * 0.1;
      this.group.rotation.y = Math.atan2(dx, dz);
      this.group.rotation.z = Math.sin(elapsed * 3) * 0.06;
    } else {
      // Airborne after a knock — heavy fall, quick horizontal bleed-off.
      this.vel.y -= 32 * delta;
      this.vel.x = THREE.MathUtils.damp(this.vel.x, 0, 3.2, delta);
      this.vel.z = THREE.MathUtils.damp(this.vel.z, 0, 3.2, delta);
      this.group.position.x += this.vel.x * delta;
      this.group.position.z += this.vel.z * delta;
      this.group.position.y += this.vel.y * delta;
      this.group.rotation.x += delta * 4;
      this.group.rotation.z += delta * 3;

      // Land back on deck if still over it.
      const onPad =
        this.group.position.x > this.deckMinX &&
        this.group.position.x < this.deckMaxX &&
        this.group.position.z > this.deckMinZ &&
        this.group.position.z < this.deckMaxZ;
      if (onPad && this.group.position.y <= deckTop + 0.55 && this.vel.y <= 0) {
        this.group.position.y = deckTop + 0.55;
        this.vel.set(0, 0, 0);
        this.onDeck = true;
        this.group.rotation.x = 0;
        this.group.rotation.z = 0;
      }

      // Into the lava — defeated.
      if (this.group.position.y < 0.4) {
        this._alive = false;
        this.group.visible = false;
      }
    }
  }

  private build(): void {
    const fur = new THREE.MeshStandardMaterial({
      color: 0xd4a574,
      roughness: 0.85,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x3a2818,
      roughness: 0.7,
    });
    const pink = new THREE.MeshStandardMaterial({
      color: 0xff9bb5,
      roughness: 0.55,
    });
    const white = new THREE.MeshStandardMaterial({
      color: 0xfff8ef,
      roughness: 0.5,
    });

    this.body = new THREE.Mesh(new THREE.SphereGeometry(0.7, 18, 14), fur);
    this.body.scale.set(1.15, 0.95, 1.05);
    this.body.castShadow = true;
    this.group.add(this.body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), fur);
    head.position.set(0, 0.35, 0.55);
    head.castShadow = true;
    this.group.add(head);

    const cheekL = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), fur);
    cheekL.position.set(-0.28, 0.25, 0.7);
    this.group.add(cheekL);
    const cheekR = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), fur);
    cheekR.position.set(0.28, 0.25, 0.7);
    this.group.add(cheekR);

    for (const side of [-1, 1] as const) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), pink);
      ear.scale.set(0.7, 1, 0.4);
      ear.position.set(side * 0.28, 0.65, 0.45);
      this.group.add(ear);

      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), dark);
      eye.position.set(side * 0.14, 0.42, 0.88);
      this.group.add(eye);

      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.04), white);
      tooth.position.set(side * 0.05, 0.22, 0.92);
      this.group.add(tooth);

      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), pink);
      foot.scale.set(1.1, 0.5, 1.3);
      foot.position.set(side * 0.35, -0.55, 0.15);
      this.group.add(foot);
    }

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), dark);
    nose.position.set(0, 0.32, 0.95);
    this.group.add(nose);
  }
}
