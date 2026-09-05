import * as THREE from "three";
import { WATER_Y, isInLake } from "../world/lake";
import { buildHand, buildSleeve } from "./Hands";

const GRAVITY = 26;
const MUZZLE_SPEED = 24;
const DROPLET_LIFE = 1.35;
const POOL_SIZE = 420;
/** How hard the stream breaks up once it's left the nozzle. */
const FAN_GROWTH = 14;

const Z_AXIS = new THREE.Vector3(0, 0, 1);

interface Droplet {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  /** Unit vector perpendicular to the aim — where this drop drifts as it fans. */
  fan: THREE.Vector3;
  fanRate: number;
  life: number;
  /** Already ricocheted — don't bounce again. */
  bounced: boolean;
  /** Brown muck from washing mess. */
  dirty: boolean;
}

/**
 * Pressure-washer spray. Droplets leave the lance in a tight column and only
 * fan out once they've travelled, the way a real lance does — narrow up close,
 * a soft cone further out — then fall under gravity. Close hits kick a spray
 * that keeps the stream's momentum; looking straight down at your feet throws
 * some of it back in your face.
 */
export interface JetHooks {
  /**
   * Water reached the ground here, travelling roughly this way.
   * Return true if it struck mess — bounce spray comes back dirty.
   */
  onImpact: (point: THREE.Vector3, direction: THREE.Vector3) => boolean;
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
const BOUNCE_RANGE = 3.9;
const BOUNCE_LIFE = 0.55;
/** How near the camera a bounce drop has to get to count as a faceful. */
const FACE_HIT = 0.42;
const CLEAN = { color: 0xd8f0ff, emissive: 0x3a8ab0 };
const MUCK = { color: 0x6b5a3a, emissive: 0x3a2a14 };

export class WaterJet {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private hooks: JetHooks;

