import * as THREE from 'three';

export class Dropping {
  private mesh: THREE.Mesh;
  private scene: THREE.Scene;
  private cleanProgress = 0;
  private maxHealth = 100;

  constructor(position: THREE.Vector3, scene: THREE.Scene) {
    this.scene = scene;
    
    const geometry = new THREE.CylinderGeometry(0.15, 0.2, 0.1, 8);
    const material = new THREE.MeshStandardMaterial({ 
      color: 0xe8f0e8,
      roughness: 0.9,
    });
    
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.copy(position);
    this.mesh.position.y = 0.05;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    
    scene.add(this.mesh);
  }

  public clean(): void {
    this.cleanProgress += 5;
    
    const scale = 1 - (this.cleanProgress / this.maxHealth) * 0.7;
    this.mesh.scale.set(scale, scale, scale);
    
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
