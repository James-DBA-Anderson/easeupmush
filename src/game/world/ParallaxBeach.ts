import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, LANE, ROAD, WORLD_WIDTH } from "../constants";
import { separateObstacles, type Obstacle } from "./obstacles";
import { DestructibleProp, type DestructibleSpawn } from "./DestructibleProp";
import { FoodStall, type FoodStallSpawn } from "./FoodStall";
import { WeaponShop, UNIQUE_WEAPON_STOCK } from "./WeaponShop";

interface ParallaxLayer {
  sprite: Phaser.GameObjects.TileSprite;
  factor: number;
}

interface ParallaxImage {
  image: Phaser.GameObjects.Image;
  worldX: number;
  screenY: number;
  factor: number;
  /** Optional multi-frame animation (fisherman cast, BBQ smoke, tower jumps). */
  frames?: string[];
  animPhase?: number;
  animSpeed?: number;
  /** Base scale — departure shrinks from this. */
  baseScale?: number;
}

interface SeaCraft {
  image: Phaser.GameObjects.Image;
  /** Screen-space X (scrollFactor 0 layer). */
  x: number;
  y: number;
  vx: number;
  bobPhase: number;
  bobAmp: number;
  kind: "kayak" | "jet" | "boat";
  /** Optional paddle / motion frames. */
  frames?: [string, string];
  animPhase: number;
  animSpeed: number;
}

interface SkySpitfire {
  image: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  bobPhase: number;
}

/**
 * Southsea seafront west → east (longer stroll):
 * Eastney coffee van / Coffee Cup + kids’ park → beach huts → grass verge → Naval Memorial →
 * Castle → Pyramids → South Parade Pier → more beach → sea defences / Round Tower →
 * Clarence Pier funfair.
 */
export class ParallaxBeach {
  private readonly layers: ParallaxLayer[] = [];
  private readonly images: ParallaxImage[] = [];
  readonly destructibles: DestructibleProp[] = [];
  readonly foodStalls: FoodStall[] = [];
  readonly weaponShops: WeaponShop[] = [];
  private readonly seaCraft: SeaCraft[] = [];
  private spitfire: SkySpitfire | null = null;
  /** World-space fan ducts — throws near here get messy. */
  private readonly hoverFans: { x: number; y: number; rx: number; ry: number }[] = [];
  private readonly hoverHull: Obstacle[] = [];
  private hoverCraft: ParallaxImage | null = null;
  private hoverDeparting = false;
  private hoverGone = false;
  private hoverDepartScale = 1;
  private waveT = 0;
  private nextCraftAt = 2500;
  private nextSpitfireAt = 8000;

  constructor(private readonly scene: Phaser.Scene) {
    this.build();
  }

  getObstacles(): Obstacle[] {
    const out: Obstacle[] = [];
    for (const p of this.destructibles) {
      const o = p.asObstacle();
      if (o) out.push(o);
    }
    for (const s of this.foodStalls) out.push(s.asObstacle());
    for (const s of this.weaponShops) out.push(s.asObstacle());
    out.push(...this.hoverHull);
    return out;
  }

  /** Spinning fan ducts on the parked Hovertravel craft. */
  getHovercraftFans(): readonly { x: number; y: number; rx: number; ry: number }[] {
    return this.hoverFans;
  }

  /** True if a thrower is close enough that a toss feeds the fans. */
  isNearHoverFans(x: number, y: number, reach = 150): boolean {
    if (this.hoverDeparting || this.hoverGone) return false;
    for (const f of this.hoverFans) {
      if (Math.hypot(x - f.x, y - f.y) < reach) return true;
    }
    return false;
  }

  /** After a chop — spin up and scarper across the Solent to the Isle of Wight. */
  departHovercraftToIsle(): boolean {
    if (this.hoverDeparting || this.hoverGone || !this.hoverCraft) return false;
    this.hoverDeparting = true;
    this.hoverDepartScale = 1;
    this.hoverFans.length = 0;
    this.hoverHull.length = 0;
    this.hoverCraft.animSpeed = 22;
    this.hoverCraft.image.setDepth(-30);
    return true;
  }

