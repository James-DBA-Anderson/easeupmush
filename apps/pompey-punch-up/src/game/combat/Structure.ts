/** Wear-down model — no hit points, no health bars. */

export type StrikeKind =
  | "jab"
  | "hook"
  | "kick"
  | "boot_head"
  | "low_blow"
  | "chin_shot"
  | "headbutt"
  | "backhand"
  | "taser"
  | "jump_kick"
  | "weapon_swing"
  | "thrown";

export type StrikeResult =
  | "blocked"
  | "flinch"
  | "winded"
  | "stumble"
  | "disabled"
  | "opened"
  | "crawl_away"
  | "out_cold"
  | "cuffed"
  | "tased";

export type PainFocus = "none" | "gut" | "arm" | "leg" | "face";

export interface StrikeInput {
  kind: StrikeKind;
  power: number;
  critical: boolean;
  dirty: boolean;
  onOpening: boolean;
  now: number;
  bodyPart?: "head" | "body" | "arm" | "leg" | "low" | "face";
  /** Direction the victim is shoved (attacker's attackDir). */
  knockDir?: number;
  /** Defender is holding an active guard stance. */
  activeBlock?: boolean;
  /** Strike landed from behind the defender's facing — guard does not cover this. */
  hitFromBehind?: boolean;
  /**
   * Body-toss slam — wear + possible finish when battered.
   * Survivors are not soft-floored; they bounce straight back up.
   */
  softFloorOnly?: boolean;
}

export interface LootDrop {
  money: number;
  weapon: "none" | "bottle" | "bat" | "brick" | "chain" | "cue" | "knuckle";
}

export interface StructureOptions {
  toughness?: number;
  loot?: LootDrop;
  /** How fast wind/guard/balance come back out of combat. */
  recovery?: number;
}

export class Structure {
  toughness: number;
  /** 0 = never gets their breath back. */
  readonly recovery: number;

  balance = 1;
  wind = 1;
  guard = 1;
  anger = 0;
  armLeft = 1;
  armRight = 1;
  legLeft = 1;
  legRight = 1;
  gutPain = 0;
  armPain = 0;
  legPain = 0;
  facePain = 0;
  openUntil = 0;
  groundedUntil = 0;
  disabledUntil = 0;
  tasedUntil = 0;
  downed = false;
  outCold = false;
  crawling = false;
  cuffed = false;
  /** Bottle smash etc. — face cut, lasting visual */
  bloodied = false;
  loot: LootDrop;
  looted = false;

  constructor(opts: StructureOptions = {}) {
    this.toughness = Math.max(0.35, opts.toughness ?? 1);
    this.recovery = Math.max(0, opts.recovery ?? 0.35);
    this.loot = opts.loot ?? {
      money: 5 + Math.floor(Math.random() * 20),
      weapon: Math.random() < 0.35 ? "bottle" : "none",
    };
  }

  isOpen(now: number): boolean {
    return now < this.openUntil || now < this.groundedUntil || now < this.tasedUntil;
  }

  isDisabled(now: number): boolean {
    return now < this.disabledUntil || now < this.tasedUntil;
  }

  /** Permanent fight-over states — never get back up to scrap. */
  isOut(): boolean {
    return this.outCold || this.crawling || this.cuffed;
  }

  isLootable(): boolean {
    return this.isOut() && !this.looted;
  }

  wornFactor(): number {
    return 1 - (this.balance + this.wind + this.guard) / 3;
  }

  faceAnger(): "calm" | "cross" | "steaming" {
    if (this.anger >= 0.65) return "steaming";
    if (this.anger >= 0.3) return "cross";
    return "calm";
  }

  painFocus(): PainFocus {
    if (this.legPain >= 0.45 || (this.legLeft + this.legRight) / 2 < 0.5) return "leg";
    if (this.armPain >= 0.45 || this.armRight < 0.45) return "arm";
    if (this.gutPain >= 0.4) return "gut";
    if (this.facePain >= 0.45) return "face";
    return "none";
  }

  /** Arms affect punches / blocks / grabs — never walk speed. */
  armsUsable(): boolean {
    return (this.armLeft + this.armRight) / 2 > 0.4 && this.armPain < 0.55;
  }

  /** Legs gate kicks / jumps; only legs slow movement. */
  legsUsable(): boolean {
    return (this.legLeft + this.legRight) / 2 > 0.35 && this.legPain < 0.7;
  }

