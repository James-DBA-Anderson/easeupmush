import * as THREE from "three";
import type { Platform, Solid } from "../types";
import { CARROT_HOVER, Carrot } from "./Carrot";
import { addFlowers } from "./flowers";
import type { Level } from "./Level";
import { buildLollipop } from "./Lollipop";

export const TARGET_CARROTS = 50;

/**
 * Level 1 — grassy ground strip, lollipop platforms, fifty carrots.
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
    this.buildFlowers();
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
      color: 0x5ecf4a,
      roughness: 0.9,
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
        color: 0x3a9a2a,
        roughness: 0.85,
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

  /** Bright blooms and daisies along the grass — decoration only. */
  private buildFlowers(): void {
    addFlowers(this.root, [
      // Near start — left bank
      { x: -12, z: -3.2, kind: "daisy" },
      { x: -11.2, z: -3.8, kind: "bright", s: 0.9 },
      { x: -10.4, z: -2.9, kind: "daisy", s: 0.85 },
      { x: -9.5, z: 3.4, kind: "bright" },
      { x: -8.2, z: 3.9, kind: "daisy" },
      { x: -7.4, z: 3.1, kind: "daisy", s: 1.1 },
      // Mid strip edges
      { x: -3.5, z: -4.2, kind: "bright", s: 1.05 },
      { x: -2.2, z: -4.6, kind: "daisy" },
      { x: -1.0, z: -3.8, kind: "daisy", s: 0.8 },
      { x: 0.5, z: 4.0, kind: "bright" },
      { x: 1.6, z: 4.5, kind: "daisy" },
      { x: 3.2, z: 3.8, kind: "bright", s: 0.95 },
      { x: 4.8, z: -4.4, kind: "daisy", s: 1.15 },
      { x: 6.0, z: -3.9, kind: "bright" },
      { x: 7.1, z: -4.5, kind: "daisy" },
      // Around purple lollipop
      { x: 0.4, z: -3.0, kind: "daisy" },
      { x: 3.4, z: -3.5, kind: "bright", s: 0.9 },
      { x: 2.6, z: 2.4, kind: "daisy" },
      // Mid → tall swirl
      { x: 8.2, z: 3.6, kind: "bright" },
      { x: 9.0, z: 4.2, kind: "daisy", s: 1.05 },
      { x: 11.2, z: -3.5, kind: "daisy" },
      { x: 12.0, z: -4.1, kind: "bright", s: 1.1 },
      { x: 12.8, z: -3.2, kind: "daisy", s: 0.85 },
      // Toward the end
      { x: 15.0, z: 3.5, kind: "daisy" },
      { x: 16.2, z: 4.1, kind: "bright" },
      { x: 17.0, z: 3.2, kind: "daisy", s: 0.95 },
      { x: 18.5, z: -3.6, kind: "bright", s: 1.05 },
      { x: 19.4, z: -4.2, kind: "daisy" },
      { x: 20.2, z: -3.4, kind: "daisy", s: 0.8 },
      { x: 21.0, z: 3.8, kind: "bright" },
      { x: 22.2, z: 3.2, kind: "daisy" },
      { x: 14.0, z: 4.4, kind: "daisy", s: 1.1 },
    ]);
  }

  private buildLollipops(): void {
    const pops: Array<{
      x: number;
      z: number;
      h: number;
      r: number;
      flavor: "purple" | "swirl" | "red";
    }> = [
      { x: -5.5, z: 1.1, h: 1.7, r: 1.9, flavor: "red" },
      { x: 2, z: -1.2, h: 2.4, r: 2.15, flavor: "purple" },
      { x: 7.2, z: 1.6, h: 3.4, r: 1.85, flavor: "swirl" },
      { x: 10, z: 0.8, h: 5.2, r: 2.55, flavor: "swirl" },
      { x: 17.5, z: -0.6, h: 1.5, r: 1.95, flavor: "red" },
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
    this.buildCake(13.2, 1.4);
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

  /** Three-tier birthday cake — sponge, frosting drips, cherries, candle. */
  private buildCake(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const sponge = new THREE.MeshStandardMaterial({
      color: 0xf5c878,
      roughness: 0.92,
    });
    const spongeDark = new THREE.MeshStandardMaterial({
      color: 0xe8a85a,
      roughness: 0.95,
    });
    const icingPink = new THREE.MeshStandardMaterial({
      color: 0xff8ec8,
      roughness: 0.55,
    });
    const icingWhite = new THREE.MeshStandardMaterial({
      color: 0xfff6fb,
      roughness: 0.5,
    });
    const icingLavender = new THREE.MeshStandardMaterial({
      color: 0xd4b4ff,
      roughness: 0.55,
    });
    const plate = new THREE.MeshStandardMaterial({
      color: 0xf0e8e0,
      roughness: 0.35,
      metalness: 0.15,
    });
    const cherry = new THREE.MeshStandardMaterial({
      color: 0xe82040,
      roughness: 0.35,
    });
    const stem = new THREE.MeshStandardMaterial({
      color: 0x3a8a40,
      roughness: 0.7,
    });
    const wax = new THREE.MeshStandardMaterial({
      color: 0xfff3c8,
      roughness: 0.6,
    });
    const flameMat = new THREE.MeshStandardMaterial({
      color: 0xffaa33,
      emissive: 0xff6622,
      emissiveIntensity: 0.85,
      roughness: 0.4,
    });
    const sprinkleColors = [0xff5a7a, 0x5ad4ff, 0xffe066, 0xb8ff6a, 0xff9ad4];

    // Plate
    const platter = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 1.1, 0.08, 24),
      plate,
    );
    platter.position.y = 0.04;
    platter.receiveShadow = true;
    platter.castShadow = true;
    group.add(platter);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(1.08, 0.04, 8, 28),
      plate,
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.08;
    group.add(rim);

    const tiers: Array<{
      r: number;
      h: number;
      icing: THREE.MeshStandardMaterial;
    }> = [
      { r: 0.92, h: 0.55, icing: icingPink },
      { r: 0.68, h: 0.48, icing: icingWhite },
      { r: 0.46, h: 0.4, icing: icingLavender },
    ];

    let y = 0.08;
    for (let t = 0; t < tiers.length; t++) {
      const tier = tiers[t]!;
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(tier.r * 0.98, tier.r, tier.h, 20),
        t % 2 === 0 ? sponge : spongeDark,
      );
      body.position.y = y + tier.h * 0.5;
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);

      // Soft frosting cap
      const frost = new THREE.Mesh(
        new THREE.CylinderGeometry(tier.r * 1.02, tier.r * 1.02, 0.1, 20),
        tier.icing,
      );
      frost.position.y = y + tier.h + 0.02;
      frost.castShadow = true;
      group.add(frost);

      // Piping ring
      const pipe = new THREE.Mesh(
        new THREE.TorusGeometry(tier.r * 0.92, 0.055, 8, 24),
        tier.icing,
      );
      pipe.rotation.x = Math.PI / 2;
      pipe.position.y = y + tier.h + 0.04;
      group.add(pipe);

      // Icing drips around the rim
      const dripCount = 8 + t * 2;
      for (let i = 0; i < dripCount; i++) {
        const a = (i / dripCount) * Math.PI * 2 + t * 0.2;
        const dripLen = 0.12 + (i % 3) * 0.06;
        const drip = new THREE.Mesh(
          new THREE.SphereGeometry(0.07, 8, 8),
          tier.icing,
        );
        drip.scale.set(0.85, 1.4 + dripLen * 2, 0.85);
        drip.position.set(
          Math.cos(a) * tier.r * 0.96,
          y + tier.h - dripLen * 0.35,
          Math.sin(a) * tier.r * 0.96,
        );
        group.add(drip);
      }

      // Cherries on the frosting (skip top — candle lives there)
      if (t < tiers.length - 1) {
        const n = 5 - t;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + 0.4;
          const cx = Math.cos(a) * tier.r * 0.55;
          const cz = Math.sin(a) * tier.r * 0.55;
          const berry = new THREE.Mesh(
            new THREE.SphereGeometry(0.08, 10, 8),
            cherry,
          );
          berry.position.set(cx, y + tier.h + 0.12, cz);
          berry.castShadow = true;
          group.add(berry);
          const stick = new THREE.Mesh(
            new THREE.CylinderGeometry(0.012, 0.012, 0.1, 5),
            stem,
          );
          stick.position.set(cx, y + tier.h + 0.2, cz);
          stick.rotation.z = 0.25;
          group.add(stick);
        }
      }

      // Tiny sprinkle dots on the frosting
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + t * 0.35;
        const rr = tier.r * (0.25 + (i % 3) * 0.18);
        const bit = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, 0.03, 0.08),
          new THREE.MeshStandardMaterial({
            color: sprinkleColors[i % sprinkleColors.length],
            roughness: 0.45,
          }),
        );
        bit.position.set(
          Math.cos(a) * rr,
          y + tier.h + 0.08,
          Math.sin(a) * rr,
        );
        bit.rotation.set(0, a, (i % 4) * 0.2);
        group.add(bit);
      }

      y += tier.h + 0.08;
    }

    // Candle + flame on the top tier
    const candle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.05, 0.38, 8),
      wax,
    );
    candle.position.y = y + 0.22;
    candle.castShadow = true;
    group.add(candle);
    const stripe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.048, 0.052, 0.06, 8),
      icingPink,
    );
    stripe.position.y = y + 0.18;
    group.add(stripe);
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 8, 8),
      flameMat,
    );
    flame.scale.set(0.7, 1.35, 0.7);
    flame.position.y = y + 0.48;
    group.add(flame);

    this.root.add(group);
    this.solids.push({
      kind: "cylinder",
      x,
      z,
      y0: 0,
      y1: y + 0.2,
      radius: 1.0,
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

    this.ring(spots, -5.5, 1.1, 1.0, 6);

    this.ring(spots, 2, -1.2, 1.1, 8);

    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      spots.push(
        new THREE.Vector3(
          THREE.MathUtils.lerp(3.5, 7, t),
          THREE.MathUtils.lerp(3.0, 4.0, t),
          THREE.MathUtils.lerp(-0.4, 1.0, t),
        ),
      );
    }

    this.ring(spots, 7.2, 1.6, 0.95, 6);

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
