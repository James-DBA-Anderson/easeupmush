import * as THREE from "three";
import { WATER_Y, isInLake } from "../world/lake";
import { buildArmedHand } from "./Hands";

const GRAVITY = 26;
/** Brisk lance — reaches a good few metres before the arc drops. */
const MUZZLE_SPEED = 24;
const DROPLET_LIFE = 1.15;
const POOL_SIZE = 560;
/** Hit samples + visible motion drips along the stream. */
const EMIT_RATE = 260;
/** How hard bounce flecks fan after a hit. */
const FAN_GROWTH = 11;

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** Continuous lance — thin to match the brass tip (~12mm). */
const STREAM_SEGS = 200;
const STREAM_RADIUS = 0.011;
const STREAM_STEP = 0.024;
/** Motion drips overlaid on the solid stream. */
const STREAK_RADIUS = 0.016;
/** Dense ribbon samples so swing waves stay smooth short links. */
const RIBBON_RATE = 240;

interface Droplet {
  mesh: THREE.Mesh;
  at: THREE.Vector3;
  velocity: THREE.Vector3;
  fan: THREE.Vector3;
  fanRate: number;
  life: number;
  bounced: boolean;
  dirty: boolean;
}

/** In-flight sample for the solid stream ribbon — keeps swing momentum. */
interface RibbonNode {
  at: THREE.Vector3;
  vel: THREE.Vector3;
}

/**
 * Pressure-washer spray. A thin continuous stream leaves the lance tip, with
 * fast drips streaking along it so it reads as moving water. Close hits kick
 * bounce flecks; looking straight down at your feet throws some back in your face.
 */
export interface JetHooks {
  /**
   * Water reached the ground here, travelling roughly this way.
   * Return 0 if clean; otherwise a bounce scale (≥1 flat mess, higher on lumps).
   */
  onImpact: (point: THREE.Vector3, direction: THREE.Vector3) => number;
  /**
   * Water struck something mid-air; return true to soak up the droplet.
   * `dirty` means it's muck bouncing off a pile.
   */
  onBodyHit: (
    point: THREE.Vector3,
    dirty: boolean,
    direction: THREE.Vector3,
  ) => boolean;
  /** Bounce spray caught the player's face. */
  onFaceHit: (dirty: boolean) => void;
}

/** Close enough for a visible bounce off paving, bodies, walls. */
const BOUNCE_RANGE = 8.5;
const BOUNCE_LIFE = 1.15;
/** How often the stream tip stamps the floor (wash + one splash ring). */
const GROUND_STRIKE = 0.045;
/** How near the camera a bounce drop has to get to count as a faceful. */
const FACE_HIT = 0.42;
const CLEAN = 0xd8f0ff;
const MUCK = 0x6b5a3a;

export class WaterJet {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private hooks: JetHooks;

