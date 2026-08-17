import Phaser from "phaser";
import { COMMON, LANE } from "../constants";
import type { StrikeInput, StrikeResult } from "../combat/Structure";
import { Fighter, inReach } from "./Fighter";
import { getLook, pickLook } from "../assets/pompeyLooks";
import { standingFaceAnchor } from "../assets/sorFigure";
import { steerAway, type Obstacle } from "../world/obstacles";

/** Background patrol stays on the common — never up on the sea. */
const BG_MIN_Y = COMMON.minY;
const BG_MAX_Y = COMMON.maxY;

const INSULTS = [
  "Come on then mush!",
  "You what mush?",
  "Fancy it, dinlo?",
  "Oi!",
  "Have it!",
  "Wrong beach mate",
  "Pompey!",
  "What's your game?",
  "Think you're hard, dinlo?",
  "Outside then!",
  "I'll have you mush",
  "Shut it dinlo",
  "Go on then",
  "Have a squinny at this!",
  "Squinny this way mush!",
  "You absolute dinlo",
  "Alright mush — let's have it",
  "What you squinnying at?",
];

const STOMP_LINES = [
  "Stamp him!",
  "Boot him mush!",
  "On the floor dinlo!",
  "Have that!",
  "Put the boot in!",
  "Stamp the dinlo!",
];

const PAIN_LINES = [
  "Agh!",
  "Ow!",
  "My ribs!",
  "You git!",
  "Argh!",
  "Ease up mush!",
  "Ow — you dinlo!",
];

const SHADE_BREAK_LINES = [
  "ME SHADES!",
  "You broke me glasses mush!",
  "Those were brand new!",
  "Right — you're having it dinlo!",
  "My Ray-Bans!",
  "Squinny at that — ruined!",
];

const CALL_DURATION_MS = 3400;

type Mood = "patrol" | "alert" | "fight";
type CallOutcome = "success" | "interrupted";
export type EnemyRole = "thug" | "scout" | "sergeant";

export interface EnemyOptions {
  toughness?: number;
  boss?: boolean;
  homeRadius?: number;
  aggroRange?: number;
  scaleBoost?: number;
  /** Mad lads don't guard — they just come at you. */
  mad?: boolean;
  /** Scouts report sightings; sergeants direct the search. */
  role?: EnemyRole;
  /** Loitering up on the common — only joins the scrap if he clocks you. */
  background?: boolean;
  /** Debug arena — freeze AI (stand still) instead of fighting. */
  debugStand?: boolean;
  /** Pin a specific doodle (Casey turning on you, etc.) instead of a random thug. */
  lookId?: string;
}

/**
 * Beach thugs — wander their patch on their own; clock and scrap when provoked.
 * Cagey ones block a lot and may phone mates; mad / steamed ones swing freely.
 */
