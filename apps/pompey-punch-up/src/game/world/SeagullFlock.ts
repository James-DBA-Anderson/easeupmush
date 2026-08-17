import Phaser from "phaser";
import { GAME_HEIGHT, WORLD_WIDTH } from "../constants";
import type { Fighter } from "../entities/Fighter";

type GullState = "soar" | "watch" | "dive" | "feed" | "flee";

/** Living scraps this close to a body → gulls stay up. */
const CLEAR_RADIUS = 175;
/** Scarper if someone comes this close while down feeding. */
const SPOOK_FEED = 130;
/** Abort a dive even sooner. */
const SPOOK_DIVE = 155;

/**
 * Southsea gulls — wary scavengers. Circle a corpse until the scrap's clear, then peck.
 */
export class Seagull {
  readonly sprite: Phaser.GameObjects.Image;
  private state: GullState = "soar";
  private target: Fighter | null = null;
  private phase: number;
  private speed: number;
  private amp: number;
  private soarX: number;
  private soarY: number;
  private feedBob = 0;
  private fleeUntil = 0;
  private peckUntil = 0;
  /** Must watch this long before diving. */
  private watchUntil = 0;
  private readonly scale: number;
  private pendingCry: "soft" | "loud" | null = null;
  private nextAmbientCryAt = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.phase = Math.random() * Math.PI * 2;
    this.speed = 1.3 + Math.random() * 1.4;
    this.amp = 8 + Math.random() * 12;
    this.soarX = x;
    this.soarY = y;
    this.scale = 0.85 + Math.random() * 0.25;
    this.nextAmbientCryAt = 4000 + Math.random() * 12000;
    this.sprite = scene.add
      .image(x, y, "prop_seagull_1")
      .setOrigin(0.5, 0.5)
      .setScale(this.scale)
      .setDepth(40)
      .setScrollFactor(1);
  }

  update(now: number, dt: number, corpses: Fighter[], threats: Fighter[]): void {
    this.phase += dt * this.speed;

    if (this.state === "feed" || this.state === "dive" || this.state === "watch") {
      const spookR = this.state === "dive" ? SPOOK_DIVE : this.state === "feed" ? SPOOK_FEED : CLEAR_RADIUS;
      const focus = this.target ?? this.sprite;
      const spook = threats.find(
        (t) =>
          !t.structure.isOut() &&
          Phaser.Math.Distance.Between(focus.x, this.target ? this.target.y : this.sprite.y, t.x, t.y) <
            spookR,
      );
      if (spook) {
        this.startFlee(now, spook.x);
        return;
      }
    }

    if (this.state === "flee") {
      this.updateFlee(now, dt);
      return;
    }

    if (this.state === "soar") {
      this.updateSoar(dt);
      if (now >= this.nextAmbientCryAt) {
        this.nextAmbientCryAt = now + 9000 + Math.random() * 16000;
        if (Math.random() < 0.55) this.pendingCry = "soft";
      }
      const body = this.pickSafeCorpse(corpses, threats);
      // Rarely commit to watching — most of the time they keep circling
      if (body && Math.random() < 0.006) {
        this.target = body;
        this.state = "watch";
        this.watchUntil = now + 2800 + Math.random() * 3200;
      }
      return;
    }

    if (this.state === "watch") {
      this.updateWatch(now, dt, corpses, threats);
      return;
    }

    if (this.state === "dive") {
      this.updateDive(dt, threats);
      return;
    }

    if (this.state === "feed") {
      this.updateFeed(now, dt);
    }
  }

  /** Occasional squawk while feeding. */
  takeSquawk(now: number): boolean {
    if (this.state !== "feed") return false;
    if (now < this.peckUntil) return false;
    this.peckUntil = now + 2200 + Math.random() * 2500;
    if (Math.random() < 0.45) {
      this.pendingCry = "soft";
      return true;
    }
    return false;
  }

  /** Consume a pending cry for SFX (soft soar / loud flee). */
  takeCry(): "soft" | "loud" | null {
    const c = this.pendingCry;
    this.pendingCry = null;
    return c;
  }

  private pickSafeCorpse(corpses: Fighter[], threats: Fighter[]): Fighter | null {
    // Prefer proper out-cold / cuffed — crawling folk still twitch
    const tasty = corpses.filter(
      (c) =>
        c.active &&
        c.visible &&
        (c.structure.outCold || c.structure.cuffed) &&
        this.isClear(c, threats),
    );
    if (tasty.length === 0) return null;
    tasty.sort(
      (a, b) =>
        Phaser.Math.Distance.Between(this.soarX, this.soarY, a.x, a.y) -
        Phaser.Math.Distance.Between(this.soarX, this.soarY, b.x, b.y),
    );
    return tasty[0] ?? null;
  }

  private isClear(body: Fighter, threats: Fighter[]): boolean {
    return !threats.some(
      (t) =>
        t !== body &&
        !t.structure.isOut() &&
        Phaser.Math.Distance.Between(body.x, body.y, t.x, t.y) < CLEAR_RADIUS,
    );
  }

  private updateSoar(dt: number): void {
    this.soarX += Math.sin(this.phase * 0.4) * 18 * dt;
    this.soarX = Phaser.Math.Wrap(this.soarX, 40, WORLD_WIDTH - 40);
    this.soarY = Phaser.Math.Clamp(
      this.soarY + Math.sin(this.phase * 0.7) * 6 * dt,
      GAME_HEIGHT * 0.14,
      GAME_HEIGHT * 0.36,
    );
    this.sprite.x = this.soarX;
    this.sprite.y = this.soarY + Math.sin(this.phase) * this.amp;
    this.sprite.setFlipX(Math.sin(this.phase * 0.4) < 0);
    this.sprite.setDepth(8);
    this.flap(1);
  }

  /** Circle above the body, waiting for the coast to stay clear. */
  private updateWatch(now: number, dt: number, corpses: Fighter[], threats: Fighter[]): void {
    if (!this.target || !this.target.active || !this.isStillCorpse(this.target)) {
      this.state = "soar";
      this.target = null;
      return;
    }
    if (!this.isClear(this.target, threats)) {
      // Someone still about — keep circling overhead, reset the wait
      this.watchUntil = Math.max(this.watchUntil, now + 1500 + Math.random() * 1500);
    }

    const cx = this.target.x;
    const cy = Math.min(this.target.y - 70, GAME_HEIGHT * 0.32);
    this.soarX = cx + Math.cos(this.phase * 0.9) * 55;
    this.soarY = cy + Math.sin(this.phase * 1.1) * 18;
    this.sprite.x = this.soarX;
    this.sprite.y = this.soarY + Math.sin(this.phase * 2) * 4;
    this.sprite.setFlipX(Math.cos(this.phase * 0.9) < 0);
    this.sprite.setDepth(12);
    this.flap(1.3);

    if (now >= this.watchUntil && this.isClear(this.target, threats)) {
      // One last nervous check — only dive if still quiet
      if (Math.random() < 0.7) {
        this.state = "dive";
        this.pendingCry = "soft";
      } else {
        this.watchUntil = now + 1200 + Math.random() * 1800;
      }
    }
    void dt;
    void corpses;
  }

  private updateDive(dt: number, threats: Fighter[]): void {
    if (!this.target || !this.target.active || !this.isStillCorpse(this.target)) {
      this.state = "soar";
      this.target = null;
      return;
    }
    // Abort mid-dive if the area fills up again
    if (!this.isClear(this.target, threats)) {
      this.soarX = this.sprite.x;
      this.soarY = Math.min(this.sprite.y, GAME_HEIGHT * 0.28);
      this.state = "watch";
      this.watchUntil = this.sprite.scene.time.now + 2000 + Math.random() * 2000;
      return;
    }

    const tx = this.target.x + (Math.random() - 0.5) * 8;
    const ty = this.target.y - 18;
    const dx = tx - this.sprite.x;
    const dy = ty - this.sprite.y;
    const dist = Math.hypot(dx, dy) || 1;
    // Hesitant approach — not a stoop
    const spd = 110;
    this.sprite.x += (dx / dist) * spd * dt;
    this.sprite.y += (dy / dist) * spd * dt;
    this.sprite.setFlipX(dx < 0);
    this.sprite.setDepth(this.target.depth + 2);
    this.flap(1.8);
    if (dist < 14) {
      this.state = "feed";
      this.feedBob = 0;
      this.sprite.x = tx;
      this.sprite.y = ty;
    }
  }

  private updateFeed(_now: number, dt: number): void {
    if (!this.target || !this.target.active || !this.isStillCorpse(this.target)) {
      this.soarX = this.sprite.x;
      this.soarY = Math.min(this.sprite.y, GAME_HEIGHT * 0.28);
      this.state = "soar";
      this.target = null;
      return;
    }
    this.sprite.x = Phaser.Math.Linear(this.sprite.x, this.target.x + 6, 0.12);
    this.feedBob += dt * 8;
    const peck = Math.abs(Math.sin(this.feedBob)) * 5;
    this.sprite.y = this.target.y - 14 - peck;
    this.sprite.setDepth(this.target.depth + 3);
    this.sprite.setFlipX(false);
    if (this.sprite.scene.textures.exists("prop_seagull_0")) {
      this.sprite.setTexture(Math.sin(this.feedBob) > 0 ? "prop_seagull_0" : "prop_seagull_1");
    }
  }

  private startFlee(now: number, fromX: number): void {
    this.state = "flee";
    this.fleeUntil = now + 2800 + Math.random() * 1600;
    this.target = null;
    this.watchUntil = 0;
    this.pendingCry = "loud";
    const dir = this.sprite.x >= fromX ? 1 : -1;
    this.soarX = this.sprite.x + dir * 160;
    this.soarY = GAME_HEIGHT * (0.14 + Math.random() * 0.1);
    this.sprite.setFlipX(dir < 0);
  }

  private updateFlee(now: number, dt: number): void {
    const dx = this.soarX - this.sprite.x;
    const dy = this.soarY - this.sprite.y;
    this.sprite.x += dx * 4 * dt;
    this.sprite.y += dy * 4 * dt;
    this.flap(2.8);
    this.sprite.setDepth(50);
    if (now >= this.fleeUntil || (Math.abs(dx) < 8 && Math.abs(dy) < 8)) {
      this.soarX = this.sprite.x;
      this.soarY = this.sprite.y;
      this.state = "soar";
    }
  }

  private isStillCorpse(f: Fighter): boolean {
    return f.structure.outCold || f.structure.cuffed;
  }

  private flap(rate: number): void {
    const flap = Math.floor((this.phase * rate * 2) % 3);
    const key = `prop_seagull_${flap}`;
    if (this.sprite.scene.textures.exists(key) && this.sprite.texture.key !== key) {
      this.sprite.setTexture(key);
    }
  }
}

