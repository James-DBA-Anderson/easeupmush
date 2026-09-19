import * as THREE from "three";
import type { ClimbZone, Platform, Solid } from "../types";
import type { Carrot } from "./Carrot";
import type { Level } from "./Level";
import { AllyBunsterstons } from "./AllyBunsterstons";
import { Ken } from "./Ken";

export type Level2Phase = "approach" | "climb" | "battle" | "won";

/**
 * Level 2 — Chippy climbs a metal gate, then teams with Bunsterstons
 * to knock Ken the hamster off the boat into lava.
 */
export class Level2 implements Level {
  readonly root = new THREE.Group();
  readonly platforms: Platform[] = [];
  readonly solids: Solid[] = [];
  readonly carrots: Carrot[] = [];
  readonly climbZones: ClimbZone[] = [];
  readonly targetCarrots = 0;

  readonly deckTop = 2.2;
  readonly boatCenter = new THREE.Vector3(13, this.deckTop, 0);

  phase: Level2Phase = "approach";
  private ken!: Ken;
  private ally!: AllyBunsterstons;
  private lava!: THREE.Mesh;
  private gateTopY = 5.0;
  private battleStarted = false;

  private readonly deckBounds = {
    minX: 6.8,
    maxX: 19.2,
    minZ: -4.2,
    maxZ: 4.2,
  };

  constructor(scene: THREE.Scene) {
    this.buildApproach();
    this.buildTree(-9, 0);
    this.buildMetalGate(3.5);
    this.buildGateBoatSteps(3.5);
    this.buildLavaAndBoat();
    this.ken = new Ken(14.5, this.deckTop + 0.55, 0);
    this.ken.deckMinX = this.deckBounds.minX;
    this.ken.deckMaxX = this.deckBounds.maxX;
    this.ken.deckMinZ = this.deckBounds.minZ;
    this.ken.deckMaxZ = this.deckBounds.maxZ;
    this.ally = new AllyBunsterstons(11, this.deckTop + 0.55, 1.2);
    // Bunny waits on the boat from the start.
    this.ken.group.visible = false;
    this.ally.group.visible = true;
    this.root.add(this.ken.group);
    this.root.add(this.ally.group);
    scene.add(this.root);
  }

  /** Kept for HUD — no HP bar; show knock-off goal instead. */
  public get bossHp(): number {
    return this.ken.alive ? 1 : 0;
  }

  public get bossMaxHp(): number {
    return 1;
  }

  public get bossDefeated(): boolean {
    return this.phase === "won" || !this.ken.alive;
  }

  public update(_delta: number, elapsed: number): void {
    if (this.lava) {
      const mat = this.lava.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.55 + Math.sin(elapsed * 2.2) * 0.2;
      this.lava.position.y = -0.55 + Math.sin(elapsed * 1.4) * 0.04;
    }
    // Ally idles on the boat before the fight.
    if (!this.battleStarted && this.ally.group.visible) {
      this.ally.group.position.y =
        this.deckTop + 0.55 + Math.abs(Math.sin(elapsed * 3)) * 0.06;
      this.ally.group.rotation.y = elapsed * 0.4;
    }
  }

  public combatUpdate(
    delta: number,
    playerPos: THREE.Vector3,
    attackHit: boolean,
  ): boolean {
    if (
      !this.battleStarted &&
      playerPos.x > 8.5 &&
      playerPos.y > this.deckTop - 0.15 &&
      playerPos.y < this.deckTop + 1.4
    ) {
      this.startBattle();
    }

    if (this.phase !== "battle") return false;

    this.ken.update(delta, performance.now() / 1000, playerPos, this.deckTop);

    if (
      this.ally.update(delta, this.ken.position, this.deckTop, this.deckBounds)
    ) {
      this.ken.knock(this.ally.position, 8, true);
    }

    if (attackHit) {
      const dx = playerPos.x - this.ken.position.x;
      const dy = playerPos.y - this.ken.position.y;
      const dz = playerPos.z - this.ken.position.z;
      if (dx * dx + dy * dy * 0.5 + dz * dz < 2.4 * 2.4) {
        this.ken.knock(playerPos, 10, true);
      }
    }

    if (!this.ken.alive) {
      this.phase = "won";
      return true;
    }
    return false;
  }