  private droplets: Droplet[] = [];
  private idle: THREE.Mesh[] = [];
  private splashes: { mesh: THREE.Mesh; life: number }[] = [];
  private lance: THREE.Group;
  private muzzle: THREE.Object3D;
  private emitAccumulator = 0;
  /** 0 ready, 1 fully stowed — tipLance layers on top of this. */
  private holsterAmount = 0;
  private tipPitch = 0;
  private tipYaw = 0;
  private tipRoll = 0;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    hooks: JetHooks,
  ) {
    this.scene = scene;
    this.camera = camera;
    this.hooks = hooks;

    // Small spheres, stretched along their travel so the jet reads as streaks.
    const geometry = new THREE.SphereGeometry(0.045, 5, 4);
    for (let i = 0; i < POOL_SIZE; i++) {
      const material = new THREE.MeshStandardMaterial({
        color: 0xd8f0ff,
        emissive: 0x3a8ab0,
        transparent: true,
        opacity: 0.9,
        roughness: 0.15,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
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

    // Invisible marker at the end of the brass tip — spray leaves from here.
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.04, -1.12);
    gun.add(muzzle);

    // Pressure hose trailing back under the wrist.
    const hose = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.014, 0.55, 5),
      rubber,
    );
    hose.geometry.translate(0, -0.27, 0);
    hose.position.set(0.02, -0.08, 0.12);
    hose.rotation.set(1.1, 0, 0.4);
    gun.add(hose);

    // Hand and hi-vis sleeve on the grip.
    const hand = buildHand(1, "gun");
    hand.position.set(0.01, -0.05, 0.04);
    hand.rotation.set(-0.5, 0.15, 0.35);
    gun.add(hand);

    const arm = buildSleeve(1);
    arm.position.set(0.04, -0.14, 0.18);
    arm.rotation.set(-0.15, 0, 0.1);
    gun.add(arm);

    group.add(gun);
    // Slight overall cant so it doesn't sit dead centre.
    group.rotation.set(0.02, -0.04, 0);
    return { group, muzzle };
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

  /** World-space point the water leaves from. */
  private nozzle(): THREE.Vector3 {
    this.camera.updateMatrixWorld();
    this.muzzle.updateWorldMatrix(true, false);
    return this.muzzle.getWorldPosition(new THREE.Vector3());
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
    if (spraying) this.emit(delta, aim);
    this.stepDroplets(delta);
    this.stepSplashes(delta);
  }

  /** Nudge the viewmodel toward the spray stick so the stream matches the gun. */
  private tipLance(
    aim: { x: number; y: number } | null,
    delta: number,
  ): void {
    const wantPitch = aim ? -aim.y * 0.55 : 0;
    const wantYaw = aim ? -aim.x * 0.45 : 0;
    const wantRoll = aim ? aim.x * 0.12 : 0;
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

  private emit(
    delta: number,
    aim: { x: number; y: number } | null,
  ): void {
    const perSecond = 130;
    this.emitAccumulator += delta * perSecond;
    const forward = this.camera.getWorldDirection(new THREE.Vector3());
    const origin = this.nozzle();

    // Stick deflection steers the stream; full throw is roughly 50°.
    const side = new THREE.Vector3();
    if (Math.abs(forward.y) < 0.95) side.crossVectors(forward, new THREE.Vector3(0, 1, 0));
    else side.crossVectors(forward, new THREE.Vector3(1, 0, 0));
    side.normalize();
    const up = new THREE.Vector3().crossVectors(side, forward).normalize();

    const aimDir = forward.clone();
    if (aim) {
      const throwAngle = 0.95;
      aimDir
        .addScaledVector(side, aim.x * throwAngle)
        .addScaledVector(up, -aim.y * throwAngle)
        .normalize();
    }

    // Fan basis around the actual aim, not camera forward.
    const fanSide = new THREE.Vector3();
    if (Math.abs(aimDir.y) < 0.95) fanSide.crossVectors(aimDir, new THREE.Vector3(0, 1, 0));
    else fanSide.crossVectors(aimDir, new THREE.Vector3(1, 0, 0));
    fanSide.normalize();
    const fanUp = new THREE.Vector3().crossVectors(fanSide, aimDir).normalize();

    while (this.emitAccumulator >= 1) {
      this.emitAccumulator -= 1;
      const mesh = this.idle.pop();
      if (!mesh) break;

      // Almost parallel at the muzzle — the fan comes later.
      const angle = Math.random() * Math.PI * 2;
      const tight = 0.004 + Math.random() * 0.01;
      const radial = Math.cos(angle);
      const along = Math.sin(angle);
      const dir = aimDir
        .clone()
        .addScaledVector(fanSide, radial * tight)
        .addScaledVector(fanUp, along * tight)
        .normalize();

      const fan = fanSide
        .clone()
        .multiplyScalar(radial)
        .addScaledVector(fanUp, along)
        .normalize();

      const velocity = dir.multiplyScalar(
        MUZZLE_SPEED * (0.94 + Math.random() * 0.12),
      );

      this.tint(mesh, false);
      mesh.position.copy(origin);
      mesh.visible = true;
      this.droplets.push({
        mesh,
        velocity,
        fan,
        fanRate: 1.2 + Math.random() * 2.8,
        life: DROPLET_LIFE,
        bounced: false,
        dirty: false,
      });
    }
  }

  private tint(mesh: THREE.Mesh, dirty: boolean): void {
    const mat = mesh.material as THREE.MeshStandardMaterial;
    const look = dirty ? MUCK : CLEAN;
    mat.color.setHex(look.color);
    mat.emissive.setHex(look.emissive);
  }

  private stepDroplets(delta: number): void {
    const nozzle = this.nozzle();
    const face = this.camera.position;

    for (let i = this.droplets.length - 1; i >= 0; i--) {
      const drop = this.droplets[i]!;
      const maxLife = drop.bounced ? BOUNCE_LIFE : DROPLET_LIFE;
      const age = 1 - drop.life / maxLife;

      // Breakup grows with distance travelled: tight near the lance, wider out.
      if (!drop.bounced) {
        drop.velocity.addScaledVector(
          drop.fan,
          drop.fanRate * FAN_GROWTH * age * age * delta,
        );
      }
      drop.velocity.y -= GRAVITY * (drop.bounced ? 1.35 : 1) * delta;
      drop.mesh.position.addScaledVector(drop.velocity, delta);
      drop.life -= delta;

      const speed = drop.velocity.length();
      if (speed > 0.01) {
        drop.mesh.quaternion.setFromUnitVectors(
          Z_AXIS,
          drop.velocity.clone().normalize(),
        );
      }
      const slim = drop.bounced ? 0.7 + age * 0.5 : 0.55 + age * 0.9;
      const stretch = drop.bounced
        ? 1.2 + speed * 0.04
        : 1.6 + (1 - age) * 2.4 + speed * 0.03;
      drop.mesh.scale.set(slim, slim, stretch);
      const mat = drop.mesh.material as THREE.MeshStandardMaterial;
      mat.opacity = (drop.dirty ? 0.85 : 0.95) - age * 0.5;

      // Bounce spray that comes up into the view counts as a faceful.
      if (
        drop.bounced &&
        drop.mesh.position.distanceTo(face) < FACE_HIT &&
        drop.mesh.position.y > face.y - 0.35
      ) {
        this.hooks.onFaceHit(drop.dirty);
        drop.mesh.visible = false;
        mat.opacity = 0.9;
        this.tint(drop.mesh, false);
        this.idle.push(drop.mesh);
        this.droplets.splice(i, 1);
        continue;
      }

      const soaked = this.hooks.onBodyHit(
        drop.mesh.position,
        drop.dirty,
        drop.velocity,
      );
      const surface = isInLake(drop.mesh.position.x, drop.mesh.position.z)
        ? WATER_Y + 0.03
        : 0.04;
      const landed = !soaked && drop.mesh.position.y <= surface;

      if (soaked && !drop.bounced) {
        if (nozzle.distanceTo(drop.mesh.position) < BOUNCE_RANGE) {
          this.bounceOff(drop.mesh.position, drop.velocity, drop.dirty, "body");
        }
      }

      if (landed) {
        const dirtyHit =
          !drop.bounced &&
          this.hooks.onImpact(
            drop.mesh.position.clone().setY(0),
            drop.velocity.clone(),
          );
        const filthy = dirtyHit || drop.dirty;
        if (!drop.bounced && nozzle.distanceTo(drop.mesh.position) < BOUNCE_RANGE) {
          this.bounceOff(drop.mesh.position, drop.velocity, filthy, "ground");
        }
        this.splash(drop.mesh.position, filthy);
      }
      if (soaked || landed || drop.life <= 0) {
        drop.mesh.visible = false;
        mat.opacity = 0.9;
        this.tint(drop.mesh, false);
        this.idle.push(drop.mesh);
        this.droplets.splice(i, 1);
      }
    }
  }

  /**
   * Splash off a hit. Most of it keeps the stream's forward push and skitters
   * on; only when you're close and looking down does a share come back at you.
   */
  private bounceOff(
    at: THREE.Vector3,
    incoming: THREE.Vector3,
    dirty: boolean,
    kind: "ground" | "body",
  ): void {
    const count =
      kind === "ground"
        ? 5 + Math.floor(Math.random() * 5)
        : 3 + Math.floor(Math.random() * 4);

    const look = this.camera.getWorldDirection(new THREE.Vector3());
    const gap = this.camera.position.distanceTo(at);
    // Looking down at your feet from close in: most of the bounce is in your face.
    const lookDown = THREE.MathUtils.clamp(-look.y, 0, 1);
    const closeness = 1 - THREE.MathUtils.clamp((gap - 0.7) / 2.4, 0, 1);
    const faceShare = lookDown * lookDown * closeness;
    const faceCount = Math.round(count * faceShare * 0.95);

    const along = incoming.clone();
    along.y = 0;
    if (along.lengthSq() < 0.01) {
      along.copy(look).setY(0);
      if (along.lengthSq() < 0.01) along.set(1, 0, 0);
    }
    along.normalize();
    const hSpeed = Math.hypot(incoming.x, incoming.z);

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
        velocity = toFace.multiplyScalar(7 + Math.random() * 9);
        velocity.x += (Math.random() - 0.5) * 2.5;
        velocity.z += (Math.random() - 0.5) * 2.5;
      } else {
        // Keep going the way the jet was going, with an upward kick.
        const keep = 0.5 + Math.random() * 0.4;
        const up =
          kind === "ground"
            ? 2.2 + Math.random() * 4.5 + Math.max(0, -incoming.y) * 0.2
            : 1.6 + Math.random() * 3.5;
        velocity = new THREE.Vector3(
          along.x * hSpeed * keep + (Math.random() - 0.5) * 5,
          up,
          along.z * hSpeed * keep + (Math.random() - 0.5) * 5,
        );
      }

      this.tint(mesh, dirty);
      mesh.position.set(
        at.x + (Math.random() - 0.5) * 0.12,
        Math.max(at.y, 0.08) + Math.random() * 0.15,
        at.z + (Math.random() - 0.5) * 0.12,
      );
      mesh.visible = true;
      this.droplets.push({
        mesh,
        velocity,
        fan: new THREE.Vector3(0, 1, 0),
        fanRate: 0,
        life: BOUNCE_LIFE * (0.75 + Math.random() * 0.4),
        bounced: true,
        dirty,
      });
    }
  }

  private splash(at: THREE.Vector3, dirty = false): void {
    if (this.splashes.length > 40) return;
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.04, 0.16, 12),
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
