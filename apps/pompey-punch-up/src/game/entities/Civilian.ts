import Phaser from "phaser";
import { Fighter, inReach, KICKFLIP_MS } from "./Fighter";
import type { StrikeInput, StrikeResult } from "../combat/Structure";
import { LANE, PROMENADE } from "../constants";
import { steerAway, type Obstacle } from "../world/obstacles";
import { Dog } from "./Dog";
import { getLook, pickLook, pickLookPresent, type Present } from "../assets/pompeyLooks";
import { isMobilePlay } from "../input/mobilePad";

export type CivilianVariant =
  | "walker"
  | "jogger"
  | "bike"
  | "scooter"
  | "skater"
  | "wheelchair"
  | "dog_walker";

export type CrashOutcome = "angry" | "knocked" | "flee";

const JOIN_LINES = [
  "I'm with you mush!",
  "Have some of that dinlo!",
  "Not on my front!",
  "Two of us now mush!",
  "Oi — leave him!",
  "Come on then!",
  "That's out of order!",
  "Let's have 'em mush!",
  "Squinny at this — pile in!",
  "You what dinlo?!",
];

/** How Casey calls the inputs while showing a move. */
const CASEY_MOVE_CALLS: Record<string, string> = {
  combo: "Three-hit combo — J, J, J!",
  back_attack: "Back attack — hit J and K together!",
  headbutt: "Running headbutt — run then J!",
  jump_kick: "Jump kick — Space, then J in the air!",
  jump_kick_mobile: "Jump kick — just tap Kick!",
  swanton: "Swanton — up on a motor, then Space + K!",
  hurricanrana: "Hurricanrana — off a motor onto a standing mug, K!",
  grab: "Grab 'em — L!",
  body_toss: "Powerbomb — grab, then L again!",
  german_suplex: "German — grab from behind, then L!",
  low_blow: "Low blow — U!",
  stomp: "Floor stomp — Down + K on a floored one!",
  weapon: "Weapon swing — pick one up with E, then J!",
  throw: "Chuck it — bottle or brick, then J!",
  slide: "Running slide — run then K!",
  whirl: "Whirl — Down + K while standing!",
};

const MISSUS_HURT_LINES = [
  "OI — that's my missus!",
  "Leave her alone mush!",
  "You what dinlo?!",
  "Don't you touch her!",
  "Right — you're having it!",
  "Get off her!",
  "Have a squinny at yourself!",
];

/** Locals stepping over floored lads on the prom. */
const BODY_STEP_LINES = [
  "Mind the floor mush…",
  "Excuse me love — bit of a mess.",
  "Ooh, sorry mate — didn't see you there.",
  "They're having a lie-down then.",
  "Don't mind me — just stepping over.",
  "Rough night for someone.",
  "Watch your step — bodies about.",
  "Charming. Absolute state of the prom.",
  "I'll just… go round. Or over. Over's fine.",
  "Is he alright? No? Right then.",
];

/** Locals stepping over ditched bikes / scooters. */
const WRECK_STEP_LINES = [
  "Mind the bike mush…",
  "Who left that there?",
  "Watch the wheels love.",
  "Bit of a scrapheap on the prom.",
  "I'll just step over — cheers.",
  "Scooter's had it then.",
  "Don't mind me — just clearing the bike.",
  "Absolute state. Bike's gone.",
];

/** Crashed bike / scooter left on the lane — walk-over, never a wall. */
export type MountWreck = {
  x: number;
  y: number;
  rx: number;
  ry: number;
  sprite: Phaser.GameObjects.Image;
};

const mountWrecks: MountWreck[] = [];

/** Active crashed mounts on the prom (prunes destroyed sprites). */
export function getMountWrecks(): readonly MountWreck[] {
  for (let i = mountWrecks.length - 1; i >= 0; i--) {
    if (!mountWrecks[i]!.sprite.active) mountWrecks.splice(i, 1);
  }
  return mountWrecks;
}

function leaveMountWreck(
  scene: Phaser.Scene,
  x: number,
  y: number,
  key: string,
  passDir: 1 | -1,
): void {
  const dump = scene.add
    .image(x, y, key)
    .setOrigin(0.5, 1)
    .setAngle(passDir * 55)
    .setDepth(6)
    .setAlpha(0.9);
  const wreck: MountWreck = { x, y, rx: 38, ry: 20, sprite: dump };
  mountWrecks.push(wreck);
  scene.tweens.add({
    targets: dump,
    alpha: 0.4,
    duration: 8000,
    delay: 5000,
  });
}
/** One-sided overheard calls — odd locals nattering while they stroll. */
const PHONE_CHATS: string[][] = [
  [
    "No Mum, I'm not in a fight…",
    "That's just the seagulls again mush.",
    "Yes I'll bring milk. And a pasty. Bye.",
  ],
  [
    "You're breaking up — am I under the pier?",
    "Hang on, wind's eaten half your sentence.",
    "Chips first. Then I'll ring you back mush.",
  ],
  [
    "He said he'd be five minutes.",
    "That was forty minutes ago.",
    "What a dinlo. I'm divorcing 'five minutes'.",
  ],
  [
    "Tell Dad the blue army still exists.",
    "No I will not wear the hat.",
    "Because it's a hat, Karen — don't squinny at me.",
  ],
  [
    "I'm on the front mush.",
    "No, the actual front. With the sea.",
    "Not Facebook. The beach. Have a squinny outside.",
  ],
  [
    "Don't put me on speaker to Nan.",
    "…Hi Nan.",
    "Yes I've eaten. No I'm not cold. Love you mush. Bye.",
  ],
  [
    "If this is about the group chat again—",
    "I left because of the memes mush.",
    "The memes, Darren. The memes.",
  ],
  [
    "Mush I can hear a brass band and a fight.",
    "Southsea's doing its usual.",
    "I'll text when I'm not being dive-bombed.",
  ],
  [
    "Put it on my tab.",
    "What do you mean I haven't got a tab dinlo?",
    "…Right. Card it is. Humiliating.",
  ],
  [
    "She wants to meet by the Pier.",
    "Which bit? It's basically a county.",
    "Fine — the bit with the chips. Landmark achieved mush.",
  ],
  [
    "I'm not lost.",
    "I'm exploring mush.",
    "Okay I'm lost. Near a bin that smells of destiny.",
  ],
  [
    "Stop sending me estate agent links dinlo.",
    "I live in a flat the size of a fridge.",
    "Yes I know fridges don't have sea views.",
  ],
  [
    "Is it raining there?",
    "It's raining here horizontally mush.",
    "Pompey weather: personal. Have a squinny out the window.",
  ],
  [
    "Tell him I said no.",
    "Then tell him I said absolutely not dinlo.",
    "Then hang up before he invents a third option.",
  ],
  [
    "I'm walking and talking like a CEO mush.",
    "Except unpaid and dodging gulls.",
    "Still counts. LinkedIn that.",
  ],
  [
    "You what — he's bringing a coolbox?",
    "To a scrap? Classy dinlo.",
    "Save me a sausage roll if I survive mush.",
  ],
  [
    "No I don't need a lift.",
    "Because I'm already here mush.",
    "Where's here? Emotionally? Complicated.",
  ],
  [
    "If Auntie asks, I'm at a museum.",
    "Technically the front is educational mush.",
    "Seagulls: nature. Done. Culture.",
  ],
];

const VARIANT_SPEED: Record<CivilianVariant, { walk: number; run: number }> = {
  walker: { walk: 72, run: 160 },
  jogger: { walk: 120, run: 190 },
  bike: { walk: 175, run: 240 },
  scooter: { walk: 165, run: 230 },
  skater: { walk: 155, run: 220 },
  wheelchair: { walk: 55, run: 95 },
  dog_walker: { walk: 68, run: 145 },
};

type SkateTrick = "ollie" | "kickflip" | "manual";

function isPasser(v: CivilianVariant): boolean {
  return v === "bike" || v === "scooter" || v === "skater";
}

/** Keeps going one way along the front — wraps off-screen. */
function isThroughTraveller(v: CivilianVariant): boolean {
  return v === "jogger" || isPasser(v);
}

