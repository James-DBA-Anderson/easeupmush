import * as THREE from 'three';

export type DropKind = 'swan' | 'fox' | 'gull';

export class Dropping {
  private mesh: THREE.Mesh;
  private cleanProgress = 0;
  private maxHealth = 100;
  private trodden = false;

  constructor(position: THREE.Vector3, scene: THREE.Scene, kind: DropKind = 'swan') {
    // Fox scat is a smaller, darker, tapered thing than a swan's offering,
    // and a gull's is a thin white splat dropped from a height.
    const geometry =
      kind === 'fox'
        ? new THREE.CylinderGeometry(0.04, 0.09, 0.22, 6)
        : kind === 'gull'
          ? new THREE.CylinderGeometry(0.13, 0.11, 0.03, 7)
          : new THREE.CylinderGeometry(0.15, 0.2, 0.1, 8);
    const material = new THREE.MeshStandardMaterial({
      color: kind === 'fox' ? 0x4a3a28 : kind === 'gull' ? 0xf4f6ee : 0xe8f0e8,
      roughness: 0.9,
    });
    
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.copy(position);
    this.mesh.position.y = 0.05;
    if (kind === 'fox') {
      // Left lying on its side, pointing any old way.
      this.mesh.rotation.set(Math.PI / 2, 0, Math.random() * Math.PI);
      this.mesh.position.y = 0.04;
    }
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    
    scene.add(this.mesh);
  }

  /** Someone has stood in it. Squashed flat, spread wider and gone grubby. */
  public tread(): void {
    if (this.trodden) return;
    this.trodden = true;

    this.mesh.scale.set(1.5, 0.35, 1.5);
    this.mesh.rotation.y = Math.random() * Math.PI;
    (this.mesh.material as THREE.MeshStandardMaterial).color.setHex(0xd6d8c4);
  }

  public isTrodden(): boolean {
    return this.trodden;
  }

  public clean(): void {
    this.cleanProgress += 5;
    
    const scale = 1 - (this.cleanProgress / this.maxHealth) * 0.7;
    if (this.trodden) this.mesh.scale.set(scale * 1.5, scale * 0.35, scale * 1.5);
    else this.mesh.scale.set(scale, scale, scale);
    
    const material = this.mesh.material as THREE.MeshStandardMaterial;
    material.opacity = Math.max(0, 1 - (this.cleanProgress / this.maxHealth));
    material.transparent = true;
  }

  public isCleaned(): boolean {
    return this.cleanProgress >= this.maxHealth;
  }

  public getMesh(): THREE.Mesh {
    return this.mesh;
  }
}
