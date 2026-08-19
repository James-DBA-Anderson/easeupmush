import Phaser from "phaser";
import { GBA_W } from "../constants";
import { partnerMon, resumePos, run, saveOverworld } from "../run";
import { rollWildLv } from "../battle";
import { kidAnim } from "../sprites/kid";
import { ensureMonSheets, monOwAnim, monOwSheet } from "../sprites/mon";
import type { WildId } from "../species";
import { BagUi } from "../ui/BagUi";
import { MsgBox, type Line } from "../ui/MsgBox";
import { isTouchUi } from "../touch";
import {
  addWalls,
  atSouthEdge,
  bindWalkKeys,
  justAction,
  justCancel,
  near,
  spawnKid,
  tickWalk,
  walkingInto,
  type Facing,
  type WalkKeys,
} from "../walk";
import { drawIsland, type GrassZone, type IslandLayout } from "../world/drawIsland";
import {
  ISLAND_NPCS,
  losTrainer,
  npcNear,
  npcTalk,
  spawnFieldNpcs,
  startTrainerFight,
  tickFieldNpcs,
  type FieldNpc,
} from "../world/npcs";

type Wanderer = {
  id: WildId;
  sprite: Phaser.GameObjects.Sprite;
  box: { x: number; y: number; w: number; h: number };
  facing: Facing;
  flip: number;
  dx: number;
  dy: number;
  until: number;
};

const WANDER: { id: WildId; x: number; y: number; box: Wanderer["box"] }[] = [
  { id: "starlimur", x: 48, y: 372, box: { x: 8, y: 352, w: 76, h: 40 } },
  { id: "busstopper", x: 36, y: 376, box: { x: 8, y: 352, w: 76, h: 40 } },
  { id: "donerrat", x: 70, y: 368, box: { x: 8, y: 352, w: 76, h: 40 } },
  { id: "spikehedge", x: 40, y: 484, box: { x: 8, y: 462, w: 76, h: 40 } },
  { id: "chipgull", x: 188, y: 484, box: { x: 156, y: 462, w: 76, h: 40 } },
  { id: "pidgeon", x: 40, y: 588, box: { x: 8, y: 566, w: 76, h: 48 } },
  { id: "squirral", x: 56, y: 478, box: { x: 8, y: 462, w: 76, h: 40 } },
];