/** Beach wanderers — hitting them raises wanted. Steer around props; step over bodies & wrecks. */
export class Civilian extends Fighter {
  readonly variant: CivilianVariant;
  private wanderDir = Math.random() < 0.5 ? 1 : -1;
  private readonly passDir: 1 | -1;
  private panicUntil = 0;
  private rethinkAt = 0;
  private laneTarget = 0;
  /** Frames of near-zero travel while trying to walk — peel around props. */
  private stuckMs = 0;
  private prevStuckX = 0;
  private prevStuckY = 0;
  private wantedMoveLast = false;
  private frameObstacles: Obstacle[] = [];
  private readonly mount?: Phaser.GameObjects.Image;
  dog: Dog | null = null;
  private dogReleased = false;
  /** Still on bike/scooter until a crash. */
  mounted: boolean;
  private crashUntil = 0;
  /** How long we've been nose-to-nose with someone — ditch only after a sustained jam. */
  private nearCrashMs = 0;
  private lastCrashOutcome: CrashOutcome | null = null;
  /** Skater knocked off — scene spawns a rideable board. */
  private droppedBoard: { x: number; y: number } | null = null;
  private skateTrick: SkateTrick | null = null;
  private skateTrickUntil = 0;
  private skateTrickDur = 1;
  private nextSkateTrickAt = 0;
  /** Some walkers stop to film a scrap instead of always scarpering. */
  private nosy: boolean;
  private filmPingAt = 0;
  /** Keep the phone up across gaps between punches. */
  private filmUntil = 0;
  /** Odd locals who natter on the phone while strolling. */
  private phoneChatty = false;
  private phoneUntil = 0;
  private phoneNextAt = 0;
  private phoneScript: string[] = [];
  private phoneLineIdx = 0;
  private phoneCooldownUntil = 0;
  /** Don't spam "stepping over bodies" lines. */
  private bodyRemarkUntil = 0;
  /** Walking with someone — him sticks up for her if she's clipped. */
  partner: Civilian | null = null;
  coupleRole: "him" | "her" | null = null;
  /** Who hurt the missus — bloke goes for them. */
  private vengefulTarget: Fighter | null = null;
  private vengefulThinkAt = 0;
  /** Piled in with the player against a thug. */
  private ally = false;
  private allyTarget: Fighter | null = null;
  private allyThinkAt = 0;
  private pendingLine: string | null = null;
  /** Recently clipped by a lad — primed to join. */
  private spiteUntil = 0;
  /** Story recruit — stays with the player between waves. */
  private partyMember = false;
  /** Moves Casey promised to show — she favours these and calls the inputs. */
  private teachMoves: string[] = [];
  private teachCallAt = 0;
  private coachComboStep = 0;

  /** True while fighting on the player's side. */
  get isAlly(): boolean {
    return this.ally && !this.structure.isOut();
  }

  /** Casey (or similar) recruited into the party for the rest of the run. */
  get isPartyMember(): boolean {
    return this.partyMember && !this.structure.isOut();
  }

  /** Recruited this run — still true if she's on the deck. */
  get isRecruited(): boolean {
    return this.partyMember;
  }

  /** True while the bloke is steaming over his missus getting hurt. */
  get isProtecting(): boolean {
    return (
      !!this.vengefulTarget &&
      !this.vengefulTarget.structure.isOut() &&
      !this.structure.isOut()
    );
  }

  isTargeting(f: Fighter): boolean {
    return this.vengefulTarget === f;
  }

  /** Pair two walkers as a couple (him protects her). */
  static linkCouple(him: Civilian, her: Civilian): void {
    him.partner = her;
    her.partner = him;
    him.coupleRole = "him";
    her.coupleRole = "her";
    him.nosy = false;
    her.nosy = false;
    // Stroll the same way
    him.wanderDir = her.wanderDir = him.passDir;
    him.facing = her.facing = him.passDir;
    // Keep her just ahead / beside him
    her.x = him.x + him.passDir * 32;
    her.y = Phaser.Math.Clamp(
      him.y + (Math.random() < 0.5 ? -14 : 14),
      PROMENADE.minY,
      PROMENADE.maxY,
    );
    her.laneTarget = her.y;
    him.laneTarget = him.y;
  }

  /** Consume join / ally speech (once). */
  takeSpeech(): string | null {
    if (this.structure.downed || this.structure.isOut()) {
      this.pendingLine = null;
      return null;
    }
    const line = this.pendingLine;
    this.pendingLine = null;
    return line;
  }

  /** Occasional mutter when stepping over floored fighters or ditched bikes. */
  private maybeRemarkOnBodies(now: number, threats: Fighter[]): void {
    if (now < this.bodyRemarkUntil) return;
    if (this.ally || this.isProtecting || this.pendingLine) return;
    if (now < this.phoneUntil) return;
    let onBody = false;
    for (const t of threats) {
      if (t === this) continue;
      if (!t.structure.isOut() && !t.structure.downed) continue;
      if (Math.abs(t.x - this.x) > 30 || Math.abs(t.laneY - this.y) > 24) continue;
      onBody = true;
      break;
    }
    let onWreck = false;
    if (!onBody) {
      for (const w of getMountWrecks()) {
        if (Math.abs(w.x - this.x) > w.rx || Math.abs(w.y - this.y) > w.ry + 4) continue;
        onWreck = true;
        break;
      }
    }
    if (!onBody && !onWreck) return;
    // Most steps are silent — only the odd local pipes up
    if (Math.random() > 0.18) {
      this.bodyRemarkUntil = now + 3500 + Math.random() * 4500;
      return;
    }
    const lines = onWreck ? WRECK_STEP_LINES : BODY_STEP_LINES;
    this.pendingLine = lines[Math.floor(Math.random() * lines.length)]!;
    this.bodyRemarkUntil = now + 14000 + Math.random() * 12000;
  }

  /** Enemy just hit this local — often piles in with you. */
  onHitByEnemy(now: number, foe: Fighter): boolean {
    if (foe.team !== "enemy") return false;
    this.spiteUntil = now + 5000;
    this.structure.anger = Math.min(1, this.structure.anger + 0.45);
    this.notifyPartnerHurt(now, foe);
    if (foe.structure.isOut()) return false;
    // High chance after being clipped
    return this.tryJoinPlayer(now, foe, 0.7);
  }

  /** Punches / kicks knock riders off wheels — board drops for the player. */
  override receiveStrike(hit: StrikeInput): StrikeResult {
    if (this.mounted && isPasser(this.variant)) {
      this.crash(hit.now, this.x - (hit.knockDir ?? this.facing) * 40);
      return "stumble";
    }
    return super.receiveStrike(hit);
  }

  /** Player (or anyone) clipped this local — partner may lose it. */
  onHurt(now: number, by: Fighter): void {
    if (by.structure.isOut()) return;
    this.notifyPartnerHurt(now, by);
  }

  private notifyPartnerHurt(now: number, by: Fighter): void {
    if (this.coupleRole !== "her" || !this.partner) return;
    this.partner.reactMissusHurt(now, by);
  }

  /** Bloke's missus got clipped — he goes for whoever did it. */
  reactMissusHurt(now: number, by: Fighter): void {
    if (this.coupleRole !== "him") return;
    if (this.structure.isOut() || by === this || by === this.partner) return;
    if (by.structure.isOut()) return;

    this.panicUntil = 0;
    this.filmUntil = 0;
    if (this.action === "film") this.action = "idle";
    this.hangUp(now);
    this.structure.anger = Math.min(1, this.structure.anger + 0.7);
    this.vengefulTarget = by;
    this.vengefulThinkAt = now + 120;
    this.ally = false;
    this.allyTarget = null;
    this.pendingLine =
      MISSUS_HURT_LINES[Math.floor(Math.random() * MISSUS_HURT_LINES.length)]!;

    // If a thug hurt her, he may also pile in with the player once that lad's sorted
    if (by.team === "enemy") {
      this.allyTarget = by;
      this.ally = true;
    }
  }

  /**
   * Join the player's scrap against a lad.
   * @param chance 0–1 when not forced by a direct hit.
   */
  tryJoinPlayer(now: number, foe: Fighter, chance = 0.28): boolean {
    if (this.ally) {
      if (!this.allyTarget || this.allyTarget.structure.isOut()) this.allyTarget = foe;
      return false;
    }
    if (this.structure.isOut()) return false;
    if (this.isCycling) return false;
    if (this.variant === "wheelchair" && Math.random() > 0.25) return false;
    if (foe.team !== "enemy" || foe.structure.isOut()) return false;
    if (Math.random() > chance) return false;

    this.ally = true;
    this.allyTarget = foe;
    this.panicUntil = 0;
    this.filmUntil = 0;
    if (this.action === "film") this.action = "idle";
    this.hangUp(now);
    this.structure.anger = Math.min(1, this.structure.anger + 0.35);
    this.pendingLine = JOIN_LINES[Math.floor(Math.random() * JOIN_LINES.length)]!;
    this.allyThinkAt = now + 200;
    return true;
  }

  /** Story recruits join without a random roll. */
  joinPlayer(now: number, foe: Fighter | null, opts?: { teach?: string[] }): void {
    this.ally = true;
    this.partyMember = true;
    this.allyTarget = foe && !foe.structure.isOut() ? foe : null;
    this.panicUntil = 0;
    this.filmUntil = 0;
    if (this.action === "film") this.action = "idle";
    this.hangUp(now);
    // Match the Hardman-hunter — same toughness and pace as the player
    this.structure.toughness = 2.2;
    this.structure.anger = Math.max(this.structure.anger, 0.55);
    this.speed = 175;
    this.runSpeed = 300;
    this.teachMoves = (opts?.teach ?? []).filter(Boolean);
    this.teachCallAt = now + 900;
    this.coachComboStep = 0;
    this.pendingLine =
      this.teachMoves.length > 0
        ? "Watch me mush — I'll show you how it's done."
        : "Right — let's sort these dinlos out!";
    this.allyThinkAt = now + 200;
  }