  public lavaRespawn(playerPos: THREE.Vector3): THREE.Vector3 | null {
    if (playerPos.y > 0.15) return null;
    if (playerPos.x < 5.5) return null;
    if (this.battleStarted) {
      return new THREE.Vector3(11, this.deckTop + 0.4, 0);
    }
    return new THREE.Vector3(1.5, 0.4, 0);
  }

  public reset(): void {
    this.phase = "approach";
    this.battleStarted = false;
    this.ken.reset();
    this.ken.group.visible = false;
    this.ally.reset(11, this.deckTop + 0.55, 1.2);
    this.ally.group.visible = true;
  }

  public dispose(scene: THREE.Scene): void {
    scene.remove(this.root);
  }

  private startBattle(): void {
    this.battleStarted = true;
    this.phase = "battle";
    this.ken.group.visible = true;
    this.ally.group.visible = true;
  }

  /** Wooden steps from the gate top down onto the boat — no teleport. */
  private buildGateBoatSteps(gateX: number): void {
    const wood = new THREE.MeshStandardMaterial({
      color: 0x9a6a3a,
      roughness: 0.82,
    });
    const steps: Array<{ x: number; top: number; halfW: number; halfD: number }> =
      [
        { x: gateX + 2.15, top: 4.55, halfW: 0.85, halfD: 1.5 },
        { x: gateX + 3.9, top: 3.85, halfW: 0.95, halfD: 1.7 },
        { x: gateX + 5.7, top: 3.2, halfW: 1.05, halfD: 1.9 },
        { x: gateX + 7.6, top: 2.6, halfW: 1.15, halfD: 2.1 },
      ];
    for (const s of steps) {
      const thick = 0.22;
      const plank = new THREE.Mesh(
        new THREE.BoxGeometry(s.halfW * 2, thick, s.halfD * 2),
        wood,
      );
      plank.position.set(s.x, s.top - thick * 0.5, 0);
      plank.castShadow = true;
      plank.receiveShadow = true;
      this.root.add(plank);
      this.platforms.push({
        x: s.x,
        y: s.top,
        z: 0,
        radius: Math.max(s.halfW, s.halfD) + 0.5,
        top: s.top,
        halfW: s.halfW,
        halfD: s.halfD,
      });
    }
  }

  private buildApproach(): void {
    const ground = new THREE.Mesh(
      new THREE.BoxGeometry(16, 0.35, 12),
      new THREE.MeshStandardMaterial({ color: 0x5ecf4a, roughness: 0.9 }),
    );
    ground.position.set(-2.5, -0.175, 0);
    ground.receiveShadow = true;
    this.root.add(ground);

    const lip = new THREE.Mesh(
      new THREE.BoxGeometry(16.2, 0.12, 12.3),
      new THREE.MeshStandardMaterial({ color: 0x3a9a2a, roughness: 0.85 }),
    );
    lip.position.set(-2.5, -0.4, 0);
    this.root.add(lip);

    this.platforms.push({
      x: -2.5,
      y: 0,
      z: 0,
      radius: 10,
      top: 0,
      halfW: 8,
      halfD: 6,
    });
  }