  /** 1 = fine, down toward ~0.32 when legs are wrecked. Arms ignored. */
  moveSpeedFactor(): number {
    const legs = (this.legLeft + this.legRight) / 2;
    const f = legs * (1 - this.legPain * 0.45);
    return clamp(Math.max(0.32, f), 0.32, 1);
  }

  decayPain(dt: number): void {
    this.gutPain = clamp(this.gutPain - dt * 0.08);
    this.armPain = clamp(this.armPain - dt * 0.06);
    this.legPain = clamp(this.legPain - dt * 0.05);
    this.facePain = clamp(this.facePain - dt * 0.07);
  }

  /**
   * Nobody's laid a finger on you for a moment — get your wind back.
   * Never mends a wrecked limb; that still needs a feed.
   */
  catchBreath(dt: number): void {
    if (this.recovery <= 0) return;
    if (this.isOut() || this.downed) return;
    const r = this.recovery * dt;
    this.wind = clamp(this.wind + r * 0.1);
    this.balance = clamp(this.balance + r * 0.09);
    this.guard = clamp(this.guard + r * 0.12);
    this.anger = clamp(this.anger - r * 0.05);
  }

  createOpening(now: number, ms: number): void {
    if (this.isOut()) return;
    const scale = 1 / Math.sqrt(this.toughness);
    this.openUntil = Math.max(this.openUntil, now + ms * scale);
  }

  /** Temporary knockdown — they can get up after `ms`. Pass `force` to refresh an intentional plant (powerbomb). */
  putOnFloor(now: number, ms: number, force = false): void {
    if (this.isOut()) return;
    const scale = 1 / Math.sqrt(this.toughness);
    const dur = Math.max(120, ms * scale);
    // Already soft-floored — don't refresh the timer under a punch storm
    // (that left lads planted forever while still taking hits).
    if (
      !force &&
      this.downed &&
      Number.isFinite(this.groundedUntil) &&
      now < this.groundedUntil &&
      ms <= 2500
    ) {
      this.createOpening(now, Math.min(ms, 280));
      return;
    }
    // Soft scraps: hard-cap so clinch refreshes can't soft-lock anyone on the deck.
    // Long intentional downs (intro sleep, etc.) keep their full timer.
    if (ms <= 2500) {
      this.groundedUntil = force
        ? now + Math.min(dur, 2200)
        : Math.min(
            Math.max(this.groundedUntil, now + Math.min(dur, 2200)),
            now + 2200,
          );
    } else {
      this.groundedUntil = Math.max(this.groundedUntil, now + dur);
    }
    this.downed = true;
    // Opening only while they're on the deck — not for the full multi-second timer
    this.createOpening(now, Math.min(ms, 480));
  }

  /** Clears temporary downs only. KO / crawl / cuffs stay down. Returns true if they stood up. */
  recoverFloor(now: number): boolean {
    if (this.isOut()) {
      this.downed = true;
      return false;
    }
    if (!this.downed) return false;
    if (now >= this.groundedUntil) {
      this.downed = false;
      // Don't stay "open" from the knockdown timer after you're back up
      if (this.openUntil > now) this.openUntil = now;
      return true;
    }
    return false;
  }

  applyTaser(now: number): StrikeResult {
    if (this.isOut()) return "blocked";
    this.tasedUntil = now + 1400;
    this.createOpening(now, 1400);
    this.balance = clamp(this.balance - 0.15);
    this.putOnFloor(now, 1400);
    return "tased";
  }

  applyCuffs(): StrikeResult {
    this.cuffed = true;
    this.downed = true;
    this.openUntil = 0;
    this.groundedUntil = Number.POSITIVE_INFINITY;
    return "cuffed";
  }

  /**
   * How run-down you are, 0 (fresh) → 1 (wrecked). Combines the wear-down
   * pools with lingering pain so a feed has something to fix.
   */
  hunger(): number {
    const worn = this.wornFactor();
    const pain =
      (this.gutPain + this.armPain + this.legPain + this.facePain) / 4;
    const limbs =
      1 - (this.armLeft + this.armRight + this.legLeft + this.legRight) / 4;
    return clamp(worn * 0.55 + pain * 0.3 + limbs * 0.15);
  }

  /** Worth paying for a feed? Below this a scoff would mostly go to waste. */
  needsFeed(): boolean {
    return this.hunger() > 0.12;
  }

