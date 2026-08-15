import Phaser from "phaser";
import { Fighter, inReach } from "./Fighter";
import { pickLookPresent } from "../assets/pompeyLooks";
import { ROAD } from "../constants";
import { chipSfx } from "../audio/ChipSfx";

type Dir = "left" | "right" | "up" | "down";

export class Player extends Fighter {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key>;
  private keys!: {
    punch: Phaser.Input.Keyboard.Key;
    block: Phaser.Input.Keyboard.Key;
    kick: Phaser.Input.Keyboard.Key;
    low: Phaser.Input.Keyboard.Key;
    jump: Phaser.Input.Keyboard.Key;
    grab: Phaser.Input.Keyboard.Key;
    run: Phaser.Input.Keyboard.Key;
    loot: Phaser.Input.Keyboard.Key;
    pickup: Phaser.Input.Keyboard.Key;
    cover: Phaser.Input.Keyboard.Key;
  };

  /** Double-tap a direction within this window to start running. */
  private readonly doubleTapMs = 280;
  private lastTap: { dir: Dir; at: number } | null = null;
  private runFromDoubleTap = false;

  /** Punch string: jab → hook → upper within the combo window. */
  private comboStep = 0;
  private comboUntil = 0;
  private readonly comboWindowMs = 520;

  /** J/K chord buffer — back attack when both land close together. */
  private punchQueuedAt = 0;
  private kickQueuedAt = 0;
  private readonly attackChordMs = 70;
  /** Keep a buffered J/K until recovery frees you (uppers are ~440ms). */
  private readonly attackQueueExpireMs = 720;

