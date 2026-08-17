import Phaser from "phaser";
import { GAME_WIDTH } from "../constants";
import type { Fighter } from "../entities/Fighter";

type DroneMode =
  | "idle"
  | "flyby"
  | "film"
  | "orbit"
  | "swoop"
  | "climb"
  | "struggle"
  | "spiral";

export type DroneEvent = "filming" | "flyby" | "kicked" | "exploded";

export type DroneAudio = {
  active: boolean;
  intensity: number;
  pan: number;
};

/**
 * Occasional sky drone along the front — sometimes just buzzing past,
 * sometimes hanging off your shoulder filming. During the Clarence Pier
 * boss it sticks around and dive-bombs between scraps.
 */
export class SkyDrone {
  private image: Phaser.GameObjects.Image | null = null;
  private recLabel: Phaser.GameObjects.Text | null = null;
  private mode: DroneMode = "idle";
  private x = 0;
  private y = 0;
  private vx = 0;
  private vy = 0;
  private bob = 0;
  private anim = 0;
  private nextEventAt = 10000;
  private nextSwoopAt = 0;
  private filmUntil = 0;
  private filmSide = 1;
  private swoopHit = false;
  private orbitAng = 0;
  private announcedFilm = false;
  /** Screen-space flyby vs world-space combat / film. */
  private screenSpace = true;
  private readonly scene: Phaser.Scene;
  private pendingEvent: DroneEvent | null = null;
  private wreckedUntil = 0;
  private crashGroundY = 0;
  private spin = 0;
  private struggleT = 0;
  private boomX = 0;
  private boomY = 0;
  /** Clarence's kit stays gone once you've booted it. */
  private assistWrecked = false;
  private inAssist = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.nextEventAt = 12000 + Math.random() * 9000;
  }

  /** One-shot notice for the scene (filming start, etc.). */
  takeEvent(): DroneEvent | null {
    const e = this.pendingEvent;
    this.pendingEvent = null;
    return e;
  }

  /** Screen-space pan / intensity for the buzz loop. */
  getAudio(camScrollX: number): DroneAudio {
    if (this.mode === "idle" || !this.image) {
      return { active: false, intensity: 0, pan: 0 };
    }
    const screenX = this.screenSpace ? this.x : this.x - camScrollX;
    const pan = Phaser.Math.Clamp((screenX / GAME_WIDTH) * 2 - 1, -1, 1);
    let intensity = 0.48;
    if (this.mode === "film") intensity = 0.62;
    else if (this.mode === "orbit") intensity = 0.78;
    else if (this.mode === "swoop") intensity = 1;
    else if (this.mode === "struggle") {
      intensity = 0.72 + (Math.sin(this.anim * 2.2) > 0 ? 0.38 : 0);
    } else if (this.mode === "spiral") intensity = 0.82;
    else if (this.mode === "climb") intensity = 0.52;
    else if (this.mode === "flyby") intensity = 0.55;
    // Soft falloff at the edges of the screen — keep a floor so it still buzzes
    const edge = 1 - Math.min(1, Math.abs(pan));
    intensity *= 0.55 + edge * 0.45;
    return { active: true, intensity, pan };
  }

  /** World position of the last crash — scene reads this on `"exploded"`. */
  getBoomPos(): { x: number; y: number } {
    return { x: this.boomX, y: this.boomY };
  }

  /** Jump-kick / backflip boot — sends it struggling, then spiralling in. */
  tryJumpKick(player: Fighter): boolean {
    if (!this.image) return false;
    if (this.mode === "idle" || this.mode === "struggle" || this.mode === "spiral") {
      return false;
    }
    if (this.screenSpace) return false;
    if (
      player.action !== "jump_kick" &&
      player.action !== "backflip"
    ) {
      return false;
    }
    if (!player.airborne) return false;
    const dir = player.attackDir || player.facing;
    const kickX = player.x + dir * 22;
    const kickY = player.y - 42;
    const dx = this.x - kickX;
    const dy = this.y - kickY;
    const dist = Math.hypot(dx, dy);
    if (dist > 96) return false;
    // Close enough from underneath always counts; further out must face it
    if (dist > 52 && dx * dir < -28) return false;
    this.beginCrash(player, dir);
    this.pendingEvent = "kicked";
    return true;
  }

  update(
    now: number,
    dt: number,
    camScrollX: number,
    player: Fighter,
    bossLive: boolean,
    onSwoopHit: (knockDir: number) => void,
  ): void {
    this.anim += dt * 14;
    if (this.image) {
      const frame = Math.floor(this.anim) % 2 === 0 ? "sky_drone_0" : "sky_drone_1";
      if (
        this.scene.textures.exists(frame) &&
        this.image.texture.key !== frame
      ) {
        this.image.setTexture(frame);
      }
    }

    if (this.mode === "struggle" || this.mode === "spiral") {
      if (this.updateCrash(dt) === "explode") {
        this.pendingEvent = "exploded";
        this.destroyImage();
        this.mode = "idle";
        this.wreckedUntil = this.assistWrecked ? now + 1e9 : now + 75000;
        this.nextEventAt = this.wreckedUntil;
      }
      return;
    }

    if (bossLive && !this.assistWrecked) {
      // Pull out of ambient flyby / film / idle into combat orbit.
      // Also recover if we somehow lost the sprite mid-fight.
      const ambient =
        this.mode === "idle" ||
        this.mode === "flyby" ||
        this.mode === "film" ||
        (this.mode === "climb" && this.screenSpace);
      if (ambient || !this.image) {
        this.clearRec();
        this.spawnAssist(player, now);
      }
      this.updateAssist(now, dt, player, onSwoopHit);
      return;
    }

    if (now < this.wreckedUntil) return;

    // Boss gone — combat drone buggers off; filming can finish on its own
    if (this.mode === "orbit" || this.mode === "swoop") {
      this.beginRetreat(camScrollX, now);
    }
    this.updateAmbient(now, dt, camScrollX, player);
  }

  /** Scene calls this when Clarence (or any boss assist) kicks off. */
  forceAssist(player: Fighter, now: number): void {
    if (this.assistWrecked) return;
    if (this.mode === "struggle" || this.mode === "spiral") return;
    this.clearRec();
    this.spawnAssist(player, now);
  }

  private updateAmbient(
    now: number,
    dt: number,
    camScrollX: number,
    player: Fighter,
  ): void {
    if (this.mode === "idle") {
      if (now >= this.nextEventAt) {
        // Sometimes hang about filming; otherwise a straight flyover
        if (Math.random() < 0.48) this.spawnFilm(player, now);
        else this.spawnFlyby();
      }
      return;
    }

    if (this.mode === "film") {
      this.updateFilm(now, dt, player, camScrollX);
      return;
    }

    if (this.mode === "flyby" || this.mode === "climb") {
      this.bob += dt * 2.2;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.syncImage();
      const off = this.screenSpace
        ? (this.vx > 0 && this.x > GAME_WIDTH + 70) ||
          (this.vx < 0 && this.x < -70)
        : this.x < camScrollX - 120 || this.x > camScrollX + GAME_WIDTH + 120;
      if (off) {
        this.destroyImage();
        this.mode = "idle";
        this.nextEventAt = now + 18000 + Math.random() * 26000;
      }
    }
  }

  private updateFilm(
    now: number,
    dt: number,
    player: Fighter,
    camScrollX: number,
  ): void {
    this.bob += dt * 2.8;
    const preferX = player.x + this.filmSide * (70 + Math.sin(now * 0.0018) * 18);
    const preferY = player.groundY - (78 + Math.sin(now * 0.0024) * 8);
    this.x += (preferX - this.x) * Math.min(1, dt * 2.4);
    this.y += (preferY - this.y) * Math.min(1, dt * 2.1);
    this.vx = preferX - this.x;
    // Lens toward the player
    this.image?.setFlipX(player.x < this.x);
    this.image?.setRotation((player.x - this.x) * -0.0012);
    this.syncImage();
    this.syncRec();

    if (!this.announcedFilm) {
      this.announcedFilm = true;
      this.pendingEvent = "filming";
    }

    if (now >= this.filmUntil) {
      this.clearRec();
      this.image?.setRotation(0);
      // Drift off screen
      this.vx = this.filmSide * 110;
      this.vy = -35;
      this.mode = "climb";
      this.screenSpace = false;
      void camScrollX;
    }
  }

  private updateAssist(
    now: number,
    dt: number,
    player: Fighter,
    onSwoopHit: (knockDir: number) => void,
  ): void {
    if (!this.image) {
      this.spawnAssist(player, now);
      if (!this.image) return;
    }

    if (this.mode === "orbit") {
      this.orbitAng += dt * 1.15;
      const cx = player.x;
      const cy = player.groundY - 86;
      this.x = cx + Math.cos(this.orbitAng) * 90;
      this.y = cy + Math.sin(this.orbitAng * 1.4) * 18;
      this.vx = -Math.sin(this.orbitAng) * 90;
      this.bob += dt * 3;
      this.image.setFlipX(this.vx < 0);
      this.syncImage();
      if (now >= this.nextSwoopAt) this.beginSwoop(player, now);
      return;
    }

    if (this.mode === "swoop") {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vy += 420 * dt;
      this.image.setFlipX(this.vx < 0);
      this.image.setRotation(Math.atan2(this.vy, this.vx) * 0.35);
      this.syncImage();

      const dx = this.x - player.x;
      const dy = this.y - (player.y - 40);
      if (!this.swoopHit && Math.hypot(dx, dy) < 48) {
        this.swoopHit = true;
        onSwoopHit(Math.sign(this.vx) || 1);
      }

      if (this.y > player.y - 20 || (this.swoopHit && this.y > player.y - 55)) {
        this.mode = "climb";
        this.vy = -220;
        this.vx = (Math.sign(this.vx) || 1) * 160;
        this.image.setRotation(0);
      }
      return;
    }

    if (this.mode === "climb") {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vy *= 0.98;
      this.syncImage();
      if (this.y < player.y - 130) {
        this.mode = "orbit";
        this.orbitAng = Math.atan2(this.y - (player.y - 110), this.x - player.x);
        this.nextSwoopAt = now + 1600 + Math.random() * 1400;
        this.image.setRotation(0);
      }
    }
  }

  private spawnFlyby(): void {
    if (!this.scene.textures.exists("sky_drone_0")) return;
    this.destroyImage();
    const goingRight = Math.random() < 0.55;
    this.screenSpace = true;
    this.x = goingRight ? -55 : GAME_WIDTH + 55;
    this.y = 36 + Math.random() * 50;
    this.vx = (48 + Math.random() * 22) * (goingRight ? 1 : -1);
    this.vy = 0;
    this.mode = "flyby";
    this.pendingEvent = "flyby";
    this.inAssist = false;
    this.image = this.scene.add
      .image(this.x, this.y, "sky_drone_0")
      .setScrollFactor(0)
      .setDepth(-35)
      .setScale(0.95)
      .setFlipX(!goingRight)
      .setAlpha(0.92);
  }

  private spawnFilm(player: Fighter, now: number): void {
    if (!this.scene.textures.exists("sky_drone_0")) return;
    this.destroyImage();
    this.screenSpace = false;
    this.filmSide = Math.random() < 0.5 ? -1 : 1;
    this.x = player.x - this.filmSide * (GAME_WIDTH * 0.45);
    this.y = player.y - 140;
    this.vx = 0;
    this.vy = 0;
    this.mode = "film";
    this.filmUntil = now + 5200 + Math.random() * 3800;
    this.announcedFilm = false;
    this.inAssist = false;
    this.image = this.scene.add
      .image(this.x, this.y, "sky_drone_0")
      .setScrollFactor(1)
      .setDepth(38)
      .setScale(1.05)
      .setAlpha(1);
  }

  private spawnAssist(player: Fighter, now: number): void {
    if (this.assistWrecked) return;
    if (!this.scene.textures.exists("sky_drone_0")) {
      // Texture missing — still arm timers so a later frame can retry
      this.mode = "orbit";
      this.nextSwoopAt = now + 800;
      return;
    }
    this.destroyImage();
    this.clearRec();
    this.screenSpace = false;
    this.x = player.x + 120;
    this.y = player.y - 130;
    this.vx = 0;
    this.vy = 0;
    this.mode = "orbit";
    this.orbitAng = 0;
    this.nextSwoopAt = now + 1200 + Math.random() * 900;
    this.swoopHit = false;
    this.inAssist = true;
    this.image = this.scene.add
      .image(this.x, this.y, "sky_drone_0")
      .setScrollFactor(1)
      .setDepth(40)
      .setScale(1.15)
      .setAlpha(1);
  }

  private beginCrash(player: Fighter, dir: number): void {
    if (this.inAssist) this.assistWrecked = true;
    this.inAssist = false;
    this.clearRec();
    this.mode = "struggle";
    this.screenSpace = false;
    this.struggleT = 0;
    this.spin = 0;
    this.crashGroundY = player.groundY;
    this.vx = dir * (70 + Math.random() * 50);
    this.vy = -120;
    this.image?.setScrollFactor(1);
    this.image?.setDepth(42);
    this.image?.setAlpha(1);
  }

  /** Struggle for height, then corkscrew into the promenade. */
  private updateCrash(dt: number): "explode" | null {
    if (!this.image) return "explode";

    if (this.mode === "struggle") {
      this.struggleT += dt;
      this.bob += dt * 18;
      // Bursts of lift that keep losing to gravity
      this.vy += 95 * dt;
      if (Math.sin(this.struggleT * 9.5) > 0.35) {
        this.vy -= 340 * dt;
      }
      this.vy += Math.sin(this.struggleT * 21) * 90 * dt;
      this.vx *= 0.96;
      this.x += this.vx * dt + Math.sin(this.struggleT * 16) * 55 * dt;
      this.y += this.vy * dt;
      this.spin = Math.sin(this.struggleT * 12) * 0.42;
      this.image.setRotation(this.spin + Math.sin(this.struggleT * 22) * 0.22);
      this.image.setFlipX(this.vx < 0);
      this.syncImage();
      if (this.struggleT >= 1.12) {
        this.mode = "spiral";
        this.spin = this.vx >= 0 ? 0.4 : -0.4;
        this.vy = Math.max(this.vy, 40);
      }
      return null;
    }

    this.spin += dt * (5.2 + Math.abs(this.spin) * 0.55) * Math.sign(this.spin || 1);
    this.vy += 560 * dt;
    this.x += Math.cos(this.spin) * 110 * dt;
    this.y += this.vy * dt;
    this.image.setRotation(this.spin);
    this.image.setScale(1.08 + Math.sin(this.spin * 2.4) * 0.1);
    this.syncImage();
    if (this.y >= this.crashGroundY - 6) {
      this.y = this.crashGroundY - 6;
      this.boomX = this.x;
      this.boomY = this.y;
      this.syncImage();
      return "explode";
    }
    return null;
  }

  private beginSwoop(player: Fighter, now: number): void {
    this.mode = "swoop";
    this.swoopHit = false;
    const tx = player.x;
    const ty = player.y - 36;
    const dx = tx - this.x;
    const dy = ty - this.y;
    const len = Math.hypot(dx, dy) || 1;
    const spd = 340;
    this.vx = (dx / len) * spd;
    this.vy = (dy / len) * spd * 0.85;
    this.nextSwoopAt = now + 999999;
  }

  private beginRetreat(camScrollX: number, now: number): void {
    this.clearRec();
    if (!this.image) {
      this.mode = "idle";
      this.nextEventAt = now + 16000 + Math.random() * 20000;
      return;
    }
    const screenX = this.screenSpace ? this.x : this.x - camScrollX;
    this.destroyImage();
    this.screenSpace = true;
    this.x = screenX;
    this.y = Math.min(this.y, 80);
    this.vx = this.x < GAME_WIDTH * 0.5 ? -120 : 120;
    this.vy = -40;
    this.mode = "climb";
    this.inAssist = false;
    this.image = this.scene.add
      .image(this.x, this.y, "sky_drone_0")
      .setScrollFactor(0)
      .setDepth(-35)
      .setScale(0.95)
      .setFlipX(this.vx < 0)
      .setAlpha(0.9);
  }

  private syncImage(): void {
    if (!this.image) return;
    if (this.mode === "struggle") {
      this.image.x = this.x + Math.sin(this.anim * 2.6) * 3.5;
      this.image.y = this.y + Math.sin(this.anim * 3.4) * 4;
      return;
    }
    if (this.mode === "spiral") {
      this.image.x = this.x;
      this.image.y = this.y;
      return;
    }
    const bob =
      Math.sin(this.bob) *
      (this.mode === "orbit" || this.mode === "film" ? 3.5 : 2);
    this.image.x = this.x;
    this.image.y = this.y + bob;
  }

  private syncRec(): void {
    if (!this.image) return;
    if (!this.recLabel) {
      this.recLabel = this.scene.add
        .text(this.x, this.y - 22, "● REC", {
          fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
          fontSize: "11px",
          color: "#e02020",
          backgroundColor: "#1a1410cc",
          padding: { x: 4, y: 2 },
        })
        .setOrigin(0.5, 1)
        .setDepth(95)
        .setScrollFactor(this.screenSpace ? 0 : 1);
    }
    this.recLabel.setVisible(true);
    this.recLabel.x = this.x;
    this.recLabel.y = this.y - 18 + Math.sin(this.bob) * 2;
    // Blink the red dot feel
    this.recLabel.setAlpha(0.55 + (Math.sin(this.anim * 0.9) > 0 ? 0.45 : 0));
  }

  private clearRec(): void {
    this.recLabel?.destroy();
    this.recLabel = null;
  }

  private destroyImage(): void {
    this.clearRec();
    this.image?.destroy();
    this.image = null;
  }

  destroy(): void {
    this.destroyImage();
    this.mode = "idle";
  }
}
