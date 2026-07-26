import Phaser from "phaser";
import { Fighter, inReach } from "./Fighter";
import { LANE } from "../constants";
import { steerAway, type Obstacle } from "../world/obstacles";
import { Dog } from "./Dog";
import { pickLook } from "../assets/pompeyLooks";

export type CivilianVariant =
  | "walker"
  | "jogger"
  | "bike"
  | "scooter"
  | "wheelchair"
  | "dog_walker";

export type CrashOutcome = "angry" | "knocked" | "flee";

const JOIN_LINES = [
  "I'm with you mate!",
  "Have some of that!",
  "Not on my front!",
  "Two of us now!",
  "Oi — leave him!",
  "Come on then!",
  "That's out of order!",
  "Let's have 'em!",
];

const VARIANT_SPEED: Record<CivilianVariant, { walk: number; run: number }> = {
  walker: { walk: 72, run: 160 },
  jogger: { walk: 120, run: 190 },
  bike: { walk: 175, run: 240 },
  scooter: { walk: 165, run: 230 },
  wheelchair: { walk: 55, run: 95 },
  dog_walker: { walk: 68, run: 145 },
};

function isPasser(v: CivilianVariant): boolean {
  return v === "bike" || v === "scooter";
}

/** Beach wanderers — hitting them raises wanted. Steer around corpses & props. */
export class Civilian extends Fighter {
  readonly variant: CivilianVariant;
  private wanderDir = Math.random() < 0.5 ? 1 : -1;
  private readonly passDir: 1 | -1;
  private panicUntil = 0;
  private rethinkAt = 0;
  private laneTarget = 0;
  private readonly mount?: Phaser.GameObjects.Image;
  dog: Dog | null = null;
  private dogReleased = false;
  /** Still on bike/scooter until a crash. */
  mounted: boolean;
  private crashUntil = 0;
  private lastCrashOutcome: CrashOutcome | null = null;
  /** Some walkers stop to film a scrap instead of always scarpering. */
  private readonly nosy: boolean;
  private filmPingAt = 0;
  /** Piled in with the player against a thug. */
  private ally = false;
  private allyTarget: Fighter | null = null;
  private allyThinkAt = 0;
  private pendingLine: string | null = null;
  /** Recently clipped by a lad — primed to join. */
  private spiteUntil = 0;

  /** True while fighting on the player's side. */
  get isAlly(): boolean {
    return this.ally && !this.structure.isOut();
  }

  /** Consume join / ally speech (once). */
  takeSpeech(): string | null {
    const line = this.pendingLine;
    this.pendingLine = null;
    return line;
  }