  /** Ducked behind a motor / bin — patrols walk past. */
  hiding = false;
  private hideLabel = "";
  /** World X when you tucked in — peek slides relative to this. */
  private hideAnchorX = 0;
  /** Signed slide from the anchor while peeking (−left / +right). */
  private peekAmount = 0;
  /** Opening / cutscene — ignore WASD / attacks. */
  inputLocked = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    // Always a lad — never roll a fem player look
    const look = pickLookPresent("player", "masc");
    super(scene, x, y, "player", look.id, "You", {
      toughness: 6.0,
      recovery: 1.4,
      scaleX: look.scaleX,
      scaleY: look.scaleY,
      build: look.build,
      present: "masc",
    });
    this.speed = 175;
    this.runSpeed = 300;
    // Rising invincibility — the pack can't boot-loop you off the floor
    this.getUpGraceMs = 850;
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
      block: kb.addKey(Phaser.Input.Keyboard.KeyCodes.H),
      kick: kb.addKey(Phaser.Input.Keyboard.KeyCodes.K),
      low: kb.addKey(Phaser.Input.Keyboard.KeyCodes.U),
      jump: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      grab: kb.addKey(Phaser.Input.Keyboard.KeyCodes.L),
      run: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
      loot: kb.addKey(Phaser.Input.Keyboard.KeyCodes.Q),
      pickup: kb.addKey(Phaser.Input.Keyboard.KeyCodes.E),
      cover: kb.addKey(Phaser.Input.Keyboard.KeyCodes.C),
    };
  }

  wantsLoot(_now: number): boolean {
    return Phaser.Input.Keyboard.JustDown(this.keys.loot) && !this.structure.isOut();
  }

  wantsPickup(): boolean {
    return Phaser.Input.Keyboard.JustDown(this.keys.pickup) && !this.structure.isOut();
  }

  override get isHidden(): boolean {
    return this.hiding;
  }

  /** Leaning out from cover — still hidden, but more of you shows. */
  override get isPeeking(): boolean {
    return this.hiding && Math.abs(this.peekAmount) > 7;
  }

  override get coverPeekLean(): number {
    return this.peekAmount * 0.011;
  }

  get coverHint(): string {
    return this.hideLabel;
  }

  isDuckingInput(): boolean {
    return this.keys.cover.isDown;
  }

  /** Someone under / beside the motor — for Swanton aim or a hurricanrana. */
  private nearCarFoe(foes: Fighter[], mode: "down" | "stand"): Fighter | null {
    let best: Fighter | null = null;
    let bestD = 9999;
    for (const f of foes) {
      if (f === this) continue;
      if (f.team === "civilian" || f.team === "police") continue;
      if (f.isBackground) continue;
      if (f.platformY !== null || f.climbing) continue;
      const down =
        f.structure.downed ||
        f.isCrawlingAway ||
        (f.structure.crawling && !f.structure.cuffed);
      if (mode === "down") {
        if (!down && !f.structure.isOut()) continue;
      } else {
        if (down || f.structure.isOut()) continue;
      }
      const dx = Math.abs(f.x - this.x);
      const dy = Math.abs(f.laneY - this.groundY);
      // Wide X — motor is long; taller Y — you're up on the deck
      if (dx > 120 || dy > 100) continue;
      const d = Math.hypot(dx, dy * 0.55);
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best;
  }

  /**
   * Duck behind a large prop while holding C. Attacking, jumping, climbing,
   * or running breaks cover. (C — not S — so Down still moves you south.)
   * While tucked, slide toward a side to take a peek (A/D or facing).
   */
  updateHide(
    now: number,
    dt: number,
    cover: {
      coversPoint(x: number, y: number): boolean;
      label: string;
      x: number;
      rx: number;
    } | null,
    ducking: boolean,
  ): void {
    const fighting =
      this.busy &&
      this.action !== "idle" &&
      this.action !== "move" &&
      this.action !== "run" &&
      this.action !== "grab" &&
      this.action !== "hold" &&
      this.action !== "body_toss" &&
      this.action !== "hurricanrana";
    const canHide =
      !!cover &&
      ducking &&
      !fighting &&
      this.action !== "grab" &&
      this.action !== "hold" &&
      now >= this.grabWhiffUntil &&
      !this.airborne &&
      this.platformY === null &&
      !this.running &&
      !this.structure.isOut();

    if (canHide && cover) {
      if (!this.hiding) {
        this.hiding = true;
        this.hideLabel = cover.label;
        this.hideAnchorX = this.x;
        // Start the peek toward whichever way you're facing
        this.peekAmount = 0;
      }

      let want = 0;
      if (this.cursors.left!.isDown || this.wasd.left.isDown) want = -1;
      else if (this.cursors.right!.isDown || this.wasd.right.isDown) want = 1;

      // Stay on the cover — peek out toward the rim, not clear of it
      const maxPeek = Phaser.Math.Clamp(cover.rx * 0.55, 16, 30);
      // Idle: slide out a little the way you're facing; A/D = full peek
      const target =
        want !== 0 ? want * maxPeek : this.facing * maxPeek * 0.45;
      if (want !== 0) this.setFacing(want > 0 ? 1 : -1, now);
      const t = 1 - Math.exp(-10 * Math.max(0, dt));
      this.peekAmount = Phaser.Math.Linear(this.peekAmount, target, t);
      this.x = this.hideAnchorX + this.peekAmount;
      // Keep the feet in the prop's hide zone
      const lim = cover.rx + 14;
      if (Math.abs(this.x - cover.x) > lim) {
        this.x = cover.x + Math.sign(this.x - cover.x) * lim;
        this.peekAmount = this.x - this.hideAnchorX;
      }

      // Don't wipe an active grab / toss
      if (
        this.action !== "grab" &&
        this.action !== "hold" &&
        this.action !== "body_toss" &&
        this.action !== "hurricanrana"
      ) {
        this.action = "idle";
      }
      return;
    }

    if (this.hiding) {
      this.hiding = false;
      this.hideLabel = "";
      this.peekAmount = 0;
      this.hideAnchorX = this.x;
      this.sprite.setAlpha(1);
    }
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
    if (running || this.isRushing) return this.tryPunch(now, true);

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
    foes: Fighter[] = [],
  ): void {
    this.tickKnockdown(now);
    this.updatePhysics(dt, bounds.minY, bounds.maxY);

    if (this.structure.isOut()) {
      if (this.isCrawlingAway) {
        this.crawlAlong(dt, 30, bounds.minX, bounds.maxX);
      }
      this.refreshVisuals(now, dt);
      return;
    }

    if (this.inputLocked) {
      this.running = false;
      this.refreshVisuals(now, dt);
      return;
    }

    this.pollDoubleTap(now);

    if (Phaser.Input.Keyboard.JustDown(this.keys.jump)) {
      const left =
        this.cursors.left!.isDown || this.wasd.left.isDown;
      const right =
        this.cursors.right!.isDown || this.wasd.right.isDown;
      const holdingBack =
        (this.facing > 0 && left && !right) ||
        (this.facing < 0 && right && !left);
      if (holdingBack && !this.skating) {
        if (this.tryBackflip(now)) void chipSfx.whoosh(true);
      } else {
        if (this.tryJump(now)) void chipSfx.jump();
      }
    }

    const wantRun =
      this.keys.run.isDown || (this.runFromDoubleTap && this.holdingRunDir());
    if (this.runFromDoubleTap && !this.holdingRunDir() && !this.keys.run.isDown) {
      this.runFromDoubleTap = false;
    }

    this.running = false;

    const moveHeld =
      this.cursors.left!.isDown ||
      this.wasd.left.isDown ||
      this.cursors.right!.isDown ||
      this.wasd.right.isDown ||
      (!this.airborne &&
        (this.cursors.up!.isDown ||
          this.wasd.up.isDown ||
          this.cursors.down!.isDown ||
          this.wasd.down.isDown));
    const horizHeld =
      this.cursors.left!.isDown ||
      this.wasd.left.isDown ||
      this.cursors.right!.isDown ||
      this.wasd.right.isDown;
    const downHeld =
      this.cursors.down!.isDown || this.wasd.down.isDown;
    // Down + roll = manual (nose up). Needs lateral speed, not just lane step.
    this.boardManual =
      this.skating && !this.airborne && downHeld && horizHeld;
    // Rolling skate = run-attack rules (headbutt / slide / weapon drive-by)
    this.boardRolling = this.skating && !this.airborne && (moveHeld || this.boardManual);

    const punchJust = Phaser.Input.Keyboard.JustDown(this.keys.punch);
    const kickJust = Phaser.Input.Keyboard.JustDown(this.keys.kick);
    const lowJust = Phaser.Input.Keyboard.JustDown(this.keys.low);

    // Queue J/K so near-simultaneous taps still read as a back attack
    if (punchJust) this.punchQueuedAt = now;
    if (kickJust) this.kickQueuedAt = now;
    if (this.punchQueuedAt > 0 && now - this.punchQueuedAt > this.attackQueueExpireMs) {
      this.punchQueuedAt = 0;
    }
    if (this.kickQueuedAt > 0 && now - this.kickQueuedAt > this.attackQueueExpireMs) {
      this.kickQueuedAt = 0;
    }

    const punchQ = this.punchQueuedAt > 0;
    const kickQ = this.kickQueuedAt > 0;
    const chordReady =
      punchQ &&
      kickQ &&
      Math.abs(this.punchQueuedAt - this.kickQueuedAt) <= this.attackChordMs;
    const canStrike = this.canAct(now) || this.airborne;
    // Instant chord if one is held and the other taps (no buffer wait)
    const heldChord =
      (punchJust && this.keys.kick.isDown) || (kickJust && this.keys.punch.isDown);
    const wantBackCombo = canStrike && (chordReady || heldChord);

    // Solo J: fire as soon as free — only wait the chord window if K is in play
    const kickInPlay =
      this.keys.kick.isDown ||
      (this.kickQueuedAt > 0 && now - this.kickQueuedAt <= this.attackChordMs);
    const punchCommit =
      canStrike &&
      punchQ &&
      !kickQ &&
      !wantBackCombo &&
      (now - this.punchQueuedAt >= this.attackChordMs || !kickInPlay);
    const punchInPlay =
      this.keys.punch.isDown ||
      (this.punchQueuedAt > 0 && now - this.punchQueuedAt <= this.attackChordMs);
    const kickCommit =
      canStrike &&
      kickQ &&
      !punchQ &&
      !wantBackCombo &&
      (now - this.kickQueuedAt >= this.attackChordMs || !punchInPlay);

    const flooredNearby = (): Fighter | null => {
      let best: Fighter | null = null;
      let bestD = 9999;
      for (const f of foes) {
        if (f === this) continue;
        if (f.team === "civilian" || f.team === "police") continue;
        const down =
          f.structure.downed ||
          f.isCrawlingAway ||
          (f.structure.crawling && !f.structure.cuffed);
        if (!down) continue;
        if (!inReach(this, f, 72)) continue;
        const d = Math.hypot(f.x - this.x, f.laneY - this.laneY);
        if (d < bestD) {
          bestD = d;
          best = f;
        }
      }
      return best;
    };

    // Holding a lad — J/K/L tosses them into the crowd
    if (this.heldTarget && (this.action === "hold" || this.action === "grab")) {
      if (
        punchJust ||
        kickJust ||
        Phaser.Input.Keyboard.JustDown(this.keys.grab)
      ) {
        this.tryBodyToss(now);
        this.comboStep = 0;
      }
      // Slow shuffle while clinching
      if (this.action === "hold") {
        let hx = 0;
        if (this.cursors.left!.isDown || this.wasd.left.isDown) hx -= 1;
        if (this.cursors.right!.isDown || this.wasd.right.isDown) hx += 1;
        if (hx !== 0) {
          this.x += hx * this.speed * 0.35 * dt;
          this.x = Phaser.Math.Clamp(this.x, bounds.minX, bounds.maxX);
          this.setFacing(hx > 0 ? 1 : -1, now);
        }
      }
      this.refreshVisuals(now, dt);
      return;
    }

    const grabJust = Phaser.Input.Keyboard.JustDown(this.keys.grab);
    // Include queues so H doesn't snap back to block during the chord wait
    const wantAttack =
      wantBackCombo ||
      punchCommit ||
      kickCommit ||
      punchQ ||
      kickQ ||
      punchJust ||
      kickJust ||
      lowJust ||
      grabJust;

    // H — hold to block; attacks cancel the guard
    if (!wantAttack && this.keys.block.isDown) {
      this.tryBlock(now);
    } else if (this.action === "block") {
      this.dropBlock(now);
    }

    // L first so a buffered jab doesn't swallow the grab
    if (grabJust) {
      if (this.hiding) {
        this.hiding = false;
        this.hideLabel = "";
        this.peekAmount = 0;
        this.sprite.setAlpha(1);
      }
      this.tryGrab(now, foes);
      this.comboStep = 0;
      this.punchQueuedAt = 0;
      this.kickQueuedAt = 0;
    } else if (wantBackCombo) {
      const ok = this.tryBackAttack(now) || this.cancelIntoBackAttack(now);
      if (ok) {
        this.comboStep = 0;
        this.punchQueuedAt = 0;
        this.kickQueuedAt = 0;
      }
    } else if (kickCommit && this.platformY !== null) {
      // On a motor — splash a floored lad, hurricanrana a standing one, else Swanton off
      const floor = this.nearCarFoe(foes, "down");
      const stand = floor ? null : this.nearCarFoe(foes, "stand");
      let ok = false;
      if (floor) {
        ok = this.trySwanton(now, floor);
      } else if (stand) {
        ok = this.tryHurricanrana(now, stand);
      } else {
        ok = this.trySwanton(now);
      }
      if (ok) {
        this.comboStep = 0;
        this.kickQueuedAt = 0;
        this.punchQueuedAt = 0;
        void chipSfx.whoosh(true);
      }
    } else if (kickCommit && downHeld && !this.skating) {
      // Down + K — stomp a floored body, else whirlwind crowd clear
      // (On a board, Down is for manuals — fall through to slide / kick.)
      const floor = flooredNearby();
      let ok = false;
      if (floor) {
        this.faceToward(floor.x, now);
        ok = this.tryStomp(now);
      } else {
        ok = this.tryWhirl(now);
      }
      if (ok) {
        this.comboStep = 0;
        this.kickQueuedAt = 0;
        this.punchQueuedAt = 0;
        void chipSfx.whoosh(true);
      }
    } else if (kickCommit && (wantRun || this.isRushing)) {
      // Run / skate + K — slide through a line
      if (this.trySlide(now)) {
        this.comboStep = 0;
        this.kickQueuedAt = 0;
        this.punchQueuedAt = 0;
        void chipSfx.whoosh(true);
      }
    } else if (punchCommit) {
      if (this.tryComboPunch(now, wantRun || this.isRushing)) {
        this.punchQueuedAt = 0;
        this.kickQueuedAt = 0;
        void chipSfx.whoosh(false);
      } else if (this.canAct(now) && !this.structure.armsUsable()) {
        // Arms knackered — drop the buffer so it doesn't soft-lock J
        this.punchQueuedAt = 0;
      }
    } else if (kickCommit) {
      let ok = false;
      if (this.skating && this.airborne) {
        ok = this.tryKickflip(now);
      } else {
        // K near a floored lad → put the boot in
        const floor = flooredNearby();
        if (floor) {
          this.faceToward(floor.x, now);
          ok = this.tryStomp(now);
        } else {
          ok = this.tryKick(now);
        }
      }
      if (ok) {
        this.comboStep = 0;
        this.kickQueuedAt = 0;
        this.punchQueuedAt = 0;
        void chipSfx.whoosh(this.skating);
      } else if (this.canAct(now) && !this.structure.legsUsable()) {
        this.kickQueuedAt = 0;
      }
    } else if (lowJust) {
      if (this.tryLowBlow(now)) void chipSfx.whoosh(false);
      this.comboStep = 0;
    }

    if (
      this.busy &&
      this.action !== "jump" &&
      this.action !== "ollie" &&
      this.action !== "kickflip" &&
      this.action !== "block"
    ) {
      if (this.action === "headbutt") {
        this.x += this.facing * (this.skating ? 280 : 200) * dt;
        this.x = Phaser.Math.Clamp(this.x, bounds.minX, bounds.maxX);
      }
      if (this.action === "backflip") {
        // Drift the way the boot's going (behind you)
        this.x += this.attackDir * 280 * dt;
        this.x = Phaser.Math.Clamp(this.x, bounds.minX, bounds.maxX);
      }
      if (this.action === "weapon_swing" && this.rushStrike) {
        this.x += this.facing * (this.skating ? 300 : 240) * dt;
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
      if (this.action === "swanton") {
        const progress = 1 - (this.actionUntil - now) / 980;
        if (this.diveAimX !== null) {
          const dx = this.diveAimX - this.x;
          const speed = progress < 0.32 ? 120 : 380;
          if (Math.abs(dx) > 2) {
            this.x += Math.sign(dx) * Math.min(Math.abs(dx), speed * dt);
          }
        } else {
          // Pop up, then dive forward into the scrap
          const drift = progress < 0.32 ? 60 : 280;
          this.x += this.facing * drift * dt;
        }
        if (progress > 0.35 && this.jumpVy > -40) {
          this.jumpVy += 520 * dt; // heavier fall into the splash
        }
        this.x = Phaser.Math.Clamp(this.x, bounds.minX, bounds.maxX);
      }
      if (this.action === "hurricanrana") {
        // Stick with the flip — slight chase toward the aim while diving in
        if (this.diveAimX !== null) {
          const dx = this.diveAimX - this.x;
          if (Math.abs(dx) > 2) {
            this.x += Math.sign(dx) * Math.min(Math.abs(dx), 360 * dt);
          }
        }
        this.x = Phaser.Math.Clamp(this.x, bounds.minX, bounds.maxX);
      }
      if (this.action === "slide") {
        this.x += this.facing * (this.skating ? 380 : 320) * dt;
        this.x = Phaser.Math.Clamp(this.x, bounds.minX, bounds.maxX);
      }
      if (this.action === "whirl") {
        // Planted spin — tiny drift
        this.x += this.facing * 40 * dt;
        this.x = Phaser.Math.Clamp(this.x, bounds.minX, bounds.maxX);
      }
      if (this.action === "stomp") {
        const progress = 1 - (this.actionUntil - now) / 520;
        if (progress >= 0.4 && progress < 0.78) {
          this.x += this.facing * 70 * dt;
          this.x = Phaser.Math.Clamp(this.x, bounds.minX, bounds.maxX);
        }
      }
      if (this.action === "backhand") {
        this.x += this.attackDir * 80 * dt;
        this.x = Phaser.Math.Clamp(this.x, bounds.minX, bounds.maxX);
      }
      if (this.action === "grab") {
        const progress = 1 - (this.actionUntil - now) / this.grabMs;
        if (progress < 0.48) {
          this.x += this.facing * 220 * dt;
        } else if (!this.heldTarget) {
          this.x -= this.facing * 110 * dt;
        }
        this.x = Phaser.Math.Clamp(this.x, bounds.minX, bounds.maxX);
      }
      if (
        this.skating &&
        this.rushStrike &&
        (this.action === "headbutt" ||
          this.action === "slide" ||
          this.action === "weapon_swing")
      ) {
        this.boardRolling = true;
      }
      this.refreshVisuals(now, dt);
      return;
    }

    let vx = 0;
    let vy = 0;
    // Horizontal while ducked is peek (handled in updateHide) — don't walk out of cover
    if (!this.hiding) {
      if (this.cursors.left!.isDown || this.wasd.left.isDown) vx -= 1;
      if (this.cursors.right!.isDown || this.wasd.right.isDown) vx += 1;
    }
    if (!this.airborne) {
      if (this.cursors.up!.isDown || this.wasd.up.isDown) vy -= 1;
      // C is cover — Down steps south, unless you're manualing on the board
      if (
        (this.cursors.down!.isDown || this.wasd.down.isDown) &&
        !this.boardManual
      ) {
        vy += 1;
      }
    }

    if (vx !== 0 || vy !== 0 || this.airborne) {
      if (vx !== 0 || vy !== 0) {
        const len = Math.hypot(vx, vy) || 1;
        vx /= len;
        vy /= len;
      }
      const legMul = this.structure.moveSpeedFactor();
      const blocking = this.action === "block";
      const canRun = wantRun && !this.airborne && !blocking && legMul > 0.55;
      const crouchMul = this.hiding ? 0.45 : 1;
      const blockMul = blocking ? 0.38 : 1;
      const spd = (canRun ? this.runSpeed : this.speed) * legMul * crouchMul * blockMul;
      this.running = !!(canRun && (vx !== 0 || vy !== 0));
      this.x += vx * spd * dt;
      if (!this.airborne) {
        if (this.platformY !== null) {
          // On a car: slide along X; Up is tap-to-climb/dismount (held Up would
          // immediately hop off the roof after a bonnet climb finishes)
          this.y = this.platformY;
          const upTap =
            Phaser.Input.Keyboard.JustDown(this.cursors.up!) ||
            Phaser.Input.Keyboard.JustDown(this.wasd.up);
          if (upTap && !this.climbing) {
            const car = this.mountedCar;
            const onHood =
              this.carSurface === "bonnet" ||
              this.carSurface === "boot" ||
              (this.carBonnetY !== null &&
                this.carRoofY !== null &&
                Math.abs(this.platformY - this.carBonnetY) < 14);
            if (onHood && car) {
              const roofRange = car.deckRange("roof");
              this.beginClimbOnto(
                Phaser.Math.Clamp(this.x, roofRange.min, roofRange.max),
                car.roofY,
                car.y,
                now,
                {
                  bonnet: car.bonnetY,
                  roof: car.roofY,
                  surface: "roof",
                  car,
                },
              );
            } else if (onHood && this.carRoofY !== null) {
              this.beginClimbOnto(this.x, this.carRoofY, this.groundY, now);
            } else {
              // Roof + Up → hop clear onto the promenade
              this.clearCarMount();
              this.carDismountUntil = now + 450;
              this.y = Phaser.Math.Clamp(ROAD.top - 48, bounds.minY, bounds.maxY);
              this.groundY = this.y;
            }
          }
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
      this.guardStepping = blocking && !this.airborne && (vx !== 0 || vy !== 0);
      if (!this.airborne && !blocking) this.action = this.running ? "run" : "move";
    } else {
      this.guardStepping = false;
      if (this.action === "move" || this.action === "run") {
        this.action = "idle";
        this.running = false;
      }
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
    if (!this.skating || this.airborne) {
      this.boardRolling = false;
      this.boardManual = false;
    }

    this.refreshVisuals(now, dt);
  }
}
