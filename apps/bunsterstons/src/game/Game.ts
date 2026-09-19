import * as THREE from "three";
import { gameAudio } from "./audio";
import { Bunsterstons } from "./Bunsterstons";
import { CameraRig } from "./CameraRig";
import type { Character } from "./Character";
import { Chippy } from "./Chippy";
import { MobileControls } from "./MobileControls";
import {
  characterDisplayName,
  characterForLevel,
  type CharacterId,
} from "./types";
import type { Level } from "./world/Level";
import { Level1 } from "./world/Level1";
import { Level2 } from "./world/Level2";

function isLevel2(level: Level): level is Level2 {
  return level instanceof Level2;
}

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private player: Character;
  private camRig: CameraRig;
  private level: Level;
  private levelNum = 1;
  private collected = 0;
  private won = false;
  private elapsed = 0;
  private mobile: MobileControls;
  /** Game time when intro title / play-as / hint should start fading. */
  private introHideAt = 2.4;
  private lastHudPhase = "";

  private countEl: HTMLElement;
  private fillEl: HTMLElement;
  private winEl: HTMLElement;
  private winTitleEl: HTMLElement;
  private winBodyEl: HTMLElement;
  private winEyebrowEl: HTMLElement | null;
  private winActionsDesktopEl: HTMLElement | null;
  private winNextBtn: HTMLElement | null;
  private levelTitleEl: HTMLElement;
  private playAsEl: HTMLElement | null;
  private hudTopEl: HTMLElement | null;
  private targetLabelEl: HTMLElement | null;
  private targetValueEl: HTMLElement | null;
  private targetSubEl: HTMLElement | null;
  private hintEl: HTMLElement | null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      200,
    );

    this.scene.background = new THREE.Color(0xfff4e8);
    this.scene.fog = new THREE.Fog(0xfff4e8, 45, 95);

    const hemi = new THREE.HemisphereLight(0xffe8f5, 0x88c0ff, 1.15);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0d0, 1.35);
    sun.position.set(12, 22, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -30;
    sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    this.scene.add(sun);

    const startLevel = this.readStartLevel();
    this.levelNum = startLevel;
    this.level = this.createLevel(this.levelNum);
    this.player = this.createPlayer(characterForLevel(this.levelNum));
    this.scene.add(this.player.group);
    this.applyLevelBounds();
    this.player.reset(this.spawnX(), this.spawnY(), 0);
    this.camRig = new CameraRig(this.camera);
    this.camRig.snapTo(this.player.position);

    this.countEl = document.getElementById("carrot-count")!;
    this.fillEl = document.getElementById("progress-fill")!;
    this.winEl = document.getElementById("win")!;
    this.winTitleEl = document.getElementById("win-title")!;
    this.winBodyEl = document.getElementById("win-body")!;
    this.winEyebrowEl = document.getElementById("win-eyebrow");
    this.winActionsDesktopEl = document.getElementById("win-actions-desktop");
    this.winNextBtn = document.getElementById("win-next");
    this.levelTitleEl = document.getElementById("level-title")!;
    this.playAsEl = document.getElementById("play-as");
    this.hudTopEl = document.querySelector(".hud-top");
    this.targetLabelEl = document.querySelector(".target__label");
    this.targetValueEl = document.querySelector(".target__row span");
    this.targetSubEl = document.querySelector(".target__sub");
    this.hintEl = document.querySelector(".hint");
    this.mobile = new MobileControls(() => {
      this.syncHud();
      this.syncMobileChrome();
    });
    this.syncHud();
    this.syncMobileChrome();
    this.revealIntroChrome();
    this.bindWinButtons();

    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKey);
    const unlock = () => gameAudio.unlock();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true, passive: true });
  }

  public start(): void {
    this.clock.start();
    this.renderer.setAnimationLoop(this.tick);
  }

  private readStartLevel(): number {
    const q = new URLSearchParams(window.location.search).get("level");
    const n = q ? Number.parseInt(q, 10) : 1;
    return Number.isFinite(n) && n >= 1 ? n : 1;
  }

  private createLevel(n: number): Level {
    if (n % 2 === 0) return new Level2(this.scene);
    return new Level1(this.scene);
  }

  private createPlayer(id: CharacterId): Character {
    return id === "bunsterstons" ? new Bunsterstons() : new Chippy();
  }

  private applyLevelBounds(): void {
    if (isLevel2(this.level)) {
      this.player.setWorldBounds(-14, 22, -6, 6);
      this.scene.background = new THREE.Color(0xffe8d4);
      this.scene.fog = new THREE.Fog(0xffe8d4, 40, 90);
    } else {
      this.player.setWorldBounds(-16, 28, -10, 10);
      this.scene.background = new THREE.Color(0xfff4e8);
      this.scene.fog = new THREE.Fog(0xfff4e8, 45, 95);
    }
  }

  private spawnX(): number {
    return this.levelNum % 2 === 0 ? -5 : -10;
  }

  private spawnY(): number {
    return characterForLevel(this.levelNum) === "chippy" ? 0.38 : 0.58;
  }

  private tick = (): void => {
    const delta = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += delta;
    this.updateIntroChrome();

    if (!this.won) {
      const forward = new THREE.Vector3();
      const right = new THREE.Vector3();
      this.camera.getWorldDirection(forward);
      right.crossVectors(forward, this.camera.up).normalize();
      this.player.setCameraBasis(forward, right);
      this.player.setVirtualInput(this.mobile.getInput());
      this.player.update(
        delta,
        this.level.platforms,
        this.level.solids,
        this.level.climbZones ?? [],
      );
      this.level.update(delta, this.elapsed);

      if (isLevel2(this.level)) {
        const lavaSpawn = this.level.lavaRespawn(this.player.position);
        if (lavaSpawn) {
          this.player.reset(lavaSpawn.x, lavaSpawn.y, lavaSpawn.z);
        }

        if (
          this.level.combatUpdate(
            delta,
            this.player.position,
            this.player.consumeAttackHit(),
          )
        ) {
          this.win();
        }
        if (this.level.phase !== this.lastHudPhase) {
          this.lastHudPhase = this.level.phase;
          if (this.level.phase === "battle") this.revealIntroChrome();
        }
        this.syncHud();
      } else if (this.level.targetCarrots > 0) {
        for (const carrot of this.level.carrots) {
          if (carrot.tryCollect(this.player.position)) {
            this.collected += 1;
            gameAudio.carrot();
            this.syncHud();
            if (this.collected >= this.level.targetCarrots) this.win();
          }
        }
      }
    }

    this.camRig.update(this.player.position, delta);
    this.renderer.render(this.scene, this.camera);
  };

  private win(): void {
    this.won = true;
    const who = characterDisplayName(characterForLevel(this.levelNum));
    const congrats = isLevel2(this.level);
    this.winEl.classList.toggle("congrats", congrats);

    if (congrats) {
      this.winTitleEl.textContent = "Congratulations!";
      this.winBodyEl.textContent =
        "Chippy and Bunsterstons knocked Ken into the lava. Proper job.";
      if (this.winEyebrowEl) this.winEyebrowEl.textContent = "Level 2 clear";
      if (this.winActionsDesktopEl) {
        this.winActionsDesktopEl.innerHTML =
          "Press <kbd>R</kbd> to play again · <kbd>Enter</kbd> for Level 1";
      }
      if (this.winNextBtn) this.winNextBtn.textContent = "Level 1";
    } else {
      this.winTitleEl.textContent = `Level ${this.levelNum} clear!`;
      if (this.level.targetCarrots > 0) {
        this.winBodyEl.textContent = `${who} got all the carrots. Nice one.`;
      } else {
        this.winBodyEl.textContent = `${who} cleared the stage!`;
      }
      if (this.winEyebrowEl) this.winEyebrowEl.textContent = "You did it";
      if (this.winActionsDesktopEl) {
        this.winActionsDesktopEl.innerHTML =
          "Press <kbd>Enter</kbd> for the next level · <kbd>R</kbd> to replay";
      }
      if (this.winNextBtn) this.winNextBtn.textContent = "Next level";
    }

    this.winEl.classList.add("on");
    document.body.classList.add("level-clear");
  }

  private restartLevel(): void {
    this.won = false;
    this.collected = 0;
    this.level.reset();
    this.player.reset(this.spawnX(), this.spawnY(), 0);
    this.camRig.snapTo(this.player.position);
    this.winEl.classList.remove("on", "congrats");
    document.body.classList.remove("level-clear");
    this.syncHud();
    this.revealIntroChrome();
  }

  private goToLevel(n: number): void {
    this.level.dispose(this.scene);
    this.player.dispose();
    this.scene.remove(this.player.group);

    this.levelNum = n;
    this.won = false;
    this.collected = 0;
    this.elapsed = 0;

    this.level = this.createLevel(this.levelNum);
    this.player = this.createPlayer(characterForLevel(this.levelNum));
    this.scene.add(this.player.group);
    this.applyLevelBounds();
    this.player.reset(this.spawnX(), this.spawnY(), 0);
    this.camRig.snapTo(this.player.position);
    this.winEl.classList.remove("on", "congrats");
    document.body.classList.remove("level-clear");
    this.syncHud();
    this.syncMobileChrome();
    this.lastHudPhase = isLevel2(this.level) ? this.level.phase : "";
    this.revealIntroChrome();
  }

  private revealIntroChrome(holdSeconds = 2.4): void {
    this.introHideAt = this.elapsed + holdSeconds;
    for (const el of [this.levelTitleEl, this.playAsEl, this.hintEl]) {
      el?.classList.remove("faded");
    }
  }

  private updateIntroChrome(): void {
    const faded = this.elapsed >= this.introHideAt;
    for (const el of [this.levelTitleEl, this.playAsEl, this.hintEl]) {
      el?.classList.toggle("faded", faded);
    }
  }

  private syncHud(): void {
    this.levelTitleEl.textContent = `Level ${this.levelNum}`;
    if (this.playAsEl) {
      const id = characterForLevel(this.levelNum);
      this.playAsEl.textContent = `Playing as ${characterDisplayName(id)}`;
    }

    if (isLevel2(this.level)) {
      const L = this.level;
      const touch = this.mobile.isEnabled();
      if (this.hudTopEl) this.hudTopEl.style.display = "";
      if (L.phase === "battle" || L.phase === "won") {
        this.countEl.textContent = L.bossDefeated ? "Down!" : "Ken";
        this.fillEl.style.width = L.bossDefeated ? "100%" : "100%";
        if (this.targetLabelEl) this.targetLabelEl.textContent = "Boss";
        if (this.targetValueEl) this.targetValueEl.textContent = "Ken";
        if (this.targetSubEl) this.targetSubEl.textContent = "Knock off boat";
        if (this.hintEl) {
          this.hintEl.textContent = touch
            ? "Bash Ken with Attack · Bunny helps push"
            : "Knock Ken into the lava! F/E headbutt · Bunny helps";
        }
      } else {
        this.countEl.textContent = "Climb";
        this.fillEl.style.width = "0%";
        if (this.targetLabelEl) this.targetLabelEl.textContent = "Goal";
        if (this.targetValueEl) this.targetValueEl.textContent = "Gate";
        if (this.targetSubEl) this.targetSubEl.textContent = "Climb over";
        if (this.hintEl) {
          this.hintEl.textContent = touch
            ? "Climb the gate · up at the top to mount · steps down to the boat"
            : "Hold W to climb · keep up at the top to mount · walk the steps to the boat";
        }
      }
      return;
    }

    const carrotMode = this.level.targetCarrots > 0;
    if (this.hudTopEl) this.hudTopEl.style.display = carrotMode ? "" : "none";
    if (carrotMode) {
      this.countEl.textContent = `${this.collected}/${this.level.targetCarrots}`;
      const pct = (this.collected / this.level.targetCarrots) * 100;
      this.fillEl.style.width = `${pct}%`;
      if (this.targetLabelEl) this.targetLabelEl.textContent = "Carrots";
      if (this.targetValueEl) {
        this.targetValueEl.textContent = String(this.level.targetCarrots);
      }
      if (this.targetSubEl) this.targetSubEl.textContent = "Target";
      if (this.hintEl) {
        this.hintEl.textContent = this.mobile.isEnabled()
          ? "Left stick moves · Jump & Sprint on the right"
          : "WASD move · Space jump · Shift sprint";
      }
    }
  }

  private bindWinButtons(): void {
    document.getElementById("win-next")?.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        if (!this.won) return;
        // After Level 2 congrats, "Level 1" sends you back to the start.
        if (isLevel2(this.level)) this.goToLevel(1);
        else this.goToLevel(this.levelNum + 1);
      },
      { passive: false },
    );
    document.getElementById("win-replay")?.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        this.restartLevel();
      },
      { passive: false },
    );
  }

  private syncMobileChrome(): void {
    const attackBtn = document.getElementById("mobile-attack");
    const touch = this.mobile.isEnabled();
    if (attackBtn) {
      const showAttack = touch && this.levelNum === 2;
      attackBtn.style.visibility = showAttack ? "visible" : "hidden";
      attackBtn.style.pointerEvents = showAttack ? "auto" : "none";
    }
  }

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.syncHud();
    this.syncMobileChrome();
  };

  private onKey = (ev: KeyboardEvent): void => {
    if (ev.code === "KeyR" || ev.key === "r" || ev.key === "R") {
      this.restartLevel();
      return;
    }
    if (!this.won) return;
    if (ev.code === "Enter" || ev.key === "n" || ev.key === "N") {
      if (isLevel2(this.level)) this.goToLevel(1);
      else this.goToLevel(this.levelNum + 1);
    }
  };
}
