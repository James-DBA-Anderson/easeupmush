import { Sfx } from "./audio";
import { Bill, burst, drawBill, stepDust, type Dust } from "./bill";
import { DEATH_TIME, GROUND_Y } from "./constants";
import { Input } from "./input";
import {
  drawSky,
  drawWorld,
  fitView,
  followCam,
  groundAt,
  makeCam,
  worldToScreen,
  type Cam,
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
  private hintT = 5.5;
  private titleEl: HTMLElement;
  private calloutEl: HTMLElement;
  private hintEl: HTMLElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No 2D context");
    this.ctx = ctx;
    this.cam = makeCam(1, 1);
    this.titleEl = document.getElementById("title")!;
    this.calloutEl = document.getElementById("callout")!;
    this.hintEl = document.getElementById("hint")!;
    this.titleEl.textContent = "Backflip Bill";
    window.addEventListener("resize", this.resize);
    window.addEventListener("pointerdown", () => this.sfx.resume(), { once: true });
    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyR") this.bill.spawn();
    });
    this.resize();
  }

  public start(): void {
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
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
    if (this.bill.state === "done" && input.jump) {
      this.bill.spawn();
    } else if (this.bill.state === "dead") {
      this.deathT -= dt;
      if (this.deathT <= 0) this.bill.spawn();
    } else {
      this.bill.step(dt, input.run, input.jump);
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
        this.deathT = DEATH_TIME;
      }
      if (this.bill.finished) {
        this.sfx.finish();
        this.flash("Get in, Bill");
      }
      if (input.jump && this.bill.state === "air" && this.bill.airTime < 0.08) {
        this.sfx.jump();
        burst(this.dust, this.bill.x, GROUND_Y, 6, "rgba(200,221,230,0.55)", 2.4);
      }
    }

    if (this.bill.state === "ground" && Math.abs(this.bill.vx) > 3.5 && Math.random() < dt * 8) {
      burst(this.dust, this.bill.x, GROUND_Y, 1, "rgba(180,170,155,0.55)", 1.4);
    }

    followCam(this.cam, this.bill.x, this.bill.vx, dt);
    stepDust(this.dust, dt);
    this.bannerT -= dt;
    this.hintT -= dt;
    this.calloutEl.textContent = this.bannerT > 0 ? this.banner : "";
    this.calloutEl.classList.toggle("on", this.bannerT > 0);
    this.hintEl.classList.toggle("faded", this.hintT <= 0);
  }

  private flash(msg: string): void {
    this.banner = msg;
    this.bannerT = 1.6;
  }

  private draw(): void {
    const { ctx, cssW, cssH, cam } = this;
    drawSky(ctx, cam, cssW, cssH);
    drawWorld(ctx, cam, cssW, cssH);

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
    const g = groundAt(this.bill.x);
    const shadowY = worldToScreen(cam, cssW, cssH, this.bill.x, g ?? GROUND_Y);
    if (g !== null) {
      ctx.save();
      ctx.globalAlpha = Math.max(0.08, 0.28 - Math.max(0, this.bill.y - GROUND_Y - 0.9) * 0.04);
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(shadowY.x, shadowY.y, s.ppm * 0.32, s.ppm * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    drawBill(ctx, this.bill, s.x, s.y, s.ppm, this.t);

    ctx.font = `700 ${Math.max(12, cssW * 0.032)}px "Source Sans 3", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(232,240,244,0.9)";
    ctx.fillText("Backflip Bill", s.x, s.y - s.ppm * 1.35);

    if (this.bill.state === "dead") {
      ctx.fillStyle = "rgba(7,20,26,0.45)";
      ctx.fillRect(0, 0, cssW, cssH);
    }
  }
}
