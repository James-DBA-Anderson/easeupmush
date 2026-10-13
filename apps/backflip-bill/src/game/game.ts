import { Sfx } from "./audio";
import { Bill, burst, drawBill, stepDust, type Dust } from "./bill";
import { isDebugTyping, Input } from "./input";
import { hintForScheme, tuning } from "./tuning";
import {
  drawSky,
  drawWorld,
  fitView,
  followCam,
  groundAt,
  LEVELS,
  makeCam,
  spawnGround,
  worldToScreen,
  type Cam,
  type Level,
} from "./world";

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bill = new Bill();
  private input = new Input();
  private sfx = new Sfx();
  private cam: Cam;
  private dust: Dust[] = [];
  private cssW = 1;
  private cssH = 1;
  private t = 0;
  private last = 0;
  private running = false;
  private banner = "";
  private bannerT = 0;
  private deathT = 0;
  private hintT = 6.2;
  private levelIndex = 0;
  private titleEl: HTMLElement;
  private calloutEl: HTMLElement;
  private hintEl: HTMLElement;
  private levelEl: HTMLElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No 2D context");
    this.ctx = ctx;
    this.cam = makeCam(1, 1);
    this.titleEl = document.getElementById("title")!;
    this.calloutEl = document.getElementById("callout")!;
    this.hintEl = document.getElementById("hint")!;
    this.levelEl = document.getElementById("level")!;
    this.titleEl.textContent = "Backflip Bill";
    window.addEventListener("resize", this.resize);
    window.addEventListener("pointerdown", () => this.sfx.resume(), { once: true });
    window.addEventListener("keydown", (e) => {
      if (isDebugTyping(e.target)) return;
      if (e.code === "KeyR") this.respawn();
    });
    this.bill.spawn(this.level());
    this.syncLevelHud();
    this.syncHint();
    this.resize();
    const wanted = Number(new URLSearchParams(window.location.search).get("level"));
    if (wanted >= 1 && wanted <= LEVELS.length) this.loadLevel(wanted - 1);
  }

  public start(): void {
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  public onTuningChanged(): void {
    this.syncHint();
  }

  private level(): Level {
    return LEVELS[this.levelIndex] ?? LEVELS[0]!;
  }

  private respawn(): void {
    this.bill.spawn(this.level());
    this.deathT = 0;
  }

  private loadLevel(index: number): void {
    this.levelIndex = Math.max(0, Math.min(LEVELS.length - 1, index));
    this.bill.spawn(this.level());
    this.dust.length = 0;
    this.cam.x = this.bill.x;
    this.cam.y = spawnGround(this.level()) + this.cam.h * 0.26;
    this.syncLevelHud();
    this.hintT = 5.5;
  }

  private syncLevelHud(): void {
    const lv = this.level();
    this.levelEl.textContent = lv.title;
  }

  private syncHint(): void {
    this.hintEl.textContent = hintForScheme();
  }

  private resize = (): void => {
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    this.cssW = window.innerWidth;
    this.cssH = window.innerHeight;
    this.canvas.width = Math.floor(this.cssW * dpr);
    this.canvas.height = Math.floor(this.cssH * dpr);
    this.canvas.style.width = `${this.cssW}px`;
    this.canvas.style.height = `${this.cssH}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const view = fitView(this.cssW, this.cssH);
    this.cam.w = view.w;
    this.cam.h = view.h;
  };

  private frame = (now: number): void => {
    if (!this.running) return;
    const dt = Math.min(0.033, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    this.step(dt);
    this.draw();
    requestAnimationFrame(this.frame);
  };

  private step(dt: number): void {
    const input = this.input.poll();
    const level = this.level();

    if (this.bill.state === "done" && input.jump) {
      if (this.levelIndex < LEVELS.length - 1) {
        this.loadLevel(this.levelIndex + 1);
        this.flash(this.level().title);
      } else {
        this.loadLevel(0);
        this.flash("Back to the start");
      }
    } else if (this.bill.state === "dead") {
      this.deathT -= dt;
      if (this.deathT <= 0) this.respawn();
    } else {
      this.bill.step(dt, input.run, input.jump, input.tuck, level);
      if (this.bill.landEvent) {
        const e = this.bill.landEvent;
        if (e.kind === "clean") {
          this.sfx.cleanLand();
          this.flash("Clean landing");
          burst(this.dust, e.x, e.y, 8, "rgba(232,240,244,0.7)", 3);
        } else if (e.kind === "stumble") {
          this.sfx.stumble();
          this.flash("Ease up mush");
          burst(this.dust, e.x, e.y, 12, "rgba(240,162,58,0.8)", 4);
        } else {
          this.sfx.fall();
          this.flash("You're having a laugh");
          burst(this.dust, e.x, e.y, 16, "rgba(196,60,42,0.75)", 5);
        }
      }
      if (this.bill.died) {
        this.sfx.death();
        this.flash("Bill's gone in the gap");
        this.deathT = tuning.deathTime;
      }
      if (this.bill.finished) {
        this.sfx.finish();
        if (this.levelIndex < LEVELS.length - 1) {
          this.flash(`Get in — FLIP for level ${this.levelIndex + 2}`);
        } else {
          this.flash("Get in, Bill");
        }
      }
      if (input.jump && this.bill.state === "air" && this.bill.airTime < 0.08) {
        this.sfx.jump();
        const g = groundAt(level, this.bill.x) ?? spawnGround(level);
        burst(this.dust, this.bill.x, g, 6, "rgba(200,221,230,0.55)", 2.4);
      }
    }

    if (this.bill.state === "ground" && Math.abs(this.bill.vx) > 3.5 && Math.random() < dt * 8) {
      const g = groundAt(level, this.bill.x) ?? spawnGround(level);
      burst(this.dust, this.bill.x, g, 1, "rgba(180,170,155,0.55)", 1.4);
    }

    followCam(this.cam, this.bill.x, this.bill.y, this.bill.vx, dt, level);
    stepDust(this.dust, dt);
    this.bannerT -= dt;
    this.hintT -= dt;
    this.calloutEl.textContent = this.bannerT > 0 ? this.banner : "";
    this.calloutEl.classList.toggle("on", this.bannerT > 0);
    this.hintEl.classList.toggle("faded", this.hintT <= 0);
  }

  private flash(msg: string): void {
    this.banner = msg;
    this.bannerT = 1.8;
  }

  private draw(): void {
    const { ctx, cssW, cssH, cam } = this;
    const level = this.level();
    drawSky(ctx, cam, cssW, cssH);
    drawWorld(ctx, cam, cssW, cssH, level);

    for (const p of this.dust) {
      const s = worldToScreen(cam, cssW, cssH, p.x, p.y);
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    const s = worldToScreen(cam, cssW, cssH, this.bill.x, this.bill.y);
    const g = groundAt(level, this.bill.x);
    if (g !== null) {
      const shadowY = worldToScreen(cam, cssW, cssH, this.bill.x, g);
      ctx.save();
      ctx.globalAlpha = Math.max(0.08, 0.28 - Math.max(0, this.bill.y - g - 0.9) * 0.04);
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(shadowY.x, shadowY.y, s.ppm * 0.32, s.ppm * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (this.bill.state === "air" && this.bill.flipTravel > 0.15) {
      const saved = this.bill.rot;
      for (const trail of [0.55, 1.05]) {
        this.bill.rot = Math.max(0, saved - trail);
        ctx.save();
        ctx.globalAlpha = 0.2;
        drawBill(ctx, this.bill, s.x, s.y, s.ppm, this.t);
        ctx.restore();
      }
      this.bill.rot = saved;
    }
    drawBill(ctx, this.bill, s.x, s.y, s.ppm, this.t);

    ctx.font = `700 ${Math.max(12, cssW * 0.032)}px "Source Sans 3", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(232,240,244,0.9)";
    ctx.fillText(this.bill.name, s.x, s.y - s.ppm * 1.35);

    if (this.bill.state === "dead") {
      ctx.fillStyle = "rgba(7,20,26,0.45)";
      ctx.fillRect(0, 0, cssW, cssH);
    }
  }
}
