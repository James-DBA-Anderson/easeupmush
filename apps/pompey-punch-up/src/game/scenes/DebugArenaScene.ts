import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../constants";
import { generateDoodleTextures } from "../assets/doodleTextures";
import { Player } from "../entities/Player";
import { Enemy, type EnemyRole } from "../entities/Enemy";
import { Civilian, type CivilianVariant } from "../entities/Civilian";
import { Police } from "../entities/Police";
import type { Fighter } from "../entities/Fighter";
import { resolveCombat, tryLoot, type CombatEvent } from "../combat/resolveCombat";
import { separateFighters, separateFightersFromObstacles } from "../systems/separateFighters";
import { resolvePropHits } from "../systems/resolvePropHits";
import { updateCarPlatforms, syncCarOcclusion, wreckCarUnderThrower } from "../systems/climbCars";
import { SpeechBubbles } from "../ui/SpeechBubbles";
import { nextPlayerQuip } from "../ui/playerQuips";
import { KO_CRIES } from "../entities/Enemy";
import { DestructibleProp, type DestructibleKey } from "../world/DestructibleProp";
import { WeaponPickup, type WeaponKind } from "../world/WeaponPickup";
import { ThrownWeapon, isThrowable } from "../world/ThrownWeapon";
import { SkateboardPickup } from "../world/SkateboardPickup";
import { FoodStall } from "../world/FoodStall";
import { WeaponShop } from "../world/WeaponShop";
import type { Obstacle } from "../world/obstacles";
import { chipSfx } from "../audio/ChipSfx";

/** Tight arena lane — fits one screen, camera zooms in on the scrap. */
export const DEBUG_LANE = {
  minX: 60,
  maxX: GAME_WIDTH - 60,
  minY: GAME_HEIGHT * 0.58,
  maxY: GAME_HEIGHT - 18,
} as const;

export type DebugSpawnKind =
  | "thug"
  | "mad"
  | "scout"
  | "sergeant"
  | "boss"
  | "civilian"
  | "jogger"
  | "dog_walker"
  | "bike"
  | "scooter"
  | "skater"
  | "wheelchair"
  | "police"
  | "car"
  | "coffee_van"
  | "bin"
  | "bin_green"
  | "bollard"
  | "skateboard"
  | "chips"
  | "icecream"
  | "weapon_shop"
  | "bottle"
  | "bat"
  | "brick"
  | "chain"
  | "cue"
  | "knuckle"
  | "cash"
  | "mount_board"
  | "clear"
  | "reset_player";

/**
 * Close-up fight sandbox — same controls as the beach, no promenade loop.
 * Spawn fodder from the HTML panel; Refresh restarts the Vite server.
 */
export class DebugArenaScene extends Phaser.Scene {
  private player!: Player;
  private enemies: Enemy[] = [];
  private civilians: Civilian[] = [];
  private police: Police[] = [];
  private fighters: Fighter[] = [];
  private destructibles: DestructibleProp[] = [];
  private pickups: WeaponPickup[] = [];
  private skateboards: SkateboardPickup[] = [];
  private foodStalls: FoodStall[] = [];
  private weaponShops: WeaponShop[] = [];
  private thrown: ThrownWeapon[] = [];
  private obstacles: Obstacle[] = [];
  private bubbles!: SpeechBubbles;
  private status!: Phaser.GameObjects.Text;
  /** Don't stack wisecracks when you clear a pack in one go. */
  private nextQuipAt = 0;
  /** New + existing enemies: stand still (default) or fight normally. */
  private enemyBrain: "stand" | "normal" = "stand";
  /** Armed spawn — next click in the arena drops it there. */
  private placeKind: DebugSpawnKind | null = null;
  private placeHint!: Phaser.GameObjects.Text;
  /** False until create() finishes — panel must not call spawn early. */
  private panelReady = false;

  constructor() {
    super("DebugArena");
  }

  init(): void {
    // Expose early so the HTML panel can queue clicks while textures bake
    const w = window as Window & { __debugArena?: DebugArenaScene };
    w.__debugArena = this;
    this.panelReady = false;
  }

