import * as THREE from 'three';

const CRUMBS = 14;
const SPREAD = 1.3;

/** A handful of bread sprinkled on the path, and the crowd it draws. */
export class Bread {
  private scene: THREE.Scene;
  private group = new THREE.Group();
  private crumbs: THREE.Mesh[] = [];
  private centre: THREE.Vector3;

  constructor(scene: THREE.Scene, at: THREE.Vector3) {
    this.scene = scene;
    this.centre = at.clone().setY(0);

    const crust = new THREE.MeshStandardMaterial({ color: 0xe8d7a8, roughness: 1 });
    for (let i = 0; i < CRUMBS; i++) {
      const size = 0.06 + Math.random() * 0.07;
      const crumb = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.5, size), crust);
      const angle = Math.random() * Math.PI * 2;
      const reach = Math.random() * SPREAD;
      crumb.position.set(Math.cos(angle) * reach, 0.03, Math.sin(angle) * reach);
      crumb.rotation.y = Math.random() * Math.PI;
      crumb.castShadow = true;
      this.group.add(crumb);
      this.crumbs.push(crumb);
    }

    this.group.position.copy(this.centre);
    scene.add(this.group);
  }

  public getPosition(): THREE.Vector3 {
    return this.centre;
  }

  /** One peck. Takes a crumb off the path. */
  public peck(): void {
    const crumb = this.crumbs.pop();
    crumb?.removeFromParent();
  }

  public isGone(): boolean {
    return this.crumbs.length === 0;
  }

  /** How picked over it is, for the birds deciding whether to bother. */
  public remaining(): number {
    return this.crumbs.length;
  }

  public dispose(): void {
    this.scene.remove(this.group);
  }
}
