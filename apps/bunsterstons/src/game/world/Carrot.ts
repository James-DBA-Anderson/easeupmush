import * as THREE from "three";

/** Gap from tip to the surface under a resting carrot. */
export const CARROT_HOVER = 0.26;

/** Orange carrot — conical body + leafy top. */
export class Carrot {
  readonly group = new THREE.Group();
  readonly restY: number;
  readonly position: THREE.Vector3;
  private taken = false;
  private bob = Math.random() * Math.PI * 2;
  private glow: THREE.Mesh;
  private greens: THREE.Group;

  constructor(x: number, y: number, z: number) {
    this.restY = y;
    this.position = new THREE.Vector3(x, y, z);
    this.group.position.copy(this.position);
    this.greens = new THREE.Group();
    this.glow = this.build();
  }

  public get collected(): boolean {
    return this.taken;
  }

  public update(delta: number, elapsed: number): void {
    if (this.taken) return;
    this.bob += delta * 3.2;
    this.group.position.y =
      this.restY + (0.5 + 0.5 * Math.sin(this.bob)) * 0.12;
    this.group.rotation.y = elapsed * 1.2;
    this.greens.rotation.z = Math.sin(elapsed * 2.2 + this.bob) * 0.1;
    this.glow.scale.setScalar(0.9 + Math.sin(elapsed * 3.5 + this.bob) * 0.12);
  }

  public tryCollect(at: THREE.Vector3, reach = 1.05): boolean {
    if (this.taken) return false;
    const dx = at.x - this.group.position.x;
    const dy = at.y - this.group.position.y;
    const dz = at.z - this.group.position.z;
    if (dx * dx + dy * dy * 0.35 + dz * dz > reach * reach) return false;
    this.taken = true;
    this.group.visible = false;
    return true;
  }

  public reset(): void {
    this.taken = false;
    this.group.visible = true;
    this.group.position.y = this.restY;
  }

  private build(): THREE.Mesh {
    const orange = new THREE.MeshStandardMaterial({
      color: 0xff8a2b,
      roughness: 0.52,
    });
    const leafA = new THREE.MeshStandardMaterial({
      color: 0x3a9a2a,
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
    const leafB = new THREE.MeshStandardMaterial({
      color: 0x5ecf4a,
      roughness: 0.7,
      side: THREE.DoubleSide,
    });

    // Conical carrot: sharp tip → linear taper → soft shoulder under the greens.
    const profile: THREE.Vector2[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const y = 0.02 + t * 0.54;
      // Mostly linear cone; tiny tip bluntness + slight belly near the top third.
      const cone = 0.01 + t * 0.17;
      const belly = Math.max(0, (t - 0.55) / 0.45) * 0.025 * (1 - t);
      const tipRound = Math.min(1, t / 0.08) ; // ramp from point
      const r = (cone + belly) * tipRound;
      profile.push(new THREE.Vector2(Math.max(0.008, r), y));
    }
    // Flat top rim where greens sit.
    profile.push(new THREE.Vector2(0.14, 0.58));
    profile.push(new THREE.Vector2(0.04, 0.6));

    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 20), orange);
    body.castShadow = true;
    this.group.add(body);

    this.greens.position.y = 0.58;
    this.group.add(this.greens);
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(
        new THREE.PlaneGeometry(0.09, 0.32),
        i % 2 === 0 ? leafA : leafB,
      );
      const ang = (i / 4) * Math.PI * 2 + 0.2;
      blade.position.set(Math.cos(ang) * 0.03, 0.14, Math.sin(ang) * 0.03);
      blade.rotation.y = ang;
      blade.rotation.z = 0.4;
      blade.rotation.x = 0.2;
      this.greens.add(blade);
    }

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.36, 0.48, 28),
      new THREE.MeshBasicMaterial({
        color: 0x9ad8ff,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    this.group.add(ring);
    return ring;
  }
}
