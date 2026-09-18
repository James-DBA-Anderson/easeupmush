import * as THREE from "three";
import type { Game } from "./Game";
import { MobileControls } from "./MobileControls";
import { WaterJet } from "./effects/WaterJet";
import { LitterPicker } from "./effects/LitterPicker";
import { isInLake, WATER_Y, wadeFootY } from "./world/lake";
import { groundHeight } from "./world/terrain";
import { insidePark } from "./world/fence";
import { isBlocked } from "./world/blocking";
import {
  boardPedalo,
  consumePedaloImpact,
  consumePedaloSinkEject,
  disembarkPedalo,
  drivePedalo,
  isPedaloHired,
  pedaloAttitude,
  pedaloInReach,
  pedaloPedalPhase,
  pedaloSeatPose,
  pedaloSpeed,
} from "./world/park";
import { parkAudio } from "./audio/ParkAudio";

const WALK_SPEED = 9;
const SPRINT_SPEED = 15;
/** Chest-deep slog across the bed — no sprinting through swan soup. */
const WADE_SPEED = 2.8;
const WORLD_LIMIT = 200;
const EYE_HEIGHT = 1.7;

/** Head-bob: steps per metre, and how far the view dips and sways. */
const BOB_STEP = 1.55;
const BOB_HEIGHT = 0.032;
const BOB_SWAY = 0.018;
const BOB_ROLL = 0.014;

/** How far in front of the boots the spike can reach. */
const PICKER_REACH = 2;

/** How long a tool takes to come up or go down. */
const SWAP_TIME = 0.28;
/** How long with nothing worth doing in front of them before it's put away. */
const STOW_AFTER = 4;
/** Picking a tool by hand holds off the automatic swapping for a bit. */
const MANUAL_HOLD = 10;

export type Tool = "hose" | "picker" | "heavyHose";

/** Two minutes of full-bore heavy hose on the van tank. */
const HEAVY_TANK = 120;

export class Player {
  private camera: THREE.PerspectiveCamera;
  private domElement: HTMLElement;
  private game: Game;
  private mobileControls: MobileControls;
  private jet: WaterJet;
  private picker: LitterPicker;
  /** What's in their hands, what's wanted next, and how far through the
   * business of swapping over they are: 0 up and ready, 1 down out of sight. */
  private tool: Tool | null = null;
  private wanted: Tool | null = null;
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

  private mouseSensitivity = 0.002;

  /** World-space knockback, and the wobble that goes with taking a peck. */
  private knock = new THREE.Vector3();
  private shake = 0;
  private shakeOffset = new THREE.Vector3();

  /** Walking bob — phase in radians, and the offsets applied this frame. */
  private bobPhase = 0;
  private bobAmount = 0;
  private bobOffset = new THREE.Vector3();
  private bobRoll = 0;

  /** Extra eye height while stood on a stacked mess lump. */
  private groundLift = 0;
  private groundLiftTarget = 0;

