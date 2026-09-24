import * as THREE from "three";
import { gameAudio } from "./audio";
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
const TURN_SPEED = 7.5;
/** Yaw rate (rad/s) that maps to full turn lean. */
const TURN_LEAN_REF = 5.5;
const COYOTE = 0.1;
const JUMP_BUFFER = 0.12;
const BORED_AFTER = 5;
const EDGE_ZONE = 0.65;
const CLIMB_SPEED = 8.4;
/** Ignore walk / re-grab for a beat after cresting the lip. */
const MOUNT_LOCK = 0.38;

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
  private virtAttack = false;
  private attackHeld = false;
  private jumpLocked = false;
  /** Remaining attack anim time; >0 while attacking. */
  protected attackTimer = 0;
  private attackHitSpent = false;
  private time = 0;
  private coyote = 0;
  private jumpBuffer = 0;
  private facing = 0;
  /** −1…+1 visual lean while changing direction (right is +). */
  protected turnLean = 0;
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
  private mountLock = 0;

  /** Chippy can scale climb zones; bunny cannot. */
  protected get canClimb(): boolean {
    return false;
  }

  public isClimbing(): boolean {
    return this.climbing;
  }

  protected abstract readonly radius: number;
  protected abstract readonly height: number;

  /** Distance from group origin up to the crown (ceiling hits). */
  protected get crownOffset(): number {
    return this.height * 0.5;
  }

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

  public get bodyRadius(): number {
    return this.radius;
  }

  /** Shove from a collision (Ken). Ignored while climbing. */
  public applyBump(dx: number, dz: number): void {
    if (this.climbing) return;
    if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) return;
    this.group.position.x = THREE.MathUtils.clamp(
      this.group.position.x + dx,
      this.boundMinX,
      this.boundMaxX,
    );
    this.group.position.z = THREE.MathUtils.clamp(
      this.group.position.z + dz,
      this.boundMinZ,
      this.boundMaxZ,
    );
    this.vel.x += dx * 12;
    this.vel.z += dz * 12;
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
    this.virtAttack = input.attack;
  }

  /** True once per swing during the strike window (Chippy headbutt). */
  public consumeAttackHit(): boolean {
    if (this.attackTimer <= 0 || this.attackHitSpent) return false;
    // Hit frames through the mid–late swing.
    if (this.attackTimer < 0.32 && this.attackTimer > 0.08) {
      this.attackHitSpent = true;
      return true;
    }
    return false;
  }

  public isAttacking(): boolean {
    return this.attackTimer > 0;
  }

  public reset(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.onGround = false;
    this.hopPhase = 0;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.facing = 0;
    this.turnLean = 0;
    this.lastInputAt = this.time;
    this.boredPhase = 0;
    this.edgeAmount = 0;
    this.edgeLocalX = 0;
    this.edgeLocalZ = 0;
    this.balancePhase = 0;
    this.climbing = false;
    this.mountLock = 0;
    this.attackTimer = 0;
    this.attackHitSpent = false;
    this.attackHeld = false;
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
    const prevFacing = this.facing;
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

    // Smooth lean from how hard we're yawing this frame.
    let yawRate = 0;
    if (delta > 1e-5) {
      let d = this.facing - prevFacing;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      yawRate = d / delta;
    }
    const leanTarget = THREE.MathUtils.clamp(yawRate / TURN_LEAN_REF, -1, 1);
    this.turnLean = THREE.MathUtils.damp(
      this.turnLean,
      leanTarget,
      moving ? 10 : 14,
      delta,
    );

    this.mountLock = Math.max(0, this.mountLock - delta);

    const zone =
      this.canClimb && this.mountLock <= 0
        ? this.findClimbZone(this.group.position, climbZones)
        : null;
    const approachSide = zone
      ? Math.sign(zone.x - this.group.position.x) || 1
      : 1;
    const intoWall = zone ? wishX * approachSide : 0;
    const wantGrab = zone != null && (holdUp || intoWall > 0.22);
    this.climbing = zone != null && (wantGrab || this.climbing);

    if (this.climbing && zone) {
      // Stick to the gate face. W/S (stick up/down) climb; A/D (stick left/right)
      // shuffle along the bars. Into-the-wall is only for grabbing, not steering.
      let climbDir = 0;
      if (holdUp) climbDir += 1;
      if (holdDown) climbDir -= 1;

      let slide = 0;
      if (Math.abs(ix) > 0.12) {
        const along =
          Math.abs(this.camRight.z) > 0.2 ? Math.sign(this.camRight.z) : 1;
        slide = Math.sign(ix) * Math.min(1, Math.abs(ix)) * along;
      }

      const wantJump =
        this.virtJump || this.keys.has("Space") || this.keys.has("KeyJ");

      const towardGate = zone.x - this.group.position.x;
      this.facing = this.dampAngle(
        this.facing,
        Math.atan2(towardGate, 0.01),
        TURN_SPEED * 1.4,
        delta,
      );
      this.group.rotation.y = this.facing;

      // Crest the lip → vault onto the top pad.
      const cresting = this.group.position.y >= zone.y1 - 0.28;
      if (cresting && climbDir > 0) {
        this.climbing = false;
        this.mountLock = MOUNT_LOCK;
        const mountZ = THREE.MathUtils.clamp(
          this.group.position.z,
          zone.z - zone.halfD + this.radius,
          zone.z + zone.halfD - this.radius,
        );
        const padTop = zone.y1 + 0.1;
        this.group.position.set(
          zone.x + 0.9,
          padTop + this.height * 0.5 + 0.06,
          mountZ,
        );
        this.vel.set(2.6, 1.8, 0);
        this.facing = Math.atan2(1, 0);
        this.group.rotation.y = this.facing;
        this.onGround = false;
        this.coyote = 0;
        this.hopPhase += delta * 10;
        this.lastInputAt = this.time;
        this.boredPhase = 0;
        this.edgeAmount = 0;
        this.animate(delta, true, false, false);
        return;
      }

      if (wantJump && !this.jumpLocked) {
        this.climbing = false;
        const away = Math.sign(this.group.position.x - zone.x) || -1;
        this.vel.y = JUMP_V * 0.65;
        this.vel.x = away * 5.5;
        this.jumpLocked = true;
        this.jumpBuffer = 0;
        this.lastInputAt = this.time;
        gameAudio.jump();
        this.animate(delta, false, false, false);
        return;
      }
      if (!wantJump) this.jumpLocked = false;

      // Drop only when asking to go down at the bottom — hang still otherwise.
      if (holdDown && this.group.position.y <= zone.y0 + 0.4) {
        this.climbing = false;
        this.vel.y = Math.min(this.vel.y, -1);
        this.vel.x = -approachSide * 2.2;
      } else {
        const faceX = zone.x - approachSide * this.radius * 0.55;
        this.vel.x = (faceX - this.group.position.x) * 14;
        this.vel.z = slide * CLIMB_SPEED;
        this.vel.y = climbDir * CLIMB_SPEED;
        this.onGround = false;
        this.coyote = 0;
        this.hopPhase += delta * (climbDir !== 0 || slide !== 0 ? 16 : 5);

        if (holdUp || holdDown || slide !== 0 || wantJump || intoWall > 0.22) {
          this.lastInputAt = this.time;
          this.boredPhase = 0;
        }

        const next = this.group.position.clone();
        next.x += this.vel.x * delta;
        next.z += this.vel.z * delta;
        next.y += this.vel.y * delta;
        next.y = THREE.MathUtils.clamp(next.y, zone.y0 + 0.12, zone.y1 - 0.02);
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
    }

    this.climbing = false;

    const accel = this.onGround ? ACCEL_GROUND : ACCEL_AIR;
    const locked = this.mountLock > 0;
    if (locked) {
      // Keep the vault toward the pad; don't walk back into the bars.
      this.vel.x = THREE.MathUtils.damp(this.vel.x, 2.4, 8, delta);
      this.vel.z = THREE.MathUtils.damp(this.vel.z, 0, FRICTION, delta);
    } else if (moving) {
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

    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vel.y = JUMP_V;
      this.onGround = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      gameAudio.jump();
    }

    if (!locked && !wantJump && this.vel.y > 0) {
      this.vel.y *= Math.pow(JUMP_CUT, delta * 12);
    }

    const g = this.vel.y > 0 ? GRAVITY_UP : GRAVITY_DOWN;
    this.vel.y -= g * delta;

    const prevY = this.group.position.y;
    const next = this.group.position.clone();
    next.x += this.vel.x * delta;
    this.resolveSolids(next, solids, "x");
    this.resolveLowCeilings(next, platforms);
    next.z += this.vel.z * delta;
    this.resolveSolids(next, solids, "z");
    this.resolveLowCeilings(next, platforms);
    next.y += this.vel.y * delta;

    // Grab when jumping / walking into the bars — not merely standing nearby.
    if (this.canClimb && this.mountLock <= 0) {
      const grab = this.findClimbZone(next, climbZones);
      if (grab) {
        const nx = Math.sign(grab.x - next.x) || 1;
        const pushingIn = this.vel.x * nx > 0.45 || intoWall > 0.22 || holdUp;
        if (pushingIn) {
          this.climbing = true;
          this.vel.y = Math.max(0, this.vel.y * 0.15);
          this.vel.x = 0;
          next.x = grab.x - nx * this.radius * 0.55;
        }
      }
    }

    this.onGround = false;
    const prevFeet = prevY - this.height * 0.5;
    const feet = next.y - this.height * 0.5;
    const crown = this.crownOffset;
    const prevHead = prevY + crown;
    const head = next.y + crown;

    // Ceiling — bump head on the underside of low platforms.
    if (this.vel.y > 0 || head > prevHead) {
      for (const p of platforms) {
        if (!this.onPlatformXZ(next.x, next.z, p)) continue;
        const bottom = p.bottom ?? p.top - 0.28;
        // Skip near-ground slabs (don't bonk the floor from below).
        if (bottom < 0.35) continue;
        const hitRising = prevHead <= bottom + 0.02 && head >= bottom;
        const alreadyIn = head > bottom && prevHead < bottom + 0.35;
        if (hitRising || alreadyIn) {
          next.y = bottom - crown - 0.03;
          this.vel.y = Math.min(0, this.vel.y);
          break;
        }
      }
    }

    const canLand = this.vel.y <= 0;
    for (const p of platforms) {
      if (!canLand) continue;
      if (!this.onPlatformXZ(next.x, next.z, p)) continue;
      if (prevFeet >= p.top - 0.05 && feet <= p.top + 0.02) {
        next.y = p.top + this.height * 0.5;
        this.vel.y = 0;
        this.onGround = true;
      }
    }

    for (const s of solids) {
      if (!canLand) continue;
      if (!this.overlapsXZ(next.x, next.z, s, 0)) continue;
      if (prevFeet >= s.y1 - 0.05 && feet <= s.y1 + 0.02) {
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

    // Attack (Chippy headbutt / bunny swipe) — press, don't hold-spam.
    const wantAttack =
      this.virtAttack ||
      this.keys.has("KeyF") ||
      this.keys.has("KeyE");
    if (
      wantAttack &&
      !this.attackHeld &&
      this.attackTimer <= 0 &&
      !this.climbing
    ) {
      this.attackTimer = 0.42;
      this.attackHitSpent = false;
      this.lastInputAt = this.time;
      this.boredPhase = 0;
    }
    this.attackHeld = wantAttack;
    if (this.attackTimer > 0) {
      this.attackTimer = Math.max(0, this.attackTimer - delta);
    }

    const bored =
      this.onGround &&
      !moving &&
      this.edgeAmount < 0.25 &&
      this.attackTimer <= 0 &&
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
        const distX = p.halfW - Math.abs(dx);
        const distZ = p.halfD - Math.abs(dz);
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
        const outer = p.radius;
        const d = Math.hypot(dx, dz);
        if (d < outer - EDGE_ZONE || d > outer + 0.12) continue;
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
        const outer = s.radius ?? 0.5;
        const d = Math.hypot(dx, dz);
        if (d < outer - EDGE_ZONE || d > outer + 0.12) continue;
        const amount = 1 - (outer - d) / EDGE_ZONE;
        if (amount <= best) continue;
        best = Math.min(1, amount);
        const inv = d > 1e-4 ? 1 / d : 0;
        wx = dx * inv;
        wz = dz * inv;
      } else {
        const distX = (s.halfW ?? 0.5) - Math.abs(dx);
        const distZ = (s.halfD ?? 0.5) - Math.abs(dz);
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

  /** True when the character centre is over the platform footprint (visual edge). */
  private onPlatformXZ(x: number, z: number, p: Platform): boolean {
    const dx = x - p.x;
    const dz = z - p.z;
    if (p.halfW != null && p.halfD != null) {
      return Math.abs(dx) <= p.halfW && Math.abs(dz) <= p.halfD;
    }
    return dx * dx + dz * dz <= p.radius * p.radius;
  }

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

  /**
   * Block walking under a platform when the character is taller than the gap
   * (feet below the underside, head would poke through).
   */
  private resolveLowCeilings(
    next: THREE.Vector3,
    platforms: readonly Platform[],
  ): void {
    const feet = next.y - this.height * 0.5;
    const head = next.y + this.crownOffset;
    const bodyR = this.radius * 0.9;

    for (const p of platforms) {
      const bottom = p.bottom ?? p.top - 0.28;
      // Skip near-ground slabs / already standing on or above the pad.
      if (bottom < 0.35) continue;
      if (feet >= bottom - 0.05) continue;
      if (head <= bottom) continue;

      if (p.halfW != null && p.halfD != null) {
        const hw = p.halfW + bodyR;
        const hd = p.halfD + bodyR;
        const dx = next.x - p.x;
        const dz = next.z - p.z;
        if (Math.abs(dx) >= hw || Math.abs(dz) >= hd) continue;
        const px = hw - Math.abs(dx);
        const pz = hd - Math.abs(dz);
        if (px < pz) {
          next.x = p.x + Math.sign(dx || 1) * hw;
          this.vel.x = 0;
        } else {
          next.z = p.z + Math.sign(dz || 1) * hd;
          this.vel.z = 0;
        }
        continue;
      }

      const r = p.radius + bodyR;
      const dx = next.x - p.x;
      const dz = next.z - p.z;
      const d = Math.hypot(dx, dz) || 0.001;
      if (d >= r) continue;
      const push = (r - d) / d;
      next.x += dx * push;
      next.z += dz * push;
      const nx = dx / d;
      const nz = dz / d;
      const into = this.vel.x * nx + this.vel.z * nz;
      if (into < 0) {
        this.vel.x -= into * nx;
        this.vel.z -= into * nz;
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
