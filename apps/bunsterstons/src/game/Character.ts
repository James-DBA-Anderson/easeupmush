import * as THREE from "three";
import type { VirtualInput } from "./MobileControls";
import type { ClimbZone, Platform, Solid } from "./types";

const MOVE_SPEED = 7.2;
const SPRINT = 1.45;
/** Apex still clears purple → tall swirl (~4m). */
const JUMP_V = 12.2;
/** Lighter on the way up, heavier on the way down. */
const GRAVITY_UP = 17;
const GRAVITY_DOWN = 30;
const JUMP_CUT = 0.45;
const ACCEL_GROUND = 18;
const ACCEL_AIR = 10;
const FRICTION = 10;
const TURN_SPEED = 14;
const COYOTE = 0.1;
const JUMP_BUFFER = 0.12;
const BORED_AFTER = 5;
const EDGE_ZONE = 0.65;
const CLIMB_SPEED = 6.2;

/**
 * Shared third-person controller — subclasses supply mesh + animation.
 */
export abstract class Character {
  readonly group = new THREE.Group();
  protected readonly root = new THREE.Group();
  protected readonly vel = new THREE.Vector3();
  protected onGround = false;
  protected hopPhase = 0;
  private keys = new Set<string>();
  private virtMoveX = 0;
  private virtMoveY = 0;
  private virtJump = false;
  private virtSprint = false;
  private jumpLocked = false;
  private time = 0;
  private coyote = 0;
  private jumpBuffer = 0;
  private facing = 0;
  private lastInputAt = 0;
  /** Elapsed time in the bored-idle state (0 when not bored). */
  protected boredPhase = 0;
  /** 0–1 how close to a platform rim while grounded. */
  protected edgeAmount = 0;
  /** Edge direction in local space: +X right, +Z forward. */
  protected edgeLocalX = 0;
  protected edgeLocalZ = 0;
  protected balancePhase = 0;
  private camForward = new THREE.Vector3(0, 0, -1);
  private camRight = new THREE.Vector3(1, 0, 0);
  private boundMinX = -16;
  private boundMaxX = 28;
  private boundMinZ = -10;
  private boundMaxZ = 10;
  protected climbing = false;

  /** Chippy can scale climb zones; bunny cannot. */
  protected get canClimb(): boolean {
    return false;
  }

  protected abstract readonly radius: number;
  protected abstract readonly height: number;

  constructor() {
    this.group.add(this.root);
    this.group.position.set(-10, 0.58, 0);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  /** Call from subclass constructors after field initializers have run. */
  protected finishSetup(): void {
    this.build();
  }

  public get position(): THREE.Vector3 {
    return this.group.position;
  }

  public dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
  }

  /** On-screen stick / buttons from MobileControls (merged with keyboard). */
  public setVirtualInput(input: VirtualInput): void {
    this.virtMoveX = input.moveX;
    this.virtMoveY = input.moveY;
    this.virtJump = input.jump;
    this.virtSprint = input.sprint;
  }

  public reset(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.onGround = false;
    this.hopPhase = 0;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.facing = 0;
    this.lastInputAt = this.time;
    this.boredPhase = 0;
    this.edgeAmount = 0;
    this.edgeLocalX = 0;
    this.edgeLocalZ = 0;
    this.balancePhase = 0;
    this.group.rotation.y = 0;
    this.poseIdle(0);
  }

  public setWorldBounds(
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
  ): void {
    this.boundMinX = minX;
    this.boundMaxX = maxX;
    this.boundMinZ = minZ;
    this.boundMaxZ = maxZ;
  }

  public setCameraBasis(forward: THREE.Vector3, right: THREE.Vector3): void {
    this.camForward.copy(forward).setY(0);
    if (this.camForward.lengthSq() < 1e-6) this.camForward.set(0, 0, -1);
    this.camForward.normalize();
    this.camRight.copy(right).setY(0);
    if (this.camRight.lengthSq() < 1e-6) this.camRight.set(1, 0, 0);
    this.camRight.normalize();
  }