  /** HTML panel: true once the arena can accept spawn / clear / cash. */
  isPanelReady(): boolean {
    return this.panelReady;
  }

  create(): void {
    generateDoodleTextures(this);
    this.bubbles = new SpeechBubbles(this);

    this.drawArena();

    this.player = new Player(this, GAME_WIDTH * 0.42, DEBUG_LANE.minY + 40);
    this.player.money = 80;
    this.rebuildFighters();

    this.cameras.main.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.cameras.main.setZoom(2.15);
    this.cameras.main.startFollow(this.player, true, 0.14, 0.14);
    this.cameras.main.setDeadzone(70, 48);

    this.status = this.add
      .text(12, 10, "DEBUG · pick an item on the right, then click here to place", {
        fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
        fontSize: "14px",
        color: "#f2e6d8",
        backgroundColor: "#1a1410",
        padding: { x: 8, y: 4 },
      })
      .setScrollFactor(0)
      .setDepth(400);

    this.placeHint = this.add
      .text(GAME_WIDTH / 2, 52, "", {
        fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
        fontSize: "13px",
        color: "#f2e6d8",
        backgroundColor: "#1a1410cc",
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(400)
      .setVisible(false);

    this.add
      .text(12, GAME_HEIGHT - 28, "WASD · H block · J combo · J+K back · K kick · L grab · Space jump · E grab/buy · Q loot/dismount · click to place", {
        fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
        fontSize: "12px",
        color: "#c4a882",
        backgroundColor: "#1a1410cc",
        padding: { x: 6, y: 3 },
      })
      .setScrollFactor(0)
      .setDepth(400);

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!this.placeKind) return;
      if (pointer.button === 2) {
        this.cancelPlace();
        return;
      }
      if (pointer.button !== 0) return;
      const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.spawnAt(this.placeKind, world.x, world.y);
    });

    this.input.keyboard?.on("keydown-ESC", () => this.cancelPlace());
    this.game.canvas.addEventListener("contextmenu", (ev) => ev.preventDefault());

