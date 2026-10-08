import * as THREE from "three";
import type { Face } from "../entities/Face";
import { buildWarden } from "../entities/WardenModel";
import { groundHeight } from "../world/terrain";
import { getCleanerVanPose } from "../world/cleanerVan";
import { PATH_OUTER, offsetShore } from "../world/lake";

type Phase = "hold" | "zoom" | "done";

const EYE = 1.7;
const ZOOM_FOR = 2.15;
const SHOT_ZOOM = 0.78;

/**
 * Opening beat: the cleaner is already on the path. The camera holds a
 * third-person look (title screen), then dollies into their eyes.
 */
export class ShiftIntro {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private avatar: THREE.Group | null = null;
  private face: Face | null = null;

  private phase: Phase = "done";
  private age = 0;

  private eye = new THREE.Vector3();
  private eyeYaw = 0;
  private fromPos = new THREE.Vector3();
  private fromQuat = new THREE.Quaternion();
  private toPos = new THREE.Vector3();
  private toQuat = new THREE.Quaternion();
  private look = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private aim = new THREE.Matrix4();
  private baseFov = 75;
  private setFov = -1;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.camera = camera;
  }

  public isActive(): boolean {
    return this.phase !== "done";
  }

  /** Title is up — waiting for Start, not a canvas click. */
  public isAwaitingGesture(): boolean {
    return this.phase === "hold";
  }

  /** Place the cleaner on the path and hold the establishing shot. */
  public start(): boolean {
    const spot = startSpot();
    if (!spot) {
      this.phase = "done";
      return false;
    }

    this.eye.set(spot.x, EYE + groundHeight(spot.x, spot.z), spot.z);
    this.eyeYaw = spot.yaw;

    this.avatar = this.buildAvatar();
    this.avatar.position.set(spot.x, groundHeight(spot.x, spot.z), spot.z);
    this.avatar.rotation.set(0, spot.yaw, 0);
    this.scene.add(this.avatar);

    this.phase = "hold";
    this.age = 0;
    this.baseFov = this.camera.fov;
    this.seedShot();
    this.camera.position.copy(this.fromPos);
    this.camera.quaternion.copy(this.fromQuat);
    this.applyZoom(1);
    this.lookAtHead();
    return true;
  }

  /** Start clicked — dolly into first person. */
  public beginArrival(): void {
    if (this.phase !== "hold") return;
    this.seedShot();
    this.fromPos.copy(this.camera.position);
    this.fromQuat.copy(this.camera.quaternion);
    this.phase = "zoom";
    this.age = 0;
  }

  public update(delta: number): void {
    if (this.phase === "done") return;
    this.age += delta;
    this.face?.update(delta);

    if (this.phase === "hold") {
      this.seedShot();
      this.camera.position.lerp(this.fromPos, 1 - Math.exp(-4 * delta));
      this.lookAtHead();
      this.applyZoom(1);
      return;
    }

    if (this.phase === "zoom") {
      const t = Math.min(1, this.age / ZOOM_FOR);
      const e = t * t * (3 - 2 * t);
      this.camera.position.lerpVectors(this.fromPos, this.toPos, e);
      this.camera.quaternion.slerpQuaternions(this.fromQuat, this.toQuat, e);
      this.applyZoom(1 - e);
      if (this.avatar) this.avatar.visible = e < 0.78;
      if (t >= 1) {
        this.camera.position.copy(this.toPos);
        this.camera.quaternion.copy(this.toQuat);
        this.finish();
      }
    }
  }

  public eyeHandoff(): {
    x: number;
    y: number;
    z: number;
    yaw: number;
  } | null {
    if (this.eye.lengthSq() < 0.01) return null;
    return { x: this.eye.x, y: this.eye.y, z: this.eye.z, yaw: this.eyeYaw };
  }

  private seedShot(): void {
    const fx = Math.sin(this.eyeYaw);
    const fz = Math.cos(this.eyeYaw);
    const sx = Math.cos(this.eyeYaw);
    const sz = -Math.sin(this.eyeYaw);
    this.fromPos.set(
      this.eye.x - fx * 7.4 + sx * 1.15,
      this.eye.y + 1.55,
      this.eye.z - fz * 7.4 + sz * 1.15,
    );
    this.toPos.copy(this.eye);
    this.tmp.set(this.eye.x + fx, this.eye.y, this.eye.z + fz);
    this.aim.lookAt(
      this.fromPos,
      this.eye.clone().setY(this.eye.y - 0.18),
      new THREE.Vector3(0, 1, 0),
    );
    this.fromQuat.setFromRotationMatrix(this.aim);
    this.aim.lookAt(this.toPos, this.tmp, new THREE.Vector3(0, 1, 0));
    this.toQuat.setFromRotationMatrix(this.aim);
  }

  private lookAtHead(): void {
    if (!this.avatar) {
      this.camera.lookAt(this.eye);
      return;
    }
    this.look.set(
      this.avatar.position.x,
      this.avatar.position.y + 1.35,
      this.avatar.position.z,
    );
    this.camera.lookAt(this.look);
  }

  private applyZoom(amount: number): void {
    if (this.setFov >= 0 && this.camera.fov !== this.setFov) {
      this.baseFov = this.camera.fov;
    }
    const k = Math.max(0, Math.min(1, amount));
    const fov = this.baseFov * (1 - (1 - SHOT_ZOOM) * k);
    if (fov !== this.camera.fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.setFov = fov;
  }

  private finish(): void {
    this.applyZoom(0);
    if (this.avatar) {
      this.scene.remove(this.avatar);
      this.avatar = null;
    }
    this.phase = "done";
  }

  private buildAvatar(): THREE.Group {
    const rig = buildWarden();
    this.face = rig.face;
    return rig.group;
  }
}

function startSpot(): { x: number; z: number; yaw: number } | null {
  const van = getCleanerVanPose();
  if (van) return { x: van.pathX, z: van.pathZ, yaw: van.pathYaw };
  const ring = offsetShore(PATH_OUTER - 2);
  if (ring.length === 0) return null;
  const start = ring.reduce((best, point) => (point.y > best.y ? point : best));
  return {
    x: start.x,
    z: start.y,
    yaw: Math.atan2(-start.x, -start.y),
  };
}
