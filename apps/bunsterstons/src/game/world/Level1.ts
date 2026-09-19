import * as THREE from "three";
import type { Platform, Solid } from "../types";
import { CARROT_HOVER, Carrot } from "./Carrot";
import type { Level } from "./Level";
import { buildLollipop } from "./Lollipop";

export const TARGET_CARROTS = 50;

/**
 * Level 1 — candy ground strip, three lollipops, fifty carrots.
 * Bunsterstons' stage.
 */
export class Level1 implements Level {
  readonly root = new THREE.Group();
  readonly platforms: Platform[] = [];
  readonly solids: Solid[] = [];
  readonly carrots: Carrot[] = [];
  readonly targetCarrots = TARGET_CARROTS;

  constructor(scene: THREE.Scene) {
    this.buildGround();
    this.buildLollipops();
    this.buildObstacle();
    this.scatterCarrots();
    scene.add(this.root);
  }

  public update(delta: number, elapsed: number): void {
    for (const c of this.carrots) c.update(delta, elapsed);
  }

  public reset(): void {
    for (const c of this.carrots) c.reset();
  }

  public dispose(scene: THREE.Scene): void {
    scene.remove(this.root);
  }

  private buildGround(): void {
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xff6bb5,
      roughness: 0.85,
    });
    const ground = new THREE.Mesh(
      new THREE.BoxGeometry(48, 0.4, 18),
      groundMat,
    );
    ground.position.set(4, -0.2, 0);
    ground.receiveShadow = true;
    this.root.add(ground);

    const lip = new THREE.Mesh(
      new THREE.BoxGeometry(48.2, 0.18, 18.4),
      new THREE.MeshStandardMaterial({
        color: 0x5dade2,
        roughness: 0.7,
      }),
    );
    lip.position.set(4, -0.42, 0);
    lip.receiveShadow = true;
    this.root.add(lip);

    this.platforms.push({
      x: 4,
      y: 0,
      z: 0,
      radius: 26,
      top: 0,
      halfW: 24,
      halfD: 9,
    });
  }

  private buildLollipops(): void {
    const pops: Array<{
      x: number;
      z: number;
      h: number;
      r: number;
      flavor: "purple" | "swirl" | "red";
    }> = [
      { x: 2, z: -1.2, h: 2.4, r: 1.55, flavor: "purple" },
      { x: 10, z: 0.8, h: 5.2, r: 1.85, flavor: "swirl" },
      { x: 17.5, z: -0.6, h: 1.5, r: 1.35, flavor: "red" },
    ];

    for (const p of pops) {
      const built = buildLollipop(p.x, p.z, p.h, p.r, p.flavor);
      this.root.add(built.group);
      this.platforms.push(built.platform);
      this.solids.push(built.stick);
    }
  }

  /** Giant candy obstacles on the path — jump over or around. */
  private buildObstacle(): void {
    this.buildCandyCane(5.5, -2.2);
    this.buildMarshmallowStack(13.2, 1.4);
  }

  /** Striped candy cane arch — hop through the gap or over the hook. */
  private buildCandyCane(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const red = new THREE.MeshStandardMaterial({
      color: 0xff3b5c,
      roughness: 0.4,
    });
    const white = new THREE.MeshStandardMaterial({
      color: 0xfff5f0,
      roughness: 0.45,
    });

    const postH = 2.4;
    const postR = 0.22;
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(postR, 0.26, postH, 12),
      red,
    );
    post.position.y = postH * 0.5;
    post.castShadow = true;
    group.add(post);

    for (let i = 0; i < 5; i++) {
      const stripe = new THREE.Mesh(
        new THREE.TorusGeometry(postR + 0.02, 0.05, 6, 16),
        white,
      );
      stripe.position.y = 0.35 + i * 0.45;
      stripe.rotation.x = Math.PI / 2;
      group.add(stripe);
    }

    // Partial torus in XY — one end on the stick tip, curve arches up and over.
    const hookR = 0.55;
    const hook = new THREE.Mesh(
      new THREE.TorusGeometry(hookR, postR, 10, 24, Math.PI * 1.2),
      red,
    );
    hook.position.set(hookR, postH, 0);
    hook.rotation.z = Math.PI; // start of arc meets the post
    hook.scale.y = -1; // arc goes up over, not down
    hook.castShadow = true;
    group.add(hook);

    this.root.add(group);
    this.solids.push({
      kind: "cylinder",
      x,
      z,
      y0: 0,
      y1: 2.5,
      radius: 0.45,
    });
  }

  /** Stack of pink marshmallows between the tall and red pops. */
  private buildMarshmallowStack(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const pink = new THREE.MeshStandardMaterial({
      color: 0xffb4d9,
      roughness: 0.85,
    });
    const white = new THREE.MeshStandardMaterial({
      color: 0xfff8fc,
      roughness: 0.9,
    });

    const sizes = [0.85, 0.7, 0.55];
    let y = 0;
    for (let i = 0; i < sizes.length; i++) {
      const r = sizes[i]!;
      const puff = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r * 1.05, r * 0.95, 16),
        i % 2 === 0 ? pink : white,
      );
      puff.position.y = y + r * 0.48;
      puff.rotation.y = i * 0.4;
      puff.castShadow = true;
      puff.receiveShadow = true;
      group.add(puff);
      y += r * 0.9;
    }

    this.root.add(group);
    this.solids.push({
      kind: "cylinder",
      x,
      z,
      y0: 0,
      y1: y + 0.15,
      radius: 0.95,
    });
  }

  private scatterCarrots(): void {
    const spots: THREE.Vector3[] = [];

    for (let i = 0; i < 8; i++) {
      spots.push(new THREE.Vector3(-11 + i * 1.35, 0, (i % 2) * 0.9 - 0.4));
    }

    for (let i = 0; i < 6; i++) {
      spots.push(new THREE.Vector3(-2 + i * 0.7, 0, -0.8 + (i % 3) * 0.35));
    }

    this.ring(spots, 2, -1.2, 1.1, 8);

    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      spots.push(
        new THREE.Vector3(
          THREE.MathUtils.lerp(3.5, 9, t),
          THREE.MathUtils.lerp(3.2, 5.8, t),
          THREE.MathUtils.lerp(-0.6, 0.5, t),
        ),
      );
    }

    this.ring(spots, 10, 0.8, 1.25, 10);

    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      spots.push(
        new THREE.Vector3(
          THREE.MathUtils.lerp(12, 16.5, t),
          THREE.MathUtils.lerp(5.5, 2.3, t),
          THREE.MathUtils.lerp(0.4, -0.4, t),
        ),
      );
    }

    this.ring(spots, 17.5, -0.6, 0.95, 7);

    let n = 0;
    while (spots.length < TARGET_CARROTS) {
      const x = -8 + (n % 12) * 2.1 + (n % 3) * 0.2;
      const z = ((n * 7) % 9) - 4;
      spots.push(new THREE.Vector3(x, 0, z));
      n += 1;
    }

    for (let i = 0; i < TARGET_CARROTS; i++) {
      const s = spots[i]!;
      const y = this.clearY(s.x, s.y, s.z);
      const carrot = new Carrot(s.x, y, s.z);
      this.carrots.push(carrot);
      this.root.add(carrot.group);
    }
  }

  private ring(
    out: THREE.Vector3[],
    cx: number,
    cz: number,
    radius: number,
    count: number,
  ): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + 0.2;
      out.push(
        new THREE.Vector3(
          cx + Math.cos(a) * radius,
          0,
          cz + Math.sin(a) * radius,
        ),
      );
    }
  }

  private clearY(x: number, preferredY: number, z: number): number {
    const surface = this.surfaceTop(x, z);
    return Math.max(preferredY, surface + CARROT_HOVER);
  }

  private surfaceTop(x: number, z: number): number {
    let best = -Infinity;
    for (const p of this.platforms) {
      const dx = x - p.x;
      const dz = z - p.z;
      const onPad =
        p.halfW != null && p.halfD != null
          ? Math.abs(dx) < p.halfW && Math.abs(dz) < p.halfD
          : dx * dx + dz * dz <= p.radius * p.radius;
      if (onPad) best = Math.max(best, p.top);
    }
    for (const s of this.solids) {
      if (!this.onSolid(x, z, s)) continue;
      best = Math.max(best, s.y1);
    }
    return best === -Infinity ? 0 : best;
  }

  private onSolid(x: number, z: number, s: Solid): boolean {
    const dx = x - s.x;
    const dz = z - s.z;
    if (s.kind === "cylinder") {
      const r = s.radius ?? 0.5;
      return dx * dx + dz * dz <= r * r;
    }
    return Math.abs(dx) < (s.halfW ?? 0.5) && Math.abs(dz) < (s.halfD ?? 0.5);
  }
}
