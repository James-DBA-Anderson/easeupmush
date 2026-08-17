import Phaser from "phaser";
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  LANE,
  PASSING_TRAFFIC_DEPTH,
  ROAD,
  WORLD_WIDTH,
  viewportWidth,
} from "../constants";
import { separateObstacles, type Obstacle } from "./obstacles";
import { DestructibleProp, type DestructibleSpawn } from "./DestructibleProp";
import { FoodStall, type FoodStallSpawn } from "./FoodStall";
import { WeaponShop, UNIQUE_WEAPON_STOCK } from "./WeaponShop";

interface ParallaxLayer {
  sprite: Phaser.GameObjects.TileSprite;
  factor: number;
  /** Soft wind drift — px/sec into tilePositionX (farther = slower). */
  drift?: number;
  driftX?: number;
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
  frames?: string[];
  animPhase: number;
  animSpeed: number;
  /** Seconds until a kayak may start sinking. Infinity = never. */
  sinkWait: number;
  /** < 0 not sinking; 0–1 tip then slide under. */
  sinkT: number;
}

/** Ambient motors rolling the front — visual only, in front of parked cars. */
interface PassingCar {
  image: Phaser.GameObjects.Image;
  worldX: number;
  y: number;
  vx: number;
  /** Doppler base — bikes/scooters higher, vans/buses lower. */
  pitch: number;
  frames?: string[];
  animPhase?: number;
  animSpeed?: number;
}

type TrafficSpec = {
  key: string;
  weight: number;
  speedMin: number;
  speedMax: number;
  /** On-screen height vs a parked saloon at the same depth (1 = same). */
  size: number;
  pitch: number;
  /** Skip body tint — painted vehicles (taxi yellow, etc.). */
  noTint?: boolean;
  /** Optional wheel / rider animation keys. */
  frames?: string[];
  animSpeed?: number;
};

/**
 * Parked climbable saloons: native 240×110 at ~1.28, feet at GAME_HEIGHT - 8.
 * Passing traffic sits closer to camera, so it must never read smaller.
 */
const PARKED_SALOON_NATIVE_H = 110;
const PARKED_SALOON_SCALE = 1.28;
const PARKED_SALOON_Y = GAME_HEIGHT - 8;
/** Driving lane is in front of the parkers — extra size even at a similar foot Y. */
const PASSING_LANE_BOOST = 1.14;