  get hovercraftDeparted(): boolean {
    return this.hoverGone;
  }

  private addLandmark(
    key: string,
    worldX: number,
    screenY: number,
    factor: number,
    opts: {
      originX?: number;
      originY?: number;
      scale?: number;
      alpha?: number;
      depth?: number;
      frames?: string[];
      animSpeed?: number;
    } = {},
  ): ParallaxImage {
    const scale = opts.scale ?? 1;
    const image = this.scene.add
      .image(0, 0, key)
      .setOrigin(opts.originX ?? 0.5, opts.originY ?? 1)
      .setScrollFactor(0)
      .setDepth(opts.depth ?? -20)
      .setScale(scale)
      .setAlpha(opts.alpha ?? 1);
    const item: ParallaxImage = {
      image,
      worldX,
      screenY,
      factor,
      frames: opts.frames,
      animPhase: Math.random() * Math.PI * 2,
      animSpeed: opts.animSpeed ?? 1.6,
      baseScale: scale,
    };
    this.images.push(item);
    return item;
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
      .tileSprite(0, 2, GAME_WIDTH, 160, "clouds")
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(-40)
      .setAlpha(0.55);
    this.layers.push({ sprite: clouds, factor: 0.08 });

    // Depth stack on the Solent (back → front):
    // IoW (-39) → far fort (-36) → container ships (-34) → sea wash (-28) →
    // near forts (-26/-25) → boats/kayaks (-23)
    this.addLandmark("isle_wight", 900, seaY + 2, 0.02, {
      scale: 1.05,
      alpha: 0.5,
      depth: -39,
      originY: 1,
    });
    this.addLandmark("isle_wight", 3200, seaY + 2, 0.02, {
      scale: 0.92,
      alpha: 0.42,
      depth: -39,
      originY: 1,
    });
    this.addLandmark("isle_wight", 5600, seaY + 2, 0.02, {
      scale: 0.88,
      alpha: 0.38,
      depth: -39,
      originY: 1,
    });

    // No Man's Land — toward the Island, behind the shipping lane
    this.addLandmark("solent_fort_nomans", 5400, GAME_HEIGHT * 0.318, 0.07, {
      scale: 0.48,
      alpha: 0.72,
      depth: -36,
    });

    const sea = s.add
      .tileSprite(0, seaY, GAME_WIDTH, 128, "sea")
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(-28);
    this.layers.push({ sprite: sea, factor: 0.38 });

    this.addLandmark("container_ship", 1100, GAME_HEIGHT * 0.335, 0.06, {
      scale: 0.55,
      alpha: 0.7,
      depth: -34,
    });
    this.addLandmark("container_ship", 2400, GAME_HEIGHT * 0.328, 0.055, {
      scale: 0.45,
      alpha: 0.65,
      depth: -34,
    });
    this.addLandmark("container_ship", 4100, GAME_HEIGHT * 0.34, 0.06, {
      scale: 0.5,
      alpha: 0.68,
      depth: -34,
    });
    this.addLandmark("container_ship", 6200, GAME_HEIGHT * 0.332, 0.055, {
      scale: 0.48,
      alpha: 0.66,
      depth: -34,
    });

    // Spitbank — smallest, nearest harbour (west), in front of the ships
    this.addLandmark("solent_fort_spitbank", 1600, GAME_HEIGHT * 0.372, 0.2, {
      scale: 1.05,
      alpha: 0.9,
      depth: -26,
    });
    // Horse Sand — bigger twin mid-front, dazzle patches
    this.addLandmark("solent_fort_horsesand", 3900, GAME_HEIGHT * 0.368, 0.18, {
      scale: 1.15,
      alpha: 0.88,
      depth: -25,
    });

    // Distant beach folk — factor ~0.5 so they drift slower than the prom
    this.addLandmark("distant_walker", 800, GAME_HEIGHT * 0.48, 0.5, {
      scale: 0.7,
      alpha: 0.55,
      depth: -11,
    });
    this.addLandmark("distant_walker", 1800, GAME_HEIGHT * 0.475, 0.48, {
      scale: 0.65,
      alpha: 0.5,
      depth: -11,
    });
    // Feet on the wet foreshore / waterline (sea tile ends ~seaY+128).
    const fishermanY = seaY + 78;
    this.addLandmark("distant_fisherman_0", 2800, fishermanY, 0.48, {
      scale: 0.95,
      alpha: 0.72,
      depth: -11,
      frames: ["distant_fisherman_0", "distant_fisherman_1"],
      animSpeed: 1.1,
    });
    this.addLandmark("distant_walker", 3800, GAME_HEIGHT * 0.47, 0.5, {
      scale: 0.7,
      alpha: 0.5,
      depth: -11,
    });
    this.addLandmark("beach_bbq", 2100, GAME_HEIGHT * 0.505, 0.62, {
      scale: 1.05,
      alpha: 0.9,
      depth: -10,
      frames: ["beach_bbq", "beach_bbq_1"],
      animSpeed: 2.2,
    });
    this.addLandmark("distant_walker", 5000, GAME_HEIGHT * 0.485, 0.5, {
      scale: 0.75,
      alpha: 0.55,
      depth: -11,
    });
    this.addLandmark("beach_bbq", 5200, GAME_HEIGHT * 0.5, 0.6, {
      scale: 0.95,
      alpha: 0.85,
      depth: -10,
      frames: ["beach_bbq", "beach_bbq_1"],
      animSpeed: 1.8,
    });
    this.addLandmark("distant_walker", 6100, GAME_HEIGHT * 0.475, 0.5, {
      scale: 0.7,
      alpha: 0.5,
      depth: -11,
    });
    this.addLandmark("distant_fisherman_0", 7000, fishermanY, 0.48, {
      scale: 0.9,
      alpha: 0.7,
      depth: -11,
      frames: ["distant_fisherman_0", "distant_fisherman_1"],
      animSpeed: 1.3,
    });

    // Past South Parade — beach continues on the fight-lane parallax (factor 1)
    // so these actually sit where you walk (slower factors never reach the screen).
    this.addLandmark("distant_walker", 7800, LANE.minY + 8, 1, {
      scale: 0.85,
      alpha: 0.7,
      depth: -9,
    });
    this.addLandmark("beach_bbq", 8100, LANE.minY + 6, 1, {
      scale: 1.05,
      alpha: 0.9,
      depth: -9,
      frames: ["beach_bbq", "beach_bbq_1"],
      animSpeed: 1.7,
    });
    // Factor 1 so he stays on-screen past South Parade; Y still at the waterline.
    this.addLandmark("distant_fisherman_0", 8450, fishermanY, 1, {
      scale: 1.0,
      alpha: 0.85,
      depth: -9,
      frames: ["distant_fisherman_0", "distant_fisherman_1"],
      animSpeed: 1.25,
    });

    // Sea defences stretch — planted on the promenade, Round Tower between walls
    this.addLandmark("landmark_sea_defences", 8800, LANE.minY + 14, 1, {
      scale: 1.35,
      depth: -8,
    });
    this.addLandmark("landmark_round_tower", 9200, LANE.minY + 18, 1, {
      scale: 1.55,
      depth: -8,
    });
    this.addLandmark("tower_kids_0", 9200, LANE.minY + 18, 1, {
      scale: 1.55,
      depth: -7,
      frames: ["tower_kids_0", "tower_kids_1", "tower_kids_2", "tower_kids_3"],
      animSpeed: 1.35,
    });
    this.addLandmark("landmark_sea_defences", 9600, LANE.minY + 14, 1, {
      scale: 1.4,
      depth: -8,
    });
    this.addLandmark("landmark_sea_defences", 10400, LANE.minY + 14, 1, {
      scale: 1.35,
      depth: -8,
    });

    // Hovertravel — stern to the promenade (fans in your face); bow points at the Island
    const hoverX = 11200;
    const hoverY = LANE.minY + 42;
    this.addLandmark("landmark_hovercraft_port", hoverX, LANE.minY + 24, 1, {
      scale: 1.45,
      depth: -8,
    });
    this.hoverCraft = this.addLandmark("hovercraft_0", hoverX, hoverY, 1, {
      scale: 1.65,
      depth: -7,
      frames: ["hovercraft_0", "hovercraft_1"],
      animSpeed: 8.5,
    });
    // Twin ducts on the stern — landward, toward the fight lane
    this.hoverFans.push(
      { x: hoverX - 48, y: hoverY - 22, rx: 44, ry: 38 },
      { x: hoverX + 48, y: hoverY - 22, rx: 44, ry: 38 },
    );
    this.hoverHull.push({
      x: hoverX,
      y: hoverY - 70,
      rx: 68,
      ry: 70,
      kind: "prop",
    });

    // Stretch past Hovertravel before the funfair
    this.addLandmark("distant_walker", 12000, LANE.minY + 8, 1, {
      scale: 0.95,
      depth: -9,
    });
    this.addLandmark("beach_bbq", 12450, LANE.minY + 6, 1, {
      scale: 1.05,
      depth: -9,
      frames: ["beach_bbq", "beach_bbq_1"],
      animSpeed: 1.4,
    });
    this.addLandmark("landmark_sea_defences", 12850, LANE.minY + 14, 1, {
      scale: 1.3,
      depth: -8,
    });

    // Clarence Pier funfair — Level 2 boss at the far end of the strip
    this.addLandmark("landmark_clarence_funfair", 14000, LANE.minY + 28, 1, {
      originX: 0.5,
      originY: 1,
      scale: 1.55,
      depth: -7,
    });

    // South Parade Pier on the horizon, then the entrance you walk past
    this.addLandmark("landmark_south_parade_pier", 6400, GAME_HEIGHT * 0.54, 0.3, {
      originX: 0.15,
      scale: 1.05,
      depth: -16,
    });
    this.addLandmark("landmark_pier_entrance", 6600, LANE.minY + 10, 1, {
      originX: 0.5,
      depth: -9,
    });

    // Shingle behind the grass — from below the sea down to the promenade
    const shingle = s.add
      .tileSprite(0, commonY, GAME_WIDTH, 70, "common")
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(-15);
    this.layers.push({ sprite: shingle, factor: 0.72 });

    const beach = s.add
      .tileSprite(0, beachY, GAME_WIDTH, 300, "beach")
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(-14);
    this.layers.push({ sprite: beach, factor: 1 });

    // Sparse grass verge on the promenade lip — dwindles out early
    const promLip = LANE.minY;
    const grassEnd = WORLD_WIDTH * 0.32;
    for (let x = 140; x < grassEnd; x += 210) {
      const t = x / grassEnd;
      const fall = (1 - t) * (1 - t);
      const alpha = 0.28 + fall * 0.45;
      if (alpha < 0.3) continue;
      this.addLandmark("grass_verge", x, promLip, 1, {
        scale: 0.75 + fall * 0.25,
        alpha,
        depth: -9,
        originY: 1,
      });
    }

    this.addLandmark("landmark_naval_memorial", 1450, commonY + 64, 1, {
      scale: 1.05,
      depth: -13,
    });

    this.addLandmark("landmark_clarence_pier", 520, GAME_HEIGHT * 0.52, 0.55, {
      originX: 0.5,
      scale: 1.12,
      depth: -12,
    });

    // The Coffee Cup — same depth band as the chip stalls
    this.addLandmark("coffee_cup_cafe", 980, LANE.minY + 12, 1, {
      scale: 1.25,
      depth: -8,
    });
    // Kids’ park adjoined on the cafe’s left
    this.addLandmark("kids_park", 720, LANE.minY + 12, 1, {
      scale: 1.15,
      depth: -8,
    });

    this.addLandmark("landmark_southsea_castle", 2500, GAME_HEIGHT * 0.52, 0.58, {
      scale: 1.2,
      depth: -12,
    });

    this.addLandmark("landmark_pyramids", 3600, GAME_HEIGHT * 0.515, 0.6, {
      scale: 1.28,
      depth: -12,
    });

    const kerbY = ROAD.top - 2;
    const raw: DestructibleSpawn[] = [
      // Cars on the road — sized to read next to fighters (~2.5 people long)
      { key: "car", x: 720, y: GAME_HEIGHT - 8, rx: 92, ry: 32, scale: 1.28, depth: 22 },
      { key: "car", x: 2200, y: GAME_HEIGHT - 10, rx: 92, ry: 32, scale: 1.26, depth: 22 },
      { key: "car", x: 4100, y: GAME_HEIGHT - 8, rx: 92, ry: 32, scale: 1.3, depth: 22 },
      { key: "car", x: 5800, y: GAME_HEIGHT - 9, rx: 92, ry: 32, scale: 1.27, depth: 22 },
      { key: "car", x: 7200, y: GAME_HEIGHT - 8, rx: 92, ry: 32, scale: 1.28, depth: 22 },
      { key: "car", x: 8600, y: GAME_HEIGHT - 9, rx: 92, ry: 32, scale: 1.26, depth: 22 },
      { key: "car", x: 10200, y: GAME_HEIGHT - 8, rx: 92, ry: 32, scale: 1.29, depth: 22 },
      { key: "car", x: 11200, y: GAME_HEIGHT - 10, rx: 92, ry: 32, scale: 1.27, depth: 22 },
      // Steel coffee van on the road (Eastney end) — solid footprint, not climbable
      { key: "coffee_van", x: 300, y: GAME_HEIGHT - 8, rx: 124, ry: 48, scale: 1.32, depth: 22 },
      // Keep clear of the wake-up stroll onto the front (intro lands ~320, 0.68)
      { key: "prop_bin", x: 520, y: LANE.minY + 55, rx: 18, ry: 12, depth: 12 },
      { key: "prop_bollard", x: 680, y: kerbY, rx: 14, ry: 10, depth: 20 },
      { key: "prop_bin_green", x: 1100, y: LANE.minY + 40, rx: 18, ry: 12, depth: 12 },
      { key: "prop_bollard", x: 1600, y: kerbY, rx: 14, ry: 10, depth: 20 },
      { key: "prop_bin", x: 2000, y: LANE.minY + 30, rx: 18, ry: 12, depth: 12 },
      { key: "prop_bollard", x: 2700, y: kerbY, rx: 14, ry: 10, depth: 20 },
      { key: "prop_bin_green", x: 3200, y: LANE.minY + 45, rx: 18, ry: 12, depth: 12 },
      { key: "prop_bollard", x: 3800, y: kerbY, rx: 14, ry: 10, depth: 20 },
      { key: "prop_bin", x: 4500, y: LANE.minY + 35, rx: 18, ry: 12, depth: 12 },
      { key: "prop_bin_green", x: 5300, y: LANE.minY + 50, rx: 18, ry: 12, depth: 12 },
      { key: "prop_bollard", x: 6200, y: kerbY, rx: 14, ry: 10, depth: 20 },
      { key: "prop_bin", x: 6800, y: LANE.minY + 38, rx: 18, ry: 12, depth: 12 },
      { key: "prop_bollard", x: 7100, y: kerbY, rx: 14, ry: 10, depth: 20 },
      { key: "prop_bin_green", x: 7500, y: LANE.minY + 44, rx: 18, ry: 12, depth: 12 },
      { key: "prop_bollard", x: 8400, y: kerbY, rx: 14, ry: 10, depth: 20 },
      { key: "prop_bin", x: 9100, y: LANE.minY + 36, rx: 18, ry: 12, depth: 12 },
      { key: "prop_bollard", x: 9900, y: kerbY, rx: 14, ry: 10, depth: 20 },
      { key: "prop_bin_green", x: 10600, y: LANE.minY + 42, rx: 18, ry: 12, depth: 12 },
      { key: "prop_bollard", x: 11300, y: kerbY, rx: 14, ry: 10, depth: 20 },
    ];

    separateObstacles(raw);

    for (const p of raw) {
      p.x = Phaser.Math.Clamp(p.x, LANE.minX, LANE.maxX);
      if (p.key === "car" || p.key === "coffee_van") {
        p.y = Phaser.Math.Clamp(p.y, ROAD.top + 20, GAME_HEIGHT - 6);
      } else if (p.key === "prop_bollard") {
        p.y = kerbY;
      } else {
        p.y = Phaser.Math.Clamp(p.y, LANE.minY, Math.min(LANE.maxY, ROAD.top - 8));
      }
      this.destructibles.push(new DestructibleProp(s, p));
    }

    const stalls: FoodStallSpawn[] = [
      { kind: "chips", x: 1550, y: LANE.minY + 12 },
      { kind: "icecream", x: 3400, y: LANE.minY + 8 },
      { kind: "doughnut", x: 5100, y: LANE.minY + 14 },
      { kind: "eels", x: 6900, y: LANE.minY + 10 },
      { kind: "chips", x: 8800, y: LANE.minY + 12 },
      { kind: "doughnut", x: 10800, y: LANE.minY + 10 },
    ];
    for (const st of stalls) this.foodStalls.push(new FoodStall(s, st));

    // Unique weapon lockers — shop-only kit (chain / cue / knuckles)
    this.weaponShops.push(
      new WeaponShop(s, 5450, LANE.minY + 12, {
        label: "Arcade Locker",
        stock: UNIQUE_WEAPON_STOCK,
      }),
      new WeaponShop(s, 11850, LANE.minY + 10, {
        label: "Fair Fence",
        stock: [...UNIQUE_WEAPON_STOCK].reverse(),
      }),
    );
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

    this.spawnSeaCraft(true);
    // First flyover after you've had a beat to look up
    this.nextSpitfireAt = 12000 + Math.random() * 8000;
  }