  /** Were we in the lake last frame — for the entry splash. */
  private wasWading = false;
  /** Pending splash for the game to pick up (entry or walking wake). */
  private wadeSplashAt: THREE.Vector3 | null = null;
  private wadeSplashBig = false;
  private wakeAcc = 0;
  /** Debounce mobile spray-tap used to leave a pedalo. */
  private pedaloExitHold = 0;
  /** First-person boots on the pedals while hired. */
  private pedalFeet: THREE.Group | null = null;
  private pedalBootL: THREE.Object3D | null = null;
  private pedalBootR: THREE.Object3D | null = null;
  /** 0–1 how hard the pedals are turning — for churn audio. */
  private pedalEffort = 0;
  /** Sitting in the council van / arrival cinematic. */
  private inVan = false;
  /** Seconds left on the load-bay heavy reel. */
  private heavyTank = 0;

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    game: Game,
    scene: THREE.Scene,
  ) {
    this.camera = camera;
    this.domElement = domElement;
    this.game = game;

    this.mobileControls = new MobileControls();
    this.jet = new WaterJet(scene, camera, {
      onImpact: (point, direction) => this.game.washAt(point, direction),
      onBodyHit: (point, dirty, direction) =>
        this.game.sprayHitsBody(point, dirty, direction),
      onFaceHit: (dirty) => this.game.splashFace(dirty),
    });
    this.picker = new LitterPicker(camera);
    this.picker.setStowed(true);

    this.setupPointerLock();
    this.setupEventListeners();
  }

  private setupPointerLock(): void {
    this.domElement.addEventListener("click", () => {
      void parkAudio.unlock();
      if (this.game.isAwaitingIntroGesture()) {
        this.game.noteIntroGesture();
        return;
      }
      if (this.game.isIntroPlaying()) return;
      if (this.game.isPaused() || this.locked) return;
      this.domElement.requestPointerLock();
    });

    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === this.domElement;
      if (this.locked) void parkAudio.unlock();
    });

    document.addEventListener("pointerlockerror", () => {
      console.error("Pointer lock error");
    });
  }

  private setupEventListeners(): void {
    document.addEventListener("keydown", (event) => {
      void parkAudio.unlock();
      if (this.game.isAwaitingIntroGesture()) this.game.noteIntroGesture();
      this.onKeyDown(event);
    });
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
      case "KeyE":
        event.preventDefault();
        if (this.game.isIntroPlaying()) break;
        if (this.game.tryGrabHeavyHose(this.camera.position)) break;
        if (this.game.hasClockedOn()) this.togglePedalo();
        break;
      case "Escape":
        event.preventDefault();
        this.game.togglePause();
        break;
    }
  }

  /** Drop whatever they're doing — used when the shift is paused. */
  public halt(): void {
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.sprinting = false;
    this.setSpraying(false);
    if (this.locked) document.exitPointerLock();
  }

  /**
   * Calls for a different tool. It isn't in their hands straight away: the
   * one they're holding goes down first, then the new one comes up.
   */
  private pickTool(tool: Tool | null, byHand = false): void {
    if (!this.game.hasClockedOn() && tool !== null) return;
    if (this.heavyTank > 0 && this.tool === "heavyHose" && tool !== "heavyHose") {
      return;
    }
    if (byHand) this.manual = MANUAL_HOLD;
    if (tool === this.wanted) return;
    this.wanted = tool;
    this.setSpraying(false);
  }

  /** Mission 4 — heavy reel from the van load bay. */
  public equipHeavyHose(): void {
    this.heavyTank = HEAVY_TANK;
    this.jet.setHeavyMode(true);
    this.jet.setPressure(1);
    this.pickTool("heavyHose", true);
  }

  public isHeavyHoseActive(): boolean {
    return this.tool === "heavyHose" && this.heavyTank > 0;
  }

  public heavyTankFraction(): number {
    return this.heavyTank / HEAVY_TANK;
  }

  /** Hose out once they've stepped onto the path. */
  public pickStartingTool(): void {
    this.pickTool("hose", true);
  }

  /** Sit quietly while the third-person arrival plays. */
  public beginIntro(): void {
    this.inVan = true;
    this.wanted = null;
    this.tool = null;
    this.holster = 1;
    this.jet.setStowed(true);
    this.picker.setStowed(true);
  }

  public endIntro(): void {
    this.inVan = false;
  }

  /** First-person takes over at the path after the camera swing. */
  public takeOverFromIntro(
    x: number,
    y: number,
    z: number,
    faceYaw: number,
  ): void {
    this.inVan = false;
    this.camera.position.set(x, y, z);
    const fx = Math.sin(faceYaw);
    const fz = Math.cos(faceYaw);
    this.euler.set(0, Math.atan2(-fx, -fz), 0);
    this.camera.quaternion.setFromEuler(this.euler);
    this.velocity.set(0, 0, 0);
  }

  public isInVan(): boolean {
    return this.inVan;
  }

  /** @deprecated Replaced by the cinematic intro. */
  public seatInVan(): void {
    this.beginIntro();
  }

  /** @deprecated Replaced by the cinematic intro. */
  public leaveVan(_x: number, _z: number, _faceYaw: number): void {
    this.inVan = false;
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

    const hosingTool = this.tool === "hose" || this.tool === "heavyHose";
    this.jet.setStowed(!hosingTool);
    this.picker.setStowed(this.tool !== "picker");
    if (hosingTool) this.jet.setHolster(this.holster);
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

  /** Trigger pulled. Empty-handed, the lance comes out; once it's up, spray
   * or jab depending on what's in their hands. */
  private use(down: boolean): void {
    if (!down) {
      this.setSpraying(false);
      return;
    }

    if (this.inVan) {
      this.game.exitVan();
      return;
    }

    if (this.game.isIntroPlaying()) return;

    if (!this.game.hasClockedOn()) return;

    if (this.game.tryGrabHeavyHose(this.camera.position)) return;

    // Board a hire swan when you're next to one (E also boards / climbs out).
    if (
      !isPedaloHired() &&
      pedaloInReach(this.camera.position.x, this.camera.position.z)
    ) {
      this.togglePedalo();
      return;
    }

    // Put away or mid-stow — fire always draws the lance.
    if (this.wanted === null || this.tool === null) {
      this.idle = 0;
      this.pickTool(this.heavyTank > 0 ? "heavyHose" : "hose", true);
      return;
    }

    // Still coming up off the belt — hold it there and wait.
    if (!this.ready()) {
      this.idle = 0;
      this.manual = Math.max(this.manual, MANUAL_HOLD);
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
  }

  private onMouseMove(event: MouseEvent): void {
    if (!this.locked || this.mobileControls.isEnabled()) return;

    const movementX = event.movementX || 0;
    const movementY = event.movementY || 0;

    // While hired / in the van, look euler is authoritative — reading the
    // camera would bake in boat pitch or fight the seat pose.
    if (!isPedaloHired() && !this.inVan && !this.game.isIntroPlaying()) {
      this.euler.setFromQuaternion(this.camera.quaternion);
    }
    // Game canvas is CSS-flipped on X so FP matches the N-up map; invert yaw
    // so mouse/stick still turn the way they look.
    this.euler.y += movementX * this.mouseSensitivity;
    this.euler.x -= movementY * this.mouseSensitivity;
    this.euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.euler.x));
    this.euler.z = this.bobRoll;
    if (isPedaloHired()) return;
    this.camera.quaternion.setFromEuler(this.euler);
  }

  /** Knocked about by a swan that's had enough of you. */
  public shove(from: THREE.Vector3): void {
    const away = new THREE.Vector3()
      .subVectors(this.camera.position, from)
      .setY(0);
    if (away.lengthSq() < 0.001) away.set(0, 0, 1);
    this.knock.copy(away.normalize().multiplyScalar(9));
    this.shake = Math.max(this.shake, 0.45);
    parkAudio.shoveHit(0.85);
  }

  /** Camera jolt — bank bumps, sunk boats, and the like. */
  public jolt(amount = 0.45): void {
    this.shake = Math.max(this.shake, amount);
  }

  public update(delta: number): void {
    // Undo last frame's wobble before working out where we actually are.
    this.camera.position.sub(this.shakeOffset);
    this.camera.position.sub(this.bobOffset);
    this.shakeOffset.set(0, 0, 0);
    this.bobOffset.set(0, 0, 0);

    // Stay in step with the camera in case anything else has turned it —
    // except during intro / pedalo, where something else owns the pose.
    const usingMobile = this.mobileControls.isEnabled();
    const active = this.locked || usingMobile;
    const riding = isPedaloHired();
    const intro = this.game.isIntroPlaying();
    if (!riding && !this.inVan && !intro) {
      this.euler.setFromQuaternion(this.camera.quaternion);
      this.euler.z = 0;
    } else {
      this.euler.z = 0;
    }

    if (active && usingMobile && !intro) {
      const lookDelta = this.mobileControls.getLookDelta(delta);
      if (lookDelta.x !== 0 || lookDelta.y !== 0) {
        this.euler.y += lookDelta.x;
        this.euler.x -= lookDelta.y;
        this.euler.x = Math.max(
          -Math.PI / 2,
          Math.min(Math.PI / 2, this.euler.x),
        );
        if (!riding) this.camera.quaternion.setFromEuler(this.euler);
      }
      if (!riding) {
        // Spray stick: hold draws the tool; push past the deadzone to hose (or jab).
        const held = this.mobileControls.isSprayHeld();
        const aim = this.mobileControls.getSprayAim();
        if (this.tool === "picker") {
          if (held) this.use(true);
        } else if (held) {
          // Empty-handed or still drawing — same as the old fire button.
          if (this.wanted === null || this.tool === null || !this.ready()) {
            this.use(true);
          } else if (aim !== null && !this.isSpraying) {
            this.setSpraying(true);
          } else if (aim === null && this.isSpraying) {
            this.setSpraying(false);
          }
        } else if (this.isSpraying) {
          this.use(false);
        }
      } else if (this.isSpraying) {
        this.use(false);
      }
    }

    if (this.game.isIntroPlaying()) {
      this.velocity.set(0, 0, 0);
      this.knock.set(0, 0, 0);
      this.bobAmount = 0;
      this.bobRoll = 0;
      this.jet.setStowed(true);
      this.picker.setStowed(true);
      this.applyShake(delta);
      return;
    }

    if (riding) {
      this.velocity.set(0, 0, 0);
      this.knock.set(0, 0, 0);
      this.groundLift = 0;
      this.groundLiftTarget = 0;
      this.wasWading = false;

      // Mobile: hold the spray stick centred to climb out; push it to hose.
      if (active && usingMobile) {
        const sprayHeld = this.mobileControls.isSprayHeld();
        const aim = sprayHeld ? this.mobileControls.getSprayAim() : null;
        if (sprayHeld && aim === null) {
          this.pedaloExitHold += delta;
          if (this.pedaloExitHold > 0.7) {
            this.pedaloExitHold = 0;
            this.togglePedalo();
          }
        } else {
          this.pedaloExitHold = 0;
        }

        if (sprayHeld) {
          if (this.wanted === null || this.tool === null) {
            if (aim !== null) {
              this.pickTool(this.heavyTank > 0 ? "heavyHose" : "hose", true);
            }
          } else if (aim !== null && !this.isSpraying) {
            this.setSpraying(true);
          } else if (aim === null && this.isSpraying) {
            this.setSpraying(false);
          }
        } else if (this.isSpraying) {
          this.use(false);
        }
      } else {
        this.pedaloExitHold = 0;
      }

      // Already hopped out (or the boat went under) — don't keep driving.
      if (!isPedaloHired()) {
        this.applyShake(delta);
        return;
      }

      let throttle = 0;
      let steer = 0;
      if (active) {
        if (usingMobile) {
          const input = this.mobileControls.getMoveInput();
          throttle = -input.y;
          // Flipped vs walk-strafe: stick left turns the bow right on the water.
          steer = input.x;
        } else {
          throttle =
            Number(this.moveForward) - Number(this.moveBackward) * 0.55;
          steer = Number(this.moveRight) - Number(this.moveLeft);
        }
      }
      drivePedalo(delta, throttle, steer);

      const impact = consumePedaloImpact();
      if (impact > 0) {
        this.shake = Math.max(this.shake, 0.35 + impact * 0.7);
        parkAudio.boatCrash(impact);
      }

      const eject = consumePedaloSinkEject();
      if (eject) {
        this.hidePedalFeet();
        this.camera.position.x = eject.x;
        this.camera.position.z = eject.z;
        this.camera.position.y = EYE_HEIGHT + wadeFootY(eject.x, eject.z);
        this.euler.z = 0;
        this.camera.quaternion.setFromEuler(this.euler);
        this.wasWading = true;
        this.shake = Math.max(this.shake, 0.85);
        this.velocity.set(0, 0, 0);
        this.setSpraying(false);
        this.game.showTool(this.wanted);
        parkAudio.boatCrash(1);
        this.applyShake(delta);
        return;
      }

      const seat = pedaloSeatPose();
      if (seat) {
        this.camera.position.set(seat.x, seat.y, seat.z);
      }
      const rock = pedaloAttitude();
      this.bobAmount = THREE.MathUtils.damp(this.bobAmount, 0, 8, delta);
      this.bobRoll = 0;
      // Look euler stays level; only the camera gets boat rock (so it can't stack).
      const ride = this.euler.clone();
      ride.x += (rock?.pitch ?? 0) * 0.35;
      ride.z = (rock?.roll ?? 0) * 0.9;
      this.camera.quaternion.setFromEuler(ride);
      this.animatePedalFeet(
        Math.abs(throttle) > 0.05 || Math.abs(pedaloSpeed()) > 0.12,
      );
      this.pedalEffort = Math.min(
        1,
        Math.max(Math.abs(throttle), Math.abs(pedaloSpeed()) / 2.4),
      );

      this.swapTools(delta);
      const hosing =
        this.isSpraying &&
        (this.tool === "hose" || this.tool === "heavyHose") &&
        this.ready() &&
        active;
      if (this.isSpraying && !hosing) this.setSpraying(false);
      const sprayAim =
        usingMobile && hosing ? this.mobileControls.getSprayAim() : null;
      this.jet.update(delta, hosing, sprayAim);

      if (this.tool === "heavyHose") {
        if (hosing) {
          this.heavyTank = Math.max(0, this.heavyTank - delta);
          this.jet.setPressure(this.heavyTank / HEAVY_TANK);
          if (this.heavyTank <= 0) {
            this.jet.setHeavyMode(false);
            this.game.onHeavyHoseEmpty();
            this.pickTool("hose", true);
          }
        }
        this.game.showTool("heavyHose");
      }

      this.applyShake(delta);
      return;
    }

    this.hidePedalFeet();
    this.pedalEffort = 0;

    if (active) {
      if (usingMobile) {
        // Stick right/down are positive; negate X for the CSS-flipped view.
        const input = this.mobileControls.getMoveInput();
        this.direction.set(-input.x, 0, input.y);
      } else {
        this.direction.set(
          Number(this.moveLeft) - Number(this.moveRight),
          0,
          Number(this.moveBackward) - Number(this.moveForward),
        );
      }
      if (this.direction.lengthSq() > 0) this.direction.normalize();

      const wading = isInLake(this.camera.position.x, this.camera.position.z);
      const speed = wading
        ? WADE_SPEED
        : this.sprinting
          ? SPRINT_SPEED
          : WALK_SPEED;
      const wanted = this.direction.clone().multiplyScalar(speed);
      this.velocity.lerp(wanted, Math.min(1, (wading ? 6 : 12) * delta));
    } else {
      this.velocity.lerp(new THREE.Vector3(), Math.min(1, 12 * delta));
    }

    const step = this.velocity.clone().multiplyScalar(delta);
    step.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.euler.y);
    step.addScaledVector(this.knock, delta);
    this.knock.multiplyScalar(Math.max(0, 1 - 6 * delta));
    this.moveWithCollision(step);

    this.groundLift = THREE.MathUtils.damp(
      this.groundLift,
      this.groundLiftTarget,
      10,
      delta,
    );
    const px = this.camera.position.x;
    const pz = this.camera.position.z;
    const wading = isInLake(px, pz);
    const foot = wading ? wadeFootY(px, pz) : groundHeight(px, pz);
    const lift = wading ? 0 : this.groundLift;
    this.camera.position.y = EYE_HEIGHT + lift + foot;
    this.trackWading(delta, wading);
    this.applyBob(delta, wading);

    if (this.shake > 0) {
      this.applyShake(delta);
    }

    if (active) this.readTheJob(delta);
    this.swapTools(delta);

    const hosing =
      this.isSpraying &&
      (this.tool === "hose" || this.tool === "heavyHose") &&
      this.ready() &&
      active;
    if (this.isSpraying && !hosing) this.setSpraying(false);
    const sprayAim =
      usingMobile && hosing ? this.mobileControls.getSprayAim() : null;
    this.jet.update(delta, hosing, sprayAim);

    if (this.tool === "heavyHose") {
      if (hosing) {
        this.heavyTank = Math.max(0, this.heavyTank - delta);
        this.jet.setPressure(this.heavyTank / HEAVY_TANK);
        if (this.heavyTank <= 0) {
          this.jet.setHeavyMode(false);
          this.game.onHeavyHoseEmpty();
          this.pickTool("hose", true);
        }
      }
      this.game.showTool("heavyHose");
    }

    if (this.picker.update(delta) && this.game.spearLitter(this.reachPoint())) {
      this.picker.stow();
    }
  }

  /** Camera wobble after a knock or bank bump. */
  private applyShake(delta: number): void {
    if (this.shake <= 0) return;
    this.shake = Math.max(0, this.shake - delta);
    const jolt = this.shake * 0.35;
    this.shakeOffset.set(
      (Math.random() - 0.5) * jolt,
      (Math.random() - 0.5) * jolt,
      (Math.random() - 0.5) * jolt,
    );
    this.camera.position.add(this.shakeOffset);
  }

  /** Hop in or climb out of a hire swan pedalo. */
  private togglePedalo(): void {
    if (isPedaloHired()) {
      this.hidePedalFeet();
      const spot = disembarkPedalo();
      if (!spot) return;
      this.camera.position.x = spot.x;
      this.camera.position.z = spot.z;
      this.euler.z = 0;
      this.camera.quaternion.setFromEuler(this.euler);
      this.velocity.set(0, 0, 0);
      this.setSpraying(false);
      this.game.showTool(this.wanted);
      return;
    }
    const px = this.camera.position.x;
    const pz = this.camera.position.z;
    if (!boardPedalo(px, pz)) return;
    this.setSpraying(false);
  }

  /** Boots in the footwell — kick when the pedals are turning. */
  private animatePedalFeet(pedalling: boolean): void {
    this.ensurePedalFeet();
    if (!this.pedalFeet || !this.pedalBootL || !this.pedalBootR) return;
    this.pedalFeet.visible = true;
    const phase = pedaloPedalPhase();
    const kick = pedalling ? 1 : 0.15;
    // Left / right opposite on the crank, dipped into the lower FOV.
    for (const [boot, sign] of [
      [this.pedalBootL, 1],
      [this.pedalBootR, -1],
    ] as const) {
      const a = phase + (sign > 0 ? 0 : Math.PI);
      boot.position.set(
        sign * 0.14,
        -0.62 + Math.cos(a) * 0.05 * kick,
        -0.52 + Math.sin(a) * 0.07 * kick,
      );
      boot.rotation.set(0.35 + Math.sin(a) * 0.55 * kick, 0, sign * 0.04);
    }
  }

  private hidePedalFeet(): void {
    if (this.pedalFeet) this.pedalFeet.visible = false;
  }

  private ensurePedalFeet(): void {
    if (this.pedalFeet) return;
    const group = new THREE.Group();
    group.name = "pedal-feet";
    const bootMat = new THREE.MeshStandardMaterial({
      color: 0x2a241c,
      roughness: 0.92,
    });
    const soleMat = new THREE.MeshStandardMaterial({
      color: 0x1a1510,
      roughness: 1,
    });
    const makeBoot = (side: number): THREE.Group => {
      const boot = new THREE.Group();
      const upper = new THREE.Mesh(
        new THREE.BoxGeometry(0.11, 0.1, 0.26),
        bootMat,
      );
      upper.position.set(0, 0.06, 0.02);
      boot.add(upper);
      const sole = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.035, 0.28),
        soleMat,
      );
      sole.position.set(0, 0.01, 0.02);
      boot.add(sole);
      const toe = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.05, 0.08),
        bootMat,
      );
      toe.position.set(0, 0.04, -0.12);
      boot.add(toe);
      boot.position.x = side * 0.14;
      group.add(boot);
      return boot;
    };
    this.pedalBootL = makeBoot(-1);
    this.pedalBootR = makeBoot(1);
    this.camera.add(group);
    this.pedalFeet = group;
  }

  /** Soft up-and-down bob with a little side sway while walking. */
  private applyBob(delta: number, wading: boolean): void {
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    const ref = wading ? WADE_SPEED : WALK_SPEED;
    const target = THREE.MathUtils.clamp(speed / ref, 0, 1.25);
    this.bobAmount = THREE.MathUtils.damp(this.bobAmount, target, 8, delta);

    if (this.bobAmount > 0.02) {
      this.bobPhase += delta * speed * BOB_STEP * (wading ? 0.7 : 1);
    }

    const a = this.bobAmount * (wading ? 0.55 : 1);
    const lateral = Math.cos(this.bobPhase) * BOB_SWAY * a;
    const vertical = Math.sin(this.bobPhase * 2) * BOB_HEIGHT * a;
    const yaw = this.euler.y;
    this.bobOffset.set(
      Math.cos(yaw) * lateral,
      vertical,
      -Math.sin(yaw) * lateral,
    );
    this.camera.position.add(this.bobOffset);

    this.bobRoll = Math.sin(this.bobPhase) * BOB_ROLL * a;
    this.euler.z = this.bobRoll;
    this.camera.quaternion.setFromEuler(this.euler);
  }

  /** Entry splash and a wake while trudging through. */
  private trackWading(delta: number, wading: boolean): void {
    const at = this.camera.position;
    if (wading && !this.wasWading) {
      this.wadeSplashAt = new THREE.Vector3(at.x, WATER_Y, at.z);
      this.wadeSplashBig = true;
      this.wakeAcc = 0;
    } else if (!wading && this.wasWading) {
      // Climbing out — a smaller slap than going in.
      this.wadeSplashAt = new THREE.Vector3(at.x, WATER_Y, at.z);
      this.wadeSplashBig = false;
      this.wakeAcc = 0;
    } else if (wading) {
      const speed = Math.hypot(this.velocity.x, this.velocity.z);
      if (speed > 0.4) {
        this.wakeAcc += delta * speed;
        if (this.wakeAcc > 1.35) {
          this.wakeAcc = 0;
          this.wadeSplashAt = new THREE.Vector3(at.x, WATER_Y, at.z);
          this.wadeSplashBig = false;
        }
      }
    } else {
      this.wakeAcc = 0;
    }
    this.wasWading = wading;
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

  /** How high the boots sit above the path — used for stacked mess lumps. */
  public setGroundLift(height: number): void {
    this.groundLiftTarget = Math.max(0, height);
  }

  /** Horizontal move speed in m/s (local, before facing). */
  public moveSpeed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  public isHosing(): boolean {
    return this.isSpraying;
  }

  /** True while boots are in the lake. */
  public isWading(): boolean {
    return this.wasWading && !isPedaloHired();
  }

  /** True while sat in a hire swan. */
  public isOnPedalo(): boolean {
    return isPedaloHired();
  }

  /** How hard the pedals are going (0–1) while hired. */
  public getPedalEffort(): number {
    return isPedaloHired() ? this.pedalEffort : 0;
  }

  /**
   * Splash from stepping in or walking through — once per claim. `big` is the
   * entry wallop; otherwise a small wake ring.
   */
  public claimWadeSplash(): { at: THREE.Vector3; big: boolean } | null {
    const at = this.wadeSplashAt;
    if (!at) return null;
    const big = this.wadeSplashBig;
    this.wadeSplashAt = null;
    this.wadeSplashBig = false;
    return { at, big };
  }

  private canStand(x: number, z: number): boolean {
    if (!insidePark(x, z)) return false;
    if (isBlocked(x, z)) return false;
    return true;
  }
}
