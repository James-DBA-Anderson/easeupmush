import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, LANE, WORLD_WIDTH } from "../constants";
import { resolveCombat, tryLoot, nearestLootable, type CombatEvent } from "../combat/resolveCombat";
import { Enemy } from "../entities/Enemy";
import { Player } from "../entities/Player";
import { Civilian } from "../entities/Civilian";
import { Police } from "../entities/Police";
import type { Fighter } from "../entities/Fighter";
import { generateDoodleTextures } from "../assets/doodleTextures";
import { ParallaxBeach } from "../world/ParallaxBeach";
import { SeagullFlock } from "../world/SeagullFlock";
import { WantedSystem } from "../systems/WantedSystem";
import { SpeechBubbles } from "../ui/SpeechBubbles";
import { separateFighters, separateFightersFromObstacles } from "../systems/separateFighters";
import { resolvePropHits } from "../systems/resolvePropHits";
import { updateCarPlatforms } from "../systems/climbCars";
import { WeaponPickup, type WeaponKind } from "../world/WeaponPickup";
import { ThrownWeapon, isThrowable } from "../world/ThrownWeapon";
import type { DestructibleProp } from "../world/DestructibleProp";
import type { Obstacle } from "../world/obstacles";
import { separateObstacles } from "../world/obstacles";

export class BeachScene extends Phaser.Scene {
  private player!: Player;
  private enemies: Enemy[] = [];
  private civilians: Civilian[] = [];
  private police: Police[] = [];
  private fighters: Fighter[] = [];
  private banner!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private hud!: Phaser.GameObjects.Text;
  private lootHint!: Phaser.GameObjects.Text;
  private restartPrompt?: Phaser.GameObjects.Text;
  private floatTexts: Phaser.GameObjects.Text[] = [];
  private defeated = false;
  private restartKey!: Phaser.Input.Keyboard.Key;
  private parallax!: ParallaxBeach;
  private gulls!: SeagullFlock;
  private wanted = new WantedSystem();
  private bubbles!: SpeechBubbles;
  private pickups: WeaponPickup[] = [];
  private thrown: ThrownWeapon[] = [];
  private destructibles: DestructibleProp[] = [];
  private obstacles: Obstacle[] = [];
  /** Lads waiting further east — spawn as you walk into their patch. */
  private readonly pendingEnemies: {
    x: number;
    y: number;
    name: string;
    toughness: number;
    unlockX: number;
    boss?: boolean;
    mad?: boolean;
    /** Must be phoned in by a cagey lad — interrupt the call to cancel. */
    needsCall?: boolean;
    /** Spawn relative to the player instead of fixed world X. */
    ambush?: "behind" | "side";
  }[] = [];
  private bossAnnounced = false;
  /** Unlock X whose call succeeded — wave can spawn. */
  private callArmedUnlock: number | null = null;
  /** Who's currently on the blower. */
  private activeCaller: Enemy | null = null;
  constructor() {
    super("BeachScene");
  }

  create() {
    generateDoodleTextures(this);

    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, GAME_HEIGHT);
    this.parallax = new ParallaxBeach(this);
    this.gulls = new SeagullFlock(this);
    this.wanted = new WantedSystem();
    this.bubbles = new SpeechBubbles(this);

