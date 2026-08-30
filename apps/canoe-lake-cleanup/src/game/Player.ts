import * as THREE from "three";
import type { Game } from "./Game";
import { MobileControls } from "./MobileControls";
import { WaterJet } from "./effects/WaterJet";
import { LitterPicker } from "./effects/LitterPicker";
import { KERB_OUT, distanceToShore, isInLake } from "./world/lake";
import { atRailings } from "./world/fence";
import { atParkBuilding } from "./world/park";

const WALK_SPEED = 9;
const SPRINT_SPEED = 15;
const WORLD_LIMIT = 170;

/** How far in front of the boots the spike can reach. */
const PICKER_REACH = 2;

/** How long a tool takes to come up or go down. */
const SWAP_TIME = 0.28;
/** How long with nothing worth doing in front of them before it's put away. */
const STOW_AFTER = 4;
/** Picking a tool by hand holds off the automatic swapping for a bit. */
const MANUAL_HOLD = 10;

export type Tool = "hose" | "picker";

export class Player {
  private camera: THREE.PerspectiveCamera;
  private domElement: HTMLElement;
  private game: Game;
  private mobileControls: MobileControls;
  private jet: WaterJet;
  private picker: LitterPicker;
  /** What's in their hands, what's wanted next, and how far through the
   * business of swapping over they are: 0 up and ready, 1 down out of sight. */
  private tool: Tool | null = "hose";
  private wanted: Tool | null = "hose";
  private holster = 0;
  /** Seconds with nothing to do in front of them, and how long the last
   * hand-picked tool stays picked. */
  private idle = 0;
  private manual = 0;

  private moveForward = false;
  private moveBackward = false;
  private moveLeft = false;
  private moveRight = false;
  private sprinting = false;
  private isSpraying = false;

  private velocity = new THREE.Vector3();
  private direction = new THREE.Vector3();

  private euler = new THREE.Euler(0, 0, 0, "YXZ");
  private locked = false;

  private sprayIndicator: HTMLElement;
  private mouseSensitivity = 0.002;