  /** Consume crash label for float text (once). */
  takeCrashOutcome(): CrashOutcome | null {
    const o = this.lastCrashOutcome;
    this.lastCrashOutcome = null;
    return o;
  }

  /** True while mid-film (for float prompts). */
  get isFilming(): boolean {
    return this.action === "film";
  }

  /** Consume a one-shot "filming" ping for float text. */
  takeFilmPing(now: number): boolean {
    if (this.action !== "film") return false;
    if (now < this.filmPingAt) return false;
    this.filmPingAt = now + 2800 + Math.random() * 2000;
    return true;
  }

  startFilming(now: number, ms = 4500): void {
    if (this.structure.isOut() || this.ally) return;
    if (this.isCycling) return;
    this.hangUp(now);
    this.filmUntil = Math.max(this.filmUntil, now + ms);
    this.action = "film";
    this.actionUntil = this.filmUntil;
    this.running = false;
    this.filmPingAt = Math.min(this.filmPingAt, now + 250);
  }

  /** Hold the phone pose; refreshes while the scrap is still on. */
  private holdPhoneUp(now: number, refreshMs = 2800): void {
    this.hangUp(now);
    if (now >= this.filmUntil) {
      this.filmUntil = now + 4200 + Math.random() * 1800;
    } else {
      this.filmUntil = Math.max(this.filmUntil, now + refreshMs);
    }
    this.action = "film";
    this.actionUntil = this.filmUntil;
    this.running = false;
  }