export class Enemy extends Fighter {
  readonly isBoss: boolean;
  /** Weaker thugs prefer circling behind rather than trading face-on. */
  readonly likesFlank: boolean;
  /** Temper — mad means almost no blocking. Can flip true when shades smash. */
  mad: boolean;
  /**
   * Debug arena: stand still (default) instead of AI fight/patrol.
   * Flip off for normal enemy behaviour.
   */
  debugStand = false;
  readonly role: EnemyRole;
  /** Up on the common / background — not in the fight lane yet. */
  private inBackground: boolean;
  private rushingIn = false;
  private thinkAt = 0;
  private readonly aggroRange: number;
  private homeX: number;
  private homeY: number;
  private homeRadius: number;
  private mood: Mood = "patrol";
  private target: Fighter | null = null;
  private insultAt = 0;
  private pendingInsult: string | null = null;
  private weaveDir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
  private weaveUntil = 0;
  private patrolDir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
  private rethinkAt = 0;
  private laneTarget = 0;
  private alertUntil = 0;
  private flankSide: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
  /** Phoning mates — interrupt before he says where. */
  private callActive = false;
  private callSaidWhere = false;
  private callStage = 0;
  private callLocation = "the front";
  private callOutcome: CallOutcome | null = null;
  private callUsed = false;
  private painCryAt = 0;
  private sightingPending = false;
  /** Waiting his turn while mates are already on you. */
  private holdingBack = false;
  /** Occasional aviators — smash them and he loses it. */
  private wearsShades = false;
  private shadesGfx: Phaser.GameObjects.Graphics | null = null;
  private shadesBrokeAt = 0;
  /** Props to walk around this frame (bins, cars, etc.). */
  private frameObstacles: Obstacle[] = [];

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    name = "Lad",
    toughnessOrOpts: number | EnemyOptions = 0.85,
  ) {
    const opts: EnemyOptions =
      typeof toughnessOrOpts === "number" ? { toughness: toughnessOrOpts } : toughnessOrOpts;
    const look = (opts.lookId ? getLook(opts.lookId) : undefined) ?? pickLook("enemy");
    const boost = opts.scaleBoost ?? (opts.boss ? 1.28 : 1);
    const toughness = opts.toughness ?? (opts.boss ? 3.6 : 0.85);
    const named = !!opts.lookId;
    super(scene, x, y, "enemy", look.id, name, {
      toughness,
      scaleX: look.scaleX * boost,
      scaleY: look.scaleY * boost,
      build: look.build,
      present: look.present,
      loot: {
        money: opts.boss
          ? 40 + Math.floor(Math.random() * 40)
          : 8 + Math.floor(Math.random() * 25),
        weapon: named
          ? "none"
          : opts.boss
            ? Math.random() < 0.5
              ? "bat"
              : "brick"
            : Math.random() < 0.4
              ? "bottle"
              : Math.random() < 0.15
                ? "brick"
                : "none",
      },
    });
    this.isBoss = !!opts.boss;
    this.likesFlank = !this.isBoss && toughness < 1.05;
    this.mad = !!opts.mad;
    this.debugStand = !!opts.debugStand;
    this.role = opts.role ?? (opts.boss ? "sergeant" : "thug");
    this.inBackground = !!opts.background;
    // Brief scramble so a jab storm can't pin them on the deck forever
    this.getUpGraceMs = this.isBoss ? 280 : 620;
    this.speed = opts.boss ? 128 : 95;
    this.runSpeed = opts.boss ? 245 : 170;
    this.homeX = x;
    this.homeY = opts.background
      ? Phaser.Math.Clamp(y, BG_MIN_Y, BG_MAX_Y)
      : y;
    this.homeRadius = opts.homeRadius ?? (opts.boss ? 260 : opts.background ? 280 : 160);
    this.aggroRange = opts.aggroRange ?? (opts.boss ? 460 : opts.background ? 360 : 300);
    this.laneTarget = this.homeY;
    if (this.inBackground) {
      this.y = this.homeY;
      this.groundY = this.homeY;
      this.applyBackgroundLook(true);
    }
    // Occasional shades — bosses and named faces skip the gag
    if (!this.isBoss && !named && Math.random() < 0.3) {
      this.wearsShades = true;
      this.shadesGfx = scene.add.graphics();
      this.add(this.shadesGfx);
      this.syncShades();
    }
    if (this.mad) {
      this.structure.anger = 0.15;
    } else if (this.role === "sergeant") {
      this.structure.anger = 0.15;
    }
    if (opts.boss) {
      // Hardman comes in steaming and armed more often
      this.structure.anger = Math.max(this.structure.anger, 0.55);
      this.mad = true;
      if (this.structure.loot.weapon === "bat" || Math.random() < 0.65) {
        this.equipWeapon(this.structure.loot.weapon === "brick" ? "brick" : "bat");
      }
    }
  }

  override get isBackground(): boolean {
    return this.inBackground;
  }

  private applyBackgroundLook(bg: boolean): void {
    if (bg) {
      this.setAlpha(0.88);
      this.setDepth(3);
      this.applyPerspectiveScale();
    } else {
      this.setAlpha(1);
      this.applyPerspectiveScale();
    }
  }

  takeInsult(): string | null {
    if (this.structure.downed || this.structure.isOut()) {
      this.pendingInsult = null;
      return null;
    }
    const line = this.pendingInsult;
    this.pendingInsult = null;
    return line;
  }

  get hasSpottedPlayer(): boolean {
    return (
      (this.mood !== "patrol" && this.target?.team === "player") ||
      (this.rushingIn && this.target?.team === "player")
    );
  }

  /** Scouts use this once so everyone in earshot can react to the report. */
  takeSightingReport(): boolean {
    const pending = this.sightingPending;
    this.sightingPending = false;
    return pending;
  }

  cryOutInPain(now: number): void {
    // Keep the "ME SHADES!" line — don't drown it in a generic ow
    if (this.shadesBrokeAt > 0) return;
    if (now < this.painCryAt || this.structure.downed || this.structure.isOut()) return;
    this.painCryAt = now + 850 + Math.random() * 650;
    this.pendingInsult = PAIN_LINES[Math.floor(Math.random() * PAIN_LINES.length)]!;
  }

  /** Consume call result once (success = mates coming, interrupted = wave cancelled). */
  takeCallOutcome(): CallOutcome | null {
    const o = this.callOutcome;
    this.callOutcome = null;
    return o;
  }

  get isPhoningMates(): boolean {
    return this.callActive && this.action === "call";
  }

  get isPatrolling(): boolean {
    return this.mood === "patrol" && !this.structure.isOut();
  }

  /** Push a one-shot line into the speech bubble queue. */
  sayLine(line: string, now: number, holdMs = 2800): void {
    if (this.structure.downed || this.structure.isOut() || this.callActive) return;
    this.pendingInsult = line;
    this.insultAt = now + holdMs;
  }

  get wearingShades(): boolean {
    return this.wearsShades;
  }

  /** True once after shades shatter — scene can float the smash text. */
  takeShadesBreak(): boolean {
    if (this.shadesBrokeAt <= 0) return false;
    this.shadesBrokeAt = 0;
    return true;
  }

  override receiveStrike(hit: StrikeInput): StrikeResult {
    const result = super.receiveStrike(hit);
    if (this.wearsShades && result !== "blocked" && !this.structure.isOut()) {
      this.breakShades(hit.now, hit.knockDir ?? this.facing);
    }
    // Guarantee a readable freeze on every standing connect — AI can't step/swing through it
    if (
      result !== "blocked" &&
      !this.structure.isOut() &&
      !this.structure.downed &&
      this.action !== "out_cold" &&
      this.action !== "crawl" &&
      this.action !== "cuffed"
    ) {
      const minStun =
        result === "tased"
          ? 900
          : result === "stumble" || result === "disabled"
            ? 520
            : result === "winded"
              ? 420
              : 340;
      if (this.action !== "hitstun" || this.actionUntil < hit.now + minStun) {
        this.setAction("hitstun", hit.now, minStun);
      }
    }
    return result;
  }

  override refreshVisuals(now: number, dt: number): void {
    super.refreshVisuals(now, dt);
    this.syncShades();
  }

  private breakShades(now: number, knockDir: number): void {
    if (!this.wearsShades) return;
    this.wearsShades = false;
    this.shadesBrokeAt = now;
    this.shadesGfx?.destroy();
    this.shadesGfx = null;

    this.mad = true;
    this.structure.anger = Math.max(this.structure.anger, 0.85);
    this.mood = "fight";
    this.dropBlock(now);
    // Whoever just clocked him becomes the target of his meltdown
    // (target is set via onProvoked from combat — keep mood fight regardless)
    this.pendingInsult =
      SHADE_BREAK_LINES[Math.floor(Math.random() * SHADE_BREAK_LINES.length)]!;
    this.insultAt = now + 3200;
    this.spawnShadeShards(knockDir);
  }

  private spawnShadeShards(knockDir: number): void {
    const face = Math.sign(knockDir) || this.facing;
    for (let i = 0; i < 5; i++) {
      const shard = this.scene.add
        .rectangle(
          this.x + face * 4 + (Math.random() - 0.5) * 10,
          this.y - 58 + (Math.random() - 0.5) * 8,
          4 + Math.random() * 5,
          2 + Math.random() * 3,
          0x1a1a22,
          0.95,
        )
        .setDepth(this.depth + 2)
        .setAngle(Math.random() * 360);
      const vx = face * (40 + Math.random() * 90) + (Math.random() - 0.5) * 40;
      const vy = -80 - Math.random() * 70;
      this.scene.tweens.add({
        targets: shard,
        x: shard.x + vx * 0.35,
        y: shard.y + vy * 0.25,
        angle: shard.angle + (Math.random() < 0.5 ? -140 : 140),
        alpha: 0,
        duration: 420 + Math.random() * 220,
        ease: "Quad.easeOut",
        onComplete: () => shard.destroy(),
      });
    }
  }

  private syncShades(): void {
    const g = this.shadesGfx;
    if (!g || !this.wearsShades) return;
    g.clear();
    // Hide on the floor / crawl / tumble — lenses only read upright
    if (
      this.structure.downed ||
      this.structure.isOut() ||
      this.isBeingTossed ||
      this.isInThrowArc ||
      this.action === "down" ||
      this.action === "crawl" ||
      this.action === "jump_kick" ||
      this.action === "swanton" ||
      this.action === "hurricanrana" ||
      this.sprite.originY < 0.9
    ) {
      return;
    }

    // Side-on wraparound — one lens over the drawn eye, arm to the ear
    const face = this.facing < 0 ? -1 : 1;
    const srcH = Math.max(1, this.sprite.frame.height);
    const srcW = Math.max(1, this.sprite.frame.width);
    const scaleY = this.sprite.displayHeight / srcH;
    const scaleX = this.sprite.displayWidth / srcW;
    const anchor = standingFaceAnchor(this.bodyBuild, this.present, 92);

    // Crouch / duck dips the skull in the doodle — nudge lenses with it
    let dip = 0;
    if (this.isHidden) dip = 22;
    else if (this.action === "stomp") dip = 8;
    else if (this.action === "kick") dip = 4;

    const ox = this.sprite.x + face * anchor.xFromCenter * scaleX;
    const oy = this.sprite.y - (anchor.yFromFeet - dip) * scaleY;
    const lean = this.sprite.rotation;
    // Scale lenses with the figure (tall lads + lane depth)
    const sc = scaleY;

    g.save();
    g.translateCanvas(ox, oy);
    g.rotateCanvas(lean);
    g.scaleCanvas(face * sc, sc);

    // Temple arm — thin bar back along the skull
    g.lineStyle(2.2, 0x0c0c10, 1);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(-10, -1.5);
    g.lineTo(-14, 2);
    g.strokePath();

    // Wrap lens — covers the doodle eye (slightly oversized so tall builds still clip it)
    g.fillStyle(0x10141c, 0.96);
    g.lineStyle(2.2, 0x08080a, 1);
    g.fillEllipse(1.5, 0.5, 16.5, 11.5);
    g.strokeEllipse(1.5, 0.5, 16.5, 11.5);

    // Brow bar on the frame
    g.lineStyle(2, 0x2a3038, 1);
    g.lineBetween(-5, -4.5, 8.5, -3.8);

    // Catchlight
    g.fillStyle(0xe8f0f8, 0.5);
    g.fillEllipse(-1.5, -1.2, 5.2, 2.8);

    g.restore();
  }

  /** Cagey lads can phone for backup — not mad / boss. */
  canCallForHelp(): boolean {
    if (this.inBackground) return false;
    if (this.mad || this.isBoss) return false;
    if (this.callUsed || this.callActive) return false;
    if (this.structure.isOut() || this.structure.downed) return false;
    if (!this.structure.armsUsable()) return false;
    return true;
  }

  /** Start the phone call — speak where he is mid-call; interrupt before that to cancel. */
  startCallForHelp(now: number, location: string): boolean {
    if (!this.canCallForHelp()) return false;
    if (!this.tryCall(now, CALL_DURATION_MS)) return false;
    this.callActive = true;
    this.callSaidWhere = false;
    this.callStage = 0;
    this.callLocation = location;
    this.callUsed = true;
    this.callOutcome = null;
    this.pendingInsult = "Oi mush — get down here!";
    return true;
  }

  onProvoked(now: number, by?: Fighter): void {
    if (this.debugStand) return;
    if (this.structure.downed || this.structure.isOut()) {
      this.pendingInsult = null;
      return;
    }
    if (by && !by.structure.isOut()) this.target = by;
    this.mood = "fight";
    if (this.shadesBrokeAt > 0) return;
    if (!this.callActive) {
      if (this.role === "sergeant") {
        const orders = [
          "Get round him mush!",
          "Don't let that dinlo through!",
          "Pile in, lads!",
          "Cut him off — squinny left!",
        ];
        this.pendingInsult = orders[Math.floor(Math.random() * orders.length)]!;
        this.insultAt = now + 2400;
      } else {
        this.queueInsult(now, true);
      }
    }
  }

  /** Debug arena — freeze or release AI. */
  setDebugStand(stand: boolean, now = 0, provoke?: Fighter): void {
    this.debugStand = stand;
    if (stand) {
      this.target = null;
      this.mood = "patrol";
      this.dropBlock(now);
      if (
        this.action === "move" ||
        this.action === "run" ||
        this.action === "block" ||
        this.action === "call"
      ) {
        this.action = "idle";
        this.actionUntil = now;
      }
    } else if (provoke && !provoke.structure.isOut()) {
      this.onProvoked(now, provoke);
    }
  }

  private queueInsult(now: number, force = false, stomp = false): void {
    if (this.callActive) return;
    if (this.structure.downed || this.structure.isOut()) {
      this.pendingInsult = null;
      return;
    }
    if (!force && now < this.insultAt) return;
    this.insultAt = now + (this.isBoss ? 2200 : 3000) + Math.random() * 2800;
    if (stomp) {
      this.pendingInsult = STOMP_LINES[Math.floor(Math.random() * STOMP_LINES.length)]!;
      this.insultAt = now + 900 + Math.random() * 700;
      return;
    }
    const lines = this.isBoss
      ? [
          "This is MY front mush",
          "South Parade ends here dinlo",
          "You've had it now mush",
          "Big mistake dinlo",
          "Come get some!",
          "Have a squinny — you're finished",
          ...INSULTS,
        ]
      : INSULTS;
    this.pendingInsult = lines[Math.floor(Math.random() * lines.length)]!;
  }

  private tickCall(now: number): void {
    if (!this.callActive) return;

    // Clipped / action broken — if he already said where, mates are coming anyway
    if (this.action !== "call") {
      this.finishCall(this.callSaidWhere);
      return;
    }

    const progress = 1 - (this.actionUntil - now) / CALL_DURATION_MS;
    if (this.callStage < 1 && progress >= 0.28) {
      this.callStage = 1;
      this.pendingInsult = "We're by…";
    } else if (this.callStage < 2 && progress >= 0.52) {
      this.callStage = 2;
      this.callSaidWhere = true;
      this.pendingInsult = `${this.callLocation}!`;
    } else if (this.callStage < 3 && progress >= 0.78) {
      this.callStage = 3;
      this.pendingInsult = "Get down here mush — now!";
    }

    if (progress >= 0.98 || now >= this.actionUntil) {
      this.finishCall(true);
    }
  }

  private finishCall(success: boolean): void {
    if (!this.callActive && this.callOutcome) return;
    this.callActive = false;
    if (this.action === "call") {
      this.action = "idle";
      this.actionUntil = 0;
    }
    this.callOutcome = success ? "success" : "interrupted";
  }

  updateEnemy(now: number, dt: number, fighters: Fighter[], obstacles: Obstacle[] = []): void {
    this.frameObstacles = obstacles;
    this.tickKnockdown(now);

    try {
      if (this.structure.isOut()) {
        if (this.callActive) this.finishCall(this.callSaidWhere);
        if (this.isCrawlingAway) {
          this.crawlAlong(dt, 26, LANE.minX, LANE.maxX);
        }
        this.alpha = this.structure.looted ? 0.55 : 1;
        return;
      }

      this.tickCall(now);

      // Clinched — stay limp until tossed or released
      if (this.heldBy) {
        if (this.heldBy.heldTarget !== this || this.heldBy.structure.isOut()) {
          this.heldBy = null;
        } else {
          if (this.callActive) this.finishCall(this.callSaidWhere);
          this.action = "hitstun";
          return;
        }
      }

      // Mid throw arc — don't fight the thrower poses
      if (this.isInThrowArc || this.isBeingTossed) {
        if (this.callActive) this.finishCall(this.callSaidWhere);
        return;
      }

      // Debug arena — statue mode for testing throws / cars / etc.
      if (this.debugStand) {
        if (this.callActive) this.finishCall(false);
        this.target = null;
        this.mood = "patrol";
        if (
          this.action === "move" ||
          this.action === "run" ||
          this.action === "block" ||
          this.action === "call"
        ) {
          this.action = "idle";
          this.actionUntil = now;
        }
        return;
      }

      // Soft floor — stay limp. Don't face/chase (that mirrored the KO doodle
      // when the player jumped past). Airborne toss flight still animates above.
      if (
        this.structure.downed &&
        now < this.structure.groundedUntil &&
        !this.isBeingTossed
      ) {
        if (this.callActive) this.finishCall(this.callSaidWhere);
        if (!this.airborne) this.action = "down";
        return;
      }

      // Stale down action after a soft floor cleared — don't pose-flicker
      if (this.action === "down" && !this.structure.downed && !this.structure.isOut()) {
        this.action = "idle";
        this.actionUntil = now;
      }

      // Split-second hitstun — no chase / swing until it clears
      if (this.action === "hitstun" && now < this.actionUntil) {
        if (this.callActive) this.finishCall(this.callSaidWhere);
        this.running = false;
        return;
      }

      // Planted on the phone — don't move or fight until done / interrupted
      if (this.action === "call") {
        if (this.target) this.faceToward(this.target.x, now);
        return;
      }

      // Drive the boot into them during the slam half of the stomp
      if (this.action === "stomp") {
        const progress = 1 - (this.actionUntil - now) / 520;
        if (progress >= 0.4 && progress < 0.78) {
          this.x += this.facing * 70 * dt;
          this.clampPos();
        }
      }

      if (!this.canAct(now) && this.action !== "block") return;
      if (this.busy && this.action !== "block") return;

    // Background loiterers — wander the common until they clock you, then rush in
    if (this.inBackground) {
      this.updateBackground(now, dt, fighters);
      return;
    }

    this.pickTargetAndMood(now, fighters);

    if (this.mood === "patrol") {
      this.updatePatrol(now, dt);
      return;
    }

    if (!this.target || this.target.structure.isOut()) {
      this.mood = "patrol";
      this.target = null;
      this.updatePatrol(now, dt);
      return;
    }

    if (this.mood === "alert") {
      this.updateAlert(now, dt);
      return;
    }

    this.updateFight(now, dt);
    } finally {
      this.refreshVisuals(now, dt);
    }
  }

  /**
   * Up on the common — occasional silhouette. Spots the player across the
   * promenade and sprints down into the scrap.
   */
  private updateBackground(now: number, dt: number, fighters: Fighter[]): void {
    const player = fighters.find((f) => f.team === "player" && !f.structure.isOut());

    if (this.rushingIn && player) {
      this.updateBackgroundRush(now, dt, player);
      return;
    }

    if (player && this.canSpotFromBackground(player)) {
      this.target = player;
      this.mood = "fight";
      this.rushingIn = true;
      this.sightingPending = this.role === "scout" || Math.random() < 0.55;
      const lines =
        this.role === "scout"
          ? ["I've got him mush! Down there!", "Squinny — on the front!", "Spotted the dinlo!"]
          : this.role === "sergeant"
            ? ["There he is mush! Get him!", "On the promenade — move!"]
            : ["Oi mush — that's him!", "There he is!", "Get that dinlo!"];
      this.pendingInsult = lines[Math.floor(Math.random() * lines.length)]!;
      this.insultAt = now + 2400;
      return;
    }

    // Idle wander along the common
    if (now >= this.rethinkAt) {
      this.rethinkAt = now + 1100 + Math.random() * 1600;
      if (Math.random() < 0.35) this.patrolDir *= -1;
      if (Math.random() < 0.4) {
        this.laneTarget = Phaser.Math.Clamp(
          this.homeY + (Math.random() - 0.5) * 36,
          BG_MIN_Y,
          BG_MAX_Y,
        );
      }
      if (Math.abs(this.x - this.homeX) > this.homeRadius) {
        this.patrolDir = this.x < this.homeX ? 1 : -1;
      }
    }

    const spd = this.speed * 0.42 * this.structure.moveSpeedFactor();
    const vy = Math.sign(this.laneTarget - this.y) * 0.3;
    this.stepAround(this.patrolDir, vy, spd, dt, BG_MIN_Y, BG_MAX_Y);
    this.x = Phaser.Math.Clamp(
      this.x,
      Math.max(LANE.minX, this.homeX - this.homeRadius),
      Math.min(LANE.maxX, this.homeX + this.homeRadius),
    );
    this.y = Phaser.Math.Clamp(this.y, BG_MIN_Y, BG_MAX_Y);
    this.groundY = this.y;
    this.setFacing(this.patrolDir, now);
    this.action = "move";
    this.running = false;
    this.setDepth(3);
  }

  private canSpotFromBackground(player: Fighter): boolean {
    if (player.isHidden) return false;
    const dx = Math.abs(player.x - this.x);
    // Need a decent look at them on the promenade — not miles off-screen
    if (dx > this.aggroRange) return false;
    if (dx > 220 && Math.random() > 0.02) return false;
    // Scouts clock you from further; others need you closer / clearer
    const need = this.role === "scout" ? 300 : this.role === "sergeant" ? 260 : 220;
    return dx < need;
  }

  private updateBackgroundRush(now: number, dt: number, player: Fighter): void {
    this.faceToward(player.x, now);
    const goalY = LANE.minY + 28 + Math.random() * 20;
    const dx = player.x - this.x;
    const dy = goalY - this.y;
    const len = Math.hypot(dx, dy) || 1;
    const spd = this.runSpeed * this.structure.moveSpeedFactor() * 1.05;
    this.running = true;
    this.action = "run";
    this.x += (dx / len) * spd * dt;
    this.y += (dy / len) * spd * dt;
    this.x = Phaser.Math.Clamp(this.x, LANE.minX, LANE.maxX);
    // Never step up into the sea while dropping in from the common
    this.y = Phaser.Math.Clamp(this.y, BG_MIN_Y, LANE.maxY);
    this.groundY = this.y;

    // Dropped into the fight lane — join the scrap properly
    if (this.y >= LANE.minY + 10) {
      this.joinPlayArea(player);
    }
  }

  private joinPlayArea(player: Fighter): void {
    this.inBackground = false;
    this.rushingIn = false;
    this.y = Phaser.Math.Clamp(this.y, LANE.minY, LANE.maxY);
    this.groundY = this.y;
    this.homeX = this.x;
    this.homeY = this.y;
    this.homeRadius = 160;
    this.laneTarget = this.y;
    this.target = player;
    this.mood = "fight";
    this.applyBackgroundLook(false);
  }

  private pickTargetAndMood(now: number, fighters: Fighter[]): void {
    const living = fighters.filter(
      (f) => f !== this && !f.structure.isOut() && (f.team === "player" || f.team === "enemy"),
    );

    const player = living.find((f) => f.team === "player");
    const playerDown =
      !!player &&
      player.structure.downed &&
      now < player.structure.groundedUntil;
    const distToPlayer = player
      ? Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y)
      : Number.POSITIVE_INFINITY;
    // Hidden behind cover — patrols only clock you if they basically walk into you
    const hideBlind = !!player?.isHidden && this.mood === "patrol";
    const spotRange = hideBlind
      ? 52
      : playerDown
        ? this.aggroRange * 1.35
        : this.aggroRange;
    const nearPlayer = !!player && distToPlayer < spotRange;

    // Floored player — everyone in range piles in
    if (playerDown && nearPlayer && player) {
      this.mood = "fight";
      this.target = player;
      return;
    }

    // Already fighting — stick with target unless gone
    if (this.mood === "fight" && this.target && !this.target.structure.isOut()) {
      const d = Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y);
      if (d < this.aggroRange * 1.35) return;
      this.mood = "patrol";
      this.target = null;
      return;
    }

    if (nearPlayer && player) {
      const d = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
      const playerScrap =
        player.action === "jab" ||
        player.action === "hook" ||
        player.action === "upper" ||
        player.action === "punch" ||
        player.action === "kick" ||
        player.action === "whirl" ||
        player.action === "slide" ||
        player.action === "stomp" ||
        player.action === "hitstun";
      if (this.mood === "patrol") {
        this.mood = "alert";
        this.target = player;
        // Scrap already going — jump in faster
        this.alertUntil = now + (playerScrap ? 400 + Math.random() * 500 : 1800 + Math.random() * 1600);
        if (this.role === "scout") {
          const reports = [
            "I've got him mush! Over here!",
            "Squinny — there he is!",
            "Spotted the dinlo — this way!",
          ];
          this.pendingInsult = reports[Math.floor(Math.random() * reports.length)]!;
          this.sightingPending = true;
          this.insultAt = now + 2600;
        } else if (this.role === "sergeant") {
          const orders = [
            "There mush! Box him in!",
            "Lads — move in on that dinlo!",
            "Don't let him scarper — squinny left!",
          ];
          this.pendingInsult = orders[Math.floor(Math.random() * orders.length)]!;
          this.insultAt = now + 2400;
        } else {
          this.queueInsult(now, true);
        }
      } else if (d < 70 || this.structure.anger >= 0.3 || (playerScrap && d < 160)) {
        this.mood = "fight";
        this.target = player;
      }
      return;
    }

    // Mate already in a scrap — pile in from further away
    const scrap = living.find(
      (f) =>
        f.team === "enemy" &&
        f !== this &&
        (f.action === "punch" ||
          f.action === "hook" ||
          f.action === "jab" ||
          f.action === "kick" ||
          f.action === "stomp" ||
          f.action === "hitstun" ||
          f.action === "headbutt") &&
        Phaser.Math.Distance.Between(this.x, this.y, f.x, f.y) < 260,
    );
    if (scrap && Math.random() < 0.04) {
      this.mood = "fight";
      this.target = player ?? scrap;
      this.queueInsult(now, true);
      return;
    }

    if (this.mood !== "patrol" && (!nearPlayer || now > this.alertUntil + 4000)) {
      this.mood = "patrol";
      this.target = null;
    }
  }

  private updatePatrol(now: number, dt: number): void {
    if (now >= this.rethinkAt) {
      this.rethinkAt = now + 900 + Math.random() * 1400;
      if (Math.random() < 0.4) this.patrolDir *= -1;
      if (Math.random() < 0.45) {
        this.laneTarget = Phaser.Math.Clamp(
          this.homeY + (Math.random() - 0.5) * this.homeRadius * 0.8,
          LANE.minY,
          LANE.maxY,
        );
      }
      if (Math.abs(this.x - this.homeX) > this.homeRadius) {
        this.patrolDir = this.x < this.homeX ? 1 : -1;
      }
    }

    const legMul = this.structure.moveSpeedFactor();
    const spd = this.speed * 0.55 * legMul;
    const vy = Math.sign(this.laneTarget - this.y) * 0.35;
    this.stepAround(this.patrolDir, vy, spd, dt);
    this.x = Phaser.Math.Clamp(
      this.x,
      Math.max(LANE.minX, this.homeX - this.homeRadius),
      Math.min(LANE.maxX, this.homeX + this.homeRadius),
    );
    this.y = Phaser.Math.Clamp(this.y, LANE.minY, LANE.maxY);
    this.groundY = this.y;
    this.setFacing(this.patrolDir, now);
    this.action = "move";
    this.running = false;
  }

  private updateAlert(now: number, dt: number): void {
    const t = this.target!;
    const dist = Phaser.Math.Distance.Between(this.x, this.y, t.x, t.y);
    this.faceToward(t.x, now);

    if (now >= this.alertUntil || dist < 65) {
      this.mood = "fight";
      return;
    }

    if (now >= this.weaveUntil) {
      this.weaveUntil = now + 450 + Math.random() * 600;
      this.weaveDir = Math.random() < 0.5 ? 1 : -1;
    }

    const dx = t.x - this.x;
    const dy = t.y - this.y;
    const len = Math.hypot(dx, dy) || 1;
    const prefer = this.isBoss ? 110 : this.likesFlank ? 120 : 100;
    let mx: number;
    let my: number;
    if (dist < prefer) {
      mx = (-dx / len) * 0.35 + this.weaveDir * 0.9;
      my = this.weaveDir * 0.35;
    } else if (this.likesFlank && t.team === "player") {
      // Drift toward a rear lane slot while still wary
      const slot = this.flankSlot(t);
      mx = (slot.x - this.x) / Math.max(1, Math.abs(slot.x - this.x) + Math.abs(slot.y - this.y));
      my = (slot.y - this.y) / Math.max(1, Math.abs(slot.x - this.x) + Math.abs(slot.y - this.y));
    } else {
      mx = (dx / len) * 0.4 + this.weaveDir * 0.5;
      my = (dy / len) * 0.35;
    }
    const mLen = Math.hypot(mx, my) || 1;
    const spd = this.speed * this.structure.moveSpeedFactor() * 0.5;
    this.stepAround(mx / mLen, my / mLen, spd, dt);
    this.clampPos();
    this.action = "move";

    if (now >= this.insultAt) this.queueInsult(now);
  }

  /** Told to wait his turn — only a couple of lads crowd you at once. */
  setHoldBack(hold: boolean): void {
    this.holdingBack = hold;
  }

  private updateFight(now: number, dt: number): void {
    const t = this.target!;
    const floored = t.structure.downed && now < t.structure.groundedUntil;

    if (this.holdingBack && !this.isBoss) {
      this.updateWaitTurn(now, dt, t);
      return;
    }

    if (floored) {
      this.updateSwarmStomp(now, dt);
      return;
    }

    if (this.likesFlank && t.team === "player") {
      this.updateFlankFight(now, dt);
      return;
    }

    this.updateStraightFight(now, dt);
  }

  /** Hover just out of range, mouthing off, until a slot opens up. */
  private updateWaitTurn(now: number, dt: number, t: Fighter): void {
    if (this.action === "block") this.dropBlock(now);
    this.faceToward(t.x, now);
    const dist = Phaser.Math.Distance.Between(this.x, this.y, t.x, t.y);
    const keep = 145;

    if (now >= this.weaveUntil) {
      this.weaveUntil = now + 500 + Math.random() * 700;
      this.weaveDir = Math.random() < 0.5 ? 1 : -1;
    }

    const dx = t.x - this.x;
    const dy = t.y - this.y;
    const len = Math.hypot(dx, dy) || 1;
    // Close in if too far, back off if crowding, else shuffle sideways
    const drive = dist > keep + 30 ? 0.7 : dist < keep - 30 ? -0.7 : 0;
    const mx = (dx / len) * drive + this.weaveDir * 0.5;
    const my = (dy / len) * drive * 0.6 + this.weaveDir * 0.25;
    const mLen = Math.hypot(mx, my) || 1;
    const spd = this.speed * this.structure.moveSpeedFactor() * 0.6;
    this.stepAround(mx / mLen, my / mLen, spd, dt);
    this.clampPos();
    this.action = "move";

    if (now >= this.insultAt && dist < 240) this.queueInsult(now);
  }

  /** Cagey lads keep the guard up; mad / angry ones don't bother. */
  private wantsGuard(): boolean {
    if (this.mad) return false;
    if (this.structure.anger >= 0.28) return false;
    if (!this.structure.armsUsable()) return false;
    if (this.structure.guard < 0.28) return false;
    return true;
  }

  private playerIsSwinging(t: Fighter): boolean {
    return (
      t.action === "jab" ||
      t.action === "hook" ||
      t.action === "upper" ||
      t.action === "punch" ||
      t.action === "kick" ||
      t.action === "whirl" ||
      t.action === "slide" ||
      t.action === "jump_kick" ||
      t.action === "swanton" ||
      t.action === "hurricanrana" ||
      t.action === "headbutt" ||
      t.action === "backhand" ||
      t.action === "weapon_swing" ||
      t.action === "low_blow"
    );
  }

  /** Prefer guard when in scrap range — attack only in gaps. */
  private tryFightAction(now: number, t: Fighter): boolean {
    const close = inReach(this, t, this.attackReach + 8);
    if (!close) return false;
    // Hold an existing block briefly, then re-think
    if (now < this.thinkAt && this.action === "block") {
      this.tryBlock(now);
      return true;
    }
    if (now < this.thinkAt) return true;

    this.thinkAt = now + (this.isBoss ? 520 : 820) + Math.random() * 320;

    if (this.wantsGuard()) {
      const swing = this.playerIsSwinging(t);
      // Cover up when fists are coming; otherwise mostly swing back
      const coverChance = swing ? 0.28 : 0.1;
      if (Math.random() < coverChance) {
        this.tryBlock(now);
        if (Math.random() < 0.2) this.queueInsult(now);
        return true;
      }
    }

    this.dropBlock(now);
    if (Math.random() < 0.35) this.queueInsult(now);
    if (this.isBoss) {
      // Hardman presses harder — headbutts, kicks, weapon swings
      const roll = Math.random();
      if (roll < 0.28) this.tryPunch(now, true);
      else if (roll < 0.5) this.tryKick(now);
      else if (this.weapon !== "none" && roll < 0.78) this.tryPunch(now, false);
      else this.tryPunch(now, false);
    } else if (this.structure.anger >= 0.4 && Math.random() < 0.55) {
      this.tryKick(now);
    } else if (this.weapon !== "none" && Math.random() < 0.45) {
      this.tryPunch(now, false);
    } else {
      this.tryPunch(now, false);
    }
    return true;
  }

  /** Rush a floored body and put the boot in. */
  private updateSwarmStomp(now: number, dt: number): void {
    const t = this.target!;
    this.faceToward(t.x, now);
    const dist = Phaser.Math.Distance.Between(this.x, this.y, t.x, t.y);

    if (inReach(this, t, this.attackReach + 14) && now >= this.thinkAt) {
      this.thinkAt = now + 720 + Math.random() * 420;
      if (Math.random() < 0.4) this.queueInsult(now, true, true);
      // Hesitate more — less stomp-loop when you're scrambling up
      if (Math.random() < 0.32) this.tryStomp(now);
      return;
    }

    if (now >= this.insultAt && dist < 200) this.queueInsult(now, false, true);

    const dx = t.x - this.x;
    const dy = t.y - this.y;
    const len = Math.hypot(dx, dy) || 1;
    const spd = this.runSpeed * this.structure.moveSpeedFactor() * 1.05;
    this.running = true;
    this.stepAround(dx / len, dy / len, spd, dt);
    this.clampPos();
    this.action = "run";
  }

  /** Circle to the player's back, then dig in. */
  private updateFlankFight(now: number, dt: number): void {
    const t = this.target!;
    const slot = this.flankSlot(t);
    const behind = (this.x - t.x) * t.facing < -10;
    const slotDist = Phaser.Math.Distance.Between(this.x, this.y, slot.x, slot.y);

    this.faceToward(t.x, now);

    if (this.tryFightAction(now, t)) return;

    // Not yet behind — path to the rear slot (lane first, then behind)
    if (this.action === "block") this.dropBlock(now);
    const goalX = behind ? t.x : slot.x;
    const goalY = slotDist > 20 ? slot.y : t.y;
    const dx = goalX - this.x;
    const dy = goalY - this.y;
    const len = Math.hypot(dx, dy) || 1;
    const spd = this.speed * this.structure.moveSpeedFactor() * (behind ? 1.05 : 1.15);
    this.running = !behind && slotDist > 50;
    this.stepAround(dx / len, dy / len, spd, dt);
    this.clampPos();
    this.action = this.running ? "run" : "move";

    if (now >= this.insultAt && Phaser.Math.Distance.Between(this.x, this.y, t.x, t.y) < 220) {
      this.queueInsult(now);
    }
  }

  private updateStraightFight(now: number, dt: number): void {
    const t = this.target!;
    const dist = Phaser.Math.Distance.Between(this.x, this.y, t.x, t.y);
    this.faceToward(t.x, now);

    if (this.tryFightAction(now, t)) return;

    if (this.action === "block") this.dropBlock(now);
    if (now >= this.insultAt && dist < 240) this.queueInsult(now);

    const dx = t.x - this.x;
    const dy = t.y - this.y;
    const len = Math.hypot(dx, dy) || 1;
    const rush = this.isBoss ? 1.35 : this.structure.anger >= 0.5 ? 1.2 : 1;
    // Brief cover while closing only if fists are already coming
    if (this.wantsGuard() && dist < 100 && this.playerIsSwinging(t) && Math.random() < 0.4) {
      this.tryBlock(now);
      const spd = this.speed * this.structure.moveSpeedFactor() * 0.55;
      this.stepAround(dx / len, dy / len, spd, dt);
      this.clampPos();
      return;
    }
    const spd = this.speed * this.structure.moveSpeedFactor() * rush;
    this.running = dist > 100 && this.isBoss;
    this.stepAround(dx / len, dy / len, spd, dt);
    this.clampPos();
    this.action = this.running ? "run" : "move";
  }

  private flankSlot(t: Fighter): { x: number; y: number } {
    return {
      x: t.x - t.facing * 52,
      y: Phaser.Math.Clamp(t.y + this.flankSide * 40, LANE.minY, LANE.maxY),
    };
  }

  /** Walk with soft avoidance so lads don't pin themselves on bins / motors. */
  private stepAround(
    vx: number,
    vy: number,
    spd: number,
    dt: number,
    laneMin = LANE.minY,
    laneMax = LANE.maxY,
  ): void {
    if (this.frameObstacles.length === 0) {
      this.x += vx * spd * dt;
      this.y += vy * spd * 0.85 * dt;
      return;
    }
    const steered = steerAway(this.x, this.y, vx, vy, this.frameObstacles, 58, laneMin, laneMax);
    this.x += steered.vx * spd * dt;
    this.y += steered.vy * spd * 1.0 * dt;
  }

  private clampPos(): void {
    this.x = Phaser.Math.Clamp(this.x, LANE.minX, LANE.maxX);
    if (this.inBackground) {
      // Still on the common / rushing in — never above the shingle into the sea
      this.y = Phaser.Math.Clamp(this.y, BG_MIN_Y, LANE.maxY);
    } else {
      this.y = Phaser.Math.Clamp(this.y, LANE.minY, LANE.maxY);
    }
    this.groundY = this.y;
  }
}