  private droplets: Droplet[] = [];
  private idle: THREE.Mesh[] = [];
  private splashes: { mesh: THREE.Mesh; life: number }[] = [];
  /** Solid jet look — cylinder segments along the arc. */
  private stream: THREE.Mesh[] = [];
  private streamMat: THREE.MeshBasicMaterial;
  /** Ballistic samples that make the stream whip when the lance swings. */
  private ribbon: RibbonNode[] = [];
  private ribbonAcc = 0;
  /** Latest ground hit from the ribbon tip, if any this frame. */
  private ribbonHit: { point: THREE.Vector3; direction: THREE.Vector3 } | null =
    null;
  private lance: THREE.Group;
  private muzzle: THREE.Object3D;
  private emitAccumulator = 0;
  /** Seconds until the stream tip may stamp the floor again. */
  private groundCool = 0;
  /** 0 ready, 1 fully stowed — tipLance layers on top of this. */
  private holsterAmount = 0;
  private tipPitch = 0;
  private tipYaw = 0;
  private tipRoll = 0;
  /** Council heavy hose from the van — wider, harder, drains a tank. */
  private heavy = false;
  private pressure = 1;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    hooks: JetHooks,
  ) {
    this.scene = scene;
    this.camera = camera;
    this.hooks = hooks;

    this.streamMat = new THREE.MeshBasicMaterial({
      color: CLEAN,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const tube = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true);
    tube.translate(0, 0.5, 0);
    for (let i = 0; i < STREAM_SEGS; i++) {
      const mesh = new THREE.Mesh(tube, this.streamMat);
      mesh.visible = false;
      mesh.renderOrder = 2;
      scene.add(mesh);
      this.stream.push(mesh);
    }

    // Motion drips + bounce flecks (and hit probes).
    const fleck = new THREE.SphereGeometry(STREAK_RADIUS, 4, 3);
    for (let i = 0; i < POOL_SIZE; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: CLEAN,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(fleck, material);
      mesh.visible = false;
      mesh.renderOrder = 3;
      scene.add(mesh);
      this.idle.push(mesh);
    }

    const built = this.buildLance();
    this.lance = built.group;
    this.muzzle = built.muzzle;
    camera.add(this.lance);
  }

  private buildLance(): { group: THREE.Group; muzzle: THREE.Object3D } {
    const group = new THREE.Group();
    const matt = (color: number): THREE.MeshStandardMaterial =>
      new THREE.MeshStandardMaterial({
        color,
        roughness: 1,
        metalness: 0,
        flatShading: true,
      });
    const metal = matt(0x8a969e);
    const dark = matt(0x2a2e32);
    const orange = matt(0xe07020);
    const rubber = matt(0x1a1a1e);
    const brass = matt(0xb08a3c);

    // Whole gun sits in the right hand, angled in toward centre of view.
    const gun = new THREE.Group();
    gun.position.set(0.28, -0.32, -0.7);
    gun.rotation.set(0.08, -0.12, 0.08);

    // Pistol body.
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.09, 0.16), dark);
    body.position.set(0, 0.02, 0);
    body.castShadow = true;
    gun.add(body);

    const top = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.14), metal);
    top.position.set(0, 0.065, -0.01);
    gun.add(top);

    // Pistol grip, rubber overmould.
    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.13, 0.055),
      orange,
    );
    grip.position.set(0, -0.06, 0.02);
    grip.rotation.x = 0.35;
    gun.add(grip);

    for (const y of [-0.02, -0.05, -0.08]) {
      const ridge = new THREE.Mesh(
        new THREE.BoxGeometry(0.048, 0.008, 0.04),
        rubber,
      );
      ridge.position.set(0, y, 0.025);
      ridge.rotation.x = 0.35;
      gun.add(ridge);
    }

    // Trigger — simple box, no torus guard.
    const trigger = new THREE.Mesh(
      new THREE.BoxGeometry(0.014, 0.038, 0.02),
      rubber,
    );
    trigger.position.set(0, -0.015, -0.02);
    trigger.rotation.x = 0.2;
    gun.add(trigger);

    // Coupler into the lance.
    const coupler = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.04, 0.05),
      brass,
    );
    coupler.position.set(0, 0.04, -0.1);
    gun.add(coupler);

    // Long lance tube — low-segment cylinder keeps the facets.
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.016, 0.95, 6),
      metal,
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.04, -0.58);
    barrel.castShadow = true;
    gun.add(barrel);

    // Mid sleeve / insulator.
    const sleeveRing = new THREE.Mesh(
      new THREE.BoxGeometry(0.038, 0.038, 0.08),
      orange,
    );
    sleeveRing.position.set(0, 0.04, -0.35);
    gun.add(sleeveRing);

    // Nozzle tip.
    const nozzle = new THREE.Mesh(
      new THREE.BoxGeometry(0.024, 0.024, 0.05),
      dark,
    );
    nozzle.position.set(0, 0.04, -1.07);
    gun.add(nozzle);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.025), brass);
    tip.position.set(0, 0.04, -1.1);
    gun.add(tip);

    // Invisible marker flush with the brass tip face — spray leaves from here.
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.04, -1.1125);
    gun.add(muzzle);

    // Pressure hose trailing back under the wrist.
    const hose = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.014, 0.55, 5),
      rubber,
    );
    hose.geometry.translate(0, -0.27, 0);
    hose.position.set(0.03, -0.1, 0.1);
    hose.rotation.set(1.05, 0, 0.35);
    gun.add(hose);

    // Right hand on the grip, sleeve parented so the forearm stays attached.
    const hand = buildArmedHand(1, "gun");
    // Sit the palm on the orange grip; mitt curls under, thumb wraps the side.
    hand.position.set(0.0, -0.07, 0.035);
    hand.rotation.set(-0.15, 0.08, 0.2);
    gun.add(hand);

    group.add(gun);
    // Slight overall cant so it doesn't sit dead centre.
    group.rotation.set(0.02, -0.04, 0);
    return { group, muzzle };
  }

  /** Swap to the load-bay heavy reel — thicker stream, more knock-back. */
  public setHeavyMode(on: boolean): void {
    this.heavy = on;
    const gun = this.lance.children[0];
    if (gun) gun.scale.setScalar(on ? 1.38 : 1);
    this.streamMat.opacity = on ? 0.62 : 0.55;
  }

  /** Tank fraction left on the heavy hose (0–1). */
  public setPressure(amount: number): void {
    this.pressure = THREE.MathUtils.clamp(amount, 0, 1);
    if (this.heavy) {
      this.streamMat.opacity = 0.35 + this.pressure * 0.45;
    }
  }

  public isHeavy(): boolean {
    return this.heavy;
  }

  private streamPower(): number {
    if (!this.heavy) return 1;
    // Full tank punches hard and far; low pressure still beats the lance.
    return 2.55 * (0.55 + this.pressure * 0.55);
  }

  /** Stream cylinder radius — heavy reel is a fat jet. */
  private streamRadius(): number {
    return STREAM_RADIUS * (this.heavy ? 4.8 : 1);
  }

  /** Slung over the shoulder while they're on the litter. */
  public setStowed(stowed: boolean): void {
    this.lance.visible = !stowed;
  }

  /**
   * Part way through being put away: 0 is up and ready, 1 is dropped out of
   * sight below the view with the barrel turned down.
   */
  public setHolster(amount: number): void {
    this.holsterAmount = amount;
    this.applyLancePose();
  }

  /** World-space point and direction the water leaves the brass tip. */
  private muzzlePose(): { origin: THREE.Vector3; forward: THREE.Vector3 } {
    // Pose may have just tipped the lance — force the whole viewmodel chain.
    this.lance.updateMatrixWorld(true);
    const origin = this.muzzle.getWorldPosition(new THREE.Vector3());
    // Barrel runs along the gun's local −Z (Three's getWorldDirection is +Z).
    const forward = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(this.muzzle.getWorldQuaternion(new THREE.Quaternion()))
      .normalize();
    return { origin, forward };
  }

  /** World-space point the water leaves from. */
  private nozzle(): THREE.Vector3 {
    return this.muzzlePose().origin;
  }

  /** Aim direction from the barrel, with optional stick nudge. */
  private aimDir(aim: { x: number; y: number } | null): THREE.Vector3 {
    const { forward: barrel } = this.muzzlePose();
    const side = new THREE.Vector3();
    if (Math.abs(barrel.y) < 0.95) side.crossVectors(barrel, new THREE.Vector3(0, 1, 0));
    else side.crossVectors(barrel, new THREE.Vector3(1, 0, 0));
    side.normalize();
    const up = new THREE.Vector3().crossVectors(side, barrel).normalize();

    const dir = barrel.clone();
    if (aim) {
      const throwAngle = 0.35;
      // Canvas CSS scaleX(-1): stick +x (screen right) is camera −x.
      dir
        .addScaledVector(side, -aim.x * throwAngle)
        .addScaledVector(up, -aim.y * throwAngle)
        .normalize();
    }
    return dir;
  }

  /**
   * @param aim Stick aim in camera space (+x right, +y down). When set, the
   * stream leaves along that direction instead of straight ahead.
   */
  public update(
    delta: number,
    spraying: boolean,
    aim: { x: number; y: number } | null = null,
  ): void {
    this.tipLance(aim, delta);
    this.groundCool = Math.max(0, this.groundCool - delta);
    this.stepDroplets(delta);
    this.stepRibbon(delta, spraying, aim);
    if (spraying) {
      this.emit(delta, aim);
      this.strikeGround(aim);
    } else if (this.holsterAmount > 0.85) {
      this.ribbon.length = 0;
    }
    this.drawStream(spraying);
    this.stepSplashes(delta);
  }

  /** Nudge the viewmodel toward the spray stick so the stream matches the gun. */
  private tipLance(
    aim: { x: number; y: number } | null,
    delta: number,
  ): void {
    const wantPitch = aim ? -aim.y * 0.55 : 0;
    // Opposite sign to aimDir.x — lance local +Y tips toward camera −X.
    const wantYaw = aim ? aim.x * 0.45 : 0;
    const wantRoll = aim ? -aim.x * 0.12 : 0;
    const k = Math.min(1, 14 * delta);
    this.tipPitch += (wantPitch - this.tipPitch) * k;
    this.tipYaw += (wantYaw - this.tipYaw) * k;
    this.tipRoll += (wantRoll - this.tipRoll) * k;
    this.applyLancePose();
  }

  private applyLancePose(): void {
    const amount = this.holsterAmount;
    this.lance.visible = amount < 0.99;
    this.lance.position.y = -amount * 0.85;
    this.lance.position.z = amount * 0.25;
    const ready = 1 - amount;
    this.lance.rotation.set(
      0.04 - amount * 1.1 + this.tipPitch * ready,
      -0.06 + this.tipYaw * ready,
      amount * 0.35 + this.tipRoll * ready,
    );
  }

  /**
   * Where the focused stream hits the deck — prefer the waving ribbon tip so
   * wash follows the swing; fall back to a straight ballistic guess.
   */
  private ballisticLand(
    aim: { x: number; y: number } | null,
  ): { point: THREE.Vector3; direction: THREE.Vector3 } | null {
    if (this.ribbonHit) return this.ribbonHit;

    // In-flight whip tip (oldest sample) — keep wash on the waving stream.
    let pos: THREE.Vector3;
    let vel: THREE.Vector3;
    if (this.ribbon.length > 0) {
      const tip = this.ribbon[0]!;
      pos = tip.at.clone();
      vel = tip.vel.clone();
    } else {
      const { origin } = this.muzzlePose();
      pos = origin.clone();
      vel = this.aimDir(aim).multiplyScalar(MUZZLE_SPEED);
    }

    for (let i = 0; i < 80; i++) {
      const prev = pos.clone();
      vel.y -= GRAVITY * STREAM_STEP;
      pos.addScaledVector(vel, STREAM_STEP);
      const surface = isInLake(pos.x, pos.z) ? WATER_Y + 0.03 : 0.04;
      if (pos.y > surface) continue;
      const dy = prev.y - pos.y;
      const t = dy > 1e-4 ? THREE.MathUtils.clamp((prev.y - surface) / dy, 0, 1) : 1;
      const point = prev.clone().lerp(pos, t).setY(surface);
      return { point, direction: vel.clone() };
    }
    return null;
  }

  /**
   * Stamp wash + splash only at the stream tip. Stops a spray of rings
   * marching off along every droplet's landing.
   */
  private strikeGround(aim: { x: number; y: number } | null): void {
    if (this.groundCool > 0 || this.holsterAmount > 0.85) return;
    const hit = this.ballisticLand(aim);
    if (!hit) return;

    this.groundCool = GROUND_STRIKE;
    const splash = this.hooks.onImpact(
      hit.point.clone().setY(0),
      hit.direction.clone(),
    );
    const dirty = splash > 0;
    const nozzle = this.nozzle();
    if (nozzle.distanceTo(hit.point) < BOUNCE_RANGE) {
      this.bounceOff(hit.point, hit.direction, dirty, "ground", splash);
    }
    // No ring over a pile — it hides the scrub path through the muck.
    if (!dirty) this.splash(hit.point, dirty);
  }

  /**
   * Advect ribbon samples like the drips — new water leaves along the current
   * aim, older water keeps its momentum so a swing puts a wave in the stream.
   */
  private stepRibbon(
    delta: number,
    spraying: boolean,
    aim: { x: number; y: number } | null,
  ): void {
    this.ribbonHit = null;
    const muzzle = this.nozzle();

    for (let i = this.ribbon.length - 1; i >= 0; i--) {
      const node = this.ribbon[i]!;
      const prev = node.at.clone();
      node.vel.y -= GRAVITY * delta;
      node.at.addScaledVector(node.vel, delta);

      const surface = isInLake(node.at.x, node.at.z) ? WATER_Y + 0.03 : 0.04;
      const reach = this.heavy ? 55 * 55 : 28 * 28;
      const far =
        node.at.distanceToSquared(muzzle) > reach || node.at.y < -2;
      if (node.at.y > surface && !far) continue;

      if (!this.ribbonHit && node.at.y <= surface && prev.y > surface) {
        const dy = prev.y - node.at.y;
        const t =
          dy > 1e-4
            ? THREE.MathUtils.clamp((prev.y - surface) / dy, 0, 1)
            : 1;
        this.ribbonHit = {
          point: prev.clone().lerp(node.at, t).setY(surface),
          direction: node.vel.clone(),
        };
      }
      this.ribbon.splice(i, 1);
    }

    if (!spraying || this.holsterAmount > 0.85) {
      // Die off quickly when the trigger's up.
      if (this.ribbon.length > 0) {
        const drop = Math.ceil(this.ribbon.length * Math.min(1, delta * 8));
        this.ribbon.splice(0, drop);
      }
      this.ribbonAcc = 0;
      return;
    }

    this.ribbonAcc += delta * RIBBON_RATE;
    const { origin } = this.muzzlePose();
    const dir = this.aimDir(aim);
    while (this.ribbonAcc >= 1) {
      this.ribbonAcc -= 1;
      this.ribbon.push({
        at: origin.clone(),
        vel: dir.clone().multiplyScalar(MUZZLE_SPEED * this.streamPower()),
      });
    }
    while (this.ribbon.length > STREAM_SEGS + 24) this.ribbon.shift();
  }

  /**
   * Solid continuous jet drawn along the in-flight ribbon so it waves with
   * the drips when the lance swings.
   */
  private drawStream(spraying: boolean): void {
    if ((!spraying && this.ribbon.length < 2) || this.holsterAmount > 0.85) {
      for (const seg of this.stream) seg.visible = false;
      return;
    }

    const origin = this.muzzlePose().origin;
    // Newest samples sit at the tip; oldest are further along the whip.
    const pts: THREE.Vector3[] = [origin];
    for (let i = this.ribbon.length - 1; i >= 0; i--) {
      pts.push(this.ribbon[i]!.at);
    }

    let used = 0;
    for (let i = 0; i < pts.length - 1 && used < STREAM_SEGS; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const span = new THREE.Vector3().subVectors(b, a);
      const len = span.length();
      if (len < 0.0005) continue;

      // Split long gaps so a fast swing doesn't leave one fat kink.
      const pieces = Math.min(5, Math.max(1, Math.ceil(len / 0.08)));
      for (let p = 0; p < pieces && used < STREAM_SEGS; p++) {
        const t0 = p / pieces;
        const t1 = (p + 1) / pieces;
        const from = a.clone().lerp(b, t0);
        const to = a.clone().lerp(b, t1);
        const bit = new THREE.Vector3().subVectors(to, from);
        const bitLen = bit.length();
        if (bitLen < 0.0005) continue;

        const mesh = this.stream[used]!;
        const along = (i + t0) / Math.max(1, pts.length - 1);
        const radius =
          this.streamRadius() * (1 + along * 0.4) * (this.heavy ? 1 : 1);
        mesh.position.copy(from);
        mesh.scale.set(radius, bitLen * 1.06, radius);
        mesh.quaternion.setFromUnitVectors(
          Y_AXIS,
          bit.multiplyScalar(1 / bitLen),
        );
        mesh.visible = true;
        used++;
      }
    }

    for (let i = used; i < STREAM_SEGS; i++) this.stream[i]!.visible = false;
  }

  /** Motion drips + mid-air hit samples. Floor wash is handled by strikeGround. */
  private emit(
    delta: number,
    aim: { x: number; y: number } | null,
  ): void {
    this.emitAccumulator += delta * EMIT_RATE * this.streamPower();
    const { origin } = this.muzzlePose();
    const aimDir = this.aimDir(aim);

    const fanSide = new THREE.Vector3();
    if (Math.abs(aimDir.y) < 0.95) {
      fanSide.crossVectors(aimDir, new THREE.Vector3(0, 1, 0));
    } else {
      fanSide.crossVectors(aimDir, new THREE.Vector3(1, 0, 0));
    }
    fanSide.normalize();
    const fanUp = new THREE.Vector3().crossVectors(fanSide, aimDir).normalize();

    while (this.emitAccumulator >= 1) {
      this.emitAccumulator -= 1;
      const mesh = this.idle.pop();
      if (!mesh) break;

      const angle = Math.random() * Math.PI * 2;
      const tight = 0.001 + Math.random() * 0.003;
      const radial = Math.cos(angle);
      const along = Math.sin(angle);
      const dir = aimDir
        .clone()
        .addScaledVector(fanSide, radial * tight)
        .addScaledVector(fanUp, along * tight)
        .normalize();

      const speed =
        MUZZLE_SPEED *
        this.streamPower() *
        (this.heavy ? 1.15 : 1) *
        (0.97 + Math.random() * 0.06);
      const velocity = dir.multiplyScalar(speed);

      this.tint(mesh, false);
      mesh.visible = true;
      const drop: Droplet = {
        mesh,
        at: origin.clone(),
        velocity,
        fan: fanSide
          .clone()
          .multiplyScalar(radial)
          .addScaledVector(fanUp, along)
          .normalize(),
        fanRate: 0.4 + Math.random() * 1.1,
        life: DROPLET_LIFE * (this.heavy ? 1.45 : 1),
        bounced: false,
        dirty: false,
      };
      this.droplets.push(drop);
      this.layoutStreak(drop);
    }
  }

  /** Fast elongated drips that ride the stream so it looks like moving water. */
  private layoutStreak(drop: Droplet): void {
    const speed = drop.velocity.length();
    const maxLife = drop.bounced ? BOUNCE_LIFE : DROPLET_LIFE;
    const age = 1 - drop.life / maxLife;
    const slim = 0.35 + age * 0.25;
    const stretch = 3.8 + (1 - age) * 4.5 + speed * 0.04;
    drop.mesh.scale.set(slim, slim, stretch);

    if (speed > 0.01) {
      const dir = drop.velocity.clone().normalize();
      drop.mesh.quaternion.setFromUnitVectors(Z_AXIS, dir);
      drop.mesh.position
        .copy(drop.at)
        .addScaledVector(dir, STREAK_RADIUS * stretch * 0.85);
    } else {
      drop.mesh.position.copy(drop.at);
    }

    const mat = drop.mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = (drop.dirty ? 0.55 : 0.75) * (1 - age * 0.45);
  }

  private layoutFleck(drop: Droplet): void {
    const speed = drop.velocity.length();
    const age = 1 - drop.life / BOUNCE_LIFE;
    const slim = 0.7 + age * 0.4;
    const stretch = 1.6 + speed * 0.06;
    drop.mesh.scale.set(slim, slim, stretch);
    if (speed > 0.01) {
      drop.mesh.quaternion.setFromUnitVectors(
        Z_AXIS,
        drop.velocity.clone().normalize(),
      );
    }
    drop.mesh.position.copy(drop.at);
    const mat = drop.mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = (drop.dirty ? 0.7 : 0.6) * (1 - age * 0.75);
  }

  private tint(mesh: THREE.Mesh, dirty: boolean): void {
    const mat = mesh.material as THREE.MeshBasicMaterial;
    mat.color.setHex(dirty ? MUCK : CLEAN);
    mat.blending = dirty ? THREE.NormalBlending : THREE.AdditiveBlending;
    mat.opacity = dirty ? 0.75 : 0.65;
  }

  private stepDroplets(delta: number): void {
    const nozzle = this.nozzle();
    const face = this.camera.position;

    for (let i = this.droplets.length - 1; i >= 0; i--) {
      const drop = this.droplets[i]!;
      const maxLife = drop.bounced ? BOUNCE_LIFE : DROPLET_LIFE;
      const age = 1 - drop.life / maxLife;

      if (drop.bounced) {
        drop.velocity.addScaledVector(
          drop.fan,
          drop.fanRate * FAN_GROWTH * age * age * delta,
        );
      } else {
        drop.velocity.addScaledVector(
          drop.fan,
          drop.fanRate * 3 * age * age * delta,
        );
      }
      drop.velocity.y -= GRAVITY * (drop.bounced ? 1.35 : 1) * delta;
      drop.at.addScaledVector(drop.velocity, delta);
      drop.life -= delta;

      if (drop.bounced) this.layoutFleck(drop);
      else this.layoutStreak(drop);

      // Bounce spray that comes up into the view counts as a faceful.
      if (
        drop.bounced &&
        drop.at.distanceTo(face) < FACE_HIT &&
        drop.at.y > face.y - 0.35
      ) {
        this.hooks.onFaceHit(drop.dirty);
        drop.mesh.visible = false;
        this.tint(drop.mesh, false);
        this.idle.push(drop.mesh);
        this.droplets.splice(i, 1);
        continue;
      }

      const soaked = this.hooks.onBodyHit(drop.at, drop.dirty, drop.velocity);
      const surface = isInLake(drop.at.x, drop.at.z) ? WATER_Y + 0.03 : 0.04;
      const landed = !soaked && drop.at.y <= surface;

      if (soaked && !drop.bounced) {
        if (nozzle.distanceTo(drop.at) < BOUNCE_RANGE) {
          this.bounceOff(drop.at, drop.velocity, drop.dirty, "body");
        }
      }

      if (landed) {
        // Floor rings / wash come from strikeGround at the stream tip only.
        // Individual drips just die when they hit so they don't seed a trail.
      }
      if (soaked || landed || drop.life <= 0) {
        drop.mesh.visible = false;
        this.tint(drop.mesh, false);
        this.idle.push(drop.mesh);
        this.droplets.splice(i, 1);
      }
    }
  }

  /**
   * Splash off a hit. Spraying down kicks spray back at you; spraying forward
   * skips the jet onward along the ground so it can soak people ahead. Floor
   * rings stay at the tip — only these flecks travel. `force` scales the kick
   * (lumps throw more dirty spray than a flat pad).
   */
  private bounceOff(
    at: THREE.Vector3,
    incoming: THREE.Vector3,
    dirty: boolean,
    kind: "ground" | "body",
    force = 1,
  ): void {
    const punch = dirty ? Math.max(1, force) : 1;
    const count =
      kind === "ground"
        ? Math.round((18 + Math.floor(Math.random() * 12)) * punch)
        : 7 + Math.floor(Math.random() * 6);

    const look = this.camera.getWorldDirection(new THREE.Vector3());
    const gap = this.camera.position.distanceTo(at);
    // Looking down at your feet from close in: bounce comes back at you.
    const lookDown = THREE.MathUtils.clamp(-look.y, 0, 1);
    const closeness = 1 - THREE.MathUtils.clamp((gap - 0.7) / 2.8, 0, 1);
    // How steep the jet hits — near-vertical means rinse-at-your-boots.
    const speed = incoming.length();
    const steep =
      speed > 0.1
        ? THREE.MathUtils.clamp(-incoming.y / speed, 0, 1)
        : lookDown;
    const backAtYou = Math.max(lookDown * closeness, steep * steep * 0.85);
    const faceShare = backAtYou * backAtYou * closeness;
    const faceCount = Math.round(count * faceShare * 0.9);

    // Horizontal travel of the jet on the paving.
    const along = incoming.clone();
    along.y = 0;
    const speedIn = along.length();
    if (speedIn < 0.15) {
      along.copy(look).setY(0);
      if (along.lengthSq() < 0.01) along.set(0, 0, -1);
    }
    along.normalize();
    const side = new THREE.Vector3(-along.z, 0, along.x);
    const liftBoost = dirty ? 1 + (punch - 1) * 0.55 : 1;
    const throwBoost = dirty ? 1 + (punch - 1) * 0.4 : 1;
    const spawnY = Math.max(at.y, 0.1) + (dirty ? (punch - 1) * 0.12 : 0);

    for (let n = 0; n < count; n++) {
      const mesh = this.idle.pop();
      if (!mesh) break;

      let velocity: THREE.Vector3;
      if (n < faceCount) {
        // Straight up into the muzzle / face.
        const toFace = this.camera.position.clone().sub(at);
        toFace.y += 0.05 + Math.random() * 0.1;
        if (toFace.lengthSq() < 0.01) toFace.set(0, 1, 0);
        toFace.normalize();
        velocity = toFace.multiplyScalar((7 + Math.random() * 9) * throwBoost);
        velocity.x += (Math.random() - 0.5) * 2.5 * punch;
        velocity.z += (Math.random() - 0.5) * 2.5 * punch;
      } else if (kind === "ground") {
        const flare = (Math.random() - 0.5) * (5.5 + punch * 1.2);
        const lift =
          (4.8 + Math.random() * 5.5 + Math.max(0, -incoming.y) * 0.2) *
          liftBoost;
        if (backAtYou > 0.55 && Math.random() < backAtYou) {
          // Steep / aimed down — kick back toward the lance.
          const throwBack =
            Math.min(14, 5.5 + speedIn * 0.4) *
            (0.75 + Math.random() * 0.5) *
            throwBoost;
          velocity = new THREE.Vector3(
            -along.x * throwBack + side.x * flare,
            lift + 2.2,
            -along.z * throwBack + side.z * flare,
          );
        } else {
          // Forward spray — arc hits and skips onward the way it was going.
          const throwOn =
            Math.min(17, 7 + speedIn * 0.55) *
            (0.8 + Math.random() * 0.45) *
            throwBoost;
          velocity = new THREE.Vector3(
            along.x * throwOn + side.x * flare,
            lift,
            along.z * throwOn + side.z * flare,
          );
        }
      } else {
        // Off a body: a little scatter onward.
        const out = 2.2 + Math.random() * 3.6;
        velocity = new THREE.Vector3(
          along.x * out + (Math.random() - 0.5) * 3,
          2.4 + Math.random() * 4.2,
          along.z * out + (Math.random() - 0.5) * 3,
        );
      }

      this.tint(mesh, dirty);
      const spawn = new THREE.Vector3(
        at.x + (Math.random() - 0.5) * 0.14,
        spawnY + Math.random() * 0.2,
        at.z + (Math.random() - 0.5) * 0.14,
      );
      mesh.visible = true;
      const drop: Droplet = {
        mesh,
        at: spawn,
        velocity,
        fan: side.clone().multiplyScalar(Math.random() > 0.5 ? 1 : -1),
        fanRate: kind === "ground" ? 0.8 + Math.random() * 1.4 : 0,
        life: BOUNCE_LIFE * (0.8 + Math.random() * 0.4) * (dirty ? Math.min(1.25, 0.85 + punch * 0.15) : 1),
        bounced: true,
        dirty,
      };
      this.droplets.push(drop);
      this.layoutFleck(drop);
    }
  }

  private splash(at: THREE.Vector3, dirty = false): void {
    if (this.splashes.length > 55) return;
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.06, 0.22, 12),
      new THREE.MeshBasicMaterial({
        color: dirty ? 0x8a7348 : 0xdff2ff,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(
      at.x,
      isInLake(at.x, at.z) ? WATER_Y + 0.05 : 0.06,
      at.z,
    );
    this.scene.add(mesh);
    this.splashes.push({ mesh, life: 0.3 });
  }

  private stepSplashes(delta: number): void {
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const splash = this.splashes[i]!;
      splash.life -= delta;
      const t = Math.max(0, splash.life / 0.3);
      splash.mesh.scale.setScalar(1 + (1 - t) * 2.5);
      (splash.mesh.material as THREE.MeshBasicMaterial).opacity = 0.7 * t;
      if (splash.life <= 0) {
        this.scene.remove(splash.mesh);
        splash.mesh.geometry.dispose();
        (splash.mesh.material as THREE.Material).dispose();
        this.splashes.splice(i, 1);
      }
    }
  }
}