  helpPlayerUp(now: number, player: Fighter): void {
    this.faceToward(player.x, now);
    this.startLooting(now, 950);
    this.pendingLine =
      this.variant === "jogger"
        ? "Up you get."
        : this.ally
          ? "Come on mush, back up."
          : "Here — on your feet mush.";
  }

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    name = "Local",
    variant: CivilianVariant = "walker",
    passDir?: 1 | -1,
    opts?: { nosy?: boolean; lookId?: string; present?: Present; toughness?: number },
  ) {
    const look =
      (opts?.lookId ? getLook(opts.lookId) : undefined) ??
      (opts?.present ? pickLookPresent("civilian", opts.present) : pickLook("civilian"));
    super(scene, x, y, "civilian", look.id, name, {
      toughness: opts?.toughness ?? (variant === "jogger" ? 0.65 : 0.55),
      scaleX: look.scaleX * (variant === "wheelchair" ? 0.95 : 1),
      scaleY: look.scaleY * (variant === "wheelchair" ? 0.92 : 1),
      loot: {
        money: 3 + Math.floor(Math.random() * 15),
        weapon: "none",
      },
    });
    this.variant = variant;
    const spd = VARIANT_SPEED[variant];
    this.speed = spd.walk;
    this.runSpeed = spd.run;
    this.laneTarget = y;
    this.passDir = passDir ?? (Math.random() < 0.5 ? 1 : -1);
    this.mounted = isPasser(variant);
    // Walkers / dog walkers often film; through-travellers keep moving
    this.nosy =
      opts?.nosy ??
      (variant === "walker"
        ? Math.random() < 0.65
        : variant === "dog_walker"
          ? Math.random() < 0.5
          : false);
    // Odd stroller on the blower — rare so the front still reads as a stroll
    this.phoneChatty =
      (variant === "walker" && Math.random() < 0.07) ||
      (variant === "dog_walker" && Math.random() < 0.04);
    if (this.phoneChatty) {
      this.phoneCooldownUntil = 0; // armed on first calm stroll
    }
    if (isThroughTraveller(variant)) {
      this.wanderDir = this.passDir;
      this.facing = this.passDir;
    }

    if (
      variant === "bike" ||
      variant === "scooter" ||
      variant === "skater" ||
      variant === "wheelchair"
    ) {
      const key =
        variant === "bike"
          ? "mount_bike"
          : variant === "scooter"
            ? "mount_scooter"
            : variant === "skater"
              ? "mount_skate"
              : "mount_wheelchair";
      this.mount = scene.make.image({ x: 0, y: 4, key, add: false });
      this.mount.setOrigin(0.5, 1);
      this.addAt(this.mount, 0);
    }

    if (variant === "dog_walker") {
      this.dog = new Dog(scene, x - 28, y + 6, this);
    }
    if (variant === "skater") {
      this.nextSkateTrickAt = 1600 + Math.random() * 4200;
    }

    // Spawn feet on the promenade, not the tarmac
    if (!this.ally) {
      this.y = Phaser.Math.Clamp(this.y, PROMENADE.minY, PROMENADE.maxY);
      this.groundY = this.y;
      this.laneTarget = this.y;
    }
  }

  /**
   * Normal stroll stays on the promenade. Allies / vengeance scraps can use
   * the full fight lane (incl. road) so they can stick with the player.
   */
  private strollBounds(): { minY: number; maxY: number } {
    if (this.ally || this.isProtecting) {
      return { minY: LANE.minY, maxY: LANE.maxY };
    }
    return { minY: PROMENADE.minY, maxY: PROMENADE.maxY };
  }

  /** Dogs stay off the quiet Eastney stretch. */
  private strollMinX(): number {
    if (this.variant === "dog_walker" && !this.ally && !this.isProtecting) return 3600;
    return LANE.minX;
  }

  private clampStrollY(): void {
    const { minY, maxY } = this.strollBounds();
    this.y = Phaser.Math.Clamp(this.y, minY, maxY);
    this.groundY = this.y;
  }

  private randomStrollY(): number {
    const { minY, maxY } = this.strollBounds();
    const lo = minY + 16;
    const hi = Math.max(lo + 8, maxY - 10);
    return lo + Math.random() * (hi - lo);
  }

  scare(now: number): void {
    if (this.ally || this.isProtecting) return; // already in the scrap
    this.panicUntil = now + 2500;
    this.filmUntil = 0;
    if (this.action === "film") this.action = "idle";
    this.hangUp(now);
  }

  /** Drop the walking phone call (scare / join / scrap filming). */
  private hangUp(now: number): void {
    if (this.phoneUntil <= 0 && this.phoneScript.length === 0) return;
    this.phoneUntil = 0;
    this.phoneScript = [];
    this.phoneLineIdx = 0;
    this.phoneCooldownUntil = now + 6000 + Math.random() * 8000;
  }

  get isOnPhone(): boolean {
    return this.phoneUntil > 0;
  }

  /** Consume skateboard drop after a crash (once). */
  takeDroppedBoard(): { x: number; y: number } | null {
    const d = this.droppedBoard;
    this.droppedBoard = null;
    return d;
  }

  get isCycling(): boolean {
    return this.mounted && isPasser(this.variant);
  }

  get isSkater(): boolean {
    return this.variant === "skater";
  }

  /** Knocked off bike/scooter/skateboard. */
  crash(now: number, fromX: number, into?: Fighter): CrashOutcome {
    if (!this.mounted) return "flee";
    this.mounted = false;
    this.skateTrick = null;
    if (this.mount) {
      this.mount.setVisible(false);
      if (this.variant === "skater") {
        this.droppedBoard = { x: this.x - this.passDir * 16, y: this.y + 4 };
      } else {
        // Leave bike / scooter on the ground — walk-over wreck, not a wall
        leaveMountWreck(
          this.scene,
          this.x - this.passDir * 20,
          this.y + 4,
          this.mount.texture.key,
          this.passDir,
        );
      }
    }

    this.speed = 95;
    this.runSpeed = 200;
    this.x += this.passDir * 18;
    this.y = Phaser.Math.Clamp(
      this.y + (Math.random() - 0.5) * 20,
      PROMENADE.minY,
      PROMENADE.maxY,
    );

    const roll = Math.random();
    let outcome: CrashOutcome;
    if (roll < 0.34) {
      outcome = "angry";
      this.structure.anger = Math.min(1, this.structure.anger + 0.7);
      this.scare(now);
      this.panicUntil = now + 1800;
    } else if (roll < 0.67) {
      outcome = "knocked";
      this.structure.putOnFloor(now, 1100);
      this.setAction("hitstun", now, 500);
    } else {
      outcome = "flee";
      this.scare(now);
      this.wanderDir = (Math.sign(this.x - fromX) || -this.passDir) as 1 | -1;
      this.panicUntil = now + 4000;
    }
    this.lastCrashOutcome = outcome;
    this.crashUntil = now + 800;

    if (into) {
      if (into instanceof Civilian) into.scare(now);
      if (!into.planted) into.x += this.passDir * 16;
      if (Math.random() < 0.4) into.structure.createOpening(now, 400);
    }
    return outcome;
  }

  /** Let the mutt scarper before this walker gets minced. */
  releaseDogIfAny(now: number): void {
    if (!this.dog || this.dogReleased) return;
    this.dogReleased = true;
    this.dog.release(now);
  }

  updateCivilian(
    now: number,
    dt: number,
    threats: Fighter[],
    obstacles: Obstacle[],
    civilians: Civilian[] = [],
  ): void {
    if (this.inFanMince) return;
    this.frameObstacles = obstacles;
    this.tickKnockdown(now);

    try {
      if (this.mount && this.mounted) {
        this.mount.setVisible(true);
      } else if (this.mount) {
        this.mount.setVisible(false);
      }

      if (this.dog && !this.dogReleased && this.structure.isOut()) {
        this.dogReleased = true;
        this.dog.release(now);
      }
      if (this.dog) this.dog.updateDog(now, dt, this);

      // Crawl away when badly down
      if (this.isCrawlingAway) {
        this.crawlAlong(dt, 24, LANE.minX, LANE.maxX);
        return;
      }

      if (this.structure.isOut()) {
        this.ally = false;
        this.allyTarget = null;
        this.vengefulTarget = null;
        return;
      }
      // Soft floor — don't wander/face (mirrors the KO doodle when jumped past)
      if (
        this.structure.downed &&
        now < this.structure.groundedUntil &&
        !this.isBeingTossed
      ) {
        if (!this.airborne) this.action = "down";
        return;
      }
      // Clinched by a grab — don't wander or swing until tossed
      if (this.heldBy) {
        this.action = "down";
        return;
      }
      if (this.isInThrowArc || this.isBeingTossed) return;
      if (!this.canAct(now) && this.action !== "block") return;
      if (this.busy && this.action !== "block") return;
      if (now < this.crashUntil) return;

      // Bloke steaming over his missus — go for whoever hurt her
      if (this.isProtecting && this.vengefulTarget?.team === "player") {
        this.updateVengeful(now, dt, this.vengefulTarget);
        return;
      }

      if (this.ally) {
        this.updateAlly(now, dt, threats);
        return;
      }

      // Clock the player fighting a lad — sometimes pile in
      // (joggers / couples keep strolling unless clipped)
      if (this.variant !== "jogger" && !this.partner) this.considerWitnessJoin(now, threats);

      if (this.isCycling) {
        this.updatePasser(now, dt, threats, obstacles, civilians);
        return;
      }

      if (this.variant === "jogger") {
        this.updateJogger(now, dt, threats, obstacles, civilians);
        return;
      }

      this.updateWanderer(now, dt, threats, obstacles, civilians);
    } finally {
      this.refreshVisuals(now, dt);
    }
  }

  /** Seated on the bike / scooter — pedal or weight-shift instead of a foot run. */
  protected poseForState(now: number): import("./Fighter").PoseKey {
    if (this.isCycling) {
      const frame = Math.floor(this.walkPhase * 2) % 2;
      if (this.variant === "skater") {
        if (this.skateTrick === "kickflip") return "kickflip";
        if (this.skateTrick === "ollie") return "ollie";
        if (this.skateTrick === "manual") return "manual";
        if (!this.boardRolling) return "skate0";
        return frame === 0 ? "skate0" : "skate1";
      }
      if (this.variant === "bike") return frame === 0 ? "ride0" : "ride1";
      return frame === 0 ? "ride_scooter0" : "ride_scooter1";
    }
    // Phone to the ear while they keep strolling — legs still walk
    if (now < this.phoneUntil) {
      const frame = Math.floor(this.walkPhase * 4) % 4;
      return (`phone${frame}` as "phone0" | "phone1" | "phone2" | "phone3");
    }
    return super.poseForState(now);
  }

  protected gaitAnimRate(): number {
    if (this.isCycling) {
      if (this.variant === "bike") return 5.2;
      if (this.variant === "skater") return 4.4;
      return 3.8;
    }
    return super.gaitAnimRate();
  }

  refreshVisuals(now: number, dt: number): void {
    // Passers on wheels are always rolling while mounted
    if (this.isCycling && this.mounted) this.boardRolling = true;
    else if (!this.skating) this.boardRolling = false;
    super.refreshVisuals(now, dt);
    if (!this.isCycling || !this.mount) return;

    const pedal = Math.sin(this.walkPhase * Math.PI * 2);
    if (this.variant === "skater") {
      this.sprite.y = -2;
      this.sprite.x = 0;
      this.mount.setVisible(true);
      this.mount.setFlipX(this.facing < 0);
      this.mount.setOrigin(0.5, 1);
      this.mount.setAngle(0);
      this.mount.y = 10;
      this.mount.x = 0;
      const trick = this.skateTrick;
      if (trick === "kickflip") {
        const t = Phaser.Math.Clamp(
          1 - (this.skateTrickUntil - now) / Math.max(1, this.skateTrickDur),
          0,
          1,
        );
        const hop = Math.sin(t * Math.PI) * 12;
        this.mount.setAngle((t * 360 * this.facing) % 360);
        this.mount.y = -4 - hop;
        this.sprite.y = -12 - hop;
      } else if (trick === "ollie") {
        const t = Phaser.Math.Clamp(
          1 - (this.skateTrickUntil - now) / Math.max(1, this.skateTrickDur),
          0,
          1,
        );
        const hop = Math.sin(t * Math.PI) * 14;
        this.sprite.y = -2 - hop;
        this.mount.y = 10 - hop;
      } else if (trick === "manual") {
        this.mount.setOrigin(this.facing > 0 ? 0.3 : 0.7, 1);
        this.mount.setAngle(this.facing * -28);
        this.mount.x = this.facing * -10;
        this.mount.y = 6;
      } else if (this.boardRolling) {
        const wheelFrame = Math.floor(this.walkPhase * 2) % 2;
        const key = wheelFrame === 0 ? "mount_skate" : "mount_skate_1";
        if (this.scene.textures.exists(key) && this.mount.texture.key !== key) {
          this.mount.setTexture(key);
        }
      }
      return;
    }
    // Sit on the saddle / deck so fists meet the bars and feet meet pedals/deck
    this.sprite.y = this.variant === "bike" ? -12 : -6;
    // Scooter: stand over the deck, not piled on the stem
    this.sprite.x = this.facing * (this.variant === "bike" ? -2 : -10);
    this.mount.setVisible(true);
    this.mount.setFlipX(this.facing < 0);
    this.mount.y = this.variant === "bike" ? 2 + pedal * 0.8 : 2 + pedal * 0.6;
    // Nudge stem/T-bar under the hands (facing-aware)
    this.mount.x = this.facing * (this.variant === "scooter" ? -4 : 2);
    const wheelFrame = Math.floor(this.walkPhase * 2) % 2;
    const base = this.variant === "bike" ? "mount_bike" : "mount_scooter";
    const key = wheelFrame === 0 ? base : `${base}_1`;
    if (this.scene.textures.exists(key) && this.mount.texture.key !== key) {
      this.mount.setTexture(key);
    }
  }

  /** Occasional ollie / kickflip / manual while rolling the front. */
  private tickSkateTrick(now: number): void {
    if (!this.mounted) {
      this.skateTrick = null;
      return;
    }
    if (this.skateTrick && now >= this.skateTrickUntil) {
      this.skateTrick = null;
      this.nextSkateTrickAt = now + 2400 + Math.random() * 5200;
    }
    if (this.skateTrick) return;
    if (now < this.nextSkateTrickAt) return;
    if (this.nearCrashMs > 20) {
      this.nextSkateTrickAt = now + 700;
      return;
    }
    const roll = Math.random();
    const kind: SkateTrick =
      roll < 0.4 ? "manual" : roll < 0.74 ? "ollie" : "kickflip";
    const dur =
      kind === "manual"
        ? 800 + Math.random() * 700
        : kind === "ollie"
          ? 420
          : KICKFLIP_MS;
    this.skateTrick = kind;
    this.skateTrickDur = dur;
    this.skateTrickUntil = now + dur;
  }

  private updatePasser(
    now: number,
    dt: number,
    threats: Fighter[],
    obstacles: Obstacle[],
    civilians: Civilian[],
  ): void {
    if (this.variant === "skater") this.tickSkateTrick(now);

    const look = 210;
    const bodies = [...threats, ...civilians].filter((t) => {
      if (t === this || t.structure.isOut()) return false;
      if (t instanceof Civilian && t.isCycling) return false;
      // Floored folk — ring around, don't ditch the bike into them
      if (t.structure.downed) return false;
      return true;
    });

    type Hazard =
      | { kind: "body"; x: number; y: number; rx: number; ry: number; body: Fighter }
      | { kind: "prop"; x: number; y: number; rx: number; ry: number };

    let hazard: Hazard | null = null;
    let hazardDist = look;

    for (const t of bodies) {
      const dx = (t.x - this.x) * this.passDir;
      // Tight lane — folk a step aside aren't "in the way"
      const dy = Math.abs(t.laneY - this.y);
      if (dx > 0 && dx < look && dy < 28 && dx < hazardDist) {
        hazard = { kind: "body", x: t.x, y: t.laneY, rx: 26, ry: 18, body: t };
        hazardDist = dx;
      }
    }
    for (const o of obstacles) {
      if (o.kind !== "prop") continue;
      const dx = (o.x - this.x) * this.passDir;
      const dy = Math.abs(o.y - this.y);
      if (dx > -o.rx * 0.2 && dx < look + o.rx && dy < o.ry + 18 && dx < hazardDist) {
        hazard = { kind: "prop", x: o.x, y: o.y, rx: o.rx, ry: o.ry };
        hazardDist = Math.max(0, dx);
      }
    }

    let vx = this.passDir;
    let vy = 0;
    let spd = this.speed;
    const { minY: strollMin, maxY: strollMax } = this.strollBounds();

    if (hazard) {
      const roomUp = this.y - strollMin;
      const roomDown = strollMax - this.y;
      const preferUp = hazard.y >= this.y;
      let dodgeDir = 0;
      if (preferUp && roomUp > 8) dodgeDir = -1;
      else if (!preferUp && roomDown > 8) dodgeDir = 1;
      else if (roomUp >= roomDown && roomUp > 6) dodgeDir = -1;
      else if (roomDown > 6) dodgeDir = 1;
      else dodgeDir = roomUp >= roomDown ? -1 : 1;

      // Peel early and hard — ringing the bell beats kissing the pavement
      if (hazardDist < look) {
        const close = hazardDist < 110;
        const imminent = hazardDist < 55;
        vy = dodgeDir * (imminent ? 2.35 : close ? 1.85 : 1.25);
        if (hazardDist < 90) spd *= 0.78;
        if (hazardDist < 48) spd *= 0.7;
        // Cut a touch of forward when something's dead ahead so the lane slide wins
        if (hazardDist < 36) spd *= 0.65;
      }

      const deepOverlap =
        Math.abs(this.x - hazard.x) < hazard.rx + 10 &&
        Math.abs(this.y - hazard.y) < hazard.ry + 8;

      if (deepOverlap) {
        this.nearCrashMs += dt * 1000;
        vy = dodgeDir * 2.4;
        spd *= 0.35;
        // Real nose-into-it: ditch quick. Glancing near-misses still clear.
        const crashAfter = hazard.kind === "body" ? 140 : 220;
        if (this.nearCrashMs > crashAfter) {
          this.crash(
            now,
            hazard.x,
            hazard.kind === "body" ? hazard.body : undefined,
          );
          this.nearCrashMs = 0;
          return;
        }
      } else {
        this.nearCrashMs = Math.max(0, this.nearCrashMs - dt * 2800);
      }
    } else {
      this.nearCrashMs = Math.max(0, this.nearCrashMs - dt * 2800);
    }

    // Floored bodies are walk-over scenery — only props / living folk block riders
    const steered = steerAway(
      this.x,
      this.y,
      vx,
      vy,
      obstacles,
      110,
      strollMin,
      strollMax,
    );
    const forward = this.passDir;
    const dodgeHard = Math.abs(steered.vy) > 0.35 || Math.abs(vy) > 1.2;
    this.x += forward * spd * (dodgeHard ? 0.58 : 1) * dt;
    this.y += steered.vy * spd * 1.45 * dt;
    this.clampStrollY();
    this.running = false;
    this.action = "move";
    this.setFacing(this.passDir, now);
    if (this.mount) this.mount.setFlipX(this.facing < 0);

    // Props — hard shove aside; if still buried, that's a crash
    for (const o of obstacles) {
      if (o.kind !== "prop") continue;
      if (
        Math.abs(this.x - o.x) < o.rx + 14 &&
        Math.abs(this.y - o.y) < o.ry + 10
      ) {
        const roomUp = this.y - strollMin;
        const roomDown = strollMax - this.y;
        this.y += (roomUp >= roomDown ? -1 : 1) * 22;
        this.clampStrollY();
        if (
          Math.abs(this.x - o.x) < o.rx + 6 &&
          Math.abs(this.y - o.y) < o.ry + 4
        ) {
          this.crash(now, o.x);
          return;
        }
      }
    }

    // Loop through the camera view so L2 riders don't vanish to Eastney
    const cam = this.scene.cameras.main.scrollX;
    const viewL = cam - 100;
    const viewR = cam + (this.scene.scale.width || 960) + 100;
    if (this.passDir > 0 && this.x > viewR + 160) {
      this.x = viewL - 50;
      this.y = this.randomStrollY();
      this.groundY = this.y;
      this.mounted = true;
      this.nearCrashMs = 0;
      if (this.mount) this.mount.setVisible(true);
    } else if (this.passDir < 0 && this.x < viewL - 160) {
      this.x = viewR + 50;
      this.y = this.randomStrollY();
      this.groundY = this.y;
      this.mounted = true;
      this.nearCrashMs = 0;
      if (this.mount) this.mount.setVisible(true);
    }
  }

  /**
   * Joggers commit to one direction along the front: dodge people / props,
   * keep going past the screen, only reverse when scared.
   */
  private updateJogger(
    now: number,
    dt: number,
    threats: Fighter[],
    obstacles: Obstacle[],
    civilians: Civilian[],
  ): void {
    const look = 110;
    const bodies = [...threats, ...civilians].filter((t) => {
      if (t === this || t.structure.isOut()) return false;
      return true;
    });

    type Hazard = { x: number; y: number; rx: number; ry: number };
    let hazard: Hazard | null = null;
    let hazardDist = look;

    for (const t of bodies) {
      const dx = (t.x - this.x) * this.passDir;
      const dy = Math.abs(t.laneY - this.y);
      if (dx > 0 && dx < look && dy < 36 && dx < hazardDist) {
        hazard = { x: t.x, y: t.laneY, rx: 30, ry: 24 };
        hazardDist = dx;
      }
    }
    for (const o of obstacles) {
      if (o.kind !== "prop") continue;
      const dx = (o.x - this.x) * this.passDir;
      const dy = Math.abs(o.y - this.y);
      if (dx > -o.rx * 0.2 && dx < look + o.rx && dy < o.ry + 20 && dx < hazardDist) {
        hazard = { x: o.x, y: o.y, rx: o.rx, ry: o.ry };
        hazardDist = Math.max(0, dx);
      }
    }

    // Active scrap / scare → briefly peel off, then resume the jog
    const scrapNearby = threats.find(
      (t) =>
        !t.structure.isOut() &&
        (t.team === "player" || t.team === "enemy" || t.team === "police") &&
        Phaser.Math.Distance.Between(this.x, this.y, t.x, t.y) < 130 &&
        (t.action === "punch" ||
          t.action === "jab" ||
          t.action === "hook" ||
          t.action === "kick" ||
          t.action === "hitstun" ||
          t.action === "headbutt" ||
          t.action === "weapon_swing" ||
          t.structure.anger > 0.4),
    );
    if (scrapNearby) this.scare(now);

    let vx = this.passDir;
    let vy = 0;
    let spd = this.runSpeed;
    const { minY: strollMin, maxY: strollMax } = this.strollBounds();

    if (now < this.panicUntil) {
      const away =
        (scrapNearby ? Math.sign(this.x - scrapNearby.x) : 0) || this.passDir;
      // Prefer the travel direction when equally scared either side
      vx = away < 0 ? -1 : 1;
      if (scrapNearby) {
        const side = Math.sign(this.y - scrapNearby.laneY) || (Math.random() < 0.5 ? -1 : 1);
        vy = side * 0.9;
      }
      spd = this.runSpeed * 1.08;
    } else {
      // Back on the jog — commit to passDir again
      this.wanderDir = this.passDir;
      vx = this.passDir;

      if (hazard) {
        const roomUp = this.y - strollMin;
        const roomDown = strollMax - this.y;
        const preferUp = hazard.y >= this.y;
        let dodgeDir = 0;
        if (preferUp && roomUp > 12) dodgeDir = -1;
        else if (!preferUp && roomDown > 12) dodgeDir = 1;
        else if (roomUp >= roomDown && roomUp > 10) dodgeDir = -1;
        else if (roomDown > 10) dodgeDir = 1;
        else dodgeDir = roomUp >= roomDown ? -1 : 1;

        if (dodgeDir !== 0 && hazardDist < look) {
          vy = dodgeDir * (hazardDist < 50 ? 1.35 : 1.0);
        }
        // Boxed in on the lane — still peel; never grind into the prop
        if (hazardDist < 50) {
          spd *= 0.7;
          if (Math.abs(vy) < 0.4) vy = dodgeDir * 0.95;
        }
      }

      // Soft lane drift so they don't all hug one line
      if (now >= this.rethinkAt) {
        this.rethinkAt = now + 900 + Math.random() * 1400;
        if (Math.random() < 0.45) {
          this.laneTarget = Phaser.Math.Clamp(
            this.y + (Math.random() - 0.5) * 70,
            strollMin,
            strollMax,
          );
        }
      }
      if (!hazard || hazardDist > 70) {
        vy += Math.sign(this.laneTarget - this.y) * 0.25;
      }
    }

    // Step over floored lads — steering around every body jammed the prom
    const steered = steerAway(
      this.x,
      this.y,
      vx,
      vy,
      obstacles,
      68,
      strollMin,
      strollMax,
    );

    // Never reverse while jogging — only lane-dodge (scare can flip vx above)
    if (now >= this.panicUntil && Math.sign(steered.vx || this.passDir) !== this.passDir) {
      steered.vx = this.passDir * Math.max(0.25, Math.abs(steered.vx));
    }

    const legMul = this.structure.moveSpeedFactor();
    const move = spd * Math.max(0.55, legMul);
    this.x += steered.vx * move * dt;
    this.y += steered.vy * move * 1.05 * dt;
    this.noteStuckProgress(dt, Math.abs(vx) > 0.2 || Math.abs(vy) > 0.2);
    if (this.stuckMs > 1000) {
      const roomUp = this.y - strollMin;
      const roomDown = strollMax - this.y;
      this.laneTarget = Phaser.Math.Clamp(
        this.y + (roomUp >= roomDown ? -70 : 70),
        strollMin,
        strollMax,
      );
      this.y += Math.sign(this.laneTarget - this.y) * move * 1.1 * dt;
      if (this.stuckMs > 1600) this.stuckMs = 0;
    }
    this.clampStrollY();
    this.running = true;
    this.action = "run";
    this.setFacing(this.passDir, now);
    this.maybeRemarkOnBodies(now, threats);

    this.wrapPastScreen();
  }

  /** Reappear at the other end once they've jogged / ridden off. */
  private wrapPastScreen(): void {
    let wrapped = false;
    if (this.x > LANE.maxX + 40) {
      this.x = this.variant === "dog_walker" ? 3600 : LANE.minX - 40;
      wrapped = true;
    } else if (this.x < LANE.minX - 40) {
      this.x = LANE.maxX + 40;
      wrapped = true;
    }
    if (!wrapped) return;
    this.y = this.randomStrollY();
    this.groundY = this.y;
    this.wanderDir = this.passDir;
    this.facing = this.passDir;
    this.panicUntil = 0;
  }

  private updateWanderer(
    now: number,
    dt: number,
    threats: Fighter[],
    obstacles: Obstacle[],
    civilians: Civilian[],
  ): void {
    const cyclists = civilians
      .filter((c) => c !== this && c.isCycling)
      .map((c) => ({ x: c.x, y: c.y, rx: 50, ry: 30, kind: "prop" as const }));

    // Bodies on the floor aren't walls — walk straight over them
    const allObs = [...obstacles, ...cyclists];

    // Couples stroll as a pair — missus keeps beside him
    if (
      this.partner &&
      !this.partner.structure.isOut() &&
      now >= this.panicUntil &&
      !this.isProtecting &&
      !this.ally
    ) {
      if (this.coupleRole === "her") {
        this.updateCoupleFollow(now, dt, allObs);
        return;
      }
      // Him: don't randomly reverse away from her
      if (now >= this.rethinkAt) {
        this.rethinkAt = now + 1400 + Math.random() * 1600;
        if (Math.random() < 0.12) this.wanderDir *= -1;
        this.partner.wanderDir = this.wanderDir;
        if (Math.random() < 0.35) {
          this.laneTarget = Phaser.Math.Clamp(
            this.y + (Math.random() - 0.5) * 50,
            PROMENADE.minY,
            PROMENADE.maxY,
          );
        }
      }
    }

    const nearby = threats.find(
      (t) =>
        !t.structure.isOut() &&
        (t.team === "player" || t.team === "enemy" || t.team === "police") &&
        Phaser.Math.Distance.Between(this.x, this.y, t.x, t.y) < 140,
    );

    // Only scarper from active scrap — not just someone walking past
    const scrapNearby = threats.find(
      (t) =>
        !t.structure.isOut() &&
        (t.team === "player" || t.team === "enemy" || t.team === "police") &&
        Phaser.Math.Distance.Between(this.x, this.y, t.x, t.y) < 160 &&
        (t.action === "punch" ||
          t.action === "kick" ||
          t.action === "hitstun" ||
          t.action === "headbutt" ||
          t.action === "weapon_swing" ||
          t.structure.anger > 0.35),
    );

    // Strongly peel away from oncoming bikes
    const bike = civilians.find(
      (c) =>
        c.isCycling &&
        Math.abs(c.y - this.y) < 40 &&
        Math.abs(c.x - this.x) < 120,
    );

    let vx = 0;
    let vy = 0;
    const { minY: strollMin, maxY: strollMax } = this.strollBounds();

    // Nosy locals: hang back and film a scrap / skate show instead of always running
    const scrap = this.nosy && now >= this.panicUntil ? this.findScrap(threats) : null;
    const skateShow =
      this.nosy &&
      now >= this.panicUntil &&
      threats.some(
        (t) =>
          t.team === "player" &&
          t.skating &&
          Phaser.Math.Distance.Between(this.x, this.y, t.x, t.y) < 220,
      );
    const stillFilming = now < this.filmUntil;
    if ((scrap || skateShow || stillFilming) && !bike) {
      this.hangUp(now);
      const aim =
        scrap ??
        (skateShow
          ? threats.find((t) => t.team === "player" && t.skating) ?? null
          : null) ??
        this.lastScrapAim(threats);
      if (aim) {
        if (skateShow) this.startFilming(now, 5600);
        const dist = Phaser.Math.Distance.Between(this.x, this.y, aim.x, aim.y);
        this.faceToward(aim.x, now);

        if (dist < 95) {
          // Too close — pocket the phone and scarper
          this.scare(now);
        } else if (dist < 280 || stillFilming) {
          if (scrap || skateShow) this.holdPhoneUp(now);
          else {
            // Sticky hold after the flurry pauses — keep filming a bit longer
            this.action = "film";
            this.actionUntil = this.filmUntil;
            this.running = false;
          }
          // Soft shuffle to keep a good angle (phone stays up)
          const side =
            Math.sign(this.y - aim.y) || (this.y > (strollMin + strollMax) / 2 ? -1 : 1);
          vx = scrap && dist > 210 ? Math.sign(aim.x - this.x) || this.wanderDir : Math.sign(aim.x - this.x) * 0.15;
          vy =
            scrap && dist > 210
              ? Math.sign(aim.y - this.y) * 0.4
              : dist < 130
                ? side * 0.35
                : 0;
          const spdMul = scrap && dist > 210 ? 0.7 : 0.35;
          const steered = steerAway(
            this.x,
            this.y,
            vx,
            vy,
            allObs,
            52,
            strollMin,
            strollMax,
          );
          this.x += steered.vx * this.speed * spdMul * dt;
          this.y += steered.vy * this.speed * (spdMul * 0.9) * dt;
          this.x = Phaser.Math.Clamp(this.x, LANE.minX, LANE.maxX);
          this.clampStrollY();
          this.noteStuckProgress(dt, true);
          return;
        }
      }
    }

    if (bike) {
      this.hangUp(now);
      vy = Math.sign(this.y - bike.y) || (this.y > (strollMin + strollMax) / 2 ? -1 : 1);
      vx = this.wanderDir * 0.4;
      this.running = true;
      this.action = "run";
    } else if (scrapNearby || now < this.panicUntil) {
      if (scrapNearby) this.scare(now);
      this.hangUp(now);
      const away = scrapNearby
        ? Math.sign(this.x - scrapNearby.x) || this.wanderDir
        : this.wanderDir;
      vx = away;
      vy = Math.sign(this.laneTarget - this.y) || (Math.random() < 0.5 ? -1 : 1);
      this.running = true;
      this.action = "run";
    } else if (nearby && this.nosy) {
      // Nosy keeps filming distance — don't flee just from presence
      const away = Math.sign(this.x - nearby.x) || this.wanderDir;
      vx = away * 0.25;
      vy = Math.sign(this.laneTarget - this.y) * 0.25;
      this.running = false;
      this.action = "move";
    } else if (now >= this.rethinkAt) {
      this.rethinkAt = now + 1400 + Math.random() * 1800;
      if (Math.random() < 0.18) this.wanderDir *= -1;
      if (Math.random() < 0.4) {
        this.laneTarget = Phaser.Math.Clamp(
          this.y + (Math.random() - 0.5) * 80,
          strollMin,
          strollMax,
        );
      }
      vx = this.wanderDir;
      vy = Math.sign(this.laneTarget - this.y) * 0.4;
      this.running = false;
      this.action = "move";
    } else {
      vx = this.wanderDir;
      vy = Math.sign(this.laneTarget - this.y) * 0.35;
      this.running = false;
      this.action = "move";
    }

    // Calm stroll — odd locals get on the blower
    const calmPhone =
      !bike &&
      !scrapNearby &&
      now >= this.panicUntil &&
      now >= this.filmUntil;
    if (calmPhone) this.tickPhoneChat(now);
    if (now < this.phoneUntil) {
      // Amble while nattering — not a power-walk
      this.running = false;
      this.action = "move";
      vx *= 0.85;
      vy *= 0.85;
    }

    if (this.variant === "wheelchair") vy *= 0.35;

    // Truly wedged: slide to a freer lane; only reverse if still jammed
    if (this.wantedMoveLast && this.stuckMs > 700) {
      const roomUp = this.y - strollMin;
      const roomDown = strollMax - this.y;
      const side = roomUp >= roomDown ? -1 : 1;
      this.laneTarget = Phaser.Math.Clamp(this.y + side * 72, strollMin, strollMax);
      vy = side * 1.2;
      if (this.stuckMs > 1400) {
        this.wanderDir *= -1;
        vx = this.wanderDir;
        this.stuckMs = 0;
        this.rethinkAt = now + 1200;
      }
    }

    const steered = steerAway(this.x, this.y, vx, vy, allObs, 58, strollMin, strollMax);
    const legMul = this.variant === "wheelchair" ? 1 : this.structure.moveSpeedFactor();
    const spd = (this.running && legMul > 0.55 ? this.runSpeed : this.speed) * legMul;
    const dodgeHard = Math.abs(steered.vy) > 0.5;
    this.x += steered.vx * spd * (dodgeHard ? 0.75 : 1) * dt;
    this.y += steered.vy * spd * (dodgeHard ? 1.1 : 0.9) * dt;

    // Face the way they're trying to stroll — don't flicker off tiny steer noise
    if (Math.abs(vx) > 0.2) {
      this.setFacing(vx > 0 ? 1 : -1, now);
    }
    if (this.mount) this.mount.setFlipX(this.facing < 0);

    this.x = Phaser.Math.Clamp(this.x, this.strollMinX(), LANE.maxX);
    if (this.variant === "dog_walker" && this.x <= this.strollMinX() + 8) {
      this.wanderDir = 1;
    }
    this.clampStrollY();
    this.noteStuckProgress(dt, Math.abs(vx) > 0.15 || Math.abs(vy) > 0.15);
    this.maybeRemarkOnBodies(now, threats);
  }

  /** Track whether walking is actually progressing — used to walk round props. */
  private noteStuckProgress(dt: number, wantedMove: boolean): void {
    const moved = Math.hypot(this.x - this.prevStuckX, this.y - this.prevStuckY);
    this.prevStuckX = this.x;
    this.prevStuckY = this.y;
    // Walkers only cover ~1px/frame — don't treat normal ambling as jammed
    const expect = (this.running ? this.runSpeed : this.speed) * dt * 0.12;
    if (this.wantedMoveLast && moved < Math.max(0.35, expect)) {
      this.stuckMs += dt * 1000;
    } else {
      this.stuckMs = Math.max(0, this.stuckMs - dt * 2000);
    }
    this.wantedMoveLast = wantedMove;
  }

  /** Start / continue an overheard phone natter while strolling. */
  private tickPhoneChat(now: number): void {
    if (!this.phoneChatty || this.ally || this.isProtecting) return;
    if (this.coupleRole === "her") return; // him can natter; she stays on his arm

    if (this.phoneCooldownUntil === 0) {
      this.phoneCooldownUntil = now + 8000 + Math.random() * 14000;
    }

    if (now < this.phoneUntil) {
      if (now >= this.phoneNextAt && this.phoneLineIdx < this.phoneScript.length) {
        const line = this.phoneScript[this.phoneLineIdx]!;
        this.phoneLineIdx += 1;
        this.pendingLine = line;
        this.phoneNextAt = now + 2200 + Math.random() * 900 + line.length * 18;
        if (this.phoneLineIdx >= this.phoneScript.length) {
          this.phoneUntil = this.phoneNextAt + 400;
          this.phoneCooldownUntil = this.phoneUntil + 9000 + Math.random() * 12000;
        }
      }
      return;
    }

    if (now < this.phoneCooldownUntil) return;
    // Rare start — chatty flag already sparse
    if (Math.random() > 0.006) return;

    const script = PHONE_CHATS[Math.floor(Math.random() * PHONE_CHATS.length)]!;
    this.phoneScript = script;
    this.phoneLineIdx = 0;
    this.phoneUntil = now + 8500 + Math.random() * 2500;
    this.phoneNextAt = now + 350 + Math.random() * 400;
  }

  /** Missus stays on his arm while they stroll. */
  private updateCoupleFollow(
    now: number,
    dt: number,
    allObs: Obstacle[],
  ): void {
    const him = this.partner!;
    this.wanderDir = him.wanderDir;
    const side = this.y >= him.y ? 1 : -1;
    const goalX = him.x - him.wanderDir * 30;
    const goalY = Phaser.Math.Clamp(him.y + side * 12, PROMENADE.minY, PROMENADE.maxY);
    const dx = goalX - this.x;
    const dy = goalY - this.y;
    const dist = Math.hypot(dx, dy);
    let vx = 0;
    let vy = 0;
    if (dist > 8) {
      vx = dx / dist;
      vy = dy / dist;
    } else {
      vx = him.wanderDir * 0.85;
      vy = Math.sign(goalY - this.y) * 0.2;
    }
    const steered = steerAway(
      this.x,
      this.y,
      vx,
      vy,
      allObs,
      58,
      PROMENADE.minY,
      PROMENADE.maxY,
    );
    const spd = this.speed * this.structure.moveSpeedFactor() * (dist > 50 ? 1.15 : 0.95);
    this.x += steered.vx * spd * dt;
    this.y += steered.vy * spd * 1.0 * dt;
    this.setFacing(him.wanderDir, now);
    this.running = dist > 55;
    this.action = this.running ? "run" : "move";
    this.x = Phaser.Math.Clamp(this.x, LANE.minX, LANE.maxX);
    this.clampStrollY();
    this.noteStuckProgress(dt, dist > 8);
  }

  /** Bloke goes after whoever hurt his missus. */
  private updateVengeful(now: number, dt: number, t: Fighter): void {
    if (t.structure.isOut()) {
      this.vengefulTarget = null;
      this.pendingLine = "You alright love? Have a squinny.";
      return;
    }
    this.faceToward(t.x, now);
    const dist = Phaser.Math.Distance.Between(this.x, this.y, t.x, t.y);

    if (inReach(this, t) && now >= this.vengefulThinkAt) {
      this.vengefulThinkAt = now + 380 + Math.random() * 260;
      if (Math.random() < 0.45) this.tryKick(now);
      else this.tryPunch(now, false);
      return;
    }

    const dx = t.x - this.x;
    const dy = t.y - this.y;
    const len = Math.hypot(dx, dy) || 1;
    const spd = this.runSpeed * this.structure.moveSpeedFactor() * 1.05;
    this.running = dist > 70;
    this.stepAround(dx / len, dy / len, spd, dt);
    this.x = Phaser.Math.Clamp(this.x, LANE.minX, LANE.maxX);
    this.y = Phaser.Math.Clamp(this.y, LANE.minY, LANE.maxY);
    this.groundY = this.y;
    this.action = this.running ? "run" : "move";
  }

  /** See the player scrap a lad → sometimes jump in. */
  private considerWitnessJoin(now: number, threats: Fighter[]): void {
    if (this.ally || this.isCycling) return;
    const player = threats.find((t) => t.team === "player" && !t.structure.isOut());
    if (!player) return;
    const foe = threats.find(
      (t) =>
        t.team === "enemy" &&
        !t.structure.isOut() &&
        Phaser.Math.Distance.Between(player.x, player.y, t.x, t.y) < 160 &&
        Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y) < 280,
    );
    if (!foe) return;

    const playerScrap =
      player.action === "jab" ||
      player.action === "hook" ||
      player.action === "upper" ||
      player.action === "punch" ||
      player.action === "kick" ||
      player.action === "hitstun" ||
      player.action === "block" ||
      foe.action === "punch" ||
      foe.action === "hook" ||
      foe.action === "kick" ||
      foe.action === "hitstun" ||
      foe.structure.anger > 0.2;
    if (!playerScrap) return;

    const primed = now < this.spiteUntil;
    const chance = primed ? 0.008 : this.nosy ? 0.0012 : 0.0007;
    this.tryJoinPlayer(now, foe, chance);
  }

  /** Fight beside the player — punch the lad who started it. */
  private updateAlly(now: number, dt: number, threats: Fighter[]): void {
    const player = threats.find((t) => t.team === "player" && !t.structure.isOut());

    if (
      !this.allyTarget ||
      this.allyTarget.structure.isOut() ||
      this.allyTarget.team !== "enemy"
    ) {
      const next = threats.find(
        (t) =>
          t.team === "enemy" &&
          !t.structure.isOut() &&
          !t.isBackground &&
          player &&
          Phaser.Math.Distance.Between(t.x, t.y, player.x, player.y) < 280,
      );
      if (next) {
        this.allyTarget = next;
      } else if (this.partyMember && player) {
        this.allyTarget = null;
        this.followPlayer(now, dt, player);
        return;
      } else {
        this.ally = false;
        this.allyTarget = null;
        this.action = "idle";
        return;
      }
    }

    const t = this.allyTarget;
    if (!t) return;
    this.faceToward(t.x, now);
    const dist = Phaser.Math.Distance.Between(this.x, this.y, t.x, t.y);

    // Mid clinch — finish with a powerbomb / German
    if (this.action === "hold" && this.heldTarget && now >= this.allyThinkAt) {
      this.allyThinkAt = now + 180;
      const behind = this.holdFromBehind;
      if (this.tryBodyToss(now)) {
        this.callTeachMove(now, behind ? "german_suplex" : "body_toss");
      }
      return;
    }

    // Finish a jump kick if we hopped for the lesson
    if (this.airborne && this.wantsTeach("jump_kick") && now >= this.allyThinkAt) {
      this.allyThinkAt = now + 200;
      if (this.tryJumpKick(now)) this.callTeachMove(now, "jump_kick");
      return;
    }

    if (inReach(this, t, this.attackReach + 10) && now >= this.allyThinkAt) {
      this.allyThinkAt = now + 380 + Math.random() * 220;
      this.pickAllyAttack(now, t, threats);
      return;
    }

    const dx = t.x - this.x;
    const dy = t.y - this.y;
    const len = Math.hypot(dx, dy) || 1;
    this.running = dist > 90;
    const rush =
      (this.running ? this.runSpeed : this.speed) * this.structure.moveSpeedFactor();
    this.stepAround(dx / len, dy / len, rush, dt);
    this.x = Phaser.Math.Clamp(this.x, LANE.minX, LANE.maxX);
    this.y = Phaser.Math.Clamp(this.y, LANE.minY, LANE.maxY);
    this.groundY = this.y;
    this.action = this.running ? "run" : "move";

    // Running teach moves — slide / headbutt when closing
    if (this.running && dist < 70 && now >= this.allyThinkAt) {
      this.allyThinkAt = now + 400;
      if (this.wantsTeach("slide") && this.trySlide(now)) {
        this.callTeachMove(now, "slide");
      } else if (this.wantsTeach("headbutt") && this.tryPunch(now, true)) {
        this.callTeachMove(now, "headbutt");
      }
    }
  }

  private followPlayer(now: number, dt: number, player: Fighter): void {
    const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
    if (dist < 48) {
      this.running = false;
      this.action = "idle";
      this.faceToward(player.x, now);
      return;
    }
    this.faceToward(player.x, now);
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const len = Math.hypot(dx, dy) || 1;
    this.running = dist > 110;
    const rush = (this.running ? this.runSpeed : this.speed) * this.structure.moveSpeedFactor();
    this.stepAround(dx / len, dy / len, rush, dt);
    this.x = Phaser.Math.Clamp(this.x, LANE.minX, LANE.maxX);
    this.y = Phaser.Math.Clamp(this.y, LANE.minY, LANE.maxY);
    this.groundY = this.y;
    this.action = this.running ? "run" : "move";
  }

  private stepAround(vx: number, vy: number, spd: number, dt: number): void {
    if (this.frameObstacles.length === 0) {
      this.x += vx * spd * dt;
      this.y += vy * spd * 0.85 * dt;
      return;
    }
    const steered = steerAway(
      this.x,
      this.y,
      vx,
      vy,
      this.frameObstacles,
      56,
      LANE.minY,
      LANE.maxY,
    );
    this.x += steered.vx * spd * dt;
    this.y += steered.vy * spd * 1.0 * dt;
  }

  private wantsTeach(key: string): boolean {
    if (this.teachMoves.length === 0) return false;
    if (!this.teachMoves.includes(key)) return Math.random() < 0.12;
    // Strongly favour promised moves
    return Math.random() < 0.72;
  }

  private pickAllyAttack(now: number, t: Fighter, threats: Fighter[]): void {
    const floored = t.structure.downed || t.structure.isOut();
    const behind = (this.x - t.x) * t.facing < -8;
    const crowd = threats.filter(
      (f) =>
        f.team === "enemy" &&
        !f.structure.isOut() &&
        Phaser.Math.Distance.Between(this.x, this.y, f.x, f.y) < 70,
    ).length;

    if (floored && this.wantsTeach("stomp") && this.tryStomp(now)) {
      this.callTeachMove(now, "stomp");
      return;
    }
    if (!floored && this.wantsTeach("grab") && this.tryGrab(now, threats)) {
      this.callTeachMove(now, "grab");
      return;
    }
    if (!floored && this.wantsTeach("body_toss") && this.tryGrab(now, threats)) {
      this.callTeachMove(now, "grab");
      return;
    }
    if (!floored && behind && this.wantsTeach("german_suplex") && this.tryGrab(now, threats)) {
      this.callTeachMove(now, "german_suplex");
      return;
    }
    if (!floored && behind && this.wantsTeach("back_attack") && this.tryBackAttack(now)) {
      this.callTeachMove(now, "back_attack");
      return;
    }
    if (!floored && this.wantsTeach("low_blow") && this.tryLowBlow(now)) {
      this.callTeachMove(now, "low_blow");
      return;
    }
    if (crowd >= 2 && this.wantsTeach("whirl") && this.tryWhirl(now)) {
      this.callTeachMove(now, "whirl");
      return;
    }
    if (this.wantsTeach("combo")) {
      const step = this.coachComboStep % 3;
      this.coachComboStep += 1;
      if (step === 0 && this.tryJab(now)) {
        this.callTeachMove(now, "combo");
        return;
      }
      if (step === 1 && this.tryHook(now)) {
        this.callTeachMove(now, "combo");
        return;
      }
      if (step === 2 && this.tryUpper(now)) {
        this.callTeachMove(now, "combo");
        return;
      }
    }
    if (this.wantsTeach("jump_kick") && this.tryJump(now)) {
      this.callTeachMove(now, "jump_kick");
      return;
    }

    // Default scrap — still punch/kick hard
    if (floored && this.tryStomp(now)) return;
    if (Math.random() < 0.35 && this.tryKick(now)) return;
    if (Math.random() < 0.2 && this.tryLowBlow(now)) return;
    this.tryPunch(now, false);
  }

  private callTeachMove(now: number, key: string): void {
    if (!this.teachMoves.includes(key)) return;
    if (now < this.teachCallAt) return;
    const tip =
      key === "jump_kick" && isMobilePlay()
        ? CASEY_MOVE_CALLS.jump_kick_mobile
        : CASEY_MOVE_CALLS[key];
    if (!tip) return;
    this.pendingLine = tip;
    this.teachCallAt = now + 4200 + Math.random() * 1800;
  }

  /** Midpoint of a real scrap — not someone shadow-boxing mid-air. */
  private findScrap(threats: Fighter[]): { x: number; y: number } | null {
    const player = threats.find(
      (t) => t.team === "player" && !t.structure.isOut() && !t.structure.cuffed,
    );
    if (!player) return null;

    const foe = threats.find(
      (t) =>
        t.team === "enemy" &&
        !t.structure.isOut() &&
        !t.isBackground &&
        Phaser.Math.Distance.Between(player.x, player.y, t.x, t.y) < 170,
    );
    if (!foe) return null;

    // Need an actual exchange — enemy swinging / hit / mad, or the player getting clipped.
    // Punching thin air with nobody engaging does not count.
    if (!this.isInRealFight(player, foe)) return null;

    return {
      x: (player.x + foe.x) / 2,
      y: (player.laneY + foe.laneY) / 2,
    };
  }

  /** Aim point while the phone is still up between flurries. */
  private lastScrapAim(threats: Fighter[]): { x: number; y: number } | null {
    const player = threats.find(
      (t) => t.team === "player" && !t.structure.isOut() && !t.structure.cuffed,
    );
    if (!player) return null;
    const foe = threats.find(
      (t) =>
        t.team === "enemy" &&
        !t.isBackground &&
        Phaser.Math.Distance.Between(player.x, player.y, t.x, t.y) < 220,
    );
    if (!foe) return { x: player.x, y: player.laneY };
    return {
      x: (player.x + foe.x) / 2,
      y: (player.laneY + foe.laneY) / 2,
    };
  }

  private isInRealFight(player: Fighter, foe: Fighter): boolean {
    const combatPose = (a: string): boolean =>
      a === "jab" ||
      a === "hook" ||
      a === "upper" ||
      a === "punch" ||
      a === "kick" ||
      a === "stomp" ||
      a === "hitstun" ||
      a === "headbutt" ||
      a === "backhand" ||
      a === "jump_kick" ||
      a === "swanton" ||
      a === "hurricanrana" ||
      a === "weapon_swing" ||
      a === "grab" ||
      a === "hold" ||
      a === "body_toss" ||
      a === "low_blow" ||
      a === "throw" ||
      a === "whirl" ||
      a === "slide" ||
      a === "block";

    // Engaged lad (swinging / circling in anger / already hurt) — not a random walker.
    return (
      combatPose(foe.action) ||
      combatPose(player.action) ||
      foe.structure.anger > 0.12 ||
      foe.structure.downed ||
      foe.structure.wornFactor() > 0.04 ||
      player.action === "hitstun" ||
      player.structure.downed ||
      player.structure.wornFactor() > 0.04
    );
  }
}