  /** World-space knockback, and the wobble that goes with taking a peck. */
  private knock = new THREE.Vector3();
  private shake = 0;
  private shakeOffset = new THREE.Vector3();

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    game: Game,
    scene: THREE.Scene,
  ) {
    this.camera = camera;
    this.domElement = domElement;
    this.game = game;

    this.sprayIndicator = document.getElementById("spray-indicator")!;
    this.mobileControls = new MobileControls();
    this.jet = new WaterJet(scene, camera, {
      onImpact: (point) => this.game.washAt(point),
      onBodyHit: (point) => this.game.sprayHitsBody(point),
    });
    this.picker = new LitterPicker(camera);
    this.picker.setStowed(true);

    this.setupPointerLock();
    this.setupEventListeners();
  }

  private setupPointerLock(): void {
    this.domElement.addEventListener("click", () => {
      if (!this.locked) {
        this.domElement.requestPointerLock();
      }
    });

    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === this.domElement;
    });

    document.addEventListener("pointerlockerror", () => {
      console.error("Pointer lock error");
    });
  }

  private setupEventListeners(): void {
    document.addEventListener("keydown", (event) => this.onKeyDown(event));
    document.addEventListener("keyup", (event) => this.onKeyUp(event));
    document.addEventListener("mousedown", (event) => this.onMouseDown(event));
    document.addEventListener("mouseup", (event) => this.onMouseUp(event));
    document.addEventListener("mousemove", (event) => this.onMouseMove(event));
  }

  private onKeyDown(event: KeyboardEvent): void {
    switch (event.code) {
      case "KeyW":
      case "ArrowUp":
        this.moveForward = true;
        break;
      case "KeyS":
      case "ArrowDown":
        this.moveBackward = true;
        break;
      case "KeyA":
      case "ArrowLeft":
        this.moveLeft = true;
        break;
      case "KeyD":
      case "ArrowRight":
        this.moveRight = true;
        break;
      case "ShiftLeft":
      case "ShiftRight":
        this.sprinting = true;
        break;
      case "Digit1":
        this.pickTool("hose", true);
        break;
      case "Digit2":
        this.pickTool("picker", true);
        break;
      case "KeyQ":
        this.pickTool(this.wanted === "hose" ? "picker" : "hose", true);
        break;
      case "Escape":
        if (this.locked) {
          document.exitPointerLock();
        }
        break;
    }
  }

  /**
   * Calls for a different tool. It isn't in their hands straight away: the
   * one they're holding goes down first, then the new one comes up.
   */
  private pickTool(tool: Tool | null, byHand = false): void {
    if (byHand) this.manual = MANUAL_HOLD;
    if (tool === this.wanted) return;
    this.wanted = tool;
    this.setSpraying(false);
  }

  /**
   * Runs the swap. Whatever's in their hands drops out of sight, the belt
   * changes over at the bottom of the move, and the new one comes back up.
   */
  private swapTools(delta: number): void {
    const changing = this.tool !== this.wanted;
    const step = delta / SWAP_TIME;

    if (changing || this.wanted === null) {
      this.holster = Math.min(1, this.holster + step);
      // Fully down: that's the moment the other one comes off the belt.
      if (this.holster >= 1 && changing) {
        this.tool = this.wanted;
        this.game.showTool(this.tool);
      }
    } else {
      this.holster = Math.max(0, this.holster - step);
    }

    this.jet.setStowed(this.tool !== "hose");
    this.picker.setStowed(this.tool !== "picker");
    if (this.tool === "hose") this.jet.setHolster(this.holster);
    if (this.tool === "picker") this.picker.setHolster(this.holster);
  }

  /** True once whatever they're holding is up and usable. */
  private ready(): boolean {
    return this.tool !== null && this.tool === this.wanted && this.holster < 0.2;
  }

  /**
   * Watches what they're looking at and has the right thing in their hands
   * for it, so the shift runs without fiddling with the number keys. Left
   * alone with nothing to do, they put it away.
   */
  private readTheJob(delta: number): void {
    if (this.manual > 0) {
      this.manual -= delta;
      return;
    }

    const forward = this.camera
      .getWorldDirection(new THREE.Vector3())
      .setY(0)
      .normalize();
    const job = this.game.jobInSight(this.camera.position, forward, this.wanted);

    if (job) {
      this.idle = 0;
      this.pickTool(job);
      return;
    }

    // Nothing in front of them. Give it a moment in case they're just
    // turning round, then put it away.
    this.idle += delta;
    if (this.idle > STOW_AFTER) this.pickTool(null);
  }

  private onKeyUp(event: KeyboardEvent): void {
    switch (event.code) {
      case "KeyW":
      case "ArrowUp":
        this.moveForward = false;
        break;
      case "KeyS":
      case "ArrowDown":
        this.moveBackward = false;
        break;
      case "KeyA":
      case "ArrowLeft":
        this.moveLeft = false;
        break;
      case "KeyD":
      case "ArrowRight":
        this.moveRight = false;
        break;
      case "ShiftLeft":
      case "ShiftRight":
        this.sprinting = false;
        break;
    }
  }

  private onMouseDown(event: MouseEvent): void {
    if (event.button !== 0 || !this.locked) return;
    this.use(true);
  }

  /** Trigger pulled. Empty-handed, it fetches whatever the job in front
   * of them needs rather than doing nothing. */
  private use(down: boolean): void {
    if (!down) {
      this.setSpraying(false);
      return;
    }

    if (this.tool === null || !this.ready()) {
      const forward = this.camera
        .getWorldDirection(new THREE.Vector3())
        .setY(0)
        .normalize();
      const job = this.game.jobInSight(this.camera.position, forward) ?? "hose";
      this.pickTool(job);
      return;
    }

    if (this.tool === "picker") this.picker.strike();
    else this.setSpraying(true);
  }

  private onMouseUp(event: MouseEvent): void {
    if (event.button === 0) this.use(false);
  }

  private setSpraying(on: boolean): void {
    this.isSpraying = on;
    this.sprayIndicator.classList.toggle("spraying", on);
  }

  private onMouseMove(event: MouseEvent): void {
    if (!this.locked || this.mobileControls.isEnabled()) return;

    const movementX = event.movementX || 0;
    const movementY = event.movementY || 0;

    this.euler.setFromQuaternion(this.camera.quaternion);
    this.euler.y -= movementX * this.mouseSensitivity;
    this.euler.x -= movementY * this.mouseSensitivity;
    this.euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.euler.x));
    this.camera.quaternion.setFromEuler(this.euler);
  }

  /** Knocked about by a swan that's had enough of you. */
  public shove(from: THREE.Vector3): void {
    const away = new THREE.Vector3()
      .subVectors(this.camera.position, from)
      .setY(0);
    if (away.lengthSq() < 0.001) away.set(0, 0, 1);
    this.knock.copy(away.normalize().multiplyScalar(9));
    this.shake = 0.45;
  }

  public update(delta: number): void {
    // Undo last frame's wobble before working out where we actually are.
    this.camera.position.sub(this.shakeOffset);
    this.shakeOffset.set(0, 0, 0);

    // Stay in step with the camera in case anything else has turned it.
    this.euler.setFromQuaternion(this.camera.quaternion);
    const usingMobile = this.mobileControls.isEnabled();
    const active = this.locked || usingMobile;

    if (active && usingMobile) {
      const lookDelta = this.mobileControls.getLookDelta();
      if (lookDelta.x !== 0 || lookDelta.y !== 0) {
        this.euler.setFromQuaternion(this.camera.quaternion);
        this.euler.y -= lookDelta.x;
        this.euler.x -= lookDelta.y;
        this.euler.x = Math.max(
          -Math.PI / 2,
          Math.min(Math.PI / 2, this.euler.x),
        );
        this.camera.quaternion.setFromEuler(this.euler);
      }
      // The one thumb button does whichever job is in their hands.
      const pressed = this.mobileControls.getIsSpraying();
      if (this.tool === "picker") {
        if (pressed) this.use(true);
      } else if (pressed !== this.isSpraying) {
        this.use(pressed);
      }
    }

    if (active) {
      if (usingMobile) {
        // Stick right and stick down are positive, matching local +x and +z.
        const input = this.mobileControls.getMoveInput();
        this.direction.set(input.x, 0, input.y);
      } else {
        this.direction.set(
          Number(this.moveRight) - Number(this.moveLeft),
          0,
          Number(this.moveBackward) - Number(this.moveForward),
        );
      }
      if (this.direction.lengthSq() > 0) this.direction.normalize();

      const speed = this.sprinting ? SPRINT_SPEED : WALK_SPEED;
      const wanted = this.direction.clone().multiplyScalar(speed);
      this.velocity.lerp(wanted, Math.min(1, 12 * delta));
    } else {
      this.velocity.lerp(new THREE.Vector3(), Math.min(1, 12 * delta));
    }

    const step = this.velocity.clone().multiplyScalar(delta);
    step.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.euler.y);
    step.addScaledVector(this.knock, delta);
    this.knock.multiplyScalar(Math.max(0, 1 - 6 * delta));
    this.moveWithCollision(step);

    this.camera.position.y = 1.7;

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - delta);
      const jolt = this.shake * 0.35;
      this.shakeOffset.set(
        (Math.random() - 0.5) * jolt,
        (Math.random() - 0.5) * jolt,
        (Math.random() - 0.5) * jolt,
      );
      this.camera.position.add(this.shakeOffset);
    }

    if (active) this.readTheJob(delta);
    this.swapTools(delta);

    const hosing = this.isSpraying && this.tool === "hose" && this.ready() && active;
    if (this.isSpraying && !hosing) this.setSpraying(false);
    this.jet.update(delta, hosing);

    if (this.picker.update(delta) && this.game.spearLitter(this.reachPoint())) {
      this.picker.stow();
    }
  }

  /** The patch of ground the spike comes down on. */
  private reachPoint(): THREE.Vector3 {
    const forward = this.camera
      .getWorldDirection(new THREE.Vector3())
      .setY(0)
      .normalize();
    return this.camera.position
      .clone()
      .addScaledVector(forward, PICKER_REACH)
      .setY(0);
  }

  /** Where a speared bit of rubbish is heading. */
  public sackPoint(): THREE.Vector3 {
    return this.picker.sackPoint();
  }

  /** Axis-by-axis so brushing the water's edge slides rather than sticking. */
  private moveWithCollision(step: THREE.Vector3): void {
    const pos = this.camera.position;
    for (const axis of ["x", "z"] as const) {
      const next = pos.clone();
      next[axis] += step[axis];
      if (this.canStand(next.x, next.z)) pos[axis] = next[axis];
    }
    if (Math.abs(pos.x) > WORLD_LIMIT) pos.x = Math.sign(pos.x) * WORLD_LIMIT;
    if (Math.abs(pos.z) > WORLD_LIMIT) pos.z = Math.sign(pos.z) * WORLD_LIMIT;
  }

  /** Yaw in radians, for the mini map arrow. */
  public getHeading(): number {
    return this.euler.y;
  }

  public isHosing(): boolean {
    return this.isSpraying;
  }

  private canStand(x: number, z: number): boolean {
    if (isInLake(x, z) || atRailings(x, z) || atParkBuilding(x, z)) return false;
    // Pull up at the kerbstones rather than stood on top of them.
    return distanceToShore(x, z) > KERB_OUT;
  }
}