    this.player = new Player(this, 280, GAME_HEIGHT * 0.68);
    // Lean strip — a few scraps that pull you east, not a parade of pop-ins
    this.enemies = [
      new Enemy(this, 720, GAME_HEIGHT * 0.68, "Mean Lad", { toughness: 0.8, mad: true }),
    ];
    this.pendingEnemies.splice(
      0,
      this.pendingEnemies.length,
      // Mate — walks in without a call
      { x: 980, y: GAME_HEIGHT * 0.72, name: "His Mate", toughness: 0.8, unlockX: 620 },
      // Clarence — cagey pack, must be called in
      { x: 1400, y: GAME_HEIGHT * 0.66, name: "Deck Chair", toughness: 0.85, unlockX: 1100, needsCall: true },
      { x: 1480, y: GAME_HEIGHT * 0.72, name: "Suncream", toughness: 0.88, unlockX: 1100, needsCall: true },
      // Mid-front
      { x: 2100, y: GAME_HEIGHT * 0.7, name: "Another One", toughness: 0.9, unlockX: 1750, mad: true, needsCall: true },
      {
        x: 2180,
        y: GAME_HEIGHT * 0.64,
        name: "Quiet One",
        toughness: 0.82,
        unlockX: 1750,
        ambush: "behind",
        needsCall: true,
      },
      // Eastney
      { x: 2800, y: GAME_HEIGHT * 0.7, name: "Eastney Boy", toughness: 0.95, unlockX: 2450, mad: true, needsCall: true },
      // Pier + boss — boss doesn't need a call
      { x: 3300, y: GAME_HEIGHT * 0.68, name: "Pier Rat", toughness: 1.0, unlockX: 3000, mad: true, needsCall: true },
      {
        x: 3550,
        y: GAME_HEIGHT * 0.7,
        name: "Pier Hardman",
        toughness: 3.2,
        unlockX: 3200,
        boss: true,
      },
    );
    this.civilians = [
      new Civilian(this, 450, GAME_HEIGHT * 0.7, "Ollie", "walker"),
      new Civilian(this, 980, GAME_HEIGHT * 0.62, "Priya", "jogger"),
      new Civilian(this, 200, GAME_HEIGHT * 0.72, "Kieran", "bike", 1),
      new Civilian(this, 3800, GAME_HEIGHT * 0.66, "Mei", "scooter", -1),
      new Civilian(this, 1950, GAME_HEIGHT * 0.74, "Kwame + dog", "dog_walker"),
      new Civilian(this, 2400, GAME_HEIGHT * 0.66, "Ash", "wheelchair"),
      new Civilian(this, 3000, GAME_HEIGHT * 0.7, "Nana Jean", "walker"),
      new Civilian(this, 3400, GAME_HEIGHT * 0.64, "Jamal", "jogger"),
      new Civilian(this, 700, GAME_HEIGHT * 0.68, "Aisha", "walker", undefined, { nosy: true }),
      new Civilian(this, 2100, GAME_HEIGHT * 0.72, "Tomasz", "walker", undefined, { nosy: true }),
      new Civilian(this, 1200, GAME_HEIGHT * 0.7, "Fatima", "walker"),
      new Civilian(this, 1600, GAME_HEIGHT * 0.66, "Connor", "jogger"),
    ];
    this.police = [];
    this.rebuildFighterList();
    this.defeated = false;
    this.spawnWeapons();
    this.destructibles = this.parallax.destructibles;
    this.refreshObstacles();

    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setDeadzone(120, 80);

    this.banner = this.add
      .text(24, 16, "Southsea — Clarence Pier to South Parade. They got out the car…", {
        fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
        fontSize: "15px",
        color: "#1a1410",
        backgroundColor: "#f2e6d8",
        padding: { x: 8, y: 4 },
      })
      .setScrollFactor(0)
      .setDepth(100);