  /**
   * Scoff a portion of seaside grub — gets your wind back, settles the guard
   * and takes the edge off. Won't undo a wrecked limb entirely.
   */
  feed(quality: number): boolean {
    if (this.isOut()) return false;
    const q = clamp(quality, 0.1, 1);
    this.wind = clamp(this.wind + 0.42 * q);
    this.balance = clamp(this.balance + 0.34 * q);
    this.guard = clamp(this.guard + 0.3 * q);
    this.gutPain = clamp(this.gutPain - 0.5 * q);
    this.armPain = clamp(this.armPain - 0.4 * q);
    this.legPain = clamp(this.legPain - 0.4 * q);
    this.facePain = clamp(this.facePain - 0.35 * q);
    this.armLeft = clamp(this.armLeft + 0.16 * q);
    this.armRight = clamp(this.armRight + 0.16 * q);
    this.legLeft = clamp(this.legLeft + 0.16 * q);
    this.legRight = clamp(this.legRight + 0.16 * q);
    // A hot meal steadies you rather than winding you up
    this.anger = clamp(this.anger - 0.15 * q);
    return true;
  }

  takeLoot(): LootDrop | null {
    if (!this.isLootable()) return null;
    this.looted = true;
    return { ...this.loot };
  }

  /** Hauled back up after the dust settles. Keeps the wear-down feel, but not a hard reset. */
  revive(pickup = 0.4): boolean {
    if (this.cuffed) return false;
    // Allow haul-up from KO / crawl / temporary floor so callers aren't stuck
    if (!this.isOut() && !this.downed) return false;
    const q = clamp(pickup, 0.2, 0.8);
    this.outCold = false;
    this.crawling = false;
    this.downed = false;
    this.openUntil = 0;
    this.groundedUntil = 0;
    this.disabledUntil = 0;
    this.tasedUntil = 0;
    this.wind = Math.max(this.wind, 0.22 + q * 0.25);
    this.balance = Math.max(this.balance, 0.24 + q * 0.22);
    this.guard = Math.max(this.guard, 0.18 + q * 0.18);
    this.anger = clamp(this.anger - 0.12 * q);
    this.gutPain = clamp(this.gutPain - 0.18 * q);
    this.facePain = clamp(this.facePain - 0.12 * q);
    return true;
  }

