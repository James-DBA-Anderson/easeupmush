import { Sfx } from "./audio";
import { Bill, burst, drawBill, stepDust, type Dust } from "./bill";
import { HIP_HEIGHT, TAU } from "./constants";
import { isDebugTyping, Input, wantsTouchUi } from "./input";
import { hintForScheme, tuning } from "./tuning";
import {
  approachingObstacle,
  camLookX,
  cloneLevel,
  drawSky,
  drawWorld,
  finishGround,
  fitView,
  followCam,
  groundAt,
  LEVELS,
  makeCam,
  makeSimLevel,
  routeAt,
  screenToWorld,
  spawnGround,
  stepTrain,
  worldToScreen,
  type Cam,
  type Level,
} from "./world";

interface JumpResult {
  title: string;
  tries: number;
  clean: boolean;
  spins: number;
  layoutHold: number;
  points: number;
}

const EXTRA_SPIN_PTS = 400;
const STAR_PTS = 500;
const LAYOUT_TICK = 0.05;
const LAYOUT_TICK_PTS = 25;
/** Wall-clock scale while flipping. Run and ragdoll stay at 1. */
const JUMP_TIME_SCALE = 0.76;

function formatPts(n: number): string {
  return `£${n.toLocaleString("en-GB")}`;
}

function extraSpins(spins: number): number {
  return Math.max(0, spins - 1);
}

function stretchBeat(t: number): number {
  const u = (((t % 26) + 26) % 26) / 26;
  if (u >= 0.84) return 3;
  if (u >= 0.6) return 2;
  if (u >= 0.38) return 1;
  if (u >= 0.16) return 0;
  return -1;
}

function layoutTicks(seconds: number): number {
  return Math.floor(Math.max(0, seconds) / LAYOUT_TICK);
}

function jumpPoints(
  levelIndex: number,
  tries: number,
  clean: boolean,
  spins: number,
  layoutHold: number,
): number {
  const clear = 1000 + levelIndex * 500;
  const star = clean ? STAR_PTS : 0;
  const attempt = Math.max(0, 400 - (tries - 1) * 100);
  const layout = layoutTicks(layoutHold) * LAYOUT_TICK_PTS;
  return clear + star + attempt + extraSpins(spins) * EXTRA_SPIN_PTS + layout;
}

