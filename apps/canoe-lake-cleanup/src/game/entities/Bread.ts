import * as THREE from "three";
import { WATER_Y, isInLake } from "../world/lake";

const CRUMBS = 14;
const SPREAD = 1.3;

/** A handful of bread on the path or floating on the lake, and the crowd it draws. */
export class Bread {
  private scene: THREE.Scene;
  private group = new THREE.Group();
  private crumbs: THREE.Mesh[] = [];
  private centre: THREE.Vector3;
  private afloat: boolean;

  constructor(scene: THREE.Scene, at: THREE.Vector3) {
    this.scene = scene;
    this.centre = at.clone().setY(0);
    this.afloat = isInLake(at.x, at.z);

    const crust = new THREE.MeshStandardMaterial({
      color: 0xe8d7a8,
      roughness: 1,
    });
    for (let i = 0; i < CRUMBS; i++) {
      const size = 0.06 + Math.random() * 0.07;
      const crumb = new THREE.Mesh(
        new THREE.BoxGeometry(size, size * 0.45, size),
        crust,
      );
      const angle = Math.random() * Math.PI * 2;
      const reach = Math.random() * SPREAD;
      // On the water they sit just proud of the surface; on the path, on the paving.
      crumb.position.set(
        Math.cos(angle) * reach,
        this.afloat ? 0.015 : 0.03,
        Math.sin(angle) * reach,
      );
      crumb.rotation.set(
        (Math.random() - 0.5) * 0.4,
        Math.random() * Math.PI,
        (Math.random() - 0.5) * 0.4,
      );
      crumb.castShadow = true;
      this.group.add(crumb);
      this.crumbs.push(crumb);
    }

    this.group.position.set(
      this.centre.x,
      this.afloat ? WATER_Y + 0.01 : 0,
      this.centre.z,
    );
    scene.add(this.group);
  }

  public getPosition(): THREE.Vector3 {
    return this.centre.clone();
  }

  public isAfloat(): boolean {
    return this.afloat;
  }

  /** One peck. Takes a crumb off the pile. */
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
