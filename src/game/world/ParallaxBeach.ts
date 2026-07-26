import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, LANE, ROAD, WORLD_WIDTH } from "../constants";
import { separateObstacles, type Obstacle } from "./obstacles";
import { DestructibleProp, type DestructibleSpawn } from "./DestructibleProp";

interface ParallaxLayer {
  sprite: Phaser.GameObjects.TileSprite;
  factor: number;
}

interface ParallaxImage {
  image: Phaser.GameObjects.Image;
  worldX: number;
  screenY: number;
  factor: number;
}

interface SeaCraft {
  image: Phaser.GameObjects.Image;
  /** Screen-space X (scrollFactor 0 layer). */
  x: number;
  y: number;
  vx: number;
  bobPhase: number;
  bobAmp: number;
}

/**
 * Southsea seafront west → east:
 * Clarence Pier / funfair → Common + Naval Memorial → Southsea Castle →
 * The Pyramids → South Parade Pier, with Solent + Isle of Wight beyond.
 */
export class ParallaxBeach {
  private readonly layers: ParallaxLayer[] = [];
  private readonly images: ParallaxImage[] = [];
  readonly destructibles: DestructibleProp[] = [];
  private readonly seaCraft: SeaCraft[] = [];
  private waveT = 0;
  private nextCraftAt = 2500;

  constructor(private readonly scene: Phaser.Scene) {
    this.build();
  }

  getObstacles(): Obstacle[] {
    const out: Obstacle[] = [];
    for (const p of this.destructibles) {
      const o = p.asObstacle();
      if (o) out.push(o);
    }
    return out;
  }

  private addLandmark(
    key: string,
    worldX: number,
    screenY: number,
    factor: number,
    opts: { originX?: number; originY?: number; scale?: number; alpha?: number; depth?: number } = {},
  ): void {
    const image = this.scene.add
      .image(0, 0, key)
      .setOrigin(opts.originX ?? 0.5, opts.originY ?? 1)
      .setScrollFactor(0)
      .setDepth(opts.depth ?? -20)
      .setScale(opts.scale ?? 1)
      .setAlpha(opts.alpha ?? 1);
    this.images.push({ image, worldX, screenY, factor });
  }

  private build(): void {
    const s = this.scene;
    const seaY = GAME_HEIGHT * 0.32;
    const commonY = GAME_HEIGHT * 0.44;
    const beachY = GAME_HEIGHT * 0.5;

    const sky = s.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, "sky")
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(-50);
    this.layers.push({ sprite: sky, factor: 0.02 });

    const clouds = s.add
      .tileSprite(0, 4, GAME_WIDTH, 150, "clouds")
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(-40);
    this.layers.push({ sprite: clouds, factor: 0.1 });

    this.addLandmark("landmark_spinnaker", 180, GAME_HEIGHT * 0.28, 0.05, {
      scale: 0.85,
      alpha: 0.75,
      depth: -38,
    });

    this.addLandmark("isle_wight", WORLD_WIDTH * 0.45, GAME_HEIGHT * 0.3, 0.07, {
      scale: 1.55,
      alpha: 0.88,
      depth: -36,
    });

    const sea = s.add
      .tileSprite(0, seaY, GAME_WIDTH, 120, "sea")
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(-28);
    this.layers.push({ sprite: sea, factor: 0.38 });

    this.addLandmark("solent_fort", 2100, GAME_HEIGHT * 0.38, 0.22, {
      scale: 1.1,
      alpha: 0.85,
      depth: -26,
    });

    // Container ships on the horizon — huge vessels, tiny because far
    this.addLandmark("container_ship", 900, GAME_HEIGHT * 0.335, 0.06, {
      scale: 0.55,
      alpha: 0.7,
      depth: -34,
    });
    this.addLandmark("container_ship", 1600, GAME_HEIGHT * 0.328, 0.055, {
      scale: 0.45,
      alpha: 0.65,
      depth: -34,
    });
    this.addLandmark("container_ship", 2800, GAME_HEIGHT * 0.34, 0.06, {
      scale: 0.5,
      alpha: 0.68,
      depth: -34,
    });