function easeInOut(t: number): number {
  const u = Math.max(0, Math.min(1, t));
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

function spinLabel(spins: number): string {
  if (spins === 2) return "double";
  if (spins === 3) return "triple";
  if (spins === 4) return "quad";
  return `${spins} spins`;
}

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
  private calloutEl: HTMLElement;
  private hintEl: HTMLElement;
  private levelEl: HTMLElement;
  private altEl: HTMLElement;
  private altFill: HTMLElement;
  private altZero: HTMLElement;
  private altMarker: HTMLElement;
  private altRead: HTMLElement;
  private altCaption: HTMLElement;
  private scoreEl: HTMLElement;
  private scoreValueEl: HTMLElement;
  private scoreLiveEl: HTMLElement;
  private resultsEl: HTMLElement;
  private resultsListEl: HTMLElement;
  private resultsScoreEl: HTMLElement;
  private score = 0;
  private tries = 1;
  private jumpClean = false;
  private jumpSpins = 0;
  private jumpLayout = 0;
  private liveBonus = 0;
  private awardedLayoutTicks = 0;
  private awardedExtra = 0;
  private awardedStar = false;
  private landedFar = false;
  private wasFlipping = false;
  private timeScale = 1;
  private jumps: JumpResult[] = [];
  private gameOver = false;
  private resultsReadyT = 0;
  private sim = false;
  private simGap = false;
  private simBoxes = false;
  private grabbing = false;
  private grabX = 0;
  private grabY = 0;
  private grabLastX = 0;
  private grabLastY = 0;
  private grabLastT = 0;
  private grabVx = 0;
  private grabVy = 0;
  private grabOffX = 0;
  private grabOffY = 0;
  private lastFoot = 0;
  private lastTuck = 0.5;
  private prevX = 0;
  private hoopPassed = false;
  private lastStretch = -1;
  private wasCleared = false;
  private liveLevel: Level = cloneLevel(LEVELS[0]!);
  private warnEl: HTMLElement;
  private wasWarn = false;
  private wasAltLow = false;
  /** Elapsed preview time. Negative = not playing. */
  private previewT = -1;
  private previewHold = 0.34;
  private previewDur = 0;
  /** Ignore jump until it is released, so a level-advance hold does not take off. */
  private jumpLatch = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No 2D context");
    this.ctx = ctx;
    this.cam = makeCam(1, 1);
    this.calloutEl = document.getElementById("callout")!;
    this.hintEl = document.getElementById("hint")!;
    this.levelEl = document.getElementById("level")!;
    this.altEl = document.getElementById("altimeter")!;
    this.altFill = document.getElementById("alt-fill")!;
    this.altZero = document.getElementById("alt-zero")!;
    this.altMarker = document.getElementById("alt-marker")!;
    this.altRead = document.getElementById("alt-read")!;
    this.altCaption = this.altEl.querySelector(".alt-caption")!;
    this.scoreEl = document.getElementById("score")!;
    this.scoreValueEl = document.getElementById("score-value")!;
    this.scoreLiveEl = document.getElementById("score-live")!;
    this.resultsEl = document.getElementById("results")!;
    this.resultsListEl = document.getElementById("results-list")!;
    this.resultsScoreEl = document.getElementById("results-score")!;
    this.warnEl = document.getElementById("hazard-warn")!;
    document.getElementById("results-again")?.addEventListener("click", () => {
      if (this.gameOver && this.resultsReadyT <= 0) this.playAgain();
    });
    window.addEventListener("resize", this.resize);
    const unlock = (): void => this.sfx.resume();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    this.canvas.addEventListener("pointerdown", this.onSimPointerDown);
    window.addEventListener("pointermove", this.onSimPointerMove);
    window.addEventListener("pointerup", this.onSimPointerUp);
    window.addEventListener("pointercancel", this.onSimPointerUp);
    window.addEventListener("keydown", (e) => {
      if (isDebugTyping(e.target)) return;
      if (e.code === "KeyR") {
        if (this.inPreview()) return;
        if (this.gameOver || this.bill.cleared || this.bill.state === "done") return;
        this.respawn();
      }
    });
    this.bill.spawn(this.level());
    this.syncLevelHud();
    this.syncHint();
    this.resize();
    this.resetMotionSfx();
    const wanted = Number(new URLSearchParams(window.location.search).get("level"));
    if (wanted >= 1 && wanted <= LEVELS.length) this.loadLevel(wanted - 1);
    else {
      this.sfx.levelStart();
      this.beginPreview();
    }
  }

  public start(): void {
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  public onTuningChanged(): void {
    this.syncHint();
  }

  public debugLevelIndex(): number {
    return this.sim ? -1 : this.levelIndex;
  }

  public debugInSim(): boolean {
    return this.sim;
  }

  public debugSimGap(): boolean {
    return this.simGap;
  }

  public debugSimBoxes(): boolean {
    return this.simBoxes;
  }

  public debugGotoLevel(index: number): void {
    this.sim = false;
    this.grabbing = false;
    this.bill.held = false;
    this.loadLevel(index);
  }

  public debugEnterSim(): void {
    this.sim = true;
    this.gameOver = false;
    this.resultsReadyT = 0;
    this.hideResults();
    this.clearLiveBonus();
    this.tries = 1;
    this.rebuildSim(true);
    this.hintEl.textContent = "Drag Bill — he goes limp. Release to drop.";
    this.hintT = 6.2;
    this.flash("Sim — drag Bill, release to drop");
  }

  public debugExitSim(): void {
    if (!this.sim) return;
    this.sim = false;
    this.grabbing = false;
    this.bill.held = false;
    this.canvas.style.cursor = "";
    this.loadLevel(this.levelIndex);
    this.syncHint();
  }

  public debugSetSimProps(gap: boolean, boxes: boolean): void {
    this.simGap = gap;
    this.simBoxes = boxes;
    if (this.sim) this.rebuildSim(false);
  }

  private rebuildSim(spawn: boolean): void {
    const keepX = this.bill.x;
    const keepY = this.bill.y;
    const held = this.bill.held;
    if (spawn) {
      this.bill.spawn(this.level());
      this.cam.x = camLookX(this.bill.x, this.cam);
      this.cam.y = spawnGround(this.level()) + this.cam.h * 0.26;
      this.resetMotionSfx();
    } else if (held) {
      this.bill.x = keepX;
      this.bill.y = keepY;
    }
    this.dust.length = 0;
    this.timeScale = 1;
    this.syncLevelHud();
    this.canvas.style.cursor = "grab";
  }

  private pointerToWorld(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / Math.max(1, rect.width)) * this.cssW;
    const sy = ((e.clientY - rect.top) / Math.max(1, rect.height)) * this.cssH;
    return screenToWorld(this.cam, this.cssW, this.cssH, sx, sy);
  }

  private onSimPointerDown = (e: PointerEvent): void => {
    if (!this.sim || this.gameOver) return;
    if (e.button !== 0) return;
    if (document.getElementById("debug-ui")?.classList.contains("open")) return;
    const w = this.pointerToWorld(e);
    const dx = w.x - this.bill.x;
    const dy = w.y - this.bill.y;
    if (dx * dx + dy * dy > 1.55 * 1.55) return;
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    this.grabbing = true;
    this.grabOffX = this.bill.x - w.x;
    this.grabOffY = this.bill.y - w.y;
    this.grabX = this.bill.x;
    this.grabY = this.bill.y;
    this.grabLastX = w.x;
    this.grabLastY = w.y;
    this.grabLastT = performance.now();
    this.grabVx = 0;
    this.grabVy = 0;
    this.bill.goLimp();
    this.bill.carry(this.grabX, this.grabY);
    this.canvas.style.cursor = "grabbing";
    this.sfx.grab();
  };

  private onSimPointerMove = (e: PointerEvent): void => {
    if (!this.grabbing) return;
    const w = this.pointerToWorld(e);
    const now = performance.now();
    const dt = Math.max(0.008, (now - this.grabLastT) / 1000);
    const k = 0.55;
    this.grabVx = this.grabVx * (1 - k) + ((w.x - this.grabLastX) / dt) * k;
    this.grabVy = this.grabVy * (1 - k) + ((w.y - this.grabLastY) / dt) * k;
    this.grabLastX = w.x;
    this.grabLastY = w.y;
    this.grabLastT = now;
    this.grabX = w.x + this.grabOffX;
    this.grabY = w.y + this.grabOffY;
  };

  private onSimPointerUp = (): void => {
    if (!this.grabbing) return;
    this.grabbing = false;
    this.bill.drop(this.grabVx, this.grabVy);
    this.canvas.style.cursor = this.sim ? "grab" : "";
    this.sfx.drop();
  };

  private level(): Level {
    if (this.sim) return makeSimLevel(this.simGap, this.simBoxes);
    return this.liveLevel;
  }

  private respawn(): void {
    this.tries += 1;
    this.jumpClean = false;
    this.jumpSpins = 0;
    this.jumpLayout = 0;
    this.dropLiveBonus();
    if (!this.sim) this.liveLevel = cloneLevel(LEVELS[this.levelIndex] ?? LEVELS[0]!);
    const level = this.level();
    this.bill.spawn(level);
    this.cam.x = camLookX(this.bill.x, this.cam);
    this.cam.y = spawnGround(level) + this.cam.h * 0.26;
    this.deathT = 0;
    this.timeScale = 1;
    this.resetMotionSfx();
  }

  private loadLevel(index: number): void {
    this.levelIndex = Math.max(0, Math.min(LEVELS.length - 1, index));
    this.liveLevel = cloneLevel(LEVELS[this.levelIndex] ?? LEVELS[0]!);
    this.gameOver = false;
    this.resultsReadyT = 0;
    this.hideResults();
    this.tries = 1;
    this.jumpClean = false;
    this.jumpSpins = 0;
    this.jumpLayout = 0;
    this.clearLiveBonus();
    this.bill.spawn(this.level());
    this.timeScale = 1;
    this.dust.length = 0;
    this.syncLevelHud();
    this.syncHint();
    this.hintT = 5.5;
    this.resetMotionSfx();
    this.sfx.levelStart();
    this.beginPreview();
  }

  private inPreview(): boolean {
    return this.previewT >= 0;
  }

  /** Sit on the flag, then pan back along the run so the player can read it. */
  private beginPreview(): void {
    const level = this.level();
    if (this.sim || level.noFlag) {
      this.previewT = -1;
      this.cam.x = camLookX(this.bill.x, this.cam);
      this.cam.y = spawnGround(level) + this.cam.h * 0.26;
      return;
    }
    const fromX = level.flagX;
    const toX = camLookX(this.bill.x, this.cam);
    const dist = Math.abs(toX - fromX);
    this.previewHold = 0.34;
    const pan = Math.max(0.7, Math.min(2.0, dist / 16));
    this.previewDur = this.previewHold + pan;
    this.previewT = 0;
    this.jumpLatch = true;
    this.applyPreviewCam(0);
  }

  private applyPreviewCam(u: number): void {
    const level = this.level();
    const fromX = level.flagX;
    const toX = camLookX(this.bill.x, this.cam);
    this.cam.x = fromX + (toX - fromX) * u;
    this.cam.y = routeAt(level, this.cam.x) + this.cam.h * 0.24;
  }

  private stepPreview(dt: number): void {
    this.previewT += dt;
    const hold = this.previewHold;
    const pan = Math.max(0.05, this.previewDur - hold);
    const raw = this.previewT <= hold ? 0 : Math.min(1, (this.previewT - hold) / pan);
    this.applyPreviewCam(easeInOut(raw));
    if (this.previewT >= this.previewDur) {
      this.previewT = -1;
      const level = this.level();
      this.cam.x = camLookX(this.bill.x, this.cam);
      this.cam.y = spawnGround(level) + this.cam.h * 0.22;
    }
  }

  private playAgain(): void {
    this.score = 0;
    this.jumps = [];
    this.gameOver = false;
    this.resultsReadyT = 0;
    this.hideResults();
    this.syncScoreHud(false);
    this.loadLevel(0);
    this.flash("Back to the start");
  }

  private syncLevelHud(): void {
    const lv = this.level();
    this.levelEl.textContent = lv.title;
  }

  private syncHint(): void {
    this.hintEl.textContent = this.level().hint ?? hintForScheme();
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
    const view = fitView(this.cssW, this.cssH, !wantsTouchUi());
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

  private step(wall: number): void {
    const input = this.input.poll();
    const level = this.level();
    if (this.grabbing) this.bill.carry(this.grabX, this.grabY);
    const inJump = this.bill.flipping && this.bill.state === "air" && !this.grabbing;
    const want =
      this.gameOver || this.bill.state === "dead" || this.grabbing ? 1 : inJump ? JUMP_TIME_SCALE : 1;
    this.timeScale += (want - this.timeScale) * Math.min(1, wall * 10);
    if (Math.abs(this.timeScale - want) < 0.004) this.timeScale = want;
    const dt = wall * this.timeScale;
    if (
      !this.sim &&
      !this.gameOver &&
      this.bill.state !== "dead" &&
      !this.bill.cleared &&
      !this.inPreview()
    ) {
      stepTrain(level, dt);
    }

    if (this.inPreview()) {
      this.bill.step(dt, 0, false, 0, level, false);
      this.stepPreview(wall);
    } else if (this.gameOver) {
      this.resultsReadyT -= dt;
      if (input.jump && this.resultsReadyT <= 0) this.playAgain();
      else this.bill.step(dt, 0, false, 0, level, false);
    } else if ((this.bill.state === "done" || this.bill.cleared) && input.jump) {
      if (this.levelIndex < LEVELS.length - 1) {
        this.loadLevel(this.levelIndex + 1);
        this.flash(this.level().title);
      }
    } else if (this.bill.state === "dead") {
      this.deathT -= dt;
      if (this.deathT <= 0) this.respawn();
    } else {
      if (this.jumpLatch && !input.jump) this.jumpLatch = false;
      const jump = this.jumpLatch ? false : input.jump;
      this.bill.step(dt, input.run, jump, input.tuck, level, input.touched);
      if (!this.sim) {
        if (this.bill.flipping && !this.wasFlipping) this.beginAttempt();
        if (this.bill.flipping) this.syncLiveBonuses();
      }
      this.wasFlipping = this.bill.flipping;
      if (this.bill.landEvent) {
        const e = this.bill.landEvent;
        if (this.sim) {
          /* sandbox: sfx only, no score */
        } else if (e.kind !== "fall" && this.bill.x >= level.gapX1) {
          this.landedFar = true;
          this.jumpClean = e.kind === "clean";
          this.jumpSpins = e.spins;
          this.jumpLayout = e.layoutHold;
          this.payLayout(e.layoutHold);
          this.payExtra(e.spins);
          if (e.kind === "clean") this.payStar();
        } else {
          this.jumpClean = false;
          this.jumpSpins = 0;
          this.jumpLayout = 0;
          this.dropLiveBonus();
        }
        if (e.kind === "clean") {
          this.sfx.cleanLand(e.impact);
          this.flash(e.spins >= 2 ? `Clean ${spinLabel(e.spins)}` : "Clean landing");
          burst(this.dust, e.x, e.y, 8, "rgba(232,240,244,0.7)", 3);
        } else if (e.kind === "stumble") {
          this.sfx.stumble(e.impact);
          this.flash(e.spins >= 2 ? `Hard ${spinLabel(e.spins)}` : "Hard landing");
          burst(this.dust, e.x, e.y, 12, "rgba(240,162,58,0.8)", 4);
        } else {
          this.sfx.fall(e.impact);
          this.flash("You're having a laugh");
          burst(this.dust, e.x, e.y, 16, "rgba(196,60,42,0.75)", 5);
        }
      }
      if (this.bill.hitEvent && (!this.bill.landEvent || this.bill.hitEvent.hoop)) {
        if (this.bill.hitEvent.hoop) this.sfx.hoopClang();
        else this.sfx.bodyHit(this.bill.hitEvent.mag);
      }
      if (this.bill.snapEvents.length) {
        this.sfx.snap();
        if (this.bill.snapEvents.length > 1) this.sfx.snap();
        for (const e of this.bill.snapEvents) {
          burst(this.dust, e.x, e.y, 14, "rgba(255,248,230,0.95)", 6, true);
          burst(this.dust, e.x, e.y, 8, "rgba(196,60,42,0.7)", 4, true);
        }
      }
      if (this.bill.celebrateEvent) this.sfx.celebrate();
      if (this.bill.restarted) {
        if (!this.sim) this.flash("Back to the start");
        this.respawn();
      }
      if (this.bill.died) {
        if (this.sim) {
          this.respawn();
        } else {
          this.sfx.death();
          this.flash(level.train ? "Bill's gone off the train" : "Bill's gone in the gap");
          this.deathT = tuning.deathTime;
          this.dropLiveBonus();
        }
      }
      if (this.bill.finished && !this.sim) {
        this.sfx.finish();
        this.recordJump();
        if (this.levelIndex < LEVELS.length - 1) {
          this.flash(`Get in — FLIP for level ${this.levelIndex + 2}`);
        } else {
          this.flash("Get in, Bill");
          this.showResults();
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

    this.playMotionSfx(level);

    if (!this.inPreview()) {
      followCam(this.cam, this.bill.x, this.bill.y, this.bill.vx, dt, level);
    }
    stepDust(this.dust, dt);
    this.bannerT -= dt;
    if (!this.inPreview()) this.hintT -= dt;
    this.calloutEl.textContent = this.bannerT > 0 ? this.banner : "";
    this.calloutEl.classList.toggle("on", this.bannerT > 0);
    this.hintEl.classList.toggle("faded", this.hintT <= 0);
    this.syncAltimeter();
    this.syncHazardWarn(level);
  }

  private syncHazardWarn(level: Level): void {
    const next = !this.sim && !this.inPreview() && level.train
      ? approachingObstacle(level, this.bill.x)
      : null;
    const show = !!next && next.dist > 0.55 && this.bill.state !== "dead" && !this.bill.cleared;
    this.warnEl.classList.toggle("on", show);
    this.warnEl.classList.toggle("close", show && next !== null && next.dist < 5.6);
    this.warnEl.hidden = !show;
    if (show && !this.wasWarn) this.sfx.warn();
    this.wasWarn = show;
  }

  private syncAltimeter(): void {
    const level = this.level();
    const finishY = level.noFlag ? spawnGround(level) : finishGround(level);
    const alt = this.bill.y - HIP_HEIGHT - finishY;
    const spawnAlt = spawnGround(level) - finishY;
    const jumpPeak = (tuning.jumpVy * tuning.jumpVy) / (2 * Math.max(1, tuning.gravity));
    const maxAlt = Math.max(spawnAlt + jumpPeak + 0.8, jumpPeak + 1.6);
    const minAlt = Math.min(-1.2, (level.killY - finishY) * 0.1);
    const span = Math.max(0.8, maxAlt - minAlt);
    const pct = (v: number): string => `${((Math.max(minAlt, Math.min(maxAlt, v)) - minAlt) / span) * 100}%`;
    this.altZero.style.bottom = pct(0);
    this.altMarker.style.bottom = pct(alt);
    const fill = Math.max(0, Math.min(100, ((Math.max(0, Math.min(maxAlt, alt)) - minAlt) / span) * 100));
    const zero = Math.max(0, Math.min(100, ((0 - minAlt) / span) * 100));
    this.altFill.style.bottom = `${Math.min(fill, zero)}%`;
    this.altFill.style.height = `${Math.abs(fill - zero)}%`;
    this.altRead.textContent = `${alt >= 0 ? "+" : ""}${alt.toFixed(1)}`;

    const air =
      this.bill.state === "air" && this.bill.flipping && !this.bill.rag && !this.inPreview();
    const big = spawnAlt > 2.05;
    const g = Math.max(1, tuning.gravity);
    const vy = this.bill.vy;
    const h = Math.max(0, alt);
    const disc = vy * vy + 2 * g * h;
    const tti = air && disc > 0 ? (vy + Math.sqrt(disc)) / g : 99;
    const falling = vy < -0.9;
    const low = air && big && falling && tti > 0.02 && tti < 0.7;
    const close = low && tti < 0.34;
    this.altEl.classList.toggle("low", low);
    this.altEl.classList.toggle("low-close", close);
    this.altCaption.textContent = low ? "Low" : "Alt";
    if (low && !this.wasAltLow) this.sfx.altLow();
    this.wasAltLow = low;
  }

  private recordJump(): void {
    const points = jumpPoints(
      this.levelIndex,
      this.tries,
      this.jumpClean,
      this.jumpSpins,
      this.jumpLayout,
    );
    this.jumps.push({
      title: this.level().title,
      tries: this.tries,
      clean: this.jumpClean,
      spins: this.jumpSpins,
      layoutHold: this.jumpLayout,
      points,
    });
    this.score += points;
    this.liveBonus = 0;
    this.awardedLayoutTicks = 0;
    this.awardedExtra = 0;
    this.awardedStar = false;
    this.landedFar = false;
    this.syncScoreHud(true);
  }

  private beginAttempt(): void {
    this.awardedLayoutTicks = 0;
    this.awardedExtra = 0;
    if (!this.landedFar) this.clearLiveBonus();
  }

  private dropLiveBonus(): void {
    if (this.liveBonus > 0) {
      this.spawnScoreFall(this.liveBonus);
      this.sfx.miss();
    }
    this.clearLiveBonus();
  }

  private spawnScoreFall(amount: number): void {
    const flake = document.createElement("span");
    flake.className = "score-flake";
    flake.textContent = `−${formatPts(amount)}`;
    this.scoreEl.append(flake);
    flake.addEventListener("animationend", () => flake.remove());
  }

  private spawnScoreRise(amount: number, kind: "layout" | "extra" | "star"): void {
    const chip = document.createElement("span");
    chip.className = `score-chip ${kind}`;
    chip.textContent = kind === "star" ? `★ +${formatPts(amount)}` : `+${formatPts(amount)}`;
    chip.style.right = `${0.2 + Math.random() * 0.55}rem`;
    this.scoreEl.append(chip);
    chip.addEventListener("animationend", () => chip.remove());
  }

  private clearLiveBonus(): void {
    if (this.liveBonus === 0 && !this.awardedStar && !this.landedFar) {
      this.awardedLayoutTicks = 0;
      this.awardedExtra = 0;
      return;
    }
    this.liveBonus = 0;
    this.awardedLayoutTicks = 0;
    this.awardedExtra = 0;
    this.awardedStar = false;
    this.landedFar = false;
    this.syncScoreHud(false);
  }

  private addLive(points: number, kind: "layout" | "extra" | "star"): void {
    if (points <= 0) return;
    this.liveBonus += points;
    this.spawnScoreRise(points, kind);
    this.syncScoreHud(true);
    this.sfx.bonus(kind);
  }

  private payLayout(hold: number): void {
    const ticks = layoutTicks(hold);
    if (ticks <= this.awardedLayoutTicks) return;
    this.addLive((ticks - this.awardedLayoutTicks) * LAYOUT_TICK_PTS, "layout");
    this.awardedLayoutTicks = ticks;
  }

  private payExtra(spins: number): void {
    const extra = extraSpins(spins);
    if (extra <= this.awardedExtra) return;
    this.addLive((extra - this.awardedExtra) * EXTRA_SPIN_PTS, "extra");
    this.awardedExtra = extra;
  }

  private payStar(): void {
    if (this.awardedStar) return;
    this.awardedStar = true;
    this.addLive(STAR_PTS, "star");
  }

  private syncLiveBonuses(): void {
    this.payLayout(this.bill.layoutHold);
    this.payExtra(Math.floor(this.bill.flipTravel / TAU));
  }

  private syncScoreHud(pop: boolean): void {
    this.scoreValueEl.textContent = formatPts(this.score + this.liveBonus);
    this.scoreLiveEl.textContent = `+${formatPts(this.liveBonus)}`;
    this.scoreEl.classList.toggle("hot", this.liveBonus > 0);
    if (!pop) {
      this.scoreEl.classList.remove("pop");
      return;
    }
    this.scoreEl.classList.remove("pop");
    void this.scoreEl.offsetWidth;
    this.scoreEl.classList.add("pop");
  }

  private showResults(): void {
    this.gameOver = true;
    this.resultsReadyT = 0.7;
    this.resultsListEl.replaceChildren(
      ...this.jumps.map((jump) => {
        const li = document.createElement("li");
        const name = document.createElement("span");
        name.className = "jump-name";
        name.textContent = jump.title;
        const tries = document.createElement("span");
        tries.className = "jump-tries";
        tries.textContent = jump.tries === 1 ? "1 try" : `${jump.tries} tries`;
        const star = document.createElement("span");
        star.className = jump.clean ? "jump-star" : "jump-star empty";
        star.textContent = "★";
        star.setAttribute("aria-label", jump.clean ? "Clean landing" : "");
        star.setAttribute("aria-hidden", jump.clean ? "false" : "true");
        const spins = document.createElement("span");
        const extra = extraSpins(jump.spins);
        spins.className = extra ? "jump-spins" : "jump-spins empty";
        spins.textContent = extra ? `×${jump.spins}` : "×1";
        spins.setAttribute("aria-label", extra ? `${jump.spins} rotations` : "");
        spins.setAttribute("aria-hidden", extra ? "false" : "true");
        const layout = document.createElement("span");
        const ticks = layoutTicks(jump.layoutHold);
        layout.className = ticks ? "jump-layout" : "jump-layout empty";
        layout.textContent = `${(ticks * LAYOUT_TICK).toFixed(2)}s`;
        layout.setAttribute("aria-label", ticks ? `Layout ${layout.textContent}` : "");
        layout.setAttribute("aria-hidden", ticks ? "false" : "true");
        const pts = document.createElement("span");
        pts.className = "jump-pts";
        pts.textContent = formatPts(jump.points);
        li.append(name, tries, star, spins, layout, pts);
        return li;
      }),
    );
    this.resultsScoreEl.textContent = formatPts(this.score);
    this.resultsEl.hidden = false;
    this.resultsEl.classList.add("open");
    document.body.classList.add("results-open");
    this.sfx.results();
  }

  private hideResults(): void {
    this.resultsEl.hidden = true;
    this.resultsEl.classList.remove("open");
    document.body.classList.remove("results-open");
    this.resultsListEl.replaceChildren();
  }

  private flash(msg: string): void {
    this.banner = msg;
    this.bannerT = 1.8;
  }

  private resetMotionSfx(): void {
    this.lastFoot = this.bill.runPhase;
    this.lastTuck = this.bill.tuck;
    this.prevX = this.bill.x;
    this.hoopPassed = false;
    this.lastStretch = -1;
    this.wasCleared = this.bill.cleared;
    this.wasWarn = false;
    this.wasAltLow = false;
    this.altEl.classList.remove("low", "low-close");
    this.warnEl.classList.remove("on", "close");
    this.warnEl.hidden = true;
  }

  private playMotionSfx(level: Level): void {
    const bill = this.bill;
    const air = bill.state === "air" || !!bill.rag || bill.held;
    this.sfx.tick({
      flipping: bill.flipping && !bill.held,
      omega: bill.spinRate,
      air,
      fall: Math.max(0, -bill.vy),
      speed: Math.hypot(bill.vx, bill.vy),
    });

    const standing =
      (bill.state === "ground" || bill.state === "stumble") && !bill.rag && !bill.held;
    if (standing && Math.abs(bill.vx) > 1.15) {
      const crossed = Math.floor(bill.runPhase / Math.PI) !== Math.floor(this.lastFoot / Math.PI);
      if (crossed) this.sfx.foot(Math.abs(bill.vx) / tuning.maxSpeed);
    }
    this.lastFoot = bill.runPhase;

    if (bill.flipping) {
      const d = bill.tuck - this.lastTuck;
      if (d > 0.16) this.sfx.tuck();
      else if (d < -0.16) this.sfx.extend();
    }
    this.lastTuck = bill.tuck;

    const hoop = level.hoop;
    if (
      hoop &&
      !this.hoopPassed &&
      bill.flipping &&
      bill.tuck >= hoop.tuck &&
      this.prevX < hoop.x &&
      bill.x >= hoop.x &&
      Math.abs(bill.y - hoop.y) < hoop.inner + 0.2
    ) {
      this.sfx.hoopPass();
      this.hoopPassed = true;
    }
    this.prevX = bill.x;

    if (standing && !bill.engaged && Math.abs(bill.vx) < 0.28 && bill.sore.size === 0) {
      const beat = stretchBeat(bill.time);
      if (beat >= 0 && beat !== this.lastStretch) this.sfx.stretch();
      this.lastStretch = beat;
    } else {
      this.lastStretch = -1;
    }

    if (bill.cleared && !this.wasCleared && Math.abs(bill.vx) > 2) this.sfx.skid();
    this.wasCleared = bill.cleared;
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

    for (const f of this.bill.snapFlashes) {
      const p = worldToScreen(cam, cssW, cssH, f.x, f.y);
      const u = 1 - f.life / f.max;
      const r = (10 + u * 34) * (p.ppm / 80);
      ctx.save();
      ctx.globalAlpha = Math.max(0, f.life / f.max);
      ctx.strokeStyle = "#fff6d8";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "#f0c14a";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + 0.4 + u * 0.35;
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(a) * r * 0.28, p.y + Math.sin(a) * r * 0.28);
        ctx.lineTo(p.x + Math.cos(a) * r * 1.4, p.y + Math.sin(a) * r * 1.4);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (this.bill.state === "dead") {
      ctx.fillStyle = "rgba(7,20,26,0.45)";
      ctx.fillRect(0, 0, cssW, cssH);
    }
  }
}
