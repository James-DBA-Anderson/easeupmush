import Phaser from "phaser";
import { generateDoodleTextures } from "../assets/doodleTextures";
import { chipRock } from "../audio/ChipRock";
import { chipSfx } from "../audio/ChipSfx";
import { TITLE_LOGO_H, TITLE_LOGO_W } from "../assets/titleLogo";
import { isMobilePlay } from "../input/mobilePad";
import { dismissBootLoader } from "../ui/bootLoader";

type DemoFrame = {
  pose: string;
  /** Omit to hide the lad. */
  enemy?: string;
  /** Place him on the player's left (behind when facing right). */
  enemyBehind?: boolean;
  /** Pin enemy to the hero's current spot (powerbomb stays glued on). */
  enemyOnHero?: boolean;
  enemyNudge?: number;
  enemyLift?: number;
  /** Degrees — arc over the hip / shoulder. */
  enemyAngle?: number;
  /** Default true = faces left toward the player. */
  enemyFlip?: boolean;
  /** Slight lean / flip angle on the player (degrees). */
  heroAngle?: number;
  /** Spin around the torso (backflip) instead of the feet. */
  heroSpin?: boolean;
  /** Block / hit spark — shake + flash + clack mark. */
  impact?: boolean;
  /** Impact without the chalk spark streaks (throw slam). */
  impactNoSparks?: boolean;
  /** Hit weight for SFX (defaults from impact / block / slam). */
  hitSfx?: "light" | "mid" | "heavy" | "block" | "critical";
  /** Floored body jerks under a stomp. */
  twitch?: boolean;
  showBin?: boolean;
  lift?: number;
  nudge?: number;
  ms: number;
};

type DemoClip = {
  title: string;
  highlight: string;
  frames: DemoFrame[];
};

/** Stretch each demo frame — higher = slower cycle. */
const DEMO_TIME_SCALE = 1.85;
/** Beat between move demos so the callout can be read. */
const DEMO_CLIP_PAUSE_MS = 480;
/** Play each move this many times before advancing. */
const DEMO_LOOPS = 2;

const CONTROLS_DESKTOP: { id: string; keys: string; action: string }[] = [
  { id: "move", keys: "WASD", action: "move" },
  { id: "run", keys: "Shift / double-tap", action: "run" },
  { id: "jump", keys: "Space", action: "jump" },
  { id: "backflip", keys: "Back + Space", action: "backflip" },
  { id: "punch", keys: "J", action: "punch combo" },
  { id: "kick", keys: "K", action: "kick" },
  { id: "back", keys: "J + K", action: "back attack" },
  { id: "block", keys: "H", action: "block (hold)" },
  { id: "grab", keys: "L", action: "grab / throw" },
  { id: "jumpkick", keys: "Space + J", action: "jump kick" },
  { id: "stomp", keys: "Down + K", action: "stomp floored" },
  { id: "cover", keys: "C", action: "cover" },
  { id: "pickup", keys: "E", action: "pick up / buy" },
  { id: "loot", keys: "Q", action: "loot bodies" },
];

/** Pad labels — match the on-screen buttons / floating stick. */
const CONTROLS_MOBILE: { id: string; keys: string; action: string }[] = [
  { id: "move", keys: "Stick", action: "move" },
  { id: "run", keys: "Run", action: "hold Run · or double-tap stick" },
  { id: "jump", keys: "Jump", action: "jump" },
  { id: "backflip", keys: "Stick back + Jump", action: "backflip" },
  { id: "punch", keys: "Punch", action: "combo" },
  { id: "kick", keys: "Kick", action: "kick" },
  { id: "back", keys: "Punch + Kick", action: "back attack" },
  { id: "block", keys: "Block", action: "hold to block" },
  { id: "grab", keys: "Grab", action: "grab / throw" },
  { id: "jumpkick", keys: "Jump + Punch", action: "jump kick" },
  { id: "stomp", keys: "Stick down + Kick", action: "stomp floored" },
  { id: "cover", keys: "Stick down", action: "cover · hop off board" },
  { id: "pickup", keys: "Punch", action: "near kit, shop or board" },
  { id: "loot", keys: "Punch", action: "near a floored body" },
];

