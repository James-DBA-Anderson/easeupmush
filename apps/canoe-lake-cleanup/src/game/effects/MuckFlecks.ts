import * as THREE from "three";

const GEO = new THREE.SphereGeometry(1, 6, 4);
const MUCK = [0x5a4a32, 0x6b5340, 0x4a3a28, 0x7a6a48, 0x3a2e22] as const;
const UP = new THREE.Vector3(0, 1, 0);

interface Fleck {
  mesh: THREE.Mesh;
  life: number;
  fade: number;
}

/**
 * Brown spatters left by filthy bounce spray. Raycast onto the body mesh so
 * they sit on the surface, then dry and flake off over a minute or so.
 */
export class MuckFlecks {
  private root: THREE.Object3D;
  private flecks: Fleck[] = [];
  private max: number;
  private raycaster = new THREE.Raycaster();
  private from = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private aim = new THREE.Vector3();
  private center = new THREE.Vector3();
  private normal = new THREE.Vector3();
  private localPos = new THREE.Vector3();
  private worldQuat = new THREE.Quaternion();
  private parentQuat = new THREE.Quaternion();
  private bounds = new THREE.Box3();

  constructor(root: THREE.Object3D, max = 28) {
    this.root = root;
    this.max = max;
  }

  /** Dabs a few flecks around a world-space hit, stuck to the skin. */
  public splat(worldPoint: THREE.Vector3, count = 3 + Math.floor(Math.random() * 3)): void {
    this.root.updateWorldMatrix(true, true);
    const targets = this.surfaces();
    if (targets.length === 0) return;

    this.bounds.setFromObject(this.root);
    this.bounds.getCenter(this.center);

    for (let i = 0; i < count; i++) {
      if (this.flecks.length >= this.max) this.dropOldest();

      const hit = this.pickSurface(worldPoint, targets);
      if (!hit) continue;

      const host = hit.object as THREE.Mesh;
      const mat = new THREE.MeshStandardMaterial({
        color: MUCK[Math.floor(Math.random() * MUCK.length)]!,
        roughness: 1,
        flatShading: true,
      });
      const mesh = new THREE.Mesh(GEO, mat);
      mesh.userData.muckFleck = true;
      // Flattened blob so it reads as a smear on the hide, not a floating bead.
      const size = 0.022 + Math.random() * 0.04;
      mesh.scale.set(
        size * (1.1 + Math.random() * 0.7),
        size * 0.2,
        size * (1.1 + Math.random() * 0.7),
      );

      this.surfaceNormal(hit, host, this.normal);
      this.localPos.copy(hit.point).addScaledVector(this.normal, 0.006);
      host.worldToLocal(this.localPos);
      mesh.position.copy(this.localPos);

      this.worldQuat.setFromUnitVectors(UP, this.normal);
      host.getWorldQuaternion(this.parentQuat);
      mesh.quaternion.copy(this.parentQuat).invert().multiply(this.worldQuat);
      mesh.rotateY(Math.random() * Math.PI * 2);

      host.add(mesh);
      this.flecks.push({
        mesh,
        life: 14 + Math.random() * 22,
        fade: 2.5 + Math.random() * 2,
      });
    }
  }

  public update(delta: number): void {
    for (let i = this.flecks.length - 1; i >= 0; i--) {
      const fleck = this.flecks[i]!;
      fleck.life -= delta;
      if (fleck.life <= 0) {
        this.dropAt(i);
        continue;
      }
      if (fleck.life < fleck.fade) {
        const mat = fleck.mesh.material as THREE.MeshStandardMaterial;
        mat.transparent = true;
        mat.opacity = Math.max(0, fleck.life / fleck.fade);
        mat.depthWrite = false;
      }
    }
  }

  public dispose(): void {
    while (this.flecks.length > 0) this.dropOldest();
  }

  /** Mesh parts of the body — never the flecks themselves. */
  private surfaces(): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    this.root.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      if (obj.userData.muckFleck) return;
      out.push(obj as THREE.Mesh);
    });
    return out;
  }

  /**
   * Cast from just outside the body toward a jittered aim near the spray hit,
   * so the fleck lands on whatever skin is facing the hose.
   */
  private pickSurface(
    worldPoint: THREE.Vector3,
    targets: THREE.Mesh[],
  ): THREE.Intersection | null {
    this.aim.copy(worldPoint).add(
      this.dir.set(
        (Math.random() - 0.5) * 0.28,
        (Math.random() - 0.5) * 0.22,
        (Math.random() - 0.5) * 0.28,
      ),
    );

    this.dir.copy(this.aim).sub(this.center);
    if (this.dir.lengthSq() < 1e-6) {
      this.dir.set(Math.random() - 0.5, 0.4 + Math.random(), Math.random() - 0.5);
    }
    this.dir.normalize();

    this.from.copy(this.aim).addScaledVector(this.dir, 0.65);
    this.dir.multiplyScalar(-1);
    this.raycaster.set(this.from, this.dir);
    this.raycaster.far = 1.6;
    const hits = this.raycaster.intersectObjects(targets, false);
    if (hits.length > 0) return hits[0]!;

    // Fallback: straight in from the original hit, in case the jitter missed.
    this.dir.copy(worldPoint).sub(this.center);
    if (this.dir.lengthSq() < 1e-6) this.dir.set(0, 1, 0);
    this.dir.normalize();
    this.from.copy(worldPoint).addScaledVector(this.dir, 0.5);
    this.dir.multiplyScalar(-1);
    this.raycaster.set(this.from, this.dir);
    this.raycaster.far = 1.4;
    const again = this.raycaster.intersectObjects(targets, false);
    return again[0] ?? null;
  }

  private surfaceNormal(
    hit: THREE.Intersection,
    host: THREE.Mesh,
    into: THREE.Vector3,
  ): void {
    if (hit.face) {
      into.copy(hit.face.normal).transformDirection(host.matrixWorld).normalize();
      return;
    }
    into.copy(hit.point).sub(this.center).normalize();
  }

  private dropOldest(): void {
    this.dropAt(0);
  }

  private dropAt(i: number): void {
    const fleck = this.flecks[i]!;
    fleck.mesh.parent?.remove(fleck.mesh);
    (fleck.mesh.material as THREE.Material).dispose();
    this.flecks.splice(i, 1);
  }
}
