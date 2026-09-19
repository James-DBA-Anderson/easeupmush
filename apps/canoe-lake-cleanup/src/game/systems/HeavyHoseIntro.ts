import * as THREE from "three";
import { Face } from "../entities/Face";
import { parkAudio } from "../audio/ParkAudio";
import { groundHeight } from "../world/terrain";
import {
  getCleanerVanPose,
  hoseStandWorld,
  hoseWalkVia,
  setHeavyHoseBayVisible,
  setRearDoorsOpen,
  type CleanerVanPose,
} from "../world/cleanerVan";

type Phase = "approach" | "open" | "grab" | "walk" | "swing" | "done";

const APPROACH_SPEED = 2.6;
const OPEN_FOR = 0.7;
const GRAB_FOR = 1.15;
const WALK_SPEED = 2.7;
const SWING_FOR = 1.05;
const EYE = 1.7;
const CAM_FOLLOW = 5.5;
const CAM_LOOK = 6.5;
const YAW_FOLLOW = 7.5;

/**
 * Third-person beat: walk to the load bay, swing the doors, take the heavy
 * hose, then walk back onto park paving before first-person resumes.
 */
export class HeavyHoseIntro {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private avatar: THREE.Group | null = null;
  private legs: THREE.Object3D[] = [];
  private arms: THREE.Object3D[] = [];
  private hoseProp: THREE.Object3D | null = null;
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

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.camera = camera;
  }

  public isActive(): boolean {
    return this.phase !== "done";
  }

  /**
   * Begin at the player's current world spot. Returns false if the van isn't
   * available.
   */
  public start(fromX: number, fromZ: number): boolean {
    this.van = getCleanerVanPose();
    const stand = hoseStandWorld();
    if (!this.van || !stand) {
      this.phase = "done";
      return false;
    }

    this.avatar = this.buildAvatar();
    this.scene.add(this.avatar);
    this.avatar.position.set(fromX, groundHeight(fromX, fromZ), fromZ);
    this.walkYaw = Math.atan2(stand.x - fromX, stand.z - fromZ);
    this.avatar.rotation.y = this.walkYaw;

    this.phase = "approach";
    this.age = 0;
    this.walkAlong = 0;
    this.walkCurve = null;
    this.footBeat = -1;
    this.beginApproach(fromX, fromZ, stand.x, stand.z);

    this.follow.copy(this.camera.position);
    this.look.set(fromX, EYE, fromZ);
    this.lookTarget.copy(this.look);
    setRearDoorsOpen(0);
    setHeavyHoseBayVisible(true);
    return true;
  }

  public update(delta: number): void {
    if (this.phase === "done" || !this.avatar || !this.van) return;
    this.age += delta;
    this.face?.update(delta);

    if (this.phase === "approach") {
      this.tickApproach(delta);
      return;
    }
    if (this.phase === "open") {
      this.tickOpen();
      return;
    }
    if (this.phase === "grab") {
      this.tickGrab();
      return;
    }
    if (this.phase === "walk") {
      this.tickWalk(delta);
      return;
    }
    if (this.phase === "swing") {
      this.tickSwing();
    }
  }

  /** Eye pose once first-person takes over on the path. */
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
    if (this.avatar) {
      this.scene.remove(this.avatar);
      this.avatar = null;
    }
    this.hoseProp = null;
    this.phase = "done";
  }

  private beginApproach(
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number,
  ): void {
    const midX = (fromX + toX) * 0.5;
    const midZ = (fromZ + toZ) * 0.5;
    const pts = [
      new THREE.Vector3(fromX, groundHeight(fromX, fromZ), fromZ),
      new THREE.Vector3(midX, groundHeight(midX, midZ), midZ),
      new THREE.Vector3(toX, groundHeight(toX, toZ), toZ),
    ];
    this.walkCurve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.2);
    this.walkLen = Math.max(0.4, this.walkCurve.getLength());
    this.walkAlong = 0;
  }

  private tickApproach(delta: number): void {
    if (!this.avatar || !this.walkCurve) return;
    this.walkAlong = Math.min(this.walkLen, this.walkAlong + APPROACH_SPEED * delta);
    const t = Math.min(1, this.walkAlong / this.walkLen);
    const at = this.walkCurve.getPointAt(t);
    at.y = groundHeight(at.x, at.z);
    this.avatar.position.copy(at);

    const lookT = Math.min(1, t + 0.1);
    const ahead = this.walkCurve.getPointAt(lookT);
    const wantYaw = Math.atan2(ahead.x - at.x, ahead.z - at.z);
    this.walkYaw = lerpAngle(this.walkYaw, wantYaw, 1 - Math.exp(-YAW_FOLLOW * delta));
    this.avatar.rotation.y = this.walkYaw;

    this.step += delta * APPROACH_SPEED * 4;
    this.stride(this.step);
    this.noteFoot();
    this.frameCamera(delta, 4.2, 2.2, 1.1);

    // Crack the doors as they arrive.
    setRearDoorsOpen(t * 0.35);

    if (t >= 1) {
      const stand = hoseStandWorld();
      if (stand) {
        this.avatar.position.set(
          stand.x,
          groundHeight(stand.x, stand.z),
          stand.z,
        );
        this.walkYaw = stand.yaw;
        this.avatar.rotation.y = stand.yaw;
      }
      for (const leg of this.legs) leg.rotation.x = 0;
      for (const arm of this.arms) arm.rotation.x = 0;
      this.phase = "open";
      this.age = 0;
      parkAudio.vanDoor(true);
    }
  }

  private tickOpen(): void {
    const t = Math.min(1, this.age / OPEN_FOR);
    const e = easeInOut(t);
    setRearDoorsOpen(0.35 + e * 0.65);
    this.frameCamera(0.016, 3.6, 2.0, 0.6);
    if (t >= 1) {
      this.phase = "grab";
      this.age = 0;
    }
  }

  private tickGrab(): void {
    if (!this.avatar) return;
    const t = Math.min(1, this.age / GRAB_FOR);
    const e = easeInOut(t);
    const [leftArm, rightArm] = this.arms;

    // Reach into the bay, then haul the lance out onto the shoulder.
    if (t < 0.45) {
      const r = e / 0.45;
      rightArm!.rotation.x = -1.35 * r;
      rightArm!.rotation.z = -0.35 * r;
      leftArm!.rotation.x = -0.4 * r;
    } else {
      const r = (e - 0.45) / 0.55;
      rightArm!.rotation.x = THREE.MathUtils.lerp(-1.35, -0.55, r);
      rightArm!.rotation.z = THREE.MathUtils.lerp(-0.35, -0.15, r);
      leftArm!.rotation.x = THREE.MathUtils.lerp(-0.4, -0.25, r);
      if (r > 0.15 && !this.hoseProp) {
        setHeavyHoseBayVisible(false);
        this.attachHose();
      }
    }

    this.frameCamera(0.016, 3.2, 1.9, 0.45);
    if (t >= 1) {
      rightArm!.rotation.x = -0.55;
      rightArm!.rotation.z = -0.15;
      leftArm!.rotation.x = -0.25;
      this.beginWalkBack();
    }
  }

  private attachHose(): void {
    if (!this.avatar || this.hoseProp) return;
    const rightArm = this.arms[1];
    if (!rightArm) return;
    const group = new THREE.Group();
    const lance = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.05, 1.2, 6),
      new THREE.MeshStandardMaterial({ color: 0x6a7078, roughness: 0.85 }),
    );
    lance.rotation.z = Math.PI / 2;
    lance.position.set(0.55, -0.35, 0.05);
    group.add(lance);
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.07, 0.07),
      new THREE.MeshStandardMaterial({ color: 0xe07020, roughness: 0.9 }),
    );
    band.position.set(0.7, -0.35, 0.05);
    group.add(band);
    rightArm.add(group);
    this.hoseProp = group;
  }

  private beginWalkBack(): void {
    if (!this.avatar || !this.van) return;
    const via = hoseWalkVia();
    if (!via || via.length < 2) {
      this.beginSwing();
      return;
    }

    this.phase = "walk";
    this.age = 0;
    this.walkAlong = 0;
    this.step = 0;

    const pts = via.map(
      (p) => new THREE.Vector3(p.x, groundHeight(p.x, p.z), p.z),
    );
    // Start from wherever they grabbed.
    pts[0] = this.avatar.position.clone();
    const end = pts[pts.length - 1]!;
    if (Math.hypot(end.x - this.van.pathX, end.z - this.van.pathZ) > 0.4) {
      pts.push(
        new THREE.Vector3(
          this.van.pathX,
          groundHeight(this.van.pathX, this.van.pathZ),
          this.van.pathZ,
        ),
      );
    }

    const cleaned: THREE.Vector3[] = [pts[0]!];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i]!;
      const prev = cleaned[cleaned.length - 1]!;
      if (prev.distanceTo(p) > 0.75) cleaned.push(p);
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

    this.walkCurve = new THREE.CatmullRomCurve3(
      cleaned,
      false,
      "catmullrom",
      0.35,
    );
    this.walkLen = Math.max(0.5, this.walkCurve.getLength());
  }

  private tickWalk(delta: number): void {
    if (!this.avatar || !this.van || !this.walkCurve) return;

    const u = Math.min(1, this.walkAlong / this.walkLen);
    const pace = 0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, u * 1.05));
    const speed = WALK_SPEED * pace;
    this.walkAlong = Math.min(this.walkLen, this.walkAlong + speed * delta);
    const t = Math.min(1, this.walkAlong / this.walkLen);

    const at = this.walkCurve.getPointAt(t);
    at.y = groundHeight(at.x, at.z);
    this.avatar.position.copy(at);

    const lookT = Math.min(1, t + 0.08 / Math.max(1, this.walkLen));
    const ahead = this.walkCurve.getPointAt(lookT);
    let wantYaw = Math.atan2(ahead.x - at.x, ahead.z - at.z);
    if (t > 0.88) {
      wantYaw = lerpAngle(wantYaw, this.van.pathYaw, (t - 0.88) / 0.12);
    }
    this.walkYaw = lerpAngle(
      this.walkYaw,
      wantYaw,
      1 - Math.exp(-YAW_FOLLOW * delta),
    );
    this.avatar.rotation.y = this.walkYaw;

    // Carry the lance — arms stay busy, legs stride.
    this.step += delta * speed * 4.0;
    const swing = Math.sin(this.step) * 0.45;
    this.legs[0]!.rotation.x = swing;
    this.legs[1]!.rotation.x = -swing;
    this.arms[0]!.rotation.x = -0.25 + swing * 0.2;
    this.arms[1]!.rotation.x = -0.55;
    this.avatar.position.y =
      groundHeight(this.avatar.position.x, this.avatar.position.z) +
      Math.abs(Math.sin(this.step)) * 0.04;
    this.noteFoot();
    this.frameCamera(delta, 4.4, 2.25, 1.15);

    // Ease the barn doors shut behind them once they've cleared the hatch.
    if (t > 0.2) {
      setRearDoorsOpen(Math.max(0, 1 - (t - 0.2) / 0.35));
    }

    if (t >= 1) {
      this.avatar.position.set(
        this.van.pathX,
        groundHeight(this.van.pathX, this.van.pathZ),
        this.van.pathZ,
      );
      this.walkYaw = this.van.pathYaw;
      this.avatar.rotation.y = this.walkYaw;
      for (const leg of this.legs) leg.rotation.x = 0;
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
  }

  private tickSwing(): void {
    const t = Math.min(1, this.age / SWING_FOR);
    const e = easeInOut(t);
    this.camera.position.lerpVectors(this.swingFromPos, this.swingToPos, e);
    this.camera.quaternion.slerpQuaternions(
      this.swingFromQuat,
      this.swingToQuat,
      e,
    );
    if (this.avatar) this.avatar.visible = e < 0.8;
    if (t >= 1) {
      this.camera.position.copy(this.swingToPos);
      this.camera.quaternion.copy(this.swingToQuat);
      setRearDoorsOpen(0);
      this.finish();
    }
  }

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
      this.avatar.position.x + fx * 0.35,
      this.avatar.position.y + 1.25,
      this.avatar.position.z + fz * 0.35,
    );
    this.look.lerp(this.lookTarget, 1 - Math.exp(-CAM_LOOK * delta));
    this.camera.lookAt(this.look);
  }

  private stride(phase: number): void {
    const swing = Math.sin(phase) * 0.55;
    this.legs[0]!.rotation.x = swing;
    this.legs[1]!.rotation.x = -swing;
    this.arms[0]!.rotation.x = -swing * 0.75;
    this.arms[1]!.rotation.x = swing * 0.75;
    this.avatar!.position.y =
      groundHeight(this.avatar!.position.x, this.avatar!.position.z) +
      Math.abs(Math.sin(phase)) * 0.04;
  }

  private noteFoot(): void {
    const beat = Math.floor(this.step / Math.PI);
    if (beat === this.footBeat) return;
    this.footBeat = beat;
    parkAudio.footstep(beat % 2 === 0);
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
    }

    for (const side of [-1, 1] as const) {
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