export class IslandScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: WalkKeys;
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private layout!: IslandLayout;
  private note?: MsgBox;
  private bagUi?: BagUi;
  private facing: Facing = "down";
  private flip = 1;
  private reaching = false;
  private steps = 0;
  private wanderers: Wanderer[] = [];
  private npcs: FieldNpc[] = [];
  private from = "bridge";

  constructor() {
    super("island");
  }

  init(data: { from?: string }): void {
    this.from = data.from ?? "bridge";
  }

  create(): void {
    if (this.textures.exists("island")) this.textures.remove("island");
    const art = this.add.graphics().setVisible(false);
    this.layout = drawIsland(art);
    art.generateTexture("island", GBA_W, this.layout.mapH);
    art.destroy();
    this.add.image(0, 0, "island").setOrigin(0);

    const fallback =
      this.from === "school" ? this.layout.spawnFromSchool : (run.islandPos ?? this.layout.spawnFromNorth);
    const spawn = resumePos("island", fallback);
    this.player = spawnKid(this, spawn.x, spawn.y, { w: GBA_W, h: this.layout.mapH });
    if (this.from === "school") {
      this.facing = "side";
      this.flip = 1;
      this.player.setFlipX(false);
    }
    this.cameras.main.startFollow(this.player, true, 1, 1);
    this.spawnWanderers();
    this.npcs = spawnFieldNpcs(this, ISLAND_NPCS);
    run.islandPos = null;
    addWalls(this, this.player, this.layout.solids);
    const keys = bindWalkKeys(this);
    this.cursors = keys.cursors;
    this.wasd = keys.wasd;
    this.note = new MsgBox(this);
    this.bagUi = new BagUi(this, (line) => this.showNote(line));

    if (!isTouchUi()) {
      this.input.on("pointerdown", () => {
        if (this.bagUi?.atePointer()) return;
        if (this.note?.advance()) return;
        if (this.bagUi?.menu.active) return;
        if (!this.reaching) this.tryExamine();
      });
    }
  }

  update(): void {
    const confirm = justAction(this.cursors, this.wasd);
    const cancel = justCancel(this.wasd);

    if (this.bagUi?.update(this.cursors, { W: this.wasd.W, S: this.wasd.S }, confirm, cancel)) {
      this.player.body.setVelocity(0, 0);
      return;
    }

    if (this.note?.open) {
      this.player.body.setVelocity(0, 0);
      if (confirm) this.note.advance();
      return;
    }

    if (this.reaching) {
      this.player.body.setVelocity(0, 0);
      return;
    }

    const walked = tickWalk(this.player, this.cursors, this.wasd, this.facing, this.flip);
    this.facing = walked.facing;
    this.flip = walked.flip;
    this.tickWanderers();
    tickFieldNpcs(this, this.npcs);
    this.player.setDepth(this.player.y);

    const spotted = losTrainer(this.player, this.npcs);
    if (spotted && startTrainerFight(this, spotted, "island", this.player)) return;

    const moving = this.player.body.velocity.x !== 0 || this.player.body.velocity.y !== 0;
    const bumped = this.wanderNear();
    if (moving && bumped) {
      this.startWild(bumped.id);
      return;
    }

    if (this.player.y < 8) {
      this.scene.start("bridge", { from: "island" });
      return;
    }
    if (walkingInto(this.player, this.layout.schoolGate, "left")) {
      this.scene.start("school");
      return;
    }
    if (atSouthEdge(this.player, this.layout.mapH)) {
      this.reachThen("North End. Later.");
      this.player.y = this.layout.mapH - 20;
      return;
    }

    const zone = this.grassZone();
    if (moving && zone) {
      if (run.grassCalm > 0) run.grassCalm -= 1;
      else {
        this.steps += 1;
        if (this.steps > 7 && Math.random() < 0.12) {
          const wild = zone.pool[Math.floor(Math.random() * zone.pool.length)];
          this.startWild(wild);
        }
      }
    }

    if (confirm) this.tryExamine();
  }

  private grassZone(): GrassZone | undefined {
    return this.layout.grass.find((z) => near(this.player, z.at, 0));
  }

  private startWild(wild: WildId): void {
    if ((partnerMon()?.hp ?? 0) <= 0) {
      this.reachThen("Your Pompeymon's out.");
      return;
    }
    this.steps = 0;
    run.grassCalm = 28;
    saveOverworld("island", { x: this.player.x, y: this.player.y });
    this.scene.start("encounter", { wild, lv: rollWildLv(3, 5) });
  }

  private spawnWanderers(): void {
    ensureMonSheets(this);
    this.wanderers = WANDER.map((spec, i) => {
      const sprite = this.add.sprite(spec.x, spec.y, monOwSheet(spec.id), "idle-down");
      sprite.setOrigin(0.5, 1);
      sprite.setDepth(spec.y);
      sprite.anims.play(monOwAnim(spec.id, "idle-down"));
      return {
        ...spec,
        sprite,
        facing: "down" as Facing,
        flip: 1,
        dx: 0,
        dy: 0,
        until: this.time.now + 200 + i * 180,
      };
    });
  }

  private tickWanderers(): void {
    const now = this.time.now;
    const dt = this.game.loop.delta / 1000;
    for (const w of this.wanderers) {
      if (now > w.until) {
        w.until = now + 420 + Math.random() * 1400;
        const r = Math.random();
        if (r < 0.3) {
          w.dx = 0;
          w.dy = 0;
        } else if (r < 0.52) {
          w.dx = 16;
          w.dy = 0;
          w.facing = "side";
          w.flip = 1;
        } else if (r < 0.74) {
          w.dx = -16;
          w.dy = 0;
          w.facing = "side";
          w.flip = -1;
        } else if (r < 0.87) {
          w.dx = 0;
          w.dy = 16;
          w.facing = "down";
          w.flip = 1;
        } else {
          w.dx = 0;
          w.dy = -16;
          w.facing = "up";
          w.flip = 1;
        }
      }
      let nx = w.sprite.x + w.dx * dt;
      let ny = w.sprite.y + w.dy * dt;
      const minX = w.box.x + 6;
      const maxX = w.box.x + w.box.w - 6;
      const minY = w.box.y + 10;
      const maxY = w.box.y + w.box.h - 2;
      if (nx < minX || nx > maxX) {
        w.dx *= -1;
        if (w.facing === "side") w.flip *= -1;
        nx = Phaser.Math.Clamp(nx, minX, maxX);
      }
      if (ny < minY || ny > maxY) {
        w.dy *= -1;
        w.facing = w.dy > 0 ? "down" : w.dy < 0 ? "up" : w.facing;
        ny = Phaser.Math.Clamp(ny, minY, maxY);
      }
      w.sprite.setPosition(nx, ny);
      w.sprite.setFlipX(w.flip < 0);
      w.sprite.setDepth(ny);
      const moving = w.dx !== 0 || w.dy !== 0;
      const anim = moving
        ? w.facing === "up"
          ? monOwAnim(w.id, "walk-up-loop")
          : w.facing === "side"
            ? monOwAnim(w.id, "walk-side-loop")
            : monOwAnim(w.id, "walk-down-loop")
        : w.facing === "up"
          ? monOwAnim(w.id, "idle-up")
          : w.facing === "side"
            ? monOwAnim(w.id, "idle-side")
            : monOwAnim(w.id, "idle-down");
      if (w.sprite.anims.currentAnim?.key !== anim) w.sprite.play(anim, true);
    }
  }

  private wanderNear(): Wanderer | undefined {
    return this.wanderers.find(
      (w) => Phaser.Math.Distance.Between(this.player.x, this.player.y, w.sprite.x, w.sprite.y) < 14,
    );
  }

  private tryExamine(): void {
    const person = npcNear(this.player, this.npcs);
    if (person) {
      if (startTrainerFight(this, person, "island", this.player)) return;
      this.reachThen(npcTalk(person));
      return;
    }
    const wild = this.wanderNear();
    if (wild) {
      this.startWild(wild.id);
      return;
    }
    for (const spot of this.layout.spots) {
      if (near(this.player, spot.at, 8)) {
        this.reachThen(spot.line);
        return;
      }
    }
    if (this.grassZone()) {
      this.reachThen("Tall grass. Pompeymon in there.");
      return;
    }
    this.reachThen("Hilsea. You're on the island.");
  }

  private reachThen(line: Line | Line[]): void {
    this.reaching = true;
    this.player.body.setVelocity(0, 0);
    const reach = this.facing === "down" ? "reach-down" : "reach-side";
    this.player.anims.play(kidAnim(run.outfit, reach));
    this.showNote(line);
    this.time.delayedCall(520, () => {
      this.reaching = false;
      const idle = this.facing === "up" ? "idle-up" : this.facing === "side" ? "idle-side" : "idle-down";
      this.player.anims.play(kidAnim(run.outfit, idle));
    });
  }

  private showNote(text: Line | Line[]): void {
    this.note?.show(text);
  }
}