function controlsForDevice(): { id: string; keys: string; action: string }[] {
  return isMobilePlay() ? CONTROLS_MOBILE : CONTROLS_DESKTOP;
}

const DEMOS: DemoClip[] = [
  {
    title: "Stroll the seafront",
    highlight: "move",
    frames: [
      { pose: "walk0", nudge: -18, ms: 140 },
      { pose: "walk1", nudge: -6, ms: 140 },
      { pose: "walk2", nudge: 6, ms: 140 },
      { pose: "walk3", nudge: 18, ms: 140 },
      { pose: "walk0", nudge: 30, ms: 140 },
      { pose: "walk1", nudge: 18, ms: 140 },
      { pose: "walk2", nudge: 6, ms: 140 },
      { pose: "idle", nudge: 0, ms: 220 },
    ],
  },
  {
    title: "Get a shift on",
    highlight: "run",
    frames: [
      { pose: "run0", nudge: -24, ms: 90 },
      { pose: "run1", nudge: -8, ms: 90 },
      { pose: "run2", nudge: 10, ms: 90 },
      { pose: "run3", nudge: 28, ms: 90 },
      { pose: "run0", nudge: 40, ms: 90 },
      { pose: "run1", nudge: 20, ms: 90 },
      { pose: "idle", nudge: 0, ms: 200 },
    ],
  },
  {
    title: "Hop the kerb",
    highlight: "jump",
    frames: [
      { pose: "jump0", lift: 28, ms: 160 },
      { pose: "jump1", lift: 52, ms: 180 },
      { pose: "jump1", lift: 58, ms: 160 },
      { pose: "jump2", lift: 34, ms: 160 },
      { pose: "idle", lift: 0, ms: 220 },
    ],
  },
  {
    title: "Backflip the sneaks",
    highlight: "backflip",
    frames: [
      // Match in-game: jump0 → kick1 → jump1 with a full backward tuck
      {
        pose: "jump0",
        enemy: "idle",
        enemyBehind: true,
        lift: 18,
        nudge: -4,
        heroSpin: true,
        heroAngle: -25,
        ms: 90,
      },
      {
        pose: "jump0",
        enemy: "idle",
        enemyBehind: true,
        lift: 40,
        nudge: -10,
        heroSpin: true,
        heroAngle: -80,
        ms: 85,
      },
      {
        pose: "kick1",
        enemy: "idle",
        enemyBehind: true,
        lift: 54,
        nudge: -18,
        heroSpin: true,
        heroAngle: -150,
        ms: 85,
      },
      {
        pose: "kick1",
        enemy: "hurt",
        enemyBehind: true,
        lift: 50,
        nudge: -30,
        enemyNudge: -14,
        heroSpin: true,
        heroAngle: -220,
        impact: true,
        ms: 100,
      },
      {
        pose: "jump1",
        enemy: "hurt",
        enemyBehind: true,
        lift: 36,
        nudge: -38,
        enemyNudge: -28,
        heroSpin: true,
        heroAngle: -295,
        ms: 85,
      },
      {
        pose: "jump1",
        enemy: "down",
        enemyBehind: true,
        lift: 10,
        nudge: -34,
        enemyNudge: -40,
        heroSpin: true,
        heroAngle: -350,
        ms: 80,
      },
      {
        pose: "idle",
        enemy: "down",
        enemyBehind: true,
        nudge: -18,
        enemyNudge: -44,
        ms: 300,
      },
    ],
  },
  {
    title: "Jab → hook → upper",
    highlight: "punch",
    frames: [
      { pose: "jab0", enemy: "idle", nudge: 8, ms: 90 },
      { pose: "jab1", enemy: "hurt", nudge: 16, enemyNudge: 8, ms: 110 },
      { pose: "jab2", enemy: "hurt", nudge: 12, enemyNudge: 12, ms: 100 },
      { pose: "punch0", enemy: "idle", nudge: 10, ms: 90 },
      { pose: "punch1", enemy: "hurt", nudge: 20, enemyNudge: 14, ms: 120 },
      { pose: "punch2", enemy: "hurt", nudge: 14, enemyNudge: 18, ms: 100 },
      { pose: "upper0", enemy: "idle", nudge: 8, ms: 100 },
      { pose: "upper1", enemy: "hurt", nudge: 18, enemyNudge: 16, ms: 130 },
      { pose: "upper2", enemy: "hurt", nudge: 10, enemyNudge: 22, ms: 120 },
      { pose: "idle", enemy: "angry", nudge: 0, ms: 280 },
    ],
  },
  {
    title: "Boot him",
    highlight: "kick",
    frames: [
      { pose: "kick0", enemy: "idle", nudge: 6, ms: 100 },
      { pose: "kick1", enemy: "hurt", nudge: 18, enemyNudge: 16, ms: 160 },
      { pose: "kick2", enemy: "hurt", nudge: 12, enemyNudge: 22, ms: 120 },
      { pose: "idle", enemy: "angry", nudge: 0, ms: 260 },
    ],
  },
  {
    title: "Someone behind you?",
    highlight: "back",
    frames: [
      { pose: "backhand0", enemy: "idle", enemyBehind: true, nudge: -4, ms: 100 },
      {
        pose: "backhand1",
        enemy: "hurt",
        enemyBehind: true,
        nudge: -10,
        enemyNudge: -12,
        ms: 140,
      },
      {
        pose: "backhand2",
        enemy: "hurt",
        enemyBehind: true,
        nudge: -6,
        enemyNudge: -18,
        ms: 120,
      },
      { pose: "idle", enemy: "angry", enemyBehind: true, nudge: 0, ms: 260 },
    ],
  },
  {
    title: "Keep the guard up",
    highlight: "block",
    frames: [
      { pose: "block", enemy: "punch0", enemyNudge: 4, ms: 150 },
      { pose: "block", enemy: "punch1", enemyNudge: -6, ms: 110 },
      // Impact — fists eat the punch
      {
        pose: "block",
        enemy: "punch1",
        nudge: -12,
        enemyNudge: -2,
        heroAngle: -10,
        impact: true,
        ms: 90,
      },
      {
        pose: "block",
        enemy: "punch2",
        nudge: -8,
        enemyNudge: 6,
        heroAngle: -5,
        ms: 130,
      },
      { pose: "block", enemy: "idle", nudge: -2, heroAngle: -2, ms: 220 },
      { pose: "idle", enemy: "idle", nudge: 0, ms: 180 },
    ],
  },
  {
    title: "Grab and throw",
    highlight: "grab",
    frames: [
      // Scoop
      { pose: "punch0", enemy: "idle", enemyOnHero: true, nudge: 6, enemyNudge: 24, ms: 100 },
      { pose: "punch1", enemy: "hurt", enemyOnHero: true, nudge: 10, enemyNudge: 20, ms: 110 },
      {
        pose: "punch",
        enemy: "hold_gut",
        enemyOnHero: true,
        nudge: 12,
        enemyNudge: 16,
        enemyLift: 10,
        heroAngle: -4,
        ms: 120,
      },
      // Hoist onto the shoulders
      {
        pose: "crouch",
        enemy: "limp_arm",
        enemyOnHero: true,
        nudge: 8,
        enemyNudge: 10,
        enemyLift: 26,
        enemyAngle: -45,
        heroAngle: -8,
        ms: 110,
      },
      {
        pose: "upper0",
        enemy: "hurt",
        enemyOnHero: true,
        nudge: 4,
        enemyNudge: 4,
        enemyLift: 42,
        enemyAngle: -95,
        heroAngle: 2,
        ms: 120,
      },
      {
        pose: "upper0",
        enemy: "jump0",
        enemyOnHero: true,
        nudge: 2,
        enemyNudge: 0,
        enemyLift: 58,
        enemyAngle: -145,
        heroAngle: 8,
        ms: 130,
      },
      // Peak — parked up high
      {
        pose: "upper1",
        enemy: "kick0",
        enemyOnHero: true,
        nudge: 0,
        enemyNudge: 2,
        enemyLift: 64,
        enemyAngle: -175,
        heroAngle: 12,
        ms: 150,
      },
      // Sit-out drive into the mat
      {
        pose: "crouch",
        enemy: "limp_leg",
        enemyOnHero: true,
        nudge: 6,
        enemyNudge: 16,
        enemyLift: 46,
        enemyAngle: -215,
        heroAngle: 18,
        ms: 110,
      },
      {
        pose: "crouch",
        enemy: "hold_gut",
        enemyOnHero: true,
        nudge: 10,
        enemyNudge: 28,
        enemyLift: 24,
        enemyAngle: -255,
        heroAngle: 24,
        ms: 110,
      },
      {
        pose: "crouch",
        enemy: "hurt",
        enemyOnHero: true,
        nudge: 12,
        enemyNudge: 38,
        enemyLift: 8,
        enemyAngle: -285,
        heroAngle: 10,
        impactNoSparks: true,
        ms: 100,
      },
      {
        pose: "punch2",
        enemy: "down",
        enemyOnHero: true,
        nudge: 4,
        enemyNudge: 42,
        enemyLift: 0,
        enemyAngle: 0,
        impactNoSparks: true,
        ms: 400,
      },
    ],
  },
  {
    title: "From the air",
    highlight: "jumpkick",
    frames: [
      { pose: "jump0", enemy: "idle", lift: 24, nudge: -10, ms: 120 },
      { pose: "jump1", enemy: "idle", lift: 48, nudge: 4, ms: 140 },
      {
        pose: "jump_kick",
        enemy: "hurt",
        lift: 36,
        nudge: 22,
        enemyNudge: 14,
        ms: 200,
      },
      { pose: "jump2", enemy: "hurt", lift: 12, nudge: 10, enemyNudge: 20, ms: 140 },
      { pose: "idle", enemy: "down", lift: 0, nudge: 0, enemyNudge: 24, ms: 380 },
    ],
  },
  {
    title: "Put the boot in",
    highlight: "stomp",
    frames: [
      { pose: "idle", enemy: "down", enemyNudge: 16, ms: 180 },
      { pose: "stomp_up", enemy: "down", nudge: 16, enemyNudge: 16, ms: 160 },
      { pose: "stomp", enemy: "down", nudge: 20, enemyNudge: 16, twitch: true, ms: 240 },
      { pose: "stomp_up", enemy: "down", nudge: 16, enemyNudge: 18, ms: 140 },
      { pose: "stomp", enemy: "down", nudge: 22, enemyNudge: 14, twitch: true, ms: 240 },
      { pose: "idle", enemy: "down", nudge: 0, enemyNudge: 16, ms: 280 },
    ],
  },
  {
    title: "Duck behind cover",
    highlight: "cover",
    frames: [
      { pose: "idle", showBin: true, nudge: 24, ms: 180 },
      { pose: "crouch", showBin: true, nudge: -6, ms: 280 },
      // Slide out for a peek
      { pose: "crouch", showBin: true, nudge: 10, heroAngle: 6, ms: 320 },
      { pose: "crouch", showBin: true, nudge: 18, heroAngle: 8, ms: 400 },
      { pose: "crouch", showBin: true, nudge: 12, heroAngle: 4, ms: 280 },
      { pose: "crouch", showBin: true, nudge: -4, ms: 260 },
      { pose: "idle", showBin: true, nudge: 16, ms: 240 },
    ],
  },
  {
    title: "Pick up kit",
    highlight: "pickup",
    frames: [
      { pose: "walk0", nudge: -10, ms: 180 },
      { pose: "walk1", nudge: -2, ms: 160 },
      { pose: "idle", nudge: 6, ms: 200 },
      { pose: "crouch", nudge: 10, ms: 420 },
      { pose: "idle", nudge: 6, ms: 360 },
    ],
  },
  {
    title: "Nick the wallet",
    highlight: "loot",
    frames: [
      { pose: "idle", enemy: "down", enemyNudge: 14, ms: 200 },
      { pose: "crouch", enemy: "down", nudge: 14, enemyNudge: 14, ms: 420 },
      { pose: "crouch", enemy: "down", nudge: 14, enemyNudge: 14, ms: 280 },
      { pose: "idle", enemy: "down", nudge: 0, enemyNudge: 14, ms: 320 },
    ],
  },
];