  applyStrike(hit: StrikeInput): StrikeResult {
    // Crawlers can still take a finishing boot — everything else leaves them be
    if (this.crawling && !this.outCold && !this.cuffed) {
      if (hit.kind === "boot_head") return this.knockOutCold();
      return "blocked";
    }
    // Already finished — a boot still "connects" so the body can twitch
    if (this.isOut()) {
      if (hit.kind === "boot_head") return "flinch";
      return "blocked";
    }

    // Body-toss slam — KO/crawl only when worn; never soft-floor (that fought get-up).
    if (hit.softFloorOnly) {
      const t = this.toughness;
      this.wind = clamp(this.wind - (0.12 + hit.power * 0.14) / t);
      this.balance = clamp(this.balance - (0.14 + hit.power * 0.16) / t);
      this.guard = clamp(this.guard - (0.1 * hit.power) / t);
      if (hit.bodyPart === "head" || hit.bodyPart === "face") {
        this.facePain = clamp(this.facePain + 0.1 + hit.power * 0.08);
      } else {
        this.gutPain = clamp(this.gutPain + 0.12 + hit.power * 0.1);
      }
      const wornNow = this.wornFactor();
      // Only permanent finishes — skip finish()'s soft-floor stumble path
      if (wornNow >= 0.42) {
        const result = this.finish(hit, true);
        if (result === "out_cold" || result === "crawl_away") return result;
      }
      this.downed = false;
      this.groundedUntil = 0;
      // Tiny open — get-up grace covers the scramble; a long open caused punch→floor flicker
      this.createOpening(hit.now, 80);
      return "flinch";
    }

    const t = this.toughness;

    // Soft temporary floor — punches wear them; only a boot (or wreck) finishes.
    // Without this, open+chin upgrades from resolveCombat called finish() and
    // permanently planted fresh powerbomb victims mid-air.
    if (this.downed && hit.kind !== "boot_head") {
      this.wind = clamp(this.wind - (0.05 + hit.power * 0.07) / t);
      this.balance = clamp(this.balance - (0.04 + hit.power * 0.05) / t);
      this.guard = clamp(this.guard - (0.06 * hit.power) / t);
      if (hit.bodyPart === "head" || hit.bodyPart === "face" || hit.critical) {
        this.facePain = clamp(this.facePain + 0.12 + hit.power * 0.1);
      } else {
        this.gutPain = clamp(this.gutPain + 0.1 + hit.power * 0.08);
      }
      const wornNow = this.wornFactor();
      if (wornNow >= 0.58 && (hit.power >= 0.55 || hit.critical)) {
        return this.finish(hit, hit.critical || hit.kind === "headbutt");
      }
      this.createOpening(hit.now, 180);
      return "flinch";
    }

    const open = hit.onOpening || this.isOpen(hit.now) || this.downed;
    const part = hit.bodyPart ?? (hit.dirty ? "low" : hit.critical ? "head" : "body");

    if (part === "arm") {
      this.armPain = clamp(this.armPain + 0.35 + hit.power * 0.25);
      this.armRight = clamp(this.armRight - (0.18 * hit.power) / t);
    } else if (part === "leg") {
      this.legPain = clamp(this.legPain + 0.35 + hit.power * 0.25);
      this.legRight = clamp(this.legRight - (0.2 * hit.power) / t);
    } else if (part === "low") {
      this.gutPain = clamp(this.gutPain + 0.25 + hit.power * 0.15);
      this.legPain = clamp(this.legPain + 0.2 + hit.power * 0.15);
      this.legLeft = clamp(this.legLeft - (0.08 * hit.power) / t);
      this.legRight = clamp(this.legRight - (0.08 * hit.power) / t);
    } else if (part === "body") {
      this.gutPain = clamp(this.gutPain + 0.3 + hit.power * 0.2);
    } else if (part === "head" || part === "face") {
      this.facePain = clamp(this.facePain + 0.35 + hit.power * 0.25);
    }

    if (hit.kind === "taser") return this.applyTaser(hit.now);

    if (hit.dirty) {
      this.anger = clamp(this.anger + 0.35 + hit.power * 0.2);
      this.disabledUntil = hit.now + (900 + hit.power * 400) / Math.sqrt(t);
      this.gutPain = clamp(this.gutPain + 0.5);
      this.legPain = clamp(this.legPain + 0.35);
      this.legRight = clamp(this.legRight - 0.12 / t);
      this.wind = clamp(this.wind - 0.12 / t);
      this.balance = clamp(this.balance - 0.08 / t);
      this.createOpening(hit.now, 350);
      return "disabled";
    }

    if (hit.kind === "headbutt") {
      this.facePain = clamp(this.facePain + 0.4);
      this.balance = clamp(this.balance - (0.14 + hit.power * 0.1) / t);
      this.wind = clamp(this.wind - 0.1 / t);
      if (open || this.wornFactor() > 0.28 || this.wind < 0.5) {
        return this.finish(hit, true);
      }
    }

    if (hit.kind === "chin_shot") {
      this.facePain = clamp(this.facePain + 0.55);
      this.balance = clamp(this.balance - (0.18 + hit.power * 0.12) / t);
      this.wind = clamp(this.wind - 0.12 / t);
      this.createOpening(hit.now, 420);
      // Only finish / floor if already softened — a fresh chin doesn't one-shot
      if (open || this.wornFactor() > 0.32 || this.balance < 0.32) {
        return this.finish(hit, true);
      }
      if (this.balance < 0.42 / Math.sqrt(Math.min(t, 3.5))) {
        this.putOnFloor(hit.now, 900);
        return "stumble";
      }
      return "winded";
    }

    if (hit.kind === "jump_kick") {
      this.balance = clamp(this.balance - (0.16 + hit.power * 0.12) / t);
      this.wind = clamp(this.wind - 0.12 / t);
      this.gutPain = clamp(this.gutPain + 0.25);
      if (open || this.wornFactor() > 0.25 || this.downed) {
        return this.finish(hit, true);
      }
    }

    if (hit.kind === "weapon_swing" || hit.kind === "thrown") {
      this.armPain = clamp(this.armPain + (hit.kind === "thrown" ? 0.25 : 0.4));
      this.armRight = clamp(this.armRight - (hit.kind === "thrown" ? 0.1 : 0.2) / t);
      this.facePain = clamp(this.facePain + (hit.kind === "thrown" ? 0.35 : 0));
      if (hit.kind === "thrown") {
        // Bottle / brick — glass to the face: bloody, not an automatic KO
        this.bloodied = true;
        this.facePain = clamp(this.facePain + 0.4);
        this.anger = clamp(this.anger + 0.22);
      }
      this.balance = clamp(this.balance - (0.12 + hit.power * 0.1) / t);
      this.wind = clamp(this.wind - 0.1 / t);
      if (hit.kind === "thrown") {
        if (open || this.wornFactor() >= 0.48 || this.downed) {
          return this.finish(hit, hit.critical && this.wornFactor() >= 0.55);
        }
        if (this.balance < 0.4) {
          this.putOnFloor(hit.now, 1000);
          return "stumble";
        }
        this.createOpening(hit.now, 520);
        return "winded";
      }
      if (open || this.wornFactor() >= 0.3) {
        return this.finish(hit, hit.critical);
      }
    }

    if (hit.kind === "boot_head" && (open || this.downed)) {
      return this.finish(hit, true);
    }

    if (hit.critical && open && hit.power >= 0.5) {
      return this.finish(hit, true);
    }

    const canBlock =
      !open &&
      !hit.hitFromBehind &&
      this.guard > 0.28 &&
      this.armsUsable() &&
      !this.downed;
    const active = !!hit.activeBlock && canBlock;

    // Active guard eats most strikes; passive guard only soft ones
    if (active && hit.power < 0.95 && hit.kind !== "jump_kick" && hit.kind !== "boot_head") {
      this.guard = clamp(this.guard - (0.14 * hit.power) / t);
      this.wind = clamp(this.wind - (0.05 * hit.power) / t);
      this.armRight = clamp(this.armRight - (0.05 * hit.power) / t);
      this.anger = clamp(this.anger + 0.04 + hit.power * 0.03);
      if (this.guard < 0.38) this.createOpening(hit.now, 280);
      return "blocked";
    }

    if (canBlock && hit.power < 0.72) {
      this.guard = clamp(this.guard - (0.14 * hit.power) / t);
      this.wind = clamp(this.wind - (0.08 * hit.power) / t);
      this.armRight = clamp(this.armRight - (0.07 * hit.power) / t);
      if (this.guard < 0.4) this.createOpening(hit.now, 280);
      if (this.wornFactor() >= 0.7) return this.finish(hit, hit.critical);
      return hit.power > 0.55 ? "flinch" : "blocked";
    }

    this.wind = clamp(this.wind - (0.12 + hit.power * 0.16) / t);
    this.balance = clamp(this.balance - (0.1 + hit.power * 0.14) / t);
    this.guard = clamp(this.guard - (0.12 * hit.power) / t);

    const wornNow = this.wornFactor();

    // Worn enough → stay down (crawl or KO). Needs real battering, not one punch.
    if (wornNow >= 0.48 && (open || hit.power >= 0.55 || wornNow >= 0.58)) {
      return this.finish(hit, hit.critical || hit.kind === "headbutt");
    }
    if (this.wind < 0.24 || this.balance < 0.2 || wornNow >= 0.65) {
      return this.finish(hit, hit.critical && open);
    }

    // Temporary — can get up (toughness fully counts; no artificial 1.4 cap)
    if (this.balance < 0.3 / Math.sqrt(Math.min(t, 4))) {
      this.putOnFloor(hit.now, 900);
      return "stumble";
    }
    if (this.wind < 0.42) {
      this.createOpening(hit.now, 450);
      return "winded";
    }

    this.createOpening(hit.now, 240);
    return "flinch";
  }

