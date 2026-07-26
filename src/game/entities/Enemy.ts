import Phaser from "phaser";
import { LANE } from "../constants";
import { Fighter, inReach } from "./Fighter";
import { pickLook } from "../assets/pompeyLooks";

const INSULTS = [
  "Come on then!",
  "You what mate?",
  "Fancy it?",
  "Oi!",
  "Have it!",
  "Wrong beach mate",
  "Pompey!",
  "What's your game?",
  "Think you're hard?",
  "Outside then!",
  "I'll have you",
  "Shut it",
  "Go on then",
  "Soft lad",
];

const STOMP_LINES = ["Stamp him!", "Boot him!", "On the floor!", "Have that!", "Put the boot in!"];

const CALL_DURATION_MS = 3400;

type Mood = "patrol" | "alert" | "fight";
type CallOutcome = "success" | "interrupted";

export interface EnemyOptions {
  toughness?: number;
  boss?: boolean;
  homeRadius?: number;
  aggroRange?: number;
  scaleBoost?: number;
  /** Mad lads don't guard — they just come at you. */
  mad?: boolean;
}

/**
 * Beach thugs — wander their patch on their own; clock and scrap when provoked.
 * Cagey ones block a lot and may phone mates; mad / steamed ones swing freely.
 */
export class Enemy extends Fighter {
  readonly isBoss: boolean;
  /** Weaker thugs prefer circling behind rather than trading face-on. */
  readonly likesFlank: boolean;
  /** Temper — mad means almost no blocking. */
  readonly mad: boolean;
  private thinkAt = 0;
  private readonly aggroRange: number;
  private readonly homeX: number;
  private readonly homeY: number;
  private readonly homeRadius: number;
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

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    name = "Lad",
    toughnessOrOpts: number | EnemyOptions = 0.85,
  ) {
    const opts: EnemyOptions =
      typeof toughnessOrOpts === "number" ? { toughness: toughnessOrOpts } : toughnessOrOpts;
    const look = pickLook("enemy");
    const boost = opts.scaleBoost ?? (opts.boss ? 1.28 : 1);
    const toughness = opts.toughness ?? (opts.boss ? 3.1 : 0.85);
    super(scene, x, y, "enemy", look.id, name, {
      toughness,
      scaleX: look.scaleX * boost,
      scaleY: look.scaleY * boost,
      loot: {
        money: opts.boss
          ? 40 + Math.floor(Math.random() * 40)
          : 8 + Math.floor(Math.random() * 25),
        weapon: opts.boss
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
    this.speed = opts.boss ? 105 : 95;
    this.runSpeed = opts.boss ? 200 : 170;
    this.homeX = x;
    this.homeY = y;
    this.homeRadius = opts.homeRadius ?? (opts.boss ? 220 : 160);
    this.aggroRange = opts.aggroRange ?? (opts.boss ? 380 : 300);
    this.laneTarget = y;
    if (opts.boss && this.structure.loot.weapon === "bat") {
      this.structure.anger = 0.15;
      this.equipWeapon("bat");
    } else if (opts.boss) {
      this.structure.anger = 0.15;
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

  /** Consume call result once (success = mates coming, interrupted = wave cancelled). */
  takeCallOutcome(): CallOutcome | null {
    const o = this.callOutcome;
    this.callOutcome = null;
    return o;
  }

  get isPhoningMates(): boolean {
    return this.callActive && this.action === "call";
  }

  /** Cagey lads can phone for backup — not mad / boss. */
  canCallForHelp(): boolean {
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
    this.pendingInsult = "Oi — get down here!";
    return true;
  }

  onProvoked(now: number, by?: Fighter): void {
    if (by && !by.structure.isOut()) this.target = by;
    this.mood = "fight";
    if (!this.callActive) this.queueInsult(now, true);
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
          "This is MY front",
          "South Parade ends here",
          "You've had it now",
          "Big mistake mate",
          "Come get some!",
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
      this.pendingInsult = "Get down here — now!";
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

  updateEnemy(now: number, dt: number, fighters: Fighter[]): void {
    this.clearActionIfDue(now);
    this.structure.recoverFloor(now);
    this.refreshVisuals(now, dt);
    this.tickCall(now);

    if (this.structure.isOut()) {
      if (this.callActive) this.finishCall(this.callSaidWhere);
      if (this.structure.crawling && !this.structure.cuffed && !this.structure.outCold) {
        this.x += this.crawlDir * 36 * dt;
        this.x = Phaser.Math.Clamp(this.x, LANE.minX, LANE.maxX);
        this.action = "crawl";
      }
      this.alpha = this.structure.looted ? 0.55 : 1;
      return;
    }

    if (this.structure.downed && now < this.structure.groundedUntil) {
      if (this.callActive) this.finishCall(this.callSaidWhere);
      this.action = "down";
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
    const nearPlayer =
      player &&
      Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y) <
        (playerDown ? this.aggroRange * 1.35 : this.aggroRange);

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
        this.queueInsult(now, true);
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
    this.x += this.patrolDir * spd * dt;
    this.y += Math.sign(this.laneTarget - this.y) * spd * 0.35 * dt;
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
    this.x += (mx / mLen) * spd * dt;
    this.y += (my / mLen) * spd * 0.7 * dt;
    this.clampPos();
    this.action = "move";

    if (now >= this.insultAt) this.queueInsult(now);
  }

  private updateFight(now: number, dt: number): void {
    const t = this.target!;
    const floored = t.structure.downed && now < t.structure.groundedUntil;

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

    this.thinkAt = now + (this.isBoss ? 320 : 400) + Math.random() * 200;

    if (this.wantsGuard()) {
      const swing = this.playerIsSwinging(t);
      // Cover up when fists are coming; otherwise mostly swing back
      const coverChance = swing ? 0.48 : 0.22;
      if (Math.random() < coverChance) {
        this.tryBlock(now);
        if (Math.random() < 0.2) this.queueInsult(now);
        return true;
      }
    }

    this.dropBlock(now);
    if (Math.random() < 0.35) this.queueInsult(now);
    if (this.isBoss && Math.random() < 0.35) {
      this.tryPunch(now, true);
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
      this.thinkAt = now + 260 + Math.random() * 200;
      if (Math.random() < 0.55) this.queueInsult(now, true, true);
      this.tryStomp(now);
      return;
    }

    if (now >= this.insultAt && dist < 200) this.queueInsult(now, false, true);

    const dx = t.x - this.x;
    const dy = t.y - this.y;
    const len = Math.hypot(dx, dy) || 1;
    const spd = this.runSpeed * this.structure.moveSpeedFactor() * 1.05;
    this.running = true;
    this.x += (dx / len) * spd * dt;
    this.y += (dy / len) * spd * 0.95 * dt;
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
    this.x += (dx / len) * spd * dt;
    this.y += (dy / len) * spd * 0.9 * dt;
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
    const rush = this.isBoss ? 1.15 : this.structure.anger >= 0.5 ? 1.2 : 1;
    // Brief cover while closing only if fists are already coming
    if (this.wantsGuard() && dist < 100 && this.playerIsSwinging(t) && Math.random() < 0.4) {
      this.tryBlock(now);
      const spd = this.speed * this.structure.moveSpeedFactor() * 0.55;
      this.x += (dx / len) * spd * dt;
      this.y += (dy / len) * spd * 0.7 * dt;
      this.clampPos();
      return;
    }
    const spd = this.speed * this.structure.moveSpeedFactor() * rush;
    this.running = dist > 120 && this.isBoss;
    this.x += (dx / len) * spd * dt;
    this.y += (dy / len) * spd * 0.85 * dt;
    this.clampPos();
    this.action = this.running ? "run" : "move";
  }

  private flankSlot(t: Fighter): { x: number; y: number } {
    return {
      x: t.x - t.facing * 52,
      y: Phaser.Math.Clamp(t.y + this.flankSide * 40, LANE.minY, LANE.maxY),
    };
  }

  private clampPos(): void {
    this.x = Phaser.Math.Clamp(this.x, LANE.minX, LANE.maxX);
    this.y = Phaser.Math.Clamp(this.y, LANE.minY, LANE.maxY);
    this.groundY = this.y;
  }
}
