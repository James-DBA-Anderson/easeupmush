import * as THREE from 'three';
import { WATER_Y, isInLake } from '../world/lake';

const GRAVITY = 26;
const MUZZLE_SPEED = 21;
const DROPLET_LIFE = 1.4;
const POOL_SIZE = 260;

interface Droplet {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
}

/**
 * Pressure-washer spray. Droplets are launched from the lance and fall under
 * gravity, so the stream arcs and the player aims by lobbing rather than by
 * pointing a laser at the mess.
 */
export interface JetHooks {
  /** Water reached the ground here. */
  onImpact: (point: THREE.Vector3) => void;
  /** Water struck something mid-air; return true to soak up the droplet. */
  onBodyHit: (point: THREE.Vector3) => boolean;
}

export class WaterJet {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private hooks: JetHooks;

  private droplets: Droplet[] = [];
  private idle: THREE.Mesh[] = [];
  private splashes: { mesh: THREE.Mesh; life: number }[] = [];
  private lance: THREE.Group;
  private emitAccumulator = 0;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, hooks: JetHooks) {
    this.scene = scene;
    this.camera = camera;
    this.hooks = hooks;

    const geometry = new THREE.SphereGeometry(0.09, 6, 5);
    const material = new THREE.MeshStandardMaterial({
      color: 0xbfe6ff,
      emissive: 0x2b6f96,
      transparent: true,
      opacity: 0.85,
      roughness: 0.2,
    });
    for (let i = 0; i < POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      scene.add(mesh);
      this.idle.push(mesh);
    }

    this.lance = this.buildLance();
    camera.add(this.lance);
  }

  private buildLance(): THREE.Group {
    const group = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x9fb0bd, roughness: 0.5, metalness: 0.3 });
    const grip = new THREE.MeshStandardMaterial({ color: 0xf0a23a, roughness: 0.8 });

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, 0.85, 10), metal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0.24, -0.3, -1.15);
    group.add(barrel);

    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 0.08), grip);
    handle.position.set(0.24, -0.42, -0.85);
    handle.rotation.x = -0.25;
    group.add(handle);

    // Angled slightly inward so the lance reads as held, not bolted to the view.
    group.rotation.set(0.04, -0.06, 0);
    return group;
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
    this.lance.visible = amount < 0.99;
    this.lance.position.y = -amount * 0.85;
    this.lance.position.z = amount * 0.25;
    this.lance.rotation.set(0.04 - amount * 1.1, -0.06, amount * 0.35);
  }

  /** World-space point the water leaves from. */
  private nozzle(): THREE.Vector3 {
    this.camera.updateMatrixWorld();
    return this.lance.localToWorld(new THREE.Vector3(0.24, -0.3, -1.58));
  }

  public update(delta: number, spraying: boolean): void {
    if (spraying) this.emit(delta);
    this.stepDroplets(delta);
    this.stepSplashes(delta);
  }

  private emit(delta: number): void {
    const perSecond = 90;
    this.emitAccumulator += delta * perSecond;
    const forward = this.camera.getWorldDirection(new THREE.Vector3());
    const origin = this.nozzle();

    while (this.emitAccumulator >= 1) {
      this.emitAccumulator -= 1;
      const mesh = this.idle.pop();
      if (!mesh) break;

      const spread = new THREE.Vector3(
        (Math.random() - 0.5) * 0.09,
        (Math.random() - 0.5) * 0.09,
        (Math.random() - 0.5) * 0.09,
      );
      const velocity = forward
        .clone()
        .add(spread)
        .normalize()
        .multiplyScalar(MUZZLE_SPEED * (0.9 + Math.random() * 0.2));

      mesh.position.copy(origin);
      mesh.scale.setScalar(0.7 + Math.random() * 0.6);
      mesh.visible = true;
      this.droplets.push({ mesh, velocity, life: DROPLET_LIFE });
    }
  }

  private stepDroplets(delta: number): void {
    for (let i = this.droplets.length - 1; i >= 0; i--) {
      const drop = this.droplets[i]!;
      drop.velocity.y -= GRAVITY * delta;
      drop.mesh.position.addScaledVector(drop.velocity, delta);
      drop.life -= delta;

      const soaked = this.hooks.onBodyHit(drop.mesh.position);
      const surface = isInLake(drop.mesh.position.x, drop.mesh.position.z) ? WATER_Y + 0.03 : 0.04;
      const landed = !soaked && drop.mesh.position.y <= surface;
      if (landed) {
        this.hooks.onImpact(drop.mesh.position.clone().setY(0));
        this.splash(drop.mesh.position);
      }
      if (soaked || landed || drop.life <= 0) {
        drop.mesh.visible = false;
        this.idle.push(drop.mesh);
        this.droplets.splice(i, 1);
      }
    }
  }

  private splash(at: THREE.Vector3): void {
    if (this.splashes.length > 40) return;
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.05, 0.2, 12),
      new THREE.MeshBasicMaterial({
        color: 0xdff2ff,
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(at.x, isInLake(at.x, at.z) ? WATER_Y + 0.05 : 0.06, at.z);
    this.scene.add(mesh);
    this.splashes.push({ mesh, life: 0.35 });
  }

  private stepSplashes(delta: number): void {
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const splash = this.splashes[i]!;
      splash.life -= delta;
      const t = Math.max(0, splash.life / 0.35);
      splash.mesh.scale.setScalar(1 + (1 - t) * 3);
      (splash.mesh.material as THREE.MeshBasicMaterial).opacity = 0.75 * t;
      if (splash.life <= 0) {
        this.scene.remove(splash.mesh);
        splash.mesh.geometry.dispose();
        (splash.mesh.material as THREE.Material).dispose();
        this.splashes.splice(i, 1);
      }
    }
  }
}
