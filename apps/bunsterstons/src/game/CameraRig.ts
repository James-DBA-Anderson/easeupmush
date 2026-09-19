import * as THREE from "three";

/** Soft 3/4 chase camera — classic platformer angle. */
export class CameraRig {
  private camera: THREE.PerspectiveCamera;
  private offset = new THREE.Vector3(9.5, 8.2, 11.5);
  private look = new THREE.Vector3();
  private pos = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  public snapTo(target: THREE.Vector3): void {
    this.pos.copy(target).add(this.offset);
    this.look.copy(target).add(new THREE.Vector3(0, 1.1, 0));
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }

  public update(target: THREE.Vector3, delta: number): void {
    const desired = target.clone().add(this.offset);
    const lookAt = target.clone().add(new THREE.Vector3(0, 1.1, 0));
    const t = 1 - Math.exp(-4.5 * delta);
    this.pos.lerp(desired, t);
    this.look.lerp(lookAt, t);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }
}
