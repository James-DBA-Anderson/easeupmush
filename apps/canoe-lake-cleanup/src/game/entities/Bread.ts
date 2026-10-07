import * as THREE from "three";
import { WATER_Y, isInLake } from "../world/lake";

const CRUMBS = 14;
const SPREAD = 1.3;
const MELT_FOR = 0.28;

/** A handful of bread on the path or floating on the lake, and the crowd it draws. */
export class Bread {
  private scene: THREE.Scene;
  private group = new THREE.Group();
  private crumbs: THREE.Mesh[] = [];
  private centre: THREE.Vector3;
  private afloat: boolean;
  private washLoad = 0;
  private flying = false;
  private flight = 1;
  private flightFor = 0.55;
  private loft = 0;
  private from = new THREE.Vector3();
  private land = new THREE.Vector3();
  private spin = new THREE.Vector3();

  constructor(scene: THREE.Scene, at: THREE.Vector3, from?: THREE.Vector3) {
    this.scene = scene;
    this.centre = at.clone().setY(0);
    this.land.copy(this.centre);
    this.afloat = isInLake(at.x, at.z);

    const crust = new THREE.MeshStandardMaterial({
      color: 0xe8d7a8,
      roughness: 1,
      transparent: true,
    });
    for (let i = 0; i < CRUMBS; i++) {
      const size = 0.06 + Math.random() * 0.07;
      const crumb = new THREE.Mesh(
        new THREE.BoxGeometry(size, size * 0.45, size),
        crust.clone(),
      );
      const angle = Math.random() * Math.PI * 2;
      const reach = Math.random() * SPREAD;
      crumb.position.set(
        Math.cos(angle) * reach,
        this.afloat ? 0.015 : 0.03,
        Math.sin(angle) * reach,
      );
      crumb.rotation.set(
        (Math.random() - 0.5) * 0.4,
        Math.random() * Math.PI,
        (Math.random() - 0.5) * 0.4,
      );
      crumb.castShadow = true;
      crumb.userData.melt = 0;
      crumb.userData.melting = false;
      crumb.userData.baseY = crumb.position.y;
      this.group.add(crumb);
      this.crumbs.push(crumb);
    }

    if (from) {
      this.flying = true;
      this.flight = 0;
      this.flightFor = 0.45 + Math.random() * 0.35;
      this.loft = 1.35 + Math.random() * 1.4;
      this.from.copy(from);
      this.spin.set(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 10,
      );
      this.group.position.copy(from);
    } else {
      this.group.position.set(
        this.centre.x,
        this.afloat ? WATER_Y + 0.01 : 0,
        this.centre.z,
      );
    }
    scene.add(this.group);
  }

  public update(delta: number): void {
    if (this.flying) {
      this.flight = Math.min(1, this.flight + delta / this.flightFor);
      const t = this.flight;
      const ease = t * t * (3 - 2 * t);
      const x = THREE.MathUtils.lerp(this.from.x, this.land.x, ease);
      const z = THREE.MathUtils.lerp(this.from.z, this.land.z, ease);
      const ground = this.afloat ? WATER_Y + 0.01 : 0;
      const y =
        THREE.MathUtils.lerp(this.from.y, ground, ease) +
        Math.sin(t * Math.PI) * this.loft;
      this.group.position.set(x, y, z);
      this.group.rotation.x += this.spin.x * delta;
      this.group.rotation.y += this.spin.y * delta;
      this.group.rotation.z += this.spin.z * delta;
      if (t >= 1) {
        this.flying = false;
        this.afloat = isInLake(this.land.x, this.land.z);
        this.centre.copy(this.land).setY(0);
        this.group.rotation.set(0, 0, 0);
        this.group.position.set(
          this.centre.x,
          this.afloat ? WATER_Y + 0.01 : 0,
          this.centre.z,
        );
      }
    }

    for (let i = this.crumbs.length - 1; i >= 0; i--) {
      const crumb = this.crumbs[i]!;
      if (!crumb.userData.melting) continue;
      crumb.userData.melt = Math.min(1, crumb.userData.melt + delta / MELT_FOR);
      const u = crumb.userData.melt as number;
      const keep = Math.max(0.05, 1 - u);
      crumb.scale.setScalar(keep);
      crumb.position.y = (crumb.userData.baseY as number) * keep;
      const mat = crumb.material as THREE.MeshStandardMaterial;
      mat.opacity = 1 - u;
      mat.transparent = true;
      if (u < 1) continue;
      crumb.removeFromParent();
      mat.dispose();
      this.crumbs.splice(i, 1);
    }
  }

  public getPosition(): THREE.Vector3 {
    return this.centre.clone();
  }

  public isAfloat(): boolean {
    return this.afloat;
  }

  /** One peck. Takes a crumb off the pile. */
  public peck(): void {
    const crumb = this.crumbs.pop();
    if (!crumb) return;
    crumb.removeFromParent();
    (crumb.material as THREE.MeshStandardMaterial).dispose();
  }

  public isGone(): boolean {
    return this.crumbs.length === 0;
  }

  /** How picked over it is, for the birds deciding whether to bother. */
  public remaining(): number {
    let n = 0;
    for (const crumb of this.crumbs) {
      const melt = (crumb.userData.melt as number) || 0;
      n += Math.max(0, 1 - melt);
    }
    return n;
  }

  public hitBy(point: THREE.Vector3): boolean {
    const here = this.flying ? this.group.position : this.centre;
    const dx = point.x - here.x;
    const dz = point.z - here.z;
    const baseY = this.flying
      ? here.y
      : this.afloat
        ? WATER_Y
        : 0;
    const dy = point.y - baseY;
    const r = this.afloat ? 1.8 : 1.35;
    return dx * dx + dy * dy * 0.4 + dz * dz < r * r;
  }

  /** Clean jet on the path — crumbs dissolve after a good soaking. */
  public wash(strength: number): void {
    this.washLoad += strength;
    while (this.washLoad >= 0.28) {
      const crumb = this.crumbs.find((c) => !c.userData.melting);
      if (!crumb) {
        this.washLoad = 0;
        break;
      }
      this.washLoad -= 0.28;
      crumb.userData.melting = true;
    }
  }

  public dispose(): void {
    for (const crumb of this.crumbs) {
      (crumb.material as THREE.MeshStandardMaterial).dispose();
    }
    this.scene.remove(this.group);
  }
}