export class BootScene extends Phaser.Scene {
  private hero!: Phaser.GameObjects.Image;
  private foe!: Phaser.GameObjects.Image;
  private bin!: Phaser.GameObjects.Image;
  private callout!: Phaser.GameObjects.Text;
  private logo!: Phaser.GameObjects.Image;
  private groundMark!: Phaser.GameObjects.Rectangle;
  private startHint!: Phaser.GameObjects.Text;
  private practiceHint?: Phaser.GameObjects.Text;
  private bg!: Phaser.GameObjects.Graphics;
  private controlsList: { id: string; keys: string; action: string }[] = [];
  private heroHome = { x: 0, y: 0 };
  private foeHome = { x: 0, y: 0 };
  private foeBehindHome = { x: 0, y: 0 };
  private binHome = { x: 0, y: 0 };
  private clipIndex = 0;
  private frameIndex = 0;
  private loopIndex = 0;
  private frameUntil = 0;
  private started = false;
  private foePlant = { x: 0, y: 0 };
  private twitchUntil = 0;
  private twitchDir = 1;
  /** Last demo enemy pose — used to fire hit SFX on connect frames. */
  private lastDemoEnemy: string | undefined;

  constructor() {
    super("BootScene");
  }

  create() {
    generateDoodleTextures(this);
    this.controlsList = controlsForDevice();
    const mobile = isMobilePlay();

    this.bg = this.add.graphics().setDepth(0);

    // Title composition is always 960×540. Scale.EXPAND can grow the canvas
    // (especially while the phone is still portrait under the rotate gate);
    // pinning to the design size keeps demo + Start on-camera after rotate.
    this.logo = this.add
      .image(0, 0, "title_logo")
      .setOrigin(0.5)
      .setDepth(5)
      .setScale(mobile ? 0.82 : 0.7);

    this.groundMark = this.add
      .rectangle(0, 0, 300, 10, 0x1a1410, 0.45)
      .setOrigin(0.5)
      .setDepth(1);

    this.bin = this.add
      .image(0, 0, "prop_bin")
      .setOrigin(0.5, 1)
      .setScale(1.15)
      .setVisible(false)
      .setDepth(1);

    this.foe = this.add
      .image(0, 0, "enemy_idle")
      .setOrigin(0.5, 1)
      .setScale(mobile ? 1.45 : 1.45)
      .setFlipX(true)
      .setVisible(false)
      .setDepth(2);

    this.hero = this.add
      .image(0, 0, "player_idle")
      .setOrigin(0.5, 1)
      .setScale(mobile ? 1.45 : 1.45)
      .setDepth(3);

    this.callout = this.add
      .text(0, 0, "", {
        fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
        fontSize: mobile ? "18px" : "20px",
        color: "#ffe08a",
        backgroundColor: "#1a1410cc",
        padding: { x: 12, y: 6 },
        align: "center",
      })
      .setOrigin(0.5, 0)
      .setDepth(10);

    if (!mobile) {
      this.practiceHint = this.add
        .text(0, 0, "Practice →", {
          fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
          fontSize: "15px",
          color: "#c4a882",
          backgroundColor: "#1a1410aa",
          padding: { x: 10, y: 4 },
        })
        .setOrigin(0, 1)
        .setDepth(10)
        .setInteractive({ useHandCursor: true });

      this.practiceHint.on("pointerover", () => this.practiceHint?.setColor("#ffe08a"));
      this.practiceHint.on("pointerout", () => this.practiceHint?.setColor("#c4a882"));
      this.practiceHint.on("pointerdown", () => {
        window.location.assign(new URL("debug.html", window.location.href).href);
      });
    }

    this.startHint = this.add
      .text(0, 0, "Start", {
        fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
        fontSize: mobile ? "28px" : "32px",
        color: "#1a1410",
        backgroundColor: "#ffe08a",
        padding: { x: 28, y: 12 },
        align: "center",
      })
      .setOrigin(0.5, 1)
      .setDepth(10)
      .setInteractive({ useHandCursor: true });

    this.startHint.on("pointerover", () =>
      this.startHint.setStyle({ backgroundColor: "#ffd060" }),
    );
    this.startHint.on("pointerout", () =>
      this.startHint.setStyle({ backgroundColor: "#ffe08a" }),
    );
    this.startHint.on("pointerdown", () => this.startBeach());

    this.layoutTitle();
    this.scale.on("resize", this.layoutTitle, this);
    // iOS often reports the portrait parent size on the first frame, then
    // the landscape size after rotate / URL-bar settle.
    this.time.delayedCall(80, this.layoutTitle);
    this.time.delayedCall(280, this.layoutTitle);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.layoutTitle, this);
    });

    // First gesture unlocks audio — chip rock + hit SFX under the title demo
    const unlockAudio = () => {
      void this.armChipRock(0.28);
    };
    this.input.once("pointerdown", unlockAudio);
    this.input.keyboard?.once("keydown", unlockAudio);

    this.clipIndex = 0;
    this.frameIndex = 0;
    this.loopIndex = 0;
    this.applyFrame(DEMOS[0]!.frames[0]!, DEMOS[0]!);
    this.frameUntil = this.time.now + this.frameDuration(DEMOS[0]!.frames[0]!);

    this.input.keyboard?.once("keydown", () => this.startBeach());

    // Let the first title frame paint, then drop the HTML loading screen
    this.time.delayedCall(0, () => dismissBootLoader());
  }

  /**
   * Fit the title to the live canvas — EXPAND phones are often shorter than
   * 540px, so a 960×540 band puts Start / the demo below the camera.
   */
  private layoutTitle = (): void => {
    if (this.started) return;
    const mobile = isMobilePlay();
    const viewW = Math.max(1, Math.round(this.scale.gameSize.width || this.scale.width));
    const viewH = Math.max(1, Math.round(this.scale.gameSize.height || this.scale.height));
    this.cameras.main.setViewport(0, 0, viewW, viewH);
    this.cameras.main.setSize(viewW, viewH);
    this.cameras.main.setScroll(0, 0);

    this.bg.clear();
    this.bg.fillGradientStyle(0x241c16, 0x241c16, 0x3a2c22, 0x3a2c22, 1);
    this.bg.fillRect(0, 0, viewW, viewH);

    const cx = viewW / 2;
    const logoScale = Math.min(
      mobile ? 0.84 : 0.7,
      (viewW - 36) / TITLE_LOGO_W,
      (viewH * 0.28) / TITLE_LOGO_H,
    );
    const logoH = TITLE_LOGO_H * logoScale;
    const logoY = 10 + logoH * 0.5;
    const startY = viewH - (mobile ? 14 : 22);
    const calloutY = Math.min(viewH * 0.7, startY - (mobile ? 64 : 72));
    const logoBottom = logoY + logoH * 0.5;
    const groundY = Phaser.Math.Clamp(
      (logoBottom + calloutY) * 0.52,
      logoBottom + 56,
      calloutY - 28,
    );
    const figureScale = mobile
      ? Phaser.Math.Clamp((calloutY - logoBottom) / 160, 0.95, 1.45)
      : 1.45;

    this.logo.setPosition(cx, logoY);
    this.tweens.killTweensOf(this.logo);
    this.logo.setScale(logoScale);
    this.tweens.add({
      targets: this.logo,
      scaleX: logoScale * 1.04,
      scaleY: logoScale * 1.04,
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: this.logo,
      y: logoY - 3,
      duration: 2400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    this.groundMark.setPosition(cx, groundY + 6);
    this.hero.setScale(figureScale);
    this.foe.setScale(figureScale);

    this.heroHome = { x: cx - 28, y: groundY };
    this.foeHome = { x: cx + 42, y: groundY };
    this.foeBehindHome = { x: cx - 88, y: groundY };
    this.binHome = { x: cx + 6, y: groundY };

    this.bin.setPosition(this.binHome.x, this.binHome.y);
    this.foe.setPosition(this.foeHome.x, this.foeHome.y);
    this.hero.setPosition(this.heroHome.x, this.heroHome.y);
    this.callout.setPosition(cx, calloutY);
    this.startHint.setPosition(cx, startY);
    this.practiceHint?.setPosition(20, startY);

    const clip = DEMOS[this.clipIndex];
    const frame = clip?.frames[this.frameIndex];
    if (clip && frame) this.applyFrame(frame, clip);
  };

  update(_time: number, _delta: number): void {
    if (this.started) return;
    const now = this.time.now;
    this.updateTwitch(now);
    if (now < this.frameUntil) return;

    const clip = DEMOS[this.clipIndex]!;
    this.frameIndex += 1;
    let pause = 0;
    if (this.frameIndex >= clip.frames.length) {
      this.loopIndex += 1;
      this.frameIndex = 0;
      if (this.loopIndex >= DEMO_LOOPS) {
        this.loopIndex = 0;
        this.clipIndex = (this.clipIndex + 1) % DEMOS.length;
        this.lastDemoEnemy = undefined;
        pause = DEMO_CLIP_PAUSE_MS;
      } else {
        // Short beat between the two plays of the same move
        this.lastDemoEnemy = undefined;
        pause = 220;
      }
    }
    const nextClip = DEMOS[this.clipIndex]!;
    const frame = nextClip.frames[this.frameIndex]!;
    this.applyFrame(frame, nextClip);
    this.frameUntil = now + this.frameDuration(frame) + pause;
  }

  private frameDuration(frame: DemoFrame): number {
    return Math.round(frame.ms * DEMO_TIME_SCALE);
  }

  private applyFrame(frame: DemoFrame, clip: DemoClip): void {
    const heroKey = `player_${frame.pose}`;
    if (this.textures.exists(heroKey)) this.hero.setTexture(heroKey);

    const heroX = this.heroHome.x + (frame.nudge ?? 0);
    const lift = frame.lift ?? 0;
    // Feet stay on the ground line; lift raises the whole body
    const heroY = this.heroHome.y - lift;
    // Backflip (and other aerial spins) rotate around the torso, not the feet
    if (frame.heroSpin) {
      this.hero.setOrigin(0.5, 0.5);
      const halfH = this.hero.displayHeight * 0.5;
      this.hero.setPosition(heroX, heroY - halfH);
    } else {
      this.hero.setOrigin(0.5, 1);
      this.hero.setPosition(heroX, heroY);
    }
    this.hero.setAngle(frame.heroAngle ?? 0);

    const showEnemy = frame.enemy !== undefined;
    this.foe.setVisible(showEnemy);
    if (!showEnemy || frame.enemy !== "down") {
      this.twitchUntil = 0;
      this.foe.clearTint();
    }
    if (showEnemy) {
      const foeKey = `enemy_${frame.enemy}`;
      if (this.textures.exists(foeKey)) this.foe.setTexture(foeKey);

      const floored = frame.enemy === "down";
      const angled = !floored && (frame.enemyAngle ?? 0) !== 0;
      // Flip over the hip — rotate around the torso, stay glued to the thrower
      this.foe.setOrigin(0.5, angled ? 0.55 : 1);
      this.foe.setAngle(floored ? 0 : (frame.enemyAngle ?? 0));
      this.foe.setFlipX(frame.enemyFlip ?? true);

      let baseX = this.foeHome.x;
      let baseY = this.foeHome.y;
      if (frame.enemyBehind) {
        baseX = this.foeBehindHome.x;
        baseY = this.foeBehindHome.y;
      } else if (frame.enemyOnHero && !floored) {
        // Stay glued during the throw; plant on the stage once he's down
        baseX = heroX;
        baseY = heroY;
      } else if (frame.enemyOnHero && floored) {
        baseX = heroX;
        baseY = this.foeHome.y;
      }
      // Down canvas is shorter with padding under the body — sink onto the ground line
      const sink = floored ? Math.round(this.foe.displayHeight * 0.1) : 0;
      const foeX = baseX + (frame.enemyNudge ?? 0);
      const foeY = baseY - (floored ? 0 : (frame.enemyLift ?? 0)) + sink;
      this.foePlant = { x: foeX, y: foeY };
      this.foe.setPosition(foeX, foeY);
      // During the arc, draw him in front so the flip reads over the shoulder
      const overTop = angled && (frame.enemyLift ?? 0) > 30;
      this.foe.setDepth(frame.enemyBehind ? 2.5 : overTop ? 4 : 2);

      if (frame.twitch) {
        this.twitchDir = Math.random() < 0.5 ? -1 : 1;
        this.twitchUntil = this.time.now + 520;
        this.cameras.main.shake(55, 0.0045);
        this.foe.setTint(0xffc8c8);
      }
    } else {
      this.foe.setAngle(0);
      this.foe.setOrigin(0.5, 1);
    }

    const showBin = !!frame.showBin;
    this.bin.setVisible(showBin);
    if (showBin) {
      this.bin.setPosition(this.binHome.x, this.binHome.y);
      this.hero.setDepth(frame.pose === "crouch" ? 0.5 : 3);
      this.bin.setDepth(frame.pose === "crouch" ? 2 : 1);
    } else {
      this.hero.setDepth(3);
    }

    const ctrl = this.controlsList.find((c) => c.id === clip.highlight);
    this.callout.setText(
      ctrl ? `${ctrl.keys}\n${ctrl.action}` : clip.title,
    );

    const prevEnemy = this.lastDemoEnemy;
    this.lastDemoEnemy = frame.enemy;

    // Connect SFX: tagged impacts, first hurt/down frame, or stomp twitch
    const justConnected =
      showEnemy &&
      (frame.enemy === "hurt" || frame.enemy === "down") &&
      prevEnemy !== "hurt" &&
      prevEnemy !== "down";
    const playHit =
      frame.impact || frame.impactNoSparks || frame.twitch || justConnected;

    if (playHit) {
      const impactX =
        showEnemy && frame.enemy === "down"
          ? this.foePlant.x
          : heroX + (frame.enemyNudge ?? 18);
      const impactY =
        showEnemy && frame.enemy === "down"
          ? this.foePlant.y - 18
          : heroY - 58;
      const weight =
        frame.hitSfx ??
        (frame.pose === "block" || clip.highlight === "block"
          ? "block"
          : frame.impactNoSparks || frame.twitch || frame.enemy === "down"
            ? "heavy"
            : frame.pose.startsWith("jab")
              ? "light"
              : "mid");
      this.playImpact(impactX, impactY, !frame.impactNoSparks && !frame.twitch, weight);
    } else {
      this.hero.clearTint();
    }
  }

  private updateTwitch(now: number): void {
    if (!this.foe.visible) return;
    if (now >= this.twitchUntil) {
      if (this.twitchUntil > 0) {
        this.twitchUntil = 0;
        this.foe.clearTint();
        this.foe.setAngle(0);
        this.foe.setPosition(this.foePlant.x, this.foePlant.y);
      }
      return;
    }
    const left = this.twitchUntil - now;
    const strength = Phaser.Math.Clamp(left / 520, 0.35, 1);
    const kick = Math.sin(now * 0.045) * Math.cos(now * 0.028);
    const jolt = Math.sin(now * 0.09) * 0.7;
    this.foe.setPosition(
      this.foePlant.x + this.twitchDir * (kick * 10 + jolt * 5) * strength,
      this.foePlant.y - Math.abs(Math.sin(now * 0.07)) * 9 * strength,
    );
    this.foe.setAngle(this.twitchDir * (kick * 16 + jolt * 8) * strength);
  }

  private playImpact(
    x: number,
    y: number,
    sparks = true,
    weight: "light" | "mid" | "heavy" | "block" | "critical" = "mid",
  ): void {
    this.cameras.main.shake(weight === "block" ? 45 : 70, weight === "heavy" ? 0.008 : 0.006);
    void chipSfx.hit(weight);
    if (weight !== "block") {
      this.hero.setTint(0xffe8c8);
      this.time.delayedCall(70, () => {
        if (!this.started) this.hero.clearTint();
      });
    }

    if (!sparks || weight === "block") return;

    // Chalk spark at the gloves — no silly onomatopoeia
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + Math.random() * 0.4;
      const len = 10 + Math.random() * 10;
      const spark = this.add
        .rectangle(x, y, len, 2.5, 0xffe08a, 0.95)
        .setAngle((ang * 180) / Math.PI)
        .setDepth(12);
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(ang) * 22,
        y: y + Math.sin(ang) * 18,
        alpha: 0,
        scaleX: 0.3,
        duration: 220 + Math.random() * 100,
        ease: "Quad.easeOut",
        onComplete: () => spark.destroy(),
      });
    }
  }

  private armChipRock(heat: number): void {
    void chipRock.unlock().then(() => {
      chipRock.setMode("title");
      chipRock.setHeat(heat);
      return chipRock.start();
    });
  }

  private startBeach() {
    if (this.started) return;
    this.started = true;
    // Ease title down; BeachScene.create takes over with the calm bed
    void chipRock.unlock().then(() => {
      chipRock.setMode("bed");
      chipRock.setHeat(0.18);
      return chipRock.start();
    });
    this.scene.start("BeachScene");
  }
}