  private finish(hit: StrikeInput, allowOutCold: boolean): StrikeResult {
    const worn = this.wornFactor();
    // Stomps always KO. Other cold finishes need allowOutCold + real wear / finishers.
    // (A free-floating random KO used to put fresh powerbomb victims down forever.)
    const outCold =
      hit.kind === "boot_head" ||
      (allowOutCold &&
        (hit.kind === "headbutt" ||
          (hit.critical && hit.kind === "jump_kick") ||
          (hit.critical && hit.kind === "thrown" && worn >= 0.5) ||
          worn >= 0.55 ||
          (worn >= 0.45 && Math.random() > 0.45)));

    if (outCold) return this.knockOutCold();

    // Crawl only when they've actually been worn down — otherwise soft floor.
    // (allowOutCold + !outCold used to always crawl forever, so fresh slam
    // victims never got up if anything called finish().)
    if (allowOutCold && worn >= 0.42) {
      this.crawling = true;
      this.outCold = false;
      this.downed = true;
      this.openUntil = 0;
      this.groundedUntil = Number.POSITIVE_INFINITY;
      return "crawl_away";
    }

    this.putOnFloor(hit.now, 1100 + Math.floor(Math.random() * 400));
    return "stumble";
  }

  /** Lights out — no crawl, done for this scrap. */
  knockOutCold(): StrikeResult {
    this.outCold = true;
    this.crawling = false;
    this.downed = true;
    this.openUntil = 0;
    this.groundedUntil = Number.POSITIVE_INFINITY;
    return "out_cold";
  }
}

function clamp(n: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, n));
}