  private buildTree(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const bark = new THREE.MeshStandardMaterial({
      color: 0x8b5a2b,
      roughness: 0.92,
    });
    const leaf = new THREE.MeshStandardMaterial({
      color: 0x3d9e3a,
      roughness: 0.85,
    });

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.75, 4.2, 10),
      bark,
    );
    trunk.position.y = 2.1;
    trunk.castShadow = true;
    group.add(trunk);

    const hollow = new THREE.Mesh(
      new THREE.CircleGeometry(0.45, 16),
      new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 1 }),
    );
    hollow.position.set(0.56, 1.8, 0);
    hollow.rotation.y = Math.PI / 2;
    group.add(hollow);

    for (const [ox, oy, oz, r] of [
      [0, 4.1, 0, 1.15],
      [0.55, 4.3, 0.25, 1.0],
      [-0.5, 3.9, -0.2, 1.05],
    ] as const) {
      const blob = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), leaf);
      blob.position.set(ox, oy, oz);
      blob.castShadow = true;
      group.add(blob);
    }

    this.root.add(group);
    this.solids.push({
      kind: "cylinder",
      x,
      z,
      y0: 0,
      y1: 4.2,
      radius: 0.7,
    });
  }

  /**
   * Metal gate — vertical bars only (no stairs). Chippy climbs the face.
   */
  private buildMetalGate(x: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, 0);
    const metal = new THREE.MeshStandardMaterial({
      color: 0x6a7178,
      roughness: 0.35,
      metalness: 0.85,
    });
    const darkMetal = new THREE.MeshStandardMaterial({
      color: 0x3a4046,
      roughness: 0.4,
      metalness: 0.9,
    });

    for (let i = -4; i <= 4; i++) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, this.gateTopY + 0.3, 0.12),
        i === 0 ? darkMetal : metal,
      );
      bar.position.set(0, (this.gateTopY + 0.3) * 0.5, i * 0.55);
      bar.castShadow = true;
      group.add(bar);
    }

    for (const z of [-2.5, 2.5] as const) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, this.gateTopY + 0.6, 0.28),
        darkMetal,
      );
      post.position.set(0, (this.gateTopY + 0.6) * 0.5, z);
      post.castShadow = true;
      group.add(post);
    }

    // Decorative horizontal rails (not climb platforms).
    for (let i = 1; i <= 5; i++) {
      const y = (i / 6) * this.gateTopY;
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.08, 4.8),
        metal,
      );
      rail.position.set(0, y, 0);
      group.add(rail);
    }

    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.25, 5.4),
      darkMetal,
    );
    lintel.position.set(0, this.gateTopY + 0.35, 0);
    group.add(lintel);

    // Top landing — overhangs boat-side so Chippy can walk onto the steps.
    const topPad = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 0.2, 4.8),
      darkMetal,
    );
    topPad.position.set(0.85, this.gateTopY, 0);
    topPad.receiveShadow = true;
    group.add(topPad);
    this.platforms.push({
      x: x + 0.85,
      y: this.gateTopY,
      z: 0,
      radius: 3,
      top: this.gateTopY + 0.1,
      halfW: 1.4,
      halfD: 2.4,
    });

    this.root.add(group);
    this.solids.push({
      kind: "box",
      x,
      z: 0,
      y0: 0,
      y1: this.gateTopY - 0.15,
      halfW: 0.18,
      halfD: 2.6,
    });
    // Chippy grabs this face and climbs with W/S.
    this.climbZones.push({
      x,
      z: 0,
      y0: 0,
      y1: this.gateTopY,
      halfW: 1.15,
      halfD: 2.55,
    });
  }

  private buildLavaAndBoat(): void {
    const lavaMat = new THREE.MeshStandardMaterial({
      color: 0xff3b1a,
      emissive: 0xff5511,
      emissiveIntensity: 0.6,
      roughness: 0.4,
      metalness: 0.1,
    });
    this.lava = new THREE.Mesh(new THREE.BoxGeometry(28, 0.4, 20), lavaMat);
    this.lava.position.set(14, -0.55, 0);
    this.root.add(this.lava);

    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(28, 20),
      new THREE.MeshBasicMaterial({
        color: 0xff6622,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(14, -0.3, 0);
    this.root.add(glow);

    const wood = new THREE.MeshStandardMaterial({
      color: 0x9a6a3a,
      roughness: 0.8,
    });
    const darkWood = new THREE.MeshStandardMaterial({
      color: 0x6b4423,
      roughness: 0.85,
    });

    const boat = new THREE.Group();
    boat.position.set(13, 0.85, 0);

    // Bigger hull.
    const hull = new THREE.Mesh(new THREE.BoxGeometry(13, 1.6, 9), wood);
    hull.position.y = 0.25;
    hull.castShadow = true;
    hull.receiveShadow = true;
    boat.add(hull);

    for (const bx of [-5.8, 5.8] as const) {
      const lip = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.3, 9.2), darkWood);
      lip.position.set(bx, 0.65, 0);
      boat.add(lip);
    }
    for (const bz of [-4.2, 4.2] as const) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(12.5, 0.65, 0.4),
        darkWood,
      );
      rail.position.set(0, 1.0, bz);
      boat.add(rail);
    }

    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(11.5, 0.25, 7.8),
      new THREE.MeshStandardMaterial({ color: 0xc4a06a, roughness: 0.75 }),
    );
    deck.position.y = 1.25;
    deck.receiveShadow = true;
    boat.add(deck);

    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.16, 4.2, 8),
      darkWood,
    );
    mast.position.set(-2.2, 3.2, 0);
    boat.add(mast);

    this.root.add(boat);
    this.platforms.push({
      x: 13,
      y: this.deckTop,
      z: 0,
      radius: 8,
      top: this.deckTop,
      halfW: 5.7,
      halfD: 3.85,
    });
  }
}
