import * as THREE from "three";
import { Face } from "../entities/Face";
import { parkAudio } from "../audio/ParkAudio";
import { groundHeight } from "../world/terrain";
import {
  getCleanerVanPose,
  setKerbDoorOpen,
  type CleanerVanPose,
} from "../world/cleanerVan";

type Phase =
  | "await"
  | "hold"
  | "door"
  | "exit"
  | "close"
  | "walk"
  | "swing"
  | "done";

const HOLD_FOR = 0.45;
const DOOR_FOR = 0.55;
const EXIT_FOR = 1.1;
const CLOSE_FOR = 0.55;
const RUN_SPEED = 5.4;
/** Metres to get up to pace from the door, and to pull up at the handoff. */
const RUN_UP = 1.6;
const PULL_UP = 2.2;
const SWING_FOR = 1.15;
const EYE = 1.7;
/** Camera follow spring — higher = snappier, lower = creamier. */
const CAM_FOLLOW = 5.5;
const CAM_LOOK = 6.5;
/** Tighter lens for the get-out, relaxing back to the game FOV on the run. */
const SHOT_ZOOM = 0.68;
const ZOOM_OUT_FOR = 1.4;
const YAW_FOLLOW = 7.5;

/**
 * Opening beat: third-person get-out from the kerb-side door, a run through
 * the nearest gate into the park, then the camera settles into the
 * cleaner’s eyes for the shift.
 */
export class ShiftIntro {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private avatar: THREE.Group | null = null;
  private legs: THREE.Object3D[] = [];
  private arms: THREE.Object3D[] = [];
  private face: Face | null = null;
  private van: CleanerVanPose | null = null;

  private phase: Phase = "done";
  private age = 0;
  private step = 0;
  private footBeat = -1;

  private walkCurve: THREE.CatmullRomCurve3 | null = null;
  private walkLen = 0;
  private walkAlong = 0;
  private walkYaw = 0;

  private swingFromPos = new THREE.Vector3();
  private swingFromQuat = new THREE.Quaternion();
  private swingToPos = new THREE.Vector3();
  private swingToQuat = new THREE.Quaternion();

