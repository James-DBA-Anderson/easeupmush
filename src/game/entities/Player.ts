import Phaser from "phaser";
import { Fighter } from "./Fighter";
import { pickLook } from "../assets/pompeyLooks";

type Dir = "left" | "right" | "up" | "down";

export class Player extends Fighter {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key>;
  private keys!: {
    punch: Phaser.Input.Keyboard.Key;
    back: Phaser.Input.Keyboard.Key;
    kick: Phaser.Input.Keyboard.Key;
    low: Phaser.Input.Keyboard.Key;
    jump: Phaser.Input.Keyboard.Key;
    grab: Phaser.Input.Keyboard.Key;
    run: Phaser.Input.Keyboard.Key;
    loot: Phaser.Input.Keyboard.Key;
    drop: Phaser.Input.Keyboard.Key;
  };

  /** Double-tap a direction within this window to start running. */
  private readonly doubleTapMs = 280;
  private lastTap: { dir: Dir; at: number } | null = null;
  private runFromDoubleTap = false;

  /** Punch string: jab → hook → upper within the combo window. */
  private comboStep = 0;
  private comboUntil = 0;
  private readonly comboWindowMs = 520;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    const look = pickLook("player");
    super(scene, x, y, "player", look.id, "You", {
      toughness: 2.4,
      scaleX: look.scaleX,
      scaleY: look.scaleY,
    });
    this.speed = 175;
    this.runSpeed = 300;
    this.bindInput();
  }

  private bindInput(): void {
    const kb = this.scene.input.keyboard!;
    kb.addCapture([
      Phaser.Input.Keyboard.KeyCodes.SPACE,
      Phaser.Input.Keyboard.KeyCodes.SHIFT,
    ]);
    this.cursors = kb.createCursorKeys();
    this.wasd = kb.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as typeof this.wasd;
    this.keys = {
      punch: kb.addKey(Phaser.Input.Keyboard.KeyCodes.J),
      back: kb.addKey(Phaser.Input.Keyboard.KeyCodes.H),
      kick: kb.addKey(Phaser.Input.Keyboard.KeyCodes.K),
      low: kb.addKey(Phaser.Input.Keyboard.KeyCodes.U),
      jump: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      grab: kb.addKey(Phaser.Input.Keyboard.KeyCodes.L),
      run: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
      loot: kb.addKey(Phaser.Input.Keyboard.KeyCodes.E),
      drop: kb.addKey(Phaser.Input.Keyboard.KeyCodes.Q),
    };
  }

  wantsLoot(_now: number): boolean {
    return Phaser.Input.Keyboard.JustDown(this.keys.loot) && !this.structure.isOut();
  }

  wantsDrop(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.keys.drop) && !this.structure.isOut();
  }

  private pollDoubleTap(now: number): void {
    const taps: { dir: Dir; down: boolean }[] = [
      { dir: "left", down: Phaser.Input.Keyboard.JustDown(this.cursors.left!) || Phaser.Input.Keyboard.JustDown(this.wasd.left) },
      { dir: "right", down: Phaser.Input.Keyboard.JustDown(this.cursors.right!) || Phaser.Input.Keyboard.JustDown(this.wasd.right) },
      { dir: "up", down: Phaser.Input.Keyboard.JustDown(this.cursors.up!) || Phaser.Input.Keyboard.JustDown(this.wasd.up) },
      { dir: "down", down: Phaser.Input.Keyboard.JustDown(this.cursors.down!) || Phaser.Input.Keyboard.JustDown(this.wasd.down) },
    ];

    for (const t of taps) {
      if (!t.down) continue;
      if (
        this.lastTap &&
        this.lastTap.dir === t.dir &&
        now - this.lastTap.at <= this.doubleTapMs
      ) {
        this.runFromDoubleTap = true;
      }
      this.lastTap = { dir: t.dir, at: now };
    }
  }

  private holdingRunDir(): boolean {
    if (!this.lastTap) return false;
    switch (this.lastTap.dir) {
      case "left":
        return this.cursors.left!.isDown || this.wasd.left.isDown;
      case "right":
        return this.cursors.right!.isDown || this.wasd.right.isDown;
      case "up":
        return this.cursors.up!.isDown || this.wasd.up.isDown;
      case "down":
        return this.cursors.down!.isDown || this.wasd.down.isDown;
    }
  }

  /** Punch combo: jab → hook → upper while within the window. */
  tryComboPunch(now: number, running = false): boolean {
    if (this.airborne) return this.tryJumpKick(now);
    if (running || this.running) return this.tryPunch(now, true);

    if (now > this.comboUntil) this.comboStep = 0;
    const next = Math.min(this.comboStep + 1, 3);

    let ok = false;
    if (next === 1) ok = this.tryJab(now);
    else if (next === 2) ok = this.tryHook(now);
    else ok = this.tryUpper(now);

    if (!ok) return false;
    this.comboUntil = now + this.comboWindowMs;
    this.comboStep = next >= 3 ? 0 : next;
    return true;
  }

  updatePlayer(
    now: number,
    dt: number,
    bounds: { minX: number; maxX: number; minY: number; maxY: number },
  ): void {
    this.clearActionIfDue(now);
    this.structure.recoverFloor(now);
    this.updatePhysics(dt, bounds.minY, bounds.maxY);
    this.refreshVisuals(now, dt);

    if (this.structure.isOut()) {
      if (this.structure.crawling && !this.structure.cuffed && !this.structure.outCold) {
        this.x += this.crawlDir * 40 * dt;
        this.x = Phaser.Math.Clamp(this.x, bounds.minX, bounds.maxX);
        this.action = "crawl";
      }
      return;
    }

    this.pollDoubleTap(now);

    if (Phaser.Input.Keyboard.JustDown(this.keys.jump)) {
      this.tryJump(now);
    }

    const wantRun =
      this.keys.run.isDown || (this.runFromDoubleTap && this.holdingRunDir());
    if (this.runFromDoubleTap && !this.holdingRunDir() && !this.keys.run.isDown) {
      this.runFromDoubleTap = false;
    }

    this.running = false;

    const punchJust = Phaser.Input.Keyboard.JustDown(this.keys.punch);
    const kickJust = Phaser.Input.Keyboard.JustDown(this.keys.kick);
    const downHeld =
      this.cursors.down!.isDown || this.wasd.down.isDown;
    // J + K together → back attack (also if one is held and the other taps)
    const wantBackCombo =
      (punchJust && (kickJust || this.keys.kick.isDown)) ||
      (kickJust && this.keys.punch.isDown);

    // Holding a lad — J/K tosses them into the crowd
    if (this.action === "hold" && this.heldTarget) {
      if (punchJust || kickJust) {
        this.tryBodyToss(now);
        this.comboStep = 0;
      }
      // Slow shuffle while clinching
      let hx = 0;
      if (this.cursors.left!.isDown || this.wasd.left.isDown) hx -= 1;
      if (this.cursors.right!.isDown || this.wasd.right.isDown) hx += 1;
      if (hx !== 0) {
        this.x += hx * this.speed * 0.35 * dt;
        this.x = Phaser.Math.Clamp(this.x, bounds.minX, bounds.maxX);
        this.setFacing(hx > 0 ? 1 : -1, now);
      }
      return;
    }

    if (wantBackCombo) {
      this.tryBackAttack(now);
      this.comboStep = 0;
    } else if (kickJust && downHeld) {
      // Down + K — whirlwind crowd clear
      this.tryWhirl(now);
      this.comboStep = 0;
    } else if (kickJust && (wantRun || this.running)) {
      // Run + K — slide through a line
      this.trySlide(now);
      this.comboStep = 0;
    } else if (punchJust) {
      this.tryComboPunch(now, wantRun || this.running);
    } else if (Phaser.Input.Keyboard.JustDown(this.keys.back)) {
      this.tryBackAttack(now);
    } else if (kickJust) {
      this.tryKick(now);
      this.comboStep = 0;
    } else if (Phaser.Input.Keyboard.JustDown(this.keys.low)) {
      this.tryLowBlow(now);
      this.comboStep = 0;
    } else if (Phaser.Input.Keyboard.JustDown(this.keys.grab)) {
      this.tryGrab(now);
      this.comboStep = 0;
    }

    if (this.busy && this.action !== "jump") {
      if (this.action === "headbutt") {
        this.x += this.facing * 200 * dt;
        this.x = Phaser.Math.Clamp(this.x, bounds.minX, bounds.maxX);
      }
      if (this.action === "jab") {
        this.x += this.facing * 40 * dt;
        this.x = Phaser.Math.Clamp(this.x, bounds.minX, bounds.maxX);
      }
      if (this.action === "hook") {
        this.x += this.facing * 70 * dt;
        this.x = Phaser.Math.Clamp(this.x, bounds.minX, bounds.maxX);
      }
      if (this.action === "upper") {
        this.x += this.facing * 110 * dt;
        this.x = Phaser.Math.Clamp(this.x, bounds.minX, bounds.maxX);
      }
      if (this.action === "jump_kick") {
        this.x += this.facing * 240 * dt;
        this.x = Phaser.Math.Clamp(this.x, bounds.minX, bounds.maxX);
      }
      if (this.action === "slide") {
        this.x += this.facing * 320 * dt;
        this.x = Phaser.Math.Clamp(this.x, bounds.minX, bounds.maxX);
      }
      if (this.action === "whirl") {
        // Planted spin — tiny drift
        this.x += this.facing * 40 * dt;
        this.x = Phaser.Math.Clamp(this.x, bounds.minX, bounds.maxX);
      }
      if (this.action === "backhand") {
        this.x += this.attackDir * 80 * dt;
        this.x = Phaser.Math.Clamp(this.x, bounds.minX, bounds.maxX);
      }
      return;
    }

    let vx = 0;
    let vy = 0;
    if (this.cursors.left!.isDown || this.wasd.left.isDown) vx -= 1;
    if (this.cursors.right!.isDown || this.wasd.right.isDown) vx += 1;
    if (!this.airborne) {
      if (this.cursors.up!.isDown || this.wasd.up.isDown) vy -= 1;
      if (this.cursors.down!.isDown || this.wasd.down.isDown) vy += 1;
    }

    if (vx !== 0 || vy !== 0 || this.airborne) {
      if (vx !== 0 || vy !== 0) {
        const len = Math.hypot(vx, vy) || 1;
        vx /= len;
        vy /= len;
      }
      const legMul = this.structure.moveSpeedFactor();
      const canRun = wantRun && !this.airborne && legMul > 0.55;
      const spd = (canRun ? this.runSpeed : this.speed) * legMul;
      this.running = !!(canRun && (vx !== 0 || vy !== 0));
      this.x += vx * spd * dt;
      if (!this.airborne) {
        if (this.platformY !== null) {
          // On a car: slide along X; keep feet on the surface (may be below lane max)
          this.y = this.platformY;
        } else {
          this.y += vy * spd * dt;
          this.groundY = this.y;
        }
      } else {
        this.groundY = Phaser.Math.Clamp(
          this.groundY + vy * this.speed * legMul * 0.35 * dt,
          bounds.minY,
          bounds.maxY,
        );
      }
      if (vx !== 0) {
        this.setFacing(vx > 0 ? 1 : -1, now);
      }
      if (!this.airborne) this.action = this.running ? "run" : "move";
    } else if (this.action === "move" || this.action === "run") {
      this.action = "idle";
      this.running = false;
    }

    this.x = Phaser.Math.Clamp(this.x, bounds.minX, bounds.maxX);
    if (!this.airborne) {
      if (this.platformY !== null) {
        this.y = this.platformY;
      } else {
        this.y = Phaser.Math.Clamp(this.y, bounds.minY, bounds.maxY);
        this.groundY = this.y;
      }
    }
  }
}
