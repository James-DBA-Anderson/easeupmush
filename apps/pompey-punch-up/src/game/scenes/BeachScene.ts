import Phaser from "phaser";
import { COMMON, GAME_HEIGHT, LANE, WORLD_WIDTH, viewportWidth } from "../constants";
import { resolveCombat, tryLoot, nearestLootable, type CombatEvent } from "../combat/resolveCombat";
import { Enemy, type EnemyRole } from "../entities/Enemy";
import { Player } from "../entities/Player";
import { Civilian } from "../entities/Civilian";
import { Police } from "../entities/Police";
import type { Fighter } from "../entities/Fighter";
import { generateDoodleTextures } from "../assets/doodleTextures";
import { chipRock } from "../audio/ChipRock";
import { chipSfx, hitWeightFor } from "../audio/ChipSfx";
import { ParallaxBeach } from "../world/ParallaxBeach";
import { SkyDrone } from "../world/SkyDrone";
import { SeagullFlock } from "../world/SeagullFlock";
import { WantedSystem } from "../systems/WantedSystem";
import { SpeechBubbles } from "../ui/SpeechBubbles";
import { nextPlayerQuip } from "../ui/playerQuips";
import {
  makeContinueButton,
  type KeyPromptHandle,
} from "../ui/KeyPrompt";
import { separateFighters, separateFightersFromObstacles } from "../systems/separateFighters";
import { resolvePropHits } from "../systems/resolvePropHits";
import { updateCarPlatforms, syncCarOcclusion, wreckCarUnderThrower } from "../systems/climbCars";
import { WeaponPickup, type WeaponKind } from "../world/WeaponPickup";
import { BuzzballPickup } from "../world/BuzzballPickup";
import { SkateboardPickup } from "../world/SkateboardPickup";
import { ThrownWeapon, isThrowable } from "../world/ThrownWeapon";
import type { DestructibleProp } from "../world/DestructibleProp";
import type { FoodStall } from "../world/FoodStall";
import type { WeaponShop } from "../world/WeaponShop";
import type { Obstacle } from "../world/obstacles";
import { separateObstacles } from "../world/obstacles";
import {
  clearPunchJust,
  consumeConfirmJust,
  bindPauseMenu,
  consumeCoverJust,
  consumePauseJust,
  consumeRestartJust,
  hideHtmlPrompt,
  isMobilePlay,
  peekPunchJust,
  setMobilePadActive,
  setPauseMenuOpen,
  showHtmlPrompt,
} from "../input/mobilePad";

/** Idle banter when the lads haven't clocked you yet. */
const IDLE_CHATTER: [string, string][] = [
  ["You reckon he's still round here mush?", "Must be. Boss wants that dinlo found."],
  ["Fancy a fag after this?", "After we find him mush."],
  ["I'm freezing my nuts off.", "Keep walking then — have a squinny left."],
  ["Check behind that motor?", "Already did mush. Nothing."],
  ["Heard he upset the Hardman's mum.", "Silly dinlo."],
  ["Anything your end?", "Quiet as the grave mush."],
  ["If I find him first…", "You'll still mess it up dinlo."],
  ["How long we been out?", "Too long. Keep squinnying about."],
  ["Squinny over by the wall?", "Already did mush."],
  ["What if he's a proper hard case?", "Then you're the dinlo who found him."],
];

/** Player wondering who these lads are — only while nobody's clocked him yet. */
const WHO_ARE_THEY: string[] = [
  "Who are these blokes mush?",
  "Do I know any of them?",
  "What's their game?",
  "Why are they hanging about looking shifty?",
  "I don't recognise a single dinlo among them.",
  "Are they looking for someone?",
  "Something's off about that lot.",
  "If this is about last night… I don't remember a thing.",
  "Keep walking. Maybe they're not after me.",
  "Hardman's boys? Out here?",
  "Have a squinny — that lot look wrong.",
];

const LEVEL_ONE_TECHNIQUES: Record<string, string> = {
  combo: "the three-hit combo",
  back_attack: "the back attack",
  headbutt: "the running headbutt",
  jump_kick: "the jump kick",
  backflip: "the backflip",
  swanton: "a Swanton splash off a motor",
  hurricanrana: "a hurricanrana off a motor",
  grab: "the grab",
  body_toss: "the powerbomb",
  german_suplex: "the German suplex",
  low_blow: "the low blow",
  stomp: "the floor stomp",
  weapon: "a weapon swing",
  throw: "a thrown bottle or brick",
  slide: "the running slide",
  whirl: "the crowd-clearing whirl",
};

type AchievementId =
  | "bigBang"
  | "blackhawkDown"
  | "choppedMush"
  | "dogPound"
  | "kickFlip";

const ACHIEVEMENTS: { id: AchievementId; name: string }[] = [
  { id: "bigBang", name: "Big Bang" },
  { id: "blackhawkDown", name: "Blackhawk Down" },
  { id: "choppedMush", name: "Chopped Mush" },
  { id: "dogPound", name: "Dog Pound" },
  { id: "kickFlip", name: "Kick Flip" },
];

type IntroPhase = "asleep" | "stir" | "line" | "walk" | "done";

/** Where Bill dumps you after the cuff van — last solid beat you reached. */
type RunCheckpoint = {
  stage: 1 | 2;
  x: number;
  y: number;
  withCasey: boolean;
  label: string;
};

type DownedSequence = {
  startedAt: number;
  looters: Enemy[];
  helpersChosenAt: number;
  helperStartedAt: number;
  helper: Civilian | null;
  moneyTaken: number;
  weaponTaken: WeaponKind | null;
  lootDone: boolean;
  civiliansPrompted: boolean;
  revived: boolean;
};

export class BeachScene extends Phaser.Scene {
  private player!: Player;
  private enemies: Enemy[] = [];
  private civilians: Civilian[] = [];
  private police: Police[] = [];
  private fighters: Fighter[] = [];
  private banner!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private hud!: Phaser.GameObjects.Text;
  private achievementToast?: Phaser.GameObjects.Container;
  private readonly unlockedAchievements = new Set<AchievementId>();
  private levelTwoCleared = false;
  private enemyPortrait!: Phaser.GameObjects.Container;
  private enemyPortraitImage!: Phaser.GameObjects.Image;
  private enemyPortraitName!: Phaser.GameObjects.Text;
  private enemyPortraitRank!: Phaser.GameObjects.Graphics;
  private enemyPortraitDamage!: Phaser.GameObjects.Graphics;
  private portraitRank: EnemyRole | null = null;
  private lootHint!: Phaser.GameObjects.Text;
  /** What tapping the amber prompt should do (null = not a button). */
  private lootHintAction:
    | "bribe"
    | "loot"
    | "shop"
    | "stall"
    | "board"
    | "wep"
    | "buzz"
    | null = null;
  /** Lads who fled or got wiped without a KO — blocks the seafront massacre. */
  private massacreEscaped = false;
  private nukeHud?: Phaser.GameObjects.Container;
  /** Kept for HUD pin math; mobile no longer zooms the camera (EXPAND fills). */
  private viewZoom = 1;
  /** Expanded canvas width on wide phones (Scale.EXPAND). */
  private get viewW(): number {
    return viewportWidth(this);
  }
  private floatTexts: Phaser.GameObjects.Text[] = [];
  private defeated = false;
  private restartKey!: Phaser.Input.Keyboard.Key;
  private parallax!: ParallaxBeach;
  private skyDrone!: SkyDrone;
  private gulls!: SeagullFlock;
  private wanted = new WantedSystem();
  private bubbles!: SpeechBubbles;
  private pickups: WeaponPickup[] = [];
  private buzzballs: BuzzballPickup[] = [];
  private buzzAura?: Phaser.GameObjects.Graphics;
  private buzzFadeWarned = false;
  private buzzAwakening = false;
  private buzzPowerLive = false;
  private skateboards: SkateboardPickup[] = [];
  private thrown: ThrownWeapon[] = [];
  private destructibles: DestructibleProp[] = [];
  private foodStalls: FoodStall[] = [];
  private weaponShops: WeaponShop[] = [];
  private obstacles: Obstacle[] = [];
  /** Lads waiting further east — spawn as you walk into their patch. */
  private readonly pendingEnemies: {
    x: number;
    y: number;
    name: string;
    toughness: number;
    unlockX: number;
    boss?: boolean;
    mad?: boolean;
    role?: EnemyRole;
    /** Must be phoned in by a cagey lad — interrupt the call to cancel. */
    needsCall?: boolean;
    /** Spawn relative to the player instead of fixed world X. */
    ambush?: "behind" | "side";
  }[] = [];
  private bossAnnounced = false;
  private droneAssistAnnounced = false;
  /** Don't scarper until the last fan-chop has finished mincing. */
  private hoverChopLeaveAt = 0;
  /** Toast Chopped Mush once the craft has actually left for the Island. */
  private pendingChoppedMush = false;
  /** Screen lock while a Hardman scrap (or its post-boss beat) owns this patch. */
  private bossArena: { scrollX: number; minX: number; maxX: number } | null = null;
  /** Keep the L1 Hardman frame through Casey / Level 2 start until you walk east. */
  private postBossPierLock = false;
  /** Defer camera follow until after a boss lock clears — avoids a one-frame recenter. */
  private cameraFollowHeld = false;
  private cameraFollowingPlayer = false;
  /** Unlock X whose call succeeded — wave can spawn. */
  private callArmedUnlock: number | null = null;
  /** Who's currently on the blower. */
  private activeCaller: Enemy | null = null;
  private chatterAt = 0;
  private wasHiding = false;
  private nextBgThugAt = 0;
  /** Don't stack wisecracks when you clear a pack in one go. */
  private nextQuipAt = 0;
  /** Confused denials while the first few thugs pile in. */
  private wonderLineIndex = 0;
  private nextWonderAt = 0;
  /** Once any lad clocks you, stop the "who are they?" muttering for a while. */
  private wonderedUntilSpotted = false;
  /** First-level report used by the captive and carried into later levels. */
  private levelStartedAt = 0;
  private hitsTaken = 0;
  private civilianHits = 0;
  private dogKicks = 0;
  private propsWrecked = 0;
  private readonly techniquesUsed = new Set<string>();
  private endingState:
    | "playing"
    | "assessment"
    | "companion"
    | "duel"
    | "epilogue"
    | "nuke"
    | "complete" = "playing";
  private endingResolveAt = 0;
  /** 1 = South Parade stretch; 2 = sea defences → Clarence Pier. */
  private stage: 1 | 2 = 1;
  /** Bosses already processed for endings (L1 Casey / L2 complete). */
  private readonly handledBosses = new Set<Enemy>();
  private captive: Civilian | Enemy | null = null;
  private captiveStragglers: Enemy[] = [];
  private playerDowned: DownedSequence | null = null;
  private lastPlayerDefeat: CombatEvent | null = null;
  private introPhase: IntroPhase = "asleep";
  private introStartedAt = 0;
  private introLineSaid = false;
  /** Last safe beat — cuff restart lands here (promenade / post-Casey L2). */
  private runCheckpoint: RunCheckpoint = {
    stage: 1,
    x: 360,
    y: GAME_HEIGHT * 0.72,
    withCasey: false,
    label: "the promenade",
  };
  /** Casey's post-boss chat — game pauses until you continue each line. */
  private caseyChat: {
    kind: "l1" | "l2good";
    speaker: Civilian;
    lines: { text: string; banner?: string; who?: "casey" | "player" }[];
    index: number;
    report?: { honour: number; seconds: number; missing: string[] };
  } | null = null;
  private continueHint?: KeyPromptHandle;
  private continueKey!: Phaser.Input.Keyboard.Key;
  private continueAltKey!: Phaser.Input.Keyboard.Key;
  private pauseKey!: Phaser.Input.Keyboard.Key;
  private pauseEscKey!: Phaser.Input.Keyboard.Key;
  /** Pause menu — freezes scrap until Resume / Restart. */
  private gamePaused = false;
  constructor() {
    super("BeachScene");
  }

  create() {
    generateDoodleTextures(this);
    setMobilePadActive(true);
    bindPauseMenu({
      resume: () => this.setGamePaused(false),
      restart: () => {
        this.setGamePaused(false);
        this.restartFromCheckpoint();
      },
    });

    // Title → calm promenade bed; fight cut drops in once someone clocks you
    void chipRock.unlock().then(() => {
      chipRock.setMode("bed");
      chipRock.setHeat(0.18);
      return chipRock.start();
    });
    this.input.keyboard?.on("keydown-M", () => {
      const muted = chipRock.toggleMute();
      this.banner?.setText(muted ? "Music off (M)" : "Chip rock back on (M)");
    });

    // Scene.restart() reuses this instance — wipe session state so UI / ending don't stick
    this.defeated = false;
    this.playerDowned = null;
    this.lastPlayerDefeat = null;
    this.gamePaused = false;
    setPauseMenuOpen(false);
    this.bossAnnounced = false;
    this.droneAssistAnnounced = false;
    this.hoverChopLeaveAt = 0;
    this.pendingChoppedMush = false;
    this.bossArena = null;
    this.postBossPierLock = false;
    this.cameraFollowHeld = false;
    this.cameraFollowingPlayer = false;
    this.callArmedUnlock = null;
    this.activeCaller = null;
    this.wasHiding = false;
    this.hitsTaken = 0;
    this.civilianHits = 0;
    this.dogKicks = 0;
    this.propsWrecked = 0;
    this.techniquesUsed.clear();
    this.unlockedAchievements.clear();
    this.levelTwoCleared = false;
    this.achievementToast?.destroy(true);
    this.achievementToast = undefined;
    this.wonderLineIndex = 0;
    this.nextWonderAt = 0;
    this.wonderedUntilSpotted = false;
    this.endingState = "playing";
    this.endingResolveAt = 0;
    this.stage = 1;
    this.massacreEscaped = false;
    this.nukeHud?.destroy(true);
    this.nukeHud = undefined;
    this.handledBosses.clear();
    this.captive = null;
    this.captiveStragglers = [];
    this.caseyChat = null;
    this.portraitRank = null;
    this.introPhase = "asleep";
    this.introStartedAt = 0;
    this.introLineSaid = false;
    this.clearRestartPrompt();
    this.continueHint?.destroy();
    this.continueHint = undefined;
    this.floatTexts = [];
    this.pickups = [];
    this.buzzballs = [];
    this.buzzAura?.destroy();
    this.buzzAura = undefined;
    this.buzzFadeWarned = false;
    this.buzzAwakening = false;
    this.buzzPowerLive = false;
    this.skateboards = [];
    this.thrown = [];
    this.enemies = [];
    this.police = [];

    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, GAME_HEIGHT);
    // No camera zoom on mobile — Scale.EXPAND already fills the screen.
    // Zoom was desyncing scrollFactor-0 beach/buildings from the fight lane
    // and making vertical follow slide the road/cars up on load.
    this.viewZoom = 1;
    this.cameras.main.setZoom(1);
    this.parallax = new ParallaxBeach(this);
    this.skyDrone = new SkyDrone(this);
    this.gulls = new SeagullFlock(this);
    this.wanted = new WantedSystem();
    this.bubbles = new SpeechBubbles(this);

    // Wake on the sand, north of the fight lane — walk onto the front in the intro
    this.player = new Player(this, 170, GAME_HEIGHT * 0.44);
    this.player.inputLocked = true;
    this.player.structure.putOnFloor(0, 99999);
    this.player.setAction("down", 0, 99999);
    this.player.markPlantHere();
    // Quiet start — thugs turn up further along the front
    this.enemies = [];
    this.pendingEnemies.splice(
      0,
      this.pendingEnemies.length,
      // Quiet Eastney stretch — first contact further along
      {
        x: 1500,
        y: GAME_HEIGHT * 0.68,
        name: "Mean Lad",
        toughness: 0.80,
        unlockX: 1280,
        role: "scout",
      },
      {
        x: 1750,
        y: GAME_HEIGHT * 0.72,
        name: "His Mate",
        toughness: 0.82,
        unlockX: 1500,
        role: "thug",
      },
      {
        x: 2600,
        y: GAME_HEIGHT * 0.68,
        name: "Deck Chair",
        toughness: 0.90,
        unlockX: 2200,
        needsCall: true,
        role: "sergeant",
      },
      {
        x: 3800,
        y: GAME_HEIGHT * 0.7,
        name: "Eastney Boy",
        toughness: 0.96,
        unlockX: 3300,
        mad: true,
        needsCall: true,
        role: "thug",
      },
      {
        x: 5400,
        y: GAME_HEIGHT * 0.68,
        name: "Arcade Rat",
        toughness: 1.00,
        unlockX: 5000,
        needsCall: true,
        role: "scout",
      },
      {
        x: 7200,
        y: GAME_HEIGHT * 0.7,
        name: "Pier Hardman",
        toughness: 3.35,
        unlockX: 6800,
        boss: true,
        role: "sergeant",
      },
    );
    this.civilians = [
      new Civilian(this, 450, GAME_HEIGHT * 0.7, "Ollie", "walker", undefined, { present: "masc" }),
      new Civilian(this, 1100, GAME_HEIGHT * 0.62, "Priya", "jogger", 1, {
        present: "fem",
        lookId: "look_c18",
      }),
      new Civilian(this, 200, GAME_HEIGHT * 0.72, "Kieran", "bike", 1, { present: "masc" }),
      new Civilian(this, 5600, GAME_HEIGHT * 0.66, "Mei", "scooter", -1, {
        present: "fem",
        lookId: "look_c11",
      }),
      new Civilian(this, 6400, GAME_HEIGHT * 0.7, "Arcade Kid", "walker", undefined, {
        present: "masc",
      }),
      new Civilian(this, 6900, GAME_HEIGHT * 0.64, "Debs", "jogger", -1, {
        present: "fem",
        lookId: "look_c08",
      }),
      new Civilian(this, 7400, GAME_HEIGHT * 0.72, "Old Stan", "walker", undefined, {
        nosy: true,
        present: "masc",
        lookId: "look_c09",
      }),
      new Civilian(this, 4200, GAME_HEIGHT * 0.74, "Kwame + dog", "dog_walker", undefined, {
        present: "masc",
      }),
      new Civilian(this, 3500, GAME_HEIGHT * 0.66, "Ash", "wheelchair", undefined, {
        present: "masc",
      }),
      new Civilian(this, 4300, GAME_HEIGHT * 0.7, "Nana Jean", "walker", undefined, {
        present: "fem",
        lookId: "look_c13",
      }),
      new Civilian(this, 4800, GAME_HEIGHT * 0.64, "Jamal", "jogger", 1, { present: "masc" }),
      new Civilian(this, 850, GAME_HEIGHT * 0.68, "Aisha", "walker", undefined, {
        nosy: true,
        present: "fem",
        lookId: "look_c17",
      }),
      new Civilian(this, 3000, GAME_HEIGHT * 0.72, "Tomasz", "walker", undefined, {
        nosy: true,
        present: "masc",
      }),
      new Civilian(this, 1700, GAME_HEIGHT * 0.7, "Fatima", "walker", undefined, {
        present: "fem",
        lookId: "look_c14",
      }),
      new Civilian(this, 2300, GAME_HEIGHT * 0.66, "Connor", "jogger", -1, { present: "masc" }),
    ];

    // A few couples strolling the front — clip her and he loses it
    const dave = new Civilian(this, 980, GAME_HEIGHT * 0.7, "Dave", "walker", 1, {
      nosy: false,
      present: "masc",
      lookId: "look_c06",
    });
    const sharon = new Civilian(this, 1012, GAME_HEIGHT * 0.685, "Sharon", "walker", 1, {
      nosy: false,
      present: "fem",
      lookId: "look_c16",
    });
    Civilian.linkCouple(dave, sharon);

    const lee = new Civilian(this, 3900, GAME_HEIGHT * 0.68, "Lee", "walker", -1, {
      nosy: false,
      present: "masc",
      lookId: "look_c02",
    });
    const karen = new Civilian(this, 3868, GAME_HEIGHT * 0.695, "Karen", "walker", -1, {
      nosy: false,
      present: "fem",
      lookId: "look_c01",
    });
    Civilian.linkCouple(lee, karen);

    const tony = new Civilian(this, 6100, GAME_HEIGHT * 0.72, "Tony", "walker", 1, {
      nosy: false,
      present: "masc",
      lookId: "look_c10",
    });
    const tracy = new Civilian(this, 6132, GAME_HEIGHT * 0.705, "Tracy", "walker", 1, {
      nosy: false,
      present: "fem",
      lookId: "look_c18",
    });
    Civilian.linkCouple(tony, tracy);

    this.civilians.push(dave, sharon, lee, karen, tony, tracy);
    this.police = [];
    this.rebuildFighterList();
    this.spawnWeapons();
    this.destructibles = this.parallax.destructibles;
    this.foodStalls = this.parallax.foodStalls;
    this.weaponShops = this.parallax.weaponShops;
    this.refreshObstacles();

    // Follow X only — Y stay locked so the road/prom never slide on load,
    // and SF0 landmarks stay glued to the fight lane.
    this.cameras.main.setScroll(
      Math.max(0, this.player.x - this.viewW * 0.5),
      0,
    );
    this.cameras.main.startFollow(this.player, true, 0.08, 0);
    this.cameras.main.setDeadzone(120, 48);
    this.cameraFollowingPlayer = true;

    const START_BANNER =
      "Southsea — morning after. Something's ringing in your ears…";
    this.banner = this.add
      .text(0, 0, START_BANNER, {
        fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
        fontSize: "15px",
        color: "#1a1410",
        backgroundColor: "#f2e6d8",
        padding: { x: 8, y: 4 },
      })
      .setDepth(100);
    this.pinHud(this.banner, 24, 16);

    this.hud = this.add
      .text(0, 0, "", {
        fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
        fontSize: "16px",
        color: "#1a1410",
        backgroundColor: "#f2e6d8",
        padding: { x: 8, y: 4 },
        align: "left",
      })
      .setOrigin(0, 0)
      .setDepth(100);
    this.pinHud(this.hud, 24, 52);