  private spawnSeaCraft(fromSide = false): void {
    if (this.seaCraft.length >= 3) return;
    const roll = Math.random();
    // Kayaks are the only animated craft — keep them common so the paddle reads
    const kind: SeaCraft["kind"] =
      roll < 0.55 ? "kayak" : roll < 0.78 ? "jet" : "boat";
    const key =
      kind === "kayak" ? "sea_kayak_0" : kind === "jet" ? "sea_jetski" : "sea_boat";
    if (!this.scene.textures.exists(key)) return;
    if (kind === "kayak" && !this.scene.textures.exists("sea_kayak_1")) return;

    const goingRight = Math.random() < 0.5;
    const midSeaY = GAME_HEIGHT * (0.34 + Math.random() * 0.06);
    const startX = fromSide
      ? goingRight
        ? -40
        : GAME_WIDTH + 40
      : goingRight
        ? Math.random() * GAME_WIDTH * 0.4
        : GAME_WIDTH * (0.55 + Math.random() * 0.35);
    const speed =
      (kind === "jet" ? 55 : kind === "kayak" ? 22 : 32) * (goingRight ? 1 : -1);
    const scale = kind === "jet" ? 0.55 : kind === "kayak" ? 0.78 : 0.62;
    const image = this.scene.add
      .image(startX, midSeaY, key)
      .setScrollFactor(0)
      .setDepth(-23)
      .setScale(scale)
      .setFlipX(!goingRight)
      .setAlpha(0.9);
    this.seaCraft.push({
      image,
      x: startX,
      y: midSeaY,
      vx: speed,
      bobPhase: Math.random() * Math.PI * 2,
      bobAmp: kind === "jet" ? 2.5 : kind === "kayak" ? 2.2 : 1.8,
      kind,
      frames: kind === "kayak" ? ["sea_kayak_0", "sea_kayak_1"] : undefined,
      animPhase: Math.random() * Math.PI * 2,
      animSpeed: kind === "kayak" ? 3.4 : 0,
    });
  }