  /** Enemy just hit this local — often piles in with you. */
  onHitByEnemy(now: number, foe: Fighter): boolean {
    if (foe.structure.isOut() || foe.team !== "enemy") return false;
    this.spiteUntil = now + 5000;
    this.structure.anger = Math.min(1, this.structure.anger + 0.45);
    // High chance after being clipped
    return this.tryJoinPlayer(now, foe, 0.7);
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
    if (this.action === "film") this.action = "idle";
    this.structure.anger = Math.min(1, this.structure.anger + 0.35);
    this.pendingLine = JOIN_LINES[Math.floor(Math.random() * JOIN_LINES.length)]!;
    this.allyThinkAt = now + 200;
    return true;
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

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    name = "Local",
    variant: CivilianVariant = "walker",
    passDir?: 1 | -1,
    opts?: { nosy?: boolean },
  ) {
    const look = pickLook("civilian");
    super(scene, x, y, "civilian", look.id, name, {
      toughness: variant === "jogger" ? 0.65 : 0.55,
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
    // Walkers / dog walkers often film; joggers rarely; passers never
    this.nosy =
      opts?.nosy ??
      (variant === "walker"
        ? Math.random() < 0.65
        : variant === "dog_walker"
          ? Math.random() < 0.5
          : variant === "jogger"
            ? Math.random() < 0.15
            : false);
    if (isPasser(variant)) {
      this.wanderDir = this.passDir;
      this.facing = this.passDir;
    }

    if (variant === "bike" || variant === "scooter" || variant === "wheelchair") {
      const key =
        variant === "bike"
          ? "mount_bike"
          : variant === "scooter"
            ? "mount_scooter"
            : "mount_wheelchair";
      this.mount = scene.make.image({ x: 0, y: 4, key, add: false });
      this.mount.setOrigin(0.5, 1);
      this.addAt(this.mount, 0);
    }

    if (variant === "dog_walker") {
      this.dog = new Dog(scene, x - 28, y + 6, this);
    }
  }

  scare(now: number): void {
    if (this.ally) return; // already in the scrap
    this.panicUntil = now + 2500;
    if (this.action === "film") this.action = "idle";
  }

  get isCycling(): boolean {
    return this.mounted && isPasser(this.variant);
  }

  /** Knocked off bike/scooter. */
  crash(now: number, fromX: number, into?: Fighter): CrashOutcome {
    if (!this.mounted) return "flee";
    this.mounted = false;
    if (this.mount) {
      this.mount.setVisible(false);
      // Leave bike on the ground as a visual (detach position)
      const dump = this.scene.add
        .image(this.x - this.passDir * 20, this.y + 4, this.mount.texture.key)
        .setOrigin(0.5, 1)
        .setAngle(this.passDir * 55)
        .setDepth(6)
        .setAlpha(0.9);
      this.scene.tweens.add({
        targets: dump,
        alpha: 0.35,
        duration: 8000,
        delay: 4000,
      });
    }

    this.speed = 95;
    this.runSpeed = 200;
    this.x += this.passDir * 18;
    this.y = Phaser.Math.Clamp(this.y + (Math.random() - 0.5) * 20, LANE.minY, LANE.maxY);

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

  updateCivilian(
    now: number,
    dt: number,
    threats: Fighter[],
    obstacles: Obstacle[],
    civilians: Civilian[] = [],
  ): void {
    this.clearActionIfDue(now);
    this.structure.recoverFloor(now);
    this.refreshVisuals(now, dt);

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
    if (this.structure.crawling && !this.structure.cuffed) {
      this.x += this.crawlDir * 32 * dt;
      this.x = Phaser.Math.Clamp(this.x, LANE.minX, LANE.maxX);
      this.action = "crawl";
      return;
    }

    if (this.structure.isOut()) {
      this.ally = false;
      this.allyTarget = null;
      return;
    }
    if (!this.canAct(now) && this.action !== "block") return;
    if (this.busy && this.action !== "block") return;
    if (now < this.crashUntil) return;

    if (this.ally) {
      this.updateAlly(now, dt, threats);
      return;
    }

    // Clock the player fighting a lad — sometimes pile in
    this.considerWitnessJoin(now, threats);

    if (this.isCycling) {
      this.updatePasser(now, dt, threats, obstacles, civilians);
      return;
    }

    this.updateWanderer(now, dt, threats, obstacles, civilians);
  }

  private updatePasser(
    now: number,
    dt: number,
    threats: Fighter[],
    obstacles: Obstacle[],
    civilians: Civilian[],
  ): void {
    const look = 95;
    const bodies = [...threats, ...civilians].filter((t) => {
      if (t === this || t.structure.isOut()) return false;
      if (t instanceof Civilian && t.isCycling) return false;
      return true;
    });

    // Hazard ahead: person or solid object in the travel lane
    type Hazard =
      | { kind: "body"; x: number; y: number; rx: number; ry: number; body: Fighter }
      | { kind: "prop"; x: number; y: number; rx: number; ry: number };

    let hazard: Hazard | null = null;
    let hazardDist = look;

    for (const t of bodies) {
      const dx = (t.x - this.x) * this.passDir;
      const dy = Math.abs(t.laneY - this.y);
      if (dx > 0 && dx < look && dy < 32 && dx < hazardDist) {
        hazard = { kind: "body", x: t.x, y: t.laneY, rx: 28, ry: 22, body: t };
        hazardDist = dx;
      }
    }
    for (const o of obstacles) {
      const dx = (o.x - this.x) * this.passDir;
      const dy = Math.abs(o.y - this.y);
      if (dx > -o.rx * 0.2 && dx < look + o.rx && dy < o.ry + 18 && dx < hazardDist) {
        hazard = { kind: "prop", x: o.x, y: o.y, rx: o.rx, ry: o.ry };
        hazardDist = Math.max(0, dx);
      }
    }

    let vx = this.passDir;
    let vy = 0;

    if (hazard) {
      const roomUp = this.y - LANE.minY;
      const roomDown = LANE.maxY - this.y;
      // Prefer the side with more clearance relative to the hazard
      const preferUp = hazard.y >= this.y;
      let dodgeDir = 0;
      if (preferUp && roomUp > 28) dodgeDir = -1;
      else if (!preferUp && roomDown > 28) dodgeDir = 1;
      else if (roomUp >= roomDown && roomUp > 28) dodgeDir = -1;
      else if (roomDown > 28) dodgeDir = 1;

      const clearLane =
        dodgeDir !== 0 &&
        Math.abs(this.y + dodgeDir * (hazard.ry + 26) - hazard.y) > hazard.ry + 16;

      const overlapping =
        Math.abs(this.x - hazard.x) < hazard.rx + 22 &&
        Math.abs(this.y - hazard.y) < hazard.ry + 16;

      if (overlapping || (hazardDist < 30 && !clearLane)) {
        // Can't avoid — pile into it
        this.crash(
          now,
          hazard.x,
          hazard.kind === "body" ? hazard.body : undefined,
        );
        return;
      }

      if (clearLane && hazardDist < look) {
        vy = dodgeDir * 1.15;
      } else if (!clearLane && hazardDist < 55) {
        // Squeeze attempt: still try the best side, else crash next frames
        if (dodgeDir !== 0) vy = dodgeDir;
        else if (hazardDist < 34) {
          this.crash(
            now,
            hazard.x,
            hazard.kind === "body" ? hazard.body : undefined,
          );
          return;
        }
      }
    }

    const corpses: Obstacle[] = threats
      .filter((t) => t.structure.isOut())
      .map((t) => ({ x: t.x, y: t.laneY, rx: 36, ry: 24, kind: "corpse" as const }));
    const steered = steerAway(this.x, this.y, vx, vy, [...obstacles, ...corpses], 48);
    // Never reverse past the travel direction — only lane-dodge
    const forward = this.passDir;
    const spd = this.speed;
    this.x += forward * spd * dt;
    this.y += steered.vy * spd * 0.85 * dt;
    this.y = Phaser.Math.Clamp(this.y, LANE.minY, LANE.maxY);
    this.groundY = this.y;
    this.running = true;
    this.action = "run";
    this.setFacing(this.passDir, now);
    if (this.mount) this.mount.setFlipX(this.facing < 0);

    // Still overlapping after move → crash (caught on bollard / car corner)
    for (const o of obstacles) {
      if (
        Math.abs(this.x - o.x) < o.rx + 18 &&
        Math.abs(this.y - o.y) < o.ry + 14
      ) {
        this.crash(now, o.x);
        return;
      }
    }

    if (this.passDir > 0 && this.x > LANE.maxX + 40) {
      this.x = LANE.minX - 40;
      this.y = Phaser.Math.Clamp(
        LANE.minY + 20 + Math.random() * (LANE.maxY - LANE.minY - 40),
        LANE.minY,
        LANE.maxY,
      );
      this.groundY = this.y;
      this.mounted = true;
      if (this.mount) this.mount.setVisible(true);
    } else if (this.passDir < 0 && this.x < LANE.minX - 40) {
      this.x = LANE.maxX + 40;
      this.y = Phaser.Math.Clamp(
        LANE.minY + 20 + Math.random() * (LANE.maxY - LANE.minY - 40),
        LANE.minY,
        LANE.maxY,
      );
      this.groundY = this.y;
      this.mounted = true;
      if (this.mount) this.mount.setVisible(true);
    }
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

    const corpses: Obstacle[] = threats
      .filter((t) => t.structure.isOut())
      .map((t) => ({ x: t.x, y: t.laneY, rx: 40, ry: 28, kind: "corpse" as const }));

    const allObs = [...obstacles, ...corpses, ...cyclists];

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
    const alwaysRun = this.variant === "jogger";

    // Nosy locals: hang back and film a scrap instead of always running
    const scrap = this.nosy && now >= this.panicUntil ? this.findScrap(threats) : null;
    if (scrap && !bike) {
      const dist = Phaser.Math.Distance.Between(this.x, this.y, scrap.x, scrap.y);
      this.faceToward(scrap.x, now);

      if (dist < 95) {
        // Too close — pocket the phone and scarper
        this.scare(now);
      } else if (dist < 210) {
        this.action = "film";
        this.actionUntil = now + 400;
        this.running = false;
        // Soft shuffle to keep a good angle
        const side = Math.sign(this.y - scrap.y) || (this.y > (LANE.minY + LANE.maxY) / 2 ? -1 : 1);
        vx = Math.sign(scrap.x - this.x) * 0.15;
        vy = dist < 130 ? side * 0.35 : 0;
        const steered = steerAway(this.x, this.y, vx, vy, allObs);
        this.x += steered.vx * this.speed * 0.35 * dt;
        this.y += steered.vy * this.speed * 0.35 * dt;
        this.x = Phaser.Math.Clamp(this.x, LANE.minX, LANE.maxX);
        this.y = Phaser.Math.Clamp(this.y, LANE.minY, LANE.maxY);
        this.groundY = this.y;
        return;
      } else if (dist < 320) {
        // Sidestep closer for a better shot
        vx = Math.sign(scrap.x - this.x) || this.wanderDir;
        vy = Math.sign(scrap.y - this.y) * 0.4;
        this.running = false;
        this.action = "move";
        const steered = steerAway(this.x, this.y, vx, vy, allObs);
        this.x += steered.vx * this.speed * 0.7 * dt;
        this.y += steered.vy * this.speed * 0.55 * dt;
        this.x = Phaser.Math.Clamp(this.x, LANE.minX, LANE.maxX);
        this.y = Phaser.Math.Clamp(this.y, LANE.minY, LANE.maxY);
        this.groundY = this.y;
        return;
      }
    }

    if (bike) {
      vy = Math.sign(this.y - bike.y) || (this.y > (LANE.minY + LANE.maxY) / 2 ? -1 : 1);
      vx = this.wanderDir * 0.4;
      this.running = true;
      this.action = "run";
    } else if (scrapNearby || now < this.panicUntil) {
      if (scrapNearby) this.scare(now);
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
      this.rethinkAt = now + 700 + Math.random() * 1100;
      if (Math.random() < 0.35) this.wanderDir *= -1;
      if (Math.random() < 0.4) {
        this.laneTarget = Phaser.Math.Clamp(
          this.y + (Math.random() - 0.5) * 80,
          LANE.minY,
          LANE.maxY,
        );
      }
      vx = this.wanderDir;
      vy = Math.sign(this.laneTarget - this.y) * 0.4;
      this.running = alwaysRun;
      this.action = alwaysRun ? "run" : "move";
    } else {
      vx = this.wanderDir * (alwaysRun ? 1 : 0.6);
      vy = Math.sign(this.laneTarget - this.y) * 0.35;
      this.running = alwaysRun;
      this.action = alwaysRun ? "run" : "move";
    }

    if (this.variant === "wheelchair") vy *= 0.35;

    const steered = steerAway(this.x, this.y, vx, vy, allObs);
    const legMul = this.variant === "wheelchair" ? 1 : this.structure.moveSpeedFactor();
    const spd = (this.running && legMul > 0.55 ? this.runSpeed : this.speed) * legMul;
    this.x += steered.vx * spd * dt;
    this.y += steered.vy * spd * 0.75 * dt;

    if (Math.abs(steered.vx) > 0.25) {
      this.setFacing(steered.vx > 0 ? 1 : -1, now);
    }
    if (this.mount) this.mount.setFlipX(this.facing < 0);

    this.x = Phaser.Math.Clamp(this.x, LANE.minX, LANE.maxX);
    this.y = Phaser.Math.Clamp(this.y, LANE.minY, LANE.maxY);
    this.groundY = this.y;
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
    if (
      !this.allyTarget ||
      this.allyTarget.structure.isOut() ||
      this.allyTarget.team !== "enemy"
    ) {
      // Pick another lad near the player, or stand down
      const player = threats.find((t) => t.team === "player" && !t.structure.isOut());
      const next = threats.find(
        (t) =>
          t.team === "enemy" &&
          !t.structure.isOut() &&
          player &&
          Phaser.Math.Distance.Between(t.x, t.y, player.x, player.y) < 220,
      );
      if (next) {
        this.allyTarget = next;
      } else {
        this.ally = false;
        this.allyTarget = null;
        this.action = "idle";
        return;
      }
    }

    const t = this.allyTarget;
    this.faceToward(t.x, now);
    const dist = Phaser.Math.Distance.Between(this.x, this.y, t.x, t.y);

    if (inReach(this, t) && now >= this.allyThinkAt) {
      this.allyThinkAt = now + 420 + Math.random() * 280;
      if (this.structure.anger >= 0.5 && Math.random() < 0.4) this.tryKick(now);
      else this.tryPunch(now, false);
      return;
    }

    const dx = t.x - this.x;
    const dy = t.y - this.y;
    const len = Math.hypot(dx, dy) || 1;
    const spd = this.speed * this.structure.moveSpeedFactor() * (dist > 90 ? 1.15 : 0.9);
    this.running = dist > 100;
    this.x += (dx / len) * spd * dt;
    this.y += (dy / len) * spd * 0.85 * dt;
    this.x = Phaser.Math.Clamp(this.x, LANE.minX, LANE.maxX);
    this.y = Phaser.Math.Clamp(this.y, LANE.minY, LANE.maxY);
    this.groundY = this.y;
    this.action = this.running ? "run" : "move";
  }

  /** Midpoint of an active scrap the nosy can clock. */
  private findScrap(threats: Fighter[]): { x: number; y: number } | null {
    const combatants = threats.filter(
      (t) =>
        (t.team === "player" || t.team === "enemy") &&
        !t.structure.isOut() &&
        !t.structure.cuffed,
    );
    if (combatants.length === 0) return null;

    const fighting = combatants.filter((t) => {
      const a = t.action;
      return (
        a === "punch" ||
        a === "kick" ||
        a === "hitstun" ||
        a === "headbutt" ||
        a === "backhand" ||
        a === "jump_kick" ||
        a === "weapon_swing" ||
        a === "grab" ||
        a === "low_blow" ||
        a === "throw" ||
        t.structure.anger > 0.25
      );
    });

    const player = combatants.find((t) => t.team === "player");
    const nearEnemy = player
      ? combatants.find(
          (t) =>
            t.team === "enemy" &&
            Phaser.Math.Distance.Between(player.x, player.y, t.x, t.y) < 200,
        )
      : undefined;

    if (fighting.length === 0 && !nearEnemy) return null;

    if (player && nearEnemy) {
      return {
        x: (player.x + nearEnemy.x) / 2,
        y: (player.laneY + nearEnemy.laneY) / 2,
      };
    }
    const focus = fighting[0] ?? combatants[0];
    return { x: focus.x, y: focus.laneY };
  }
}