export class SeagullFlock {
  readonly gulls: Seagull[] = [];

  constructor(scene: Phaser.Scene) {
    const spots = [720, 1900, 3100];
    for (const [i, x] of spots.entries()) {
      const y = GAME_HEIGHT * (0.2 + (i % 3) * 0.04);
      this.gulls.push(new Seagull(scene, x, y));
    }
  }

  update(now: number, dt: number, fighters: Fighter[]): void {
    const corpses = fighters.filter(
      (f) => f.structure.outCold || f.structure.cuffed,
    );
    const threats = fighters.filter((f) => !f.structure.isOut());
    for (const g of this.gulls) {
      g.update(now, dt, corpses, threats);
    }
  }

  takeSquawks(now: number): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    for (const g of this.gulls) {
      if (g.takeSquawk(now)) {
        out.push({ x: g.sprite.x, y: g.sprite.y - 16 });
      }
    }
    return out;
  }

  /** Blast — they don't hang about. */
  scatter(): void {
    for (const g of this.gulls) g.sprite.setVisible(false);
  }

  takeCries(): { loud: boolean }[] {
    const out: { loud: boolean }[] = [];
    for (const g of this.gulls) {
      const c = g.takeCry();
      if (c) out.push({ loud: c === "loud" });
    }
    return out;
  }
}