    // Distant beach folk (not in the fight lane)
    this.addLandmark("distant_walker", 700, GAME_HEIGHT * 0.48, 0.5, {
      scale: 0.7,
      alpha: 0.55,
      depth: -11,
    });
    this.addLandmark("distant_walker", 1300, GAME_HEIGHT * 0.475, 0.48, {
      scale: 0.65,
      alpha: 0.5,
      depth: -11,
    });
    this.addLandmark("distant_fisherman", 2050, GAME_HEIGHT * 0.49, 0.52, {
      scale: 0.85,
      alpha: 0.6,
      depth: -11,
    });
    this.addLandmark("distant_walker", 2700, GAME_HEIGHT * 0.47, 0.5, {
      scale: 0.7,
      alpha: 0.5,
      depth: -11,
    });
    this.addLandmark("distant_walker", 3500, GAME_HEIGHT * 0.485, 0.5, {
      scale: 0.75,
      alpha: 0.55,
      depth: -11,
    });

    this.addLandmark("landmark_south_parade_pier", 3100, GAME_HEIGHT * 0.54, 0.3, {
      originX: 0.15,
      scale: 1.05,
      depth: -16,
    });

    const common = s.add
      .tileSprite(0, commonY, GAME_WIDTH, 70, "common")
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(-14);
    this.layers.push({ sprite: common, factor: 0.72 });

    this.addLandmark("landmark_naval_memorial", 1050, commonY + 64, 0.72, {
      scale: 1.05,
      depth: -13,
    });

    this.addLandmark("landmark_clarence_pier", 420, GAME_HEIGHT * 0.52, 0.55, {
      originX: 0.5,
      scale: 1.05,
      depth: -12,
    });

    this.addLandmark("landmark_southsea_castle", 1750, GAME_HEIGHT * 0.52, 0.58, {
      scale: 1.2,
      depth: -12,
    });

    this.addLandmark("landmark_pyramids", 2400, GAME_HEIGHT * 0.515, 0.6, {
      scale: 1.15,
      depth: -12,
    });

    const beach = s.add
      .tileSprite(0, beachY, GAME_WIDTH, 300, "beach")
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(-10);
    this.layers.push({ sprite: beach, factor: 1 });

    const kerbY = ROAD.top - 2;
    const raw: DestructibleSpawn[] = [
      // Cars parked on the road strip at the bottom of the screen
      { key: "car", x: 560, y: GAME_HEIGHT - 10, rx: 70, ry: 28, scale: 1.2, depth: 22 },
      { key: "car", x: 1680, y: GAME_HEIGHT - 12, rx: 70, ry: 28, scale: 1.15, depth: 22 },
      { key: "car", x: 2920, y: GAME_HEIGHT - 10, rx: 70, ry: 28, scale: 1.22, depth: 22 },
      { key: "prop_bin", x: 280, y: LANE.minY + 35, rx: 28, ry: 22, depth: 12 },
      // Bollards on the kerb — above the road layer so they aren't clipped
      { key: "prop_bollard", x: 680, y: kerbY, rx: 22, ry: 20, depth: 20 },
      { key: "prop_bin_green", x: 900, y: LANE.minY + 40, rx: 28, ry: 22, depth: 12 },
      { key: "prop_bollard", x: 1200, y: kerbY, rx: 22, ry: 20, depth: 20 },
      { key: "prop_bin", x: 1500, y: LANE.minY + 30, rx: 28, ry: 22, depth: 12 },
      { key: "prop_bollard", x: 1900, y: kerbY, rx: 22, ry: 20, depth: 20 },
      { key: "prop_bin_green", x: 2200, y: LANE.minY + 45, rx: 28, ry: 22, depth: 12 },
      { key: "prop_bollard", x: 2650, y: kerbY, rx: 22, ry: 20, depth: 20 },
      { key: "prop_bin", x: 3200, y: LANE.minY + 35, rx: 28, ry: 22, depth: 12 },
      { key: "prop_bin_green", x: 3700, y: LANE.minY + 50, rx: 28, ry: 22, depth: 12 },
    ];

    separateObstacles(raw);