    const portraitFrame = this.add.graphics();
    portraitFrame.fillStyle(0xf2e6d8, 0.96);
    portraitFrame.lineStyle(3, 0x1a1410, 1);
    portraitFrame.fillRoundedRect(-86, 0, 86, 116, 6);
    portraitFrame.strokeRoundedRect(-86, 0, 86, 116, 6);
    // Name gets its own strip under the mugshot
    portraitFrame.lineStyle(2, 0x1a1410, 0.7);
    portraitFrame.lineBetween(-82, 84, -4, 84);
    this.enemyPortraitImage = this.add.image(-43, 55, "enemy_idle").setDisplaySize(62, 54);
    this.enemyPortraitRank = this.add.graphics();
    this.enemyPortraitDamage = this.add.graphics();
    this.enemyPortraitName = this.add
      .text(-43, 90, "", {
        fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
        fontSize: "12px",
        color: "#1a1410",
        align: "center",
        wordWrap: { width: 78 },
      })
      .setOrigin(0.5, 0);
    this.enemyPortrait = this.add
      .container(0, 0, [
        portraitFrame,
        this.enemyPortraitImage,
        this.enemyPortraitDamage,
        this.enemyPortraitRank,
        this.enemyPortraitName,
      ])
      .setDepth(105)
      .setVisible(false);
    this.pinHud(this.enemyPortrait, this.viewW - 20, 16);

    this.lootHint = this.add
      .text(0, 0, "", {
        fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
        fontSize: "18px",
        color: "#1a1410",
        backgroundColor: "#ffe08a",
        padding: { x: 10, y: 4 },
      })
      .setOrigin(0.5)
      .setDepth(110)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.lootHint.on("pointerup", () => this.onLootHintPress());
    this.pinHud(this.lootHint, this.viewW / 2, GAME_HEIGHT - 80);

    this.hint = this.add
      .text(0, 0, "", {
        fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
        fontSize: "13px",
        color: "#f2e6d8",
        backgroundColor: "#1a1410aa",
        padding: { x: 12, y: 5 },
      })
      .setOrigin(0.5, 1)
      .setDepth(100)
      .setAlpha(0.92)
      .setVisible(false);
    this.pinHud(this.hint, this.viewW / 2, GAME_HEIGHT - 18);

    this.restartKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.continueKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.continueAltKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.pauseKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    this.pauseEscKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.chatterAt = this.time.now + 12000 + Math.random() * 4000;
    // No background silhouettes until you've had a proper stroll
    this.nextBgThugAt = this.time.now + 28000 + Math.random() * 8000;
    this.levelStartedAt = this.time.now;
    this.introPhase = "asleep";
    this.introStartedAt = this.time.now;
    this.introLineSaid = false;
    this.runCheckpoint = {
      stage: 1,
      x: 360,
      y: GAME_HEIGHT * 0.72,
      withCasey: false,
      label: "the promenade",
    };
    this.banner.setText(START_BANNER);