    // Re-assert bridge + tell the panel create() finished
    const w = window as Window & { __debugArena?: DebugArenaScene };
    w.__debugArena = this;
    this.panelReady = true;
    window.dispatchEvent(new CustomEvent("debug-arena-ready"));
  }

  private drawArena(): void {
    const g = this.add.graphics().setDepth(-20);
    // Sky wash
    g.fillStyle(0x6a90a8, 1);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT * 0.45);
    // Prom / shingle
    g.fillStyle(0x8a8070, 1);
    g.fillRect(0, GAME_HEIGHT * 0.45, GAME_WIDTH, GAME_HEIGHT * 0.55);
    // Fight strip
    g.fillStyle(0x9a9084, 1);
    g.fillRect(0, DEBUG_LANE.minY - 8, GAME_WIDTH, DEBUG_LANE.maxY - DEBUG_LANE.minY + 24);
    // Road band
    g.fillStyle(0x3a3a40, 1);
    g.fillRect(0, GAME_HEIGHT - 64, GAME_WIDTH, 64);
    g.fillStyle(0xc8b898, 0.85);
    g.fillRect(0, GAME_HEIGHT - 66, GAME_WIDTH, 4);

    this.add
      .text(GAME_WIDTH / 2, 36, "close-up scrap pad", {
        fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
        fontSize: "16px",
        color: "#1a1410",
      })
      .setOrigin(0.5)
      .setDepth(-10)
      .setAlpha(0.35);
  }

  /** Called from the HTML panel — arms click-to-place (or runs clear/reset). */
  spawn(kind: DebugSpawnKind): void {
    if (kind === "clear") {
      this.cancelPlace();
      this.clearFoes();
      this.setStatus("cleared arena");
      return;
    }
    if (kind === "reset_player") {
      this.cancelPlace();
      this.resetPlayer();
      this.setStatus("player reset");
      return;
    }
    if (kind === "cash") {
      this.cancelPlace();
      this.player.money += 50;
      this.floatText(this.player.x, this.player.y - 50, "+£50");
      this.setStatus(`cash £${this.player.money}`);
      void chipSfx.coin();
      return;
    }
    if (kind === "mount_board") {
      this.cancelPlace();
      if (!this.player.skating) {
        this.player.mountSkateboard();
        this.floatText(this.player.x, this.player.y - 50, "boarded");
        this.setStatus("on the board — Space ollie · Down+move manual · Space+K kickflip");
      } else {
        this.setStatus("already on a board");
      }
      return;
    }
    this.armPlace(kind);
  }

  /** Enemy AI for the arena — stand (statue) or normal fight AI. */
  setEnemyBrain(mode: "stand" | "normal"): void {
    this.enemyBrain = mode;
    const now = this.time.now;
    for (const e of this.enemies) {
      e.setDebugStand(mode === "stand", now, this.player);
    }
    this.setStatus(mode === "stand" ? "enemies: stand still" : "enemies: normal AI");
  }

  getEnemyBrain(): "stand" | "normal" {
    return this.enemyBrain;
  }

  getPlaceKind(): DebugSpawnKind | null {
    return this.placeKind;
  }

  private armPlace(kind: DebugSpawnKind): void {
    if (this.placeKind === kind) {
      this.cancelPlace();
      return;
    }
    this.placeKind = kind;
    this.placeHint
      .setText(`Click arena to place ${kind.replace("_", " ")} · Esc / right-click cancel`)
      .setVisible(true);
    this.setStatus(`placing ${kind.replace("_", " ")}`);
    this.input.setDefaultCursor("crosshair");
    window.dispatchEvent(new CustomEvent("debug-arena-place"));
  }

  private cancelPlace(): void {
    if (!this.placeKind) {
      this.placeHint.setVisible(false);
      this.input.setDefaultCursor("default");
      return;
    }
    this.placeKind = null;
    this.placeHint.setVisible(false);
    this.input.setDefaultCursor("default");
    window.dispatchEvent(new CustomEvent("debug-arena-place"));
  }

  /** Drop a spawn at world coordinates (click-to-place). */
  spawnAt(kind: DebugSpawnKind, worldX: number, worldY: number): void {
    const now = this.time.now;
    const x = Phaser.Math.Clamp(worldX, DEBUG_LANE.minX, DEBUG_LANE.maxX);
    const y = Phaser.Math.Clamp(worldY, DEBUG_LANE.minY, DEBUG_LANE.maxY);
    const side = worldX < this.player.x ? -1 : 1;

    switch (kind) {
      case "thug":
        this.spawnEnemy("Debug Thug", x, y, { toughness: 0.85, role: "thug" }, now);
        break;
      case "mad":
        this.spawnEnemy("Mad Lad", x, y, { toughness: 0.9, mad: true, role: "thug" }, now);
        break;
      case "scout":
        this.spawnEnemy("Scout", x, y, { toughness: 0.8, role: "scout" }, now);
        break;
      case "sergeant":
        this.spawnEnemy("Sergeant", x, y, { toughness: 1.1, role: "sergeant" }, now);
        break;
      case "boss":
        this.spawnEnemy("Hardman", x, y, { toughness: 3.2, boss: true, role: "sergeant" }, now);
        break;
      case "civilian":
        this.spawnCivilian("Local", "walker", x, y);
        break;
      case "jogger":
        this.spawnCivilian("Jogger", "jogger", x, y, side as 1 | -1);
        break;
      case "dog_walker":
        this.spawnCivilian("Dog Walker", "dog_walker", x, y);
        break;
      case "bike":
        this.spawnCivilian("Cyclist", "bike", x, y, side as 1 | -1);
        break;
      case "scooter":
        this.spawnCivilian("Scooter Kid", "scooter", x, y, side as 1 | -1);
        break;
      case "skater":
        this.spawnCivilian("Skater", "skater", x, y, side as 1 | -1);
        break;
      case "wheelchair":
        this.spawnCivilian("Wheeler", "wheelchair", x, y, side as 1 | -1);
        break;
      case "police":
        this.spawnPolice(x, y);
        break;
      case "car":
        this.spawnProp("car", x, GAME_HEIGHT - 10, 92, 32, 1.2);
        break;
      case "coffee_van":
        this.spawnProp("coffee_van", x, GAME_HEIGHT - 8, 100, 42, 1.05);
        break;
      case "bin":
        this.spawnProp("prop_bin", x, y, 28, 22, 1);
        break;
      case "bin_green":
        this.spawnProp("prop_bin_green", x, y, 28, 22, 1);
        break;
      case "bollard":
        this.spawnProp("prop_bollard", x, DEBUG_LANE.maxY - 8, 22, 20, 1);
        break;
      case "skateboard":
        this.skateboards.push(new SkateboardPickup(this, x, y));
        break;
      case "chips":
        this.foodStalls.push(
          new FoodStall(this, { kind: "chips", x, y: DEBUG_LANE.minY + 8, depth: -4 }),
        );
        this.refreshObstacles();
        break;
      case "icecream":
        this.foodStalls.push(
          new FoodStall(this, { kind: "icecream", x, y: DEBUG_LANE.minY + 8, depth: -4 }),
        );
        this.refreshObstacles();
        break;
      case "weapon_shop":
        this.weaponShops.push(
          new WeaponShop(this, x, DEBUG_LANE.minY + 8, { depth: -4 }),
        );
        this.refreshObstacles();
        break;
      case "bottle":
      case "bat":
      case "brick":
      case "chain":
      case "cue":
      case "knuckle":
        this.spawnPickup(x, y, kind);
        break;
      default:
        break;
    }
    this.setStatus(`placed ${kind.replace("_", " ")}`);
    // Keep place mode armed so you can drop several
  }

  private spawnEnemy(
    name: string,
    x: number,
    y: number,
    opts: { toughness?: number; mad?: boolean; boss?: boolean; role?: EnemyRole },
    now: number,
  ): void {
    const e = new Enemy(this, x, y, name, {
      ...opts,
      debugStand: this.enemyBrain === "stand",
    });
    e.setFacing(x < this.player.x ? 1 : -1, now);
    if (this.enemyBrain === "normal") {
      e.onProvoked(now, this.player);
    }
    this.enemies.push(e);
    this.rebuildFighters();
  }

  private spawnCivilian(
    name: string,
    variant: CivilianVariant,
    x: number,
    y: number,
    dir?: 1 | -1,
  ): void {
    const c = new Civilian(this, x, y, name, variant, dir);
    this.civilians.push(c);
    this.rebuildFighters();
  }

  private spawnPolice(x: number, y: number): void {
    const n = this.police.length + 1;
    const p = new Police(this, x, y, `PC ${n}`);
    this.police.push(p);
    this.rebuildFighters();
  }

  private spawnProp(
    key: DestructibleKey,
    x: number,
    y: number,
    rx: number,
    ry: number,
    scale: number,
  ): void {
    this.destructibles.push(
      new DestructibleProp(this, {
        key,
        x: Phaser.Math.Clamp(x, DEBUG_LANE.minX, DEBUG_LANE.maxX),
        y,
        rx,
        ry,
        scale,
        depth: key === "car" ? 22 : 12,
      }),
    );
    this.refreshObstacles();
  }

  private spawnPickup(x: number, y: number, kind: WeaponKind): void {
    this.pickups.push(new WeaponPickup(this, x, y, kind));
  }

  private clearFoes(): void {
    for (const e of this.enemies) e.destroy(true);
    for (const c of this.civilians) {
      c.dog?.destroy();
      c.destroy(true);
    }
    for (const p of this.police) p.destroy(true);
    for (const d of this.destructibles) d.destroy();
    for (const w of this.pickups) w.destroy(true);
    for (const b of this.skateboards) b.destroy(true);
    for (const s of this.foodStalls) s.destroy();
    for (const s of this.weaponShops) s.destroy();
    for (const t of this.thrown) t.destroySelf();
    this.enemies = [];
    this.civilians = [];
    this.police = [];
    this.destructibles = [];
    this.pickups = [];
    this.skateboards = [];
    this.foodStalls = [];
    this.weaponShops = [];
    this.thrown = [];
    if (this.player.skating) this.player.dismountSkateboard(false);
    this.rebuildFighters();
    this.refreshObstacles();
  }

  private resetPlayer(): void {
    const now = this.time.now;
    // Force a full stand-up even if already upright
    this.player.structure.outCold = true;
    this.player.structure.crawling = false;
    this.player.structure.cuffed = false;
    this.player.reviveFromHelp(now, 1);
    this.player.x = GAME_WIDTH * 0.42;
    this.player.y = DEBUG_LANE.minY + 40;
    this.player.groundY = this.player.y;
    this.player.clearCarMount();
    this.player.climbing = false;
    this.player.money = 80;
    this.player.refreshVisuals(now, 0);
  }

  private rebuildFighters(): void {
    this.fighters = [this.player, ...this.enemies, ...this.civilians, ...this.police];
  }

  private refreshObstacles(): void {
    this.obstacles = [];
    for (const d of this.destructibles) {
      const o = d.asObstacle();
      if (o) this.obstacles.push(o);
    }
    for (const s of this.foodStalls) this.obstacles.push(s.asObstacle());
    for (const s of this.weaponShops) this.obstacles.push(s.asObstacle());
  }

  private setStatus(msg: string): void {
    this.status.setText(`DEBUG · ${msg}`);
  }

  update(time: number, delta: number): void {
    const now = time;
    const dt = delta / 1000;

    this.bubbles.update(now);
    this.player.updatePlayer(now, dt, DEBUG_LANE, this.fighters);
    const tossed = this.player.consumeTossLaunch();
    if (tossed) {
      const heavy = this.player.isGermanSuplex || this.player.isHurricanrana;
      this.playThrowImpact(this.player, tossed, heavy ? "pileup" : "launch");
      if (this.player.isGermanSuplex) this.floatText(tossed.x, tossed.y - 56, "GERMAN SUPLEX!");
      else if (this.player.isHurricanrana) this.floatText(tossed.x, tossed.y - 56, "HURRICANRANA!");
      const smashed = wreckCarUnderThrower(this, this.player, this.destructibles);
      if (smashed) {
        this.onPropHit(smashed.prop, smashed.result.destroyed, smashed.result.scrap);
      }
    }
    if (this.player.consumeSwantonLand()) {
      this.playThrowImpact(this.player, this.player, "pileup");
      this.floatText(this.player.x, this.player.y - 50, "SWANTON!");
    }
    if (this.player.consumeGrabWhiffFx()) {
      this.floatText(this.player.x, this.player.y - 58, "thin air!");
    }

    for (const f of this.fighters) {
      f.applyTossFlight(now, dt, DEBUG_LANE.minX, DEBUG_LANE.maxX);
      if (f !== this.player && f.airborne) f.updatePhysics(dt, DEBUG_LANE.minY, DEBUG_LANE.maxY);
    }

    for (const e of this.enemies) {
      e.updateEnemy(now, dt, this.fighters, this.obstacles);
      const line = e.takeInsult();
      if (line) this.bubbles.say(e, line);
      if (e.takeShadesBreak()) {
        this.status.setText("DEBUG · shades smashed — he's mad!");
      }
    }
    for (const c of this.civilians) {
      c.updateCivilian(now, dt, this.fighters, this.obstacles, this.civilians);
      const speech = c.takeSpeech();
      if (speech) this.bubbles.say(c, speech, 2200);
    }
    for (const p of this.police) p.updatePolice(now, dt, this.fighters);

    updateCarPlatforms(this.fighters, this.destructibles, now);
    separateFighters(this.fighters);
    this.refreshObstacles();
    separateFightersFromObstacles(this.fighters, this.obstacles);
    for (const f of this.fighters) f.pinToFloor();

    if (this.player.wantsPickup()) {
      const bought =
        this.tryBuyWeapon() || this.tryBuyFood() || this.tryPickupSkateboard();
      if (!bought && !this.tryPickupWeapon()) {
        this.floatText(this.player.x, this.player.y - 50, "nothing to grab");
      }
    }
    if (this.player.wantsLoot(now)) {
      if (this.player.skating) {
        const left = this.player.dismountSkateboard(true);
        if (left) {
          this.skateboards.push(new SkateboardPickup(this, left.x, left.y));
          this.floatText(this.player.x, this.player.y - 50, "hopped off");
        }
      } else {
        const ok = tryLoot(this.player, this.fighters, (ev) => this.onCombat(ev));
        if (!ok) {
          const dropped = this.player.dropWeapon();
          if (dropped) {
            this.spawnPickup(this.player.x + this.player.facing * 28, this.player.y, dropped);
            this.floatText(this.player.x, this.player.y - 50, `dropped ${dropped}`);
          } else {
            this.floatText(this.player.x, this.player.y - 50, "nothing to loot");
          }
        }
      }
    }

    // Skater crashes leave a rideable board
    for (const c of this.civilians) {
      const board = c.takeDroppedBoard();
      if (board) this.skateboards.push(new SkateboardPickup(this, board.x, board.y));
    }
    const playerBoard = this.player.takeBoardDrop();
    if (playerBoard) {
      if (playerBoard.broken) {
        this.floatText(playerBoard.x, playerBoard.y - 30, "board snapped");
      } else {
        this.skateboards.push(new SkateboardPickup(this, playerBoard.x, playerBoard.y));
      }
    }

    this.updateThrows(now, dt);
    for (const d of this.destructibles) d.update(now);

    resolveCombat(now, this.fighters, (ev) => this.onCombat(ev));
    resolvePropHits(this, now, this.fighters, this.destructibles, (ev) => {
      this.onPropHit(ev.prop, ev.result.destroyed, ev.result.scrap);
    });
    for (const f of this.fighters) f.pinToFloor();
    syncCarOcclusion(this.fighters, this.destructibles);

    // Soft revive in the arena so you can keep testing
    if (this.player.structure.isOut() && !this.player.structure.cuffed) {
      this.setStatus("you're down — Reset Player or wait…");
    }
  }

  private tryPickupWeapon(): boolean {
    const near = this.pickups.find(
      (p) =>
        !p.taken &&
        Math.abs(p.x - this.player.x) < 40 &&
        Math.abs(p.y - this.player.laneY) < 36,
    );
    if (!near) return false;
    const kind = near.kind;
    near.collect();
    this.pickups = this.pickups.filter((p) => !p.taken);
    const old = this.player.weapon !== "none" ? this.player.dropWeapon() : null;
    if (old) this.spawnPickup(this.player.x - this.player.facing * 24, this.player.y, old);
    this.player.equipWeapon(kind);
    this.floatText(this.player.x, this.player.y - 50, `got ${kind}`);
    return true;
  }

  private tryPickupSkateboard(): boolean {
    if (this.player.skating) return false;
    const near = this.skateboards.find(
      (b) =>
        !b.taken &&
        Math.abs(b.x - this.player.x) < 42 &&
        Math.abs(b.y - this.player.laneY) < 36,
    );
    if (!near) return false;
    near.collect();
    this.skateboards = this.skateboards.filter((b) => !b.taken);
    this.player.mountSkateboard();
    this.floatText(this.player.x, this.player.y - 50, "boarded");
    this.setStatus("on the board — Space ollie · Down+move manual");
    return true;
  }

  private tryBuyFood(): boolean {
    const stall = this.foodStalls.find((s) => s.inRange(this.player.x, this.player.laneY));
    if (!stall) return false;
    const outcome = stall.buy(this.player);
    if (outcome.ok) {
      this.floatText(this.player.x, this.player.y - 56, `-£${outcome.price}`);
      this.floatText(stall.x, stall.y - 120, outcome.patter);
      void chipSfx.coin();
      return true;
    }
    if (outcome.reason === "skint") {
      this.floatText(stall.x, stall.y - 120, `that's £${stall.price}`);
      return true;
    }
    if (outcome.reason === "sold_out") {
      this.floatText(stall.x, stall.y - 120, "sold out");
      return true;
    }
    if (outcome.reason === "not_hungry") {
      this.floatText(stall.x, stall.y - 120, "you're alright");
      return true;
    }
    return false;
  }

  private tryBuyWeapon(): boolean {
    const shop = this.weaponShops.find((s) => s.inRange(this.player.x, this.player.laneY));
    if (!shop) return false;
    const outcome = shop.buy(this.player);
    if (outcome.ok) {
      if (this.player.weapon !== "none") {
        const old = this.player.dropWeapon();
        if (old) this.spawnPickup(this.player.x - this.player.facing * 24, this.player.y, old);
      }
      this.player.equipWeapon(outcome.kind);
      this.floatText(this.player.x, this.player.y - 56, `-£${outcome.price}`);
      this.floatText(shop.x, shop.y - 120, outcome.patter);
      void chipSfx.coin();
      return true;
    }
    if (outcome.reason === "skint") {
      this.floatText(shop.x, shop.y - 120, `that's £${shop.offer?.price ?? 0}`);
      return true;
    }
    if (outcome.reason === "sold_out") {
      this.floatText(shop.x, shop.y - 120, "sold out");
      return true;
    }
    return false;
  }

  private updateThrows(now: number, dt: number): void {
    for (const f of this.fighters) {
      if (!f.takeThrowRelease(now)) continue;
      const kind = f.weapon;
      if (!isThrowable(kind)) continue;
      f.consumeHeldWeapon();
      this.thrown.push(
        new ThrownWeapon(this, f.x + f.facing * 28, f.laneY, kind, f, f.facing),
      );
    }

    const still: ThrownWeapon[] = [];
    for (const t of this.thrown) {
      let hit = false;
      for (const prop of this.destructibles) {
        if (prop.destroyed) continue;
        if (Math.abs(prop.x - t.x) > prop.rx + 20 || Math.abs(prop.y - t.groundY) > prop.ry + 18) {
          continue;
        }
        const result = prop.takeThrow(this, now, t.kind === "brick" ? 0.85 : 0.75, t.x);
        if (result) {
          this.onPropHit(prop, result.destroyed, result.scrap);
          hit = true;
          break;
        }
      }
      if (hit) {
        t.destroySelf();
        continue;
      }

      for (const target of this.fighters) {
        if (!t.canHit(target)) continue;
        if (t.owner.team === target.team && target.team !== "player") continue;
        if (target.structure.downed || target.structure.isOut()) continue;
        target.receiveStrike({
          kind: "thrown",
          power: t.kind === "brick" ? 0.72 : 0.52,
          critical: false,
          dirty: false,
          onOpening: target.structure.isOpen(now),
          now,
          bodyPart: "head",
        });
        if (t.kind === "bottle") this.floatText(target.x, target.y - 70, "smash");
        hit = true;
        break;
      }
      if (hit) {
        t.destroySelf();
        continue;
      }

      const state = t.update(dt);
      if (state === "landed") {
        if (t.kind === "brick") this.spawnPickup(t.x, t.groundY, "brick");
        t.destroySelf();
        continue;
      }
      if (state === "flying") still.push(t);
    }
    this.thrown = still;
  }

  private onCombat(ev: CombatEvent): void {
    const phrases: Record<string, string> = {
      blocked: "BLOCK",
      flinch: "ow",
      winded: "oof",
      stumble: "whoa",
      crawl_away: "had enough",
      out_cold: "OUT COLD",
      tased: "ZZZT",
      cuffed: "CUFFED",
      takedown: "down",
    };
    this.floatText(ev.target.x, ev.target.y - 58, phrases[ev.result] ?? ev.result);
    if (ev.result === "blocked") this.playBlockImpact(ev.target, ev.attacker);
    if (ev.kind === "toss_hit") {
      this.playThrowImpact(ev.attacker, ev.target, "pileup");
      this.floatText(
        ev.result === "headbang"
          ? (ev.attacker.x + ev.target.x) * 0.5
          : ev.target.x,
        ev.target.y - 72,
        ev.result === "headbang" ? "CLANG!" : "pile-up!",
      );
    }
    if (ev.kind === "boot_head") this.floatText(ev.target.x, ev.target.y - 72, "STOMP");

    if (
      ev.attacker.team === "player" &&
      ev.target.team === "enemy" &&
      (ev.result === "out_cold" || ev.result === "crawl_away")
    ) {
      if (Math.random() < 0.55) {
        const cry = KO_CRIES[Math.floor(Math.random() * KO_CRIES.length)]!;
        this.bubbles.say(ev.target, cry, 2800);
      }
      this.tryPlayerQuip(this.time.now);
    }
  }

  private tryPlayerQuip(now: number): void {
    if (now < this.nextQuipAt) return;
    if (this.player.structure.isOut() || this.player.structure.downed) return;
    this.bubbles.say(this.player, nextPlayerQuip(), 2600);
    this.nextQuipAt = now + 1600;
  }

  private playBlockImpact(defender: Fighter, attacker: Fighter): void {
    const midX = (defender.x + attacker.x) * 0.5;
    const midY = Math.min(defender.y, attacker.y) - 48;
    this.cameras.main.shake(50, 0.004);
    defender.sprite.setTint(0xffe8c8);
    this.time.delayedCall(80, () => {
      if (defender.active) defender.sprite.clearTint();
    });
    const dir = Math.sign(defender.x - attacker.x) || defender.facing;
    defender.x += dir * 5;
    attacker.x -= dir * 3;
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2 + Math.random() * 0.5;
      const spark = this.add
        .rectangle(midX, midY, 9 + Math.random() * 6, 2.2, 0xffe08a, 0.95)
        .setAngle((ang * 180) / Math.PI)
        .setDepth(190);
      this.tweens.add({
        targets: spark,
        x: midX + Math.cos(ang) * 18,
        y: midY + Math.sin(ang) * 14,
        alpha: 0,
        scaleX: 0.25,
        duration: 200 + Math.random() * 90,
        ease: "Quad.easeOut",
        onComplete: () => spark.destroy(),
      });
    }
  }

  private playThrowImpact(
    a: Fighter,
    b: Fighter,
    mode: "launch" | "pileup",
  ): void {
    const heavy = mode === "pileup";
    this.cameras.main.shake(heavy ? 100 : 70, heavy ? 0.008 : 0.006);
    for (const f of [a, b]) {
      f.sprite.setTint(heavy ? 0xffd0a0 : 0xffe8c8);
      this.time.delayedCall(heavy ? 120 : 90, () => {
        if (f.active) f.sprite.clearTint();
      });
    }
  }

  private onPropHit(
    prop: DestructibleProp,
    destroyed: boolean,
    scrap: WeaponKind | null,
  ): void {
    if (destroyed) {
      this.floatText(prop.x, prop.y - 40, `${prop.label} wrecked`);
      if (scrap) {
        this.spawnPickup(prop.x + 16, prop.y, scrap);
        this.floatText(prop.x, prop.y - 60, `+${scrap}`);
      }
      this.refreshObstacles();
    } else {
      this.floatText(prop.x, prop.y - 36, "clunk");
    }
  }

  private floatText(x: number, y: number, text: string): void {
    const t = this.add
      .text(x, y, text, {
        fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
        fontSize: "13px",
        color: "#1a1410",
        backgroundColor: "#f2e6d8",
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5)
      .setDepth(300);
    this.tweens.add({
      targets: t,
      y: y - 28,
      alpha: 0,
      duration: 700,
      onComplete: () => t.destroy(),
    });
  }
}