    for (const p of raw) {
      p.x = Phaser.Math.Clamp(p.x, LANE.minX, LANE.maxX);
      // Cars sit on the road; bollards on the kerb; bins in the fight lane
      if (p.key === "car") {
        p.y = Phaser.Math.Clamp(p.y, ROAD.top + 20, GAME_HEIGHT - 6);
      } else if (p.key === "prop_bollard") {
        p.y = kerbY;
      } else {
        p.y = Phaser.Math.Clamp(p.y, LANE.minY, Math.min(LANE.maxY, ROAD.top - 8));
      }
      this.destructibles.push(new DestructibleProp(s, p));
    }

    // Visible asphalt road under the cars
    const road = s.add
      .tileSprite(0, ROAD.top, GAME_WIDTH, ROAD.height, "road")
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(16);
    this.layers.push({ sprite: road, factor: 1.12 });

    const kerb = s.add
      .rectangle(GAME_WIDTH / 2, ROAD.top + 2, GAME_WIDTH, 4, 0xc8b898, 0.9)
      .setScrollFactor(0)
      .setDepth(17);

    void kerb;

    s.add
      .rectangle(WORLD_WIDTH / 2, GAME_HEIGHT / 2, WORLD_WIDTH, GAME_HEIGHT, 0x000000, 0)
      .setDepth(-100);

    // One craft already out so the sea isn't empty on load
    this.spawnSeaCraft(true);
  }

  private spawnSeaCraft(fromSide = false): void {
    if (this.seaCraft.length >= 2) return;
    const jet = Math.random() < 0.45;
    const key = jet ? "sea_jetski" : "sea_boat";
    if (!this.scene.textures.exists(key)) return;

    const goingRight = Math.random() < 0.5;
    const midSeaY = GAME_HEIGHT * (0.34 + Math.random() * 0.06);
    const startX = fromSide
      ? goingRight
        ? -40
        : GAME_WIDTH + 40
      : goingRight
        ? -60 - Math.random() * 40
        : GAME_WIDTH + 60 + Math.random() * 40;
    const speed = (jet ? 22 + Math.random() * 12 : 12 + Math.random() * 10) * (goingRight ? 1 : -1);
    const scale = jet ? 0.85 + Math.random() * 0.2 : 0.95 + Math.random() * 0.25;

    const image = this.scene.add
      .image(startX, midSeaY, key)
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(-27)
      .setScale(scale)
      .setAlpha(0.82)
      .setFlipX(!goingRight);

    this.seaCraft.push({
      image,
      x: startX,
      y: midSeaY,
      vx: speed,
      bobPhase: Math.random() * Math.PI * 2,
      bobAmp: jet ? 2.5 : 1.8,
    });
  }

  update(cameraScrollX: number, delta: number, now = 0): void {
    this.waveT += delta;
    for (const layer of this.layers) {
      layer.sprite.tilePositionX = cameraScrollX * layer.factor;
    }
    for (const item of this.images) {
      item.image.x = item.worldX - cameraScrollX * item.factor;
      item.image.y = item.screenY;
    }
    const sea = this.layers.find((l) => l.sprite.texture.key === "sea");
    if (sea) sea.sprite.tilePositionY = Math.sin(this.waveT * 0.002) * 3;
    for (const p of this.destructibles) p.update(now);

    // Occasional jet ski / boat across the mid Solent
    if (now >= this.nextCraftAt) {
      this.spawnSeaCraft();
      this.nextCraftAt = now + 10000 + Math.random() * 16000;
    }
    const dt = delta / 1000;
    const still: SeaCraft[] = [];
    for (const c of this.seaCraft) {
      c.x += c.vx * dt;
      c.bobPhase += dt * 3.2;
      c.image.x = c.x;
      c.image.y = c.y + Math.sin(c.bobPhase) * c.bobAmp;
      const off =
        (c.vx > 0 && c.x > GAME_WIDTH + 80) || (c.vx < 0 && c.x < -80);
      if (off) {
        c.image.destroy();
      } else {
        still.push(c);
      }
    }
    this.seaCraft.length = 0;
    this.seaCraft.push(...still);
  }
}