  update(cameraScrollX: number, delta: number, now = 0): void {
    this.waveT += delta;
    for (const layer of this.layers) {
      layer.sprite.tilePositionX = cameraScrollX * layer.factor;
    }
    const dt = delta / 1000;
    if (this.hoverDeparting && this.hoverCraft && !this.hoverGone) {
      const c = this.hoverCraft;
      // Lift off the pad and push out toward the Isle of Wight (up + slightly west)
      c.screenY -= 36 * dt;
      c.worldX -= 18 * dt;
      this.hoverDepartScale = Math.max(0.12, this.hoverDepartScale - 0.2 * dt);
      const base = c.baseScale ?? 1.65;
      c.image.setScale(base * this.hoverDepartScale);
      c.image.setAlpha(Math.max(0, c.image.alpha - 0.1 * dt));
      // Drop behind the sea wash as it clears the foreshore
      if (c.screenY < GAME_HEIGHT * 0.42) c.image.setDepth(-32);
      if (c.screenY < GAME_HEIGHT * 0.34) c.image.setDepth(-37);
      if (
        c.screenY < GAME_HEIGHT * 0.3 ||
        c.image.alpha < 0.08 ||
        this.hoverDepartScale < 0.18
      ) {
        c.image.setVisible(false);
        this.hoverDeparting = false;
        this.hoverGone = true;
      }
    }
    for (const item of this.images) {
      // Parallax: slower factors lag behind the camera so distant folk don't
      // skate with the promenade. Factor 1 tracks the fight lane exactly.
      item.image.x = item.worldX - cameraScrollX * item.factor;
      item.image.y = item.screenY;
      if (item.frames && item.frames.length > 0 && item.image.visible) {
        item.animPhase = (item.animPhase ?? 0) + dt * (item.animSpeed ?? 1.6);
        const frame = item.frames[Math.floor(item.animPhase) % item.frames.length]!;
        if (item.image.texture.key !== frame && this.scene.textures.exists(frame)) {
          item.image.setTexture(frame);
        }
      }
    }
    const sea = this.layers.find((l) => l.sprite.texture.key === "sea");
    if (sea) {
      sea.sprite.tilePositionY = Math.sin(this.waveT * 0.0018) * 2.5;
      // Gentle cross-swell so the chop doesn't look glued to the parallax scroll
      sea.sprite.tilePositionX += Math.sin(this.waveT * 0.0007) * 0.15;
    }
    for (const p of this.destructibles) p.update(now);

    if (now >= this.nextCraftAt) {
      this.spawnSeaCraft();
      this.nextCraftAt = now + 10000 + Math.random() * 16000;
    }
    const still: SeaCraft[] = [];
    for (const c of this.seaCraft) {
      c.x += c.vx * dt;
      c.bobPhase += dt * 3.2;
      c.image.x = c.x;
      c.image.y = c.y + Math.sin(c.bobPhase) * c.bobAmp;
      if (c.frames && c.animSpeed > 0) {
        c.animPhase += dt * c.animSpeed;
        const frame = c.frames[Math.floor(c.animPhase) % 2]!;
        if (c.image.texture.key !== frame && this.scene.textures.exists(frame)) {
          const flipX = c.image.flipX;
          c.image.setTexture(frame);
          c.image.setFlipX(flipX);
        }
      }
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

    if (!this.spitfire && now >= this.nextSpitfireAt) {
      this.spawnSpitfire();
    }
    if (this.spitfire) {
      const p = this.spitfire;
      p.x += p.vx * dt;
      p.bobPhase += dt * 1.4;
      p.image.x = p.x;
      p.image.y = p.y + Math.sin(p.bobPhase) * 2.5;
      const off =
        (p.vx > 0 && p.x > GAME_WIDTH + 60) || (p.vx < 0 && p.x < -60);
      if (off) {
        p.image.destroy();
        this.spitfire = null;
        this.nextSpitfireAt = now + 28000 + Math.random() * 35000;
      }
    }
  }

  /** Rare Solent flyover — small doodle Spitfire across the sky. */
  private spawnSpitfire(): void {
    if (this.spitfire || !this.scene.textures.exists("sky_spitfire")) return;
    const goingRight = Math.random() < 0.55;
    const y = 28 + Math.random() * 42;
    const startX = goingRight ? -50 : GAME_WIDTH + 50;
    const speed = (38 + Math.random() * 18) * (goingRight ? 1 : -1);
    const image = this.scene.add
      .image(startX, y, "sky_spitfire")
      .setScrollFactor(0)
      .setDepth(-36)
      .setScale(0.85 + Math.random() * 0.25)
      .setFlipX(!goingRight)
      .setAlpha(0.88);
    this.spitfire = {
      image,
      x: startX,
      y,
      vx: speed,
      bobPhase: Math.random() * Math.PI * 2,
    };
  }
}