  public update(
    delta: number,
    platforms: readonly Platform[],
    solids: readonly Solid[],
    climbZones: readonly ClimbZone[] = [],
  ): void {
    this.time += delta;
    const sprint =
      this.virtSprint ||
      this.keys.has("ShiftLeft") ||
      this.keys.has("ShiftRight");
    const speed = MOVE_SPEED * (sprint ? SPRINT : 1);

    let ix = 0;
    let iz = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) iz -= 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) iz += 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) ix -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) ix += 1;
    ix += this.virtMoveX;
    iz += this.virtMoveY;

    const holdUp = iz < -0.2;
    const holdDown = iz > 0.2;
    const moving = Math.hypot(ix, iz) > 0.12;
    let wishX = 0;
    let wishZ = 0;
    if (moving) {
      const len = Math.hypot(ix, iz);
      ix /= len;
      iz /= len;
      wishX = this.camRight.x * ix - this.camForward.x * iz;
      wishZ = this.camRight.z * ix - this.camForward.z * iz;
      const targetYaw = Math.atan2(wishX, wishZ);
      this.facing = this.dampAngle(this.facing, targetYaw, TURN_SPEED, delta);
      this.group.rotation.y = this.facing;
      this.hopPhase += delta * (sprint ? 14 : 11);
    } else if (this.onGround) {
      this.hopPhase += delta * 2.2;
    }

    const zone = this.canClimb
      ? this.findClimbZone(this.group.position, climbZones)
      : null;
    this.climbing = zone != null && (holdUp || holdDown || this.climbing);

    if (this.climbing && zone) {
      // Stick to the gate face; W/S climb, A/D slide along the bars.
      let climbDir = 0;
      if (holdUp) climbDir += 1;
      if (holdDown) climbDir -= 1;
      let slide = ix;
      if (Math.abs(slide) < 0.12) slide = 0;
      else slide = Math.sign(slide) * Math.min(1, Math.abs(slide));

      const wantJump =
        this.virtJump || this.keys.has("Space") || this.keys.has("KeyJ");

      // Face into the gate while climbing.
      const towardGate = zone.x - this.group.position.x;
      this.facing = this.dampAngle(
        this.facing,
        Math.atan2(towardGate, 0.01),
        TURN_SPEED * 1.4,
        delta,
      );
      this.group.rotation.y = this.facing;

      // Crest the top → vault onto the landing (fixes getting stuck on the face).
      const cresting = this.group.position.y >= zone.y1 - 0.4;
      if (cresting && (climbDir > 0 || (wantJump && !this.jumpLocked))) {
        this.climbing = false;
        if (wantJump) this.jumpLocked = true;
        const mountZ = THREE.MathUtils.clamp(
          this.group.position.z,
          zone.z - zone.halfD + this.radius,
          zone.z + zone.halfD - this.radius,
        );
        this.group.position.set(
          zone.x + 0.8,
          zone.y1 + this.height * 0.5 + 0.14,
          mountZ,
        );
        this.vel.set(4.2, 3.4, 0);
        this.facing = Math.atan2(1, 0);
        this.group.rotation.y = this.facing;
        this.onGround = false;
        this.coyote = 0;
        this.hopPhase += delta * 12;
        this.lastInputAt = this.time;
        this.boredPhase = 0;
        this.edgeAmount = 0;
        this.animate(delta, true, false, false);
        return;
      }

      const faceX = zone.x - this.radius * 0.55;
      this.vel.x = (faceX - this.group.position.x) * 12;
      this.vel.z = slide * CLIMB_SPEED * 0.75;
      this.vel.y = climbDir * CLIMB_SPEED;
      this.onGround = false;
      this.coyote = 0;
      this.hopPhase += delta * (climbDir !== 0 || slide !== 0 ? 14 : 6);

      if (wantJump && !this.jumpLocked) {
        this.climbing = false;
        const away = Math.sign(this.group.position.x - zone.x) || -1;
        this.vel.y = JUMP_V * 0.65;
        this.vel.x = away * 5.5;
        this.jumpLocked = true;
        this.jumpBuffer = 0;
      }
      if (!wantJump) this.jumpLocked = false;

      if (holdUp || holdDown || slide !== 0 || wantJump) {
        this.lastInputAt = this.time;
        this.boredPhase = 0;
      }

      // Drop off the latch if the player stops input while near the ground.
      if (
        climbDir === 0 &&
        slide === 0 &&
        !wantJump &&
        this.group.position.y <= zone.y0 + 0.55
      ) {
        this.climbing = false;
      }

      const next = this.group.position.clone();
      next.x += this.vel.x * delta;
      next.z += this.vel.z * delta;
      next.y += this.vel.y * delta;
      next.y = THREE.MathUtils.clamp(next.y, zone.y0 + 0.12, zone.y1 - 0.05);
      next.z = THREE.MathUtils.clamp(
        next.z,
        zone.z - zone.halfD + this.radius * 0.2,
        zone.z + zone.halfD - this.radius * 0.2,
      );
      if (Math.abs(next.x - zone.x) > zone.halfW + this.radius + 0.5) {
        this.climbing = false;
      }
      next.x = THREE.MathUtils.clamp(next.x, this.boundMinX, this.boundMaxX);
      next.z = THREE.MathUtils.clamp(next.z, this.boundMinZ, this.boundMaxZ);
      this.group.position.copy(next);
      this.edgeAmount = 0;
      this.animate(delta, climbDir !== 0 || slide !== 0, false, false);
      return;
    }

    this.climbing = false;

    const accel = this.onGround ? ACCEL_GROUND : ACCEL_AIR;
    if (moving) {
      this.vel.x = THREE.MathUtils.damp(this.vel.x, wishX * speed, accel, delta);
      this.vel.z = THREE.MathUtils.damp(this.vel.z, wishZ * speed, accel, delta);
    } else {
      this.vel.x = THREE.MathUtils.damp(this.vel.x, 0, FRICTION, delta);
      this.vel.z = THREE.MathUtils.damp(this.vel.z, 0, FRICTION, delta);
    }

    const wantJump =
      this.virtJump || this.keys.has("Space") || this.keys.has("KeyJ");
    if (moving || sprint || wantJump) {
      this.lastInputAt = this.time;
      this.boredPhase = 0;
    }

    if (wantJump && !this.jumpLocked) {
      this.jumpBuffer = JUMP_BUFFER;
      this.jumpLocked = true;
    }
    if (!wantJump) this.jumpLocked = false;

    if (this.onGround) this.coyote = COYOTE;
    else this.coyote = Math.max(0, this.coyote - delta);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - delta);

    // Auto-grab climb zone when jumping into / against it.
    if (
      this.canClimb &&
      !this.onGround &&
      zone == null &&
      this.findClimbZone(this.group.position, climbZones)
    ) {
      this.climbing = true;
    }

    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vel.y = JUMP_V;
      this.onGround = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
    }

    if (!wantJump && this.vel.y > 0) {
      this.vel.y *= Math.pow(JUMP_CUT, delta * 12);
    }

    const g = this.vel.y > 0 ? GRAVITY_UP : GRAVITY_DOWN;
    this.vel.y -= g * delta;

    const prevY = this.group.position.y;
    const next = this.group.position.clone();
    next.x += this.vel.x * delta;
    this.resolveSolids(next, solids, "x");
    next.z += this.vel.z * delta;
    this.resolveSolids(next, solids, "z");
    next.y += this.vel.y * delta;

    // Grab gate if we bump into a climb zone mid-air / against the bars.
    if (this.canClimb) {
      const grab = this.findClimbZone(next, climbZones);
      if (
        grab &&
        (holdUp ||
          holdDown ||
          this.vel.x > 0.35 ||
          next.x > grab.x - grab.halfW - 0.5)
      ) {
        this.climbing = true;
        this.vel.y = Math.max(0, this.vel.y * 0.2);
        next.x = grab.x - this.radius * 0.55;
      }
    }

    this.onGround = false;
    const prevFeet = prevY - this.height * 0.5;
    const feet = next.y - this.height * 0.5;
    const canLand = this.vel.y <= 0;

    for (const p of platforms) {
      if (!canLand) continue;
      const dx = next.x - p.x;
      const dz = next.z - p.z;
      const onPad =
        p.halfW != null && p.halfD != null
          ? Math.abs(dx) < p.halfW - this.radius * 0.2 &&
            Math.abs(dz) < p.halfD - this.radius * 0.2
          : dx * dx + dz * dz <= (p.radius - this.radius * 0.35) ** 2;
      if (!onPad) continue;
      if (prevFeet >= p.top - 0.02 && feet <= p.top) {
        next.y = p.top + this.height * 0.5;
        this.vel.y = 0;
        this.onGround = true;
      }
    }

    for (const s of solids) {
      if (!canLand) continue;
      if (!this.overlapsXZ(next.x, next.z, s, this.radius * 0.35)) continue;
      if (prevFeet >= s.y1 - 0.02 && feet <= s.y1) {
        next.y = s.y1 + this.height * 0.5;
        this.vel.y = 0;
        this.onGround = true;
      }
    }

    next.x = THREE.MathUtils.clamp(next.x, this.boundMinX, this.boundMaxX);
    next.z = THREE.MathUtils.clamp(next.z, this.boundMinZ, this.boundMaxZ);
    if (next.y < -4) {
      this.reset(-10, this.height * 0.5 + 0.02, 0);
      return;
    }

    this.group.position.copy(next);

    this.updateEdgeSense(platforms, solids);
    if (this.edgeAmount > 0.2) this.balancePhase += delta;
    else this.balancePhase = 0;

    const bored =
      this.onGround &&
      !moving &&
      this.edgeAmount < 0.25 &&
      this.time - this.lastInputAt >= BORED_AFTER;
    if (bored) this.boredPhase += delta;
    else this.boredPhase = 0;

    this.animate(delta, moving, sprint, bored);
  }

  private findClimbZone(
    pos: THREE.Vector3,
    zones: readonly ClimbZone[],
  ): ClimbZone | null {
    for (const z of zones) {
      if (pos.y < z.y0 - 0.3 || pos.y > z.y1 + 0.35) continue;
      if (Math.abs(pos.z - z.z) > z.halfD + this.radius * 0.3) continue;
      // Stand in front of / on the climb face.
      const dx = pos.x - z.x;
      if (dx > z.halfW + this.radius * 0.6) continue;
      if (dx < -z.halfW - this.radius * 1.1) continue;
      return z;
    }
    return null;
  }

  /** Measure proximity to the rim of whatever pad we're standing on. */
  private updateEdgeSense(
    platforms: readonly Platform[],
    solids: readonly Solid[],
  ): void {
    this.edgeAmount = 0;
    this.edgeLocalX = 0;
    this.edgeLocalZ = 0;
    if (!this.onGround) return;

    const x = this.group.position.x;
    const z = this.group.position.z;
    const feet = this.group.position.y - this.height * 0.5;
    let best = 0;
    let wx = 0;
    let wz = 0;

    for (const p of platforms) {
      if (Math.abs(feet - p.top) > 0.15) continue;
      const dx = x - p.x;
      const dz = z - p.z;

      if (p.halfW != null && p.halfD != null) {
        const inset = this.radius * 0.2;
        const distX = p.halfW - inset - Math.abs(dx);
        const distZ = p.halfD - inset - Math.abs(dz);
        if (distX < 0 || distZ < 0) continue;
        const dist = Math.min(distX, distZ);
        if (dist >= EDGE_ZONE) continue;
        const amount = 1 - dist / EDGE_ZONE;
        if (amount <= best) continue;
        best = amount;
        if (distX < distZ) {
          wx = Math.sign(dx) || 1;
          wz = 0;
        } else {
          wx = 0;
          wz = Math.sign(dz) || 1;
        }
      } else {
        const outer = Math.max(0.2, p.radius - this.radius * 0.35);
        const d = Math.hypot(dx, dz);
        if (d < outer - EDGE_ZONE || d > outer + 0.15) continue;
        const amount = 1 - (outer - d) / EDGE_ZONE;
        if (amount <= best) continue;
        best = Math.min(1, amount);
        const inv = d > 1e-4 ? 1 / d : 0;
        wx = dx * inv;
        wz = dz * inv;
      }
    }

    for (const s of solids) {
      if (Math.abs(feet - s.y1) > 0.15) continue;
      const dx = x - s.x;
      const dz = z - s.z;
      if (s.kind === "cylinder") {
        const outer = Math.max(0.2, (s.radius ?? 0.5) - this.radius * 0.35);
        const d = Math.hypot(dx, dz);
        if (d < outer - EDGE_ZONE || d > outer + 0.15) continue;
        const amount = 1 - (outer - d) / EDGE_ZONE;
        if (amount <= best) continue;
        best = Math.min(1, amount);
        const inv = d > 1e-4 ? 1 / d : 0;
        wx = dx * inv;
        wz = dz * inv;
      } else {
        const inset = this.radius * 0.2;
        const distX = (s.halfW ?? 0.5) - inset - Math.abs(dx);
        const distZ = (s.halfD ?? 0.5) - inset - Math.abs(dz);
        if (distX < 0 || distZ < 0) continue;
        const dist = Math.min(distX, distZ);
        if (dist >= EDGE_ZONE) continue;
        const amount = 1 - dist / EDGE_ZONE;
        if (amount <= best) continue;
        best = amount;
        if (distX < distZ) {
          wx = Math.sign(dx) || 1;
          wz = 0;
        } else {
          wx = 0;
          wz = Math.sign(dz) || 1;
        }
      }
    }

    this.edgeAmount = best;
    if (best <= 0) return;
    // World outward → character-local (facing yaw).
    const c = Math.cos(this.facing);
    const s = Math.sin(this.facing);
    this.edgeLocalX = wx * c + wz * s;
    this.edgeLocalZ = -wx * s + wz * c;
  }

  private dampAngle(
    current: number,
    target: number,
    lambda: number,
    delta: number,
  ): number {
    let diff = target - current;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return current + diff * (1 - Math.exp(-lambda * delta));
  }

  protected abstract build(): void;
  protected abstract animate(
    delta: number,
    moving: boolean,
    sprint: boolean,
    bored: boolean,
  ): void;
  protected abstract poseIdle(t: number): void;

  private overlapsXZ(x: number, z: number, s: Solid, pad: number): boolean {
    const dx = x - s.x;
    const dz = z - s.z;
    if (s.kind === "cylinder") {
      const r = (s.radius ?? 0.5) + pad;
      return dx * dx + dz * dz < r * r;
    }
    const hw = (s.halfW ?? 0.5) + pad;
    const hd = (s.halfD ?? 0.5) + pad;
    return Math.abs(dx) < hw && Math.abs(dz) < hd;
  }

  private bodyOverlapsSolid(
    x: number,
    y: number,
    z: number,
    s: Solid,
  ): boolean {
    const feet = y - this.height * 0.5;
    const head = y + this.height * 0.45;
    if (head < s.y0 + 0.05 || feet > s.y1 - 0.05) return false;
    return this.overlapsXZ(x, z, s, this.radius);
  }

  private resolveSolids(
    next: THREE.Vector3,
    solids: readonly Solid[],
    axis: "x" | "z",
  ): void {
    for (const s of solids) {
      if (!this.bodyOverlapsSolid(next.x, next.y, next.z, s)) continue;
      if (s.kind === "cylinder") {
        const r = (s.radius ?? 0.5) + this.radius;
        const dx = next.x - s.x;
        const dz = next.z - s.z;
        const d = Math.hypot(dx, dz) || 0.001;
        if (d < r) {
          const push = (r - d) / d;
          next.x += dx * push;
          next.z += dz * push;
          if (axis === "x") this.vel.x = 0;
          else this.vel.z = 0;
        }
      } else {
        const hw = (s.halfW ?? 0.5) + this.radius;
        const hd = (s.halfD ?? 0.5) + this.radius;
        const dx = next.x - s.x;
        const dz = next.z - s.z;
        if (Math.abs(dx) < hw && Math.abs(dz) < hd) {
          if (axis === "x") {
            next.x = s.x + Math.sign(dx || 1) * hw;
            this.vel.x = 0;
          } else {
            next.z = s.z + Math.sign(dz || 1) * hd;
            this.vel.z = 0;
          }
        }
      }
    }
  }

  private onKeyDown = (ev: KeyboardEvent): void => {
    this.keys.add(ev.code);
    if (ev.code === "Space") ev.preventDefault();
  };

  private onKeyUp = (ev: KeyboardEvent): void => {
    this.keys.delete(ev.code);
  };
}