/** Weighted seafront traffic — saloons common, bus rare. */
const PASSING_TRAFFIC: TrafficSpec[] = [
  {
    key: "traffic_hatch",
    weight: 36,
    speedMin: 220,
    speedMax: 340,
    size: 0.9,
    pitch: 1.06,
  },
  {
    key: "traffic_van",
    weight: 12,
    speedMin: 150,
    speedMax: 230,
    size: 1.1,
    pitch: 0.82,
  },
  {
    key: "traffic_bike",
    weight: 10,
    speedMin: 280,
    speedMax: 430,
    size: 0.68,
    pitch: 1.55,
    noTint: true,
  },
  {
    key: "traffic_bus",
    weight: 6,
    speedMin: 100,
    speedMax: 155,
    size: 1.36,
    pitch: 0.68,
    noTint: true,
  },
  {
    key: "traffic_rubbish",
    weight: 5,
    speedMin: 95,
    speedMax: 145,
    size: 1.3,
    pitch: 0.62,
    noTint: true,
  },
];

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
  private readonly passingCars: PassingCar[] = [];
  private spitfire: SkySpitfire | null = null;
  /** World-space fan ducts — throws near here get messy. */
  private readonly hoverFans: { x: number; y: number; rx: number; ry: number }[] = [];
  private readonly hoverHull: Obstacle[] = [];
  private hoverCraft: ParallaxImage | null = null;
  private hoverDeparting = false;
  private hoverGone = false;
  private hoverDepartScale = 1;
  private hoverRevving = false;
  private waveT = 0;
  private nextCraftAt = 2500;
  private nextSpitfireAt = 8000;
  private nextPassingCarAt = 6000;
  /** Don't sink a kayak in the opening beat — keep it a rare gag. */
  private nextKayakSinkAt = 22000;
  private seaLayer: ParallaxLayer | null = null;
  private seaAnimPhase = 0;
  private nextWaveBreakAt = 5000;
  private pendingWaveBreak = false;
  /** Last camera scroll — spitfire must track sky parallax while flying. */
  private lastCamScrollX = 0;
  private hasCamScroll = false;
  /** Expanded playfield width (Scale.EXPAND on wide phones). */
  private viewW = GAME_WIDTH;
  private kerb?: Phaser.GameObjects.Rectangle;

  constructor(private readonly scene: Phaser.Scene) {
    this.viewW = viewportWidth(scene);
    this.build();
  }

  private syncViewportWidth(): void {
    const w = viewportWidth(this.scene);
    if (w === this.viewW) return;
    this.viewW = w;
    for (const layer of this.layers) {
      layer.sprite.setSize(w, layer.sprite.height);
    }
    this.kerb?.setPosition(w / 2, ROAD.top + 2).setSize(w, 4);
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
  isNearHoverFans(x: number, y: number, reach = 210): boolean {
    if (this.hoverDeparting || this.hoverGone) return false;
    for (const f of this.hoverFans) {
      if (Math.hypot(x - f.x, y - f.y) < reach + Math.max(f.rx, f.ry)) return true;
    }
    return false;
  }

  /** Fans go mental while someone is in the blades — craft stays put. */
  revHovercraftFans(): void {
    if (this.hoverDeparting || this.hoverGone || !this.hoverCraft) return;
    this.hoverRevving = true;
    this.hoverCraft.animSpeed = 22;
  }

  /** After a chop — spin up and slide down the slipway toward the Isle of Wight. */
  departHovercraftToIsle(): boolean {
    if (this.hoverDeparting || this.hoverGone || !this.hoverCraft) return false;
    this.hoverRevving = false;
    this.hoverDeparting = true;
    this.hoverDepartScale = 1;
    this.hoverFans.length = 0;
    this.hoverHull.length = 0;
    this.hoverCraft.animSpeed = 22;
    this.hoverCraft.image.setDepth(-24);
    return true;
  }

  get hovercraftDeparted(): boolean {
    return this.hoverGone;
  }

  /** Fan rumble — audible when the craft is on-screen / departing. */
  getHovercraftAudio(camScrollX: number): {
    active: boolean;
    intensity: number;
    pan: number;
    spin: number;
  } {
    if (this.hoverGone || !this.hoverCraft) {
      return { active: false, intensity: 0, pan: 0, spin: 1 };
    }
    const c = this.hoverCraft;
    const screenX = c.worldX - camScrollX * c.factor;
    const pan = Phaser.Math.Clamp((screenX / this.viewW) * 2 - 1, -1, 1);
    const dist = Math.abs(screenX - this.viewW * 0.5);
    const near = 1 - Phaser.Math.Clamp(dist / (this.viewW * 0.85), 0, 1);
    if (this.hoverRevving) {
      return {
        active: true,
        intensity: 0.7 + near * 0.3,
        pan,
        spin: 1.85,
      };
    }
    if (this.hoverDeparting) {
      const spin = 1.15 + (1 - this.hoverDepartScale) * 0.9;
      return {
        active: true,
        intensity: 0.55 + near * 0.45,
        pan,
        spin,
      };
    }
    if (near < 0.08) {
      return { active: false, intensity: 0, pan: 0, spin: 1 };
    }
    return {
      active: true,
      intensity: 0.18 + near * 0.55,
      pan,
      spin: 1,
    };
  }

  /** Distant Merlin — progress 0..1 across the sky for Doppler. */
  getSpitfireAudio(): {
    active: boolean;
    progress: number;
    pan: number;
  } {
    if (!this.spitfire) {
      return { active: false, progress: 0.5, pan: 0 };
    }
    const p = this.spitfire;
    const pan = Phaser.Math.Clamp((p.x / this.viewW) * 2 - 1, -1, 1);
    const progress =
      p.vx >= 0
        ? Phaser.Math.Clamp(p.x / this.viewW, 0, 1)
        : Phaser.Math.Clamp(1 - p.x / this.viewW, 0, 1);
    return { active: true, progress, pan };
  }

  /** Passing motor on the road — intensity / pan / pitch for a drive-by Doppler. */
  getPassingCarAudio(camScrollX: number): {
    active: boolean;
    intensity: number;
    pan: number;
    pitch: number;
  } {
    const car = this.passingCars[0];
    if (!car) {
      return { active: false, intensity: 0, pan: 0, pitch: 1 };
    }
    const screenX = car.worldX - camScrollX;
    const pan = Phaser.Math.Clamp((screenX / this.viewW) * 2 - 1, -1, 1);
    const across = Phaser.Math.Clamp(screenX / this.viewW, -0.15, 1.15);
    const progress = Phaser.Math.Clamp(across, 0, 1);
    const travel = car.vx >= 0 ? progress : 1 - progress;
    // Higher pitch on approach, drops as it rolls away — scaled by vehicle type
    const pitch = (1.2 - travel * 0.45) * car.pitch;
    const near =
      1 -
      Phaser.Math.Clamp(
        Math.abs(screenX - this.viewW * 0.5) / (this.viewW * 0.72),
        0,
        1,
      );
    const edge = Math.sin(Math.max(0.02, Math.min(0.98, progress)) * Math.PI);
    const intensity = near * 0.5 + edge * 0.55;
    return { active: true, intensity, pan, pitch };
  }

  /** Live road passers — for draw-order vs promenade fighters. */
  getPassingCarImages(): Phaser.GameObjects.Image[] {
    return this.passingCars.map((c) => c.image);
  }

  /** Soft shore break ready to play (once). */
  takeWaveBreak(): boolean {
    if (!this.pendingWaveBreak) return false;
    this.pendingWaveBreak = false;
    return true;
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

  /**
   * Target on-screen height for a beach person at this foot Y.
   * Foreshore (near the sea) is small; nearer the fight lane is larger —
   * still under in-lane fighters so scenery never dominates the scrap.
   */
  private beachPersonWantPx(screenY: number): number {
    const farY = GAME_HEIGHT * 0.32 + 70;
    const nearY = LANE.minY + 8;
    const t = Phaser.Math.Clamp(
      (screenY - farY) / Math.max(1, nearY - farY),
      0,
      1,
    );
    return 17 + t * 17; // ~17px far → ~34px near
  }

  /** Phaser scale so a doodle figure of `figurePx` tall reads at the right depth. */
  private beachPersonScale(screenY: number, figurePx: number): number {
    return this.beachPersonWantPx(screenY) / Math.max(8, figurePx);
  }

  private build(): void {
    const s = this.scene;
    const viewW = this.viewW;
    const seaY = GAME_HEIGHT * 0.32;
    const commonY = GAME_HEIGHT * 0.44;
    const beachY = GAME_HEIGHT * 0.5;

    const sky = s.add
      .tileSprite(0, 0, viewW, GAME_HEIGHT, "sky")
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(-50);
    this.layers.push({ sprite: sky, factor: 0.02 });

    // Cloud banks — farther = weaker camera parallax + slower wind drift
    const cloudFar = s.add
      .tileSprite(0, 0, viewW, 150, "clouds_far")
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(-43)
      .setAlpha(0.38);
    this.layers.push({ sprite: cloudFar, factor: 0.025, drift: 1.6, driftX: 0 });

    const cloudMid = s.add
      .tileSprite(0, 8, viewW, 160, "clouds_mid")
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(-40)
      .setAlpha(0.5);
    this.layers.push({ sprite: cloudMid, factor: 0.055, drift: 3.2, driftX: 40 });

    const cloudNear = s.add
      .tileSprite(0, 18, viewW, 150, "clouds_near")
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(-37)
      .setAlpha(0.58);
    this.layers.push({ sprite: cloudNear, factor: 0.1, drift: 5.5, driftX: 90 });

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
      .tileSprite(0, seaY, viewW, 128, "sea_0")
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(-28);
    this.seaLayer = { sprite: sea, factor: 0.38, drift: 2.4, driftX: 0 };
    this.layers.push(this.seaLayer);

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

    // Foreshore fishermen + beach BBQ — same parallax as the sea so they don't skate
    // on the waterline. worldX = screenX + cameraAnchor * factor.
    const SEA_PX = 0.38;
    const fishermanY = seaY + 78;
    const fishWorld = (cameraAnchor: number, screenX: number) =>
      screenX + cameraAnchor * SEA_PX;
    // Fisherman sheet person ≈ 42px tall — must shrink hard on the foreshore
    // or he reads bigger than the BBQ party further up the beach.
    const fishScale = this.beachPersonScale(fishermanY, 42);
    this.addLandmark(
      "distant_fisherman_0",
      fishWorld(2600, 380),
      fishermanY,
      SEA_PX,
      {
        scale: fishScale,
        alpha: 0.72,
        depth: -11,
        frames: ["distant_fisherman_0", "distant_fisherman_1"],
        animSpeed: 1.1,
      },
    );
    this.addLandmark("beach_bbq_0", 2100, GAME_HEIGHT * 0.505, 0.62, {
      scale: this.beachPersonScale(GAME_HEIGHT * 0.505, 34),
      alpha: 0.9,
      depth: -10,
      frames: ["beach_bbq_0", "beach_bbq_1", "beach_bbq_2", "beach_bbq_3"],
      animSpeed: 1.55,
    });
    this.addLandmark("beach_bbq_0", 5200, GAME_HEIGHT * 0.5, 0.6, {
      scale: this.beachPersonScale(GAME_HEIGHT * 0.5, 34),
      alpha: 0.88,
      depth: -10,
      frames: ["beach_bbq_0", "beach_bbq_1", "beach_bbq_2", "beach_bbq_3"],
      animSpeed: 1.35,
    });
    this.addLandmark(
      "distant_fisherman_0",
      fishWorld(6800, 520),
      fishermanY,
      SEA_PX,
      {
        scale: fishScale * 0.96,
        alpha: 0.7,
        depth: -11,
        frames: ["distant_fisherman_0", "distant_fisherman_1"],
        animSpeed: 1.3,
      },
    );

    // Past South Parade — beach continues on the fight-lane parallax (factor 1)
    // so these actually sit where you walk (slower factors never reach the screen).
    this.addLandmark("beach_bbq_0", 8100, LANE.minY + 6, 1, {
      scale: this.beachPersonScale(LANE.minY + 6, 34),
      alpha: 0.92,
      depth: -9,
      frames: ["beach_bbq_0", "beach_bbq_1", "beach_bbq_2", "beach_bbq_3"],
      animSpeed: 1.45,
    });
    // Still sea-parallax so he stays glued to the waterline past the pier.
    this.addLandmark(
      "distant_fisherman_0",
      fishWorld(8400, 440),
      fishermanY,
      SEA_PX,
      {
        scale: fishScale * 1.05,
        alpha: 0.85,
        depth: -9,
        frames: ["distant_fisherman_0", "distant_fisherman_1"],
        animSpeed: 1.25,
      },
    );

    // Sea defences stretch — planted on the promenade, Round Tower between walls
    this.addLandmark("landmark_sea_defences", 8800, LANE.minY + 14, 1, {
      scale: 1.35,
      depth: -8,
    });
    // Sit on the sea lip so bombs off the parapet read as Solent plunges
    this.addLandmark("landmark_round_tower", 9200, LANE.minY + 4, 1, {
      scale: 1.55,
      depth: -8,
    });
    const rimKids = this.addLandmark("tower_kids_0", 9200, LANE.minY + 4, 1, {
      scale: 1.55,
      depth: -7,
      frames: [
        "tower_kids_0",
        "tower_kids_1",
        "tower_kids_2",
        "tower_kids_3",
        "tower_kids_4",
        "tower_kids_5",
        "tower_kids_6",
        "tower_kids_7",
      ],
      animSpeed: 1.85,
    });
    // Jumper + splash sit behind the drum so they vanish into the Solent
    const dive = this.addLandmark("tower_dive_0", 9200, LANE.minY + 4, 1, {
      scale: 1.55,
      depth: -9,
      frames: [
        "tower_dive_0",
        "tower_dive_1",
        "tower_dive_2",
        "tower_dive_3",
        "tower_dive_4",
        "tower_dive_5",
        "tower_dive_6",
        "tower_dive_7",
      ],
      animSpeed: 1.85,
    });
    dive.animPhase = rimKids.animPhase;
    this.addLandmark("landmark_sea_defences", 9600, LANE.minY + 14, 1, {
      scale: 1.4,
      depth: -8,
    });
    this.addLandmark("landmark_sea_defences", 10400, LANE.minY + 14, 1, {
      scale: 1.35,
      depth: -8,
    });

    // Hovertravel — slip + hut in front; craft (inc. cushion) behind the apron fence
    const hoverX = 11200;
    const hoverY = LANE.minY + 10;
    const hoverScale = 1.05;
    this.hoverCraft = this.addLandmark("hovercraft_0", hoverX, hoverY, 1, {
      scale: hoverScale,
      depth: -9,
      frames: ["hovercraft_0", "hovercraft_1"],
      animSpeed: 8.5,
    });
    this.addLandmark("landmark_hovercraft_port", hoverX, LANE.minY + 8, 1, {
      scale: 1.2,
      depth: -7,
    });
    // Stern intakes facing the scrap — fight-lane hazards (not the sprite fan centres
    // high on the craft, which sit ~180px above the promenade and never catch a toss).
    const intakeY = Math.max(LANE.minY + 10, hoverY - 28);
    this.hoverFans.push(
      { x: hoverX - 42 * hoverScale, y: intakeY, rx: 46, ry: 48 },
      { x: hoverX + 42 * hoverScale, y: intakeY, rx: 46, ry: 48 },
    );
    this.hoverHull.push({
      x: hoverX,
      y: hoverY - 52,
      rx: 62,
      ry: 64,
      kind: "prop",
    });

    // Stretch past Hovertravel before the funfair
    this.addLandmark("beach_bbq_0", 12450, LANE.minY + 6, 1, {
      scale: this.beachPersonScale(LANE.minY + 6, 34),
      alpha: 0.9,
      depth: -9,
      frames: ["beach_bbq_0", "beach_bbq_1", "beach_bbq_2", "beach_bbq_3"],
      animSpeed: 1.25,
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
      .tileSprite(0, commonY, viewW, 70, "common")
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(-15);
    this.layers.push({ sprite: shingle, factor: 0.72 });

    const beach = s.add
      .tileSprite(0, beachY, viewW, 300, "beach")
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
      { key: "car", x: 720, y: GAME_HEIGHT - 8, rx: 70, ry: 22, scale: 1.28, depth: 22 },
      { key: "car", x: 2200, y: GAME_HEIGHT - 10, rx: 70, ry: 22, scale: 1.26, depth: 22 },
      { key: "car", x: 4100, y: GAME_HEIGHT - 8, rx: 70, ry: 22, scale: 1.3, depth: 22 },
      { key: "car", x: 5800, y: GAME_HEIGHT - 9, rx: 70, ry: 22, scale: 1.27, depth: 22 },
      { key: "car", x: 7200, y: GAME_HEIGHT - 8, rx: 70, ry: 22, scale: 1.28, depth: 22 },
      { key: "car", x: 8600, y: GAME_HEIGHT - 9, rx: 70, ry: 22, scale: 1.26, depth: 22 },
      { key: "car", x: 10200, y: GAME_HEIGHT - 8, rx: 70, ry: 22, scale: 1.29, depth: 22 },
      { key: "car", x: 11200, y: GAME_HEIGHT - 10, rx: 70, ry: 22, scale: 1.27, depth: 22 },
      // Steel coffee van on the road (Eastney end) — solid footprint, not climbable
      { key: "coffee_van", x: 300, y: GAME_HEIGHT - 8, rx: 98, ry: 36, scale: 1.32, depth: 22 },
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
      .tileSprite(0, ROAD.top, viewW, ROAD.height, "road")
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(16);
    this.layers.push({ sprite: road, factor: 1.12 });

    this.kerb = s.add
      .rectangle(viewW / 2, ROAD.top + 2, viewW, 4, 0xc8b898, 0.9)
      .setScrollFactor(0)
      .setDepth(17);

    s.add
      .rectangle(WORLD_WIDTH / 2, GAME_HEIGHT / 2, WORLD_WIDTH, GAME_HEIGHT, 0x000000, 0)
      .setDepth(-100);

    this.spawnSeaCraft(true);
    // First flyover after you've had a beat to look up
    this.nextSpitfireAt = 12000 + Math.random() * 8000;
    this.nextPassingCarAt = 8000 + Math.random() * 10000;
  }

  /**
   * Phaser scale so a passer matches parked-saloon size, then grows toward
   * the camera. `size` is height vs that saloon (hatch < 1, bus > 1).
   */
  private passingTrafficScale(key: string, y: number, size: number): number {
    const frame = this.scene.textures.get(key).get();
    const nativeH = Math.max(8, frame.height);
    const parkedH = PARKED_SALOON_NATIVE_H * PARKED_SALOON_SCALE;
    const span = Math.max(1, ROAD.height);
    const t = Phaser.Math.Clamp((y - ROAD.top) / span, 0, 1);
    const tParked = Phaser.Math.Clamp((PARKED_SALOON_Y - ROAD.top) / span, 0, 1);
    const persp = 1 + (t - tParked) * 0.55;
    const jitter = 0.98 + Math.random() * 0.04;
    return (parkedH * persp * PASSING_LANE_BOOST * size * jitter) / nativeH;
  }

  private spawnPassingCar(cameraScrollX: number): void {
    if (this.passingCars.length >= 1) return;

    const pool = PASSING_TRAFFIC.filter((t) =>
      this.scene.textures.exists(t.key),
    );
    if (pool.length === 0) return;

    let total = 0;
    for (const t of pool) total += t.weight;
    let roll = Math.random() * total;
    let spec = pool[0]!;
    for (const t of pool) {
      roll -= t.weight;
      if (roll <= 0) {
        spec = t;
        break;
      }
    }

    const goingRight = Math.random() < 0.55;
    const speed =
      spec.speedMin + Math.random() * (spec.speedMax - spec.speedMin);
    // Big motors need more off-screen lead-in so they don't pop in half-visible
    const lead =
      spec.key === "traffic_bus" || spec.key === "traffic_rubbish" ? 420 : 280;
    const worldX = goingRight
      ? cameraScrollX - lead
      : cameraScrollX + this.viewW + lead;
    // Tyres sit on the tarmac — art plants wheels at the canvas foot
    const y = GAME_HEIGHT - 1;
    const scale = this.passingTrafficScale(spec.key, y, spec.size);
    const image = this.scene.add
      .image(worldX, y, spec.key)
      .setOrigin(0.5, 1)
      .setScale(scale)
      .setDepth(PASSING_TRAFFIC_DEPTH)
      .setFlipX(goingRight);

    if (!spec.noTint) {
      const paints = [
        0xffffff,
        0xd8e4f0,
        0xf0e0c8,
        0xc8d8c0,
        0xe8d0d0,
        0xc0c8d8,
        0xe8e0a8,
        0xb0c0d8,
      ];
      image.setTint(paints[Math.floor(Math.random() * paints.length)]!);
    }

    this.passingCars.push({
      image,
      worldX,
      y,
      vx: goingRight ? speed : -speed,
      pitch: spec.pitch,
      frames: spec.frames,
      animPhase: Math.random() * 2,
      animSpeed: spec.animSpeed,
    });
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
    if (
      kind === "kayak" &&
      (!this.scene.textures.exists("sea_kayak_1") ||
        !this.scene.textures.exists("sea_kayak_2") ||
        !this.scene.textures.exists("sea_kayak_3"))
    ) {
      return;
    }

    const goingRight = Math.random() < 0.5;
    const midSeaY = GAME_HEIGHT * (0.34 + Math.random() * 0.06);
    const startX = fromSide
      ? goingRight
        ? -40
        : this.viewW + 40
      : goingRight
        ? Math.random() * this.viewW * 0.4
        : this.viewW * (0.55 + Math.random() * 0.35);
    const speed =
      (kind === "jet" ? 55 : kind === "kayak" ? 22 : 32) * (goingRight ? 1 : -1);
    const scale = kind === "jet" ? 0.55 : kind === "kayak" ? 0.78 : 0.62;
    const now = this.scene.time.now;
    const maySink =
      kind === "kayak" &&
      now >= this.nextKayakSinkAt &&
      Math.random() < 0.09;
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
      frames:
        kind === "kayak"
          ? ["sea_kayak_0", "sea_kayak_1", "sea_kayak_2", "sea_kayak_3"]
          : undefined,
      animPhase: Math.random() * Math.PI * 2,
      animSpeed: kind === "kayak" ? 5.2 : 0,
      sinkWait: maySink ? 4 + Math.random() * 7 : Number.POSITIVE_INFINITY,
      sinkT: -1,
    });
  }

  update(cameraScrollX: number, delta: number, now = 0): void {
    this.syncViewportWidth();
    this.waveT += delta;
    const camDelta = this.hasCamScroll ? cameraScrollX - this.lastCamScrollX : 0;
    this.lastCamScrollX = cameraScrollX;
    this.hasCamScroll = true;
    const dt = delta / 1000;
    for (const layer of this.layers) {
      if (layer.drift) {
        layer.driftX = (layer.driftX ?? 0) + layer.drift * dt;
      }
      layer.sprite.tilePositionX =
        cameraScrollX * layer.factor + (layer.driftX ?? 0);
    }
    if (this.hoverDeparting && this.hoverCraft && !this.hoverGone) {
      const c = this.hoverCraft;
      // Cushion on the Solent with the kayaks — not up in the sky toward IoW
      const seaSurface = GAME_HEIGHT * 0.36;
      if (c.screenY > seaSurface + 4) {
        c.screenY -= 48 * dt;
        c.worldX -= 8 * dt;
        this.hoverDepartScale = Math.max(0.4, this.hoverDepartScale - 0.1 * dt);
      } else {
        c.screenY = seaSurface + Math.sin(now * 0.004) * 2;
        c.worldX -= 36 * dt;
        this.hoverDepartScale = Math.max(0.08, this.hoverDepartScale - 0.3 * dt);
        c.image.setAlpha(Math.max(0, c.image.alpha - 0.32 * dt));
        c.image.setDepth(-24);
      }
      const base = c.baseScale ?? 1.05;
      c.image.setScale(base * this.hoverDepartScale);
      if (c.image.alpha < 0.08 || this.hoverDepartScale < 0.12) {
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
    const sea = this.seaLayer;
    if (sea) {
      // Gentle swell bob + cross-chop on top of parallax / drift
      sea.sprite.tilePositionY =
        Math.sin(this.waveT * 0.0018) * 2.8 + Math.sin(this.waveT * 0.0034) * 1.1;
      sea.sprite.tilePositionX +=
        Math.sin(this.waveT * 0.0007) * 0.18 + Math.sin(this.waveT * 0.0013) * 0.08;

      // Slow frame cycle through swell / foam phases
      this.seaAnimPhase += dt * 0.48;
      const frames = ["sea_0", "sea_1", "sea_2", "sea_1"];
      const fi = Math.floor(this.seaAnimPhase) % frames.length;
      const frame = frames[fi]!;
      if (
        sea.sprite.texture.key !== frame &&
        this.scene.textures.exists(frame)
      ) {
        sea.sprite.setTexture(frame);
      }
      // Peak foam frame → occasional soft break SFX
      if (
        now >= this.nextWaveBreakAt &&
        fi === 2 &&
        Math.floor(this.seaAnimPhase - dt * 0.48) % frames.length !== 2
      ) {
        this.pendingWaveBreak = true;
        this.nextWaveBreakAt = now + 3500 + Math.random() * 6500;
      }
    }
    for (const p of this.destructibles) p.update(now);

    if (now >= this.nextCraftAt) {
      this.spawnSeaCraft();
      this.nextCraftAt = now + 10000 + Math.random() * 16000;
    }
    const still: SeaCraft[] = [];
    for (const c of this.seaCraft) {
      if (this.updateSeaCraftSink(c, dt, now)) {
        c.image.destroy();
        continue;
      }
      if (c.sinkT < 0) {
        c.x += c.vx * dt;
        c.bobPhase += dt * 3.2;
        c.image.x = c.x;
        c.image.y = c.y + Math.sin(c.bobPhase) * c.bobAmp;
        if (c.frames && c.animSpeed > 0) {
          c.animPhase += dt * c.animSpeed;
          const frame = c.frames[Math.floor(c.animPhase) % c.frames.length]!;
          if (c.image.texture.key !== frame && this.scene.textures.exists(frame)) {
            const flipX = c.image.flipX;
            c.image.setTexture(frame);
            c.image.setFlipX(flipX);
          }
        }
      }
      const off =
        c.sinkT < 0 &&
        ((c.vx > 0 && c.x > this.viewW + 80) || (c.vx < 0 && c.x < -80));
      if (off) {
        c.image.destroy();
      } else {
        still.push(c);
      }
    }
    this.seaCraft.length = 0;
    this.seaCraft.push(...still);

    if (now >= this.nextPassingCarAt) {
      this.spawnPassingCar(cameraScrollX);
      this.nextPassingCarAt = now + 14000 + Math.random() * 22000;
    }
    const stillCars: PassingCar[] = [];
    for (const car of this.passingCars) {
      car.worldX += car.vx * dt;
      car.image.x = car.worldX;
      car.image.y = car.y;
      if (car.frames && car.animSpeed && car.animSpeed > 0) {
        car.animPhase = (car.animPhase ?? 0) + dt * car.animSpeed;
        const frame = car.frames[Math.floor(car.animPhase) % car.frames.length]!;
        if (car.image.texture.key !== frame && this.scene.textures.exists(frame)) {
          const flipX = car.image.flipX;
          car.image.setTexture(frame);
          car.image.setFlipX(flipX);
        }
      }
      const margin = 420;
      const off =
        car.worldX < cameraScrollX - margin ||
        car.worldX > cameraScrollX + this.viewW + margin;
      if (off) {
        car.image.destroy();
      } else {
        stillCars.push(car);
      }
    }
    this.passingCars.length = 0;
    this.passingCars.push(...stillCars);

    if (!this.spitfire && now >= this.nextSpitfireAt) {
      this.spawnSpitfire();
    }
    if (this.spitfire) {
      const p = this.spitfire;
      // Own flight + sky-layer parallax so walking doesn't freeze it against the clouds
      p.x += p.vx * dt - camDelta * 0.02;
      p.bobPhase += dt * 1.4;
      p.image.x = p.x;
      p.image.y = p.y + Math.sin(p.bobPhase) * 2.5;
      const off =
        (p.vx > 0 && p.x > this.viewW + 60) || (p.vx < 0 && p.x < -60);
      if (off) {
        p.image.destroy();
        this.spitfire = null;
        this.nextSpitfireAt = now + 28000 + Math.random() * 35000;
      }
    }
  }

  /**
   * Rare gag — kayak tips until one end sticks straight up, then slides under.
   * Returns true when the craft should be destroyed.
   */
  private updateSeaCraftSink(c: SeaCraft, dt: number, now: number): boolean {
    if (c.kind !== "kayak") return false;
    if (c.sinkT < 0) {
      if (!Number.isFinite(c.sinkWait)) return false;
      c.sinkWait -= dt;
      const onScreen = c.x > 80 && c.x < this.viewW - 80;
      if (c.sinkWait > 0 || !onScreen) return false;
      c.sinkT = 0;
      c.animSpeed = 0;
      this.nextKayakSinkAt = now + 55000 + Math.random() * 40000;
      return false;
    }

    const tipDur = 1.65;
    const slideDur = 1.35;
    c.sinkT += dt / (tipDur + slideDur);
    const u = Phaser.Math.Clamp(c.sinkT, 0, 1);
    const tipEnd = tipDur / (tipDur + slideDur);
    const spin = c.image.flipX ? -1 : 1;

    let ang = Math.PI * 0.5;
    let extraY = 26;
    if (u < tipEnd) {
      const p = u / tipEnd;
      const e = 1 - (1 - p) * (1 - p);
      ang = e * Math.PI * 0.5;
      extraY = e * 26;
      c.vx *= Math.max(0, 1 - dt * 2.2);
      c.x += c.vx * dt;
    } else {
      const p = (u - tipEnd) / (1 - tipEnd);
      extraY = 26 + p * p * 52;
      c.vx = 0;
      c.image.setAlpha(0.9 * (1 - p * 0.92));
    }

    c.image.setRotation(spin * ang);
    c.image.x = c.x;
    c.image.y = c.y + extraY;
    return u >= 1;
  }

  /** Rare Solent flyover — small doodle Spitfire across the sky. */
  private spawnSpitfire(): void {
    if (this.spitfire || !this.scene.textures.exists("sky_spitfire")) return;
    const goingRight = Math.random() < 0.55;
    const y = 28 + Math.random() * 42;
    const startX = goingRight ? -50 : this.viewW + 50;
    const speed = (95 + Math.random() * 35) * (goingRight ? 1 : -1);
    const image = this.scene.add
      .image(startX, y, "sky_spitfire")
      .setScrollFactor(0)
      .setDepth(-36)
      .setScale(0.62 + Math.random() * 0.18)
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