  private follow = new THREE.Vector3();
  private look = new THREE.Vector3();
  private lookTarget = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private shotPos = new THREE.Vector3();
  private baseFov = 75;
  private setFov = -1;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.camera = camera;
  }

  public isActive(): boolean {
    return this.phase !== "done";
  }

  /** Still waiting for a click / tap so the browser will allow audio. */
  public isAwaitingGesture(): boolean {
    return this.phase === "await";
  }

  /** Begin the arrival — call once the van is in the scene. */
  public start(): boolean {
    this.van = getCleanerVanPose();
    if (!this.van) {
      this.phase = "done";
      return false;
    }

    this.avatar = this.buildAvatar();
    this.scene.add(this.avatar);
    this.seatAvatar();

    this.phase = "await";
    this.age = 0;
    this.walkAlong = 0;
    this.walkCurve = null;
    this.footBeat = -1;

    this.baseFov = this.camera.fov;
    this.applyZoom(1);
    // Seed the rig on the get-out shot so the first frame isn't a pop.
    this.doorShot(this.follow, this.lookTarget, 0);
    this.look.copy(this.lookTarget);
    this.camera.position.copy(this.follow);
    this.camera.lookAt(this.look);
    setKerbDoorOpen(0);
    return true;
  }

  /** First gesture unlocked audio — roll the get-out. */
  public beginArrival(): void {
    if (this.phase !== "await") return;
    this.phase = "hold";
    this.age = 0;
  }

  public update(delta: number): void {
    if (this.phase === "done" || !this.avatar || !this.van) return;
    this.age += delta;
    this.face?.update(delta);

    if (this.phase === "await") {
      this.seatAvatar();
      this.frameDoorShot(delta, 0);
      return;
    }

    if (this.phase === "hold") {
      this.seatAvatar();
      this.frameDoorShot(delta, 0);
      if (this.age >= HOLD_FOR) {
        this.phase = "door";
        this.age = 0;
        parkAudio.vanDoor(true);
      }
      return;
    }

    if (this.phase === "door") {
      const t = Math.min(1, this.age / DOOR_FOR);
      setKerbDoorOpen(easeInOut(t));
      this.seatAvatar();
      this.frameDoorShot(delta, 0.2 * t);
      if (t >= 1) {
        this.phase = "exit";
        this.age = 0;
      }
      return;
    }

    if (this.phase === "exit") {
      const t = Math.min(1, this.age / EXIT_FOR);
      const e = easeInOut(t);
      setKerbDoorOpen(1);
      this.poseExit(e);
      this.frameDoorShot(delta, 0.2 + 0.5 * e);
      if (t >= 1) {
        this.phase = "close";
        this.age = 0;
        this.avatar.position.set(
          this.van.exitX,
          groundHeight(this.van.exitX, this.van.exitZ),
          this.van.exitZ,
        );
        const toDoor = Math.atan2(
          this.van.x - this.van.exitX,
          this.van.z - this.van.exitZ,
        );
        this.walkYaw = toDoor;
        this.avatar.rotation.set(0, toDoor, 0);
        parkAudio.footstep(true);
      }
      return;
    }

    if (this.phase === "close") {
      const t = Math.min(1, this.age / CLOSE_FOR);
      const e = easeInOut(t);
      setKerbDoorOpen(1 - e);
      const [leftArm, rightArm] = this.arms;
      rightArm!.rotation.x = -0.9 * Math.sin(e * Math.PI);
      rightArm!.rotation.z = -0.25 * Math.sin(e * Math.PI);
      leftArm!.rotation.x = 0;
      for (const leg of this.legs) leg.rotation.x = 0;
      this.frameDoorShot(delta, 0.7);
      if (t >= 1) {
        setKerbDoorOpen(0);
        parkAudio.vanDoor(false);
        this.beginWalk();
      }
      return;
    }

    if (this.phase === "walk") {
      this.tickWalk(delta);
      return;
    }

    if (this.phase === "swing") {
      this.tickSwing(delta);
    }
  }

  /** Final eye pose once first-person takes over. */
  public eyeHandoff(): {
    x: number;
    y: number;
    z: number;
    yaw: number;
  } | null {
    if (!this.van) return null;
    const x = this.van.pathX;
    const z = this.van.pathZ;
    return {
      x,
      y: EYE + groundHeight(x, z),
      z,
      yaw: this.van.pathYaw,
    };
  }

  private finish(): void {
    this.applyZoom(0);
    if (this.avatar) {
      this.scene.remove(this.avatar);
      this.avatar = null;
    }
    setKerbDoorOpen(0);
    this.phase = "done";
  }

  /** Build a smooth run from the door, through the gate, into the park. */
  private beginWalk(): void {
    if (!this.avatar || !this.van) return;
    this.phase = "walk";
    this.age = 0;
    this.walkAlong = 0;
    this.step = 0;

    for (const arm of this.arms) {
      arm.rotation.x = 0;
      arm.rotation.z = 0;
    }

    const pts: THREE.Vector3[] = [
      new THREE.Vector3(
        this.van.exitX,
        groundHeight(this.van.exitX, this.van.exitZ),
        this.van.exitZ,
      ),
    ];
    for (const p of this.van.walkVia) {
      pts.push(new THREE.Vector3(p.x, groundHeight(p.x, p.z), p.z));
    }
    // Ensure we finish exactly on the handoff spot.
    const end = pts[pts.length - 1]!;
    if (
      Math.hypot(end.x - this.van.pathX, end.z - this.van.pathZ) > 0.4
    ) {
      pts.push(
        new THREE.Vector3(
          this.van.pathX,
          groundHeight(this.van.pathX, this.van.pathZ),
          this.van.pathZ,
        ),
      );
    } else {
      end.set(
        this.van.pathX,
        groundHeight(this.van.pathX, this.van.pathZ),
        this.van.pathZ,
      );
    }

    // Deduplicate near-identical control points so the spline doesn't kink.
    const cleaned: THREE.Vector3[] = [pts[0]!];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i]!;
      const prev = cleaned[cleaned.length - 1]!;
      if (prev.distanceTo(p) > 0.85) cleaned.push(p);
      else cleaned[cleaned.length - 1] = p;
    }
    if (cleaned.length < 2) {
      cleaned.push(
        new THREE.Vector3(
          this.van.pathX,
          groundHeight(this.van.pathX, this.van.pathZ),
          this.van.pathZ,
        ),
      );
    }

    this.walkCurve = new THREE.CatmullRomCurve3(cleaned, false, "catmullrom", 0.35);
    this.walkLen = Math.max(0.5, this.walkCurve.getLength());
  }

  private tickWalk(delta: number): void {
    if (!this.avatar || !this.van || !this.walkCurve) return;
    this.applyZoom(1 - easeInOut(Math.min(1, this.age / ZOOM_OUT_FOR)));

    // Break into a run from the door, pull up on arrival.
    const ramp = Math.min(
      1,
      this.walkAlong / RUN_UP,
      (this.walkLen - this.walkAlong) / PULL_UP,
    );
    const pace = 0.3 + 0.7 * easeInOut(Math.max(0, ramp));
    const speed = RUN_SPEED * pace;
    this.walkAlong = Math.min(this.walkLen, this.walkAlong + speed * delta);
    const t = Math.min(1, this.walkAlong / this.walkLen);

    const at = this.walkCurve.getPointAt(t);
    at.y = groundHeight(at.x, at.z);
    this.avatar.position.copy(at);

    // Look a little ahead along the curve so corners aren't snap-turns.
    const lookT = Math.min(1, t + 0.08 / Math.max(1, this.walkLen));
    const ahead = this.walkCurve.getPointAt(lookT);
    let wantYaw = Math.atan2(ahead.x - at.x, ahead.z - at.z);
    if (t > 0.88) {
      // Settle facing the lake for the handoff.
      wantYaw = lerpAngle(wantYaw, this.van.pathYaw, (t - 0.88) / 0.12);
    }
    this.walkYaw = lerpAngle(this.walkYaw, wantYaw, 1 - Math.exp(-YAW_FOLLOW * delta));
    this.avatar.rotation.set(0.14 * pace, this.walkYaw, 0);

    this.step += delta * speed * 2.0;
    this.stride(this.step, pace);
    const beat = Math.floor(this.step / Math.PI);
    if (beat !== this.footBeat) {
      this.footBeat = beat;
      parkAudio.footstep(beat % 2 === 0);
    }
    this.frameCamera(delta, 4.5, 2.3, 1.2);

    if (t >= 1) {
      this.avatar.position.set(
        this.van.pathX,
        groundHeight(this.van.pathX, this.van.pathZ),
        this.van.pathZ,
      );
      this.walkYaw = this.van.pathYaw;
      this.avatar.rotation.set(0, this.walkYaw, 0);
      for (const leg of this.legs) leg.rotation.x = 0;
      for (const arm of this.arms) arm.rotation.x = 0;
      this.beginSwing();
    }
  }

  private beginSwing(): void {
    if (!this.avatar || !this.van) return;
    this.phase = "swing";
    this.age = 0;
    this.swingFromPos.copy(this.camera.position);
    this.swingFromQuat.copy(this.camera.quaternion);

    const x = this.van.pathX;
    const z = this.van.pathZ;
    const y = EYE + groundHeight(x, z);
    this.swingToPos.set(x, y, z);

    const lookYaw = this.van.pathYaw;
    // Cameras look down −Z; match Player.takeOverFromIntro so the swing
    // lands facing the same way as first-person (Object3D.lookAt faces +Z).
    const fx = Math.sin(lookYaw);
    const fz = Math.cos(lookYaw);
    this.swingToQuat.setFromEuler(
      new THREE.Euler(0, Math.atan2(-fx, -fz), 0, "YXZ"),
    );

    this.avatar.rotation.y = lookYaw;
    this.walkYaw = lookYaw;
  }

  private tickSwing(_delta: number): void {
    if (!this.van) return;
    const t = Math.min(1, this.age / SWING_FOR);
    const e = easeInOut(t);

    // Soft blend from the follow cam into the eyes — no orbit whip.
    this.camera.position.lerpVectors(this.swingFromPos, this.swingToPos, e);
    this.camera.quaternion.slerpQuaternions(
      this.swingFromQuat,
      this.swingToQuat,
      e,
    );

    if (this.avatar) this.avatar.visible = e < 0.82;

    if (t >= 1) {
      this.camera.position.copy(this.swingToPos);
      this.camera.quaternion.copy(this.swingToQuat);
      this.finish();
    }
  }

  /**
   * Get-out shot: kerb side, just behind the cab door (it hinges at the front
   * and swings forward, so the opening stays in view), looking into the cab.
   * `track` 0 frames the door, 1 frames the cleaner's head.
   */
  private doorShot(pos: THREE.Vector3, look: THREE.Vector3, track: number): void {
    const van = this.van!;
    const cos = Math.cos(van.yaw);
    const sin = Math.sin(van.yaw);
    const ground = groundHeight(van.x, van.z);
    const at = (lx: number, lz: number, y: number, out: THREE.Vector3) =>
      out.set(van.x + lx * cos + lz * sin, y, van.z - lx * sin + lz * cos);
    at(-0.2, 3.7, ground + 1.8, pos);
    at(1.3, 0.9, ground + 1.3, look);
    if (this.avatar && track > 0) {
      this.tmp.set(
        this.avatar.position.x,
        this.avatar.position.y + 1.25,
        this.avatar.position.z,
      );
      look.lerp(this.tmp, track);
    }
  }

  /** 1 = full get-out zoom, 0 = the game's own FOV. */
  private applyZoom(amount: number): void {
    // The game resets FOV on resize; pick that up as the new base.
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

  private frameDoorShot(delta: number, track: number): void {
    this.applyZoom(1);
    this.doorShot(this.shotPos, this.lookTarget, track);
    this.follow.lerp(this.shotPos, 1 - Math.exp(-CAM_FOLLOW * delta));
    this.camera.position.copy(this.follow);
    this.look.lerp(this.lookTarget, 1 - Math.exp(-CAM_LOOK * delta));
    this.camera.lookAt(this.look);
  }

  /**
   * Third-person follow — exponential smooth so phase changes don't jerk.
   */
  private frameCamera(
    delta: number,
    back: number,
    height: number,
    side: number,
  ): void {
    if (!this.avatar) return;
    const yaw = this.avatar.rotation.y;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const sx = Math.cos(yaw);
    const sz = -Math.sin(yaw);
    this.tmp.set(
      this.avatar.position.x - fx * back + sx * side,
      this.avatar.position.y + height,
      this.avatar.position.z - fz * back + sz * side,
    );
    const k = 1 - Math.exp(-CAM_FOLLOW * delta);
    this.follow.lerp(this.tmp, k);
    this.camera.position.copy(this.follow);

    this.lookTarget.set(
      this.avatar.position.x + fx * 0.4,
      this.avatar.position.y + 1.28,
      this.avatar.position.z + fz * 0.4,
    );
    this.look.lerp(this.lookTarget, 1 - Math.exp(-CAM_LOOK * delta));
    this.camera.lookAt(this.look);
  }

  private seatAvatar(): void {
    if (!this.avatar || !this.van) return;
    this.avatar.position.set(
      this.van.seatX,
      this.van.seatY - 0.95,
      this.van.seatZ,
    );
    const vanYaw = this.van.yaw;
    const face = Math.atan2(Math.cos(vanYaw), -Math.sin(vanYaw));
    this.avatar.rotation.set(0.12, face, 0);
    this.walkYaw = face;
    this.legs[0]!.rotation.x = -1.15;
    this.legs[1]!.rotation.x = -1.05;
    this.arms[0]!.rotation.x = -0.55;
    this.arms[1]!.rotation.x = -0.45;
  }

  /** Slide from seat to the driver’s door. */
  private poseExit(t: number): void {
    if (!this.avatar || !this.van) return;
    const van = this.van;
    const y0 = van.seatY - 0.95;
    const y1 = groundHeight(van.exitX, van.exitZ);
    // Ease the step out so it doesn't look like a linear slide.
    const e = easeInOut(t);
    // Shuffle across the cab to the doorway, then step down onto the kerb.
    const SPLIT = 0.55;
    const sitFace = Math.atan2(Math.cos(van.yaw), -Math.sin(van.yaw));
    const outFace = Math.atan2(van.exitX - van.doorX, van.exitZ - van.doorZ);
    if (e < SPLIT) {
      const k = e / SPLIT;
      this.avatar.position.set(
        THREE.MathUtils.lerp(van.seatX, van.doorX, k),
        y0,
        THREE.MathUtils.lerp(van.seatZ, van.doorZ, k),
      );
      this.walkYaw = lerpAngle(sitFace, outFace, k);
    } else {
      const k = (e - SPLIT) / (1 - SPLIT);
      this.avatar.position.set(
        THREE.MathUtils.lerp(van.doorX, van.exitX, k),
        THREE.MathUtils.lerp(y0, y1, k * k),
        THREE.MathUtils.lerp(van.doorZ, van.exitZ, k),
      );
      this.walkYaw = lerpAngle(outFace, van.exitYaw, k);
    }
    this.avatar.rotation.y = this.walkYaw;
    this.avatar.rotation.x = THREE.MathUtils.lerp(0.12, 0, e);
    this.legs[0]!.rotation.x = THREE.MathUtils.lerp(-1.15, 0, e);
    this.legs[1]!.rotation.x = THREE.MathUtils.lerp(-1.05, 0, e);
    this.arms[0]!.rotation.x = THREE.MathUtils.lerp(-0.55, 0, e);
    this.arms[1]!.rotation.x = THREE.MathUtils.lerp(-0.45, 0, e);
    if (t > 0.2 && t < 0.65) {
      const duck = Math.sin(((t - 0.2) / 0.45) * Math.PI);
      this.avatar.rotation.x = duck * 0.28;
    }
  }

  /** Jog cycle; `effort` 0 = brisk walk, 1 = full run. */
  private stride(phase: number, effort = 1): void {
    const swing = Math.sin(phase) * (0.5 + 0.45 * effort);
    this.legs[0]!.rotation.x = swing;
    this.legs[1]!.rotation.x = -swing;
    this.arms[0]!.rotation.x = -swing * 0.9;
    this.arms[1]!.rotation.x = swing * 0.9;
    this.avatar!.position.y =
      groundHeight(this.avatar!.position.x, this.avatar!.position.z) +
      Math.abs(Math.sin(phase)) * (0.04 + 0.07 * effort);
  }

  private buildAvatar(): THREE.Group {
    const group = new THREE.Group();
    const coat = new THREE.MeshStandardMaterial({
      color: 0xc9a227,
      roughness: 0.85,
    });
    const hiVis = new THREE.MeshStandardMaterial({
      color: 0x2a2a2c,
      roughness: 0.9,
    });
    const legMat = new THREE.MeshStandardMaterial({
      color: 0x2b3038,
      roughness: 0.9,
    });
    const skin = new THREE.MeshStandardMaterial({
      color: 0xd9a066,
      roughness: 0.8,
    });
    const shoeMat = new THREE.MeshStandardMaterial({
      color: 0x2a2420,
      roughness: 1,
    });

    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.22), legMat);
    hips.position.y = 0.92;
    hips.castShadow = true;
    group.add(hips);

    const torso = new THREE.Group();
    torso.position.y = 1.0;
    group.add(torso);

    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.24), coat);
    chest.position.y = 0.28;
    chest.castShadow = true;
    torso.add(chest);

    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 0.08, 0.26),
      hiVis,
    );
    stripe.position.y = 0.22;
    torso.add(stripe);

    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8),
      skin,
    );
    neck.position.y = 0.6;
    torso.add(neck);

    const head = new THREE.Group();
    head.position.y = 0.72;
    torso.add(head);
    this.face = new Face(skin);
    head.add(this.face.group);

    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.17, 0.08, 10),
      hiVis,
    );
    cap.position.y = 0.14;
    head.add(cap);
    const peak = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.1), hiVis);
    peak.position.set(0, 0.1, 0.12);
    head.add(peak);

    for (const side of [-1, 1] as const) {
      const arm = new THREE.Group();
      arm.position.set(side * 0.27, 0.48, 0);
      torso.add(arm);
      const upper = new THREE.Mesh(
        new THREE.BoxGeometry(0.11, 0.32, 0.12),
        coat,
      );
      upper.geometry.translate(0, -0.16, 0);
      upper.castShadow = true;
      arm.add(upper);
      const forearm = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.28, 0.1),
        coat,
      );
      forearm.geometry.translate(0, -0.14, 0);
      forearm.position.y = -0.32;
      forearm.castShadow = true;
      arm.add(forearm);
      this.arms.push(arm);

      const leg = new THREE.Group();
      leg.position.set(side * 0.11, 0.92, 0);
      group.add(leg);
      const thigh = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.4, 0.16),
        legMat,
      );
      thigh.geometry.translate(0, -0.2, 0);
      thigh.castShadow = true;
      leg.add(thigh);
      const shin = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.38, 0.14),
        legMat,
      );
      shin.geometry.translate(0, -0.19, 0);
      shin.position.y = -0.4;
      shin.castShadow = true;
      leg.add(shin);
      const shoe = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.07, 0.22),
        shoeMat,
      );
      shoe.position.set(0, -0.4, 0.04);
      shin.add(shoe);
      this.legs.push(leg);
    }

    return group;
  }
}

function easeInOut(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