    this.hud = this.add
      .text(GAME_WIDTH - 24, 16, "", {
        fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
        fontSize: "16px",
        color: "#1a1410",
        backgroundColor: "#f2e6d8",
        padding: { x: 8, y: 4 },
        align: "right",
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100);

    this.lootHint = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 80, "", {
        fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
        fontSize: "18px",
        color: "#1a1410",
        backgroundColor: "#ffe08a",
        padding: { x: 10, y: 4 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(110)
      .setVisible(false);

    this.hint = this.add
      .text(
        GAME_WIDTH / 2,
        GAME_HEIGHT - 18,
        "WASD  ·  run  ·  Space jump  ·  J combo  ·  K kick  ·  L grab  ·  E loot  ·  R retry",
        {
          fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
          fontSize: "13px",
          color: "#f2e6d8",
          backgroundColor: "#1a1410aa",
          padding: { x: 12, y: 5 },
        },
      )
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(100)
      .setAlpha(0.92);

    this.restartKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);
  }

  private rebuildFighterList(): void {
    this.fighters = [this.player, ...this.enemies, ...this.civilians, ...this.police];
  }

  private spawnWeapons(): void {
    const spots: { x: number; y: number; kind: WeaponKind; rx: number; ry: number }[] = [
      { x: 400, y: GAME_HEIGHT * 0.7, kind: "bottle", rx: 24, ry: 18 },
      { x: 880, y: GAME_HEIGHT * 0.66, kind: "bat", rx: 24, ry: 18 },
      { x: 1500, y: GAME_HEIGHT * 0.72, kind: "brick", rx: 24, ry: 18 },
      { x: 2000, y: GAME_HEIGHT * 0.64, kind: "bottle", rx: 24, ry: 18 },
      { x: 2800, y: GAME_HEIGHT * 0.7, kind: "bat", rx: 24, ry: 18 },
      { x: 3400, y: GAME_HEIGHT * 0.68, kind: "brick", rx: 24, ry: 18 },
    ];
    separateObstacles(spots);
    for (const s of spots) {
      this.spawnPickup(s.x, s.y, s.kind);
    }
  }

  private spawnPickup(x: number, y: number, kind: WeaponKind): void {
    const p = new WeaponPickup(this, x, y, kind);
    this.pickups.push(p);
  }

  private refreshObstacles(): void {
    this.obstacles = this.parallax.getObstacles();
  }

  private onPropHit(attacker: Fighter, prop: DestructibleProp, destroyed: boolean, scrap: WeaponKind | null): void {
    if (destroyed) {
      this.spawnFloat(prop.x, prop.y - 40, `${prop.label} wrecked`);
      this.banner.setText(`Smashed the ${prop.label}.`);
      if (scrap) {
        this.spawnPickup(prop.x + 16, prop.y, scrap);
        this.spawnFloat(prop.x, prop.y - 60, `+${scrap}`);
      }
      this.refreshObstacles();
    } else {
      this.spawnFloat(prop.x, prop.y - 36, "clunk");
    }
    void attacker;
  }

  private nearestPickup(): WeaponPickup | null {
    let best: WeaponPickup | null = null;
    let bestD = 70;
    for (const p of this.pickups) {
      if (p.taken) continue;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y);
      if (d < bestD && Math.abs(this.player.laneY - p.y) < 40) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  private tryPickupWeapon(): boolean {
    const p = this.nearestPickup();
    if (!p || p.taken) return false;
    if (this.player.weapon !== "none") {
      const old = this.player.dropWeapon();
      if (old) this.spawnPickup(this.player.x - this.player.facing * 24, this.player.y, old);
    }
    const kind = p.kind;
    this.player.equipWeapon(kind);
    p.collect();
    this.pickups = this.pickups.filter((x) => x !== p && !x.taken);
    this.spawnFloat(this.player.x, this.player.y - 50, `got ${kind}`);
    const tip =
      kind === "bat"
        ? "J to swing the bat. Q to drop."
        : `J to throw the ${kind}. Q to drop.`;
    this.banner.setText(`Picked up a ${kind} — ${tip}`);
    return true;
  }

  private updateThrows(now: number, dt: number): void {
    // Release projectiles from throw wind-ups
    for (const f of this.fighters) {
      if (!f.takeThrowRelease(now)) continue;
      const kind = f.weapon;
      if (!isThrowable(kind)) continue;
      f.consumeHeldWeapon();
      const proj = new ThrownWeapon(
        this,
        f.x + f.facing * 28,
        f.laneY,
        kind,
        f,
        f.facing,
      );
      this.thrown.push(proj);
      this.spawnFloat(f.x, f.y - 55, `yeet ${kind}`);
    }

    const still: ThrownWeapon[] = [];
    for (const t of this.thrown) {
      // Hit scenery first
      let hitProp = false;
      for (const prop of this.destructibles) {
        if (prop.destroyed) continue;
        const dx = Math.abs(prop.x - t.x);
        const dy = Math.abs(prop.y - t.groundY);
        if (dx > prop.rx + 20 || dy > prop.ry + 18) continue;
        const power = t.kind === "brick" ? 0.85 : 0.75;
        const result = prop.takeThrow(this, now, power, t.x);
        if (result) {
          this.onPropHit(t.owner, prop, result.destroyed, result.scrap);
          hitProp = true;
          break;
        }
      }
      if (hitProp) {
        t.destroySelf();
        continue;
      }

      // Hit fighters
      let hitSomeone = false;
      for (const target of this.fighters) {
        if (!t.canHit(target)) continue;
        if (t.owner.team === "enemy" && target.team === "enemy") continue;
        if (t.owner.team === "police" && target.team === "police") continue;
        if (t.owner.team === "civilian") continue;

        const power = t.kind === "brick" ? 0.8 : 0.7;
        const result = target.receiveStrike({
          kind: "thrown",
          power,
          critical: t.kind === "bottle",
          dirty: false,
          onOpening: target.structure.isOpen(now) || target.structure.downed,
          now,
          bodyPart: "head",
        });
        if (t.kind === "bottle") {
          this.spawnFloat(target.x, target.y - 70, "SMASH");
          this.spawnBottleSmash(target.x, target.y - 40);
        }
        this.onCombat({
          attacker: t.owner,
          target,
          result,
          kind: "thrown",
        });
        hitSomeone = true;
        break;
      }

      if (hitSomeone) {
        t.destroySelf();
        continue;
      }

      const state = t.update(dt);
      if (state === "landed") {
        // Bottles smash; bricks can be scooped again
        if (t.kind === "brick") {
          this.spawnPickup(t.x, t.groundY, "brick");
        } else {
          this.spawnFloat(t.x, t.groundY - 30, "smash");
          this.spawnBottleSmash(t.x, t.groundY - 20);
        }
        t.destroySelf();
        continue;
      }
      if (state === "flying") {
        if (t.x < LANE.minX - 40 || t.x > LANE.maxX + 40) {
          t.destroySelf();
          continue;
        }
        still.push(t);
      }
    }
    this.thrown = still;
  }

  private syncPolice(): void {
    const need = this.wanted.desiredPoliceCount();
    while (this.police.filter((p) => !p.structure.isOut()).length < need) {
      const edge = this.cameras.main.scrollX + GAME_WIDTH + 40;
      const y = GAME_HEIGHT * (0.6 + Math.random() * 0.12);
      const n = this.police.length + 1;
      const copper = new Police(this, edge, y, `PC ${n}`);
      this.police.push(copper);
      this.rebuildFighterList();
      this.banner.setText("Old Bill's here — they're nicking anyone scrap.");
      this.spawnFloat(this.player.x, this.player.y - 70, "POLICE!");
    }
  }

  /** Bring in the next lad(s) when you've walked far enough — always off-camera. */
  private syncEnemyReinforcements(): void {
    if (this.pendingEnemies.length === 0) return;

    const living = this.enemies.filter((e) => !e.structure.isOut()).length;
    if (living >= 2) return;

    const reach = this.player.x;
    const waveUnlock = this.pendingEnemies[0].unlockX;
    if (reach < waveUnlock) return;

    const needsCall = !!this.pendingEnemies[0].needsCall;
    if (needsCall && this.callArmedUnlock !== waveUnlock) {
      // Wait for a cagey lad to finish the call (or get interrupted → wave dropped)
      this.tryStartBackupCall(waveUnlock);
      return;
    }

    let spawned = 0;
    let packName = "";
    while (
      this.pendingEnemies.length > 0 &&
      this.pendingEnemies[0].unlockX === waveUnlock
    ) {
      const next = this.pendingEnemies.shift()!;
      const pos = this.resolveOffscreenSpawn(next, spawned);
      const lad = new Enemy(this, pos.x, pos.y, next.name, {
        toughness: next.toughness,
        boss: next.boss,
        mad: next.mad,
      });
      lad.setFacing(pos.x < this.player.x ? 1 : -1, this.time.now);
      if (next.ambush || next.boss || needsCall) {
        lad.onProvoked(this.time.now, this.player);
      }
      this.enemies.push(lad);
      spawned += 1;
      if (next.boss && !this.bossAnnounced) {
        this.bossAnnounced = true;
        this.banner.setText("South Parade Pier — the Hardman's waiting.");
        this.spawnFloat(this.player.x, this.player.y - 80, "BOSS AHEAD");
        this.bubbles.say(lad, "This is MY front", 3200);
      }
      packName = next.name;
    }
    this.callArmedUnlock = null;
    this.activeCaller = null;
    if (spawned === 0) return;
    this.rebuildFighterList();
    if (!this.bossAnnounced) {
      this.banner.setText(
        spawned >= 2 ? `Lads coming in from the east…` : `${packName} up ahead…`,
      );
    }
  }

  private locationLabelForUnlock(unlockX: number): string {
    if (unlockX < 1400) return "Clarence";
    if (unlockX < 2100) return "the Common";
    if (unlockX < 2800) return "Eastney";
    return "the Pier";
  }

  /** Prompt a cautious lad to phone mates for the pending wave. */
  private tryStartBackupCall(waveUnlock: number): void {
    if (this.activeCaller?.isPhoningMates) return;
    if (this.activeCaller && !this.activeCaller.active) this.activeCaller = null;

    const caller =
      this.enemies.find((e) => e.canCallForHelp() && !e.structure.isOut()) ?? null;
    if (!caller) {
      // Street cleared — no one to phone, but the pack was already hanging about
      this.callArmedUnlock = waveUnlock;
      return;
    }

    const loc = this.locationLabelForUnlock(waveUnlock);
    if (!caller.startCallForHelp(this.time.now, loc)) return;
    this.activeCaller = caller;
    this.banner.setText("He's calling his mates — stop him before he says where!");
    this.spawnFloat(caller.x, caller.y - 70, "calling…");
  }

  private dropPendingWave(waveUnlock: number, banner: string): void {
    while (
      this.pendingEnemies.length > 0 &&
      this.pendingEnemies[0].unlockX === waveUnlock
    ) {
      this.pendingEnemies.shift();
    }
    this.callArmedUnlock = null;
    this.activeCaller = null;
    this.banner.setText(banner);
  }

  /** Resolve phone-call outcomes — success arms the wave, interrupt cancels it. */
  private syncBackupCalls(): void {
    for (const e of this.enemies) {
      const outcome = e.takeCallOutcome();
      if (!outcome) continue;
      const waveUnlock = this.pendingEnemies[0]?.unlockX;
      if (outcome === "success") {
        if (waveUnlock != null && this.pendingEnemies[0]?.needsCall) {
          this.callArmedUnlock = waveUnlock;
          this.banner.setText("He got the call out — mates on the way!");
          this.spawnFloat(e.x, e.y - 70, "mates inbound");
        }
      } else if (waveUnlock != null && this.pendingEnemies[0]?.needsCall) {
        this.dropPendingWave(waveUnlock, "Call dropped — they don't know where you are.");
        this.spawnFloat(e.x, e.y - 70, "call dropped!");
      }
      if (this.activeCaller === e) this.activeCaller = null;
    }
  }

  /**
   * Place reinforcements outside the camera. Prefer their world patch if it's
   * already off-screen; otherwise slide them to the east (or west for ambush).
   */
  private resolveOffscreenSpawn(
    next: { x: number; y: number; ambush?: "behind" | "side"; boss?: boolean },
    waveIndex: number,
  ): { x: number; y: number } {
    const cam = this.cameras.main;
    const margin = 72;
    const viewLeft = cam.scrollX - margin;
    const viewRight = cam.scrollX + GAME_WIDTH + margin;
    const y = Phaser.Math.Clamp(
      next.y + (waveIndex - 0.5) * 28,
      LANE.minY,
      LANE.maxY,
    );

    if (next.ambush === "behind") {
      return {
        x: Phaser.Math.Clamp(viewLeft - 40 - waveIndex * 36, LANE.minX, LANE.maxX),
        y,
      };
    }

    // Ahead of the player — east of the camera (or their patch if already clear)
    let x = next.x;
    if (x > viewLeft && x < viewRight) {
      x = viewRight + 40 + waveIndex * 40;
    }
    // Keep them east of the player so the level still pulls forward
    x = Math.max(x, this.player.x + 200);
    if (x > viewLeft && x < viewRight) {
      x = viewRight + 40 + waveIndex * 40;
    }
    return {
      x: Phaser.Math.Clamp(x, LANE.minX, LANE.maxX),
      y,
    };
  }

  update(time: number, delta: number) {
    const now = time;
    const dt = delta / 1000;

    this.parallax.update(this.cameras.main.scrollX, delta, now);
    this.gulls.update(now, dt, this.fighters);
    for (const s of this.gulls.takeSquawks(now)) {
      this.spawnFloat(s.x, s.y, Math.random() < 0.5 ? "kaa!" : "mine!");
    }
    this.wanted.update(dt);
    this.syncBackupCalls();
    this.syncEnemyReinforcements();
    this.syncPolice();
    this.bubbles.update(now);
    this.updateHud();

    if (this.defeated) {
      if (Phaser.Input.Keyboard.JustDown(this.restartKey)) this.scene.restart();
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.restartKey)) {
      this.scene.restart();
      return;
    }

    this.player.updatePlayer(now, dt, LANE);
    for (const f of this.fighters) {
      f.applyTossFlight(now, dt, LANE.minX, LANE.maxX);
      // Player already runs updatePhysics in updatePlayer
      if (f !== this.player && f.airborne) f.updatePhysics(dt, LANE.minY, LANE.maxY);
    }
    for (const e of this.enemies) {
      e.updateEnemy(now, dt, this.fighters);
      const line = e.takeInsult();
      if (line) this.bubbles.say(e, line);
    }
    for (const c of this.civilians) {
      // Cyclists also treat cars as solid (climb platforms aren't fighter walls)
      const riderObs: Obstacle[] = [
        ...this.obstacles,
        ...this.destructibles
          .filter((d) => d.isCar)
          .map((d) => ({
            x: d.x,
            y: d.y,
            rx: d.rx,
            ry: d.ry,
            kind: "prop" as const,
          })),
      ];
      c.updateCivilian(now, dt, this.fighters, riderObs, this.civilians);
      const speech = c.takeSpeech();
      if (speech) {
        this.bubbles.say(c, speech, 2600);
        this.banner.setText("A local piles in with you!");
      }
      const crash = c.takeCrashOutcome();
      if (crash) {
        const label =
          crash === "angry" ? "OI!" : crash === "knocked" ? "off the bike!" : "scarpers";
        this.spawnFloat(c.x, c.y - 70, label);
        if (crash === "angry") this.wanted.bump(0.4);
      }
      if (c.takeFilmPing(now)) {
        this.spawnFloat(c.x, c.y - 78, Math.random() < 0.5 ? "filming…" : "getting it on video");
      }
    }
    for (const p of this.police) p.updatePolice(now, dt, this.fighters);

    updateCarPlatforms(this.fighters, this.destructibles);
    separateFighters(this.fighters);
    separateFightersFromObstacles(this.fighters, this.obstacles);
    for (const f of this.fighters) f.pinToFloor();

    if (this.player.wantsDrop()) {
      const dropped = this.player.dropWeapon();
      if (dropped) {
        this.spawnPickup(this.player.x + this.player.facing * 28, this.player.y, dropped);
        this.spawnFloat(this.player.x, this.player.y - 50, `dropped ${dropped}`);
      }
    }

    if (this.player.wantsLoot(now)) {
      const picked = this.tryPickupWeapon();
      if (!picked) {
        const ok = tryLoot(this.player, this.fighters, (ev) => this.onCombat(ev));
        if (!ok) this.spawnFloat(this.player.x, this.player.y - 50, "nothing nearby");
      }
    }

    this.updateThrows(now, dt);

    const lootTarget = nearestLootable(this.player, this.fighters);
    const nearWep = this.nearestPickup();
    if (lootTarget) {
      this.lootHint.setText("E — loot").setVisible(true);
    } else if (nearWep) {
      this.lootHint.setText(`E — grab ${nearWep.kind}`).setVisible(true);
    } else {
      this.lootHint.setVisible(false);
    }

    resolveCombat(now, this.fighters, (ev) => this.onCombat(ev));
    this.resolveDogKicks(now);
    resolvePropHits(this, now, this.fighters, this.destructibles, (ev) => {
      this.onPropHit(ev.attacker, ev.prop, ev.result.destroyed, ev.result.scrap);
    });
    for (const f of this.fighters) f.pinToFloor();

    this.player.refreshVisuals(now, 0);
    for (const f of this.fighters) {
      if (f !== this.player) f.refreshVisuals(now, 0);
    }

    if (this.player.structure.isOut()) {
      this.showDefeat();
      return;
    }

    const boss = this.enemies.find((e) => e.isBoss);
    if (boss?.structure.isOut()) {
      if (!this.banner.text.includes("Hardman sorted")) {
        this.banner.setText("Hardman sorted. Beach is yours. (R reset)");
        this.spawnFloat(boss.x, boss.y - 90, "BOSS DOWN");
      }
    } else if (this.enemies.every((e) => e.structure.isOut())) {
      this.banner.setText("Beach thugs sorted. Watch the wanted meter. (R reset)");
    }
  }

  private updateHud(): void {
    const stars = this.wanted.starsLabel();
    const wep =
      this.player.weapon !== "none"
        ? ` · ${this.player.weapon}(${this.player.weaponDurability})`
        : "";
    this.hud.setText(
      `£${this.player.money}${wep}${stars ? `\nWANTED ${stars}` : ""}`,
    );
  }

  private showDefeat(): void {
    this.defeated = true;
    let msg = "You've had enough — down on the pebbles.";
    if (this.player.structure.cuffed) msg = "Cuffed. You're going in the van.";
    else if (this.player.structure.outCold) msg = "You're out cold on the pebbles.";

    this.banner.setText(msg);
    this.restartPrompt?.destroy();
    this.restartPrompt = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, "Press R to get back up and try again", {
        fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
        fontSize: "28px",
        color: "#1a1410",
        backgroundColor: "#f2e6d8",
        padding: { x: 16, y: 12 },
        align: "center",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(300);

    this.hint.setText("R — restart the scrap");
  }

  private onCombat(ev: CombatEvent): void {
    if (ev.kind === "loot") {
      this.spawnFloat(ev.target.x, ev.target.y - 50, ev.result);
      this.banner.setText(`Nicked their pockets: ${ev.result}`);
      return;
    }

    if (ev.kind === "toss_hit") {
      this.spawnFloat(ev.target.x, ev.target.y - 56, "pile-up!");
      this.wanted.bump(0.15);
    }

    if (ev.kind === "boot_head" && ev.attacker.team === "enemy") {
      this.spawnFloat(ev.target.x, ev.target.y - 52, "STOMP");
    }

    if (
      ev.target instanceof Enemy &&
      ev.result !== "blocked" &&
      ev.result !== "dodged"
    ) {
      const now = this.time.now;
      ev.target.onProvoked(now, ev.attacker);
      this.rallyNearbyLads(ev.target, ev.attacker, now);
    }

    if (ev.attacker.team === "player" && ev.attacker.action === "upper" && ev.result !== "blocked") {
      this.spawnFloat(ev.target.x, ev.target.y - 72, "UPPER!");
    }

    if (
      ev.target instanceof Civilian &&
      ev.attacker.team === "enemy" &&
      ev.result !== "blocked" &&
      ev.result !== "dodged"
    ) {
      const now = this.time.now;
      if (ev.target.onHitByEnemy(now, ev.attacker)) {
        // speech consumed next frame via takeSpeech
      }
      // Nearby locals who see it may pile in too
      for (const c of this.civilians) {
        if (c === ev.target || c.isAlly) continue;
        const d = Phaser.Math.Distance.Between(c.x, c.y, ev.target.x, ev.target.y);
        if (d < 200) c.tryJoinPlayer(now, ev.attacker, 0.22);
      }
    }

    if (
      ev.target.team === "civilian" &&
      ev.attacker.team === "player" &&
      ev.result !== "blocked" &&
      ev.result !== "dodged"
    ) {
      this.wanted.bump(0.85);
      this.civilians.forEach((c) => c.scare(this.time.now));
      this.banner.setText("You hit a civilian — wanted's going up!");
    }

    if (ev.kind === "cuff") {
      this.banner.setText(
        ev.target.team === "player"
          ? "You're nicked — cuffed and done."
          : "Bill's cuffed someone. Immobilised.",
      );
    }

    const phrases: Record<string, string> = {
      blocked: "BLOCK",
      flinch: "ow",
      winded: "oof",
      stumble: "whoa",
      disabled: "LOW BLOW",
      opened: "open!",
      crawl_away: ev.target.team === "player" ? "you're done" : "had enough",
      out_cold: "OUT COLD",
      cuffed: "CUFFED",
      tased: "ZZZT",
      held: "gotcha",
      takedown: "down ya go",
      dodged: "missed!",
    };
    this.spawnFloat(ev.target.x, ev.target.y - 60, phrases[ev.result] ?? ev.result);

    if (ev.target.team === "player" && (ev.result === "out_cold" || ev.result === "crawl_away" || ev.result === "cuffed")) {
      return;
    }

    if (ev.result === "out_cold" || ev.result === "crawl_away") {
      this.banner.setText(
        ev.result === "out_cold"
          ? "Out cold — press E near them to loot."
          : "Crawl-away KO — E to loot if you're quick.",
      );
    }
  }

  private resolveDogKicks(now: number): void {
    for (const attacker of this.fighters) {
      if (attacker.action !== "kick" && attacker.action !== "jump_kick" && attacker.action !== "low_blow") {
        continue;
      }
      const strike = attacker.strikeWindow(now);
      if (!strike) continue;
      for (const c of this.civilians) {
        const dog = c.dog;
        if (!dog || !dog.alive) continue;
        if (!dog.inKickReach(attacker.x, attacker.laneY, attacker.attackDir, attacker.attackReach)) {
          continue;
        }
        if (!dog.receiveKick(now, attacker.x, attacker.actionUntil)) continue;
        this.spawnFloat(dog.x, dog.y - 40, dog.knockedOut ? "yelp!" : "yap!");
        if (attacker.team === "player") {
          this.wanted.bump(0.35);
          this.banner.setText("Kicked the dog — wanted ticks up.");
        }
      }
    }
  }

  /** When one lad gets stuck into — his mates within earshot pile in. */
  private rallyNearbyLads(hit: Enemy, attacker: Fighter, now: number): void {
    for (const e of this.enemies) {
      if (e === hit || e.structure.isOut()) continue;
      const d = Phaser.Math.Distance.Between(e.x, e.y, hit.x, hit.y);
      if (d < 280) e.onProvoked(now, attacker);
    }
  }

  private spawnFloat(x: number, y: number, text: string): void {
    const t = this.add
      .text(x, y, text, {
        fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
        fontSize: "14px",
        color: "#1a1410",
        backgroundColor: "#f2e6d8",
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5)
      .setDepth(200);

    this.floatTexts.push(t);
    this.tweens.add({
      targets: t,
      y: y - 28,
      alpha: 0,
      duration: 700,
      onComplete: () => {
        t.destroy();
        this.floatTexts = this.floatTexts.filter((f) => f !== t);
      },
    });
  }

  private spawnBottleSmash(x: number, y: number): void {
    // Brief bottle silhouette that bursts
    if (this.textures.exists("weapon_bottle")) {
      const bottle = this.add
        .image(x, y, "weapon_bottle")
        .setDepth(185)
        .setScale(1.1)
        .setAngle(-20);
      this.tweens.add({
        targets: bottle,
        scaleX: 1.6,
        scaleY: 0.4,
        angle: 40,
        alpha: 0,
        duration: 180,
        onComplete: () => bottle.destroy(),
      });
    }
    // Radial glass burst
    for (let i = 0; i < 10; i++) {
      const ang = (Math.PI * 2 * i) / 10 + Math.random() * 0.4;
      const dist = 28 + Math.random() * 36;
      const shard = this.add.rectangle(
        x,
        y,
        2 + Math.random() * 5,
        2 + Math.random() * 4,
        0xb8e8f8,
      );
      shard.setDepth(186).setAngle(Math.random() * 360).setAlpha(0.95);
      this.tweens.add({
        targets: shard,
        x: x + Math.cos(ang) * dist,
        y: y + Math.sin(ang) * dist + 10,
        alpha: 0,
        angle: shard.angle + 200,
        scaleX: 0.4,
        duration: 320 + Math.random() * 220,
        ease: "Cubic.easeOut",
        onComplete: () => shard.destroy(),
      });
    }
    // Flash ring
    const flash = this.add.circle(x, y, 8, 0xe8f8ff, 0.7).setDepth(184);
    this.tweens.add({
      targets: flash,
      scale: 4.5,
      alpha: 0,
      duration: 220,
      onComplete: () => flash.destroy(),
    });
  }
}
