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
}

export interface LootDrop {
  money: number;
  weapon: "none" | "bottle" | "bat" | "brick";
}

export interface StructureOptions {
  toughness?: number;
  loot?: LootDrop;
}

export class Structure {
  readonly toughness: number;

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

  createOpening(now: number, ms: number): void {
    if (this.isOut()) return;
    const scale = 1 / Math.sqrt(this.toughness);
    this.openUntil = Math.max(this.openUntil, now + ms * scale);
  }

  /** Temporary knockdown — they can get up after `ms`. */
  putOnFloor(now: number, ms: number): void {
    if (this.isOut()) return;
    const scale = 1 / Math.sqrt(this.toughness);
    this.groundedUntil = Math.max(this.groundedUntil, now + ms * scale);
    this.downed = true;
    this.createOpening(now, ms);
  }

  /** Clears temporary downs only. KO / crawl / cuffs stay down. */
  recoverFloor(now: number): void {
    if (this.isOut()) {
      this.downed = true;
      return;
    }
    if (now >= this.groundedUntil) {
      this.downed = false;
    }
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

  takeLoot(): LootDrop | null {
    if (!this.isLootable()) return null;
    this.looted = true;
    return { ...this.loot };
  }

  applyStrike(hit: StrikeInput): StrikeResult {
    if (this.isOut()) return "blocked";

    const open = hit.onOpening || this.isOpen(hit.now) || this.downed;
    const t = this.toughness;
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
      if (open || this.wornFactor() > 0.22 || this.balance < 0.45) {
        return this.finish(hit, true);
      }
      this.putOnFloor(hit.now, 1100);
      return "stumble";
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
      if (hit.kind === "thrown" && hit.critical) {
        // Bottle smash — glass to the face
        this.bloodied = true;
        this.facePain = clamp(this.facePain + 0.45);
        this.anger = clamp(this.anger + 0.25);
      }
      this.balance = clamp(this.balance - (0.12 + hit.power * 0.1) / t);
      this.wind = clamp(this.wind - 0.1 / t);
      if (open || this.wornFactor() >= 0.3 || (hit.kind === "thrown" && hit.power >= 0.7)) {
        return this.finish(hit, hit.critical || hit.kind === "thrown");
      }
    }

    if (hit.kind === "boot_head" && (open || this.downed)) {
      return this.finish(hit, true);
    }

    if (hit.critical && open && hit.power >= 0.5) {
      return this.finish(hit, true);
    }

    const canBlock =
      !open && this.guard > 0.28 && this.armsUsable() && !this.downed;
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

    // Worn enough → stay down (crawl or KO). Punches count once battered.
    if (wornNow >= 0.38 && (open || hit.power >= 0.5 || wornNow >= 0.5)) {
      return this.finish(hit, hit.critical || hit.kind === "headbutt");
    }
    if (this.wind < 0.24 || this.balance < 0.2 || wornNow >= 0.65) {
      return this.finish(hit, hit.critical && open);
    }

    // Temporary — can get up
    if (this.balance < 0.34 / Math.min(t, 1.4)) {
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
    const outCold =
      allowOutCold &&
      (hit.kind === "boot_head" ||
        hit.kind === "headbutt" ||
        (hit.critical && hit.kind === "jump_kick") ||
        (hit.critical && hit.kind === "thrown") ||
        worn >= 0.72);

    if (outCold) {
      this.outCold = true;
      this.crawling = false;
      this.downed = true;
      this.openUntil = 0;
      this.groundedUntil = Number.POSITIVE_INFINITY;
      return "out_cold";
    }

    // Badly worn → crawl away (can still be looted / boot-finished)
    this.crawling = true;
    this.outCold = false;
    this.downed = true;
    this.openUntil = 0;
    this.groundedUntil = Number.POSITIVE_INFINITY;
    return "crawl_away";
  }
}

function clamp(n: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, n));
}