    const resume = this.registry.get("resumeCheckpoint") as RunCheckpoint | undefined;
    if (resume) {
      this.registry.remove("resumeCheckpoint");
      this.applyResumeCheckpoint(resume);
    }
  }

  private rebuildFighterList(): void {
    this.fighters = [this.player, ...this.enemies, ...this.civilians, ...this.police];
  }

  private spawnWeapons(): void {
    const spots: { x: number; y: number; kind: WeaponKind; rx: number; ry: number }[] = [
      { x: 400, y: GAME_HEIGHT * 0.7, kind: "bottle", rx: 24, ry: 18 },
      { x: 1200, y: GAME_HEIGHT * 0.66, kind: "bat", rx: 24, ry: 18 },
      { x: 2100, y: GAME_HEIGHT * 0.72, kind: "brick", rx: 24, ry: 18 },
      { x: 3000, y: GAME_HEIGHT * 0.64, kind: "bottle", rx: 24, ry: 18 },
      { x: 4000, y: GAME_HEIGHT * 0.7, kind: "bat", rx: 24, ry: 18 },
      { x: 5000, y: GAME_HEIGHT * 0.68, kind: "brick", rx: 24, ry: 18 },
      { x: 6200, y: GAME_HEIGHT * 0.72, kind: "bottle", rx: 24, ry: 18 },
      { x: 7100, y: GAME_HEIGHT * 0.66, kind: "bat", rx: 24, ry: 18 },
    ];
    separateObstacles(spots);
    for (const s of spots) {
      this.spawnPickup(s.x, s.y, s.kind);
    }
  }

  private spawnPickup(x: number, y: number, kind: WeaponKind): void {
    const p = new WeaponPickup(this, x, y, kind);
    this.pickups.push(p);
  }

  private spawnSkateboard(x: number, y: number): void {
    const board = new SkateboardPickup(this, x, y);
    this.skateboards.push(board);
  }

  /** Deck snaps — halves fly apart, no pickup left. */
  private snapSkateboard(x: number, y: number): void {
    const tailKey = this.textures.exists("mount_skate_tail")
      ? "mount_skate_tail"
      : "mount_skate";
    const noseKey = this.textures.exists("mount_skate_nose")
      ? "mount_skate_nose"
      : "mount_skate";
    const tail = this.add
      .image(x - 6, y, tailKey)
      .setOrigin(0.5, 1)
      .setDepth(7)
      .setAngle(-18);
    const nose = this.add
      .image(x + 6, y, noseKey)
      .setOrigin(0.5, 1)
      .setDepth(7)
      .setAngle(22);
    this.tweens.add({
      targets: tail,
      x: x - 38,
      y: y + 6,
      angle: -55,
      alpha: 0.15,
      duration: 900,
      ease: "Cubic.easeOut",
      onComplete: () => tail.destroy(),
    });
    this.tweens.add({
      targets: nose,
      x: x + 42,
      y: y + 4,
      angle: 70,
      alpha: 0.15,
      duration: 980,
      ease: "Cubic.easeOut",
      onComplete: () => nose.destroy(),
    });
  }

  private nearestSkateboard(): SkateboardPickup | null {
    let best: SkateboardPickup | null = null;
    let bestD = 70;
    for (const b of this.skateboards) {
      if (b.taken) continue;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, b.x, b.y);
      if (d < bestD && Math.abs(this.player.laneY - b.laneY) < 40) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  private tryPickupSkateboard(): boolean {
    if (this.player.skating) return false;
    if (this.player.airborne || this.player.climbing) return false;
    if (this.player.structure.isOut()) return false;
    const board = this.nearestSkateboard();
    if (!board || board.taken) return false;
    this.player.mountSkateboard();
    board.collect();
    this.skateboards = this.skateboards.filter((x) => x !== board && !x.taken);
    this.spawnFloat(this.player.x, this.player.y - 50, "on the board");
    this.banner.setText(
      isMobilePlay()
        ? "Skateboarding — Jump ollie, Down+move for a manual, Jump then Kick for a kickflip. Duck to hop off."
        : "Skateboarding — Space ollie, Down+move for a manual, Space then K for a kickflip. Q to hop off.",
    );
    void chipSfx.pickup();
    return true;
  }

  private refreshObstacles(): void {
    this.obstacles = this.parallax.getObstacles();
  }

  private onPropHit(attacker: Fighter, prop: DestructibleProp, destroyed: boolean, scrap: WeaponKind | null): void {
    if (destroyed) {
      if (attacker.team === "player") this.propsWrecked += 1;
      this.spawnFloat(prop.x, prop.y - 40, `${prop.label} wrecked`);
      this.banner.setText(`Smashed the ${prop.label}.`);
      void chipSfx.crash();
      if (scrap) {
        this.spawnPickup(prop.x + 16, prop.y, scrap);
        this.spawnFloat(prop.x, prop.y - 60, `+${scrap}`);
      }
      this.refreshObstacles();
    } else {
      this.spawnFloat(prop.x, prop.y - 36, "clunk");
      void chipSfx.hit("mid");
    }
    void attacker;
  }

  private nearestPickup(): WeaponPickup | null {
    let best: WeaponPickup | null = null;
    let bestD = 70;
    for (const p of this.pickups) {
      if (p.taken) continue;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y);
      if (d < bestD && Math.abs(this.player.laneY - p.y) < 40) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  private tryPickupWeapon(): boolean {
    const p = this.nearestPickup();
    if (!p || p.taken) return false;
    if (this.player.weapon !== "none") {
      const old = this.player.dropWeapon();
      if (old) this.spawnPickup(this.player.x - this.player.facing * 24, this.player.y, old);
    }
    const kind = p.kind;
    this.player.equipWeapon(kind);
    p.collect();
    this.pickups = this.pickups.filter((x) => x !== p && !x.taken);
    this.spawnFloat(this.player.x, this.player.y - 50, `got ${kind}`);
    void chipSfx.pickup();
    const tip =
      kind === "bat"
        ? "J to swing the bat. Q to drop."
        : `J to throw the ${kind}. Q to drop.`;
    this.banner.setText(`Picked up a ${kind} — ${tip}`);
    return true;
  }

  /** Armed lads / Hardmen nick bats and bottles off the pebbles. */
  private maybeEnemyWeaponGrabs(): void {
    if (this.pickups.length === 0) return;
    for (const e of this.enemies) {
      if (!e.nicksKit || e.weapon !== "none") continue;
      if (e.structure.isOut() || e.isBackground || !e.hasSpottedPlayer) continue;
      let best: WeaponPickup | null = null;
      let bestD = 48;
      for (const p of this.pickups) {
        if (p.taken) continue;
        const d = Phaser.Math.Distance.Between(e.x, e.y, p.x, p.y);
        if (d < bestD && Math.abs(e.laneY - p.y) < 36) {
          bestD = d;
          best = p;
        }
      }
      if (!best) continue;
      best.collect();
      e.equipWeapon(best.kind);
      this.pickups = this.pickups.filter((x) => x !== best && !x.taken);
      this.spawnFloat(e.x, e.y - 52, `nicked ${best.kind}`);
      return;
    }
  }

  private nearestBuzzball(): BuzzballPickup | null {
    let best: BuzzballPickup | null = null;
    let bestD = 64;
    for (const b of this.buzzballs) {
      if (b.taken) continue;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, b.x, b.y);
      if (d < bestD && Math.abs(this.player.laneY - b.y) < 44) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  private spawnBuzzball(x: number, y: number): void {
    const ball = new BuzzballPickup(
      this,
      Phaser.Math.Clamp(x, LANE.minX, LANE.maxX),
      Phaser.Math.Clamp(y, LANE.minY, LANE.maxY),
    );
    this.buzzballs.push(ball);
    this.spawnFloat(ball.x, ball.y - 36, "BUZZBALL!");
  }

  private maybeDropBuzzball(foe: Enemy): void {
    if (
      this.endingState === "nuke" ||
      this.endingState === "complete" ||
      this.endingState === "epilogue"
    ) {
      return;
    }
    if (foe.isBackground) return;
    if (this.buzzballs.some((b) => !b.taken)) return;
    const chance = foe.isBoss ? 0.14 : 0.07;
    if (Math.random() > chance) return;
    this.spawnBuzzball(foe.x + foe.facing * -22, foe.laneY + 6);
    this.banner.setText("Buzzball! Grab it before it drains.");
  }

  private tryPickupBuzzball(): boolean {
    const ball = this.nearestBuzzball();
    if (!ball || ball.taken) return false;
    this.drinkBuzzball(ball);
    return true;
  }

  private drinkBuzzball(ball: BuzzballPickup): void {
    if (ball.taken) return;
    ball.collect();
    this.buzzballs = this.buzzballs.filter((b) => !b.taken);
    const now = this.time.now;
    const already = this.player.isBuzzed(now);
    this.player.buzzedUntil = now + 10000;
    this.player.invulnUntil = this.player.buzzedUntil;
    this.player.setBuzzedMove(true);
    this.buzzFadeWarned = false;
    this.spawnFloat(this.player.x, this.player.y - 72, "BUZZBALL!");
    void chipSfx.pickup();
    if (already) {
      this.banner.setText("Another Buzzball — still buzzing.");
      this.ensureBuzzAura();
      return;
    }
    this.beginBuzzAwakening();
  }

  private beginBuzzAwakening(): void {
    this.buzzAwakening = true;
    this.player.inputLocked = true;
    this.player.action = "idle";
    this.player.actionUntil = this.time.now + 1400;
    this.player.structure.anger = Math.max(this.player.structure.anger, 0.85);
    this.ensureBuzzAura();
    this.banner.setText("BUZZBALL — he's going Super.");
    void chipSfx.buzzCharge();
    this.cameras.main.shake(240, 0.012);
    this.spawnBuzzRings(this.player.x, this.player.y);

    this.time.delayedCall(280, () => {
      if (!this.buzzAwakening) return;
      this.cameras.main.shake(180, 0.01);
      this.spawnBuzzRings(this.player.x, this.player.y);
    });
    this.time.delayedCall(700, () => {
      if (!this.buzzAwakening) return;
      this.cameras.main.shake(220, 0.016);
      this.spawnBuzzRings(this.player.x, this.player.y);
      this.bubbles.say(this.player, "AAAGH—", 900);
    });
    this.time.delayedCall(1400, () => {
      if (this.endingState === "nuke") return;
      this.buzzAwakening = false;
      this.player.inputLocked = false;
      this.banner.setText("Buzzball! Ten seconds — wreck them.");
      this.spawnFloat(this.player.x, this.player.y - 88, "OVERPOWERED");
    });
  }

  private spawnBuzzRings(x: number, y: number): void {
    for (let i = 0; i < 3; i++) {
      const ring = this.add.circle(x, y - 36, 10 + i * 6, 0x7af0ff, 0).setDepth(190);
      ring.setStrokeStyle(3, 0x3df0ff, 0.95);
      this.tweens.add({
        targets: ring,
        scale: 4.2 + i * 0.8,
        alpha: 0,
        duration: 420 + i * 80,
        ease: "Cubic.easeOut",
        onComplete: () => ring.destroy(),
      });
    }
    for (let i = 0; i < 10; i++) {
      const ang = (Math.PI * 2 * i) / 10 + Math.random() * 0.2;
      const bolt = this.add.rectangle(x, y - 40, 3, 16 + Math.random() * 18, 0xdffffa, 0.95);
      bolt.setDepth(191).setRotation(ang);
      this.tweens.add({
        targets: bolt,
        x: x + Math.cos(ang) * (40 + Math.random() * 50),
        y: y - 40 + Math.sin(ang) * (36 + Math.random() * 40),
        alpha: 0,
        duration: 280 + Math.random() * 180,
        onComplete: () => bolt.destroy(),
      });
    }
  }

  private ensureBuzzAura(): void {
    if (this.buzzAura) return;
    this.buzzAura = this.add.graphics().setDepth(8);
  }

  private updateBuzzballs(now: number): void {
    for (const b of this.buzzballs) {
      if (b.taken) continue;
      if (b.expired) {
        this.spawnFloat(b.x, b.y - 28, "drained");
        b.poof();
      } else {
        b.refresh(now);
      }
    }
    this.buzzballs = this.buzzballs.filter((b) => b.active && !b.taken);

    const near = this.nearestBuzzball();
    if (
      near &&
      !this.buzzAwakening &&
      !this.player.inputLocked &&
      !this.player.structure.isOut() &&
      this.introPhase === "done" &&
      Phaser.Math.Distance.Between(this.player.x, this.player.y, near.x, near.y) < 42
    ) {
      this.drinkBuzzball(near);
    }

    this.syncBuzzState(now);
  }

  private syncBuzzState(now: number): void {
    const on = this.player.isBuzzed(now) || this.buzzAwakening;
    if (!on) {
      if (this.buzzPowerLive) {
        this.buzzPowerLive = false;
        this.player.setBuzzedMove(false);
        this.buzzAura?.destroy();
        this.buzzAura = undefined;
        this.buzzFadeWarned = false;
        void chipSfx.buzzFade();
        this.banner.setText("Buzzball's gone. Back to being a normal dinlo.");
        this.spawnFloat(this.player.x, this.player.y - 64, "spent");
      }
      return;
    }

    this.buzzPowerLive = true;
    if (now >= this.player.buzzedUntil - 2000 && !this.buzzFadeWarned && !this.buzzAwakening) {
      this.buzzFadeWarned = true;
      this.banner.setText("Buzzball's wearing off…");
    }

    this.ensureBuzzAura();
    const g = this.buzzAura!;
    const p = this.player;
    const flicker =
      this.buzzFadeWarned && Math.sin(now * 0.04) > 0 ? 0.25 : 0.55 + Math.sin(now * 0.02) * 0.2;
    g.clear();
    g.fillStyle(0x7af0ff, flicker * 0.35);
    g.fillEllipse(p.x, p.y - 38, 54 + Math.sin(now * 0.018) * 8, 92);
    g.fillStyle(0xffffff, flicker * 0.18);
    g.fillEllipse(p.x, p.y - 48, 22, 48);
    g.lineStyle(2, 0xdffffa, flicker);
    g.strokeEllipse(p.x, p.y - 38, 58 + Math.sin(now * 0.03) * 6, 98);
  }

  private updateThrows(now: number, dt: number): void {
    // Release projectiles from throw wind-ups
    for (const f of this.fighters) {
      if (!f.takeThrowRelease(now)) continue;
      const kind = f.weapon;
      if (!isThrowable(kind)) continue;
      f.consumeHeldWeapon();
      const proj = new ThrownWeapon(
        this,
        f.x + f.facing * 28,
        f.laneY,
        kind,
        f,
        f.facing,
      );
      this.thrown.push(proj);
      this.spawnFloat(f.x, f.y - 55, `yeet ${kind}`);
    }

    const still: ThrownWeapon[] = [];
    for (const t of this.thrown) {
      // Hit scenery first
      let hitProp = false;
      for (const prop of this.destructibles) {
        if (prop.destroyed) continue;
        const dx = Math.abs(prop.x - t.x);
        const dy = Math.abs(prop.y - t.groundY);
        if (dx > prop.rx + 20 || dy > prop.ry + 18) continue;
        const power = t.kind === "brick" ? 0.85 : 0.75;
        const result = prop.takeThrow(this, now, power, t.x);
        if (result) {
          this.onPropHit(t.owner, prop, result.destroyed, result.scrap);
          hitProp = true;
          break;
        }
      }
      if (hitProp) {
        t.destroySelf();
        continue;
      }

      // Hit fighters
      let hitSomeone = false;
      for (const target of this.fighters) {
        if (!t.canHit(target)) continue;
        if (t.owner.team === "enemy" && target.team === "enemy") continue;
        if (t.owner.team === "police" && target.team === "police") continue;
        if (t.owner.team === "civilian") continue;
        // Floor work is boots only — bottles bounce off a planted body
        if (target.structure.downed || target.structure.isOut()) continue;

        const power = t.kind === "brick" ? 0.72 : 0.52;
        const result = target.receiveStrike({
          kind: "thrown",
          power,
          critical: false,
          dirty: false,
          onOpening: target.structure.isOpen(now) || target.structure.downed,
          now,
          bodyPart: "head",
        });
        if (t.kind === "bottle") {
          const label =
            result === "crawl_away" || result === "out_cold"
              ? "SMASH"
              : target.structure.bloodied
                ? "bloody"
                : "SMASH";
          this.spawnFloat(target.x, target.y - 70, label);
          this.spawnBottleSmash(target.x, target.y - 40);
        }
        this.onCombat({
          attacker: t.owner,
          target,
          result,
          kind: "thrown",
        });
        hitSomeone = true;
        break;
      }

      if (hitSomeone) {
        t.destroySelf();
        continue;
      }

      const state = t.update(dt);
      if (state === "landed") {
        // Bottles smash; bricks can be scooped again
        if (t.kind === "brick") {
          this.spawnPickup(t.x, t.groundY, "brick");
        } else {
          this.spawnFloat(t.x, t.groundY - 30, "smash");
          this.spawnBottleSmash(t.x, t.groundY - 20);
        }
        t.destroySelf();
        continue;
      }
      if (state === "flying") {
        if (t.x < LANE.minX - 40 || t.x > LANE.maxX + 40) {
          t.destroySelf();
          continue;
        }
        still.push(t);
      }
    }
    this.thrown = still;
  }

  /** Ambient beach loops — drone buzz, hover fans, Spitfire Doppler, passing motors. */
  private syncAmbientSfx(): void {
    const camX = this.cameras.main.scrollX;
    const drone = this.skyDrone.getAudio(camX);
    chipSfx.setDrone(drone.active, drone.intensity, drone.pan);

    const hover = this.parallax.getHovercraftAudio(camX);
    chipSfx.setHovercraft(hover.active, hover.intensity, hover.pan, hover.spin);

    const spit = this.parallax.getSpitfireAudio();
    chipSfx.setSpitfire(spit.active, spit.progress, spit.pan);

    const car = this.parallax.getPassingCarAudio(camX);
    chipSfx.setPassingCar(car.active, car.intensity, car.pan, car.pitch);

    if (this.parallax.takeWaveBreak()) {
      void chipSfx.waveBreak((Math.random() - 0.5) * 0.7);
    }
  }

  /** Ambient flybys along the front; swoops when Clarence King is live. */
  private updateSkyDrone(now: number, dt: number): void {
    if (this.introPhase !== "done") return;
    // Any live L2 boss gets the dive-bombing kit — don't depend on the exact name string
    const clarence = this.enemies.find(
      (e) => e.isBoss && this.stage === 2 && !e.structure.isOut(),
    );
    const bossLive = !!clarence;
    if (bossLive && !this.droneAssistAnnounced) {
      this.droneAssistAnnounced = true;
      this.skyDrone.forceAssist(this.player, now);
      this.banner.setText("His drone's in — watch the swoops!");
      this.spawnFloat(this.player.x, this.player.y - 80, "DRONE!");
      if (clarence) this.bubbles.say(clarence, "Watch the birdie mush", 2600);
    }
    if (
      this.player.action === "jump_kick" ||
      this.player.action === "backflip"
    ) {
      this.skyDrone.tryJumpKick(this.player);
    }
    this.skyDrone.update(
      now,
      dt,
      this.cameras.main.scrollX,
      this.player,
      bossLive,
      (knockDir) => this.onDroneSwoop(now, knockDir),
    );
    const droneEv = this.skyDrone.takeEvent();
    if (droneEv === "filming") {
      this.spawnFloat(this.player.x, this.player.y - 78, "filming you");
      this.banner.setText("Drone's got a bead on you — smile for the camera.");
    } else if (droneEv === "kicked") {
      this.cameras.main.shake(90, 0.006);
      this.spawnFloat(this.player.x, this.player.y - 72, "booted it");
      this.banner.setText("You hoofed the drone — it's losing lift.");
      void chipSfx.hit("heavy");
    } else if (droneEv === "exploded") {
      const boom = this.skyDrone.getBoomPos();
      this.onDroneExplode(now, boom.x, boom.y);
    }
  }

  private onDroneSwoop(now: number, knockDir: number): void {
    if (
      this.player.structure.isOut() ||
      this.player.structure.cuffed ||
      this.player.structure.downed
    ) {
      return;
    }
    const result = this.player.receiveStrike({
      kind: "jump_kick",
      power: 0.78,
      critical: false,
      dirty: false,
      onOpening: this.player.structure.isOpen(now),
      now,
      bodyPart: "head",
      knockDir,
    });
    this.cameras.main.shake(100, 0.006);
    this.spawnFloat(this.player.x, this.player.y - 64, "swoop!");
    void chipSfx.whoosh(true);
    if (result !== "blocked") {
      this.hitsTaken += 1;
      this.banner.setText("Drone dive — that one's from Clarence.");
    }
  }

  /** Crash landing — fireball, then anyone in the blast is done. */
  private onDroneExplode(now: number, x: number, y: number): void {
    this.spawnDroneExplosion(x, y);
    this.cameras.main.shake(280, 0.018);
    void chipSfx.crash();
    void chipSfx.hit("heavy");
    void chipSfx.ko();
    this.spawnFloat(x, y - 48, "KABOOM");
    this.banner.setText("Drone went up — anyone in the blast is cooked.");
    this.unlockAchievement("blackhawkDown");

    const radius = 110;
    for (const f of this.fighters) {
      if (!f.active) continue;
      if (f.structure.isOut() || f.structure.cuffed) continue;
      const d = Math.hypot(f.x - x, f.laneY - y);
      if (d > radius) continue;
      f.tossVx = 0;
      f.tossUntil = 0;
      f.airborne = false;
      f.jumpVy = 0;
      f.clearCarMount();
      f.y = f.laneY;
      f.groundY = f.laneY;
      f.structure.knockOutCold();
      f.setAction("out_cold", now, 999999);
      f.markPlantHere();
      f.invulnUntil = now + 600;
      this.spawnFloat(f.x, f.y - 56, "out");
    }
  }

  private spawnDroneExplosion(x: number, y: number): void {
    const flash = this.add.circle(x, y, 10, 0xfff4c8, 0.9).setDepth(184);
    this.tweens.add({
      targets: flash,
      scale: 7,
      alpha: 0,
      duration: 280,
      ease: "Cubic.easeOut",
      onComplete: () => flash.destroy(),
    });
    const fire = this.add.circle(x, y - 4, 16, 0xff6622, 0.85).setDepth(185);
    this.tweens.add({
      targets: fire,
      scale: 3.4,
      alpha: 0,
      y: y - 18,
      duration: 340,
      ease: "Quad.easeOut",
      onComplete: () => fire.destroy(),
    });
    for (let i = 0; i < 12; i++) {
      const ang = (Math.PI * 2 * i) / 12 + Math.random() * 0.35;
      const dist = 36 + Math.random() * 48;
      const shard = this.add.rectangle(
        x,
        y,
        3 + Math.random() * 6,
        2 + Math.random() * 4,
        Math.random() < 0.45 ? 0x2a2620 : 0xe8a020,
      );
      shard.setDepth(186).setAngle(Math.random() * 360).setAlpha(0.95);
      this.tweens.add({
        targets: shard,
        x: x + Math.cos(ang) * dist,
        y: y + Math.sin(ang) * dist * 0.7 + 12,
        alpha: 0,
        angle: shard.angle + 240,
        scaleX: 0.35,
        duration: 380 + Math.random() * 240,
        ease: "Cubic.easeOut",
        onComplete: () => shard.destroy(),
      });
    }
    for (let i = 0; i < 5; i++) {
      const smoke = this.add.ellipse(
        x + (Math.random() - 0.5) * 18,
        y - 6,
        14 + Math.random() * 12,
        10 + Math.random() * 8,
        0x3a3834,
        0.55,
      );
      smoke.setDepth(183);
      this.tweens.add({
        targets: smoke,
        y: smoke.y - (28 + Math.random() * 24),
        x: smoke.x + (Math.random() - 0.5) * 30,
        scaleX: 1.8,
        scaleY: 1.6,
        alpha: 0,
        duration: 520 + Math.random() * 280,
        ease: "Sine.easeOut",
        onComplete: () => smoke.destroy(),
      });
    }
  }

  /** Calm promenade bed until the scrap starts — then crossfade into the fight cut. */
  private syncChipRockHeat(): void {
    let live = 0;
    let spotted = false;
    for (const e of this.enemies) {
      if (e.structure.isOut()) continue;
      live += 1;
      if (e.hasSpottedPlayer) spotted = true;
    }
    const bossHot = this.enemies.some((e) => e.isBoss && !e.structure.isOut());
    const fighting =
      this.introPhase === "done" &&
      (spotted ||
        this.hitsTaken > 0 ||
        this.wanted.level >= 1 ||
        bossHot);

    // Wake-up / stroll — keep the calm bed under everything
    if (this.introPhase !== "done" || (this.stage === 1 && !fighting)) {
      chipRock.setMode("bed");
      chipRock.setHeat(0.18);
      return;
    }

    if (bossHot) {
      chipRock.setMode("boss");
      chipRock.setHeat(0.95);
      return;
    }

    chipRock.setMode("fight");
    const heat =
      0.45 + Math.min(0.4, live * 0.05) + this.wanted.level * 0.05;
    chipRock.setHeat(heat);
  }

  private syncPolice(): void {
    // Despawn coppers who pocketed a bung and left the front
    const staying: Police[] = [];
    for (const p of this.police) {
      if (p.leftAfterBribe) {
        p.destroy(true);
        continue;
      }
      staying.push(p);
    }
    if (staying.length !== this.police.length) {
      this.police = staying;
      this.rebuildFighterList();
    }

    const need = this.wanted.desiredPoliceCount();
    while (this.police.filter((p) => !p.structure.isOut() && !p.bribed).length < need) {
      const edge = this.cameras.main.scrollX + this.viewW + 40;
      const y = GAME_HEIGHT * (0.6 + Math.random() * 0.12);
      const n = this.police.length + 1;
      const copper = new Police(this, edge, y, `PC ${n}`);
      this.police.push(copper);
      this.rebuildFighterList();
      this.banner.setText("Old Bill's here — they're nicking anyone scrap.");
      this.spawnFloat(this.player.x, this.player.y - 70, "POLICE!");
      void chipSfx.siren();
    }
  }

  /** Bring in the next lad(s) when you've walked far enough — always off-camera. */
  private syncEnemyReinforcements(): void {
    if (this.introPhase !== "done") return;
    if (this.pendingEnemies.length === 0) return;

    const reach = this.player.x;

    // Reached the boss gate — drop everything queued in front so stuck
    // phone-calls / soft-downs can't soft-lock Clarence King forever.
    const bossIdx = this.pendingEnemies.findIndex((p) => p.boss);
    if (bossIdx > 0 && reach >= this.pendingEnemies[bossIdx]!.unlockX) {
      this.pendingEnemies.splice(0, bossIdx);
      this.callArmedUnlock = null;
      this.activeCaller = null;
    }

    const nextWave = this.pendingEnemies[0];
    if (!nextWave || reach < nextWave.unlockX) return;

    // Don't pop a Hardman until the camera already covers his patch — locking
    // then is a freeze, not a jump.
    if (nextWave.boss && !this.cameraCanLockForBoss(nextWave.x)) return;

    // Bosses always arrive once you hit their gate. Soft-downed lads must not
    // block the next wave either — only upright scrap counts.
    if (!nextWave.boss) {
      const blocking = this.enemies.filter((e) => {
        if (e.structure.isOut() || e.isBackground) return false;
        if (e.structure.downed) return false;
        return e.x - this.player.x > -380;
      }).length;
      if (blocking >= 1) return;
    }

    const waveUnlock = nextWave.unlockX;
    const needsCall = !!nextWave.needsCall;
    if (needsCall && this.callArmedUnlock !== waveUnlock) {
      // Wait for a cagey lad to finish the call (or get interrupted → wave dropped)
      this.tryStartBackupCall(waveUnlock);
      // Past the gate with nobody phoning — don't soft-lock Clarence Pier
      if (this.callArmedUnlock !== waveUnlock && reach > waveUnlock + 450) {
        this.callArmedUnlock = waveUnlock;
      }
      if (this.callArmedUnlock !== waveUnlock) return;
    }

    let spawned = 0;
    let packName = "";
    while (
      this.pendingEnemies.length > 0 &&
      this.pendingEnemies[0].unlockX === waveUnlock
    ) {
      const next = this.pendingEnemies.shift()!;
      const pos = this.resolveOffscreenSpawn(next, spawned);
      const lad = new Enemy(this, pos.x, pos.y, next.name, {
        toughness: next.toughness,
        boss: next.boss,
        mad: next.mad,
        role: next.role,
      });
      lad.setFacing(pos.x < this.player.x ? 1 : -1, this.time.now);
      if (next.ambush || next.boss || needsCall) {
        lad.onProvoked(this.time.now, this.player);
      }
      this.enemies.push(lad);
      spawned += 1;
      if (next.boss && !this.bossAnnounced) {
        this.bossAnnounced = true;
        if (this.stage === 2) {
          this.banner.setText("Clarence Pier — the funfair Hardman's waiting.");
          this.spawnFloat(this.player.x, this.player.y - 80, "BOSS AHEAD");
          this.bubbles.say(lad, "This is MY fair mush", 3200);
        } else {
          this.banner.setText("South Parade Pier — the Hardman's waiting.");
          this.spawnFloat(this.player.x, this.player.y - 80, "BOSS AHEAD");
          this.bubbles.say(lad, "This is MY front dinlo", 3200);
        }
      }
      packName = next.name;
    }
    this.callArmedUnlock = null;
    this.activeCaller = null;
    if (spawned === 0) return;
    this.rebuildFighterList();
    if (!this.bossAnnounced) {
      this.banner.setText(
        spawned >= 2 ? `Lads coming in from the east…` : `${packName} up ahead…`,
      );
    }
  }

  /**
   * Occasional lads loitering up on the common. If they clock you they sprint
   * down into the fight lane.
   */
  private syncBackgroundThugs(now: number): void {
    if (this.endingState !== "playing") return;
    if (this.introPhase !== "done") return;
    // Keep the opening stretch clear — no silhouettes until you're further along
    if (this.player.x < 900) {
      this.nextBgThugAt = Math.max(this.nextBgThugAt, now + 4000);
      return;
    }
    const bgAlive = this.enemies.filter((e) => e.isBackground && !e.structure.isOut()).length;
    if (bgAlive >= 1) {
      this.nextBgThugAt = Math.max(this.nextBgThugAt, now + 6000);
      return;
    }
    if (now < this.nextBgThugAt) return;

    // Don't pile them on top of a wave you're already scrapping with
    const engaged = this.enemies.filter(
      (e) => !e.structure.isOut() && !e.isBackground && e.hasSpottedPlayer,
    ).length;
    if (engaged >= 2) {
      this.nextBgThugAt = now + 6000;
      return;
    }

    this.nextBgThugAt = now + 16000 + Math.random() * 14000;
    // Don't always spawn — keep them uncommon
    if (Math.random() < 0.58) return;

    const cam = this.cameras.main;
    const side = Math.random() < 0.5 ? -1 : 1;
    // Prefer just ahead / just behind the camera so you clock them mid-stroll
    const x = Phaser.Math.Clamp(
      cam.scrollX + this.viewW * (0.25 + Math.random() * 0.55) + side * (40 + Math.random() * 80),
      LANE.minX + 40,
      LANE.maxX - 40,
    );
    const y = COMMON.minY + Math.random() * (COMMON.maxY - COMMON.minY);
    const roleRoll = Math.random();
    const role: EnemyRole = roleRoll < 0.35 ? "scout" : roleRoll < 0.5 ? "sergeant" : "thug";
    const names =
      role === "scout"
        ? ["Lookout", "Spotter", "Sharp Eyes"]
        : role === "sergeant"
          ? ["Background Sarge", "Common Sarge"]
          : ["Common Lad", "Promenade", "Stroller"];
    const lad = new Enemy(this, x, y, names[Math.floor(Math.random() * names.length)]!, {
      toughness: 0.86 + Math.random() * 0.12,
      role,
      background: true,
      mad: role === "thug" && Math.random() < 0.25,
    });
    lad.setFacing(side, now);
    this.enemies.push(lad);
    this.rebuildFighterList();
  }

  private locationLabelForUnlock(unlockX: number): string {
    if (unlockX < 1800) return "Eastney";
    if (unlockX < 2800) return "the beach huts";
    if (unlockX < 3800) return "the Common";
    if (unlockX < 5200) return "the Castle";
    if (unlockX < 6400) return "the arcades";
    if (unlockX < 7600) return "South Parade Pier";
    if (unlockX < 9000) return "past the pier";
    if (unlockX < 9400) return "the Round Tower";
    if (unlockX < 11200) return "the sea wall";
    if (unlockX < 13000) return "past Hovertravel";
    return "Clarence Pier";
  }

  /** Prompt a cautious lad to phone mates for the pending wave. */
  private tryStartBackupCall(waveUnlock: number): void {
    if (this.activeCaller?.isPhoningMates) return;
    if (this.activeCaller && !this.activeCaller.active) this.activeCaller = null;

    const caller =
      this.enemies.find((e) => e.canCallForHelp() && !e.structure.isOut()) ?? null;
    if (!caller) {
      // Street cleared — no one to phone, but the pack was already hanging about
      this.callArmedUnlock = waveUnlock;
      return;
    }

    const loc = this.locationLabelForUnlock(waveUnlock);
    if (!caller.startCallForHelp(this.time.now, loc)) return;
    this.activeCaller = caller;
    this.banner.setText("He's calling his mates — stop him before he says where!");
    this.spawnFloat(caller.x, caller.y - 70, "calling…");
  }

  private dropPendingWave(waveUnlock: number, banner: string): void {
    while (
      this.pendingEnemies.length > 0 &&
      this.pendingEnemies[0].unlockX === waveUnlock
    ) {
      this.pendingEnemies.shift();
    }
    this.callArmedUnlock = null;
    this.activeCaller = null;
    this.banner.setText(banner);
  }

  /** Resolve phone-call outcomes — success arms the wave, interrupt cancels it. */
  private syncBackupCalls(): void {
    for (const e of this.enemies) {
      const outcome = e.takeCallOutcome();
      if (!outcome) continue;
      const waveUnlock = this.pendingEnemies[0]?.unlockX;
      if (outcome === "success") {
        if (waveUnlock != null && this.pendingEnemies[0]?.needsCall) {
          this.callArmedUnlock = waveUnlock;
          this.banner.setText("He got the call out — mates on the way!");
          this.spawnFloat(e.x, e.y - 70, "mates inbound");
        }
      } else if (waveUnlock != null && this.pendingEnemies[0]?.needsCall) {
        this.dropPendingWave(waveUnlock, "Call dropped — they don't know where you are.");
        this.spawnFloat(e.x, e.y - 70, "call dropped!");
      }
      if (this.activeCaller === e) this.activeCaller = null;
    }
  }

  /** Lane X bounds — tightened to the locked screen during a Hardman scrap. */
  private fightLaneBounds(): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } {
    if (!this.bossArena) return LANE;
    return {
      minX: this.bossArena.minX,
      maxX: this.bossArena.maxX,
      minY: LANE.minY,
      maxY: LANE.maxY,
    };
  }

  /**
   * Boss fights lock the camera to one screen. Hold that frame through Casey
   * chat / the refuse duel / Clarence's complete card so the view doesn't jump.
   */
  private syncBossArenaLock(): void {
    const boss = this.enemies.find((e) => e.isBoss && !e.structure.isOut());
    if (boss) {
      if (!this.bossArena) this.engageBossArenaLock(boss);
      else this.applyBossArenaCamera();
      return;
    }
    if (this.bossArena && this.shouldHoldBossArena()) {
      this.applyBossArenaCamera();
      return;
    }
    if (this.bossArena) this.clearBossArenaLock();
  }

  /** Keep the locked screen while the post-boss beat still owns this patch. */
  private shouldHoldBossArena(): boolean {
    if (this.postBossPierLock && this.bossArena) return true;
    if (this.caseyChat) return true;
    switch (this.endingState) {
      case "assessment":
      case "companion":
      case "duel":
      case "epilogue":
      case "complete":
        return true;
      default:
        break;
    }
    return this.enemies.some(
      (e) => e.isBoss && e.structure.isOut() && !this.handledBosses.has(e),
    );
  }

  private engageBossArenaLock(boss: Enemy): void {
    const cam = this.cameras.main;
    const pad = 56;
    const maxScroll = Math.max(0, WORLD_WIDTH - this.viewW);
    const scrollX = Phaser.Math.Clamp(cam.scrollX, 0, maxScroll);
    this.bossArena = {
      scrollX,
      minX: scrollX + pad,
      maxX: scrollX + this.viewW - pad,
    };
    this.player.x = Phaser.Math.Clamp(
      this.player.x,
      this.bossArena.minX,
      this.bossArena.maxX,
    );
    boss.x = Phaser.Math.Clamp(boss.x, this.bossArena.minX, this.bossArena.maxX);
    cam.stopFollow();
    this.cameraFollowingPlayer = false;
    this.applyBossArenaCamera();
  }

  private applyBossArenaCamera(): void {
    if (!this.bossArena) return;
    const cam = this.cameras.main;
    cam.setBounds(this.bossArena.scrollX, 0, this.viewW, GAME_HEIGHT);
    cam.setScroll(this.bossArena.scrollX, 0);
  }

  private clearBossArenaLock(): void {
    if (!this.bossArena) return;
    const holdScroll = this.bossArena.scrollX;
    this.bossArena = null;
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_WIDTH, GAME_HEIGHT);
    cam.stopFollow();
    cam.setScroll(holdScroll, 0);
    this.cameraFollowHeld = true;
  }

  /** Resume smooth follow after a boss lock — same scroll, no snap to player centre. */
  private syncCameraFollow(): void {
    if (!this.cameraFollowHeld || this.bossArena || this.postBossPierLock) return;
    if (this.cameraFollowingPlayer) {
      this.cameraFollowHeld = false;
      return;
    }
    const cam = this.cameras.main;
    const holdScroll = cam.scrollX;
    const playerOff = this.player.x - holdScroll - this.viewW / 2;
    cam.startFollow(this.player, true, 0.08, 0);
    cam.setDeadzone(Math.max(120, Math.abs(playerOff) * 2 + 16), 48);
    this.cameraFollowHeld = false;
    this.cameraFollowingPlayer = true;
  }

  /** Level 2 starts on the locked pier screen — unlock when you walk east. */
  private syncPierScreenRelease(): void {
    if (!this.postBossPierLock || !this.bossArena || this.stage !== 2) return;
    if (this.player.x < this.bossArena.maxX - 28) return;
    this.postBossPierLock = false;
    this.clearBossArenaLock();
    this.syncCameraFollow();
  }

  /** True when locking the current camera would already include this world X. */
  private cameraCanLockForBoss(standX: number): boolean {
    const pad = 56;
    const cam = this.cameras.main;
    const right = cam.scrollX + this.viewW - pad;
    return standX <= right;
  }

  /**
   * Place reinforcements outside the camera. Prefer their world patch if it's
   * already off-screen; otherwise slide them to the east (or west for ambush).
   */
  private resolveOffscreenSpawn(
    next: { x: number; y: number; ambush?: "behind" | "side"; boss?: boolean },
    waveIndex: number,
  ): { x: number; y: number } {
    const cam = this.cameras.main;
    const margin = 72;
    const viewLeft = cam.scrollX - margin;
    const viewRight = cam.scrollX + this.viewW + margin;
    const y = Phaser.Math.Clamp(
      next.y + (waveIndex - 0.5) * 28,
      LANE.minY,
      LANE.maxY,
    );

    if (next.ambush === "behind") {
      return {
        x: Phaser.Math.Clamp(viewLeft - 40 - waveIndex * 36, LANE.minX, LANE.maxX),
        y,
      };
    }

    // Ahead of the player — east of the camera (or their patch if already clear)
    let x = next.x;
    if (next.boss) {
      const pad = 56;
      const left = cam.scrollX + pad;
      const right = cam.scrollX + this.viewW - pad;
      let x = next.x;
      if (x < this.player.x + 140) x = this.player.x + 220;
      x = Phaser.Math.Clamp(x, left + 80, right);
      return { x, y };
    }
    if (x > viewLeft && x < viewRight) {
      x = viewRight + 40 + waveIndex * 40;
    }
    // Keep them east of the player so the level still pulls forward
    x = Math.max(x, this.player.x + 200);
    if (x > viewLeft && x < viewRight) {
      x = viewRight + 40 + waveIndex * 40;
    }
    return {
      x: Phaser.Math.Clamp(x, LANE.minX, LANE.maxX),
      y,
    };
  }

  update(time: number, delta: number) {
    const now = time;
    const dt = delta / 1000;

    if (this.handlePauseInput()) {
      this.bubbles.update(now);
      this.updateHud();
      return;
    }

    this.parallax.update(this.cameras.main.scrollX, delta, now);
    if (this.pendingChoppedMush && this.parallax.hovercraftDeparted) {
      this.pendingChoppedMush = false;
      this.unlockAchievement("choppedMush");
    }
    if (this.endingState === "nuke") {
      this.bubbles.update(now);
      this.updateHud();
      for (const f of this.fighters) {
        if (f.active) f.refreshVisuals(now, dt);
      }
      return;
    }
    this.syncBossArenaLock();
    this.updateSkyDrone(now, dt);
    this.gulls.update(now, dt, this.fighters);
    for (const s of this.gulls.takeSquawks(now)) {
      this.spawnFloat(s.x, s.y, Math.random() < 0.5 ? "kaa!" : "mine!");
    }
    for (const cry of this.gulls.takeCries()) {
      void chipSfx.gullCry(cry.loud);
    }
    this.syncAmbientSfx();
    this.wanted.update(dt);
    this.syncChipRockHeat();
    this.syncBackupCalls();
    this.syncEnemyReinforcements();
    this.syncBackgroundThugs(now);
    this.syncPolice();
    this.bubbles.update(now);
    this.updateHud();

    if (this.caseyChat) {
      this.bubbles.update(now);
      this.updateHud();
      this.updateCaseyChat(now);
      return;
    }

    if (this.endingState === "complete" && this.player.inputLocked) {
      for (const f of this.fighters) {
        if (f.active) f.refreshVisuals(now, dt);
      }
      if (
        Phaser.Input.Keyboard.JustDown(this.restartKey) ||
        consumeRestartJust()
      ) {
        this.scene.restart();
      } else if (
        Phaser.Input.Keyboard.JustDown(this.continueKey) ||
        Phaser.Input.Keyboard.JustDown(this.continueAltKey) ||
        consumeConfirmJust()
      ) {
        this.keepWalkingPromenade(!!this.findRecruitedCasey());
      }
      return;
    }

    // Free-play KO: never soft-lock. Haul up if the downed sequence stalled.
    if (
      this.player.structure.isOut() &&
      !this.player.structure.cuffed &&
      !this.playerDowned &&
      this.endingState === "playing"
    ) {
      this.beginPlayerDownedSequence();
      if (!this.playerDowned) {
        // begin was blocked (e.g. defeated flag) — haul immediately
        this.forceSpawnHelperAndRevive(now);
      }
    }

    if (this.playerDowned) {
      // Bill cuffed you while you were on the deck — hand off to the cuff card
      if (this.player.structure.cuffed) {
        this.playerDowned = null;
        this.showDefeat();
        return;
      }
      // Boss can drop while you're on the deck — still free Casey / clear the stage
      this.checkFallenBoss();
      if (this.caseyChat) {
        this.bubbles.update(now);
        this.updateHud();
        this.updateCaseyChat(now);
        return;
      }
      this.updatePlayerDowned(now, dt);
      // Hard timeout — free play must never wait on R
      if (
        this.playerDowned &&
        !this.player.structure.cuffed &&
        now >= this.playerDowned.startedAt + 2500
      ) {
        this.forceSpawnHelperAndRevive(now);
      }
      return;
    }

    if (this.defeated) {
      // Only Bill's cuffs keep the R card; any other defeat state gets hauled up
      if (!this.player.structure.cuffed) {
        this.forcePickupAfterDefeat(now);
      } else if (this.tryCuffBribeInput()) {
        return;
      } else if (
        Phaser.Input.Keyboard.JustDown(this.restartKey) ||
        consumeRestartJust()
      ) {
        this.restartFromCheckpoint();
      }
      return;
    }

    // R only restarts from the cuff card / level-clear screen — not mid scrap
    if (
      this.endingState === "complete" &&
      (Phaser.Input.Keyboard.JustDown(this.restartKey) || consumeRestartJust())
    ) {
      this.scene.restart();
      return;
    }

    const bounds = this.fightLaneBounds();
    if (this.introPhase !== "done") {
      this.updateIntro(now, dt);
    } else {
      this.tryMobilePunchContext();
      this.player.updatePlayer(now, dt, bounds, this.fighters);
      const moan = this.player.takePainMoan();
      if (moan) this.bubbles.say(this.player, moan, 2400);
      if (this.player.action === "body_toss") {
        this.techniquesUsed.add(
          this.player.isGermanSuplex ? "german_suplex" : "body_toss",
        );
      }
      if (this.player.action === "hurricanrana") {
        this.techniquesUsed.add("hurricanrana");
      }
      if (this.player.action === "kickflip") this.unlockAchievement("kickFlip");
      const tossed = this.player.consumeTossLaunch();
      if (tossed) {
        if (this.tryFeedHoverFans(tossed, now, true)) {
          // Chopped — skip the normal toss float
        } else {
          const heavy =
            this.player.isGermanSuplex ||
            this.player.isHurricanrana ||
            this.player.action === "body_toss";
          this.playThrowImpact(this.player, tossed, heavy ? "pileup" : "launch");
          void chipSfx.whoosh(heavy);
          void chipSfx.hit(heavy ? "heavy" : "mid");
          if (this.player.isGermanSuplex) {
            this.spawnFloat(tossed.x, tossed.y - 56, "GERMAN SUPLEX!");
            this.banner.setText("German suplex!");
          } else if (this.player.isHurricanrana) {
            this.spawnFloat(tossed.x, tossed.y - 56, "HURRICANRANA!");
            this.banner.setText("Hurricanrana!");
          } else {
            this.spawnFloat(tossed.x, tossed.y - 56, "POWERBOMB!");
            this.banner.setText("Powerbomb!");
          }
        }
        const smashed = wreckCarUnderThrower(this, this.player, this.destructibles);
        if (smashed) {
          this.onPropHit(this.player, smashed.prop, smashed.result.destroyed, smashed.result.scrap);
        }
      }
      if (this.player.consumeSwantonLand()) {
        this.playThrowImpact(this.player, this.player, "pileup");
        void chipSfx.hit("critical");
        this.spawnFloat(this.player.x, this.player.y - 50, "SWANTON!");
        this.techniquesUsed.add("swanton");
      }
      // Before stealth — a hide bug used to abort the frame and kill the float
      if (this.player.consumeGrabWhiffFx()) {
        this.spawnFloat(this.player.x, this.player.y - 58, "thin air!");
        this.banner.setText("Grabbed at thin air.");
      }
      this.syncPlayerStealth(now, dt);
      this.syncPierScreenRelease();
    }
    this.syncCameraFollow();
    this.syncIdleChatter(now);
    this.syncPlayerWondering(now);
    this.syncEngagementCap();
    for (const f of this.fighters) {
      f.applyTossFlight(now, dt, bounds.minX, bounds.maxX);
      // Player already runs updatePhysics in updatePlayer
      if (f !== this.player && f.airborne && !f.inFanMince) f.updatePhysics(dt, LANE.minY, LANE.maxY);
      // Flying body into the Hovertravel fans
      if (f !== this.player && !f.inFanMince && (f.isBeingTossed || f.isInThrowArc)) {
        this.tryFeedHoverFans(f, now, false);
      }
    }
    // Shared once per frame — avoid rebuilding for every civilian / enemy
    const riderObs: Obstacle[] = [
      ...this.obstacles,
      ...this.destructibles
        .filter((d) => d.isOccluder)
        .map((d) => d.asObstacle())
        .filter((o): o is Obstacle => o !== null),
    ];
    for (const e of this.enemies) {
      e.updateEnemy(now, dt, this.fighters, riderObs);
      if (
        this.bossArena &&
        !e.isBackground &&
        !e.structure.isOut() &&
        !e.isInThrowArc &&
        !e.isBeingTossed
      ) {
        e.x = Phaser.Math.Clamp(e.x, this.bossArena.minX, this.bossArena.maxX);
      }
      const line = e.takeInsult();
      if (line) this.bubbles.say(e, line);
      if (e.takeShadesBreak()) {
        this.spawnFloat(e.x, e.y - 72, "shades smashed!");
        this.banner.setText("You smashed his shades — he's properly mad now.");
      }
      if (e.takeSightingReport()) {
        this.rallyNearbyLads(e, this.player, now);
        if (e.isBackground || e.y < LANE.minY + 20) {
          this.banner.setText("Lad on the common spotted you — he's coming down!");
          this.spawnFloat(e.x, e.y - 60, "incoming!");
        }
      }
    }
    for (const c of this.civilians) {
      // Cyclists also treat cars as solid (climb platforms aren't fighter walls)
      c.updateCivilian(now, dt, this.fighters, riderObs, this.civilians);
      const speech = c.takeSpeech();
      if (speech) {
        this.bubbles.say(c, speech, c.isPartyMember ? 3600 : c.isOnPhone ? 3000 : 2600);
        if (!c.isPartyMember) this.banner.setText("A local piles in with you!");
      }
      const crash = c.takeCrashOutcome();
      if (crash) {
        const label =
          crash === "angry"
            ? "OI!"
            : crash === "knocked"
              ? c.isSkater
                ? "off the board!"
                : "off the bike!"
              : "scarpers";
        this.spawnFloat(c.x, c.y - 70, label);
        if (crash === "angry") this.wanted.bump(0.22);
      }
      const boardDrop = c.takeDroppedBoard();
      if (boardDrop) {
        this.spawnSkateboard(boardDrop.x, boardDrop.y);
        this.spawnFloat(boardDrop.x, boardDrop.y - 40, "board!");
        this.banner.setText("Board's free — E to hop on. Space ollie, Space then K kickflip.");
      }
      if (c.takeFilmPing(now)) {
        this.spawnFloat(
          c.x,
          c.y - 78,
          this.player.skating
            ? Math.random() < 0.5
              ? "filming the tricks"
              : "get that ollie!"
            : Math.random() < 0.5
              ? "filming…"
              : "getting it on video",
        );
      }
    }
    for (const p of this.police) p.updatePolice(now, dt, this.fighters);

    updateCarPlatforms(
      this.fighters.filter((f) => !f.inFanMince),
      this.destructibles,
      now,
    );
    separateFighters(this.fighters.filter((f) => !f.inFanMince));
    // Intro stroll is scripted — don't let a bin shove them back onto the pebbles
    if (this.introPhase === "done") {
      separateFightersFromObstacles(
        this.fighters.filter((f) => !f.inFanMince),
        this.obstacles,
      );
    } else {
      separateFightersFromObstacles(
        this.fighters.filter((f) => f !== this.player && !f.inFanMince),
        this.obstacles,
      );
    }
    for (const f of this.fighters) f.pinToFloor();

    if (this.introPhase === "done" && this.player.wantsPickup()) {
      if (!this.tryWorldInteract()) {
        this.spawnFloat(this.player.x, this.player.y - 50, "nothing to grab");
      }
    }

    if (this.introPhase === "done" && this.player.wantsLoot(now)) {
      const ok = tryLoot(this.player, this.fighters, (ev) => this.onCombat(ev));
      if (!ok) {
        // No body to nick — Q drops board / weapon instead
        if (this.player.skating) {
          const left = this.player.dismountSkateboard(true);
          if (left) {
            this.spawnSkateboard(left.x, left.y);
            this.spawnFloat(this.player.x, this.player.y - 50, "hopped off");
          }
        } else {
          const dropped = this.player.dropWeapon();
          if (dropped) {
            this.spawnPickup(this.player.x + this.player.facing * 28, this.player.y, dropped);
            this.spawnFloat(this.player.x, this.player.y - 50, `dropped ${dropped}`);
          } else {
            this.spawnFloat(this.player.x, this.player.y - 50, "nothing to loot");
          }
        }
      }
    }

    // Mobile: stick-down hops off the board (Duck button removed)
    if (
      this.introPhase === "done" &&
      isMobilePlay() &&
      this.player.skating &&
      (consumeCoverJust() || this.player.stickDownJust)
    ) {
      const left = this.player.dismountSkateboard(true);
      if (left) {
        this.spawnSkateboard(left.x, left.y);
        this.spawnFloat(this.player.x, this.player.y - 50, "hopped off");
      }
    }

    for (const f of this.fighters) {
      const boardDrop = f.takeBoardDrop();
      if (boardDrop) {
        if (boardDrop.broken) {
          this.snapSkateboard(boardDrop.x, boardDrop.y);
          this.spawnFloat(boardDrop.x, boardDrop.y - 40, "board snapped!");
          void chipSfx.boardSnap();
        } else {
          this.spawnSkateboard(boardDrop.x, boardDrop.y);
          this.spawnFloat(boardDrop.x, boardDrop.y - 40, "board!");
        }
      }
    }

    this.updateThrows(now, dt);
    this.maybeEnemyWeaponGrabs();
    this.updateBuzzballs(now);

    const lootTarget = nearestLootable(this.player, this.fighters);
    const nearWep = this.nearestPickup();
    const nearBuzz = this.nearestBuzzball();
    const nearBoard = this.nearestSkateboard();
    const nearShop = this.nearestWeaponShop();
    const shopHint = nearShop ? this.weaponShopHint(nearShop) : null;
    const nearStall = this.nearestStall();
    const stallHint = nearStall ? this.stallHint(nearStall) : null;
    const bribeHint = this.policeBribeHint();
    this.lootHintAction = null;
    if (this.introPhase !== "done") {
      this.lootHint.setVisible(false).disableInteractive();
    } else if (this.player.hiding) {
      this.showLootHint(`ducked behind the ${this.player.coverHint}`, null);
    } else if (bribeHint) {
      this.showLootHint(bribeHint, "bribe");
    } else if (nearBuzz) {
      this.showLootHint(`${this.actKey()} — Buzzball!`, "buzz");
    } else if (shopHint && !lootTarget && !nearWep && !nearBoard) {
      this.showLootHint(shopHint, "shop");
    } else if (stallHint && !lootTarget && !nearWep && !nearBoard) {
      this.showLootHint(stallHint, "stall");
    } else if (lootTarget) {
      this.showLootHint(`${this.actKey()} — loot`, "loot");
    } else if (nearBoard && !this.player.skating) {
      this.showLootHint(`${this.actKey()} — hop on the board`, "board");
    } else if (nearWep) {
      this.showLootHint(`${this.actKey()} — grab ${nearWep.kind}`, "wep");
    } else if (this.player.skating) {
      this.showLootHint(
        isMobilePlay()
          ? "Jump ollie · Down+move manual · Jump+Kick kickflip · Duck hop off"
          : "Space ollie · Down+move manual · Space+K kickflip · Q hop off",
        null,
      );
    } else {
      const nearCover = this.nearestCover(90);
      if (nearCover) {
        this.showLootHint(`C — duck behind the ${nearCover.label}`, null);
        nearCover.drawHideMark(0.9);
      } else {
        this.lootHint.setVisible(false).disableInteractive();
      }
    }

    for (const d of this.destructibles) d.update(now);

    resolveCombat(
      now,
      this.fighters.filter((f) => !f.inFanMince),
      (ev) => this.onCombat(ev),
    );
    this.resolveDogKicks(now);
    resolvePropHits(
      this,
      now,
      this.fighters.filter((f) => !f.inFanMince),
      this.destructibles,
      (ev) => {
        this.onPropHit(ev.attacker, ev.prop, ev.result.destroyed, ev.result.scrap);
      },
    );
    for (const f of this.fighters) f.pinToFloor();
    syncCarOcclusion(
      this.fighters.filter((f) => !f.inFanMince),
      this.destructibles,
      this.parallax.getPassingCarImages(),
    );

    if (this.player.structure.isOut()) {
      if (this.player.structure.cuffed) this.showDefeat();
      else this.beginPlayerDownedSequence();
      return;
    }

    this.checkFallenBoss();
    this.tryMentalMushUnlock();
    if (this.endingState !== "playing") {
      this.updateCaptiveEnding();
    } else if (
      this.introPhase === "done" &&
      this.endingState === "playing" &&
      this.pendingEnemies.some((p) => p.boss) &&
      // Empty list is vacuously "every out" — only announce after real thugs were spawned
      this.enemies.some((e) => !e.isBackground) &&
      this.enemies.every((e) => e.structure.isOut() || e.isBackground)
    ) {
      this.banner.setText(
        this.stage === 1
          ? "Beach thugs sorted. The Hardman is still ahead."
          : "Wall's clear — Clarence Pier is still ahead.",
      );
    }
  }

  /** Free Casey / clear L2 when a boss hits the deck (even mid-downed sequence). */
  private checkFallenBoss(): void {
    if (this.endingState !== "playing") return;
    const fallenBoss = this.enemies.find(
      (e) => e.isBoss && e.structure.isOut() && !this.handledBosses.has(e),
    );
    if (!fallenBoss) return;
    this.handledBosses.add(fallenBoss);
    if (this.stage === 1) this.beginCaptiveAssessment(fallenBoss);
    else this.beginLevelTwoComplete(fallenBoss);
  }

  private beginCaptiveAssessment(boss: Enemy): void {
    // Don't miss the chat because you were on the deck when he dropped
    if (this.playerDowned) {
      this.player.reviveFromHelp(this.time.now, 0.55);
      this.playerDowned = null;
      this.lastPlayerDefeat = null;
    }
    this.defeated = false;
    this.clearRestartPrompt();

    this.endingState = "assessment";
    this.postBossPierLock = true;
    this.pendingEnemies.length = 0;
    this.activeCaller = null;
    this.spawnFloat(boss.x, boss.y - 90, "BOSS DOWN");
    this.banner.setText("The Hardman drops. Someone's tied up by the pier office…");

    const arena = this.bossArena;
    const minX = arena?.minX ?? LANE.minX;
    const maxX = arena?.maxX ?? LANE.maxX;
    let x = boss.x + 90;
    if (x > maxX - 24) x = boss.x - 90;
    x = Phaser.Math.Clamp(x, minX, maxX);
    const captive = new Civilian(this, x, GAME_HEIGHT * 0.68, "Casey", "walker", undefined, {
      toughness: 2.2,
      present: "fem",
      lookId: "look_c18",
    });
    this.captive = captive;
    this.civilians.push(captive);
    this.rebuildFighterList();
    this.spawnFloat(x, captive.y - 68, "freed!");

    const report = this.buildLevelOneReport();
    this.registry.set("partyMembers", []);
    this.registry.set("levelOneReport", {
      honour: report.honour,
      seconds: report.seconds,
      hitsTaken: this.hitsTaken,
      techniques: [...this.techniquesUsed],
    });

    const joinLine =
      report.honour >= 60
        ? report.missing.length >= 3
          ? `You freed me. I'll show you ${report.missing
              .slice(0, 2)
              .map((key) => LEVEL_ONE_TECHNIQUES[key])
              .join(" and ")} on these last mugs.`
          : "You've got the tricks already. We should join up — these thugs won't stand a chance."
        : "I saw what you did out there. You're no better than the thugs that hunt you.";

    this.caseyChat = {
      kind: "l1",
      speaker: captive,
      report,
      index: 0,
      lines: [
        {
          text: "Thanks. Thought I was stuck in there all night.",
          banner: "Casey is free — hear them out.",
        },
        {
          text: report.performanceLine,
          banner: `Casey's assessment: ${report.performanceLine}`,
        },
        {
          text: report.techniqueLine,
          banner: report.summary,
        },
        {
          text: joinLine,
          banner:
            report.honour >= 60
              ? "Casey wants to join you."
              : `Honour ${report.honour}/100 — Casey is turning on you.`,
        },
      ],
    };
    this.showCaseyChatLine();
  }

  private showCaseyChatLine(): void {
    const chat = this.caseyChat;
    if (!chat) return;
    const line = chat.lines[chat.index];
    if (!line) {
      this.finishCaseyChat();
      return;
    }
    this.bubbles.clearOwner(chat.speaker);
    this.bubbles.clearOwner(this.player);
    const who = line.who === "player" ? this.player : chat.speaker;
    this.bubbles.saySticky(who, line.text);
    if (line.banner) this.banner.setText(line.banner);
    this.continueHint?.destroy();
    this.continueHint = makeContinueButton(this, {
      label: "Continue",
      onPress: () => this.advanceCaseyChat(),
      depth: 320,
    });
    this.pinHud(this.continueHint.root, this.viewW / 2, GAME_HEIGHT - 52);
  }

  private advanceCaseyChat(): void {
    if (!this.caseyChat) return;
    this.caseyChat.index += 1;
    if (this.caseyChat.index >= this.caseyChat.lines.length) {
      this.finishCaseyChat();
    } else {
      this.showCaseyChatLine();
    }
  }

  private updateCaseyChat(_now: number): void {
    if (!this.caseyChat) return;
    const pressed =
      Phaser.Input.Keyboard.JustDown(this.continueKey) ||
      Phaser.Input.Keyboard.JustDown(this.continueAltKey) ||
      consumeConfirmJust();
    if (!pressed) return;
    this.advanceCaseyChat();
  }

  private finishCaseyChat(): void {
    const chat = this.caseyChat;
    if (!chat) return;
    this.bubbles.clearOwner(chat.speaker);
    this.bubbles.clearOwner(this.player);
    this.continueHint?.destroy();
    this.continueHint = undefined;
    this.caseyChat = null;
    if (chat.kind === "l2good") {
      this.finishCaseyGoodEnding();
      return;
    }
    const report = chat.report;
    if (!report) return;
    if (report.honour >= 60) this.recruitCaptive(chat.speaker, report);
    else this.turnCaptiveAgainstPlayer(chat.speaker, report);
  }

  private buildLevelOneReport(): {
    honour: number;
    seconds: number;
    missing: string[];
    performanceLine: string;
    techniqueLine: string;
    summary: string;
  } {
    const seconds = Math.max(1, Math.round((this.time.now - this.levelStartedAt) / 1000));
    const honour = this.currentHonour();
    const missing = Object.keys(LEVEL_ONE_TECHNIQUES).filter(
      (key) => !this.techniquesUsed.has(key),
    );
    const used = Object.keys(LEVEL_ONE_TECHNIQUES).length - missing.length;

    let performanceLine: string;
    if (this.hitsTaken <= 3 && seconds <= 210) {
      performanceLine = `Quick too — ${seconds} seconds, and they barely touched you.`;
    } else if (this.hitsTaken >= 12) {
      performanceLine = `You got there in ${seconds} seconds, but you took a proper hiding.`;
    } else if (seconds > 420) {
      performanceLine = `You got me out, but ${seconds} seconds? We need to sharpen you up.`;
    } else {
      performanceLine = `${seconds} seconds, ${this.hitsTaken} clean hits taken. Not bad.`;
    }

    const usedLine =
      used >= 10
        ? `You used nearly everything in the book (${used}/${Object.keys(LEVEL_ONE_TECHNIQUES).length}).`
        : `I counted ${used} different tricks — you've still got more in you.`;
    return {
      honour,
      seconds,
      missing,
      performanceLine,
      techniqueLine: usedLine,
      summary: `${usedLine} Honour ${honour}/100.`,
    };
  }

  private recruitCaptive(
    captive: Civilian,
    report: { honour: number; seconds: number; missing: string[] },
  ): void {
    this.registry.set("partyMembers", ["Casey"]);
    // Moves she promised in the chat (first two missing tricks)
    const teach = report.missing.length >= 3 ? report.missing.slice(0, 2) : [];
    this.registry.set("caseyTeach", teach);

    let living = this.enemies.filter(
      (e) => !e.isBoss && !e.structure.isOut() && !e.isBackground,
    );
    if (teach.length > 0 && living.length < 2) {
      for (let i = living.length; i < 2; i++) {
        const minX = this.bossArena?.minX ?? LANE.minX;
        const maxX = this.bossArena?.maxX ?? LANE.maxX;
        const straggler = new Enemy(
          this,
          Phaser.Math.Clamp(this.player.x + 160 + i * 70, minX, maxX),
          GAME_HEIGHT * (0.66 + i * 0.05),
          i === 0 ? "Last Lout" : "Pier Straggler",
          { toughness: 0.80, mad: true, role: "thug" },
        );
        straggler.onProvoked(this.time.now, this.player);
        this.enemies.push(straggler);
        this.captiveStragglers.push(straggler);
      }
      living = this.captiveStragglers;
      this.rebuildFighterList();
    }

    const foe = living[0] ?? null;
    if (teach.length > 0) {
      const names = teach
        .map((key) => LEVEL_ONE_TECHNIQUES[key] ?? key)
        .join(" and ");
      this.banner.setText(`CASEY JOINED — she'll show you ${names}.`);
    } else {
      this.banner.setText("CASEY JOINED YOUR PARTY");
    }
    captive.joinPlayer(this.time.now, foe, { teach });
    this.endingState = "companion";
    if (!foe) this.endingResolveAt = this.time.now + 2200;
  }

  private turnCaptiveAgainstPlayer(
    captive: Civilian,
    report: { honour: number; seconds: number; missing: string[] },
  ): void {
    const x = captive.x;
    const y = captive.y;
    this.banner.setText(`Honour ${report.honour}/100 — Casey refuses to join you.`);

    this.bubbles.clearOwner(captive);
    captive.destroy(true);
    this.civilians = this.civilians.filter((c) => c !== captive);
    const challenger = new Enemy(this, x, y, "Casey", {
      toughness: 1.48,
      mad: false,
      role: "thug",
      lookId: captive.spritePrefix,
    });
    challenger.onProvoked(this.time.now, this.player);
    this.captive = challenger;
    this.enemies.push(challenger);
    this.rebuildFighterList();
    this.bubbles.say(challenger, "If you want past me mush, earn it.", 2600);
    this.endingState = "duel";
  }

  private updateCaptiveEnding(): void {
    if (this.endingState === "companion") {
      const foes = this.enemies.filter(
        (e) => !e.isBoss && !e.isBackground && !e.structure.isOut(),
      );
      if (foes.length === 0 && this.time.now >= this.endingResolveAt) {
        this.beginLevelTwo(true);
      }
    } else if (
      this.endingState === "duel" &&
      this.captive instanceof Enemy &&
      this.captive.structure.isOut()
    ) {
      this.registry.set("partyMembers", []);
      this.beginLevelTwo(false);
    }
  }

  /** Keep going from the pier — beach, sea wall, then Clarence Pier funfair. */
  private beginLevelTwo(withCasey: boolean): void {
    this.endingState = "playing";
    this.endingResolveAt = 0;
    this.stage = 2;
    this.bossAnnounced = false;
    this.droneAssistAnnounced = false;
    this.callArmedUnlock = null;
    this.activeCaller = null;
    this.captiveStragglers = [];
    this.handledBosses.clear();
    this.clearRestartPrompt();

    // Fresh stretch — L1 bodies / chasing stragglers must not gate Clarence Pier
    for (const e of this.enemies) {
      if (this.countsForMassacre(e) && !e.structure.isOut()) this.massacreEscaped = true;
      e.destroy(true);
    }
    this.enemies = [];

    this.pendingEnemies.splice(
      0,
      this.pendingEnemies.length,
      {
        x: 7900,
        y: GAME_HEIGHT * 0.7,
        name: "Pier End Boy",
        toughness: 0.94,
        unlockX: 7550,
        role: "thug",
      },
      {
        x: 8300,
        y: GAME_HEIGHT * 0.68,
        name: "Shingle Mate",
        toughness: 0.96,
        unlockX: 8000,
        role: "scout",
      },
      {
        x: 8900,
        y: GAME_HEIGHT * 0.7,
        name: "Wall Dog",
        toughness: 1.04,
        unlockX: 8600,
        needsCall: true,
        role: "sergeant",
      },
      {
        x: 9500,
        y: GAME_HEIGHT * 0.68,
        name: "Rip-Rap",
        toughness: 1.08,
        unlockX: 9200,
        mad: true,
        needsCall: true,
        role: "thug",
      },
      {
        x: 10200,
        y: GAME_HEIGHT * 0.7,
        name: "Hover Pad Boy",
        toughness: 1.14,
        unlockX: 9900,
        role: "scout",
      },
      {
        x: 11800,
        y: GAME_HEIGHT * 0.68,
        name: "Fair Mile",
        toughness: 1.18,
        unlockX: 11450,
        mad: true,
        role: "thug",
      },
      {
        x: 13000,
        y: GAME_HEIGHT * 0.7,
        name: "Funfair Scout",
        toughness: 1.2,
        unlockX: 12600,
        role: "scout",
      },
      {
        // On the funfair landmark — far end of the strip
        x: 14000,
        y: GAME_HEIGHT * 0.7,
        name: "Clarence King",
        toughness: 3.65,
        unlockX: 13650,
        boss: true,
        role: "sergeant",
      },
    );

    // Folk along the Level 2 stretch — beach, sea wall, funfair
    const px = this.player.x;
    const extras: Civilian[] = [
      new Civilian(this, 7700, GAME_HEIGHT * 0.68, "Pier End Mum", "walker", 1, {
        present: "fem",
        lookId: "look_c14",
      }),
      new Civilian(this, 8100, GAME_HEIGHT * 0.66, "Beach Dad", "walker", 1, {
        present: "masc",
      }),
      new Civilian(this, 8450, GAME_HEIGHT * 0.72, "Shingle Jogger", "jogger", 1, {
        present: "masc",
      }),
      new Civilian(this, 8800, GAME_HEIGHT * 0.7, "Sea Wall Dog", "dog_walker", -1, {
        present: "masc",
        lookId: "look_c06",
      }),
      new Civilian(this, 9150, GAME_HEIGHT * 0.64, "Rip-Rap Walker", "walker", 1, {
        present: "fem",
        lookId: "look_c11",
        nosy: true,
      }),
      new Civilian(this, 9400, GAME_HEIGHT * 0.7, "Wall Walker", "jogger", -1, {
        present: "fem",
        lookId: "look_c18",
      }),
      // Skaters near the L2 start so you meet them (and can knock one for a board)
      new Civilian(this, px + 380, GAME_HEIGHT * 0.7, "Deck Dave", "skater", -1, {
        present: "masc",
        lookId: "look_c10",
      }),
      new Civilian(this, px + 720, GAME_HEIGHT * 0.68, "Board Bella", "skater", 1, {
        present: "fem",
        lookId: "look_c18",
      }),
      new Civilian(this, 9800, GAME_HEIGHT * 0.68, "Defence Cyclist", "bike", 1, {
        present: "masc",
      }),
      new Civilian(this, px + 1100, GAME_HEIGHT * 0.68, "Ollie Ollie", "skater", -1, {
        present: "masc",
        lookId: "look_c06",
      }),
      new Civilian(this, 10800, GAME_HEIGHT * 0.66, "Rip-Rap Skater", "skater", 1, {
        present: "masc",
        lookId: "look_c10",
      }),
      new Civilian(this, 10380, GAME_HEIGHT * 0.66, "Phone Filmer", "walker", -1, {
        present: "fem",
        lookId: "look_c14",
        nosy: true,
      }),
      new Civilian(this, 10800, GAME_HEIGHT * 0.66, "Hover Queue", "walker", -1, {
        present: "fem",
        lookId: "look_c01",
      }),
      new Civilian(this, 11350, GAME_HEIGHT * 0.72, "Scooter Kid", "scooter", 1, {
        present: "masc",
      }),
      new Civilian(this, 12200, GAME_HEIGHT * 0.68, "Mile Walker", "jogger", 1, {
        present: "masc",
        lookId: "look_c06",
      }),
      new Civilian(this, 13200, GAME_HEIGHT * 0.7, "Candy Floss", "walker", undefined, {
        present: "fem",
        lookId: "look_c08",
        nosy: true,
      }),
      new Civilian(this, 13850, GAME_HEIGHT * 0.68, "Arcade Nan", "walker", -1, {
        present: "fem",
        lookId: "look_c13",
      }),
    ];
    const l2Dave = new Civilian(this, 8600, GAME_HEIGHT * 0.69, "Greg", "walker", 1, {
      nosy: false,
      present: "masc",
      lookId: "look_c10",
    });
    const l2Sue = new Civilian(this, 8632, GAME_HEIGHT * 0.675, "Sue", "walker", 1, {
      nosy: false,
      present: "fem",
      lookId: "look_c16",
    });
    Civilian.linkCouple(l2Dave, l2Sue);
    extras.push(l2Dave, l2Sue);
    this.civilians.push(...extras);

    // Spare boards on the L2 stretch if you don't knock a skater
    this.spawnSkateboard(px + 520, GAME_HEIGHT * 0.72);
    this.spawnSkateboard(9200, GAME_HEIGHT * 0.71);
    this.spawnSkateboard(11200, GAME_HEIGHT * 0.7);

    if (withCasey && this.captive instanceof Civilian) {
      this.banner.setText(
        "LEVEL 2 — with Casey. Sea wall ahead — knock a skater for a board.",
      );
      this.bubbles.say(
        this.captive,
        "Come on mush — Clarence Pier's that way. Funfair dinlos next.",
        3200,
      );
    } else {
      this.captive = null;
      this.banner.setText(
        "LEVEL 2 — sea wall ahead. Knock a skater for a board.",
      );
    }
    this.spawnFloat(this.player.x, this.player.y - 80, "LEVEL 2");
    this.rebuildFighterList();
    // Cuff restart lands here — same beat as after freeing Casey
    this.runCheckpoint = {
      stage: 2,
      x: Phaser.Math.Clamp(this.player.x, 7300, 7800),
      y: Phaser.Math.Clamp(this.player.y, LANE.minY, LANE.maxY),
      withCasey,
      label: withCasey ? "past the pier (with Casey)" : "past the pier",
    };
  }

  private beginLevelTwoComplete(boss: Enemy): void {
    this.pendingEnemies.length = 0;
    this.spawnFloat(boss.x, boss.y - 90, "BOSS DOWN");
    this.levelTwoCleared = true;
    this.registry.set("levelTwoCleared", true);
    if (this.tryMentalMushUnlock()) return;
    const casey = this.findRecruitedCasey();
    if (casey) {
      this.beginCaseyGoodEnding(casey);
      return;
    }
    this.showLevelTwoCompleteScreen(false);
  }

  /** Casey joined at the pier and is still on the run — not minced, not a duel. */
  private findRecruitedCasey(): Civilian | null {
    const fromList = this.civilians.find(
      (c) =>
        c.active &&
        !c.inFanMince &&
        c.displayName === "Casey" &&
        c.isRecruited,
    );
    if (fromList) return fromList;
    if (
      this.captive instanceof Civilian &&
      this.captive.active &&
      !this.captive.inFanMince &&
      this.captive.isRecruited
    ) {
      return this.captive;
    }
    return null;
  }

  /** Honour-path close: Casey stuck with you through Clarence. */
  private beginCaseyGoodEnding(casey: Civilian): void {
    const now = this.time.now;
    if (this.playerDowned) {
      this.player.reviveFromHelp(now, 0.55);
      this.playerDowned = null;
      this.lastPlayerDefeat = null;
    }
    this.defeated = false;
    this.player.inputLocked = true;
    this.lootHint.setVisible(false);
    this.hint.setVisible(false);
    this.clearRestartPrompt();

    if (casey.structure.isOut() || casey.structure.downed) {
      casey.reviveFromHelp(now, 0.7);
    }
    casey.clearPlantLock();
    casey.airborne = false;
    casey.jumpVy = 0;
    casey.action = "idle";
    const standX = this.player.x + (casey.x >= this.player.x ? 44 : -44);
    const lane = this.fightLaneBounds();
    casey.x = Phaser.Math.Clamp(standX, lane.minX, lane.maxX);
    casey.y = this.player.y;
    casey.groundY = casey.y;
    casey.setFacing(this.player.x >= casey.x ? 1 : -1, now);
    this.player.setFacing(casey.x >= this.player.x ? 1 : -1, now);

    this.endingState = "epilogue";
    this.registry.set("levelTwoCleared", true);
    this.registry.set("levelTwoGoodEnding", true);
    this.captive = casey;
    this.spawnFloat(casey.x, casey.y - 78, "MATES!");
    this.showGoodEndingToast();
    void chipSfx.pickup();
    void chipSfx.ui();

    const honour = this.currentHonour();
    const stayLine =
      honour >= 70
        ? "You were decent to folk on the way. That's why I stayed."
        : "You're still a menace mush. But you're my menace.";

    this.caseyChat = {
      kind: "l2good",
      speaker: casey,
      index: 0,
      lines: [
        {
          text: "That's Clarence done. Funfair dinlos didn't last.",
          banner: "GOOD ENDING — Casey stuck with you.",
        },
        {
          text: stayLine,
          banner: `Casey stuck with you. Honour ${honour}/100.`,
        },
        {
          text: "Old Portsmouth next — Gunwharf, the Camber, the lot.",
          banner: "The seafront's ours. Old Portsmouth is waiting.",
        },
        {
          who: "player",
          text: "Together then.",
          banner: "Casey isn't going anywhere.",
        },
        {
          text: "Wouldn't miss it. Come on — before Bill's van turns up.",
          banner: "A good night on the front.",
        },
      ],
    };
    this.showCaseyChatLine();
  }

  private showGoodEndingToast(): void {
    this.nukeHud?.destroy(true);
    const card = this.add
      .text(0, 0, "GOOD ENDING\nCasey stuck with you", {
        fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
        fontSize: "22px",
        color: "#1a1410",
        backgroundColor: "#b8f0a8",
        padding: { x: 18, y: 12 },
        align: "center",
      })
      .setOrigin(0.5);
    const root = this.add.container(0, 0, [card]).setDepth(360);
    this.pinHud(root, this.viewW / 2, GAME_HEIGHT * 0.22);
    this.nukeHud = root;
    this.tweens.add({
      targets: root,
      y: root.y - 8,
      duration: 400,
      yoyo: true,
      ease: "Sine.easeOut",
    });
    this.time.delayedCall(2800, () => {
      if (this.nukeHud === root) {
        root.destroy(true);
        this.nukeHud = undefined;
      }
    });
  }

  private finishCaseyGoodEnding(): void {
    this.nukeHud?.destroy(true);
    this.nukeHud = undefined;
    this.showLevelTwoCompleteScreen(true);
  }

  /** Clarence is down — card, then stroll or replay. */
  private showLevelTwoCompleteScreen(withCasey: boolean): void {
    consumeConfirmJust();
    this.endingState = "complete";
    this.player.inputLocked = true;
    this.defeated = false;
    this.lootHint.setVisible(false);
    this.clearRestartPrompt();
    this.levelTwoCleared = true;
    this.registry.set("levelTwoCleared", true);
    this.updateHud();
    this.hint
      .setText(
        isMobilePlay()
          ? "Keep walking the promenade — or Replay"
          : "E keep walking · R replay from start",
      )
      .setVisible(true);
    this.banner.setText(
      withCasey ? "COMPLETE — Casey stuck with you." : "COMPLETE — Clarence Pier is yours.",
    );
    showHtmlPrompt({
      title: "COMPLETE",
      body: withCasey
        ? "Clarence Pier is yours.\nCasey stuck with you.\nThe promenade's still open."
        : "Clarence Pier is yours.\nThe promenade's still open if you fancy a stroll.",
      buttonLabel: "Keep walking the promenade",
      onPress: () => this.keepWalkingPromenade(withCasey),
      altLabel: "Replay from start",
      onAltPress: () => this.scene.restart(),
    });
  }

  private keepWalkingPromenade(withCasey: boolean): void {
    this.clearRestartPrompt();
    this.hint.setVisible(false);
    this.resumeSeafrontHunt(withCasey);
  }

  /** Clarence is down — keep the front open so you can hunt the rest. */
  private resumeSeafrontHunt(withCasey: boolean): void {
    this.endingState = "playing";
    this.endingResolveAt = 0;
    this.player.inputLocked = false;
    this.defeated = false;
    this.postBossPierLock = false;
    this.clearBossArenaLock();
    this.syncCameraFollow();
    this.clearRestartPrompt();
    this.levelTwoCleared = true;
    this.registry.set("levelTwoCleared", true);
    this.skyDrone.enableHuntPasses(this.time.now);
    this.updateHud();
    this.banner.setText(
      withCasey
        ? "The front's ours. Hunt the rest — Casey'll tag along."
        : "Clarence is down. The front's yours — hunt the rest.",
    );
    this.spawnFloat(this.player.x, this.player.y - 80, "KEEP GOING");
  }

  private unlockAchievement(id: AchievementId, opts?: { silent?: boolean }): void {
    if (this.unlockedAchievements.has(id)) return;
    this.unlockedAchievements.add(id);
    if (opts?.silent) {
      this.updateHud();
      return;
    }
    const name = ACHIEVEMENTS.find((a) => a.id === id)?.name ?? id;
    this.banner.setText(`SECRET UNLOCKED — ${name}`);
    this.showAchievementToast(name);
    void chipSfx.pickup();
    void chipSfx.ui();
    this.updateHud();
  }

  private showAchievementToast(name: string): void {
    this.achievementToast?.destroy(true);
    const card = this.add
      .text(0, 0, `SECRET UNLOCKED\n${name}`, {
        fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
        fontSize: "22px",
        color: "#1a1410",
        backgroundColor: "#ffe08a",
        padding: { x: 18, y: 12 },
        align: "center",
      })
      .setOrigin(0.5);
    const root = this.add.container(0, 0, [card]).setDepth(360);
    this.pinHud(root, this.viewW / 2, GAME_HEIGHT * 0.26);
    this.achievementToast = root;
    this.tweens.add({
      targets: root,
      y: root.y - 8,
      duration: 400,
      yoyo: true,
      ease: "Sine.easeOut",
    });
    this.time.delayedCall(2600, () => {
      if (this.achievementToast === root) {
        root.destroy(true);
        this.achievementToast = undefined;
      }
    });
  }

  private achievementsHudText(): string {
    if (!this.levelTwoCleared) return "";
    const n = this.unlockedAchievements.size;
    const lines = ACHIEVEMENTS.map((a) => {
      const got = this.unlockedAchievements.has(a.id);
      return `${got ? "★" : "·"} ${a.name}`;
    });
    return `\n\nSECRETS ${n}/5\n${lines.join("\n")}`;
  }

  /** Named seafront folk + scripted lads. Not Bill, not common loiterers, not Casey-the-mate. */
  private countsForMassacre(f: Fighter): boolean {
    if (f === this.player) return false;
    if (f.team === "police") return false;
    if (f instanceof Enemy && f.isBackground) return false;
    if (f instanceof Civilian) {
      if (f.displayName === "Passer-by") return false;
      if (f.isAlly || f.isPartyMember) return false;
    }
    return true;
  }

  /** Everyone who showed up on both stretches is out. */
  private isSeafrontMassacre(): boolean {
    if (this.massacreEscaped) return false;
    if (this.stage !== 2) return false;
    let n = 0;
    for (const f of this.fighters) {
      if (!f.active) continue;
      if (!this.countsForMassacre(f)) continue;
      n += 1;
      if (!f.structure.isOut()) return false;
    }
    return n >= 20;
  }

  /** Fire the glory beat once Clarence is down and the whole front is out. */
  private tryMentalMushUnlock(): boolean {
    if (this.endingState === "nuke") return false;
    if (this.endingState === "epilogue") return false;
    if (this.stage !== 2) return false;
    const kingDown =
      this.levelTwoCleared ||
      this.endingState === "complete" ||
      this.enemies.some((e) => e.isBoss && e.structure.isOut());
    if (!kingDown) return false;
    if (!this.isSeafrontMassacre()) return false;
    this.clearRestartPrompt();
    this.beginMentalMushEnding();
    return true;
  }

  /** Glory beat, then Portsmouth Council flatten the front. */
  private beginMentalMushEnding(): void {
    this.endingState = "nuke";
    this.endingResolveAt = 0;
    if (this.playerDowned) {
      this.player.reviveFromHelp(this.time.now, 0.55);
      this.playerDowned = null;
      this.lastPlayerDefeat = null;
    }
    this.defeated = false;
    this.player.inputLocked = true;
    this.lootHint.setVisible(false);
    this.hint.setVisible(false);
    this.registry.set("levelTwoCleared", true);
    this.levelTwoCleared = true;
    this.registry.set("achievementMentalMush", true);
    this.unlockAchievement("bigBang");
    this.time.delayedCall(2800, () => this.beginCouncilCountdown());
  }

  private beginCouncilCountdown(): void {
    if (this.endingState !== "nuke") return;
    this.nukeHud?.destroy(true);
    this.achievementToast?.destroy(true);
    this.achievementToast = undefined;
    this.banner.setText("Portsmouth City Council — nuclear strike authorised.");
    void chipSfx.siren();
    chipRock.setHeat(0);

    const panel = this.add
      .rectangle(0, 8, 520, 210, 0x1a1410, 0.88)
      .setOrigin(0.5);
    const title = this.add
      .text(0, -52, "PORTSMOUTH CITY COUNCIL", {
        fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
        fontSize: "16px",
        color: "#ffe08a",
        align: "center",
      })
      .setOrigin(0.5);
    const notice = this.add
      .text(0, -18, "Unauthorised massacre on the seafront.\nRemain indoors. There are no indoors.", {
        fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
        fontSize: "15px",
        color: "#f2e6d8",
        align: "center",
      })
      .setOrigin(0.5);
    const count = this.add
      .text(0, 48, "5", {
        fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
        fontSize: "72px",
        color: "#ff4a2a",
        align: "center",
      })
      .setOrigin(0.5);
    const root = this.add.container(0, 0, [panel, title, notice, count]).setDepth(370);
    this.pinHud(root, this.viewW / 2, GAME_HEIGHT * 0.42);
    this.nukeHud = root;

    let left = 5;
    const tick = () => {
      if (this.endingState !== "nuke") return;
      void chipSfx.nukeTick();
      void chipSfx.siren();
      count.setText(String(left));
      this.cameras.main.shake(80, 0.004 + (6 - left) * 0.002);
      left -= 1;
      if (left >= 0) {
        this.time.delayedCall(1000, tick);
      } else {
        count.setText("0");
        this.time.delayedCall(180, () => this.detonateCouncilNuke());
      }
    };
    tick();
  }

  private detonateCouncilNuke(): void {
    if (this.endingState !== "nuke") return;
    this.nukeHud?.destroy(true);
    this.nukeHud = undefined;
    void chipSfx.nukeBlast();
    void chipSfx.crash();
    void chipSfx.ko();
    chipRock.setHeat(0);

    const cam = this.cameras.main;
    const cx = cam.scrollX + this.viewW * 0.5;
    const cy = GAME_HEIGHT * 0.5;
    cam.shake(720, 0.045);
    cam.flash(220, 255, 244, 200);

    const flash = this.add
      .rectangle(0, 0, this.viewW + 120, GAME_HEIGHT + 120, 0xfff4c8, 1)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(420);
    this.pinHud(flash, this.viewW / 2, GAME_HEIGHT / 2);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 900,
      ease: "Cubic.easeOut",
      onComplete: () => flash.destroy(),
    });

    this.spawnDroneExplosion(cx, cy);
    this.spawnDroneExplosion(cx - 160, cy + 40);
    this.spawnDroneExplosion(cx + 180, cy - 20);
    this.spawnNukeAsh(cx, cy);

    this.parallax.scorch();
    this.skyDrone.destroy();
    this.gulls.scatter();

    const now = this.time.now;
    this.bubbles.clearOwner(this.player);
    for (const f of this.fighters) {
      if (!f.active) continue;
      f.charred = true;
      f.tossVx = 0;
      f.tossUntil = 0;
      f.airborne = false;
      f.jumpVy = 0;
      f.clearCarMount();
      f.y = f.laneY;
      f.groundY = f.laneY;
      if (!f.structure.isOut()) {
        f.structure.knockOutCold();
        f.setAction("out_cold", now, 999999);
        f.markPlantHere();
      }
      f.refreshVisuals(now, 0);
    }

    this.spawnFloat(this.player.x, this.player.y - 70, "flat!");
    this.banner.setText("The Council flattened the front — you included.");
    this.time.delayedCall(2200, () => this.finishMentalMushCard());
  }

  private spawnNukeAsh(x: number, y: number): void {
    for (let i = 0; i < 28; i++) {
      const flake = this.add.rectangle(
        x + (Math.random() - 0.5) * this.viewW,
        y + (Math.random() - 0.5) * 80,
        3 + Math.random() * 5,
        2 + Math.random() * 4,
        Math.random() < 0.4 ? 0x2a2620 : 0x6a5a48,
      );
      flake.setDepth(188).setAlpha(0.9);
      this.tweens.add({
        targets: flake,
        y: flake.y + 40 + Math.random() * 90,
        x: flake.x + (Math.random() - 0.5) * 80,
        alpha: 0,
        duration: 900 + Math.random() * 700,
        ease: "Sine.easeIn",
        onComplete: () => flake.destroy(),
      });
    }
  }

  private finishMentalMushCard(): void {
    this.endingState = "complete";
    this.clearRestartPrompt();
    const allDone = this.unlockedAchievements.size >= 5;
    showHtmlPrompt({
      title: "BIG BANG",
      body: allDone
        ? "That's the lot.\nPortsmouth Council flattened Southsea.\nYou copped it with the rest of them."
        : "Portsmouth Council flattened Southsea.\nYou copped it with the rest of them.",
      buttonLabel: "Replay from start",
      onPress: () => this.scene.restart(),
    });
  }

  private updateHud(): void {
    const stars = this.wanted.starsLabel();
    const wep =
      this.player.weapon !== "none"
        ? ` · ${this.player.weapon}(${this.player.weaponDurability})`
        : "";
    const worn = this.conditionLabel();
    const buzz = this.player.isBuzzed()
      ? `\nBUZZBALL ${Math.max(0, Math.ceil((this.player.buzzedUntil - this.time.now) / 1000))}s`
      : "";
    this.hud.setText(
      `£${this.player.money}${wep}\nHONOUR ${this.currentHonour()}${worn ? `\n${worn}` : ""}${stars ? `\nWANTED ${stars}` : ""}${buzz}${this.achievementsHudText()}`,
    );
    this.updateEnemyPortrait();
  }

  private currentHonour(): number {
    // Casey tolerates a few civilian clips — only the excess tanks honour
    const roughCivHits = Math.max(0, this.civilianHits - 3);
    return Phaser.Math.Clamp(
      100 -
        roughCivHits * 22 -
        this.dogKicks * 22 -
        this.propsWrecked * 2 -
        this.wanted.level * 4,
      0,
      100,
    );
  }

  /** No health bar — just how rough you look, to hint when a feed is due. */
  private conditionLabel(): string {
    const h = this.player.structure.hunger();
    if (h >= 0.62) return "KNACKERED";
    if (h >= 0.4) return "blowing hard";
    if (h >= 0.2) return "peckish";
    return "";
  }

  private updateEnemyPortrait(): void {
    const spotted = this.enemies
      .filter((e) => e.hasSpottedPlayer && !e.structure.isOut())
      .sort(
        (a, b) =>
          Phaser.Math.Distance.Squared(a.x, a.y, this.player.x, this.player.y) -
          Phaser.Math.Distance.Squared(b.x, b.y, this.player.x, this.player.y),
      )[0];

    if (!spotted) {
      this.enemyPortrait.setVisible(false);
      return;
    }

    this.enemyPortraitImage.setTexture(`${spotted.spritePrefix}_idle`);
    this.enemyPortraitImage.setFlipX(spotted.facing < 0);
    this.enemyPortraitName.setText(spotted.displayName);
    if (this.portraitRank !== spotted.role) {
      this.portraitRank = spotted.role;
      this.drawRankIcon(spotted.role);
    }
    this.drawPortraitDamage(spotted, this.time.now);
    this.enemyPortrait.setVisible(true);
  }

  /**
   * Chalk-red blotches over wrecked limbs on the portrait — so you can see
   * which arm / leg you've already done over without a health bar.
   */
  private drawPortraitDamage(lad: Enemy, now: number): void {
    const g = this.enemyPortraitDamage;
    g.clear();
    const s = lad.structure;
    const cx = -43;
    const cy = 55;
    // Side-view figure: flipX mirrors the near/far limbs
    const face = lad.facing < 0 ? -1 : 1;
    const pulse = 0.75 + Math.sin(now * 0.012) * 0.25;

    type Spot = { x: number; y: number; rx: number; ry: number; hurt: number };
    const spots: Spot[] = [];

    const armR = limbHurt(s.armRight, s.armPain);
    const armL = limbHurt(s.armLeft, s.armPain * 0.85);
    const legR = limbHurt(s.legRight, s.legPain);
    const legL = limbHurt(s.legLeft, s.legPain * 0.85);
    const faceH = Math.max(0, (s.facePain - 0.25) / 0.75);
    const gutH = Math.max(0, (s.gutPain - 0.25) / 0.75);

    // Near (right) arm sits forward; far (left) arm behind the torso
    if (armR > 0.05) spots.push({ x: cx + face * 14, y: cy - 2, rx: 7, ry: 10, hurt: armR });
    if (armL > 0.05) spots.push({ x: cx - face * 11, y: cy - 1, rx: 6, ry: 9, hurt: armL });
    if (legR > 0.05) spots.push({ x: cx + face * 8, y: cy + 16, rx: 7, ry: 9, hurt: legR });
    if (legL > 0.05) spots.push({ x: cx - face * 7, y: cy + 16, rx: 6, ry: 9, hurt: legL });
    if (faceH > 0.05) spots.push({ x: cx + face * 5, y: cy - 16, rx: 8, ry: 7, hurt: faceH });
    if (gutH > 0.05) spots.push({ x: cx + face * 1, y: cy + 4, rx: 9, ry: 7, hurt: gutH });

    for (const spot of spots) {
      const a = Phaser.Math.Clamp(0.25 + spot.hurt * 0.55, 0.25, 0.85) * pulse;
      // Deep red core when wrecked; amber wash when just sore
      const colour = spot.hurt > 0.55 ? 0xc02828 : 0xd07030;
      g.fillStyle(colour, a);
      g.fillEllipse(spot.x, spot.y, spot.rx * 2, spot.ry * 2);
      // Thin chalk outline so it reads on the cream frame
      g.lineStyle(1.5, 0x1a1410, a * 0.7);
      g.strokeEllipse(spot.x, spot.y, spot.rx * 2, spot.ry * 2);
    }
  }

  /** Chevrons for the lads giving orders, an eye for the ones spotting you. */
  private drawRankIcon(role: EnemyRole): void {
    const g = this.enemyPortraitRank;
    const left = -80;
    const top = 6;
    g.clear();
    g.lineStyle(2, 0x1a1410, 1);
    if (role === "scout") {
      g.fillStyle(0xf2e6d8, 1);
      g.strokeEllipse(left + 9, top + 8, 18, 11);
      g.fillCircle(left + 9, top + 8, 3.5);
      g.fillStyle(0x1a1410, 1);
      g.fillCircle(left + 9, top + 8, 3.5);
      return;
    }
    const stripes = role === "sergeant" ? 3 : 1;
    for (let i = 0; i < stripes; i++) {
      const y = top + 2 + i * 5;
      g.beginPath();
      g.moveTo(left, y + 4);
      g.lineTo(left + 8, y);
      g.lineTo(left + 16, y + 4);
      g.strokePath();
    }
  }

  private updateIntro(now: number, dt: number): void {
    const elapsed = now - this.introStartedAt;
    const p = this.player;
    p.inputLocked = true;
    p.refreshVisuals(now, dt);

    if (this.introPhase === "asleep") {
      // Stay planted on the sand until they stir
      p.structure.downed = true;
      p.structure.groundedUntil = now + 800;
      p.action = "down";
      p.actionUntil = now + 800;
      p.markPlantHere();
      if (elapsed >= 1500) {
        this.introPhase = "stir";
        p.structure.downed = false;
        p.structure.groundedUntil = 0;
        p.clearPlantLock();
        p.action = "idle";
        p.actionUntil = now;
        this.banner.setText("You sit up on the pebbles. Head's ringing.");
      }
      return;
    }

    if (this.introPhase === "stir") {
      p.action = "idle";
      p.running = false;
      if (elapsed >= 2400) this.introPhase = "line";
      return;
    }

    if (this.introPhase === "line") {
      if (!this.introLineSaid) {
        this.introLineSaid = true;
        this.bubbles.say(p, "What a night…", 2800);
        this.banner.setText("What a night. Time to get onto the promenade.");
      }
      p.action = "idle";
      p.running = false;
      if (elapsed >= 4600) this.introPhase = "walk";
      return;
    }

    if (this.introPhase === "walk") {
      // Clear of the Eastney bin / coffee van — south onto the open promenade
      const targetX = 360;
      const targetY = GAME_HEIGHT * 0.72;
      const dx = targetX - p.x;
      const dy = targetY - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 10) {
        p.x = targetX;
        p.y = targetY;
        p.groundY = targetY;
        p.action = "idle";
        p.running = false;
        this.finishIntro(now);
        return;
      }
      const spd = p.speed * 0.7;
      p.x += (dx / dist) * spd * dt;
      p.y += (dy / dist) * spd * dt;
      p.groundY = p.y;
      p.setFacing(dx >= 0 ? 1 : -1, now);
      p.action = "move";
      p.running = false;
    }
  }

  private finishIntro(now: number): void {
    this.introPhase = "done";
    const p = this.player;
    p.inputLocked = false;
    p.structure.downed = false;
    p.structure.groundedUntil = 0;
    p.structure.openUntil = 0;
    p.clearPlantLock();
    p.y = Phaser.Math.Clamp(p.y, LANE.minY, LANE.maxY);
    p.groundY = p.y;
    p.action = "idle";
    this.runCheckpoint = {
      stage: 1,
      x: p.x,
      y: p.y,
      withCasey: false,
      label: "the promenade",
    };
    this.banner.setText("Southsea front. Quiet for now — stroll east before the lads turn up.");
    this.spawnFloat(p.x, p.y - 56, "onto the front");
    this.chatterAt = now + 8000 + Math.random() * 4000;
    this.nextWonderAt = now + 2500 + Math.random() * 2000;
    this.nextBgThugAt = now + 22000 + Math.random() * 8000;
  }

  private beginPlayerDownedSequence(): void {
    if (this.playerDowned) return;
    // Stale defeat card without cuffs — clear it so free play can recover
    if (this.defeated && !this.player.structure.cuffed) {
      this.defeated = false;
      this.clearRestartPrompt();
    }
    if (this.defeated) return;
    if (this.player.structure.cuffed) {
      this.showDefeat();
      return;
    }
    const now = this.time.now;
    const active = this.enemies.filter((e) => !e.isBackground && !e.structure.isOut());
    const nearby = active
      .slice()
      .sort(
        (a, b) =>
          Phaser.Math.Distance.Squared(a.x, a.y, this.player.x, this.player.y) -
          Phaser.Math.Distance.Squared(b.x, b.y, this.player.x, this.player.y),
      );
    const looters = nearby.slice(0, Math.min(2, nearby.length));
    this.playerDowned = {
      startedAt: now,
      looters,
      helpersChosenAt: 0,
      helperStartedAt: 0,
      helper: null,
      moneyTaken: 0,
      weaponTaken: null,
      lootDone: false,
      civiliansPrompted: false,
      revived: false,
    };

    const finisher = this.lastPlayerDefeat;
    for (const [i, e] of nearby.entries()) {
      let line: string;
      if (i === 0 && finisher) {
        line =
          finisher.kind === "boot_head"
            ? "That's him stamped mush. Boss'll love that."
            : finisher.kind === "weapon_swing" || finisher.kind === "thrown"
              ? "Did you see that? Dropped the dinlo with the weapon!"
              : finisher.kind === "headbutt"
                ? "Proper headbutt that mush. Boss'll be buzzing."
                : "We've done him mush! Boss'll be happy with that.";
      } else {
        const lines = [
          "Nice one mush!",
          "Boss'll be happy with that.",
          "Have his pockets off him dinlo!",
          "He's not getting back up.",
          "That's how you finish one mush.",
          "Squinny — he's out cold!",
        ];
        line = lines[(i + Math.floor(Math.random() * lines.length)) % lines.length]!;
      }
      // Speak immediately — downed-sequence skips the normal takeInsult drain
      this.time.delayedCall(i * 200, () => {
        if (e.active && !e.structure.isOut()) this.bubbles.say(e, line, 2800);
      });
      e.sayLine(line, now + i * 150, 2800);
    }
    this.banner.setText("They've dropped you. The thugs crowd round, then start peeling off…");
  }

  private updatePlayerDowned(now: number, dt: number): void {
    const seq = this.playerDowned;
    if (!seq) return;

    for (const d of this.destructibles) d.update(now);

    if (!seq.civiliansPrompted) {
      seq.civiliansPrompted = true;
      for (const c of this.civilians) {
        if (c.structure.isOut()) continue;
        const dist = Phaser.Math.Distance.Between(c.x, c.y, this.player.x, this.player.y);
        if (dist < 260 && Math.random() < 0.45) c.startFilming(now, 4200);
        else if (dist < 180) c.scare(now);
      }
    }

    const cam = this.cameras.main;
    const gone: Enemy[] = [];
    for (const e of this.enemies) {
      if (e.structure.isOut()) {
        e.refreshVisuals(now, dt);
        continue;
      }
      if (e.isBackground) {
        e.refreshVisuals(now, dt);
        continue;
      }
      const idx = seq.looters.indexOf(e);
      const lootWindowOpen = now >= seq.startedAt + 500 + Math.max(0, idx) * 220;
      const lootWindowShut = now >= seq.startedAt + 1900;
      if (idx >= 0 && !lootWindowShut) {
        const tx = this.player.x + (idx === 0 ? -28 : 28);
        const ty = this.player.y;
        const dx = tx - e.x;
        const dy = ty - e.y;
        const dist = Math.hypot(dx, dy);
        e.faceToward(this.player.x, now);
        if (dist > 20) {
          const step = Math.min(e.speed * 0.7 * dt, dist);
          e.x += (dx / Math.max(dist, 1)) * step;
          e.y += (dy / Math.max(dist, 1)) * step;
          e.groundY = e.y;
          e.action = "move";
        } else if (lootWindowOpen) {
          e.startLooting(now, 850);
        } else {
          e.action = "idle";
        }
      } else {
        const dir = e.x <= this.player.x ? -1 : 1;
        e.setFacing(dir, now);
        e.x += dir * e.runSpeed * 0.85 * dt;
        e.groundY = e.y;
        e.action = "run";
        if (e.x < cam.scrollX - 140 || e.x > cam.scrollX + this.viewW + 140) {
          gone.push(e);
        }
      }
      const line = e.takeInsult();
      if (line) this.bubbles.say(e, line, 2600);
      e.refreshVisuals(now, dt);
    }
    if (gone.length) {
      for (const e of gone) {
        if (this.countsForMassacre(e) && !e.structure.isOut()) this.massacreEscaped = true;
        e.destroy(true);
      }
      this.enemies = this.enemies.filter((e) => !gone.includes(e));
      this.rebuildFighterList();
    }

    if (!seq.lootDone && now >= seq.startedAt + 1050) {
      seq.lootDone = true;
      const nearbyLooters = seq.looters.filter((e) => this.enemies.includes(e));
      if (nearbyLooters.length > 0) {
        const cashCap = Math.min(this.player.money, 18 + Math.floor(Math.random() * 18));
        seq.moneyTaken = cashCap;
        this.player.money -= cashCap;
        if (this.player.weapon !== "none") {
          seq.weaponTaken = this.player.dropWeapon();
        }
        if (seq.moneyTaken > 0) {
          this.spawnFloat(this.player.x, this.player.y - 66, `-£${seq.moneyTaken}`);
        }
        if (seq.weaponTaken) {
          this.spawnFloat(this.player.x + 18, this.player.y - 88, `lost ${seq.weaponTaken}`);
        }
        this.banner.setText(
          seq.weaponTaken
            ? `They've had £${seq.moneyTaken} and your ${seq.weaponTaken}.`
            : `They've had £${seq.moneyTaken} and legged it.`,
        );
      }
    }

    const riderObsDowned: Obstacle[] = [
      ...this.obstacles,
      ...this.destructibles
        .filter((d) => d.isOccluder)
        .map((d) => d.asObstacle())
        .filter((o): o is Obstacle => o !== null),
    ];
    for (const c of this.civilians) {
      c.updateCivilian(now, dt, this.fighters, riderObsDowned, this.civilians);
      const speech = c.takeSpeech();
      if (speech) this.bubbles.say(c, speech, c.isPartyMember ? 3600 : c.isOnPhone ? 3000 : 2600);
      if (c.takeFilmPing(now)) {
        this.spawnFloat(c.x, c.y - 78, Math.random() < 0.5 ? "filming…" : "getting it on video");
      }
    }

    // Enemies/civilians already refreshed in their updates; player isn't on the normal path
    this.player.refreshVisuals(now, 0);

    const thugsNearby = this.enemies.filter(
      (e) =>
        !e.isBackground &&
        !e.structure.isOut() &&
        Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y) < 150,
    );
    // Don't wait forever if a lad is stuck nearby — after a beat, haul up anyway
    const thugsClear =
      now >= seq.startedAt + 1600 && (thugsNearby.length === 0 || now >= seq.startedAt + 3200);
    if (thugsClear && !seq.helper) {
      seq.helpersChosenAt = now;
      // Prefer an ally, else nearest living local — pull them in if they're far
      let best: Civilian | null = null;
      let bestD = Number.POSITIVE_INFINITY;
      for (const c of this.civilians) {
        if (c.structure.isOut()) continue;
        const d = Phaser.Math.Distance.Between(c.x, c.y, this.player.x, this.player.y);
        const score = c.isAlly ? d * 0.55 : d;
        if (score < bestD) {
          bestD = score;
          best = c;
        }
      }
      // Empty stretch / everyone fled — someone still turns up
      if (!best) {
        best = new Civilian(
          this,
          this.player.x + (Math.random() < 0.5 ? -90 : 90),
          Phaser.Math.Clamp(this.player.y - 12, LANE.minY, LANE.maxY),
          "Passer-by",
          "walker",
          undefined,
          { nosy: false },
        );
        this.civilians.push(best);
        this.rebuildFighterList();
      }
      seq.helper = best;
      // Nudge lingering thugs off so the help-up reads clean
      for (const e of thugsNearby) {
        e.setFacing(e.x <= this.player.x ? -1 : 1, now);
        e.x += (e.facing) * 40;
      }
      if (seq.helper) {
        const helper = seq.helper;
        const dist = Phaser.Math.Distance.Between(
          helper.x,
          helper.y,
          this.player.x,
          this.player.y,
        );
        if (dist > 200) {
          const side = helper.x <= this.player.x ? -1 : 1;
          helper.x = this.player.x + side * 110;
          helper.y = Phaser.Math.Clamp(this.player.y - 18, LANE.minY, LANE.maxY);
          helper.groundY = helper.y;
        }
        this.banner.setText(
          helper.isAlly
            ? "Your mate rushes over to help you up."
            : "A local comes straight over to help you up.",
        );
      }
    }

    if (seq.helper && !seq.revived) {
      const helper = seq.helper;
      helper.faceToward(this.player.x, now);
      const dx = this.player.x - helper.x;
      const dy = this.player.y - helper.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 34 && seq.helperStartedAt === 0) {
        const step = Math.min(helper.speed * 1.85 * dt, dist);
        helper.x += (dx / Math.max(dist, 1)) * step;
        helper.y += (dy / Math.max(dist, 1)) * step;
        helper.groundY = helper.y;
        helper.action = "run";
      } else if (seq.helperStartedAt === 0) {
        seq.helperStartedAt = now;
        helper.helpPlayerUp(now, this.player);
        this.bubbles.say(helper, helper.isAlly ? "Come on mush, back up." : "Here — on your feet mush.", 2200);
      } else if (now >= seq.helperStartedAt + 700) {
        seq.revived = this.player.reviveFromHelp(now, helper.isAlly ? 0.5 : 0.36);
        if (!seq.revived && !this.player.structure.cuffed) {
          // Hard failsafe — never leave free-play needing R
          this.forceSpawnHelperAndRevive(now);
          return;
        }
        if (seq.revived) {
          this.playerDowned = null;
          this.lastPlayerDefeat = null;
          this.banner.setText(helper.isAlly ? "Back on your feet. Your mate bought you a breather." : "A local hauls you up once the coast is clear.");
          return;
        }
      }
    } else if (now >= seq.startedAt + 3600 && !seq.helper && !this.player.structure.cuffed) {
      // Absolute failsafe if helper never assigned
      this.forceSpawnHelperAndRevive(now);
    }
  }

  /** Spawn a local and haul the player up — used when the front is empty. */
  private forceSpawnHelperAndRevive(now: number): void {
    if (this.player.structure.cuffed) return;

    let helper =
      this.civilians.find((c) => !c.structure.isOut() && c !== this.captive) ?? null;
    if (!helper) {
      helper = new Civilian(
        this,
        this.player.x + 70,
        Phaser.Math.Clamp(this.player.y - 10, LANE.minY, LANE.maxY),
        "Passer-by",
        "walker",
        undefined,
        { nosy: false },
      );
      this.civilians.push(helper);
      this.rebuildFighterList();
    }
    helper.x = this.player.x + 56;
    helper.y = Phaser.Math.Clamp(this.player.y - 8, LANE.minY, LANE.maxY);
    helper.groundY = helper.y;
    helper.helpPlayerUp(now, this.player);
    this.bubbles.say(helper, "Here — on your feet mush.", 2200);

    const up = this.player.reviveFromHelp(now, 0.45);
    if (!up && !this.player.structure.cuffed) {
      // Last resort — clear KO flags directly so free play never soft-locks
      this.player.structure.outCold = false;
      this.player.structure.crawling = false;
      this.player.structure.downed = false;
      this.player.action = "idle";
      this.player.actionUntil = now + 240;
      this.player.invulnUntil = now + 900;
      this.player.refreshVisuals(now, 0);
    }

    this.playerDowned = null;
    this.lastPlayerDefeat = null;
    this.defeated = false;
    this.clearRestartPrompt();
    this.hint.setVisible(false);
    this.banner.setText("A local hauls you up once the coast is clear.");
  }

  /** If somehow stuck on the defeat card without cuffs, get helped up. */
  private forcePickupAfterDefeat(now: number): void {
    this.forceSpawnHelperAndRevive(now);
  }

  private showDefeat(): void {
    this.playerDowned = null;
    // Free play KO — always get hauled up. Only Bill's cuffs show the R card.
    if (!this.player.structure.cuffed) {
      this.defeated = false;
      this.clearRestartPrompt();
      this.forceSpawnHelperAndRevive(this.time.now);
      return;
    }
    this.defeated = true;
    this.banner.setText("Cuffed by the Bill. You're going in the van.");
    this.clearRestartPrompt();
    const cost = this.wanted.bribeCost();
    const canBribe = this.player.money >= cost;
    showHtmlPrompt({
      title: "CUFFED",
      body: canBribe
        ? `You're going in the van.\nOr bung them £${cost} and they'll look the other way.`
        : "You're going in the van.",
      buttonLabel: canBribe ? `Bribe £${cost}` : "Restart checkpoint",
      onPress: () => {
        if (canBribe) this.bribeOutOfCuffs();
        else this.restartFromCheckpoint();
      },
      altLabel: canBribe ? "Restart checkpoint" : undefined,
      onAltPress: canBribe ? () => this.restartFromCheckpoint() : undefined,
    });
    this.hint.setText(
      canBribe ? `Bribe £${cost} (E) — or Restart (R)` : "Restart — or press R",
    ).setVisible(true);
  }

  private tryCuffBribeInput(): boolean {
    if (this.player.money < this.wanted.bribeCost()) return false;
    if (
      !Phaser.Input.Keyboard.JustDown(this.continueKey) &&
      !Phaser.Input.Keyboard.JustDown(this.continueAltKey)
    ) {
      return false;
    }
    this.bribeOutOfCuffs();
    return true;
  }

  /** Pay the Bill off the cuff card — stand up, coppers walk, heat drops. */
  private bribeOutOfCuffs(): void {
    const cost = this.wanted.bribeCost();
    if (this.player.money < cost) return;
    const now = this.time.now;
    this.player.money -= cost;
    this.wanted.acceptBribe(5);

    for (const cop of this.police) {
      if (!cop.structure.isOut()) cop.takeBribe(now, this.player.x);
    }

    const p = this.player;
    p.structure.cuffed = false;
    p.heldBy = null;
    p.reviveFromHelp(now, 0.55);
    p.invulnUntil = now + 1800;

    this.defeated = false;
    this.playerDowned = null;
    this.lastPlayerDefeat = null;
    this.clearRestartPrompt();
    this.hint.setVisible(false);
    this.spawnFloat(p.x, p.y - 56, `-£${cost}`);
    const cop = this.police.find((c) => c.bribed);
    if (cop) this.bubbles.say(cop, "Go on, sling your hook.", 2600);
    this.banner.setText("Bunged the Bill — you're back on the front.");
    void chipSfx.coin();
  }

  private clearRestartPrompt(): void {
    hideHtmlPrompt();
  }

  /** Bill's van → dump you at the last solid beat (promenade or post-Casey). */
  private restartFromCheckpoint(): void {
    this.registry.set("resumeCheckpoint", { ...this.runCheckpoint });
    this.scene.restart();
  }

  /** @returns true while the scrap is frozen on the pause menu. */
  private handlePauseInput(): boolean {
    const keyPause =
      Phaser.Input.Keyboard.JustDown(this.pauseKey) ||
      Phaser.Input.Keyboard.JustDown(this.pauseEscKey);
    if (consumePauseJust() || keyPause) {
      if (this.gamePaused) this.setGamePaused(false);
      else if (this.canOpenPause()) this.setGamePaused(true);
    }
    return this.gamePaused;
  }

  private canOpenPause(): boolean {
    return (
      !this.caseyChat &&
      !this.defeated &&
      this.endingState !== "nuke" &&
      !(this.endingState === "complete" && this.player.inputLocked)
    );
  }

  private setGamePaused(on: boolean): void {
    this.gamePaused = on;
    if (on) {
      chipRock.setHeat(0);
      this.showPauseOverlay();
    } else {
      this.hidePauseOverlay();
    }
  }

  private showPauseOverlay(): void {
    setPauseMenuOpen(true);
  }

  private hidePauseOverlay(): void {
    setPauseMenuOpen(false);
  }

  private applyResumeCheckpoint(cp: RunCheckpoint): void {
    this.runCheckpoint = { ...cp };
    this.introPhase = "done";
    this.introStartedAt = this.time.now;
    this.introLineSaid = true;
    this.defeated = false;
    this.playerDowned = null;
    this.lastPlayerDefeat = null;
    this.endingState = "playing";
    this.wanted = new WantedSystem();

    for (const cop of this.police) cop.destroy(true);
    this.police = [];

    const p = this.player;
    p.inputLocked = false;
    p.structure.cuffed = false;
    p.structure.outCold = false;
    p.structure.crawling = false;
    p.structure.downed = false;
    p.structure.groundedUntil = 0;
    p.structure.openUntil = 0;
    p.clearPlantLock();
    p.reviveFromHelp(this.time.now, 0.65);
    p.action = "idle";
    p.actionUntil = this.time.now;
    p.x = cp.x;
    p.y = cp.y;
    p.groundY = cp.y;

    if (cp.stage === 2) {
      // Wipe any L1 bodies — Level 2 starts fresh from the pier
      for (const e of this.enemies) e.destroy(true);
      this.enemies = [];
      this.handledBosses.clear();
      this.pendingEnemies.length = 0;

      if (cp.withCasey) {
        const casey = new Civilian(
          this,
          cp.x + 40,
          cp.y,
          "Casey",
          "walker",
          undefined,
          { toughness: 2.2, present: "fem", lookId: "look_c18" },
        );
        this.captive = casey;
        this.civilians.push(casey);
        casey.joinPlayer(this.time.now, null, {
          teach: (this.registry.get("caseyTeach") as string[] | undefined) ?? [],
        });
        this.registry.set("partyMembers", ["Casey"]);
      } else {
        this.captive = null;
        this.registry.set("partyMembers", []);
      }
      this.beginLevelTwo(cp.withCasey);
      // beginLevelTwo refreshes the checkpoint — keep the saved cuff-dump spot
      this.runCheckpoint = { ...cp };
      p.x = cp.x;
      p.y = cp.y;
      p.groundY = cp.y;
    }

    this.cameras.main.centerOn(p.x, GAME_HEIGHT / 2);
    this.rebuildFighterList();
    this.clearRestartPrompt();
    this.banner.setText(
      cp.stage === 2
        ? "Bill dumped you past the pier. Back to it."
        : "Bill dumped you back on the front. Shake it off.",
    );
    this.spawnFloat(p.x, p.y - 56, "checkpoint");
    this.hint.setVisible(false);
  }

  private onCombat(ev: CombatEvent): void {
    if (ev.kind === "loot") {
      ev.attacker.startLooting(this.time.now);
      this.spawnFloat(ev.target.x, ev.target.y - 50, ev.result);
      this.banner.setText(`Nicked their pockets: ${ev.result}`);
      void chipSfx.coin();
      return;
    }

    void chipSfx.hit(hitWeightFor(ev.kind, ev.result));
    if (ev.result === "out_cold" || ev.result === "crawl_away") {
      void chipSfx.ko();
    }

    const landed = ev.result !== "blocked" && ev.result !== "dodged";
    if (landed && ev.target === this.player && ev.attacker.team !== "player") {
      this.hitsTaken += 1;
      this.tryBossWeaponSteal(ev);
    }
    if (landed && ev.attacker.team === "player") {
      this.recordTechnique(ev);
    } else if (landed && ev.kind === "toss_hit") {
      // Missile is whoever the player hurled (enemy / civ)
      this.techniquesUsed.add("body_toss");
    }

    if (ev.result === "blocked") {
      this.playBlockImpact(ev.target, ev.attacker);
    }

    if (ev.kind === "toss_hit") {
      this.playThrowImpact(ev.attacker, ev.target, "pileup");
      if (ev.result === "headbang") {
        this.spawnFloat(
          (ev.attacker.x + ev.target.x) * 0.5,
          Math.min(ev.attacker.y, ev.target.y) - 60,
          "CLANG!",
        );
        this.banner.setText("Heads together!");
        void chipSfx.hit("critical");
      } else {
        this.spawnFloat(ev.target.x, ev.target.y - 56, "pile-up!");
      }
      this.wanted.bump(0.08);
    }

    if (ev.kind === "boot_head" && ev.attacker.team === "enemy") {
      this.spawnFloat(ev.target.x, ev.target.y - 52, "STOMP");
    }

    const alreadyOut =
      ev.target.structure.isOut() &&
      ev.result !== "out_cold" &&
      ev.result !== "crawl_away";
    if (
      ev.target instanceof Enemy &&
      !alreadyOut &&
      ev.result !== "blocked" &&
      ev.result !== "dodged"
    ) {
      const now = this.time.now;
      ev.target.onProvoked(now, ev.attacker);
      ev.target.cryOutInPain(now);
      this.rallyNearbyLads(ev.target, ev.attacker, now);
    }

    if (ev.attacker.team === "player" && ev.attacker.action === "upper" && ev.result !== "blocked") {
      this.spawnFloat(ev.target.x, ev.target.y - 72, "UPPER!");
    }

    if (
      ev.target instanceof Civilian &&
      ev.attacker.team === "enemy" &&
      ev.result !== "blocked" &&
      ev.result !== "dodged"
    ) {
      const now = this.time.now;
      if (ev.target.onHitByEnemy(now, ev.attacker)) {
        // speech consumed next frame via takeSpeech
      }
      // Nearby locals who see it may pile in too
      for (const c of this.civilians) {
        if (c === ev.target || c.isAlly || c.isProtecting) continue;
        const d = Phaser.Math.Distance.Between(c.x, c.y, ev.target.x, ev.target.y);
        if (d < 200) c.tryJoinPlayer(now, ev.attacker, 0.22);
      }
    }

    if (
      ev.target.team === "civilian" &&
      ev.attacker.team === "player" &&
      ev.result !== "blocked" &&
      ev.result !== "dodged"
    ) {
      this.civilianHits += 1;
      this.wanted.bump(0.72);
      const now = this.time.now;
      if (ev.target instanceof Civilian) {
        ev.target.onHurt(now, ev.attacker);
      }
      this.civilians.forEach((c) => {
        if (c === ev.target) return;
        // Don't scare the bloke who's about to pile in for his missus
        if (
          ev.target instanceof Civilian &&
          c.partner === ev.target &&
          c.coupleRole === "him"
        ) {
          return;
        }
        c.scare(now);
      });
      this.banner.setText(
        ev.target instanceof Civilian && ev.target.coupleRole === "her"
          ? "You hit his missus — he's steaming!"
          : "You hit a civilian — wanted's going up!",
      );
    }

    // Loud scrap heat — Bill clocks a serious front punch-up
    if (
      ev.attacker.team === "player" &&
      ev.target.team === "enemy" &&
      (ev.result === "out_cold" || ev.result === "crawl_away")
    ) {
      this.wanted.bump(0.18);
      this.tryPlayerQuip(this.time.now);
    }

    if (ev.kind === "cuff") {
      this.banner.setText(
        ev.target.team === "player"
          ? "You're nicked — cuffed and done."
          : "Bill's cuffed someone. Immobilised.",
      );
    }

    const phrases: Record<string, string> = {
      blocked: "BLOCK",
      flinch: "ow",
      winded: "oof",
      stumble: "whoa",
      disabled: "LOW BLOW",
      opened: "open!",
      crawl_away: ev.target.team === "player" ? "you're done" : "had enough",
      out_cold: "OUT COLD",
      cuffed: "CUFFED",
      tased: "ZZZT",
      held: "gotcha",
      takedown: "down ya go",
      dodged: "missed!",
    };
    const justFinished =
      ev.result === "out_cold" || ev.result === "crawl_away" || ev.result === "cuffed";
    // Already-KO bodies twitch on a boot, but they don't yelp
    if (!ev.target.structure.isOut() || justFinished) {
      this.spawnFloat(ev.target.x, ev.target.y - 60, phrases[ev.result] ?? ev.result);
    }

    if (ev.target.team === "player" && (ev.result === "out_cold" || ev.result === "crawl_away" || ev.result === "cuffed")) {
      this.lastPlayerDefeat = ev;
      return;
    }

    if (ev.result === "out_cold" || ev.result === "crawl_away") {
      this.bubbles.clearOwner(ev.target);
      this.banner.setText(
        ev.result === "out_cold"
          ? `Out cold — press ${this.lootKey()} near them to loot.`
          : `Crawl-away KO — ${this.lootKey()} to loot if you're quick.`,
      );
      if (ev.target instanceof Enemy) this.maybeDropBuzzball(ev.target);
      if (ev.target.weapon !== "none") {
        const dumped = ev.target.dropWeapon();
        if (dumped) {
          this.spawnPickup(ev.target.x + (Math.random() < 0.5 ? -18 : 18), ev.target.y, dumped);
        }
      }
    }

    if (justFinished) this.tryMentalMushUnlock();
  }

  /** Hardmen nick your kit mid-scrap — "I'll have that mush". */
  private tryBossWeaponSteal(ev: CombatEvent): void {
    if (!(ev.attacker instanceof Enemy) || !ev.attacker.isBoss) return;
    if (ev.target !== this.player) return;
    if (this.player.weapon === "none") return;
    // More likely on grabs / weapon hits / heavy connects
    const chance =
      ev.kind === "grab" || ev.kind === "hold"
        ? 0.72
        : ev.kind === "weapon_swing" || ev.kind === "headbutt"
          ? 0.48
          : ev.kind === "kick" || ev.kind === "jump_kick"
            ? 0.38
            : 0.28;
    if (Math.random() > chance) return;

    const taken = this.player.dropWeapon();
    if (!taken) return;
    const boss = ev.attacker;
    if (boss.weapon !== "none") {
      const dumped = boss.dropWeapon();
      if (dumped) {
        this.spawnPickup(boss.x - boss.facing * 22, boss.y, dumped);
      }
    }
    boss.equipWeapon(taken);
    const lines = [
      "I'll have that mush",
      "Ta mush — mine now",
      "Nice bit of kit dinlo",
      "I'll have that!",
      "Gimme that mush",
    ];
    this.bubbles.say(boss, lines[Math.floor(Math.random() * lines.length)]!, 2800);
    this.spawnFloat(this.player.x, this.player.y - 56, `nicked ${taken}!`);
    this.banner.setText(`The Hardman nicked your ${taken}!`);
  }

  private tryPlayerQuip(now: number): void {
    if (now < this.nextQuipAt) return;
    if (this.player.structure.isOut() || this.player.structure.downed) return;
    const line = nextPlayerQuip();
    this.bubbles.say(this.player, line, 2600);
    this.nextQuipAt = now + 1600;
  }

  /** "Who are these blokes?" — only while they're still on patrol and haven't clocked you. */
  private syncPlayerWondering(now: number): void {
    if (this.introPhase !== "done") return;
    if (this.endingState !== "playing") return;
    if (this.caseyChat || this.playerDowned || this.defeated) return;
    if (this.player.structure.isOut() || this.player.structure.downed) return;

    const spotted = this.enemies.some((e) => e.hasSpottedPlayer);
    if (spotted) {
      this.wonderedUntilSpotted = true;
      this.nextWonderAt = now + 8000;
      return;
    }

    // Fresh stretch of patrols after a scrap — wonder again
    if (this.wonderedUntilSpotted) {
      const patrolNear = this.enemies.some(
        (e) =>
          e.isPatrolling &&
          !e.isBackground &&
          Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y) < 420,
      );
      if (!patrolNear) return;
      this.wonderedUntilSpotted = false;
      this.nextWonderAt = now + 900 + Math.random() * 1200;
    }

    if (now < this.nextWonderAt) return;

    const nearby = this.enemies.filter(
      (e) =>
        e.isPatrolling &&
        !e.isBackground &&
        !e.structure.isOut() &&
        Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y) < 380,
    );
    if (nearby.length === 0) {
      this.nextWonderAt = now + 1500;
      return;
    }

    const line = WHO_ARE_THEY[this.wonderLineIndex % WHO_ARE_THEY.length]!;
    this.wonderLineIndex += 1;
    this.bubbles.say(this.player, line, 2800);
    this.nextWonderAt = now + 4500 + Math.random() * 3500;
    this.nextQuipAt = Math.max(this.nextQuipAt, now + 3000);
  }

  private recordTechnique(ev: CombatEvent): void {
    const action = ev.attacker.action;
    if (action === "upper") this.techniquesUsed.add("combo");
    if (action === "backhand") this.techniquesUsed.add("back_attack");
    if (action === "headbutt") this.techniquesUsed.add("headbutt");
    if (action === "jump_kick") this.techniquesUsed.add("jump_kick");
    if (action === "backflip") this.techniquesUsed.add("backflip");
    if (action === "swanton") this.techniquesUsed.add("swanton");
    if (action === "low_blow") this.techniquesUsed.add("low_blow");
    if (action === "stomp" || ev.kind === "boot_head") this.techniquesUsed.add("stomp");
    if (action === "slide") this.techniquesUsed.add("slide");
    if (action === "whirl") this.techniquesUsed.add("whirl");
    if (action === "weapon_swing") this.techniquesUsed.add("weapon");
    if (ev.kind === "grab" || ev.kind === "hold") this.techniquesUsed.add("grab");
    if (ev.kind === "thrown") this.techniquesUsed.add("throw");
  }

  private resolveDogKicks(now: number): void {
    for (const attacker of this.fighters) {
      if (attacker.action !== "kick" && attacker.action !== "jump_kick" && attacker.action !== "low_blow") {
        continue;
      }
      const strike = attacker.strikeWindow(now);
      if (!strike) continue;
      for (const c of this.civilians) {
        const dog = c.dog;
        if (!dog || !dog.alive) continue;
        if (!dog.inKickReach(attacker.x, attacker.laneY, attacker.attackDir, attacker.attackReach)) {
          continue;
        }
        if (!dog.receiveKick(now, attacker.x, attacker.actionUntil)) continue;
        this.spawnFloat(dog.x, dog.y - 40, dog.knockedOut ? "yelp!" : "yap!");
        if (attacker.team === "player") {
          this.dogKicks += 1;
          this.wanted.bump(0.2);
          this.banner.setText("Kicked the dog — wanted ticks up.");
          this.unlockAchievement("dogPound");
        }
      }
    }
  }

  /** When one lad gets stuck into — his mates within earshot pile in. */
  /**
   * Two lads can pile on — the rest hover and mouth off.
   * The Hardman never waits his turn.
   */
  private syncEngagementCap(): void {
    const maxPressing = 2;
    const contenders = this.enemies
      .filter((e) => !e.structure.isOut() && !e.isBackground)
      .sort(
        (a, b) =>
          Phaser.Math.Distance.Squared(a.x, a.laneY, this.player.x, this.player.laneY) -
          Phaser.Math.Distance.Squared(b.x, b.laneY, this.player.x, this.player.laneY),
      );

    let pressing = 0;
    for (const e of contenders) {
      // The Hardman never waits his turn
      if (e.isBoss) {
        e.setHoldBack(false);
        pressing += 1;
        continue;
      }
      const slotFree = pressing < maxPressing;
      e.setHoldBack(!slotFree);
      if (slotFree) pressing += 1;
    }
  }

  private rallyNearbyLads(hit: Enemy, attacker: Fighter, now: number): void {
    for (const e of this.enemies) {
      if (e === hit || e.structure.isOut()) continue;
      const d = Phaser.Math.Distance.Between(e.x, e.y, hit.x, hit.y);
      if (d < 280) e.onProvoked(now, attacker);
    }
  }

  private nearestCover(maxDist: number): DestructibleProp | null {
    let best: DestructibleProp | null = null;
    let bestD = maxDist;
    for (const d of this.destructibles) {
      if (!d.offersCover) continue;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, d.x, d.y);
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    return best;
  }

  private nearestStall(): FoodStall | null {
    for (const s of this.foodStalls) {
      if (s.inRange(this.player.x, this.player.laneY)) return s;
    }
    return null;
  }

  private nearestWeaponShop(): WeaponShop | null {
    for (const s of this.weaponShops) {
      if (s.inRange(this.player.x, this.player.laneY)) return s;
    }
    return null;
  }

  private nearestBribeableCopper(): Police | null {
    let best: Police | null = null;
    let bestD = 120;
    for (const p of this.police) {
      if (p.structure.isOut() || p.bribed) continue;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y);
      if (d < bestD && Math.abs(this.player.laneY - p.y) < 56) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  private actKey(): string {
    return isMobilePlay() ? "Punch" : "E";
  }

  private lootKey(): string {
    return this.actKey();
  }

  private showLootHint(
    text: string,
    action: BeachScene["lootHintAction"],
  ): void {
    this.lootHintAction = action;
    this.lootHint.setText(text).setVisible(true);
    if (action) {
      this.lootHint.setInteractive({ useHandCursor: true });
    } else {
      this.lootHint.disableInteractive();
    }
  }

  private onLootHintPress(): void {
    if (!this.lootHintAction) return;
    if (this.introPhase !== "done") return;
    if (this.player.structure.isOut()) return;
    this.runLootHintAction(this.lootHintAction);
  }

  private runLootHintAction(action: NonNullable<BeachScene["lootHintAction"]>): void {
    if (action === "bribe") this.tryBribePolice();
    else if (action === "loot") tryLoot(this.player, this.fighters, (ev) => this.onCombat(ev));
    else if (action === "shop") this.tryBuyWeapon();
    else if (action === "stall") this.tryBuyFood();
    else if (action === "board") this.tryPickupSkateboard();
    else if (action === "wep") this.tryPickupWeapon();
    else if (action === "buzz") this.tryPickupBuzzball();
  }

  /** E / Punch world use — bribe, loot, buy, hop on, pick up. */
  private tryWorldInteract(): boolean {
    if (this.tryBribePolice()) return true;
    if (this.tryPickupBuzzball()) return true;
    if (tryLoot(this.player, this.fighters, (ev) => this.onCombat(ev))) return true;
    if (this.tryBuyWeapon()) return true;
    if (this.tryBuyFood()) return true;
    if (this.tryPickupSkateboard()) return true;
    if (this.tryPickupWeapon()) return true;
    return false;
  }

  /**
   * Keep HUD at a fixed screen spot when the world camera is zoomed.
   * Phaser zooms scrollFactor-0 objects around the view centre — undo that.
   */
  private pinHud(
    obj: Phaser.GameObjects.GameObject & {
      setScrollFactor: (x: number, y?: number) => unknown;
      setPosition: (x: number, y: number) => unknown;
      setScale: (x: number, y?: number) => unknown;
    },
    screenX: number,
    screenY: number,
    baseScale = 1,
  ): void {
    const z = this.viewZoom;
    obj.setScrollFactor(0);
    if (z === 1) {
      obj.setPosition(screenX, screenY);
      obj.setScale(baseScale);
      return;
    }
    const cx = this.viewW * 0.5;
    const cy = GAME_HEIGHT * 0.5;
    obj.setPosition(cx + (screenX - cx) / z, cy + (screenY - cy) / z);
    obj.setScale(baseScale / z);
  }

  /**
   * On mobile, Punch is the only action button for world interactions —
   * steal the press when buy / pick up / board / loot can actually complete.
   */
  private tryMobilePunchContext(): void {
    if (!isMobilePlay() || !peekPunchJust()) return;
    if (this.player.structure.isOut()) return;

    const copper = this.nearestBribeableCopper();
    const canBribe = !!copper;
    const shop = this.nearestWeaponShop();
    const canBuyWep =
      !!shop &&
      !shop.soldOut &&
      !!shop.offer &&
      this.player.money >= shop.offer.price;
    const stall = this.nearestStall();
    const canBuyFood =
      !!stall &&
      !stall.soldOut &&
      this.player.structure.needsFeed() &&
      this.player.money >= stall.price;
    const canBoard =
      !this.player.skating &&
      !this.player.airborne &&
      !this.player.climbing &&
      !!this.nearestSkateboard();
    const canGrabWep = !!this.nearestPickup();
    const canBuzz = !!this.nearestBuzzball();
    const canLoot = !!nearestLootable(this.player, this.fighters);

    if (!canBribe && !canBuyWep && !canBuyFood && !canBoard && !canGrabWep && !canLoot && !canBuzz) {
      return;
    }

    if (canBribe || canBuyWep || canBuyFood || canBoard || canGrabWep || canBuzz) {
      const handled = this.tryWorldInteract();
      if (handled) clearPunchJust();
      return;
    }

    if (canLoot && tryLoot(this.player, this.fighters, (ev) => this.onCombat(ev))) {
      clearPunchJust();
    }
  }

  private policeBribeHint(): string | null {
    const copper = this.nearestBribeableCopper();
    if (!copper) return null;
    const cost = this.wanted.bribeCost();
    if (this.player.money < cost) {
      return `${this.actKey()} — bung the Bill £${cost} (skint)`;
    }
    return `${this.actKey()} — bung the Bill £${cost}`;
  }

  /** Slip the copper a bung — cools wanted and sends them packing. */
  private tryBribePolice(): boolean {
    const copper = this.nearestBribeableCopper();
    if (!copper) return false;
    const cost = this.wanted.bribeCost();
    if (this.player.money < cost) {
      this.spawnFloat(copper.x, copper.y - 56, `£${cost}, sunshine`);
      this.banner.setText(`Bill wants £${cost} to look the other way.`);
      return true;
    }
    this.player.money -= cost;
    this.wanted.acceptBribe(2.6);
    copper.takeBribe(this.time.now, this.player.x);
    this.spawnFloat(this.player.x, this.player.y - 56, `-£${cost}`);
    this.spawnFloat(copper.x, copper.y - 70, "cheers, mate");
    this.bubbles.say(copper, "Never saw you mush.", 2400);
    this.banner.setText("Bunged the Bill — heat's cooling off.");
    void chipSfx.coin();
    return true;
  }

  private weaponShopHint(shop: WeaponShop): string | null {
    if (shop.soldOut) return `${shop.label} — sold out`;
    const offer = shop.offer;
    if (!offer) return null;
    if (this.player.money < offer.price) {
      return `${shop.label} — ${offer.name} £${offer.price} (skint)`;
    }
    return `${this.actKey()} — buy ${offer.name} £${offer.price}`;
  }

  /** Buy unique kit from an arcade locker / fence. */
  private tryBuyWeapon(): boolean {
    const shop = this.nearestWeaponShop();
    if (!shop) return false;

    const outcome = shop.buy(this.player);
    if (outcome.ok) {
      if (this.player.weapon !== "none") {
        const old = this.player.dropWeapon();
        if (old) {
          this.spawnPickup(this.player.x - this.player.facing * 24, this.player.y, old);
        }
      }
      this.player.equipWeapon(outcome.kind);
      this.spawnFloat(this.player.x, this.player.y - 56, `-£${outcome.price}`);
      this.spawnFloat(shop.x, shop.y - 178, outcome.patter);
      this.banner.setText(
        `Bought a ${outcome.name} off ${shop.label} for £${outcome.price}.`,
      );
      void chipSfx.coin();
      return true;
    }

    const busyHere = !!nearestLootable(this.player, this.fighters) || !!this.nearestPickup();
    if (outcome.reason === "skint") {
      if (busyHere) return false;
      const price = shop.offer?.price ?? 0;
      this.spawnFloat(shop.x, shop.y - 178, `that's £${price}`);
      this.banner.setText(`${shop.label} wants cash up front.`);
      return true;
    }
    if (outcome.reason === "sold_out") {
      if (busyHere) return false;
      this.spawnFloat(shop.x, shop.y - 178, "sold out, mate");
      return true;
    }
    return false;
  }

  /** Kiosk prompt, or null when there's nothing to say about it. */
  private stallHint(stall: FoodStall): string | null {
    if (stall.soldOut) return null;
    if (!this.player.structure.needsFeed()) {
      return `${stall.label} — ${stall.item} £${stall.price} (you're alright)`;
    }
    if (this.player.money < stall.price) {
      return `${stall.label} — ${stall.item} £${stall.price} (skint)`;
    }
    return `${this.actKey()} — buy ${stall.item} £${stall.price}`;
  }

  /** Hand over cash at a kiosk. Returns true if the E press was used up here. */
  private tryBuyFood(): boolean {
    const stall = this.nearestStall();
    if (!stall) return false;

    const outcome = stall.buy(this.player);
    if (outcome.ok) {
      this.spawnFloat(this.player.x, this.player.y - 56, `-£${outcome.price}`);
      this.spawnFloat(stall.x, stall.y - 168, outcome.patter);
      this.banner.setText(
        `Got ${outcome.item} off ${stall.label} for £${outcome.price} — that's better.`,
      );
      void chipSfx.coin();
      return true;
    }

    // Don't swallow the press when there's something else here to grab
    const busyHere = !!nearestLootable(this.player, this.fighters) || !!this.nearestPickup();

    switch (outcome.reason) {
      case "skint":
        if (busyHere) return false;
        this.spawnFloat(stall.x, stall.y - 168, `that's £${stall.price}, mate`);
        this.banner.setText(`${stall.label} wants £${stall.price}. Go earn it.`);
        return true;
      case "not_hungry":
        if (busyHere) return false;
        this.spawnFloat(this.player.x, this.player.y - 56, "not hungry");
        return true;
      default:
        return false;
    }
  }

  private syncPlayerStealth(now: number, dt: number): void {
    const ducking = this.player.isDuckingInput();

    // Prefer a prop that already covers the player; else nearest hideable in reach
    let cover =
      this.destructibles.find((d) => d.coversPoint(this.player.x, this.player.y)) ?? null;
    if (!cover && ducking) {
      const near = this.nearestCover(78);
      if (near) {
        const dx = Math.abs(this.player.x - near.x);
        const dy = Math.abs(this.player.y - near.y);
        if (dx < near.rx + 24 && dy < near.ry + 40) cover = near;
      }
    }

    this.player.updateHide(now, dt, cover, ducking);

    if (this.player.hiding && !this.wasHiding) {
      this.banner.setText(
        `Ducked behind the ${this.player.coverHint} — A/D to peek.`,
      );
      this.spawnFloat(this.player.x, this.player.y - 56, "hidden");
    } else if (!this.player.hiding && this.wasHiding) {
      this.spawnFloat(this.player.x, this.player.y - 56, "out of cover");
    }
    this.wasHiding = this.player.hiding;
  }

  /**
   * Mate-to-mate idle chatter while nobody's clocked you. Solo lads still
   * mutter search lines on their own.
   */
  private syncIdleChatter(now: number): void {
    if (this.introPhase !== "done") return;
    if (now < this.chatterAt) return;
    if (this.enemies.some((e) => e.hasSpottedPlayer)) {
      this.chatterAt = now + 2500;
      return;
    }

    const patrol = this.enemies.filter((e) => e.isPatrolling && !e.isBackground);
    if (patrol.length === 0) {
      this.chatterAt = now + 2000;
      return;
    }

    // Prefer a call-and-response between two nearby lads
    for (let i = 0; i < patrol.length; i++) {
      const a = patrol[i]!;
      const b = patrol.find(
        (e) => e !== a && Phaser.Math.Distance.Between(a.x, a.y, e.x, e.y) < 240,
      );
      if (b) {
        const pair = IDLE_CHATTER[Math.floor(Math.random() * IDLE_CHATTER.length)]!;
        a.sayLine(pair[0], now, 3200);
        this.time.delayedCall(1600 + Math.random() * 500, () => {
          if (b.active && b.isPatrolling && !this.enemies.some((e) => e.hasSpottedPlayer)) {
            b.sayLine(pair[1], this.time.now, 3000);
          }
        });
        this.chatterAt = now + 6500 + Math.random() * 4500;
        return;
      }
    }

    // Alone on the patch — mutter a search line
    const lone = patrol[Math.floor(Math.random() * patrol.length)]!;
    const solo =
      lone.role === "sergeant"
        ? ["Fan out mush! Find him!", "Keep your eyes open!", "Squinny every street!"]
        : lone.role === "scout"
          ? ["I'll check up ahead mush.", "Nothing here yet!", "I'm squinnying the side street."]
          : [
              "Anything down your end mush?",
              "That dinlo can't be far!",
              "You lot seen him?",
              "Check behind the shops!",
              "Have a squinny round the bins!",
            ];
    lone.sayLine(solo[Math.floor(Math.random() * solo.length)]!, now);
    this.chatterAt = now + 5500 + Math.random() * 4000;
  }

  private playBlockImpact(defender: Fighter, attacker: Fighter): void {
    const midX = (defender.x + attacker.x) * 0.5;
    const midY = Math.min(defender.y, attacker.y) - 48;
    this.cameras.main.shake(55, 0.0045);
    defender.sprite.setTint(0xffe8c8);
    this.time.delayedCall(80, () => {
      if (defender.active) defender.sprite.clearTint();
    });
    // Soft shove so the guard reads
    const dir = Math.sign(defender.x - attacker.x) || defender.facing;
    defender.x += dir * 6;
    attacker.x -= dir * 4;

    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2 + Math.random() * 0.5;
      const spark = this.add
        .rectangle(midX, midY, 9 + Math.random() * 6, 2.2, 0xffe08a, 0.95)
        .setAngle((ang * 180) / Math.PI)
        .setDepth(190);
      this.tweens.add({
        targets: spark,
        x: midX + Math.cos(ang) * 20,
        y: midY + Math.sin(ang) * 16,
        alpha: 0,
        scaleX: 0.25,
        duration: 200 + Math.random() * 90,
        ease: "Quad.easeOut",
        onComplete: () => spark.destroy(),
      });
    }
  }

  /**
   * Throw near the Hovertravel craft — feed them into the spinning ducts.
   * `force` = just launched while standing by the fans (aim them in).
   */
  private tryFeedHoverFans(victim: Fighter, now: number, force: boolean): boolean {
    // Cuffs stay out; fresh slam KOs can still get sucked into the ducts
    if (victim.structure.cuffed || victim.inFanMince) return false;
    if (!force && victim.structure.isOut()) return false;
    const fans = this.parallax.getHovercraftFans();
    if (fans.length === 0) return false;
    const sample = fans[0]!;
    if (!this.parallax.isNearHoverFans(sample.x, sample.y, 1)) return false;

    if (force) {
      const px = this.player.x;
      const py = this.player.laneY;
      if (!this.parallax.isNearHoverFans(px, py, 200)) {
        return false;
      }
      // Prefer the duct the throw faces / the victim is closer to
      let best = fans[0]!;
      let bestD = Infinity;
      for (const f of fans) {
        const faceBias =
          Math.sign(f.x - px) === Math.sign(this.player.facing) ? 0 : 40;
        const d =
          Math.hypot(victim.x - f.x, victim.laneY - f.y) + faceBias;
        if (d < bestD) {
          bestD = d;
          best = f;
        }
      }
      this.chopInHoverFans(victim, best, now);
      return true;
    }

    for (const f of fans) {
      if (
        Math.abs(victim.x - f.x) < f.rx + 36 &&
        Math.abs(victim.y - f.y) < f.ry + 48
      ) {
        this.chopInHoverFans(victim, f, now);
        return true;
      }
    }
    return false;
  }

  private chopInHoverFans(
    victim: Fighter,
    fan: { x: number; y: number; rx: number; ry: number; bladeX: number; bladeY: number },
    now: number,
  ): void {
    if (victim.structure.cuffed || victim.inFanMince) return;
    victim.inFanMince = true;
    this.pendingChoppedMush = true;
    victim.tossVx = 0;
    victim.tossUntil = 0;
    victim.airborne = true;
    victim.jumpVy = 0;
    victim.clearCarMount();
    victim.clearPlantLock();
    victim.heldBy = null;
    victim.detachFromThrower();
    if (this.player.heldTarget === victim) this.player.heldTarget = null;
    victim.structure.knockOutCold();
    victim.setAction("out_cold", now, 999999);
    this.bubbles.clearOwner(victim);
    if (victim instanceof Civilian) victim.releaseDogIfAny(now);

    const bladeX = fan.bladeX;
    const bladeY = fan.bladeY;
    victim.setDepth(16);
    victim.sprite.setOrigin(0.5, 0.5);
    victim.sprite.y = 0;
    victim.weaponSprite.setVisible(false);

    this.cameras.main.shake(180, 0.012);
    this.spawnFloat(victim.x, victim.y - 70, "sucked in!");
    this.banner.setText("Straight up into the fans!");
    this.playThrowImpact(this.player, victim, "launch");
    void chipSfx.whoosh(true);
    this.parallax.revHovercraftFans();

    // 1) Yank off the promenade and up into the ducts
    this.tweens.add({
      targets: victim,
      x: bladeX,
      y: bladeY,
      angle: victim.facing * 380,
      duration: 420,
      ease: "Cubic.easeIn",
      onComplete: () => {
        if (!victim.active) return;
        void chipSfx.chop();
        this.cameras.main.shake(280, 0.018);
        this.spawnFloat(bladeX, bladeY - 36, "CHOPPED!");
        this.spinInHoverBlades(victim, bladeX, bladeY);
      },
    });

    const leaveIn = 420 + 920 + 280;
    this.hoverChopLeaveAt = this.time.now + leaveIn;
    this.time.delayedCall(leaveIn, () => {
      if (this.time.now + 40 < this.hoverChopLeaveAt) return;
      if (this.parallax.departHovercraftToIsle()) {
        this.spawnFloat(bladeX, bladeY - 80, "off to the Island!");
        this.banner.setText("Hovertravel's scarpering to the Isle of Wight.");
        void chipSfx.whoosh(true);
      }
    });
  }

  /** Spin them in the ducts, then they're gone. */
  private spinInHoverBlades(victim: Fighter, bladeX: number, bladeY: number): void {
    const orbit = { a: 0 };
    this.tweens.add({
      targets: orbit,
      a: Math.PI * 10,
      duration: 920,
      ease: "Sine.easeIn",
      onUpdate: () => {
        if (!victim.active) return;
        const r = 14 + Math.sin(orbit.a * 2) * 6;
        victim.x = bladeX + Math.cos(orbit.a) * r;
        victim.y = bladeY + Math.sin(orbit.a) * r * 0.72;
        victim.setAngle((orbit.a * 180) / Math.PI * 1.6);
        const pulse = 0.72 + Math.sin(orbit.a * 4) * 0.18;
        victim.setScale(pulse, pulse);
      },
      onComplete: () => {
        if (!victim.active) return;
        this.tweens.add({
          targets: victim,
          scaleX: 0.05,
          scaleY: 0.05,
          alpha: 0,
          angle: victim.angle + 220,
          duration: 260,
          ease: "Cubic.easeIn",
          onComplete: () => this.devourFanVictim(victim),
        });
      },
    });

    const spray = () => {
      if (!victim.active) return;
      for (let i = 0; i < 5; i++) {
        const blob = this.add
          .circle(
            bladeX + (Math.random() - 0.5) * 22,
            bladeY + (Math.random() - 0.5) * 16,
            2 + Math.random() * 4,
            0xa01818,
            0.9,
          )
          .setDepth(18);
        this.tweens.add({
          targets: blob,
          x: blob.x + (Math.random() - 0.5) * 70,
          y: blob.y - 8 - Math.random() * 50,
          alpha: 0,
          scale: 0.15,
          duration: 360 + Math.random() * 220,
          ease: "Quad.easeOut",
          onComplete: () => blob.destroy(),
        });
      }
    };
    spray();
    this.time.delayedCall(220, spray);
    this.time.delayedCall(440, spray);
    this.time.delayedCall(680, spray);

    for (let i = 0; i < 12; i++) {
      const blob = this.add
        .circle(
          bladeX + (Math.random() - 0.5) * 18,
          bladeY + (Math.random() - 0.5) * 14,
          3 + Math.random() * 4,
          0xa01818,
          0.9,
        )
        .setDepth(18);
      this.tweens.add({
        targets: blob,
        x: blob.x + (Math.random() - 0.5) * 80,
        y: blob.y - 10 - Math.random() * 70,
        alpha: 0,
        scale: 0.15,
        duration: 480 + Math.random() * 280,
        ease: "Quad.easeOut",
        onComplete: () => blob.destroy(),
      });
    }
  }

  private devourFanVictim(victim: Fighter): void {
    this.tweens.killTweensOf(victim);
    victim.setVisible(false);
    victim.setAlpha(0);
    victim.setScale(1);
    victim.setAngle(0);
    victim.airborne = false;
    victim.jumpVy = 0;
  }

  /** Body toss launch or mid-air pile-up — shake + flash (no chalk streaks). */
  private playThrowImpact(
    a: Fighter,
    b: Fighter,
    mode: "launch" | "pileup",
  ): void {
    const heavy = mode === "pileup";
    this.cameras.main.shake(heavy ? 110 : 75, heavy ? 0.009 : 0.0065);

    for (const f of [a, b]) {
      f.sprite.setTint(heavy ? 0xffd0a0 : 0xffe8c8);
      this.time.delayedCall(heavy ? 120 : 90, () => {
        if (f.active) f.sprite.clearTint();
      });
    }

    // Dust kick at the feet on launch
    if (mode === "launch") {
      for (let i = 0; i < 4; i++) {
        const dust = this.add
          .ellipse(
            b.x + (Math.random() - 0.5) * 18,
            b.y + 2,
            10 + Math.random() * 8,
            4 + Math.random() * 3,
            0xc4b8a0,
            0.55,
          )
          .setDepth(40);
        this.tweens.add({
          targets: dust,
          x: dust.x + a.facing * (12 + Math.random() * 16),
          y: dust.y - 6 - Math.random() * 8,
          alpha: 0,
          scaleX: 1.6,
          scaleY: 0.5,
          duration: 280 + Math.random() * 120,
          ease: "Quad.easeOut",
          onComplete: () => dust.destroy(),
        });
      }
    }
  }

  private spawnFloat(x: number, y: number, text: string): void {
    const t = this.add
      .text(x, y, text, {
        fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
        fontSize: "14px",
        color: "#1a1410",
        backgroundColor: "#f2e6d8",
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5)
      .setDepth(200);

    this.floatTexts.push(t);
    this.tweens.add({
      targets: t,
      y: y - 28,
      alpha: 0,
      duration: 700,
      onComplete: () => {
        t.destroy();
        this.floatTexts = this.floatTexts.filter((f) => f !== t);
      },
    });
  }

  private spawnBottleSmash(x: number, y: number): void {
    // Brief bottle silhouette that bursts
    if (this.textures.exists("weapon_bottle")) {
      const bottle = this.add
        .image(x, y, "weapon_bottle")
        .setDepth(185)
        .setScale(1.1)
        .setAngle(-20);
      this.tweens.add({
        targets: bottle,
        scaleX: 1.6,
        scaleY: 0.4,
        angle: 40,
        alpha: 0,
        duration: 180,
        onComplete: () => bottle.destroy(),
      });
    }
    // Radial glass burst
    for (let i = 0; i < 10; i++) {
      const ang = (Math.PI * 2 * i) / 10 + Math.random() * 0.4;
      const dist = 28 + Math.random() * 36;
      const shard = this.add.rectangle(
        x,
        y,
        2 + Math.random() * 5,
        2 + Math.random() * 4,
        0xb8e8f8,
      );
      shard.setDepth(186).setAngle(Math.random() * 360).setAlpha(0.95);
      this.tweens.add({
        targets: shard,
        x: x + Math.cos(ang) * dist,
        y: y + Math.sin(ang) * dist + 10,
        alpha: 0,
        angle: shard.angle + 200,
        scaleX: 0.4,
        duration: 320 + Math.random() * 220,
        ease: "Cubic.easeOut",
        onComplete: () => shard.destroy(),
      });
    }
    // Flash ring
    const flash = this.add.circle(x, y, 8, 0xe8f8ff, 0.7).setDepth(184);
    this.tweens.add({
      targets: flash,
      scale: 4.5,
      alpha: 0,
      duration: 220,
      onComplete: () => flash.destroy(),
    });
  }
}

/** 0 = fine, 1 = wrecked — combines integrity with lingering pain. */
function limbHurt(integrity: number, pain: number): number {
  const fromIntegrity = Math.max(0, (0.85 - integrity) / 0.85);
  const fromPain = Math.max(0, (pain - 0.2) / 0.8);
  return Math.min(1, Math.max(fromIntegrity, fromPain * 0.85));
}
